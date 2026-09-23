# iOS Simulator luminance check after the half-float sky fix (baef4b0c)

The bundle is the store debug build from a clean export of HEAD `0d46e860`, which includes `baef4b0c`. The recordings are the four zone playgrounds' `bot-3.json`, and each shot is at the same tick on both platforms (the rule in `src/platform/gate.ts` `shots`).

- iOS: `screens.ts ios`, 2868×1320 from the WKWebView snapshot on the iPhone 17 Pro Max simulator
- Play: `screens.ts play`, 1920×1080 from Chromium on ANGLE Metal

The luminance figures are Rec.601 grey means. "Foreground" is the lower 60 % of the frame (track, bike, props); "sky" is the band 10–35 % down from the top.

| shot | fg iOS | fg Play | Δ fg | sky iOS | sky Play |
|---|---|---|---|---|---|
| p-coast t120 | 59.4 | 58.2 | +1.2 (+2 %) | 66.4 | 64.0 |
| p-alpine t120 | 70.1 | 65.2 | +4.9 (+8 %) | 65.7 | 62.9 |
| p-quarry t147 | 69.3 | 62.5 | +6.8 (+11 %) | 68.6 | 62.2 |
| p-snowline t131 | 131.1 | 139.0 | −7.8 (−6 %) | 129.4 | 129.6 |

The near-black foreground is gone. Before the fix, the same zones on iOS were close to black against Chromium (commit 4ede56f5 notes). What remains is within ±11 %, and most of it is framing: the iPhone frame is 2.17:1 and Play's is 16:9, so the camera shows different slices of the scene. The image puts iOS on top and Play below.
