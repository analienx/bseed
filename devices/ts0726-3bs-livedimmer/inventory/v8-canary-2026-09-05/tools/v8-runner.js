'use strict';
// V8 canary OTA runner (proven WU4 mechanism: per-request single-entry index URL).
// Device-scoped by explicit id. Usage: node v8-runner.js <check|update> <fwd|rollback> [downgrade]
// - check  = read-only availability check
// - update = actual OTA transfer
// fwd      = index-forward.json (V8, 285356042); rollback = index-recovery.json (V7, 285356041)
// "downgrade" argv uses the /downgrade topic suffix (Z2M 2.14 native per-request downgrade).
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const MODE = process.argv[2];
const IMG = process.argv[3];
const DG = process.argv[4] === 'downgrade';
if (!['check', 'update'].includes(MODE) || !['fwd', 'rollback'].includes(IMG)) { console.error('usage: node v8-runner.js <check|update> <fwd|rollback> [downgrade]'); process.exit(2); }
const IDX = 'http://127.0.0.1:8899/' + (IMG === 'fwd' ? 'index-forward.json' : 'index-recovery.json');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-ota8-' + MODE + IMG + '-' + Math.random().toString(16).slice(2, 6), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000, keepalive: 60});
const ev = {mode: MODE, image: IMG, downgrade: DG, index: IDX, target_ieee: '0xa4c13843a9d40f85', at: new Date().toISOString(), progress: [], events: []};
const t = () => new Date().toISOString().slice(11, 19);
client.on('message', (topic, payload) => {
    const s = payload.toString();
    if (topic.includes('bridge/response/device/ota_update')) { ev.events.push({at: t(), topic, data: s.slice(0, 800)}); console.log(t(), 'RESP', s.slice(0, 300)); }
    else if (topic === 'zigbee2mqtt/bridge/logging' && /ota/i.test(s)) { ev.progress.push({at: t(), line: s.slice(0, 240)}); }
    else if (topic === `zigbee2mqtt/${DEV}/availability`) { ev.events.push({at: t(), topic, data: s}); }
});
client.on('connect', () => {
    client.subscribe(['zigbee2mqtt/bridge/response/device/ota_update/check', 'zigbee2mqtt/bridge/response/device/ota_update/update', 'zigbee2mqtt/bridge/logging', `zigbee2mqtt/${DEV}/availability`]);
    const topic = `zigbee2mqtt/bridge/request/device/ota_update/${MODE}` + (DG ? '/downgrade' : '');
    setTimeout(() => {
        client.publish(topic, JSON.stringify({id: DEV, url: IDX}), {qos: 1});
        console.log(t(), 'request sent', topic, JSON.stringify({id: DEV, url: IDX}));
    }, 1500);
});
const done = (code) => {
    ev.finished = new Date().toISOString();
    const OUT = '/tmp/v8canary';
    fs.mkdirSync(OUT, {recursive: true});
    fs.writeFileSync(`${OUT}/ota-${MODE}-${IMG}${DG ? '-downgrade' : ''}.json`, JSON.stringify(ev, null, 1));
    console.log('RUNNER-DONE events=' + ev.events.length + ' progress=' + ev.progress.length);
    client.end(true);
    process.exit(code);
};
if (MODE === 'check') setTimeout(() => done(ev.events.some((e) => /"status":"/.test(JSON.stringify(e))) ? 0 : 3), 40_000);
else {
    // terminal state: explicit response, or availability flip after long silence
    let sawUpdateResponse = false;
    setInterval(() => {
        if (ev.events.some((e) => e.topic.endsWith('/update') && /"status":"(ok|error)"/.test(e.data))) sawUpdateResponse = true;
    }, 1000);
    setTimeout(() => done(sawUpdateResponse ? 0 : 3), 2_100_000); // 35 min cap; WU4 took ~20 min
}
setInterval(() => console.log(t(), 'waiting...', 'progress=' + ev.progress.length, 'responses=' + ev.events.length), 60_000);
