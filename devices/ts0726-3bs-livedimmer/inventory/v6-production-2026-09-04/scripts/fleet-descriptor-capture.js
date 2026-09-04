'use strict';
// READ-ONLY retained-bridge capture for the V6 production work unit.
// Runs inside the Z2M container: node /tmp/v6prod-20260904/fleet-descriptor-capture.js
// (NODE_PATH must include /app/node_modules). Writes
// /tmp/v6prod-20260904/capture/{bridge-devices,bridge-groups,bridge-info,descriptors-merged}.json
// Credentials are read from the live config and NEVER printed.
const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');
const yaml = require('js-yaml');

const OUT = '/tmp/v6prod-20260904/capture';
fs.mkdirSync(OUT, {recursive: true});

const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const mqttCfg = cfg.mqtt || {};
if (!mqttCfg.server) { console.error('NO_MQTT_SERVER_IN_CONFIG'); process.exit(1); }

const client = mqtt.connect(mqttCfg.server, {
    clientId: 'bseed-v6prod-capture-' + Math.random().toString(16).slice(2, 8),
    username: mqttCfg.user,
    password: mqttCfg.password,
    reconnectPeriod: 0,
    connectTimeout: 10_000,
});

const wanted = {
    'zigbee2mqtt/bridge/devices': 'bridge-devices.json',
    'zigbee2mqtt/bridge/groups': 'bridge-groups.json',
    'zigbee2mqtt/bridge/info': 'bridge-info.json',
};
const seen = {};
let done = false;

function normalizeEndpoints(endpoints) {
    if (!endpoints) return [];
    const list = Array.isArray(endpoints)
        ? endpoints
        : Object.entries(endpoints).map(([id, ep]) => ({ID: Number(id), ...ep}));
    return list.map((ep) => ({
        ID: ep.ID ?? ep.endpoint_id, status: ep.status,
        input_clusters: ep.input_clusters, output_clusters: ep.output_clusters,
    }));
}

function finish(partials) {
    if (done) return;
    done = true;
    for (const [file, obj] of Object.entries(seen)) {
        fs.writeFileSync(path.join(OUT, file), JSON.stringify(obj, null, 2));
    }
    const devices = Array.isArray(seen['bridge-devices.json']) ? seen['bridge-devices.json'] : [];
    const merged = devices.map((d) => ({
        ieee: d.ieee_address,
        friendly_name: d.friendly_name,
        modelID: d.model_id ?? null,
        manufacturerName: d.manufacturer ?? null,
        swBuildId: d.software_build_id ?? null,
        dateCode: d.date_code ?? null,
        type: d.type,
        disabled: d.disabled,
        interview: {completed: d.interview_completed, state: d.interview_state, interviewing: d.interviewing},
        definition_now: d.definition ? {
            model: d.definition.model, vendor: d.definition.vendor,
            source: d.definition.source, description: d.definition.description,
            exposes_count: Array.isArray(d.definition.exposes) ? d.definition.exposes.length : null,
        } : null,
        endpoints: normalizeEndpoints(d.endpoints),
    }));
    fs.writeFileSync(path.join(OUT, 'descriptors-merged.json'), JSON.stringify(merged, null, 2));
    console.log(JSON.stringify({
        status: partials && Object.keys(seen).length < Object.keys(wanted).length ? 'PARTIAL' : 'PASS',
        captured_utc: new Date().toISOString(),
        bridgeDevices: devices.length,
        files: fs.readdirSync(OUT),
    }));
    client.end(true);
    process.exit(partials && Object.keys(seen).length < Object.keys(wanted).length ? 1 : 0);
}

client.on('message', (topic, payload) => {
    const file = wanted[topic];
    if (!file || seen[file]) return;
    try { seen[file] = JSON.parse(payload.toString()); } catch (e) { return; }
    if (Object.keys(seen).length === Object.keys(wanted).length) finish(false);
});
client.on('connect', () => client.subscribe(Object.keys(wanted), {qos: 0}));
client.on('error', (e) => { console.error('MQTT_ERROR', e.message); process.exit(1); });
setTimeout(() => finish(true), 25_000);
