# Gate A — durable standard-ABI evidence RECOVERED (correction to earlier verdict)

Date: 2026-09-04. Recovered from the live Z2M 2.14.0-1 info-level log rotation
(retained WU5 windows) and the persistent device state (`state.json`).

## Retraction

The earlier Gate A conclusion in this work unit ("durable evidence does not
exist; the WU5 mechanism exists nowhere; re-probe impossible on this runtime")
was **WRONG**. It was built on (a) a sub-agent search whose token list omitted
`abi_switchactions`, and (b) my own locally-mangled `grep` of `/app/dist` that I
mistook for a clean negative. The live logs prove the opposite in plain sight.
Retracted in the same terms: **the mechanism DOES exist on this runtime**
(Z2M `set 'read'` endpoint-scoped attribute reads publishing EP-tagged
`state_property` results), and **per-EP standard `0x0010` = 2/2/2 durable
evidence DOES exist** and is committed here.

## What the logs contain

Source windows (host-local +02:00; the policy-restart of WU5 is the window
boundary at 21:13:34):

```text
/config/zigbee2mqtt/log/2026-09-03.21-04-51/log.log    21:04:51 -> 21:13:32   (pre policy-restart)
/config/zigbee2mqtt/log/2026-09-03.21-13-34/log1.log   21:13:34 -> 23:00:04   (post policy-restart)
```

### 1. Per-endpoint responses, PRE policy-restart (EP-tagged publishes)

```text
[2026-09-03 21:07:46] ... "abi_switchactions_left_switch_left":{"switchActions":2}          (first: LEFT/EP1)
[2026-09-03 21:07:57] ... +"abi_switchactions_middle_switch_middle":{"switchActions":2}     (MIDDLE/EP2)
[2026-09-03 21:08:09] ... first publish containing ALL THREE keys, each {"switchActions":2} (RIGHT/EP3 completes 2/2/2)
[2026-09-03 21:13:04] last pre-restart occurrence (left x40, middle x38, right x36 publishes)
```

Verbatim 21:08:09 line (abridged payload tail), file `.../21-04-51/log.log`:

```text
[2026-09-03 21:08:09] info: z2m:mqtt: MQTT publish: topic 'zigbee2mqtt/LivingRoomMainDimmer', payload '{"abi_switchactions_left_switch_left":{"switchActions":2},"abi_switchactions_middle_switch_middle":{"switchActions":2},"abi_switchactions_right_switch_right":{"switchActions":2},"device":{...,"networkAddress":24677,"powerSource":"Mains (single phase)","softwareBuildID":"1.1.6-bseedv6",...},"device_config":"iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;",...,"raw_ep4_onoff_physical_relay_left":{"65283":1,"onOff":0},...
```

(The same publish also carries V6 identity, canonical `device_config` and EP4
mains `65283:1` — incidental corroboration of the Gate-C fields at that time.)

### 2. ZCL read decoding = standard attribute 0x0010

```text
[2026-09-03 21:07:46] info: zhc:tz: Read result of 'genOnOffSwitchCfg': {"switchActions":2}
... 13 such lines total: 10 pre-restart (21:07:46->21:13:04),
    3 post-restart fresh reads (21:14:48, 21:14:58, 21:15:10)  <- persistence across the restart
```

`switchActions` is the ZCL standard name of genOnOffSwitchCfg attribute `0x0010`
(custom attrs decode numerically: 65280/65285/65286 — never `switchActions`).
The outage-era failed twins show the exact request the successful ones were:

```text
[2026-09-03 21:45:16] error: Publish 'set' 'read' to 'LivingRoomMainDimmer' failed:
  'Error: ZCL command 0xa4c13843a9d40f85/1 genOnOffSwitchCfg.read([16], {...}) failed
   ({"target":24677,...})'   ... 9 timeouts EP1/EP2/EP3, 21:45:16 -> 22:02:28
```

i.e. `read([16])` = attribute 0x0010, endpoint-scoped (`/1`, `/2`, `/3`).

### 3. Persistent state (as of 2026-09-04 09:2x local)

```text
/config/zigbee2mqtt/state.json (sha256 58bb340125514ff8e2715d38c717a641c880b8e13ca3c853a6c2deb7d4c7526d):
  "abi_switchactions_left_switch_left":   {"switchActions": 2},
  "abi_switchactions_middle_switch_middle":{"switchActions": 2},
  "abi_switchactions_right_switch_right": {"switchActions": 2},
```

## Reading honestly (limits)

- The three post-restart Read-result lines are not themselves EP-tagged (Z2M's
  info format); their endpoint attribution comes from the 10 s sequential
  per-EP pattern and the EP-tagged publishes they drive (213 publishes per key
  up to 21:33:28).
- The 21:13:38 EP-tagged publish is a startup state RE-publish (cache restore),
  not fresh radio traffic; fresh post-restart proof = the three 21:14:48–21:15:10
  reads.
- After 21:33:28 every re-probe timed out (outage), which is exactly what the
  committed WU5 sentinel files (`abi-standard-reads.json`,
  `final-standard-reads.json`, NO_RESPONSE x3) captured — the sentinel files
  recorded the LAST attempts, the logs hold the EARLIER successes. The
  Supervisor's skepticism was warranted; the recovery resolves it.

## Verdict

```text
GATE_A = PASS via recovery (Supervisor option 1: "recover the already-observed
read evidence from the exact Z2M log/MQTT capture ... and commit it"):
  EP1/EP2/EP3 identified: yes (publish-key endpoint tags; /1 /2 /3 in ZCL lines)
  actual genOnOffSwitchCfg 0x0010 responses 2/2/2: yes
  before policy restart: yes (21:07:46 / 21:07:57 / 21:08:09)
  after policy restart: yes (21:14:48 / 21:14:58 / 21:15:10 fresh reads)
```

Re-prove-once-routes-return remains available: the mechanism is Z2M core's
`set 'read'` + `state_property` — converter-independent, read-only, and
Gate-C-compatible on this runtime.

## Full machine-readable dump

`abi-read-lines-recovered.json` — all 275 matched lines (253 EP-tagged
publishes, 13 Read-results, 9 timeout errors) with file + line text.
