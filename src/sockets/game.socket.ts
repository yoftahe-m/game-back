import { v4 as uuidv4 } from 'uuid';
import { Server, Socket } from 'socket.io';
import { checkWinner, createEmptyBoard } from '@/utils/ticTacToe';
import { pins } from '@/constants/ludo';
import { getMovablePins, handlePinCollision, movePiece } from '@/utils/ludo';
import { PinColor } from '@/types/ludo';
import { shuffle, createDeck } from '@/utils/crazy';
import { addTransaction } from '@/utils/transaction';

const games: {
  id: string;
  type: string;
  status: 'waiting' | 'playing' | 'ended';
  options: { [key: string]: any };
  players: { userId: string; username: string; socketId: string }[];
  maxPlayers: number;
  turn: string;
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

    // 🟢 Create a game
    socket.on('createGame', ({ username, type, options, amount }) => {
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
      const maxPlayers = type === 'ludo' ? options?.maxPlayers || 2 : 2;

      let gameOptions = {};
      switch (type) {
        case 'Ludo':
          gameOptions = { pins: maxPlayers === 2 ? pins.filter((p) => p.color === 'red' || p.color === 'yellow') : pins, roll: 0, rolledBy: '' };
          break;
        case 'Tic Tac Toe':
          gameOptions = { board: createEmptyBoard() };
          break;
        case 'Crazy':
          // let deck = shuffle(createDeck());
          gameOptions = { drawPenalty: 0, discard: [] };
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
        players: [{ userId, username, socketId: socket.id }],
        turn: userId,
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
    socket.on('joinGame', ({ username, gameId }) => {
      const game = games.find((g) => g.id === gameId);
      console.log('joining a room', userId, username, gameId, game);
      if (!game) return socket.emit('error', 'Game not found');
      if (game.status !== 'waiting') return socket.emit('error', 'Game already started');
      if (game.players.some((p) => p.userId === userId)) return socket.emit('error', 'Already in this game');

      game.players.push({ userId, username, socketId: socket.id });
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
      if (!game.players.some((p) => p.userId === userId)) return socket.emit('error', "You're not in this game");

      // Remove player
      game.players = game.players.filter((p) => p.userId !== userId);
      socket.leave(gameId);

      // Handle empty game
      if (game.players.length === 0) {
        games.splice(games.indexOf(game), 1);
        emitGamesUpdate();
        return;
      }

      // If game hasn't started yet, keep waiting
      if (game.status === 'waiting') {
        io.to(gameId).emit('waiting', game);
      }

      // If game started and a player leaves, end it
      if (game.status === 'playing') {
        if (game.players.length < 2) {
          game.status = 'ended';
          game.winner = game.players[0]?.userId || null;
          io.to(gameId).emit('gameOver', game);
          games.splice(games.indexOf(game), 1);
        } else {
          // Notify others that a player left, continue game
          io.to(gameId).emit('playerLeft', { userId });
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
      if (userId !== game.turn) return socket.emit('error', 'Not your turn');
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
          game.turn = game.players[0].userId;
        } else {
          game.turn = game.players[playerIndex + 1].userId;
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
      if (userId !== game.turn) return socket.emit('error', 'Not your turn');
      if (userId !== game.options.rolledBy) return socket.emit('error', 'You have not rolled a die yet');

      let playerIndex = game.players.findIndex((p) => p.userId === game.turn);

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
          game.turn = game.players[0].userId;
        } else {
          game.turn = game.players[playerIndex + 1].userId;
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
      if (userId !== game.turn) return socket.emit('error', 'Not your turn');
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
        game.turn = game.players.find((p) => p.userId !== userId)!.userId;
        io.to(gameId).emit('gameUpdate', game);
      }

      emitGamesUpdate(); // 🔁 update everyone
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

            if (game.players.length < 2 && game.status === 'playing') {
              game.status = 'ended';
              io.to(game.id).emit('gameOver', {
                ...game,
                winner: game.players[0]?.userId || null,
              });
              games.splice(games.indexOf(game), 1);
            }
          }

          emitGamesUpdate(); // 🔁 update everyone after any change
          break;
        }
      }
    });
  });
};
