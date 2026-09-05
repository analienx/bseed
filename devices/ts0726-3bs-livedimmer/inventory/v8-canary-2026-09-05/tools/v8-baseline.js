'use strict';
// V8 canary PRE-OTA baseline (READ-ONLY). Ruling 5552730292 section 3.
// Usage: node v8-baseline.js pre
// Writes /tmp/v8canary/<tag>/ JSON evidence. No device writes (raw reads only).
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const IEEE = '0xa4c13843a9d40f85';
const TAG = (process.argv[2] || 'pre').replace(/[^a-z0-9]/gi, '');
const OUT = '/tmp/v8canary/' + TAG;
fs.mkdirSync(OUT, {recursive: true});
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-v8-' + TAG + '-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = {devices: null, groups: null, payload: null, availability: null};
const got = {};
const tagKey = (t) => 'v8' + TAG + '_' + t;

client.on('message', (topic, payload) => {
    const s = payload.toString();
    try {
        if (topic === 'zigbee2mqtt/bridge/devices') state.devices = JSON.parse(s);
        else if (topic === 'zigbee2mqtt/bridge/groups') state.groups = JSON.parse(s);
        else if (topic === 'zigbee2mqtt/' + DEV) {
            const j = JSON.parse(s);
            for (const k of Object.keys(j)) {
                if (k.startsWith('v8' + TAG) && !(k in got)) got[k] = j[k];
            }
            if (j.update !== undefined) state.payload = j;
        }
        else if (topic === 'zigbee2mqtt/' + DEV + '/availability') state.availability = JSON.parse(s);
    } catch (e) { console.error('parse', topic, e.message); }
});

async function epRead(ep, cluster, attrs, tag) {
    const t = tagKey(tag);
    await new Promise((res) => client.publish(`zigbee2mqtt/${DEV}/${ep}/set`, JSON.stringify({read: {cluster, attributes: attrs, state_property: t}}), {qos: 1}, res));
    const start = Date.now();
    while (Date.now() - start < 14_000) { if (Object.keys(got).some((k) => k.startsWith(t))) return; await wait(300); }
    got[t] = {__timeout: true};
}

(async () => {
    await new Promise((res) => client.on('connect', res));
    await client.subscribe(['zigbee2mqtt/bridge/devices', 'zigbee2mqtt/bridge/groups', `zigbee2mqtt/${DEV}`, `zigbee2mqtt/${DEV}/availability`]);
    await wait(1500);
    // full device payload refresh (empty get = republish all exposes)
    await new Promise((res) => client.publish(`zigbee2mqtt/${DEV}/get`, '{}', {qos: 1}, res));
    await wait(4000);
    fs.writeFileSync(OUT + '/device-state.json', JSON.stringify(state.payload, null, 1));
    fs.writeFileSync(OUT + '/availability.json', JSON.stringify(state.availability, null, 1));

    // raw attribute reads EP1-3: 0xff00 switch type/standard action, 0xff05 binding mode, 0xff06 extended commands
    for (const [ep, tag] of [['switch_left', 'raw1'], ['switch_middle', 'raw2'], ['switch_right', 'raw3']]) {
        await epRead(ep, 'genOnOffSwitchCfg', [65280, 65285, 65286], tag);
    }
    await epRead('switch_left', 'genBasic', [65534, 16384], 'rawbasic');
    fs.writeFileSync(OUT + '/raw-attrs.json', JSON.stringify({at_utc: new Date().toISOString(), reads: got}, null, 1));

    // bridge snapshot + target extraction
    fs.writeFileSync(OUT + '/bridge-devices.json', JSON.stringify(state.devices, null, 1));
    fs.writeFileSync(OUT + '/bridge-groups.json', JSON.stringify(state.groups, null, 1));
    const target = (state.devices || []).find((d) => d.ieee_address === IEEE);
    if (target) {
        const eps = target.endpoints || {};
        const summary = {
            ieee: target.ieee_address,
            friendly_name: target.friendly_name,
            supported: target.supported,
            availability: target.availability,
            software_build_id: target.software_build_id,
            date_code: target.date_code,
            definition_model: target.definition && target.definition.model,
            endpoints: Object.fromEntries(Object.entries(eps).map(([k, v]) => [k, {
                bindings: v.bindings,
                configured_reportings: v.configured_reportings,
                scenes: v.scenes,
                clusters: Object.keys(v.clusters || {}),
            }])),
            binding_total: Object.values(eps).reduce((a, v) => a + (v.bindings || []).length, 0),
        };
        fs.writeFileSync(OUT + '/target-endpoints-summary.json', JSON.stringify(summary, null, 1));
        const lvlBinds = [];
        for (const [ep, v] of Object.entries(eps)) for (const b of v.bindings || []) {
            if (b.cluster === 'genLevelCtrl') lvlBinds.push({endpoint: ep, cluster: b.cluster, target: b.target});
        }
        fs.writeFileSync(OUT + '/level-binds-check.json', JSON.stringify({level_binds: lvlBinds, expect_absent_eps45_genLevelCtrl_coordinator: true}, null, 1));
    }
    const fleet = (state.devices || []).map((d) => ({ieee: d.ieee_address, sw: d.software_build_id, model: d.definition && d.definition.model}));
    fs.writeFileSync(OUT + '/fleet-fingerprint.json', JSON.stringify({count: fleet.length, devices: fleet}, null, 1));
    console.log('BASELINE-DONE tag=' + TAG + ' devices=' + (state.devices || []).length + ' payload=' + (state.payload ? 'yes' : 'no'));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
