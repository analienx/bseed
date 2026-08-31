#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

HARDWARE_IDS = [f"A-H{i:02d}" for i in range(1, 15)]
RECOVERY_IDS = [f"A-R{i:02d}" for i in range(1, 8)]
EXPECTED_CONFIG = "b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;"
EXPECTED_RUNTIME = {
    "manufacturer_name": "b28wrpvx",
    "model_id": "TS011F-BS-PM",
    "device_type": "router",
    "mcu": "TLSR8258",
    "device_config": EXPECTED_CONFIG,
}
PROTECTED_GPIO = {"D2", "B5", "C3", "B4"}
# Official ZTU module physical pins used by recovery/power infrastructure.
PROTECTED_ZTU_PINS = {4: "SWS", 13: "GND", 14: "3V3/VCC", 18: "RST"}


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def nonempty(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, str):
        return bool(v.strip())
    if isinstance(v, (dict, list, tuple, set)):
        return bool(v)
    return True


def fact(section: dict[str, Any], fid: str, expected_status: str, errors: list[str]) -> dict[str, Any]:
    obj = section.get(fid)
    if not isinstance(obj, dict):
        errors.append(f"missing fact object {fid}")
        return {}
    if obj.get("status") != expected_status:
        errors.append(f"{fid} status must be {expected_status}, got {obj.get('status')!r}")
    if not nonempty(obj.get("value")):
        errors.append(f"{fid} value is empty")
    if not nonempty(obj.get("evidence")):
        errors.append(f"{fid} evidence is empty")
    return obj


def mapping_value(obj: dict[str, Any], fid: str, errors: list[str]) -> tuple[int | None, str | None]:
    value = obj.get("value")
    if not isinstance(value, dict):
        errors.append(f"{fid}.value must be an object with ztu_pin/gpio/resistance_ohm/topology")
        return None, None
    for key in ("ztu_pin", "gpio", "resistance_ohm", "topology"):
        if key not in value or not nonempty(value.get(key)):
            errors.append(f"{fid}.value.{key} is required")
    pin = value.get("ztu_pin")
    gpio = value.get("gpio")
    if not isinstance(pin, int) or pin <= 0:
        errors.append(f"{fid}.value.ztu_pin must be a positive integer")
        pin = None
    if not isinstance(gpio, str) or not gpio.strip():
        errors.append(f"{fid}.value.gpio must be a nonempty GPIO name")
        gpio = None
    return pin, gpio.strip().upper() if isinstance(gpio, str) else None


def evaluate(path: Path, mode: str) -> dict[str, Any]:
    data = load(path)
    errors: list[str] = []
    warnings: list[str] = []

    if data.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    if not nonempty(data.get("device_id")):
        errors.append("device_id is required")
    if not nonempty(data.get("pcb_revision")):
        errors.append("pcb_revision is required")

    hw = data.get("hardware")
    rec = data.get("recovery")
    if not isinstance(hw, dict):
        hw = {}
        errors.append("hardware section missing/not object")
    if not isinstance(rec, dict):
        rec = {}
        errors.append("recovery section missing/not object")

    if mode in ("hardware", "all"):
        facts = {fid: fact(hw, fid, "DEVICE_CONFIRMED", errors) for fid in HARDWARE_IDS}

        # Runtime target identity must match the frozen BSEED profile exactly.
        runtime = facts.get("A-H02", {}).get("value")
        if not isinstance(runtime, dict):
            errors.append("A-H02.value must be an object containing runtime identity")
        else:
            for key, expected in EXPECTED_RUNTIME.items():
                if runtime.get(key) != expected:
                    errors.append(f"A-H02 runtime {key} mismatch: expected {expected!r}, got {runtime.get(key)!r}")

        # Power/reference confirmation must be explicit booleans, not prose guesses.
        if facts.get("A-H04", {}).get("value") is not True:
            errors.append("A-H04.value must be true (BL0937 VDD -> ZTU/local 3V3 confirmed)")
        if facts.get("A-H05", {}).get("value") is not True:
            errors.append("A-H05.value must be true (BL0937 GND -> ZTU/local GND confirmed)")

        mappings: dict[str, tuple[int | None, str | None]] = {}
        for fid in ("A-H06", "A-H07", "A-H08"):
            mappings[fid] = mapping_value(facts.get(fid, {}), fid, errors)

        # The three PM signals must be distinct.
        pins = [p for p, _ in mappings.values() if p is not None]
        gpios = [g for _, g in mappings.values() if g is not None]
        if len(pins) == 3 and len(set(pins)) != 3:
            errors.append("CF/CF1/SEL resolve to duplicate ZTU physical pins")
        if len(gpios) == 3 and len(set(gpios)) != 3:
            errors.append("CF/CF1/SEL resolve to duplicate TLSR GPIOs")

        # Never collide with existing socket functions or recovery/power pins.
        for fid, (pin, gpio) in mappings.items():
            if gpio in PROTECTED_GPIO:
                errors.append(f"{fid} collides with frozen socket GPIO {gpio}")
            if pin in PROTECTED_ZTU_PINS:
                errors.append(f"{fid} collides with protected ZTU pin {pin} ({PROTECTED_ZTU_PINS[pin]})")

        if facts.get("A-H11", {}).get("value") != "NO_COLLISION":
            errors.append("A-H11.value must be exactly NO_COLLISION")
        if facts.get("A-H12", {}).get("value") != "NO_COLLISION":
            errors.append("A-H12.value must be exactly NO_COLLISION")

    if mode in ("recovery", "all"):
        facts = {fid: fact(rec, fid, "RECOVERY_PROVEN", errors) for fid in RECOVERY_IDS}
        # Explicit pass semantics for exercised recovery functions.
        for fid in ("A-R02", "A-R03", "A-R04", "A-R05", "A-R06", "A-R07"):
            if facts.get(fid, {}).get("value") is not True:
                errors.append(f"{fid}.value must be true after successful empirical proof")
        # A-R01 should identify exact local LKG artifact + SHA, not just PASS.
        lkg = facts.get("A-R01", {}).get("value")
        if not isinstance(lkg, dict) or not nonempty(lkg.get("path")) or not nonempty(lkg.get("sha256")):
            errors.append("A-R01.value must contain nonempty path and sha256")
        elif len(str(lkg.get("sha256"))) != 64:
            errors.append("A-R01.value.sha256 must be a full SHA-256")

    unknown_count = len(errors)
    return {
        "schema_version": 1,
        "kind": "class_a_gate",
        "mode": mode,
        "status": "PASS" if not errors else "FAIL",
        "device_id": data.get("device_id"),
        "pcb_revision": data.get("pcb_revision"),
        "class_a_unknown_count": unknown_count,
        "errors": errors,
        "warnings": warnings,
        "next_gate": "CLASS_A_CLOSED" if not errors else "BLOCKED",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Enforce closure of dangerous Class A facts before BSEED PM experiments.")
    ap.add_argument("evidence", nargs="?", type=Path)
    ap.add_argument("--mode", choices=("hardware", "recovery", "all"), default="all")
    ap.add_argument("--json-out", type=Path)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        assert len(HARDWARE_IDS) == 14
        assert len(RECOVERY_IDS) == 7
        assert PROTECTED_ZTU_PINS[4] == "SWS"
        assert "D2" in PROTECTED_GPIO
        assert EXPECTED_RUNTIME["device_config"] == EXPECTED_CONFIG
        print("SELF_TEST=PASS")
        return 0
    if args.evidence is None:
        ap.error("evidence is required unless --self-test is used")

    try:
        result = evaluate(args.evidence, args.mode)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"CLASS_A_GATE=FAIL\nERROR: {exc}", file=sys.stderr)
        return 2

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
