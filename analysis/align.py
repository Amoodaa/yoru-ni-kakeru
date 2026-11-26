"""Word- and mora-level lyric alignment -> data/lyrics.json

1. Each word's kana reading is split into morae and each mora romanized
   (pykakasi, Hepburn) into MMS_FA's a-z alphabet.
2. One global constrained CTC Viterbi pass over the whole song on the MMS_FA
   emissions of the vocal stem, with a "garbage" star token between lines
   that absorbs talking, ad-libs and crowd noise not in the lyric text.
   (Viterbi adapted from mexicat/pdoom-video analysis/ctcalign.py, MIT.)
3. Every line is cross-checked against faster-whisper's independent
   transcript of the same stem (work/whisper.json); report in qa/report.txt.

Run: uv run python align.py
"""
import common
import json
import re
import sys
from difflib import SequenceMatcher

import numba
import numpy as np
import pykakasi
import torchaudio

FRAME = common.FRAME
LABELS = list(torchaudio.pipelines.MMS_FA.get_labels(star=None))
LIDX = {c: i for i, c in enumerate(LABELS)}
KKS = pykakasi.kakasi()
SMALL = set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ")


def morae(kana):
    out = []
    for ch in kana:
        if ch in SMALL and out:
            out[-1] += ch
        elif ch == "ー" and out:
            out[-1] += ch
        else:
            out.append(ch)
    return out


def romaji(m):
    r = "".join(x["hepburn"] for x in KKS.convert(m))
    return re.sub(r"[^a-z]", "", r.lower())


def word_units(kana):
    """-> list of (mora, romaji); っ takes the next mora's first consonant."""
    ms = morae(kana)
    rs = [romaji(m) if m not in ("っ", "ッ") else "" for m in ms]
    for i, m in enumerate(ms):
        if m in ("っ", "ッ"):
            nxt = rs[i + 1] if i + 1 < len(rs) else ""
            rs[i] = "t" if nxt.startswith("ch") else (nxt[:1] or "t")
        if m.endswith("ー") and rs[i]:
            rs[i] += rs[i][-1]
    return [(m, r) for m, r in zip(ms, rs) if r]


def log_emissions():
    em = np.load(common.WORK / "emission_mms.npy").astype(np.float64)
    return em - np.logaddexp.reduce(em, axis=1, keepdims=True)


# Manual constraints where the automatic path is wrong, checked against the
# vocal-stem energy. {line: (earliest start, latest end)} in seconds.
LINE_WINDOWS = {
    # the held "いよう" ends at 147.5; ikura then talks ("…YOASOBIです、よろしく
    # お願いします", 149.0-151.7), which the path otherwise takes as "よう"
    22: (None, 147.6),
    23: (155.5, None),  # "君にしか見えない" starts at 156.3, after the talk and a silence
}


@numba.njit(cache=True)
def viterbi(E, tgt, blank, lo, hi):
    T, L = E.shape[0], len(tgt)
    S = 2 * L + 1
    NEG = -1e18
    prev = np.full(S, NEG)
    cur = np.full(S, NEG)
    bp = np.zeros((T, S), np.int8)
    prev[0] = E[0, blank]
    prev[1] = E[0, tgt[0]]
    for t in range(1, T):
        for s in range(S):
            if s % 2 == 1 and (t < lo[(s - 1) // 2] or t > hi[(s - 1) // 2]):
                cur[s] = NEG
                continue
            e = E[t, tgt[(s - 1) // 2]] if s % 2 == 1 else E[t, blank]
            best, arg = prev[s], 0
            if s >= 1 and prev[s - 1] > best:
                best, arg = prev[s - 1], 1
            if s >= 2 and s % 2 == 1:
                j = (s - 1) // 2
                if tgt[j] != tgt[j - 1] and prev[s - 2] > best:
                    best, arg = prev[s - 2], 2
            cur[s] = best + e
            bp[t, s] = arg
        prev[:] = cur
    s = S - 1 if prev[S - 1] >= prev[S - 2] else S - 2
    path = np.zeros(T, np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= bp[t, s]
    return path


def main(margin=0.5):
    lines = common.load_lyrics()
    E = log_emissions()
    T = E.shape[0]
    star = E.shape[1]
    # star (non-lyric audio) scores the frame's best token minus margin: lower
    # margin = talking / crowd / ad-libs are skipped more readily
    Ex = np.concatenate([E, E.max(axis=1, keepdims=True) - margin], axis=1)
    tgt, index = [star], []  # index: (li, wi, mi, mora, a, b)
    lo_l, hi_l = [0], [T - 1]
    for li, line in enumerate(lines):
        wl, wh = LINE_WINDOWS.get(li, (None, None))
        for wi, (_, kana) in enumerate(line):
            for mi, (m, r) in enumerate(word_units(kana)):
                a = len(tgt)
                tgt.extend(LIDX[c] for c in r)
                lo_l += [int(wl / FRAME) if wl else 0] * len(r)
                hi_l += [int(wh / FRAME) if wh else T - 1] * len(r)
                index.append((li, wi, mi, m, a, len(tgt)))
        tgt.append(star)
        lo_l.append(0)
        hi_l.append(T - 1)
    tgt = np.array(tgt, np.int64)
    path = viterbi(Ex, tgt, LIDX["-"], np.array(lo_l, np.int64), np.array(hi_l, np.int64))
    tokpos = np.where(path % 2 == 1, (path - 1) // 2, -1)
    P = np.exp(Ex[np.arange(T), np.where(tokpos >= 0, tgt[np.maximum(tokpos, 0)], 0)])

    mora = {}
    for li, wi, mi, m, a, b in index:
        fr = np.where((tokpos >= a) & (tokpos < b))[0]
        mora.setdefault((li, wi), []).append([m, fr.min() * FRAME, (fr.max() + 1) * FRAME, float(P[fr].mean())])

    out = []
    for li, line in enumerate(lines):
        words = []
        for wi, (disp, kana) in enumerate(line):
            ms = mora[(li, wi)]
            # a mora lasts until the next one starts (sustained vowels belong to it)
            for k in range(len(ms) - 1):
                ms[k][2] = ms[k + 1][1]
            words.append(dict(w=disp, kana=kana, start=round(ms[0][1], 3), end=round(ms[-1][2], 3),
                              conf=round(float(np.mean([x[3] for x in ms])), 3),
                              mora=[[x[0], round(x[1], 3), round(x[2], 3)] for x in ms]))
        for k in range(len(words) - 1):  # close small gaps inside a line
            if words[k + 1]["start"] - words[k]["end"] < 0.25:
                words[k]["end"] = words[k + 1]["start"]
                words[k]["mora"][-1][2] = words[k + 1]["start"]
        # the line's last mora lasts as long as the voice does (held notes),
        # never into the next line
        last = words[-1]["mora"][-1]
        nxt = mora[(li + 1, 0)][0][1] - 0.05 if li + 1 < len(lines) else T * FRAME
        last[2] = words[-1]["end"] = round(sustain_end(last[1], min(nxt, last[1] + 8.0)), 3)
        out.append(dict(i=li, text="".join(d for d, _ in line),
                        start=words[0]["start"], end=words[-1]["end"], words=words))
    (common.DATA / "lyrics.json").write_text(json.dumps(dict(lines=out), ensure_ascii=False, indent=1),
                                             encoding="utf-8")
    report(out)


_VENV = None


def sustain_end(t0, t_max):
    """First time after t0 + 0.15 s where the vocal stem stays quiet for 0.2 s (capped at t_max)."""
    global _VENV
    if _VENV is None:
        import librosa
        y = common.load_audio(common.STEMS / "vocals.wav", 16000)
        e = librosa.feature.rms(y=y, frame_length=640, hop_length=320)[0]
        _VENV = e / np.percentile(e, 99)
    q = _VENV < 0.08
    a, b = int((t0 + 0.15) / FRAME), min(len(q), int(t_max / FRAME))
    for i in range(a, b - 10):
        if q[i:i + 10].all():
            return i * FRAME
    return t_max


def norm(s):
    return re.sub(r"[\s「」『』、。,.!?！？…・]", "", s)


def report(out):
    wpath = common.WORK / "whisper.json"
    ww = [w for s in json.loads(wpath.read_text(encoding="utf-8")) for w in s["words"]] if wpath.exists() else []
    rows = []
    for L in out:
        heard = "".join(w["w"] for w in ww if w["end"] > L["start"] - 0.3 and w["start"] < L["end"] + 0.3)
        sim = SequenceMatcher(None, norm(L["text"]), norm(heard)).ratio() if ww else float("nan")
        conf = float(np.mean([w["conf"] for w in L["words"]]))
        flag = "  <-- check" if (sim < 0.5 or conf < 0.3) else ""
        rows.append(f"L{L['i']:02d} {L['start']:7.2f}-{L['end']:7.2f} conf {conf:.2f} whisper {sim:.2f}  "
                    f"{L['text']}\n{'':40s}heard: {norm(heard)}{flag}")
    txt = "\n".join(rows)
    (common.QA / "report.txt").write_text(txt, encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    print(txt)


if __name__ == "__main__":
    main()
