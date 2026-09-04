'use strict';
const fs = require('fs');
const txt = fs.readFileSync('/app/dist/extension/bridge.js', 'utf8');
const out = {};
out.options_hits = (txt.match(/.{0,60}options.{0,90}/g) || []).slice(0, 12);
out.topic_defs = (txt.match(/topic[^\n]{0,120}/g) || []).filter((l) => /options|logging|config/i.test(l)).slice(0, 10);
// how does it apply changed config? restart or hot?
out.restart_hits = (txt.match(/.{0,50}(requestRestart|restarting|hotReload|applyChangedOptions).{0,80}/g) || []).slice(0, 6);
console.log(JSON.stringify(out, null, 1));
