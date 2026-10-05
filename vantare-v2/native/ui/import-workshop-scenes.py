# Fixtures de demostración: importa valores y calidades exportados del Workshop React.
# Uso: python native/ui/import-workshop-scenes.py <exported-scenes.json>
import json, copy, math
from pathlib import Path
root = Path(__file__).resolve().parent
import sys
source = Path(sys.argv[1])
template = json.loads((root / 'fixtures/standings.snapshot.json').read_text())

def quality(field, convert=lambda v: v):
    if not isinstance(field, dict) or field.get('q') not in ('fresh', 'estimated', 'stale') or 'v' not in field or (field['v'] is None):
        return 'unavailable'
    return {{'fresh': 'reliable', 'estimated': 'estimated', 'stale': 'stale'}.get(field.get('q'), 'reliable'): convert(field['v'])} if field.get('q') != 'missing' else 'unavailable'

def convert(frame, index, widget):
    d = copy.deepcopy(template)
    d['epoch'] = 3
    d['sequence'] = index + 1
    d['origin']['simulator'] = 'unknown'
    d['origin']['received_at'] = {'secs': index, 'nanos': 0}
    st = d['state']
    ses = frame['session']
    st['session']['kind'] = quality(ses.get('phase'))
    st['session']['track_name'] = quality(ses.get('track'))
    st['session']['remaining_s'] = quality(ses.get('remaining'))
    st['session']['laps_total'] = quality(ses.get('maxLaps'))
    st['session']['laps_remaining'] = quality(frame.get('fuel', {}).get('sessionLaps'))
    st['cars'] = []
    ids = {row['id']: id_map[row['id']] for row in frame['standings']}
    classes = {row.get('classId', ''): row.get('classRef', i + 1) for i, row in enumerate(frame['standings'])}
    for row in frame['standings']:
        car = copy.deepcopy(template['state']['cars'][0])
        cid = ids[row['id']]
        car.update(id=cid, driver_id=cid, driver_name=row['driver'], number=row.get('number', ''), **{'class': [classes[row.get('classId', '')], row.get('classId', '')]})
        for name, key in [('position', 'position'), ('class_position', 'classPosition'), ('laps', 'laps')]:
            car[name] = {'reliable': row[key]} if key in row else 'unavailable'
        for name, key in [('best_lap_s', 'bestLap'), ('last_lap_s', 'lastLap')]:
            car[name] = quality(row.get(key))
        car['in_pits'] = {'reliable': row.get('pit') == 'pit'}
        car['gap_leader'] = quality(row.get('gap'), lambda v: {'time': {'seconds': v}})
        st['cars'].append(car)
    player = st['player']
    src = frame.get('player', {})
    player['car'] = ids.get(src.get('id'), 1)
    for name, key in [('throttle', 'throttle'), ('brake', 'brake'), ('clutch', 'clutch'), ('gear', 'gear'), ('speed_mps', 'speed'), ('steering', 'steering')]:
        player[name] = quality(src.get(key))
    player['engine_speed_rad_s'] = quality(src.get('rpm'), lambda v: v * math.tau / 60)
    player['delta_best_s'] = quality(frame.get('delta', {}).get('seconds'))
    fuel = frame.get('fuel', {})
    for name, key in [('fuel_level_l', 'remaining'), ('fuel_capacity_l', 'capacity'), ('fuel_per_lap_l', 'perLap'), ('fuel_laps_left', 'estimatedLaps')]:
        player[name] = quality(fuel.get(key))
    for row in frame.get('relative', []):
        if row['id'] in ids:
            car = next((c for c in st['cars'] if c['id'] == ids[row['id']]))
            car['relative_s'] = quality(row.get('gap'), lambda v: abs(v) if row.get('side') == 'ahead' else -abs(v))
            car['relative_laps'] = quality(row.get('lapDelta'))
            if widget in ('relative', 'multiclass-relative'):
                car['last_lap_s'] = quality(row.get('lastLap'))
    st['capabilities'].update(powertrain='fresh', fuel='fresh', delta='fresh' if player['delta_best_s'] != 'unavailable' else 'with_data', weather='fresh')
    history = fuel.get('history', {})
    if history.get('q') == 'fresh':
        player['fuel_history'] = list(zip(history.get('lap', []), history.get('consumed', [])))
    damage = frame.get('damage', {})
    wear = damage.get('tyreWear', {})
    if wear.get('q') == 'fresh' and len(wear.get('v', [])) == 4:
        player['damage_tyre_wear'] = [{'reliable': v} for v in wear['v']]
        st['capabilities']['damage'] = 'fresh'
    radar = frame.get('radar', {})
    if radar.get('mode') == 'xyz' and radar.get('cars'):
        st['capabilities']['spatial'] = 'fresh'
        player_car = next((c for c in st['cars'] if c['id'] == player['car']), None)
        if player_car:
            player_car['pose'] = {'reliable': {'x_m': 0, 'y_m': 0, 'yaw_rad': 0}}
        for i, sample in enumerate(radar['cars']):
            car = copy.deepcopy(template['state']['cars'][0])
            for key, value in list(car.items()):
                if isinstance(value, dict):
                    car[key] = 'unavailable'
            car.update(id=1000 + i, driver_id=1000 + i, driver_name=sample['id'], number='', pose={'reliable': {'x_m': sample['x'], 'y_m': -sample['z'], 'yaw_rad': 0}})
            car['class'] = None
            st['cars'].append(car)
    weather = frame.get('weather', {})
    for name, key, fn in [('weather_air_temperature_k', 'ambientC', lambda v: v + 273.15), ('weather_track_temperature_k', 'trackC', lambda v: v + 273.15), ('weather_wind_speed_mps', 'windKph', lambda v: v / 3.6), ('weather_rain', 'rainPercent', lambda v: v / 100), ('weather_track_wetness', 'wetnessPct', lambda v: v / 100), ('weather_pressure_pa', 'pressureHpa', lambda v: v * 100)]:
        st['session'][name] = quality(weather.get(key), fn)
    flag = ses.get('flag', {})
    st['flags'] = {'reliable': [{'kind': flag['v'], 'scope': 'session'}]} if 'v' in flag else 'unavailable'
    return d
catalog = json.loads(source.read_text(encoding='utf-8'))
source_ids = sorted({row['id'] for scene in catalog for frame in scene['frames']
                     for row in frame['runtime']['overlayV2Frame']['standings']})
id_map = {source_id: index + 1 for index, source_id in enumerate(source_ids)}
for scene in catalog:
    document = {k: scene[k] for k in ['id', 'widget', 'label', 'frameMs']}
    document['watchFor'] = scene.get('watchFor', 'Datos de demostración del Workshop React.')
    document['frames'] = [{'caption': f['caption'], 'snapshot': convert(f['runtime']['overlayV2Frame'], i, scene['widget'])} for i, f in enumerate(scene['frames'])]
    (root / 'fixtures' / f"{scene['id']}.scene.json").write_text(json.dumps(document, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print('converted', len(catalog), 'scenes')
