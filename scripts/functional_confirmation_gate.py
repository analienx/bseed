#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

EXPECTED_MAPPING = {"cf": "PA1", "cf1": "PC2", "sel": "PB1"}
ALLOWED_SAFETY_MODES = {"SAFE_SINGLE_LAYER_LOW_POWER", "SAFE_DUAL_LAYER"}


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def evaluate(path: Path) -> dict[str, Any]:
    data = load(path)
    errors: list[str] = []
    warnings: list[str] = []

    if data.get("schema_version") != 1:
        errors.append("summary schema_version must be 1")
    if data.get("kind") != "automated_canary_validation":
        errors.append("summary kind must be automated_canary_validation")
    if data.get("status") != "PASS":
        errors.append(f"automated validation status is not PASS: {data.get('status')!r}")
    if data.get("source_mapping") != EXPECTED_MAPPING:
        errors.append("source mapping is not exact PA1/PC2/PB1")
    if data.get("safety_mode") not in ALLOWED_SAFETY_MODES:
        errors.append("unknown/unsafe safety mode")
    if data.get("final_relay_state") != "OFF":
        errors.append("final relay state must be OFF")

    for key in (
        "device_config_write_performed",
        "factory_reset_performed",
        "calibration_write_performed",
        "ota_update_performed_by_harness",
    ):
        if data.get(key) is not False:
            errors.append(f"{key} must be false")

    evaluation = data.get("evaluation") or {}
    mapping = evaluation.get("mapping_confirmation") or {}
    if evaluation.get("status") != "PASS":
        errors.append("embedded functional evaluation did not PASS")
    for key in ("cf_pa1_confirmed", "cf1_pc2_confirmed", "sel_pb1_confirmed"):
        if mapping.get(key) is not True:
            errors.append(f"mapping confirmation {key} is not true")

    cycles = data.get("cycles")
    if not isinstance(cycles, list) or len(cycles) < 3:
        errors.append("at least three complete OFF/ON cycles are required")

    if data.get("safety_mode") == "SAFE_SINGLE_LAYER_LOW_POWER":
        warnings.append("functional confirmation passed without an independent external hard-kill layer")

    return {
        "schema_version": 1,
        "kind": "functional_confirmation_gate",
        "status": "PASS" if not errors else "FAIL",
        "device_id": data.get("device_id"),
        "pcb_revision": data.get("pcb_revision"),
        "mapping": EXPECTED_MAPPING,
        "errors": errors,
        "warnings": warnings,
        "next_gate": "DEVICE_FUNCTIONALLY_CONFIRMED" if not errors else "BLOCKED",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Gate an automated BSEED black-box mapping confirmation result.")
    ap.add_argument("summary", nargs="?", type=Path)
    ap.add_argument("--json-out", type=Path)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        assert EXPECTED_MAPPING == {"cf": "PA1", "cf1": "PC2", "sel": "PB1"}
        assert "SAFE_DUAL_LAYER" in ALLOWED_SAFETY_MODES
        print("SELF_TEST=PASS")
        return 0
    if args.summary is None:
        ap.error("summary is required unless --self-test is used")

    try:
        result = evaluate(args.summary)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"FUNCTIONAL_CONFIRMATION_GATE=FAIL\nERROR: {exc}", file=sys.stderr)
        return 2

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
