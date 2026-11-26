"""WebVTT caption tracks for the player -> data/captions/{romaji,en,ar}.vtt

Cue times come from data/lyrics.json (one cue per sung line). Romaji is generated from the kana
readings (Hepburn, one word per kana word). English and Arabic come from lyrics/translations.tsv.

Run: uv run python captions.py
"""
import common
import csv
import json

import pykakasi

KKS = pykakasi.kakasi()
lines = json.loads((common.DATA / "lyrics.json").read_text(encoding="utf-8"))["lines"]
with open(common.PROJECT / "lyrics" / "translations.tsv", encoding="utf-8") as f:
    tr = {int(r["line"]): r for r in csv.DictReader(f, delimiter="\t")}
assert len(tr) == len(lines), (len(tr), len(lines))


PARTICLES = ["から", "まで", "なら", "しか", "へと", "の", "が", "を", "に", "で", "と", "は", "も", "へ"]
SUNG = {"は": "wa", "を": "o", "へ": "e", "へと": "e to"}


def roma(kana):
    return "".join(x["hepburn"] for x in KKS.convert(kana))


def romaji(word):
    """Hepburn for one word, with a trailing particle split off (and は/を/へ as sung: wa/o/e).
    A particle is split only when the display text ends in it too (so it isn't part of a reading)."""
    kana, disp = word["kana"], word["w"].strip("「」、")
    for p in PARTICLES:
        if not (kana.endswith(p) and disp.endswith(p) and len(kana) > len(p)):
            continue
        base = disp[:-len(p)]
        kanji = any("\u4e00" <= c <= "\u9fff" or "\u30a0" <= c <= "\u30ff" for c in base)
        # a particle after a noun (君の, 全てが, いつかは), not the end of a word (その, きっと, 掴んで)
        noun = base[-1] >= "\u30a0" or (kanji and p != "で") or p in SUNG
        if noun:
            return f"{roma(kana[:-len(p)])} {SUNG.get(p, roma(p))}"
    return roma(kana)


def stamp(t):
    h, m = divmod(t, 3600)
    m, s = divmod(m, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


def cues(text_of):
    out = ["WEBVTT", ""]
    for i, L in enumerate(lines):
        start = max(0.0, L["start"] - 0.15)
        nxt = lines[i + 1]["start"] - 0.15 if i + 1 < len(lines) else L["end"] + 2.0
        end = min(nxt, L["end"] + 1.2)
        out += [str(i + 1), f"{stamp(start)} --> {stamp(end)}", text_of(i, L), ""]
    return "\n".join(out)


dst = common.DATA / "captions"
dst.mkdir(exist_ok=True)
(dst / "romaji.vtt").write_text(cues(lambda i, L: " ".join(romaji(w) for w in L["words"])), encoding="utf-8")
(dst / "en.vtt").write_text(cues(lambda i, L: tr[i]["en"]), encoding="utf-8")
(dst / "ar.vtt").write_text(cues(lambda i, L: tr[i]["ar"]), encoding="utf-8")
print((dst / "romaji.vtt").read_text(encoding="utf-8")[:600])
