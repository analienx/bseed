'use strict';
// Pure-JS forensics (no shell metachars). Prove: attr0 on genOnOff == attribute ID 0 == onOff.
const fs = require('fs');
const path = require('path');
const root = '/app/node_modules/zigbee-herdsman/dist/zspec/zcl/definition/cluster.js';
const src = fs.readFileSync(root, 'utf8');
// Find the genOnOff cluster block and pull the onOff attribute id + the attributes map.
const gi = src.indexOf('genOnOff:');
console.log('genOnOff block found at idx', gi);
const block = src.slice(gi, gi + 900);
// Print the first lines mentioning onOff / attribute ids.
for (const line of block.split('\n')) {
    if (/onOff:|attributes:|\bupTime\b|globalSceneControl|startUpOnOff|0x0000|: 0,|: 0x0000/.test(line)) {
        console.log('CLUSTER>', line.trim().slice(0, 140));
    }
}
// Z2M serialization: how does it turn a numeric attribute id into "attr0"?
function walk(dir, out) { for (const f of fs.readdirSync(dir, {withFileTypes: true})) { const p = path.join(dir, f.name); if (f.isDirectory()) { if (!f.name.includes('node_modules')) walk(p, out); } else if (f.name.endsWith('.js')) out.push(p); } }
const files = []; walk('/app/dist', files);
let found = 0;
for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    const lines = s.split('\n');
    lines.forEach((l, i) => {
        if (/attr\$\{|['"]attr['"] *\+|attr\u0027 \+|`attr|attr.*\+.*attrib|configured_reportings/.test(l) && /attr|configured_reportings/.test(l)) {
            console.log('Z2M>', f + ':' + (i + 1), l.trim().slice(0, 160));
            found++;
        }
    });
    if (found > 20) break;
}
console.log('done, z2m hits:', found);
