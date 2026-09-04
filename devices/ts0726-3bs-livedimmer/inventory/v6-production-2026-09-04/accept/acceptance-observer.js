'use strict';
// Acceptance observer (READ-ONLY; no device writes). Subscribes to full MQTT base topic
// and appends compact JSONL events: dimmer state changes, any other device's onOff/level
// changes (bound-target proxy), coordinator visibility of device->bind commands (debug
// lines when debug enabled), plus periodic endpoint-scoped policy/physical reads tagged
// by operator call labels via a tiny control file polled every second.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const IEEE = '0xa4c13843a9d40f85';
const OUT = '/tmp/accept-events.jsonl';
const CONTROL = '/tmp/accept-step';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-accept-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 2000, connectTimeout: 10_000});
const out = fs.openSync(OUT, 'a');
const w = (o) => fs.writeSync(out, JSON.stringify(o) + '\n');
const prev = {};
let step = 'idle';
client.on('message', (topic, payload) => {
    if (topic.startsWith('homeassistant/')) return;
    let j; try { j = JSON.parse(payload.toString()); } catch (e) { return; }
    if (topic === 'zigbee2mqtt/bridge/logging') {
        const s = payload.toString();
        if (s.includes(IEEE) || s.includes(DEV) || /[Ll]ivingRoom/.test(s)) {
            if (/command(On|Off|Toggle|Move|Step|Stop)/i.test(s) || /genOnOff|genLevelCtrl/.test(s) || /error/i.test(s)) {
                w({t: Date.now(), step, kind: 'log', topic, s: s.slice(0, 400)});
            }
        }
        return;
    }
    if (topic === `zigbee2mqtt/${DEV}`) {
        const watch = ['state_relay_left', 'state_relay_middle', 'state_relay_right', 'relay_right_indicator', 'relay_left_indicator', 'relay_middle_indicator', 'switch_left_press_action', 'switch_middle_press_action', 'switch_right_press_action', 'action'];
        for (const k of watch) if (k in j && prev['self' + k] !== j[k]) { prev['self' + k] = j[k]; w({t: Date.now(), step, kind: 'self', k, v: j[k]}); }
        return;
    }
    const mm = topic.match(/^zigbee2mqtt\/([^/]+)$/);
    if (mm && mm[1] !== DEV) {
        for (const k of ['state', 'brightness']) {
            if (k in j && prev[mm[1] + k] !== JSON.stringify(j[k])) { prev[mm[1] + k] = JSON.stringify(j[k]); w({t: Date.now(), step, kind: 'other', dev: mm[1], k, v: j[k]}); }
        }
    }
});
client.on('connect', () => client.subscribe('zigbee2mqtt/#'));
setInterval(() => { try { const s = fs.readFileSync(CONTROL, 'utf8').trim(); if (s !== step) { step = s; w({t: Date.now(), step, kind: 'step'}); } } catch (e) {} }, 1000);
setTimeout(() => { w({t: Date.now(), step: 'END', kind: 'timeout'}); process.exit(0); }, 1_800_000); // 30 min cap
