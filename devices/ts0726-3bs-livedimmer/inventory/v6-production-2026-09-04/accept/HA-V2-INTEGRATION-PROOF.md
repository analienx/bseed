# HA v2 integration onto current main — proof (Supervisor audit #5)

Supersedes deploying `supervisor/ts0726-post-migration-ha-v2 @ 9472e5b` as a tree checkout,
per `5549663848` item 5.

## Method
- Isolated `git worktree` at `../ha-stack-wt-ha-v2-integration` (main user checkout untouched,
  it had unrelated in-flight work on `fix/manual-on-detection` — deliberately not disturbed).
- New branch `integration/ts0726-ha-v2-on-main-2026-09-05` created from `origin/main` @ `bf41dc3`.
- Divergence confirmed as audited: merge-base `201123d`, v2-unique = 16, main-unique = 3, and
  **zero file overlap** (v2: workflow/automations/scripts/test_main_dimmer_v5 — main: rodret_diag
  + its test).
- Ported final state of exactly the 4 BSEED files: `git checkout 9472e5b -- <4 files>`;
  `git diff 9472e5b -- <4 files>` => **EMPTY (byte-identical)**.
- Commit **`76bbecd`** (single child of `bf41dc3`; `git rev-parse HEAD~1 == origin/main` proven).
- **Local only — not pushed, not deployed** (deploy is post-acceptance per audit).

## Validation runs
| Check | Result |
|---|---|
| `python -m unittest discover -s tools/tests -v` | **40/40 OK** incl. all 5 `test_main_dimmer_v5` contract tests AND the 3 `test_rodret_diag` (main-only work preserved & still green) |
| Real HA `check_config` (docker `home-assistant:2026.8.3`, disposable tree per CI recipe) | **exit 0, no `Failed config`** |
| Negative control (same tree + one corrupt line appended) | **exit 1, `Failed config`** — harness is real, not a silent pass |

## Scope greps on resulting automations/scripts (audit's required proof)
1. `state_relay_right` / `relay_right_binding_intent`: **0 matches** → RIGHT never reconciled.
2. `relay_*_physical_mode`: only trigger `entity_id` lists + `states(...) == '...'` fail-closed
   comparisons → **no mains-policy writes** (and the automation gates on the exact accepted
   profile: L/M `Always on`, R `Follow logical state`, L/M LED `Binding status`, R LED
   `Physical output`).
3. `device_config` / `/bind` / `/unbind` / group ops: **only prose in a description** → **no
   topology or device_config mutation**.
4. Reconcile MQTT payloads: exclusively `state_relay_left`, `state_relay_middle` + their
   `binding_intent` trackers.
5. Additional honest note: v2 `voice_circle_light_on/off` now drive
   `light.livingroomcirclelightdimmer` directly and **remove** the older main-side writes to
   `switch...relay_right` — fewer RIGHT-touching operations than current main, not more.
6. Manual finalizer script `main_dimmer_finalize_v5_indicators` is operator-gated
   (`operator_continuity_confirmed` required) and idempotently re-asserts the already-active
   LED modes (incl. RIGHT→`Physical output`, its current value); it writes no mains policy and
   no RIGHT state/intent.

## Deferred
The ported CI workflow still triggers on `push` to the *staged* branch name; when the
Supervisor accepts this integration branch, its trigger list should be widened or the branch
renamed at merge time. Flagged, not altered (files kept byte-identical to intent).
