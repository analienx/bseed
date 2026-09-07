#!/usr/bin/env python3
"""Create the hardware-proven PM recovery successor in GitHub Actions only.

Input is the exact 0x12053003 image that successfully recovered
WorkroomSocketCabinet. The transformation is deliberately limited to the outer
Zigbee OTA fileVersion, Telink inner FILE_VERSION and the inner CRC required by
that version change.
"""

from __future__ import annotations

import binascii
import hashlib
import json
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".qwen/tmp/pm-canary/recovery-v8-patch.zigbee"
OUT_DIR = ROOT / "build/recovery-v12053005"
OUT = OUT_DIR / "recovery-v12053005.zigbee"
MANIFEST = OUT_DIR / "manifest.json"

SOURCE_SHA256 = "c4ae03266204c05f8b95c9a0e723040d7775cce2095a4059466e082315351b63"
SOURCE_VERSION = 0x12053003
TARGET_VERSION = 0x12053005
MANUFACTURER = 4417
IMAGE_TYPE = 43556

src = SOURCE.read_bytes()
assert hashlib.sha256(src).hexdigest() == SOURCE_SHA256
assert struct.unpack_from("<I", src, 0)[0] == 0x0BEEF11E
hdr_len = struct.unpack_from("<H", src, 6)[0]
assert struct.unpack_from("<H", src, 10)[0] == MANUFACTURER
assert struct.unpack_from("<H", src, 12)[0] == IMAGE_TYPE
assert struct.unpack_from("<I", src, 14)[0] == SOURCE_VERSION
assert struct.unpack_from("<I", src, 52)[0] == len(src)

sub_id, sub_len = struct.unpack_from("<HI", src, hdr_len)
inner_start = hdr_len + 6
inner = src[inner_start : inner_start + sub_len]
assert len(inner) == sub_len
assert inner[6:8] == b"\x5d\x02"
assert struct.unpack_from("<I", inner, 2)[0] == SOURCE_VERSION

new_inner = bytearray(inner)
struct.pack_into("<I", new_inner, 2, TARGET_VERSION)
new_crc = (binascii.crc32(bytes(new_inner[:-4])) ^ 0xFFFFFFFF) & 0xFFFFFFFF
new_inner[-4:] = struct.pack("<I", new_crc)

out = bytearray(src)
struct.pack_into("<I", out, 14, TARGET_VERSION)
out[hdr_len : hdr_len + 6] = struct.pack("<HI", sub_id, len(new_inner))
out = out[:inner_start] + bytes(new_inner)
struct.pack_into("<I", out, 52, len(out))
out = bytes(out)

assert struct.unpack_from("<H", out, 10)[0] == MANUFACTURER
assert struct.unpack_from("<H", out, 12)[0] == IMAGE_TYPE
assert struct.unpack_from("<I", out, 14)[0] == TARGET_VERSION
assert struct.unpack_from("<I", out, 52)[0] == len(out)
out_inner = out[inner_start : inner_start + sub_len]
assert struct.unpack_from("<I", out_inner, 2)[0] == TARGET_VERSION
assert struct.unpack_from("<I", out_inner, len(out_inner) - 4)[0] == new_crc

# No payload/code byte may change. Differences are limited to outer version,
# inner version and inner CRC.
diffs = [i for i, (a, b) in enumerate(zip(src, out)) if a != b]
allowed = set(range(14, 18))
allowed.update(range(inner_start + 2, inner_start + 6))
allowed.update(range(inner_start + sub_len - 4, inner_start + sub_len))
assert set(diffs) <= allowed, (diffs, sorted(allowed))
assert out[18:inner_start + 2] == src[18:inner_start + 2]
assert out[inner_start + 6 : inner_start + sub_len - 4] == src[inner_start + 6 : inner_start + sub_len - 4]

OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT.write_bytes(out)
manifest = {
    "schema": 1,
    "purpose": "known-good PM recovery successor",
    "sourceCommit": "39aaa0faabe04465a6cf07c70f8030c60c3b3e0d",
    "sourceSha256": SOURCE_SHA256,
    "sourceVersion": SOURCE_VERSION,
    "targetVersion": TARGET_VERSION,
    "manufacturerCode": MANUFACTURER,
    "imageType": IMAGE_TYPE,
    "bytes": len(out),
    "sha256": hashlib.sha256(out).hexdigest(),
    "sha512": hashlib.sha512(out).hexdigest(),
    "changedOffsets": diffs,
    "invariant": "payload/code bytes identical to hardware-proven 0x12053003 recovery image",
}
MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(manifest, indent=2, sort_keys=True))
