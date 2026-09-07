import hashlib, struct, json, os
from pathlib import Path

SRC = Path('.qwen/tmp/pm-canary/artifact/tuya-zigbee-switch/tuya-zigbee-switch/build/bseed-ts011f-pm-v8/forward.ota')
DST = Path('.qwen/tmp/pm-canary/wrapout/bseed-ts011f-pm-v8-ded91a1-selfreinstall-forced.bin')
DST.parent.mkdir(parents=True, exist_ok=True)
b = bytearray(SRC.read_bytes())
sha_src = hashlib.sha256(b).hexdigest()
assert len(b) == 195394 and sha_src == 'c3ccb484c28d7ef08594acc306b2054aed3ba9fcfc9579643da339f7fcc9fe7c'
assert struct.unpack_from('<H', b, 10)[0] == 4417
assert struct.unpack_from('<H', b, 12)[0] == 43556
assert struct.unpack_from('<I', b, 14)[0] == 302329858
hdr_len = struct.unpack_from('<H', b, 6)[0]
before = bytes(b)
struct.pack_into('<I', b, 14, 0xFFFFFFFF)   # ONLY the outer fileVersion changes
diff = [i for i, (x, y) in enumerate(zip(before, b)) if x != y]
assert diff == [14, 15, 16, 17], diff
assert bytes(b[hdr_len:]) == before[hdr_len:]          # Telink payload byte-identical
assert struct.unpack_from('<I', b, 52)[0] == len(b)    # totalImageSize unchanged
with open(DST, 'wb') as f:
    f.write(bytes(b))
report = {
    'source': {'bytes': len(b), 'sha256': sha_src, 'mfr': 4417, 'imageType': 43556, 'fileVersion': '0x12053002'},
    'wrapper': {'path': str(DST), 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'sha512': hashlib.sha512(b).hexdigest(),
                'mfr': 4417, 'imageType': 43556, 'fileVersion': '0xFFFFFFFF', 'header_length': hdr_len},
    'byte_identity_proof': {'changed_offsets': diff, 'changed_fields': ['fileVersion@14 (0x12053002->0xFFFFFFFF)'],
                            'inner_telink_payload_identical': True, 'payload_region': f'offsets {hdr_len}..{len(b)-1} byte-identical',
                            'purpose': 'P004 Phase 5 forced V8 self-reinstall; deployment packaging only; PR#5 untouched'},
}
Path('.qwen/tmp/pm-canary/wrapout/selfreinstall-proof.json').write_text(json.dumps(report, indent=1))
print(json.dumps(report, indent=1))
