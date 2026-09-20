# Project-local Windows x64 rietx runtime; build machine needs Python 3.12 + pip.
param([string]$Python = '')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$refinementRoot = Join-Path (Get-Location) '.tools/rietx-runtime'
$refinementCommit = '41c5f64ed88070a7acbd1bab1c074478c88df9f3'
New-Item -ItemType Directory -Force "$refinementRoot/python", '.tools/rietx-stage' | Out-Null
if (-not (Test-Path '.tools/python-embed.zip')) { Invoke-WebRequest 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip' -OutFile '.tools/python-embed.zip' }
if ((Get-FileHash '.tools/python-embed.zip' -Algorithm SHA256).Hash.ToLowerInvariant() -ne '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3') { throw 'Python archive checksum mismatch' }
Expand-Archive '.tools/python-embed.zip' "$refinementRoot/python" -Force
Invoke-WebRequest "https://codeload.github.com/yue-here/rietx/zip/$refinementCommit" -OutFile '.tools/rietx-source.zip'
Expand-Archive '.tools/rietx-source.zip' '.tools/rietx-stage' -Force
$refinementSource = ".tools/rietx-stage/rietx-$refinementCommit"
if ($Python) {
    & $Python -m pip install --upgrade --target "$refinementRoot/python/Lib/site-packages" -r engine/requirements.txt $refinementSource
} else {
    py -3.12 -m pip install --upgrade --target "$refinementRoot/python/Lib/site-packages" -r engine/requirements.txt $refinementSource
}
if ($LASTEXITCODE -ne 0) { throw 'rietx dependency installation failed' }
Set-Content "$refinementRoot/python/python312._pth" -Value @('python312.zip','.','Lib/site-packages','import site') -Encoding ascii
Set-Content "$refinementRoot/rietx-version.txt" -Value $refinementCommit -Encoding ascii
Copy-Item "$refinementSource/LICENSE" "$refinementRoot/LICENSE-rietx.txt" -Force
Copy-Item "$refinementSource/LICENSE-3RD-PARTY.md", "$refinementSource/ATTRIBUTION.md" $refinementRoot -Force
& "$refinementRoot/python/python.exe" -s engine/refinement.py --check
if ($LASTEXITCODE -ne 0) { throw 'rietx runtime validation failed' }
Write-Host "Refinement runtime ready: $refinementRoot"
