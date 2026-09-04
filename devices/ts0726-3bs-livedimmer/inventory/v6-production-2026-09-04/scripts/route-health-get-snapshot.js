'use strict';
// READ-ONLY route-health snapshot: publishes ONLY to .../get (ZCL attribute reads).
// Never issues /set, writes, binds, OTA, or interview. Runs in-container.
const fs = require('fs');
const mqtt = require('mqtt');
const yaml = require('js-yaml');
const DEV = 'LivingRoomMainDimmer';
const OUT = '/tmp/v6prod-20260904/capture';
fs.mkdirSync(OUT, {recursive: true});
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-readonly-get-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 8000});

const props = [
    'device_config',
    'switch_left_action_mode', 'switch_middle_action_mode', 'switch_right_action_mode',
    'switch_left_binded_mode', 'switch_middle_binded_mode', 'switch_right_binded_mode',
    'relay_left_physical_mode', 'relay_middle_physical_mode', 'relay_right_physical_mode',
    'relay_left_indicator_mode', 'relay_middle_indicator_mode', 'relay_right_indicator_mode',
];
const collected = {};
const log = [];
let open = new Set(props);
const t0 = Date.now();

client.on('message', (topic, payload) => {
    const now = ((Date.now() - t0) / 1000).toFixed(1);
    log.push(`[${now}s] RX ${topic}: ${payload.toString().slice(0, 400)}`);
    if (topic === `zigbee2mqtt/${DEV}` || topic.endsWith(`/${DEV}`)) {
        try {
            const j = JSON.parse(payload.toString());
            for (const p of Object.keys(j)) {
                if (props.includes(p)) { collected[p] = {value: j[p], at_s: now}; open.delete(p); }
            }
        } catch (e) {}
    }
});
client.on('packetsend', (p) => { if (p.cmd === 'publish') log.push(`[${((Date.now()-t0)/1000).toFixed(1)}s] TX ${p.topic}: ${(p.payload ? Buffer.from(p.payload).toString() : '').slice(0, 200)}`); });
client.on('connect', () => {
    client.subscribe([`zigbee2mqtt/${DEV}`, `zigbee2mqtt/${DEV}/#`], () => {
        // Documented form: empty payload to <dev>/get reads all readable props.
        setTimeout(() => {
            client.publish(`zigbee2mqtt/${DEV}/get`, '', {qos: 1});
            log.push(`[${((Date.now()-t0)/1000).toFixed(1)}s] published empty-payload GET (read all)`);
        }, 1500);
    });
});
client.on('error', (e) => log.push('MQTT_ERROR ' + e.message));

setTimeout(() => {
    const result = {
        captured_utc: new Date().toISOString(),
        device: DEV,
        requested: props,
        answered: collected,
        timed_out_or_missing: [...open],
        mqtt_log: log,
        route_verdict: open.size === 0 ? 'ANSWERED_ALL' : (Object.keys(collected).length ? 'PARTIAL' : 'NO_RESPONSE'),
    };
    fs.writeFileSync(`${OUT}/route-health-get-snapshot.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({route_verdict: result.route_verdict, answered: Object.keys(collected).length, missing: [...open]}, null, 1));
    client.end(true);
    process.exit(0);
}, 40_000);
