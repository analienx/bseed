'use strict';
const fs = require('fs');
const path = require('path');
const BASE = '/config/zigbee2mqtt/log';
const wins = fs.readdirSync(BASE).sort().reverse().slice(0, 2);
const re = /Received Zigbee message from 'LivingRoomMainDimmer'/;
const out = [];
for (const w of wins) {
    for (const f of fs.readdirSync(path.join(BASE, w))) {
        if (!f.endsWith('.log')) continue;
        const lines = fs.readFileSync(path.join(BASE, w, f), 'utf8').split('\n');
        for (const line of lines) {
            if (!re.test(line)) continue;
            if (!/\[2026-09-04 (1[7-9]|2[0-9]):/.test(line)) continue;
            const m = line.match(/^\[([\d\- :]+)\].*type '([a-zA-Z]+)', cluster '([a-zA-Z]+)'[^]*?from endpoint (\d+)/);
            out.push(m ? `${m[1].slice(11)} local | EP${m[4]} | ${m[3]} | ${m[2]} | ${line.length > 160 ? line.slice(0, 160) : line}` : line.slice(0, 220));
        }
    }
}
console.log('dimmer->coordinator receive events, last 45:');
for (const l of out.slice(-45)) console.log(l);
console.log('total in window:', out.length);
