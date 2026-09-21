#!/usr/bin/env bash
set -euo pipefail

# Headless XCUITest on a separate simulator. Uses already-synced assets; no Vite/cap sync.
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
project="ios/App/App.xcodeproj"
output="${TRIALS_UI_OUTPUT:-.native-build/ios-ui}"
mkdir -p "$output"
output="$(cd "$output" && pwd)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
started_at="$(date +%s)"
record_pid=''
booted_here=0
cleanup() {
  if [[ -n "$record_pid" ]]; then kill -INT "$record_pid" 2>/dev/null || true; wait "$record_pid" 2>/dev/null || true; fi
  if [[ "$booted_here" == 1 ]]; then
    if [[ "${TRIALS_UI_OBSERVE:-0}" == 1 ]]; then
      app_data="$(xcrun simctl get_app_container "$device" com.trialsgauntlet.game data 2>/dev/null || true)"
      if [[ -f "$app_data/Documents/native-probe.json" ]]; then
        python3 - "$app_data/Documents/native-probe.json" "$output/observed-$stamp.json" "$started_at" <<'PYTHON'
import json, pathlib, sys
source = pathlib.Path(sys.argv[1])
try:
    report = json.loads(source.read_text())
    if report.get("probeAt", 0) >= int(sys.argv[3]) * 1000 and "events" in report:
        pathlib.Path(sys.argv[2]).write_bytes(source.read_bytes())
except (OSError, ValueError):
    pass
PYTHON
      fi
    fi
    xcrun simctl shutdown "$device" || true
  fi
}
trap cleanup EXIT

device="$(xcrun simctl list devices available --json | python3 -c '
import json, os, sys
all_devices = [d for group in json.load(sys.stdin)["devices"].values() for d in group]
wanted = os.environ.get("TRIALS_UI_SIMULATOR")
match = next((d for d in all_devices if d["udid"] == wanted), None) if wanted else next((d for d in all_devices if d["name"] == "iPhone 17e" and d["state"] == "Shutdown"), None)
if not match: sys.exit("Choose an available separate simulator with TRIALS_UI_SIMULATOR; default requires a shutdown iPhone 17e.")
if match["state"] != "Shutdown": sys.exit("UI runner requires a shutdown simulator so it cannot interrupt another session.")
print(match["udid"])
')"
echo "Native UI tests will boot separate simulator: $device"
common=(-project "$project" -scheme App -configuration Debug -destination "id=$device" -derivedDataPath "$output/DerivedData" -clonedSourcePackagesDirPath "$output/SourcePackages" -packageAuthorizationProvider netrc CODE_SIGNING_ALLOWED=NO)
xcodebuild "${common[@]}" build-for-testing > "$output/build.log" 2>&1
# Forward only the diagnostic switch into the generated test-host manifest.
xctestrun="$output/test-run.xctestrun"
python3 - "$output/DerivedData/Build/Products" "$xctestrun" "${TRIALS_UI_OBSERVE:-0}" <<'PYTHON'
import pathlib, plistlib, sys
files = sorted(pathlib.Path(sys.argv[1]).glob("App_*.xctestrun"))
if len(files) != 1: sys.exit("Expected exactly one generated App XCTest manifest")
data = plistlib.loads(files[0].read_bytes())
data["AppUITests"].setdefault("EnvironmentVariables", {})["TRIALS_UI_OBSERVE"] = sys.argv[3]
# __TESTROOT__ is relative to this manifest; preserve the generated product location.
def expand(value):
    if isinstance(value, str): return value.replace("__TESTROOT__", sys.argv[1])
    if isinstance(value, list): return [expand(item) for item in value]
    if isinstance(value, dict): return {key: expand(item) for key, item in value.items()}
    return value
pathlib.Path(sys.argv[2]).write_bytes(plistlib.dumps(expand(data)))
PYTHON
xcrun simctl boot "$device"
booted_here=1
xcrun simctl bootstatus "$device" -b
xcrun simctl io "$device" recordVideo --codec=h264 "$output/touch-$stamp.mp4" > "$output/video-$stamp.log" 2>&1 &
record_pid=$!
xcodebuild -xctestrun "$xctestrun" -destination "id=$device" test-without-building -parallel-testing-enabled NO -maximum-concurrent-test-simulator-destinations 1 -resultBundlePath "$output/result-$stamp.xcresult" > "$output/test-$stamp.log" 2>&1
printf 'Native touch result: %s\nVideo: %s\n' "$output/result-$stamp.xcresult" "$output/touch-$stamp.mp4"
