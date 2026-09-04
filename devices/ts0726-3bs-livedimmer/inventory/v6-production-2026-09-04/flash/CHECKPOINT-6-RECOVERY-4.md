# Check #6 — pre-flash target checkpoint: PASS (read-only, endpoint-scoped)

`checkpoint-pre-flash.js` (17:12–17:16Z) + `checkpoint-gapfill.js` (17:18Z).
Every state key arrived **endpoint-suffixed** (`_switch_left/middle/right`,
`_relay_left/middle/right`) — proof the reads hit the intended endpoints
(the opposite of the earlier EP1 misroute that fabricated a "revert").

| Field | Required | Read | Result |
|---|---|---|---|
| EP1/2/3 `0xff05` | 3 / 3 / 0 | 3 / 3 / 0 | ✓ |
| EP1/2/3 `0xff00` | 1 / 1 / 1 (MOMENTARY) | 1 / 1 / 1 | ✓ |
| EP1/2/3 std `0x0010` | 2 / 2 / 2 | 2 / 2 / 2 | ✓ |
| EP1/2 `0xff06` | 3 / 3 (Match local state) | 3 / 3 | ✓ |
| EP3 `0xff06` | (inert) 2=Toggle | 2 | ✓ |
| EP4/5/6 mains `0xff03` | Always on | 1 / 1 / 1 | ✓ |
| RIGHT logical `onOff` | OFF | 0 | ✓ |
| RIGHT LED mode | Physical output | 65282=1 | ✓ |
| swBuildId | 1.1.6-bseedv6 (pre-V7) | 1.1.6-bseedv6 | ✓ |

LEFT/MIDDLE final profile intact; RIGHT mains still `Always on` and logical OFF
— the exact safe pre-flash state the ruling requires. No writes performed.

Remaining canary gates: #4 recovery artifact = PASS (see below); #1/#2/#3 pending
the real-checkout build+test workstream; #5 converter-must-recognize-V7 handled in
`../flash` V7-fingerprint note (wrapper edit) before any flash.

## Check #4 — V5 recovery artifact: PASS (available + immutable)
GitHub Actions artifact `9884225463` (`bseed-ts0726-v6-final`, non-expired) re-downloaded:
```text
recovery.ota sha256 4a09b5221d06889f34abd5c3cf89405d42bb168810013b45f1cef64433bf1b19  (185682 B)  == ruling-required
forward.ota  sha256 d18c420d18e1a741b8946482c8ef885b61d8ceb92a434f7bb1beddb6dd3ec79c  (185858 B)  == deployed V6
manifest: otaHeader fileVersion 285356040 / manufacturerCode 4417 / imageType 45577
```
Local OTA index is clean (config has only `ota: {block_size:192}`, no firmware_directory) —
forward and recovery are never simultaneously exposed; WU4 mechanism uses per-request
single-entry index URLs. Recovery path available for rollback.
