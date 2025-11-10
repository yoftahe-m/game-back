export const createCheckersBoard = () => {
  const newBoard: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 1) newBoard[y][x] = { color: 'black', king: false };
    }
  }
  for (let y = 5; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 1) newBoard[y][x] = { color: 'red', king: false };
    }
  }
  return newBoard;
};

type Color = 'red' | 'black';

type Piece = {
  color: Color;
  king: boolean;
};

type Cell = Piece | null;
type Board = Cell[][];

interface GameState {
  board: Board;
  currentPlayer: Color;
  winner: Color | null;
  mandatoryCaptures: { x: number; y: number }[];
}

// Helpers
export const cloneBoard = (b: Board): Board => b.map((row) => row.map((cell) => (cell ? { ...cell } : null)));

export const inBounds = (x: number, y: number): boolean => x >= 0 && x < 8 && y >= 0 && y < 8;

// Get all capture moves available for the current player
export function getAllCaptures(board: Board, color: Color): { x: number; y: number }[] {
  const captures: { x: number; y: number }[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const piece = board[y][x];
      if (piece && piece.color === color && getCapturesFrom(board, x, y).length > 0) {
        captures.push({ x, y });
      }
    }
  }
  return captures;
}

// Get capture moves available from a specific piece
export function getCapturesFrom(board: Board, x: number, y: number): { x: number; y: number }[] {
  const piece = board[y][x];
  if (!piece) return [];

  const dirs = piece.king
    ? [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]
    : piece.color === 'red'
    ? [
        [-1, -1],
        [1, -1],
      ]
    : [
        [-1, 1],
        [1, 1],
      ];

  const captures: { x: number; y: number }[] = [];

  for (const [dx, dy] of dirs) {
    const midX = x + dx;
    const midY = y + dy;
    const landX = x + dx * 2;
    const landY = y + dy * 2;

    if (inBounds(midX, midY) && inBounds(landX, landY) && board[midY][midX] && board[midY][midX]!.color !== piece.color && !board[landY][landX]) {
      captures.push({ x: landX, y: landY });
    }
  }

  return captures;
}

// Helper for non-capture moves
export function getPossibleMoves(board: Board, x: number, y: number): { x: number; y: number }[] {
  const piece = board[y][x];
  if (!piece) return [];

  const dirs = piece.king
    ? [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]
    : piece.color === 'red'
    ? [
        [-1, -1],
        [1, -1],
      ]
    : [
        [-1, 1],
        [1, 1],
      ];

  const moves: { x: number; y: number }[] = [];

  for (const [dx, dy] of dirs) {
    const newX = x + dx;
    const newY = y + dy;
    if (inBounds(newX, newY) && !board[newY][newX]) {
      moves.push({ x: newX, y: newY });
    }
  }

  return moves;
}

export function attemptMove(gameState: GameState, fromX: number, fromY: number, toX: number, toY: number): GameState {
  const { board, currentPlayer } = gameState;
  const piece = board[fromY][fromX];

  if (!piece || piece.color !== currentPlayer) {
    throw new Error('Invalid piece selection.');
  }

  const allCaptures = getAllCaptures(board, currentPlayer);
  const isJump = Math.abs(fromX - toX) === 2 && Math.abs(fromY - toY) === 2;
  const isSimpleMove = Math.abs(fromX - toX) === 1 && Math.abs(fromY - toY) === 1;

  // Mandatory capture rule
  if (allCaptures.length > 0 && !isJump) {
    throw new Error('A capture is available. You must capture.');
  }

  let newBoard = cloneBoard(board);
  let turnOver = true;

  if (isJump) {
    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2;
    const jumped = board[midY][midX];

    if (!jumped || jumped.color === currentPlayer) {
      throw new Error('Illegal jump: No opponent piece to jump over.');
    }

    // Perform jump
    newBoard[fromY][fromX] = null;
    newBoard[midY][midX] = null;
    newBoard[toY][toX] = { ...piece };

    // Kinging
    if ((currentPlayer === 'red' && toY === 0) || (currentPlayer === 'black' && toY === 7)) {
      newBoard[toY][toX]!.king = true;
    }

    // Check for multi-jump
    const moreCaptures = getCapturesFrom(newBoard, toX, toY);
    if (moreCaptures.length > 0) {
      turnOver = false;
    }
  } else if (isSimpleMove) {
    // Validate direction for non-king
    const dy = toY - fromY;
    if (!piece.king) {
      if (piece.color === 'red' && dy !== -1) throw new Error('Red can only move up.');
      if (piece.color === 'black' && dy !== 1) throw new Error('Black can only move down.');
    }

    // Apply simple move
    newBoard[fromY][fromX] = null;
    newBoard[toY][toX] = { ...piece };

    // Kinging
    if ((currentPlayer === 'red' && toY === 0) || (currentPlayer === 'black' && toY === 7)) {
      newBoard[toY][toX]!.king = true;
    }
  } else {
    throw new Error('Invalid move distance.');
  }

  // Determine next player
  const nextPlayer = turnOver ? (currentPlayer === 'red' ? 'black' : 'red') : currentPlayer;

  // Check for winner (no moves available for next player)
  const nextPlayerCaptures = getAllCaptures(newBoard, nextPlayer);
  const hasMoves =
    nextPlayerCaptures.length > 0 ||
    newBoard.some((row, y) => row.some((cell, x) => cell && cell.color === nextPlayer && getPossibleMoves(newBoard, x, y).length > 0));

  const winner = hasMoves ? null : currentPlayer;

  return {
    board: newBoard,
    currentPlayer: nextPlayer,
    winner,
    mandatoryCaptures: !turnOver ? [{ x: toX, y: toY }] : [],
  };
}

export function checkersMove(gameId: string, fromX: number, fromY: number, toX: number, toY: number, games: any[], userId: string) {
  const game = games.find((g) => g.id === gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'playing') throw new Error("Game hasn't started or ended");
  if (!game.players.some((p: any) => p.userId === userId)) throw new Error("You're not in this game");
  if (userId !== game.options.turn) throw new Error('Not your turn');

  const playerColor = game.options.players.find((p: any) => p.userId === userId).color;

  const piece = game.options.board[fromY][fromX];
  if (!piece || piece.color !== playerColor) throw new Error('please select valid Move');

  const allCaptures = getAllCaptures(game.options.board, playerColor);

  const isJump = Math.abs(fromX - toX) === 2 && Math.abs(fromY - toY) === 2;
  const isSimpleMove = Math.abs(fromX - toX) === 1 && Math.abs(fromY - toY) === 1;

  if (allCaptures.length > 0 && !isJump) throw new Error('A capture is available. You must capture.');

  let newBoard = cloneBoard(game.options.board);
  let turnOver = true;

  if (isJump) {
    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2;
    const jumped = game.options.board[midY][midX];

    if (!jumped || jumped.color === playerColor) throw new Error('Illegal jump: No opponent piece to jump over.');

    // Perform jump
    newBoard[fromY][fromX] = null;
    newBoard[midY][midX] = null;
    newBoard[toY][toX] = { ...piece };

    // Kinging
    if ((playerColor === 'red' && toY === 0) || (playerColor === 'black' && toY === 7)) {
      newBoard[toY][toX]!.king = true;
    }

    // Check for multi-jump
    const moreCaptures = getCapturesFrom(newBoard, toX, toY);
    if (moreCaptures.length > 0) {
      turnOver = false;
    }
  } else if (isSimpleMove) {
    // Validate direction for non-king
    const dy = toY - fromY;
    if (!piece.king) {
      if (piece.color === 'red' && dy !== -1) throw new Error('Red can only move up.');
      if (piece.color === 'black' && dy !== 1) throw new Error('Black can only move down.');
    }

    // Apply simple move
    newBoard[fromY][fromX] = null;
    newBoard[toY][toX] = { ...piece };

    // Kinging
    if ((playerColor === 'red' && toY === 0) || (playerColor === 'black' && toY === 7)) {
      newBoard[toY][toX]!.king = true;
    }
  } else {
    throw new Error('Invalid move distance.');
  }

  // Determine next player
  const nextPlayer = turnOver ? (playerColor === 'red' ? 'black' : 'red') : playerColor;

  // Check for winner (no moves available for next player)
  const nextPlayerCaptures = getAllCaptures(newBoard, nextPlayer);
  const hasMoves =
    nextPlayerCaptures.length > 0 ||
    newBoard.some((row, y) => row.some((cell, x) => cell && cell.color === nextPlayer && getPossibleMoves(newBoard, x, y).length > 0));

  const winnerColor = hasMoves ? null : playerColor;

  game.options.board = newBoard;
  game.options.mandatoryCaptures = !turnOver ? [{ x: toX, y: toY }] : [];
  game.options.turn = game.options.players.find((p: any) => p.color === nextPlayer).userId;

  if (winnerColor) {
    game.status = 'ended';
    const winner = game.options.players.find((p: any) => p.color === winnerColor).userId;
    game.winner = winner;
  } else {
    game.options.turn = game.options.players.find((p: any) => p.color === nextPlayer).userId;
  }
  return game;
}
