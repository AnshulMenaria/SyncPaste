import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  // CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  const method = req.method;

  try {
    // Initialize Netlify Blobs store
    const store = getStore("syncpaste-store");

    // GET /api/paste?room=ROOM_NAME
    if (method === "GET") {
      const room = url.searchParams.get("room");
      if (!room) {
        return new Response(JSON.stringify({ error: "Missing room parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const roomPastes = (await store.getJSON(`room_${room}`)) || [];
      return new Response(JSON.stringify(roomPastes), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /api/paste
    if (method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { room, content, type, language, deviceInfo } = body;
      if (!room || !content) {
        return new Response(JSON.stringify({ error: "Missing room or content" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const roomKey = `room_${room}`;
      const roomPastes = (await store.getJSON(roomKey)) || [];

      const newPaste = {
        id: Math.random().toString(36).substring(2, 11),
        content,
        type: type || "text",
        language: language || "plaintext",
        deviceInfo: deviceInfo || "Unknown Device",
        timestamp: new Date().toISOString(),
      };

      roomPastes.unshift(newPaste);

      // Keep only last 50 pastes
      const trimmedPastes = roomPastes.slice(0, 50);

      await store.setJSON(roomKey, trimmedPastes);

      return new Response(JSON.stringify(newPaste), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE /api/paste?room=ROOM_NAME&id=PASTE_ID
    if (method === "DELETE") {
      const room = url.searchParams.get("room");
      const id = url.searchParams.get("id");
      if (!room) {
        return new Response(JSON.stringify({ error: "Missing room parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const roomKey = `room_${room}`;
      
      if (id) {
        const roomPastes = (await store.getJSON(roomKey)) || [];
        const filteredPastes = roomPastes.filter((p) => p.id !== id);
        await store.setJSON(roomKey, filteredPastes);
      } else {
        await store.delete(roomKey);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Netlify Function Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error", message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};
