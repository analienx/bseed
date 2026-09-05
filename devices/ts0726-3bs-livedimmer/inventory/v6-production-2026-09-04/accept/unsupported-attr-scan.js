'use strict';
// Read-only scan of Z2M coordinator logs for UNSUPPORTED_ATTRIBUTE / NOT_SUPPORTED /
// unsupported-cluster / status errors tied to LivingRoomMainDimmer (or its IEEE).
// Classifies each occurrence per Supervisor rubric (5546884577). No device interaction.
const fs = require('fs');
const path = require('path');
const BASE = '/config/zigbee2mqtt/log';
const wins = fs.readdirSync(BASE).filter((d) => /^\d{4}-/.test(d)).sort().reverse().slice(0, 10);
const pat = /(UNSUPPORTED_ATTRIBUTE|UNSUPPORTED_CLUSTER|NOT_SUPPORTED|Invalid attribute|status '\d+'|error '.*?'|got .*status)/;
const rows = [];
for (const w of wins) {
    let files = [];
    try { files = fs.readdirSync(path.join(BASE, w)); } catch (e) { continue; }
    for (const f of files) {
        if (!f.endsWith('.log')) continue;
        for (const line of fs.readFileSync(path.join(BASE, w, f), 'utf8').split('\n')) {
            if (!/LivingRoomMainDimmer|0xa4c13843a9d40f85|a4c13843/.test(line)) continue;
            if (!pat.test(line)) continue;
            const t = (line.match(/^\[([\d\-: .]+)\]/) || [])[1] || '';
            rows.push({t, line: line.replace(/^\[[\d\-: .]+\]\s*/, '').slice(0, 240)});
        }
    }
}
// De-dupe by normalized message
const seen = new Map();
for (const r of rows) {
    const key = r.line.replace(/\d{2}:\d{2}:\d{2}/g, 'HH:MM:SS').replace(/0x[0-9a-fA-F]{4,}/g, '0xID').slice(0, 160);
    if (!seen.has(key)) seen.set(key, {count: 0, sample: r});
    seen.get(key).count++;
}
console.log('windows scanned:', wins.join(', '));
console.log('raw matching lines:', rows.length, '| distinct patterns:', seen.size);
for (const [k, v] of seen) {
    console.log('\n### x' + v.count + '  first@' + v.sample.t);
    console.log(v.sample.line);
}
