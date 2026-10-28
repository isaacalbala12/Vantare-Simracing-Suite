"""Strict structural checks for generated full wire DTOs; native roundtrip is separate."""
import math
from .generate import CONTRACT, CAPABILITIES

def integer(value, minimum=0, maximum=2 ** 64 - 1):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError('Integer outside wire range')

def number(value):
    if type(value) not in (int, float) or not math.isfinite(value):
        raise ValueError('Expected finite numeric value')

def quality(value, typ):
    if value == 'unavailable':
        return
    if not isinstance(value, dict) or len(value) != 1 or next(iter(value)) not in ('reliable', 'estimated', 'stale'):
        raise ValueError('Invalid full-photo quality encoding')
    raw = next(iter(value.values()))
    if typ == 'f64':
        number(raw)
    elif typ == 'u32':
        integer(raw, 0, 2 ** 32 - 1)
    elif typ == 'u8':
        integer(raw, 0, 255)
    elif typ == 'i32':
        integer(raw, -2 ** 31, 2 ** 31 - 1)
    elif typ == 'i8':
        integer(raw, -128, 127)
    elif typ == 'bool':
        if type(raw) is not bool:
            raise ValueError('Expected boolean')
    elif typ == 'String':
        if not isinstance(raw, str):
            raise ValueError('Expected string')
    elif typ in ('SessionKindDto', 'SessionStateDto', 'StartPhaseDto', 'TyreCompoundDto', 'DriverRatingDto'):
        choices = {'SessionKindDto': {'practice',
                'qualifying',
                'race'},
            'SessionStateDto': {'preparing',
                'running',
                'interrupted',
                'finished'},
            'StartPhaseDto': {'grid',
                'formation',
                'countdown',
                'racing'},
            'TyreCompoundDto': {'soft',
                'medium',
                'hard',
                'wet'},
            'DriverRatingDto': {'bronze',
                'silver',
                'gold',
                'platinum'}}[typ]
        if not isinstance(raw, str) or raw not in choices:
            raise ValueError('Unknown generated enum')
    elif typ == 'GapDto':
        if not isinstance(raw, dict) or len(raw) != 1:
            raise ValueError('Invalid gap variant')
        if set(raw) == {'time'} and set(raw['time']) == {'seconds'}:
            number(raw['time']['seconds'])
            if raw['time']['seconds'] < 0:
                raise ValueError('Classification gap cannot be negative')
        elif set(raw) == {'laps'} and set(raw['laps']) == {'count'}:
            integer(raw['laps']['count'], 0, 2 ** 32 - 1)
        else:
            raise ValueError('Invalid externally tagged gap')
    elif typ == 'PoseDto':
        if not isinstance(raw, dict) or set(raw) != {'x_m', 'y_m', 'yaw_rad'}:
            raise ValueError('Invalid pose')
        for v in raw.values():
            number(v)
    elif typ == '[f64; 2]':
        if not isinstance(raw, list) or len(raw) != 2:
            raise ValueError('Invalid velocity vector')
        for v in raw:
            number(v)
    else:
        raise ValueError('Unreviewed wire type: ' + typ)

def section(value, name, extra):
    spec = CONTRACT['sections'][name]
    fields = spec['quality_fields']
    optional = set(spec['omit_unavailable'])
    if not isinstance(value, dict) or not set(fields) - optional <= set(value):
        raise ValueError('Missing full-photo fields: ' + name)
    if set(value) - set(fields) - set(extra):
        raise ValueError('Unreviewed field in ' + name)
    for key, typ in fields.items():
        if key in value:
            quality(value[key], typ)

def validate(snapshot):
    if not isinstance(snapshot,
        dict) or set(snapshot) != {'version',
        'epoch',
        'sequence',
        'origin',
        'state'} or snapshot['version'] != 11:
        raise ValueError('Expected SnapshotDto v11')
    integer(snapshot['epoch'])
    integer(snapshot['sequence'])
    origin = snapshot['origin']
    if set(origin) != {'simulator',
        'kind',
        'source_time',
        'received_at'} or origin['simulator'] != 'lmu' or origin['kind'] != 'live':
        raise ValueError('Invalid synthetic source origin')
    for name in ('source_time', 'received_at'):
        d = origin[name]
        if d is None and name == 'source_time':
            continue
        if not isinstance(d, dict) or set(d) != {'secs', 'nanos'}:
            raise ValueError('Duration must use secs/nanos')
        integer(d['secs'])
        integer(d['nanos'], 0, 999999999)
    state = snapshot['state']
    if set(state) != {'source_state', 'driving_situation', 'capabilities', 'session', 'flags', 'cars', 'player'}:
        raise ValueError('Invalid generated full state keys')
    if state['source_state'] not in ('waiting',
        'live',
        'paused',
        'stale',
        'lost') or state['driving_situation'] not in ('unknown',
        'on_track',
        'garage',
        'paused',
        'replay'):
        raise ValueError('Unknown state enum')
    if set(state['capabilities']) != set(CAPABILITIES) or any((v not in ('unsupported',
                'supported',
                'with_data',
                'fresh') for v in state['capabilities'].values())):
        raise ValueError('Invalid capabilities')
    section(state['session'], 'SessionDto', {'id'})
    integer(state['session']['id'])
    flags = state['flags']
    if flags != 'unavailable':
        if not isinstance(flags,
            dict) or len(flags) != 1 or next(iter(flags)) not in ('reliable',
            'estimated',
            'stale'):
            raise ValueError('Invalid flag quality')
        for flag in next(iter(flags.values())):
            if set(flag) != {'kind', 'scope'}:
                raise ValueError('Invalid flag')
            kind, scope = (flag['kind'], flag['scope'])
            if isinstance(kind, dict):
                if set(kind) != {'other'} or not isinstance(kind['other'], str):
                    raise ValueError('Invalid other flag')
            elif kind not in ('green', 'yellow', 'blue', 'red', 'white', 'black', 'checkered'):
                raise ValueError('Unknown flag kind')
            if scope != 'session':
                if not isinstance(scope, dict) or len(scope) != 1 or next(iter(scope)) not in ('sector', 'car'):
                    raise ValueError('Invalid flag scope')
                integer(next(iter(scope.values())), 0, 255 if 'sector' in scope else 2 ** 32 - 1)
    ids = []
    for car in state['cars']:
        section(car,
            'CarDto',
            {'id',
                'number',
                'vehicle',
                'driver_id',
                'driver_name',
                'class',
                'last_sectors_s',
                'best_sectors_s',
                'current_sectors_s'})
        integer(car['id'], 0, 2 ** 32 - 1)
        ids.append(car['id'])
        if 'class' in car and (not isinstance(car['class'], list) or len(car['class']) != 2):
            raise ValueError('Class is an id/name tuple')
        for key in ('last_sectors_s', 'best_sectors_s', 'current_sectors_s'):
            for item in car.get(key, []):
                quality(item, 'f64')
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate car identity')
    player = state['player']
    if player is not None:
        section(player, 'PlayerDto', {'car', 'fuel_history', 'damage_tyre_wear'})
        if player['car'] not in ids:
            raise ValueError('Player car missing')
        wear = player['damage_tyre_wear']
        if len(wear) != 4:
            raise ValueError('Exactly four tyre slots')
        for item in wear:
            quality(item, 'f64')
        history = player.get('fuel_history', [])
        if len(history) > 10:
            raise ValueError('Fuel history exceeds native ring')
        previous = -1
        for lap, litres in history:
            integer(lap, 0, 2 ** 32 - 1)
            number(litres)
            if lap <= previous or litres <= 0:
                raise ValueError('Invalid measured fuel history')
            previous = lap
    return True
