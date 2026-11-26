// Placeholder for parts of the song that have no designed scene yet: the current line and the next
// one, horizontally, with a per-glyph wipe. Plain on purpose. It keeps the whole song watchable while
// scenes are built one section at a time, and the corner label says which section it stands in for.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H, clearRT } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { glyphStates } from './_jp';

export default class Karaoke extends Scene {
  text = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics, audio } = this.ctx;
    clearRT(renderer, out, LIN.night);
    const c = this.text.ctx;
    this.text.clear();
    // the line on screen: from 0.6 s before it starts until the next one takes over
    const next = lyrics.nextLine(f.t + 0.6);
    const cur = lyrics.lastLine(f.t + 0.6);
    c.textBaseline = 'alphabetic';
    if (cur) {
      const gs = glyphStates(cur, f.t);
      const size = 76;
      c.font = font(F.mincho(700), size);
      const widths = gs.map((g) => c.measureText(g.ch).width);
      let x = (W - widths.reduce((a, b) => a + b, 0)) / 2;
      gs.forEach((g, i) => {
        c.fillStyle = g.k >= 1 ? rgba('moon') : g.k > 0 ? rgba('ember') : rgba('fog', 0.4);
        c.fillText(g.ch, x, H / 2);
        x += widths[i]!;
      });
    }
    if (next && next !== cur) {
      c.font = font(F.mincho(400), 40);
      c.fillStyle = rgba('fog', 0.35);
      c.textAlign = 'center';
      c.fillText(next.text, W / 2, H / 2 + 90);
      c.textAlign = 'left';
    }
    c.font = font(F.gothic(400), 18);
    c.fillStyle = rgba('fog', 0.5);
    c.fillText(`placeholder · ${audio.section(f.t)?.name ?? ''}`, 64, H - 56);
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.2, grain: 0.03 };
  }
}
