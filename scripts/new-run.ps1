[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][int]$Issue,
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9._-]+$')][string]$Slug
)

$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$runId = "$stamp-issue-$Issue-$Slug"
$tracked = Join-Path 'runs' $runId
$raw = Join-Path '.local\runs' $runId

New-Item -ItemType Directory -Force -Path $tracked | Out-Null
New-Item -ItemType Directory -Force -Path $raw | Out-Null

Copy-Item 'templates\hardware_mapping.csv' (Join-Path $tracked 'hardware_mapping.csv')
Copy-Item 'templates\diagnostic_tests.csv' (Join-Path $tracked 'diagnostic_tests.csv')
Copy-Item 'templates\calibration.csv' (Join-Path $tracked 'calibration.csv')
Copy-Item 'templates\energy_test.csv' (Join-Path $tracked 'energy_test.csv')
Copy-Item 'templates\executor_report.md' (Join-Path $tracked 'executor_report.md')

@"
# Run $runId

Issue: #$Issue

Tracked directory contains sanitized evidence only.
Raw/unsanitized files belong in:

```
$raw
```
"@ | Set-Content -Encoding UTF8 (Join-Path $tracked 'README.md')

Write-Host "RUN_ID=$runId"
Write-Host "TRACKED=$tracked"
Write-Host "RAW_LOCAL=$raw"
