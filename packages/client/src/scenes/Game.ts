import { Scene } from "phaser";
import { Room } from "colyseus.js";
// Import the schema definitions using the new alias
import { GameState, Player, Ball } from "@server/schemas/GameState";
import { MapSchema } from "@colyseus/schema"; // Keep this import

// Define player colors
const PLAYER_COLORS = [
    0xffffff, // white
    0x00ff00, // green
    0xff0000, // red
    0x0000ff, // blue
    0x800080, // purple
    0xffc0cb, // pink
    0xa52a2a, // brown
    0x000000, // black
    0xffff00  // yellow
];
const PLAYER_RADIUS = 64; // New larger radius
const PLAYER_WIDTH = PLAYER_RADIUS * 2;
const PLAYER_HEIGHT = PLAYER_RADIUS; // Height of the semi-circle
const BALL_RADIUS = 16; // Add ball radius constant for client-side drawing

export class Game extends Scene {
    private client!: Room<GameState>; // Use the GameState type
    // Explicitly type player entities and ball sprite as Arcade Sprites
    private playerEntities: Map<string, { sprite: Phaser.Physics.Arcade.Sprite, serverX: number, serverY: number }> = new Map();
    private ballSprite: Phaser.Physics.Arcade.Sprite | null = null;
    private scoreText: Phaser.GameObjects.Text | null = null;
    private gameOverText: Phaser.GameObjects.Text | null = null;
    private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
    private wasdKeys: { W: Phaser.Input.Keyboard.Key, A: Phaser.Input.Keyboard.Key, S: Phaser.Input.Keyboard.Key, D: Phaser.Input.Keyboard.Key } | null = null;
    private spaceKey: Phaser.Input.Keyboard.Key | null = null;
    private currentState: GameState | null = null; // To store the latest state
    private playerListenersAttached = false; // Flag to ensure listeners are attached only once

    // Debugging graphics
    private debugGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map(); // For players
    private ballDebugGraphic: Phaser.GameObjects.Graphics | null = null;

    constructor() {
        super({ key: "Game" });
    }

    // Update init method to expect 'room' in the data object
    init(data: { room: Room<GameState> }) {
        // Assign the passed room object to this.client
        this.client = data.room;
        if (!this.client) {
            console.error("Game scene initialized without a valid Colyseus room object!");
            // Handle error appropriately, maybe return to main menu
            this.scene.start("MainMenu");
        }
        // Reset flag on init
        this.playerListenersAttached = false;
    }

    preload() {
        // Load assets needed for the game
        // REMOVED: this.load.image('player', 'assets/alien.png'); // Placeholder player asset
        this.load.image('ball', 'assets/smile.png');   // Placeholder ball asset
        this.load.image('background', 'assets/bg.png'); // Example background
    }

    create() {
        // Add background image
        this.add.image(this.cameras.main.centerX, this.cameras.main.centerY, 'background');

        // Initialize keyboard controls
        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
            this.wasdKeys = {
                W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
                A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
                S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
                D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            };
            this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        } else {
            console.warn("Keyboard input not available.");
        }

        // Create score text
        this.scoreText = this.add.text(this.cameras.main.centerX, 50, "Score: 0 - 0", {
            fontFamily: "Arial Black",
            fontSize: 38,
            color: "#ffffff",
            stroke: '#000000',
            strokeThickness: 8,
        }).setOrigin(0.5);

        // Create Game Over text (initially hidden)
        this.gameOverText = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, "Game Over!", {
            fontFamily: "Arial Black",
            fontSize: 64,
            color: "#ff0000",
            stroke: '#000000',
            strokeThickness: 8,
        }).setOrigin(0.5).setVisible(false);

        if (!this.client) {
            console.error("Cannot proceed, client is not initialized.");
            this.scene.start("MainMenu"); // Go back if client is missing
            return;
        }

        // --- Colyseus State Synchronization ---

        // Use the standard onStateChange and a flag to handle initial setup
        this.client.onStateChange((state) => {
            this.currentState = state; // Always update the current state reference

            // --- Attach Listeners Once --- 
            // Check if listeners are not attached AND if state.players looks like a MapSchema
            if (!this.playerListenersAttached && state.players) {

                // Check specifically for onAdd function before proceeding
                if (typeof (state.players as any).onAdd === 'function') {
                    const playersMap = state.players as MapSchema<Player>; // Cast back for type safety

                    // Wrap listener attachments in try...catch for extra safety
                    try {
                        // Listen for new players joining
                        playersMap.onAdd((player, sessionId) => {
                            // Pass the scene context (this) to the function
                            this.addPlayerSprite(player, sessionId, this); // Pass scene context

                            // Listen for changes on this specific player instance
                            player.onChange(() => {
                                const entityData = this.playerEntities.get(sessionId);
                                if (entityData && player.position) {
                                    // Store the server's authoritative position
                                    entityData.serverX = player.position.x;
                                    entityData.serverY = player.position.y;
                                    // REMOVED: entity.setPosition(player.position.x, player.position.y);
                                }
                                this.updateScoreDisplay();
                            });
                        }, true);

                        // Check for onRemove as well before attaching
                        if (typeof playersMap.onRemove === 'function') {
                            playersMap.onRemove((_player, sessionId) => { // Use _player as it's unused
                                const entityData = this.playerEntities.get(sessionId);
                                if (entityData) {
                                    entityData.sprite.destroy(); // Destroy the sprite
                                    this.playerEntities.delete(sessionId);
                                }
                                // Remove debug graphic
                                const debugGraphic = this.debugGraphics.get(sessionId);
                                if (debugGraphic) {
                                    debugGraphic.destroy();
                                    this.debugGraphics.delete(sessionId);
                                }
                                this.updateScoreDisplay();
                            });
                        } else {
                            console.error("state.players has onAdd but NOT onRemove!", playersMap);
                        }

                        // Add listeners for the ball
                        // Modify the check: Rely primarily on the presence of onChange
                        if (state.ball && typeof (state.ball as any).onChange === 'function') {
                            // Cast to Ball for type safety within the callback, assuming structure is correct
                            const ballSchema = state.ball as Ball; 
                            ballSchema.onChange(() => {
                                this.updateBallSprite(ballSchema);
                            });
                            // Process initial ball state immediately after attaching listener
                            this.updateBallSprite(ballSchema);
                        } else {
                             console.warn("Initial state.ball is null, undefined, or lacks onChange function:", state.ball);
                        }

                        this.playerListenersAttached = true; // Mark listeners as attached

                        // Initial UI updates
                        this.updateScoreDisplay();
                        this.updateGameOverDisplay(state);

                    } catch (attachError) {
                        console.error("Error attaching MapSchema listeners:", attachError);
                        // Avoid setting playerListenersAttached to true if an error occurred
                    }

                } else {
                    // Log if onAdd is still not a function
                    console.warn(`Listeners not attached because state.players.onAdd is still type: ${typeof (state.players as any).onAdd}`);
                }
            } else if (this.playerListenersAttached) {
                // --- Subsequent State Updates ---
                // Listeners are attached, just update UI based on the new state
                // Player/Ball positions are handled by their respective onChange listeners

                // Update score and game over display based on the latest state
                this.updateScoreDisplay();
                this.updateGameOverDisplay(state);

            } else if (!this.playerListenersAttached) {
                 // Log why the listeners weren't attached
                 if (!state.players) {
                    console.warn("Listeners not attached because state.players is null or undefined.");
                 } else {
                    // This path is taken if the outer if failed but it wasn't due to !state.players
                    console.warn(`Listeners not attached, state.players exists but initial check failed.`);
                 }
            }
        });

        // Update debug graphics positions
        this.updateDebugGraphics();

        // --- Server Message Handlers ---
        this.client.onMessage("scoreUpdate", (message: { scores: number[] }) => {
            // State change should handle the display update, but force it just in case
             this.updateScoreDisplay();
        });

        this.client.onMessage("gameOver", (message: { winnerSessionId: string | null }) => {
            // State change should handle the display update
        });

         // Request initial state explicitly if needed (sometimes helpful, but onStateChange should cover it)
         // this.client.send("requestInitialState");
    }

    // Helper function to add/update player sprite
    // Add scene parameter
    addPlayerSprite(player: Player, sessionId: string, scene: Scene) {
        const startX = player.position?.x ?? scene.cameras.main.centerX;
        const startY = player.position?.y ?? scene.cameras.main.centerY;
        let entityData = this.playerEntities.get(sessionId);
        let debugGraphic = this.debugGraphics.get(sessionId);

        if (!entityData) {
            // --- Dynamic Texture Generation ---
            const randomColor = Phaser.Math.RND.pick(PLAYER_COLORS);
            const textureKey = `playerSemiCircle_${randomColor.toString(16)}`;

            // Generate texture only if it doesn't exist
            if (!scene.textures.exists(textureKey)) {
                // Corrected: Removed the invalid 'add: false' property
                const graphics = scene.make.graphics({ x: 0, y: 0 });
                graphics.fillStyle(randomColor);
                // Draw the semi-circle (top half)
                graphics.beginPath();
                // Centered within the texture dimensions
                graphics.arc(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_RADIUS, Math.PI, 0, false);
                graphics.closePath();
                graphics.fillPath();
                // Generate texture with the specific key
                graphics.generateTexture(textureKey, PLAYER_WIDTH, PLAYER_HEIGHT);
                graphics.destroy();
            }
            // --- End Texture Generation ---

            // Use the dynamically generated texture key
            const sprite = scene.physics.add.sprite(startX, startY, textureKey);
            sprite.setCollideWorldBounds(true);

            // Set physics body size - Match the visual semi-circle
            // Width is full width, Height is just the radius
            sprite.body?.setSize(PLAYER_WIDTH, PLAYER_RADIUS);
            // Set the offset: Since the arc is in the top half of the texture,
            // and the body is now PLAYER_RADIUS high, set the Y offset to 0
            // to align the body's top with the sprite's top.
            sprite.body?.setOffset(0, 0);

            // Store sprite and initial server position
            entityData = { sprite: sprite, serverX: startX, serverY: startY };
            this.playerEntities.set(sessionId, entityData);
        } else {
            // Update sprite position and server position if entity already exists
            // No need to change texture or color here, it's set on creation
            entityData.sprite.setPosition(startX, startY);
            entityData.serverX = startX;
            entityData.serverY = startY;
        }

        // Create or update debug graphic for player
        if (!debugGraphic) {
            debugGraphic = this.add.graphics();
            this.debugGraphics.set(sessionId, debugGraphic);
        }
        this.updateDebugGraphics(); // Update visibility and position
    }

    // Helper function to update ball sprite
    updateBallSprite(ballState: Ball | null) {
        if (ballState && ballState.position) {
            if (!this.ballSprite) {
                this.ballSprite = this.physics.add.sprite(ballState.position.x, ballState.position.y, 'ball');
                this.ballSprite.setCollideWorldBounds(true);
                this.ballSprite.setBounce(0.6);

                // Create debug graphic for ball
                if (!this.ballDebugGraphic) {
                    this.ballDebugGraphic = this.add.graphics();
                }
            } else {
                this.ballSprite.setPosition(ballState.position.x, ballState.position.y);
                // Optionally update velocity if needed for prediction/smoothing
                // if (ballState.velocity && this.ballSprite.body) {
                //     this.ballSprite.setVelocity(ballState.velocity.x, ballState.velocity.y);
                // }
            }
        } else if (this.ballSprite) {
            this.ballSprite.destroy();
            this.ballSprite = null;
            // Destroy ball debug graphic
            if (this.ballDebugGraphic) {
                this.ballDebugGraphic.destroy();
                this.ballDebugGraphic = null;
            }
        }
        this.updateDebugGraphics(); // Update visibility and position
    }

    // Helper function to update Game Over display
    updateGameOverDisplay(state: GameState) {
        if (!this.gameOverText) return;

        if (state.phase === "gameOver") {
            let winnerText = "Game Over!\nDraw!";
            if (state.winnerSessionId && state.players.has(state.winnerSessionId)) {
                const winner = state.players.get(state.winnerSessionId);
                const winnerIndex = winner ? winner.playerIndex : -1;
                if (winnerIndex !== -1) {
                    winnerText = `Game Over!\nPlayer ${winnerIndex + 1} Wins!`;
                }
            } else if (state.winnerSessionId) {
                 winnerText = `Game Over!\nWinner ID ${state.winnerSessionId} not found in players map.`;
            }
            this.gameOverText.setText(winnerText).setVisible(true);
        } else {
            this.gameOverText.setVisible(false);
        }
    }

    update(time: number, delta: number) { 
        if (!this.client || !this.currentState) { // Removed phase check here, interpolation should run even if not playing
            return; 
        }

        const inputPayload = { left: false, right: false, jump: false }; // Default input

        // Only process input and send if playing
        if (this.currentState.phase === "playing") {
            // Check input state
            const isLeftDown = (this.cursors?.left.isDown || this.wasdKeys?.A.isDown) ?? false;
            const isRightDown = (this.cursors?.right.isDown || this.wasdKeys?.D.isDown) ?? false;
            const isJumpDown = (this.cursors?.up.isDown || this.wasdKeys?.W.isDown || this.spaceKey?.isDown) ?? false;

            inputPayload.left = isLeftDown;
            inputPayload.right = isRightDown;
            inputPayload.jump = isJumpDown;

            // Send input to the server
            this.client.send("input", inputPayload);
        }

        // Interpolation and Client-side prediction logic
        this.playerEntities.forEach((entityData, sessionId) => {
            const { sprite, serverX, serverY } = entityData;
            const isLocalPlayer = sessionId === this.client.sessionId;

            if (isLocalPlayer && this.currentState?.phase === "playing") {
                // --- Client-side prediction for the local player ---
                // Apply velocity based on input, let Phaser physics move the sprite
                if (sprite.body) { 
                    const speed = 300; 
                    if (inputPayload.left) {
                        sprite.setVelocityX(-speed);
                    } else if (inputPayload.right) {
                        sprite.setVelocityX(speed);
                    } else {
                        sprite.setVelocityX(0);
                    }
                    
                    const approxGroundY = this.currentState?.fieldHeight ? this.currentState.fieldHeight - PLAYER_RADIUS : 720 - PLAYER_RADIUS; 
                    // Check server position for ground check
                    if (inputPayload.jump && Math.abs(serverY - approxGroundY) < 5) { 
                        // Check if sprite physics body is blocked below or nearly still vertically
                        if (sprite.body.blocked.down || Math.abs(sprite.body.velocity.y) < 5) {
                             const jumpVelocity = -250; 
                             sprite.setVelocityY(jumpVelocity);
                        }
                    }
                }
                // --- Reconciliation (REMOVED direct interpolation) --- 
                // We are now relying on the server sending updates to correct the position implicitly.
                // A more advanced reconciliation could snap position if error > threshold, 
                // but let's start by removing the lerp for the local player.
                // REMOVED: sprite.x = Phaser.Math.Linear(sprite.x, serverX, lerpFactor);
                // REMOVED: sprite.y = Phaser.Math.Linear(sprite.y, serverY, lerpFactor);

            } else if (!isLocalPlayer) {
                // --- Interpolation for remote players ---
                // Smoothly move remote players to their latest known server position
                const lerpFactor = 0.25; 
                sprite.x = Phaser.Math.Linear(sprite.x, serverX, lerpFactor);
                sprite.y = Phaser.Math.Linear(sprite.y, serverY, lerpFactor);
            }
            // Sprites will hold their last position if not local and not playing
            else if (isLocalPlayer && this.currentState?.phase !== "playing") {
                 // Optionally stop local player movement instantly when not playing
                 if (sprite.body) {
                    sprite.setVelocity(0, 0);
                 }
                 // Interpolate to final server position even when not playing
                 const lerpFactor = 0.2; 
                 sprite.x = Phaser.Math.Linear(sprite.x, serverX, lerpFactor);
                 sprite.y = Phaser.Math.Linear(sprite.y, serverY, lerpFactor);
            }
        });

        // Interpolate ball position (keep this)
        if (this.ballSprite && this.currentState?.ball?.position) {
            const lerpFactor = 0.3; 
            this.ballSprite.x = Phaser.Math.Linear(this.ballSprite.x, this.currentState.ball.position.x, lerpFactor);
            this.ballSprite.y = Phaser.Math.Linear(this.ballSprite.y, this.currentState.ball.position.y, lerpFactor);
        }
    }

    // Helper to update score text based on current state
    updateScoreDisplay() {
        if (!this.scoreText || !this.currentState) return;

        let scoreP0 = 0;
        let scoreP1 = 0;

        // Iterate through the players MapSchema to find scores
        this.currentState.players.forEach(player => {
            if (player.playerIndex === 0) {
                scoreP0 = player.score;
            } else if (player.playerIndex === 1) {
                scoreP1 = player.score;
            }
        });

        this.scoreText.setText(`Score: ${scoreP0} - ${scoreP1}`);
    }

    // Helper function to draw/update debug hitboxes
    updateDebugGraphics() {
        const showDebug = this.currentState?.debugHitboxes ?? false;

        // Player hitboxes
        this.playerEntities.forEach((entityData, sessionId) => {
            const debugGraphic = this.debugGraphics.get(sessionId);
            if (debugGraphic) {
                debugGraphic.clear();
                if (showDebug) {
                    debugGraphic.lineStyle(2, 0xff00ff, 0.7); // Magenta outline
                    // Draw rectangle matching the physics body (adjust if offset was used)
                    // Assuming body is centered on the sprite's position
                    const sprite = entityData.sprite;
                    const bodyWidth = PLAYER_WIDTH;
                    const bodyHeight = PLAYER_HEIGHT;
                    debugGraphic.strokeRect(
                        sprite.x - bodyWidth / 2,
                        sprite.y - bodyHeight / 2, // Adjust if body offset is not centered
                        bodyWidth,
                        bodyHeight
                    );
                    debugGraphic.setVisible(true);
                } else {
                    debugGraphic.setVisible(false);
                }
            }
        });

        // Ball hitbox
        if (this.ballDebugGraphic && this.ballSprite) {
            this.ballDebugGraphic.clear();
            if (showDebug) {
                this.ballDebugGraphic.lineStyle(2, 0x00ffff, 0.7); // Cyan outline
                this.ballDebugGraphic.strokeCircle(this.ballSprite.x, this.ballSprite.y, BALL_RADIUS);
                this.ballDebugGraphic.setVisible(true);
            } else {
                this.ballDebugGraphic.setVisible(false);
            }
        }
    }

    // Cleanup on scene shutdown
    shutdown() {
        if (this.client) {
            // Remove all listeners associated with this room instance
             this.client.removeAllListeners(); 
        }
        // Destroy sprites and text objects
        this.playerEntities.forEach(entityData => entityData.sprite.destroy()); // Access sprite property
        this.playerEntities.clear();
        if (this.ballSprite) this.ballSprite.destroy();
        if (this.scoreText) this.scoreText.destroy();
        if (this.gameOverText) this.gameOverText.destroy();

        // Destroy debug graphics
        this.debugGraphics.forEach(graphic => graphic.destroy());
        this.debugGraphics.clear();
        if (this.ballDebugGraphic) this.ballDebugGraphic.destroy();

        this.ballSprite = null;
        this.scoreText = null;
        this.gameOverText = null;
        this.ballDebugGraphic = null;
        this.currentState = null;
        this.cursors = null;
        // Reset flag in case scene restarts without full re-initialization elsewhere
        this.playerListenersAttached = false; 
    }
}
