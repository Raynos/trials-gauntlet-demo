# Android integrated shell and OTA qualification

`android-integrated.json` records the emulator checks and exact final artifact hashes. The final APK was rebuilt without a channel or test CA, installed over the QA build with saves retained, reset to its bundled game, and tested offline. The script waits for the loading screen to finish before testing lifecycle events.

The normal app completed the flat-track golden twice at 8.65 seconds with byte-identical state hashes, faulted with the crash recording, restarted at tick 1, and remained paused at the same tick across Home/foreground. The emulator ran alongside other builds/simulators; its render timings are not a physical-device performance verdict.

Real signed HTTPS updates were also tested in a temporary debug APK. The game stayed on its current bundle while a valid update downloaded; a cold launch activated it and acknowledged readiness. Deleting the WebView save mirror before activation still restored the native filesystem save. A signed manifest with the wrong ZIP checksum produced native download failures without activation. A valid bundle that never acknowledged readiness automatically rolled back to the last healthy bundle after the 120-second watchdog, preserving saves.

The temporary CA, debug manifest, and network-security resource were removed before the final build. Test keys live outside the checkout. The final APK archive was checked for absence of the CA and local test channel; automatic cleanup of previous/failed bundles is enabled. The release AAB is unsigned.

To repeat the bundled-app probe with a headless emulator already running and its debug APK installed:

```sh
bash scripts/native-android.sh all
# Install android/app/build/outputs/apk/debug/app-debug.apk on the test emulator.
node scripts/native-android-probe.mjs emulator-5554 .native-build/android-proof.json
```

`scripts/native-ota-test.mjs setup` generates an isolated local HTTPS fixture configuration and temporary keys; `serve` hosts its ignored public fixture directory. This is test infrastructure, not a production update host or publishing command. The earlier played clip and its provenance remain in `android-initial.json`.
