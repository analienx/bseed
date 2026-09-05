'use strict';
// Bounded MQTT observer for the LEFT acceptance tail (NO log_level change, NO device mutation).
// Subscribes zigbee2mqtt/#, records ONLY LivingRoomMainDimmer / LivingRoomLinearDimmer topics,
// runs max 600 s, writes JSONL lines {at, topic, payload}.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-cap-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const out = fs.createWriteStream('/tmp/left-events.jsonl', {flags: 'a'});
const t0 = Date.now();
client.on('connect', () => { client.subscribe('zigbee2mqtt/#'); out.write(JSON.stringify({at: new Date().toISOString(), topic: '_captured', note: 'observer started'}) + '\n'); });
client.on('message', (topic, payload) => {
    if (!/LivingRoomMainDimmer|LivingRoomLinearDimmer/.test(topic)) return;
    if (/homeassistant/.test(topic)) return;
    if (Date.now() - t0 > 600_000) { out.write(JSON.stringify({at: new Date().toISOString(), topic: '_captured', note: '600s cap reached'}) + '\n'); out.end(() => process.exit(0)); }
    out.write(JSON.stringify({at: new Date().toISOString(), topic, payload: payload.toString().slice(0, 400)}) + '\n');
});
setTimeout(() => { out.write(JSON.stringify({at: new Date().toISOString(), topic: '_captured', note: '600s cap (timer)'}) + '\n'); out.end(() => process.exit(0)); }, 610_000);
