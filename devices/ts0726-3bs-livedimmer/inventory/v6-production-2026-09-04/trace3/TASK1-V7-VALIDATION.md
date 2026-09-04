# Validation report — `supervisor/ts0726-v7-pure-relay-disable` @ `3aa6c9de`

**Repo used:** `C:\Users\jakub\OneDrive\Projects\tuya-zigbee-switch` (remote `origin` = analienx fork). I did not touch `home-assistant-stack`.

## 0. Two corrections to the brief's premises

1. **The untracked scratch list in the brief does not match reality.** Observed (identical before and after my work): `hr2.sh`, `k2-remote.py`, `o2b.sh`, `otainspect.sh`, `staging-dump3.js`, `stub_nvm_data_gen/`, `zhc2.sh`. The brief's `remote_flash*.sh`, `r1-r7.sh`, `install_in_container*.sh`, `sh1.sh` are **not present**. I deleted/modified none of them.
2. **`git diff --stat 9070072f..3aa6c9d` is not a valid "what v7 changes"** — see (a).

`git fetch origin` moved the ref: `2cd2944f..3aa6c9de supervisor/ts0726-v7-pure-relay-disable`. `git rev-parse` of the target SHA and of `origin/supervisor/ts0726-v7-pure-relay-disable` are **byte-identical** (`3aa6c9de3beb349101a5505ace70635d54bbde81`) — branch head confirmed. Checkout succeeded: `HEAD is now at 3aa6c9de test: exercise v7 pure relay binding suppression`.

---

## (a) v7 diffstat vs `9070072f`

`git merge-base --is-ancestor 9070072f 3aa6c9d` → **"9070072f NOT ancestor of 3aa6c9d"**. Merge base is `bf1059ee` (= upstream `main`); `git rev-list --left-right --count` → `90  105`. So the two-dot diffstat is **divergence between two branch tips**, dominated by unrelated v4/v5/v6 history:

```
 73 files changed, 4898 insertions(+), 5951 deletions(-)
```
(deletions are v6 converter/profile files the v7 line never had; additions are v4/v5 build scripts — none of it is v7's work.)

**The actual v7 increment** (`git diff --stat 182c0195..3aa6c9d`, i.e. the 4 commits `010ed4c6`, `3b5ba3b0`, `2cd2944f`, `3aa6c9de`):

```
 src/zigbee/consts.h                         |   3 +
 src/zigbee/switch_cluster.c                 |  10 +++
 tests/test_bseed_v6_binding_mode_release.py |  37 ++++++++-
 tests/test_bseed_v7_pure_relay_behavior.py  | 112 ++++++++++++++++++++++++++++
 4 files changed, 161 insertions(+), 1 deletion(-)
```

`git show --stat 3aa6c9d` (tip commit alone) = `tests/test_bseed_v7_pure_relay_behavior.py | 112 ++++`, 1 file changed. The whole firmware change is 3 identical early-return gates (`switch_cluster.c:265` in `switch_cluster_binding_action`, `:318` in `switch_cluster_level_stop`, `:331` in `switch_cluster_level_control`) plus `ZCL_ONOFF_CONFIGURATION_BINDED_MODE_DISABLED 0x00`.

## (b) Behavior test — verbatim

**Native (as you instructed): 4/4 FAIL.** `gcc --version` on host → `'gcc' is not recognized as an internal or external command,` `operable program or batch file.` The pre-existing `build/stub/stub_device` (dated 01/09/2026 21:12, i.e. predating this checkout) is a **Linux ELF** (`b'\x7fELF'`), so:

```
E   OSError: [WinError 193] %1 is not a valid Win32 application
FAILED tests/test_bseed_v7_pure_relay_behavior.py::test_disabled_mode_persists_zero_across_restart - OSError: [WinError 193]...
FAILED ...::test_disabled_mode_blocks_onoff_but_keeps_local_relay_click - OSError: [WinError 193]...
FAILED ...::test_disabled_mode_blocks_level_move_and_stop_on_long_press - OSError: [WinError 193]...
FAILED ...::test_enabled_short_mode_still_sends_expected_onoff_and_level_commands - OSError: [WinError 193]...
4 failed in 0.36s
```

**In-container (ubuntu:24.04, linux/amd64, tree from `git archive` of `3aa6c9de`):** `....  4 passed in 0.03s`. **That pass is not reliable — see the flake measurement below.**

## (c) Full suite — verbatim

Native: impossible (same ELF cause). In-container, 5 consecutive runs, each with `rm -rf stub_nvm_data` first:

```
RUN_1_EXIT=0   316 passed in 32.29s
RUN_2_EXIT=0   316 passed in 32.29s
RUN_3_EXIT=0   316 passed in 32.66s
RUN_4_EXIT=1   1 failed, 315 passed in 32.23s
RUN_5_EXIT=0   316 passed in 32.74s
```
No skips, no warnings, 316 tests. My very first full run also failed the same single test → **2 failures in 7 full-suite runs**. The failing test is *always* the new v7 one:

```
____ test_enabled_short_mode_still_sends_expected_onoff_and_level_commands _____
            onoff = device.zcl_list_cmds(endpoint=1, cluster=ZCL_CLUSTER_ON_OFF)
>           assert [event.cmd for event in onoff] == [ZCL_CMD_ONOFF_TOGGLE]
E           assert [] == [2]
E             Right contains one more item: 2
tests/test_bseed_v7_pure_relay_behavior.py:102: AssertionError
```

**Root cause (confirmed, not guessed):** the v7 file asserts on `zcl_list_cmds()` (`conftest.py:317`), which reads an in-memory event buffer filled asynchronously from the stub's stdout reader thread. It never waits. `conftest.py:293 wait_for_cmd_send()` exists for exactly this purpose and is used by 6 older test files. Isolated repeat runs of the v7 file: **7/15 failed**, with signatures `assert [] == [2]` (×5) and `assert [5] == [5, 7]` (×2) — i.e. the first command or the trailing Stop not yet drained from the pipe. Under the full suite the box is busier/other tests pre-warm the pipe, so it only flakes ~29%.

## (d) Stub build

Canonical command is `make stub/build stub/build_end_device` (`.github/workflows/test.yml` → `make tests` → same). **Blocked natively: no gcc/clang/cc/make on PATH** (only MSVC `cl.exe` present; the Makefile hardcodes `HOST_CC ?= gcc`). In-container it builds **clean, exit 0, zero warnings**:

```
46437f865e128a4938e2b06502c7b459dc3cf3bac53f02a2777a452bdaf7bf0e  build/stub/stub_device
382a9d080ec00a8e9bd4dc3d665ddcd30ca700ad9a0b4d0c2352a053201a10e4  build/stub/stub_end_device
```
Hashes were **identical between a CRLF and an LF tree** → line endings cannot have biased the test results.

## (e) TC32 target build

`telink_tools/toolchain/tc32/bin/tc32-elf-gcc` exists on host but is **ELF64 little-endian x86-64** (`magic b'\x7fELF'`, machine 62) — a Linux toolchain that cannot execute on Windows. Nothing installed on host. It runs in-container: `tc32-elf-gcc (Telink TC32 version 2.0 build) 4.5.1.tc32-elf-1.5`.

`BOARD=SWITCH_BSEED_TS0726_3GANG DEVICE_TYPE=router make board/build` → **exit 0**:
```
 182028     685   29962  212675   33ec3 ../../build/telink/tlc_switch.elf
SDK compilation complete: 124 object files
```
Identity resolved correctly from `device_db.yaml`: `router / TLSR8258 / Telink / firmware_image_type 45577 / config_str iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;`

Artifacts: `bce44601…` `tlc_switch-1.1.2-.bin` (182,713 B, identical to `build/telink/bin/tlc_switch.bin`), `bba18606…` `.zigbee`, `ef4e9cc6…` `-forced.zigbee`, `df637fcd…` `-from_tuya.zigbee`.

⚠️ **Do not treat those names/hashes as release-equivalent.** `board.mk:36,39,47` derive `VERSION_STR` and `FILE_VERSION` from git metadata; I extracted the tree by archive (host `.git` is 2.4 GB, so I declined a full clone). Mine built as `1.1.2-` / `FILE_VERSION=0x11023000`. A real checkout yields `1.1.2-3aa6c9de` and, since `git rev-list --count origin/main..HEAD` = **105** here, `FILE_VERSION=0x11023069` — a different OTA downgrade-guard field.

Two container-only blockers I hit and resolved (both **environment, not repo**): `yq` missing → `PLATFORM_PREFIX` came out empty so `make -C src/$(PLATFORM_PREFIX) build` collapsed to `make -C src/ build` → `*** No rule to make target 'build'`; and `make_ota.py` → `ModuleNotFoundError: No module named 'click'`. `update-indexes` still needs a real git repo and was not exercised.

## (f) Additional FAILURES found (quoted exactly)

**1. v7 FAILS the CI lint job.** `uncrustify --check` (CI `test.yml` lint step), v7 vs its own pre-v7 control `182c0195`:
```
v7 (3aa6c9d):        LINT_EXIT=123   FAIL lines: 3
  src/silabs/spiflash_extension/spiflash/btl_storage_spiflash.c ...
  src/silabs/spiflash_extension/spiflash/btl_storage_spiflash_configs.h ...
  src/zigbee/consts.h (File size changed from 14150 to 14086)      <-- NEW
control (182c0195):  LINT_EXIT=123   FAIL lines: 2   (only the two known pre-existing silabs files)
```
The delta is the v7 block, and it re-pads all four `#define`s (the new comment splits the alignment group):
```
-#define ZCL_ONOFF_CONFIGURATION_BINDED_MODE_DISABLED                    0x00
+#define ZCL_ONOFF_CONFIGURATION_BINDED_MODE_DISABLED    0x00
```
Attributed by `git log 182c0195..3aa6c9d -- src/zigbee/consts.h` → `010ed4c6 feat: define explicit disabled bound-control mode`. **Not fixed**, per instructions.

**2. The OnOff suppression test does not exercise the new gate.** Negative control — built the gate-free mutant (only difference: `switch_cluster.c` reverted to `182c0195`; verified `diff` shows nothing but the 3 gates; stub hash `f25e033d…`, TC32 bin hash `84146e77…` vs v7 `bce44601…`, 16-byte size delta, so the gate is genuinely compiled in). v7 tests vs mutant, 12 runs:
```
MUTANT_RUNS_FAILED=12 / 12
     12 FAILED ...::test_disabled_mode_blocks_level_move_and_stop_on_long_press
      4 FAILED ...::test_enabled_short_mode_still_sends_expected_onoff_and_level_commands
```
- `blocks_level_move_and_stop` fails **12/12** with real observed traffic — `AssertionError: assert [ZCLCommandEv...=7, data=b'')] == []` / `Left contains 2 more items, first extra item: ZCLCommandEvent(ep=1, cluster=8, cmd=5, data=b'\x002')`. **This test has teeth; the Level gate is the load-bearing part of v7.**
- `test_disabled_mode_blocks_onoff_but_keeps_local_relay_click` **never failed (0/12)**. Reason found in code, not inferred: pre-v7 `switch_cluster.c:401` already only calls `switch_cluster_binding_action_on()` when `binded_mode == BINDED_MODE_SHORT`, so at `0` no OnOff was ever emitted. Gate #1 at `switch_cluster.c:265` is redundant on that path (defence-in-depth is fine as intent, but this test is a characterisation test, not proof of v7).
- Compounding: the `== []` safety assertions use the same non-waiting helper, and I measured that helper lagging on the *same* click path ~47% of the time. **A disabled-mode violation could therefore pass unnoticed.** Fix direction (not applied): wait/settle before asserting emptiness (e.g. `wait_for_cmd_send` + `ensure_never_true`, `conftest.py:293`/`conftest.py:437`).

**3. Stub/live divergence relevant to your premise.** `test_disabled_mode_persists_zero_across_restart` **passes on this branch's stub** — the stub keeps `0xff05=0` across a restart. That does *not* reproduce the live V6 symptom (0 accepted, then asynchronously reverting to 3). Inference, flagged as such: the revert is probably not in this firmware path — it points at the Z2M converter/definition or at device firmware that differs from this branch.

**4. Methodology warning for this host.** `git archive` **honours `core.autocrlf=true`** (host is `true`; `.gitattributes` pins LF only for `*.sh|*.py|*.js|*.yaml|*.yml`, not `*.c|*.h`). My first archive produced 124 CRLF `.c/.h` files — enough to silently wreck any uncrustify claim. I re-archived with `-c core.autocrlf=false -c core.eol=lf` and verified `app.c` CR count 0 vs blob CR 0 (working tree had CR 83).

## (g) Confirmation I changed nothing

- **No commits, no pushes, no amends/rebases, no branch or PR/issue actions.** `git reflog -3` shows exactly one entry attributable to me: `checkout: moving from 9070072f… to 3aa6c9de…`.
- **No device, coordinator, broker or Home Assistant contact; no flashing; no TlsrPgm.**
- Host `git status --porcelain` after everything: the **same 7** pre-existing untracked entries, no tracked modification, `HEAD` = `3aa6c9de` (left there as step 1 instructed — restore with `git checkout 9070072f`).
- All mutation happened in a throwaway container, since removed (`docker rm -f v7val`); scratch artifacts live only in `C:\Users\jakub\.qwen\tmp\v7val`.

## What I did NOT verify

- Nothing on real hardware; no bound/group traffic on a live network; the gate's behaviour with **multiple** switch endpoints or with `binding_command_mode` values other than the tested short/long paths.
- Whether the 3 gate sites are the *complete* set of outbound bound-command paths (I read the 3 diff hunks and the enclosing functions; I did not audit every emitter, e.g. `switch_cluster_send_binding_onoff()`'s other callers or `relay_clusters`-driven paths).
- `test_bseed_v6_binding_mode_release.py`'s +37-line change beyond the fact that it passed in every run.
- The `update-indexes` / OTA-index publishing step (needs a real git repo), reproducibility/`SOURCE_DATE_EPOCH` of the OTA images, and Silabs-side builds.
- The exact real-checkout `FILE_VERSION` — computed arithmetically from `board.mk`, not observed in a link.
- Whether the 47% isolated flake rate reproduces on GitHub runners (mine ran on WSL2/Docker under a tight loop, likely busier than CI).