[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$CandidateId,
    [switch]$ProtectionEnabled
)

$ErrorActionPreference = 'Stop'
$root = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Not inside a git repository.' }
Set-Location $root

function Get-LfTextSha256([string]$Path) {
    $text = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Path)))
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($text.Replace("`r`n", "`n"))
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        return (($hasher.ComputeHash($bytes) | ForEach-Object ToString x2) -join '')
    } finally {
        $hasher.Dispose()
    }
}

$supervisorCommit = (& git rev-parse HEAD).Trim()
if ($supervisorCommit -notmatch '^[0-9a-fA-F]{40}$') {
    throw 'Could not resolve the supervisor commit.'
}

$dir = Join-Path '.local\candidates' $CandidateId
if (Test-Path $dir) { throw "Candidate directory already exists: $dir" }
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$template = Get-Content '.\templates\metering-candidate-manifest.json' -Raw | ConvertFrom-Json
$template.candidate_id = $CandidateId
$template.supervisor_commit = $supervisorCommit
$template.candidate_kind = if ($ProtectionEnabled) { 'adopted_bseed_protection' } else { 'adopted_bseed_metering' }
$template.meter.overload_relay_actuation = [bool]$ProtectionEnabled
$template.invariants.overload_relay_actuation = [bool]$ProtectionEnabled
if ($ProtectionEnabled) {
    $template.offline_checks | Add-Member -NotePropertyName protection_tests -NotePropertyValue 'PENDING'
    $template | Add-Member -NotePropertyName protection_test_report -NotePropertyValue 'protection-tests.json'
}
$template.source.overlay_script_sha256 = Get-LfTextSha256 '.\scripts\apply-metering-overlay.py'
$template.source.overlay_guard_sha256 = Get-LfTextSha256 '.\scripts\metering_overlay_guard.py'
$template | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 (Join-Path $dir 'metering_candidate_manifest.json')
Copy-Item '.\templates\preflash-state.json' (Join-Path $dir 'preflash-state.json')

@"
Adopted BSEED metering candidate workspace: $dir
STATUS=PREPARED_NOT_AUTHORIZED

This path reuses the hardware-proven downstream metering implementation pinned in
metering-source.lock.json. It preserves the installed runtime device_config:

  b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;

Meter GPIOs are source-confirmed PA1/PC2/PB1, but the exact project canary still
requires Class A DEVICE_CONFIRMED evidence and issue #5 recovery proof before OTA.

1. Obtain the manual GitHub Actions artifact from "Build BSEED metering canary"
   for this exact supervisor commit. Copy locally into this candidate directory:

   bseed-b28wrpvx-metering-canary.zigbee
   switch_custom.js
   source-guard.json
   build-provenance.json

2. Copy the exact issue-#5 proven rollback material into this directory:

   rollback-forced.zigbee
   baseline.json

3. Fill metering_candidate_manifest.json:
   - candidate.ota + candidate.sha256
   - converter.path + converter.sha256
   - rollback.ota + rollback.sha256 + baseline_manifest
   - source.source_guard_report
   - mark offline checks PASS only from actual evidence
   - for a protection candidate, also copy protection-tests.json and require
     protection_tests=PASS

4. Run:

   python .\scripts\metering_candidate_gate.py `
     "$dir\metering_candidate_manifest.json" `
     --json-out "$dir\metering_candidate_gate.json"

   Required: status=PASS.

5. Fresh Class A + live preflash state are still mandatory. Run class_a_gate.py
   --mode all and preflash_gate.py exactly as documented. Artifact build or
   candidate-gate PASS does not authorize flashing.

6. Only after all gates PASS, post an OTA-CANARY PROPOSAL to control issue #1 and
   STOP for Supervisor approval. Never bulk-update and never write device_config.
"@ | Set-Content -Encoding utf8 (Join-Path $dir 'README.txt')

Write-Host "CANDIDATE_DIR=$dir"
Write-Host "SUPERVISOR_COMMIT=$supervisorCommit"
Write-Host 'STATUS=PREPARED_NOT_AUTHORIZED'
