[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$CandidateId,
    [Parameter(Mandatory=$true)][string]$SourceCommit,
    [ValidateSet('PIPELINE_NOOP','PM_INACTIVE','ACTIVATION_ONLY','CF_ONLY','CF_CF1','SEL','CALIBRATION','CLUSTERS','ENERGY','REPORTING')]
    [string]$Stage = 'PIPELINE_NOOP'
)

$ErrorActionPreference = 'Stop'
if ($SourceCommit -notmatch '^[0-9a-fA-F]{40}$') {
    throw 'SourceCommit must be a full 40-character Git SHA.'
}

$root = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Not inside a git repository.' }
Set-Location $root

$dir = Join-Path '.local\candidates' $CandidateId
if (Test-Path $dir) { throw "Candidate directory already exists: $dir" }
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$template = Get-Content '.\templates\candidate-manifest.json' -Raw | ConvertFrom-Json
$template.candidate_id = $CandidateId
$template.candidate_stage = $Stage
$template.source_commit = $SourceCommit
$template | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 (Join-Path $dir 'candidate_manifest.json')

Copy-Item '.\templates\preflash-state.json' (Join-Path $dir 'preflash-state.json')

@"
Candidate workspace created: $dir
STATUS=PREPARED_NOT_AUTHORIZED

DO NOT FLASH.

Frozen target:
  board: WALL_OUTLET_BSEED_TS011F_PM
  device role: router
  MCU: Telink TLSR8258
  config: b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;
  OTA: manufacturer 4417, image type 43556

Before an OTA-CANARY proposal is even eligible:

A. RECOVERY BASELINE (must already be proven on the exact canary)
   - exact known-good forced/reinstall OTA exists locally + SHA-256
   - LKG self-reinstall drill PASS on still-known-good canary
   - post-reinstall relay/button/LED/rejoin/OTA PASS
   - full flash backup exists locally + SHA-256
   - unpowered SWS readback/recovery access PASS

B. SOURCE GATE
   Run against the local checkout containing the exact firmware source commit:

   python .\scripts\recovery_surface_guard.py `
       --repo <FIRMWARE_CHECKOUT> `
       --baseline bf1059ee4c029e320a97fbfa6b07bd6ce4aa1702 `
       --head $SourceCommit `
       --json-out "$dir\source_guard.json"

   Must PASS. Protected recovery/config paths may not change.

C. ROLLBACK BASELINE MANIFEST
   The rollback must be the exact proven FORCE/reinstall OTA:

   python .\scripts\ota_guard.py make-baseline <ROLLBACK_FORCED_OTA> `
       --label <LKG_LABEL> `
       --required-ascii 'b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;' `
       --out "$dir\baseline.json"

D. CANDIDATE ARTIFACT CHECK
   Inspect candidate before editing manifest:

   python .\scripts\ota_guard.py inspect <CANDIDATE_OTA> `
       --required-ascii 'b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;' `
       --json-out "$dir\candidate_ota_guard.json"

E. CANDIDATE MANIFEST
   Fill candidate_manifest.json exactly:
   - candidate/rollback paths + SHA-256
   - source_guard_report = source_guard.json
   - ota_mode = normal or forced
   - all offline_checks = PASS only after actually run
   - pm_default_enabled = false
   - device_config_changed = false
   - base_gpio_changed = false
   - nvm_schema_changed = false
   - recovery_critical_changes = []

   Then run:

   python .\scripts\candidate_gate.py "$dir\candidate_manifest.json" `
       --json-out "$dir\candidate_gate.json"

   Must PASS.

F. LIVE PREFLASH GATE
   Fill preflash-state.json from fresh evidence immediately before proposal.
   Do not mark PASS from assumptions. Then run:

   python .\scripts\preflash_gate.py "$dir\preflash-state.json" `
       --json-out "$dir\preflash_gate.json"

   Must PASS.

G. CONTROL CHANNEL
   Only now post a PROPOSAL to issue #1 and STOP.
   Firmware execution requires a response beginning exactly:

     APPROVED / OTA-CANARY

A plain APPROVED is insufficient.

Never write device_config, change router/end-device role, edit OTA identity/version to force acceptance, use update-all, or enable PM before the approved runtime gate.
"@ | Set-Content -Encoding utf8 (Join-Path $dir 'README.txt')

Write-Host "CANDIDATE_DIR=$dir"
Write-Host "CANDIDATE_STAGE=$Stage"
Write-Host 'STATUS=PREPARED_NOT_AUTHORIZED'
