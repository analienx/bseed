'use strict';
// Does Z2M 2.14 expose an on-device binding-table LIST read? Inspect bind.js.
const fs = require('fs');
const txt = fs.readFileSync('/app/dist/extension/bind.js', 'utf8');
const lines = txt.split('\n');
const hits = [];
lines.forEach((l, i) => {
    if (/list|readBindingTable|Bind_req|0x0032|binding_table|Get_binding/i.test(l)) {
        hits.push({line: i + 1, text: l.trim().slice(0, 220)});
    }
});
console.log(JSON.stringify({
    total_hits: hits.length,
    hits: hits.slice(0, 25),
    topics: [...new Set((txt.match(/request\/devices?\/[a-z_/]+/g) || []))],
}, null, 1));
