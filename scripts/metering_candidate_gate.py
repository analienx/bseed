#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

SOURCE_REPO = "HobboRobin/tuya-zigbee-switch-with-metering"
SOURCE_COMMIT = "8b8cc4924a353b35880666f7b48f0afbee89eb17"
EXPECTED_CONFIG = "b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;"
EXPECTED_CONVERTER_BLOB = "53b7c7bc66df95ca0316a98398f37bcee04a2a23"
EXPECTED_METER_GPIO = {"cf": "PA1", "cf1": "PC2", "sel": "PB1"}
FORCED_FILE_VERSION = 0xFFFFFFFF
SHA256_RE = re.compile(r"^[0-9a-f]{64}$", re.I)

EXPECTED_PROFILE = {
    "manufacturer_name": "b28wrpvx",
    "model_id": "TS011F-BS-PM",
    "device_type": "router",
    "mcu_family": "Telink",
    "mcu": "TLSR8258",
    "device_config": EXPECTED_CONFIG,
    "ota_manufacturer_code": 4417,
    "ota_image_type": 43556,
}
EXPECTED_METER = {
    "ic": "BL0937",
    "cf_gpio": "PA1",
    "cf1_gpio": "PC2",
    "sel_gpio": "PB1",
    "activation": "identity_scoped_implicit_fallback",
    "boot_enabled": True,
    "overload_relay_actuation": False,
    "voltage_multiplier": 161460,
    "current_multiplier": 144679,
    "power_multiplier": 16989,
}
EXPECTED_FALSE_INVARIANTS = {
    "device_config_changed",
    "device_config_write_required",
    "factory_reset_required",
    "base_gpio_changed",
    "ota_identity_changed",
    "router_role_changed",
    "overload_relay_actuation",
}
REQUIRED_OFFLINE_CHECKS = {
    "build",
    "downstream_tests",
    "project_policy_tests",
    "source_guard",
    "ota_guard",
    "converter_pin",
    "build_provenance",
}
EXPECTED_OVERLAY_FILES = [
    "device_db.yaml",
    "src/device_config/config_parser.c",
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def git_blob_sha1(path: Path) -> str:
    data = path.read_bytes()
    h = hashlib.sha1()
    h.update(f"blob {len(data)}\0".encode("ascii"))
    h.update(data)
    return h.hexdigest()


def resolve(base: Path, raw: str) -> Path:
    p = Path(raw)
    return p if p.is_absolute() else (base / p).resolve()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


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


def _check_exact_dict(
    actual: Any, expected: dict[str, Any], prefix: str, errors: list[str]
) -> None:
    if not isinstance(actual, dict):
        errors.append(f"{prefix} must be an object")
        return
    for key, value in expected.items():
        if actual.get(key) != value:
            errors.append(
                f"{prefix}.{key} mismatch: expected {value!r}, got {actual.get(key)!r}"
            )


def _require_sha256(value: Any, field: str, errors: list[str]) -> str:
    value = str(value or "")
    if not SHA256_RE.fullmatch(value):
        errors.append(f"{field} must be a full SHA-256")
    return value.lower()


def evaluate(path: Path) -> dict[str, Any]:
    m = load_json(path)
    base = path.parent.resolve()
    errors: list[str] = []
    warnings: list[str] = []

    if m.get("schema_version") != 2:
        errors.append("schema_version must be 2")
    if m.get("candidate_kind") != "adopted_bseed_metering":
        errors.append("candidate_kind must be adopted_bseed_metering")

    candidate_id = str(m.get("candidate_id", ""))
    if not candidate_id:
        errors.append("candidate_id is required")
    supervisor_commit = str(m.get("supervisor_commit", ""))
    if not re.fullmatch(r"[0-9a-fA-F]{40}", supervisor_commit):
        errors.append("supervisor_commit must be a full 40-character Git SHA")

    source = m.get("source")
    if not isinstance(source, dict):
        errors.append("source must be an object")
        source = {}
    if source.get("repo") != SOURCE_REPO:
        errors.append(f"source.repo must be {SOURCE_REPO}")
    if source.get("commit") != SOURCE_COMMIT:
        errors.append(f"source.commit must be pinned {SOURCE_COMMIT}")

    overlay_script_hash = _require_sha256(
        source.get("overlay_script_sha256"), "source.overlay_script_sha256", errors
    )
    overlay_guard_hash = _require_sha256(
        source.get("overlay_guard_sha256"), "source.overlay_guard_sha256", errors
    )

    # Bind the manifest to the exact supervisor tooling executing this gate.
    local_overlay_script = Path(__file__).with_name("apply-metering-overlay.py")
    local_overlay_guard = Path(__file__).with_name("metering_overlay_guard.py")
    if local_overlay_script.is_file() and overlay_script_hash:
        if sha256_file(local_overlay_script) != overlay_script_hash:
            errors.append("source.overlay_script_sha256 does not match local reviewed overlay script")
    else:
        errors.append("local apply-metering-overlay.py is missing")
    if local_overlay_guard.is_file() and overlay_guard_hash:
        if sha256_file(local_overlay_guard) != overlay_guard_hash:
            errors.append("source.overlay_guard_sha256 does not match local reviewed overlay guard")
    else:
        errors.append("local metering_overlay_guard.py is missing")

    _check_exact_dict(m.get("board_profile"), EXPECTED_PROFILE, "board_profile", errors)
    _check_exact_dict(m.get("meter"), EXPECTED_METER, "meter", errors)

    invariants = m.get("invariants")
    if not isinstance(invariants, dict):
        errors.append("invariants must be an object")
    else:
        missing = EXPECTED_FALSE_INVARIANTS - set(invariants)
        if missing:
            errors.append("invariants missing: " + ", ".join(sorted(missing)))
        for key in EXPECTED_FALSE_INVARIANTS & set(invariants):
            if invariants.get(key) is not False:
                errors.append(f"invariants.{key} must be false")

    checks = m.get("offline_checks")
    if not isinstance(checks, dict):
        errors.append("offline_checks must be an object")
    else:
        missing = REQUIRED_OFFLINE_CHECKS - set(checks)
        if missing:
            errors.append("offline_checks missing: " + ", ".join(sorted(missing)))
        for key in REQUIRED_OFFLINE_CHECKS & set(checks):
            if checks.get(key) != "PASS":
                errors.append(f"offline_checks.{key} must be PASS")

    # Exact source overlay report produced by CI.
    source_guard_path = resolve(base, str(source.get("source_guard_report", "")))
    if not source_guard_path.is_file():
        errors.append(f"source guard report does not exist: {source_guard_path}")
    else:
        try:
            guard = load_json(source_guard_path)
            if guard.get("kind") != "metering_overlay_guard":
                errors.append("source guard has wrong kind")
            if guard.get("status") != "PASS":
                errors.append("source guard status is not PASS")
            if guard.get("baseline") != SOURCE_COMMIT:
                errors.append("source guard baseline is not the pinned downstream commit")
            if guard.get("changed_files") != EXPECTED_OVERLAY_FILES:
                errors.append("source guard changed_files are not the exact reviewed overlay files")
            if guard.get("exact_overlay_match") is not True:
                errors.append("source guard did not prove exact overlay equality")
            ov = guard.get("overlay") or {}
            if ov.get("candidate_config") != EXPECTED_CONFIG:
                errors.append("source guard overlay does not preserve device_config")
            if ov.get("nvm_device_config_write_required") is not False:
                errors.append("source guard overlay requires a forbidden device_config write")
            if ov.get("meter_gpio") != EXPECTED_METER_GPIO:
                errors.append("source guard meter GPIO mapping mismatch")
            if ov.get("overload_relay_actuation") is not False:
                errors.append("source guard allows overload relay actuation")
        except json.JSONDecodeError:
            errors.append("source guard report is not valid JSON")

    candidate = m.get("candidate")
    if not isinstance(candidate, dict):
        errors.append("candidate must be an object")
        candidate = {}
    ota_mode = candidate.get("ota_mode")
    if ota_mode not in {"normal", "forced"}:
        errors.append("candidate.ota_mode must be normal or forced")
    candidate_path = resolve(base, str(candidate.get("ota", "")))
    candidate_hash = _require_sha256(candidate.get("sha256"), "candidate.sha256", errors)
    if not candidate_path.is_file():
        errors.append(f"candidate OTA does not exist: {candidate_path}")
    elif candidate_hash and sha256_file(candidate_path) != candidate_hash:
        errors.append("candidate OTA hash mismatch")

    converter = m.get("converter")
    if not isinstance(converter, dict):
        errors.append("converter must be an object")
        converter = {}
    converter_path = resolve(base, str(converter.get("path", "")))
    converter_hash = _require_sha256(converter.get("sha256"), "converter.sha256", errors)
    if converter.get("git_blob") != EXPECTED_CONVERTER_BLOB:
        errors.append("converter.git_blob does not match pinned downstream converter")
    if not converter_path.is_file():
        errors.append(f"converter does not exist: {converter_path}")
    else:
        if converter_hash and sha256_file(converter_path) != converter_hash:
            errors.append("converter SHA-256 mismatch")
        if git_blob_sha1(converter_path) != EXPECTED_CONVERTER_BLOB:
            errors.append("converter contents do not match pinned Git blob")

    # Bind candidate/converter/source to CI-produced immutable build provenance.
    provenance_path = resolve(base, str(m.get("build_provenance", "")))
    provenance: dict[str, Any] = {}
    if not provenance_path.is_file():
        errors.append(f"build provenance does not exist: {provenance_path}")
    else:
        try:
            provenance = load_json(provenance_path)
            if provenance.get("schema") != 3:
                errors.append("build provenance schema must be 3")
            if provenance.get("supervisor_commit") != supervisor_commit:
                errors.append("build provenance supervisor_commit mismatch")
            if provenance.get("metering_source_repo") != SOURCE_REPO:
                errors.append("build provenance source repo mismatch")
            if provenance.get("metering_source_commit") != SOURCE_COMMIT:
                errors.append("build provenance source commit mismatch")
            if provenance.get("overlay_script_sha256") != overlay_script_hash:
                errors.append("build provenance overlay script hash mismatch")
            if provenance.get("overlay_guard_sha256") != overlay_guard_hash:
                errors.append("build provenance overlay guard hash mismatch")
            if provenance.get("z2m_converter_git_blob") != EXPECTED_CONVERTER_BLOB:
                errors.append("build provenance converter Git blob mismatch")
            if converter_hash and provenance.get("z2m_converter_sha256") != converter_hash:
                errors.append("build provenance converter SHA-256 mismatch")
            if provenance.get("board") != "OUTLET_BSEED_PM_TS011F_b28wrpvx":
                errors.append("build provenance board mismatch")
            if provenance.get("device_type") != "router":
                errors.append("build provenance device_type mismatch")
            if provenance.get("preserved_device_config") != EXPECTED_CONFIG:
                errors.append("build provenance device_config mismatch")
            if provenance.get("meter_gpio") != EXPECTED_METER_GPIO:
                errors.append("build provenance meter GPIO mismatch")
            if provenance.get("nvm_device_config_write_required") is not False:
                errors.append("build provenance requires device_config write")
            if provenance.get("overload_relay_actuation") is not False:
                errors.append("build provenance allows overload relay actuation")
            if provenance.get("flash_authorized") is not False:
                errors.append("build provenance must explicitly state flash_authorized=false")

            artifact_key = "candidate_normal" if ota_mode == "normal" else "candidate_forced"
            built = provenance.get(artifact_key)
            if not isinstance(built, dict):
                errors.append(f"build provenance missing {artifact_key}")
            else:
                if candidate_hash and built.get("sha256") != candidate_hash:
                    errors.append(f"build provenance {artifact_key} hash mismatch")
                if candidate_path.name and built.get("file_name") != candidate_path.name:
                    errors.append(f"build provenance {artifact_key} filename mismatch")
        except json.JSONDecodeError:
            errors.append("build provenance is not valid JSON")

    rollback = m.get("rollback")
    if not isinstance(rollback, dict):
        errors.append("rollback must be an object")
        rollback = {}
    rollback_path = resolve(base, str(rollback.get("ota", "")))
    rollback_hash = _require_sha256(rollback.get("sha256"), "rollback.sha256", errors)
    baseline_path = resolve(base, str(rollback.get("baseline_manifest", "")))
    if not rollback_path.is_file():
        errors.append(f"rollback OTA does not exist: {rollback_path}")
    elif rollback_hash and sha256_file(rollback_path) != rollback_hash:
        errors.append("rollback OTA hash mismatch")
    if not baseline_path.is_file():
        errors.append(f"rollback baseline manifest does not exist: {baseline_path}")

    if candidate_path.is_file() and rollback_path.is_file():
        if sha256_file(candidate_path) == sha256_file(rollback_path):
            errors.append("candidate and rollback binaries are identical")

    if rollback_path.is_file():
        rc, info, err = run_ota_guard(
            ["inspect", str(rollback_path), "--required-ascii", EXPECTED_CONFIG]
        )
        if rc != 0 or info is None:
            errors.append("rollback OTA failed ota_guard inspection")
            if err:
                warnings.append(err)
        else:
            h = info["header"]
            if h.get("manufacturer_code") != 4417 or h.get("image_type") != 43556:
                errors.append("rollback OTA identity is not 4417/43556")
            if h.get("file_version") != FORCED_FILE_VERSION:
                errors.append("rollback must be the proven forced/reinstall artifact")

    if baseline_path.is_file() and rollback_path.is_file():
        try:
            baseline = load_json(baseline_path)
            if baseline.get("header", {}).get("sha256", "").lower() != rollback_hash:
                errors.append("baseline manifest does not describe exact rollback hash")
        except json.JSONDecodeError:
            errors.append("rollback baseline manifest is not valid JSON")

    if candidate_path.is_file() and baseline_path.is_file():
        rc, report, err = run_ota_guard(
            [
                "verify-candidate",
                str(candidate_path),
                "--baseline",
                str(baseline_path),
                "--expected-manufacturer",
                "4417",
                "--expected-image-type",
                "43556",
                "--required-ascii",
                EXPECTED_CONFIG,
            ]
        )
        if rc != 0 or report is None:
            errors.append("candidate OTA failed ota_guard verification")
            if err:
                warnings.append(err)
        else:
            warnings.extend(report.get("warnings", []))
            info = report.get("candidate") or {}
            h = info.get("header") or {}
            t = info.get("telink") or {}
            outer = h.get("file_version")
            inner = t.get("inner_file_version")
            if ota_mode == "normal" and outer != inner:
                errors.append("normal candidate requires outer file version == inner version")
            if ota_mode == "normal" and outer == FORCED_FILE_VERSION:
                errors.append("normal candidate may not use forced outer version")
            if ota_mode == "forced" and outer != FORCED_FILE_VERSION:
                errors.append("forced candidate requires outer file version 0xFFFFFFFF")
            if ota_mode == "forced":
                warnings.append("forced candidate must use an isolated canary-only OTA index")

    return {
        "schema_version": 2,
        "kind": "metering_candidate_gate",
        "status": "PASS" if not errors else "FAIL",
        "candidate_id": candidate_id,
        "supervisor_commit": supervisor_commit,
        "errors": errors,
        "warnings": warnings,
        "next_gate": "LIVE_PREFLASH_GATE" if not errors else "BLOCKED",
    }


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Hard gate for the adopted hardware-proven BSEED metering canary."
    )
    ap.add_argument("manifest", nargs="?", type=Path)
    ap.add_argument("--json-out", type=Path)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        assert SOURCE_COMMIT == "8b8cc4924a353b35880666f7b48f0afbee89eb17"
        assert EXPECTED_PROFILE["device_config"] == EXPECTED_CONFIG
        assert EXPECTED_METER_GPIO == {"cf": "PA1", "cf1": "PC2", "sel": "PB1"}
        assert EXPECTED_METER["overload_relay_actuation"] is False
        assert EXPECTED_CONVERTER_BLOB == "53b7c7bc66df95ca0316a98398f37bcee04a2a23"
        assert "build_provenance" in REQUIRED_OFFLINE_CHECKS
        print("SELF_TEST=PASS")
        return 0

    if args.manifest is None:
        ap.error("manifest is required unless --self-test is used")

    try:
        result = evaluate(args.manifest)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"METERING_CANDIDATE_GATE=FAIL\nERROR: {exc}", file=sys.stderr)
        return 2

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
