import { v4 as uuidv4 } from 'uuid';
import { Server, Socket } from 'socket.io';
import { checkWinner, createEmptyBoard } from '@/utils/ticTacToe';

const games: {
  id: string;
  type: string;
  status: 'waiting' | 'playing' | 'ended';
  options: { [key: string]: any };
  players: { userId: string; socketId: string }[];
  maxPlayers: number;
  turn: string;
  winner: string | null;
  amount: number;
}[] = [];

export const setupGameSocket = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log('⚡ Client connected:', socket.id);

    // 🟢 Create a game
    socket.on('createGame', ({ userId, type, options, amount }) => {
      const roomId = `room_${uuidv4()}`;

      // ✅ Validate game type and options
      if (type === 'ludo' && ![2, 3, 4].includes(options?.maxPlayers)) {
        socket.emit('error', 'Ludo supports only 2, 3, or 4 players');
        return;
      }

      if (amount < 5) {
        socket.emit('error', 'Minimum amount to join a game is 5');
        return;
      }

      const maxPlayers = type === 'ludo' ? options?.maxPlayers || 2 : 2;

      let gameOptions = {};
      switch (type) {
        case 'ludo':
          gameOptions = {};
          break;
        case 'ticTacToe':
          gameOptions = { board: createEmptyBoard() };
          break;
        default:
          socket.emit('error', 'Unsupported game type');
          return;
      }

      const newGame = {
        id: roomId,
        type,
        status: 'waiting' as const,
        options: gameOptions,
        players: [{ userId, socketId: socket.id }],
        turn: userId,
        maxPlayers,
        winner: null,
        amount: amount,
      };

      games.push(newGame);
      socket.join(roomId);

      console.log(`🎮 New ${type} game created: ${roomId} (${maxPlayers} players)`);

      socket.emit('waiting', `Waiting for ${maxPlayers - 1} more player(s) to join...`);
    });

    // 🟡 Join an existing game
    socket.on('joinGame', ({ userId, gameId }) => {
      const game = games.find((g) => g.id === gameId);

      if (!game) {
        socket.emit('error', 'Game not found');
        return;
      }

      if (game.status !== 'waiting') {
        socket.emit('error', 'Game already started or ended');
        return;
      }

      // Check for duplicate players
      if (game.players.find((p) => p.userId === userId)) {
        socket.emit('error', 'You are already in this game');
        return;
      }

      // Add player
      game.players.push({ userId, socketId: socket.id });
      socket.join(gameId);

      const remaining = (game.maxPlayers || 2) - game.players.length;

      if (remaining > 0) {
        // Still waiting for more players
        io.to(gameId).emit('waiting', `Waiting for ${remaining} more player(s) to join...`);
      }

      // ✅ Start the game when full
      if (game.players.length === game.maxPlayers) {
        game.status = 'playing';
        io.to(gameId).emit('gameStarted', {
          gameId,
          players: game.players.map((p) => p.userId),
          message: 'Game started!',
        });
      }
    });

    // 🎲 Ludo: roll die
    socket.on('ludo:rollDie', ({ userId, gameId }) => {
      const game = games.find((g) => g.id === gameId);
      if (!game) {
        socket.emit('error', 'Game not found');
        return;
      }

      if (game.status !== 'playing') {
        socket.emit('error', "Game hasn't started or has ended already");
        return;
      }

      if (!game.players.map((p) => p.userId).includes(userId)) {
        socket.emit('error', "You're not part of this game");
        return;
      }

      const roll = Math.floor(Math.random() * 6) + 1;
      io.to(gameId).emit('ludo:rollDieResult', { userId, roll });
    });

    // ticTacToe:selectCell
    socket.on('ticTacToe:selectCell', ({ userId, gameId, cell }) => {
      const game = games.find((g) => g.id === gameId);
      if (!game) {
        socket.emit('error', 'Game not found');
        return;
      }

      if (game.status !== 'playing') {
        socket.emit('error', "Game hasn't started or has ended already");
        return;
      }

      if (!game.players.map((p) => p.userId).includes(userId)) {
        socket.emit('error', "You're not part of this game");
        return;
      }

      if (userId !== game.turn) {
        socket.emit('error', "It's not your turn");
        return;
      }

      if (game.options.board[cell]) {
        socket.emit('error', 'Cell is already taken');
        return;
      }

      game.options.board[cell] = userId;
      const winner = checkWinner(game.options.board);

      if (winner) {
        game.status = 'ended';
        game.winner = winner;
        io.to(gameId).emit('gameOver', game);
        const idx = games.indexOf(game);
        if (idx !== -1) games.splice(idx, 1);
      } else if (game.options.board.every((c: string | null) => c)) {
        game.status = 'ended';
        game.winner = 'draw';
        io.to(gameId).emit('gameOver', game);
        const idx = games.indexOf(game);
        if (idx !== -1) games.splice(idx, 1);
      } else {
        game.turn = game.players.find((p) => p.userId !== userId)!.userId;
        io.to(gameId).emit('gameUpdate', game);
      }
    });

    // ❌ Handle disconnect
    socket.on('disconnect', () => {
      console.log('❌ Disconnected:', socket.id);

      for (const game of games) {
        const index = game.players.findIndex((p) => p.socketId === socket.id);
        if (index !== -1) {
          const leftPlayer = game.players.splice(index, 1)[0];
          console.log(`🚪 Player ${leftPlayer.userId} left game ${game.id}`);

          if (game.players.length === 0) {
            game.status = 'ended';
            games.splice(games.indexOf(game), 1);
          } else {
            io.to(game.id).emit('playerLeft', { userId: leftPlayer.userId });

            // ✅ Auto-end game if only one player remains
            if (game.players.length < 2 && game.status === 'playing') {
              game.status = 'ended';
              io.to(game.id).emit('gameOver', { ...game, winner: game.players[0]?.userId || null });
              games.splice(games.indexOf(game), 1);
            }
          }

          break; // stop iterating once handled
        }
      }
    });
  });
};
