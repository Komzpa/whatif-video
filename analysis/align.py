"""Word-level lyric alignment -> data/lyrics.json

Pipeline (forked from mexicat/pdoom-video's align.py; adapted for this song):
  1. ctc_emissions.py  : frame-wise CTC log-probs of the Demucs vocal stem
                         (mono sum + left/right channel) from two acoustic
                         models (MMS_FA, wav2vec2 LV60K).
  2. whisper_run.py    : whisper.cpp (large-v3) word timestamps on the vocal
                         stem (cross-check; pdoom used mlx-whisper, macOS-only).
  3. vocal_feats.py    : vocal-stem RMS / pitch / onset features (5 ms hop).
  4. this script       : one global constrained CTC Viterbi pass over the whole
                         song on the fused emissions (garbage "star" token
                         between lines), then signal-based refinement of word
                         starts/ends, confidence scoring, QA plots.

Run:  uv run python align.py [--plots]
"""
import common
import json
import re
import sys
from difflib import SequenceMatcher

import numpy as np

from ctcalign import FRAME, align, emissions, word_table
from pron import pron

# Primary emission set: mixture of both CTC models on the demucs vocal stem's
# mono sum, left and right channel (in case any line is double-tracked).
PRIMARY = "fused6"
# Independent-ish alternatives, used for agreement-based confidence. (pdoom also
# had a "fused_lead" karaoke-stem alternative; we don't run that extra model here.)
ALTS = ("mms", "lv60k", "fused_vocL", "fused_vocR")

# Per-line time windows (seconds) where the automatic path needs constraining,
# established from the whisper.cpp mix reference (analysis/whisper-cpp-large-v3-
# segments.json) and this song's own whisper.cpp vocal-stem cross-check
# (analysis/work/whisper_words.json). Keeps the Viterbi path from drifting a
# whole line into a neighbouring line's silence/backing-vocal region.
LINE_WINDOWS = {
    0: (0.0, 17.0),         # "You are lost."
    1: (14.0, 24.0),        # "You missed the stop, the metro closed."
    2: (20.0, 37.0),        # "You're home alone, the doorbell rings."
    3: (34.0, 49.0),        # "Stray dogs cross your path at night."
    4: (48.0, 62.0),        # "Your cat is stuck up in a tree."
    5: (59.0, 70.0),        # "It's far too hot."
    6: (68.0, 76.0),        # "It's far too cold."
    7: (73.0, 89.0),        # "The weather turns, it feels unsafe."
    8: (86.0, 110.0),       # "They tease you, laugh, they call your name."
    9: (110.0, 122.0),      # "No one stays. No one's your friend."
    10: (119.0, 136.0),     # "They hurt you more than words can say."
    11: (133.0, 148.0),     # "A stranger won't leave you alone."
    12: (145.0, 160.0),     # "You're scared of dark and things you can't see."
}

# Manual anchors (seconds) for the CTC path, established by inspecting the QA
# plots (spectrogram / pitch / envelopes) and targeted whisper.cpp re-runs on
# isolated clips (see README-whatif.md). Key: (line, token, subword) ->
# (earliest allowed start, latest allowed end) of that subword's chars.
ANCHORS = {
    # L8 "They tease you, laugh, they call your name.": the unconstrained global
    # path pushed the whole "They tease you, laugh," half ~9s late (98.6-101.8s,
    # an implausibly compressed 3.2s for 4 tokens+2 commas), apparently because
    # the acoustic models found a stronger (wrong) match for "they" near the
    # second "they call" at ~101s. Two independent whisper.cpp re-runs on
    # isolated clips (83-102s and 88-113s) both place the FIRST "they" at
    # 88-94s, not 98.6s, and "laugh," ending by ~100-102s (before the second
    # "they call your name" phrase, which the unconstrained path already placed
    # correctly at ~102-111s matching analysis/whisper-cpp-large-v3-segments.json's
    # mix-based "101.76 111.54 They call your name"). Anchor just the outer
    # edges of the first half; let CTC/signal refinement place the interior.
    (8, 0, 0): (88.0, 95.0),   # "they" (first)
    (8, 3, 0): (None, 102.0),  # "laugh," ends before the second "they call"
}

# Final manual corrections of word boundaries after refinement, only where the
# plots/listening clearly show the automatic result is wrong. (line, token) ->
# dict(start=..., end=..., conf=...)
FIX = {
    # L8 "They" (first): the vocal-activity signal (RMS) never drops between
    # "they" and "tease" (continuous sustained/legato singing, or a long held
    # note + reverb), so refine()'s end-detection stretches "they" all the way
    # to "tease"'s onset at 98.6s (an implausible 8.6s single-syllable word).
    # Independent onset+sibilance evidence pins "tease"'s /t/-/z/ onset firmly
    # at 98.3-99.5s (see README-whatif.md), so that part is solid; "they"
    # itself, per two isolated whisper.cpp re-transcriptions of this stretch,
    # is articulated around 89.6-92s, with the 92-98.6s remainder most likely
    # an unlexicalised held/ad-lib tail -> reported separately as an "extra",
    # not attached to the word "they". Low confidence: exact cutoff between
    # "they" and the held tail is a judgement call, not a clean signal boundary.
    (8, 0): dict(end=92.0, conf=0.4),
}

# ---------------------------------------------------------------------------


def load_feats():
    f = dict(np.load(common.WORK / "vocal_feats.npz"))
    f["hop"] = float(f.pop("hop_s"))
    return f


def activity(f, rel_db=22.0, abs_db=-48.0, win_s=1.5):
    """Vocal activity mask: RMS above an absolute floor and within rel_db of the
    local (±win) maximum."""
    from scipy.ndimage import maximum_filter1d, median_filter
    r = median_filter(f["rms_db"], 5)
    loc = maximum_filter1d(r, int(win_s / f["hop"]))
    return (r > abs_db) & (r > loc - rel_db), r


def runs(mask):
    """Return list of (start_idx, end_idx_exclusive) runs where mask is True."""
    m = np.concatenate([[False], mask, [False]]).astype(np.int8)
    d = np.diff(m)
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


FRIC_START = re.compile(r"(s|sh|ch|z|f|th|j|c[eiy]|x|h)")
VOICED_TH = {"the", "there", "there's", "that", "that's", "they", "this", "then"}
FRIC_END = re.compile(r"(s|z|f|x|ce|se|ze|sh|ch)$")


def refine(words, f, fix=None):
    """Signal-based refinement of CTC boundaries, per sub-word unit (here every
    word is its own unit; the song has no spelled acronyms).

    1. rest-onset : a rest (>=50 ms silence) precedes the unit and the voice
                    re-enters >40 ms before the first CTC char -> start there
                    (CTC fires late on held vowels).
    2. onset-snap : otherwise snap to the strongest vocal onset (spectral flux)
                    in a window just before the CTC start (legato word starts
                    with glottal/vowel onsets that CTC places late).
    3. fricative  : for s/sh/ch/z/f/th/j/h-initial units, CTC emits the consonant
                    at the END of the frication; move start back to where the
                    4-10 kHz noise begins.
    end: next unit's start when the voice continues (legato), else the moment
         the voice stops (RMS >15 dB below the word's level for >=60 ms).
    """
    from scipy.ndimage import uniform_filter1d
    from scipy.signal import find_peaks
    hop = f["hop"]
    act, r = activity(f, rel_db=27.0)
    n = len(r)
    sil = ~act
    sib = uniform_filter1d(f["sib_ratio"], 3)
    on = f["onset"]
    on_thr = 0.3 * np.percentile(on, 99)
    pk_idx, _ = find_peaks(on, height=on_thr, distance=int(0.04 / hop))
    units = []
    for k, w in enumerate(words):
        w["ctc_start"], w["ctc_end"] = w["start"], w["end"]
        w["ctc_subs"] = [tuple(x) for x in w["subs"]]
        for j, (a, b) in enumerate(w["subs"]):
            units.append(dict(k=k, j=j, text=pron(w["w"])[j], cs=a, ce=b, s=a, rule="ctc"))
    fix = fix or {}
    for u_i, u in enumerate(units):
        w = words[u["k"]]
        fx = fix.get((w["li"], w["ti"]))
        if fx is not None:
            starts = [fx.get("start")] + list(fx.get("syl", []))
            if u["j"] < len(starts) and starts[u["j"]] is not None:
                u["s"], u["rule"] = starts[u["j"]], "manual"
                continue
        pu = units[u_i - 1] if u_i else None
        prev_ce = pu["ce"] if pu else 0.0
        prev_cs = pu["cs"] if pu else 0.0
        s = u["cs"]
        # 1. rest-onset
        i0, i1 = int(prev_ce / hop), int(s / hop)
        done = False
        if i1 - i0 > int(0.05 / hop):
            rs = [(a, b) for a, b in runs(sil[i0:i1]) if (b - a) * hop >= 0.05]
            if rs:
                onset = (i0 + rs[-1][1]) * hop
                if s - onset > 0.04:
                    u["s"], u["rule"] = onset, "rest-onset"
                done = True
        # 2. onset snap
        if not done:
            vowel_init = u["text"][0] in "aeiou"
            lo = max(prev_ce - 0.06, prev_cs + 0.08, s - (0.25 if vowel_init else 0.12))
            hi = s + 0.04
            # ignore onsets that are followed by frication (they are the final
            # consonant cluster of the previous word, e.g. the "ks" of "sparks")
            cand = [p for p in pk_idx if lo <= p * hop <= hi
                    and np.median(sib[p:p + int(0.06 / hop)]) < -5]
            best, bsc = None, 0.0
            for p in cand:
                dt = s - p * hop
                wgt = 1.0 if dt < 0.06 else max(0.4, 1 - (dt - 0.06) / 0.4)
                if on[p] * wgt > bsc:
                    best, bsc = p, on[p] * wgt
            if best is not None:
                t = best * hop - 0.01
                if abs(t - s) > 0.02:
                    u["s"], u["rule"] = t, "onset-snap"
        # 3. fricative
        if FRIC_START.match(u["text"]) and u["text"] not in VOICED_TH:
            prev_fric_end = pu is not None and FRIC_END.search(pu["text"]) is not None
            lo_t = prev_ce + 0.02 if prev_fric_end else prev_ce - 0.10
            if pu is not None:
                lo_t = max(lo_t, pu["s"] + 0.10)
            lo = int(max(lo_t, s - 0.30, 0) / hop)
            a, b = max(int((s - 0.15) / hop), lo), int((s + 0.06) / hop)
            if b > a:
                pk = a + int(np.argmax(sib[a:b]))
                base = np.percentile(sib[max(0, lo - int(0.4 / hop)):lo + 1], 25) if lo > 0 else -40
                if sib[pk] >= base + 8:
                    thr = 0.5 * (base + sib[pk])
                    j = pk
                    while j - 1 >= lo and sib[j - 1] > thr:
                        j -= 1
                    if j * hop < u["s"] - 0.02:
                        u["s"], u["rule"] = j * hop, "fricative"
    # monotonic unit starts
    for u_i in range(1, len(units)):
        units[u_i]["s"] = max(units[u_i]["s"], units[u_i - 1]["s"] + 0.03)
    for k, w in enumerate(words):
        us = [u for u in units if u["k"] == k]
        w["start"] = us[0]["s"]
        w["start_rule"] = us[0]["rule"]
        w["unit_starts"] = [u["s"] for u in us]
    for k, w in enumerate(words):
        nxt = words[k + 1]["start"] if k + 1 < len(words) else len(r) * hop
        e = max(w["ctc_end"], w["start"] + 0.08)
        j0 = int(w["start"] / hop)
        j1 = int(e / hop)
        level = np.percentile(r[j0:max(j1, j0 + 1)], 90)
        jn = int(nxt / hop)
        low = r < level - 15.0
        q = None
        j = j1
        need = int(0.06 / hop)
        while j < min(jn, n - need):
            if low[j] and low[j:j + need].all():
                q = j * hop
                break
            j += 1
        end = min(q, nxt) if q is not None else nxt
        end = max(end, w["start"] + 0.04)
        if nxt - end < 0.03:
            end = nxt
        w["end"] = end
        fx = fix.get((w["li"], w["ti"]))
        if fx is not None:
            w["manual"] = True
            if "end" in fx:
                end = fx["end"]
        w["end"] = end
        us = w["unit_starts"]
        w["subs"] = [(us[i], us[i + 1] if i + 1 < len(us) else end) for i in range(len(us))]
    return words


def detect_extras(words, f):
    """Vocal activity (vocal stem) not covered by any lyric word: instrumental
    gaps, breaths, or (per the treatment's "tease"/"name" repeats) ad-libbed
    repeats. Reported in data/lyrics.json['extras'] and README-whatif.md."""
    from scipy.ndimage import median_filter
    hop = f["hop"]
    r = median_filter(f["rms_db"], 9)
    act = r > -36
    cover = np.zeros_like(act)
    for w in words:
        cover[int((w["start"] - 0.1) / hop):int((w["end"] + 0.1) / hop)] = True
    m = act & ~cover
    out = []
    for a, b in runs(m):
        if out and a * hop - out[-1][1] < 0.4:
            out[-1][1] = b * hop
        else:
            out.append([a * hop, b * hop])
    out = [x for x in out if x[1] - x[0] >= 0.5]
    return [dict(start=round(a, 2), end=round(b, 2), desc="unlisted vocal activity "
                 "(backing vocal / ad-lib / breath / held note tail)") for a, b in out]


def whisper_words():
    W = json.loads((common.WORK / "whisper_words.json").read_text())
    return [(w["word"].strip(), w["start"], w["end"]) for w in W]


def norm(t):
    return re.sub(r"[^a-z]", "", t.lower())


def map_whisper(words, ww):
    """Fuzzy sequence alignment of whisper words to lyric tokens."""
    a = [norm("".join(pron(w["w"]))) for w in words]
    b = [norm(x[0]) for x in ww]
    sm = SequenceMatcher(a=a, b=b, autojunk=False)
    m = {}
    for blk in sm.get_opcodes():
        tag, i1, i2, j1, j2 = blk
        if tag == "equal":
            for d in range(i2 - i1):
                m[i1 + d] = ww[j1 + d]
        elif tag == "replace" and (i2 - i1) == (j2 - j1):
            for d in range(i2 - i1):
                m[i1 + d] = ww[j1 + d]
    for i, w in enumerate(words):
        x = m.get(i)
        # reject mapping if wildly off in time (fuzzy false matches, e.g. against
        # a hallucinated repeat elsewhere in the whisper transcript)
        if x is not None and abs(x[1] - w["start"]) > 1.5:
            x = None
        w["whisper"] = None if x is None else (round(x[1], 3), round(x[2], 3))
    return words


def confidence(words, alt):
    for i, w in enumerate(words):
        ds = [abs(a[i]["start"] - w["ctc_start"]) for k, a in alt.items()]
        agree = np.mean([d <= 0.06 for d in ds])
        p = min(1.0, w["conf"] / 0.5)
        wh = w.get("whisper")
        wagree = 0.5 if wh is None else float(abs(wh[0] - w["start"]) <= 0.15)
        c = 0.35 + 0.3 * agree + 0.2 * p + 0.15 * wagree
        if w.get("manual"):
            fx = FIX.get((w["li"], w["ti"]), {})
            c = fx.get("conf", max(c, 0.8))
        w["conf_final"] = round(float(np.clip(c, 0, 1)), 2)
    return words


def main(plots=False):
    L = common.load_lyrics_src()
    toks = [t.split(" ") for _, _, t in L]
    E = emissions(PRIMARY)
    sp, score, _, _ = align(E, toks, anchors=ANCHORS, line_windows=LINE_WINDOWS)
    words = word_table(sp, toks)
    alt = {}
    for k in ALTS:
        s2, _, _, _ = align(emissions(k), toks, anchors=ANCHORS, line_windows=LINE_WINDOWS)
        alt[k] = word_table(s2, toks)
    f = load_feats()
    words = refine(words, f, FIX)
    # enforce monotonic / non-overlap
    for k in range(1, len(words)):
        if words[k]["start"] < words[k - 1]["start"] + 0.02:
            words[k]["start"] = words[k - 1]["start"] + 0.02
        if words[k - 1]["end"] > words[k]["start"]:
            words[k - 1]["end"] = words[k]["start"]
    words = map_whisper(words, whisper_words())
    words = confidence(words, alt)
    (common.WORK / "align_debug.json").write_text(json.dumps(dict(words=words, alt=alt), indent=1, default=float))

    lines = []
    for li, (s0, e0, text) in enumerate(L):
        ws = [w for w in words if w["li"] == li]
        assert [w["w"] for w in ws] == text.split(" ")
        out = []
        for w in ws:
            d = dict(w=w["w"], start=round(w["start"], 3), end=round(w["end"], 3), conf=w["conf_final"])
            if len(w["subs"]) > 1:
                d["syl"] = [[round(a, 3), round(b, 3)] for a, b in w["subs"]]
            out.append(d)
        lines.append(dict(i=li, text=text, start=out[0]["start"], end=out[-1]["end"], words=out))
    doc = dict(lines=lines, extras=detect_extras(words, f), notes=NOTES)
    (common.DATA / "lyrics.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False))
    print("wrote", common.DATA / "lyrics.json", "score", score)
    if plots:
        make_plots(words, alt, L)
    return words, alt


def make_plots(words, alt, L):
    from qa_plot import plot
    ww = whisper_words()
    for li, (s0, e0, text) in enumerate(L):
        ws = [w for w in words if w["li"] == li]
        t0 = min(ws[0]["start"], ws[0]["ctc_start"]) - 0.8
        t1 = max(ws[-1]["end"], ws[-1]["ctc_end"]) + 0.6
        t1 = min(t1, t0 + 7)
        tracks = [
            ("final", [(w["w"], w["start"], w["end"]) for w in words]),
            ("fused-ctc", [(w["w"], w["ctc_start"], w["ctc_end"]) for w in words]),
            ("subwords", [(" ".join(pron(w["w"])).split()[i] if len(w["subs"]) > 1 else "", a, b)
                          for w in words for i, (a, b) in enumerate(w["subs"])]),
            ("mms", [(w["w"], w["start"], w["end"]) for w in alt["mms"]]),
            ("lv60k", [(w["w"], w["start"], w["end"]) for w in alt["lv60k"]]),
            ("whisper", ww),
        ]
        plot(t0, t1, tracks, common.QA / f"line_{li:02d}.png", title=f"L{li}: {text}")


NOTES = (
    "Method (forked from mexicat/pdoom-video's analysis/ pipeline; adapted for this "
    "song, see analysis/README-whatif.md): (1) CTC emissions (20 ms frames) of the "
    "Demucs vocal stem from two acoustic models, torchaudio MMS_FA and "
    "wav2vec2-large-lv60k-960h, each on the mono sum and on the left and right "
    "channels, fused as a probability mixture; (2) one global constrained Viterbi "
    "forced alignment of all 13 lines over the whole song with a garbage 'star' "
    "token between lines to absorb instrumental gaps and backing vocals, "
    "constrained per line to a rough time window from the whisper.cpp mix "
    "reference; (3) signal refinement per word on the vocal stem: start moved to "
    "the voice re-entry after a rest, snapped to the nearest spectral-flux onset, "
    "or moved back to the start of s/sh/ch/f/th frication; ends = next word start "
    "when legato, else when the voice drops 15 dB below the word level; (4) "
    "cross-check against whisper.cpp (large-v3) word timestamps on the vocal stem "
    "and the individual models/channels. "
    "conf: 0.35 + agreement of the independent alignments (<=60 ms) + CTC "
    "posterior + whisper agreement; manual fixes carry their own conf."
)

if __name__ == "__main__":
    main(plots="--plots" in sys.argv)
