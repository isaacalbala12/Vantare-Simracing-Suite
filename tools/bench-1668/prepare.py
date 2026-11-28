"""Create isolated bench settings from TinyPedal's published widget names."""
import ast
import json
from pathlib import Path

bench = Path('C:/VantareServer/bench')
source = bench / 'source/TinyPedal-2.51.0/tinypedal/template/setting_widget.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
widget_dict = next(node.value for node in tree.body if isinstance(node, ast.Assign)
                   and any(isinstance(t, ast.Name) and t.id == 'WIDGET_DEFAULT' for t in node.targets))
names = [ast.literal_eval(key) for key in widget_dict.keys]
positions = dict(standings=(30, 40), relative=(1300, 40), deltabest=(800, 80), pedal=(1700, 800))
preset = {name: {'enable': name in positions} for name in names}
for name, (x, y) in positions.items():
    preset[name].update(position_x=x, position_y=y)
preset['overlay'] = {'fixed_position': True, 'auto_hide': False}
profile = bench / 'tinypedal-profile/TinyPedal'
profile.mkdir(parents=True, exist_ok=True)
settings = bench / 'TinyPedal-2.51.0/TinyPedal/settings'
settings.mkdir(exist_ok=True)
config = dict(application=dict(show_at_startup=False, check_for_updates_on_startup=False,
                               position_x=-4000, position_y=0),
              user_path=dict(settings_path=settings.as_posix() + '/'))
(profile / 'config.json').write_text(json.dumps(config, indent=2), encoding='utf-8')
(settings / 'default.json').write_text(json.dumps(preset, indent=2), encoding='utf-8')
instances = []
for kind, name in [('standings', 'standings'), ('relative', 'relative'), ('delta', 'deltabest'), ('pedals', 'pedal')]:
    x, y = positions[name]
    instances.append(dict(id='bench-' + kind, x=x, y=y, visible=True, opacity=1,
                          offTrack='always_visible', settings=dict(kind=kind, designSystem='vantare')))
(bench / 'vantare-layout.json').write_text(json.dumps(dict(version=1,
      canvasResolution=dict(width=1920, height=1080), instances=instances), indent=2), encoding='utf-8')
print('Settings created. Actual widget visibility/data still requires human verification in LMU.')
