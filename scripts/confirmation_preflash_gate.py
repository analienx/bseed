#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

EXPECTED_RUNTIME = {
    "manufacturer_name": "b28wrpvx",
    "model_id": "TS011F-BS-PM",
    "device_type": "router",
    "mcu": "TLSR8258",
    "device_config": "b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;",
}
EXPECTED_MAPPING = {"cf": "PA1", "cf1": "PC2", "sel": "PB1"}
PASS_FIELDS = (
    "relay_baseline", "button_baseline", "led_baseline", "network_joined",
    "ota_liveness", "lkg_self_reinstall", "sws_recovery_readback",
    "full_flash_backup_verified", "enclosure_closed", "relay_off_before_ota",
    "load_disconnected_during_ota", "canary_automations_disabled",
    "automatic_ota_disabled", "bulk_update_disabled", "stable_power",
    "ota_link_quality",
)
SHA256_RE = re.compile(r"^[0-9a-f]{64}$", re.I)


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def is_pass(v: Any) -> bool:
    return v is True or (isinstance(v, str) and v.upper() == "PASS")


def resolve(base: Path, raw: str) -> Path:
    p = Path(raw)
    return p if p.is_absolute() else (base / p).resolve()


def run_candidate_gate(manifest: Path) -> tuple[int, dict[str, Any] | None, str]:
    script = Path(__file__).with_name("metering_candidate_gate.py")
    proc = subprocess.run(
        [sys.executable, str(script), str(manifest)],
        text=True,
        capture_output=True,
    )
    parsed = None
    if proc.stdout.strip().startswith("{"):
        try:
            parsed = json.loads(proc.stdout)
        except json.JSONDecodeError:
            parsed = None
    return proc.returncode, parsed, proc.stderr.strip()


def evaluate(path: Path) -> dict[str, Any]:
    data = load(path)
    base = path.parent.resolve()
    errors: list[str] = []
    warnings: list[str] = []

    if data.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    if not str(data.get("device_id", "")).strip():
        errors.append("device_id is required")
    if not str(data.get("pcb_revision", "")).strip():
        errors.append("pcb_revision is required")

    runtime = data.get("runtime_profile")
    if not isinstance(runtime, dict):
        errors.append("runtime_profile must be an object")
    else:
        for key, expected in EXPECTED_RUNTIME.items():
            if runtime.get(key) != expected:
                errors.append(f"runtime_profile.{key} mismatch: expected {expected!r}, got {runtime.get(key)!r}")

    if data.get("source_mapping") != EXPECTED_MAPPING:
        errors.append("source_mapping must be exact PA1/PC2/PB1")
    for key in PASS_FIELDS:
        if not is_pass(data.get(key)):
            errors.append(f"{key} must be PASS/true")
    if data.get("device_config_writes_prohibited") is not True:
        errors.append("device_config_writes_prohibited must be true")
    if data.get("factory_reset_prohibited") is not True:
        errors.append("factory_reset_prohibited must be true")

    candidate_hash = str(data.get("candidate_sha256", "")).lower()
    rollback_hash = str(data.get("rollback_sha256", "")).lower()
    if not SHA256_RE.fullmatch(candidate_hash):
        errors.append("candidate_sha256 must be a full SHA-256")
    if not SHA256_RE.fullmatch(rollback_hash):
        errors.append("rollback_sha256 must be a full SHA-256")
    if candidate_hash and rollback_hash and candidate_hash == rollback_hash:
        errors.append("candidate and rollback hashes must differ")

    # Re-run the exact candidate gate at preflash time and bind the live hashes to
    # the same manifest. A stale PASS report for a different binary is insufficient.
    manifest_path = resolve(base, str(data.get("metering_candidate_manifest", "")))
    manifest_obj: dict[str, Any] = {}
    if not manifest_path.is_file():
        errors.append(f"metering_candidate_manifest missing: {manifest_path}")
    else:
        try:
            manifest_obj = load(manifest_path)
            manifest_candidate = ((manifest_obj.get("candidate") or {}).get("sha256") or "").lower()
            manifest_rollback = ((manifest_obj.get("rollback") or {}).get("sha256") or "").lower()
            if candidate_hash and manifest_candidate != candidate_hash:
                errors.append("candidate_sha256 does not match metering candidate manifest")
            if rollback_hash and manifest_rollback != rollback_hash:
                errors.append("rollback_sha256 does not match metering candidate manifest")
            rc, rerun, err = run_candidate_gate(manifest_path)
            if rc != 0 or rerun is None or rerun.get("status") != "PASS":
                errors.append("fresh metering_candidate_gate recheck failed at confirmation preflash")
                if err:
                    warnings.append(err)
        except json.JSONDecodeError:
            errors.append("metering candidate manifest is invalid JSON")

    candidate_report_path = resolve(base, str(data.get("metering_candidate_gate_report", "")))
    if not candidate_report_path.is_file():
        errors.append(f"metering_candidate_gate_report missing: {candidate_report_path}")
    else:
        try:
            report = load(candidate_report_path)
            if report.get("kind") != "metering_candidate_gate" or report.get("status") != "PASS":
                errors.append("metering candidate gate report must be PASS")
            if manifest_obj and report.get("candidate_id") != manifest_obj.get("candidate_id"):
                errors.append("metering candidate gate report candidate_id does not match manifest")
            if manifest_obj and report.get("supervisor_commit") != manifest_obj.get("supervisor_commit"):
                errors.append("metering candidate gate report supervisor_commit does not match manifest")
        except json.JSONDecodeError:
            errors.append("metering candidate gate report is invalid JSON")

    recovery_report_path = resolve(base, str(data.get("recovery_class_a_report", "")))
    if not recovery_report_path.is_file():
        errors.append(f"recovery_class_a_report missing: {recovery_report_path}")
    else:
        try:
            report = load(recovery_report_path)
            if report.get("kind") != "class_a_gate" or report.get("mode") not in ("recovery", "all") or report.get("status") != "PASS":
                errors.append("recovery Class A gate report must be PASS in recovery/all mode")
            if report.get("device_id") != data.get("device_id"):
                errors.append("recovery Class A report device_id does not match confirmation canary")
        except json.JSONDecodeError:
            errors.append("recovery Class A report is invalid JSON")

    plan = data.get("test_plan")
    if not isinstance(plan, dict):
        errors.append("test_plan must be an object")
    else:
        if plan.get("kind") != "automated_canary_validation":
            errors.append("test_plan.kind must be automated_canary_validation")
        if plan.get("load_type") != "resistive":
            errors.append("first confirmation test must use a resistive load")
        if int(plan.get("minimum_cycles", 0)) < 3:
            errors.append("first confirmation test requires at least 3 cycles")
        max_w = float(plan.get("max_declared_load_w", 0))
        if max_w <= 0 or max_w > 150:
            errors.append("max_declared_load_w must be >0 and <=150 W")

    if not errors:
        warnings.append(
            "This gate authorizes only eligibility for the first source-mapping confirmation OTA; hardware Class A closes only after automated functional confirmation passes."
        )

    return {
        "schema_version": 1,
        "kind": "confirmation_preflash_gate",
        "status": "PASS" if not errors else "FAIL",
        "device_id": data.get("device_id"),
        "pcb_revision": data.get("pcb_revision"),
        "source_mapping": EXPECTED_MAPPING,
        "candidate_sha256": candidate_hash,
        "rollback_sha256": rollback_hash,
        "errors": errors,
        "warnings": warnings,
        "next_gate": "ELIGIBLE_FOR_APPROVED_OTA_CONFIRMATION" if not errors else "BLOCKED",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Narrow first-OTA gate used only to functionally confirm the source-proven BSEED PA1/PC2/PB1 mapping.")
    ap.add_argument("state", nargs="?", type=Path)
    ap.add_argument("--json-out", type=Path)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        assert EXPECTED_MAPPING == {"cf": "PA1", "cf1": "PC2", "sel": "PB1"}
        assert len(PASS_FIELDS) >= 10
        print("SELF_TEST=PASS")
        return 0
    if args.state is None:
        ap.error("state is required unless --self-test is used")

    try:
        result = evaluate(args.state)
    except (OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
        print(f"CONFIRMATION_PREFLASH_GATE=FAIL\nERROR: {exc}", file=sys.stderr)
        return 2

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
