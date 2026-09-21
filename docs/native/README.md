# Native builds and game updates

Implementation in progress; release gates and account/device prerequisites remain in
[the plan](../plans/NATIVE_MOBILE_PUBLISHING.md). Targets: iOS + Android, personal publisher,
free with no ads or purchases. Shell version `1.0.0` build `1` and app ID `com.trialsgauntlet.game`
are development values, not registered store identities.

The store app can receive eligible game updates without a new store submission, but it is not a
publish-once promise for every future change. This implementation keeps the complete game installed
locally and promotes separately signed native game releases. A website deployment alone does not
change the installed apps.

| Delivery | How the player gets a new game | Offline behavior |
| --- | --- | --- |
| Website / installed PWA | Existing service worker discovers website changes and adopts a new build during startup | Uses downloaded browser caches |
| iOS / Android app, eligible web-game update | App checks its signed channel after a healthy boot, downloads a verified ZIP, and activates it on a later game start | Complete installed bundle remains available; a network failure does not stop play |
| iOS / Android app, native or policy-ineligible change | Publish a new signed binary through the store | New binary includes a complete game bundle |

## Build

Use Node ≥22, the pinned pnpm lockfile, Xcode26+ on macOS, and Android SDK36 with Java21.

```sh
pnpm install --frozen-lockfile
pnpm build:native
pnpm exec cap sync
./scripts/native-ios.sh
./scripts/native-android.sh all
```

For store candidates, set the real public update configuration below and run
`pnpm build:native:release` (or `NATIVE_RELEASE=1 ./scripts/native-ios.sh` /
`NATIVE_RELEASE=1 ./scripts/native-android.sh all`). This fails early if either platform channel or
the RSA public key is missing, malformed, private, weak, or uses a local/test hostname. Local development
builds may omit OTA entirely; partially supplied configuration is an error in every native build.
The release flag validates configuration, not account ownership, hosting reachability or store approval.

Native web output is `dist-native/`; ordinary `pnpm build` still creates the website/PWA in `dist/`.
Capacitor embeds the full native web output. The native target omits PWA worker registration, cache
clearing and website-origin feedback. App pause/resume, Back, save snapshots and update selection live
under `src/platform/`. The game and WebGL renderer stay shared TypeScript / Three.js.

`capacitor:sync:after` normalizes pnpm cache paths in generated project files to relative `node_modules`
paths. `node scripts/native-paths.mjs` can also be run explicitly. Commit native source projects and
lockfiles; never commit generated bundles, SDKs, app binaries, signing material or temporary test trust.

The iOS script builds an unsigned simulator app at `.native-build/ios/Build/Products/Debug-iphonesimulator/App.app`.
It uses SwiftPM's `netrc` authorization provider for public dependencies because the default provider
stalled waiting on Keychain here. Android outputs are under `android/app/build/outputs/`; release AABs
remain unsigned until an upload key is configured. A simulator app is not a distributable IPA.

## Headless qualification

```sh
node scripts/native-ios-probe.mjs
node scripts/native-ios-matrix.mjs
```

Set `TRIALS_SIMULATOR` to another simulator UDID. The debug-only iOS bridge runs a supplied local JS
probe after real game boot, saves its report in the simulator sandbox, and is absent from Release builds.
The probe copies evidence into `.native-build/evidence/`. `TRIALS_PROBE_FILE` supplies a custom probe;
`TRIALS_PROBE_NO_INSTALL=1` tests a force-quit/relaunch without reinstalling the binary.

Android qualification uses an explicitly launched headless emulator and its debuggable WebView.
Actual phones, thermal measurements and human play remain separate gates. A simulator/emulator pass
must never be labeled a physical iPhone/Android performance result.

The iOS matrix runs the five named profiles in the plan and leaves an already-running non-task simulator
alone. It records unavailable profiles as incomplete, not passes. The default case is gameplay smoke;
the reusable [capability probe](../evidence/native-mobile/capability-schema.md) adds all-track/garage,
WebGL/audio capability and licence checks. For an already-booted task-owned Android emulator:

```sh
node scripts/native-android-capabilities.mjs --serial emulator-5554 \
  --apk android/app/build/outputs/apk/debug/app-debug.apk \
  --output .native-build/android-capabilities.json
```

That runner installs the local debug APK, enables airplane mode on the emulator, and fails on captured
resource/render errors. These programmatic checks do not establish real-touch or visual acceptance.

Native input runners are separate from the game-hook probes:

```sh
bash scripts/native-ios-ui.sh
node scripts/native-android-touch.mjs --serial emulator-5554 \
  --apk android/app/build/outputs/apk/debug/app-debug.apk \
  --output .native-build/android-touch.json --fresh
```

The iOS runner builds XCUITest against already-synced assets, boots a shutdown iPhone 17e by default,
and shuts down only the simulator it started. `TRIALS_UI_SIMULATOR` selects another shutdown profile.
It tests native taps and Home/foreground through XCTest; results and a recorded clip stay under
`.native-build/ios-ui/`. A failed native-touch run remains a failed gate even if game-hook smoke passes.
The Android runner maps CSS targets to the actual native WebView rectangle, injects `adb input` touches,
and checks navigation, controls, Back, lifecycle and committed preferences after force-kill. `--fresh`
clears only the task app's data on the selected emulator to exercise first-launch onboarding. Use it
only on a disposable task emulator. Both runners change test saves; neither targets physical phones.

The [OTA fixture runbook](../evidence/native-mobile/ota-fixtures.md) supplies signed A/B/rollback and
negative releases plus per-platform interrupted/delayed transfers for repeatable installed-app tests.

Installed OTA suites exercise the normal update controller against those local fixtures:

```sh
node scripts/native-ios-ota-suite.mjs --fixtures .native-build/ota-fixtures-round4
node scripts/native-android-ota-suite.mjs --mode full --serial emulator-5554 \
  --apk .native-build/app-ota-round4.apk --fixtures .native-build/ota-fixtures-round4
```

First build and install the QA wrapper with the fixture channels/public key and temporary local TLS
trust; these runners do not configure production channels. Keep the local HTTPS server running and
use fresh fixture sequences above the installed high-water value. iOS uses the already-installed app
and writes resumable stage reports under `.native-build/ios-ota-round4/`; `--resume` retains passed
stages only with the same device and fixture fingerprint. Android reinstalls the specified QA APK
and clears that task app's saves on the selected emulator. Both change test saves and channel fixtures.
See each script's options for custom output and server-log paths. `TRIALS_PROBE_TIMEOUT_MS` extends
the iOS debug probe deadline when observing the 120-second startup watchdog; its default is 150 seconds.
The debug bridge observes readiness for up to 200 seconds and remains absent from Release builds.
These suites cover update delivery and recovery, separately from native-input and physical-device gates.

Native binary-upgrade tests keep actual game-earned PB/ghost recordings and normal UI preferences
across install-over-existing-app replacement:

```sh
node scripts/native-ios-upgrade.mjs
node scripts/native-android-upgrade.mjs --serial emulator-5554 \
  --baseline .native-build/upgrade-round5/baseline.apk \
  --upgraded .native-build/upgrade-round5/upgraded.apk
```

The iOS runner freezes the normal baseline and builds version 1.0.1 (2) into separate derived data;
`--skip-build` reuses those frozen artifacts. It owns only the shutdown primary task simulator and
restores the baseline without uninstalling. The Android runner requires two prebuilt APKs signed with
the same key and differing native versions; it clears task-app data before seeding the baseline, then
uses `adb install -r` without data clear for the upgrade. Its report includes both package versions.
Neither test proves store-delivered upgrades. iOS Simulator can relocate its data container during
replacement; saved bytes and game reads, rather than the container pathname, define persistence.

Runtime native write failures now show a persistent warning with **Retry save**. The in-memory game
continues; the last committed native snapshot remains available. The warning clears only after a
successful native commit, including an automatic retry on a later mutation/lifecycle flush. Closing
the app while the warning remains can lose changes that have not reached native storage.

`node scripts/native-ios-storage-suite.mjs` and `node scripts/native-android-storage-suite.mjs`
qualify the warning, unchanged committed slots, retry and cold-launch restoration. They intentionally
place a directory at the task app's temporary save-file path to produce a real `EISDIR` write failure,
then remove it and activate Retry save. This tests the write-error path without filling the host disk;
it is not proof of OS low-storage or denied-access handling. Both change test preferences, capture a
static warning screenshot, and clean their temporary obstruction/control files.

Graphics recovery and the native ship gate have dedicated installed-app runners:

```sh
node scripts/native-ios-graphics.mjs
node scripts/native-android-graphics.mjs
```

They use the actual WebView `WEBGL_lose_context` extension at the menu and during a ride, then check
restoration, paused simulation, cleared held controls and explicit Resume. GPU recovery and OS
foregrounding are independent: the app cannot resume its frame loop while either remains unavailable.
The shared renderer must finish rebuilding before gameplay is enabled; restoration does not reload the
app, clear saves, or invoke PWA recovery. The browser back/forward cache retains these listeners.
The same artifact then runs deterministic clears, a terminal crash and one-tick logical restart.
The runners retain cold-launch recordings; GPU readback is a rendering diagnostic, not a visual verdict.
Readbacks must follow a real draw because the WebViews discard non-preserved drawing buffers and the
renderer skips unchanged frames. A transparent sample after an idle pause is insufficient evidence of
a black screen. Android also records a compositor screenshot before its diagnostic redraw.

Native icons and launch artwork reuse the existing PWA brand assets. The
[package audit](../evidence/native-mobile/package-round6.json) records dimensions, hashes and Release
artifact metadata. A native **Release configuration** alone is not a production release: the audited
simulator app is unsigned/non-distributable, the AAB is unsigned, and both have OTA disabled. Production
web-bundle configuration, permanent identity, signing and store/device qualification remain required.

## Signed updates hosted on Vercel

The native updater is `@capgo/capacitor-updater` in manual, self-hosted mode. Vendor auto-update,
statistics and channel endpoints are disabled. The plugin is MPL-2.0; preserve its licence and source
notices in distribution. No hosted Capgo subscription is needed for this delivery path.

The website/PWA keeps its existing service-worker updates. Native apps have their own signed manifest
and ZIP channel; publishing a website does not automatically advance a native release.

Set these **public**, build-time values for a native release:

- `VITE_MOBILE_MANIFEST_IOS`: HTTPS URL of the iOS channel's `manifest.json`.
- `VITE_MOBILE_MANIFEST_ANDROID`: separate Android channel URL.
- `VITE_MOBILE_PUBLIC_KEY`: JSON RSA public JWK used to authenticate manifests.

Without them the bundled game runs and acknowledges updater readiness, but does not fetch updates.
A missing/malformed key or URL must be treated as a release-configuration failure when preparing the
store build, since the user requires OTA in version1. Protect the matching private signing key outside
the repository and public deployment directories. Back it up securely; replacing the trusted public
key requires a store binary unless an explicit key-rotation protocol is added later.

Build once with those settings, then package and sign each platform's release:

```sh
node scripts/mobile-release.mjs \
  --platform ios --native-min 1.0.0 --native-max 1.0.0 \
  --runtime native-v1 --save-schema 1 \
  --bundle-id 0.3.2-web.1 --sequence 1 \
  --expires-at 2026-10-21T00:00:00Z \
  --public-base https://YOUR-UPDATE-HOST/ios/native-v1 \
  --private-key /secure/location/mobile-signing.pem \
  --out .native-build/mobile-site/ios/native-v1
```

Use a fresh future expiry and increasing sequence at release time; the example is not a live channel.
Preserve the same production channel/key settings in every OTA build too: they are compiled into its
JavaScript. A manifest that expires before a player downloads or activates it is rejected; refresh the
release with a later expiry and higher sequence when needed. The sequence is a per-install/native-runtime
high-water mark, not a global guarantee that a fresh install has seen earlier releases.
Repeat with `--platform android` and an Android path. The packager writes a SHA-256-named ZIP, signed
manifest and public key; it does not upload. The ZIP includes `index.html` at its root and excludes source
maps. The native downloader verifies its hash against the authenticated manifest.

Every native build emits `native-build.json` with source revision, runtime/save contract, public channel
URLs and public-key fingerprint. The packager checks this file before signing: a different key, destination
channel or runtime/save schema fails. This prevents accidentally promoting an OTA game that cannot verify
or discover its next update. Rebuild old artifacts that predate this contract; do not hand-edit the file
to bypass a mismatch. It is build provenance inside the signed ZIP, not a substitute for the signature.

Host `.native-build/mobile-site/` as a separate static Vercel deployment with the template
[`deploy/mobile-updates/vercel.json`](../../deploy/mobile-updates/vercel.json). Copy that config to the
site root. Choose/link the actual Vercel project and stable hostname before building store binaries.
Retain old hash-named ZIPs in each published deployment; do not put mobile ZIPs in `public/` where Vite
would recursively include old game archives in future builds. Separate hosting avoids coupling update
availability to website build contents. Both are still Vercel-hosted and use the same game source.

Validate signature, source revision, compatibility and policy eligibility; upload the ZIP before
promoting its manifest. Manifest responses use `no-store`; immutable ZIPs use long caching. Public
CORS allows the apps' local origins; there are no credentials in either public artifact.

## Activation and rollback

A healthy boot acknowledges readiness after the game assets and menu are ready, then checks the
manifest with a bounded request. Platform, native version range, runtime, save schema, signature,
expiry, increasing sequence and immutable URL are checked before download. The complete staged
bundle waits for a later game start, before gameplay initializes: force-quit/relaunch or an explicit
in-app reload both qualify. No automatic mid-run switch or activation on backgrounding.

Before switching, persist removal of the pending marker; before calling a download staged, persist
its sequence and marker. Those records share the durable save adapter so WebView cache eviction
cannot repeatedly retry a known failed update. Preserve two save generations and do not migrate to
an incompatible schema while claiming rollback support.

The native plugin's readiness watchdog can revert a bundle that never reaches a usable boot. It does
not detect every gameplay defect after acknowledgement. To roll back a later regression, publish the
previous good game as a new signed release with a higher sequence. Keep each native-version channel
compatible; do not delete old binaries' required assets. Offline players keep their installed game.

On-device retention must also be bounded. The configuration now explicitly enables
`autoDeletePrevious: true` and `autoDeleteFailed: true`. The former removes an older
successful fallback only after the new bundle acknowledges readiness; `autoDeleteFailed: true` removes
failed bundle files after rollback. The built-in bundle remains. These switches do not clean every
abandoned download: the controller now removes orphaned `pending` bundles after readiness, attempting at
most eight deletions per launch. It preserves the active bundle, durable pending pointer, all successful
fallbacks and native-managed error/downloading/deleting states, serializes with its own downloads and
requires a successful save flush before deleting. Deletion failures are retried on later launches.
This is conservative housekeeping, not a hard quota for every native status. Keep remote known-good
artifacts even after on-device cleanup.
Local rollback qualification used the earlier `autoDeletePrevious: false` configuration; the new
orphan sweep has an [installed iOS pass](../evidence/native-mobile/ios-retention.json): a deliberately
seeded pending bundle disappears on the next healthy launch, with current/bundled and existing successful
content preserved. Successful-fallback replacement, failed-file retention, interrupted downloads and
Android cleanup with the final configuration still need installed-app qualification.

Native SDK/plugin/permission changes and iOS-ineligible functionality changes use normal store releases.
Revalidate Apple/Google policy before each promotion; a signed bundle is authentic, not automatically
eligible for store-policy bypass. The initial channel remains unpublished until its recovery gates pass.

Apple's §2.5.2 restricts downloaded code that introduces or changes app features/functionality; using a
WebView or an OTA plugin does not by itself exempt this game. Treat uncertain feature changes as store
releases and describe the update mechanism in review notes. Google Play's policy explicitly distinguishes
JavaScript running in a WebView/interpreter from downloaded native executables, while requiring all
runtime-loaded behavior to comply with Play policy. Neither platform promises permanent approval of
every later update. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/#software-requirements),
[Google Play device and network abuse policy](https://support.google.com/googleplay/android-developer/answer/16559646?hl=en).

The mandatory simulator/emulator matrix and execution status are in the
[publishing plan](../plans/NATIVE_MOBILE_PUBLISHING.md). Only installed-app reports prove a pass;
device availability and unit tests do not close an E2E case.

Release drafts: [privacy/network inventory](PRIVACY-AUDIT.md),
[store copy and reviewer walkthrough](STORE-LISTINGS.md), [dependency notices](THIRD_PARTY.md).
