"""Frame-wise CTC log-probs (20 ms) of the vocal stem from torchaudio MMS_FA
(multilingual, romanized a-z) -> work/emission_mms.npy. Chunked with context.

Adapted from mexicat/pdoom-video analysis/ctc_emissions.py (MIT).
"""
import common
import numpy as np
import torch
import torchaudio

HOP = 320
bundle = torchaudio.pipelines.MMS_FA
dev = "cuda" if torch.cuda.is_available() else "cpu"
model = bundle.get_model(with_star=False).to(dev).eval()
y = common.load_audio(common.STEMS / "vocals.wav", 16000)
y = y / (np.abs(y).max() + 1e-9)
n = len(y) // HOP
chunk, ctx = 20 * 16000, 3 * 16000
out = np.full((n, len(bundle.get_labels(star=None))), np.nan, np.float32)
for s in range(0, len(y), chunk):
    a, b = max(0, s - ctx), min(len(y), s + chunk + ctx)
    with torch.inference_mode():
        em, _ = model(torch.from_numpy(y[a:b]).float()[None].to(dev))
        em = torch.log_softmax(em, -1)[0].float().cpu().numpy()
    f0, lo, hi = a // HOP, s // HOP, min(n, (s + chunk) // HOP)
    seg = em[lo - f0: hi - f0]
    out[lo: lo + len(seg)] = seg
last = np.where(~np.isnan(out[:, 0]))[0].max()
out[last + 1:] = out[last]
np.save(common.WORK / "emission_mms.npy", out)
print("emissions", out.shape, "labels", bundle.get_labels(star=None))
