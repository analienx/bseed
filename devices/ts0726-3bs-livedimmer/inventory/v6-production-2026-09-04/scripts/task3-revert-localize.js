'use strict';
// Task 3 per ruling 5543052507 §3: revert-localization trace.
// debug ON -> baseline raw reads -> EXACTLY ONE public SET -> raw poll ~5s until
// FIRST read showing 3 (or +300s cap) -> restore log_level=info + prove -> save segment.
// Constraints honored: no second SET, no bind/mains/OTA ops. Polls are ZCL READs only.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const IEEE = '0xa4c13843a9d40f85';
const CFG = '/config/zigbee2mqtt/configuration.yaml';
const LOGROOT = '/config/zigbee2mqtt/log';
const OUTDIR = '/tmp/v9rev';
fs.mkdirSync(OUTDIR, {recursive: true});
const cfg = yaml.load(fs.readFileSync(CFG, 'utf8'));
const priorLevel = (cfg.advanced && cfg.advanced.log_level) || 'info';
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-rev-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const ev = {started_utc: new Date().toISOString(), prior_log_level: priorLevel, polls: [], mqtt_set_traffic: [], notes: []};
const now = () => new Date().toISOString().slice(11, 23);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const pub = (topic, payload) => new Promise((res) => client.publish(topic, JSON.stringify(payload), {qos: 1}, res));
function currentLogFile() {
    const win = fs.readdirSync(LOGROOT).filter((d) => fs.statSync(path.join(LOGROOT, d)).isDirectory()).sort().reverse()[0];
    return path.join(LOGROOT, win, 'log.log');
}
let pollSeq = 0;
const answers = {};
client.on('message', (topic, payload) => {
    const s = payload.toString();
    if (topic === `zigbee2mqtt/${DEV}/set` || (topic === `zigbee2mqtt/${DEV}/switch_right/set`)) {
        ev.mqtt_set_traffic.push({at: now(), topic, data: s.slice(0, 200)});
    }
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    try {
        const j = JSON.parse(s);
        for (const k of Object.keys(j)) if (/^rv\d+_/.test(k)) answers[k] = j[k];
    } catch (e) {}
});
let txn = 5000;
function optionsRequest(options) {
    return new Promise((resolve) => {
        const id = ++txn;
        const onData = (topic, payload) => {
            if (topic !== 'zigbee2mqtt/bridge/response/options') return;
            let j; try { j = JSON.parse(payload.toString()); } catch (e) { return; }
            if (typeof j.status === 'undefined') return;
            client.removeListener('message', onData);
            resolve(j);
        };
        client.on('message', onData);
        client.publish('zigbee2mqtt/bridge/request/options', JSON.stringify({options, transaction: 'rv' + id}), {qos: 1});
    });
}
async function rawRead(tag) {
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [65285], state_property: tag, endpoint: 'switch_right'}});
    const start = Date.now();
    while (Date.now() - start < 4500) { if (answers[tag]) return answers[tag]; await wait(300); }
    return answers[tag] ?? null; // may arrive later; last chance
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe([`zigbee2mqtt/${DEV}`, `zigbee2mqtt/${DEV}/set`, `zigbee2mqtt/${DEV}/switch_right/set`, 'zigbee2mqtt/bridge/response/options'], res));
    await wait(1200);

    // open debug
    const dbg = await optionsRequest({advanced: {log_level: 'debug'}});
    ev.debug_enable = {at: now(), status: dbg.status};
    await wait(1000);
    const logFile = currentLogFile();
    ev.log_file = logFile;
    const startOffset = fs.statSync(logFile).size;

    // baseline: confirm currently 3 (device should have reverted from previous phase)
    for (let i = 0; i < 2; i++) {
        const tag = `rv${++pollSeq}_base`;
        const v = await rawRead(tag);
        ev.polls.push({phase: 'baseline', tag, at: now(), value: v});
    }

    // EXACTLY ONE SET
    ev.t_set = now();
    await pub(`zigbee2mqtt/${DEV}/set`, {switch_right_binded_mode: 'Never (disabled)'});

    // poll every ~5s until first 3 or +300s
    const deadline = Date.now() + 300_000;
    let firstThreeAt = null; let lastZeroAt = null; let sawZeroAfterSet = false;
    while (Date.now() < deadline) {
        await wait(5000);
        const tag = `rv${++pollSeq}_p`;
        const v = await rawRead(tag);
        const raw = v && (v[65285] ?? v['65285']);
        ev.polls.push({phase: 'post-set', tag, at: now(), raw});
        if (raw === 0) { sawZeroAfterSet = true; lastZeroAt = now(); }
        if (raw === 3) { firstThreeAt = now(); break; }
    }
    // one last catch-up read in case answer lagged
    await wait(2000);
    const tail = Object.entries(answers).slice(-3);
    ev.tail_answers = tail;

    // restore log level + prove
    const res = await optionsRequest({advanced: {log_level: priorLevel}});
    await wait(1200);
    const cfgAfter = yaml.load(fs.readFileSync(CFG, 'utf8'));
    ev.restore = {at: now(), status: res.status, level_now: (cfgAfter.advanced || {}).log_level ?? null, proven: ((cfgAfter.advanced || {}).log_level ?? null) === priorLevel};

    // save segment
    const endOffset = fs.statSync(logFile).size;
    const fd = fs.openSync(logFile, 'r');
    const buf = Buffer.alloc(Math.max(0, endOffset - startOffset));
    fs.readSync(fd, buf, 0, buf.length, startOffset);
    fs.closeSync(fd);
    fs.writeFileSync(OUTDIR + '/revert-segment.log', buf.toString('utf8'));
    ev.segment_bytes = buf.length;
    ev.result = {saw_zero_after_set: sawZeroAfterSet, last_zero_at: lastZeroAt, first_three_at: firstThreeAt, set_at: ev.t_set, polls: ev.polls.length};
    fs.writeFileSync(OUTDIR + '/revert-trace.json', JSON.stringify(ev, null, 1));
    console.log(JSON.stringify({result: ev.result, restore: ev.restore, segment_bytes: ev.segment_bytes, set_traffic: ev.mqtt_set_traffic}, null, 1));
    client.end(true);
    process.exit(0);
})().catch((e) => {
    ev.fatal = String(e && e.stack || e);
    try { fs.writeFileSync(OUTDIR + '/revert-trace.json', JSON.stringify(ev, null, 1)); } catch (x) {}
    console.error('FATAL', ev.fatal);
    optionsRequest({advanced: {log_level: priorLevel}}).finally(() => process.exit(1));
});
setTimeout(() => {
    ev.hard_timeout = true;
    optionsRequest({advanced: {log_level: priorLevel}}).then(() => {
        try {
            const lf = currentLogFile();
            fs.writeFileSync(OUTDIR + '/revert-trace.json', JSON.stringify(ev, null, 1));
        } catch (e) {}
        process.exit(1);
    });
}, 400_000);
