import { Chess } from 'chess.js';
import { v4 as uuid } from 'uuid';

import { pins } from '@/constants/ludo';
import { createEmptyBoard } from './ticTacToe';
import { createCheckersBoard } from './checkers';
import { addTransaction, checkBalance } from './transaction';

export function startTurnTimer(gameId: string, games: any[], io: any, time: number = 15000) {
  const game = games.find((g) => g.id === gameId)!;
  // clearTimeout(game.options.timer);
  // if (!game.winner) {
  //   game.options.timer = setTimeout(() => {
  //     const winner = game.players.find((p: any) => p.userId !== game.options.turn)!.userId;
  //     game.winner = winner;
  //     addTransaction(
  //       game.amount,
  //       game.type,
  //       game.winner,
  //       game.players.filter((p: any) => p.userId !== game.winner).map((p: any) => p.userId)
  //     );
  //     const { privateSettings, ...gameWithoutPrivateSettings } = game;
  //     io.to(gameId).emit('gameOver', gameWithoutPrivateSettings);
  //     games.splice(games.indexOf(game), 1);
  //   }, time);
  // }
}

export async function handelCreateGame(
  username: string,
  userId: string,
  picture: string,
  type: string,
  amount: number,
  maxPlayers: number,
  winPinCount: number,
  games: any[],
  socket: any
) {
  const roomId = `room_${uuid()}`;

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

  const players = type === 'Ludo' && maxPlayers ? maxPlayers : 2;

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

  const { privateSettings, ...gameWithoutPrivateSettings } = newGame;
  socket.emit('waiting', gameWithoutPrivateSettings);
}

export async function handelJoinGame(username: string, userId: string, picture: string, gameId: string, games: any[], socket: any, io: any) {
  const game = games.find((g) => g.id === gameId);
  if (!game) return socket.emit('error', 'Game not found');
  if (game.status !== 'waiting') return socket.emit('error', 'Game already started');
  if (game.players.some((p: any) => p.userId === userId)) return socket.emit('error', 'Already in this game');
  const isUserActiveInAnyGame = games.some((game) => game.players.some((player: any) => player.userId === userId && player.status === 'active'));
  if (isUserActiveInAnyGame) return socket.emit('error', 'Already is playing a game');

  const response = await checkBalance(userId, game.amount);
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

  const remaining = game.maxPlayers - game.players.length;
  const { privateSettings, ...gameWithoutPrivateSettings } = game;
  if (remaining > 0) io.to(gameId).emit('waiting', gameWithoutPrivateSettings);

  if (game.players.length === game.maxPlayers) {
    game.status = 'playing';
    io.to(gameId).emit('gameStarted', gameWithoutPrivateSettings);
    startTurnTimer(gameId, games, io, 19000);
  }
}

export function handelLeaveGame(userId: string, gameId: string, games: any[], socket: any, io: any) {
  const game = games.find((g) => g.id === gameId);

  if (!game) return socket.emit('error', 'Game not found');
  const player = game.players.find((p: any) => p.userId === userId);
  if (!player) return socket.emit('error', "You're not in this game");

  if (game.status === 'waiting') {
    game.players = game.players.filter((p: any) => p.userId !== userId);
    socket.leave(gameId);

    if (game.players.length === 0) {
      games.splice(games.indexOf(game), 1);
      return;
    }

    const { privateSettings, ...gameWithoutPrivateSettings } = game;
    io.to(gameId).emit('waiting', gameWithoutPrivateSettings);
  } else if (game.status === 'playing') {
    player.status = 'inactive';
    socket.leave(gameId);

    if (game.players.length === 2) {
      game.status = 'ended';
      game.winner = game.players.find((p: any) => p.userId !== userId)!.userId;
      const { privateSettings, ...gameWithoutPrivateSettings } = game;
      io.to(gameId).emit('gameOver', gameWithoutPrivateSettings);

      addTransaction(
        game.amount,
        game.type,
        game.winner,
        game.players.filter((p: any) => p.userId !== game.winner).map((p: any) => p.userId)
      );

      games.splice(games.indexOf(game), 1);
    } else {
      io.to(gameId).emit('playerLeft', { userId, status: 'inactive' });
    }
  }
}

export function handleDisconnect(socket: any, games: any[], io: any) {
  for (const game of games) {
    const player = game.players.find((p: any) => p.socketId === socket.id);
    if (!player) continue;

    socket.leave(game.id);

    if (game.status === 'waiting') {
      game.players = game.players.filter((p: any) => p.socketId !== socket.id);

      if (game.players.length === 0) {
        games.splice(games.indexOf(game), 1);
        return;
      }

      const { privateSettings, ...gameWithoutPrivateSettings } = game;
      io.to(game.id).emit('waiting', gameWithoutPrivateSettings);
    } else if (game.status === 'playing') {
      player.status = 'inactive';

      if (game.players.length === 2) {
        game.status = 'ended';
        game.winner = game.players.find((p: any) => p.userId !== player.userId)!.userId;
        io.to(game.id).emit('gameOver', game);

        addTransaction(
          game.amount,
          game.type,
          game.winner,
          game.players.filter((p: any) => p.userId !== game.winner).map((p: any) => p.userId)
        );

        games.splice(games.indexOf(game), 1);
      } else {
        io.to(game.id).emit('playerLeft', { userId: player.userId, status: 'inactive' });
      }
    }

    break;
  }
}
