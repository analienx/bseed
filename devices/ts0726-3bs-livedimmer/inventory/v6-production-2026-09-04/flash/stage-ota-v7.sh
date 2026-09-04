#!/bin/bash
# V7 OTA staging inside the Z2M container (read-only to device). Host side:
# /tmp/v7ota/{forward.ota,index-forward.json,server.js}; container copy + server up.
set -e
C=app_45df7312_zigbee2mqtt
mkdir -p /tmp/v7ota
cp /tmp/v7-release/forward.ota /tmp/v7ota/forward.ota 2>/dev/null || true
# forward.ota should already be at /tmp/v7-release on host from artifact handoff
sha256sum /tmp/v7ota/forward.ota
cat > /tmp/v7ota/index-forward.json <<'EOF'
[{"fileVersion": 285356041, "manufacturerCode": 4417, "imageType": 45577, "url": "http://127.0.0.1:8899/forward.ota"}]
EOF
cat > /tmp/v7ota/server.js <<'EOF'
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/tmp/v7ota-root';
http.createServer((req, res) => {
    const f = path.join(ROOT, req.url.replace(/^\/+/, '').replace(/[^a-zA-Z0-9._-]/g, ''));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, {'content-type': 'application/octet-stream'});
    fs.createReadStream(f).pipe(res);
}).listen(8899, '127.0.0.1', () => console.log('ota server up'));
EOF
mkdir -p /tmp/v7ota-root
cp /tmp/v7ota/forward.ota /tmp/v7ota/index-forward.json /tmp/v7ota-root/
ls -la /tmp/v7ota-root
docker rm -f v7ota-srv 2>/dev/null || true
docker cp /tmp/v7ota/forward.ota $C:/tmp/v7ota-root/forward.ota
docker cp /tmp/v7ota/index-forward.json $C:/tmp/v7ota-root/index-forward.json
docker cp /tmp/v7ota/server.js $C:/tmp/server.js
docker exec -d $C node /tmp/server.js
sleep 1
docker exec $C sh -c 'wget -qO- http://127.0.0.1:8899/index-forward.json; echo; wget -qO- --timeout=5 http://127.0.0.1:8899/forward.ota 2>/dev/null | wc -c'
docker exec $C sha256sum /tmp/v7ota-root/forward.ota
