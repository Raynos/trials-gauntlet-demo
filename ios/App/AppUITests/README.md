# Native iOS touch smoke test

`NativeTouchTests.swift` drives the installed app through XCUITest's native event synthesis. It reads the WKWebView accessibility tree to locate visible controls and taps their screen coordinates. It does not execute game actions or JavaScript clicks. Optional `TRIALS_UI_OBSERVE=1` enables a passive Debug probe that records trusted pointer/touch events and hit targets for diagnosis; it cannot advance the game and does not change pass criteria. The pause touch control is intentionally absent from the accessibility tree, so its tap uses the documented landscape control position.

The intended route is normal startup → Play → world map Ride → first-run tutorial when present → pause → Restart → pause → Resume → Home/background → activate → remain paused → explicit Resume → pause → Quit. State is preserved between runs; the test does not erase/uninstall the app or reset progress. This is a navigation/lifecycle smoke test, not a track-clear, replay determinism, physical-device performance, or stranger playability verdict.

From the repository root, after the native web assets have been built and synced:

```sh
bash scripts/native-ios-ui.sh
```

The runner uses a separate **shutdown iPhone 17e** simulator by default, then shuts down only that simulator at exit. `TRIALS_UI_SIMULATOR=<UDID>` selects another shutdown simulator explicitly. It refuses an already booted simulator. The pause coordinate is qualified only for the default 844×390 pt iPhone 17e landscape viewport; a different simulator requires validating its control position first. This runner provides no tablet touch qualification. It leaves the usual `trials-iphone` probe device and the user's primary simulator untouched. `TRIALS_UI_OUTPUT` overrides the ignored `.native-build/ios-ui` output directory.

The permanent shared `App` scheme supports the normal app's run/profile/archive actions and the `AppUITests` test action. The script creates no per-user schemes. It builds unsigned simulator products in separate derived data, then executes `test-without-building`. It does not invoke Vite or `cap sync`; callers must prepare the exact assets they intend to test.

An observing run also copies the app’s `native-probe.json` to `observed-TIMESTAMP.json` only when its timestamp belongs to the current run. A run that exits before the observation timer finishes may have no diagnostic report. Outputs include `build.log`, timestamped test logs, an `.xcresult` bundle with failure accessibility hierarchies, and a timestamped `touch-*.mp4` simulator recording. Judge the played recording alongside assertions. The suite's XCTest results are the pass/fail authority; merely building the runner or producing a video is not a pass.

To extract failure attachments for diagnosis:

```sh
xcrun xcresulttool export attachments --path .native-build/ios-ui/result-TIMESTAMP.xcresult --output-path .native-build/ios-ui/attachments-TIMESTAMP
```

The retained first setup attempts exposed a literal-label mismatch (`PLAY ▸`, including its visible arrow) and menu accessibility becoming available beneath the still-opaque boot loader. The readiness check now waits for the loader's `DOWNLOAD` text to disappear before tapping Play. The resulting full native route first passed in `result-20260921T095821Z.xcresult` (43.88 seconds). The normal observer-disabled rerun passed in `result-20260921T100003Z.xcresult` (48.313 seconds). Earlier failed results remain retained. `docs/evidence/native-mobile/ios-ui.json` records hashes, assertions, and scope limits; judge the corresponding played clips alongside those assertions.
