'use strict';
// Read retained zigbee2mqtt/bridge/devices, dump LivingRoomMainDimmer endpoint table.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-devs-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
client.on('connect', () => client.subscribe('zigbee2mqtt/bridge/devices'));
client.on('message', (topic, payload) => {
    if (topic !== 'zigbee2mqtt/bridge/devices') return;
    const devs = JSON.parse(payload.toString());
    const d = devs.find((x) => x.friendly_name === 'LivingRoomMainDimmer');
    if (!d) { console.log('not found'); process.exit(1); }
    console.log(JSON.stringify({nwk: d.network_address ? '0x' + d.network_address.toString(16).toUpperCase() : null, ieee: d.ieee_address, interviewing: d.interviewing, interview_completed: d.interview_completed, endpoints: Object.fromEntries(Object.entries(d.endpoints || {}).map(([k, v]) => [k, {in: v.input_clusters, out: v.output_clusters}]))}, null, 1));
    process.exit(0);
});
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 15_000);
