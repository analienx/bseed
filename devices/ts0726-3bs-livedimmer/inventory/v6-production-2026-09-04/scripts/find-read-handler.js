'use strict';
// Locate the native 'read' handler in Z2M 2.14 publish path + positive controls.
const fs = require('fs');
const files = fs.readdirSync('/app/dist/extension');
const hits = [];
for (const f of files) {
    if (!f.endsWith('.js')) continue;
    const txt = fs.readFileSync('/app/dist/extension/' + f, 'utf8');
    const lines = txt.split('\n');
    lines.forEach((l, i) => {
        if (/state_property|stateProperty/.test(l)) hits.push({file: f, line: i + 1, text: l.trim().slice(0, 200)});
    });
}
// positive control: tokens we KNOW exist
const ctrl = {};
for (const [f, token] of [['publish.js', 'convertGet'], ['publish.js', 'handleSet'], ['receive.js', 'onZigbeeEvent']]) {
    try { ctrl[f + ':' + token] = fs.readFileSync('/app/dist/extension/' + f, 'utf8').includes(token); }
    catch (e) { ctrl[f + ':' + token] = 'READ_FAIL ' + e.message; }
}
console.log(JSON.stringify({controls: ctrl, state_property_hits: hits.slice(0, 20), total_hits: hits.length}, null, 1));
