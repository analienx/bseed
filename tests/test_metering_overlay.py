import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "apply-metering-overlay.py"
spec = importlib.util.spec_from_file_location("metering_overlay", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class MeteringOverlayTests(unittest.TestCase):
    def test_device_db_overlay_is_narrow_and_idempotent(self):
        source = f"""
{module.DEVICE_KEY}:
  config_str: {module.ORIGINAL_CONFIG}
  hlw8012_voltage_multiplier: 161460
  hlw8012_current_multiplier: 144679
  hlw8012_power_multiplier: 16989
"""
        updated, changed = module.overlay_device_db(source)
        self.assertTrue(changed)
        self.assertIn(module.CANDIDATE_CONFIG, updated)
        self.assertNotIn(module.ORIGINAL_CONFIG, updated)

        second, changed_again = module.overlay_device_db(updated)
        self.assertFalse(changed_again)
        self.assertEqual(updated, second)

    def test_device_db_rejects_missing_calibration(self):
        source = f"""
{module.DEVICE_KEY}:
  config_str: {module.ORIGINAL_CONFIG}
  hlw8012_voltage_multiplier: 161460
  hlw8012_current_multiplier: 144679
"""
        with self.assertRaisesRegex(RuntimeError, "calibration marker"):
            module.overlay_device_db(source)

    def test_parser_overlay_adds_explicit_no_overload_gate(self):
        source = "\n".join(
            [
                "#include <string.h>",
                module.GLOBAL_NEEDLE,
                "",
                module.PARSE_START_NEEDLE,
                "    char *cursor = 0;",
                "    if (cursor) {",
                module.OL_NEEDLE,
                "        }",
                "    }",
                "",
                "void peripherals_init(void) {",
                module.PROTECTED_RELAY_NEEDLE,
                "        electrical_measurement_cluster_set_protected_relay(0, 0);",
                "    }",
                "}",
            ]
        )
        updated, changed = module.overlay_config_parser(source)
        self.assertTrue(changed)
        self.assertIn('strcmp(entry, "NOOL") == 0', updated)
        self.assertIn("overload_protection_enabled = 0;", updated)
        self.assertIn(
            "energy_monitoring_enabled && overload_protection_enabled &&", updated
        )

        second, changed_again = module.overlay_config_parser(updated)
        self.assertFalse(changed_again)
        self.assertEqual(updated, second)

    def test_candidate_preserves_control_gpio_and_uses_verified_meter_gpio(self):
        cfg = module.CANDIDATE_CONFIG
        for token in ("LC3", "SB5u", "RD2", "IB4"):
            self.assertIn(f";{token};", ";" + cfg)
        self.assertIn(";EPA1C2B1;", ";" + cfg)
        self.assertIn(";NOOL;", ";" + cfg)
        self.assertNotIn("LC3p", cfg)
        self.assertNotIn("IB4p", cfg)
        self.assertLessEqual(len(cfg), 64)


if __name__ == "__main__":
    unittest.main()
