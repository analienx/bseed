import binascii
import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path

from scripts.candidate_gate import (
    EXPECTED_CONFIG,
    EXPECTED_PROFILE,
    PINNED_UPSTREAM,
    validate_manifest,
)
from scripts.ota_guard import (
    BASE_FMT,
    BASE_SIZE,
    FORCED_FILE_VERSION,
    OTA_MAGIC,
    SUBELEMENT_FMT,
    TELINK_MAX_FIRMWARE_SIZE,
    TELINK_OTA_MAGIC,
    OtaError,
    baseline_manifest,
    parse_image,
    parse_ota,
    verify_candidate,
)
from scripts.preflash_gate import EXPECTED as PREFLASH_EXPECTED, PASS_FIELDS, evaluate as evaluate_preflash
from scripts.recovery_surface_guard import is_protected


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_telink_payload(version=10, startup_flag=0x544C4E4B, config=EXPECTED_CONFIG, body_size=128):
    body_size = max(body_size, 0x20 + len(config.encode()) + 1)
    body = bytearray(b"\xA5" * body_size)
    body[2:6] = int(version).to_bytes(4, "little")
    body[6:8] = TELINK_OTA_MAGIC
    body[8:12] = int(startup_flag).to_bytes(4, "little")
    if config:
        raw = config.encode()
        body[0x20 : 0x20 + len(raw)] = raw
    final_size = len(body) + 4
    body[0x18:0x1C] = final_size.to_bytes(4, "little")
    crc = (binascii.crc32(body) ^ 0xFFFFFFFF) & 0xFFFFFFFF
    return bytes(body) + crc.to_bytes(4, "little")


def build_ota(
    path,
    manufacturer=4417,
    image_type=43556,
    version=10,
    outer_version=None,
    field_control=0,
    min_hw=None,
    max_hw=None,
    startup_flag=0x544C4E4B,
    config=EXPECTED_CONFIG,
    body_size=128,
    subelement_id=0,
):
    optional = b""
    if field_control & 1:
        optional += b"\x01"
    if field_control & 2:
        optional += bytes.fromhex("8877665544332211")
    if field_control & 4:
        optional += struct.pack("<HH", min_hw or 1, max_hw or 2)
    payload = make_telink_payload(version, startup_flag, config, body_size)
    hlen = BASE_SIZE + len(optional)
    if outer_version is None:
        outer_version = version
    total = hlen + struct.calcsize(SUBELEMENT_FMT) + len(payload)
    header = struct.pack(
        BASE_FMT,
        OTA_MAGIC,
        0x0100,
        hlen,
        field_control,
        manufacturer,
        image_type,
        outer_version,
        2,
        b"BSEED TEST".ljust(32, b"\0"),
        total,
    )
    sub = struct.pack(SUBELEMENT_FMT, subelement_id, len(payload))
    path.write_bytes(header + optional + sub + payload)


def make_candidate_case(root):
    candidate = root / "candidate.zigbee"
    rollback = root / "rollback-forced.zigbee"
    build_ota(candidate, version=11)
    build_ota(rollback, version=10, outer_version=FORCED_FILE_VERSION)

    baseline = root / "baseline.json"
    baseline.write_text(
        json.dumps(baseline_manifest(rollback, "LKG", EXPECTED_CONFIG)),
        encoding="utf-8",
    )

    source_report = root / "source_guard.json"
    source_report.write_text(
        json.dumps(
            {
                "status": "PASS",
                "baseline": PINNED_UPSTREAM,
                "head": "a" * 40,
                "protected_changed": [],
            }
        ),
        encoding="utf-8",
    )

    manifest = {
        "schema_version": 2,
        "candidate_id": "CAND-001",
        "candidate_stage": "PM_INACTIVE",
        "source_commit": "a" * 40,
        "board_profile": dict(EXPECTED_PROFILE),
        "ota_mode": "normal",
        "candidate_ota": candidate.name,
        "candidate_sha256": sha(candidate),
        "baseline_manifest": baseline.name,
        "rollback_ota": rollback.name,
        "rollback_sha256": sha(rollback),
        "source_guard_report": source_report.name,
        "pm_default_enabled": False,
        "device_config_changed": False,
        "base_gpio_changed": False,
        "nvm_schema_changed": False,
        "recovery_critical_changes": [],
        "offline_checks": {
            "build": "PASS",
            "upstream_stub_tests": "PASS",
            "project_policy_tests": "PASS",
            "source_guard": "PASS",
        },
    }
    mp = root / "candidate_manifest.json"
    mp.write_text(json.dumps(manifest), encoding="utf-8")
    return mp, manifest


class OtaGuardTests(unittest.TestCase):
    def test_valid_header_and_telink_payload(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zigbee"
            build_ota(p)
            h, t = parse_image(p, EXPECTED_CONFIG)
            self.assertEqual((h.manufacturer_code, h.image_type), (4417, 43556))
            self.assertTrue(t.crc_valid)
            self.assertEqual(t.required_ascii_occurrences, 1)

    def test_bad_outer_magic_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zigbee"
            build_ota(p)
            d = bytearray(p.read_bytes())
            d[:4] = b"BAD!"
            p.write_bytes(d)
            with self.assertRaises(OtaError):
                parse_ota(p)

    def test_total_size_mismatch_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zigbee"
            build_ota(p)
            p.write_bytes(p.read_bytes() + b"x")
            with self.assertRaises(OtaError):
                parse_image(p)

    def test_bad_subelement_id_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zigbee"
            build_ota(p, subelement_id=9)
            with self.assertRaises(OtaError):
                parse_image(p)

    def test_bad_telink_magic_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zigbee"
            build_ota(p)
            d = bytearray(p.read_bytes())
            payload_start = BASE_SIZE + struct.calcsize(SUBELEMENT_FMT)
            d[payload_start + 6 : payload_start + 8] = b"\x00\x00"
            p.write_bytes(d)
            with self.assertRaises(OtaError):
                parse_image(p)

    def test_bad_telink_crc_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zigbee"
            build_ota(p)
            d = bytearray(p.read_bytes())
            d[-1] ^= 0x01
            p.write_bytes(d)
            with self.assertRaises(OtaError):
                parse_image(p)

    def test_outer_inner_version_mismatch_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zigbee"
            build_ota(p, version=10, outer_version=11)
            with self.assertRaises(OtaError):
                parse_image(p)

    def test_forced_outer_version_allowed(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zigbee"
            build_ota(p, version=10, outer_version=FORCED_FILE_VERSION)
            h, _ = parse_image(p)
            self.assertEqual(h.file_version, FORCED_FILE_VERSION)

    def test_required_config_missing_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zigbee"
            build_ota(p, config="other;device;")
            with self.assertRaises(OtaError):
                parse_image(p, EXPECTED_CONFIG)

    def test_oversize_payload_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zigbee"
            build_ota(p, body_size=TELINK_MAX_FIRMWARE_SIZE)
            with self.assertRaises(OtaError):
                parse_image(p)

    def test_image_identity_change_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            b = Path(td) / "b.zigbee"
            c = Path(td) / "c.zigbee"
            build_ota(b, version=10, outer_version=FORCED_FILE_VERSION)
            build_ota(c, image_type=1234, version=11)
            self.assertEqual(
                verify_candidate(c, baseline_manifest(b, "LKG", EXPECTED_CONFIG), 4417, 43556, EXPECTED_CONFIG)["status"],
                "FAIL",
            )

    def test_hardware_constraint_change_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            b = Path(td) / "b.zigbee"
            c = Path(td) / "c.zigbee"
            build_ota(b, field_control=4, min_hw=1, max_hw=2, outer_version=FORCED_FILE_VERSION)
            build_ota(c, version=11, field_control=4, min_hw=1, max_hw=3)
            self.assertEqual(
                verify_candidate(c, baseline_manifest(b, "LKG", EXPECTED_CONFIG), 4417, 43556, EXPECTED_CONFIG)["status"],
                "FAIL",
            )

    def test_startup_flag_change_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            b = Path(td) / "b.zigbee"
            c = Path(td) / "c.zigbee"
            build_ota(b, outer_version=FORCED_FILE_VERSION)
            build_ota(c, version=11, startup_flag=0x12345678)
            self.assertEqual(
                verify_candidate(c, baseline_manifest(b, "LKG", EXPECTED_CONFIG), 4417, 43556, EXPECTED_CONFIG)["status"],
                "FAIL",
            )


class CandidateGateTests(unittest.TestCase):
    def test_valid_candidate(self):
        with tempfile.TemporaryDirectory() as td:
            self.assertEqual(validate_manifest(make_candidate_case(Path(td))[0])["status"], "PASS")

    def test_pm_default_enabled_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p, m = make_candidate_case(Path(td))
            m["pm_default_enabled"] = True
            p.write_text(json.dumps(m), encoding="utf-8")
            self.assertEqual(validate_manifest(p)["status"], "FAIL")

    def test_recovery_surface_change_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p, m = make_candidate_case(Path(td))
            m["recovery_critical_changes"] = ["ota_client"]
            p.write_text(json.dumps(m), encoding="utf-8")
            self.assertEqual(validate_manifest(p)["status"], "FAIL")

    def test_hash_mismatch_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p, m = make_candidate_case(Path(td))
            m["candidate_sha256"] = "0" * 64
            p.write_text(json.dumps(m), encoding="utf-8")
            self.assertEqual(validate_manifest(p)["status"], "FAIL")

    def test_board_profile_drift_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p, m = make_candidate_case(Path(td))
            m["board_profile"]["device_type"] = "end_device"
            p.write_text(json.dumps(m), encoding="utf-8")
            self.assertEqual(validate_manifest(p)["status"], "FAIL")

    def test_source_guard_failure_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            p, m = make_candidate_case(root)
            report = root / m["source_guard_report"]
            sr = json.loads(report.read_text())
            sr["status"] = "FAIL"
            report.write_text(json.dumps(sr), encoding="utf-8")
            self.assertEqual(validate_manifest(p)["status"], "FAIL")

    def test_nonforced_rollback_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            p, m = make_candidate_case(root)
            rollback = root / m["rollback_ota"]
            build_ota(rollback, version=10, outer_version=10)
            m["rollback_sha256"] = sha(rollback)
            baseline = root / m["baseline_manifest"]
            baseline.write_text(json.dumps(baseline_manifest(rollback, "LKG", EXPECTED_CONFIG)), encoding="utf-8")
            p.write_text(json.dumps(m), encoding="utf-8")
            self.assertEqual(validate_manifest(p)["status"], "FAIL")


class RecoverySurfaceGuardTests(unittest.TestCase):
    def test_protected_paths(self):
        self.assertTrue(is_protected("src/telink/main.c"))
        self.assertTrue(is_protected("src/telink/ota_reformating/ram_code_flash.c"))
        self.assertTrue(is_protected("device_db.yaml"))
        self.assertFalse(is_protected("src/base_components/power_meter.c"))


class PreflashGateTests(unittest.TestCase):
    def make_state(self, root: Path):
        rollback = root / "rollback-forced.zigbee"
        build_ota(rollback, version=10, outer_version=FORCED_FILE_VERSION)
        backup = root / "full-flash-backup.bin"
        backup.write_bytes(b"backup-image")
        evidence = root / "lkg-self-reinstall.json"
        evidence.write_text('{"status":"PASS"}\n', encoding="utf-8")
        state = {
            "schema_version": 1,
            "device_id": "DEV-001",
            "pcb_revision": "BSEED-PM-REV-A",
            "canary_authorized": True,
            **PREFLASH_EXPECTED,
            "current_sw_build_id": "1.1.2-test",
            "rollback_ota": rollback.name,
            "rollback_sha256": sha(rollback),
            "full_flash_backup": backup.name,
            "full_flash_backup_sha256": sha(backup),
            "lkg_self_reinstall_evidence": evidence.name,
            "device_config_writes_prohibited": True,
            "pm_enabled": False,
            "reset_loop_observed": False,
            "unexpected_reboots_observed": False,
            "coordinator_maintenance_during_ota": False,
        }
        for field in PASS_FIELDS:
            state[field] = "PASS"
        p = root / "preflash.json"
        p.write_text(json.dumps(state), encoding="utf-8")
        return p, state

    def test_valid_preflash_state(self):
        with tempfile.TemporaryDirectory() as td:
            p, _ = self.make_state(Path(td))
            self.assertEqual(evaluate_preflash(p)["status"], "PASS")

    def test_missing_lkg_drill_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p, state = self.make_state(Path(td))
            state["lkg_self_reinstall"] = "PENDING"
            p.write_text(json.dumps(state), encoding="utf-8")
            self.assertEqual(evaluate_preflash(p)["status"], "FAIL")

    def test_device_config_drift_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p, state = self.make_state(Path(td))
            state["device_config"] = "b28wrpvx;TS011F-BS-PM;WRONG;"
            p.write_text(json.dumps(state), encoding="utf-8")
            self.assertEqual(evaluate_preflash(p)["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
