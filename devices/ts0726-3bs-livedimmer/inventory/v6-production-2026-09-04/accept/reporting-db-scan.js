'use strict';
// Read-only: scan the herdsman SQLite file for the raw configuredReportings JSON rows and
// resolve what attrId + manufacturerCode each "attr0"-labelled entry actually carries.
const fs = require('fs');
const buf = fs.readFileSync('/config/zigbee2mqtt/database.db');
const s = buf.toString('latin1');
// configuredReportings arrays look like: [{"clusterID":6,"attrId":0,"minRepIntval":0,...,"manufacturerCode":null}]
const re = /\[\{[^\]]*?"clusterID"[^\]]*?\]/g;
const rows = [];
let m;
while ((m = re.exec(s)) !== null) {
    const txt = m[0];
    if (!/attrId/.test(txt)) continue;
    rows.push(txt);
}
console.log('reporting-array blobs found:', rows.length);
// Also find the endpoints table rows: need ID + device link. Simpler: just print unique attrId/manuf combos.
const seen = {};
for (const r of rows) {
    try {
        const arr = JSON.parse(r);
        for (const e of arr) {
            const key = `cluster=${e.clusterID} attrId=${e.attrId} manuf=${e.manufacturerCode} min=${e.minRepIntval} max=${e.maxRepIntval} chg=${e.repChange}`;
            seen[key] = (seen[key] || 0) + 1;
        }
    } catch (err) { /* blob may be truncated across pages; extract fields by regex instead */
        const ids = r.match(/"attrId":(\d+)/g) || [];
        const clus = r.match(/"clusterID":(\d+)/g) || [];
        const manuf = r.match(/"manufacturerCode":(\w+|"[^"]*")/g) || [];
        const key = 'RAW ' + JSON.stringify({clus: [...new Set(clus)], ids: [...new Set(ids)], manuf: [...new Set(manuf)]});
        seen[key] = (seen[key] || 0) + 1;
    }
}
for (const [k, n] of Object.entries(seen)) console.log(n + 'x', k);
