'use strict';
// Pre-restart load check of the installed production converter in its REAL layout.
// Positive control: resolving ZHC bare specifier the same way.
const path = require('path');
const prod = '/config/zigbee2mqtt/external_converters/bseed_ts0726_v6_production.js';

// control: does bare 'zigbee-herdsman-converters/lib/exposes' resolve from /config context?
let controlOk = false;
try { require.resolve('zigbee-herdsman-converters/lib/exposes', {paths: [path.dirname(prod), '/app']}); controlOk = true; } catch (e) {}
if (!controlOk) { console.log('CONTROL_FAIL bare ZHC not resolvable from /config or /app'); process.exit(2); }

delete require.cache[require.resolve(prod)];
const defs = require(prod);
const d = Array.isArray(defs) ? defs : [defs];
console.log(JSON.stringify({
    loaded: true,
    definitionCount: d.length,
    model: d[0].model,
    description: d[0].description,
    fingerprints: d[0].fingerprint.map((f) => f.softwareBuildID),
    bindedKeys: d[0].extend.flatMap((e) => (e.toZigbee || []).flatMap((c) => c.key || [])).filter((k) => /binded/.test(k)),
}, null, 1));
