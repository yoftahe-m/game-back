import { Chess } from 'chess.js';
import { v4 as uuidv4 } from 'uuid';
import { Server, Socket } from 'socket.io';

import { createEmptyBoard, selectCell } from '@/utils/ticTacToe';
import { pins } from '@/constants/ludo';
import { getMovablePins, handlePinCollision, ludoMove, movePiece, rollDie } from '@/utils/ludo';
import { addTransaction, checkBalance } from '@/utils/transaction';
import { supabaseAdmin } from '@/config/supabase';

import { checkersMove, cloneBoard, createCheckersBoard, getAllCaptures, getCapturesFrom, getPossibleMoves } from '@/utils/checkers';
import { chessMove } from '@/utils/chess';

type Game = {
  id: string;
  type: string;
  status: 'waiting' | 'playing' | 'ended';
  options: { [key: string]: any };
  players: { userId: string; username: string; picture?: string; socketId: string; status: 'active' | 'inactive' }[];
  maxPlayers: number;
  winner: string | null;
  amount: number;
  privateSettings: any;
};
const games: Game[] = [];

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
        players: g.players,
        amount: g.amount,
      }))
    );
  };

  const startTurnTimer = (gameId: string) => {
    const game = games.find((g) => g.id === gameId)!;
    // clearTimeout(game.options.timer);
    // game.options.timer = setTimeout(() => {
    //   const winner = game.players.find((p) => p.userId !== game.options.turn)!.userId;
    //   game.winner = winner;
    //   const { privateSettings, ...gameWithoutPrivateSettings } = game;
    //   io.to(gameId).emit('gameOver', gameWithoutPrivateSettings);
    //   games.splice(games.indexOf(game), 1);
    // }, 15000);
  };

  io.on('connection', (socket: Socket) => {
    console.log('⚡ Client connected:', socket.id);

    const { userId } = socket.data;

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
    socket.on('createGame', async ({ username, picture, type, options, amount, maxPlayers, winPinCount }) => {
      console.log('creating a room', typeof maxPlayers, winPinCount);
      const roomId = `room_${uuidv4()}`;

      if (type === 'Ludo') {
        if (![2, 4].includes(maxPlayers)) {
          socket.emit('error', 'Ludo supports only 2 or 4 players');
          return;
        }
        if (![1, 2, 4].includes(winPinCount)) {
          socket.emit('error', 'Ludo supports only 1, 2 or 4 win pin count');
          return;
        }
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

      console.log(maxPlayers);

      const players = type === 'Ludo' && maxPlayers ? maxPlayers : 2;

      console.log('first', players);

      let settings = null;

      let gameOptions = {};
      switch (type) {
        case 'Ludo':
          gameOptions = {
            pins: players === 2 ? pins.filter((p) => p.color === 'red' || p.color === 'yellow') : pins,
            roll: 0,
            rolledBy: '',
            turn: userId,
            winPinCount,
          };
          break;
        case 'Tic Tac Toe':
          gameOptions = { board: createEmptyBoard(), turn: userId };
          break;

        case 'Chess':
          const chessGame = new Chess();
          gameOptions = {
            board: chessGame.board(),
            turn: userId,
            players: [{ userId: userId, color: 'w' }],
          };
          settings = chessGame;
          break;
        case 'Checkers':
          gameOptions = {
            board: createCheckersBoard(),
            turn: userId,
            players: [{ userId: userId, color: 'red' }],
            mandatoryCaptures: [],
          };
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
        maxPlayers: players,
        winner: null,
        amount,
        privateSettings: settings,
      };

      games.push(newGame);
      socket.join(roomId);

      console.log(`🎮 New ${type} game created: ${roomId} (${players} players)`);
      const { privateSettings, ...gameWithoutPrivateSettings } = newGame;
      socket.emit('waiting', gameWithoutPrivateSettings);

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

      if (game.type === 'Checkers') {
        game.options.players.push({ userId, color: 'black' });
      }
      if (game.type === 'Chess') {
        game.options.players.push({ userId, color: 'b' });
      }

      socket.join(gameId);

      console.log('pins', game.options.pins);
      const remaining = game.maxPlayers - game.players.length;
      const { privateSettings, ...gameWithoutPrivateSettings } = game;
      if (remaining > 0) io.to(gameId).emit('waiting', gameWithoutPrivateSettings);

      if (game.players.length === game.maxPlayers) {
        game.status = 'playing';
        io.to(gameId).emit('gameStarted', gameWithoutPrivateSettings);
        startTurnTimer(gameId);
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
        const { privateSettings, ...gameWithoutPrivateSettings } = game;
        io.to(gameId).emit('waiting', gameWithoutPrivateSettings);
      } else if (game.status === 'playing') {
        // Set leaving player to inactive
        player.status = 'inactive';
        socket.leave(gameId);

        if (game.players.length === 2) {
          // If only 2 players, end the game and declare the other as winner
          game.status = 'ended';
          game.winner = game.players.find((p) => p.userId !== userId)!.userId;
          const { privateSettings, ...gameWithoutPrivateSettings } = game;
          io.to(gameId).emit('gameOver', gameWithoutPrivateSettings);

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

    // 🎯 TicTacToe select cell
    socket.on('ticTacToe:selectCell', ({ gameId, cell }) => {
      try {
        const game = selectCell(gameId, cell, games, userId);

        if (!game.winner) {
          io.to(gameId).emit('gameUpdate', game);
          startTurnTimer(gameId);
        } else if (game.winner === 'draw') {
          io.to(gameId).emit('gameOver', game);
          games.splice(games.indexOf(game), 1);
        } else {
          io.to(gameId).emit('gameOver', game);
          addTransaction(
            game.amount,
            game.type,
            game.winner,
            game.players.filter((p: any) => p.userId !== game.winner).map((p: any) => p.userId)
          );
          games.splice(games.indexOf(game), 1);
        }
      } catch (error) {
        if (error instanceof Error) socket.emit('error', error.message);
        else socket.emit('error', String(error));
      }
    });

    // 🎯 Ludo: roll die
    socket.on('ludo:rollDie', ({ gameId }) => {
      try {
        const game = rollDie(gameId, games, userId);
        io.to(gameId).emit('gameUpdate', game);
      } catch (error) {
        if (error instanceof Error) socket.emit('error', error.message);
        else socket.emit('error', String(error));
      }
    });

    // 🎯 Ludo: move pin
    socket.on('ludo:movePin', ({ gameId, pinHome }) => {
      try {
        const game = ludoMove(gameId, pinHome, games, userId);

        if (!game.winner) {
          io.to(gameId).emit('gameUpdate', game);
          startTurnTimer(gameId);
        } else if (game.winner === 'draw') {
          io.to(gameId).emit('gameOver', game);
          games.splice(games.indexOf(game), 1);
        } else {
          io.to(gameId).emit('gameOver', game);
          addTransaction(
            game.amount,
            game.type,
            game.winner,
            game.players.filter((p: any) => p.userId !== game.winner).map((p: any) => p.userId)
          );
          games.splice(games.indexOf(game), 1);
        }
      } catch (error) {
        if (error instanceof Error) socket.emit('error', error.message);
        else socket.emit('error', String(error));
      }
    });

    // 🎯 checkers Move
    socket.on('checkers:move', ({ gameId, from, to }) => {
      try {
        const game = checkersMove(gameId, from.x, from.y, to.x, to.y, games, userId);

        if (!game.winner) {
          io.to(gameId).emit('gameUpdate', game);
          startTurnTimer(gameId);
        } else if (game.winner === 'draw') {
          io.to(gameId).emit('gameOver', game);
          games.splice(games.indexOf(game), 1);
        } else {
          io.to(gameId).emit('gameOver', game);
          addTransaction(
            game.amount,
            game.type,
            game.winner,
            game.players.filter((p: any) => p.userId !== game.winner).map((p: any) => p.userId)
          );
          games.splice(games.indexOf(game), 1);
        }
      } catch (error) {
        if (error instanceof Error) socket.emit('error', error.message);
        else socket.emit('error', String(error));
      }
    });

    // 🎯 chess Move
    socket.on('chess:move', ({ gameId, from, to }) => {
      try {
        const game = chessMove(gameId, from, to, games, userId);

        if (!game.winner) {
          io.to(gameId).emit('gameUpdate', game);
          startTurnTimer(gameId);
        } else if (game.winner === 'draw') {
          io.to(gameId).emit('gameOver', game);
          games.splice(games.indexOf(game), 1);
        } else {
          io.to(gameId).emit('gameOver', game);
          addTransaction(
            game.amount,
            game.type,
            game.winner,
            game.players.filter((p: any) => p.userId !== game.winner).map((p: any) => p.userId)
          );
          games.splice(games.indexOf(game), 1);
        }
      } catch (error) {
        if (error instanceof Error) socket.emit('error', error.message);
        else socket.emit('error', String(error));
      }
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
