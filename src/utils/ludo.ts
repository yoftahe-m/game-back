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
