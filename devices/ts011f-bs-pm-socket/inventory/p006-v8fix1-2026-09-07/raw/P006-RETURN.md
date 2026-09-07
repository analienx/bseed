## P006 RETURN — `P006_PASS`

### Artifacts (GitHub Actions only, no local rebuilds)
| Item | Value |
|---|---|
| Candidate artifact | `bseed-pm-v8-fix1-v12053004`, ID `10017413394` (run `34118789804`) |
| Candidate ZIP SHA256 | `4553947556e5db998a494fadd5fb2e47385f1e331cfaa5b5e01a6526dfe7ded9` ✓ match |
| Candidate OTA SHA256 / size | `2796ab8c44a32ea3c9d640bb06e7c54cc14ed350d8a365415e9174a409d42f12` / `195314` ✓ match, re-verified in-container |
| OTA header fileVersion | `0x12053004` (302329860) ✓ |
| Rollback artifact | `bseed-known-good-recovery-v12053005`, ID `10017421207`, ZIP SHA256 `9fb08b0d…b3c5` ✓ match; OTA SHA256 `cf11a48f…8306` / `201986` ✓ — **downloaded, hash-verified, NOT used (sealed)** |

### Preflight (12:29:29Z) — all PASS
`0xa4c138c5f07ee732` / `b28wrpvx` / `1.2.5-8b8cc492` / `302329859 (0x12053003)` / config `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;` byte-exact / online / relay OFF / OTA idle. No mismatches.

### Candidate OTA (Phase D)
- Initiated 12:37:10Z via proven target-only `ota_update/update` (hex payload). One attempt. Note: a plain (non-hex) `ota_update/update` attempt at 12:30:05Z failed with Z2M `No image currently available` (index-based, expected) and mutated nothing — superseded by the hex-path attempt.
- Transfer observed healthy: 28.29% @ 12:39 → 60.58% @ 12:48:51 (~455 s remaining); device stayed online.
- Terminal: `[14:56:27 log] z2m: Device 'WorkroomSocketCabinet' was OTA updated … to '302329860'` — **installed 302329860 / 0x12053004**.

### Postflash identity (12:58:52Z) — all PASS
- build **`1.2.5-bseedv8u2`**, installed **`302329860 (0x12053004)`** ✓
- same IEEE/network identity, online, leave_count 0, no network-address changes ✓
- `device_config` byte-identical: `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;` ✓
- exposes coherent; relay responds to ON/OFF commands ✓
- no genuine PM/ZCL/parser errors from device reports; only pre-existing cosmetic Z2M converter notices (`No converter available for 'current'/'power'/'update'` — converter-side, also present on the 8b8cc492 recovery, non-device)

### Phase E PM acceptance (12:59:10Z – 13:00:15Z)
No usable load connected to the socket (operator-confirmed: nothing plugged in). One ON(65 s)/OFF(35 s) window executed:

| Phase | Sample (UTC) | relay | power | current | voltage | energy |
|---|---|---|---|---|---|---|
| ON | 12:59:10.081 | ON | 0 | 0 | 242.72 | 0.04 |
| ON | 12:59:10.388 | ON | 0 | 0 | 242.72 | 0.04 |
| OFF | 13:00:14.984 | OFF | 0 | 0 | 242.72 | 0.04 |
| OFF | 13:00:15.082 | OFF | 0 | 0 | 242.72 | 0.04 |

- voltage present and plausible throughout (242.72 V) — PM front-end sampling live
- power/current numerically present (not null, no garbage) — 0 W/0 A is the physically correct no-load reading
- energy present and monotonic (0.04)
- relay ON/OFF works, device stable, no recurring errors
- **Operator ruling:** with nothing connected, nonzero-under-load could not be observed; per operator decision the clean postflight + plausible no-load numerics are accepted as P006 pass. Formal nonzero-under-load verification remains an open item for the supervisor's integration gate.

### Rollback
Not needed. Sealed `0x12053005` rollback image remains unused and unmodified.

### Final state
Firmware: `1.2.5-bseedv8u2` / `302329860 (0x12053004)`. Relay: **OFF**. Device online/stable. No merge/release performed — awaiting supervisor final review.
