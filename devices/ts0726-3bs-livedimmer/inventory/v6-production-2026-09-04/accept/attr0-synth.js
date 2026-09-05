'use strict';
// Recursive grep in JS (no shell metachars). Find where attr${ID} names are synthesized
// and where configuredReportings entries get their .attribute object.
const fs = require('fs'); const path = require('path');
const roots = ['/app/node_modules/zigbee-herdsman/dist', '/app/dist'];
const nameRe = /(['"`]attr['"`]|\battr\s*\+|`attr\$\{|['"]attr['"]\s*\+\s*\w*\.?ID)/;
const repRe = /configuredReportings\s*(=|\.push|\.find|\.some|\.map)|\.attribute\s*[:=]|getAttribute\(/;
function walk(d, cb) { let es; try { es = fs.readdirSync(d, {withFileTypes: true}); } catch (e) { return; } for (const f of es) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, cb); else if (f.name.endsWith('.js')) cb(p); } }
const nameHits = []; const repHits = [];
for (const r of roots) walk(r, (p) => {
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((l, i) => {
        if (nameRe.test(l)) nameHits.push(p.replace(/^\/app\//, '') + ':' + (i + 1) + ': ' + l.trim().slice(0, 150));
        if (repRe.test(l) && /onfigur|attribute|Reporting/.test(l)) repHits.push(p.replace(/^\/app\//, '') + ':' + (i + 1) + ': ' + l.trim().slice(0, 150));
    });
});
console.log('=== attr+ID name synthesis sites ==='); for (const h of nameHits.slice(0, 15)) console.log(h);
console.log('=== configuredReportings .attribute construction sites ==='); for (const h of repHits.slice(0, 25)) console.log(h);
