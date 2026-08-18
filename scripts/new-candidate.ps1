[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$CandidateId,
    [Parameter(Mandatory=$true)][string]$SourceCommit
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
$template.source_commit = $SourceCommit
$template | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 (Join-Path $dir 'candidate_manifest.json')

@"
Candidate workspace created: $dir

DO NOT FLASH YET.

Required before Supervisor can authorize OTA:
1. Place the candidate OTA image in this directory.
2. Place/reference the exact known-good rollback/reinstall OTA image.
3. Create baseline.json:
   python .\scripts\ota_guard.py make-baseline <ROLLBACK_OTA> --label <LKG_LABEL> --out "$dir\baseline.json"
4. Fill candidate_manifest.json with exact paths and SHA-256 values.
5. Run:
   python .\scripts\candidate_gate.py "$dir\candidate_manifest.json" --json-out "$dir\candidate_gate.json"
6. Gate must PASS.
7. Post a PROPOSAL to control issue #1 and STOP.
"@ | Set-Content -Encoding utf8 (Join-Path $dir 'README.txt')

Write-Host "CANDIDATE_DIR=$dir"
Write-Host 'STATUS=PREPARED_NOT_AUTHORIZED'
