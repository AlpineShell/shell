param(
  [string]$InstallerDirectory = 'release'
)

$threatFoundExitCode = 2
$scanner = Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe'

if (-not (Test-Path -LiteralPath $scanner)) {
  Write-Output '::warning::Microsoft Defender is not installed on this runner, so the installer was not scanned.'
  exit 0
}

$installers = @(Get-ChildItem -Path $InstallerDirectory -File -Filter *.exe)
if ($installers.Count -eq 0) {
  Write-Output "::error::No installer found in $InstallerDirectory."
  exit 1
}

& $scanner -SignatureUpdate | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Output '::warning::Microsoft Defender could not update its definitions, so the scan uses the ones on the runner.'
}

$flagged = 0
$scanned = 0
foreach ($installer in $installers) {
  $report = & $scanner -Scan -ScanType 3 -File $installer.FullName -DisableRemediation
  $scanExitCode = $LASTEXITCODE
  if ($scanExitCode -eq $threatFoundExitCode) {
    $report | Write-Output
    Write-Output "::error::Microsoft Defender flags $($installer.Name). Do not publish it: run the build again for a new installer, and report this one at https://www.microsoft.com/wdsi/filesubmission if it is flagged again."
    $flagged += 1
  } elseif ($scanExitCode -eq 0) {
    Write-Output "Microsoft Defender finds nothing in $($installer.Name)."
    $scanned += 1
  } else {
    $report | Write-Output
    Write-Output "::warning::Microsoft Defender could not scan $($installer.Name) (exit code $scanExitCode)."
  }
}

if ($flagged -gt 0) { exit 1 }
if ($scanned -eq 0) {
  Write-Output '::warning::No installer was scanned.'
}
exit 0
