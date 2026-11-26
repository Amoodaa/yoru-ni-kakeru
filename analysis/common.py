"""Shared paths. Import first so model downloads land in analysis/.cache/.

Adapted from mexicat/pdoom-video (MIT).
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
CACHE = ROOT / ".cache"
for var, sub in [("TORCH_HOME", "torch"), ("HF_HOME", "hf"), ("HF_HUB_CACHE", "hf/hub"),
                 ("NUMBA_CACHE_DIR", "numba"), ("MPLCONFIGDIR", "mpl")]:
    os.environ.setdefault(var, str(CACHE / sub))
    (CACHE / sub).mkdir(parents=True, exist_ok=True)

AUDIO = PROJECT / "audio" / "song.wav"
STEMS = ROOT / "stems" / "htdemucs_ft" / "song"
LYRICS = PROJECT / "lyrics" / "lyrics.txt"
DATA = PROJECT / "data"
WORK = ROOT / "work"
QA = ROOT / "qa"
for d in (DATA, WORK, QA):
    d.mkdir(exist_ok=True)

FRAME = 0.02  # s per CTC emission frame (MMS_FA: 320 samples @ 16 kHz)


def load_lyrics():
    """-> list of lines, each a list of (display word, kana reading)."""
    lines = []
    for raw in LYRICS.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.startswith("#"):
            continue
        disp, read = (s.split() for s in raw.split("||"))
        assert len(disp) == len(read), raw
        lines.append(list(zip(disp, read)))
    return lines


def load_audio(path, sr, mono=True):
    import librosa
    y, _ = librosa.load(str(path), sr=sr, mono=mono)
    return y
