import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


functional = load_module("functional_confirmation_gate_test", ROOT / "scripts" / "functional_confirmation_gate.py")
class_a = load_module("class_a_gate_test", ROOT / "scripts" / "class_a_gate.py")


class FunctionalClassAPathTests(unittest.TestCase):
    def test_functional_gate_accepts_clean_summary(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            summary = {
                "schema_version": 1,
                "kind": "automated_canary_validation",
                "status": "PASS",
                "device_id": "DEV-001",
                "pcb_revision": "REV-A",
                "source_mapping": {"cf": "PA1", "cf1": "PC2", "sel": "PB1"},
                "safety_mode": "SAFE_SINGLE_LAYER_LOW_POWER",
                "cycles": [{}, {}, {}],
                "evaluation": {
                    "status": "PASS",
                    "mapping_confirmation": {
                        "cf_pa1_confirmed": True,
                        "cf1_pc2_confirmed": True,
                        "sel_pb1_confirmed": True,
                    },
                },
                "final_relay_state": "OFF",
                "device_config_write_performed": False,
                "factory_reset_performed": False,
                "calibration_write_performed": False,
                "ota_update_performed_by_harness": False,
            }
            p = root / "summary.json"
            p.write_text(json.dumps(summary), encoding="utf-8")
            result = functional.evaluate(p)
            self.assertEqual(result["status"], "PASS")
            self.assertEqual(result["next_gate"], "DEVICE_FUNCTIONALLY_CONFIRMED")

    def test_class_a_accepts_functional_mapping_plus_proven_recovery(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            fg = {
                "schema_version": 1,
                "kind": "functional_confirmation_gate",
                "status": "PASS",
                "device_id": "DEV-001",
                "pcb_revision": "REV-A",
                "mapping": {"cf": "PA1", "cf1": "PC2", "sel": "PB1"},
            }
            (root / "functional-gate.json").write_text(json.dumps(fg), encoding="utf-8")
            recovery = {}
            recovery["A-R01"] = {
                "status": "RECOVERY_PROVEN",
                "value": {"path": "lkg-forced.zigbee", "sha256": "a" * 64},
                "evidence": "baseline manifest",
            }
            for i in range(2, 8):
                recovery[f"A-R{i:02d}"] = {
                    "status": "RECOVERY_PROVEN",
                    "value": True,
                    "evidence": f"recovery proof {i}",
                }
            evidence = {
                "schema_version": 2,
                "device_id": "DEV-001",
                "pcb_revision": "REV-A",
                "hardware_verification_method": "AUTOMATED_FUNCTIONAL",
                "functional_confirmation_report": "functional-gate.json",
                "hardware": {
                    "A-H02": {
                        "status": "DEVICE_FUNCTIONALLY_CONFIRMED",
                        "value": {
                            "manufacturer_name": "b28wrpvx",
                            "model_id": "TS011F-BS-PM",
                            "device_type": "router",
                            "mcu": "TLSR8258",
                            "device_config": "b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;",
                        },
                        "evidence": "runtime export",
                    }
                },
                "recovery": recovery,
            }
            p = root / "class-a.json"
            p.write_text(json.dumps(evidence), encoding="utf-8")
            result = class_a.evaluate(p, "all")
            self.assertEqual(result["status"], "PASS")
            self.assertEqual(result["class_a_unknown_count"], 0)
            self.assertEqual(result["hardware_verification_method"], "AUTOMATED_FUNCTIONAL")

    def test_class_a_rejects_wrong_functional_mapping(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "functional-gate.json").write_text(json.dumps({
                "kind": "functional_confirmation_gate",
                "status": "PASS",
                "device_id": "DEV-001",
                "pcb_revision": "REV-A",
                "mapping": {"cf": "PB9", "cf1": "PC2", "sel": "PB1"},
            }), encoding="utf-8")
            evidence = {
                "schema_version": 2,
                "device_id": "DEV-001",
                "pcb_revision": "REV-A",
                "hardware_verification_method": "AUTOMATED_FUNCTIONAL",
                "functional_confirmation_report": "functional-gate.json",
                "hardware": {
                    "A-H02": {
                        "status": "DEVICE_FUNCTIONALLY_CONFIRMED",
                        "value": {
                            "manufacturer_name": "b28wrpvx",
                            "model_id": "TS011F-BS-PM",
                            "device_type": "router",
                            "mcu": "TLSR8258",
                            "device_config": "b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;",
                        },
                        "evidence": "runtime export",
                    }
                },
                "recovery": {},
            }
            p = root / "class-a.json"
            p.write_text(json.dumps(evidence), encoding="utf-8")
            result = class_a.evaluate(p, "hardware")
            self.assertEqual(result["status"], "FAIL")
            self.assertTrue(any("PA1/PC2/PB1" in e for e in result["errors"]))

    def test_recovery_closes_from_ota_proof_without_pcb_or_sws_evidence(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            evidence = {
                "schema_version": 2,
                "device_id": "DEV-001",
                "hardware": {},
                "recovery": {
                    "A-R01": {"status": "RECOVERY_PROVEN", "value": {"path": "lkg.zigbee", "sha256": "a" * 64}, "evidence": "parsed forced LKG"},
                    "A-R02": {"status": "RECOVERY_PROVEN", "value": True, "evidence": "LKG self-reinstall"},
                    "A-R03": {"status": "RECOVERY_PROVEN", "value": True, "evidence": "post-reinstall OTA liveness"},
                },
            }
            p = root / "recovery.json"
            p.write_text(json.dumps(evidence), encoding="utf-8")
            result = class_a.evaluate(p, "recovery")
            self.assertEqual(result["status"], "PASS")
            self.assertEqual(result["class_a_unknown_count"], 0)


if __name__ == "__main__":
    unittest.main()
