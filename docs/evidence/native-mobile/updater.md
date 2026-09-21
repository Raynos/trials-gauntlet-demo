# Native updater implementation evidence

2026-09-21 · implementation and local simulator/emulator evidence. Healthy signed staging and activation
have passed on iOS simulator and Android emulator; Android checksum rejection and bad-boot rollback
also passed; iOS watchdog rollback and save-mirror restoration passed ([iOS record](ios-local.json)).
These are not physical-phone performance results or store approval.

## Release contract

`src/platform/updates.ts` uses `@capgo/capacitor-updater` through an injected adapter. `readUpdateConfig(url, publicJwkJson)` accepts an explicit HTTPS channel and public-only RSA JWK; absent/invalid configuration disables checks; the controller exposes a status line for future diagnostics. There is no default update endpoint or paid service requirement.

The public channel serves `{payload, signature}`: base64url UTF-8 JSON plus RSA-PSS/SHA-256 signature (32-byte salt). The pinned public key verifies the exact payload before parsing trusted metadata. Schema 1 binds platform, inclusive native version bounds, native runtime contract, save schema, bundle ID, monotonic channel sequence, expiry, immutable URL and SHA-256. ZIP URLs must be same-origin with the channel and end in `<sha256>.zip`. Unsupported save/runtime/native versions fail closed.

Checks run only after readiness and do not block game startup. A verified download is staged in namespaced native storage and flushed before success is reported. Only the next controller's `activateStagedAtBoot()` may switch bundles, before gameplay initializes. It verifies the signed envelope again, matches the plugin's stored version/checksum, durably consumes the pending marker, then calls `set()`. A failed persistence flush prevents switching. It never calls `next()` because background activation could discard a paused ride. Stored sequence plus consuming the marker prevents failed-bundle reload loops. Player progress keys are untouched.

`notifyReady()` calls the plugin watchdog acknowledgement only after the game initialization and menu complete; it is required on every normal launch, including when no channel is configured. Some optional-art failures still degrade under the existing web-game loader, so readiness is not an exhaustive per-asset integrity test. Native config disables cloud auto-update/stats and currently gives the watchdog 120 seconds. Automatic rollback protects pre-readiness failure, not every later gameplay defect or incompatible save migration.

## Source checks

The published npm package `@capgo/capacitor-updater@8.51.20` was inspected locally: MPL-2.0, Capacitor 8 peer, iOS SPM supported. Both native implementations validate a supplied SHA-256 even when plugin `publicKey` is unset: iOS `downloadBundle` compares `next.getChecksum()`; Android `finishDownload` compares the downloaded ZIP checksum. Our separately signed manifest authenticates that expected checksum. The private signing key is never bundled. [Published plugin](https://www.npmjs.com/package/@capgo/capacitor-updater), [iOS source](https://github.com/Cap-go/capacitor-updater/blob/main/ios/Sources/CapacitorUpdaterPlugin/CapacitorUpdaterPlugin.swift), [Android source](https://github.com/Cap-go/capacitor-updater/blob/main/android/src/main/java/ee/forgr/capacitor_updater/CapgoUpdater.java).

Manual mode permits our own distribution URL; its simple example explicitly leaves version and checksum verification to the integrator. [Manual mode](https://capgo.app/docs/plugins/updater/self-hosted/manual-update/). The API provides download, set, readiness acknowledgement and automatic readiness rollback. Its `reset` prose currently reverses `toLastSuccessful`: inspected iOS source uses `true` for successful fallback and default/false for built-in. This implementation does not call reset. [API](https://capgo.app/docs/plugins/updater/api/).

Retention was checked against the installed package source, not inferred from option names. iOS
`CapgoUpdater.swift:2749` and Android `CapgoUpdater.java:1915` perform previous-fallback deletion inside
`setSuccess()`, invoked by `notifyAppReady()`. With `autoDeletePrevious: true`, a different non-builtin
fallback is retained during unacknowledged boot and removed after successful readiness; pending/preview
fallbacks are protected. `autoDeleteFailed` defaults true: watchdog rollback marks the failed bundle,
returns to the good fallback, and schedules failed-file deletion with durable retry. Unreferenced staged
downloads still need controller cleanup; these options alone do not establish bounded disk usage for all
failure paths. [iOS retention source](https://github.com/Cap-go/capacitor-updater/blob/main/ios/Sources/CapacitorUpdaterPlugin/CapgoUpdater.swift),
[Android retention source](https://github.com/Cap-go/capacitor-updater/blob/main/android/src/main/java/ee/forgr/capacitor_updater/CapgoUpdater.java).
Configuration now explicitly enables both deletion options. The local healthy/bad-boot qualification
artifacts were built with the earlier `autoDeletePrevious: false` setting, so their recovery result
must not be cited as a measured retention result for the new configuration.

## Packaging and deployment

`scripts/mobile-release.mjs` packages an existing `dist-native` with `index.html` at ZIP root, excluding source maps. It requires explicit platform, native bounds, runtime, save schema, sequence, bundle ID, expiry, public HTTPS base, output directory and external private-key path. It writes the hash-named ZIP, signed `manifest.json`, and public JWK. It uploads nothing. Generate the signing key outside the repository; pass only the public JWK to the app build. Never place private keys in build/release directories.

Serve public channels/ZIPs on Vercel with GET CORS for the native origins, channel `Cache-Control: no-store`, and immutable ZIP caching. Publish ZIP first, channel manifest last. Retain previous ZIPs. Each platform/native runtime gets a separate channel; increment sequence even for a deliberate rollback release. Signing/distribution access is a release capability. Native plugin/config changes require a new store binary. [Native compatibility](https://capgo.app/docs/live-updates/compatibility/).

The website's PWA worker remains independent. Shipping `dist/` does not promote the signed channel;
`dist-native/` embeds no service worker. Every store and OTA build needs the production public JWK and
platform channel URLs compiled in. Current production channels are deliberately unset/unpublished;
that is a release gate because the requested first store release must support OTA. Local qualification
uses an ephemeral signing key and trusted test HTTPS server, with temporary simulator/debug trust only.
No private key, test CA trust, or test endpoint belongs in a release artifact.

Signature and native compatibility do not establish store-policy eligibility. Apple's §2.5.2 restricts
downloaded feature/functionality changes; Google distinguishes interpreted WebView JavaScript from
native executables while keeping all downloaded behavior subject to Play policy. Promotion must classify
the actual change, and uncertain iOS feature changes use store review. [Apple guidelines](https://developer.apple.com/app-store/review/guidelines/#software-requirements),
[Google policy](https://support.google.com/googleplay/android-developer/answer/16559646?hl=en).

## Verification

- 19 controller tests: signatures, tampering, platform/native/runtime/save constraints, expiry, immutable URL, stage-only behavior, next-launch activation, checksum mismatch, failed-switch loop prevention, persistence-flush ordering/failures, offline/disabled operation and save preservation.
- Node packager test: generated ZIP hash, RSA-PSS signature, ZIP root layout, source-map omission, public-only exported key and web-build rejection.
- Full TypeScript check and scoped ESLint passed.
- Integrated native and web builds pass: native HTML excludes SW registration/update/cache-failure advice; native has no `sw.js`; web retains the SW and excludes native bridge chunks. Full suite: 91 files, 1096 passed and 2 skipped; packager test passed. Full-repo lint has 9 existing errors in untouched art/evidence/harness files; scoped changed-source lint passes.
- Healthy signed bundle B staged without switching the running game, activated after force-close/relaunch, and reached successful readiness on both iOS simulator and Android emulator. Android's [integrated report](android-integrated.json) records pending → success, removal of its pending marker, retained sequence, retained `lastTrack`, and another successful relaunch.
- Android's same report records rejection of a wrong checksum without switching from `1.0.1-qa`, and watchdog rollback from `1.0.3-qa` to successful `1.0.1-qa` after about 128 seconds including reload. Saves and consumed pending state survived. Airplane-mode game boot, deterministic clears, crash/restart and paused background/foreground behavior also passed in that emulator.
- [iOS local record](ios-local.json): an unacknowledged broken bundle rolled back to successful healthy B, consumed the pending marker and retained sequence2. A later corrupted seq3 archive did not stage or advance the sequence; its native rejection event was not separately captured. Sound setting restored from native snapshots after deleting its WebView mirror and force-quitting. Interrupted-download and native-version-rejection installed-app cases remain distinct gates unless a platform report explicitly proves them. Report each platform's actual outcome separately; the unit tests do not replace these checks.
- Production follow-ups: configure and qualify real channels/key; bound abandoned-download retention; preserve compatible save schemas; measure readiness timeout on physical devices. Production channels have not been published.
