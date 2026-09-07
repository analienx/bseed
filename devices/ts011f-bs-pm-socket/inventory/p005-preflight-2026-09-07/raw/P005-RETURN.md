## P005 RETURN — RECOVERY ALREADY ACHIEVED (preflight STOP, no P005 OTA executed)

### Outcome: `P005_RECOVERY_PASS` (recovery achieved outside P005 artifact; P005 OTA intentionally NOT executed)

### Preflight result: **STOP — identity mismatch**
Handoff requires device running `0x12053002` / `1.2.5-bseedv8u1` before the P005 flash. Device was found at:

| Field | Preflight observed (09:50:49Z) |
|---|---|
| installed | **`302329859` / `0x12053003`** (≠ expected 302329858) |
| build ID | **`1.2.5-8b8cc492`** (≠ expected `1.2.5-bseedv8u1`) |
| IEEE | `0xa4c138c5f07ee732` ✓ |
| model | `TS011F_plug_1_2` / manufacturer `b28wrpvx` ✓ |
| device_config | `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;` ✓ byte-exact |
| relay | OFF ✓ |
| OTA state | `idle` ✓ |
| availability | online ✓ |

### Root cause of the mismatch — recovery succeeded at 10:45:38Z
Persistent Z2M file log shows:
```
[2026-09-07 06:27:39] info: z2m: Device 'WorkroomSocketCabinet' was OTA updated from '302329856' to '302329858'   (V8 flash, P004)
[2026-09-07 08:50:37] error: z2m: OTA update of 'WorkroomSocketCabinet' failed (... reason: ABORT)               (recovery attempt 1)
[2026-09-07 08:58:48] error: z2m: OTA update of 'WorkroomSocketCabinet' failed (... reason: ABORT)               (recovery attempt 2)
[2026-09-07 10:45:38] info: z2m: Device 'WorkroomSocketCabinet' was OTA updated from '302329858' to '302329859'  (RECOVERY SUCCEEDED)
```
The running recovery image is the executor's byte-precise patch of the hardware-proven known-good `recovery-forced.zigbee` (commit `39aaa0f`: inner version bytes [2:6] → `0x12053003`, CRC recomputed per `make_ota.py`; only 5 bytes differ from the hardware-proven image). A later retry of the already-launched recovery runner succeeded after the two early ABORTs. The supervisor's diagnosis (inner-version anti-downgrade is the blocking check) was correct.

### Postflight health (post-recovery, 10:5xZ)
- build `1.2.5-8b8cc492`, installed `302329859`, same IEEE/network address (6419), linkquality 88
- full exposes restored: all `switch_*` / `relay_*` / `network_led` / `multi_press_reset_count` attributes present, **no per-character JSON parse errors**
- `voltage: 242.72` — **Electrical Measurement cluster alive and reporting**
- `power: 0` at idle (relay OFF) — plausible idle read, per operator ruling this constitutes success; no load test requested
- `energy: 0.04` monotonic, no log errors for this device post-recovery

### P005 artifact handling
- Actions artifact `10012696291` (run `34106662315`) downloaded; ZIP SHA256 `11eeb3dd0483aa5118f45b3364effe647353d534fd0736123d912125584b94b4` — **matches handoff digest exactly**
- authorized image `build/bseed-ts011f-pm-recovery/forward.ota` **NOT flashed, not modified, kept sealed** (device already at `0x12053003`; flashing an equal-version image is not authorized by the handoff and unnecessary)
- no stock device, no other device, no source/config/converter code touched; no SWS; nothing published/merged

### OTA-client liveness (Phase E)
Proven non-destructively and incidentally: the device's OTA client accepted, negotiated, transferred and booted an image (`…859`) via the standard Z2M OTA path at 10:45:38Z — the client is fully alive on the recovery firmware.

### Request to supervisor
The device is recovered and healthy on the `8b8cc492`-semantics firmware at `0x12053003`. The sealed P005 CI artifact (build `1.2.5-bseed-pm-recovery1`) remains available as a supervisor-controlled follow-up if the CI-built variant is still wanted on hardware. Awaiting your decision; no further executor action taken.
