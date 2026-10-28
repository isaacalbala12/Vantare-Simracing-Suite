"""Proposed compact Engineer context. Research contract, not a product API."""
import math
import statistics
from .generate import current, player_car

def signal(value, live=True):
    if isinstance(value, dict) and len(value) == 1:
        quality, item = next(iter(value.items()))
        return {'value': item if live and quality in ('reliable',
                'estimated') else None,
            'quality': quality if live else 'stale'}
    return {'value': None, 'quality': 'unavailable'}

def gap(value, live):
    result = signal(value, live)
    data = result['value']
    if isinstance(data, dict) and 'time' in data:
        return {'value': data['time']['seconds'], 'unit': 's', 'quality': result['quality']}
    if isinstance(data, dict) and 'laps' in data:
        return {'value': data['laps']['count'], 'unit': 'laps', 'quality': result['quality']}
    return {'value': None, 'unit': None, 'quality': result['quality']}

def active_flags(snapshot):
    state = snapshot['state']
    raw = state.get('flags')
    flags = raw.get('reliable') if isinstance(raw, dict) else None
    player = state.get('player')
    if state['source_state'] != 'live' or not isinstance(flags, list) or player is None:
        return []
    result = []
    for flag in flags:
        if flag['scope'] == 'session' or flag['scope'] == {'car': player['car']}:
            kind = flag['kind']
            result.append(kind if isinstance(kind, str) else kind['other'])
    return result

def fuel_intent(snapshot):
    if snapshot['state']['source_state'] != 'live':
        return None
    player = snapshot['state'].get('player')
    if player is None:
        return None
    fuel = player['fuel_level_l']
    capacity = player['fuel_capacity_l']
    if not isinstance(fuel, dict) or 'reliable' not in fuel:
        return None
    litres = fuel['reliable']
    if not math.isfinite(litres) or litres <= 0:
        return None
    if litres <= 1:
        return 'fuel.low_1l'
    if litres <= 2:
        return 'fuel.low_2l'
    if isinstance(capacity,
        dict) and 'reliable' in capacity and (capacity['reliable'] > 0) and (litres <= capacity['reliable'] / 2):
        return 'fuel.low_half_tank'
    return None

def _events(photos):
    events = []
    previous = None
    for photo in photos:
        car = player_car(photo)
        player = photo['state'].get('player')
        if car is None or player is None:
            continue
        lap = current(car['laps'])
        flags = active_flags(photo)
        if previous is not None:
            old_car = player_car(previous)
            old_player = previous['state'].get('player')
            if old_car is not None and old_player is not None:
                for name, key in [('pit_entry', 'in_pits'), ('pit_exit', 'in_pits')]:
                    old, new = (current(old_car[key]), current(car[key]))
                    if name == 'pit_entry' and old is False and (new is True) or (name == 'pit_exit' and old is True and (new is False)):
                        events.append({'lap': lap, 'event': name, 'sequence': photo['sequence']})
                if flags != active_flags(previous):
                    events.append({'lap': lap,
                            'event': 'flags_changed',
                            'active': flags,
                            'sequence': photo['sequence']})
                old_rain = current(previous['state']['session']['weather_rain'])
                rain = current(photo['state']['session']['weather_rain'])
                if old_rain != rain:
                    events.append({'lap': lap,
                            'event': 'rain_changed',
                            'intensity': rain,
                            'sequence': photo['sequence']})
                old_damage = current(old_player['damage_body'])
                damage = current(player['damage_body'])
                if old_damage != damage:
                    events.append({'lap': lap,
                            'event': 'body_integrity_changed',
                            'integrity': damage,
                            'sequence': photo['sequence']})
                old_fuel = current(old_player['fuel_level_l'])
                fuel = current(player['fuel_level_l'])
                if old_fuel is not None and fuel is not None and (fuel > old_fuel + 0.01):
                    events.append({'lap': lap,
                            'event': 'refuel_observed',
                            'added_l': round(fuel - old_fuel,
                                4),
                            'sequence': photo['sequence']})
        previous = photo
    return events

def project(history, source_count):
    if source_count not in (5, 20, 60) or len(history) < source_count:
        raise ValueError('Need exactly the requested source-photo history; no silent shortening')
    window = history[-source_count:]
    latest = window[-1]
    state = latest['state']
    player = state.get('player')
    car = player_car(latest)
    live = state['source_state'] == 'live'
    same_epoch = [p for p in window if p['epoch'] == latest['epoch'] and p['state']['session']['id'] == state['session']['id'] and ((p['state'].get('player') or {}).get('car') == (player or {}).get('car'))]
    session = state['session']
    result = {'contract': 'vantare.engineer.context.proposal.v1',
        'synthetic': True,
        'current': {'epoch': latest['epoch'],
            'sequence': latest['sequence'],
            'source_state': state['source_state'],
            'session_id': session['id'],
            'track': signal(session['track_name'],
                live),
            'session_kind': signal(session['kind'],
                live),
            'session_state': signal(session['state'],
                live),
            'remaining_laps': signal(session['laps_remaining'],
                live),
            'remaining_s': signal(session['remaining_s'],
                live),
            'flags': {'active': active_flags(latest) if live and isinstance(state.get('flags'),
                    dict) and ('reliable' in state['flags']) else None,
                'quality': signal(state.get('flags',
                        'unavailable'),
                    live)['quality']},
            'weather': {'rain': signal(session['weather_rain'],
                    live),
                'wetness': signal(session['weather_track_wetness'],
                    live),
                'air_temperature_k': signal(session['weather_air_temperature_k'],
                    live)}},
        'recent': {'source_photos_requested': source_count,
            'source_photos_used': len(window),
            'same_context_photos': len(same_epoch),
            'excluded_context_photos': len(window) - len(same_epoch)}}
    if player is None or car is None:
        result['current']['player_available'] = False
        result['recent']['events'] = []
        return result
    c = result['current']
    c.update(player_available=True,
        car_id=player['car'],
        car_class=(car.get('class') or [None,
                None])[1],
        completed_laps=signal(car['laps'],
            live),
        position=signal(car['position'],
            live),
        class_position=signal(car['class_position'],
            live),
        gap_classification_ahead=gap(car['gap_ahead'],
            live),
        gap_class_ahead=gap(car['gap_class_ahead'],
            live),
        fuel_l=signal(player['fuel_level_l'],
            live),
        fuel_capacity_l=signal(player['fuel_capacity_l'],
            live),
        fuel_laps_left=signal(player['fuel_laps_left'],
            live),
        fuel_per_lap_l=signal(player['fuel_per_lap_l'],
            live),
        tyre_compound=signal(car.get('tyre_compound',
                'unavailable'),
            live),
        body_integrity=signal(player['damage_body'],
            live),
        pit={'in_pits': signal(car['in_pits'],
                live),
            'limiter': signal(player['pit_limiter_active'],
                live),
            'stopped': signal(player['pit_stop_stopped'],
                live),
            'service_remaining_s': signal(player.get('pit_service_remaining_s',
                    'unavailable'),
                live),
            'refuel_added_l': signal(player.get('pit_refuel_added_l',
                    'unavailable'),
                live),
            'pit_lane_permission': {'value': None,
                'quality': 'unavailable'}})
    relatives = [(r['id'], current(r['relative_s'])) for r in state['cars'] if r['id'] != player['car']]
    ahead = [(i, v) for i, v in relatives if v is not None and v > 0]
    behind = [(i, -v) for i, v in relatives if v is not None and v < 0]
    c['nearest_on_track'] = {'ahead': {'car_id': min(ahead,
                key=lambda x: x[1])[0],
            'gap_s': min(ahead,
                key=lambda x: x[1])[1]} if live and ahead else None,
        'behind': {'car_id': min(behind,
                key=lambda x: x[1])[0],
            'gap_s': min(behind,
                key=lambda x: x[1])[1]} if live and behind else None}
    position = current(car['position'])
    follower = next((item for item in state['cars'] if position is not None and current(item['position']) == position + 1),
        None)
    c['gap_classification_behind'] = gap(follower['gap_ahead'],
        live) if follower else {'value': None,
        'unit': None,
        'quality': 'unavailable'}
    c['tyre_wear_pct'] = [{'value': round((1 - v) * 100,
                2) if live and (v := current(item)) is not None else None,
            'quality': signal(item,
                live)['quality']} for item in player['damage_tyre_wear']]
    usable = [p for p in same_epoch if p['state']['source_state'] == 'live' and player_car(p) is not None]
    laps = {}
    for p in usable:
        pc = player_car(p)
        lap = current(pc['laps'])
        time = current(pc['last_lap_s'])
        if lap is not None and time is not None:
            laps[lap] = time
    times = list(laps.values())
    fuel_values = [current(p['state']['player']['fuel_level_l']) for p in usable]
    fuel_values = [v for v in fuel_values if v is not None]
    gaps = [current(player_car(p)['gap_ahead']) for p in usable]
    gaps = [g['time']['seconds'] for g in gaps if isinstance(g, dict) and 'time' in g]
    history_samples = {}
    for p in usable:
        for lap, litres in p['state']['player'].get('fuel_history', []):
            history_samples[lap] = litres
    minimum_lap = min((current(player_car(p)['laps']) for p in usable), default=None)
    consumption = [v for lap, v in history_samples.items() if minimum_lap is not None and lap >= minimum_lap]
    events = _events(usable)
    result['recent'].update(laps_covered=[min(laps),
            max(laps)] if laps else [],
        pace_s={'latest': times[-1] if times else None,
            'mean': round(statistics.mean(times),
                3) if times else None,
            'change_first_to_last': round(times[-1] - times[0],
                3) if len(times) > 1 else None},
        consumption_l_per_lap={'mean': round(statistics.mean(consumption),
                4) if consumption else None,
            'measured_laps': len(consumption)},
        fuel_l={'first': fuel_values[0] if fuel_values else None,
            'latest': c['fuel_l']['value']},
        gap_ahead_s={'first': gaps[0] if gaps else None,
            'latest': c['gap_classification_ahead']['value'] if c['gap_classification_ahead']['unit'] == 's' else None,
            'change': round(gaps[-1] - gaps[0],
                4) if len(gaps) > 1 else None},
        events=events[-12:],
        events_total=len(events),
        events_omitted=max(0,
            len(events) - 12))
    plan = {'status': 'unavailable',
        'reason': 'current_race_fuel_range_unavailable',
        'pit_in_laps': None,
        'requires_confirmation': True,
        'pit_lane_permission': None,
        'calculated_by': 'synthetic_fixture_code'}
    fuel_range = c['fuel_laps_left']['value']
    remaining = c['remaining_laps']['value']
    if live and c['session_kind']['value'] == 'race' and (c['session_state']['value'] == 'running') and (fuel_range is not None) and (remaining is not None):
        plan.update(status='finish_without_planned_stop' if fuel_range >= remaining + 1 else 'conditional_fuel_window',
            reason='fuel_only_fixture_plan_not_product_solver',
            pit_in_laps=None if fuel_range >= remaining + 1 else max(0,
                math.floor(fuel_range - 1)),
            reserve_laps=1)
    result['code_policy'] = {'actions_allowed': [],
        'strategy_authority': 'code',
        'critical_radio': 'local_only',
        'proposed_pit_plan': plan}
    return result
