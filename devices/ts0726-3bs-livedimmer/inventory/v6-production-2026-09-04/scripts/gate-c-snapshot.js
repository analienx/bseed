'use strict';
// Gate C decisive snapshot — READ-ONLY. Runs in-container (NODE_PATH=/app/node_modules).
// 1) per-EP standard 0x0010 reads via native generic `read` converter
// 2) fresh EP1 genBasic swBuildId read
// 3) batched public GET of all profile-relevant properties, generous window
// 4) fresh retained bridge/devices re-capture (bind tables view)
// No /set property writes, no binds, no OTA. Publishes only: /set{"read":...}, /get, subscribes.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');

const DEV = 'LivingRoomMainDimmer';
const OUT = '/tmp/v6prod-20260904-gateC.json';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-gateC-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});

const props = [
    'device_config',
    'switch_left_action_mode', 'switch_middle_action_mode', 'switch_right_action_mode',
    'switch_left_binded_mode', 'switch_middle_binded_mode', 'switch_right_binded_mode',
    'relay_left_physical_mode', 'relay_middle_physical_mode', 'relay_right_physical_mode',
    'relay_left_indicator_mode', 'relay_middle_indicator_mode', 'relay_right_indicator_mode',
    'switch_left_relay_mode', 'switch_middle_relay_mode', 'switch_right_relay_mode',
    'switch_left_relay_index', 'switch_middle_relay_index', 'switch_right_relay_index',
    'state_relay_left', 'state_relay_middle', 'state_relay_right',
];
const result = {started_utc: new Date().toISOString(), abi_reads: {}, get_answers: {}, publishes: [], errors: [], timeline: []};
const t = () => new Date().toISOString().slice(11, 23);

function onState(payloadStr) {
    let j; try { j = JSON.parse(payloadStr); } catch (e) { return; }
    for (const k of Object.keys(j)) {
        if (props.includes(k) && !(k in result.get_answers)) {
            result.get_answers[k] = {value: j[k], at: t()};
        }
        if (k.startsWith('abi_')) result.abi_reads[k] = {value: j[k], at: t()};
    }
}

let stage = 'connect';
const done = {};
function maybeFinish() {
    if (done.probe && done.get && done.bridge) finish();
}

client.on('connect', () => {
    client.subscribe(['zigbee2mqtt/' + DEV, 'zigbee2mqtt/' + DEV + '/set', 'zigbee2mqtt/bridge/devices', 'zigbee2mqtt/bridge/log'], () => stage = 'subbed');
});
client.on('message', (topic, payload) => {
    const s = payload.toString();
    if (topic === 'zigbee2mqtt/bridge/devices') {
        if (!done.bridge) {
            done.bridge = true;
            try {
                const dev = JSON.parse(s).find((x) => x.ieee_address === '0xa4c13843a9d40f85');
                result.bridge_devices_target = dev ? {
                    definition: dev.definition && {model: dev.definition.model, description: dev.definition.description},
                    software_build_id: dev.software_build_id,
                    endpoints: Object.fromEntries(Object.entries(dev.endpoints || {}).map(([id, e]) => [id, {bindings: e.bindings, configured_reportings: e.configured_reportings}])),
                } : 'TARGET_ABSENT';
            } catch (e) { result.bridge_parse_error = String(e); }
            maybeFinish();
        }
        return;
    }
    if (topic === 'zigbee2mqtt/' + DEV) onState(s);
    if (topic === 'zigbee2mqtt/' + DEV + '/set' || /response/.test(topic)) result.timeline.push({at: t(), topic, payload: s.slice(0, 200)});
    if (/error/i.test(s) && s.includes(DEV)) result.errors.push({at: t(), text: s.slice(0, 400)});
});
client.on('error', (e) => result.errors.push({at: t(), text: 'MQTT ' + e.message}));

const publish = (topic, payload) => new Promise((res) => client.publish(topic, JSON.stringify(payload), {qos: 1}, res));

function finish() {
    if (finish.done) return;
    finish.done = true;
    result.finished_utc = new Date().toISOString();
    const missing = props.filter((p) => !(p in result.get_answers));
    result.verdict = {
        abi: result.abi_reads,
        missing_props: missing,
        fresh_reads_answered: Object.keys(result.get_answers).length,
        route: (missing.length === 0 && Object.keys(result.abi_reads).length >= 3) ? 'HEALTHY_ALL_ANSWERED'
            : (Object.keys(result.get_answers).length + Object.keys(result.abi_reads).length > 0 ? 'PARTIAL' : 'DEAD'),
    };
    fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
    console.log(JSON.stringify({route: result.verdict.route, abi_keys: Object.keys(result.abi_reads), answered: Object.keys(result.get_answers).length, missing}, null, 1));
    client.end(true);
    process.exit(0);
}

function waitForAbi(keyPrefix, timeoutMs) {
    return new Promise((res) => {
        const start = Date.now();
        const iv = setInterval(() => {
            if (Object.keys(result.abi_reads).some((k) => k.startsWith(keyPrefix))) { clearInterval(iv); res(true); }
            else if (Date.now() - start > timeoutMs) { clearInterval(iv); res(false); }
        }, 500);
    });
}

(async () => {
    await new Promise((res) => { const iv = setInterval(() => { if (stage === 'subbed') { clearInterval(iv); res(); } }, 200); });

    // stage 1: per-EP standard reads (read-only generic converter); publish key gets _<endpoint> suffix
    let probeOk = 0;
    for (const ep of ['switch_left', 'switch_middle', 'switch_right']) {
        const key = 'abi_switchactions_' + ep.replace('switch_', '');
        await publish('zigbee2mqtt/' + DEV + '/set', {
            read: {cluster: 'genOnOffSwitchCfg', attributes: [16], state_property: key, endpoint: ep},
        });
        if (await waitForAbi(key, 22_000)) probeOk++;
    }
    let swbuildOk = false;
    await publish('zigbee2mqtt/' + DEV + '/set', {
        read: {cluster: 'genBasic', attributes: ['swBuildId'], state_property: 'abi_swbuild', endpoint: 'switch_left'},
    });
    swbuildOk = await waitForAbi('abi_swbuild', 22_000);
    done.probe = true;
    if (probeOk === 0 && !swbuildOk) {
        done.get = true;
        result.aborted = 'STANDARD_READS_UNANSWERED';
        finish();
        return;
    }

    // stage 2: batched per-property gets, one at a time with settle
    (async () => {
        for (const p of props) {
            if (p in result.get_answers) continue;
            await publish('zigbee2mqtt/' + DEV + '/get', {[p]: ''});
            const got = await new Promise((res) => {
                const start = Date.now();
                const iv = setInterval(() => {
                    if (p in result.get_answers) { clearInterval(iv); res(true); }
                    else if (Date.now() - start > 16_000) { clearInterval(iv); res(false); }
                }, 400);
            });
            if (!got) result.errors.push({at: t(), text: 'TIMEOUT get ' + p});
        }
        done.get = true; maybeFinish();
    })();

    // retained bridge/devices arrives on subscribe; no request needed
    setTimeout(() => { if (!done.bridge) { done.bridge = true; result.bridge_devices_target = 'NO_RETAINED_IN_WINDOW'; maybeFinish(); } }, 90_000);

    setTimeout(finish, 220_000);
})();
