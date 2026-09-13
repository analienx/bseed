[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][int]$Issue
)

$ErrorActionPreference = 'Stop'

function Require-Command([string]$Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) { throw "Required command is missing: $Name" }
    return $cmd.Path
}

$gitPath = Require-Command git
$ghPath = Require-Command gh
$pythonPath = Require-Command python

$root = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Not inside a git repository.' }
Set-Location $root

$origin = (& git remote get-url origin).Trim()
if ($origin -notmatch 'analienx/bseed(\.git)?$') {
    throw "Unexpected origin. Expected analienx/bseed, got: $origin"
}

Write-Host '=== BSEED EXECUTOR PREFLIGHT ==='
Write-Host "ROOT=$root"
Write-Host "HEAD=$((& git rev-parse HEAD).Trim())"
Write-Host "BRANCH=$((& git branch --show-current).Trim())"
Write-Host "ORIGIN=$origin"
Write-Host "POWERSHELL=$($PSVersionTable.PSVersion)"
Write-Host "WINDOWS=$([Environment]::OSVersion.VersionString)"
Write-Host "GIT=$((& git --version) -join ' ')"
Write-Host "GH=$((& gh --version | Select-Object -First 1))"
Write-Host "PYTHON=$((& python --version) -join ' ')"

& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'gh auth status failed.' }

$status = @(& git status --porcelain)
if ($status.Count -gt 0) {
    Write-Host 'WORKTREE_STATUS=DIRTY'
    & git status -sb
    throw 'Working tree is not clean. Preserve/classify unrelated work before continuing.'
}
Write-Host 'WORKTREE_STATUS=CLEAN'

New-Item -ItemType Directory -Force -Path '.local\runs' | Out-Null
New-Item -ItemType Directory -Force -Path '.work' | Out-Null

& python '.\scripts\validate-evidence.py' --self-test
if ($LASTEXITCODE -ne 0) { throw 'Evidence validator self-test failed.' }

Write-Host '=== ASSIGNED ISSUE ==='
& gh issue view $Issue --repo analienx/bseed --comments
if ($LASTEXITCODE -ne 0) { throw "Unable to read issue #$Issue." }

Write-Host '=== CONTROL CHANNEL LATEST ==='
& gh issue view 1 --repo analienx/bseed --comments
if ($LASTEXITCODE -ne 0) { throw 'Unable to read control issue #1.' }

Write-Host 'PREFLIGHT=PASS'
Write-Host 'Read AGENTS.md, EXECUTOR.md and docs/SAFETY.md. Execute only the exact issue scope. Mutation requires PROPOSAL -> APPROVED.'
