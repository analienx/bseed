# V6 SOFTWARE-LIVE CANARY — EXECUTOR RETURN (2026-09-03)

Executor return for supervisor `5522723614` (work unit A–H, bounded live canary).
Target: `0xa4c13843a9d40f85` / `LivingRoomMainDimmer`.
All operations via SSH to the HA host + docker exec into `app_45df7312_zigbee2mqtt`
+ MQTT bridge requests only; no manual attribute writes, no re-pair, no interview.

## Verdict

```text
STEP_B_SERVICE_HEALTH_FAIL — V6_SOFTWARE_LIVE NOT COMPLETED
A PASS · B composition preflight PASS, staging restart FAILED service health
C/D/E/F/G/H NOT REACHED (no OTA CHECK, no OTA transfer, no setting change)
Rollback executed exactly as prescribed: remove ONLY V6 overlay + one restart.
RECOVERY PROVEN. Target untouched on V5. Stopped for Supervisor.

B2 ADDENDUM: failure REPRODUCED on the operator's patched add-on
(local/aarch64-addon-zigbee2mqtt-p007:2.13.0-1-p007) with an identical
signature — see ADDENDUM B2 below. The V6 overlay itself is the trigger.
```

## A. Re-prove current safe V5 baseline — PASS

| Require | Observed |
|---|---|
| target sw = `1.1.5-bseedv5` | `softwareBuildID 1.1.5-bseedv5`, dateCode `20260902` |
| target fv = `285356037` | `update.installed_version = 285356037`, `update.state = idle` |
| device_config canonical | `iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;` (exact) |
| EP4/5/6 genOnOff 0xff03 = 1/1/1 | overlay raw readers `raw_ep4/5/6_onoff_physical_*` = `{"65283":1}` ×3 (DETACHED_ON) |
| V5.1 overlay live hash | `bseed_ts0726_v5.js` = `4940ad694de9c61e9afbdd529f59ffcf02edf3dc707979301dfc7a73068e5bda` (exact match to pin) |
| bridge capture | 104 devices / 21 groups; IEEE set, target bindings + configured_reportings snapshotted (`baseline/bridge-before.json`) |

Note: batched raw `{"read": …}` gets return `No converter available for 'get' 'read'`
on the V5.1 definition; the 0xff03=1 evidence comes from the V5.1 overlay's own
typed raw readers (`raw_ep*_onoff_physical_*`, ZCL read of attr 65283 on genOnOff).

## B. Stage V6 overlay BESIDE V5 — composition PASS, restart service-health FAIL

Staging artifacts (all hash-pinned before and after transfer, verified in-container):

- `bseed_ts0726_v6.js` — git blob `b64d6af4f60adfd56ee984baad0826d25797f488` @ `e31221ff19ecb0f90651690a243f9afb28b71b70`, 34,577 B, sha256 `9f954ce87ae53aef0828e332c3a6d8beefb6b5049be56fe43d6ebcaaf3e239fa`
- `forward.ota` sha256 `d18c420d…`, `recovery.ota` sha256 `4a09b5221d06889f34abd5c3cf89405d42bb168810013b45f1cef64433bf1b19`, archive `4064e440…` (artifact ID 9884225463) — all exact matches to the dispatch

Composition preflight (`staging/composition-preflight.json`) — PASS:
replicated ZHC 26.90.0 `findDefinition`/`isFingerprintMatch` over all 103 non-coordinator
bridge devices against live V4/V5 + staged V6 fingerprints:

- V5 matches ONLY the target (`1.1.5-bseedv5`); V6 matches nothing yet;
- V6 would match the target after OTA (`1.1.6-bseedv6`, priority 100); V5 would not;
- exactly one `TS0726-3-BS` device in the fleet.

V6 overlay deployed to `/config/zigbee2mqtt/external_converters/bseed_ts0726_v6.js`
(sha256 verified on disk). One controlled Z2M restart executed (12:16:15).

**FAIL-1 — frontend did not start with the V6 overlay loaded:**

- All nine previous restarts today logged `Started frontend on port 8099`
  (08:37, 08:48 ×2, 08:57, 09:49, 11:19, 11:20 …).
- The 12:16:15 restart (V6 overlay present, loaded OK) logged **no** frontend line
  at all; `127.0.0.1:8099` → `ECONNREFUSED` from inside the container
  (`staging/v6-restart-nofrontend.txt`, `port-check.js`).
- Only error in the log: the same transient restart-time `MQTT error: read ECONNRESET`
  seen in prior restarts. No converter error, no interview, no other regression.
- Bridge/state invariants otherwise held (snapshot `bridge-after-restart.json`).

Per the dispatch ("If service health regresses: remove ONLY V6 overlay; restart once;
prove recovery; report and STOP"):

1. Removed ONLY `/config/zigbee2mqtt/external_converters/bseed_ts0726_v6.js`
   (V4/V5 and all other external converters untouched);
2. one controlled restart (12:21:22);
3. recovery proven: `[2026-09-03 12:21:33] info: z2m: Started frontend on port 8099`
   + `PORT_OPEN 127.0.0.1:8099` (`staging/v6-rollback-frontend.txt`);
4. post-rollback state identical to pre-stage baseline: 104 devices, IEEE set
   unchanged, groups 21 unchanged, target bindings unchanged, configured_reportings
   unchanged, target still `1.1.5-bseedv5` / `EC-GL86ZPCS31`
   (`staging/bridge-after-rollback.json`, `staging/state-after-rollback.json`).

The A/B is clean: V6 overlay present → frontend down; V6 absent → frontend up.
Root cause is NOT localized further from the live side (no error logged by the
frontend path). Requires Supervisor/firmware-side investigation of the V6 overlay
under Z2M 2.13.0 / WindFront with `frontend.package = zigbee2mqtt-windfront`.

## C/D — OTA staging and CHECK

NOT EXECUTED. Images remain staged and hash-verified in
`/tmp/ota-canary-v6/artifacts/` inside the container and
`/root/ota-canary/v6-live-20260903/artifacts/` on the host (inert; no HTTP server
running; no CHECK or UPDATE transaction was published). Index files are prepared at
`staging/index-forward.json` / `staging/index-recovery.json` in the host staging dir.

## Live state left behind

- Z2M running, healthy, frontend on 8099; external_converters back to
  pre-stage set (`bseed_ts0726_v4.js`, `bseed_ts0726_v5.js`, + unchanged others);
- target on `1.1.5-bseedv5`, canonical config, 0xff03 = 1/1/1, no bind/group/
  interview/config mutation anywhere in this work unit;
- V6 staging left in place pending supervisor ruling:
  host `/root/ota-canary/v6-live-20260903/` + container `/tmp/ota-canary-v6/`
  (artifacts, indexes, probe scripts, evidence). One command tears both down.

## Evidence (this directory)

```text
baseline/bridge-before.json        pre-stage bridge snapshot (104 devices, 21 groups)
baseline/state-before.json         pre-stage full device state (identity, raw 0xff03, config)
staging/composition-preflight.json ZHC-matched composition proof (PASS)
staging/bridge-after-restart.json  bridge snapshot with V6 overlay loaded (frontend down)
staging/v6-restart-nofrontend.txt  non-publish tail of the failed restart log
staging/bridge-after-rollback.json post-rollback bridge snapshot (identical deltas 0)
staging/state-after-rollback.json  post-rollback device state (V5, canonical)
staging/v6-rollback-frontend.txt   "Started frontend on port 8099" after rollback
ota/  raw/  ux/                    empty — steps C–H not reached
```

## Stop

Stopped per dispatch. No OTA, no CHECK, no device mutation occurred. The V5
electrically-safe state is fully restored and proven. Physical-button boundary was
never approached.

---

# ADDENDUM B2 (2026-09-03 ~12:40Z) — failure REPRODUCED on operator-built add-on `p007`

## Environment change observed (operator action, outside this ledger)

While this return was pending, the operator replaced the Z2M add-on container:

```text
old: app_45df7312_zigbee2mqtt (stock 2.13.0-1 add-on)         — removed
new: app_local_zigbee2mqtt-p007
     image local/aarch64-addon-zigbee2mqtt-p007:2.13.0-1-p007 — started 12:27:43Z
```

`/config` is shared: external_converters were exactly my rollback state
(v4 `d5b276dd…`, v5 `4940ad69…`, no V6 file). ZHC is still the pinned
`26.90.0` (`/app/node_modules/.pnpm/zigbee-herdsman-converters@26.90.0/`);
Z2M still 2.13.0. Frontend healthy on 8099 after the operator's own start.

## B re-run on p007 (same work unit, same pinned artifacts)

All staging re-verified in-container (overlay `9f954ce8…`, forward.ota
`d18c420d…`, recovery.ota `4a09b522…`). Fresh bridge baseline captured
(`staging/bridge-before-p007.json`). Composition preflight PASS again.
V6 overlay deployed (hash verified on disk) → ONE controlled restart (12:38:51).

**FAIL-1 REPRODUCED, identical signature:**

```text
12:38:56  Connected to MQTT server
12:38:56  Loaded external converter 'bseed_ts0726_v4.js' / v5 / v6 / stb3l / switch_custom ×2 / tuya_with_ota ×…
12:38:57  (last non-publish startup line)
          → "Started frontend on port 8099" NEVER logged; 127.0.0.1:8099 ECONNREFUSED
          → process alive: bridge publishes continue normally
```

No converter error, no exception, no uncaught-rejection line — the frontend start
is silently skipped/lost whenever the V6 overlay is loaded. This eliminates the
add-on build as the variable: **the V6 overlay itself deterministically prevents
frontend startup** on both independent Z2M 2.13.0-1 builds (stock and operator
patch p007).

Prescribed rollback executed (remove ONLY V6 overlay + one restart, 12:40:04):
`Started frontend on port 8099` at 12:40:15, `PORT_OPEN 127.0.0.1:8099`
(`staging/p007-restart-nofrontend.txt` is the full non-publish log tail of the
failed boot).

Post-rollback state re-proven identical to the p007 baseline
(`bridge-after-rollback-p007.json` vs `bridge-before-p007.json`):
104 devices, IEEE set unchanged, groups unchanged, target bindings unchanged,
configured_reportings unchanged; target `1.1.5-bseedv5`, canonical
device_config, `raw_ep4/5/6_onoff_physical_*` = `{"65283":1}` ×3.

## Conclusion for Supervisor

The V6 overlay (`bseed_ts0726_v6.js` @ `e31221ff`, blob `b64d6af4…`) blocks
Z2M frontend startup with WindFront while otherwise booting cleanly. The delta
vs the proven V5.1 overlay (same repo family) is the primary suspect surface:
the V6-specific exposes (0xff06 5-value `buttonCommandBehavior`, `deviceConfigUnlock`
editor pair, `lastButtonAction`, `networkIndicator`, extended
`legacyActionEvent` aggregate, `configTransportCluster` shape) and any WindFront
interaction with them should be audited offline in the firmware repo. No further
live restarts were performed after the prescribed rollback.

## Additional evidence (B2)

```text
staging/bridge-before-p007.json        p007 baseline (pre-deploy)
staging/p007-restart-nofrontend.txt    full non-publish log tail of failed boot on p007
staging/bridge-after-rollback-p007.json post-rollback bridge snapshot (deltas 0)
staging/state-after-rollback-p007.json  post-rollback target state (V5, canonical, 0xff03=1/1/1)
```

Still STOPPED for Supervisor. No OTA, no CHECK, no device mutation in B2 either.
