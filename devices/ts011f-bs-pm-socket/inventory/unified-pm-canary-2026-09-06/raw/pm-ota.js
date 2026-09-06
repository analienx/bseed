'use strict';
// PM canary OTA via per-request hex payload (ruling: build request from verified file bytes).
// Usage: node pm-ota.js update
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const crypto = require('crypto');
const DEV = 'LivingRoomSocketWifiLeft';
const OTA = '/tmp/pm-ota/forward.ota';
const REQUIRED_SHA = 'c3ccb484c28d7ef08594acc306b2054aed3ba9fcfc9579643da339f7fcc9fe7c';
const data = fs.readFileSync(OTA);
const sha = crypto.createHash('sha256').update(data).digest('hex');
if (data.length !== 195394 || sha !== REQUIRED_SHA) { console.error('FATAL artifact mismatch', data.length, sha); process.exit(2); }
// independent header parse: mfr@10 imgType@12 fileVer@14 total@52 (LE)
const mfr = data.readUInt16LE(10), img = data.readUInt16LE(12), fv = data.readUInt32LE(14), total = data.readUInt32LE(52);
if (mfr !== 4417 || img !== 43556 || fv !== 302329858 || total !== data.length) { console.error('FATAL header mismatch', {mfr, img, fv, total}); process.exit(2); }
console.log('artifact OK', {bytes: data.length, sha256: sha, mfr, img, fv, total});
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'pm-ota8-' + Math.random().toString(16).slice(2, 6), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000, keepalive: 60});
const req = {id: DEV, hex: {data: data.toString('hex').toUpperCase(), file_name: 'bseed-ts011f-pm-v8-ded91a1.ota'}};
const ev = {mode: 'update', target: DEV, ota_sha256: sha, ota_bytes: data.length, ota_header: {mfr, img, fv, total}, request_sent_at: null, at: new Date().toISOString(), progress: [], events: []};
const t = () => new Date().toISOString().slice(11, 19);
client.on('message', (topic, payload) => {
    const s = payload.toString();
    if (topic.includes('bridge/response/device/ota_update')) { ev.events.push({at: t(), topic, data: s.slice(0, 900)}); console.log(t(), 'RESP', s.slice(0, 400)); }
    else if (topic === 'zigbee2mqtt/bridge/logging' && /ota/i.test(s)) { ev.progress.push({at: t(), line: s.slice(0, 240)}); }
    else if (topic === 'zigbee2mqtt/' + DEV + '/availability') { ev.events.push({at: t(), topic, data: s}); }
    else if (topic === 'zigbee2mqtt/' + DEV && s.includes('"update"')) { try { const j = JSON.parse(s); ev.events.push({at: t(), topic: 'state.update', data: JSON.stringify(j.update)}); } catch (e) {} }
});
const save = () => { fs.mkdirSync('/tmp/pmcanary', {recursive: true}); fs.writeFileSync('/tmp/pmcanary/ota-update.json', JSON.stringify(ev, null, 1)); };
client.on('connect', () => {
    client.subscribe(['zigbee2mqtt/bridge/response/device/ota_update/update', 'zigbee2mqtt/bridge/logging', 'zigbee2mqtt/' + DEV + '/availability', 'zigbee2mqtt/' + DEV]);
    setTimeout(() => {
        ev.request_sent_at = new Date().toISOString();
        client.publish('zigbee2mqtt/bridge/request/device/ota_update/update', JSON.stringify(req), {qos: 1});
        console.log(t(), 'request sent (hex payload,', req.hex.data.length / 2, 'bytes )');
    }, 1500);
});
let terminal = false;
setInterval(() => {
    if (ev.events.some((e) => e.topic.endsWith('/update') && /"status":"(ok|error)"/.test(e.data))) terminal = true;
}, 1000);
const poll = setInterval(() => { save(); console.log(t(), 'waiting...', 'progress=' + ev.progress.length, 'responses=' + ev.events.length); }, 60_000);
setTimeout(() => { clearInterval(poll); save(); console.log('RUNNER-DONE terminal=' + terminal, 'progress=' + ev.progress.length, 'events=' + ev.events.length); client.end(true); process.exit(terminal ? 0 : 3); }, 2_400_000);
