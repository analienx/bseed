import binascii, struct, sys, json

KNOWN_GOOD = r'.qwen/tmp/pm-canary/recovery-forced.zigbee'
OUT = r'.qwen/tmp/pm-canary/recovery-v8-patch.zigbee'
TARGET_INNER = 0x12053003   # 302329859, > V8 installed 0x12053002

b = open(KNOWN_GOOD, 'rb').read()
print('outer size', len(b))
magic = struct.unpack_from('<I', b, 0)[0]
assert magic == 0x0BEEF11E, hex(magic)
hdr_len = struct.unpack_from('<H', b, 6)[0]
sub_id, sub_len = struct.unpack_from('<HI', b, hdr_len)
print('outer header len', hdr_len, 'subid', sub_id, 'sublen', sub_len)
inner_start = hdr_len + 6
inner = b[inner_start:inner_start+sub_len]
print('inner size', len(inner), 'magic', inner[6:8].hex())
assert inner[6:8] == b'\x5d\x02', 'not a Telink OTA inner image'

# inner version lives at bytes 2:6 (little endian) per make_ota.py
cur_inner = struct.unpack_from('<I', inner, 2)[0]
print('inner FILE_VERSION (bytes 2:6) =', hex(cur_inner), cur_inner)

# CRC occupies the trailing 4 bytes of inner; compute over inner[:-4]
stored_crc = struct.unpack_from('<I', inner, len(inner)-4)[0]
computed_crc = (binascii.crc32(inner[:-4]) ^ 0xFFFFFFFF) & 0xFFFFFFFF
print('stored_crc', hex(stored_crc), 'computed(no force)', hex(computed_crc))

# Deterministic patch: set inner version to TARGET_INNER
new_inner = bytearray(inner)
struct.pack_into('<I', new_inner, 2, TARGET_INNER)
# re-tag CRC per make_ota.py: crc32 over the image-data (excluding the appended crc), ^ 0xffffffff
new_crc = (binascii.crc32(bytes(new_inner[:-4])) ^ 0xFFFFFFFF) & 0xFFFFFFFF
new_inner[-4:] = struct.pack('<I', new_crc)

# byte-diff inner: only [2:6] shifted + trailing CRC
diff_idx = [i for i,(a,b) in enumerate(zip(inner, new_inner)) if a!=b]
print('inner diff offsets:', diff_idx)

# rebuild outer Zigbee OTA: update header fileVersion (offset 14) to TARGET_INNER as well
out = bytearray(b)
struct.pack_into('<I', out, 14, TARGET_INNER)   # outer fileVersion = same logic
out[hdr_len:hdr_len+6] = struct.pack('<HI', sub_id, len(new_inner))
out = out[:inner_start] + bytes(new_inner)
total = hdr_len + 6 + len(new_inner)
struct.pack_into('<I', out, 52, total)
open(OUT, 'wb').write(bytes(out))

report = {
  'source': KNOWN_GOOD,
  'known_good_inner_version': hex(cur_inner),
  'target_inner_version': hex(TARGET_INNER),
  'inner_only_changed_offsets': diff_idx,
  'known_good_sha256': '',
  'output_sha256': '',
}
import hashlib, os
report['known_good_sha256'] = hashlib.sha256(bytes(inner)).hexdigest()
report['output_sha256'] = hashlib.sha256(bytes(out)).hexdigest()
with open(OUT + '.proof.json', 'w') as f:
    json.dump(report, f, indent=1)
print(json.dumps(report, indent=1))