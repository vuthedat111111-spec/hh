import express from 'express';
import http from 'http';
import path from 'path';
import { Server, Socket } from 'socket.io';
import { createServer as createViteServer } from 'vite';

interface UserInfo {
  socketId: string;
  userName: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isNoiseSuppressed: boolean;
}

// Stores room state: roomId -> Map<socketId, UserInfo>
const rooms = new Map<string, Map<string, UserInfo>>();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', activeRooms: rooms.size });
  });

  app.get('/api/room-status/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const room = rooms.get(roomId);
    const count = room ? room.size : 0;
    res.json({ roomId, userCount: count, isFull: count >= 2 });
  });

  // Socket.IO Setup
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1e7,
  });

  io.on('connection', (socket: Socket) => {
    let currentRoomId: string | null = null;

    socket.on('join-room', ({ roomId, userName }: { roomId: string; userName: string }) => {
      const cleanRoomId = roomId.trim().toLowerCase();
      const cleanName = userName.trim() || 'Người dùng';

      let room = rooms.get(cleanRoomId);
      if (!room) {
        room = new Map();
        rooms.set(cleanRoomId, room);
      }

      // Check room size limit for 1-on-1 call
      if (room.size >= 2) {
        socket.emit('room-full', {
          message: 'Phòng đã đầy! Cuộc gọi 1-với-1 chỉ hỗ trợ tối đa 2 người.',
        });
        return;
      }

      // Add user to room
      const userInfo: UserInfo = {
        socketId: socket.id,
        userName: cleanName,
        isAudioEnabled: true,
        isVideoEnabled: true,
        isScreenSharing: false,
        isNoiseSuppressed: false,
      };

      currentRoomId = cleanRoomId;
      socket.join(cleanRoomId);

      // Get existing users in room before adding this new user
      const existingUsers = Array.from(room.values());

      room.set(socket.id, userInfo);

      // Inform joining user about existing participants
      socket.emit('room-joined', {
        roomId: cleanRoomId,
        yourSocketId: socket.id,
        usersInRoom: existingUsers,
      });

      // Notify others in room
      socket.to(cleanRoomId).emit('user-joined', {
        user: userInfo,
      });

      console.log(`[Socket] ${cleanName} (${socket.id}) joined room: ${cleanRoomId}. Users count: ${room.size}`);
    });

    // WebRTC Signaling
    socket.on('offer', ({ targetSocketId, sdp }: { targetSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      io.to(targetSocketId).emit('offer', {
        senderSocketId: socket.id,
        sdp,
      });
    });

    socket.on('answer', ({ targetSocketId, sdp }: { targetSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      io.to(targetSocketId).emit('answer', {
        senderSocketId: socket.id,
        sdp,
      });
    });

    socket.on('ice-candidate', ({ targetSocketId, candidate }: { targetSocketId: string; candidate: RTCIceCandidateInit }) => {
      io.to(targetSocketId).emit('ice-candidate', {
        senderSocketId: socket.id,
        candidate,
      });
    });

    // Toggle Media Status Sync
    socket.on('toggle-media', ({ roomId, type, enabled }: { roomId: string; type: 'audio' | 'video' | 'screen' | 'noiseSuppression'; enabled: boolean }) => {
      const room = rooms.get(roomId);
      if (room && room.has(socket.id)) {
        const user = room.get(socket.id)!;
        if (type === 'audio') user.isAudioEnabled = enabled;
        if (type === 'video') user.isVideoEnabled = enabled;
        if (type === 'screen') user.isScreenSharing = enabled;
        if (type === 'noiseSuppression') user.isNoiseSuppressed = enabled;

        socket.to(roomId).emit('peer-media-toggled', {
          socketId: socket.id,
          type,
          enabled,
        });
      }
    });

    // Chat Message
    socket.on('send-message', ({ roomId, text, senderName }: { roomId: string; text: string; senderName: string }) => {
      const msgData = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        senderSocketId: socket.id,
        senderName: senderName || 'Peer',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      io.to(roomId).emit('receive-message', msgData);
    });

    // Leave Room
    socket.on('leave-room', () => {
      handleUserLeave(socket);
    });

    socket.on('disconnect', () => {
      handleUserLeave(socket);
    });

    function handleUserLeave(sock: Socket) {
      if (currentRoomId && rooms.has(currentRoomId)) {
        const room = rooms.get(currentRoomId)!;
        const user = room.get(sock.id);
        room.delete(sock.id);

        if (user) {
          sock.to(currentRoomId).emit('user-left', {
            socketId: sock.id,
            userName: user.userName,
          });
          console.log(`[Socket] ${user.userName} left room ${currentRoomId}. Remaining: ${room.size}`);
        }

        if (room.size === 0) {
          rooms.delete(currentRoomId);
        }

        sock.leave(currentRoomId);
        currentRoomId = null;
      }
    }
  });

  // Vite Integration for dev vs production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`WebRTC 1-on-1 Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
