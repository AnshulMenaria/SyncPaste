# SyncPaste 🚀

**SyncPaste** is a modern, dark-themed, glassmorphic single-page web application designed for fast, frictionless copy-pasting of code, terminal queries, prompts, and text between different laptops (such as a personal laptop and a server laptop).

It operates completely serverless when hosted on Netlify, using **Netlify Functions** and **Netlify Blobs** for memory storage, and supports a zero-dependency local fallback mode for easy testing.

---

## 🌟 Features

*   **Room Code Isolation:** Group your devices by a secure room passcode (e.g., `anshu-sync`). Only devices sharing the exact room passcode will sync pastes.
*   **Auto-Sync / Polling:** Real-time synchronization (adjustable interval: 2s, 5s, 10s, or manual) that fetches changes in the background without manual refreshes.
*   **One-Click Copy:** Copies snippets directly to the system clipboard with an automatic fallback mechanism for older server browsers.
*   **Syntax Highlighting:** Formats and highlights code using `Highlight.js` (Atom One Dark theme) for easy readability.
*   **Device Identification:** Label your submissions (e.g. `Server Laptop`, `Personal PC`) to track where each paste originated.
*   **Zero-Dependency Local Dev:** Runs a mock backend locally out of the box with standard Node.js libraries.

---

## 📁 Project Structure

```
├── .data/                    # (Auto-generated locally) Holds the local mock database
│   └── pastes.json           
├── netlify/                  
│   └── functions/            
│       └── api.js            # Netlify Serverless Function (Handles GET, POST, DELETE via Blobs)
├── app.js                    # Frontend logic (polling, clipboard action, settings, and renders)
├── index.html                # Semantic HTML skeleton and CDN links (Lucide Icons, Highlight.js)
├── netlify.toml              # Netlify build configurations
├── package.json              # Project script runner and production dependencies
├── server.js                 # Mock HTTP local server for development (file-system based storage)
├── style.css                 # Premium CSS styling (glassmorphism, dark layout, animations)
└── README.md                 # Documentation
```

---

## 🛠️ How it Works under the Hood

1.  **State Management:** The frontend (`app.js`) checks `localStorage` for your **Room Code** and **Device Name**.
2.  **Creating a Paste:** You write/paste text, choose a type (Code, Text, Prompt, Link), and submit. A `POST` request goes to `/api/paste`.
3.  **Local Dev Persistence:** In `server.js`, the POST request parses the body and appends it to `.data/pastes.json` under the namespace of the current Room Code.
4.  **Production (Netlify) Persistence:** In `netlify/functions/api.js`, the request utilizes Netlify Blobs (`getStore("syncpaste-store")`) to read/write JSON arrays under the key `room_${roomCode}`.
5.  **Syncing:** Every few seconds, the browser makes a `GET` request to `/api/paste?room=ROOM_CODE` to fetch new pastes and renders them. If it is a code block, `Highlight.js` formats the syntax.

---

## 💻 Local Development

You can run SyncPaste locally without installing any tools or registering for Netlify:

1.  Navigate into the project directory:
    ```bash
    cd c:\Users\anshu\Desktop\CP
    ```
2.  Start the development server:
    ```bash
    npm run dev
    ```
    *(Alternatively: `node server.js`)*
3.  Open the site on your laptop:
    *   **`http://localhost:3000`**
4.  Open the site on another machine in the same local network by substituting `localhost` with your host computer's IP address (e.g. `http://192.168.1.50:3000`).

---

## ☁️ Deploying to Netlify (Free Hosting)

Since Netlify reads `netlify.toml` automatically, deployment takes less than a minute.

### Option A: Deployment via Netlify Web UI (Easiest)

1.  **Upload to GitHub/GitLab:** Create a private or public repository and push this code.
2.  **Link to Netlify:**
    *   Go to [Netlify App](https://app.netlify.com/) and sign in.
    *   Click **Add new site** -> **Import an existing project**.
    *   Select your Git provider and choose the repository.
3.  **Configure Build:**
    *   Netlify will read `netlify.toml` and fill the configurations:
        *   *Build command:* Leave blank (or `echo 'done'`)
        *   *Publish directory:* `.` (root directory)
        *   *Functions directory:* `netlify/functions`
4.  **Click Deploy:** Your site will build instantly. 
5.  **Set up Blobs:** Netlify Blobs works automatically in production for standard functions. No environment variables are required!

### Option B: Direct Drag-and-Drop (Build-free)

1.  Run `npm install` inside your local directory to make sure the `@netlify/blobs` dependency is recorded locally.
2.  Go to [Netlify App](https://app.netlify.com/) -> **Sites**.
3.  Scroll down to the **"Want to deploy a new site without connecting to Git? Drag and drop your site folder here"** section.
4.  Drag and drop the entire `CP` folder directly.
5.  Netlify will host it and compile the function automatically.

*(Note: Netlify Blobs storage works automatically on all Netlify sites out of the box).*
