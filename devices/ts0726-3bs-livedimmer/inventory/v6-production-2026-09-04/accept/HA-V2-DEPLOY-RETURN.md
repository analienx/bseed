# EXECUTOR RETURN — HA v2 deploy executed; post-deploy proof caught a BLOCKING content defect in `76bbecd`

Authorized by `5550783700` (sequence 1–7, "deploy authorized without another supervisor round-trip").
**Steps 1–6 done. Step 7 NOT done: `#8` is not closed and STATUS is not finalized, because the
post-deploy proof is not all green.** Ruling requested at the bottom.

## 1. Authorized sequence — status

| # | Instruction | Result |
|---|---|---|
| 1 | Fix/bank stale `attr0-forensics.js` comment | **DONE** — commit `5aab10b` (pushed). Comment/text only, script logic untouched. Also banked `SUPERVISOR-RETURN-UNBIND.md`, which was left untracked at `3b596f3` (my miss). |
| 2 | Push integration branch | **DONE** — `integration/ts0726-ha-v2-on-main-2026-09-05` → `analienx/home-assistant-stack` |
| 3 | Remote HEAD `76bbecd`, sole parent `bf41dc3` | **DONE** — `ls-remote` + `git cat-file`: HEAD `76bbecd10df0b57a0e694cba06f88cc473d93a91`, `parent bf41dc3b71f7ae77cdb61b6516a1f318626895c1`, no other parent |
| 4 | Re-check main immediately before deploy | **DONE** — re-read at activation time: main still `bf41dc3` → deployed without round-trip |
| 5 | Deploy only the reviewed effective change + real validation immediately before activation | **DONE, with one deviation you need to see** (§2–§3) |
| 6 | Bank post-deploy proof | **DONE** — §4. **One item FAILS** — §5 |
| 7 | STATUS/ledger + close #8 | **NOT DONE** — blocked on §5 |

## 2. Why I did NOT copy the repo files onto live (deviation, in-place evidence)

`home-assistant/` is **not** a faithful mirror of live `/config`, contrary to README line 26.
Measured before touching anything:

```
live  /config/automations.yaml sha256 13e081e4fc1e5c6944b3d9550a217fb61d0b642041f99bbf1dd51d6ba61c0228 (2593 lines)
main  bf41dc3 automations.yaml sha256 7f193c89923fc35cfaac50086f6b219fe500d4c7598dacc83ea9ccd931eca673 (2305 lines)
live  /config/scripts.yaml     sha256 dfed8acc79b23dea1a25e2e96d88c71b82fc8470c5799b993072e6aed5481980 (CRLF, 785 lines)
main  bf41dc3 scripts.yaml     sha256 450b1abc8c4522c0f0627d8b66152fd0ccfb4af7bfef72b351d2b3526330c78f (LF)
```

Parsed, the drift is bidirectional and would have been destructive:

* in repo main but **not** live (a naive copy would have ADDED, unreviewed):
  `ButtLivingRoomTableLetRouter: Single=Router On, Double=Router Off`, `buttBedroomWarmth – Cycle color temperature`,
  `buttBedroomWarmth: Cycle detailed color temperature`, `Zigbee2MQTT - Coordinator Radio Heartbeat`
* in live but **not** repo main (a naive copy would have DELETED):
  `Manual-On Detection - Startup Coordinator`, `Autodestruct countdown expired - run night shutdown stub`,
  `Any integration needs re-authentication - notify`
* live `scripts.yaml` also carries newer, un-banked work: the `#3 correction 5381189810` circle-inclusion
  edits in `voice_livingroom_lights_on/off` and `voice_all_lights_on/off`.

`git merge-file` was useless here (live is the UI-reserialized form of the same content — single quotes,
2-space sequences, CRLF in scripts) — it produced whole-file conflict regions. So I applied the reviewed
delta at **YAML-entry granularity** with a semantic gate (`verify_gate.py` → `build_patch.py`):

* required live's copy of each entry being rewritten to be **semantically identical** to merge-base `bf41dc3`
  (asserted: ON block ✓, OFF block ✓, `voice_circle_light_on` ✓, `voice_circle_light_off` ✓);
* substituted the **byte-exact reviewed `76bbecd` block text**;
* asserted the result changed **nothing else**: automations `56→55`, removed = exactly the 2 legacy
  "Swapped Output Sync" entries, added = exactly `LR - MainDimmer v5 Target State Reconciliation`,
  other 54 entries semantically untouched; scripts: 31 other scripts untouched, finalize added;
* asserted zero `state_relay_right` and no `switch.livingroommaindimmer_relay_right` action anywhere.

## 3. Deploy + activation record (host CEST; HA core logs the same clock)

```
backup  /config/automations.yaml.pre-hav2-20260905 sha256 13e081e4...  (== pre-change live)
backup  /config/scripts.yaml.pre-hav2-20260905     sha256 dfed8acc...  (== pre-change live)
install /config/automations.yaml sha256 c2457fd0b76ea47e43f2241d613c9301895f498b78dbd7fc138844f5ac959f23
install /config/scripts.yaml     sha256 79a75fa1fe059ed116cec5a9e564eb48b50cc59fe4e801f1097bd77b747457cb
ha core check  (baseline, before any change) -> Command completed successfully.
ha core check  (after install, immediately before activation) -> Command completed successfully.
activation ~11:41-11:42  -> POST automation/reload [] ; POST script/reload []   (supervisor REST proxy,
                              no HA token used, NO core restart)
```

Entity-id behaviour worth recording: HA keeps the persisted `entity_id` and only the friendly name
follows the alias. The v5 automation therefore runs as
`automation.lr_livingroommaindimmer_indicator_sync_on`, `state: on`,
`friendly_name: "LR - MainDimmer v5 Target State Reconciliation"`, `last_triggered` unchanged
(`2026-09-05T06:42:37Z` = 08:42 CEST, from the **old** entry — i.e. the v5 path has not fired yet).
Its sibling `automation.lr_livingroommaindimmer_indicator_sync_off` is now `unavailable` (orphaned
registry entry from the deleted OFF automation). I did **not** prune the orphan — that is a
`.storage` write and nobody authorized it.

## 4. Post-deploy proof — the parts that PASS

| Required proof | Result |
|---|---|
| HA healthy | `state RUNNING`, `safe_mode false`, v2026.8.3; container log window shows only unrelated ipp/brother printer retries |
| Zero RIGHT reconciliation | `grep -c state_relay_right` → **0** in both loaded files; no `switch...relay_right` action anywhere (asserted pre-deploy too) |
| Zero topology mutation | live bindings = **18**, **exact set match** vs accepted readback `readback_after_ep5` (`cmp_bindings.py`, `missing=[] extra=[]`); dump `raw-logs/bnd-post-hav2.txt` |
| Zero mains-policy / device_config mutation | `0xff00=1/1/1`, `0xff05=3/3/0`, `0xff06=3/3/2` re-read post-deploy; `physical_mode` L/M=`Always on`, R=`Follow logical state`; `indicator_mode` L/M=`Binding status`, R=`Physical output`; EP4=0 EP5=0 EP6=1 (RIGHT resting ON = operator-accepted). `raw-logs/device-readback-and-refcheck.txt` |
| V7 / fileVersion unchanged | `update.livingroommaindimmer`: `installed_version 285356041`, `latest_version 285356041`, state `off` (no OTA pending) |
| Retired poll pattern not recurring | still **56** total, `FIRST 2026-09-04 23:04:25`, `LAST 2026-09-05 08:42:43`, **0 after the 10:24:59 unbind** — re-scanned at 11:46, ~3 h after cleanup and after the HA deploy |
| Z2M healthy | `running / healthy`, uptime since 04:17Z (the morning host restart) |
| Device definition | still `EC-GL86ZPCS31`, nwk 17007, IEEE `0xa4c13843a9d40f85` |

## 5. BLOCKER — `76bbecd` references entity ids that do not exist on this device's V7 surface

The reconcile automation and the finalize script address
`select.livingroommaindimmer_relay_{left,middle,right}_indicator_mode_relay_{left,middle,right}`
(suffixed). Live exposes them **without** the trailing postfix:

```
select.livingroommaindimmer_relay_left_indicator_mode_relay_left   -> {"message":"Entity not found."}
select.livingroommaindimmer_relay_left_indicator_mode              -> state "Binding status"   (exists)
```

15 references to 3 nonexistent entities: `home-assistant/automations.yaml` 6 (repo `76bbecd` lines
2042-2044, 2059-2061), `home-assistant/scripts.yaml` 9 (lines 818-820, 843-844, 849, 854-856).
Note the asymmetry is real, not my error: `..._relay_left_binding_intent_relay_left` **does** exist
with the postfix, `..._physical_mode` **does not** — so this is per-expose naming in the installed
converter, and the V7 rename is what the staged content missed.

Consequences on live **right now**:

* `conditions` gate 2 evaluates `states(missing) == 'Binding status'` → `'unknown'` → **False**, so the
  v5 reconcile automation is **permanently fail-closed** — it can never publish LEFT/MIDDLE correction;
  its `indicator_ready` trigger watches entities that don't exist, so that path is dead too.
* `main_dimmer_finalize_v5_indicators` is inert: its "Required v5 LED choices are available" condition
  reads `state_attr(missing,'options')` → `[]` → aborts fail-closed (and its `select.select_option`
  targets would error if reached).
* Because the deploy also **removed** the two legacy "Swapped Output Sync" automations, the practical
  steady state is: **nothing in HA maintains LEFT/MIDDLE tracked/binding-intent sync any more.** The
  panel LEDs for LEFT/MIDDLE will drift from their bound lights' real state. Cosmetic, but it is a
  regression introduced by this deploy, and I am not going to characterize it as otherwise.
* The reviewed parts that work: circle voice scripts no longer touch RIGHT (verified in loaded files),
  no device or topology write happened, no unintended automation was added or removed (54 others intact).

Why the gate missed it: `tools/tests/test_main_dimmer_v5.py` lines 26-28 assert the **literal wrong
strings** (`relay_left_indicator_mode_relay_left') == 'Binding status'`), so the contract test
validated the file against itself. `ha core check` cannot catch it either — HA does not validate that
referenced entity ids exist. My local proof (`HA-V2-INTEGRATION-PROOF.md`) therefore proved scope,
not existence; live entity-resolution is the only surface that catches this, which is exactly the
step that just caught it.

## 6. Correction (ready to execute, needs your ruling)

Mechanical: drop the postfix in those 15 places (3 ids), and change test lines 26-28 to the real ids,
then re-run the repo's own `python -m unittest discover -s tools/tests -v` (expect 40/40), `ha core
check`, re-apply the same entry-granularity substitution to live, reload, and re-run this proof
battery including a **entity-resolution gate** (the `refcheck` step now in the toolset) so this class
of defect can never pass review again. New commit child of `76bbecd` (branch stays on `bf41dc3`),
no history rewrite.

**Option A — fix forward** (recommended): I execute the above; ~1 commit + 1 re-deploy + 1 reload;
live returns to reviewed intent with LEFT/MIDDLE sync actually functioning.
**Option B — roll back now**: restore `/config/*.pre-hav2-20260905` (one `docker cp` each) + reload,
returning to legacy "Swapped Output Sync" behaviour until the content is corrected.

Both are single-step and reversible; the in-place backups are already banked with verified digests.

## 7. What I deliberately did NOT do

No device write from the HA path (I did not force `automation.trigger` — it would publish
`state_relay_left/middle`, and with `trigger.id` absent it would prove nothing anyway); no firmware,
binding, group, reporting or `device_config` action; no 0xff03 probe; no orphan-entity-registry prune;
no PR opened against `main` (branch pushed only, merge/trigger-widening is yours); `#8` left open;
STATUS not finalized. Tools + raw outputs banked alongside this note (`deploy.sh`, `activate.sh`,
`post_proof2.sh`, `refcheck.sh`, `build_patch.py`, `verify_gate.py`, `extract_refs.py`,
`cmp_bindings.py`, `raw-logs/*`). In `raw-logs/device-readback-and-refcheck.txt` the three
`MISSING light.turn_on|light.turn_off|select.select_option` lines are my regex catching **service**
names, not entities — only the three `*_indicator_mode_*` lines are genuine.

---

# ADDENDUM — Option A executed after ruling `5551014414` thread: correction deployed, all gates green

## A1. Content correction

Commit **`3c003bc`** = child of `76bbecd` (chain `bf41dc3` → `76bbecd` → `3c003bc`), pushed to
`integration/ts0726-ha-v2-on-main-2026-09-05`. 15 references corrected (automations ×6, scripts ×9);
`physical_mode` and `..._binding_intent_relay_<x>` ids left untouched — both verified present live.

`tools/tests/test_main_dimmer_v5.py` corrected in lockstep (3 literals). **The test's sensitivity is
now demonstrated, not assumed:** applying only the YAML fix produced `FAILED (failures=1)` on
`test_reconciliation_is_fail_closed_on_final_mains_and_led_profile`, and only after the test literals
were corrected did the suite return `Ran 40 tests ... OK`. The test had previously been validating the
file against its own wrong strings; it now asserts the ids that actually exist on the device surface.

## A2. Redeploy record

```
diff vs first install = exactly the 15 id lines, nothing else (git diff --no-index, see raw-logs/*)
backup /config/automations.yaml.pre-hav2r2-20260905 sha256 c2457fd0...  (defective first install)
backup /config/scripts.yaml.pre-hav2r2-20260905     sha256 79a75fa1...
install /config/automations.yaml                    sha256 e1cb0e8ea02e45354dcc9ed4e2756d05b687ac31707b32bb86297c8d3b65aaf3
install /config/scripts.yaml                        sha256 cf4c3af78d5fa02d1d46c20ff8242a5b9da3f7cb09b9975de00572467634686c
stale-id scan on loaded files: automations.yaml:0  scripts.yaml:0
parsed: 55 automation entries | 34 script keys | indicator ids resolved to the unsuffixed V7 form
        | 'state_relay_right' present: False
ha core check (after install, immediately before activation) -> Command completed successfully.
remote main re-checked immediately before activation          -> bf41dc3b71f7... (unchanged)
activation -> POST automation/reload [] ; POST script/reload []  (no core restart, ~12:05-12:07 CEST)
```

## A3. Post-activation proof (all green)

| Required proof | Result |
|---|---|
| Entity resolution gate (new, permanent) | **9/9 real entity references resolve live.** `select...relay_{left,middle}_indicator_mode` = `Binding status`, `..._right_indicator_mode` = `Physical output`, all three `physical_mode` = accepted values, both tracked lights + circle present. (`refcheck.sh`; the 3 `MISSING` lines are service names caught by my regex, not entities.) This gate is what §5's defect needed, and it is now part of the deploy procedure. |
| Gate satisfiable by substitution | gate1 = `Always on ∧ Always on ∧ Follow logical state` over three entities confirmed resolving with exactly those values → True; gate2 likewise. So the automation is **no longer permanently fail-closed**; `state: on`, enabled. |
| Zero device write | HA `last_triggered` unchanged at `2026-09-05T06:42:37Z` (pre-deploy legacy run) → neither reconcile run has fired; both tracked lights `off` and untransitioned in the window. Final device readback `10:13:59Z`: `0xff00=1/1/1`, `0xff05=3/3/0`, `0xff06=3/3/2`, EP4=0, EP5=0, EP6=1 — byte-identical to the pre-deploy reads. |
| Binding count / set | **18, exact set match** vs `readback_after_ep5` (`missing=[] extra=[]`) after activation. |
| V7 / fileVersion | `installed_version=285356041`, `latest=285356041`, update `off`; definition `EC-GL86ZPCS31`, nwk 17007. |
| Retired poll pattern | `56` total, `LAST 08:42:43`, **0 after the 10:24:59 unbind** — re-scanned 12:14 CEST, ~1 h after the HA activation. |
| HA + Z2M health | HA `RUNNING`, `safe_mode false`; Z2M `running / healthy`. |

**Evidence caveat worth carrying forward (control-tested):** at `log_level=info` Z2M does **not** log
inbound `.../set` traffic — the `Received MQTT message on 'zigbee2mqtt/.../set'` lines exist only in
the Sep-4 *debug* windows, and today's info windows show zero such lines even though HA's own
`last_triggered=08:42:37` proves a write occurred this morning. So "absence of set log lines" is **not**
evidence of absence of writes; only readback comparison and `last_triggered` are. (`raw-logs/setcheck`
output in `final-proof-device-and-refs.txt`.)

## A4. Not done / open

* First natural LEFT/MIDDLE transition has not occurred yet, so the very first v5 publish is unobserved
  by design (forcing it writes to the device and, with `trigger.id` absent, proves nothing). It will be
  visible in `last_triggered` + the automation trace whenever the operator next changes the Linear
  dimmer or the kitchen-bulb group.
* Orphaned registry entry `automation.lr_livingroommaindimmer_indicator_sync_off` (`unavailable`,
  friendly name still the deleted legacy alias) left in place — pruning it is a `.storage` write nobody
  authorized. Cosmetic only; it cannot execute.
* Repo `home-assistant/` vs live `/config` drift (§2) is **still unresolved** and is a separate defect
  in the repo's stated invariant: 4 automations in repo-not-live, 3 in live-not-repo (including the
  un-banked `#3 correction 5381189810` scripts work). Reconciling that is a supervisor-level scope call
  — my deploy deliberately did not touch it.
* The `main_dimmer_finalize_v5_indicators` script is now addressable but remains **operator-run**: it
  writes LED indicator modes and requires `operator_continuity_confirmed`. I did not run it.
