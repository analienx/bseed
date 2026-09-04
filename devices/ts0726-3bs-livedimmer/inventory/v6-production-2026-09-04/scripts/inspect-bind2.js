'use strict';
const fs = require('fs');
const txt = fs.readFileSync('/app/dist/extension/bind.js', 'utf8');
// positive control
console.log('CONTROL hasBindingsHandling:', /convertSet|bind\(/.test(txt));
const topicLines = txt.split('\n').filter((l) => /topic|subscribe|request/i.test(l) && /bind|unbind/i.test(l));
console.log(topicLines.slice(0, 20).map((l) => l.trim().slice(0, 200)).join('\n'));
console.log('--- methods ---');
const methods = txt.match(/(?:async\s+\w+\s*\([^)]*\)|state \|\| '(\w+)'|data\.mode)/g);
console.log(JSON.stringify([...new Set((methods || []).map((x) => x.trim()))].slice(0, 30), null, 1));
console.log('--- unbind/read-from-device hints ---');
txt.split('\n').forEach((l, i) => {
    if (/Read_binding|bindTable|binding_table|\.bindings\(|Get_Bind/i.test(l)) console.log(i + 1, l.trim().slice(0, 200));
});
