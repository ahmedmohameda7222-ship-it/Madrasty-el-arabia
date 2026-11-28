#!/usr/bin/env bash
set -euo pipefail
capture_pngs() {
  local stage="$1"
  local dest="qa-artifacts/native-visual-polish/$stage"
  mkdir -p "$dest"
  for remote in /sdcard/Download/madrasty-foundation-qa/$stage/after /sdcard/Download/madrasty-comms-qa /sdcard/Download/madrasty-family-qa /sdcard/Download/madrasty-finance-qa; do
    if adb shell test -d "$remote"; then adb pull "$remote" "$dest/$(basename "$remote")"; fi
  done
}
adb shell settings put system font_scale 1.0
test "$(adb shell settings get system font_scale | tr -d '\r')" = 1.0
normal_rc=0
./apps/android/gradlew -p apps/android :app:testDebugUnitTest :app:assembleDebug :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.visualPolishFontScale=1.0 --no-daemon --stacktrace || normal_rc=$?
capture_pngs normal
adb shell settings put system font_scale 2.0
test "$(adb shell settings get system font_scale | tr -d '\r')" = 2.0
adb shell am force-stop de.madrasty.app.prelaunch
large_rc=0
./apps/android/gradlew -p apps/android :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=de.madrasty.app.ui.FoundationVisualTest,de.madrasty.app.identity.SignInVisualTest -Pandroid.testInstrumentationRunnerArguments.visualPolishFontScale=2.0 --no-daemon --stacktrace || large_rc=$?
mkdir -p qa-artifacts/native-visual-polish/large-text
if adb shell test -d /sdcard/Download/madrasty-foundation-qa/large-text/after; then
  adb pull /sdcard/Download/madrasty-foundation-qa/large-text/after qa-artifacts/native-visual-polish/large-text/after
fi
test "$normal_rc" = 0
test "$large_rc" = 0
test "$(find qa-artifacts/native-visual-polish/normal/after -name '*.png' | wc -l)" -eq 9
test "$(find qa-artifacts/native-visual-polish/normal -name '*.png' | wc -l)" -eq 35
test "$(find qa-artifacts/native-visual-polish/large-text/after -name '*.png' | wc -l)" -eq 9
