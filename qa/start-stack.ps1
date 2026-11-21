[CmdletBinding()]
param([switch]$Fresh)

$ErrorActionPreference = 'Stop'
$qaRoot = Join-Path $env:LOCALAPPDATA 'MadrastyBuild/qa-supabase'
$qaSupabase = Join-Path $qaRoot 'supabase'
$qaContainer = 'supabase_db_madrasty_final_qa'
$repo = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Path $qaSupabase -Force | Out-Null
foreach ($folder in @('migrations','templates')) {
  $destination = Join-Path $qaSupabase $folder
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  Get-ChildItem -File -LiteralPath (Join-Path $repo "supabase/$folder") |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $destination }
}
@'
project_id = "madrasty_final_qa"
[api]
port = 55421
[db]
port = 55422
shadow_port = 55420
major_version = 17
[db.seed]
enabled = false
[studio]
enabled = false
[inbucket]
enabled = true
port = 55424
[analytics]
enabled = false
[auth]
site_url = "http://127.0.0.1:4300"
additional_redirect_urls = ["http://127.0.0.1:4300/**"]
enable_signup = false
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/app/block_revoked_auth_refresh"
[auth.mfa.totp]
enroll_enabled = true
verify_enabled = true
[storage]
enabled = true
'@ | Set-Content -LiteralPath (Join-Path $qaSupabase 'config.toml') -Encoding utf8NoBOM

$startLog = Join-Path $qaRoot 'start.log'
supabase start --workdir $qaRoot --exclude 'studio,realtime,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta' *> $startLog
if ($LASTEXITCODE -ne 0) { throw "Local QA startup failed. Inspect $startLog privately." }

if ($Fresh) {
  $containerPath = docker inspect --format '{{ index .Config.Labels "com.supabase.cli.workdir" }}' $qaContainer
  $containerProject = docker inspect --format '{{ index .Config.Labels "com.supabase.cli.project" }}' $qaContainer
  if ($LASTEXITCODE -ne 0 -or $containerPath -ne $qaRoot -or $containerProject -ne 'madrasty_final_qa') {
    throw 'Refusing to reset a stack that does not match the dedicated local QA identity.'
  }
  $resetLog = Join-Path $qaRoot 'reset.log'
  supabase db reset --local --workdir $qaRoot *> $resetLog
  if ($LASTEXITCODE -ne 0) { throw "Local fixture reset failed. Inspect $resetLog privately." }
  $bindingsPath = Join-Path $PSScriptRoot '.env.local'
  if (Test-Path -LiteralPath $bindingsPath) { Remove-Item -LiteralPath $bindingsPath }
  Get-ChildItem -File -LiteralPath $PSScriptRoot -Filter '.env.totp-qa-*' | Where-Object {
    $_.Name -match '^\.env\.totp-qa-[a-f0-9]{32}-[a-z-]+$'
  } | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.env.local'))) {
  & (Join-Path $PSScriptRoot 'local.ps1')
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Output 'The isolated QA stack is ready.'
