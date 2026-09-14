# Reference corpus

Real Trials Evolution / Trials Rising footage, cut into short side-on clips for
clip-vs-clip blind comparison against this game.

- `notes/*.md` — per-aspect manifest + numbered observations (timing, camera,
  materials). Committed.
- `<aspect>/manifest.json` — every clip with source URL, source timestamp,
  duration, what it shows. Committed.
- `<aspect>/sheets/*.jpg` — contact sheets (16 frames spanning each clip). Committed.
- `<aspect>/clips/*.mp4` — 720p h264 cuts (~130 MB total). **Not committed**;
  rebuild from the manifests with yt-dlp + ffmpeg. yt-dlp needs
  `--extractor-args "youtube:player_client=web_embedded,web_safari,default"`
  and `-f "136/bv*[height<=720][ext=mp4]/b[height<=720]"` to get past the
  403s; a recent yt-dlp (>= 2026.08) also works.
- `<aspect>/raw/` — full source downloads. Not committed.
