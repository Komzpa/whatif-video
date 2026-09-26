"""Shared paths / cache setup for the "What if" analysis scripts (forked from
mexicat/pdoom-video's analysis/ pipeline; adapted for this song and Linux).

Import this module FIRST (before torch / huggingface imports) so that all
model downloads land in analysis/.cache/.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent          # analysis/
PROJECT = ROOT.parent                            # whatif-video/
CACHE = ROOT / ".cache"
for var, sub in [("TORCH_HOME", "torch"), ("HF_HOME", "hf"), ("HF_HUB_CACHE", "hf/hub"),
                 ("XDG_CACHE_HOME", "xdg"), ("HUGGINGFACE_HUB_CACHE", "hf/hub"),
                 ("TRANSFORMERS_CACHE", "hf/transformers"), ("MPLCONFIGDIR", "mpl"),
                 ("NUMBA_CACHE_DIR", "numba"), ("UV_CACHE_DIR", "uv")]:
    os.environ.setdefault(var, str(CACHE / sub))
    (CACHE / sub).mkdir(parents=True, exist_ok=True)

AUDIO = PROJECT / "audio" / "whatif.mp3"
# Demucs was run directly on a gapless-decoded WAV of the mp3 (analysis/work/whatif.wav),
# not on the mp3 itself, so stems are already sample-aligned to that WAV with no
# encoder-delay correction needed (see analysis/README-whatif.md).
GAPLESS_WAV = ROOT / "work" / "whatif.wav"
STEMS = ROOT / "stems" / "htdemucs" / "whatif"
LYRICS_SRC = PROJECT / "lyrics" / "lyrics.txt"
DATA = PROJECT / "data"
QA = ROOT / "qa"
WORK = ROOT / "work"          # intermediate results (whisper json, alignments)
QA.mkdir(exist_ok=True)
WORK.mkdir(exist_ok=True)
DATA.mkdir(exist_ok=True)

# The 13 sung lines, in order. lyrics/lyrics.txt groups them into stanzas separated
# by blank lines, but stanza boundaries don't always match sung-phrase boundaries
# (see README-whatif.md "Sung line split"): the "lost" stanza (2 text lines) and the
# "temp" stanza (2 text lines) are each two separate sung lines/pages (22/26, 52/62),
# while the final "dark" stanza (2 text lines, one sentence) is ONE sung line (page 13.).
LYRICS_LINES = [
    "You are lost.",
    "You missed the stop, the metro closed.",
    "You’re home alone, the doorbell rings.",
    "Stray dogs cross your path at night.",
    "Your cat is stuck up in a tree.",
    "It’s far too hot.",
    "It’s far too cold.",
    "The weather turns, it feels unsafe.",
    "They tease you, laugh, they call your name.",
    "No one stays. No one’s your friend.",
    "They hurt you more than words can say.",
    "A stranger won’t leave you alone.",
    "You’re scared of dark and things you can’t see.",
]


def load_lyrics_src():
    """Returns list of (start, end, text); start/end are unused placeholders
    (kept for API compatibility with the pdoom align.py, which ignores them)."""
    return [(0.0, 0.0, t) for t in LYRICS_LINES]


# No stem-timing offset: unlike pdoom (whose stems were rendered from a raw mp3
# decode that kept the LAME encoder delay), our stems were separated from a WAV
# that ffmpeg already decoded gaplessly (see GAPLESS_WAV), so stem sample 0 ==
# song time 0 exactly, same reference the browser/engine's `fetch('audio/whatif.mp3')`
# decode uses. Kept as 0 (not removed) so any code ported verbatim from pdoom that
# still references it keeps working.
STEM_OFFSET_SAMPLES = 0
STEM_OFFSET_SEC = 0.0


def load_stem(name, sr=None, mono=True):
    """Load a Demucs stem (already time-aligned to the gapless mp3 decode)."""
    import soundfile as sf
    import numpy as np
    y, s = sf.read(STEMS / f"{name}.wav", dtype="float32", always_2d=True)
    assert s == 44100
    if STEM_OFFSET_SAMPLES:
        y = y[STEM_OFFSET_SAMPLES:]
    y = y.mean(axis=1) if mono else y.T
    if sr and sr != s:
        import soxr
        y = soxr.resample(y, s, sr) if mono else np.stack([soxr.resample(c, s, sr) for c in y])
        s = sr
    return y, s


def load_vocal_source(name, sr=None):
    """'vocals' = Demucs vocal stem (mono sum), 'vocL'/'vocR' = its left/right
    channel. (pdoom also had a karaoke 'lead' stem from a separate mel-roformer
    model; we don't run that model here, so 'lead' is not available.)"""
    if name in ("vocL", "vocR"):
        y, s = load_stem("vocals", sr=sr, mono=False)
        return y[0 if name == "vocL" else 1], s
    return load_stem(name, sr=sr)


def load_mix(sr=44100, mono=True):
    import librosa
    y, s = librosa.load(str(GAPLESS_WAV), sr=sr, mono=mono)
    return y, s
