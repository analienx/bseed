'use strict';
const zhc = require('zigbee-herdsman-converters');
const spy = {
    type: 'Router',
    ieeeAddr: '0xa4c13843a9d40f85',
    modelID: 'TS0726-3-BS',
    manufacturerName: 'iedhxgyi',
    softwareBuildID: '1.1.6-bseedv6',
    interviewCompleted: true,
    powerSource: 'Mains (single phase)',
    endpoints: [1, 2, 3, 4, 5, 6].map((ID) => ({ID, inputClusters: [], outputClusters: []})),
};
const r = zhc.findByDevice(spy);
console.log(JSON.stringify({
    type: typeof r,
    keys: r ? Object.keys(r) : null,
    protoKeys: r ? Object.getOwnPropertyNames(Object.getPrototypeOf(r) || {}) : null,
    model: r && r.model,
    ctor: r && r.constructor && r.constructor.name,
}, null, 1));
