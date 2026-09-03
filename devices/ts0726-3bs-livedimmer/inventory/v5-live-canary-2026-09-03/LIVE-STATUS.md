# V5 live canary status — 2026-09-03

Status: **BLOCKED AFTER SAFE FORWARD OTA**

Target: `LivingRoomMainDimmer` / `0xa4c13843a9d40f85`

## Passed

- Exact v5 overlay loaded beside v4; installed-ZHC and coexistence probes passed.
- Fleet/topology after overlay restart: 104 devices, 21 groups, no binding/reporting/group delta.
- Forward and recovery target-only OTA checks passed.
- Forward OTA completed:
  - from `1.1.4-bseedv4`, fileVersion `285356035`
  - to `1.1.5-bseedv5`, fileVersion `285356037`
- Canonical hardware configuration remained byte-exact.
- v5 definition `EC-GL86ZPCS31` selected.
- LED-source settings persisted:
  - LEFT/MIDDLE = Binding status
  - RIGHT = Physical output

## Blocked

- Mains-power properties are not endpoint-safe for ordinary unscoped MQTT/HA writes.
- LEFT/MIDDLE Match-local-state writes did not survive restart; raw `0x0010` remained Toggle.
- Protected advanced hardware-config GET did not produce a fresh response in live testing.
- Frozen HA v2 contract conflicts with the operator's later RIGHT hard-power profile.

Full implementation handback: [issue comment 5521286421](https://github.com/analienx/bseed/issues/8#issuecomment-5521286421).

## Safe current state

Authoritative post-restart reads:

```text
firmware = 1.1.5-bseedv5
config   = iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;

EP4/EP5/EP6 physical mode 0xff03 = 1 / 1 / 1  (Always on)
EP4/EP5/EP6 LED source    0xff01 = 4 / 4 / 3  (Binding / Binding / Physical)
EP1/EP2/EP3 action        0x0010 = 2 / 2 / 2  (Toggle)
EP4/EP5/EP6 binding intent 0xff04 = 0 / 0 / 0
```

No bindings, groups, coordinator settings, or hardware pin mappings were changed. HA v2 was not deployed. Recovery fileVersion `285356038` remains staged and hash-verified on the HA host.

## V5.1 correction gate — 2026-09-03

- Corrected overlay `d0ec7c1b3b67cf8265244b768b76684e44691374`, blob `5e04d9e50fee0c3d6f9b9b2f92114b25daac4b3e`, is live byte-exact; SHA256 `4940ad694de9c61e9afbdd529f59ffcf02edf3dc707979301dfc7a73068e5bda`, 34423 bytes.
- One controlled Z2M restart completed cleanly; target remains v5 and the exact-ZHC routing probe passes 33/33 cases.
- Safe per-channel Mains-power writes/readbacks pass: EP4/EP5/EP6 each remain `0xff03 = 1`.
- Corrected live action-mode SETs still do not persist: raw EP1/EP2 `0x0010` remain `2`, not required `3`. GETs also returned no response. This is the active stop condition.
- Advanced hardware-config GET, lock/expiry UX, desktop/mobile UX, physical acceptance, and HA v2 deployment were not attempted after this failure.
- IEEE set and group set remain unchanged; target bindings/reportings remain unchanged. A global before/after database comparison shows only an unrelated device gained pre-existing cluster-1 binds/reportings during the interval; no target topology mutation is attributed to this correction.
