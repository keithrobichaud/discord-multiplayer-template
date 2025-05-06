import { Schema, MapSchema, type } from "@colyseus/schema";

// Define a simple Vector2 schema for positions and velocities
class Vector2 extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
}

// Define the Player schema
export class Player extends Schema { // Add export keyword
  @type("string") sessionId: string = ""; // Initialize with default value
  @type("number") playerIndex: number = -1; // Initialize with default value
  @type(Vector2) position = new Vector2();
  @type(Vector2) velocity = new Vector2(); // Server will manage velocity
  @type("number") score: number = 0;

  // Add input state if needed, e.g., for jumping or moving
  @type("boolean") inputLeft: boolean = false;
  @type("boolean") inputRight: boolean = false;
  @type("boolean") inputJump: boolean = false;
}

// Define the Ball schema
export class Ball extends Schema { // Add export keyword
  @type(Vector2) position = new Vector2();
  @type(Vector2) velocity = new Vector2();
}

// Define the main GameState schema
export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type(Ball) ball = new Ball();
  @type("string") phase: string = "waiting"; // e.g., "waiting", "playing", "gameOver"
  @type("string") winnerSessionId: string | null = null; // Track winner at game over

  // Define game area boundaries (adjust as needed)
  @type("number") fieldWidth: number = 1280;
  @type("number") fieldHeight: number = 720;
  @type("number") goalWidth: number = 100; // Width of the goal area
  @type("number") goalHeight: number = 200; // Height of the goal posts

  // Game constants
  @type("number") maxScore: number = 3;

  // Debugging
  @type("boolean") debugHitboxes: boolean = false; // Toggle for showing hitboxes
}
