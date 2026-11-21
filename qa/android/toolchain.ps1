param([string]$VerifyApk)

$ErrorActionPreference = 'Stop'
$buildTools = Join-Path $env:LOCALAPPDATA 'MadrastyBuild'
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = Join-Path $buildTools 'jdk-17.0.21+9' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $buildTools 'sdk' }
if ($VerifyApk) {
  & (Join-Path $env:ANDROID_HOME 'build-tools/36.0.0/apksigner.bat') verify --print-certs $VerifyApk
} else {
  & 'apps/android/gradlew.bat' -p 'apps/android' ':app:testDebugUnitTest' ':app:assembleDebug'
}
exit $LASTEXITCODE
