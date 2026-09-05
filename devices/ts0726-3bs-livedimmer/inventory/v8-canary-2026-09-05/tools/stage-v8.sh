#!/bin/bash
# V8 canary: stage forward.ota (frozen V8) into Z2M container, re-verify bytes, add index.
set -e
C=app_45df7312_zigbee2mqtt
HOSTDIR=/tmp/v8-rollback
CTDIR=/tmp/v8ota-root
echo "== host copy identity =="
sha256sum $HOSTDIR/v8-forward.ota
python3 - "$HOSTDIR/v8-forward.ota" <<'EOF'
import struct, sys, hashlib
b = open(sys.argv[1], 'rb').read()
mfr, img = struct.unpack_from('<HH', b, 10)
fv, = struct.unpack_from('<I', b, 14)
total, = struct.unpack_from('<I', b, 52)
print('bytes=%d sha256=%s' % (len(b), hashlib.sha256(b).hexdigest()))
print('manufacturerCode=%d imageType=%d fileVersion=%d totalImageSize=%d' % (mfr, img, fv, total))
assert mfr == 4417 and img == 45577 and fv == 285356042, 'V8 identity mismatch'
assert total == len(b)
print('V8 FROZEN ARTIFACT HEADER: PASS')
EOF
docker cp $HOSTDIR/v8-forward.ota $C:$CTDIR/v8-forward.ota
cat > $HOSTDIR/index-forward.json <<'EOF'
[{"fileVersion": 285356042, "manufacturerCode": 4417, "imageType": 45577, "url": "http://127.0.0.1:8899/v8-forward.ota"}]
EOF
docker cp $HOSTDIR/index-forward.json $C:$CTDIR/index-forward.json
echo "== in-container re-verification (ruling step 2) =="
docker exec $C sha256sum $CTDIR/v8-forward.ota $CTDIR/v7-recovery.ota
echo "== serving proof =="
docker exec $C sh -c "wget -qO- http://127.0.0.1:8899/index-forward.json; echo; wget -qO- --timeout=10 http://127.0.0.1:8899/v8-forward.ota | wc -c"
echo "DONE-STAGE-V8"
