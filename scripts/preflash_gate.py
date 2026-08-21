#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

EXPECTED = {
    "manufacturer_name": "b28wrpvx",
    "model_id": "TS011F-BS-PM",
    "device_type": "router",
    "mcu_family": "Telink",
    "mcu": "TLSR8258",
    "device_config": "b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;",
    "ota_manufacturer_code": 4417,
    "ota_image_type": 43556,
}

PASS_FIELDS = (
    "class_a_closed",
    "network_joined",
    "converter_loaded",
    "candidate_index_isolated",
    "automatic_ota_disabled",
    "bulk_update_disabled",
    "relay_baseline",
    "button_baseline",
    "led_baseline",
    "ota_liveness",
    "stable_power",
    "ota_link_quality",
    "enclosure_closed",
    "load_disconnected",
    "canary_automations_disabled",
    "known_good_rollback_hash_verified",
    "lkg_self_reinstall",
    "no_pending_device_config_change",
)

FALSE_FIELDS = (
    "reset_loop_observed",
    "unexpected_reboots_observed",
    "coordinator_maintenance_during_ota",
)

SHA256_RE = re.compile(r"^[0-9a-f]{64}$", re.I)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def is_pass(v: Any) -> bool:
    return v is True or (isinstance(v, str) and v.upper() == "PASS")


def resolve(base: Path, raw: str) -> Path:
    p = Path(raw)
    return p if p.is_absolute() else (base / p).resolve()


def evaluate(path: Path) -> dict[str, Any]:
    state = json.loads(path.read_text(encoding="utf-8"))
    base = path.parent.resolve()
    errors: list[str] = []
    warnings: list[str] = []

    for key, expected in EXPECTED.items():
        if state.get(key) != expected:
            errors.append(f"{key} mismatch: expected {expected!r}, got {state.get(key)!r}")

    device_id = str(state.get("device_id", ""))
    if not device_id or device_id.upper() in {"UNKNOWN", "TBD"}:
        errors.append("exact project-local canary device_id is required")
    if state.get("canary_authorized") is not True:
        errors.append("canary_authorized must be true")

    for key in PASS_FIELDS:
        if not is_pass(state.get(key)):
            errors.append(f"{key} must be PASS/true")
    for key in FALSE_FIELDS:
        if state.get(key) is not False:
            errors.append(f"{key} must be false")

    # Class A closure report is independently machine checked and must match the canary.
    class_a_raw = str(state.get("class_a_gate_report", ""))
    if not class_a_raw:
        errors.append("class_a_gate_report path is required")
    else:
        class_a_path = resolve(base, class_a_raw)
        if not class_a_path.is_file():
            errors.append(f"class_a_gate_report does not exist: {class_a_path}")
        else:
            try:
                class_a = json.loads(class_a_path.read_text(encoding="utf-8"))
                if class_a.get("kind") != "class_a_gate":
                    errors.append("class_a_gate_report has wrong kind")
                if class_a.get("mode") != "all":
                    errors.append("class_a_gate_report must be produced with --mode all")
                if class_a.get("status") != "PASS":
                    errors.append("class_a_gate_report status is not PASS")
                if class_a.get("class_a_unknown_count") != 0:
                    errors.append("class_a_gate_report unknown count is not zero")
                if class_a.get("device_id") != device_id:
                    errors.append("class_a_gate_report device_id does not match preflash canary")
            except json.JSONDecodeError:
                errors.append("class_a_gate_report is not valid JSON")

    current_build = str(state.get("current_sw_build_id", ""))
    if not current_build:
        errors.append("current_sw_build_id is required")

    rollback_hash = str(state.get("rollback_sha256", ""))
    rollback_path_raw = str(state.get("rollback_ota", ""))
    if not SHA256_RE.match(rollback_hash):
        errors.append("rollback_sha256 must be a full SHA-256")
    if not rollback_path_raw:
        errors.append("rollback_ota path is required")
    else:
        rollback_path = resolve(base, rollback_path_raw)
        if not rollback_path.is_file():
            errors.append(f"rollback_ota does not exist: {rollback_path}")
        elif SHA256_RE.match(rollback_hash) and sha256_file(rollback_path).lower() != rollback_hash.lower():
            errors.append("rollback_ota file does not match rollback_sha256")

    evidence_raw = str(state.get("lkg_self_reinstall_evidence", ""))
    if not evidence_raw:
        errors.append("lkg_self_reinstall_evidence path is required")
    else:
        evidence = resolve(base, evidence_raw)
        if not evidence.is_file():
            errors.append(f"LKG self-reinstall evidence file does not exist: {evidence}")

    if state.get("device_config_writes_prohibited") is not True:
        errors.append("device_config_writes_prohibited must be true")
    if state.get("pm_enabled") is not False:
        errors.append("PM must be disabled before every OTA canary flash")

    return {
        "schema_version": 1,
        "kind": "preflash_gate",
        "status": "PASS" if not errors else "FAIL",
        "device_id": device_id,
        "errors": errors,
        "warnings": warnings,
        "next_gate": "ELIGIBLE_FOR_SUPERVISOR_OTA_CANARY_REVIEW" if not errors else "BLOCKED",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate live BSEED canary state before any experimental OTA flash.")
    ap.add_argument("state", nargs="?", type=Path)
    ap.add_argument("--json-out", type=Path)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        assert EXPECTED["ota_image_type"] == 43556
        assert EXPECTED["device_config"].endswith("M;")
        assert "class_a_closed" in PASS_FIELDS
        assert "lkg_self_reinstall" in PASS_FIELDS
        assert "sws_recovery_readback" not in PASS_FIELDS
        print("SELF_TEST=PASS")
        return 0
    if args.state is None:
        ap.error("state is required unless --self-test is used")

    try:
        result = evaluate(args.state)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"PREFLASH_GATE=FAIL\nERROR: {exc}", file=sys.stderr)
        return 2

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
