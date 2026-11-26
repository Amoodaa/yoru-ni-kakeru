# Building scenes: brief for scene authors

You are writing scenes for a code-rendered music video of YOASOBI's 夜に駆ける (a live take by ikura).
Every frame is a pure function of song time `t`, rendered with three.js / WebGL2 in Chrome. The bar is
high: it should look like a beautiful, art-directed music video, not a demo. Be bold and specific.

## Read first

- `docs/TREATMENT.md`: style, palette, type, karaoke rules, motifs. Follow it.
- `app/src/scenes/dusk.ts`: the finished intro. It's the reference for structure, the quality bar, the
  vertical lyric typesetting and how time anchors come from lyrics.
- `app/src/scenes/_jp.ts`: `glyphStates(line, t)` (per-glyph sung progress), `columns`, `verticalForm`.
- `d:/code/pdoom-video/docs/ENGINE.md`: the scene API, the toolbox (FSPass, Layer2D, LineBatch,
  Compositor, GLSL_COMMON: noise, fbm, curl, SDFs, hashes), determinism and motion-blur rules. It was
  written for another video: its Archivo / stroke fonts / P(doom) / HUD / palette names don't exist here.
  Fonts here are `F.mincho(400|700|800)` and `F.gothic(400|700)`. Palette names are night, dusk, haze,
  ember, rose, fog and moon (`LIN.x`, `rgba('x', a)`, GLSL `C_X`).
- `app/src/engine/` is the source of truth for every API.

## The story

The song is based on the short story 「タナトスの誘惑」: a boy meets a girl on a rooftop at sunset, behind
a fence. She is drawn to death ("something only she can see"); he wants to save her. At the end they
take each other's hands and race into the night together. Keep it poetic and abstract. Never show
falling bodies, jumping or any literal depiction of suicide. No people, faces, eyes or anime
characters at all. Hands are shown only as abstract light (two lights meeting, two trails joining).

## Data

- `this.ctx.lyrics`: `get(text, nth)` finds a line by its text. Words have `w` (display text),
  `start`/`end`, `kana` and `mora` ([kana, start, end] per mora). Never hard-code times: derive every
  anchor from words, `audio.timeOfBeat` / `nearestBeat` / downbeats.
- `this.ctx.audio` / `f.a`: envelopes `rms, low, mid, high, vocal, accomp` (0..1). `kick/snare/hat` are
  band-onset pulses (a live mix with no drums stem, so they are noisy; use them subtly). `vonset` is
  vocal onsets. Beats are real but the tempo drifts (~90–111 BPM). Downbeats are approximate.
- `f.lt`, `f.p`: local time and progress through your entry. `this.ctx.params`: the entry's params.

## Rules

- Deterministic: no `Math.random`, `Date.now` or `performance.now`. Use `hash`, `mulberry32`, `noise*`.
  Per-frame flicker uses `frameIdx(t)`.
- `render()` must fully overwrite `out`. Colours are linear HDR. Only real light sources bloom; type
  stays crisp (return `bloomThreshold` ≥ 0.95 if your type is bright).
- Karaoke: every line readable and synced per glyph. A glyph lights at its word's timing, never ahead
  of the voice; anticipation (dim glyphs) up to ~0.9 s early is fine. Each scene integrates the
  lyric graphically in its own way (vertical columns are the house style, but a scene may break it
  for a reason). Keep text inside 96 px of the frame edge. Lyrics are Japanese only: the browser
  captions show romaji and translations.
- Transitions: your entry window is fixed (see below); cuts are hard by default. You may fade in/out
  inside your window with the `fade` post override. Make the first and last 0.5 s of your scene work
  as a cut from or to the neighbouring scene (look at its stills).
- Performance: < 25 ms/frame at 1080p on an RTX 4050 laptop GPU in Chrome. At most 2–3 Layer2D per
  scene, redrawn only when needed. Precompute in `init()`.
- Files: only your own `app/src/scenes/<name>.ts` and helpers named `app/src/scenes/<name>-*.ts`. Do not
  edit the engine, `_jp.ts`, `timeline.ts`, `palette.ts`, `dusk.ts` or other scenes. If you truly need
  an engine change, say so in your final message instead.
- Your file currently re-exports the placeholder karaoke scene; replace it.

## Checking your work (mandatory)

A no-reload Vite server for scene work is already running at http://localhost:5190. Always pass it:

```sh
cd d:/code/yoru-ni-kakeru/app
bun scripts/render.ts stills --url http://localhost:5190 --only <id> --t 50.2,55,61.3 --out D:/code/yoru-ni-kakeru/.amp/in/wip/<id>
bun scripts/render.ts sheet  --url http://localhost:5190 --only <id> --from <start> --to <end> --n 16 --cols 4 --out D:/code/yoru-ni-kakeru/.amp/in/wip/<id>/sheet.png
bun scripts/render.ts perf   --url http://localhost:5190 --only <id> --from <a> --to <b>
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep scenes/<name>
```

Use absolute `--out` paths. Look at the PNGs with your image viewing tool and iterate until each frame
is something you would put in a real music video. Check: the sung glyph matches the vocal at that time,
the text is legible, the composition works, and there are no artefacts (banding, aliasing, noise that
reads as dirt, clipped text). Read `SCENE ERRORS` in the render output. Several authors render at the
same time, so a render may be slower; don't kill other people's processes. Never use `taskkill` by image
name or `pkill`. Leave no servers running that you started.

## Final message

The files you wrote, a paragraph on what the scene does beat by beat, the absolute paths of 3–4 final
stills that show it best, perf numbers, and any problem left.
