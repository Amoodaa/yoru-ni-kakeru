# 夜に駆ける (live): code-rendered music video

A code-rendered music video built on the engine of
[mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) (MIT, `app/LICENSE-pdoom-video`).
Every frame is a deterministic function of song time, so the browser preview and the exported
video match. The style is in `docs/TREATMENT.md`.

## Run it

```sh
cd app
bun install
bun run dev                     # preview: http://localhost:5173  (?t=22 starts at 22 s)
bun run stills --t 22.5,43      # PNGs in out/stills (check your work here)
bun run sheet --from 0 --to 47 --n 12 --cols 3
bun run draft --to 47 --out ../out/intro-draft.mp4   # quick video, 1 sample per frame
bun run video                   # final 1080p60 with motion blur (8 sub-frames, 6 workers: ~30 min)
```

`mise.toml` pins bun, so plain `bun` works inside this folder. Preview keys: space play/pause,
←/→ ±1 s (shift ±5 s), `,`/`.` one frame, `[`/`]` previous/next scene, `l` loop the scene, `h` hide the UI.

## Making a new video from this

The engine (`app/src/engine/`) has no style of its own:

- `palette.ts`: the colours. Every entry is also a GLSL constant `C_<NAME>`.
- `type.ts`: the font list (files in `app/public/fonts/`).
- `hud.ts`: an empty global overlay.
- `post.ts`: post-processing (bloom, halation colour, grain, vignette). Scenes override it per frame.

For a new song: run the analysis pipeline below on it, change the palette and fonts, write
`docs/TREATMENT.md`, then build scenes one at a time. A scene is one file in `app/src/scenes/` with a
`render(frame)`. `src/timeline.ts` places it by lyric text, snapped to the beat. `scenes/karaoke.ts`
fills the parts that have no scene yet. pdoom-video's
[ENGINE.md](https://github.com/mexicat/pdoom-video/blob/main/docs/ENGINE.md) documents the scene API,
motion blur and 4K. Its Archivo / stroke-font / P(doom) parts don't apply here.

## Timing data

Source: "Spotted: ikura (YOASOBI) - 夜に駆ける / 咲き誇れ", https://youtu.be/hHBnlKxEAxo,
1:30–7:08 (338 s). `audio/song.wav` / `song.mp3` is that cut; t = 0 is 1:30 in the video.
The recording and lyrics belong to their owners; keep them out of any public repo.

## Outputs

- `data/lyrics.json`: 56 lines → words → morae, each with start/end seconds.
  Words carry the display text (`w`), the kana reading (`kana`) and a CTC confidence (`conf`).
  Each mora's `[kana, start, end]` drives a per-character karaoke wipe.
- `data/audio.json`: beats, 4/4 downbeats, onsets (mix and vocal), and 50 fps envelopes
  (`rms`, `vocal`, `accomp`, `low`, `mid`, `high`).
- `preview.html`: karaoke + beat/bar flash player to check the timing by ear
  (`bunx serve -l 5180 .`, open http://localhost:5180/preview; it needs a server with range requests).

## Pipeline (`analysis/`, uv, CUDA)

```sh
cd analysis
uv run python separate.py     # Demucs htdemucs_ft vocal / accompaniment stems
uv run python emissions.py    # MMS_FA CTC emissions of the vocal stem
uv run python whisper_run.py  # faster-whisper large-v3 transcript (independent cross-check)
uv run python align.py        # data/lyrics.json + qa/report.txt
uv run python analyze.py      # data/audio.json
```

- Lyrics (`lyrics/lyrics.txt`) are the official text with kana readings. Readings are split
  into morae, romanized (pykakasi), and aligned in one global CTC Viterbi pass with a garbage
  token between lines, so talking and crowd noise are skipped.
- Manual fixes live in `LINE_WINDOWS` in `align.py` (the talk after the first chorus), and
  live-only readings live in `lyrics.txt` (かけだしてく).
- A line's last mora is held for as long as the vocal stem stays loud.

## How good is it

- Line starts vs. the vocal stem's energy onset: median offset 0.01 s, 89 % within 0.15 s.
- All 56 lines agree with the Whisper transcript. Whisper's word times run ~0.3 s early,
  which is a known Whisper bias, so they're used only as a cross-check.
- Tempo isn't steady (≈91 BPM in the first chorus, ≈107–111 later). Beats come from beat_this.
  Downbeats are forced to 4/4 and are the least certain part; check them in the preview.
