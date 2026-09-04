'use strict';
// Isolated step-3 test: ONLY a public GET on switch_right_binded_mode (no raw read
// confounder). Barrier set after subscribe's retained flush so only a value that
// the GET's convertGet->readResponse->fromZigbee decode RE-publishes counts.
// Read-only. No SET, no raw read.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-iso-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const r = {started_utc: new Date().toISOString(), retained_snapshot: null, publishes_after_get: []};
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
let barrierOn = false;
client.on('message', (topic, payload) => {
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    let j; try { j = JSON.parse(payload.toString()); } catch (e) { return; }
    const has = 'switch_right_binded_mode' in j || 'switch_right_binded_mode_switch_right' in j;
    if (!barrierOn) { if (has) r.retained_snapshot = {base: j.switch_right_binded_mode ?? null, ep: j.switch_right_binded_mode_switch_right ?? null}; return; }
    if (has) r.publishes_after_get.push({at: new Date().toISOString().slice(11, 23), base: j.switch_right_binded_mode ?? null, ep: j.switch_right_binded_mode_switch_right ?? null});
});
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(2500); // absorb retained publish (sets r.retained_snapshot)
    barrierOn = true; // from now only count GET-driven republishes
    client.publish(`zigbee2mqtt/${DEV}/get`, JSON.stringify({switch_right_binded_mode: ''}), {qos: 1});
    r.get_issued_at = new Date().toISOString().slice(11, 23);
    await wait(14_000);
    const final = r.publishes_after_get.length ? r.publishes_after_get[r.publishes_after_get.length - 1] : null;
    r.verdict = {retained_before: r.retained_snapshot, after_get: final,
        converged_to_truth: !!(final && final.base === 'Short press') || !!(final && final.ep === 'Short press')};
    fs.writeFileSync('/tmp/v9/capture/convergence-isolated.json', JSON.stringify(r, null, 1));
    console.log(JSON.stringify(r.verdict, null, 1));
    client.end(true);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { try { fs.writeFileSync('/tmp/v9/capture/convergence-isolated.json', JSON.stringify(r, null, 1)); } catch (e) {} console.log(JSON.stringify({timeout: true, r})); process.exit(1); }, 30_000);
