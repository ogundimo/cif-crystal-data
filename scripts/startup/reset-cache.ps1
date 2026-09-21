param(
  [Parameter(Mandatory=$true)][string]$RamMap,
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
# Node may inherit PowerShell 7's module path when invoking Windows PowerShell 5.
# Use this host's inbox modules, including signature verification and CIM.
$env:PSModulePath=Join-Path $PSHOME 'Modules'
$taskTool=(Resolve-Path -LiteralPath $RamMap).Path
$taskOutput=[IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $taskOutput) { throw 'Cache evidence directory already exists; use a new sample.' }
$taskSignature=Get-AuthenticodeSignature -LiteralPath $taskTool
if ($taskSignature.Status -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notmatch '(^|, )O=Microsoft Corporation(,|$)') {
  throw 'RAMMap must have a valid Microsoft signature.'
}
if ((Get-Item -LiteralPath $taskTool).VersionInfo.ProductName -notmatch 'RAMMap') { throw 'Expected the Microsoft RAMMap executable.' }
$taskPrincipal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (!$taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  # Only this short-lived helper elevates. The benchmark/application stay unelevated.
  $taskCommand="& '"+$PSCommandPath.Replace("'","''")+"' -RamMap '"+$taskTool.Replace("'","''")+"' -OutputDirectory '"+$taskOutput.Replace("'","''")+"'"
  $taskEncoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($taskCommand))
  $taskElevated=Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',$taskEncoded) -PassThru
  if (!$taskElevated.WaitForExit(420000)) { throw 'Cache helper did not finish within seven minutes; no sample may launch.' }
  if ($taskElevated.ExitCode -ne 0 -or !(Test-Path -LiteralPath (Join-Path $taskOutput 'reset.json'))) { throw 'Elevated cache helper failed; no sample may launch.' }
  $taskResult=Get-Content -LiteralPath (Join-Path $taskOutput 'reset.json') -Raw | ConvertFrom-Json
  if ($taskResult.status -ne 'captured') { throw 'Cache helper did not capture complete evidence.' }
  exit 0
}
if (Get-Process -Name 'CIF Crystal Data*','RAMMap*' -ErrorAction SilentlyContinue) { throw 'Close CIF Crystal Data and RAMMap before resetting caches.' }
New-Item -ItemType Directory -Path $taskOutput | Out-Null
$taskRecord=[ordered]@{
  protocol='rammap-system-cache-reset-v2'; status='running'; validation='pending-file-residency-review'
  startedUtc=[DateTimeOffset]::UtcNow.ToString('o'); toolVersion=(Get-Item -LiteralPath $taskTool).VersionInfo.FileVersion
  toolSha256=(Get-FileHash -LiteralPath $taskTool -Algorithm SHA256).Hash.ToLowerInvariant()
  actions=@('-Es','-Et','settle-2000ms','-Es','-Et'); commands=@()
  limitations=@('System working set and standby reset; not a reboot or hardware-cache reset.','Shared pages may remain active in other processes.','Snapshots may contain private file paths; keep them local.')
}
function Invoke-TaskRamMap([string]$Argument) {
  $taskStarted=[DateTimeOffset]::UtcNow
  $taskProcess=Start-Process -FilePath $taskTool -ArgumentList @('/accepteula',('"'+$Argument+'"')) -WindowStyle Hidden -PassThru
  if (!$taskProcess.WaitForExit(60000)) { Stop-Process -Id $taskProcess.Id; throw 'RAMMap command timed out.' }
  $taskRecord.commands+=@{argument=$Argument;exitCode=$taskProcess.ExitCode;startedUtc=$taskStarted.ToString('o');finishedUtc=[DateTimeOffset]::UtcNow.ToString('o')}
  if ($taskProcess.ExitCode -ne 0) { throw "RAMMap failed with exit code $($taskProcess.ExitCode)." }
}
function Get-TaskMemory {
  $taskMemory=Get-CimInstance Win32_PerfRawData_PerfOS_Memory
  return @{systemCacheResidentBytes=[double]$taskMemory.SystemCacheResidentBytes;standbyBytes=([double]$taskMemory.StandbyCacheCoreBytes+[double]$taskMemory.StandbyCacheNormalPriorityBytes+[double]$taskMemory.StandbyCacheReserveBytes);availableBytes=[double]$taskMemory.AvailableBytes;modifiedBytes=[double]$taskMemory.ModifiedPageListBytes}
}
try {
  $taskRecord.before=Get-TaskMemory
  Invoke-TaskRamMap (Join-Path $taskOutput 'before.rmp')
  Invoke-TaskRamMap '-Es'
  Invoke-TaskRamMap '-Et'
  # Allow pages leaving the system working set to settle, then purge again.
  # Both cycles and the interval are part of reset preparation, not app timing.
  Start-Sleep -Milliseconds 2000
  Invoke-TaskRamMap '-Es'
  Invoke-TaskRamMap '-Et'
  $taskRecord.resetCompletedUtc=[DateTimeOffset]::UtcNow.ToString('o')
  $taskRecord.after=Get-TaskMemory
  Invoke-TaskRamMap (Join-Path $taskOutput 'after.rmp')
  foreach ($taskSnapshot in @('before.rmp','after.rmp')) {
    if ((Get-Item -LiteralPath (Join-Path $taskOutput $taskSnapshot)).Length -eq 0) { throw 'Empty RAMMap snapshot.' }
  }
  $taskRecord.status='captured'
} catch { $taskRecord.status='failed'; $taskRecord.error=$_.Exception.Message; throw }
finally {
  $taskRecord.finishedUtc=[DateTimeOffset]::UtcNow.ToString('o')
  $taskRecord | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $taskOutput 'reset.json') -Encoding UTF8
}
