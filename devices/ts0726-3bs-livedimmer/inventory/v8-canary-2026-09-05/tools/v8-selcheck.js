'use strict';
// Compare full definitions pre vs post. Runs in Z2M container.
const fs = require('fs');
function def(path, tag) {
    const dev = JSON.parse(fs.readFileSync(path, 'utf8')).find((x) => x.ieee_address === '0xa4c13843a9d40f85');
    const d = dev.definition || {};
    const flat = [];
    const walk = (f) => { for (const x of f || []) { flat.push(x.property || x.type || '?'); walk(x.features); } };
    walk(d.exposes);
    console.log(tag, JSON.stringify({model: d.model, vendor: d.vendor, description: d.description, supports_ota: d.supports_ota, exposes_count: flat.length, exposes: flat}));
}
def('/tmp/v8canary/pre/bridge-devices.json', 'PRE ');
def('/tmp/v8canary/post/bridge-devices.json', 'POST');
