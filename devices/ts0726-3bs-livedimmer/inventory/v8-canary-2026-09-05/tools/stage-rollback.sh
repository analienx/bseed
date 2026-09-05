#!/bin/bash
# V8 canary rollback staging (ruling 5552730292 section 1).
# Banks the exact accepted V7 production OTA (fileVersion 285356041) into the Z2M
# container and proves a target-only downgrade route. NO device writes here.
set -e
C=app_45df7312_zigbee2mqtt
HOSTDIR=/tmp/v8-rollback
CTDIR=/tmp/v8ota-root
echo "== host artifact identity =="
sha256sum $HOSTDIR/v7-recovery.ota
sha512sum $HOSTDIR/v7-recovery.ota
python3 - "$HOSTDIR/v7-recovery.ota" <<'EOF'
import struct, sys, hashlib
b = open(sys.argv[1], 'rb').read()
magic, hlen = struct.unpack_from('<IH', b, 0)
hdrver, = struct.unpack_from('<H', b, 4)
mfr, img = struct.unpack_from('<HH', b, 10)
fv, = struct.unpack_from('<I', b, 14)
stack, = struct.unpack_from('<H', b, 18)
s = b[20:52].rstrip(b'\x00')
total, = struct.unpack_from('<I', b, 52)
print('bytes=%d sha256=%s' % (len(b), hashlib.sha256(b).hexdigest()))
print('identifier=0x%08X headerVersion=%d headerLength=%d' % (magic, hdrver, hlen))
print('manufacturerCode=%d imageType=%d fileVersion=%d stackVersion=%d' % (mfr, img, fv, stack))
print('headerString=%s totalImageSize=%d (matches file: %s)' % (s.decode(errors='replace'), total, total == len(b)))
assert mfr == 4417 and img == 45577 and fv == 285356041, 'V7 identity mismatch'
assert total == len(b)
print('V7 ROLLBACK ARTIFACT HEADER: PASS')
EOF
echo "== install into container =="
docker exec $C mkdir -p $CTDIR
docker cp $HOSTDIR/v7-recovery.ota $C:$CTDIR/v7-recovery.ota
cat > $HOSTDIR/index-recovery.json <<'EOF'
[{"fileVersion": 285356041, "manufacturerCode": 4417, "imageType": 45577, "url": "http://127.0.0.1:8899/v7-recovery.ota"}]
EOF
cat > $HOSTDIR/ota-server.js <<'EOF'
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/tmp/v8ota-root';
http.createServer((req, res) => {
    const f = path.join(ROOT, req.url.replace(/^\/+/, '').replace(/[^a-zA-Z0-9._-]/g, ''));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, {'content-type': 'application/octet-stream'});
    fs.createReadStream(f).pipe(res);
}).listen(8899, '127.0.0.1', () => console.log('v8 canary ota server up'));
EOF
docker cp $HOSTDIR/index-recovery.json $C:$CTDIR/index-recovery.json
docker cp $HOSTDIR/ota-server.js $C:/tmp/v8-ota-server.js
echo "== start server (or reuse) =="
docker exec $C sh -c "wget -qO- --timeout=3 http://127.0.0.1:8899/v7-recovery.ota 2>/dev/null | wc -c" || true
if ! docker exec $C sh -c "wget -qO- --timeout=3 http://127.0.0.1:8899/v7-recovery.ota 2>/dev/null | wc -c" | grep -q 185890; then
  docker exec $C sh -c "node /tmp/v8-ota-server.js >/tmp/v8-ota-server.log 2>&1 &" 
  sleep 1
fi
echo "== in-container serving proof =="
docker exec $C sh -c "wget -qO- http://127.0.0.1:8899/index-recovery.json; echo; wget -qO- --timeout=10 http://127.0.0.1:8899/v7-recovery.ota | wc -c; sha256sum $CTDIR/v7-recovery.ota"
echo "== STAGED ROLLBACK COMMAND (not executed) =="
echo "publish to: zigbee2mqtt/bridge/request/device/ota_update/update/downgrade"
echo "payload:    {\"id\": \"0xa4c13843a9d40f85\", \"url\": \"http://127.0.0.1:8899/index-recovery.json\"}"
echo "DONE-STAGE-ROLLBACK"
