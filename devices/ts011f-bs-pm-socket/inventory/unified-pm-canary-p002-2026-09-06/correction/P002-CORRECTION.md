# P002 CORRECTION — full-scheduled-window query analysis (read-only, per ruling 5560298969)

**Classification: `P002_NO_QUERY_CONFIRMED_IN_FULL_SCHEDULED_WINDOW`**

## 1. The 12:02:24Z–13:09:06Z gap

Authoritative source (the committed 10 MB `raw/z2m/target-bounded.log` @ `0a82469` was found to cover the **first canary** window 07:41–09:42Z, not P002 — correction noted; the original source log still exists and was used instead):

- path: `/config/zigbee2mqtt/log/2026-09-05.06-17-16/log2.log` (container)
- bytes: 10,000,679 — sha256: `842fc678fa35787b9daa199afdecbcede42f2ef98f1af850a1aa46dfe50336d3`
- spans 11:43:37Z–13:59:44Z ⇒ fully covers the scheduled window 11:47:13Z–13:09:01Z

Scan of all keywords (target name, IEEE, OTA, Updating, Query Next Image, queryNextImage, image block/page, scheduled, update):

- window matches: 53 lines (bounded extract: `gap-extract.log`, 12,540 B, sha256 `49dc2eb8…0f8b`)
- **gap (12:02:24Z–13:09:01Z) matches: 34 lines — all benign**: periodic state publishes of unrelated devices (matched only via the generic `"updating":false` key), 2× `bridge/health`, and the unschedule triplet at 13:09:01Z. First gap match 12:03:34Z, last 13:09:01Z.
- whole-file counts: `Scheduled OTA update for '0xa4c138ba60b92c5f'` ×1 (11:47:13Z), `was cancelled` ×1 (13:09:01Z), **INFO `Updating 'LivingRoomSocketWifiLeft'` ×0**, `requested OTA` ×0, Query Next Image/queryNextImage ×0, Z2M restart markers ×0.

## 2. Logging visibility (Z2M 2.14.0)

| Question | Answer |
|---|---|
| Effective log level | `info` (no `log:` section in configuration.yaml; default; proven by 0 debug lines in 10 MB file) |
| Debug → MQTT `bridge/logging`? | No — `advanced.log_debug_to_mqtt_frontend` defaults `false`; EventTransport publishes only info/warning/error to `bridge/logging` |
| Would debug `Device 'X' requested OTA` have been visible to pm002.js? | **No** (debug-level, `otaUpdate.js:108`; filtered from both MQTT and file) |
| Would INFO `Updating 'X'...` have been captured? | **Yes, definitely** — published to `bridge/logging` (pm002 subscribed + matched it) and written to the file log |
| Determinism | With `scheduledOta` armed, *any* processed `commandQueryNextImageRequest` logs INFO `Updating '<name>' to latest firmware` **before** any other action; even the failure path logs that INFO first. No silent path existed: Z2M uptime monotonic 114,305 s→120,605 s (8 samples, no restart ⇒ `scheduledOta` never disarmed), device definition existed, `inProgress` concurrency requires a prior (logged) query |

Nuance recorded honestly: `pm002.js`'s `clientQueryObserved` flag alone was keyed on the debug-only string (blind), but its `imageOffered` flag keyed on the INFO `Updating` line was visible-capable and stayed false — and the authoritative file log independently confirms zero INFO `Updating` lines for the target in the entire window.

## 3. Conclusion

The evidence covers the **entire scheduled interval** through a logging path proven capable of detecting the scheduled-query transition. The deterministic INFO event is absent throughout ⇒ **no device-originated Query Next Image occurred while scheduled**. The P002 finding is confirmed for the full window, not just the 15-minute observer.

Side observation: `error: No converter available for 'update' on 'LivingRoomSocketWifiLeft'` at schedule/cancel moments — same Z2M presentation-layer converter-coverage class as the V8 dimmer canary finding.

## Hygiene

This correction adds only this small extract + JSON metadata (12.5 KB + 4 KB). No additional multi-MB runtime log committed. Lesson for `home-assistant-stack#53`: future collectors must produce bounded structured event extracts + hashes; and source-of-log identity must be verified by first/last timestamp before committing (the mislabeled bounded log here came from copying without timestamp verification).
