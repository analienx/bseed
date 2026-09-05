# Bounded cleanup — retire 2 legacy relay→coordinator LevelControl bindings
Authorized by Supervisor `5550531593` (2026-09-05T08:16:50Z). Runs `unbind-legacy-level.js`.

## What was removed (ONLY these two)
```
EP4 relay_left   : genLevelCtrl -> coordinator 0xfdb1122d004b1200/1
EP5 relay_middle : genLevelCtrl -> coordinator 0xfdb1122d004b1200/1
```

## Sequence + readbacks (host CEST clock)
1. Pre-change dump `raw-logs/bindings-pre-unbind-legacy.json` → **20 bindings**.
2. Unbind EP4 → bridge response `failed:[]` (10:24:56) → readback **19**, EP4 level gone.
3. Unbind EP5 → bridge response `failed:[]` (10:24:59) → readback **18**, EP5 level gone.
4. Exact-diff (from `raw-logs/unbind-result.json`):
   - REMOVED = `["4:genLevelCtrl->0xfdb1122d004b1200/1","5:genLevelCtrl->0xfdb1122d004b1200/1"]`
   - ADDED = `[]`  → **nothing else mutated**. Resulting total **18**, every other baseline
     binding byte-unchanged (EP1/EP2 switch direct-dim →LinearDimmer/11 & →coordinator genOnOff/
     genMultistateInput, EP1→EP4 / EP2→EP5 self-binds, EP2→group25, EP3→coordinator, EP4/EP5
     genOnOff→coordinator, EP6→coordinator all intact).

## Step 5 — recurring poll pattern STOPPED
- `pt.js` scans all retained log windows: total `currentLevel` poll errors **56**, FIRST
  `2026-09-04 23:04:25`, **LAST `2026-09-05 08:42:43`** — i.e. the last occurrence is ~1h42m
  BEFORE the 10:24 unbind; **0 occurrences after**.
- Live 95 s monitor (`tail -F | grep -iE 'Failed to poll currentLevel|UNBIND'`) across
  10:29–10:33: **no events**.
- Structural certainty: `bind.js:505-553` `POLL_ON_MESSAGE` polls only endpoints that still
  hold the bound cluster; with the two genLevelCtrl binds removed, EP4/EP5 can never be re-armed
  as poll targets. Absence is therefore causal, not luck-of-traffic.
- Corollary audit: the only `UNBIND_REQUEST` frames in retained logs (23:07:28 / 23:23:20 Sep-4,
  incl. one against `buttLivingRoomLights`) come from yesterday's DEBUG window — Z2M core's own
  bind-reconfiguration churn around my restore. Today's cleanup ran at `log_level=info`, so no
  ember/ZDO frame lines are logged for it by design; its effect is instead evidenced by the
  authoritative pair of `bridge/response/device/unbind` results (`failed:[]`) + the 19/18
  readbacks. I checked for collateral topology change on OTHER devices in the window: none with
  ZDO frames today; only my two bridge-issued unbinds appear.
  Worth flagging to the Supervisor for the record: yesterday's 23:07 churn temporarily unbound
  and restored EP2→group25 `genOnOff+genLevelCtrl` (core behavior during bind reconfiguration,
  ZDO responses `SUCCESS`) — today's pre-change dump shows those bindings fully present, so no
  residue from it.

## Step 6 — LEFT/MIDDLE direct path still healthy (minimal, no re-acceptance cycle)
Same readback that proves the two removals also enumerates EP1/EP2 switch-endpoint bindings
untouched (they were never in scope). EP1 `genLevelCtrl`/`genOnOff`→LinearDimmer/11 and
`genMultistateInput`→coordinator present; EP2 same + group25. Reporting config untouched.
Live poll-triggered `action` republish at 10:25:35 (state publish) confirms the device is
reporting normally post-cleanup. No button re-press required; this is not an acceptance re-run.

## Accepted topology is now 18 bindings (was historical 20)
The two retired EP4/EP5 `genLevelCtrl→coordinator` entries were legacy artifacts: the relay
endpoints advertise genLevelCtrl but do not implement `currentLevel`, so the binding only armed
Z2M core polling against an attribute that always returns `UNSUPPORTED_ATTRIBUTE`. Zero
functional benefit; pure recurring error noise. Retiring them is the correct steady state.
Recorded in STATUS.md.

## V7 status unchanged
This is a topology correction of restored legacy entries. It does **not** reopen or affect V7
firmware acceptance (V7 remains GREEN; no reflash; device firmware untouched).
