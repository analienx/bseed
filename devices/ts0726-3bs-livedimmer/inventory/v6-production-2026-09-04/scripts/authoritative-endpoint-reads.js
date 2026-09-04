'use strict';
// AUTHORITATIVE re-verification via endpoint-scoped topics ONLY (proven to route to EP3/EP2/EP1).
// Reads: genOnOffSwitchCfg 0xff05 + 0x0010 + 0xff06 on EP1/EP2/EP3; genBasic swBuildId on EP1.
// READ-ONLY. Unique state_property per read; capture by suffix.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-auth-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const got = {};
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
client.on('message', (topic, payload) => {
    try {
        const j = JSON.parse(payload.toString());
        for (const k of Object.keys(j)) if (k.startsWith('a_') && !(k in got)) got[k] = {value: j[k], at: new Date().toISOString().slice(11, 19)};
    } catch (e) {}
});
function readOne(ep, cluster, attrs, tag) {
    return new Promise((resolve) => {
        client.publish(`zigbee2mqtt/${DEV}/${ep}/set`, JSON.stringify({read: {cluster, attributes: attrs, state_property: tag}}), {qos: 1}, async () => {
            const start = Date.now();
            const fullKey = (candidateKeys) => candidateKeys;
            while (Date.now() - start < 12_000) {
                await wait(300);
                if (Object.keys(got).some((k) => k === tag || k.startsWith(tag + '_'))) return resolve(true);
            }
            return resolve(false);
        });
    });
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(800);
    const eps = [['switch_left', 'ep1'], ['switch_middle', 'ep2'], ['switch_right', 'ep3']];
    for (const [ep, n] of eps) {
        await readOne(ep, 'genOnOffSwitchCfg', [65285], `a_${n}_ff05`);
        await readOne(ep, 'genOnOffSwitchCfg', [16], `a_${n}_std0010`);
        await readOne(ep, 'genOnOffSwitchCfg', [65286], `a_${n}_ff06`);
    }
    await readOne('switch_left', 'genBasic', ['swBuildId'], 'a_ep1_swbuild');
    const out = {started_utc: new Date().toISOString(), reads: got};
    fs.writeFileSync('/tmp/v9-authoritative.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { try { fs.writeFileSync('/tmp/v9-authoritative.json', JSON.stringify({got, timeout: true}, null, 1)); } catch (e) {} console.log(JSON.stringify({got, timeout: true})); process.exit(1); }, 200_000);
