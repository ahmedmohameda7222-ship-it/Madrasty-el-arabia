$ErrorActionPreference = 'Stop'
$failed = @()
foreach ($suite in @('contracts','school','policy','academics','communication','finance','web','android','ops')) {
  pnpm "qa:$suite"
  if ($LASTEXITCODE -ne 0) { $failed += $suite }
}
if ($failed.Count) {
  Write-Error "Failed automated suites: $($failed -join ', ')"
  exit 1
}
Write-Output 'All configured automated suites passed. Review separate release acceptance evidence in docs/execution/qa-evidence.md.'
