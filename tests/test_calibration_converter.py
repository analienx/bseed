import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "patch-calibration-converter.py"
spec = importlib.util.spec_from_file_location("calibration_converter", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class CalibrationConverterTests(unittest.TestCase):
    def test_patch_is_idempotent_and_wraps_read_and_write(self):
        updated, changed = module.patch_text(module.NEEDLE)
        self.assertTrue(changed)
        self.assertIn("Number(value) * multiplier", updated)
        self.assertIn("const origConvert = result.fromZigbee[0].convert", updated)
        self.assertIn("response.state[name] = 0", updated)
        self.assertIn("raw === 0 ? 0 : raw / multiplier", updated)
        self.assertEqual(module.patch_text(updated), (updated, False))

    def test_voltage_current_and_power_round_trip_units(self):
        self.assertEqual(module.wire_value(240, 100), 24000)
        self.assertEqual(module.ui_value(24000, 100), 240)
        self.assertEqual(module.wire_value(0.523, 1000), 523)
        self.assertEqual(module.ui_value(523, 1000), 0.523)
        self.assertEqual(module.wire_value(30, 1), 30)
        self.assertEqual(module.ui_value(30, 1), 30)
        self.assertEqual(module.ui_value(0, 100), 0)

    def test_power_get_patch_is_target_scoped_and_idempotent(self):
        updated, changed = module.patch_power_access(module.POWER_NEEDLE)
        self.assertTrue(changed)
        self.assertEqual(updated.count('access: "STATE_GET"'), 3)
        self.assertIn('"TS011F-BS-PM"', updated)
        self.assertEqual(module.patch_power_access(updated), (updated, False))

    def test_scaled_measurement_keeps_state_default_for_siblings(self):
        updated, changed = module.patch_scaled_measurement_access(
            module.SCALED_MEASUREMENT_NEEDLE
        )
        self.assertTrue(changed)
        self.assertIn('endpointName, access = "STATE"', updated)
        self.assertIn('            access,', updated)
        self.assertNotIn('access: "STATE_GET"', updated)
        self.assertEqual(module.patch_scaled_measurement_access(updated), (updated, False))

    def test_protection_readback_patch_preserves_write_scaling(self):
        updated, changed = module.patch_overload_readback(module.OVERLOAD_HELPER_NEEDLE)
        self.assertTrue(changed)
        self.assertIn("Math.round(Number(value) * scale)", updated)
        self.assertIn("response[name] = response[name] / scale", updated)
        self.assertEqual(module.patch_overload_readback(updated), (updated, False))

    def test_protection_w_a_v_round_trip_is_canonical(self):
        values = {
            "overload_power_limit": 170,
            "overload_current_limit": 10.5,
            "overvoltage_warn": 240,
            "undervoltage_warn": 210,
        }
        for name, ui in values.items():
            scale = module.PROTECTION_SCALES[name]
            raw = module.wire_value(ui, scale)
            self.assertEqual(module.ui_value(raw, scale), ui, name)


if __name__ == "__main__":
    unittest.main()
