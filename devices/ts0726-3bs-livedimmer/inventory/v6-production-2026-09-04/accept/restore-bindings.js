'use strict';
// OPERATOR-AUTHORIZED topology repair (2026-09-04 ~22:45 CEST chat: "I restore
// programmatically (override)"). Re-adds EXACTLY the pre-rejoin binding table
// recovered from Sep-2 captures (v6-software-live-2026-09-03/baseline/bridge-before.json).
// 10 bind requests = 20 bindings; 6 configure_reporting requests. No unbinds, no deletions.
// attr0 relay reporting entries from the capture were SKIPPED (redundant with onOff attr).
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-rst-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const D = 'LivingRoomMainDimmer';
const BIND = 'zigbee2mqtt/bridge/request/device/bind';
const REP = 'zigbee2mqtt/bridge/request/device/configure_reporting';
// Z2M 2.14 schema (verified against /app/dist/extension/bind.js):
// from/to = device key | 'coordinator' | group name; endpoints = SEPARATE numeric fields.
const DIMF = 'LivingRoomMainDimmer';
const reqs = [
    [BIND, {from: DIMF, from_endpoint: 1, to: 'coordinator', to_endpoint: 1, clusters: ['genMultistateInput', 'genOnOff', 'genLevelCtrl']}],
    [BIND, {from: DIMF, from_endpoint: 2, to: 'coordinator', to_endpoint: 1, clusters: ['genMultistateInput', 'genOnOff', 'genLevelCtrl']}],
    [BIND, {from: DIMF, from_endpoint: 3, to: 'coordinator', to_endpoint: 1, clusters: ['genMultistateInput', 'genOnOff', 'genLevelCtrl']}],
    [BIND, {from: DIMF, from_endpoint: 4, to: 'coordinator', to_endpoint: 1, clusters: ['genOnOff', 'genLevelCtrl']}],
    [BIND, {from: DIMF, from_endpoint: 5, to: 'coordinator', to_endpoint: 1, clusters: ['genOnOff', 'genLevelCtrl']}],
    [BIND, {from: DIMF, from_endpoint: 6, to: 'coordinator', to_endpoint: 1, clusters: ['genOnOff']}],
    [BIND, {from: DIMF, from_endpoint: 1, to: 'LivingRoomLinearDimmer', to_endpoint: 11, clusters: ['genOnOff', 'genLevelCtrl']}],
    [BIND, {from: DIMF, from_endpoint: 1, to: DIMF, to_endpoint: 4, clusters: ['genOnOff']}],
    [BIND, {from: DIMF, from_endpoint: 2, to: 'Kitchen Table Bulbs', clusters: ['genOnOff', 'genLevelCtrl']}],
    [BIND, {from: DIMF, from_endpoint: 2, to: DIMF, to_endpoint: 5, clusters: ['genOnOff']}],
    [REP, {id: D, endpoint: 'switch_left', cluster: 'genMultistateInput', attribute: 'presentValue', minimum_report_interval: 0, maximum_report_interval: 65000, reportable_change: 1}],
    [REP, {id: D, endpoint: 'switch_middle', cluster: 'genMultistateInput', attribute: 'presentValue', minimum_report_interval: 0, maximum_report_interval: 65000, reportable_change: 1}],
    [REP, {id: D, endpoint: 'switch_right', cluster: 'genMultistateInput', attribute: 'presentValue', minimum_report_interval: 0, maximum_report_interval: 65000, reportable_change: 1}],
    [REP, {id: D, endpoint: 'relay_left', cluster: 'genOnOff', attribute: 'onOff', minimum_report_interval: 0, maximum_report_interval: 300, reportable_change: 0}],
    [REP, {id: D, endpoint: 'relay_middle', cluster: 'genOnOff', attribute: 'onOff', minimum_report_interval: 0, maximum_report_interval: 300, reportable_change: 0}],
    [REP, {id: D, endpoint: 'relay_right', cluster: 'genOnOff', attribute: 'onOff', minimum_report_interval: 0, maximum_report_interval: 65000, reportable_change: 1}],
];
let pending = null;
const results = [];
client.on('message', (topic, payload) => {
    if (!pending || topic !== pending.resp) return;
    try { pending.resolve(JSON.parse(payload.toString())); } catch (e) { pending.resolve({status: 'PARSE_ERR'}); }
});
async function one(topic, payload) {
    const resp = topic.replace('/request/', '/response/');
    return await new Promise((resolve, reject) => {
        const to = setTimeout(() => { pending = null; reject(new Error('resp timeout')); }, 30_000);
        pending = {resp, resolve: (v) => { clearTimeout(to); pending = null; resolve(v); }};
        client.subscribe(resp, () => client.publish(topic, JSON.stringify(payload), {qos: 1}));
    });
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    for (const [topic, payload] of reqs) {
        const label = payload.from ? `${payload.from}/EP${payload.from_endpoint}->${payload.to}/EP${payload.to_endpoint}` : payload.id + '/' + payload.endpoint + ' ' + payload.cluster;
        let r;
        try { r = await one(topic, payload); } catch (e) { r = {status: 'error', error: e.message}; }
        results.push({at: new Date().toISOString(), topic: topic.split('/').slice(-2).join('/'), label, payload, status: r.status, error: r.error || null});
        console.log(`${r.status} ${label} ${r.error || ''}`);
        await wait(400);
    }
    const ok = results.filter((x) => x.status === 'ok' || x.status === 'ok' + '').length;
    console.log(`DONE ok=${ok} fail=${results.length - ok}`);
    fs.writeFileSync('/tmp/restore-result.json', JSON.stringify(results, null, 1));
    client.end(true);
    process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
