'use strict';
// Pull all EP3 genOnOffSwitchCfg / 0xff05 traffic + any error/status from the debug segment.
const fs = require('fs');
const txt = fs.readFileSync('/tmp/v9/capture/debug-segment.log', 'utf8');
const lines = txt.split('\n');
const rel = lines.filter((l) =>
    /65285|genOnOffSwitchCfg|switch_right_binded|LivingRoomMainDimmer\/3|0xa4c13843a9d40f85\/3/.test(l));
// dedup long state payload lines (keep first 300 chars)
const compact = rel.map((l) => l.length > 300 ? l.slice(0, 300) + ' …' : l);
fs.writeFileSync('/tmp/v9/capture/ep3-traffic-extract.txt', compact.join('\n'));
console.log('matched', rel.length, 'lines; showing:');
console.log(compact.join('\n'));
