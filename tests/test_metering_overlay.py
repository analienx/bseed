import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "apply-metering-overlay.py"
spec = importlib.util.spec_from_file_location("metering_overlay", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class MeteringOverlayTests(unittest.TestCase):
    def test_device_db_restores_established_config_and_keeps_calibration(self):
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
        for marker in module.CALIBRATION_MARKERS:
            self.assertIn(marker, updated)

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

    def test_parser_overlay_adds_identity_scoped_implicit_meter(self):
        source = "\n".join(
            [
                '#include <string.h>',
                module.GLOBAL_NEEDLE,
                '',
                'void parse_config() {',
                '    const char *zb_manufacturer = "b28wrpvx";',
                '    const char *zb_model = "TS011F-BS-PM";',
                '    for (;;) {',
                '        if (0) {',
                '        }',
                '    }',
                '',
                '    peripherals_init();',
                '',
                '    // later endpoint construction',
                module.PROTECTED_RELAY_NEEDLE,
                '        electrical_measurement_cluster_set_protected_relay(0, 0);',
                '    }',
                '}',
            ]
        )
        updated, changed = module.overlay_config_parser(source)
        self.assertTrue(changed)
        self.assertIn('strcmp(zb_manufacturer, "b28wrpvx") == 0', updated)
        self.assertIn('strcmp(zb_model, "TS011F-BS-PM") == 0', updated)
        self.assertIn('hal_gpio_parse_pin("A1")', updated)
        self.assertIn('hal_gpio_parse_pin("C2")', updated)
        self.assertIn('hal_gpio_parse_pin("B1")', updated)
        self.assertIn('energy_monitoring_protect_relay = 0;', updated)
        self.assertIn(
            'energy_monitoring_enabled && energy_monitoring_protect_relay &&',
            updated,
        )

        second, changed_again = module.overlay_config_parser(updated)
        self.assertFalse(changed_again)
        self.assertEqual(updated, second)

    def test_candidate_config_is_byte_for_byte_existing_control_config(self):
        self.assertEqual(
            module.CANDIDATE_CONFIG,
            'b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;',
        )
        for token in ('LC3', 'SB5u', 'RD2', 'IB4', 'M'):
            self.assertIn(f';{token};', ';' + module.CANDIDATE_CONFIG)
        self.assertNotIn('EP', module.CANDIDATE_CONFIG)
        self.assertNotIn('EB', module.CANDIDATE_CONFIG)
        self.assertNotIn('LC3p', module.CANDIDATE_CONFIG)
        self.assertNotIn('IB4p', module.CANDIDATE_CONFIG)

    def test_verified_meter_gpio_are_code_hook_not_config_mutation(self):
        self.assertNotIn('A1', module.CANDIDATE_CONFIG)
        self.assertNotIn('C2', module.CANDIDATE_CONFIG)
        self.assertNotIn('B1', module.CANDIDATE_CONFIG)
        self.assertIn('A1', module.POST_PARSE_REPLACEMENT)
        self.assertIn('C2', module.POST_PARSE_REPLACEMENT)
        self.assertIn('B1', module.POST_PARSE_REPLACEMENT)


if __name__ == '__main__':
    unittest.main()
