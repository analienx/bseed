'use strict';
// Dump every coordinator-log line mentioning the dimmer inside a UTC+2 (host CEST)
// time-prefix window, newest log window dir first. Usage: node grep-device-log.js 22:1 [maxLines]
const fs = require('fs');
const path = require('path');
const prefix = process.argv[2] || '';
const max = parseInt(process.argv[3] || '120', 10);
const BASE = '/config/zigbee2mqtt/log';
const wins = fs.readdirSync(BASE).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).sort().reverse().slice(0, 2);
const hit = [];
for (const w of wins) {
    for (const f of fs.readdirSync(path.join(BASE, w)).sort()) {
        if (!f.endsWith('.log')) continue;
        for (const line of fs.readFileSync(path.join(BASE, w, f), 'utf8').split('\n')) {
            if (!/LivingRoomMainDimmer|0xa4c13843a9d40f85/.test(line)) continue;
            if (prefix && !line.includes(`2026-09-04 ${prefix}`)) continue;
            hit.push(line.length > 320 ? line.slice(0, 320) + '…' : line);
        }
    }
}
console.log(`lines=${hit.length} (prefix='${prefix}')`);
for (const l of hit.slice(-max)) console.log(l);
