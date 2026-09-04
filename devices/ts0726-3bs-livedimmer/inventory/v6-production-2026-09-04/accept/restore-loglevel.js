'use strict';
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-restore-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
client.on('connect', () => {
    client.subscribe('zigbee2mqtt/bridge/response/options');
    setTimeout(() => client.publish('zigbee2mqtt/bridge/request/options', JSON.stringify({options: {advanced: {log_level: 'info'}}}), {qos: 1}), 500);
});
client.on('message', (topic, payload) => {
    if (topic !== 'zigbee2mqtt/bridge/response/options') return;
    const j = JSON.parse(payload.toString());
    const after = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
    console.log(JSON.stringify({response_status: j.status, log_level_now: (after.advanced || {}).log_level}));
    client.end(true);
    process.exit(j.status === 'ok' && (after.advanced || {}).log_level === 'info' ? 0 : 1);
});
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 20_000);
