# V8 HARDENING — executor validation/build report (issue #10 handoff `5552461115`)

**Scope executed:** build + validate only, at the frozen handoff SHA. **No source edit, no publish,
no OTA index change, no flash, no rejoin/interview, no button test, no live device contact of any
kind** — the whole run happened inside a throwaway Linux container with no route to the home network.

- Firmware repo: `analienx/tuya-zigbee-switch`
- Handoff SHA (detached): `4684def3091225e12bbf3b28025c77ed60136b49`
- Accepted V7 base `0f54303a52aed85f985b8c3b08bcf03aa88efc2a` — verified **ancestor of HEAD** (`git merge-base --is-ancestor`)
- Command: `python3 make_scripts/validate_bseed_ts0726_v8.py` (repo's own one-command validator), inside `make setup_venv`

## 1. Result — validator `status: PASS`, exit 0

| Validator step | Exit |
|---|---|
| `make stub/build` | 0 |
| `make stub/build_end_device` | 0 |
| `pytest tests/test_nvm_migration_version.py tests/test_config_resource_guard.py tests/test_image_type_checker.py -q` | 0 — **22 passed** |
| `pytest tests/ -q` | 0 — **339 passed** |
| `helper_scripts/check_image_types.py device_db.yaml --changed-base 0f54303a…` | 0 |
| `bash make_scripts/build_bseed_ts0726_v8.sh` | 0 |

Firmware compiled from source: all app/HAL/custom-zcl objects plus **124 Telink SDK objects**, link
`text 187096 / data 685 / bss 29966`. One build warning, pre-existing and non-fatal:
`hal/system.c:12: warning: 'noreturn' function does return`.

## 2. Mandatory STOP-condition checklist — none triggered

| Condition | Observed | Verdict |
|---|---|---|
| HEAD must be exactly `4684def3…` | `git rev-parse HEAD` = `4684def3091225e12bbf3b28025c77ed60136b49`, before and after (`HEAD-after.txt`) | pass |
| tracked worktree must be clean | `git status --porcelain` empty before toolchain install **and** after the build (`porcelain-after.txt`, 0 lines — `telink_tools`, `.venv`, `build/` are gitignored) | pass |
| validator/test/build non-zero | exit 0 on all six steps | pass |
| manifest `sourceCommit` / `sourceDirty` | `4684def3…` / `false` | pass |
| build ID | `swBuildId = 1.1.8-bseedv8` | pass |
| fileVersion | `285356042` (and OTA header `fileVersion` = same) | pass |
| manufacturer | `4417` (and OTA header `manufacturerCode` = same) | pass |
| imageType | `45577` — deployed BSEED identity preserved, **not renumbered** | pass |
| OTA header verification | magic `0x0BEEF11E` accepted; `headerVersion 256`, `headerLength 56`, `fieldControl 0`, `zigbeeStackVersion 2`, `totalImageSize 187858` == actual file size | pass |
| artifact/hash generation | both artifacts non-empty; hashes emitted in manifest and independently re-hashed | pass |

## 3. Artifact identity (triple-confirmed)

```
forward.bin  187781 B  sha256 1524f87a56deaffcb5351884f8eb83acd904823bc9f8749429b17f45927f598f
                        sha512 e7c82dfb1235af01ac0ed264dbd08e2577fad30613d08e4b1ea9f3f7818b0f78
                               b0b691bd375a5a2234714ae7ad3e98f1ed0a9c5926494db3bcfc0873abdfa1de
forward.ota  187858 B  sha256 4a74fa80edd9eb495c398ab0a9d574594d17172d5a032c2f2f50d599ac897230
                        sha512 a681fe5606ec35b6637c75b0a4e92077d1c438c9c9fac78cc97222bab019ea3f
                               c52324309edd8b4584cc136ed40e572991f7ef0d3e563f6617a8608653fc95e3
```
Identical in three independent places: in-container `sha256sum/sha512sum`, `manifest.json`, and a
**Windows-side `certutil` re-hash of the copied-out files** (`sha256-copied-out.txt`) → transfer was
lossless and the digests are not a single-tool artifact.

## 4. Reproduction environment (sufficient to rebuild)

```
container : ubuntu:24.04.4 LTS (Docker on Windows/WSL2, linux/amd64), host kernel 6.18.33.2-microsoft-standard-WSL2
make      : GNU Make 4.3            gcc : gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0
git       : 2.43.0                  bash  : 5.2.21(1)-release x86_64-pc-linux-gnu
python    : 3.12.3 in .venv (make setup_venv -> pip install -r requirements.txt:
            click==8.1.3 Jinja2==3.1.6 MarkupSafe==3.0.2 pyserial==3.5 pytest==8.4.2 PyYAML==6.0.2)
tc32      : tc32-elf-gcc (Telink TC32 version 2.0 build) 4.5.1.tc32-elf-1.5  [checksum-verified download]
sdk       : Telink Zigbee SDK v3.7.2.0 (tools.mk)
fetch     : make -C src/telink tools/all   (network: GitHub tag + shyboy Aliyun OSS + TlsrPgm raw)
clone     : git clone https://github.com/analienx/tuya-zigbee-switch.git; checkout --detach <SHA>
```
Same TC32 4.5.1 / SDK 3.7.2.0 pair as the accepted V7 `0f54303a` RC build
(`…/v6-production-2026-09-04/flash/RC-BUILD-REPORT.md`), so V7 and V8 binaries are comparable
toolchain-for-toolchain. `tools/v8exec.sh` reproduces the entire run end to end.

## 5. Two failed attempts, and they were MY environment, not the code

Recorded in `env-failures/` per the handoff's "retain failure output too", because the attribution matters:

1. **attempt 1** — `make stub/build` exit 2: `fatal error: stdint.h / signal.h / getopt.h: No such file
   or directory`. Cause: I installed bare `gcc` without `libc6-dev`. GitHub's `ubuntu-latest`
   preinstalls `build-essential`; a stock `ubuntu:24.04` base image does not. Fixed by adding
   `build-essential` — **zero source touched**.
2. **attempt 2** — everything compiled and linked and `forward.bin` was produced, then
   `make_ota.py` died with `ModuleNotFoundError: No module named 'click'`, so `forward.ota` was missing.
   Cause: `click` is in the repo's `requirements.txt` and CI activates a `.venv` (`build.yml` does
   `source .venv/bin/activate` before every make target); I had only installed distro
   `python3-pytest`/`python3-yaml`. Fixed by running the repo's own `make setup_venv` and activating it.

Neither failure indicates a defect in `4684def3`; attempt 2 in particular proves the C build and the
tests were healthy and only the Python dependency set was incomplete. Both logs are banked so the
failure output is auditable and the environment story is not smoothed over.

## 6. Artifact custody

Per this repo's precedent (`artifacts/PROVENANCE-*.md` hold provenance, binaries live in releases) and
because **publication is forbidden in this phase**, the 188 KB binaries are deliberately **not**
committed here. They are preserved, hash-identified, at:

- container `bseedv8:/work/fw/build/bseed-ts0726-v8/{forward.bin,forward.ota,manifest.json}`
- host mirror `bseed-dimmer/.qwen/tmp/v8out/{forward.bin,forward.ota}` (digests above)

The container is intentionally **left running** until the implementation owner rules on a canary, so
the exact bytes remain retrievable; if they are ever needed elsewhere, verify against §3 first.

## 7. Not done (out of this phase's authority)

No OTA publication, no Zigbee2MQTT index modification, no device flash, no rejoin/interview, no button
testing, no live device read or write, no change to the accepted V7 runtime profile, no edit to the
implementation branch, no rebase onto another firmware line, no PR merge. Whether a canary flash is
warranted is explicitly the implementation owner's separate ruling — **this PASS is not flash
authorization.**
