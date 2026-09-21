# Initial Android shell proof

`android-initial.json` records the first compiled Android shell, before durable saves and the final OTA integration. It is not qualification of the final source or a store release.

The debug APK launched offline in a headless Android API 36 ARM64 Pixel 7 emulator. The existing flat-track golden replay cleared twice at the same 8.65-second finish and state hash; the crash input faulted, and restart returned to riding. An actual Home interruption paused the game, cleared inputs, and preserved its tick across foregrounding. Android Back resumed and then paused the run.

The played clear/crash/restart video is the ignored local `.native-build/android-clear-crash-restart.mp4`, identified by hash in the JSON. It was captured with `adb screenrecord` while inputs advanced and frames rendered inside the native WebView. The parent judges the clip. Emulator timings are not device performance claims.

Build again with `bash scripts/native-android.sh all`. It produces an installable debug APK and an unsigned release AAB under `android/app/build/outputs/`; publishing still requires the publisher's identity, signing, store setup, and final device qualification. The final shell uses semantic version `1.0.0` independently of the web package version.
