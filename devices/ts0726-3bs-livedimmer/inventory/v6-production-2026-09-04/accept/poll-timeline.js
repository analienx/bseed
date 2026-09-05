'use strict';
// One-clock timeline of currentLevel poll errors vs the unbind, plus unbind log evidence.
const fs = require('fs'); const path = require('path');
const BASE = '/config/zigbee2mqtt/log';
const lines = [];
for (const w of fs.readdirSync(BASE)) {
    let fl = []; try { fl = fs.readdirSync(path.join(BASE, w)); } catch (e) { continue; }
    for (const f of fl) {
        if (!f.endsWith('.log')) continue;
        for (const l of fs.readFileSync(path.join(BASE, w, f), 'utf8').split('\n')) {
            const m = l.match(/^\[(2026-09-0[45] \d\d:\d\d:\d\d)\]/);
            if (m) lines.push({ts: m[1], l});
        }
    }
}
const poll = lines.filter((x) => /Failed to poll currentLevel/.test(x.l)).sort((a, b) => a.ts.localeCompare(b.ts));
console.log('total currentLevel poll errors (all windows):', poll.length);
console.log('FIRST:', poll[0] ? poll[0].ts : '-', '| LAST:', poll[poll.length - 1] ? poll[poll.length - 1].ts : '-');
const ub = lines.filter((x) => /unbind/i.test(x.l) && /LivingRoomMainDimmer|17007/.test(x.l)).sort((a, b) => a.ts.localeCompare(b.ts));
for (const u of ub.slice(-6)) console.log('UNBIND>', u.ts, u.l.replace(/^\[[^\]]+\]\s*/, '').slice(0, 160));
const after = poll.filter((x) => ub.length && x.ts > ub[ub.length - 1].ts);
console.log('poll errors AFTER last unbind log line:', after.length);
console.log('HOST date now:', new Date().toString());
