import { Scene } from "phaser";

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  init() {
    //  We need this because the assets are loaded in the constructor
    this.add.image(Number(this.game.config.width) * 0.5, Number(this.game.config.height) * 0.5, "background");

    this.add.rectangle(
      Number(this.game.config.width) * 0.5,
      Number(this.game.config.height) * 0.5,
      468,
      32,
    ).setStrokeStyle(1, 0xffffff);

    const bar = this.add.rectangle(
      Number(this.game.config.width) * 0.5 - 230,
      Number(this.game.config.height) * 0.5,
      4,
      28,
      0xffffff,
    );

    this.load.on("progress", (progress: number) => {
      bar.width = 4 + 460 * progress;
    });
  }

  preload() {
    //  Load the assets for the game - Replace with your own assets
    this.load.setPath("/.proxy/assets");

    // Slime Soccer Assets
    this.load.image('player1', 'alien.png'); // Player 1 sprite
    this.load.image('player2', 'smile.png'); // Player 2 sprite
    this.load.image('ball', 'nought.png');   // Ball sprite
    // Add a simple goal graphic or use rectangles later
    // this.load.image('goal', 'goal.png'); 
    this.load.image('soccer_bg', 'grid.png'); // Background for the game

    // Add any generic assets needed for your template here
    // Example: this.load.image('generic_asset', 'generic_asset.png');
  }

  create() {
    //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
    //  For example, you can define global animations here, so we can use them in other scenes.
    console.log("Preloader: All assets loaded. Available textures:", this.textures.list);

    //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
    this.scene.start("MainMenu");
  }
}
