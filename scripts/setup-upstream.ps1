[CmdletBinding()]
param(
    [switch]$FetchPr314
)

$ErrorActionPreference = 'Stop'
$target = Join-Path (Resolve-Path '.').Path '.work\tuya-zigbee-switch'
$repo = 'https://github.com/romasku/tuya-zigbee-switch.git'
$pinned = 'bf1059ee4c029e320a97fbfa6b07bd6ce4aa1702'
$pr314 = '47611b7d9d4b782556392416769fdb24226a8302'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git is required.' }

if (-not (Test-Path $target)) {
    & git clone --filter=blob:none $repo $target
    if ($LASTEXITCODE -ne 0) { throw 'Upstream clone failed.' }
}

Push-Location $target
try {
    $origin = (& git remote get-url origin).Trim()
    if ($origin -notmatch 'romasku/tuya-zigbee-switch(\.git)?$') { throw "Unexpected upstream origin: $origin" }
    & git fetch origin
    if ($LASTEXITCODE -ne 0) { throw 'Upstream fetch failed.' }
    & git cat-file -e "$pinned^{commit}"
    if ($LASTEXITCODE -ne 0) { throw "Pinned upstream commit not found: $pinned" }
    & git checkout --detach $pinned
    if ($LASTEXITCODE -ne 0) { throw 'Pinned checkout failed.' }

    if ($FetchPr314) {
        & git fetch origin pull/314/head:refs/remotes/origin/pr-314
        if ($LASTEXITCODE -ne 0) { throw 'PR #314 fetch failed.' }
        $actual = (& git rev-parse refs/remotes/origin/pr-314).Trim()
        if ($actual -ne $pr314) {
            throw "PR #314 head changed since lock. Expected $pr314, got $actual. Supervisor must review before use."
        }
    }

    Write-Host "UPSTREAM_PIN=$pinned"
    Write-Host "UPSTREAM_STATUS=$((& git status --short) -join ';')"
    Write-Host 'Do not merge/rebase PR #314 locally unless a Supervisor issue provides exact commands.'
} finally { Pop-Location }
