'use strict';
const fs = require('fs');
const st = JSON.parse(fs.readFileSync('/config/zigbee2mqtt/state.json', 'utf8'));
const keys = Object.keys(st);
console.log('state.json entries:', keys.length);
const hit = keys.filter((k) => /LivingRoom|a4c13843/i.test(k));
console.log('dimmer-ish keys:', JSON.stringify(hit));
for (const hk of hit) {
    const s = st[hk] || {};
    const watch = ['state_relay_left', 'state_relay_middle', 'state_relay_right', 'relay_left_physical_mode', 'relay_middle_physical_mode', 'relay_right_physical_mode', 'relay_right_indicator', 'relay_right_indicator_mode', 'switch_left_binded_mode', 'switch_middle_binded_mode', 'switch_right_binded_mode', 'update'];
    console.log('--- state via', hk, '---');
    for (const k of watch) if (k in s) console.log(' ', k, '=', JSON.stringify(s[k]).slice(0, 60));
}
// press-window log lines: local 21:2x-21:4x
const path = require('path');
const wins = fs.readdirSync('/config/zigbee2mqtt/log').sort().reverse();
let printed = 0;
for (const w of wins.slice(0, 1)) {
    for (const f of fs.readdirSync(path.join('/config/zigbee2mqtt/log', w))) {
        if (!f.endsWith('.log')) continue;
        for (const line of fs.readFileSync(path.join('/config/zigbee2mqtt/log', w, f), 'utf8').split('\n')) {
            if (!/^\[2026-09-04 21:[2-4]/.test(line)) continue;
            if (!/LivingRoomMainDimmer|0xa4c13843a9d40f85/.test(line)) continue;
            if (/homeassistant|config'$|update available|OTA/.test(line)) continue;
            console.log(line.slice(0, 300));
            if (++printed > 45) { console.log('…trunc'); process.exit(0); }
        }
    }
}
console.log('== printed', printed, 'press-window lines ==');
