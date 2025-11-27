import { gridSize, homePaths, pins, mainPath, safeArea, startPositions, turningPoints } from '@/constants/ludo';

export function ludoMove(gameId: string, index: number, games: any[], userId: string) {
  const game = games.find((g) => g.id === gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'playing') throw new Error("Game hasn't started or ended");
  if (!game.players.some((p: any) => p.userId === userId)) throw new Error("You're not in this game");
  if (userId !== game.options.turn) throw new Error('Not your turn');
  if (userId !== game.options.rolledBy) throw new Error('You have not rolled a die yet');

  if (game.options) delete game.options.lastMove;
  // 1. Determine Player Color
  let playerIndex = game.players.findIndex((p: any) => p.userId === game.options.turn);
  let playerColor: string;

  if (game.players.length === 4) {
    playerColor = ['red', 'blue', 'green', 'yellow'][playerIndex];
  } else {
    playerColor = ['red', 'yellow'][playerIndex];
  }

  const pin: {
    id: string;
    color: 'red' | 'blue' | 'yellow' | 'green';
    state: 'base' | 'board' | 'home';
    x: number;
    y: number;
    base: { x: number; y: number };
  } = game.options.pins[index];
  const roll = game.options.roll;

  if (!pin || pin.color !== playerColor) throw new Error("This pin can't move");

  const plannedSteps: { x: number; y: number }[] = [];
  const killedPins: { id: string; to: { x: number; y: number } }[] = [];

  // 2. Handle Base Exit (Rolling a 6 to start)
  if (pin.state === 'base') {
    if (roll !== 6) throw new Error('Need a 6 to leave base');

    const startPos = startPositions[pin.color];
    pin.x = startPos.x;
    pin.y = startPos.y;
    pin.state = 'board';

    game.options.rolledBy = '';
    // Rule: Rolling a 6 gives another turn. We clear 'rolledBy' so user can roll again.
    plannedSteps.push({ x: startPos.x, y: startPos.y });
    game.options.lastMove = { index, steps: plannedSteps, killed: killedPins };
    return game;
  }

  // 3. Simulate Path Movement
  let currentX = pin.x;
  let currentY = pin.y;
  let currentState = pin.state;
  let movePossible = true;

  for (let i = 1; i <= roll; i++) {
    let nextPos = null;

    if (currentState === 'board') {
      const idx = mainPath.findIndex((p) => isSamePos(p, { x: currentX, y: currentY }));
      const turnIndex = turningPoints[pin.color];

      if (idx === turnIndex) {
        // Enter Home Stretch
        currentState = 'home';
        nextPos = homePaths[pin.color][0];
      } else {
        // Continue on Main Path (modulo handles the loop back to start of array)
        nextPos = mainPath[(idx + 1) % mainPath.length];
      }
    } else if (currentState === 'home') {
      const idx = homePaths[pin.color].findIndex((p) => isSamePos(p, { x: currentX, y: currentY }));

      // Check if move exists and doesn't overshoot the end
      if (idx !== -1 && idx + 1 < homePaths[pin.color].length) {
        nextPos = homePaths[pin.color][idx + 1];
      } else {
        // Move not possible (e.g., at end - 1, but rolled a 3)
        movePossible = false;
        break;
      }
    }

    if (nextPos) {
      currentX = nextPos.x;
      currentY = nextPos.y;
      plannedSteps.push({ x: currentX, y: currentY });
    }
  }

  // If move was invalid (overshot home), reject the move.
  if (!movePossible) {
    throw new Error('Move not possible with this die roll');
  }

  // 4. Update Pin Position
  pin.x = currentX;
  pin.y = currentY;
  pin.state = currentState;

  // 5. Collision Detection (The "Kill")
  let collision = false;

  // Check if the final position is a Safe Zone
  const isSafeZone = safeArea.some((pos) => isSamePos(pos, { x: pin.x, y: pin.y }));

  if (pin.state === 'board' && !isSafeZone) {
    game.options.pins.forEach((otherPin: any) => {
      // Logic: Different ID, Different Color, On Board, Same Position
      if (
        otherPin.id !== pin.id &&
        otherPin.color !== pin.color &&
        otherPin.state === 'board' &&
        isSamePos({ x: otherPin.x, y: otherPin.y }, { x: pin.x, y: pin.y })
      ) {
        // KILL! Send other pin to base
        otherPin.state = 'base';
        otherPin.x = otherPin.base.x;
        otherPin.y = otherPin.base.y;
        collision = true;
        killedPins.push({ id: otherPin.id, to: { x: otherPin.base.x, y: otherPin.base.y } });
      }
    });
  } 

  // 6. Check for Win (Reached End of Home Path)
  const homeArray = homePaths[pin.color];
  const lastHomePos = homeArray[homeArray.length - 1];
  const reachedEnd = pin.state === 'home' && isSamePos({ x: pin.x, y: pin.y }, lastHomePos);

  game.options.lastMove = { index, steps: plannedSteps, killed: killedPins };

  // 7. Turn Management
  // Ludo Rules:
  // 1. Roll 6 = Extra Turn
  // 2. Kill Opponent = Extra Turn
  // 3. Pin Reaches Home = Extra Turn
  if (roll === 6 || collision || reachedEnd) {
    game.options.rolledBy = ''; // Reset so the CURRENT user can roll again
  } else {
    // Switch Turn
    handleTurnSwitch(game, playerIndex);
  }

  return game;
}

const isSamePos = (pos1: { x: number; y: number }, pos2: { x: number; y: number }) => pos1.x === pos2.x && pos1.y === pos2.y;

export function rollDie(gameId: string, games: any[], userId: string) {
  const game = games.find((g) => g.id === gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'playing') throw new Error("Game hasn't started or ended");
  if (!game.players.some((p: any) => p.userId === userId)) throw new Error("You're not in this game");
  if (userId !== game.options.turn) throw new Error('Not your turn');
  if (userId === game.options.rolledBy) throw new Error('You have already rolled a die');

  // 1. Roll the Die
  const roll = Math.floor(Math.random() * 6) + 1;
  game.options.rolledBy = userId;
  game.options.roll = roll;

  // 2. Determine Player Color
  let playerIndex = game.players.findIndex((p: any) => p.userId === userId);
  let playerColor: string;
  if (game.players.length === 4) {
    playerColor = ['red', 'blue', 'green', 'yellow'][playerIndex];
  } else {
    playerColor = ['red', 'yellow'][playerIndex];
  }

  // 3. Check if ANY pin can move with this roll
  const playerPins = game.options.pins.filter((p: any) => p.color === playerColor);
  const canAnyPinMove = playerPins.some((pin: any) => canPinMove(pin, roll));

  // 4. If NO moves are possible, switch turns immediately
  if (!canAnyPinMove) {
    // Slight delay or immediate switch?
    // Usually immediate update on backend, frontend handles the "Oh no, no moves" UI notification
    handleTurnSwitch(game, playerIndex);
  }

  return game;
}

// Reuse the turn switch logic
function handleTurnSwitch(game: any, currentPlayerIndex: number) {
  let nextIndex;
  if (currentPlayerIndex === game.maxPlayers - 1) {
    nextIndex = 0;
  } else {
    nextIndex = currentPlayerIndex + 1;
  }
  game.options.turn = game.players[nextIndex].userId;
  game.options.rolledBy = '';
  // game.options.roll = 0; // Optional: keep the roll visible for a moment so they see what they failed with
}

// ------------------------------------------
// Helper: Simulation to check move validity
// ------------------------------------------
function canPinMove(
  pin: { color: 'red' | 'blue' | 'yellow' | 'green'; x: number; y: number; state: 'base' | 'board' | 'home' },
  roll: number
): boolean {
  // Case A: Pin is in Base
  if (pin.state === 'base') {
    return roll === 6; // Only movable if roll is 6
  }

  // Case B: Pin is on Board or Home - Simulate the path
  let currentX = pin.x;
  let currentY = pin.y;
  let currentState = pin.state;

  for (let i = 1; i <= roll; i++) {
    let nextPos = null;

    if (currentState === 'board') {
      const idx = mainPath.findIndex((p) => isSamePos(p, { x: currentX, y: currentY }));
      const turnIndex = turningPoints[pin.color];

      if (idx === turnIndex) {
        currentState = 'home';
        nextPos = homePaths[pin.color][0];
      } else {
        nextPos = mainPath[(idx + 1) % mainPath.length];
      }
    } else if (currentState === 'home') {
      const idx = homePaths[pin.color].findIndex((p) => isSamePos(p, { x: currentX, y: currentY }));
      if (idx !== -1 && idx + 1 < homePaths[pin.color].length) {
        nextPos = homePaths[pin.color][idx + 1];
      } else {
        // Overshot home path end
        return false;
      }
    }

    if (nextPos) {
      currentX = nextPos.x;
      currentY = nextPos.y;
    }
  }

  return true;
}
