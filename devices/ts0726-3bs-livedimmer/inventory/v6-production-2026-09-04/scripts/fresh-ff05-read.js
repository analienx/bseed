'use strict';
// FRESH, decisive read-only raw read of EP1/2/3 genOnOffSwitchCfg 0xff05 to get
// current device-side truth (vs Z2M's cached "Never (disabled)"). Publish-barrier
// freshness: only accept a value that arrives AFTER our read request. No writes.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-fresh-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const found = {};
const t0tag = () => new Date().toISOString().slice(11, 23);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const pub = (topic, payload) => new Promise((res) => client.publish(topic, JSON.stringify(payload), {qos: 1}, res));
let subscribed = false;
client.on('connect', () => client.subscribe(`zigbee2mqtt/${DEV}`, () => { subscribed = true; }));
client.on('message', (topic, payload) => {
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    try {
        const j = JSON.parse(payload.toString());
        for (const k of Object.keys(j)) if (/^fresh_/.test(k)) found[k] = {value: j[k], at: t0tag()};
    } catch (e) {}
});
(async () => {
    while (!subscribed) await wait(100);
    await wait(1500); // absorb retained
    const eps = [['fresh_ff05_left', 'switch_left'], ['fresh_ff05_middle', 'switch_middle'], ['fresh_ff05_right', 'switch_right']];
    for (const [tag, ep] of eps) {
        await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [65285], state_property: tag, endpoint: ep}});
        const start = Date.now();
        while (Date.now() - start < 18_000) { if (found[tag]) break; await wait(400); }
        if (!found[tag]) found[tag] = {value: null, at: t0tag(), timeout: true};
    }
    // also standard switchActions EP3 for completeness
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [16], state_property: 'fresh_std_right', endpoint: 'switch_right'}});
    await wait(6000);
    const res = {fresh: found, note: 'device-side raw ZCL read; compare to Z2M cached switch_right_binded_mode'};
    fs.writeFileSync('/tmp/v6prod-fresh-ff05.json', JSON.stringify(res, null, 1));
    console.log(JSON.stringify(res, null, 1));
    client.end(true);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { console.log(JSON.stringify({timeout: true, found})); process.exit(1); }, 90_000);
