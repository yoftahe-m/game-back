export const TICK_RATE = 30; // 30 updates per second
export const GRAVITY = 0.5;
export const JUMP_VELOCITY = -8;
export const SCREEN_HEIGHT = 800; // Server's "view" of the game height
export const SCREEN_WIDTH = 400; // Server's "view" of the game width

// --- NEW Player Constants ---
export const BIRD_HEIGHT = 30;
export const BIRD_WIDTH = 30;

// --- NEW Pipe Constants ---
export const PIPE_WIDTH = 60;
export const PIPE_GAP = 200; // Space between top and bottom pipe
export const PIPE_SPEED = 3; // How fast pipes move left
export const PIPE_SPAWN_INTERVAL = 90; // Spawn a new pipe every 90 ticks (3 seconds)