// The edit: which scene plays when. Boundaries are anchored to lyric lines and snapped to the beat
// grid, so they follow the aligned data (data/lyrics.json, data/audio.json). Look lines up by their
// text, never by hard-coded times.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** Cut on the last beat at/before the first word of the matching line (never after the word). */
  const cut = (q: string, nth = 0, tol = 0.02) => {
    const s = ly.get(q, nth).words[0]!.start;
    return au.timeOfBeat(Math.floor(au.beatAt(s + tol)));
  };

  const b = {
    verse1: cut('さよなら'),                    // L2  「さよなら」だけだった
    pre1: cut('いつだって'),                    // L10 いつだってチックタックと
    chorus1: cut('騒がしい日々に笑えない'),     // L15 (the talk after it stays in this entry)
    verse2: cut('君にしか'),                    // L23
    pre2: cut('信じていたい'),                  // L27 (the instrumental after it stays in this entry)
    bridge: cut('疲れたんだって'),              // L33
    pre3: cut('ほらまた'),                      // L37
    chorus2: cut('笑えなくなっていた'),         // L43
    wind: cut('沈むように', 1),                 // L49 the second 沈むように
    outro: cut('繋いだ手を'),                   // L54
    end: au.duration,
  };

  const E = (id: string, file: string, start: number, end: number, extra: Partial<TimelineEntry> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end, ...extra });

  return [
    E('dusk', 'dusk', 0, b.verse1),
    E('fence', 'fence', b.verse1, b.pre1),
    E('clock1', 'clock', b.pre1, b.chorus1, { params: { n: 1 } }),
    E('race1', 'race', b.chorus1, b.verse2, { params: { n: 1 } }),
    E('gaze', 'gaze', b.verse2, b.pre2),
    E('flap', 'flap', b.pre2, b.bridge),
    E('rain', 'rain', b.bridge, b.pre3),
    E('clock2', 'clock', b.pre3, b.chorus2, { params: { n: 2 } }),
    E('race2', 'race', b.chorus2, b.wind, { params: { n: 2 } }),
    E('wind', 'wind', b.wind, b.outro),
    E('outro', 'outro', b.outro, b.end),
  ];
}
