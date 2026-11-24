[CmdletBinding()]
param([switch]$Serve, [switch]$PreviousRelease)

$ErrorActionPreference = 'Stop'
$qaProject = 'madrasty_final_qa'
$qaTarget = Join-Path $env:LOCALAPPDATA 'MadrastyBuild/qa-supabase'
$qaContainer = 'supabase_db_madrasty_final_qa'
$qaDirectory = $PSScriptRoot
$repo = Split-Path -Parent $qaDirectory
$qaEnv = Join-Path $qaDirectory '.env.local'
$qaAuth = 'http://127.0.0.1:55421'
$qaOrigin = 'http://127.0.0.1:4300'

if ($Serve) {
  if (-not (Test-Path -LiteralPath $qaEnv)) { throw 'Configure the local QA stack before starting the web server.' }
  $bindings = ConvertFrom-StringData (Get-Content -Raw -LiteralPath $qaEnv)
  if ($bindings.QA_PROJECT -ne $qaProject -or $bindings.QA_AUTH -ne $qaAuth -or $bindings.QA_ORIGIN -ne $qaOrigin -or
      $bindings.APP_ORIGIN -ne $qaOrigin -or $bindings.SUPABASE_URL -ne $qaAuth -or $bindings.SCHOOL_ENVIRONMENT -ne 'prelaunch') {
    throw 'Refusing to launch with bindings outside the dedicated local QA stack.'
  }
  foreach ($entry in @(@('DATABASE_URL', 'madrasty_qa_runtime'), @('DELIVERY_WORKER_DATABASE_URL', 'madrasty_qa_delivery'),
      @('INVITE_WORKER_DATABASE_URL', 'madrasty_qa_invite'))) {
    $database = [uri]$bindings[$entry[0]]
    if ($database.Scheme -ne 'postgresql' -or $database.Host -ne '127.0.0.1' -or $database.Port -ne 55422 -or
        $database.AbsolutePath -ne '/postgres' -or -not $database.UserInfo.StartsWith($entry[1] + ':')) {
      throw "Refusing database binding $($entry[0]) outside the designated local fixture stack."
    }
  }
  foreach ($name in @('APP_ORIGIN','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_AUTH_ADMIN_KEY',
    'SUPABASE_MEDIA_ADMIN_KEY','DATABASE_URL','SCHOOL_ENVIRONMENT','PRELAUNCH_EMAIL_ALLOWLIST',
    'INVITATION_ENVELOPE_KEY','SCHOOL_WORKER_SECRET','DELIVERY_WORKER_DATABASE_URL','INVITE_WORKER_DATABASE_URL')) {
    [Environment]::SetEnvironmentVariable($name, $bindings[$name], 'Process')
  }
  foreach ($name in @('DATABASE_TLS_CA_PEM','BREVO_API_KEY','RESEND_API_KEY','FCM_SERVICE_ACCOUNT_B64',
    'WEB_PUSH_PRIVATE_KEY','WEB_PUSH_PUBLIC_KEY','SCHOOL_EMAIL_PROVIDER')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  $webRoot = $repo
  $port = 4300
  if ($PreviousRelease) {
    $previous = 'a45f18ed79dc5e315a8bb91f07c9f5b9bc086d14'
    $webRoot = Join-Path $qaTarget "rollback-$previous"
    $archive = Join-Path $qaTarget "rollback-$previous.zip"
    if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'apps/web/package.json'))) {
      git -C $repo archive --format=zip --output=$archive $previous -- apps/web packages/contracts package.json pnpm-lock.yaml pnpm-workspace.yaml
      if ($LASTEXITCODE -ne 0) { throw 'Could not export the previous operating web source.' }
      Expand-Archive -LiteralPath $archive -DestinationPath $webRoot
      Remove-Item -LiteralPath $archive
    }
    pnpm --dir $webRoot install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Installing the pinned previous release dependencies failed.' }
    $port = 4310
  }
  Push-Location $webRoot
  try { pnpm --filter @madrasty/web exec next dev --webpack --hostname 127.0.0.1 --port $port }
  finally { Pop-Location }
  exit $LASTEXITCODE
}

$label = docker inspect --format '{{ index .Config.Labels "com.supabase.cli.project" }}' $qaContainer
if ($LASTEXITCODE -ne 0 -or $label -ne $qaProject) {
  throw "Start the dedicated local stack first. Expected container $qaContainer."
}
$bindings = supabase status --workdir $qaTarget -o json 2>$null | Out-String | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $bindings.API_URL -ne $qaAuth -or
    ([uri]$bindings.DB_URL).Port -ne 55422 -or ([uri]$bindings.DB_URL).Host -ne '127.0.0.1') {
  throw 'Supabase CLI did not report the dedicated local endpoints.'
}
if (Test-Path -LiteralPath $qaEnv) {
  throw "Local QA bindings already exist at $qaEnv. Keep them to resume the same fixture run."
}

function New-LocalSecret {
  [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
}

$runtimeSecret = New-LocalSecret
$fixtureSecret = New-LocalSecret
$deliverySecret = New-LocalSecret
$inviteSecret = New-LocalSecret
$roles = @"
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'madrasty_qa_runtime') THEN CREATE ROLE madrasty_qa_runtime; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'madrasty_qa_fixture') THEN CREATE ROLE madrasty_qa_fixture; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'madrasty_qa_delivery') THEN CREATE ROLE madrasty_qa_delivery; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'madrasty_qa_invite') THEN CREATE ROLE madrasty_qa_invite; END IF;
END \$\$;
alter role madrasty_qa_runtime login noinherit nobypassrls nosuperuser password '$runtimeSecret';
alter role madrasty_qa_fixture login noinherit nobypassrls nosuperuser password '$fixtureSecret';
alter role madrasty_qa_delivery login noinherit nobypassrls nosuperuser password '$deliverySecret';
alter role madrasty_qa_invite login noinherit nobypassrls nosuperuser password '$inviteSecret';
grant app_runtime to madrasty_qa_runtime;
grant app_delivery_worker to madrasty_qa_delivery;
grant app_invite_worker to madrasty_qa_invite;
"@
$roles.Replace('\$', '$') | docker exec -i $qaContainer psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -q
if ($LASTEXITCODE -ne 0) { throw 'Unable to establish the restricted local database logins.' }
Get-Content -Raw -LiteralPath (Join-Path $qaDirectory 'fixtures/local.sql') | docker exec -i $qaContainer psql -U supabase_admin -d postgres -q
if ($LASTEXITCODE -ne 0) { throw 'Unable to install the local fixture functions.' }

$run = 'qa-' + [guid]::NewGuid().ToString('N')
$collisionRun = 'qa-' + [guid]::NewGuid().ToString('N')
$principalNames = @('admin','admin-two','office','finance','supervisor','teacher','teacher-other',
  'substitute','dual-role','guardian-ar','guardian-de','guardian-other')
$recipients = foreach ($item in @($run, $collisionRun)) {
  foreach ($principal in $principalNames) { "$item.$principal@madrasty.invalid" }
}
$envelope = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).
  TrimEnd('=').Replace('+','-').Replace('/','_')
@"
QA_PROJECT=$qaProject
QA_ORIGIN=$qaOrigin
QA_AUTH=$qaAuth
QA_RUN_ID=$run
QA_COLLISION_RUN_ID=$collisionRun
QA_SEED_PASSWORD=$(New-LocalSecret)
QA_SERVICE_KEY=$($bindings.SERVICE_ROLE_KEY)
QA_ANON_KEY=$($bindings.ANON_KEY)
QA_FIXTURE_DATABASE_URL=postgresql://madrasty_qa_fixture:${fixtureSecret}@127.0.0.1:55422/postgres
APP_ORIGIN=$qaOrigin
SUPABASE_URL=$qaAuth
SUPABASE_PUBLISHABLE_KEY=$($bindings.ANON_KEY)
SUPABASE_AUTH_ADMIN_KEY=$($bindings.SERVICE_ROLE_KEY)
SUPABASE_MEDIA_ADMIN_KEY=$($bindings.SERVICE_ROLE_KEY)
DATABASE_URL=postgresql://madrasty_qa_runtime:${runtimeSecret}@127.0.0.1:55422/postgres
DELIVERY_WORKER_DATABASE_URL=postgresql://madrasty_qa_delivery:${deliverySecret}@127.0.0.1:55422/postgres
INVITE_WORKER_DATABASE_URL=postgresql://madrasty_qa_invite:${inviteSecret}@127.0.0.1:55422/postgres
SCHOOL_WORKER_SECRET=$(New-LocalSecret)
INVITATION_ENVELOPE_KEY=$envelope
SCHOOL_ENVIRONMENT=prelaunch
PRELAUNCH_EMAIL_ALLOWLIST=$($recipients -join ',')
"@ | Set-Content -LiteralPath $qaEnv -Encoding utf8NoBOM
Write-Output "Configured the isolated QA stack and two synthetic runs."
