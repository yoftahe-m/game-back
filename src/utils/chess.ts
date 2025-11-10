export function chessMove(gameId: string, from: string, to: string, games: any[], userId: string) {
  const game = games.find((g) => g.id === gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'playing') throw new Error("Game hasn't started or ended");
  if (!game.players.some((p: any) => p.userId === userId)) throw new Error("You're not in this game");
  if (userId !== game.options.turn) throw new Error('Not your turn');

  try {
    const move = game.privateSettings.move({ from, to });
    if (!move) throw new Error('please select valid Move');
  } catch (err) {
    throw new Error('please select valid Move');
  }
  clearTimeout(game.options.timer);

  game.options.board = game.privateSettings.board();

  const possibleMove = game.privateSettings.moves();
  game.options.turn = game.options.players.find((p: any) => p.userId !== userId).userId;

  if (game.privateSettings.isDraw()) {
    game.status = 'ended';
    game.winner = 'draw';
  } else if (game.privateSettings.isGameOver() || possibleMove.length === 0) {
    game.status = 'ended';
    const winner = game.options.players.find((p: any) => p.color !== game.privateSettings.turn()).userId;
    game.winner = winner;
  }

  const { privateSettings, ...gameWithoutPrivateSettings } = game;
  return gameWithoutPrivateSettings;
}
