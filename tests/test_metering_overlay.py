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
                module.PARSE_START_NEEDLE,
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
        self.assertIn(
            'energy_monitoring_protect_relay = 1;\n    device_config_read_from_nv();',
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
        self.assertFalse(module._config_has_pwm_led_flag(module.CANDIDATE_CONFIG))
        self.assertTrue(module._config_has_pwm_led_flag(module.ORIGINAL_CONFIG))
        self.assertIn('p', module.CANDIDATE_CONFIG)
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

    def test_policy_is_reset_before_every_config_parse(self):
        self.assertIn(
            'energy_monitoring_protect_relay = 1;',
            module.PARSE_START_REPLACEMENT,
        )
        self.assertLess(
            module.PARSE_START_REPLACEMENT.index('energy_monitoring_protect_relay = 1;'),
            module.PARSE_START_REPLACEMENT.index('device_config_read_from_nv();'),
        )

    def test_no_load_overlay_requires_three_samples_and_preserves_voltage_path(self):
        header = (
            module.HLW8012_NO_LOAD_DEFINES_NEEDLE
            + module.HLW8012_HEADER_NO_LOAD_NEEDLE
        )
        source = (
            module.HLW8012_POWER_NEEDLE
            + module.HLW8012_ENERGY_NEEDLE
            + module.HLW8012_POST_CF1_NEEDLE
            + module.HLW8012_INSTANT_POWER_NEEDLE
        )
        header_updated, header_changed = module.overlay_hlw8012_header(header)
        source_updated, source_changed = module.overlay_hlw8012_source(source)
        self.assertTrue(header_changed)
        self.assertTrue(source_changed)
        self.assertIn('HLW8012_NO_LOAD_POWER_W             2', header_updated)
        self.assertIn('HLW8012_NO_LOAD_CURRENT_MA          50', header_updated)
        self.assertIn('HLW8012_NO_LOAD_CONFIRM_SAMPLES     3', header_updated)
        self.assertIn('dev->data.no_load_suppressed = 1;', source_updated)
        self.assertIn('dev->data.current = 0;', source_updated)
        self.assertIn('if (!dev->data.no_load_suppressed) {', source_updated)
        self.assertIn(
            'dev->data.no_load_suppressed && power <= HLW8012_NO_LOAD_POWER_W',
            source_updated,
        )
        self.assertEqual(module.overlay_hlw8012_header(header_updated), (header_updated, False))
        self.assertEqual(module.overlay_hlw8012_source(source_updated), (source_updated, False))


if __name__ == '__main__':
    unittest.main()
