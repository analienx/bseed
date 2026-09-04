'use strict';
const fs = require('fs');
const txt = fs.readFileSync('/app/dist/extension/bridge.js', 'utf8');
const i = txt.indexOf('bridgeOptions(');
console.log('--- bridgeOptions body ---');
console.log(txt.slice(i, i + 2200));
const j = txt.indexOf('restartRequired');
console.log('--- restartRequired mentions ---');
for (const mm of txt.matchAll(/.{0,80}restartRequired.{0,120}/g)) console.log(mm[0].replace(/\s+/g, ' '));
