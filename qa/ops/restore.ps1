$ErrorActionPreference = 'Stop'
$sourceContainer = 'supabase_db_madrasty_final_qa'
$label = docker inspect --format '{{ index .Config.Labels "com.supabase.cli.project" }}' $sourceContainer
if ($LASTEXITCODE -ne 0 -or $label -ne 'madrasty_final_qa') {
  throw 'The restore drill accepts only the isolated local Supabase source.'
}
$suffix = [guid]::NewGuid().ToString('N')
$destination = "qa_restore_$suffix"
$archive = "/tmp/$destination.dump"
$comparison = @'
select json_build_object(
  'pupils', (select count(*) from app.student),
  'links', (select count(*) from app.child_link),
  'invoices', (select count(*) from app.invoice),
  'invoiceMinor', (select coalesce(sum(total_minor),0) from app.invoice),
  'privateObjects', (select count(*) from storage.objects),
  'authAccounts', (select count(*) from auth.users)
);
'@
$created = $false
$timer = [System.Diagnostics.Stopwatch]::StartNew()
try {
  $source = docker exec $sourceContainer psql -U supabase_admin -d postgres -qAt -v ON_ERROR_STOP=1 -c $comparison
  if ($LASTEXITCODE -ne 0) { throw 'The source comparison query failed.' }
  docker exec $sourceContainer pg_dump -U supabase_admin -d postgres --format=custom --file=$archive --exclude-schema=qa
  if ($LASTEXITCODE -ne 0) { throw 'The isolated logical snapshot failed.' }
  docker exec $sourceContainer createdb -U supabase_admin -T template0 $destination
  if ($LASTEXITCODE -ne 0) { throw 'Unable to provision a separate restore database.' }
  $created = $true
  docker exec $sourceContainer pg_restore -U supabase_admin -d $destination --exit-on-error --no-owner $archive
  if ($LASTEXITCODE -ne 0) { throw 'Logical restore did not complete.' }
  $restored = docker exec $sourceContainer psql -U supabase_admin -d $destination -qAt -v ON_ERROR_STOP=1 -c $comparison
  if ($LASTEXITCODE -ne 0 -or $restored -ne $source) { throw 'Source and restored QA counts or invoice totals differ.' }
  $timer.Stop()
  Write-Output "Matched isolated PostgreSQL snapshot and restored data in $([Math]::Round($timer.Elapsed.TotalSeconds, 2)) seconds."
  Write-Output $restored
} finally {
  if ($created) { docker exec $sourceContainer dropdb -U supabase_admin --if-exists $destination }
  docker exec $sourceContainer rm -f $archive
}
