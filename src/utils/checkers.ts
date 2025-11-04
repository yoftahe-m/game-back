export function createCheckersBoard() {
  const board = [];

  for (let y = 0; y < 8; y++) {
    const row = [];

    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 1) {
        if (y < 3) row.push('B');
        else if (y > 4) row.push('R');
        else row.push(null);
      } else row.push(null);
    }

    board.push(row);
  }

  return board;
}

export function getOpponent(player: string) {
  return player === 'R' ? 'B' : 'R';
}

export function isValidMove(board: (string | null)[][], from: { x: number; y: number }, to: { x: number; y: number }, player: string): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const piece = board[from.y][from.x];
  if (!piece || piece[0] !== player) return false;

  // destination must be empty
  if (board[to.y][to.x]) return false;

  const dir = player === 'R' ? -1 : 1;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // normal move
  if (absDx === 1 && dy === dir) return true;

  // capture
  if (absDx === 2 && absDy === 2) {
    const midX = from.x + dx / 2;
    const midY = from.y + dy / 2;
    const midPiece = board[midY][midX];
    if (midPiece && midPiece[0] === getOpponent(player)) return true;
  }

  return false;
}

export function applyMove(board: (string | null)[][], from: { x: number; y: number }, to: { x: number; y: number }) {
  const piece = board[from.y][from.x];
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  board[to.y][to.x] = piece;
  board[from.y][from.x] = null;

  // handle capture
  if (Math.abs(dx) === 2 && Math.abs(dy) === 2) {
    const midX = from.x + dx / 2;
    const midY = from.y + dy / 2;
    board[midY][midX] = null;
  }

  // handle kinging
  if (piece === 'R' && to.y === 0) board[to.y][to.x] = 'RK';
  if (piece === 'B' && to.y === 7) board[to.y][to.x] = 'BK';
}
