'use strict';
// READ-ONLY: has anything changed since the 10:27Z checkpoint? (firmware build,
// 0xff05 value, converter layout, OTA availability). No writes.
const fs = require('fs');
let st = {};
try { st = JSON.parse(fs.readFileSync('/config/zigbee2mqtt/state.json', 'utf8')); } catch (e) {}
const t = st['LivingRoomMainDimmer'] || st['0xa4c13843a9d40f85'] || {};
const out = {};
out.update = t.update ?? null;
out.device_swBuild = (t.device && t.device.softwareBuildID) ?? null;
const keys = Object.keys(t).filter((k) => /ff05|binded|physical|state_relay_right|swbuild|abi_/.test(k));
out.relevant = Object.fromEntries(keys.map((k) => [k, t[k]]));
out.ext_converters = (() => { try { return fs.readdirSync('/config/zigbee2mqtt/external_converters').filter((n) => n.endsWith('.js')); } catch (e) { return String(e); } })();
out.converter_lib = (() => { try { return fs.readdirSync('/config/zigbee2mqtt/converter_lib'); } catch (e) { return 'MISSING'; } })();
out.backup_dir = (() => { try { return fs.readdirSync('/config/zigbee2mqtt/backup-production-20260904'); } catch (e) { return 'MISSING'; } })();
out.ota_dir = (() => { try { return fs.readdirSync('/config/zigbee2mqtt/zigbee').slice(-6); } catch (e) { return 'NONE'; } })();
console.log(JSON.stringify(out, null, 1));
