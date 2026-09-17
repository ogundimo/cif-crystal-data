param(
  [Parameter(Mandatory=$true)][string]$Kit,
  [ValidateSet('fresh','populated-off','populated-on','unavailable','upgrade','larger')][string]$Case='fresh',
  [ValidateRange(1,3)][int]$Sample=1,
  [ValidateSet('cold','repeat')][string]$Condition='cold',
  [ValidateSet('unpacked','portable')][string]$Distribution='unpacked'
)
$ErrorActionPreference='Stop'
$taskKit=(Resolve-Path -LiteralPath $Kit).Path
$taskManifest=Get-Content -LiteralPath (Join-Path $taskKit 'manifest.json') -Raw | ConvertFrom-Json
$taskProfile=Join-Path $taskKit "profiles\$Case-$Sample"
if (!(Test-Path -LiteralPath $taskProfile)) { throw 'Prepared profile missing.' }
$taskExe=if($Distribution -eq 'portable'){Join-Path $taskKit ("CIF Crystal Data " + $taskManifest.version + ".exe")}else{Join-Path $taskKit 'app\CIF Crystal Data.exe'}
$taskStem="$Case-$Sample-$Distribution-$Condition"
$taskMarker=Join-Path $taskKit "$taskStem-launch.json"
$taskTrace=Join-Path $taskKit "$taskStem-trace.jsonl"
if ((Test-Path -LiteralPath $taskMarker) -or (Test-Path -LiteralPath $taskTrace)) { throw 'Sample already exists; do not overwrite it.' }
if (Get-Process -Name 'CIF Crystal Data*' -ErrorAction SilentlyContinue) { throw 'Close all CIF Crystal Data instances first.' }
if ($Condition -eq 'repeat' -and !(Test-Path -LiteralPath (Join-Path $taskKit "$Case-$Sample-$Distribution-cold-launch.json"))) { throw 'Record the matching cold sample first.' }
$taskBoot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')
if($Condition -eq 'cold') {
 foreach($taskPrior in Get-ChildItem -LiteralPath $taskKit -Filter '*-cold-launch.json') {
  if((Get-Content -LiteralPath $taskPrior.FullName -Raw|ConvertFrom-Json).bootUtc -eq $taskBoot) {throw 'A cold sample was already launched during this boot. Restart before another cold sample.'}
 }
}
$taskOldTrace=$env:CIF_TRACE_FILE;$taskOldProfile=$env:CIF_TEST_PROFILE
try {
 $env:CIF_TRACE_FILE=$taskTrace;$env:CIF_TEST_PROFILE=$taskProfile
 # Interactive test window is intentionally visible; no debugger or GPU override.
 $taskInvoked=[DateTimeOffset]::UtcNow
 $taskProcess=Start-Process -FilePath $taskExe -PassThru
 @{case=$Case;sample=$Sample;condition=$Condition;distribution=$Distribution;bootUtc=$taskBoot;invokedUtc=$taskInvoked.ToString('o');invokedUnixMs=$taskInvoked.ToUnixTimeMilliseconds();launcherPid=$taskProcess.Id} | ConvertTo-Json | Set-Content -LiteralPath $taskMarker
 Write-Host 'Open Quick search promptly, enter space-group number 1, and select Search! Record when the expected results become visible.'
 Write-Host 'Expected results: fresh=0, larger=1000, all other cases=168. Also observe first structure display, errors, refresh and responsiveness.'
 Write-Host "Record first feedback and visible usability with a stopwatch or video. Trace timestamps alone do not prove visible responsiveness. Output: $taskStem"
} finally {$env:CIF_TRACE_FILE=$taskOldTrace;$env:CIF_TEST_PROFILE=$taskOldProfile}



