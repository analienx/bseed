'use strict';
// Read-only: does the installed base definition EC-GL86ZPCS31 (and the BSEED stack) create
// coordinator BINDS in configure()? If yes, the retired EP4/EP5 genLevelCtrl binds could
// resurrect on next restart/interview.
const { execSync } = require('child_process');
const out = [];
function g(cmd) { try { return execSync(cmd).toString(); } catch (e) { return 'rc=' + e.status; } }
const file = '/app/node_modules/zigbee-herdsman-converters/dist/devices/tuya.js';
console.log('== EC-GL86ZPCS31 definition block: bind/configure sites ==');
const idx = Number(g(`grep -n "EC-GL86ZPCS31" ${file} | head -1 | cut -d: -f1`));
console.log('definition starts near line', idx);
const win = g(`sed -n ${idx},${idx + 160}p ${file}`).split('\n');
win.forEach((l, i) => { if (/bind|configure|reporting|coordinator|genLevelCtrl/.test(l)) console.log(idx + i + ': ' + l.trim().slice(0, 150)); });
console.log('== bindToCoordinator / bindEndpoint helpers used in tuya.js? ==');
console.log(g(`grep -c bindToCoordinator ${file}`));
console.log('== BSEED production wrapper + overlays: any bind() calls? ==');
for (const f of ['/config/zigbee2mqtt/external_converters/bseed_ts0726_v6_production.js', '/config/zigbee2mqtt/converter_lib/bseed_ts0726_v567_hardened.js', '/config/zigbee2mqtt/converter_lib/bseed_ts0726_v56_hardened.js']) {
    console.log(f.split('/').pop(), '-> bind-call count:', g(`grep -c "endpoint.bind\\|\\.bind(" ${f}`).trim());
}
