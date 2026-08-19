[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Config
)

$ErrorActionPreference = 'Stop'
$root = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Run this from the analienx/bseed checkout.' }
Set-Location $root

$venv = Join-Path '.local' 'validation-venv'
$python = Join-Path $venv 'Scripts\python.exe'
if (-not (Test-Path $python)) {
    python -m venv $venv
}

& $python -m pip install --disable-pip-version-check --quiet 'paho-mqtt==2.1.0'
if ($LASTEXITCODE -ne 0) { throw 'Failed to install pinned paho-mqtt==2.1.0' }

& $python '.\scripts\automated_canary_validation.py' $Config
exit $LASTEXITCODE
