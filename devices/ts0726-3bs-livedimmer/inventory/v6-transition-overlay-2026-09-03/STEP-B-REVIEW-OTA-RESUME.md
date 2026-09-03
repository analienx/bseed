# SUPERVISOR REVIEW — V56 TRANSITION STEP B PASS / V6 OTA RESUME

Date: 2026-09-03

Executor return:
- issue comment 5528009509
- branch executor/ts0726-v6-software-live-2026-09-03
- commit 50a6f49d66b28c1662f3758bc53db653d77f18ef

Verdict: PASS.

Verified from committed evidence:
- frontend starts on 8099 with the single transition overlay;
- Z2M healthy;
- target remains 1.1.5-bseedv5;
- canonical device_config unchanged;
- EP4/5/6 mains remain Always on / 1/1/1;
- 104 devices / 21 groups unchanged;
- IEEE set, target bindings, configured_reportings and groups delta = 0;
- transition definition matches only the target;
- exact installed ZHC 26.90.0 probe PASS;
- exactly one custom genBasic registration;
- no custom genOnOffSwitchCfg registration;
- no OTA, settings, topology mutation, interview/re-pair, button press or HA deployment occurred.

Narrative correction:
The executor report text says a read-only observation returned LEFT "Match local state".
The committed files do not support that statement:
- post-restart-public-get.json:
  LEFT action = NO_RESPONSE
  MIDDLE action = NO_RESPONSE
  RIGHT action = Toggle
- post-restart-properties.json: same.
Therefore the narrative sentence is ignored as non-evidence.

V6 migration note:
Because V5 LEFT/MIDDLE standard action readback is currently NO_RESPONSE, the immediate post-V6 custom
0xff06 values must not be hard-coded to 2/2/2 as a safety prerequisite. V6 migration can legally
preserve an old 0..4 action into the new custom policy while normalizing standard switchActions to 2.
Post-OTA require:
- standard 0x0010 = 2/2/2;
- custom 0xff06 each in domain 0..4;
- no safety/topology regressions.
Then explicitly set LEFT/MIDDLE custom policy to 3 and RIGHT to 2, and require 3/3/2 with persistence
across one controlled Z2M restart.

Frozen artifacts remain unchanged:
Forward V6:
- sw 1.1.6-bseedv6
- fv 285356039
- manufacturer 4417
- imageType 45577
- OTA SHA256 d18c420d18e1a741b8946482c8ef885b61d8ceb92a434f7bb1beddb6dd3ec79c

Emergency recovery:
- exact proven canonical V5 source
- sw 1.1.5-bseedv5
- fv 285356040
- manufacturer 4417
- imageType 45577
- OTA SHA256 4a09b5221d06889f34abd5c3cf89405d42bb168810013b45f1cef64433bf1b19
- no MIGRATION_REVERT / no swapped pin map.

Transition overlay remains installed in place:
- source commit 833b117388b3a324b71e12963e277a342c4c49da
- blob ae48e23a974244923ab3a27a69a7e5341c920eb4
- handles both V5 and V6 identities.

Next live work unit:
C. exact forward/recovery OTA CHECK
D. one target-only forward OTA
E. immediate read-only safety gate
F. explicit custom binding policy 3/3/2 + readback + Z2M-restart persistence
G. protected-editor/UX gate, no successful config commit
H. return READY_FOR_V6_OPERATOR and STOP

Still forbidden before supervisor review:
- physical button presses
- RIGHT mains Follow logical state
- successful device_config commit
- bind/unbind/group mutation
- interview/re-pair
- coordinator mutation
- HA v2 deployment
