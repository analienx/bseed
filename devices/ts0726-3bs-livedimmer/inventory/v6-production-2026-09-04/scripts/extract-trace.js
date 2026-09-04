'use strict';
// Extract the decisive lines from the captured debug segment.
const fs = require('fs');
const txt = fs.readFileSync(process.argv[2], 'utf8');
const lines = txt.split('\n');
const pats = [
    /switch_right_binded_mode/,
    /genOnOffSwitchCfg/,
    /65285|0x0000ff05|0xff05/,
    /0xa4c13843a9d40f85\/3|LivingRoomMainDimmer/,
    /Write|write/,
    /Read result/,
    /status|FAILED|UNSUPPORTED|INVALID/,
];
const hits = lines.filter((l) =>
    (pats.slice(0, 4).some((p) => p.test(l)) && /0xa4c13843a9d40f85|LivingRoomMainDimmer|genOnOffSwitchCfg|switch_right_binded/.test(l))
    || /switch_right_binded_mode/.test(l)
);
console.log('total_lines', lines.length, 'hits', hits.length);
for (const h of hits.slice(0, 80)) console.log(h.length > 480 ? h.slice(0, 480) + ' …[trunc]' : h);
