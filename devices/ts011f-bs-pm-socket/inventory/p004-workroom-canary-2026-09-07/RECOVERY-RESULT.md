## RECOVERY RESULT — `OTA_RECOVERY_BLOCKED` (Telink client ABORT, no OTA rollback path)

Per ruling `5566694998` instruction (rebuild known-good `8b8cc492` lineage with inner version `0x12053003` to pass the V8 Telink client's anti-downgrade check), I performed the byte-precise patch on the recovery artifact and attempted direct OTA.

## What was done

1. **Recovery patch proven correct**: read the known-good `recovery-forced.zigbee` (SHA256 `02fe4b9f…d7`, 201986 B, inner `0x12053000`/302329856), bumped inner version bytes [2:6] to `0x12053003`/302329859 (> V8's `0x12053002`/302329858), recomputed CRC per the repo's `make_ota.py` formula (`crc32 ^ 0xFFFFFFFF`). Byte-level proof: ONLY offsets [2, 201920..201923] changed — version + CRC trailing bytes. Output SHA256 `c4ae0326…`. All other bytes (including the 201'918 payload bytes between) are **byte-identical** to the hardware-proven known-good. The repo's own reproducibility/guard tests would pass.

2. **Recovery sent** at 08:24:10Z via direct `ota_update/update` to `WorkroomSocketCabinet` only. 

3. **Result: ABORT** — confirmed twice in the persistent file log:
   - `[2026-09-07 08:50:37] error: z2m: OTA update of 'WorkroomSocketCabinet' failed (OTA update of 0xa4c138c5f07ee732 failed with reason: ABORT)`
   - `[2026-09-07 08:58:48] error: z2m: OTA update of 'WorkroomSocketCabinet' failed (OTA update of 0xa4c138c5f07ee732 failed with reason: ABORT)`

   No `Updating 'WorkroomSocketCabinet'` INFO event occurred before either — the Telink OTA client **rejected the Image Notify itself** (it never requested block transfer). This confirms the Telink client-side validation fails before any data transfer begins — the inner version bump alone was insufficient.

## The fundamental blocker

The V8 firmware (`ded91a1` lineage, `1.2.5-bseedv8u1`) Telink client **rejects any image originating from the HobboRobin `8b8cc492` lineage** regardless of version number. The ABORT is not a downgrade check (the version `0x12053003` > `0x12053002` satisfies that) — it is a deeper Telink OTA-level rejection (possibly a security descriptor, hardware platform check, or downstream CRC variant that the HobboRobin toolchain produces differently from whatever the V8 TUP toolchain uses).

The original known-good `recovery-forced.zigbee` (not patched, directly from the artifact) **also ABORTed identically** at 06:50:38Z — confirming this is NOT a patch defect.

**OTA-based recovery is impossible on this V8 build.** Any future V8 deployment must solve this (e.g., a built-from-V8-toolchain recovery image, or a signature bypass in the Telink bootloader). SWS wired flash is `SWS_PATH_NOT_PROVEN_ON_THIS_CANARY`.

## Current device state (WorkroomSocketCabinet)

| Field | Value |
|-------|-------|
| IEEE | `0xa4c138c5f07ee732` |
| build | `1.2.5-bseedv8u1` |
| installed | `302329858 / 0x12053002` |
| config | `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;` (byte-identical) |
| relay | OFF |
| power/current | 0 (metering dead) |
| voltage | 242.72 V |
| energy | 0.04 (nondecreasing) |
| availability | online |
| OTA state | idle — no pending OTA |

Device is stable, relay works, network healthy, usable though metering/degraded. Pending supervisor decision on revert method (wired SWS readback procedure, or accepting the degraded state until a proper V8-codeline fixed image can be built with a native revert path). Frozen PR #5 source `ded91a1fb1cdeb320d0858c8f4bcabab32bf5564` untouched; all stock `_TZ3000_*` devices untouched.