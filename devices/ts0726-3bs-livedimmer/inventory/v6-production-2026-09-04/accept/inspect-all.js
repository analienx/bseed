'use strict';
// Combined acceptance inspection, run INSIDE the container. Read-only.
const fs = require('fs');
const path = require('path');
const DEV = 'LivingRoomMainDimmer';
// 1) state.json truth
const st = JSON.parse(fs.readFileSync('/config/zigbee2mqtt/state.json', 'utf8'))[DEV] || {};
const keys = ['state_relay_left', 'state_relay_middle', 'state_relay_right', 'relay_left_physical_mode', 'relay_middle_physical_mode', 'relay_right_physical_mode',
    'switch_left_binded_mode', 'switch_middle_binded_mode', 'switch_right_binded_mode', 'relay_right_indicator', 'relay_right_indicator_mode', 'switch_right_action_mode', 'update'];
console.log('== STATE ==');
for (const k of keys) if (k in st) console.log(k, '=', JSON.stringify(st[k]));
// 2) observer events summary
const evs = fs.readFileSync('/tmp/accept-events.jsonl', 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
console.log('== EVENTS ==', evs.length, 'lines; kinds:', JSON.stringify(evs.reduce((a, e) => (a[e.kind] = (a[e.kind] || 0) + 1, a), {})));
for (const e of evs) if (e.kind === 'self') console.log(new Date(e.t).toISOString().slice(11, 19), e.step, e.k, JSON.stringify(e.v).slice(0, 80));
// 3) log scan: all files of the two newest windows, target receive/command lines since 21:00 local
const wins = fs.readdirSync('/config/zigbee2mqtt/log').sort().reverse().slice(0, 2);
console.log('== LOG SCAN windows:', wins.join(', '), '==');
const re = new RegExp(`${DEV}|0xa4c13843a9d40f85`);
let hits = 0;
for (const w of wins) {
    for (const f of fs.readdirSync(path.join('/config/zigbee2mqtt/log', w))) {
        if (!f.endsWith('.log')) continue;
        const lines = fs.readFileSync(path.join('/config/zigbee2mqtt/log', w, f), 'utf8').split('\n');
        for (const line of lines) {
            if (!re.test(line)) continue;
            if (/MQTT publish|homeassistant/.test(line)) continue;
            if (!/\[2026-09-04 2[01]:/.test(line)) continue;
            console.log(line.slice(0, 240));
            if (++hits > 60) { console.log('…(truncated)'); w && process.exit(0); }
        }
    }
}
console.log('== total non-publish target lines:', hits, '==');
