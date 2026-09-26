"""Run whisper.cpp (large-v3, word-level timestamps) on the time-corrected
vocal stem. Cross-check for the CTC forced alignment in align.py.

pdoom's version of this script ran mlx-whisper (macOS/Apple-Silicon only).
This machine has no mlx; whisper.cpp (already built, with ggml-large-v3.bin)
plays the same "independent ASR cross-check" role instead.

whisper.cpp's `-ml 1 -ojf` output is one JSON "transcription" entry per BPE
token (not per word); a new word starts at a token whose text begins with a
leading space (the standard GPT/whisper BPE word-boundary marker). We merge
consecutive same-word tokens back into words with [start, end] = the
enclosing tokens' offsets, keeping a rough per-word confidence.

Deliberately run WITHOUT an --prompt: an initial prompt that closely echoes
the lyrics made whisper.cpp recite the prompt instead of listening to the
first ~30s of audio (see analysis/README-whatif.md) -- a known failure mode
when the prompt matches the expected transcript too closely.

Writes work/whisper_words.json = [{"word", "start", "end", "conf"}, ...].

Run:  uv run python whisper_run.py
"""
import common  # noqa: F401  (sets cache dirs, unused otherwise)
import json
import subprocess
import sys

WHISPER_CLI = "/home/kom/.openclaw/local/whisper.cpp/build/bin/whisper-cli"
MODEL = "/home/kom/.openclaw/local/whisper.cpp/models/ggml-large-v3.bin"
VOCALS_16K = common.WORK / "vocals16k.wav"


def ensure_vocals_16k():
    if VOCALS_16K.exists():
        return
    subprocess.run(["ffmpeg", "-y", "-i", str(common.STEMS / "vocals.wav"),
                     "-ar", "16000", "-ac", "1", str(VOCALS_16K)], check=True)


def run_whisper_cli(tag):
    out_stem = common.WORK / f"whisper_{tag}"
    subprocess.run([WHISPER_CLI, "-m", MODEL, "-f", str(VOCALS_16K), "-l", "en",
                     "-ml", "1", "-ojf", "-of", str(out_stem)], check=True)
    return json.loads((out_stem.with_suffix(".json")).read_text())


def tokens_to_words(doc):
    words = []
    cur = None
    for seg in doc["transcription"]:
        txt = seg["text"]
        if txt.strip() == "" or txt.startswith("[_"):
            continue
        starts_new = txt.startswith(" ") or cur is None
        if starts_new:
            if cur:
                words.append(cur)
            cur = dict(word=txt.strip(), start=seg["offsets"]["from"] / 1000.0,
                       end=seg["offsets"]["to"] / 1000.0, ps=[seg["tokens"][0]["p"]])
        else:
            cur["word"] += txt
            cur["end"] = seg["offsets"]["to"] / 1000.0
            cur["ps"].append(seg["tokens"][0]["p"])
    if cur:
        words.append(cur)
    for w in words:
        ps = w.pop("ps")
        w["conf"] = round(sum(ps) / len(ps), 3) if ps else 0.0
    return words


def main():
    ensure_vocals_16k()
    doc = run_whisper_cli("vocals_large_v3")
    words = tokens_to_words(doc)
    (common.WORK / "whisper_words.json").write_text(json.dumps(words, indent=1))
    for w in words:
        print(f"{w['start']:7.2f} {w['end']:7.2f}  {w['word']!r:20s} conf={w['conf']:.2f}")
    print(len(words), "words ->", common.WORK / "whisper_words.json")


if __name__ == "__main__":
    sys.exit(main())
