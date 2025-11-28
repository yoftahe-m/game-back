import { gridSize, homePaths,  mainPath, safeArea, startPositions, turningPoints } from '@/constants/ludo';
import { createInitialPins } from '../constants/ludo';

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
  // killedPins now carries a steps array (tile-by-tile) used by clients for animation
  const killedPins: { id: string; steps: { x: number; y: number }[] }[] = [];

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
        // Compute tile-by-tile path from otherPin position back to its base
        let colorStartIndex = 0;
        if (otherPin.color === 'red') colorStartIndex = 0;
        else if (otherPin.color === 'blue') colorStartIndex = 13;
        else if (otherPin.color === 'yellow') colorStartIndex = 26;
        else if (otherPin.color === 'green') colorStartIndex = 39;

        const path = [...mainPath.slice(colorStartIndex), ...mainPath.slice(0, colorStartIndex)];
        const hitIndex = path.findIndex((p) => isSamePos(p, { x: otherPin.x, y: otherPin.y }));

        const killedSteps: { x: number; y: number }[] = [];
        if (hitIndex !== -1) {
          // move backwards along path to the starting slot (index 0 of this rotated path)
          for (let i = hitIndex; i >= 0; i--) {
            killedSteps.push({ x: path[i].x, y: path[i].y });
          }
        }
        // finally push base coords (off-board) so client animates off-board to base
        killedSteps.push({ x: otherPin.base.x, y: otherPin.base.y });

        // KILL! Send other pin to base (authoritative state)
        otherPin.state = 'base';
        otherPin.x = otherPin.base.x;
        otherPin.y = otherPin.base.y;
        collision = true;

        // include full steps for clients to animate correctly
        killedPins.push({ id: otherPin.id, steps: killedSteps });
      }
    });
  } 

  // 6. Check for Win (Reached End of Home Path)
  const homeArray = homePaths[pin.color];
  const lastHomePos = homeArray[homeArray.length - 1];
  const reachedEnd = pin.state === 'home' && isSamePos({ x: pin.x, y: pin.y }, lastHomePos);

  game.options.lastMove = { index, steps: plannedSteps, killed: killedPins };

  // Determine winner based on game.options.winPinCount (fallback to 4)
  const winPinCount = typeof game.options?.winPinCount === 'number' ? game.options.winPinCount : 4;
  let winner: string | null = null;

  // Map player index -> color (same logic as above)
  const colorOrder = game.players.length === 4 ? ['red', 'blue', 'green', 'yellow'] : ['red', 'yellow'];
  const colorToUserId: Record<string, string> = {};
  game.players.forEach((p: any, idx: number) => {
    colorToUserId[colorOrder[idx]] = p.userId;
  });

  // Count pins in 'home' per color and pick the first that reached winPinCount
  const homeColors = Object.keys(homePaths) as Array<keyof typeof homePaths>;
  for (const color of homeColors) {
    const homeArr = homePaths[color];
    const finalPos = homeArr[homeArr.length - 1];
    // A pin is considered "finished" only when it has reached the final home tile.
    const finishedCount = game.options.pins.filter((p: any) => p.color === color && isSamePos(p, finalPos)).length;
    if (finishedCount >= winPinCount) {
      winner = colorToUserId[color];
      break;
    }
  }

  if (winner) {
    game.status = 'ended';
    game.winner = winner;

    // Reset board to initial pin layout so clients don't keep old pin positions
    game.options.pins = createInitialPins();

    // clear turn/roll state and any transient animation payload
    game.options.turn = '';
    game.options.rolledBy = '';
    game.options.roll = 0;
    if (game.options.lastMove) delete game.options.lastMove;

    return game;
  }
  
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
