'use strict';
// Decisive retry of RIGHT bound=Never via the endpoint-scoped command topic
// (the documented HA command_topic), then raw EP3 0xff05 read. Captures any
// set-failure from bridge/logging. One policy write; no bind/group/OTA.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-ff05b-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const r = {started_utc: new Date().toISOString(), log: [], raw: {}};
const t = () => new Date().toISOString().slice(11, 23);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const pub = (topic, payload) => new Promise((res) => client.publish(topic, payload === '' ? '' : JSON.stringify(payload), {qos: 1}, res));
client.on('message', (topic, payload) => {
    const s = payload.toString();
    if (topic === 'zigbee2mqtt/bridge/logging') {
        if (/binded_mode|set.*fail|error|invalid|status|Cannot|unable/i.test(s) && !/'get'/.test(s)) r.log.push({at: t(), text: s.slice(0, 300)});
    }
    if (topic === 'zigbee2mqtt/' + DEV) {
        try { const j = JSON.parse(s); for (const k of Object.keys(j)) if (/^rprobe_/.test(k)) r.raw[k + '@' + t()] = j[k]; } catch (e) {}
    }
});
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(['zigbee2mqtt/' + DEV, 'zigbee2mqtt/bridge/logging'], res));
    await wait(1200);
    // endpoint-scoped command topic exactly as advertised
    await pub(`zigbee2mqtt/${DEV}/switch_right/set`, {switch_right_binded_mode: 'Never (disabled)'});
    r.log.push({at: t(), text: 'PUBLISHED endpoint-scoped SET Never (disabled)'});
    await wait(8000);
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [65285], state_property: 'rprobe_ff05', endpoint: 'switch_right'}});
    await wait(12000);
    r.finished_utc = new Date().toISOString();
    fs.writeFileSync('/tmp/v6prod-20260904-ff05b.json', JSON.stringify(r, null, 1));
    console.log(JSON.stringify(r, null, 1));
    client.end(true);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { try { fs.writeFileSync('/tmp/v6prod-20260904-ff05b.json', JSON.stringify(r, null, 1)); } catch (e) {} console.log(JSON.stringify({timeout: true, log: r.log, raw: r.raw})); process.exit(1); }, 45_000);
