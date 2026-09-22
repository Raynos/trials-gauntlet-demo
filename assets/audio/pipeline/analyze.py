"""Measure every ACE-Step render and find its best bar-aligned loop — picking by numbers, never by ear.

    ~/tools/music-analysis/.venv/bin/python assets/audio/pipeline/analyze.py RENDER_DIR [--vocals]

Per render (RENDER_DIR/<id>-s<seed>.wav + .json sidecar) writes RENDER_DIR/<stem>.metrics.json:

  lufs / tp_dbtp / clip      integrated loudness (BS.1770), 4× oversampled true peak, samples at |x| ≥ 0.999
  silence_s                  longest internal run of 100 ms windows under −50 dBFS (lead-in / tail excluded)
  bands                      share of energy per band, dB re total: sub <60, engine 90–350, lowmid 350–1k,
                             presence 1–4k, air >4k. The engine synth's pulse train sits at 12–83 Hz, its pipe
                             resonator 95–140 Hz, the second pipe mode 225–330 Hz (src/audio/dsp/engine.ts):
                             a ride loop that leaves the 90–350 band thinner leaves the engine audible.
  tempo                      librosa beat tracking seeded at the prompt tempo: bpm, error vs target %, beat
                             interval CV % (stability), and the same over the loop body only
  vocals                     (--vocals) Demucs htdemucs separation: vocal stem RMS re the mix, dB, and the share
                             of 1 s windows where the vocal stem is within 12 dB of the mix (a sung line would be)
  loop                       best window of N whole bars: start t0 on a detected beat, length refined to the sample
                             by cross-correlation; `seam_sim` (mel cosine, 1 bar either side of the seam vs the
                             same bar in the natural flow), `seam_click` (|Δ| at the wrap / p99.9 |Δ|),
                             and, against the music's own continuation (what followed the window's last sample
                             in the render): `seam_step_db` (50 ms RMS step the wrap adds over the natural step),
                             `seam_flux_x` (spectral flux of the wrap / flux of the natural continuation; 1.0 = the
                             ear gets exactly the change it would have got), `seam_err_db` (the 50 ms the loop
                             plays after the wrap vs the 50 ms that really followed, error re signal)
"""
import argparse
import glob
import json
import os
import sys

import numpy as np
import soundfile as sf
import librosa
import pyloudnorm as pyln
from scipy.signal import resample_poly, welch

SR = 48000
BANDS = {"sub": (20, 60), "engine": (90, 350), "lowmid": (350, 1000), "presence": (1000, 4000), "air": (4000, 16000)}
LOOP_BARS = {"menu": [32, 24], "map": [24, 16, 32], "coast": [32, 24], "alpine": [32, 24], "quarry": [24, 32, 16],
             "snowline": [32, 40, 24], "results": []}
LOOP_RANGE_S = (40.0, 80.0)


def db(x):
    return 10 * np.log10(np.maximum(x, 1e-20))


def true_peak_db(x):
    up = resample_poly(x, 4, 1, axis=0)
    return 20 * np.log10(max(np.max(np.abs(up)), 1e-9))


def lufs(x, sr=SR):
    m = pyln.Meter(sr)
    return float(m.integrated_loudness(x))


def band_shares(mono, sr=SR):
    f, p = welch(mono, sr, nperseg=8192)
    tot = p[(f >= 20) & (f <= 16000)].sum()
    return {k: round(float(db(p[(f >= lo) & (f < hi)].sum() / tot)), 2) for k, (lo, hi) in BANDS.items()}


def rms_frames(mono, win):
    n = len(mono) // win
    fr = mono[: n * win].reshape(n, win)
    return 10 * np.log10(np.maximum((fr ** 2).mean(axis=1), 1e-12))


def longest_silence(mono, sr=SR):
    r = rms_frames(mono, sr // 10)
    loud = np.where(r > -50)[0]
    if len(loud) == 0:
        return len(r) / 10
    r = r[loud[0]: loud[-1] + 1]
    best = cur = 0
    for v in r:
        cur = cur + 1 if v <= -50 else 0
        best = max(best, cur)
    return best / 10


def tempo_stats(mono, target, sr=SR, t0=None, t1=None):
    y = mono if t0 is None else mono[int(t0 * sr): int(t1 * sr)]
    y22 = librosa.resample(y, orig_sr=sr, target_sr=22050)
    tempo, beats = librosa.beat.beat_track(y=y22, sr=22050, start_bpm=target, tightness=400, units="time")
    ibi = np.diff(beats)
    cv = float(np.std(ibi) / np.mean(ibi) * 100) if len(ibi) > 4 else 99.0
    # the tracker's own tempo is quantised to its autocorrelation bins (~2 %); the median beat interval is not
    tempo = 60.0 / float(np.median(ibi)) if len(ibi) > 4 else float(np.atleast_1d(tempo)[0])
    # half/double-time is the same groove for a loop: fold to the nearest octave of the target
    t = tempo
    while t < target / 1.5:
        t *= 2
    while t > target * 1.5:
        t /= 2
    return dict(bpm=round(t, 2), err_pct=round((t - target) / target * 100, 2), ibi_cv_pct=round(cv, 2)), beats + (t0 or 0)


def vocal_stats(path, mix_mono):
    import torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    global _DEMUCS
    if "_DEMUCS" not in globals():
        _DEMUCS = get_model("htdemucs")
        _DEMUCS.eval()
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    if sr != _DEMUCS.samplerate:
        x = resample_poly(x, _DEMUCS.samplerate, sr, axis=0).astype(np.float32)
    wav = torch.from_numpy(x.T.copy())[None]
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    with torch.no_grad():
        out = apply_model(_DEMUCS, wav, device=dev, split=True, overlap=0.25, progress=False)[0]
    voc = out[_DEMUCS.sources.index("vocals")].mean(0).cpu().numpy()
    mix = wav[0].mean(0).numpy()
    win = _DEMUCS.samplerate
    rv = rms_frames(voc, win)
    rm = rms_frames(mix, win)
    active = rm > -45
    rel = rv[active] - rm[active]
    return dict(vocal_rel_db=round(float(db((voc ** 2).mean() / max((mix ** 2).mean(), 1e-12))), 1),
                vocal_windows_pct=round(float((rel > -12).mean() * 100) if len(rel) else 0.0, 1))


def mel_feats(mono, sr=SR, hop=512):
    y22 = librosa.resample(mono, orig_sr=sr, target_sr=22050)
    S = librosa.feature.melspectrogram(y=y22, sr=22050, hop_length=hop, n_mels=64)
    S = librosa.power_to_db(S + 1e-10)
    C = librosa.feature.chroma_cqt(y=y22, sr=22050, hop_length=hop)
    return S, C, 22050 / hop


def cos(a, b):
    a = a.ravel() - a.mean()
    b = b.ravel() - b.mean()
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def refine_len(mono, t0s, L, sr=SR, span=0.012):
    """Sample-exact loop length: best normalised xcorr of 250 ms after t0 vs after t0 + L, over ±span s."""
    w = int(0.25 * sr)
    a = mono[t0s: t0s + w]
    best, bestk = -2, 0
    rng = int(span * sr)
    base = t0s + L
    seg = mono[base - rng: base + rng + w]
    if len(seg) < 2 * rng + w:
        return L, 0.0
    corr = np.correlate(seg, a, mode="valid")
    energy = np.sqrt(np.convolve(seg ** 2, np.ones(w), mode="valid"))
    nc = corr / (energy * np.linalg.norm(a) + 1e-9)
    k = int(np.argmax(nc))
    return L + (k - rng), float(nc[k])


def find_loop(x, mono, cue, bpm_target, beats, sr=SR):
    S, C, fps = mel_feats(mono, sr)
    dur = len(mono) / sr
    bar = 4 * 60 / bpm_target
    cands = []
    for nb in LOOP_BARS[cue]:
        L = nb * bar
        if not (LOOP_RANGE_S[0] <= L <= LOOP_RANGE_S[1]) or L > dur - 10:
            continue
        for t0 in beats:
            if t0 < 4.0 or t0 + L > dur - 4.0:
                continue
            i0 = int(t0 * fps)
            i1 = int((t0 + L) * fps)
            wb = int(bar * fps)
            if i0 - wb < 0 or i1 + wb >= S.shape[1]:
                continue
            # the bar after the seam must look like the bar after t0, the bar before the seam like the bar before t0
            sim = 0.5 * (cos(S[:, i0: i0 + wb], S[:, i1: i1 + wb]) + cos(S[:, i0 - wb: i0], S[:, i1 - wb: i1]))
            # harmony across the wrap: the chord of the loop's last beat → first beat must be the chord the music
            # actually moved into at t0 + L (chroma over one beat each side)
            wbt = max(1, wb // 4)
            ch = float(np.dot(C[:, i1 - wbt: i1 + wbt].mean(1), C[:, i0 - wbt: i0 + wbt].mean(1))
                       / (np.linalg.norm(C[:, i1 - wbt: i1 + wbt].mean(1)) * np.linalg.norm(C[:, i0 - wbt: i0 + wbt].mean(1)) + 1e-9))
            cands.append((sim + 0.5 * ch, t0, nb, L, sim, ch))
    if not cands:
        return None
    cands.sort(key=lambda c: -c[0])
    best = None
    for pre, t0, nb, L, sim, ch in cands[:16]:
        t0s = int(round(t0 * sr))
        Ls, xc = refine_len(mono, t0s, int(round(L * sr)))
        score = pre + 0.5 * xc
        if best is None or score > best[0]:
            best = (score, sim, ch, xc, t0s, Ls, nb)
    _, sim, ch, xc, t0s, Ls, nb = best
    return dict(t0_s=round(t0s / sr, 4), t0=t0s, len=Ls, len_s=round(Ls / sr, 5), bars=nb, seam_sim=round(sim, 4),
                seam_chroma=round(ch, 4), seam_xcorr=round(xc, 4), bpm_exact=round(nb * 4 * 60 / (Ls / sr), 3))


def build_loop(x, t0, L, sr=SR, xfade_s=0.04):
    """x[t0 : t0+L] with its head crossfaded (equal power) into the audio that followed t0+L."""
    F = int(xfade_s * sr)
    body = x[t0: t0 + L].copy()
    tail = x[t0 + L: t0 + L + F]
    t = np.linspace(0, np.pi / 2, F)[:, None]
    body[:F] = body[:F] * np.sin(t) + tail * np.cos(t)
    return body


def _spec(y):
    return np.log1p(np.abs(np.fft.rfft(y * np.hanning(len(y)))))


def seam_metrics(body, natural, sr=SR):
    """The wrap (body[-1] → body[0]) against the natural continuation (body[-1] → natural[0])."""
    mono = body.mean(axis=1)
    nat = natural.mean(axis=1)
    d = np.abs(np.diff(mono))
    click = abs(mono[0] - mono[-1]) / (np.percentile(d, 99.9) + 1e-9)
    w = int(0.05 * sr)
    tail = db((mono[-w:] ** 2).mean())
    step = abs(tail - db((mono[:w] ** 2).mean())) - abs(tail - db((nat[:w] ** 2).mean()))
    n = 2048
    last = _spec(mono[-n:])
    flux_loop = np.sqrt(((_spec(mono[:n]) - last).clip(min=0) ** 2).sum())
    flux_nat = np.sqrt(((_spec(nat[:n]) - last).clip(min=0) ** 2).sum())
    err = db(((mono[:w] - nat[:w]) ** 2).mean() / max((nat[:w] ** 2).mean(), 1e-12))
    return dict(seam_click=round(float(click), 3), seam_step_db=round(float(step), 2),
                seam_flux_x=round(float(flux_loop / max(flux_nat, 1e-9)), 3), seam_err_db=round(float(err), 1))


def analyze(path, do_vocals):
    side = json.load(open(path[:-4] + ".json"))
    x, sr = sf.read(path, dtype="float64", always_2d=True)
    assert sr == SR, sr
    mono = x.mean(axis=1)
    cue = side["cue"]
    m = dict(stem=os.path.basename(path)[:-4], cue=cue, dur_s=round(len(x) / sr, 2),
             lufs=round(lufs(x), 2), tp_dbtp=round(true_peak_db(x), 2), clip=int((np.abs(x) >= 0.999).sum()),
             silence_s=longest_silence(mono), bands=band_shares(mono))
    t, beats = tempo_stats(mono, side["bpm"])
    m["tempo"] = t
    if do_vocals:
        m["vocals"] = vocal_stats(path, mono)
    if cue != "results":
        lp = find_loop(x, mono, cue, side["bpm"], beats)
        if lp:
            body = build_loop(x, lp["t0"], lp["len"])
            lp.update(seam_metrics(body, x[lp["t0"] + lp["len"]: lp["t0"] + lp["len"] + SR // 10]))
            lp["body_lufs"] = round(lufs(body), 2)
            lp["body_bands"] = band_shares(body.mean(axis=1))
            lt, _ = tempo_stats(mono, side["bpm"], t0=lp["t0_s"], t1=lp["t0_s"] + lp["len_s"])
            lp["body_tempo"] = lt
            lp["body_silence_s"] = longest_silence(body.mean(axis=1))
        m["loop"] = lp
    else:
        r = rms_frames(mono, sr // 100)  # 10 ms
        on = np.where(r > r.max() - 30)[0]
        m["sting"] = dict(onset_s=round(float(on[0] / 100), 2) if len(on) else None,
                          peak_at_s=round(float(np.argmax(r) / 100), 2),
                          end_s=round(float(on[-1] / 100), 2) if len(on) else None,
                          tail_db=round(float(r[-20:].mean() - r.max()), 1))
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--vocals", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    for p in sorted(glob.glob(os.path.join(a.dir, "*.wav"))):
        out = p[:-4] + ".metrics.json"
        if os.path.exists(out) and not a.force:
            continue
        if not os.path.exists(p[:-4] + ".json"):
            continue
        try:
            m = analyze(p, a.vocals)
        except Exception as e:  # keep the batch going; the table shows the failure
            m = dict(stem=os.path.basename(p)[:-4], error=repr(e))
        json.dump(m, open(out, "w"), indent=1)
        print(json.dumps({k: m.get(k) for k in ("stem", "lufs", "tp_dbtp", "tempo", "error")}), flush=True)


if __name__ == "__main__":
    main()
