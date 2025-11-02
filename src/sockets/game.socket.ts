import { v4 as uuidv4 } from 'uuid';
import { Server, Socket } from 'socket.io';
import { checkWinner, createEmptyBoard } from '@/utils/ticTacToe';
import { pins } from '@/constants/ludo';
import { getMovablePins, handlePinCollision, movePiece } from '@/utils/ludo';
import { PinColor } from '@/types/ludo';
import { shuffle, createDeck } from '@/utils/crazy';
import { addTransaction, checkBalance } from '@/utils/transaction';
import { supabaseAdmin } from '@/config/supabase';

const games: {
  id: string;
  type: string;
  status: 'waiting' | 'playing' | 'ended';
  options: { [key: string]: any };
  players: { userId: string; username: string; picture?: string; socketId: string; status: 'active' | 'inactive' }[];
  maxPlayers: number;
  winner: string | null;
  amount: number;
}[] = [];

export const setupGameSocket = (io: Server) => {
  // 🔁 Helper: emit updated games list to everyone
  const emitGamesUpdate = () => {
    io.emit(
      'games:update',
      games.map((g) => ({
        id: g.id,
        type: g.type,
        status: g.status,
        maxPlayers: g.maxPlayers,
        players: g.players.map((p) => p.userId),
        amount: g.amount,
      }))
    );
  };

  io.on('connection', (socket: Socket) => {
    console.log('⚡ Client connected:', socket.id);

    const { userId } = socket.data;
    console.log(socket.data);

    // Send current games list on connect
    socket.emit('games:update', games);

    socket.on('games:get', () => {
      emitGamesUpdate();
    });

    // Handle token refresh
    socket.on('refresh_token', async (newToken: string) => {
      try {
        const { data, error } = await supabaseAdmin.auth.getUser(newToken);
        if (error || !data?.user) {
          socket.emit('error', 'Invalid or expired token');
          return socket.disconnect(true);
        }

        // Update user info on the same socket
        socket.data.userId = data.user.id;
        socket.data.username = data.user.email;
        socket.emit('refresh_ok');
      } catch {
        socket.emit('refresh_error', 'Auth verification failed');
        socket.disconnect(true);
      }
    });

    // 🟢 Create a game
    socket.on('createGame', async ({ username, picture, type, options, amount }) => {
      console.log('creating a room', userId, username, type, options, amount);
      const roomId = `room_${uuidv4()}`;

      if (type === 'ludo' && ![2, 3, 4].includes(options?.maxPlayers)) {
        socket.emit('error', 'Ludo supports only 2, 3, or 4 players');
        return;
      }

      if (amount < 5) {
        socket.emit('error', 'Minimum amount to join a game is 5');
        return;
      }

      const response = await checkBalance(userId, amount);

      if (response !== 'has enough') {
        socket.emit('error', response);
        return;
      }

      const maxPlayers = type === 'ludo' ? options?.maxPlayers || 2 : 2;

      let gameOptions = {};
      switch (type) {
        case 'Ludo':
          gameOptions = {
            pins: maxPlayers === 2 ? pins.filter((p) => p.color === 'red' || p.color === 'yellow') : pins,
            roll: 0,
            rolledBy: '',
            turn: userId,
          };
          break;
        case 'Tic Tac Toe':
          gameOptions = { board: createEmptyBoard(), turn: userId };
          break;
        case 'Crazy':
          // let deck = shuffle(createDeck());
          gameOptions = { drawPenalty: 0, discard: [], turn: userId };
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
        players: [{ userId, username, picture, socketId: socket.id, status: 'active' as 'active' | 'inactive' }],
        maxPlayers,
        winner: null,
        amount,
      };

      games.push(newGame);
      socket.join(roomId);

      console.log(`🎮 New ${type} game created: ${roomId} (${maxPlayers} players)`);
      socket.emit('waiting', newGame);

      emitGamesUpdate(); // 🔁 update everyone
    });

    // 🟡 Join an existing game
    socket.on('joinGame', async ({ username, picture, gameId }) => {
      const game = games.find((g) => g.id === gameId);
      console.log('joining a room', userId, username, gameId, game);
      if (!game) return socket.emit('error', 'Game not found');
      console.log(1);
      if (game.status !== 'waiting') return socket.emit('error', 'Game already started');
      console.log(2);
      if (game.players.some((p) => p.userId === userId)) return socket.emit('error', 'Already in this game');
      console.log(3);
      const isUserActiveInAnyGame = games.some((game) => game.players.some((player) => player.userId === userId && player.status === 'active'));
      if (isUserActiveInAnyGame) return socket.emit('error', 'Already is playing a game');

      console.log('dont have active game');
      const response = await checkBalance(userId, game.amount);
      console.log('first', response);
      if (response !== 'has enough') {
        socket.emit('error', response);
        return;
      }

      game.players.push({ userId, username, picture, socketId: socket.id, status: 'active' });
      socket.join(gameId);

      const remaining = game.maxPlayers - game.players.length;
      if (remaining > 0) io.to(gameId).emit('waiting', game);

      if (game.players.length === game.maxPlayers) {
        game.status = 'playing';
        io.to(gameId).emit('gameStarted', game);
      }

      emitGamesUpdate(); // 🔁 update everyone
    });

    socket.on('leaveGame', ({ gameId }) => {
      const game = games.find((g) => g.id === gameId);
      console.log('leaving a room', userId, gameId, game);

      if (!game) return socket.emit('error', 'Game not found');
      const player = game.players.find((p) => p.userId === userId);
      if (!player) return socket.emit('error', "You're not in this game");

      if (game.status === 'waiting') {
        // Remove player
        game.players = game.players.filter((p) => p.userId !== userId);
        socket.leave(gameId);

        // Handle empty game
        if (game.players.length === 0) {
          games.splice(games.indexOf(game), 1);
          emitGamesUpdate();
          return;
        }

        io.to(gameId).emit('waiting', game);
      } else if (game.status === 'playing') {
        // Set leaving player to inactive
        player.status = 'inactive';
        socket.leave(gameId);

        if (game.players.length === 2) {
          // If only 2 players, end the game and declare the other as winner
          game.status = 'ended';
          game.winner = game.players.find((p) => p.userId !== userId)!.userId;
          io.to(gameId).emit('gameOver', game);

          addTransaction(
            game.amount,
            game.type,
            game.winner,
            game.players.filter((p) => p.userId !== game.winner).map((p) => p.userId)
          );

          games.splice(games.indexOf(game), 1);
        } else {
          // Notify others that a player left but continue the game
          io.to(gameId).emit('playerLeft', { userId, status: 'inactive' });
        }
      }

      emitGamesUpdate();
    });

    // 🎲 Ludo: roll die
    socket.on('ludo:rollDie', ({ gameId }) => {
      console.log('rolling a die', userId, gameId);
      const game = games.find((g) => g.id === gameId);
      if (!game) return socket.emit('error', 'Game not found');
      if (game.status !== 'playing') return socket.emit('error', "Game hasn't started or ended");
      if (!game.players.some((p) => p.userId === userId)) return socket.emit('error', "You're not in this game");
      if (userId !== game.options.turn) return socket.emit('error', 'Not your turn');
      if (userId === game.options.rolledBy) return socket.emit('error', 'You have already rolled a die');

      const roll = Math.floor(Math.random() * 6) + 1;
      game.options.rolledBy = userId;
      game.options.roll = roll;

      let playerIndex = game.players.findIndex((p) => p.userId === userId);
      let color: PinColor;
      if (game.players.length === 4) {
        color = ['red', 'blue', 'green', 'yellow'][playerIndex] as PinColor;
      } else {
        color = ['red', 'yellow'][playerIndex] as PinColor;
      }

      let movablePins = getMovablePins(game.options.pins, color, roll).length;
      if (movablePins === 0) {
        if (playerIndex === game.maxPlayers - 1) {
          game.options.turn = game.players[0].userId;
        } else {
          game.options.turn = game.players[playerIndex + 1].userId;
        }
      }
      io.to(gameId).emit('gameUpdate', game);
    });

    socket.on('ludo:movePin', ({ gameId, pinHome }) => {
      console.log('moving pin', userId, gameId, pinHome);
      const game = games.find((g) => g.id === gameId);
      if (!game) return socket.emit('error', 'Game not found');
      if (game.status !== 'playing') return socket.emit('error', "Game hasn't started or ended");
      if (!game.players.some((p) => p.userId === userId)) return socket.emit('error', "You're not in this game");
      if (userId !== game.options.turn) return socket.emit('error', 'Not your turn');
      if (userId !== game.options.rolledBy) return socket.emit('error', 'You have not rolled a die yet');

      let playerIndex = game.players.findIndex((p) => p.userId === game.options.turn);

      let color: PinColor;
      if (game.players.length === 4) {
        color = ['red', 'blue', 'green', 'yellow'][playerIndex] as PinColor;
      } else {
        color = ['red', 'yellow'][playerIndex] as PinColor;
      }

      let movablePins = getMovablePins(game.options.pins, color, game.options.roll);

      let pin = movablePins.find((p) => p.home === pinHome);

      if (!pin) return socket.emit('error', "This pin can't move");

      movePiece(pin, game.options.roll);

      handlePinCollision(game.options.pins, pin);

      if (game.options.roll === 6) {
        game.options.rolledBy = '';
      } else {
        if (playerIndex === game.maxPlayers - 1) {
          game.options.turn = game.players[0].userId;
        } else {
          game.options.turn = game.players[playerIndex + 1].userId;
        }
      }

      io.to(gameId).emit('gameUpdate', game);
    });

    // 🎯 TicTacToe move
    socket.on('ticTacToe:selectCell', ({ gameId, cell }) => {
      console.log('selecting a cell', userId, gameId, cell);
      const game = games.find((g) => g.id === gameId);
      if (!game) return socket.emit('error', 'Game not found');
      if (game.status !== 'playing') return socket.emit('error', "Game hasn't started or ended");
      if (!game.players.some((p) => p.userId === userId)) return socket.emit('error', "You're not in this game");
      if (userId !== game.options.turn) return socket.emit('error', 'Not your turn');
      if (game.options.board[cell]) return socket.emit('error', 'Cell taken');
      game.options.board[cell] = userId;
      const winner = checkWinner(game.options.board);

      if (winner) {
        game.status = 'ended';
        game.winner = winner;
        io.to(gameId).emit('gameOver', game);
        addTransaction(
          game.amount,
          game.type,
          winner,
          game.players.filter((p) => p.userId !== winner).map((p) => p.userId)
        );
        games.splice(games.indexOf(game), 1);
      } else if (game.options.board.every((c: string | null) => c)) {
        game.status = 'ended';
        game.winner = 'draw';
        io.to(gameId).emit('gameOver', game);
        games.splice(games.indexOf(game), 1);
      } else {
        game.options.turn = game.players.find((p) => p.userId !== userId)!.userId;
        io.to(gameId).emit('gameUpdate', game);
      }

      emitGamesUpdate(); // 🔁 update everyone
    });

    // ❌ Handle disconnect
    socket.on('disconnect', () => {
      console.log('❌ Disconnected:', socket.id);

      for (const game of games) {
        const player = game.players.find((p) => p.socketId === socket.id);
        if (!player) continue;

        console.log(`🚪 Player ${player.userId} disconnected from game ${game.id}`);
        socket.leave(game.id);

        if (game.status === 'waiting') {
          // Remove player from waiting game
          game.players = game.players.filter((p) => p.socketId !== socket.id);

          if (game.players.length === 0) {
            games.splice(games.indexOf(game), 1);
            emitGamesUpdate();
            return;
          }

          io.to(game.id).emit('waiting', game);
        } else if (game.status === 'playing') {
          // Mark player inactive
          player.status = 'inactive';

          if (game.players.length === 2) {
            // If only 2 players, end game and declare winner
            game.status = 'ended';
            game.winner = game.players.find((p) => p.userId !== player.userId)!.userId;
            io.to(game.id).emit('gameOver', game);

            addTransaction(
              game.amount,
              game.type,
              game.winner,
              game.players.filter((p) => p.userId !== game.winner).map((p) => p.userId)
            );

            games.splice(games.indexOf(game), 1);
          } else {
            // Notify others and continue
            io.to(game.id).emit('playerLeft', { userId: player.userId, status: 'inactive' });
          }
        }

        emitGamesUpdate();
        break;
      }
    });
  });
};
