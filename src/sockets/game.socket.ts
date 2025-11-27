import { Server, Socket } from 'socket.io';

import { createEmptyBoard, selectCell } from '@/utils/ticTacToe';

import { ludoMove, rollDie } from '@/utils/ludo';
import { addTransaction, checkBalance } from '@/utils/transaction';
import { supabaseAdmin } from '@/config/supabase';

import { checkersMove, cloneBoard, createCheckersBoard, getAllCaptures, getCapturesFrom, getPossibleMoves } from '@/utils/checkers';
import { chessMove } from '@/utils/chess';
import { handelCreateGame, handelJoinGame, handelLeaveGame, handleDisconnect, startTurnTimer } from '@/utils/socket';

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
      await handelCreateGame(username, userId, picture, type, amount, maxPlayers, winPinCount, games, socket);
    });

    // 🟡 Join an existing game
    socket.on('joinGame', async ({ username, picture, gameId }) => {
      await handelJoinGame(username, userId, picture, gameId, games, socket, io);
    });

    // ❌ Handle Leave
    socket.on('leaveGame', ({ gameId }) => {
      handelLeaveGame(userId, gameId, games, socket, io);
    });

    // 🎯 TicTacToe select cell
    socket.on('ticTacToe:selectCell', ({ gameId, cell }) => {
      try {
        const game = selectCell(gameId, cell, games, userId);

        if (!game.winner) {
          io.to(gameId).emit('gameUpdate', game);
          startTurnTimer(gameId, games, io);
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
    socket.on('ludo:movePin', ({ gameId, index }) => {
      try {
        const game = ludoMove(gameId, index, games, userId);

        if (!game.winner) {
          // Emit the move (includes lastMove) so clients can animate it
          io.to(gameId).emit('gameUpdate', game);
          // Immediately clear transient animation payload to prevent replay on future updates
          if (game.options) delete game.options.lastMove;
          startTurnTimer(gameId, games, io);
        } else if (game.winner === 'draw') {
          io.to(gameId).emit('gameOver', game);
          // clear before removing to avoid any stray usage
          if (game.options) delete game.options.lastMove;
          games.splice(games.indexOf(game), 1);
        } else {
          io.to(gameId).emit('gameOver', game);
          if (game.options) delete game.options.lastMove;
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
          startTurnTimer(gameId, games, io);
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
          startTurnTimer(gameId, games, io);
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
      handleDisconnect(socket, games, io);
    });
  });
};
