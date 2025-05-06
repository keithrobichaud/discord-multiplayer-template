import { Scene } from "phaser";

export class Background extends Scene {
  constructor() {
    super("background");
  }

  create() {
    this.cameras.main.setBackgroundColor(0xffffff);
    this.scene.sendToBack();
  }
}
