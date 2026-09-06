'use strict';
// Read-only inventory of already-custom BSEED TS011F-family sockets (ruling 5561451599). No mutations.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'p004-inv', username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10000});
const CUSTOM_MFR = /^b28wrpvx$|o1jzcxou/i;   // custom units advertise Tuya mfr id without _TZ3000_ prefix
client.on('connect', async () => {
    let devices = null;
    const states = {};
    client.on('message', (t, p) => {
        try {
            if (t === 'zigbee2mqtt/bridge/devices') devices = JSON.parse(p.toString());
            else if (t.startsWith('zigbee2mqtt/') && !/bridge|availability/.test(t)) states[t.slice('zigbee2mqtt/'.length)] = JSON.parse(p.toString());
        } catch (e) {}
    });
    await client.subscribe(['zigbee2mqtt/bridge/devices', 'zigbee2mqtt/#']);
    await new Promise((r) => setTimeout(r, 10000));
    const out = {at: new Date().toISOString(), custom: []};
    for (const d of (devices || [])) {
        const mn = d.manufacturer || '', md = d.model_id || '';
        if (!CUSTOM_MFR.test(mn) && !/^TS011F-BS/.test(md)) continue;
        const st = states[d.friendly_name] || {};
        out.custom.push({
            friendly_name: d.friendly_name, ieee: d.ieee_address || d.ieeeAddr,
            manufacturer: mn, model_id: md, definition_model: (d.definition || {}).model || null,
            supported: (d.definition || {}).supported !== false, type: d.type,
            endpoints: Object.keys(d.endpoints || {}),
            software_build_id: d.software_build_id || null, date_code: d.date_code || null,
            application_version: d.application_version ?? null, file_version: d.file_version ?? null,
            hardware_version: d.hardware_version ?? null, zcl_version: d.zcl_version ?? null,
            device_config: st.device_config_switch ?? st.device_config ?? null,
            update: st.update ?? null,
            relay_state: st.state_relay !== undefined ? st.state_relay : null,
            power: st.power !== undefined ? st.power : null, energy: st.energy !== undefined ? st.energy : null,
            linkquality: st.linkquality ?? null,
        });
    }
    fs.writeFileSync('/tmp/p004/custom-inventory.json', JSON.stringify(out, null, 1));
    console.log('CUSTOM ' + out.custom.length);
    for (const c of out.custom) console.log(JSON.stringify(c));
    client.end(true); process.exit(0);
});
