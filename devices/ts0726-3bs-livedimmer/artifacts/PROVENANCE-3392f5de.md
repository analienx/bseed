# Artifact provenance — swapped-pin migration canary v3 images

Source: `analienx/tuya-zigbee-switch` commit **`3392f5de2cefbd1e374ec22f96ea08d0710652d9`**
(branch `bseed/integration-canary-v3` = `feature/physical-relay-policy`
(glitch-free boot continuity **incl. the latching-init fix**, correction 2 of
re-review `5492467354`) + the BSEED migration overlay). Durable copy: **draft
release `bseed-ts0726-canary-v3-3392f5de`** on that repository (tag pinned to
the exact source SHA). Second protected local copy: the OTA executor
workspace, `build/artifacts/`.

**Status: validation-stage artifacts. NOT APPROVED FOR FLASHING until
[analienx/bseed#8](https://github.com/analienx/bseed/issues/8) gates close
(G target-only transport proof still open; H stays BLOCKED_PENDING_EUI64).**

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
| BIN sha256 | `ff9156d2f1aca4f02c2b6f5875bd63b56484e0ec4ef3ad0171482d230eb00387` |
| OTA sha256 | `10d6ae5d678d54f3be6bd239a9ee1a050fd9b8c85e4cf570deb2196f667ea568` |
| OTA sha512 | `bca80ffc7ce9340397a330568554b42c8b3ab9ef57a150cb890f25c227ad23592ae3e6038ebfdbb3c67bb843c4d8f2be4a9c7adf835e766c3751aa407a9a5075` |

Contains the forward migration (verified by symbol strings); recovery-proof of
absence is on the recovery image below.

## Recovery (migration-revert image)

| field | value |
|---|---|
| fileVersion | 285356034 (strictly greater than the canary) |
| internal VERSION_STR | `1.1.3-8542fc05-rev` |
| manufacturerCode | 4417 |
| imageType | 45577 |
| BIN sha256 | `b4096691cefded7b7563d8f6a902b6b75c4d930da3934a472904c4efbc959d67` |
| OTA sha256 | `dcefd7378035f2f83abaf5cb9c0426eb30ec321b1760700f527f25020947e5b4` |
| OTA sha512 | `1aad33ab663c7a3faa99d2e6c986b08df90dc137472e2150e46ddae3df27042a35a9e123374a27372ca44471da50fc69f60fc33867020f48bf5b3c13721415ea` |

Contains the revert transaction (`swapped-pin state restored`) and **zero**
forward-migration strings — proven by symbol search on the built ELF.

## Superseded artifact sets (kept, never overwritten)

| set | source | note |
|---|---|---|
| v1 (pre-latching-fix canary lineage) | `04f98be7` | draft release `bseed-ts0726-canary-04f98be7`; see `PROVENANCE-04f98be7.md` |
| v2-pre-latching-fix | `4ad7dee0` | draft release `bseed-ts0726-canary-v2-4ad7dee0`; see `PROVENANCE-4ad7dee0-v2-pre-latching-fix.md` |

## Rollback chain (per Supervisor rulings 5489418096 / 5490809468 / 5492467354)

```text
canary 285356033 -> recovery 285356034 -> recovery transaction restores
swapped + MANUAL/ON
```

Exact return to LKG firmware `285356032` is stage 2 and requires the
target-only forced downgrade path. Rollback is not proven until the recovery
OTA is demonstrated target-only deliverable.

## Gate status at this source

- Gate 3 (migration transaction) PASS at `04f98be7`, carried through the
  rebase onto the latching-corrected generic base with zero transaction-logic
  changes (re-review scope: generic base delta + interaction only).
- Full suite at this source: **276 passed / 0 failed** (38 migration tests,
  22 boot-continuity tests incl. the corrected latching semantics, 2
  cross-image tests, generator tests, cover regression).
- Corrected identity terminology: live custom Basic identity is
  `iedhxgyi` / `TS0726-3-BS`; the stock DB identity is
  `_TZ3002_iedhxgyi` / `TS0726`. These are separate fields and must not be
  conflated.
- Precondition 5 stays `BLOCKED_PENDING_EUI64`; HA #41 stays hard-stopped.
