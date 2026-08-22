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


if __name__ == "__main__":
    unittest.main()
