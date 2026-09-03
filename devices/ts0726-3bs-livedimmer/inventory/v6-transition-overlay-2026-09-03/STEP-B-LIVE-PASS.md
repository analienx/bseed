# V56 TRANSITION STEP-B LIVE PASS — 2026-09-03

Executor return:
- issue comment 5528009509
- branch executor/ts0726-v6-software-live-2026-09-03
- commit 50a6f49d66b28c1662f3758bc53db653d77f18ef

Verdict:
V56_TRANSITION_STEP_B PASS

Live proof:
- frontend PASS: Started frontend on port 8099 + HTTP 200
- Z2M health PASS
- target remains 1.1.5-bseedv5 / IEEE 0xa4c13843a9d40f85
- canonical device_config PASS
- EP4/EP5/EP6 mains Always on = 1/1/1
- transition definition selected
- actual installed ZHC 26.90.0 probe PASS
- exactly two frozen V5/V6 fingerprints
- exactly one custom genBasic registration
- zero custom genOnOffSwitchCfg registration
- fleet match isolation PASS
- IEEE/group/binding/configured-reporting topology delta = 0
- no interview/re-pair
- no Zigbee writes during Step B

Transition overlay left live:
- source commit 833b117388b3a324b71e12963e277a342c4c49da
- git blob ae48e23a974244923ab3a27a69a7e5341c920eb4
- local SHA256 9b34e77292a9a7e0776a0bf68865e764533a057b484b2f006daf0bfea17e9093

Proven V5.1 backup retained outside external_converters:
- SHA256 4940ad694de9c61e9afbdd529f59ffcf02edf3dc707979301dfc7a73068e5bda

Raw/public read clarification:
- post-restart evidence has LEFT action = NO_RESPONSE
- MIDDLE action = NO_RESPONSE
- RIGHT action = Toggle
The prose observation claiming LEFT returned Match local state is not used as a release invariant.

Post-OTA migration correction:
The V6 firmware intentionally initializes the new custom binding-command NVM from the legacy
standard action value when the custom NVM slot is absent. Therefore immediate post-OTA custom
0xff06 is NOT required to be exactly 2/2/2. Valid migrated values are 0..4.

Immediate post-OTA invariant:
- standard switchActions 0x0010 must be within 0..2 on every EP1/2/3
- custom binding mode 0xff06 must be within 0..4 on every EP1/2/3
- no safety/topology regression
- V6 softwareBuildID/fileVersion must be visible before any extended SET is attempted

Final intentional configuration gate:
- LEFT 0xff06 = 3
- MIDDLE 0xff06 = 3
- RIGHT 0xff06 = 2
- standard 0x0010 stays within 0..2 and must never expose 3/4

The final product target and all physical/HA prohibitions remain unchanged.
