const tuya = require("zigbee-herdsman-converters/lib/tuya");

let definitions = require("zigbee-herdsman-converters/devices/tuya");
definitions = definitions.definitions ?? definitions;

const candidate = {
    vendor: "SMTONOFF",
    model: "ZXB3-125",
    dpPhaseMap: {6: "c", 7: "b", 8: "a"},
    fingerprint: {
        modelID: "TS0601",
        manufacturerName: "_TZE204_wbhaespm",
        applicationVersion: 74,
        hardwareVersion: 1,
        endpoints: [
            {
                ID: 1,
                profileID: 0x0104,
                deviceID: 0x0051,
                inputClusters: [0x0000, 0x0004, 0x0005, 0xef00],
                outputClusters: [0x000a, 0x0019],
            },
            {
                ID: 242,
                profileID: 0xa1e0,
                deviceID: 0x0061,
                inputClusters: [],
                outputClusters: [0x0021],
            },
        ],
        priority: 200,
    },
};
const base = definitions.find((definition) => definition.model === "STB3L-125-ZJ");
if (!base) throw new Error("Built-in STB3L-125-ZJ definition not found");

const tuyaDatapoints = base.meta.tuyaDatapoints.map(([dp, property, converter]) => {
    const phase = candidate.dpPhaseMap[String(dp)];
    return phase !== undefined && property === null
        ? [dp, property, tuya.valueConverter.phaseVariant2WithPhase(phase)]
        : [dp, property, converter];
});

module.exports = [{
    ...base,
    fingerprint: [candidate.fingerprint],
    vendor: candidate.vendor,
    model: candidate.model,
    description: "SMTONOFF ZXB3-125 three-phase breaker (endpoint fingerprint)",
    meta: {...base.meta, tuyaDatapoints},
}];
