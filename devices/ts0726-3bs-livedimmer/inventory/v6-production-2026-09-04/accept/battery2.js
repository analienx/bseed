'use strict';
// Fresh post-restart battery (READ-ONLY). NO 0xff03 probing per audit item 4.
// Usage: node battery2.js TAG
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const tag0 = (process.argv[2] || 'bat').replace(/[^a-z0-9]/gi, '');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-b2-' + tag0 + '-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const got = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
client.on('message', (topic, payload) => {
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    try { const j = JSON.parse(payload.toString()); for (const k of Object.keys(j)) if (k.startsWith('b2' + tag0) && !(k in got)) got[k] = j[k]; } catch (e) {}
});
async function r(ep, cluster, attrs, tag) {
    const t = 'b2' + tag0 + '_' + tag;
    await new Promise((res) => client.publish(`zigbee2mqtt/${DEV}/${ep}/set`, JSON.stringify({read: {cluster, attributes: attrs, state_property: t}}), {qos: 1}, res));
    const start = Date.now();
    while (Date.now() - start < 14_000) { if (Object.keys(got).some((k) => k.startsWith(t))) return; await wait(300); }
    got[t] = {__timeout: true};
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(600);
    await r('switch_left', 'genOnOffSwitchCfg', [65280, 65285, 65286], 'sw1');
    await r('switch_middle', 'genOnOffSwitchCfg', [65280, 65285, 65286], 'sw2');
    await r('switch_right', 'genOnOffSwitchCfg', [65280, 65285, 65286], 'sw3');
    await r('switch_left', 'genBasic', [65534], 'swbuild');
    await r('relay_left', 'genOnOff', [0], 'on4');
    await r('relay_middle', 'genOnOff', [0], 'on5');
    await r('relay_right', 'genOnOff', [0], 'on6');
    const out = {tag: tag0, at_utc: new Date().toISOString(), reads: got};
    fs.writeFileSync('/tmp/bat-' + tag0 + '.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
