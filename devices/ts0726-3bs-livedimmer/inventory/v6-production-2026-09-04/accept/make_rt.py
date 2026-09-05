"""Build valid JSON bodies for HA's homeassistant.render_template (avoids all cmd/ssh quoting traps)."""
import json
import pathlib

TMP = pathlib.Path(r"C:\Users\jakub\OneDrive\Projects\bseed-dimmer\.qwen\tmp")
I = "select.livingroommaindimmer_relay_{}_indicator_mode"
P = "select.livingroommaindimmer_relay_{}_physical_mode"

bodies = {
    "rt-gate1.json": "states('{}') == 'Always on' and states('{}') == 'Always on' and states('{}') == 'Follow logical state'".format(
        P.format("left"), P.format("middle"), P.format("right")),
    "rt-gate2.json": "states('{}') == 'Binding status' and states('{}') == 'Binding status' and states('{}') == 'Physical output'".format(
        I.format("left"), I.format("middle"), I.format("right")),
    "rt-left.json": '{{ "state_relay_left":"{{ \'ON\' if is_state(\'light.livingroomlineardimmer\', \'on\') else \'OFF\' }}", '
                    '"relay_left_binding_intent":"{{ \'ON\' if is_state(\'light.livingroomlineardimmer\', \'on\') else \'OFF\' }}" }}',
    "rt-full.json": '{{ "state_relay_left":"{{ \'ON\' if is_state(\'light.livingroomlineardimmer\', \'on\') else \'OFF\' }}", '
                    '"relay_left_binding_intent":"{{ \'ON\' if is_state(\'light.livingroomlineardimmer\', \'on\') else \'OFF\' }}", '
                    '"state_relay_middle":"{{ \'ON\' if is_state(\'light.lr_kitchen_table_bulbs\', \'on\') else \'OFF\' }}", '
                    '"relay_middle_binding_intent":"{{ \'ON\' if is_state(\'light.lr_kitchen_table_bulbs\', \'on\') else \'OFF\' }}" }}',
    "rt-finalizer-cond.json": "'Binding status' in (state_attr('{}', 'options') | default([], true))".format(I.format("left")),
}
for name, tpl in bodies.items():
    (TMP / name).write_text(json.dumps({"template": tpl}), encoding="utf-8", newline="\n")
    print("wrote", name, len(tpl), "chars")
