'use strict';
// Independent byte-level parse of the V7 forward.ota header.
const fs = require('fs');
const b = fs.readFileSync('C:/Users/jakub/.qwen/tmp/v7-release/forward.ota');
const magic = b.readUInt32LE(0);
const mfr = b.readUInt16LE(10);
const imgType = b.readUInt16LE(12);
const fver = b.readUInt32LE(14);
const stack = b.readUInt16LE(18);
const hs = b.slice(20, 52).toString('ascii').replace(/\0.*/, '');
const total = b.readUInt32LE(52);
console.log(JSON.stringify({
    size: b.length,
    magic: '0x' + magic.toString(16),
    magic_ok: magic === 0x0BEEF11E,
    manufacturerCode: mfr, mfr_ok: mfr === 4417,
    imageType: imgType, img_ok: imgType === 45577,
    fileVersion: fver, fver_ok: fver === 285356041,
    strictly_greater_than_recovery: fver > 285356040, delta: fver - 285356040,
    stackVersion: stack, headerString: hs, totalImageSize: total, size_ok: total === b.length,
}, null, 1));
