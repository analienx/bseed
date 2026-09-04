'use strict';
// Find the generic 'read' toZigbee converter: search installed ZHC + live converter file.
const fs = require('fs');
const results = {};

function scan(file, tokens) {
    let txt;
    try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { return {error: e.message}; }
    const out = {};
    for (const t of tokens) {
        const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const hits = [];
        let m;
        while ((m = re.exec(txt)) !== null && hits.length < 6) {
            const start = Math.max(0, m.index - 120);
            hits.push(txt.slice(start, Math.min(txt.length, m.index + 240)).replace(/\s+/g, ' '));
        }
        out[t] = {count: (txt.match(re) || []).length, samples: hits};
    }
    return out;
}

const zhcDir = '/app/node_modules/zigbee-herdsman-converters';
const candidates = [];
function walk(d, depth) {
    if (depth > 3) return;
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
        if (e.name === 'node_modules' || e.name === '.pnpm') continue;
        const p = d + '/' + e.name;
        if (e.isDirectory()) walk(p, depth + 1);
        else if (/\.js$/.test(e.name) && /toZigbee|modernExtend|index|read/i.test(e.name)) candidates.push(p);
    }
}
try { walk(zhcDir, 0); } catch (e) { results.zhc_walk_error = e.message; }
results.zhc_candidates = candidates.slice(0, 20);

const hits = {};
for (const c of candidates.slice(0, 20)) {
    const r = scan(c, ['state_property', '"read"', "'read'"]);
    for (const [t, v] of Object.entries(r)) {
        if (v.count && (!hits[t] || hits[t].file === c)) {
            hits[t] = hits[t] || {samples: []};
            hits[t].file = c;
            hits[t].count = (hits[t].count || 0) + v.count;
            hits[t].samples.push(...v.samples.map((s) => c.split('/').slice(-1)[0] + ': ' + s));
        }
    }
}
results.zhc = hits;
results.liveConverter = scan('/config/zigbee2mqtt/external_converters/bseed_ts0726_v5.js',
    ['state_property', 'read', 'endpoint-scoped']);
// trim live 'read' samples to the informative ones
results.liveConverter.read.samples = results.liveConverter.read.samples.filter((s) =>
    /key|convertGet|convertSet|read\(/.test(s)).slice(0, 6);
console.log(JSON.stringify(results, null, 1).slice(0, 4000));
