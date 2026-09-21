# Golden recordings after shared rider geometry

**Historical candidate only.** The later support/suspension correction changed the simulation to `1255af7f`; current qualification is in the corresponding `*-round3/` folder. These results are preserved and are not current-build passes.

Frozen simulation fingerprint: `ae2c0bca`. Old recordings are preserved verbatim in `before/`.

The initial `harness:bot --refresh-goldens --build --jobs 1` replay found **0/47** old recordings still finished. `refresh-initial.log` retains every failure. A failed recording is never restamped as a clear.

`search-rookie-core.log` records the first eight-track skill-3 sweep. Flat, gap, b3 and e3 cleared on the first attempt. The b1, b2, e1 and e2 zero-fault prefixes reached 74–87% of their tracks before the 120-second search wall limit. `continue.mts` replays each prefix from the initial state, resumes `playTrack` at its genuine ending state, and concatenates the actually played frames. Its planner history resets, explicitly recorded in the header; physics, run clock and fault count do not. Every continuation frame must replay to its recorded hash. The four resulting complete runs each clear on the first attempt.

`search-remaining.py` queues missing recordings with two workers and a 300-second search cap, using the production bot. Clears saved by this stage have Node verification only. The logs preserve failed searches. No solver or test changes are part of this evidence work.

`verify.mts` independently replays each complete recording in Node and one fresh headless-browser context. A pass requires the current source stamp, a finish, identical physics hashes, bit-identical **state finish time**, bit-identical **run clock**, and equal fault counts. It records the recording SHA-256 and both IEEE-754 byte strings. It never rewrites or blesses a failed recording.

`browser-rookie-core-v2.json` passes all eight Rookie core recordings, including all six b1–e3 tracks, with zero faults. The initial `browser-rookie-core.json` is retained as a rejected measurement: its checker compared Node's run clock against the browser's state finish time. Those are distinct fields calculated by division and multiplication, respectively; b3 differed by one ULP. The corrected check compares each field with its counterpart separately; all eight pass both comparisons. This was a checker correction, with no runtime change.

`browser-pro-core.json` also passes all eight Pro core recordings with zero faults. Both completed fresh b1 stranger recordings pass exact browser/Node verification in `browser-stranger-b1.json`; they cleared in one attempt at 46.333333333333336 s and 47.925 s. Fresh AI strangers measure informed solvability through telemetry and command slots, not unaided human discoverability or actual phone interaction.

Full both-class verification remains in progress until the final report is written.
