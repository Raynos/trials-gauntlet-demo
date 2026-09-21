# Native store listing drafts

Drafted 2026-09-21 from the current game and native implementation. These texts have not been submitted. Publisher identity, production channel, store ratings and physical-device qualification remain open. The intended release is free with no ads or purchases.

## Common product copy

**Name:** Trials Gauntlet

**Apple subtitle:** Offline motorcycle trials

**Google short description:** Ride, balance, crash and retry in a free offline motorcycle trials game.

**Description:**

Find your balance. Clear the obstacle. Try again.

Trials Gauntlet is a single-player motorcycle trials game about throttle control, timing and learning the track. Use gas, brake and rider lean to cross ramps, gaps and obstacles, then return to improve your run.

- Ride with touch controls in landscape.
- Work through increasingly demanding tracks.
- Retry from checkpoints or restart a track.
- Chase better times and race your personal-best ghost.
- Choose your bike and rider look in the garage.
- Play the installed game offline and keep progress on your device.

Free to play, with no ads, purchases or sign-in.

**Optional update sentence — use only after the production channel is configured and qualified:** An internet connection lets the app download available game updates; downloaded updates apply when you next start or reload the game.

**First release notes:** First mobile release of Trials Gauntlet, with offline play, touch controls, saved progress and personal-best ghosts.

Do not add a guaranteed frame rate, universal device support, cloud saves, multiplayer, an age rating, “no data collected,” unlimited future updates, or a claim of App Store approval to this copy without corresponding release evidence. Website deployments do not automatically become native releases.

## Store fields awaiting the publisher

| Field | Value/status |
| --- | --- |
| Publisher/account type | Personal publisher, as authorized; **OPEN exact legal/display name**. |
| Bundle/package identifier | `com.trialsgauntlet.game` is the development identifier; **OPEN permanent registration/availability**. |
| Native version/build | Current development shell `1.0.0` / `1`; game package version is separate. Confirm the upload's actual values. |
| Pricing / monetization | Free; no ads or in-app purchases in this release scope. |
| Categories | Suggested Games → Racing / Simulation where available; publisher chooses actual store categories. |
| Support URL/email | **OPEN — no fabricated contact or placeholder should be submitted.** |
| Privacy URL | **OPEN — publish policy after completing [PRIVACY-AUDIT.md](PRIVACY-AUDIT.md).** |
| Copyright / rights | **OPEN exact rights-holder text and third-party asset/license review.** |
| Age/content rating and audience | **OPEN store questionnaires.** Include motorcycle crashes in the assessment. Do not preselect a child-directed audience from appearance alone. |
| Screenshots / preview | **OPEN captured gameplay from qualified native builds and required device formats.** Use actual play; current emulator evidence is not a claim about real-device performance. |
| Review contact | **OPEN name, reachable email and phone as requested by each console.** |

## Reviewer notes template

Fill the bracketed release facts and remove the internal drafting note before submission:

> Trials Gauntlet is a free, single-player motorcycle trials game. No game account, login, ads or purchases are required. The complete playable game is bundled in the app and can be started offline. Open Play, choose a track, and use the landscape touch controls for gas, brake and rider lean. The restart control returns to a checkpoint; a longer restart action starts the track again. Settings contains sound, graphics and a local run-log control.
>
> The app uses Capacitor's native WebView to run our TypeScript/Three.js game, with native lifecycle handling and app-private save files. Our publisher-controlled update channel is [EXACT HTTPS CHANNEL URL / DISABLED IN THIS SUBMITTED BUILD]. Signed game bundles are authenticated using an embedded public key, checked against native/runtime/save compatibility and a SHA-256 archive hash, and downloaded without interrupting the current ride. They are activated at a subsequent game startup or explicit reload. A readiness watchdog restores the prior healthy bundle if an update cannot complete boot. The store binary always includes a playable fallback.
>
> Native code, plugins, permissions and changes requiring store review are distributed through store updates. This mechanism is not intended to bypass review or introduce undisclosed functionality. The review candidate's native version/build is [VERSION / BUILD], bundled game revision is [REVISION], and channel release currently offered is [RELEASE ID OR NONE]. Support/privacy details are [VERIFIED URLS].

Internal drafting note: the current standard local build has its update channel **disabled**; the user requires OTA for the eventual first store release. Configure and qualify that release before replacing the channel field. Local HTTPS QA successfully exercised staging, next-launch activation, bad-hash rejection and failed-ready rollback; it is not a production-host or store-review result. Review notes must match the exact binary/channel reviewers can access.

Apple's downloaded-code restrictions still apply to WebView games; a plugin does not create an exemption. Google's policy distinguishes interpreted WebView JavaScript from native executable downloads but still applies its policies to runtime-loaded behavior. Decide each release's eligibility before promotion and describe the actual mechanism candidly. [Apple software requirements](https://developer.apple.com/app-store/review/guidelines/#software-requirements); [Google device and network abuse policy](https://support.google.com/googleplay/android-developer/answer/16559646?hl=en).

## Review walkthrough to verify on the submitted build

1. Cold-start offline, open Play and ride a track without credentials.
2. Crash, retry, pause/background and return; confirm the game remains paused until resumed.
3. Relaunch and confirm local progress/settings remain.
4. Verify the privacy/support links and supplied reviewer contact actually work.
5. With the declared update host reachable, verify the channel ID and timing match these notes. Keep a known-good artifact available throughout review.

The parent must judge gameplay clips and finish physical-device/store gates from the [publishing plan](../plans/NATIVE_MOBILE_PUBLISHING.md) before these drafts are marked submission-ready.
