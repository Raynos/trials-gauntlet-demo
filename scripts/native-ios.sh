#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm build:native
pnpm exec cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath .native-build/ios -packageAuthorizationProvider netrc CODE_SIGNING_ALLOWED=NO build
