"""Pick the SNOWLINE ride loop from the unpicked round-1 runners-up, by measurement (no model runs).

    python3 assets/audio/pipeline/snowline.py RENDER_DIR

SNOWLINE is cold, crisp, tense and fast, and it has no render of its own. The rule:
  eligible   passes every ledger gate; not a shipped pick; not the alpine pick's prompt + seed (the zones must differ)
  score      + 0.10 · body bpm              fast
             + 0.50 · air share dB (> 4 kHz)  bright, crisp
             + 0.30 · presence share dB (1–4 kHz)
             − 0.40 · (sub + engine) share, dB power sum   sparse low end (also leaves the engine room)
             + 1.0 · ledger seam score / 4    it must still loop cleanly
Every band share is dB relative to the whole loop body (analyze.py). Prints the ranked table in markdown.
"""
import glob
import json
import math
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ledger import RIDE, gates, load, score  # noqa: E402


def low_db(b):
    return 10 * math.log10(10 ** (b["sub"] / 10) + 10 ** (b["engine"] / 10))


def main():
    d = sys.argv[1]
    rows = [r for r in load(d) if "error" not in r and r["cue"] != "results" and r.get("loop")]
    med = statistics.median([r["loop"]["body_bands"]["engine"] for r in rows if r["cue"] in RIDE])
    picks = json.load(open(os.path.join(os.path.dirname(__file__), "..", "picks.json")))["cues"]
    shipped = {v["stem"] for k, v in picks.items() if k != "snowline"}
    alpine = picks["alpine"]["stem"]  # e.g. alpine-a-s11: same prompt id + seed is excluded
    out = []
    for r in rows:
        g = gates(r)
        if r["stem"] in shipped or r["stem"] == alpine or g:
            continue
        lp = r["loop"]
        b = lp["body_bands"]
        seam = score(r, med)
        s = 0.10 * lp["body_tempo"]["bpm"] + 0.5 * b["air"] + 0.3 * b["presence"] - 0.4 * low_db(b) + seam / 4
        out.append((round(s, 3), r, seam, low_db(b)))
    out.sort(key=lambda t: -t[0])
    print("| render | bpm | air >4k dB | presence 1–4k dB | sub+engine dB | seam score | snowline score |")
    print("|---|---|---|---|---|---|---|")
    for s, r, seam, lo in out:
        lp = r["loop"]
        b = lp["body_bands"]
        print(f"| {r['stem']} | {lp['body_tempo']['bpm']} | {b['air']} | {b['presence']} | {lo:.2f} | {seam} | {s}{' **PICK**' if r is out[0][1] else ''} |")
    print(f"\nPICK {out[0][1]['stem']}")


if __name__ == "__main__":
    main()
