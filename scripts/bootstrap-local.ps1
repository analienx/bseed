[CmdletBinding()]
param(
    [string]$ProjectPath = 'C:\Users\jakub\OneDrive\Projects\Bseed'
)

$ErrorActionPreference = 'Stop'
$repo = 'analienx/bseed'

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command is missing: $Name"
    }
}

Require-Command git
Require-Command gh

& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated.' }

if (Test-Path $ProjectPath) {
    $items = @(Get-ChildItem -LiteralPath $ProjectPath -Force)
    if ($items.Count -eq 0) {
        & gh repo clone $repo $ProjectPath
        if ($LASTEXITCODE -ne 0) { throw 'Clone failed.' }
    } elseif (Test-Path (Join-Path $ProjectPath '.git')) {
        Push-Location $ProjectPath
        try {
            $origin = (& git remote get-url origin).Trim()
            if ($origin -notmatch 'analienx/bseed(\.git)?$') {
                throw "Refusing to use unexpected origin: $origin"
            }
            & git status -sb
            & git fetch origin
            if ($LASTEXITCODE -ne 0) { throw 'git fetch failed.' }
        } finally { Pop-Location }
    } else {
        throw "Target exists and is non-empty but is not a git checkout: $ProjectPath"
    }
} else {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ProjectPath) | Out-Null
    & gh repo clone $repo $ProjectPath
    if ($LASTEXITCODE -ne 0) { throw 'Clone failed.' }
}

Write-Host "BSEED checkout ready: $ProjectPath"
Write-Host 'Do not switch branches or mutate hardware until the assigned GitHub issue specifies the exact ref/action.'
