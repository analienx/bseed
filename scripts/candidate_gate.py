#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

PINNED_UPSTREAM = "bf1059ee4c029e320a97fbfa6b07bd6ce4aa1702"
FORCED_FILE_VERSION = 0xFFFFFFFF
EXPECTED_CONFIG = "b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;"
EXPECTED_PROFILE = {
    "board": "WALL_OUTLET_BSEED_TS011F_PM",
    "manufacturer_name": "b28wrpvx",
    "model_id": "TS011F-BS-PM",
    "device_type": "router",
    "mcu_family": "Telink",
    "mcu": "TLSR8258",
    "config_str": EXPECTED_CONFIG,
    "ota_manufacturer_code": 4417,
    "ota_image_type": 43556,
}

RECOVERY_CRITICAL_SURFACES = {
    "bootloader", "flash_layout", "ota_client", "ota_identity",
    "zigbee_network_init", "critical_nvm_layout", "watchdog_early_boot",
    "recovery_path", "device_config", "base_gpio_mapping",
}

REQUIRED_OFFLINE_CHECKS = {
    "build",
    "upstream_stub_tests",
    "project_policy_tests",
    "source_guard",
}

ALLOWED_STAGES = {
    "PIPELINE_NOOP",
    "PM_INACTIVE",
    "ACTIVATION_ONLY",
    "CF_ONLY",
    "CF_CF1",
    "SEL",
    "CALIBRATION",
    "CLUSTERS",
    "ENERGY",
    "REPORTING",
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve(base: Path, raw: str) -> Path:
    p = Path(raw)
    return p if p.is_absolute() else (base / p).resolve()


def run_ota_guard(args: list[str]) -> tuple[int, dict[str, Any] | None, str]:
    cmd = [sys.executable, str(Path(__file__).with_name("ota_guard.py")), *args]
    proc = subprocess.run(cmd, text=True, capture_output=True)
    parsed = None
    if proc.stdout.strip().startswith("{"):
        try:
            parsed = json.loads(proc.stdout)
        except json.JSONDecodeError:
            parsed = None
    return proc.returncode, parsed, proc.stderr.strip()


def validate_manifest(path: Path) -> dict[str, Any]:
    m = load(path)
    base = path.parent.resolve()
    errors: list[str] = []
    warnings: list[str] = []

    required = [
        "schema_version", "candidate_id", "candidate_stage", "source_commit",
        "board_profile", "ota_mode", "candidate_ota", "candidate_sha256",
        "baseline_manifest", "rollback_ota", "rollback_sha256",
        "source_guard_report", "pm_default_enabled", "recovery_critical_changes",
        "device_config_changed", "base_gpio_changed", "nvm_schema_changed",
        "offline_checks",
    ]
    for key in required:
        if key not in m:
            errors.append(f"missing required field: {key}")
    if errors:
        return {"status": "FAIL", "errors": errors, "warnings": warnings}

    if m.get("schema_version") != 2:
        errors.append("candidate manifest schema_version must be 2")

    source_commit = m.get("source_commit")
    if not isinstance(source_commit, str) or len(source_commit) != 40:
        errors.append("source_commit must be a full 40-character Git commit SHA")

    stage = m.get("candidate_stage")
    if stage not in ALLOWED_STAGES:
        errors.append(f"candidate_stage must be one of {sorted(ALLOWED_STAGES)}")

    profile = m.get("board_profile")
    if not isinstance(profile, dict):
        errors.append("board_profile must be an object")
    else:
        for key, expected in EXPECTED_PROFILE.items():
            if profile.get(key) != expected:
                errors.append(f"board_profile.{key} mismatch: expected {expected!r}, got {profile.get(key)!r}")

    if m.get("pm_default_enabled") is not False:
        errors.append("pm_default_enabled must be false for every experimental candidate")
    if m.get("device_config_changed") is not False:
        errors.append("device_config_changed must be false; BSEED base config is immutable")
    if m.get("base_gpio_changed") is not False:
        errors.append("base_gpio_changed must be false; relay/button/LED mapping is immutable")
    if m.get("nvm_schema_changed") is not False:
        errors.append("nvm_schema_changed must be false in the current development gate")

    changes = m.get("recovery_critical_changes")
    if not isinstance(changes, list):
        errors.append("recovery_critical_changes must be a list")
    elif changes:
        errors.append("recovery_critical_changes must be empty for ordinary PM candidates: " + ", ".join(map(str, changes)))

    candidate = resolve(base, str(m.get("candidate_ota", "")))
    rollback = resolve(base, str(m.get("rollback_ota", "")))
    baseline = resolve(base, str(m.get("baseline_manifest", "")))
    source_report = resolve(base, str(m.get("source_guard_report", "")))

    for label, p in (
        ("candidate_ota", candidate),
        ("rollback_ota", rollback),
        ("baseline_manifest", baseline),
        ("source_guard_report", source_report),
    ):
        if not p.is_file():
            errors.append(f"{label} does not exist: {p}")

    if candidate.is_file() and sha256_file(candidate).lower() != str(m.get("candidate_sha256", "")).lower():
        errors.append("candidate_sha256 mismatch")
    if rollback.is_file() and sha256_file(rollback).lower() != str(m.get("rollback_sha256", "")).lower():
        errors.append("rollback_sha256 mismatch")
    if candidate.is_file() and rollback.is_file() and sha256_file(candidate) == sha256_file(rollback):
        errors.append("candidate and rollback binaries are identical; no experimental candidate distinction exists")

    checks = m.get("offline_checks")
    if not isinstance(checks, dict):
        errors.append("offline_checks must be an object")
    else:
        missing = sorted(REQUIRED_OFFLINE_CHECKS - set(checks))
        if missing:
            errors.append("offline_checks missing: " + ", ".join(missing))
        for name in REQUIRED_OFFLINE_CHECKS & set(checks):
            if checks[name] != "PASS":
                errors.append(f"offline check {name} is not PASS: {checks[name]!r}")

    if source_report.is_file():
        try:
            sr = load(source_report)
            if sr.get("status") != "PASS":
                errors.append("source_guard_report status is not PASS")
            if sr.get("baseline") != PINNED_UPSTREAM:
                errors.append(f"source_guard_report baseline must be pinned upstream {PINNED_UPSTREAM}")
            if isinstance(source_commit, str) and sr.get("head") != source_commit:
                errors.append("source_guard_report head does not match source_commit")
            if sr.get("protected_changed"):
                errors.append("source_guard_report contains protected_changed paths")
        except json.JSONDecodeError:
            errors.append("source_guard_report is not valid JSON")

    baseline_obj = None
    if baseline.is_file():
        try:
            baseline_obj = load(baseline)
            if baseline_obj.get("header", {}).get("sha256", "").lower() != str(m.get("rollback_sha256", "")).lower():
                errors.append("baseline manifest does not describe the exact rollback file/hash")
        except json.JSONDecodeError:
            errors.append("baseline manifest is not valid JSON")

    rollback_info = None
    if rollback.is_file():
        rc, rollback_info, err = run_ota_guard([
            "inspect", str(rollback),
            "--required-ascii", EXPECTED_CONFIG,
        ])
        if rc != 0 or rollback_info is None:
            errors.append("rollback OTA failed structural/Telink/config validation")
            if err:
                warnings.append(err)
        else:
            rh = rollback_info["header"]
            if rh.get("manufacturer_code") != 4417 or rh.get("image_type") != 43556:
                errors.append("rollback OTA identity is not BSEED custom 4417/43556")
            if rh.get("file_version") != FORCED_FILE_VERSION:
                errors.append("rollback OTA must be a proven forced/reinstall artifact with outer file_version 0xFFFFFFFF")

    candidate_info = None
    if candidate.is_file() and baseline.is_file():
        rc, candidate_report, err = run_ota_guard([
            "verify-candidate", str(candidate),
            "--baseline", str(baseline),
            "--expected-manufacturer", "4417",
            "--expected-image-type", "43556",
            "--required-ascii", EXPECTED_CONFIG,
        ])
        if rc != 0 or candidate_report is None:
            errors.append("ota_guard candidate verification failed")
            if err:
                warnings.append(err)
        else:
            candidate_info = candidate_report.get("candidate")
            warnings.extend(candidate_report.get("warnings", []))

    ota_mode = m.get("ota_mode")
    if ota_mode not in {"normal", "forced"}:
        errors.append("ota_mode must be 'normal' or 'forced'")
    elif candidate_info:
        outer = candidate_info["header"]["file_version"]
        inner = candidate_info["telink"]["inner_file_version"]
        if ota_mode == "normal" and (outer == FORCED_FILE_VERSION or outer != inner):
            errors.append("ota_mode=normal requires outer file_version to equal inner firmware version")
        if ota_mode == "forced" and outer != FORCED_FILE_VERSION:
            errors.append("ota_mode=forced requires outer file_version 0xFFFFFFFF")
        if ota_mode == "forced":
            warnings.append("forced candidate bypasses normal version ordering; keep candidate index isolated to the canary")

    return {
        "schema_version": 2,
        "kind": "candidate_gate",
        "status": "PASS" if not errors else "FAIL",
        "candidate_id": m.get("candidate_id"),
        "candidate_stage": stage,
        "errors": errors,
        "warnings": warnings,
        "next_gate": "LIVE_PREFLASH_GATE" if not errors else "BLOCKED",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Hard gate for BSEED experimental OTA candidates.")
    ap.add_argument("manifest", nargs="?", type=Path)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--json-out", type=Path)
    args = ap.parse_args()

    if args.self_test:
        assert EXPECTED_PROFILE["board"] == "WALL_OUTLET_BSEED_TS011F_PM"
        assert EXPECTED_PROFILE["ota_image_type"] == 43556
        assert "source_guard" in REQUIRED_OFFLINE_CHECKS
        assert "ota_client" in RECOVERY_CRITICAL_SURFACES
        print("SELF_TEST=PASS")
        return 0
    if args.manifest is None:
        ap.error("manifest is required unless --self-test is used")
    try:
        result = validate_manifest(args.manifest)
    except (OSError, json.JSONDecodeError) as e:
        print(f"CANDIDATE_GATE=FAIL\nERROR: {e}", file=sys.stderr)
        return 2
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
