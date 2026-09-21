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
```

Set `TRIALS_SIMULATOR` to another simulator UDID. The debug-only iOS bridge runs a supplied local JS
probe after real game boot, saves its report in the simulator sandbox, and is absent from Release builds.
The probe copies evidence into `.native-build/evidence/`. `TRIALS_PROBE_FILE` supplies a custom probe;
`TRIALS_PROBE_NO_INSTALL=1` tests a force-quit/relaunch without reinstalling the binary.

Android qualification uses an explicitly launched headless emulator and its debuggable WebView.
Actual phones, thermal measurements and human play remain separate gates. A simulator/emulator pass
must never be labeled a physical iPhone/Android performance result.

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
abandoned download: expired or superseded staged bundles need a separate cleanup policy before broad
production promotion. Keep remote known-good artifacts even after on-device cleanup.
Local rollback qualification used the earlier `autoDeletePrevious: false` configuration; the new
deletion behavior is source-verified and still needs an installed-app retention check.

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
