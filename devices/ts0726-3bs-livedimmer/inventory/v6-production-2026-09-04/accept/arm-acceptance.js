'use strict';
// Arm: hot-enable debug + baseline endpoint-scoped reads. No device writes.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-arm-' + Math.random().toString(16).slice(2, 6), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const got = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
client.on('message', (topic, payload) => {
    if (topic === `zigbee2mqtt/${DEV}`) { try { const j = JSON.parse(payload.toString()); for (const k of Object.keys(j)) if (/^base_/.test(k) && !(k in got)) got[k] = j[k]; } catch (e) {} }
});
function optionsReq(options) {
    return new Promise((resolve) => {
        const onData = (topic, payload) => {
            if (topic !== 'zigbee2mqtt/bridge/response/options') return;
            let j; try { j = JSON.parse(payload.toString()); } catch (e) { return; }
            if (typeof j.status === 'undefined') return;
            client.removeListener('message', onData);
            resolve(j);
        };
        client.on('message', onData);
        client.publish('zigbee2mqtt/bridge/request/options', JSON.stringify({options}), {qos: 1});
    });
}
async function r(ep, cluster, attrs, tag) {
    await new Promise((res) => client.publish(`zigbee2mqtt/${DEV}/${ep}/set`, JSON.stringify({read: {cluster, attributes: attrs, state_property: tag}}), {qos: 1}, res));
    const start = Date.now();
    while (Date.now() - start < 15_000) { if (Object.keys(got).some((k) => k.startsWith(tag))) return; await wait(300); }
    got[tag] = {__timeout: true};
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(800);
    const dbg = await optionsReq({advanced: {log_level: 'debug'}});
    await wait(800);
    await r('switch_left', 'genOnOffSwitchCfg', [65285], 'base_ff05');
    await r('relay_left', 'genOnOff', [65283], 'base_pol4');
    await r('relay_middle', 'genOnOff', [65283], 'base_pol5');
    await r('relay_right', 'genOnOff', [65283], 'base_pol6');
    await r('relay_right', 'genOnOff', [0], 'base_onoff6');
    await r('relay_right', 'genOnOff', [65282], 'base_led6');
    const cfgAfter = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
    const out = {at_utc: new Date().toISOString(), debug_enable_status: dbg.status, log_level_now: (cfgAfter.advanced || {}).log_level, baseline: got};
    fs.writeFileSync('/tmp/arm.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
