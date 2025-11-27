import { Application } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { setupGameSocket } from './sockets/game.socket';
import { supabaseAdmin } from './config/supabase';

const Bootstrap = async (app: Application) => {
  const PORT = parseInt(process.env.PORT || '8200', 10);

  // Create HTTP server from Express app
  const server = http.createServer(app);

  // Initialize Socket.IO
  const io = new Server(server, {
    cors: {
      origin: ['*', 'http://localhost:8081', 'http://localhost:8081', 'http://192.168.103.60:8081/'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // ✅ Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing auth token'));

    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data?.user) return next(new Error('Invalid token'));

      socket.data.userId = data.user.id;
      socket.data.username = data.user.email;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  // Setup game-related socket logic
  setupGameSocket(io);

  server.listen(PORT, () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
  });
};

export default Bootstrap;
