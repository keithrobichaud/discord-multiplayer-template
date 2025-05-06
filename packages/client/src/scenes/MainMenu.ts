import { Scene } from "phaser";
import { authorizeDiscordUser, discordSdk } from "../utils/discordSDK"; // Import discordSdk
import { Client, Room } from "colyseus.js"; // Import Room type

export class MainMenu extends Scene {
  client: Client | null = null;
  room: Room | null = null; // Add room property

  constructor() {
    super("MainMenu");
  }

  create() {
    const bg = this.add.image(this.cameras.main.width / 2, this.cameras.main.height / 2, "background");
    let scaleX = this.cameras.main.width / bg.width + 0.2;
    let scaleY = this.cameras.main.height / bg.height + 0.2;
    let scale = Math.max(scaleX, scaleY);
    bg.setScale(scale).setScrollFactor(0);

    this.add
      .text(Number(this.game.config.width) * 0.5, 460, "Main Menu", {
        fontFamily: "Arial Black",
        fontSize: 38,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
      })
      .setOrigin(0.5);

    this.input.once("pointerdown", async () => {
      try { // Wrap in try-catch for authorization errors
        await authorizeDiscordUser();

        // Determine WebSocket endpoint based on environment
        const wsProtocol = window.location.protocol === "https:" ? "wss://" : "ws://";
        // Use the server port (3001) directly in development.
        // In production, this might need adjustment based on deployment/proxy setup.
        const wsEndpoint = import.meta.env.DEV
          ? `${wsProtocol}${window.location.hostname}:3001`
          : `${wsProtocol}${window.location.host}`; // Adjust if proxy handles WS differently in prod

        this.client = new Client(wsEndpoint);

        const channelId = discordSdk.channelId;
        if (!channelId) {
          console.error("Channel ID not available from Discord SDK.");
          // Optionally, display an error message to the user here
          return; // Prevent joining without channelId
        }

        this.room = await this.client.joinOrCreate("game", { // Use correct room name "game"
          channelId: channelId, // Pass channelId
          // Remove screenWidth/Height as they are not used by the server room logic
        });

        // Pass the room instance under the 'room' key
        this.scene.start("Game", { room: this.room });

      } catch (e) {
        console.error("Join or Auth error", e);
        // Display a user-friendly error message if needed
        // Example: this.add.text(this.cameras.main.centerX, this.cameras.main.centerY + 100, 'Failed to connect. Please try again.', { color: 'red' }).setOrigin(0.5);
      }
    });
  }
}
