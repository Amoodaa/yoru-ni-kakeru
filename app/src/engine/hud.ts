// Global overlay, composited over every scene before the tone shoulder, grain and vignette (so it
// gets the same film treatment). Empty by default: draw project-wide furniture here, such as a
// title card, credits or a watermark. Scenes fade it with the `hud` post override.
import type * as THREE from 'three';
import { Layer2D } from './gl';
import type { Lyrics } from './lyrics';

export class Hud {
  private layer = new Layer2D();
  private empty: THREE.Texture | null = null;

  constructor(protected lyrics: Lyrics) {}

  /**
   * The overlay at song time t. Nothing to draw yet, so it returns one cleared texture (no per-frame
   * upload). To draw: `this.layer.clear(); <draw on this.layer.ctx>; return this.layer.upload();`
   */
  draw(_t: number, _opts: { opacity: number }): THREE.Texture {
    if (!this.empty) { this.layer.clear(); this.empty = this.layer.upload(); }
    return this.empty;
  }
}
