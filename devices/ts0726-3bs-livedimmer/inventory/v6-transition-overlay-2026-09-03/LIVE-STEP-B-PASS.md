# V5→V6 TRANSITION LIVE STEP-B PASS — 2026-09-03

Executor issue return:
- comment 5528009509
- branch executor/ts0726-v6-software-live-2026-09-03
- commit 50a6f49d66b28c1662f3758bc53db653d77f18ef

Supervisor verdict:
V56_TRANSITION_STEP_B PASS

Validated live:
- frontend PASS (Started frontend on port 8099, HTTP 200);
- Z2M health PASS;
- target remains 1.1.5-bseedv5;
- canonical device_config PASS;
- EP4/EP5/EP6 mains remain Always on / raw policy 1/1/1;
- transition definition resolves target as EC-GL86ZPCS31;
- transition file Git blob ae48e23a974244923ab3a27a69a7e5341c920eb4;
- transition live SHA256 9b34e77292a9a7e0776a0bf68865e764533a057b484b2f006daf0bfea17e9093;
- no separate bseed_ts0726_v6.js present;
- topology delta zero for IEEE set, groups, target bindings and configured_reporting;
- no interview/re-pair;
- zero Zigbee writes to target during Step-B replacement/restart;
- actual installed ZHC 26.90.0 transition composition probe PASS.

Important correction to executor prose:
The durable JSON evidence does NOT show LEFT fresh Match local state readback.
post-restart-public-get.json and post-restart-properties.json both record:
- LEFT action = NO_RESPONSE
- MIDDLE action = NO_RESPONSE
- RIGHT action = Toggle

Therefore there is no evidence of an unexplained action-mode mutation before OTA.

Frozen software/artifacts remain:
- V6 firmware source 182c0195a8bb781abd7c4f1e2508278079b7b119
- forward identity 1.1.6-bseedv6 / 285356039
- forward.ota SHA256 d18c420d18e1a741b8946482c8ef885b61d8ceb92a434f7bb1beddb6dd3ec79c
- recovery identity 1.1.5-bseedv5 / 285356040
- recovery.ota SHA256 4a09b5221d06889f34abd5c3cf89405d42bb168810013b45f1cef64433bf1b19
- transition overlay source 833b117388b3a324b71e12963e277a342c4c49da
- transition overlay blob ae48e23a974244923ab3a27a69a7e5341c920eb4

Next allowed phase is target-only OTA preflight + one V6 canary, then read-only safety gate,
then custom 0xff06 software proof. Physical acceptance and HA deployment remain blocked.