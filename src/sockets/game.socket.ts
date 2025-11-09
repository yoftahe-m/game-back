import { v4 as uuidv4 } from 'uuid';
import { Server, Socket } from 'socket.io';
import { checkWinner, createEmptyBoard } from '@/utils/ticTacToe';
import { pins } from '@/constants/ludo';
import { getMovablePins, handlePinCollision, movePiece } from '@/utils/ludo';
import { PinColor } from '@/types/ludo';
import { shuffle, createDeck } from '@/utils/crazy';
import { addTransaction, checkBalance } from '@/utils/transaction';
import { supabaseAdmin } from '@/config/supabase';
import {
  BIRD_HEIGHT,
  BIRD_WIDTH,
  GRAVITY,
  JUMP_VELOCITY,
  PIPE_GAP,
  PIPE_SPAWN_INTERVAL,
  PIPE_SPEED,
  PIPE_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  TICK_RATE,
} from '@/constants/flappy';
import { attemptMove, cloneBoard, createCheckersBoard, getAllCaptures, getCapturesFrom, getPossibleMoves } from '@/utils/checkers';
import { Chess } from 'chess.js';

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

  function gameLoop(game: Game) {
    console.log('looping');

    game.options.gameTick++;

    // 1. --- Spawn New Pipes ---
    if (game.options.gameTick % PIPE_SPAWN_INTERVAL === 0) {
      const minTopHeight = 50;
      const maxTopHeight = SCREEN_HEIGHT - PIPE_GAP - 50;
      const topHeight = Math.floor(Math.random() * (maxTopHeight - minTopHeight + 1)) + minTopHeight;

      game.options.pipes.push({
        id: game.options.gameTick, // Use tick as a simple unique ID
        x: SCREEN_WIDTH,
        topHeight: topHeight,
        passedBy: [], // Keep track of which players passed this pipe
      });
    }

    // 2. --- Move Pipes ---
    // Iterate backwards to safely remove items
    for (let i = game.options.pipes.length - 1; i >= 0; i--) {
      const pipe = game.options.pipes[i];
      pipe.x -= PIPE_SPEED;

      // Remove pipe if it's off-screen
      if (pipe.x < -PIPE_WIDTH) {
        game.options.pipes.splice(i, 1);
      }
    }

    // 3. --- Update Players (Physics, Collision, Scoring) ---
    for (const playerId in game.options.players) {
      const player = game.options.players[playerId];

      // Don't update dead players
      if (player.isDead) continue;

      // Apply gravity
      player.velocity += GRAVITY;
      player.y += player.velocity;

      // Check for ground collision
      if (player.y + BIRD_HEIGHT > SCREEN_HEIGHT) {
        player.isDead = true;
        continue;
      }
      // Check for ceiling collision
      if (player.y < 0) {
        player.isDead = true;
        continue;
      }

      // --- NEW: Collision Detection ---
      for (const pipe of game.options.pipes) {
        // Check for X-axis overlap (is the bird between the pipe's front and back?)
        const isOverlappingX = player.x + BIRD_WIDTH > pipe.x && player.x < pipe.x + PIPE_WIDTH;

        // Check for Y-axis overlap (is the bird hitting the top or bottom pipe?)
        const isHittingTop = player.y < pipe.topHeight;
        const isHittingBottom = player.y + BIRD_HEIGHT > pipe.topHeight + PIPE_GAP;

        const isOverlappingY = isHittingTop || isHittingBottom;

        if (isOverlappingX && isOverlappingY) {
          player.isDead = true;
          break; // No need to check other pipes for this player
        }

        // --- NEW: Scoring ---
        // Check if player passed the pipe
        // We check if the pipe's *back edge* is now to the *left* of the player's *front edge*
        if (!pipe.passedBy.includes(playerId) && pipe.x + PIPE_WIDTH < player.x) {
          player.score++;
          pipe.passedBy.push(playerId); // Mark as passed for this player
        }
      }
    }

    // 4. --- Broadcast State ---
    // Send the *entire* game state to all clients
    io.emit('flappy:Update', game);
  }

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

      let settings = null;

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
        case 'Flappy':
          gameOptions = {
            gameTick: 0,
            pipes: [],
            players: { [userId]: { id: socket.id, x: 100, y: 300, velocity: 0, score: 0, isDead: false } },
          };
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
        maxPlayers,
        winner: null,
        amount,
        privateSettings: settings,
      };

      games.push(newGame);
      socket.join(roomId);

      console.log(`🎮 New ${type} game created: ${roomId} (${maxPlayers} players)`);
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

      if (game.type === 'Flappy') {
        game.options.players[userId] = { id: socket.id, x: 100, y: 300, velocity: 0, score: 0, isDead: false };
      }
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
        startTurnTimer(gameId);
        // if (game.type === 'Flappy') {
        //   setInterval(gameLoop, 1000 / TICK_RATE);
        // }
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

    socket.on('chess:move', ({ gameId, from, to }) => {
      const game = games.find((g) => g.id === gameId);
      if (!game) return socket.emit('error', 'Game not found');
      if (game.status !== 'playing') return socket.emit('error', "Game hasn't started or ended");
      if (!game.players.some((p) => p.userId === userId)) return socket.emit('error', "You're not in this game");
      if (userId !== game.options.turn) return socket.emit('error', 'Not your turn');

      try {
        const move = game.privateSettings.move({ from, to });
        if (!move) return socket.emit('error', 'invalidMove');
      } catch (err) {
        return socket.emit('error', 'invalidMove');
      }

      game.options.board = game.privateSettings.board();

      const possibleMove = game.privateSettings.moves();
      game.options.turn = game.options.players.find((p: any) => p.userId !== userId).userId;
      const { privateSettings, ...gameWithoutPrivateSettings } = game;

      if (game.privateSettings.isDraw()) {
        game.winner = 'draw';
        io.to(gameId).emit('gameOver', gameWithoutPrivateSettings);
        games.splice(games.indexOf(game), 1);
      } else if (game.privateSettings.isGameOver() || possibleMove.length === 0) {
        const winner = game.options.players.find((p: any) => p.color !== game.privateSettings.turn()).userId;
        game.winner = winner;
        io.to(gameId).emit('gameOver', gameWithoutPrivateSettings);
        addTransaction(
          game.amount,
          game.type,
          winner,
          game.players.filter((p) => p.userId !== winner).map((p) => p.userId)
        );
        games.splice(games.indexOf(game), 1);
      } else {
        io.to(gameId).emit('gameUpdate', gameWithoutPrivateSettings);
      }

      emitGamesUpdate();
    });

    socket.on('flappy:jump', ({ gameId }) => {
      const game = games.find((g) => g.id === gameId);
      if (!game) return socket.emit('error', 'Game not found');
      if (game.status !== 'playing') return socket.emit('error', "Game hasn't started or ended");
      if (!game.players.some((p) => p.userId === userId)) return socket.emit('error', "You're not in this game");

      const player = game.options.players[userId];
      // Only let the player jump if they exist and are not dead
      if (player && !player.isDead) {
        player.velocity = JUMP_VELOCITY;
      }
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

    socket.on('checkers:move', ({ gameId, from, to }) => {
      console.log('moving puck', userId, gameId, from, to);
      const game = games.find((g) => g.id === gameId);
      if (!game) return socket.emit('error', 'Game not found');
      if (game.status !== 'playing') return socket.emit('error', "Game hasn't started or ended");
      if (!game.players.some((p) => p.userId === userId)) return socket.emit('error', "You're not in this game");
      if (userId !== game.options.turn) return socket.emit('error', 'Not your turn');

      console.log(userId, game.players, game.options.players);
      const playerColor = game.options.players.find((p: any) => p.userId === userId).color;

      const piece = game.options.board[from.y][from.x];
      console.log(playerColor, piece);
      if (!piece || piece.color !== playerColor) return socket.emit('error', 'Invalid piece selection.');

      const allCaptures = getAllCaptures(game.options.board, playerColor);

      const isJump = Math.abs(from.x - to.x) === 2 && Math.abs(from.y - to.y) === 2;
      const isSimpleMove = Math.abs(from.x - to.x) === 1 && Math.abs(from.y - to.y) === 1;

      if (allCaptures.length > 0 && !isJump) return socket.emit('error', 'A capture is available. You must capture.');

      let newBoard = cloneBoard(game.options.board);
      let turnOver = true;

      if (isJump) {
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const jumped = game.options.board[midY][midX];

        if (!jumped || jumped.color === playerColor) return socket.emit('error', 'Illegal jump: No opponent piece to jump over.');

        // Perform jump
        newBoard[from.y][from.x] = null;
        newBoard[midY][midX] = null;
        newBoard[to.y][to.x] = { ...piece };

        // Kinging
        if ((playerColor === 'red' && to.y === 0) || (playerColor === 'black' && to.y === 7)) {
          newBoard[to.y][to.x]!.king = true;
        }

        // Check for multi-jump
        const moreCaptures = getCapturesFrom(newBoard, to.x, to.y);
        if (moreCaptures.length > 0) {
          turnOver = false;
        }
      } else if (isSimpleMove) {
        // Validate direction for non-king
        const dy = to.y - from.y;
        if (!piece.king) {
          if (piece.color === 'red' && dy !== -1) return socket.emit('error', 'Red can only move up.');
          if (piece.color === 'black' && dy !== 1) return socket.emit('error', 'Black can only move down.');
        }

        // Apply simple move
        newBoard[from.y][from.x] = null;
        newBoard[to.y][to.x] = { ...piece };

        // Kinging
        if ((playerColor === 'red' && to.y === 0) || (playerColor === 'black' && to.y === 7)) {
          newBoard[to.y][to.x]!.king = true;
        }
      } else {
        return socket.emit('error', 'Invalid move distance.');
      }

      // Determine next player
      const nextPlayer = turnOver ? (playerColor === 'red' ? 'black' : 'red') : playerColor;

      console.log(nextPlayer);
      // Check for winner (no moves available for next player)
      const nextPlayerCaptures = getAllCaptures(newBoard, nextPlayer);
      const hasMoves =
        nextPlayerCaptures.length > 0 ||
        newBoard.some((row, y) => row.some((cell, x) => cell && cell.color === nextPlayer && getPossibleMoves(newBoard, x, y).length > 0));

      const winnerColor = hasMoves ? null : playerColor;

      game.options.board = newBoard;
      game.options.mandatoryCaptures = !turnOver ? [{ x: to.x, y: to.y }] : [];
      game.options.turn = game.options.players.find((p: any) => p.color === nextPlayer).userId;

      if (winnerColor) {
        game.status = 'ended';
        const winner = game.options.players.find((p: any) => p.color === winnerColor).userId;
        game.winner = winner;
        io.to(gameId).emit('gameOver', game);
        addTransaction(
          game.amount,
          game.type,
          winner,
          game.players.filter((p) => p.userId !== winner).map((p) => p.userId)
        );
        games.splice(games.indexOf(game), 1);
      } else {
        game.options.turn = game.options.players.find((p: any) => p.color === nextPlayer).userId;
        io.to(gameId).emit('gameUpdate', game);
      }

      emitGamesUpdate();
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
      clearTimeout(game.options.timer);
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
        startTurnTimer(gameId);
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
