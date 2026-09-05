# LEFT + RIGHT acceptance tail — MQTT observer capture (Supervisor audit #3)

Method: bounded MQTT observer (`left-capture.js`, NO log_level change, NO device mutation),
window ~06:41:24–06:51 UTC 2026-09-05, recording LivingRoomMainDimmer + LivingRoomLinearDimmer
topics. This is the "bounded observation" the audit required, upgraded from MIDDLE's capture
because it also records the bound **target's** response. Raw: `raw-logs/left-events.jsonl`.

## Timeline (UTC, condensed)

LEFT short press
- 06:42:36.048 action switch_0_press
- 06:42:36.098 action switch_0_on
- 06:42:36.270 action switch_0_release
- 06:42:37.211 LINEAR state brightness=68   <-- LinearDimmer actuated EXACTLY ONCE (single)

LEFT hold / release
- 06:42:37.626 action switch_0_press
- 06:42:38.223 action switch_0_brightness_move_up   <-- Move while held
- 06:42:38.314 action switch_0_long_press
- 06:42:39.645 LINEAR state brightness=114          <-- target climbing
- 06:42:42.663 LINEAR state brightness=203
- 06:42:41.556 action switch_0_brightness_stop      <-- Stop on release
- 06:42:41.668 action switch_0_release

RIGHT (binded_mode=0 / disabled) — two presses
- 06:42:43.760 action switch_2_press / 43.947 switch_2_release
- 06:42:46.140 action switch_2_press / 46.351 switch_2_release
- NO switch_2_on / _off, NO brightness_move/stop, NO bound OnOff/Level — ONLY raw multistate
  telemetry. V7 master gate holds with the coordinator bind live.

## Notes / caveats (honest)
- `state_relay_left="ON"/"OFF"` and `state_relay_middle="OFF"` SET messages at 06:42:37/42 are
  INBOUND (HA automation driving the device) — not the press path; re-confirms prior finding that
  room-light changes during bursts are HA automation, not direct binds.
- The `a_ep1_swbuild_switch_left = 1.1.6-bseedv6` value republished in cached state is a STALE
  pre-flash retain key (GET republish), NOT a live read. Authoritative build = DB
  `installed_version 285356041` / post-OTA `swBuildId 1.1.7-bseedv7`. Do not cite the 1.1.6 here.
- Direct device->device bound traffic (switch->LinearDimmer) is normally NOT observable at the
  coordinator; here the LinearDimmer's own state report (brightness) confirms the target acted,
  so the single-actuation and Move/Stop claims are backed by target-side evidence, not inferred.

## Verdict
Audit #3 satisfied for the FUNCTIONAL tail: LEFT short press = single LinearDimmer actuation;
LEFT hold = Move + Stop at target; RIGHT = multistate-only, no bound command (master gate
reconfirmed). LEFT mains policy is managed by 0xff03 which is NOT re-probed (audit #4); policy
state remains as banked (Always-on, unchanged — no 0xff03 write was ever issued).

## Resting-state discrepancy — NOT yet closed (device read is authoritative)
Post-tail battery (`raw-logs/battery-post-064536Z.json`, 2026-09-05T06:45:36Z):
- EP4 relay_left = onOff **0** ✔
- EP5 relay_middle = onOff **0** ✔
- EP6 relay_right = onOff **1** ✘ — RIGHT is resting **ON**, not OFF.

Cause: the observer caught TWO `switch_2` press/release pairs (06:42:43 and 06:42:46). Two local
toggles of a relay that started ON => net back to ON. The operator's "all three as expected"
reflects the button behavior, but the resulting resting relay state is ON. Required final
state is RIGHT logical/physical/LED **OFF**. **One additional RIGHT press (odd) is needed** to
land OFF; this file is committed with the discrepancy OPEN, not glossed.
