"""Demucs htdemucs_ft vocal / accompaniment split -> stems/htdemucs_ft/song/{vocals,no_vocals}.wav"""
import common
import subprocess
import sys

import torch

dev = "cuda" if torch.cuda.is_available() else "cpu"
subprocess.run([sys.executable, "-m", "demucs", "-n", "htdemucs_ft", "--two-stems", "vocals",
                "-d", dev, "--segment", "7", "-o", str(common.ROOT / "stems"), str(common.AUDIO)],
               check=True)
