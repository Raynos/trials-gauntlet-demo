"""Master the picked renders into seamless AAC loops and wire them into the game.

    ~/tools/music-analysis/.venv/bin/python assets/audio/pipeline/publish.py RENDER_DIR \
        --pick menu=menu-a-s11 --pick map=... [--candidates]

For each pick (a render analysed by analyze.py):
  1. cut the loop window analyze.py found (whole bars, sample-exact length) and crossfade its head into the
     audio that followed the window (40 ms equal power) — the sting is trimmed to its onset and faded out;
  2. ride loops only: a −2.5 dB bell at 180 Hz (Q 0.7), the engine's pipe band (src/audio/dsp/engine.ts);
  3. static gain to −16 LUFS integrated, then a look-ahead true-peak limiter to −2.0 dBTP (AAC overshoots by up to ~1.5 dB);
     every filter / limiter runs on three copies of the loop and keeps the middle, so the result is periodic;
  4. pad [last PRE s | loop | first PRE s] (cues.ts explains why) and encode AAC 160 kb/s 48 kHz in .m4a
     (AudioToolbox `aac_at`), named <cue>-<sha8>.m4a under public/audio/;
  5. decode the .m4a back and re-measure: loudness, true peak, the seam at [PRE, PRE+len) and at a 2112-sample
     offset (a decoder that ignores the priming edit list) — both must stay seamless;
  6. write src/audio/music/cues.generated.ts and assets/audio/picks.json.
`--candidates` also encodes every analysed render's loop into assets/audio/candidates/ (git-ignored) so the
user can audition and swap picks.
"""
import argparse
import glob
import hashlib
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly, sosfilt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze import SR, band_shares, build_loop, lufs, seam_metrics, true_peak_db  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PUBLIC = os.path.join(REPO, "public", "audio")
GENERATED = os.path.join(REPO, "src", "audio", "music", "cues.generated.ts")
PICKS = os.path.join(REPO, "assets", "audio", "picks.json")
CANDS = os.path.join(REPO, "assets", "audio", "candidates")
PRE = 0.5
TARGET_LUFS = -16.0
TP_CEIL = -2.0
BITRATE = "160k"
RIDE = {"coast", "alpine", "quarry", "snowline"}
BUDGET_BYTES = 15 * 1024 * 1024


def peaking_sos(f0, gain_db, q, sr=SR):
    a = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / sr
    al = np.sin(w0) / (2 * q)
    b = np.array([1 + al * a, -2 * np.cos(w0), 1 - al * a])
    aa = np.array([1 + al / a, -2 * np.cos(w0), 1 - al / a])
    return np.concatenate([b / aa[0], aa / aa[0]])[None, :]


def circular(fn, body):
    """Apply a stateful process to three copies of a loop and keep the middle one: the output is periodic."""
    n = len(body)
    y = fn(np.concatenate([body, body, body]))
    return y[n: 2 * n]


def limiter(x, ceil_db, sr=SR, look_s=0.005, rel_s=0.08):
    thr = 10 ** (ceil_db / 20)
    up = np.abs(resample_poly(x, 4, 1, axis=0)).max(axis=1)
    tp = up[: len(x) * 4].reshape(len(x), 4).max(axis=1)
    g = np.minimum(1.0, thr / np.maximum(tp, 1e-9))
    la = int(look_s * sr)
    # look-ahead: each sample takes the smallest gain within the next `la` samples
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(g, size=2 * la + 1, mode="nearest")
    rel = np.exp(-1 / (rel_s * sr))
    gl = g.tolist()
    out = [0.0] * len(gl)
    cur = 1.0
    for i, gi in enumerate(gl):  # instant attack (already looked ahead), exponential release
        cur = gi if gi < cur else gi + (cur - gi) * rel
        out[i] = cur
    return x * np.asarray(out)[:, None]


def master(x, cue, loop):
    if cue == "results":
        mono = x.mean(axis=1)
        r = 10 * np.log10(np.maximum(np.convolve(mono ** 2, np.ones(480) / 480, mode="same"), 1e-12))
        on = np.where(r > r.max() - 30)[0]
        s0 = max(0, on[0] - int(0.01 * SR))
        s1 = min(len(x), on[-1] + int(0.3 * SR))
        body = x[s0:s1].copy()
        fade = int(0.25 * SR)
        body[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
        body *= 10 ** ((TARGET_LUFS - lufs(body)) / 20)
        return limiter(body, TP_CEIL), 0
    body = build_loop(x, loop["t0"], loop["len"])
    if cue in RIDE:
        sos = peaking_sos(180, -2.5, 0.7)
        body = circular(lambda y: sosfilt(sos, y, axis=0), body)
    body *= 10 ** ((TARGET_LUFS - lufs(body)) / 20)
    body = circular(lambda y: limiter(y, TP_CEIL), body)
    return body, len(body)


def encode(pcm, out_path):
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, "in.wav")
        sf.write(w, pcm, SR, subtype="FLOAT")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", w, "-c:a", "aac_at", "-b:a", BITRATE, "-ar", str(SR),
                        "-movflags", "+faststart", out_path], check=True)


def decode(path):
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, "out.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-c:a", "pcm_f32le", w], check=True)
        y, sr = sf.read(w, dtype="float64", always_2d=True)
    assert sr == SR
    return y


def verify(path, cue, L, src):
    y = decode(path)
    v = dict(decoded_len=len(y), expected_len=len(src), lufs=round(lufs(y), 2), tp_dbtp=round(true_peak_db(y), 2))
    # where the decoder put sample 0 (ffmpeg trims 1024 of AudioToolbox's 2112 priming samples; Safari reads the
    # edit list) — the padding makes any shift up to PRE harmless, this records what it was
    a = src[: SR // 5].mean(axis=1)
    b = y[: SR // 5 + 4096].mean(axis=1)
    xc = np.correlate(b, a, mode="valid")
    v["decoder_shift_samples"] = int(np.argmax(xc))
    if L:
        P = int(PRE * SR)
        # periodicity of the decoded body: y[i] vs y[i + L] across the padding — AAC noise only (≤ −25 dB)
        sh = v["decoder_shift_samples"]
        seg = y[sh + 256: sh + 2 * P - 256]
        seg2 = y[sh + 256 + L: sh + 2 * P - 256 + L]
        n = min(len(seg), len(seg2))
        v["periodic_err_db"] = round(float(10 * np.log10(((seg[:n] - seg2[:n]) ** 2).mean() / max((seg[:n] ** 2).mean(), 1e-12))), 1)
        v["seam"] = seam_metrics(y[P: P + L], y[P + L: P + L + SR // 10])
        v["seam_offset2112"] = seam_metrics(y[P + 2112: P + 2112 + L], y[P + 2112 + L: P + 2112 + L + SR // 10])
        v["bands"] = band_shares(y[P: P + L].mean(axis=1))
    return v


def render_cue(render_dir, stem, out_dir, named=True):
    m = json.load(open(os.path.join(render_dir, stem + ".metrics.json")))
    side = json.load(open(os.path.join(render_dir, stem + ".json")))
    x, sr = sf.read(os.path.join(render_dir, stem + ".wav"), dtype="float64", always_2d=True)
    cue = m["cue"]
    body, L = master(x, cue, m.get("loop"))
    if L:
        P = int(PRE * SR)
        padded = np.concatenate([body[-P:], body, body[:P]])
    else:
        padded = body
    padded = np.clip(padded, -1, 1)
    tmp = os.path.join(out_dir, f".{stem}.m4a")
    os.makedirs(out_dir, exist_ok=True)
    encode(padded, tmp)
    h = hashlib.sha256(open(tmp, "rb").read()).hexdigest()[:8]
    name = f"{cue}-{h}.m4a" if named else f"{stem}.m4a"
    final = os.path.join(out_dir, name)
    os.replace(tmp, final)
    v = verify(final, cue, L, padded)
    entry = dict(file=name, loop=bool(L), pre=PRE if L else 0, len=round(L / SR, 6) if L else round(len(body) / SR, 3),
                 gainDb=0, bpm=side["bpm"], bytes=os.path.getsize(final))
    return entry, v, m, side


def write_generated(entries):
    lines = ["// Written by assets/audio/pipeline/publish.py — do not edit by hand.",
             "import type { CueFile, MusicCue } from './cues';", "",
             "export const CUE_FILES: Partial<Record<MusicCue, CueFile>> = {"]
    for cue in ["menu", "map", "coast", "alpine", "quarry", "snowline", "results"]:
        e = entries.get(cue)
        if not e:
            continue
        lines.append(f"  {cue}: {{ file: '{e['file']}', loop: {'true' if e['loop'] else 'false'}, pre: {e['pre']}, "
                     f"len: {e['len']}, gainDb: {e['gainDb']}, bpm: {e['bpm']}, bytes: {e['bytes']} }},")
    lines.append("};")
    open(GENERATED, "w").write("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("render_dir")
    ap.add_argument("--pick", action="append", default=[], help="cue=stem")
    ap.add_argument("--candidates", action="store_true")
    a = ap.parse_args()
    picks = dict(p.split("=", 1) for p in a.pick)
    prev = json.load(open(PICKS)) if os.path.exists(PICKS) else {}
    entries = {k: v["entry"] for k, v in prev.get("cues", {}).items()}
    report = prev.get("cues", {})
    for cue, stem in picks.items():
        for old in glob.glob(os.path.join(PUBLIC, f"{cue}-*.m4a")):
            os.remove(old)
        entry, v, m, side = render_cue(a.render_dir, stem, PUBLIC)
        entries[cue] = entry
        report[cue] = dict(stem=stem, entry=entry, verify=v, caption=side["caption"], seed=side["seed"], dit=side["dit"],
                           lm=side["lm"], loop=m.get("loop"), sting=m.get("sting"))
        print(json.dumps({cue: dict(file=entry["file"], bytes=entry["bytes"], **{k: v[k] for k in ("lufs", "tp_dbtp")},
                                    seam=v.get("seam"), seam_off=v.get("seam_offset2112"))}), flush=True)
    total = sum(os.path.getsize(p) for p in glob.glob(os.path.join(PUBLIC, "*.m4a")))
    assert total <= BUDGET_BYTES, f"public/audio is {total} B > {BUDGET_BYTES}"
    write_generated(entries)
    json.dump(dict(total_bytes=total, cues=report), open(PICKS, "w"), indent=1)
    print(f"public/audio total {total / 1e6:.2f} MB", flush=True)
    if a.candidates:
        for mp in sorted(glob.glob(os.path.join(a.render_dir, "*.metrics.json"))):
            stem = os.path.basename(mp)[: -len(".metrics.json")]
            try:
                render_cue(a.render_dir, stem, CANDS, named=False)
            except Exception as e:
                print(f"candidate {stem}: {e!r}", flush=True)


if __name__ == "__main__":
    main()
