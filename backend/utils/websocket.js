const { Server } = require('socket.io');
const ws = require('ws');
const Y = require('yjs');
const { LeveldbPersistence } = require('y-leveldb');
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils');

const COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', 
  '#6366F1', '#8B5CF6', '#EC4899', '#14B8A6'
];

const ADJECTIVES = ['Happy', 'Creative', 'Swift', 'Clever', 'Bright', 'Silent', 'Jolly', 'Witty'];
const NOUNS = ['Panda', 'Koala', 'Fox', 'Owl', 'Rabbit', 'Otter', 'Dolphin', 'Falcon'];

function getRandomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function getRandomUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}

class WebSocketManager {
  constructor(server) {
    // 1. Initialize Socket.io Server
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });

    // 2. Initialize Raw WebSocket Server (for Yjs websocket provider)
    this.wss = new ws.Server({ noServer: true });
    
    // 3. Keep track of users, owners, chat history, read-only and blocked lists
    this.roomUsers = new Map();
    this.roomOwners = new Map();
    this.roomChats = new Map();
    this.roomReadOnly = new Map();
    this.roomBlockedUsers = new Map(); // roomId -> Set of blocked socketIds

    this.setupPersistence();
    this.setupYjsWS();
    this.setupEventHandlers();
    this.setupHTTPUpgrade(server);
  }

  setupPersistence() {
    const ldb = new LeveldbPersistence('./storage');
    setPersistence({
      provider: ldb,
      bindState: async (docName, ydoc) => {
        const persistedYdoc = await ldb.getYDoc(docName);
        const newUpdates = Y.encodeStateAsUpdate(ydoc);
        ldb.storeUpdate(docName, newUpdates);
        Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
        ydoc.on('update', (update) => {
          ldb.storeUpdate(docName, update);
        });
      },
      writeState: async (docName, ydoc) => {}
    });
  }

  setupYjsWS() {
    this.wss.on('connection', (conn, req) => {
      setupWSConnection(conn, req);
    });
  }

  setupHTTPUpgrade(server) {
    server.on('upgrade', (request, socket, head) => {
      const pathname = request.url;
      // Skip socket.io upgrades (handled automatically by socket.io)
      if (!pathname.startsWith('/socket.io/')) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('User connected to presence:', socket.id);

      socket.on('join-room', (joinData) => {
        const isObject = typeof joinData === 'object' && joinData !== null;
        const roomId = isObject ? joinData.roomId : joinData;
        const username = isObject ? joinData.username : null;
        const color = isObject ? joinData.color : null;

        socket.join(roomId);
        socket.roomId = roomId;
        
        const finalUsername = username || getRandomUsername();
        const finalColor = color || getRandomColor();

        socket.username = finalUsername;
        socket.color = finalColor;

        if (!this.roomUsers.has(roomId)) {
          this.roomUsers.set(roomId, new Map());
        }
        this.roomUsers.get(roomId).set(socket.id, {
          socketId: socket.id,
          userId: finalUsername,
          color: finalColor
        });

        // Setup owner if room has no owner yet
        if (!this.roomOwners.has(roomId)) {
          this.roomOwners.set(roomId, socket.id);
        }

        const isOwner = this.roomOwners.get(roomId) === socket.id;
        socket.emit('owner-status', isOwner);

        // Send room user list to the joining user
        const usersInRoom = Array.from(this.roomUsers.get(roomId).values());
        this.io.to(roomId).emit('room-users', usersInRoom);

        // Send chat history
        const chatHistory = this.roomChats.get(roomId) || [];
        socket.emit('room-chat-history', chatHistory);

        // Send current read-only state
        const isReadOnly = this.roomReadOnly.get(roomId) || false;
        socket.emit('readonly-state', isReadOnly);

        // Send current blocked users list
        const blockedSet = this.roomBlockedUsers.get(roomId) || new Set();
        socket.emit('blocked-users-list', Array.from(blockedSet));
        
        // Notify others
        socket.to(roomId).emit('user-joined', {
          socketId: socket.id,
          userId: finalUsername,
          color: finalColor,
          timestamp: Date.now()
        });
      });

      socket.on('send-chat-message', (messageText) => {
        const roomId = socket.roomId;
        if (!roomId) return;

        const chatMsg = {
          socketId: socket.id,
          userId: socket.username || 'Anonymous',
          color: socket.color || '#3B82F6',
          message: messageText,
          timestamp: Date.now()
        };

        if (!this.roomChats.has(roomId)) {
          this.roomChats.set(roomId, []);
        }
        const history = this.roomChats.get(roomId);
        history.push(chatMsg);
        if (history.length > 100) history.shift();

        this.io.to(roomId).emit('chat-message', chatMsg);
      });

      socket.on('toggle-readonly', (readOnlyState) => {
        const roomId = socket.roomId;
        if (!roomId) return;
        
        // Verify socket is the actual owner
        if (this.roomOwners.get(roomId) !== socket.id) return;

        this.roomReadOnly.set(roomId, readOnlyState);
        this.io.to(roomId).emit('readonly-toggled', readOnlyState);
      });

      socket.on('toggle-user-block', ({ targetSocketId, blockStatus }) => {
        const roomId = socket.roomId;
        if (!roomId) return;
        
        // Verify socket is the actual owner
        if (this.roomOwners.get(roomId) !== socket.id) return;

        if (!this.roomBlockedUsers.has(roomId)) {
          this.roomBlockedUsers.set(roomId, new Set());
        }
        
        const blockedSet = this.roomBlockedUsers.get(roomId);
        if (blockStatus) {
          blockedSet.add(targetSocketId);
        } else {
          blockedSet.delete(targetSocketId);
        }

        this.io.to(roomId).emit('blocked-users-list', Array.from(blockedSet));
      });

      socket.on('cursor-update', (data) => {
        socket.to(data.roomId).emit('cursor-moved', {
          socketId: socket.id,
          userId: socket.username,
          color: socket.color,
          ...data
        });
      });

      socket.on('typing', (data) => {
        socket.to(data.roomId).emit('user-typing', {
          socketId: socket.id,
          userId: socket.username,
          ...data
        });
      });

      socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (roomId && this.roomUsers.has(roomId)) {
          this.roomUsers.get(roomId).delete(socket.id);
          
          // Transfer ownership if the owner left
          if (this.roomOwners.get(roomId) === socket.id) {
            this.roomOwners.delete(roomId);
            if (this.roomUsers.get(roomId).size > 0) {
              const nextSocketId = this.roomUsers.get(roomId).keys().next().value;
              this.roomOwners.set(roomId, nextSocketId);
              this.io.to(nextSocketId).emit('owner-status', true);
            }
          }

          // Clean up blocked user list if they left
          if (this.roomBlockedUsers.has(roomId)) {
            const blockedSet = this.roomBlockedUsers.get(roomId);
            if (blockedSet.has(socket.id)) {
              blockedSet.delete(socket.id);
              this.io.to(roomId).emit('blocked-users-list', Array.from(blockedSet));
            }
          }

          if (this.roomUsers.get(roomId).size === 0) {
            this.roomUsers.delete(roomId);
            this.roomChats.delete(roomId);
            this.roomReadOnly.delete(roomId);
            this.roomOwners.delete(roomId);
            this.roomBlockedUsers.delete(roomId);
          } else {
            const usersInRoom = Array.from(this.roomUsers.get(roomId).values());
            this.io.to(roomId).emit('room-users', usersInRoom);
          }
          
          socket.to(roomId).emit('user-left', {
            socketId: socket.id,
            userId: socket.username
          });
        }
        console.log('User disconnected from presence:', socket.id);
      });
    });
  }

  getIO() {
    return this.io;
  }
}

module.exports = WebSocketManager;