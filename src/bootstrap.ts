import { Application } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { setupGameSocket } from './sockets/game.socket';

const Bootstrap = async (app: Application) => {
  const PORT = parseInt(process.env.PORT || '8200', 10);

  // Create HTTP server from Express app
  const server = http.createServer(app);

  // Initialize Socket.IO
  const io = new Server(server, {
    cors: {
      origin: ['*', 'http://localhost:8081', 'http://192.168.5.60:8081/'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Setup game-related socket logic
  setupGameSocket(io);

  server.listen(PORT, () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
  });
};

export default Bootstrap;
