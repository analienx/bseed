Clean: HEAD at 0f54303a, no commits (reflog shows only checkouts from the lint script's temporary checkouts, which returned to 0f54303a), no tracked-file modifications. Detached HEAD. Nothing was committed or pushed. Good.

Now remove the container per instruction.

=====BLOCK=====

Confirmed: HEAD `0f54303a`, no commits created (reflog shows only checkouts), zero tracked-file modifications, detached as intended. Nothing committed or pushed. Now removing the container as instructed.



=====BLOCK=====

Container removed (docker ps shows empty). Let me verify host artifacts still present.

Actually the `docker ps -a --filter name=bseedv7` printed "bseedv7" — that's the container NAME being removed? No, docker rm -f output is "bseedv7" (the removed container name). Then the ps output is empty (nothing after). Good.

Let me do a final ls of host dir.

Everything's done. Let me write the report. Let me also save a memory? The task is a validation run. There are a couple durable, non-obvious facts worth memory:
1. At 0f54303a, the TC32 toolchain is NOT in-repo — it's downloaded via tools.mk (aliyun OSS) contradicting the brief's "lives in-repo" claim. That's a project fact.
2. The consts.h lint regression (BINDED_MODE alignment) persists at 0f54303a; only pre-existing silabs spiflash failures exist on control. Useful for future.
3. The OTA header layout is make_ota.py's <I5HIH32sI>, mfr@10/imgType@12/fileVer@14 — the "simplified layout" in briefs is wrong.
4. cp -a of a clone for a mutant copies stale __pycache__ causing traceback co_filename to point at the original; purge caches.

These are project-specific and durable. But memory guidance says not to save things derivable from code/history. The toolchain download and OTA header are derivable from repo files. The lint regression is derivable by running lint. The stale-pyc gotcha is a durable non-obvious testing pitfall worth remembering (feedback/project). Let me save one concise project memory about the consts.h lint regression + toolchain-fetch reality for this canary, since a future session doing V7 work benefits. Actually these will change once fixed. I'll save the stale-pyc mutant pitfall as a durable method note (project), and the OTA header layout as reference. Keep it minimal.

Actually, let me be judicious. The most durable, non-obvious, cross-session-useful item: when doing a negative-control mutant by `cp -a` of a clone, purge __pycache__ or tracebacks mislead about provenance. That's a real method learning. And the OTA header real layout (mfr@10) vs the simplified one in task briefs — a reference worth having so I don't mis-parse next time.

Let me save two small memories: one project (methodology gotcha), one reference (OTA header layout). Keep concise.

Let me verify host files one more time, then write memories, then final report.

=====BLOCK=====

Now save the durable methodology gotchas (feedback-ish, project-scope) and the reference (OTA header layout). I'll save one reference for the OTA header layout (durable across commits, part of make_ota.py) and one project note for the cp-a mutant stale-pyc gotcha.

Actually, memory guidance says don't save derivable-from-code stuff. The OTA header layout IS in make_ota.py (derivable). But the NON-OBVIOUS part is that task briefs give a WRONG simplified layout — that's a recurring gotcha worth remembering so I don't mis-parse. I'll fold it into the project memory file rather than a separate reference to avoid duplication. Let me append it to the same file.

=====BLOCK=====

All deliverables complete. Now write the final report. Let me structure it matching the ruling's checks #1/#2/#3 plus mutant evidence and lint delta, with GO/NO-GO verdicts, verbatim failure signatures, and explicit "what I did NOT verify."

Let me be thorough and honest. One caveat to flag: the toolchain download requirement contradicts the brief (in-repo). And the LINT regression is a genuine NO-GO for a clean CI, though it doesn't affect the binary. I'll state GO/NO-GO per check.

Also I should note the mutant: only the level_move/stop test failed, not the onoff test — because reverting the onoff guard in switch_cluster_binding_action apparently doesn't cause that particular test to emit (or the onoff click path is gated elsewhere). Worth a one-line honest note that only the target test flips, which is still a clean signal.

Let me write the report.


=====BLOCK=====

All deliverables complete. Container removed, artifacts handed off, host hashes verified. Here is the final report.

---

# BSEED TS0726-3-BS V7 canary — validation & RC build report

**Source of truth:** `analienx/tuya-zigbee-switch` @ `0f54303a52aed85f985b8c3b08bcf03aa88efc2a` (branch `supervisor/ts0726-v7-pure-relay-disable`), built in a **real git clone** (`git rev-parse HEAD` genuine) inside `ubuntu:24.04` (`--platform linux/amd64`, container `bseedv7`, now removed).
**Boundaries honored:** no commits (reflog shows only checkouts; `git status` = *no tracked modifications*; HEAD detached at `0f54303a`), no push, no device/coordinator/HASS/MQTT contact, no OTA publish. Scratch build script lived only at `/work/build_v7_scratch.sh` (outside the clone).

---

## Check #1 — gates + deterministic tests → **GO**

**(1a) v7 behavior test ×20** (`python3 -m pytest -q tests/test_bseed_v7_pure_relay_behavior.py`, stub built via `make stub/build stub/build_end_device`):
```
run 1 rc=0 :: 4 passed in 0.86s ... run 20 rc=0 :: 4 passed in 0.85s
GATE1a any_failure=0
```
**20/20 green.** Supervisor's determinism claim holds.

**(1b) full suite ×5** (`python3 -m pytest -q`), each run logged to a distinct file (timings differ → genuinely 5 runs):
```
run 1: 316 passed in 34.71s
run 2: 316 passed in 33.36s
run 3: 316 passed in 34.90s
run 4: 316 passed in 34.61s
run 5: 316 passed in 34.66s
```
**316 passed, rc=0, five consecutive.**

**Why it's now deterministic:** 0f54303a replaced the old non-waiting `zcl_list_cmds` asserts with `_assert_no_commands` (bounded 0.20 s quiet window via `ensure_never_true`) and `_wait_for_command_count` (`wait_for`). That removes the race that produced the colleague's ~47% flake.

---

## Check #1 (cont.) — negative-control mutant → **GO** (fixed test reliably catches ungated FW)

Separate copy `/work/mutant`, **only** `src/zigbee/switch_cluster.c` reverted to pre-gate `182c0195` (`git diff --stat HEAD`: `1 file changed, 10 deletions(-)` — exactly the 3 `BINDED_MODE_DISABLED` early-returns in `switch_cluster_binding_action`, `switch_cluster_level_stop`, `switch_cluster_level_control`). Stub rebuilt; its binary `md5 0ca0c32c…` differs from the gated clone `md5 97917f28…`.

**Result: 13/13 runs (10 + 3 after cache purge) failed in exactly the expected test:**
```
run 1 rc=1 | 1 failed, 3 passed | FAILEDlines=1
FAILED ...::test_disabled_mode_blocks_level_move_and_stop_on_long_press
... (runs 2–10 identical) ...
MUTANT caught_in_runs=10/10
```
Verbatim failure signature:
```
>       _assert_no_commands(device, ZCL_CLUSTER_LEVEL_CONTROL)
E       AssertionError: Condition became true     (conftest.py:540, ensure_never_true)
```
Ungated firmware emits a Level-Move/Stop on long-press in disabled mode → the fixed test catches it, and the gated binary passes the same test 20/20. Clean discrimination.

*Honest note:* only the level-move/stop test flips; `test_disabled_mode_blocks_onoff_but_keeps_local_relay_click` still passes on the mutant (that path is evidently gated outside `switch_cluster.c`). Still a valid, unambiguous signal on the target assertion. I also had to purge the copy's stale `__pycache__` (see below) because `cp -a` carried bytecode whose embedded `co_filename` mislabeled tracebacks as `../clone/...`; after purge, paths are relative to the mutant and the catch is 3/3.

---

## Check #1 (cont.) — uncrustify lint delta on `consts.h` → **NO-GO for a clean CI lint job** (regression persists; NOT fixed, reported verbatim as instructed)

`uncrustify -c uncrustify.cfg --check` on `src/zigbee/consts.h` (Uncrustify-0.78.1_f):
```
@ 182c0195 (control): PASS: consts.h (13921 bytes)                 rc=0
@ 3aa6c9de (suspect): FAIL: consts.h (File size changed from 14150 to 14086)  rc=1
@ 0f54303a (target) : FAIL: consts.h (File size changed from 14150 to 14086)  rc=1   <-- STILL FAILS
```
The determinism commit touched only tests, so the regression (introduced with the DISABLED-mode define block) survives. Cause: the 4 `#define ZCL_ONOFF_CONFIGURATION_BINDED_MODE_{DISABLED,RISE,LONG,SHORT}` are over-aligned (16 spaces × 4 lines too many = 64 bytes); uncrustify wants narrower alignment. Full CI-equivalent `find src | xargs uncrustify --check`:
```
control 182c0195 fails:  src/silabs/spiflash_extension/spiflash/btl_storage_spiflash.c
                          src/silabs/spiflash_extension/spiflash/btl_storage_spiflash_configs.h
target  0f54303a fails:  (same two) + src/zigbee/consts.h
NEW failure vs control:  src/zigbee/consts.h   (exactly one)
```
The two silabs failures are pre-existing/known and irrelevant to the Telink build. `consts.h` is the one **new** failure this branch introduces and would red the `lint` job. Not fixed (per instruction).

---

## Check #2 — real-checkout TC32 release build → **GO**

Ad-hoc mirror of `make_scripts/build_bseed_ts0726_v6.sh` step-for-step (clean → build → ota → manifest), V7 identity. `device_db.yaml` canonical assert **passed**:
```
canonical config assert OK: iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;   (== script CANONICAL)
```
Inputs: `VERSION_STR=1.1.7-bseedv7`, `FILE_VERSION=0x11023009` (**= 285356041 decimal**, verified), `IMAGE_TYPE/OTA_IMAGE_TYPE=45577`, `MANUFACTURER_ID/OTA_MANUFACTURER_ID=4417`, `MIGRATION_FROM_CONFIG=SWAPPED`, `DEVICE_CONFIG_GUARD=BSEED_TS0726_3GANG`, `DEVICE_TYPE=router`.
```
Build complete: /work/clone/build/bseed-ts0726-v7/forward.bin   (make build → "Creating binary")
Creating OTA file /work/clone/build/bseed-ts0726-v7/forward.ota  (make ota)
-rwxr-xr-x 185813 forward.bin   -rw-r--r-- 185890 forward.ota
```
No `error/undefined/fatal/No rule/***` in the log; script is `set -euo pipefail` and reached the manifest → **both make targets exited 0.**

**Deviation from the brief (must flag):** the brief said the TC32 toolchain "lives in-repo at `telink_tools/toolchain/tc32/bin`." **False at 0f54303a** — `telink_tools/` is absent from the checkout. I had to run `make -C src/telink tools/all`, which downloaded SDK 3.7.2.0 (GitHub), TC32 gcc 4.5.1 (shyboy Aliyun OSS, **checksum verified OK**), and TlsrPgm. This is network-dependent and is **not** reproducible from a git-only checkout.

---

## Check #3 — OTA package identity audit → **GO**

Parsed `forward.ota` with the **actual** `make_ota.py` header `OTA_HDR_STRUCT="<I5HIH32sI"` (the brief's simplified layout `[id][mfr@4][imgType@6][ver@8][stack@12]` is a shorthand — parsing at those offsets returns garbage: `@4 mfr=256 @6=56 @8=289472512`, confirming it is wrong). Real header bytes `1e f1 ee 0b | 00 01 | 38 00 | 00 00 | 41 11 | 09 b2 | 09 30 02 11 | 02 00 | "Telink OTA Image" | 22 d6 02 00`:
```
upgrade_file_identifier = 0x0BEEF11E   (ZIGBEE_OTA_MAGIC)  ✓
manufacturer_code (@10) = 4417  (0x1141)  EXPECT 4417     ✓
image_type       (@12) = 45577 (0xB209)  EXPECT 45577     ✓
file_version     (@14) = 285356041 (0x11023009) EXPECT    ✓
zigbee_stack_version(@18) = 2 ; header_string = "Telink OTA Image"
total_image_size (@52) = 185890 == file size on disk       ✓
fileVersion 285356041 > recovery floor 285356040 : True (delta = 1)   ✓ STRICT
```
manifest.json (genuine `sourceCommit=0f54303a…`, `swBuildId=1.1.7-bseedv7`, both images with fileName/bytes/sha256/sha512) generated as in the v6 script.

Artifact hashes:
| file | bytes | sha256 |
|---|---|---|
| forward.bin | 185,813 | `8f7ffbda803ba8f40a8f436ee341b2240599239bde4fc55e7a2615bfd8adc27d` |
| forward.ota | 185,890 | `942ff109bc91dd411a0d6ebd18c00e1402f83e274e844499297a817a7a0033a0` |

---

## Check #5 — determinism spot-check → **REPRODUCIBLE in this environment**

Ran the full two-make invocation twice (independent `clean+build+ota`). Both produced byte-identical output:
```
build1: bin 8f7ffbd…c27d   ota 942ff109…0033a0
build2: bin 8f7ffbd…c27d   ota 942ff109…0033a0   (identical)
```
No timestamp/path leakage into the ELF/OTA here. Caveat: reproducibility is asserted for **this container/toolchain/build path only**; a different SDK copy or build path was not tested.

---

## Check #4 — artifact handoff → **DONE, integrity verified**

Host dir `C:\Users\jakub\.qwen\tmp\v7-release\`:
```
C:\Users\jakub\.qwen\tmp\v7-release\forward.bin    185,813  sha256 8f7ffbda…c27d   (certutil, == container)
C:\Users\jakub\.qwen\tmp\v7-release\forward.ota    185,890  sha256 942ff109…0033a0  (certutil, == container)
C:\Users\jakub\.qwen\tmp\v7-release\manifest.json    1,111
```
Host-side `certutil -hashfile` sha256 matches the in-container values exactly → `docker cp` transfer was lossless. Container `bseedv7` removed after copy.

---

## Overall GO/NO-GO

- **#1 gates + deterministic tests: GO** (20/20 + 316×5, and the fix demonstrably discriminates via the 10/10 mutant).
- **#1 lint: NO-GO for a clean `lint` job** — `src/zigbee/consts.h` fails uncrustify at 0f54303a (still). Cosmetic 4-macro realignment; does not affect the produced binary, but CI lint will be red until fixed.
- **#2 real-checkout build: GO** (both make targets exit 0), with the caveat that the toolchain is **downloaded, not in-repo**, unlike the brief stated.
- **#3 OTA identity: GO** (mfr 4417, imageType 45577, fileVersion 285356041 > 285356040 floor, strict).
- **Artifacts:** delivered and hash-verified on host.

**The binary is a sound RC. The one actionable blocker before merging/publishing is the `consts.h` uncrustify regression** (run `uncrustify -c uncrustify.cfg -f src/zigbee/consts.h` to normalize the `BINDED_MODE_*` alignment), plus reconciling the "toolchain in-repo" assumption in the canary ruling.

## What I did NOT verify
- Did not run `make board/build` / upstream CI wrapper; used the v6-script path (`make -C src/telink build`/`ota`) exactly as the brief directed.
- Did **not** flash, boot, OTA-test, or contact the device/coordinator/HASS/MQTT; the `.ota` was only header-parsed and hashed — its ZCL/OTA-upgrade runtime acceptance is unproven.
- Did not verify the produced firmware's *behavior on hardware* — the passing tests run against the host **stub** binary, not the TC32 image.
- Did not test build reproducibility across a different SDK download / build path / host.
- Did not fix the `consts.h` lint regression (explicitly out of scope).
- The mutant exercises the gate removal only via `switch_cluster.c`; I did not independently confirm how the OnOff-click path stays gated.