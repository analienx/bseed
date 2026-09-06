# CUSTOM_CANARY_CANDIDATES — read-only inventory of already-custom BSEED TS011F sockets (2026-09-06)

Authorization: issue #11 comment `5561451599` (FINALIZATION RESET — READ-ONLY CUSTOM-FIRMWARE TARGET DISCOVERY ONLY).
Method: live Z2M bridge/devices + per-device MQTT `/get` polls. **Zero mutations.** Stock `_TZ3000_*` units inventoried only to be excluded; `from_tuya` wrapper NOT deployed and explicitly shelved.

## Custom PM exact-family units (manufacturer `b28wrpvx`, model `TS011F-BS-PM`, image type 43556)

| # | Device | IEEE | Build | fileVersion | device_config | Relay | Load | LQI |
|---|--------|------|-------|-------------|---------------|-------|------|-----|
| 1 | WorkroomSocketCabinet | `0xa4c138c5f07ee732` | `1.2.5-8b8cc492` | 302329856 / `0x12053000` | `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;` | OFF | **0 W** (energy 0.04) | 100 |
| 2 | LivingRoomSocketWifiLeft (canary) | `0xa4c138ba60b92c5f` | `1.2.5-8b8cc492` | 302329856 / `0x12053000` | `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;` | OFF | ~2 W standby | 148 |

Both endpoints [1,2], Router role, supported definition `TS011F_plug_1_2`. dateCode `20260822` both.

## Other already-custom TS011F units — DIFFERENT family, provenance stated explicitly

manufacturer `o1jzcxou`, model `TS011F-BS` (non-PM switch hardware, definition `_TZ3000_o1jzcxou`), fileVersion 285356032 / `0x11040000`, config `o1jzcxou;TS011F-BS;LC2;SB4u;RC3;ID2;M;`:
- BedroomSocketBalcony `0xa4c138ac993cc245` (1.1.2-8542fc05, relay ON, in use)
- WRSocketEntrance `0xa4c1387b13e9436d` (1.1.2-8542fc05, relay OFF, LQI 192)
- BedroomSocketCabinetRight `0xa4c13824a7005afb` (1.1.2-2289bf4d, relay OFF)

**Provenance caveat:** these are the non-PM BSEED switch family — historically converted custom units, but there is no project evidence they carry the PM-capable (HLW8012) hardware of the `b28wrpvx` board, and the frozen V8 PM image (4417/43556) does not match their identity/image type. Listed for completeness, excluded from ranking.

## OTA history (from project evidence)

- **WorkroomSocketCabinet**: completed a full OTA transfer (the stock→custom `from_tuya` conversion) — the only family unit with a proven completed transfer; that was under its STOCK client, so custom-client (0x12053000) initiation liveness is UNTESTED.
- **LivingRoomSocketWifiLeft**: proven FAILED initiation ×2 (P002 + P003) under the custom 0x12053000 client; power cycle could not be applied (shared breaker).
- No unit has a proven custom→custom OTA. No unit is on `0x12053001` or any other custom version with proven OTA-client liveness.

## Key finding (said plainly)

**Every already-custom PM unit is on the problematic predecessor `302329856 / 0x12053000`.** There is no custom PM unit on `0x12053001`+.

**Power-cycle feasibility:** operator confirmed **WorkroomSocketCabinet is on its own switch/breaker and can be target-only power-cycled without affecting HA/coordinator infrastructure** — the exact condition whose absence blocked P003 on the canary. LivingRoomSocketWifiLeft cannot (shared breaker).

## Ranked candidates

1. **WorkroomSocketCabinet** — exact PM custom; config byte-identical to the frozen V8 migration path; noncritical and safely unloadable (0 W measured); independently power-cyclable (re-arm test possible if initiation stalls); no failed-initiation baggage.
2. LivingRoomSocketWifiLeft — exact PM custom, but known-bad initiation history on this client and cannot be power-cycled; only fallback if Supervisor prefers it.

**RECOMMENDED_EXISTING_CUSTOM_TARGET: `WorkroomSocketCabinet` (`0xa4c138c5f07ee732`)**

No OTA performed; stopping for Supervisor selection. Evidence: `raw/custom-inventory.json`, `raw/custom-detail.json`, `tools/`. Frozen V8 `ded91a1fb1cdeb320d0858c8f4bcabab32bf5564` untouched.
