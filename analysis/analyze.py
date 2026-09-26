"""Music analysis -> data/audio.json (forked from mexicat/pdoom-video's
analyze.py; adapted for this song, see analysis/README-whatif.md).

  * constant-tempo beat grid (tempo + phase fitted to drum / mix onsets, phase
    refined on kick attacks), downbeats (bar phase from beat-synchronous
    chroma novelty: chord changes land on the downbeat), sections on downbeats,
  * 100 fps normalized envelopes (mix rms / low / mid / high, stem rms),
  * kick / snare / hat onsets from the drums stem, vocal note onsets.

All times are in the gapless-mp3 timeline; unlike pdoom, our Demucs stems were
separated directly from a gapless-decoded WAV (see common.py), so no stem-time
offset correction is needed.

Run:  uv run python analyze.py [--plots]
"""
import common
import json
import math
import sys

import numpy as np
import librosa
from scipy.ndimage import maximum_filter1d, median_filter, uniform_filter1d
from scipy.signal import butter, find_peaks, sosfiltfilt

SR = 44100
FPS = 100

# Tempo search range. pdoom's script hardcoded 125-138 BPM (its own producer
# knew the DAW tempo); we don't have that, so this was found empirically (see
# README-whatif.md "Tempo"): a full 50-200 BPM onset-alignment search finds
# strong candidates at 74 and its octaves 37/148/222 (the classic tempo-
# tracking octave ambiguity). 74 BPM is confirmed by (a) low jitter (~18 ms)
# fitting the sparse kick onsets to a 74 BPM/0.811 s-period grid, (b) 148 and
# 222 BPM scored lower once the "sparser grid scores higher" bias is accounted
# for, and (c) it matches the treatment's "slow and spacious" description
# (148 BPM would read as a moderately fast pop tempo, not a ballad).
BPM_LO, BPM_HI = 60.0, 90.0

# This song has no repeating chorus with a known chord chart (pdoom's had
# "DOOM" landing on a bar-13/33/53/69 downbeat by construction); chapters are
# each a single short phrase, not a bar-numbered verse/chorus form. Sections
# are therefore built at runtime from the lyric lines' CTC-aligned start
# times, snapped back to the nearest downbeat (see `build_sections`), rather
# than a hand-authored bar-number table.
CHAPTERS = [
    # (name, index of this chapter's first data/lyrics.json line, or None for
    # the instrumental intro/outro that carry no lyric line of their own)
    ("book", None),
    ("lost", 0),
    ("door", 2),
    ("dogs", 3),
    ("cat", 4),
    ("temp", 5),
    ("storm", 7),
    ("tease", 8),
    ("alone", 9),
    ("words", 10),
    ("stranger", 11),
    ("dark", 12),
    ("close", None),  # outro; ends at duration
]


# ---------------------------------------------------------------------------
def band_sos(lo, hi, sr):
    if lo and hi:
        return butter(4, [lo, hi], btype="band", fs=sr, output="sos")
    if hi:
        return butter(4, hi, btype="low", fs=sr, output="sos")
    return butter(4, lo, btype="high", fs=sr, output="sos")


def frame_rms(x, sr, fps=FPS, win=2048):
    hop = sr / fps
    n = int(math.ceil(len(x) / sr * fps))
    pad = np.pad(x, (win // 2, win // 2 + int(hop) + 2))
    idx = (np.arange(n) * hop).astype(int)
    c = np.concatenate([[0.0], np.cumsum(pad.astype(np.float64) ** 2)])
    e = (c[idx + win] - c[idx]) / win
    return np.sqrt(np.maximum(e, 0))


def smooth_env(x, fps=FPS, attack=0.010, release=0.090):
    """One-pole follower: fast attack, slower release (visual friendly)."""
    aa = math.exp(-1 / (attack * fps))
    ar = math.exp(-1 / (release * fps))
    y = np.empty_like(x)
    s = 0.0
    for i, v in enumerate(x):
        a = aa if v > s else ar
        s = a * s + (1 - a) * v
        y[i] = s
    return y


def norm01(x, pct=99.0):
    ref = np.percentile(x, pct)
    return np.clip(x / (ref + 1e-12), 0, 1)


# ---------------------------------------------------------------------------
def fit_grid(drums, mix, sr, duration, bpm_lo=BPM_LO, bpm_hi=BPM_HI):
    """Constant-tempo grid: coarse tempo/phase search on spectral-flux onset
    envelopes, then phase refinement on kick attack times."""
    hop = 64
    od = librosa.onset.onset_strength(y=librosa.resample(drums, orig_sr=sr, target_sr=22050),
                                      sr=22050, hop_length=hop // 2, lag=1, max_size=1)
    om = librosa.onset.onset_strength(y=librosa.resample(mix, orig_sr=sr, target_sr=22050),
                                      sr=22050, hop_length=hop // 2, lag=1, max_size=1)
    o = od / (np.percentile(od, 99) + 1e-9) + om / (np.percentile(om, 99) + 1e-9)
    ofps = 22050 / (hop // 2)

    def score(P, off):
        ts = off + P * np.arange(int(duration / P) + 1)
        idx = np.round(ts * ofps).astype(int)
        idx = idx[(idx > 2) & (idx < len(o) - 2)]
        return np.maximum.reduce([o[idx - 1], o[idx], o[idx + 1]]).mean()

    best = (0, None, None)
    for bpm in np.arange(bpm_lo, bpm_hi, 0.02):
        P = 60 / bpm
        for off in np.arange(0, P, 0.004):
            s = score(P, off)
            if s > best[0]:
                best = (s, bpm, off)
    _, bpm, off = best
    for b2 in np.arange(bpm - 0.02, bpm + 0.02, 0.001):  # fine
        P = 60 / b2
        for o2 in np.arange(off - 0.01, off + 0.01, 0.001):
            s = score(P, o2)
            if s > best[0]:
                best = (s, b2, o2)
    _, bpm, off = best
    P = 60 / bpm
    # refine phase on kick attacks (steepest rise of low-band log energy)
    kick_t, _ = band_onsets(drums, sr, None, 120, win=0.012, min_gap=0.2, rel_db=12)
    n = np.round((kick_t - off) / P)
    res = kick_t - (off + n * P)
    res = res[np.abs(res) < 0.06]
    off = off + float(np.median(res))
    # first beat >= 0
    off = off - P * math.floor(off / P)
    return bpm, P, off, res


def pick_downbeat_phase(harm, sr, beats):
    """Bar phase (which of every 4 beats is a downbeat): beat-synchronous
    chroma novelty on the harmonic stems (bass+other) -- chord changes land on
    downbeats. Returns the beat-array phase (0-3) with the highest average
    novelty (pdoom instead knew its chord chart by construction)."""
    chroma = librosa.feature.chroma_cqt(y=harm, sr=sr, hop_length=2048)
    times = librosa.frames_to_time(np.arange(chroma.shape[1]), sr=sr, hop_length=2048)
    bsync = []
    for i in range(len(beats) - 1):
        m = (times >= beats[i]) & (times < beats[i + 1])
        bsync.append(chroma[:, m].mean(axis=1) if m.sum() else (bsync[-1] if bsync else chroma[:, 0]))
    bsync = np.array(bsync)
    bsync = bsync / (np.linalg.norm(bsync, axis=1, keepdims=True) + 1e-9)
    novelty = 1 - np.sum(bsync[1:] * bsync[:-1], axis=1)
    scores = [novelty[phase::4].mean() for phase in range(4)]
    return int(np.argmax(scores)), scores


def band_onsets(x, sr, lo, hi, win=0.010, hop_s=0.002, min_gap=0.08, rel_db=10.0,
                decay_win=None):
    """Onsets in a frequency band: steepest rise of the band's log-energy
    envelope; strength = peak dB rise.  Returns (times, rise_db[, decay_db])."""
    xb = sosfiltfilt(band_sos(lo, hi, sr), x)
    h = int(hop_s * sr)
    w = int(win * sr)
    e = np.convolve(xb.astype(np.float64) ** 2, np.ones(w) / w, mode="same")[::h]
    db = 10 * np.log10(e + 1e-10)
    fps = sr / h  # exact frame rate (h is an integer number of samples)
    d = np.diff(db, prepend=db[0])
    d = uniform_filter1d(d, 3)
    # rise over ~20 ms
    lag = int(0.02 * fps)
    rise = db - np.concatenate([np.full(lag, db[0]), db[:-lag]])
    floor = median_filter(db, int(1.0 * fps) | 1)
    pk, _ = find_peaks(rise, height=rel_db, distance=int(min_gap * fps))
    times, strength = [], []
    for p in pk:
        a = max(0, p - lag)
        # attack time: steepest slope within the rise window
        q = a + int(np.argmax(d[a:p + 1]))
        peak_db = db[p:p + int(0.03 * fps)].max()
        if peak_db < floor[p] + 3:
            continue
        times.append(q / fps)
        strength.append(peak_db)
    return np.array(times), np.array(strength)


def drum_onsets(d, sr, grid_P, grid_off):
    """Kick / snare / hat onsets from the drums stem. This song's drums are
    silent for the first ~80s (see README-whatif.md "Structure"); thresholds
    are otherwise the same band/attack heuristics as pdoom's script."""
    # KICK: <120 Hz
    kt, kdb = band_onsets(d, sr, None, 120, win=0.012, min_gap=0.15, rel_db=12)
    # SNARE: 1.5-5 kHz attacks with a noisy 0.5-5 kHz tail 40-120 ms later
    # within 8 dB of the loudest tail in +-2.5 s and within 25 dB of the
    # song-wide level (rejects stem bleed / kick-only beats / hats).
    st, sdb = band_onsets(d, sr, 1500, 5000, win=0.010, min_gap=0.15, rel_db=10)
    xb = sosfiltfilt(band_sos(500, 5000, sr), d)
    e = np.sqrt(np.convolve(xb.astype(np.float64) ** 2, np.ones(441) / 441, mode="same"))
    tail = np.array([20 * np.log10(e[int((t + 0.04) * sr):int((t + 0.12) * sr)].mean() + 1e-9) for t in st])
    rel = np.array([tail[i] - tail[np.abs(st - st[i]) < 2.5].max() for i in range(len(st))])
    thr = np.percentile(tail, 95) - 25
    keep = (rel > -8) & (tail > thr)
    st, sdb, stail = st[keep], sdb[keep], tail[keep]
    # HAT: >7 kHz, short; drop those coinciding with snares/kicks (their
    # transients also reach 7k+)
    ht, hdb = band_onsets(d, sr, 7000, None, win=0.006, min_gap=0.06, rel_db=9)
    for other, gap in ((st, 0.04), (kt, 0.03)):
        if len(other) and len(ht):
            dist = np.min(np.abs(ht[:, None] - other[None, :]), axis=1)
            keep = dist > gap
            ht, hdb = ht[keep], hdb[keep]
    return (kt, kdb), (st, stail), (ht, hdb), thr


def strength01(db_vals, lo_pct=5, hi_pct=95):
    if len(db_vals) == 0:
        return db_vals
    lo, hi = np.percentile(db_vals, lo_pct), np.percentile(db_vals, hi_pct)
    return np.clip((db_vals - lo) / (hi - lo + 1e-9) * 0.8 + 0.2, 0, 1)


def vocal_onsets(v, sr):
    """Vocal note onsets: log-mel spectral flux peaks (5 ms hop) plus pitch
    jumps > 0.8 semitone while voiced, restricted to active vocal frames."""
    f = dict(np.load(common.WORK / "vocal_feats.npz"))
    hop = float(f["hop_s"])
    on = f["onset"]
    rms = f["rms_db"]
    loc = maximum_filter1d(rms, int(2.0 / hop))
    active = (rms > -45) & (rms > loc - 25)
    thr = uniform_filter1d(on, int(0.4 / hop)) * 1.5 + 0.15 * np.percentile(on, 99)
    pk, _ = find_peaks(on, height=0, distance=int(0.09 / hop))
    pk = [p for p in pk if on[p] > thr[p] and active[min(len(active) - 1, p + int(0.03 / hop))]]
    t_flux = np.array(pk) * hop
    s_flux = np.array([on[p] for p in pk])
    # pitch jumps (legato note changes that have little spectral flux)
    f0 = f["f0"]
    midi = librosa.hz_to_midi(np.where(f["voiced"] > 0, f0, np.nan))
    med = median_filter(np.nan_to_num(midi, nan=0), 9)
    jumps = []
    w = int(0.04 / hop)
    for i in range(w, len(med) - w):
        a, b = med[i - w], med[i + w]
        if a > 0 and b > 0 and abs(b - a) > 0.8 and active[i]:
            jumps.append(i)
    t_pitch, last = [], -1e9
    for i in jumps:
        if i - last > int(0.1 / hop):
            t_pitch.append(i * hop)
        last = i
    t_pitch = np.array(t_pitch)
    ts = list(zip(t_flux, s_flux / (np.percentile(s_flux, 95) + 1e-9)))
    for t in t_pitch:
        if len(t_flux) == 0 or np.min(np.abs(t_flux - t)) > 0.08:
            ts.append((t, 0.35))
    ts.sort()
    return [(float(t), float(min(1.0, max(0.1, s)))) for t, s in ts]


def build_sections(downbeats, duration):
    """Each named chapter starts at the downbeat at-or-before its first lyric
    line's CTC-aligned start (this naturally folds in a short instrumental
    pickup/lead-in, matching the acceptance rule "sections ... including
    instrumental gaps between lines"); book/close bookend the instrumental
    intro/outro. Sections are forced contiguous (each ends where the next
    starts) so they cover [0, duration) with no gaps."""
    lyr = json.loads((common.DATA / "lyrics.json").read_text())
    lines = lyr["lines"]

    def db_before(t):
        idx = np.searchsorted(downbeats, t, side="right") - 1
        return float(downbeats[max(idx, 0)])

    def db_after(t):
        idx = np.searchsorted(downbeats, t, side="left")
        return float(downbeats[min(idx, len(downbeats) - 1)])

    starts = []
    for name, li in CHAPTERS:
        if name == "book":
            starts.append((name, 0.0))
        elif name == "close":
            starts.append((name, db_after(lines[-1]["end"])))
        else:
            starts.append((name, db_before(lines[li]["start"])))
    sections = []
    for i, (name, s) in enumerate(starts):
        e = starts[i + 1][1] if i + 1 < len(starts) else duration
        sections.append(dict(name=name, start=round(s, 3), end=round(e, 3)))
    return sections


# ---------------------------------------------------------------------------
def main(plots=False):
    mix, _ = common.load_mix(SR)
    duration = len(mix) / SR
    stems = {n: common.load_stem(n, sr=SR)[0][: len(mix)] for n in ("vocals", "drums", "bass", "other")}
    for n in stems:
        if len(stems[n]) < len(mix):
            stems[n] = np.pad(stems[n], (0, len(mix) - len(stems[n])))

    bpm, P, off, kick_res = fit_grid(stems["drums"], mix, SR, duration)
    print(f"tempo {bpm:.3f} BPM  period {P:.5f}s  first beat {off:.4f}s  kick residual sd {kick_res.std()*1000:.1f} ms")
    beats = off + P * np.arange(int((duration - off) / P) + 1)
    phase, phase_scores = pick_downbeat_phase(stems["bass"] + stems["other"], SR, beats)
    print(f"downbeat phase {phase} (chroma novelty by phase: {[round(s,3) for s in phase_scores]})")
    downbeats = beats[phase::4]
    bar_t = lambda k: float(downbeats[0] + 4 * P * k)

    # envelopes -------------------------------------------------------------
    n = int(math.ceil(duration * FPS))
    env = {}
    env["rms"] = frame_rms(mix, SR)[:n]
    for name, (lo, hi) in {"low": (None, 150), "mid": (150, 2000), "high": (4000, None)}.items():
        env[name] = frame_rms(sosfiltfilt(band_sos(lo, hi, SR), mix), SR)[:n]
    for s in ("vocal", "drums", "bass", "other"):
        env[s] = frame_rms(stems["vocals" if s == "vocal" else s], SR)[:n]
    for k in env:
        e = smooth_env(env[k])
        env[k] = [round(float(x), 3) for x in norm01(e)]
        assert len(env[k]) == n

    # onsets -------------------------------------------------------------------
    (kt, kdb), (st, sdb), (ht, hdb), sn_thr = drum_onsets(stems["drums"], SR, P, off)
    onsets = {
        "kick": [[round(float(t), 3), round(float(s), 3)] for t, s in zip(kt, strength01(kdb))],
        "snare": [[round(float(t), 3), round(float(s), 3)] for t, s in zip(st, strength01(sdb))],
        "hat": [[round(float(t), 3), round(float(s), 3)] for t, s in zip(ht, strength01(hdb))],
        "vocal": [[round(t, 3), round(s, 3)] for t, s in vocal_onsets(stems["vocals"], SR)],
    }

    # sections -------------------------------------------------------------------
    sections = build_sections(downbeats, duration)

    doc = dict(
        duration=round(duration, 3),
        bpm=round(bpm, 3),
        beat_period=round(P, 5),
        time_signature=4,
        beats=[round(float(t), 3) for t in beats],
        downbeats=[round(float(t), 3) for t in downbeats],
        sections=sections,
        fps=FPS,
        **env,
        onsets=onsets,
        notes=NOTES.format(bpm=bpm, off=off, P=P, first_db=float(downbeats[0]),
                           sn=len(st), kk=len(kt), hh=len(ht)),
    )
    (common.DATA / "audio.json").write_text(json.dumps(doc, separators=(",", ":")))
    print("wrote", common.DATA / "audio.json", f"{len(beats)} beats, {len(downbeats)} downbeats, "
          f"{len(kt)} kicks, {len(st)} snares, {len(ht)} hats, {len(onsets['vocal'])} vocal onsets")
    if plots:
        make_plots(doc, stems)
    return doc


NOTES = (
    "Method (forked from mexicat/pdoom-video's analysis/analyze.py; adapted for "
    "this song, see analysis/README-whatif.md): tempo is constant, {bpm:.3f} BPM "
    "(period {P:.5f} s), fitted on drum+mix onset envelopes over a 60-90 BPM search "
    "(pdoom's script instead searched a known 125-138 BPM DAW-tempo range), phase "
    "refined on kick attack times (first beat {off:.3f} s); the drums stem is silent "
    "until ~80s and after ~155s (this song's drums only play under 'storm'..'dark'), "
    "but the mix onset envelope carries the beat through the drum-less sections. "
    "Bar phase (downbeat = every 4th beat) was picked automatically from "
    "beat-synchronous chroma novelty on the bass+other stems (chord changes land on "
    "downbeats): first downbeat {first_db:.3f} s; pdoom instead hand-verified bar "
    "phase from a known chord chart. "
    "Sections: this song has no verse/chorus form with a bar-numbered chord chart "
    "like pdoom's, so each chapter (data/lyrics.json line groups, matching "
    "docs/TREATMENT.md's chapter table) starts at the downbeat at or before its "
    "first line's CTC-aligned start (folding in a short instrumental pickup), and "
    "runs to the next chapter's start; 'book' (0 -> first chapter) and 'close' "
    "(last chapter's end -> duration) are the instrumental intro/outro. "
    "Envelopes: 100 fps, frame i centred at i/100 s, 46 ms RMS window, one-pole "
    "smoothing (10 ms attack / 90 ms release), each divided by its own 99th "
    "percentile and clipped to 0..1 (linear amplitude). low <150 Hz, mid 150-2000 Hz, "
    "high >4 kHz of the full mix; vocal/drums/bass/other = stem RMS. "
    "Onsets [time, strength 0-1] from the drums stem: kick = attack (steepest rise) "
    "of the <120 Hz band ({kk}); snare = 1.5-5 kHz attacks whose 0.5-5 kHz noise tail "
    "40-120 ms later is in the loudest local class ({sn}); hat = >7 kHz attacks not "
    "within 40 ms of a snare or 30 ms of a kick ({hh}). All three are sparse and only "
    "present from ~80s to ~155s (see above). vocal = note onsets from the vocal stem "
    "(log-mel flux peaks + legato pitch jumps > 0.8 semitone), including backing "
    "vocals / held-note re-articulations."
)


def make_plots(doc, stems):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    t = np.arange(len(doc["rms"])) / FPS
    wins = [(s["start"], s["end"]) for s in doc["sections"]]
    for (t0, t1) in wins:
        fig, ax = plt.subplots(3, 1, figsize=(22, 11), sharex=True,
                               gridspec_kw=dict(height_ratios=[2, 1.6, 1.4]))
        d = stems["drums"][int(t0 * SR):int(t1 * SR)]
        S = librosa.amplitude_to_db(np.abs(librosa.stft(d, n_fft=1024, hop_length=128)), ref=np.max)
        ax[0].imshow(S, origin="lower", aspect="auto", cmap="magma", vmin=-60, vmax=0,
                     extent=[t0, t0 + S.shape[1] * 128 / SR, 0, SR / 2])
        ax[0].set_ylim(0, 12000)
        ax[0].set_ylabel("drums stem")
        m = (t >= t0) & (t <= t1)
        for k, c in [("rms", "k"), ("low", "tab:red"), ("mid", "tab:green"), ("high", "tab:blue")]:
            ax[1].plot(t[m], np.array(doc[k])[m], color=c, lw=1, label=k)
        ax[1].legend(loc="upper left", fontsize=8)
        for k, c in [("vocal", "tab:purple"), ("drums", "tab:orange"), ("bass", "tab:brown"), ("other", "tab:olive")]:
            ax[2].plot(t[m], np.array(doc[k])[m], color=c, lw=1, label=k)
        ax[2].legend(loc="upper left", fontsize=8)
        for b in doc["beats"]:
            if t0 <= b <= t1:
                for a_ in ax:
                    a_.axvline(b, color="gray", lw=0.6, alpha=0.6)
        for b in doc["downbeats"]:
            if t0 <= b <= t1:
                for a_ in ax:
                    a_.axvline(b, color="c" if a_ is ax[0] else "k", lw=1.8)
        for name, y, c in [("kick", 1500, "tab:red"), ("snare", 5000, "w"), ("hat", 9500, "yellow")]:
            for (ot, s) in doc["onsets"][name]:
                if t0 <= ot <= t1:
                    ax[0].plot([ot], [y], marker="v", color=c, ms=4 + 8 * s)
        for (ot, s) in doc["onsets"]["vocal"]:
            if t0 <= ot <= t1:
                ax[2].plot([ot], [1.02], marker="v", color="tab:purple", ms=3 + 6 * s)
        for s in doc["sections"]:
            if t0 <= s["start"] <= t1:
                ax[1].text(s["start"], 1.02, s["name"], fontsize=14, color="tab:red")
                for a_ in ax:
                    a_.axvline(s["start"], color="tab:red", lw=2.5)
        ax[2].set_xlim(t0, t1)
        fig.tight_layout()
        fig.savefig(common.QA / f"audio_{s['name'] if False else int(t0):03d}.png", dpi=65)
        plt.close(fig)
    fig, ax = plt.subplots(2, 1, figsize=(24, 7), sharex=True)
    for k, c in [("rms", "k"), ("low", "tab:red"), ("high", "tab:blue")]:
        ax[0].plot(t, doc[k], color=c, lw=0.6, label=k)
    for k, c in [("vocal", "tab:purple"), ("drums", "tab:orange"), ("bass", "tab:brown"), ("other", "tab:olive")]:
        ax[1].plot(t, doc[k], color=c, lw=0.6, label=k)
    for s in doc["sections"]:
        for a_ in ax:
            a_.axvline(s["start"], color="tab:red", lw=1.5)
        ax[0].text(s["start"] + 0.2, 1.03, s["name"], fontsize=10, color="tab:red")
    for a_ in ax:
        a_.legend(loc="upper right", fontsize=8)
    ax[1].set_xticks(np.arange(0, 177, 5))
    fig.tight_layout()
    fig.savefig(common.QA / "audio_overview.png", dpi=65)
    plt.close(fig)


if __name__ == "__main__":
    main(plots="--plots" in sys.argv)
