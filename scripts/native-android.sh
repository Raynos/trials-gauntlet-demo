#!/usr/bin/env bash
set -euo pipefail

# Debug APKs are locally installable. Release bundles remain unsigned until
# the publisher supplies a signing configuration outside version control.
case "${1:-debug}" in
  debug) tasks=(assembleDebug) ;;
  bundle) tasks=(bundleRelease) ;;
  all) tasks=(assembleDebug bundleRelease) ;;
  *) echo "Usage: $0 [debug|bundle|all]" >&2; exit 2 ;;
esac

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

# The Filesystem plugin uses the Java 21 Gradle toolchain explicitly.
if [[ -x /usr/libexec/java_home ]]; then
  java21_home="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
  if [[ -n "$java21_home" ]]; then export JAVA_HOME="$java21_home"; fi
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
    export ANDROID_HOME="$ANDROID_SDK_ROOT"
  elif [[ -d "$HOME/Library/Android/sdk" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  elif [[ -d "$HOME/Android/Sdk" ]]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  else
    echo 'Install Android SDK and set ANDROID_HOME before building.' >&2
    exit 1
  fi
fi

pnpm build:native
pnpm exec cap sync android
node scripts/native-paths.mjs
cd android
./gradlew --no-daemon "${tasks[@]}"
