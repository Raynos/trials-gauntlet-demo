# Pose comparison images — ask 76

Main build goal remains paused at `0f27eedf`. These are presentation artifacts from
existing gameplay captures, not new acceptance tests or a resumed implementation.

- `harness/out/pose-comparison/trials-fusion-vs-ours.png`: Fusion left / current build
  right, ready/neutral-like, forward/compressed and rearward/extended-arm examples.
- `harness/out/pose-comparison/before-vs-current.png`: old/new neutral, forward, back.
- Individual row PNGs and full reference inspections are in the same ignored folder.

Fusion source: UniversityOfTrials, Inferno IV First Checkpoint Tutorial,
https://www.youtube.com/watch?v=5EtbE9r9L5k . See `sources.json` for timestamps.
The Fusion camera, costume, terrain and bike pitch differ. Input values are unknown;
these are silhouette comparisons, not controlled matched-input measurements. The
forward example is airborne and the rearward example is steeply pitched.

Current: `/tmp/trials-poses-round3/rookie-street-mustard-high/clip.mp4`, frame indices
0,55,110 respectively, crop460:460:320:110 scaled520×520. Before:
`/tmp/trials-poses-aa-baseline/poses/clip.mp4`, indices15,55,112, crop460:460:320:80
scaled520×520; source viewport/detail differ, so this is not an AA benchmark.
Both sets are real recorded controls, no synthetic posing or generative edits.

Fusion crops: neutral clip17 at4.75s,520:520:80:170; forward clip16 at6.5s,
450:450:170:200; rearward clip17 at3.25s,560:560:180:160. All uniformly scaled520×520.
Rows assembled with ImageMagick, labels in a separate header/footer. No body geometry
was altered. The original reference manifests retain full source provenance.
