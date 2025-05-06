import { Room, Client } from "@colyseus/core"; // Use @colyseus/core
import { GameState, Player, Ball } from "../schemas/GameState"; // Import new schemas

// Constants for physics simulation (adjust as needed)
const GRAVITY = 1.2; // Increased gravity
const PLAYER_MOVE_SPEED = 5;
const PLAYER_JUMP_FORCE = 10;
const BALL_KICK_FORCE = 8;
const FRICTION = 0.98; // Air/ground friction
const BOUNCE_FACTOR = 0.9; // How much velocity is retained on bounce - Increased for bouncier ball
const PLAYER_RADIUS = 64; // Approximate radius for collision - UPDATED
const BALL_RADIUS = 16;  // Approximate radius for collision
const PLAYER_GROUND_FRICTION = 0.9; // Friction when player is on the ground
const BALL_GROUND_FRICTION = 0.95;  // Friction for the ball on the ground
const BALL_AIR_FRICTION = 0.99;     // Air resistance for the ball

export class GameRoom extends Room<GameState> {
  // Remove old state initialization and screenWidth/Height properties
  // state = new GameState(); // This will be set in onCreate
  maxClients = 2; // Slime soccer is 1v1
  // private screenWidth: number = 1280; // Removed
  // private screenHeight: number = 720; // Removed

  onCreate(options: any) {
    this.setState(new GameState()); // Initialize the new GameState

    // Initialize Ball position (center field) using state properties
    this.state.ball.position.x = this.state.fieldWidth / 2;
    this.state.ball.position.y = this.state.fieldHeight / 2;

    // Set up the game loop for physics simulation
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));

    // Register message handlers for player input
    this.onMessage("input", (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (player && this.state.phase === 'playing') { // Only process input if playing
        player.inputLeft = message.left ?? player.inputLeft;
        player.inputRight = message.right ?? player.inputRight;
        // Process jump immediately for responsiveness, but server validates/limits
        // REMOVED ground check: && player.position.y >= this.state.fieldHeight - PLAYER_RADIUS
        if (message.jump) {
             player.inputJump = true; // Set flag for update loop to handle jump logic
        }
        // No need to explicitly set to false here, update loop consumes it
        // else if (!message.jump) {
        //      player.inputJump = false;
        // }
      }
    });

    // Remove generic message handler if not needed, or keep for debugging
    // this.onMessage("*", (client, type, message) => { ... });
  }

  onJoin(client: Client, options: any) { // Add options back if needed

    // Prevent joining if game is full or already started/over
    if (this.state.players.size >= this.maxClients || this.state.phase !== "waiting") {
        client.leave(); // Reject the client
        return;
    }

    const playerIndex = this.state.players.size;
    const player = new Player();
    player.sessionId = client.sessionId;
    player.playerIndex = playerIndex;

    // Assign starting positions (adjust as needed)
    if (playerIndex === 0) {
      player.position.x = this.state.fieldWidth * 0.25;
    } else {
      player.position.x = this.state.fieldWidth * 0.75;
    }
    player.position.y = this.state.fieldHeight - PLAYER_RADIUS; // Start on the ground

    this.state.players.set(client.sessionId, player);


    // Start the game immediately when the first player joins (for testing)
    if (this.state.players.size >= 1 && this.state.phase === "waiting") { // Check phase to avoid restarting
      this.state.phase = "playing";
      this.resetPositions(); // Ensure players/ball are in correct start spots
      // Optionally lock if you don't want more players after starting
      // this.lock(); 
    }
    // Original logic for 2 players (can be kept or removed for single-player focus)
    // else if (this.state.players.size === this.maxClients) {
    //   this.state.phase = "playing";
    //   this.resetPositions(); 
    //   this.lock();
    // }
  }

  onLeave(client: Client, consented: boolean) { // Add consented param
    const player = this.state.players.get(client.sessionId);
    if (player) {
      this.state.players.delete(client.sessionId);

      // If a player leaves during the game, end it prematurely
      if (this.state.phase === "playing" && this.state.players.size < this.maxClients) {
          this.state.phase = "gameOver";
          // Assign winner if needed, or just end
          // Optionally declare the remaining player the winner
          if (this.state.players.size === 1) {
             const winner = Array.from(this.state.players.values())[0];
             this.state.winnerSessionId = winner.sessionId;
          }
          // Unlock the room if it was locked? Or keep it closed?
          // this.unlock();
      } else if (this.state.phase === "waiting" && this.state.players.size < this.maxClients) {
          // Reset if waiting and player leaves
          this.state.phase = "waiting";
          // Unlock if it was locked prematurely (shouldn't happen in waiting phase)
          // this.unlock();
      }
    }
     // Allow new players if one leaves before game over? Or handle differently?
     // For now, the game ends. Consider logic for allowing rejoins or new players.
  }

   onDispose() {
   }

  // Core game loop for physics and logic
  update(deltaTime: number) {
    // Optional: Clamp deltaTime to prevent physics explosions if server lags
    deltaTime = Math.min(deltaTime, 50); // e.g., max 50ms step

    if (this.state.phase !== "playing") {
      return; // Don't simulate if not playing
    }

    const timeFactor = deltaTime / 16.67; // Factor to adjust physics constants for deltaTime

    // --- Player Physics ---
    this.state.players.forEach((player) => {
      const oldX = player.position.x;
      const oldVelX = player.velocity.x;

      // Horizontal Movement
      let targetVelX = 0;
      if (player.inputLeft) {
        targetVelX -= PLAYER_MOVE_SPEED;
      }
      if (player.inputRight) {
        targetVelX += PLAYER_MOVE_SPEED;
      }
      // Apply horizontal velocity directly - could use acceleration later
      player.velocity.x = targetVelX;
      player.position.x += player.velocity.x * (deltaTime / 16.67); // Adjust for deltaTime

      // Vertical Movement (Gravity and Jump)
      player.velocity.y += GRAVITY * (deltaTime / 16.67); // Apply gravity adjusted for deltaTime

      // Jumping (only if on the ground)
      const groundY = this.state.fieldHeight - PLAYER_RADIUS; // Simple ground check
      if (player.inputJump && player.position.y >= groundY - 1) { // Allow slight tolerance for ground check
        player.velocity.y = -PLAYER_JUMP_FORCE;
        player.inputJump = false; // Consume jump input
      }

      // Apply vertical velocity
      player.position.y += player.velocity.y * (deltaTime / 16.67); // Adjust for deltaTime

      // Collision with Ground
      if (player.position.y > groundY) {
        player.position.y = groundY;
        player.velocity.y = 0;
        // Apply ground friction when on the ground and not actively moving
        if (player.velocity.x !== 0 && !player.inputLeft && !player.inputRight) {
             player.velocity.x *= Math.pow(PLAYER_GROUND_FRICTION, timeFactor);
             // Stop horizontal movement if velocity is very small
             if (Math.abs(player.velocity.x) < 0.1) {
                 player.velocity.x = 0;
             }
        }
      }

      // Collision with Walls (Left/Right)
      if (player.position.x < PLAYER_RADIUS) {
        player.position.x = PLAYER_RADIUS;
        player.velocity.x = 0;
      } else if (player.position.x > this.state.fieldWidth - PLAYER_RADIUS) {
        player.position.x = this.state.fieldWidth - PLAYER_RADIUS;
        player.velocity.x = 0;
      }
       // Collision with Ceiling (optional)
       if (player.position.y < PLAYER_RADIUS) {
           player.position.y = PLAYER_RADIUS;
           // Dampen ceiling bounce more realistically
           if (player.velocity.y < 0) { // Only reverse if moving upwards
               player.velocity.y *= -BOUNCE_FACTOR * 0.3;
           }
       }
    });

    // --- Ball Physics ---
    const ball = this.state.ball;
    const groundYBall = this.state.fieldHeight - BALL_RADIUS;

    // Apply Gravity
    ball.velocity.y += GRAVITY * timeFactor;

    // Apply Friction (different for ground and air)
    if (ball.position.y >= groundYBall - 1) { // Check if on or very near ground
        ball.velocity.x *= Math.pow(BALL_GROUND_FRICTION, timeFactor);
        // Also apply friction to vertical velocity if bouncing low on ground
        if (Math.abs(ball.velocity.y) < 1) { // Reduce jittery bouncing
             ball.velocity.y *= Math.pow(BALL_GROUND_FRICTION, timeFactor);
        }
    } else {
        // Apply Air Friction
        ball.velocity.x *= Math.pow(BALL_AIR_FRICTION, timeFactor);
        ball.velocity.y *= Math.pow(BALL_AIR_FRICTION, timeFactor);
    }

    // Stop velocities if very small to prevent endless sliding/drifting
    if (Math.abs(ball.velocity.x) < 0.1) ball.velocity.x = 0;
    if (Math.abs(ball.velocity.y) < 0.1 && ball.position.y >= groundYBall - 1) ball.velocity.y = 0;

    // Apply Velocity
    ball.position.x += ball.velocity.x * timeFactor;
    ball.position.y += ball.velocity.y * timeFactor;

    // Collision with Ground
    if (ball.position.y > groundYBall) {
      ball.position.y = groundYBall;
      // Bounce only if moving downwards significantly
      if (ball.velocity.y > 1) {
          ball.velocity.y *= -BOUNCE_FACTOR;
      } else {
          ball.velocity.y = 0; // Stop bouncing if velocity is low
      }
      // Apply ground friction effect more strongly
      ball.velocity.x *= Math.pow(0.9, timeFactor);
    }

    // Collision with Walls (Left/Right)
    if (ball.position.x < BALL_RADIUS) {
      ball.position.x = BALL_RADIUS;
      ball.velocity.x *= -BOUNCE_FACTOR;
    } else if (ball.position.x > this.state.fieldWidth - BALL_RADIUS) {
      ball.position.x = this.state.fieldWidth - BALL_RADIUS;
      ball.velocity.x *= -BOUNCE_FACTOR;
    }

    // Collision with Ceiling
    if (ball.position.y < BALL_RADIUS) {
      ball.position.y = BALL_RADIUS;
       if (ball.velocity.y < 0) { // Only bounce if moving up
          ball.velocity.y *= -BOUNCE_FACTOR;
       }
    }

    // --- Player-Ball Collision ---
    this.state.players.forEach((player) => {
      const dx = ball.position.x - player.position.x;
      const dy = ball.position.y - player.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = PLAYER_RADIUS + BALL_RADIUS;

      if (distance < minDistance) {
        // Collision occurred
        const angle = Math.atan2(dy, dx);
        const overlap = minDistance - distance;

        // More realistic separation based on overlap
        const separationFactor = 0.5; // How much to separate per step
        const separationX = Math.cos(angle) * overlap * separationFactor;
        const separationY = Math.sin(angle) * overlap * separationFactor;

        // Move ball away from player
        ball.position.x += separationX;
        ball.position.y += separationY;
        // Optionally move player slightly too, or anchor player
        // player.position.x -= separationX * 0.1;
        // player.position.y -= separationY * 0.1;


        // Apply kick/bounce force to the ball
        // Calculate relative velocity (optional, for more complex physics)
        // const relVelX = ball.velocity.x - player.velocity.x;
        // const relVelY = ball.velocity.y - player.velocity.y;

        // Simple kick based on collision angle and player velocity influence
        const kickAngle = Math.atan2(dy, dx); // Angle from player to ball
        const kickMagnitude = BALL_KICK_FORCE + Math.hypot(player.velocity.x, player.velocity.y) * 0.2; // Stronger kick if player moving fast

        ball.velocity.x = Math.cos(kickAngle) * kickMagnitude + player.velocity.x * 0.4; // Add player velocity influence
        ball.velocity.y = Math.sin(kickAngle) * kickMagnitude + player.velocity.y * 0.3; // Add player velocity influence

         // Dampen player velocity slightly on hit (optional)
         // player.velocity.x *= 0.98;
         // player.velocity.y *= 0.98;
      }
    });

    // --- Goal Detection ---
    const goalYMin = this.state.fieldHeight - this.state.goalHeight; // Top of the goal net
    const goalYMax = this.state.fieldHeight; // Bottom of the goal net (ground)

    // Left Goal (Player 1 scores) - Check if ball CENTER crosses the goal line plane
    const leftGoalLine = 0; // Goal line is at x=0
    if (ball.position.x - BALL_RADIUS < leftGoalLine && // Ball edge crossed line
        ball.position.y > goalYMin &&
        ball.position.y < goalYMax &&
        ball.velocity.x < 0) { // Ensure ball is moving into the goal
           this.scoreGoal(1); // Player 1 (index 1) scores
           return; // Stop update for this frame after scoring
    }

    // Right Goal (Player 0 scores) - Check if ball CENTER crosses the goal line plane
    const rightGoalLine = this.state.fieldWidth; // Goal line is at x=fieldWidth
     if (ball.position.x + BALL_RADIUS > rightGoalLine && // Ball edge crossed line
         ball.position.y > goalYMin &&
         ball.position.y < goalYMax &&
         ball.velocity.x > 0) { // Ensure ball is moving into the goal
           this.scoreGoal(0); // Player 0 (index 0) scores
           return; // Stop update for this frame after scoring
     }

    // --- Limit Velocities (optional but good practice) ---
    const maxPlayerVel = 15;
    const maxBallVel = 25;
    this.state.players.forEach(p => {
        p.velocity.x = Math.max(-maxPlayerVel, Math.min(maxPlayerVel, p.velocity.x));
        p.velocity.y = Math.max(-maxPlayerVel * 1.5, Math.min(maxPlayerVel * 1.5, p.velocity.y)); // Allow higher jump/fall speed
    });
     ball.velocity.x = Math.max(-maxBallVel, Math.min(maxBallVel, ball.velocity.x));
     ball.velocity.y = Math.max(-maxBallVel, Math.min(maxBallVel, ball.velocity.y));


    // --- Check Win Condition ---
    // Moved inside scoreGoal for immediate check after score potentially changes state
  }

  // Helper function to handle scoring and reset positions
  scoreGoal(scoringPlayerIndex: number) {
    // Find the player who scored (the one whose goal the ball DIDN'T go into)
    const playerWhoScored = Array.from(this.state.players.values()).find(p => p.playerIndex === scoringPlayerIndex);

    if (playerWhoScored && this.state.phase === "playing") { // Ensure game is still playing
        playerWhoScored.score++;

        // Check for win immediately after scoring
        if (playerWhoScored.score >= this.state.maxScore) {
             this.state.phase = "gameOver";
             this.state.winnerSessionId = playerWhoScored.sessionId;
             // Don't reset positions if game is over, let clients show final state briefly
             // Maybe broadcast a specific game over message with winner details
             this.broadcast("gameOver", { winnerSessionId: this.state.winnerSessionId });
             // Consider adding a delay before potentially disposing the room or allowing restart
             // setTimeout(() => this.disconnect(), 10000); // Example: disconnect after 10s
             return; // Exit function early as game is over
        }

        // Reset positions after a goal if game is not over
        this.resetPositions();
        // Optionally broadcast a "score" event
        this.broadcast("scoreUpdate", { scores: [this.getPlayerScore(0), this.getPlayerScore(1)] });


    } else if (!playerWhoScored) {
        console.error("Scoring player not found for index:", scoringPlayerIndex);
    }
     // else: Goal scored but game wasn't in 'playing' state (e.g., race condition), ignore.
  }

  // Helper to get score safely
  getPlayerScore(playerIndex: number): number {
      const player = Array.from(this.state.players.values()).find(p => p.playerIndex === playerIndex);
      return player ? player.score : 0;
  }


  // Helper function to reset player and ball positions (e.g., after a goal)
  resetPositions() {
    // Reset Ball to center, slight offset vertically?
    this.state.ball.position.x = this.state.fieldWidth / 2;
    this.state.ball.position.y = this.state.fieldHeight / 3; // Start higher?
    this.state.ball.velocity.x = 0;
    this.state.ball.velocity.y = 0;

    // Reset Players to starting sides
    this.state.players.forEach((player) => {
      if (player.playerIndex === 0) {
        player.position.x = this.state.fieldWidth * 0.25;
      } else {
        player.position.x = this.state.fieldWidth * 0.75;
      }
      player.position.y = this.state.fieldHeight - PLAYER_RADIUS; // Place on ground
      player.velocity.x = 0;
      player.velocity.y = 0;
      // Reset input state as well
      player.inputLeft = false;
      player.inputRight = false;
      player.inputJump = false;
    });

    // Add a brief pause or countdown? For now, instant reset.
    // Could change phase briefly:
    // this.state.phase = "scored";
    // this.broadcast("scored", { /* scorer info */ });
    // setTimeout(() => {
    //     if (this.state.phase === "scored") { // Check if state hasn't changed (e.g. game over)
    //         this.state.phase = "playing";
    //     }
    // }, 1500); // Example 1.5 second delay
  }
}
