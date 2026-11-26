"""faster-whisper large-v3 word timestamps on the vocal stem (independent cross-check) -> work/whisper.json"""
import common
import json
import os
from pathlib import Path

import torch

# CTranslate2 needs cuBLAS 12; reuse the copy that ships with the CUDA build of torch
os.add_dll_directory(str(Path(torch.__file__).parent / "lib"))
from faster_whisper import WhisperModel  # noqa: E402

model = WhisperModel("large-v3", device="cuda", compute_type="float16",
                     download_root=str(common.CACHE / "whisper"))
audio = common.load_audio(common.STEMS / "vocals.wav", 16000)  # faster-whisper's own PyAV decode breaks on new av
segs, _ = model.transcribe(audio, language="ja", word_timestamps=True,
                           vad_filter=True, condition_on_previous_text=False, beam_size=5)
out = [dict(start=s.start, end=s.end, text=s.text,
            words=[dict(w=w.word, start=w.start, end=w.end, p=w.probability) for w in s.words])
       for s in segs]
(common.WORK / "whisper.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
for s in out:
    print(f"{s['start']:7.2f} {s['end']:7.2f}  {s['text']}")
