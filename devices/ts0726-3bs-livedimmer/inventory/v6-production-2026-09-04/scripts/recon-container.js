'use strict';
// Read-only container recon for the V6 production work unit (2026-09-04).
const fs = require('fs');
const path = require('path');

const out = {};
const tryResolve = (m) => { try { return require.resolve(m); } catch (e) { return null; } };
out.modules = {
    'better-sqlite3': tryResolve('better-sqlite3'),
    'js-yaml': tryResolve('js-yaml'),
    mqtt: tryResolve('mqtt'),
    'zigbee-herdsman-converters': tryResolve('zigbee-herdsman-converters'),
};

// locate Z2M data dir: process cmdline + common candidates
try { out.cmdline = fs.readFileSync('/proc/1/cmdline', 'utf8').replace(/\0/g, ' ').trim(); } catch (e) { out.cmdline = null; }
const candidates = ['/data', '/app/data', '/config/zigbee2mqtt', '/usr/src/app/data'];
out.dataDirs = {};
for (const c of candidates) {
    try {
        const entries = fs.readdirSync(c);
        out.dataDirs[c] = entries.filter((n) => /configuration\.yaml|database|\.db|state|log/i.test(n));
    } catch (e) { /* missing */ }
}
try {
    out.configFile = fs.readFileSync('/data/configuration.yaml', 'utf8') ? 'exists' : 'empty';
} catch (e) { out.configFile = null; }

// external converters dir inventory (names + sizes only, hashes done separately)
try {
    out.external = fs.readdirSync('/config/zigbee2mqtt/external_converters').map((n) => {
        const st = fs.statSync(path.join('/config/zigbee2mqtt/external_converters', n));
        return {name: n, size: st.size, mtime: st.mtime.toISOString()};
    });
} catch (e) { out.external = null; }

// converter_lib on live config?
try { out.converterLib = fs.readdirSync('/config/zigbee2mqtt/converter_lib'); } catch (e) { out.converterLib = null; }

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
