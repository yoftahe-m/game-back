import { LUDO_BOARD, winPosition } from '@/constants/ludo';
import { Pin, PinColor } from '@/types/ludo';

export function checkWinner(pins: Pin[], count: number, color: PinColor) {
  if (pins.filter((p) => p.color === color && p.position === winPosition[color]).length === count) return color;
  return null;
}

export function calculateStepsToWin(currentPosition: string, winPosition: string, pinColor: PinColor): number {
  let steps = 0;
  let square = LUDO_BOARD.flat().find((sq) => sq.id === currentPosition);

  while (square && square.id !== winPosition) {
    const nextId = square[pinColor] || square.next;
    if (!nextId) break; // stop if no next square
    square = LUDO_BOARD.flat().find((sq) => sq.id === nextId);
    if (!square) break; // stop if invalid square id
    steps++;
  }

  return steps;
}

export function getMovablePins(pins: Pin[], color: PinColor, roll: number) {
  return pins.filter((p) => {
    if (p.color !== color) return false;
    if (p.position === p.home && roll === 6) return true;
    const stepsToWin = calculateStepsToWin(p.position, winPosition[color], p.color);
    return roll <= stepsToWin;
  });
}

export function movePiece(pin: Pin, roll: number) {
  if (pin.position === pin.home && roll === 6) {
    pin.position = pin.openPosition;
  } else {
    for (let i = 0; i < roll; i++) {
      const currentSquare = LUDO_BOARD.flat().find((sq) => sq.id === pin.position);
      let nextSquare = LUDO_BOARD.flat().find((sq) => sq.id === currentSquare?.[pin.color]);
      if (!nextSquare) nextSquare = LUDO_BOARD.flat().find((sq) => sq.id === currentSquare?.next);
      console.log(nextSquare);
      pin.position = nextSquare?.id || pin.position;
    }
  }
}

export function handlePinCollision(pins: Pin[], pin: Pin) {
  const collidedPin = pins.find((p) => p.position === pin.position && p.color !== pin.color);
  const safeSquares = LUDO_BOARD.flat(1)
    .filter((p) => p.safe)
    .map((p) => p.id);
  if (collidedPin && !safeSquares.includes(pin.position)) {
    collidedPin.position = collidedPin.home;
  }
  return collidedPin && !safeSquares.includes(pin.position);
}

export function rollDie(gameId: string, games: any[], userId: string) {
  const game = games.find((g) => g.id === gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'playing') throw new Error("Game hasn't started or ended");
  if (!game.players.some((p: any) => p.userId === userId)) throw new Error("You're not in this game");
  if (userId !== game.options.turn) throw new Error('Not your turn');
  if (userId === game.options.rolledBy) throw new Error('You have already rolled a die');

  const roll = Math.floor(Math.random() * 6) + 1;
  game.options.rolledBy = userId;
  game.options.roll = roll;

  let playerIndex = game.players.findIndex((p: any) => p.userId === userId);
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

  return game;
}

export function ludoMove(gameId: string, pinHome: string, games: any[], userId: string) {
  const game = games.find((g) => g.id === gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'playing') throw new Error("Game hasn't started or ended");
  if (!game.players.some((p: any) => p.userId === userId)) throw new Error("You're not in this game");
  if (userId !== game.options.turn) throw new Error('Not your turn');
  if (userId !== game.options.rolledBy) throw new Error('You have not rolled a die yet');

  let playerIndex = game.players.findIndex((p: any) => p.userId === game.options.turn);

  let color: PinColor;
  if (game.players.length === 4) {
    color = ['red', 'blue', 'green', 'yellow'][playerIndex] as PinColor;
  } else {
    color = ['red', 'yellow'][playerIndex] as PinColor;
  }

  let movablePins = getMovablePins(game.options.pins, color, game.options.roll);

  let pin = movablePins.find((p) => p.home === pinHome);

  if (!pin) throw new Error("This pin can't move");

  movePiece(pin, game.options.roll);

  const collision = handlePinCollision(game.options.pins, pin);

  console.log(collision);
  if (game.options.roll === 6 || collision) {
    game.options.rolledBy = '';
  } else {
    if (playerIndex === game.maxPlayers - 1) {
      game.options.turn = game.players[0].userId;
    } else {
      game.options.turn = game.players[playerIndex + 1].userId;
    }
  }

  const winner = checkWinner(game.options.pins, game.options.winPinCount, color);

  if (winner) {
    game.status = 'ended';
    game.winner = userId;
  }

  return game;
}
