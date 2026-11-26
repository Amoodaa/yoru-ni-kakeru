# 夜に駆ける (live) — treatment & style

## Idea

The song is based on Hoshino Mayo's short story 「タナトスの誘惑」: a rooftop, a fence, a sunset,
and a night the two of them race into. The video stays on that rooftop and in that sky. It moves
from dusk to deep night across the song, and the lyrics are written into the sky as vertical type.
It's quiet and literary: no neon, no particles for their own sake, no anime characters, no faces.

## Palette (`app/src/engine/palette.ts`)

| name | hex | use |
|---|---|---|
| night | `#0A0E22` | background, the deep sky |
| dusk | `#251E48` | upper sky at dusk, raised darks |
| haze | `#6B5A8E` | horizon haze |
| ember | `#F08A5D` | the sun, warm light, **the glyph being sung** |
| rose | `#D9566A` | the sun's lower edge (rare) |
| fog | `#8E97B8` | unsung type, distant lights |
| moon | `#F3EEE4` | sung type, stars |

Only the sun (and later moments of real light) may bloom. Type stays below the bloom threshold
(`bloomThreshold: 0.95`).

## Type (`app/src/engine/type.ts`)

- **Shippori Mincho** (`F.mincho`): every lyric, set vertically (tategaki), right to left, broken
  between words (`scenes/_jp.ts`).
- **Zen Kaku Gothic New** (`F.gothic`): small labels and credits only.
- Karaoke: unsung glyphs in fog at ~30 %, the glyph being sung in ember, sung glyphs in moon. A glyph
  lights across all of its word's timed morae (`glyphStates`), never ahead of the voice.

## Motifs

1. **The fence**: chain-link, seen from the rooftop (intro; 「フェンス越しに重なっていた」).
2. **The sun**: sinks and melts into the horizon (沈むように溶けてゆくように). It comes back only as memory.
3. **The sky widening**: the camera tilts up when the lyric opens the sky (空が広がる).
4. **City windows**: they switch on as night falls; the world below that the two leave behind.

## Scenes

| id | lines | status |
|---|---|---|
| `dusk` | 沈むように… / 二人だけの空が広がる夜に | done |
| `fence` | verse 1, 46.7–85.0 s: lyrics in the chain-link cells, sunset bokeh, rack focus | done |
| `clock` ×2 | pre-choruses, 85.0–104.7 / 224.2–247.1 s: hairline clockwork on the beat grid | done |
| `race` ×2 | choruses, 104.7–156.3 / 247.1–275.9 s: two lights racing through a window city | done |
| `gaze` | 156.3–172.8 s: a gate of light seen only in part; 嫌いだ hard cuts | done |
| `flap` | verse 2, 172.8–206.6 s: a station split-flap board, one row per line | done |
| `rain` | 206.6–224.2 s: lyrics written into condensation on a night window | done |
| `wind` | 275.9–302.0 s: fog tears open to the sky, wind streamlines | done |
| `outro` | 302.0–338 s: the rooftop again; the two lights become a constellation; credits | done |
| `karaoke` | anything without a scene (starter fallback) | placeholder |
