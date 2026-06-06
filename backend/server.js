require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const WebSocketManager = require('./utils/websocket');

const app = express();
const server = http.createServer(app);

// Initialize WebSocket
const wsManager = new WebSocketManager(server);

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000"
}));
app.use(express.json());

// MongoDB connection - Only connect if MONGODB_URI env variable is provided
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => {
      console.log('⚠️ MongoDB connection failed. Running normally using in-memory database fallbacks.');
    });
} else {
  console.log('Database Mode: Running with in-memory database fallbacks.');
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API routes
const versionSchema = new mongoose.Schema({
  roomId: String,
  name: String,
  ydocState: String, // Base64 encoded Yjs update
  timestamp: { type: Date, default: Date.now }
});

const Version = mongoose.models.Version || mongoose.model('Version', versionSchema);
const memoryVersions = new Map(); // Fallback in-memory database

app.post('/api/rooms/:roomId/versions', async (req, res) => {
  const { roomId } = req.params;
  const { name, ydocState } = req.body;
  
  const newVersion = {
    roomId,
    name: name || `Version ${new Date().toLocaleString()}`,
    ydocState,
    timestamp: new Date()
  };
  
  try {
    if (mongoose.connection.readyState === 1) {
      const versionDoc = new Version(newVersion);
      await versionDoc.save();
      return res.status(201).json(versionDoc);
    }
  } catch (err) {
    console.error('Mongoose save version failed, falling back to memory:', err);
  }
  
  if (!memoryVersions.has(roomId)) {
    memoryVersions.set(roomId, []);
  }
  memoryVersions.get(roomId).push(newVersion);
  res.status(201).json(newVersion);
});

app.get('/api/rooms/:roomId/versions', async (req, res) => {
  const { roomId } = req.params;
  
  try {
    if (mongoose.connection.readyState === 1) {
      const dbVersions = await Version.find({ roomId }).sort({ timestamp: -1 });
      return res.json(dbVersions);
    }
  } catch (err) {
    console.error('Mongoose fetch versions failed, falling back to memory:', err);
  }
  
  const memVersions = memoryVersions.get(roomId) || [];
  const sorted = [...memVersions].sort((a, b) => b.timestamp - a.timestamp);
  res.json(sorted);
});

app.delete('/api/rooms/:roomId/versions/:versionId', async (req, res) => {
  const { roomId, versionId } = req.params;
  
  try {
    if (mongoose.connection.readyState === 1) {
      if (mongoose.Types.ObjectId.isValid(versionId)) {
        await Version.deleteOne({ _id: versionId, roomId });
        return res.json({ success: true });
      }
    }
  } catch (err) {
    console.error('Mongoose delete version failed:', err);
  }
  
  if (memoryVersions.has(roomId)) {
    const list = memoryVersions.get(roomId);
    const filtered = list.filter(v => {
      const isMatchTime = new Date(v.timestamp).getTime().toString() === versionId;
      return !isMatchTime;
    });
    memoryVersions.set(roomId, filtered);
  }
  
  res.json({ success: true });
});

app.put('/api/rooms/:roomId/versions/:versionId', async (req, res) => {
  const { roomId, versionId } = req.params;
  const { name } = req.body;
  
  try {
    if (mongoose.connection.readyState === 1) {
      if (mongoose.Types.ObjectId.isValid(versionId)) {
        await Version.updateOne({ _id: versionId, roomId }, { $set: { name } });
        return res.json({ success: true });
      }
    }
  } catch (err) {
    console.error('Mongoose update version failed:', err);
  }
  
  if (memoryVersions.has(roomId)) {
    const list = memoryVersions.get(roomId);
    const updated = list.map(v => {
      const isMatchTime = new Date(v.timestamp).getTime().toString() === versionId;
      if (isMatchTime) {
        return { ...v, name };
      }
      return v;
    });
    memoryVersions.set(roomId, updated);
  }
  
  res.json({ success: true });
});

app.get('/api/rooms/:roomId', async (req, res) => {
  // Room metadata endpoint
  res.json({ 
    roomId: req.params.roomId,
    createdAt: new Date(),
    users: [] 
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`PenPals server running on port ${PORT}`);
});