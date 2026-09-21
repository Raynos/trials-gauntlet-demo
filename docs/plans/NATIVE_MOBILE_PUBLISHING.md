# Publish the TypeScript / Three.js game on iOS and Android

Status: **in build; autonomous implementation authorized**. Ask 72; branch `docs/native-mobile-publishing`.
Repository baseline: `7784f731`, package version `0.3.2`. Research checked **2026-09-21**.
Ask 72 delivered the plan; ask 73 authorized autonomous implementation. Scope confirmed iOS/Android only. Parent owns integration and acceptance.

**User decisions:** personal publisher accounts; free with no ads or in-app purchases; eligible remote updates included in the first release. Account access, final identifiers and actual-device/store review remain release prerequisites.

## Recommendation and the update answer

Use **Capacitor** to package the existing game in an iOS WKWebView and Android WebView. Keep gameplay,
physics, rendering and UI in TypeScript / Three.js. Small native projects supply installation, signing,
app lifecycle and any device plugins; no game rewrite or Ionic UI framework is needed.

Ship a complete, locally bundled game plus a controlled over-the-air (OTA) web-bundle channel in the
first release. Qualify the bundled app before enabling channel promotion. Keep the website/PWA as another target of the same source tree.

**Can we publish once and have every website update appear in the apps without store updates?**
Technically, a wrapper loading a hosted website can receive new web code on subsequent loads. A bundled
wrapper does **not** do that automatically: it needs a separately implemented updater. Neither approach
eliminates future store releases. Native changes, platform maintenance and some game changes still need them.
No device receives new bytes while offline; caching and activation timing also delay adoption.

### Store rules and our release policy

Apple's §2.5.2 restricts downloaded code that introduces or changes app functionality. §4.2 expects more
than a repackaged website. §4.7 permits specified remotely supplied software, including HTML5/JavaScript
mini games, with additional obligations concerning native API exposure, privacy, content handling, an index
and universal links, and age controls. It is not blanket permission for every single-game wrapper or OTA
change. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/).

Google's self-update restriction explicitly excepts interpreted code such as JavaScript in a WebView;
downloaded code must still comply with Play policies. Native executable updates must use Play.
[Google Device and Network Abuse policy](https://support.google.com/googleplay/android-developer/answer/16559646?hl=en).

**Our conservative interpretation:** launch iOS with the bundled game; send meaningful game functionality
changes through review. Assess small web fixes and data updates individually before enabling OTA, disclose
the mechanism to App Review, and do not treat a vendor's compatibility claim as approval. Android can use
the web channel more broadly within policy. Neither store's acceptance is guaranteed by using Capacitor.

| Change | Planned delivery |
|---|---|
| Website-only release | Website/PWA only; does not advance either mobile channel |
| Art, text, tuning or level data supported by the existing game | Candidate remote content release after compatibility and policy checks; not a blanket exemption |
| Small JS/CSS fix preserving reviewed behavior | OTA candidate; iOS assessment required; ordinary store release always available |
| New modes, major mechanics, different purpose or monetization | Store-reviewed release under our policy, even when implemented entirely in TypeScript |
| Capacitor/plugin upgrade, native SDK, entitlement, permission, launcher icon or bundled native launch screen | New signed store binary |
| Store target-SDK or security maintenance | New signed store binary; budget for ongoing upkeep |

Current tracks are code under `src/tracks/`, not an independently downloadable level-data format.
A new track currently changes the JS bundle; calling it “content” does not change that fact.

## Architecture choices

| Approach | Website updates reach installed apps? | Tradeoff / decision |
|---|---|---|
| Capacitor + bundled `dist-native/` | Store releases replace the factory bundle | Offline fallback in the selected architecture |
| Capacitor + bundled fallback + OTA | After publishing a compatible mobile bundle and activating it | **First-release choice:** separate signed channels, compatibility checks and local rollback |
| WebView pointed at live production URL | Usually on a later load, subject to caches | Online dependency and coupled releases; not our production default |
| Android Trusted Web Activity (TWA) | Uses the hosted site's update behavior | Alternative if website parity dominates; Android-only and a different runtime/integration path |
| Existing installed PWA | Uses the website/service-worker update behavior | Already available outside stores; simplest route if avoiding store review is the primary objective |

Capacitor documents `server.url` as a live-reload facility not intended for production. Use `webDir: 'dist-native'`
and packaged assets. A TWA runs the verified website fullscreen in the user's browser and verifies ownership
using Digital Asset Links. [Capacitor configuration](https://capacitorjs.com/docs/config),
[Chrome TWA overview](https://developer.chrome.com/docs/android/trusted-web-activity).

```text
TypeScript + Three.js + game assets
                  |
             Vite build
              /       \
   website/PWA         native-target bundle
   current Vercel       /              \
   deployment      iOS shell        Android shell
                   WKWebView        Android WebView
                        \            /
                 signed mobile update channels
                 immutable bundle + local fallback
```

“Native app” here means an installable native container. The game still renders through WebGL in the
WebView; wrapping it does not turn Three.js into a Metal renderer or guarantee better frame rates.

## Repository work to preserve and adapt

| Existing surface | Native plan |
|---|---|
| `vite.config.ts`: relative base `./`, build SHA, load manifest, content-addressed models | Reuse; add an explicit native build target and package all runtime assets, including lazy chunks, fonts and world-map plates |
| `src/boot/inline.ts`, `src/boot/sw.ts`, `src/pwa/sw.js` | Keep PWA behavior for browsers; disable service-worker registration/update in native builds, where bundle selection owns updates |
| `src/boot/offline-pack.ts`, `src/boot/asset-totals.ts` | Reuse asset inventory; distinguish reading installed files from downloading an offline pack; verify progress reaches ready offline |
| `src/ui/offlineStatus.ts`, `src/ui/front.ts` | Native status describes installed bundle availability; do not reuse the PWA cache/eviction message as a native storage guarantee |
| `src/game/app.ts` | Add lifecycle adapter for background/resume and Android Back; clear held inputs, pause physics/audio and avoid elapsed-time catch-up |
| `localStorage` saves across game/UI modules | Introduce a versioned persistence boundary, stable origin and migration/backup strategy; separate progress from disposable asset caches |
| `src/ui/inbox.ts`: relative `/api/inbox` | Explicit HTTPS API base and restricted CORS for native origins if feedback is included; Vercel functions do not run inside the app |
| `harness/`, `harness/gate/thresholds.json` | Reuse deterministic game and web checks; add native-shell tests and actual-device evidence |

Safari/PWA, iOS app and Android app have separate storage. Existing web progress will not automatically
appear in the app. Default first release: local saves per installation, with a documented export/import
path if continuity is required. Cloud accounts and cross-device synchronization are separate scope.
Do not assume WebView `localStorage` is durable enough: select and test native persistence for important
progress, and keep app version upgrades and OTA rollback from erasing it. Uninstall/data-clear is different
from an update and may remove local saves.

## Current implementation evidence

Capacitor 8.5.2 shells build for iOS Simulator and Android; native mode excludes the PWA worker. Lifecycle interruption handling, transactional native save snapshots and signed next-launch updates are implemented. Installed iOS and Android builds have staged and activated a signed healthy bundle. Five iOS profiles pass gameplay smoke; primary iOS and Android pass all24registered-track/5outfit/2bike asset sweeps after fixing mixed-index obstacle geometry. See [iOS asset report](../evidence/native-mobile/ios-capabilities.json) and [Android asset report](../evidence/native-mobile/android-capabilities.json). The native channel is disabled by default until production URLs and a public verification key are supplied. See [native runbook](../native/README.md) and [evidence](../evidence/native-mobile/). Device, store and remaining failure qualification below stay open.

Release hardening now adds build-time channel/key validation, a signed-bundle build contract, and
conservative cleanup of abandoned staged downloads. Native licence notices and publisher disclosure/listing
drafts are in [the runbook](../native/README.md). These implementation checks do not close the store/device gates.

## Implementation phases and acceptance

### Required simulator/emulator E2E matrix (ask 76; part of the active goal)

The active objective remains **plan the mobile apps then build them autonomously**. Its completion
audit must include this matrix; successful compilation or one passing emulator is insufficient.
Inventory checked 2026-09-21: [machine-readable inventory](../evidence/native-mobile/simulators.json).
Use headless runners and task-owned simulator instances; do not interrupt an already-running user simulator.

| Target | Installed runtime/profile | Required coverage | Current evidence |
|---|---|---|---|
| iPhone 16 Pro (`trials-iphone`) | iOS 26.5 (23F77), Xcode 26.6 | Full native E2E + OTA/save failure suite | Initial real installed-app gameplay, signed activation, watchdog rollback and save restoration [passed locally](../evidence/native-mobile/ios-local.json); full matrix below remains open |
| iPhone 17e | iOS 26.5 | Smaller phone layout, touch controls, safe areas, cold boot/clear/crash/restart, lifecycle and save smoke | [Menu/replay/crash/restart smoke passed](../evidence/native-mobile/ios-matrix-smoke.json); touch/layout/lifecycle qualification open |
| iPhone 17 Pro Max | iOS 26.5 | Larger phone layout and the same smoke flow | [Menu/replay/crash/restart smoke passed](../evidence/native-mobile/ios-matrix-smoke.json); touch/layout/lifecycle qualification open |
| iPad mini (A17 Pro) | iOS 26.5 | Tablet layout, landscape/rotation, touch and gameplay smoke | [Menu/replay/crash/restart smoke passed](../evidence/native-mobile/ios-matrix-smoke.json); tablet/rotation/touch qualification open |
| iPad Pro 13-inch (M5) | iOS 26.5 | Large tablet layout and gameplay smoke | [Menu/replay/crash/restart smoke passed](../evidence/native-mobile/ios-matrix-smoke.json); touch/layout/lifecycle qualification open |
| Pixel 7 (`trials_gauntlet_api36`) | Android 16 / API 36, Google APIs ARM64 image revision 7; emulator 37.1.11.0; 1080×2400, 420 dpi, 2 GB configured RAM | Full native E2E + OTA/save failure suite + Android Back | Initial offline gameplay, lifecycle, save restoration, signed activation, hash rejection and watchdog rollback [passed locally](../evidence/native-mobile/android-integrated.json); full matrix below remains open |

Additional installed iOS profiles: iPhone 17 Pro, iPhone 17, iPhone Air, iPad Pro 11-inch (M5), iPad Air
11/13-inch (M4), and iPad (A16). They can support focused regressions; availability is not a pass.
Only one OS runtime per platform is installed. The projects currently declare iOS 15.0 and Android API24
minimums; neither minimum is qualified by iOS26.5/API36 tests. Add runnable older-OS coverage or obtain
physical-device evidence before accepting those minimums. Do not infer a simulated older device profile
on the latest OS proves older-OS compatibility.

- [ ] Full primary-device suite: clean offline install and cold boot; every shipped track and garage asset;
  real touch navigation; deterministic clear twice; crash and restart; background/foreground, force-kill,
  settings/progress persistence and native binary upgrade; Android Back; audio/worklet capability and
  WebGL context-loss recovery.
- [ ] Full OTA suite on both primary devices: valid signed A→B, no mid-ride activation, deliberate B→A
  rollback with higher sequence, startup-watchdog rollback, wrong signature/hash, incompatible native
  version, expired manifest, interrupted download, offline launch, low storage, save recovery and
  abandoned-bundle cleanup with the final native configuration.
- [ ] Secondary-device smoke/layout cases above, with screenshots used only for geometry and played clips
  for motion assessment. Record build/source identity, device/runtime, commands, measurements and failure
  cases under `docs/evidence/native-mobile/`; an unavailable or unexecuted case remains open.
- [ ] Re-run applicable suites on final signed store candidates and keep actual-phone thermal/performance,
  interruption and stranger-touch gates below. Simulator timings never establish phone fps or battery life.

Round 3 adds real native-input runners (`scripts/native-ios-ui.sh`,
`scripts/native-android-touch.mjs`) and [signed OTA failure fixtures](../evidence/native-mobile/ota-fixtures.md).
The [iOS geometry matrix](../evidence/native-mobile/ios-touch-matrix.json) covers iPhone 16 Pro,
iPhone 17e, iPhone 17 Pro Max, iPad mini and iPad Pro 13-inch; an outer-label safe-area defect was corrected. These are
measured control bounds/delegated hit tests, not visual or actual-touch approval. An installed iOS
[orphan-cleanup test](../evidence/native-mobile/ios-retention.json) passes; the remaining retention and
transfer failures stay open. The [Android native-touch suite](../evidence/native-mobile/android-touch.json) passes 15 checks, including
six instantaneous restart taps, held controls, Back, background/foreground and force-kill preference
restoration. Its actual display was overridden to 720×1280 / 280 dpi (landscape 1280×720); nominal Pixel 7
1080×2400 layout and physical-device results are not inferred. The iPhone 17e [XCTest native-touch/lifecycle smoke](../evidence/native-mobile/ios-ui.json)
also passes: actual Play/Ride/onboarding, pause/restart, Home/foreground remaining paused, explicit Resume
and Quit. Its default verification uses no JS observation or game-hook actions. These partial suites
do not close the complete matrix above.

### P0 — Freeze scope and build requirements

- [ ] Record publisher identity, permanent bundle/application IDs, countries, device support and distribution
  account status. Proposed launch scope: one offline single-player game, current content, no new ads,
  accounts, purchases or online leaderboards. Product decisions are HR-14, not prerequisites to this plan.
- [x] Pin compatible Capacitor core/CLI/iOS/Android/plugin versions and native toolchains. The repo already
  requires Node 22+. Verify the chosen versions against [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).
- [ ] Record minimum supported OS/WebView versions from the actual device qualification. Do not confuse
  those with submission SDK requirements: today Apple requires Xcode 26+ / iOS 26 SDK for uploads,
  and ordinary new Play apps/updates target Android 16 / API 36+. Recheck immediately before submission.
  [Apple requirements](https://developer.apple.com/news/upcoming-requirements/),
  [Android target API requirements](https://developer.android.com/google/play/requirements/target-sdk).
- [x] Freeze a source revision and baseline recordings; report known performance/replay gaps separately
  from wrapper regressions. This plan does not silently close `PERF-BACKLOG.md` or `RIDING_POSES.md`.

### P1 — Produce installable local bundles

- [x] Add `capacitor.config.ts`, committed `ios/` and `android/` project sources, dependencies and build
  scripts. Keep native code limited to shell needs; gameplay remains shared. Exclude build outputs,
  signing keys, provisioning material, personal IDE state and service credentials from version control.
- [x] Add native-target Vite boot behavior before syncing assets. Implemented flow: `pnpm build:native`
  (native target), `pnpm exec cap sync`, then Xcode archive / Gradle signed release AAB. A web build alone
  is not an IPA or AAB. [Capacitor build workflow](https://capacitorjs.com/docs/basics/workflow).
- [ ] Generate native app icons/splash assets from approved art; configure landscape behavior and safe
  areas, including home indicator, notches and Android edge-to-edge system bars. Keep links out of the
  privileged game WebView; allow only intended HTTPS services and packaged/trusted game code.
- [ ] Prove first launch with networking disabled **before ever opening the installed app**: menu, every
  shipped track, garage outfits/bikes, audio and restart work. No SW timeout or server dependency on the
  critical path. Record installation size, boot time and asset completeness on both platforms.
- [ ] Verify ES modules, streamed assets and AudioWorklet on each native local origin. Vite/Vercel COOP/COEP
  headers do not automatically carry into local serving; measure `crossOriginIsolated` and timing behavior
  instead of assuming browser parity. Native recovery must not invoke the PWA's cache-clearing reload path.

### P2 — Make the shell behave like a mobile game

- [ ] Connect native lifecycle to pause/resume; test calls, lock/unlock, app switching, audio interruptions,
  mute/volume behavior and OS process death. No stuck throttle or physics advance while backgrounded.
  Reuse existing visibility pause, touch clearing, interrupted-audio and context-restoration hooks rather
  than duplicating them. Keep feedback credentials server-side; omit the development inbox or adapt it explicitly.
- [ ] Android Back closes overlays/returns through the game flow; from riding it pauses safely. Test both
  gesture navigation and hardware/system Back. Validate multitouch, rotation and touch target size.
- [ ] Preserve progress, PBs/ghosts, outfit, bike and settings across process death and binary upgrades.
  Use transactional/versioned migrations with recoverable backups. Test low storage and denied access.
- [ ] Test WebGL context loss, shader initialization, repeated garage swaps and a sustained 15-minute run
  on actual iPhone and Android hardware. Check WebGL capability, memory and thermal throttling; unsupported
  devices get a usable explanation rather than a black canvas. No new physics-library work in this phase.

### P3 — Qualify and submit the bundled release

- [ ] Run `pnpm check`, determinism, touch and ship gates against a frozen build. Every third implementation
  round includes cold boot → clear → crash → instant restart. A headless WebKit pass is not an iPhone pass.
- [ ] Add scripted native-shell coverage through simulator/emulator/device test runners; retain the headless
  browser harness for web checks. Use played clips for visual judgement, not posed screenshots.
- [ ] Capture at least three actual-device reports: a supported older iPhone, a current iPhone and a midrange
  Android. Apply `harness/gate/thresholds.json`: exact finish-time/hash replay, one-tick logical restart,
  restart frame p95 ≤33 ms, and default/low 60-cap sustained fps ≥55; report all other applicable rows and
  misses. Cold native launch time is measured separately from the harness's in-page boot-ready time.
- [ ] Measure attempts-to-clear and restart latency with the bot and at least two stranger sessions on the
  opening tracks, using `harness/stranger/PROTOCOL.md`. Include actual human touch play; label AI evidence
  separately. Compare with the same source revision in the browser.
- [ ] Prepare support/privacy URLs, store descriptions, real-device screenshots, age/content ratings,
  credits/licence inventory, App Privacy and Play Data safety disclosures. Audit actual SDK/network behavior,
  including optional feedback JPEGs and hosting logs, before claiming “no data collected.” Include any
  required iOS privacy manifests/reasons for the selected plugins.
- [ ] iOS: enroll/sign, create the App Store Connect record, archive/upload, run TestFlight, supply clear
  review notes demonstrating offline gameplay and then submit for App Review. Android: create Play record,
  configure Play App Signing/upload key, upload signed AAB to internal testing, complete applicable closed
  testing/production-access requirements, then submit production release. Keep recovery material securely.
- [ ] Record review outcomes and address issues; release progressively where supported. Re-run install,
  save-upgrade and offline gates on the artifacts obtained through the stores. Update `RELEASES.md` with
  platform build numbers, source SHA, web-bundle ID and evidence.

### P4 — OTA qualification, required for first release (user decision)

- [x] Choose a maintained updater only after checking current support, pricing, self-hosting/export options,
  asset limits, signature verification, native-version targeting and automatic rollback. Selected `@capgo/capacitor-updater@8.51.20`, manual mode with our RSA-PSS signed manifest and a static HTTPS host. Vendor endpoints disabled; no subscription or account. See [runbook](../native/README.md) and [capability evidence](../evidence/native-mobile/updater.md). Documentation demonstrates technical delivery, not store permission.
- [ ] If the updater/plugin was absent from the initial binary, ship it through a store update first. Decide
  iOS eligibility for the intended patch categories; retain store-only delivery when uncertain or rejected.
- [ ] Implement the release and failure behavior below. Prove valid update, interrupted download, bad
  signature/hash, incompatible native shell, bad startup, low disk, offline launch, rollback and save recovery.
- [ ] Exercise an A → B → A rollback drill on both platforms through their installed builds. Archive an OTA
  capability report; unmeasured failure cases remain open and are not inferred from a successful happy path.

## How updates operate

Maintain three independent identities: **native version/build** (store shell), **web bundle ID** (immutable
game build/source SHA), and **save/physics schema versions**. Track all three in support diagnostics.

1. Build an immutable release from one revision. Website deployment and mobile promotion are separate
   jobs; publishing Vercel production must not implicitly advance `ios-stable` or `android-stable`.
2. A signed manifest names the bundle, archive hash, platform, compatible native build range,
   runtime compatibility ID and save-schema constraint. Pin trust in the installed shell; HTTPS plus an
   unsigned hash from the same server is not sufficient authentication. Keep old compatible bundles.
3. App starts from its installed known-good bundle immediately. Check updates opportunistically with a
   bounded timeout. Download into staging; interrupted downloads leave the current game playable.
4. Verify signature, compatibility and the complete asset set before making anything active. Use immutable
   hashed paths for *all* remote assets, not just existing content-addressed GLBs. Prevent mixed releases.
5. Activate atomically at the next cold launch, (the current implementation). Never reload mid-run or
   during a save. Keep the previous working bundle and the bundled factory fallback.
6. Confirm health after the real boot reaches a usable menu and the runtime assets load. If boot never acknowledges readiness, automatically revert; do not mistake a user backgrounding the app for a failed boot.
7. Promote beta → limited cohort → stable; stop/revert promotion on failures. An offline device cannot receive
   a remote rollback instruction, so local fallback must work. Reject updates requiring a newer shell and
   offer the store upgrade while preserving the old playable game.

Save migrations must remain readable by the rollback target or retain a separate old-schema snapshot.
Physics/track changes get new replay compatibility stamps: preserve historical results, and do not replay
old inputs under changed physics while claiming identical times. Recheck deterministic finish times on each
platform for every compatible build. No silent changes to a running attempt.

Example: a player has shell `1.0 (10)` and game bundle `A`. Deploying website `B` alone leaves their app on
`A`. Promoting an eligible, tested `B` to that platform's mobile channel lets the app stage it online and
activate on a later safe launch. A `B` that needs shell `1.1` waits for a store upgrade. With OTA disabled,
`B` reaches the player only in the next store binary.

## Costs, timing and decisions

- Apple Developer Program: US$99/year, with local pricing/eligibility variations.
  [Apple enrollment](https://developer.apple.com/help/account/membership/program-enrollment).
- Google Play registration: US$25 once; publisher verification also applies.
  [Play Console setup](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en).
- New personal Play accounts created after November 13, 2023 require at least 12 testers continuously
  opted in for 14 days before applying for production access. This is not automatic production approval.
  [Google testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB).
- Additional costs: Mac/native build infrastructure, test devices, hosting/bandwidth and an optional OTA
  service. No provider subscription or account purchase has been made.
- Planning estimate, not a commitment: 1–2 working days for an installable proof, 3–7 for lifecycle/storage
  and device qualification, 2–5 for listings/release automation, plus enrollment/testing/review wait time.
  OTA qualification and store review can expand these estimates; local implementation is already underway.

HR-14 records remaining human prerequisites: personal developer-account access/enrollment, permanent IDs, target markets and actual-device/human acceptance. Personal publication, free/no ads/no purchases and first-release eligible OTA are decided. Technical implementation proceeds autonomously; store signing and publication still require those prerequisites.

**Plan done line:** both store-distributed apps install and play the shared TypeScript/Three.js game offline,
preserve saves across updates, pass recorded native/device gates and have a repeatable release runbook.
The explicit simulator/emulator matrix above is a required acceptance gate for the active mobile-app goal.
The OTA phase must be proved with recovery evidence; iOS-ineligible changes still use store updates. Update this tracker and archive only when those outcomes are evidenced or exceptions accepted.
