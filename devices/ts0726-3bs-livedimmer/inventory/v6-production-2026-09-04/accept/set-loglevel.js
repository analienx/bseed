'use strict';
// One-shot hot log_level setter: node /tmp/set-loglevel.js <info|debug>
// Proves the change by reading configuration.yaml back. Restores nothing by itself.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const want = process.argv[2] || 'debug';
if (!/^(info|debug)$/.test(want)) { console.error('usage: set-loglevel.js <info|debug>'); process.exit(2); }
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-lvl-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
client.on('connect', () => {
    client.subscribe('zigbee2mqtt/bridge/response/options');
    setTimeout(() => client.publish('zigbee2mqtt/bridge/request/options', JSON.stringify({options: {advanced: {log_level: want}}}), {qos: 1}), 500);
});
client.on('message', (topic, payload) => {
    if (topic !== 'zigbee2mqtt/bridge/response/options') return;
    const j = JSON.parse(payload.toString());
    const after = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
    console.log(JSON.stringify({want, response_status: j.status, log_level_now: (after.advanced || {}).log_level}));
    client.end(true);
    process.exit(j.status === 'ok' && (after.advanced || {}).log_level === want ? 0 : 1);
});
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 20_000);
