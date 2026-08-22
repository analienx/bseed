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


def patch_text(text: str) -> tuple[str, bool]:
    if REPLACEMENT in text:
        return text, False
    if text.count(NEEDLE) != 1:
        raise RuntimeError(
            f"calibrate helper: expected one exact source match, found {text.count(NEEDLE)}"
        )
    return text.replace(NEEDLE, REPLACEMENT, 1), True


def wire_value(ui_value: float, multiplier: int) -> int:
    return round(ui_value * multiplier)


def ui_value(raw_value: int, multiplier: int) -> float:
    return 0 if raw_value == 0 else raw_value / multiplier


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", type=Path)
    ap.add_argument("--in-place", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        assert wire_value(240, 100) == 24000
        assert ui_value(24000, 100) == 240
        assert wire_value(0.523, 1000) == 523
        assert ui_value(523, 1000) == 0.523
        assert wire_value(30, 1) == 30
        assert ui_value(0, 1) == 0
        print("CALIBRATION_CONVERTER_SELF_TEST=PASS")
        return 0
    text = args.path.read_text(encoding="utf-8")
    updated, changed = patch_text(text)
    if args.in_place and changed:
        args.path.write_text(updated, encoding="utf-8", newline="")
    print(f"CALIBRATION_CONVERTER_PATCH={'APPLIED' if changed else 'ALREADY_APPLIED'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
