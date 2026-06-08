import { getStore } from "@netlify/blobs";

// In-memory fallback database for serverless container instances (short-term fallback)
const memoryStore = {};

// Helper to wrap promises in a timeout to prevent hanging connections
const withTimeout = (promise, ms = 1500) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Database connection timeout")), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
};

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

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Helper to read pastes
  const getRoomPastes = async (room) => {
    // 1. Try Upstash Redis (Shared Database - Recommended)
    if (redisUrl && redisToken) {
      try {
        const response = await withTimeout(
          fetch(redisUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${redisToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(["GET", `room_${room}`]),
          }),
          2000
        );

        if (response.ok) {
          const data = await response.json();
          if (data.result) {
            return JSON.parse(data.result);
          }
        }
        return [];
      } catch (e) {
        console.warn("Upstash Redis read failed, trying Netlify Blobs fallback:", e.message);
      }
    }

    // 2. Try Netlify Blobs (Production Key-Value Fallback)
    try {
      const store = getStore("syncpaste-store");
      return (await withTimeout(store.getJSON(`room_${room}`), 1500)) || [];
    } catch (e) {
      console.warn("Database read failed or timed out. Falling back to memory:", e.message);
      return memoryStore[room] || [];
    }
  };

  // Helper to save pastes
  const saveRoomPastes = async (room, pastes) => {
    // 1. Try Upstash Redis
    if (redisUrl && redisToken) {
      try {
        const response = await withTimeout(
          fetch(redisUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${redisToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(["SET", `room_${room}`, JSON.stringify(pastes)]),
          }),
          2000
        );

        if (response.ok) {
          return true;
        }
      } catch (e) {
        console.warn("Upstash Redis write failed, trying Netlify Blobs fallback:", e.message);
      }
    }

    // 2. Try Netlify Blobs
    try {
      const store = getStore("syncpaste-store");
      await withTimeout(store.setJSON(`room_${room}`, pastes), 1500);
      return true;
    } catch (e) {
      console.warn("Database write failed or timed out. Saving to memory:", e.message);
      memoryStore[room] = pastes;
      return false;
    }
  };

  // Helper to delete pastes
  const deleteRoomPastes = async (room) => {
    // 1. Try Upstash Redis
    if (redisUrl && redisToken) {
      try {
        await withTimeout(
          fetch(redisUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${redisToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(["DEL", `room_${room}`]),
          }),
          2000
        );
        return;
      } catch (e) {
        console.warn("Upstash Redis delete failed, trying Netlify Blobs fallback:", e.message);
      }
    }

    // 2. Try Netlify Blobs
    try {
      const store = getStore("syncpaste-store");
      await withTimeout(store.delete(`room_${room}`), 1500);
    } catch (e) {
      console.warn("Database delete failed or timed out. Clearing from memory:", e.message);
      delete memoryStore[room];
    }
  };

  try {
    // GET /api/paste?room=ROOM_NAME
    if (method === "GET") {
      const room = url.searchParams.get("room");
      if (!room) {
        return new Response(JSON.stringify({ error: "Missing room parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const roomPastes = await getRoomPastes(room);
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

      // Strict whitelisting of data fields
      const allowedTypes = ["text", "code", "prompt", "link"];
      const validatedType = allowedTypes.includes(type) ? type : "text";

      const allowedLanguages = [
        "plaintext", "javascript", "python", "bash", "html", "css", "json", "sql", "yaml", "dockerfile"
      ];
      const validatedLanguage = allowedLanguages.includes(language) ? language : "plaintext";

      const roomPastes = await getRoomPastes(room);

      const newPaste = {
        id: Math.random().toString(36).substring(2, 11),
        content,
        type: validatedType,
        language: validatedLanguage,
        deviceInfo: deviceInfo ? String(deviceInfo).substring(0, 100) : "Unknown Device",
        timestamp: new Date().toISOString(),
      };

      roomPastes.unshift(newPaste);

      // Keep only last 50 pastes
      const trimmedPastes = roomPastes.slice(0, 50);

      await saveRoomPastes(room, trimmedPastes);

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

      if (id) {
        const roomPastes = await getRoomPastes(room);
        const filteredPastes = roomPastes.filter((p) => p.id !== id);
        await saveRoomPastes(room, filteredPastes);
      } else {
        await deleteRoomPastes(room);
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
    console.error("Serverless Function Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error", message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};
