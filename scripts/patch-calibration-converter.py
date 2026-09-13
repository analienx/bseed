#!/usr/bin/env python3
"""Patch the pinned Z2M calibration helper's UI unit round-trip."""

from __future__ import annotations

import argparse
from pathlib import Path


NEEDLE = """        const origConvertSet = result.toZigbee[0].convertSet;
        result.toZigbee[0].convertSet = async (entity, key, value, meta) => {
            const raw = Math.round(Number(value) * multiplier);
            return await origConvertSet(entity, key, raw, meta);
        };
        return result;
"""

REPLACEMENT = """        const origConvertSet = result.toZigbee[0].convertSet;
        result.toZigbee[0].convertSet = async (entity, key, value, meta) => {
            const raw = Math.round(Number(value) * multiplier);
            const response = await origConvertSet(entity, key, raw, meta);
            // Calibration is a trigger input. Keep the UI in display units and
            // show the reset value after a successful write.
            if (response?.state?.[name] !== undefined)
                response.state[name] = 0;
            return response;
        };
        const origConvert = result.fromZigbee[0].convert;
        result.fromZigbee[0].convert = (model, msg, publish, options, meta) => {
            const response = origConvert(model, msg, publish, options, meta);
            if (response?.[name] !== undefined && response?.[name] !== null) {
                const raw = Number(response[name]);
                response[name] = raw === 0 ? 0 : raw / multiplier;
            }
            return response;
        };
        return result;
"""

POWER_NEEDLE = """    {
        zigbeeModel: [
            "TS011F-BS-PM",
        ],
        model: "TS011F_plug_1_2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"switch": 1, "relay": 2, } }),
            romasku.actionEvent({
                switches: [
                    {endpoint: 1, prefix: "switch_0", name: "switch"},
                ],
                longSwitches: [
                ],
                coverSwitches: [
                ],
            }),
            romasku.deviceConfig("device_config", "switch"),
            romasku.multiPressResetCount("multi_press_reset_count", "switch"),
            romasku.networkIndicator("network_led", "switch"),
            romasku.networkLedBrightness("network_led_brightness", "switch"),
            romasku.networkLedTransition("network_led_transition", "switch"),
            onOff({ endpointNames: ["relay"] }),
            romasku.scaledMeasurement({
                name: "voltage",
                cluster: "haElectricalMeasurement",
                attribute: "rmsVoltage",
                unit: "V",
                divisor: 100, // firmware reports centivolts
                precision: 2,
                endpointName: "switch",
            }),
            romasku.scaledMeasurement({
                name: "current",
                cluster: "haElectricalMeasurement",
                attribute: "rmsCurrent",
                unit: "A",
                divisor: 1000, // firmware reports milliamps
                precision: 3,
                endpointName: "switch",
            }),
            numeric({
                name: "power",
                cluster: "haElectricalMeasurement",
                attribute: "activePower",
                description: "Instantaneous measured active power",
                unit: "W",
                access: "STATE",
                endpointName: "switch",
            }),
"""
POWER_REPLACEMENT = (
    POWER_NEEDLE
    .replace('precision: 2,\n                endpointName:', 'precision: 2,\n                access: "STATE_GET",\n                endpointName:')
    .replace('precision: 3,\n                endpointName:', 'precision: 3,\n                access: "STATE_GET",\n                endpointName:')
    .replace('access: "STATE"', 'access: "STATE_GET"')
)

SCALED_MEASUREMENT_NEEDLE = """    scaledMeasurement: ({name, cluster, attribute, unit, divisor, precision, endpointName}) => {
        const result = numeric({
            name,
            cluster,
            attribute,
            unit,
            precision,
            access: "STATE",
            endpointName,
        });
"""
SCALED_MEASUREMENT_REPLACEMENT = """    scaledMeasurement: ({name, cluster, attribute, unit, divisor, precision, endpointName, access = "STATE"}) => {
        const result = numeric({
            name,
            cluster,
            attribute,
            unit,
            precision,
            access,
            endpointName,
        });
"""

# Older generated converters scaled overload-setting writes but returned the
# firmware's mA/cV values unchanged.  Keep this repair narrowly on the shared
# helper used by the already-generated settings; the target-scoped expose/GET
# changes above remain the only BSEED-specific additions.
OVERLOAD_HELPER_NEEDLE = """    overloadSetting: ({name, attribute, unit, scale, valueMin, valueMax, valueStep, description, endpointName}) => {
        const result = numeric({
            name,
            cluster: "haElectricalMeasurement",
            attribute,
            unit,
            description,
            access: "ALL",
            valueMin,
            valueMax,
            valueStep,
            entityCategory: "config",
            endpointName,
        });
        // Firmware stores current in mA and voltage in cV; present A/V and scale.
        if (scale && scale !== 1) {
            const origSet = result.toZigbee[0].convertSet;
            result.toZigbee[0].convertSet = async (entity, key, value, meta) =>
                await origSet(entity, key, Math.round(Number(value) * scale), meta);
        }
        return result;
    },
"""

OVERLOAD_HELPER_REPLACEMENT = """    overloadSetting: ({name, attribute, unit, scale, valueMin, valueMax, valueStep, description, endpointName}) => {
        const result = numeric({
            name,
            cluster: "haElectricalMeasurement",
            attribute,
            unit,
            description,
            access: "ALL",
            valueMin,
            valueMax,
            valueStep,
            entityCategory: "config",
            endpointName,
        });
        // Firmware stores current in mA and voltage in cV; present A/V and scale.
        if (scale && scale !== 1) {
            const origSet = result.toZigbee[0].convertSet;
            result.toZigbee[0].convertSet = async (entity, key, value, meta) =>
                await origSet(entity, key, Math.round(Number(value) * scale), meta);
            const origConvert = result.fromZigbee[0].convert;
            result.fromZigbee[0].convert = (model, msg, publish, options, meta) => {
                const response = origConvert(model, msg, publish, options, meta);
                if (response?.[name] !== undefined && response?.[name] !== null)
                    response[name] = response[name] / scale;
                return response;
            };
        }
        return result;
    },
"""

PROTECTION_SCALES = {
    "overload_power_limit": 1,
    "overload_current_limit": 1000,
    "overvoltage_warn": 100,
    "undervoltage_warn": 100,
}


def patch_text(text: str) -> tuple[str, bool]:
    if REPLACEMENT in text:
        return text, False
    if text.count(NEEDLE) != 1:
        raise RuntimeError(
            f"calibrate helper: expected one exact source match, found {text.count(NEEDLE)}"
        )
    return text.replace(NEEDLE, REPLACEMENT, 1), True


def patch_power_access(text: str) -> tuple[str, bool]:
    if POWER_REPLACEMENT in text:
        return text, False
    if text.count(POWER_NEEDLE) != 1:
        raise RuntimeError(
            f"TS011F-BS-PM V/I/P exposes: expected one exact source match, found {text.count(POWER_NEEDLE)}"
        )
    return text.replace(POWER_NEEDLE, POWER_REPLACEMENT, 1), True


def patch_scaled_measurement_access(text: str) -> tuple[str, bool]:
    if SCALED_MEASUREMENT_REPLACEMENT in text:
        return text, False
    if text.count(SCALED_MEASUREMENT_NEEDLE) != 1:
        raise RuntimeError(
            "scaledMeasurement helper: expected one exact source match, found "
            f"{text.count(SCALED_MEASUREMENT_NEEDLE)}"
        )
    return text.replace(
        SCALED_MEASUREMENT_NEEDLE, SCALED_MEASUREMENT_REPLACEMENT, 1
    ), True


def patch_overload_readback(text: str) -> tuple[str, bool]:
    """Repair raw-wire readback while retaining existing write scaling."""
    if "response[name] = response[name] / scale;" in text or "r[name] = r[name] / scale;" in text:
        return text, False
    if text.count(OVERLOAD_HELPER_NEEDLE) != 1:
        raise RuntimeError(
            "overloadSetting helper: expected one exact unscaled-read source match, found "
            f"{text.count(OVERLOAD_HELPER_NEEDLE)}"
        )
    return text.replace(OVERLOAD_HELPER_NEEDLE, OVERLOAD_HELPER_REPLACEMENT, 1), True


def wire_value(ui_value: float, multiplier: int) -> int:
    return round(ui_value * multiplier)


def ui_value(raw_value: int, multiplier: int) -> float:
    return 0 if raw_value == 0 else raw_value / multiplier


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", type=Path, nargs="?")
    ap.add_argument("--in-place", action="store_true")
    ap.add_argument("--enable-power-get", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        assert wire_value(240, 100) == 24000
        assert ui_value(24000, 100) == 240
        assert wire_value(0.523, 1000) == 523
        assert ui_value(523, 1000) == 0.523
        assert wire_value(30, 1) == 30
        assert ui_value(0, 1) == 0
        for name, scale in PROTECTION_SCALES.items():
            sample = {"overload_power_limit": 170, "overload_current_limit": 10.5,
                      "overvoltage_warn": 240, "undervoltage_warn": 210}[name]
            assert ui_value(wire_value(sample, scale), scale) == sample
        print("CALIBRATION_CONVERTER_SELF_TEST=PASS")
        return 0
    if args.path is None:
        ap.error("path is required unless --self-test is used")
    text = args.path.read_text(encoding="utf-8")
    updated, changed = patch_text(text)
    updated, overload_changed = patch_overload_readback(updated)
    changed = changed or overload_changed
    if args.enable_power_get:
        updated, helper_changed = patch_scaled_measurement_access(updated)
        updated, power_changed = patch_power_access(updated)
        changed = changed or helper_changed or power_changed
    if args.in_place and changed:
        args.path.write_text(updated, encoding="utf-8", newline="")
    print(f"CALIBRATION_CONVERTER_PATCH={'APPLIED' if changed else 'ALREADY_APPLIED'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
