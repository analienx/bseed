'use strict';
// Extract durable standard-ABI evidence lines from the retained WU5 log windows.
const fs = require('fs');
const dirs = [
    '/config/zigbee2mqtt/log/2026-09-03.21-04-51',
    '/config/zigbee2mqtt/log/2026-09-03.21-13-34',
];
const files = [];
for (const d of dirs) for (const f of fs.readdirSync(d)) files.push(d + '/' + f);
const rx = /abi_switchactions|"switchActions":2|'set' 'read'|Read result of 'genOnOffSwitchCfg'/;
const hits = [];
for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    for (const line of txt.split('\n')) {
        if (line.includes('LivingRoomMainDimmer') ? false : false) continue;
        if (rx.test(line)) hits.push({file: f.replace('/config/zigbee2mqtt/log/', ''), line: line.slice(0, 400)});
    }
}
// summary: unique shapes
const first = hits[0], last = hits[hits.length - 1];
const pubLines = hits.filter((h) => h.line.includes('abi_switchactions'));
const readRes = hits.filter((h) => h.line.includes('Read result'));
const setRead = hits.filter((h) => h.line.includes("'set' 'read'"));
console.log(JSON.stringify({
    total: hits.length,
    pub_abi_lines: pubLines.length,
    read_result_lines: readRes.length,
    set_read_lines: setRead.length,
    first,
    last,
    sample_pub: pubLines.slice(0, 3),
    sample_setread: setRead.slice(0, 5),
}, null, 1));
fs.writeFileSync('/tmp/v6prod-20260904-gateA-recovery.json', JSON.stringify(hits, null, 1));
console.log('full_hits_written /tmp/v6prod-20260904-gateA-recovery.json');
