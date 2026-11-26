"""Beat grid, onsets and loudness envelopes -> data/audio.json

Same schema idea as mexicat/pdoom-video data/audio.json (MIT), simplified:
live performance, so the tempo is tracked locally instead of fixed.

Run: uv run python analyze.py
"""
import common
import json

import librosa
import numpy as np

SR, HOP = 22050, 441  # 50 fps envelopes
FPS = SR / HOP

mix = common.load_audio(common.AUDIO, SR)
voc = common.load_audio(common.STEMS / "vocals.wav", SR)
acc = common.load_audio(common.STEMS / "no_vocals.wav", SR)
dur = len(mix) / SR

# Beats: beat_this (CPJKU) on the mix. The live take drifts from ~91 BPM (first
# chorus) to ~111, which fixed-tempo trackers (librosa) get wrong.
from beat_this.inference import Audio2Beats

beats, bt_downs = Audio2Beats(checkpoint_path="final0", device="cuda", dbn=False)(
    common.load_audio(common.AUDIO, 44100, mono=False).T, 44100)
bpm = 60 / float(np.median(np.diff(beats)))

# Downbeats: beat_this's are right in places but every 2 beats in others, so
# force 4/4: per 16-beat window pick the bar phase that its downbeats and the
# low-band (kick/bass) onsets agree on most.
S = np.abs(librosa.stft(acc, hop_length=HOP))
freqs = librosa.fft_frequencies(sr=SR)
low_on = np.maximum(0, np.diff(S[freqs < 150].sum(0), prepend=0))
low_b = low_on[np.clip((beats * FPS).astype(int), 0, len(low_on) - 1)]
low_b = low_b / (low_b.max() + 1e-9)
is_db = np.isin(np.arange(len(beats)), np.searchsorted(beats, bt_downs - 0.05))
downbeats = []
for w in range(0, len(beats), 16):
    idx = np.arange(max(0, w - 8), min(len(beats), w + 24))
    score = [is_db[idx[idx % 4 == p]].sum() + 0.5 * low_b[idx[idx % 4 == p]].sum() for p in range(4)]
    p = int(np.argmax(score))
    downbeats += [beats[i] for i in range(w, min(len(beats), w + 16)) if i % 4 == p]
downbeats = np.array(downbeats)
downbeats = downbeats[np.concatenate([[True], np.diff(downbeats) > 1.5 * np.median(np.diff(beats))])]


def env(x):
    e = x / (np.percentile(x, 99) + 1e-9)
    return [round(float(v), 3) for v in np.clip(e, 0, 1)]


def band(lo, hi):
    return env(np.sqrt((S[(freqs >= lo) & (freqs < hi)] ** 2).mean(0)))


rms = lambda y: env(librosa.feature.rms(y=y, hop_length=HOP)[0])


def onsets(oenv):
    """[[time, strength 0..1], ...] from an onset-strength curve."""
    pk = librosa.onset.onset_detect(onset_envelope=oenv, sr=SR, hop_length=HOP, backtrack=False)
    s = oenv[pk] / (np.percentile(oenv[pk], 95) + 1e-9) if len(pk) else []
    return [[round(float(t), 3), round(float(min(1.0, v)), 3)] for t, v in zip(pk / FPS, s)]


def band_onsets(lo, hi):
    b = S[(freqs >= lo) & (freqs < hi)]
    return onsets(np.maximum(0, np.diff(np.log1p(b), axis=1, prepend=0)).sum(0))


# Song sections from the lyric structure (line index ranges), times from data/lyrics.json.
ly = json.loads((common.DATA / "lyrics.json").read_text(encoding="utf-8"))["lines"]
SECTION_LINES = [("intro", 0, 1), ("verse1", 2, 9), ("pre1", 10, 14), ("chorus1", 15, 22),
                 ("verse2", 23, 26), ("pre2", 27, 32), ("bridge", 33, 36), ("pre3", 37, 42),
                 ("chorus2", 43, 53), ("outro", 54, 55)]
sections = []
for i, (name, a, _) in enumerate(SECTION_LINES):
    start = 0.0 if i == 0 else ly[a]["start"] - 0.5
    end = ly[SECTION_LINES[i + 1][1]]["start"] - 0.5 if i + 1 < len(SECTION_LINES) else dur
    sections.append(dict(name=name, start=round(start, 3), end=round(end, 3)))

out = dict(
    duration=round(dur, 3), bpm=round(bpm, 3), time_signature=4, fps=FPS,
    beats=[round(float(b), 3) for b in beats], downbeats=[round(float(b), 3) for b in downbeats],
    sections=sections,
    rms=rms(mix), vocal=rms(voc), accomp=rms(acc),
    low=band(20, 150), mid=band(150, 2000), high=band(2000, 11000),
    # no drum stems in a live mix: band onsets of the accompaniment stand in for kick / snare / hats
    onsets=dict(kick=band_onsets(20, 150), snare=band_onsets(150, 2000), hat=band_onsets(5000, 11000),
                vocal=onsets(librosa.onset.onset_strength(y=voc, sr=SR, hop_length=HOP))),
)
(common.DATA / "audio.json").write_text(json.dumps(out), encoding="utf-8")
ibi = np.diff(beats)
print(f"duration {dur:.1f}s, median {bpm:.1f} BPM, {len(beats)} beats, {len(downbeats)} bars; "
      f"local BPM range {60 / np.percentile(ibi, 90):.1f}-{60 / np.percentile(ibi, 10):.1f}")
for t0 in range(0, int(dur), 30):
    m = (beats[:-1] >= t0) & (beats[:-1] < t0 + 30)
    d = downbeats[(downbeats >= t0) & (downbeats < t0 + 30)]
    if m.sum() > 2:
        print(f"  {t0:3d}-{t0 + 30:3d}s  {60 / np.median(ibi[m]):5.1f} BPM  {len(d)} bars")
