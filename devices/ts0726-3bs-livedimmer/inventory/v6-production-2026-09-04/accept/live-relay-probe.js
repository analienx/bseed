'use strict';
// LIVE probe: baseline local-relay + multistate reads, then watch log window while
// operator presses, then post-reads + count device->coordinator receives in between.
// READ-ONLY except marker file. Run BEFORE presses (pre phase), then after (post).
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const phase = process.argv[2] || 'pre';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-live-' + phase + '-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const got = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
client.on('message', (topic, payload) => {
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    try { const j = JSON.parse(payload.toString()); for (const k of Object.keys(j)) if (k.startsWith('lv_') && !(k in got)) got[k] = j[k]; } catch (e) {}
});
async function r(ep, cluster, attrs, tag) {
    await new Promise((res) => client.publish(`zigbee2mqtt/${DEV}/${ep}/set`, JSON.stringify({read: {cluster, attributes: attrs, state_property: tag}}), {qos: 1}, res));
    const start = Date.now();
    while (Date.now() - start < 14_000) { if (Object.keys(got).some((k) => k.startsWith(tag))) return; await wait(300); }
    got[tag] = {__timeout: true};
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(600);
    if (phase === 'pre') fs.writeFileSync('/tmp/live-t0.txt', String(Date.now()));
    await r('relay_left', 'genOnOff', [0], `lv_${phase}_onoff4`);
    await r('relay_middle', 'genOnOff', [0], `lv_${phase}_onoff5`);
    await r('relay_right', 'genOnOff', [0], `lv_${phase}_onoff6`);
    await r('switch_left', 'genMultistateInput', [85], `lv_${phase}_ms1`);
    await r('switch_middle', 'genMultistateInput', [85], `lv_${phase}_ms2`);
    await r('switch_right', 'genMultistateInput', [85], `lv_${phase}_ms3`);
    const out = {phase, at_utc: new Date().toISOString(), reads: got};
    fs.writeFileSync('/tmp/live-' + phase + '.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
