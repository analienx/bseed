'use strict';
// Acceptance baseline: 0xff05 binded_mode on EP1/2/3 + 0xff03 indicator/mains policy on EP4/5/6.
// READ-ONLY via endpoint-scoped read SETs (proven pattern). Usage: node accept-baseline.js TAG
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const tag0 = (process.argv[2] || 'base').replace(/[^a-z0-9]/gi, '');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-ab-' + tag0 + '-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const got = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
client.on('message', (topic, payload) => {
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    try { const j = JSON.parse(payload.toString()); for (const k of Object.keys(j)) if (k.startsWith('ab' + tag0) && !(k in got)) got[k] = j[k]; } catch (e) {}
});
async function r(ep, cluster, attrs, tag) {
    const t = 'ab' + tag0 + '_' + tag;
    await new Promise((res) => client.publish(`zigbee2mqtt/${DEV}/${ep}/set`, JSON.stringify({read: {cluster, attributes: attrs, state_property: t}}), {qos: 1}, res));
    const start = Date.now();
    while (Date.now() - start < 14_000) { if (Object.keys(got).some((k) => k.startsWith(t))) return; await wait(300); }
    got[t] = {__timeout: true};
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(600);
    await r('switch_left', 'genOnOffSwitchCfg', [0xff05], 'ff05_l');
    await r('switch_middle', 'genOnOffSwitchCfg', [0xff05], 'ff05_m');
    await r('switch_right', 'genOnOffSwitchCfg', [0xff05], 'ff05_r');
    await r('relay_left', 'genOnOffSwitchCfg', [0xff03], 'ff03_l');
    await r('relay_middle', 'genOnOffSwitchCfg', [0xff03], 'ff03_m');
    await r('relay_right', 'genOnOffSwitchCfg', [0xff03], 'ff03_r');
    await r('relay_left', 'genOnOff', [0], 'on4');
    await r('relay_middle', 'genOnOff', [0], 'on5');
    await r('relay_right', 'genOnOff', [0], 'on6');
    const out = {tag: tag0, at_utc: new Date().toISOString(), reads: got};
    fs.writeFileSync('/tmp/ab-' + tag0 + '.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
