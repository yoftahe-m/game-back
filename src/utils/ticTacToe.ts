export function createEmptyBoard() {
  return Array(9).fill(null);
}

export function checkWinner(board: string[]) {
  const wins: [number, number, number][] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const [a, b, c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

export function selectCell(gameId: string, cell: number, games: any[], userId: string) {
  const game = games.find((g) => g.id === gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'playing') throw new Error("Game hasn't started or ended");
  if (!game.players.some((p: any) => p.userId === userId)) throw new Error("You're not in this game");
  if (userId !== game.options.turn) throw new Error('Not your turn');
  if (game.options.board[cell]) throw new Error('Cell taken');
  clearTimeout(game.options.timer);

  game.options.board[cell] = userId;
  const winner = checkWinner(game.options.board);

  if (winner) {
    game.status = 'ended';
    game.winner = winner;
  } else if (game.options.board.every((c: string | null) => c)) {
    game.status = 'ended';
    game.winner = 'draw';
  } else {
    game.options.turn = game.players.find((p: any) => p.userId !== userId)!.userId;
  }
  return game;
}
