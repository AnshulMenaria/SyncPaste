import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const DATA_FILE = path.join(__dirname, '.data', 'pastes.json');

// Ensure data directory exists
async function initDataFile() {
  try {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    try {
      await fs.access(DATA_FILE);
    } catch {
      await fs.writeFile(DATA_FILE, JSON.stringify({}));
    }
  } catch (err) {
    console.error("Failed to initialize data store:", err);
  }
}

// Read database helper
async function readData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// Write database helper
async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// Helper to serve static file
async function serveStaticFile(res, filePath, contentType) {
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Server Error: ${error.code}`);
    }
  }
}

// Parse request body
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', err => reject(err));
  });
}

// Server logic
const server = http.createServer(async (req, res) => {
  // Setup CORS headers for ease of local testing if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // API Endpoints
  if (pathname === '/api/paste') {
    res.setHeader('Content-Type', 'application/json');

    // GET /api/paste?room=ROOM_NAME
    if (method === 'GET') {
      const room = url.searchParams.get('room');
      if (!room) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Missing room parameter' }));
      }
      const data = await readData();
      const roomPastes = data[room] || [];
      res.writeHead(200);
      return res.end(JSON.stringify(roomPastes));
    }

    // POST /api/paste
    if (method === 'POST') {
      try {
        const body = await getRequestBody(req);
        const { room, content, type, language, deviceInfo } = body;
        if (!room || !content) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Missing room or content' }));
        }

        const data = await readData();
        if (!data[room]) {
          data[room] = [];
        }

        const newPaste = {
          id: Math.random().toString(36).substring(2, 11),
          content,
          type: type || 'text',
          language: language || 'plaintext',
          deviceInfo: deviceInfo || 'Unknown Device',
          timestamp: new Date().toISOString()
        };

        // Add to start of array (newest first)
        data[room].unshift(newPaste);
        
        // Limit to last 50 pastes to prevent bloat
        if (data[room].length > 50) {
          data[room] = data[room].slice(0, 50);
        }

        await writeData(data);
        res.writeHead(201);
        return res.end(JSON.stringify(newPaste));
      } catch (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'Internal server error while saving paste' }));
      }
    }

    // DELETE /api/paste?room=ROOM_NAME&id=PASTE_ID
    if (method === 'DELETE') {
      const room = url.searchParams.get('room');
      const id = url.searchParams.get('id');
      if (!room) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Missing room parameter' }));
      }

      const data = await readData();
      if (data[room]) {
        if (id) {
          // Delete single paste
          data[room] = data[room].filter(p => p.id !== id);
        } else {
          // Clear all pastes in room
          data[room] = [];
        }
        await writeData(data);
      }

      res.writeHead(200);
      return res.end(JSON.stringify({ success: true }));
    }

    res.writeHead(405);
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  // Static files server
  if (method === 'GET') {
    let rawPath = pathname === '/' ? '/index.html' : pathname;
    // Sanitize path (remove query params if any) and map to workspace directory
    let filePath = path.join(__dirname, rawPath.split('?')[0]);
    
    // Prevent directory traversal attacks
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('403 Forbidden');
    }

    const extname = path.extname(filePath);
    let contentType = 'text/html';
    switch (extname) {
      case '.js':
        contentType = 'text/javascript';
        break;
      case '.css':
        contentType = 'text/css';
        break;
      case '.json':
        contentType = 'application/json';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
        contentType = 'image/jpg';
        break;
      case '.svg':
        contentType = 'image/svg+xml';
        break;
      case '.ico':
        contentType = 'image/x-icon';
        break;
    }

    await serveStaticFile(res, filePath, contentType);
  } else {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
  }
});

initDataFile().then(() => {
  server.listen(PORT, () => {
    console.log(`Local development server running at http://localhost:${PORT}`);
  });
});
