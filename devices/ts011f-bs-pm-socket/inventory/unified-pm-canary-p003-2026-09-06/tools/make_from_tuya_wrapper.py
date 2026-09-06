import hashlib, struct, json, sys
from pathlib import Path

SRC = Path('.qwen/tmp/pm-canary/artifact/tuya-zigbee-switch/tuya-zigbee-switch/build/bseed-ts011f-pm-v8/forward.ota')
DST = Path('.qwen/tmp/pm-canary/wrapout/bseed-ts011f-pm-v8-ded91a1-from_tuya.bin')
EXPECT_SRC = {
    'bytes': 195394,
    'sha256': 'c3ccb484c28d7ef08594acc306b2054aed3ba9fcfc9579643da339f7fcc9fe7c',
    'mfr': 4417, 'img': 43556, 'fv': 302329858,
}
DST.parent.mkdir(parents=True, exist_ok=True)
b = bytearray(SRC.read_bytes())
sha_src = hashlib.sha256(b).hexdigest()
assert len(b) == EXPECT_SRC['bytes'], len(b)
assert sha_src == EXPECT_SRC['sha256'], sha_src
assert struct.unpack_from('<H', b, 10)[0] == EXPECT_SRC['mfr']
assert struct.unpack_from('<H', b, 12)[0] == EXPECT_SRC['img']
assert struct.unpack_from('<I', b, 14)[0] == EXPECT_SRC['fv']
hdr_len = struct.unpack_from('<H', b, 6)[0]

before = bytes(b)
struct.pack_into('<H', b, 12, 54179)      # stock imageType 0xD3A3
struct.pack_into('<I', b, 14, 0xFFFFFFFF)  # forced outer version
diff = [i for i, (x, y) in enumerate(zip(before, b)) if x != y]
assert diff == [12, 13, 14, 15, 16, 17], diff   # ONLY outer imageType+version bytes change
# inner Telink payload byte-identity: everything from header end to EOF unchanged
assert bytes(b[hdr_len:]) == before[hdr_len:]
# header sanity of wrapper
assert struct.unpack_from('<I', b, 0)[0] == 0x0BEEF11E  # OTA magic
assert struct.unpack_from('<H', b, 10)[0] == 4417
assert struct.unpack_from('<H', b, 12)[0] == 54179
assert struct.unpack_from('<I', b, 14)[0] == 0xFFFFFFFF
assert struct.unpack_from('<I', b, 52)[0] == len(b)      # totalImageSize unchanged
import os, tempfile
with open(DST, 'wb') as f:
    f.write(bytes(b))

report = {
    'source': {'path': str(SRC), 'bytes': len(b), 'sha256': sha_src, 'mfr': 4417, 'imageType': 43556, 'fileVersion': '0x12053002'},
    'wrapper': {
        'path': str(DST), 'bytes': len(b),
        'sha256': hashlib.sha256(b).hexdigest(),
        'sha512': hashlib.sha512(b).hexdigest(),
        'mfr': 4417, 'imageType': 54179, 'fileVersion': '0xFFFFFFFF',
        'header_length': hdr_len,
    },
    'byte_identity_proof': {
        'changed_offsets': diff,
        'changed_fields': ['imageType@12 (43556->54179)', 'fileVersion@14 (0x12053002->0xFFFFFFFF)'],
        'inner_telink_payload_identical': True,
        'payload_region': f'offsets {hdr_len}..{len(b)-1} byte-identical to frozen forward.ota',
        'inner_telink_version_field': hex(struct.unpack_from('<I', b, hdr_len + 14)[0]) if False else 'inside payload, unchanged by construction',
    },
    'note': 'P003 FINALIZATION_FALLBACK packaging only; NOT published, NOT flashed; PR#5 source ded91a1 untouched.',
}
Path('.qwen/tmp/pm-canary/wrapper/wrapper-proof.json').write_text(json.dumps(report, indent=1))
print(json.dumps(report, indent=1))
