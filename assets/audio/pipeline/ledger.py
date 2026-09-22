"""Score every analysed render, pick the best per cue, and write the tables for LEDGER.md.

    python3 assets/audio/pipeline/ledger.py RENDER_DIR [--json out.json]

Picking is by measurement only (nobody on this project can listen). Per loop cue:

  gates (any one → ineligible, the reason is printed):
    vocals        Demucs vocal stem louder than −14 dB re the mix, or within 12 dB of it in > 8 % of seconds
    silence       an internal gap ≥ 1.0 s in the loop body
    tempo         loop-body beat-interval CV > 6 %, or the tempo > 3 % off the prompt's
    seam          seam_sim < 0.55 (the bar after the wrap does not look like the bar that followed naturally)
    clipped       > 200 samples at |x| ≥ 0.999 in the raw render (distortion baked in before mastering)
  score (higher is better):
    + 3.0 · seam_sim + 1.5 · seam_chroma + 1.0 · seam_xcorr   the loop seam: structure, harmony, waveform
    − 0.5 · (seam_flux_x − 1)⁺ − 0.3 · seam_step_db⁺  no spectral jolt / level step beyond the music's own
    − 0.15 · body ibi CV %                            a steady groove
    − 0.15 · (engine share − cue median, dB)⁺         ride loops only: leave the engine's 90–350 Hz room
    − 0.10 · (−22 − air share, dB)⁺                   not dull: some energy above 4 kHz
  the sting: gates vocals + onset ≤ 0.5 s; score = −|len − 8 s|/4 − 0.05 · onset ms/10 + 0.02 · −tail dB.
"""
import argparse
import glob
import json
import os
import statistics

RIDE = {"coast", "alpine", "quarry", "snowline"}
ORDER = ["menu", "map", "coast", "alpine", "quarry", "snowline", "results"]


def gates(m):
    out = []
    v = m.get("vocals")
    if v and (v["vocal_rel_db"] > -14 or v["vocal_windows_pct"] > 8):
        out.append("vocals")
    if m.get("clip", 0) > 200:
        out.append("clipped")
    if m["cue"] == "results":
        s = m.get("sting") or {}
        if s.get("onset_s") is None or s["onset_s"] > 0.5:
            out.append("late-onset")
        return out
    lp = m.get("loop")
    if not lp:
        return out + ["no-loop"]
    if lp["body_silence_s"] >= 1.0:
        out.append("silence")
    bt = lp["body_tempo"]
    if bt["ibi_cv_pct"] > 6 or abs(bt["err_pct"]) > 3:
        out.append("tempo")
    if lp["seam_sim"] < 0.55:
        out.append("seam")
    return out


def score(m, engine_median):
    if m["cue"] == "results":
        s = m["sting"]
        ln = (s["end_s"] or 0) - (s["onset_s"] or 0)
        return round(-abs(ln - 8) / 4 - 0.05 * (s["onset_s"] * 100) + 0.02 * -s["tail_db"], 3)
    lp = m["loop"]
    sc = 3.0 * lp["seam_sim"] + 1.5 * lp.get("seam_chroma", 0) + 1.0 * lp["seam_xcorr"] - 0.5 * max(0.0, lp["seam_flux_x"] - 1) - 0.3 * max(0.0, lp["seam_step_db"])
    sc -= 0.15 * lp["body_tempo"]["ibi_cv_pct"]
    b = lp["body_bands"]
    if m["cue"] in RIDE:
        sc -= 0.15 * max(0.0, b["engine"] - engine_median)
    sc -= 0.10 * max(0.0, -22 - b["air"])
    return round(sc, 3)


def load(render_dir):
    rows = []
    for p in sorted(glob.glob(os.path.join(render_dir, "*.metrics.json"))):
        m = json.load(open(p))
        if "error" in m:
            rows.append(m)
            continue
        m["side"] = json.load(open(p.replace(".metrics.json", ".json")))
        rows.append(m)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("render_dir")
    ap.add_argument("--json")
    a = ap.parse_args()
    rows = [r for r in load(a.render_dir) if "error" not in r]
    ride_eng = [r["loop"]["body_bands"]["engine"] for r in rows if r["cue"] in RIDE and r.get("loop")]
    med = statistics.median(ride_eng) if ride_eng else 0.0
    picks = {}
    for r in rows:
        r["gates"] = gates(r)
        r["score"] = score(r, med) if (r["cue"] == "results" and r.get("sting")) or r.get("loop") else None
    for cue in ORDER:
        cands = [r for r in rows if r["cue"] == cue]
        ok = [r for r in cands if not r["gates"] and r["score"] is not None]
        pool = ok or [r for r in cands if r["score"] is not None]
        if pool:
            picks[cue] = max(pool, key=lambda r: r["score"])["stem"]
    for cue in ORDER:
        cands = sorted([r for r in rows if r["cue"] == cue], key=lambda r: -(r["score"] or -99))
        if not cands:
            continue
        print(f"\n### {cue}\n")
        if cue == "results":
            print("| render | seed | LUFS raw | TP raw | clip | onset s | end s | tail dB | vox rel dB / % s | gates | score | pick |")
            print("|---|---|---|---|---|---|---|---|---|---|---|---|")
            for r in cands:
                s = r["sting"]
                v = r.get("vocals") or {}
                print(f"| {r['stem']} | {r['side']['seed']} | {r['lufs']} | {r['tp_dbtp']} | {r['clip']} | {s['onset_s']} | {s['end_s']} | "
                      f"{s['tail_db']} | {v.get('vocal_rel_db', '–')} / {v.get('vocal_windows_pct', '–')} | {','.join(r['gates']) or 'pass'} | "
                      f"{r['score']} | {'**PICK**' if picks.get(cue) == r['stem'] else ''} |")
            continue
        print("| render | seed | LUFS raw | TP raw | clip | bpm (err %) | IBI CV % | loop bars @ t0 s | len s | seam sim / chroma / xcorr | "
              "click / step dB / flux × / err dB | engine 90–350 dB | air >4k dB | silence s | vox rel dB / % s | gates | score | pick |")
        print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
        for r in cands:
            lp = r.get("loop") or {}
            v = r.get("vocals") or {}
            bt = lp.get("body_tempo", {})
            b = lp.get("body_bands", {})
            print(f"| {r['stem']} | {r['side']['seed']} | {r['lufs']} | {r['tp_dbtp']} | {r['clip']} | {bt.get('bpm')} ({bt.get('err_pct')}) | "
                  f"{bt.get('ibi_cv_pct')} | {lp.get('bars')} @ {lp.get('t0_s')} | {lp.get('len_s')} | {lp.get('seam_sim')} / {lp.get('seam_chroma')} / {lp.get('seam_xcorr')} | "
                  f"{lp.get('seam_click')} / {lp.get('seam_step_db')} / {lp.get('seam_flux_x')} / {lp.get('seam_err_db')} | {b.get('engine')} | {b.get('air')} | "
                  f"{lp.get('body_silence_s')} | {v.get('vocal_rel_db', '–')} / {v.get('vocal_windows_pct', '–')} | {','.join(r['gates']) or 'pass'} | "
                  f"{r['score']} | {'**PICK**' if picks.get(cue) == r['stem'] else ''} |")
    print("\nPICKS " + " ".join(f"--pick {k}={v}" for k, v in picks.items()))
    if a.json:
        json.dump(dict(engine_median_db=med, picks=picks,
                       rows=[{k: r.get(k) for k in ("stem", "cue", "score", "gates", "lufs", "tp_dbtp", "clip", "tempo", "vocals", "loop", "sting", "bands")}
                             for r in rows]), open(a.json, "w"), indent=1)


if __name__ == "__main__":
    main()
