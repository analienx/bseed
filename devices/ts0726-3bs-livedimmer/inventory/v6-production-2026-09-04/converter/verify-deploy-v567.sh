#!/bin/bash
# Post-restart converter verification (read-only).
C=app_45df7312_zigbee2mqtt
LATEST=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
echo "window=$LATEST"
echo "=== loaded converters ==="
docker exec $C sh -c "grep 'Loaded external converter' /config/zigbee2mqtt/log/$LATEST/log.log | sort | uniq -c"
echo "=== converter errors ==="
docker exec $C sh -c "grep -iE 'error|fail|exception' /config/zigbee2mqtt/log/$LATEST/log.log | grep -iE 'bseed|convert|overlay' | head -5"
echo "=== frontend ==="
docker exec $C sh -c 'wget -qS -O /dev/null http://127.0.0.1:8099/ 2>&1 | grep HTTP/ | head -1'
echo "=== target resolution via live findByDevice (installed ZHC + live files) ==="
docker exec -w /app -e NODE_PATH=/app/node_modules $C node -e "
const zhc = require('zigbee-herdsman-converters');
const fs = require('fs');
for (const f of fs.readdirSync('/config/zigbee2mqtt/external_converters')) {
  if (!f.endsWith('.js')) continue;
  const mod = require('/config/zigbee2mqtt/external_converters/' + f);
  for (const d of (Array.isArray(mod) ? mod : [mod])) { d.externalConverterName = f; zhc.addExternalDefinition(d); }
}
const spy = {type:'Router', ieeeAddr:'0xa4c13843a9d40f85', modelID:'TS0726-3-BS', manufacturerName:'iedhxgyi',
  softwareBuildID:'1.1.6-bseedv6', interviewCompleted:true, powerSource:'Mains (single phase)',
  endpoints:[1,2,3,4,5,6].map(ID=>({ID, inputClusters:[], outputClusters:[]}))};
zhc.findByDevice(spy).then(def => console.log(JSON.stringify({
  currentV6_resolves_to: def && def.model, source: def && def.externalConverterName,
  desc_head: def && (def.description||'').slice(0,42)
})));
zhc.findByDevice({...spy, softwareBuildID:'1.1.7-bseedv7'}).then(def => console.log(JSON.stringify({
  v7_spy_resolves_to: def && def.model, source: def && def.externalConverterName
})));
"
