$ErrorActionPreference = 'Stop'
$target = Join-Path $env:LOCALAPPDATA 'MadrastyBuild/qa-restore'
$supabaseDir = Join-Path $target 'supabase'
$migrationDir = Join-Path $supabaseDir 'migrations'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
New-Item -ItemType Directory -Path $migrationDir -Force | Out-Null
Get-ChildItem -File -LiteralPath (Join-Path $repo 'supabase/migrations') |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $migrationDir }
@'
project_id = "madrasty_qa_restore"
[api]
port = 56421
[db]
port = 56422
shadow_port = 56420
major_version = 17
[db.seed]
enabled = false
[studio]
enabled = false
[inbucket]
enabled = false
[analytics]
enabled = false
[auth]
enable_signup = false
[storage]
enabled = true
'@ | Set-Content -LiteralPath (Join-Path $supabaseDir 'config.toml') -Encoding utf8NoBOM

$log = Join-Path $target 'start.log'
supabase start --workdir $target --exclude 'studio,realtime,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta' *> $log
if ($LASTEXITCODE -ne 0) { throw "Isolated restore target startup failed. Inspect $log privately." }
$label = docker inspect --format '{{ index .Config.Labels "com.supabase.cli.project" }}' supabase_db_madrasty_qa_restore
if ($LASTEXITCODE -ne 0 -or $label -ne 'madrasty_qa_restore') { throw 'Restore project identity did not match.' }
$status = supabase status --workdir $target -o json 2>$null | Out-String | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $status.API_URL -ne 'http://127.0.0.1:56421' -or
    ([uri]$status.DB_URL).Host -ne '127.0.0.1' -or ([uri]$status.DB_URL).Port -ne 56422) {
  throw 'Restore endpoints were outside the designated isolated target.'
}
@"
QA_RESTORE_PROJECT=$label
QA_RESTORE_ORIGIN=$($status.API_URL)
QA_RESTORE_SERVICE_KEY=$($status.SERVICE_ROLE_KEY)
QA_RESTORE_ANON_KEY=$($status.ANON_KEY)
"@ | Set-Content -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) '.env.restore') -Encoding utf8NoBOM
Write-Output 'The independent local media restore target is ready.'
