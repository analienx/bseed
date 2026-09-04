'use strict';
// Convergence re-test with STRICT publish barrier: only accepts a
// switch_right_binded_mode value arriving in a publish AFTER the GET was issued.
// Read-only (raw read + public get). No SET.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-conv2-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const r = {started_utc: new Date().toISOString()};
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const pub = (topic, payload) => new Promise((res) => client.publish(topic, payload === '' ? '' : JSON.stringify(payload), {qos: 1}, res));
let barrier = 0; // ms epoch; only count publishes arriving after it
const samples = [];
client.on('message', (topic, payload) => {
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    const now = Date.now();
    try {
        const j = JSON.parse(payload.toString());
        if (now > barrier && ('switch_right_binded_mode' in j || 'switch_right_binded_mode_switch_right' in j)) {
            samples.push({at: new Date(now).toISOString().slice(11, 23), base: j.switch_right_binded_mode ?? null, ep: j.switch_right_binded_mode_switch_right ?? null, raw: j.conv2_ff05 ?? null, all_keys: Object.keys(j).length});
        }
        if (now > barrier && 'conv2_ff05' in j) {
            samples.push({at: new Date(now).toISOString().slice(11, 23), raw_only: j.conv2_ff05});
        }
    } catch (e) {}
});
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(2500); // absorb retained publishes
    // what does the CURRENT state say right now? (last publish wins probe: retained)
    r.current_cache = samples.length ? samples[0] : null;
    // snapshot retained value precisely via a fresh subscribe echo: publish nothing, read last retained from broker by re-subscribing
    // simpler: request the raw attribute FIRST (device truth)
    barrier = Date.now();
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [65285], state_property: 'conv2_ff05', endpoint: 'switch_right'}});
    await wait(8000);
    // now the public GET (convertGet -> readResponse -> fz correction -> publish)
    barrier = Date.now();
    await pub(`zigbee2mqtt/${DEV}/get`, {switch_right_binded_mode: ''});
    await wait(12000);
    r.samples_after_barriers = samples;
    const binded = samples.filter((s) => 'base' in s);
    r.last_published = binded.length ? binded[binded.length - 1] : null;
    r.verdict_raw = (samples.find((s) => s.raw_only) || {}).raw_only ?? null;
    r.converged = !!(r.last_published && (r.last_published.base === 'Short press' || r.last_published.ep === 'Short press'));
    fs.writeFileSync('/tmp/v9/capture/convergence2.json', JSON.stringify(r, null, 1));
    console.log(JSON.stringify({verdict_raw: r.verdict_raw, last_published: r.last_published, converged: r.converged, samples: samples.length}, null, 1));
    client.end(true);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { try { fs.writeFileSync('/tmp/v9/capture/convergence2.json', JSON.stringify({...r, samples_after_barriers: samples, timeout: true}, null, 1)); } catch (e) {} console.log(JSON.stringify({timeout: true, samples})); process.exit(1); }, 40_000);
