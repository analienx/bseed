'use strict';
// V7 OTA runner over the proven WU4 mechanism: per-request single-entry index URL.
// argv: check | update
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const IEEE = '0xa4c13843a9d40f85';
const IDX = 'http://127.0.0.1:8899/index-forward.json';
const MODE = process.argv[2];
if (!['check', 'update'].includes(MODE)) { console.error('mode?'); process.exit(2); }
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-ota-' + MODE + '-' + Math.random().toString(16).slice(2, 6), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000, keepalive: 60});
const ev = {mode: MODE, at: new Date().toISOString(), progress: [], events: []};
const t = () => new Date().toISOString().slice(11, 19);
client.on('message', (topic, payload) => {
    const s = payload.toString();
    if (topic.includes('bridge/response/device/ota_update')) { ev.events.push({at: t(), topic, data: s.slice(0, 600)}); }
    else if (topic === 'zigbee2mqtt/bridge/logging' && /ota/i.test(s)) ev.progress.push({at: t(), line: s.slice(0, 220)});
    else if (topic === `zigbee2mqtt/${DEV}/availability`) ev.events.push({at: t(), topic, data: s});
});
client.on('connect', () => {
    client.subscribe(['zigbee2mqtt/bridge/response/device/ota_update/check', 'zigbee2mqtt/bridge/response/device/ota_update/update', 'zigbee2mqtt/bridge/logging', `zigbee2mqtt/${DEV}/availability`]);
    const topic = `zigbee2mqtt/bridge/request/device/ota_update/${MODE}`;
    setTimeout(() => {
        client.publish(topic, JSON.stringify({id: DEV, url: IDX}), {qos: 1});
        console.log(t(), 'request sent', topic);
    }, 1500);
});
const done = () => {
    ev.finished = new Date().toISOString();
    fs.writeFileSync('/tmp/ota-' + MODE + '.json', JSON.stringify(ev, null, 1));
    console.log(JSON.stringify(ev, null, 1));
    client.end(true);
    process.exit(ev.events.some((e) => /"status":"(ok|error)"/.test(JSON.stringify(e))) ? 0 : 3);
};
if (MODE === 'check') setTimeout(done, 30_000);
else setTimeout(done, 1_900_000); // 31.6 min cap; WU4 took 19.9 min
setInterval(() => console.log(t(), 'waiting...', 'progress_events=' + ev.progress.length, 'responses=' + ev.events.length), 60_000);
