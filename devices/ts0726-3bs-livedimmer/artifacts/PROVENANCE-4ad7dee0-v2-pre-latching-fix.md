# Artifact provenance — swapped-pin migration canary v2 images

Source: `analienx/tuya-zigbee-switch` commit **`4ad7dee08172ac4745e55c919cd987c0da1179e0`**
(branch `bseed/integration-canary-v2` = `feature/physical-relay-policy`
(glitch-free boot continuity) + the BSEED migration overlay). Durable copy:
**draft release `bseed-ts0726-canary-v2-4ad7dee0`** on that repository (tag
pinned to the exact source SHA). Second protected local copy: the OTA
executor workspace, `build/artifacts/`.

**Status: validation-stage artifacts. NOT APPROVED FOR FLASHING until
[analienx/bseed#8](https://github.com/analienx/bseed/issues/8) gates A-H
close (G is target-only transport proof; H stays BLOCKED_PENDING_EUI64).**

## Build environment

- Telink Zigbee SDK v3.7.2.0 (`telink-semi/telink_zigbee_sdk`, tag `V3.7.2.0`)
- TC32 GCC toolchain v2.0, sha256
  `33b854be3e3db3dba4b4dacdda2cd4ea1c94dfd4d562864a095956de7991b430`
  (matches the checksum pinned in `src/telink/tools.mk`)
- Command template (canary; recovery identical plus `MIGRATION_REVERT=1` and
  its own versions):

```sh
CONFIG_STR="iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;" \
MIGRATION_FROM_CONFIG="iedhxgyi;TS0726-3-BS;LC4;SB1u;RC0;IC2;SB7u;RD7;IC3;SB4u;RD2;IB5;M;" \
IMAGE_TYPE=45577 MANUFACTURER_ID=4417 \
VERSION_STR="1.1.3-8542fc05" FILE_VERSION=285356033 \
OTA_VERSION=285356033 OTA_MANUFACTURER_ID=4417 OTA_IMAGE_TYPE=45577 \
make -C src/telink ota
```

## Canary (forward migration image)

| field | value |
|---|---|
| fileVersion | 285356033 (installed LKG 285356032 + 1) |
| internal VERSION_STR | `1.1.3-8542fc05` |
| manufacturerCode | 4417 |
| imageType | 45577 |
| BIN sha256 | `22511ac2792b17939c849311e5ae9fc933ca6fcc3eac004fca17247d0bfe9d11` |
| OTA sha256 | `7c6b52fadb77dbaccde8c3fbdec026e027ed56e96fda800af71f036a750fd684` |

Contains the forward migration (verified by symbol strings); recovery-proof of
absence is on the recovery image below.

## Recovery (migration-revert image)

| field | value |
|---|---|
| fileVersion | 285356034 (strictly greater than the canary) |
| internal VERSION_STR | `1.1.3-8542fc05-rev` |
| manufacturerCode | 4417 |
| imageType | 45577 |
| BIN sha256 | `3e1509b8b6114cb3f0fd344772f15550d9f49315de4ff23206c1c127a4250c6c` |
| OTA sha256 | `ee65c38ecb613e93ef2cf3174f5ca29bab3e845ba74946573fd129b9835d7f5d` |

Contains the revert transaction (`swapped-pin state restored`) and **zero**
forward-migration strings — proven by symbol search on the built ELF.

## Rollback chain (per Supervisor rulings 5489418096 / 5490809468)

```text
canary 285356033 -> recovery 285356034 -> recovery transaction restores
swapped + MANUAL/ON
```

Exact return to LKG firmware `285356032` is stage 2 and requires the
target-only forced downgrade path. Rollback is not proven until the recovery
OTA is demonstrated target-only deliverable.

## Gate status at this source

- Gate 3 (migration transaction) PASS at `04f98be7`, carried through the
  rebase onto the generic branch unmodified in transaction logic.
- Gate B (generic physical-relay-policy, no BSEED dependency) and gate C
  (boot continuity: first enable already at the policy level) pass on the
  generic base — see `tests/test_boot_continuity.py` on
  `feature/physical-relay-policy`.
- Full suite at this source: 274 passed / 0 failed (38 migration tests,
  20 boot-continuity tests, cross-image proof included).
- The archived pre-boot-fix baseline is documented in
  `PROVENANCE-04f98be7.md`.
