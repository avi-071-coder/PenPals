# PenPals

PenPals is a real-time collaborative rich-text and markdown editor. Multiple users can join edit rooms, see each other's live cursors, chat, save document snapshots/backups, import/export PDF files, customize themes, and manage collaborator permissions.

---

## Key Features

- **Real-Time Collaboration**: Powered by Yjs, `y-websocket`, and Quill, enabling Conflict-free Replicated Data Types (CRDTs) with custom named live cursors.
- **Collaborator Controls & Blocking**: 
  - The creator of the room is assigned as the **Room Owner**.
  - Owners can open the **Users Drawer** to globally lock editing, or **block/unblock individual collaborators** from editing.
  - Blocked users immediately switch to a read-only state with warning banner notifications.
  - Ownership is automatically passed to the next active user if the current owner leaves.
- **Rich Text & Slash Commands**: Fast, native toolbar with custom text sizing and slash (`/`) shortcuts for bullet points, quote formatting, list numbers, and code blocks.
- **Anytime Custom Resizer**: Simply click any inserted image inside the editor to dynamically resize it with corner handles or delete it immediately using the floating overlay.
- **PDF File Import/Export**: 
  - **Export PDF**: Save your structured document locally as a standard PDF file using `html2pdf.js`.
  - **Import PDF**: Upload any local PDF file to reconstruct its text content inside the editor.
- **Aesthetic Premium Themes**: Customize the design with themes like **Netflix Dark**, **Spotify Retro**, **Sunset Glow**, **Cyberpunk**, **Sleek Dark**, **Cozy Sepia**, and **Glassmorphism**.
- **Collaborative Chat**: Integrated real-time room chat drawer.
- **Version History & Backups**: Name and save snapshots of your document, and restore to past backups at any time.

---

## Tech Stack

- **Frontend**: Next.js (App Router), Framer Motion, React-Quill, Yjs, Socket.io-client.
- **Backend**: Node.js, Express, Socket.io, `y-websocket` server, MongoDB / Mongoose (with in-memory fallbacks if no URI is supplied).

---

## Installation & Setup

### 1. Start the Backend Server
Navigate to the `backend` directory:
```bash
cd backend
npm install
npm start
```
*Note: The backend will run on port `4000`.*

### 2. Start the Frontend Server
Navigate to the `frontend` directory:
```bash
cd frontend
npm install
npm run dev
```
*Note: The frontend will run on port `3000`.*

Open [http://localhost:3000](http://localhost:3000) in your browser to start using PenPals!
