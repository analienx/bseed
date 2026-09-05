## EXECUTOR RETURN — cleanup `5550531593` executed exactly as scoped: 20→18, poll pattern stopped, zero collateral, resurrection risk closed from source

Steps 1–7, in order, all green. Evidence commit **`3b596f3`** (pushed).

| Step | Result |
|---|---|
| 1 Pre-change dump | `accept/raw-logs/bindings-pre-unbind-legacy.json` — **20** bindings, full enumeration |
| 2 Unbind EP4 `genLevelCtrl→coordinator/1` | bridge response `failed:[]` (10:24:56 CEST) → readback **19**, EP4 level absent |
| 3 Unbind EP5 same | `failed:[]` (10:24:59) → readback **18**, EP5 level absent |
| 4 Total 18, everything else unchanged | **Exact set-diff**: REMOVED = `{4:genLevelCtrl->0xfdb1122d004b1200/1, 5:genLevelCtrl->…/1}`, ADDED = `{}`. EP1/EP2 direct-dim binds (LinearDimmer/11, group 25), self-binds, EP3, EP4/EP5 `genOnOff→coord`, EP6, all reporting — byte-unchanged. `accept/raw-logs/unbind-result.json` |
| 5 Pattern stopped | `currentLevel` poll errors across **all** retained windows: 56 total, **last 08:42:43 CEST — ~1h42m before the unbind, 0 after**; plus live 95 s `tail -F` watch 10:29–10:33: no events. Causal, not luck: `bind.js:505-553` `POLL_ON_MESSAGE` polls only endpoints still holding the bind. Tool: `accept/poll-timeline.js` |
| 6 LEFT/MIDDLE paths remain healthy (minimal) | Same readback enumerates switch-EP bindings untouched (never in scope); device state publishing normally at 10:25:35+ post-cleanup; no re-acceptance cycle run, no button presses requested of the operator |
| 7 Committed | `accept/UNBIND-LEGACY-LEVEL-VERIFY.md` + dumps + exact responses + repro tools (`unbind-legacy-level.js`, `poll-timeline.js`, `rebind-risk.js`) |

**Durability check you didn't ask for but the old STATUS implied:** the legacy `configure()` re-adds coordinator binds" claim was **old-stack-specific**. Installed ZHC `EC-GL86ZPCS31` `configure()` binds **`genOnOff` only** (tuya.js:24077-24080/24119-24122) and the BSEED converter stack contains **zero** bind calls — so the retired genLevelCtrl entries **cannot resurrect** on restart or re-interview. Accepted-18 is stable. STATUS.md updated accordingly, with the accepted-topology-18 rationale recorded per your instruction.

**Two observations for the record** (no action taken):
1. Yesterday 23:07 CEST (debug window still open from my restore) Z2M core's bind-reconfiguration churn emitted ZDO UNBIND+rebind for `EP2→group25 genOnOff+genLevelCtrl` (`SUCCESS`) — transient during my authorized restore, final table verified intact. Noted so it isn't mistaken for collateral.
2. Device's retained-state blob now carries ~150 stale probe-key artifacts (`abbase_*`, `ck_*`, `abi_*`, incl. a stale `1.1.6` swBuildId republish) from my session reads. Harmless cache noise; a state-clear/Z2M restart would flush it — deliberately not doing either unprompted.

**Still on the hook for your go:** request (b) — deploy of HA v2 staged commit `76bbecd` (on current main `bf41dc3`, 40/40 tests, check_config verified with negative control, LEFT/MIDDLE-only scope proven; proof `accept/HA-V2-INTEGRATION-PROOF.md`). On your word: push branch → deploy → live verify → final readback battery → close #8.
