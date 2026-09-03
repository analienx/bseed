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

---

# WORK UNIT 3 (2026-09-03 ~17:15Z) — corrected single-overlay V5→V6 transition, Step B only

Dispatch: issue #8 comment `5527598873` (supervisor). Frozen source: repo
`analienx/tuya-zigbee-switch`, branch `supervisor/target-overlay-v56-transition`,
commit `833b117388b3a324b71e12963e277a342c4c49da`, blob `ae48e23a974244923ab3a27a69a7e5341c920eb4`.
Local blob hash verified byte-exact before staging. `git hash-object` = `ae48e23a…` ✓.

## A. Baseline (fresh, p007 environment)

```text
sw            = 1.1.5-bseedv5         (live bridge/devices fingerprint string)
device_config = iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;  (canonical, live read)
0xff03        = 1/1/1                 (relay_*_physical_mode "Always on" ×3, live property reads;
                                       attr confirmed as genOnOff 0xff03 type 0x30 in converter source)
frontend      = healthy (200 OK in-container)
bridge        = 104 devices / 21 groups snapshot: evidence/transition/bridge-transition-baseline.json
note          = integer fv 285356037 (genBasic 0x4000) was proven in work unit B1; no device write has
                occurred since (zero topology deltas through B1/B2/B3), so identity is unchanged.
                Modern Z2M 2.x build has legacy raw-read API disabled; endpoint-scoped raw get is not
                available without it, so the string identity + canonical config carry the proof.
```

## B. In-place replacement + one controlled restart

```text
external_converters before: v4 + v5 only (no bseed_ts0726_v6.js) ✓
backup of proven V5.1 (outside external_converters):
  backup-transition/bseed_ts0726_v5.pre-transition.js  sha256 4940ad694de9c61e9afbdd529f59ffcf02edf3dc707979301dfc7a73068e5bda ✓
replaced in place: /config/zigbee2mqtt/external_converters/bseed_ts0726_v5.js
  on-disk sha256 = 9b34e77292a9a7e0776a0bf68865e764533a057b484b2f006daf0bfea17e9093 (blob ae48e23a…)
V4 + all unrelated converters untouched ✓
ONE restart at 17:15:11Z
```

### Require gates — ALL PASS

```text
Started frontend on port 8099     ✓ 17:15:15 (with transition overlay loaded)
frontend HTTP                     ✓ 200 OK in-container, port LISTEN
Z2M healthy                       ✓ container healthy, MQTT publishing
target identity                   ✓ 1.1.5-bseedv5 / 0xa4c13843a9d40f85 / interview_completed
transition definition resolution  ✓ EC-GL86ZPCS31, source "external", 48 exposes
device_config                     ✓ canonical (live read post-restart)
EP4/5/6 mains 0xff03              ✓ 1/1/1 ("Always on" ×3, live reads)
topology delta                    ✓ 0 — IEEE set, endpoints/bindings/reportings, groups all
                                     byte-identical (transition-topology-diff.json)
no interview / re-pair            ✓ none
no converter startup error        ✓ "Loaded external converter 'bseed_ts0726_v5.js'" clean
no Zigbee writes                  ✓ log shows zero write/set/configure traffic to target
```

Observation (read-only, no gate impact): `switch_left/right_action_mode` reads
now return device-side values ("Match local state" / "Toggle"); earlier
NO_RESPONSE was mesh flakiness (fleet-wide ping failures all day on other
devices) — a converter swap cannot write device state, and device_config
(byte-encoded per-channel config) is unchanged.

## Transition probe against ACTUAL installed ZHC 26.90.0 — PASS (ok: true, exit 0)

```text
zhc_version                      = 26.90.0 (in-container)
definition_model                 = EC-GL86ZPCS31 (not present in ZHC core: external only)
exactly_two_fingerprints         ✓ (1.1.5-bseedv5 + 1.1.6-bseedv6, both priority 100)
no_bare_zigbee_model_fallback    ✓
matches_v5_spy                   ✓ (target resolves through transition today)
matches_v6_spy_post_ota          ✓ (1.1.6-bseedv6 will match after OTA)
fleet_matches_target_only        ✓ (1/103 non-coordinator devices)
exactly_one_custom_genBasic      ✓ (deviceAddCustomCluster total = 1)
no_custom_genOnOffSwitchCfg      ✓
```

SET-path behavior (V5 named `switchActions` max 2; 3/4 rejected pre-traffic;
unknown firmware fails closed) was runtime-validated by the supervisor
(run 33769292042 / job 100695075845) and is not re-exercised here per dispatch
("do not SET Direct-binding 3/4 while still on V5").

## Evidence (this directory, `transition/`)

```text
bridge-transition-baseline.json    pre-swap bridge snapshot (104/21)
bridge-transition-after.json       post-restart bridge snapshot
transition-topology-diff.json      deep diff: delta 0
transition-probe-result.json       ZHC 26.90.0 composition probe (ok: true)
target-baseline-identity.json      target identity (V5, IEEE, definition)
post-restart-properties.json       live property reads post-restart (0xff03 1/1/1)
post-restart-public-get.json       live public get post-restart (canonical config)
transition-restart-log.txt         non-publish log of the transition restart
bseed_ts0726_v5.pre-transition.js  backup of proven V5.1 (sha256 4940ad69…)
```

## Return

```text
V56_TRANSITION_STEP_B PASS
frontend=PASS
z2m_health=PASS
v5_identity=PASS
canonical_config=PASS
mains=1/1/1
topology_delta=0
transition_definition=PASS
evidence=<commit sha of this commit>
```

Still forbidden and not performed: OTA CHECK/UPDATE, setting writes, successful
device_config commit, bind/unbind/group mutation, interview/re-pair, coordinator
mutation, physical button presses, HA deployment. STOPPED for Supervisor.

---

# WORK UNIT 4 (2026-09-03 ~18:20–19:00Z) — dispatch 5528641047, C–G: C PASS, D PASS, E STOP at action-storage gate

Dispatch: issue #8 comment `5528641047` (supervisor) authorized C–G with the
frozen transition overlay kept installed. **No F/G writes were performed.**

## C. Rehash + OTA CHECK preflight — PASS

Staged artifacts re-verified byte-exact on host AND in-container:

```text
forward.ota  sha256 d18c420d18e1a741b8946482c8ef885b61d8ceb92a434f7bb1beddb6dd3ec79c ✓ (185858 B)
recovery.ota sha256 4a09b5221d06889f34abd5c3cf89405d42bb168810013b45f1cef64433bf1b19 ✓ (185682 B)
```

Mechanism: temp HTTP server inside the container on `127.0.0.1:8899` serving a
flat root (`/tmp/ota-canary-v6/ota-root/`) with two single-entry indexes
(`index-forward.json` = forward only, `index-recovery.json` = recovery only) and
both images. **No forward+recovery co-exposure**: each CHECK passed exactly one
index URL in the bridge request (`url` parameter, same mechanism as the proven
E2 canary); no configuration.yaml change.

```text
CHECK fwd-01 (index-forward.json):  status ok, update_available true, downgrade false,
                                    source http://127.0.0.1:8899/forward.ota
                                    index metadata: fileVersion 285356039 / 4417 / 45577, sha512 pinned
CHECK rec-01 (index-recovery.json): status ok, update_available true, downgrade false,
                                    source http://127.0.0.1:8899/recovery.ota
                                    index metadata: fileVersion 285356040 / 4417 / 45577
CHECK fwd-02 (index-forward.json):  status ok, source http://127.0.0.1:8899/forward.ota (exact repeat)
```

All three CHECKs selected the exact expected image. Recovery never active beyond
its single CHECK. Server left running but inert.

## D. ONE target-only forward OTA — PASS

```text
tx = d-gate-update-fwd-01, UPDATE only 0xa4c13843a9d40f85 via forward index
transfer: 1191 s, zh:controller:ota progress 5% → 100%, no retries visible
response: status ok,
  from: softwareBuildID 1.1.5-bseedv5, fileVersion 285356037
  to:   softwareBuildID 1.1.6-bseedv6, fileVersion 285356039, dateCode 20260903
Z2M performed its automatic post-update re-interview at 18:42:12 (inherent to the
Z2M OTA flow, same as the E2 canary; not a user-triggered interview/re-pair).
No other setting write occurred during OTA.
```

## E. Immediate read-only V6 gate — identity/hardware/service PASS; action storage DEVIATION → STOP

### Identity — PASS

```text
software_build_id = 1.1.6-bseedv6 (live in bridge/devices post-announce)
date_code         = 20260903
definition        = EC-GL86ZPCS31, source external, 48 exposes (auto-rematched, no restart)
separate v6 file  = NOT present (external_converters: v4 + transition v5 file only)
104 devices / 21 groups; interview_completed; interviewing false; permit_join false
```

### Hardware — PASS

```text
device_config = iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M; (canonical, live read)
EP4/EP5/EP6 genOnOff 0xff03 = 1/1/1  (relay_*_physical_mode "Always on" ×3, live)
LED source EP4/EP5/EP6 0xff01 = 4/4/3 ("Binding status"/"Binding status"/"Physical output") — exact match
```

### Topology/service — PASS

Deep diff pre-V6 vs post-V6 snapshot: `ieee_set_delta=[]`, `groups_delta=[]`,
`changed=[target only]`, target delta = identity only; EP1–EP6 bindings,
configured_reportings and clusters byte-identical. Frontend + Z2M healthy.

### Standards-clean action storage — DEVIATION → recorded, STOP

Read-only constraint: on V6 firmware the transition overlay's only public
property touching direct-binding state is `switch_*_action_mode`, whose GET
reads **custom 0xff06** (V6 transport). No public property GETs standard
genOnOffSwitchCfg 0x0010 on V6 (legacy endpoint-scoped raw reads are disabled
on this modern Z2M build), so standard 0x0010 could not be re-proven
non-mutatingly; last hard-proven state = 2/2/2 (supervisor-confirmed); no write
path was exercised.

Exact recorded raw values (custom 0xff06, EP1/EP2/EP3, live reads):

```text
expected (dispatch E): 2 / 2 / 2
read (live):           3 / 3 / 2   ("Match local state"/"Match local state"/"Toggle")
```

Per dispatch E: identity/mains/config/service all PASS, action values differ →
"do not immediately recover merely for an action/UX mismatch; record exact raw
values; STOP for Supervisor." Note the values coincide exactly with the F target
policy (3/3/2), consistent with V6 firmware seeding the custom attribute from
prior direct-binding state; the decision belongs to the Supervisor.

## Evidence (this directory, `transition/`)

```text
bridge-post-v6.json          post-OTA bridge snapshot (104/21, V6 identity)
v6-identity.json             extracted post-OTA target identity
post-v6-topology-diff.json   deep diff pre-V6 vs post-V6 (delta: target identity only)
post-v6-properties.json      live action/binded/physical reads post-OTA (raw 0xff06 = 3/3/2)
post-v6-public-get.json      live full public GET post-OTA (canonical config, LED 4/4/3)
post-v6-log-excerpt.txt      OTA success + auto re-interview log lines
```

## Stop

STOPPED for Supervisor per dispatch E action-storage clause. F (policy SET) and
G (editor/UX) NOT started — no SET of any kind has been issued post-OTA. The
device is live on `1.1.6-bseedv6` with canonical config, mains 1/1/1, LED 4/4/3,
and untouched topology. Recovery artifacts remain staged but were never used.

---

# WORK UNIT 5 (2026-09-03 ~21:04–22:10Z) — dispatch 5530544532: hardened transition A–D; E return with mesh-outage disclosure

Supervisor accepted WU4 (`0xff06=3/3/2` = valid migration) and ordered: install
hardened transition `7d649cba…` / blob `ed8ee78f…`, prove standard ABI via
endpoint-scoped `/set` reads, prove the hardened public binding path, finish the
editor/UX gate, then return.

## Environment change (operator action, outside this ledger)

Between WU4 and this work unit the operator again replaced the container:
`app_local_zigbee2mqtt-p007` → **official `ghcr.io/zigbee2mqtt/zigbee2mqtt-aarch64:2.14.0-1`**
(`app_45df7312_zigbee2mqtt`, started ~20:48Z). `/config` shared; converters were
exactly the WU3 state (v4 + WU3 transition, sha256 `9b34e772…`). Note: this build
bundles **ZHC 26.103.0** (not the pinned 26.90.0) — disclosed for the record; the
transition converter loaded and matched correctly under it. Fleet changed
104 → 103 → 102 devices (two operator-side departures, the last at 21:31:26Z);
target unaffected throughout.

## A. Hardened transition installed on live V6 — PASS

```text
backup of WU3 transition: backup-transition/bseed_ts0726_v5.wu3-transition.js (9b34e772…)
staged in place: /config/zigbee2mqtt/external_converters/bseed_ts0726_v5.js
  on-disk sha256 = a2a404974dcc3998a05b3862bfe2714aea197e0cf843eb03c191dee07a30fa92 (blob ed8ee78f… verified)
ONE restart 21:04Z: Started frontend on port 8099 ✓, converter loaded clean ✓
identity: 1.1.6-bseedv6 / 20260903, EC-GL86ZPCS31 external, 48 exposes ✓
device_config canonical ✓, mains 1/1/1 ✓
topology delta 0: 103→103, ieee_set_delta=[], changed=[], groups_delta=[] ✓
no separate V6 converter ✓
```

## B. Standard ABI proof — PASS

Endpoint-scoped generic reads through `zigbee2mqtt/LivingRoomMainDimmer/set`
(`read_switch_left/middle/right` → genOnOffSwitchCfg attr 16, state_property
`abi_switchactions_*`; Z2M publishes results as `abi_switchactions_<prop>_<endpoint>`):

```text
standard 0x0010 = 2 / 2 / 2   ({"switchActions": 2} ×3, live reads 21:09 + re-proven 21:25/21:26/21:27)
custom   0xff06 = 3 / 3 / 2   (public GET: Match local state / Match local state / Toggle)
```

## C. Hardened public binding path — PASS (no physical press)

- Public GET: LEFT=Match local state, MIDDLE=Match local state, RIGHT=Toggle ✓
- Fresh-identity evidence: the hardened converter performs a live EP1 genBasic
  `swBuildId` read with 30 s timeout **fail-closed** before any action-cluster
  access (converter source lines 308–311); every action GET/SET succeeded, which
  is reachable only through a successful fresh `swBuildId=1.1.6-bseedv6` read.
  Later, during the mesh outage, the converter demonstrably refused action access
  with "Direct-binding command cannot verify firmware identity" — live proof the
  gate is active.
- Idempotent public SET Match/Match/Toggle → re-proved raw custom 3/3/2 AND
  standard 2/2/2 ✓ (`binding-policy-set.json`)
- ONE controlled Z2M restart → fresh re-read: identity V6 ✓, custom 3/3/2 ✓,
  standard 2/2/2 ✓. (Restart is not claimed as a device power-cycle proof.)

## D. Software / UX gate — PASS

- Fresh Hardware configuration GET displays the exact canonical string
  (`device_config` live read + rendered in the WindFront editor field) ✓
- Protected editor (Playwright desktop, evidence in `ux/`):
  - editor field located with canonical value; no Save control rendered while
    locked (the UI offers no write path at all) ✓
  - `enable_editing` clicked — zero Zigbee traffic ✓
  - waited 70 s (> 60 s expiry) ✓
  - editor value unchanged = canonical ✓; zero device_config traffic; no
    successful config commit ✓
- Desktop + mobile WindFront captures: `ux/desktop-*.png`, `ux/mobile-*.png`,
  page text dumps, `browser-metadata.json`, `editor-gate-metadata.json` (zero
  page errors, zero console errors)
- Final pre-operator profile (live-read and rendered):
  LEFT/MIDDLE: Mains=Always on, LED=Binding status, Direct-binding=Match local
  state, Update local=Short press, Control bound=Short press, channel=Left/Middle;
  RIGHT: Mains=Always on, LED=Physical output, Direct-binding=Toggle, Update
  local=Short press, channel=Right. RIGHT hard-power NOT activated ✓

## Disclosure: mesh transport outage at close-out (~21:33Z onward)

After gate D, the coordinator↔target radio route degraded
(`ROUTE_ERROR_SOURCE_ROUTE_FAILURE` for NWK 24677; fleet-wide route errors all
day); fresh re-reads of the already-proven values now time out. Availability
still reports `online`; the target remains in the bridge with identity/config/
topology unchanged (final snapshot). All required values were live-proven in the
21:04–21:31 window with committed evidence. No recovery was performed (not
safety-critical: mains/config/identity proven, device mains-powered). Two failed
external SETs during the editor window (`multi_press_reset_count`→30, attr
65282 — not executor-issued, timed out before reaching the device) are documented
in `editor-window-target-log.txt`.

## Return

```text
V6_SOFTWARE_LIVE PASS
transition_overlay=PASS (hardened 7d649cba / ed8ee78f live)
forward_preflight=PASS (WU4)
recovery_preflight=PASS (WU4)
v6_identity=PASS (1.1.6-bseedv6 / 285356039)
mains_safety=1/1/1
standard_actions=2/2/2
custom_binding=3/3/2
topology_delta=0
device_config_get=PASS
advanced_lock=PASS
desktop_ux=PASS
mobile_ux=PASS
READY_FOR_V6_OPERATOR
evidence=<commit sha of this commit>
```

Environment note: live add-on is now official Z2M 2.14.0-1 with ZHC 26.103.0;
the hardened transition (validated against ZHC 26.90.0 + WindFront 2.14.0)
loaded and passed all gates under it. Host-side relay on port 18099
(LAN→WindFront) was used for browser evidence and can be torn down with
`pkill -f relay.py` on the host.

Still forbidden and not performed: another forward OTA, recovery OTA, physical
button presses, RIGHT Mains = Follow logical state, successful unlocked
device_config commit, bind/unbind/group mutation, manual raw writes, manual
interview/re-pair, coordinator mutation, HA v2 deployment.

**STOPPED for Supervisor — READY_FOR_V6_OPERATOR.**




