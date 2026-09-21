# Native capability and asset smoke probe

`scripts/native-capabilities-probe.js` defines a browser async function without imports. Run it inside the normal installed **debug** app, starting from a front screen. It refuses `?harness=1` and an active run/replay. Use task-owned simulator data: it exercises real garage callbacks and can turn absent preference defaults into explicit choices. It restores the effective outfit, bike, track, and front screen in `finally`; it does not claim a byte-identical native save or restore a prior procedural rider model. The localStorage mirror is only a diagnostic, not the authoritative native save.

For the existing iOS debug bridge, compose a plain async function body:

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
const source = fs.readFileSync('scripts/native-capabilities-probe.js', 'utf8');
const options = {sections: ['capabilities', 'tracks', 'garage', 'notices']};
fs.mkdirSync('.native-build', {recursive: true});
fs.writeFileSync('.native-build/capabilities-ios.js', source +
  '\nreturn await window.__trialsNativeCapabilitiesProbe(' + JSON.stringify(options) + ');\n');
NODE
TRIALS_PROBE_FILE=.native-build/capabilities-ios.js TRIALS_PROBE_NO_INSTALL=1 node scripts/native-ios-probe.mjs
```

Set `TRIALS_SIMULATOR` for each matrix device. The runner saves `.native-build/evidence/ios-probe.json`; copy that result per device before the next run overwrites it. The runner's custom-probe exit status does **not** check `pass`; inspect `pass` and every failure. Split sections or track subsets if the entire matrix exceeds its 150-second wait.

For an already launched headless Android emulator, reuse the debug WebView CDP client. Launch a background promise to avoid the client's 60-second per-evaluation deadline, then poll its result:

```js
import fs from 'node:fs';
import {connectWebview, delay} from './scripts/native-android-probe.mjs';
const client = await connectWebview('emulator-5554');
try {
  await client.waitFor('window.__trials?.ready && window.__trials.app && !document.getElementById("loader")');
  await client.evaluate(fs.readFileSync('scripts/native-capabilities-probe.js', 'utf8') +
    '\nwindow.__trialsNativeCapabilitiesResult = null; void window.__trialsNativeCapabilitiesProbe({sections:["capabilities","tracks","garage","notices"]});');
  const deadline = Date.now() + 300000;
  let report;
  while (Date.now() < deadline) {
    report = await client.evaluate('window.__trialsNativeCapabilitiesResult');
    if (report) break;
    await delay(1000);
  }
  if (!report) throw new Error('Capability probe did not return; do not claim coverage');
  fs.writeFileSync('.native-build/android-capabilities.json', JSON.stringify(report, null, 2) + '\n');
  if (!report.pass) process.exitCode = 1;
} finally { client.close(); }
```

Options are `sections` (default all five), `tracks` (default every registered ID, including fixtures/labs), `outfits` (default five shipped presets), `bikes` (default rookie/pro), `timeoutMs` (20,000 per operation), `requireNotices` (true), `expectedNoticeTokens` (Three.js/Capacitor), and `requireCrossOriginIsolated` (false). A subset is explicitly reported; merge the requested/attempted IDs before claiming full coverage. A timed-out asynchronous asset load cannot be cancelled by the hook; the probe stops track traversal and records the error, so the remaining tracks are untested.

Schema 1 fields:

| Field | Evidence and interpretation |
| --- | --- |
| `boot` | Normal app origin/platform, build hook information, service-worker control. |
| `capabilities` | Actual game WebGL2 context, version, context-loss state; AudioContext/AudioWorklet availability; secure context and cross-origin isolation. The temporary audio context is closed. No sound/worklet processor is played. |
| `touch` | CSS/backing canvas size, visual viewport, orientation, touch/pointer capability, measured `env(safe-area-inset-*)`, control/affordance bounds, opacity and center hit tests. Plays the existing last track through the app hook. Fresh onboarding or an overlay can produce a real obstruction report. Run separately after the onboarding E2E flow. No synthetic pointer events are sent. |
| `trackCoverage`, `tracks` | Registry/requested IDs, load acceptance, actual current track, draw counters, renderer diagnostics per initial scene. Track pass requires a newly rendered nonempty frame. This does not traverse the track or inventory every texture. |
| `garageCoverage`, `outfits`, `bikes` | Real live garage buttons are clicked. Selection, authored rider/bike diagnostics, and nonempty renderer counters are recorded. Static garage frames may be intentionally reused (`frameAdvanced: false`). No screenshot appearance is inferred from these values. |
| `notices` | Actual summary expansion, lazy file loading, expected text tokens, wrapping/width and geometry. This establishes text availability and no horizontal clipping, not human readability or complete licence compliance. |
| `requests`, `networkFailures`, `exceptions`, `consoleErrors` | Temporarily observed fetch responses/rejections, uncaught errors/resource events, rejected promises, context loss and console errors. Observers are restored/removed in `finally`. Any observed failure fails the report, including unrelated update traffic; attribute it using its URL/stage. Cached or silently swallowed failures can remain invisible. |
| `restoration` | Restored effective choices/screen and changed mirror keys. Absence-to-default changes, onboarding dismissal and automatic quality changes remain visible in the report. |
| `pass`, `failures`, `warnings`, `limitations` | Pass means selected smoke checks passed. It is not a store release gate, device performance claim, visual judgment, full input E2E, or complete asset guarantee. |

Source validation: `node --check scripts/native-capabilities-probe.js` and `pnpm exec eslint scripts/native-capabilities-probe.js`. Platform execution reports are produced by the parent/device runner; this schema is not execution evidence.
