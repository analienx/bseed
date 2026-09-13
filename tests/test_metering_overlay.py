import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "apply-metering-overlay.py"
spec = importlib.util.spec_from_file_location("metering_overlay", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def parser_source():
    return "\n".join(
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
        source = parser_source()
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

    def test_protection_descendant_only_enables_exact_target_relay_coupling(self):
        source = parser_source()
        updated, changed = module.overlay_config_parser(
            source, enable_overload_relay=True
        )
        self.assertTrue(changed)
        self.assertIn('energy_monitoring_protect_relay = 1;', updated)
        self.assertNotIn('energy_monitoring_protect_relay = 0;', updated)
        self.assertIn(
            'energy_monitoring_enabled && energy_monitoring_protect_relay &&',
            updated,
        )

        second, changed_again = module.overlay_config_parser(
            updated, enable_overload_relay=True
        )
        self.assertFalse(changed_again)
        self.assertEqual(updated, second)

        with self.assertRaises(RuntimeError):
            module.overlay_config_parser(updated, enable_overload_relay=False)

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


class NoLoadFilterModel:
    """Executable contract oracle for the ordered HLW8012 floor decision."""

    def __init__(self):
        self.samples = 0
        self.suppressed = False
        self.energy_units = 0
        self.calibration = (161460, 144679, 16989)

    def sample(self, voltage_cv, current_ma, power_w, energy_units=1):
        if power_w <= 2 and current_ma <= 50:
            self.samples = min(self.samples + 1, 3)
            if self.samples == 3:
                self.suppressed = True
                current_ma = 0
                power_w = 0
        else:
            self.samples = 0
            self.suppressed = False

        if not self.suppressed:
            self.energy_units += energy_units
        return {
            'voltage_cv': voltage_cv,
            'current_ma': current_ma,
            'power_w': power_w,
            'energy_units': self.energy_units,
            'overload_input_w': 0 if self.suppressed else power_w,
        }


class NoLoadBehaviorTests(unittest.TestCase):
    def test_residual_enters_floor_without_energy_or_overload_input(self):
        meter = NoLoadFilterModel()
        first = meter.sample(23950, 37, 1)
        second = meter.sample(23950, 37, 1)
        confirmed = meter.sample(23950, 37, 1)
        held = meter.sample(23950, 37, 1)

        self.assertEqual((first['current_ma'], first['power_w']), (37, 1))
        self.assertEqual((second['current_ma'], second['power_w']), (37, 1))
        self.assertEqual(confirmed['voltage_cv'], 23950)
        self.assertEqual(confirmed['current_ma'], 0)
        self.assertEqual(confirmed['power_w'], 0)
        self.assertEqual(confirmed['energy_units'], 2)
        self.assertEqual(confirmed['overload_input_w'], 0)
        self.assertEqual(held['energy_units'], 2)

    def test_real_load_exits_floor_on_first_sample(self):
        meter = NoLoadFilterModel()
        for _ in range(3):
            meter.sample(23950, 37, 1)

        load = meter.sample(23950, 126, 30, energy_units=30)
        self.assertEqual((load['current_ma'], load['power_w']), (126, 30))
        self.assertEqual(load['overload_input_w'], 30)
        self.assertEqual(load['energy_units'], 32)

    def test_return_to_no_load_requires_three_samples_again(self):
        meter = NoLoadFilterModel()
        load = meter.sample(23950, 126, 30, energy_units=30)
        first = meter.sample(23950, 37, 1)
        second = meter.sample(23950, 37, 1)
        confirmed = meter.sample(23950, 37, 1)

        self.assertEqual(load['power_w'], 30)
        self.assertEqual(first['power_w'], 1)
        self.assertEqual(second['power_w'], 1)
        self.assertEqual(confirmed['power_w'], 0)
        self.assertEqual(confirmed['energy_units'], 32)

    def test_floor_does_not_change_calibration(self):
        meter = NoLoadFilterModel()
        before = meter.calibration
        for _ in range(3):
            meter.sample(23950, 37, 1)
        self.assertEqual(meter.calibration, before)


if __name__ == '__main__':
    unittest.main()
