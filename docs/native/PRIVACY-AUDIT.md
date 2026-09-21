# Native privacy and network inventory

Source audit: 2026-09-21. Scope: the native TypeScript build, Capacitor 8.5.2, App 8.1.1, Filesystem 8.1.3, updater 8.51.20, and their built manifests. This is a disclosure worksheet, not completed store declarations or a published privacy policy. Production publisher details and hosting settings are still open.

## Findings that affect the disclosures

The game is free, single-player, and playable from its installed assets without an account. No ad, purchase, remote leaderboard, or automatic gameplay analytics integration was found in the inspected game paths. This does **not** establish “no data collected”: a configured update host receives network requests, and its logging/retention settings have not been inspected.

| Data or capability | Actual behavior and purpose | Disclosure consequence |
| --- | --- | --- |
| Progress, best runs, ghosts/replays, selected bike/outfit, settings | `src/platform/native-storage.ts` persists an allowlist in two app-private filesystem snapshots, with a WebView storage mirror. Used for progress and recovery. | No game-code upload found. Do not describe this as cloud sync. Android `allowBackup=true`; OS backup/restore behavior needs a documented release choice. |
| Local run diagnostics | `src/game/telemetry.ts`, `src/ui/best.ts`: enabled by default, Settings → Run log can disable future logging. Up to 200 run records and 10 bench reports. Includes time, track, inputs/crashes, navigation, quality, frame timing, build, and a device description derived from user agent/viewport. | Local processing unless the player exports. Do not call this opt-in, automatic server analytics, or anonymous data. Turning logging off does not erase existing records. |
| Copy/Share run log | `src/game/app.ts`, `src/ui/front.ts`: explicit player action copies JSON to clipboard or invokes Web Share when supported. No fixed developer upload destination. | Explain that the selected recipient receives the exported data. Assess the stores' user-initiated transfer rules against the final UI; do not silently assume an exemption. |
| Signed update checks | `src/platform/updates.ts`: after a healthy boot, GET the configured platform manifest with `credentials: omit`, no query parameters, and no body. Current standard build has no channel/key and performs no such check. | A production channel will expose request IP, time, requested path and normal browser/network headers to its host. Confirm retention, purposes, processors and access. |
| Native ZIP downloads | Updater downloads the authenticated hash-named ZIP. Its iOS/Android downloader sets a User-Agent containing app ID, plugin version, OS/platform version; inspected download path does not append its device UUID to the ZIP URL. | Hosting can receive these technical fields even without analytics. Capture production traffic before finalizing labels. |
| Updater identifier and state | The plugin generates a random UUID. iOS uses `DeviceIdHelper.swift` and Keychain; Android uses Keystore-backed preferences plus a backup-restorable legacy preference. Also stores current/fallback bundles, versions and errors. | An identifier exists locally even though vendor statistics are disabled. iOS helper is designed to retain it across reinstalls; do not promise uninstall erases every identifier. |
| Vendor updater endpoints | `capacitor.config.ts`: `autoUpdate: 'off'`; `updateUrl`, `statsUrl`, `channelUrl` are empty. Inspected iOS `sendStatsWithMetadata` and Android `DownloadService.sendStatsAsync` return for an empty stats URL. No application call enables vendor statistics. | No configured vendor telemetry path found. Re-audit if endpoint/config/plugin defaults change. This is source/config evidence, not a full production packet-capture claim. |
| Website review inbox | `src/ui/inbox.ts` explicitly disables `reviewEnabled` in the native target. Web-only notes otherwise contain typed text, run/device context and a canvas JPEG posted to `/api/inbox`. | Exclude this website feature from the current native collection inventory; reassess before enabling it in an app. |
| Models, art, fonts, audio, bench fixtures | Relative asset requests in boot/render code resolve to the installed local app origin. Native service-worker registration is disabled. Audio is generated/played; no microphone capture path was found. | Local asset loading is not a remote website visit. No camera, photo library, microphone, contacts or location use was found in these paths. |

## Android permissions and components

Inspect the **merged release manifest**, not just `android/app/src/main/AndroidManifest.xml`. The inspected file is `android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml`.

| Permission | Origin/purpose found |
| --- | --- |
| `INTERNET` | App manifest; HTTPS update delivery when configured. |
| `ACCESS_NETWORK_STATE`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE` | Transitive AndroidX WorkManager infrastructure included by the updater's download implementation. These declarations exist even with the vendor auto-update service disabled. |
| `com.trialsgauntlet.game.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | Signature-protected AndroidX receiver permission in the merged app. |

The merged app contains WorkManager job/alarm/foreground services and receivers, AndroidX startup/profile components, a non-exported FileProvider, and Play Core's dialog wrapper. Updater dependencies include Play app-update libraries; the game's inspected TypeScript does not call their native store-update flow. No location, microphone, camera, media-library, contacts, notification, advertising-ID, or broad storage permission appeared in the inspected merged release manifest. Review the transitive permission set again after every dependency change; this audit does not remove permissions or prove that every optional plugin path is exercised.

## iOS declarations

`ios/App/App/Info.plist` has no camera/microphone/location/photo usage-description keys or background mode declaration. Filesystem saves use `Directory.Library`, within the app container. The updater uses Keychain/UserDefaults internally; it does not prompt for a player login.

The app's `PrivacyInfo.xcprivacy` currently declares:

| Required-reason API category | Reason in file | Supporting implementation |
| --- | --- | --- |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1` | Filesystem integration; matches the pinned Filesystem README and [official plugin guidance](https://capacitorjs.com/docs/apis/filesystem). |
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | Updater's preferences; matches the pinned updater README. |

The built simulator app also contains Capacitor/Cordova, Alamofire and ZIPFoundation privacy manifests. ZIPFoundation declares FileTimestamp `0A2A.1`; the inspected other framework manifests declare no collected-data types or tracking. The app manifest likewise has empty collected-data/tracking-domain arrays and tracking false. These files are not proof that the eventual hosting service collects nothing. Validate the final signed archive's aggregated report and actual API use against [Apple's required-reason guidance](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).

## Store disclosure worksheet — not ready to submit

Apple asks for the app's and integrated partners' practices and distinguishes on-device work from off-device data retained beyond servicing a request. Google includes app-controlled WebViews and SDK transmissions in its disclosure scope and defines its own collection/sharing exceptions. Use each form's definitions rather than copying one set of answers to the other. [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/); [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-AE).

| Form topic | Source-supported answer / unresolved work |
| --- | --- |
| Accounts, ads, purchases | No game account, ad delivery or purchases in this release scope. Confirm the exact store binary and publisher's final business model. |
| Gameplay content, usage and diagnostics | Local records described above are not automatically uploaded by game code. If the publisher receives exports through support, document that separate path, retention and purpose. |
| Identifiers, technical request data | Local updater UUID exists. No UUID transmission found in the configured delivery path. Host receives network/HTTP metadata; classify retained fields only after inspecting provider settings and purposes. Do not infer coarse-location collection merely because an IP is present, or rule it out before checking whether location is derived. |
| Tracking / advertising purposes | No tracking or advertising flow found in inspected game/configuration. Confirm hosting integrations, analytics toggles, log drains and support processors before final answers. |
| Encryption | Manifest and ZIP URLs require HTTPS. Native snapshots are app-private but the game does not encrypt their JSON itself. Do not describe local saves as end-to-end encrypted. |
| Deletion and retention | Local run-log bounds are known; publisher support/log retention is unknown. Existing data can remain when logging is disabled. OS backup and the plugin UUID complicate blanket uninstall/deletion claims. No account-deletion feature is present because no game accounts are created. |
| Optional/required and sharing | Player export is explicit. Automatic update requests occur when a production channel is configured; the present game has no in-app network-update opt-out. Complete form choices after host processing is established; airplane mode is not an in-app consent control. |

Vercel documents request records and filtering using IP/User-Agent, including static cache requests, with plan-dependent observability retention. That documentation establishes that logging is possible; it does not tell us this unconfigured production project's actual settings. [Vercel runtime logs](https://vercel.com/docs/logs/runtime).

## Open publisher fields and evidence needed

- **OPEN:** personal publisher's exact legal/display name, privacy contact, support email, support URL and public privacy-policy URL.
- **OPEN:** final app identifiers and production update hostname/project; processor relationship, enabled analytics/log drains/firewall data, fields retained, retention periods and who can access them.
- **OPEN:** policy text covering local saves/logs, explicit exports, updater identifier, OS backups and actual network processing; do not publish “we collect no data” from this source audit alone.
- **OPEN:** final signed iOS archive privacy report, final Android merged manifest, and traffic capture covering first launch, offline play, update download, failed update and export. Simulator update tests prove delivery/recovery, not all privacy behavior.
- **OPEN:** actual age/content questionnaires and audience selection. Rider crashes are present; no age rating or children-directed claim is established here.

Relevant evidence: [native plan](../plans/NATIVE_MOBILE_PUBLISHING.md), [build/update operations](README.md), and [native evidence](../evidence/native-mobile/). Store text is drafted separately in [STORE-LISTINGS.md](STORE-LISTINGS.md).
