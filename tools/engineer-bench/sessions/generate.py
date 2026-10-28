"""Deterministic synthetic LMU sessions in the native SnapshotDto v11 wire form.

No simulator is read and no product process is started. Synthetic metadata lives
outside each DTO so snapshot_from_json can consume the JSONL unchanged.
"""
import argparse
import copy
import hashlib
import json
import math
import pathlib
import random
HERE = pathlib.Path(__file__).resolve().parent
CONTRACT = json.loads((HERE / 'wire_contract.json').read_text(encoding='utf-8'))
TRACKS = {'Le Mans': (13626.0, 245.0, 3.7), 'Spa': (7004.0, 140.0, 2.8), 'Monza': (5793.0, 110.0, 2.3)}
CAPABILITIES = 'session_clock positions lap_times gaps pit_status flags spatial driver_inputs powertrain fuel delta sectors lap_progress weather damage'.split()

def q(value, quality='reliable'):
    return {quality: value}

def current(value):
    if isinstance(value, dict):
        for quality in ('reliable', 'estimated'):
            if quality in value:
                return value[quality]
    return None

def duration(seconds):
    nanos = round(seconds * 1000000000)
    return {'secs': nanos // 1000000000, 'nanos': nanos % 1000000000}

def section(name):
    return {key: 'unavailable' for key in CONTRACT['sections'][name]['quality_fields']}

def omit_absent(value, name):
    return {key: item for key,
        item in value.items() if key not in CONTRACT['sections'][name]['omit_unavailable'] or item != 'unavailable'}

def player_car(snapshot):
    player = snapshot['state'].get('player')
    if player is None:
        return None
    return next((car for car in snapshot['state']['cars'] if car['id'] == player['car']), None)

def build_session(seed=124, track='Le Mans', car_class='LMGT3', kind='race'):
    if not 0 <= seed <= 2 ** 31 - 1:
        raise ValueError('Seed must fit a non-negative signed32 integer')
    if track not in TRACKS or car_class not in ('LMGT3', 'Hypercar') or kind not in ('practice', 'qualifying', 'race'):
        raise ValueError('Unknown synthetic session configuration')
    rng = random.Random(f'{seed}:{track}:{car_class}:{kind}')
    length, base_lap, consumption = TRACKS[track]
    if car_class == 'Hypercar':
        base_lap *= 0.86
        consumption *= 1.32
    laps, steps = (4, 20) if kind == 'qualifying' else (20, 4)
    refill_laps = 2 if kind == 'qualifying' else 5
    pit_lap = laps - refill_laps
    initial = pit_lap * consumption + 0.8
    capacity = 100.0
    lap_times = [round(base_lap * rng.uniform(0.99, 1.01), 3) for _ in range(laps)]
    class_id = 2 if car_class == 'LMGT3' else 1
    session_id = seed * 1000 + list(TRACKS).index(track) * 100 + ['practice',
        'qualifying',
        'race'].index(kind) * 10 + class_id
    player_id = 7
    records = []
    elapsed = 0.0
    refuel = 0.0
    pit_finished_at = None

    def emit(progress, *, in_pits=False, stopped=False, added=0.0, pit_complete=False):
        nonlocal elapsed
        index = len(records)
        completed = min(laps, math.floor(progress + 1e-09))
        fraction = progress - completed
        rain = 0.45 if index >= 68 else 0.0
        fuel = round(max(0.8, initial - progress * consumption + refuel + added), 4)
        fuel_history = [[lap, round(consumption, 4)] for lap in range(max(1, completed - 9), completed + 1)]
        state = {'source_state': 'live',
            'driving_situation': 'on_track',
            'capabilities': {name: 'fresh' for name in CAPABILITIES}}
        session = section('SessionDto')
        session.update(id=session_id,
            kind=q(kind),
            state=q('finished' if progress >= laps else 'running'),
            elapsed_s=q(round(elapsed,
                    4)),
            remaining_s=q(round(max(0,
                        sum(lap_times) + 30 - elapsed),
                    4),
                'estimated'),
            track_name=q(track),
            track_length_m=q(length),
            started_at_s=q(0.0),
            start_phase=q('racing'),
            scheduled_end_s=q(round(sum(lap_times) + 30,
                    4),
                'estimated'),
            weather_air_temperature_k=q(294.15),
            weather_track_temperature_k=q(302.15 - rain * 6),
            weather_wind_speed_mps=q(3.0),
            weather_wind_direction_rad=q(0.7),
            weather_rain=q(rain),
            weather_track_wetness=q(min(0.8,
                    max(0,
                        index - 68) * 0.04)),
            weather_pressure_pa=q(101325.0))
        if kind == 'race':
            session.update(laps_total=q(laps), laps_remaining=q(max(0, laps - completed), 'estimated'))
        if progress >= laps:
            session['finished_at_s'] = q(round(elapsed, 4))
        flags = []
        if index in (60, 61):
            flags = [{'kind': 'yellow', 'scope': 'session'}]
        if index in (64, 65):
            flags = [{'kind': 'blue', 'scope': {'car': player_id}}]
        if kind == 'race' and index in (66, 67):
            flags = [{'kind': 'yellow', 'scope': 'session'}, {'kind': {'other': 'safety_car'}, 'scope': 'session'}]
        if index == 75:
            flags = [{'kind': 'yellow', 'scope': {'sector': 2}}]
        state['session'] = session
        state['flags'] = q(flags)
        speed = 0.0 if stopped else 8.0 if in_pits else length / base_lap
        angle = 2 * math.pi * fraction
        yaw = (angle + math.pi / 2) % (2 * math.pi)
        radius = length / (2 * math.pi)
        x, y = (radius * math.cos(angle), radius * math.sin(angle))
        cars = []
        for car_id, same_class, position in [(player_id,
                True,
                3 if car_class == 'LMGT3' else 2),
            (8,
                True,
                2 if car_class == 'LMGT3' else 1),
            (9,
                False,
                1 if car_class == 'LMGT3' else 4),
            (10,
                True,
                4 if car_class == 'LMGT3' else 3)]:
            own = car_id == player_id
            other_class = class_id if same_class else 1 if class_id == 2 else 2
            relative = 0.0 if own else 1.25 if car_id == 8 else -1.8 if car_id == 10 else 2.5 if car_class == 'LMGT3' else -3.2
            ahead = relative * speed
            across = -3.1 if index == 70 and car_id == 9 else 0.0
            if across:
                ahead = 0.5
                relative = 0.5 / max(speed, 1.0)
            car = section('CarDto')
            car.update(id=car_id,
                number=str(car_id),
                vehicle='Synthetic GT3' if other_class == 2 else 'Synthetic Hypercar',
                driver_id=car_id + 100,
                driver_name=f'Synthetic Pilot {car_id}',
                **{'class': [other_class,
                        'LMGT3' if other_class == 2 else 'Hypercar']},
                position=q(position),
                class_position=q(2 if own else 3 if car_id == 10 else 1),
                laps=q(completed),
                relative_s=q(relative),
                relative_laps=q(0),
                lap_distance_m=q(round(fraction * length,
                        3)),
                lap_elapsed_s=q(round(fraction * base_lap,
                        4)),
                current_sector=q(min(2,
                        int(fraction * 3))),
                in_pits=q(in_pits if own else False),
                pose=q({'x_m': x + ahead * math.cos(yaw) + across * math.sin(yaw),
                        'y_m': y + ahead * math.sin(yaw) - across * math.cos(yaw),
                        'yaw_rad': yaw}),
                velocity_mps=q([speed * math.cos(yaw),
                        speed * math.sin(yaw)]),
                pending_penalties=q(0),
                grid_position=q(position),
                pit_stops=q(1 if (pit_finished_at is not None or pit_complete) and own else 0),
                tyre_compound=q('wet' if rain and pit_complete else 'medium'),
                driver_rating=q('gold'),
                safety_rating=q(87.0))
            if completed:
                lap = lap_times[completed - 1] * (1 if own else 0.99 if car_id == 8 else 0.86 if other_class == 1 else 1.15)
                factor = 1 if own else 0.99 if car_id == 8 else 0.86 if other_class == 1 else 1.15
                car.update(last_lap_s=q(round(lap,
                            3)),
                    best_lap_s=q(round(min(lap_times[:completed]) * factor,
                            3)),
                    last_sectors_s=[q(round(lap / 3,
                                3)) for _ in range(3)],
                    best_sectors_s=[q(round(min(lap_times[:completed]) * factor / 3,
                                3)) for _ in range(3)])
            if kind == 'race':
                interval = round(1.25 + 0.2 * math.sin(progress / 3), 4)
                car.update(gap_leader=q({'time': {'seconds': round((position - 1) * interval,
                                    4)}}),
                    gap_ahead=q({'time': {'seconds': interval}}) if position > 1 else 'unavailable',
                    gap_class_leader=q({'time': {'seconds': interval * (1 if own else 2 if car_id == 10 else 0)}}),
                    gap_class_ahead=q({'time': {'seconds': interval}}) if own or car_id == 10 else 'unavailable')
            cars.append(omit_absent(car, 'CarDto'))
        rng.shuffle(cars)
        player = section('PlayerDto')
        stint_progress = max(0, progress - pit_lap) if pit_finished_at is not None or pit_complete else progress
        tyre_remaining = max(0.55, 1 - stint_progress * 0.012)
        player.update(car=player_id,
            throttle=q(0.0 if in_pits else 0.7),
            brake=q(0.0),
            clutch=q(0.0),
            steering=q(0.05),
            gear=q(0 if stopped else 2 if in_pits else 5),
            speed_mps=q(speed),
            engine_speed_rad_s=q(100.0 if stopped else 600.0),
            fuel_level_l=q(fuel),
            fuel_capacity_l=q(capacity),
            fuel_per_lap_l=q(round(consumption,
                    4),
                'estimated'),
            fuel_laps_left=q(round(fuel / consumption,
                    4),
                'estimated'),
            fuel_history=fuel_history,
            pit_limiter_active=q(in_pits),
            pit_stop_stopped=q(stopped),
            pit_loss_s=q(65.0,
                'estimated'),
            fuel_lap_projection_l=q(round(consumption,
                    4),
                'estimated'),
            stint_laps=q(math.floor(stint_progress),
                'estimated'),
            stint_elapsed_s=q(round(max(0,
                        elapsed - (pit_finished_at or 0)),
                    4),
                'estimated'),
            lap_invalid=q(False),
            delta_best_s=q(0.2),
            delta_optimal_s=q(0.4),
            delta_leader_s=q(0.7),
            damage_aero=q(0.93 if index >= 69 else 1.0),
            damage_body=q(0.86 if index >= 69 else 1.0),
            damage_suspension=q(1.0),
            damage_tyre_wear=[q(round(max(0,
                            tyre_remaining - offset),
                        4)) for offset in [0,
                    0.01,
                    0.025,
                    0.03]])
        if car_class == 'Hypercar':
            player.update(fuel_energy=q(max(0, 1 - stint_progress * 0.04)), fuel_energy_per_lap=q(0.04, 'estimated'))
        if stopped:
            player.update(pit_refuel_target_l=q(round(refill_laps * consumption,
                        4)),
                pit_refuel_added_l=q(round(added,
                        4)),
                pit_service_remaining_s=q(0.0 if pit_complete else 15.0),
                pit_tyres=q(4))
        if not fuel_history:
            player.pop('fuel_history')
        state['cars'], state['player'] = (cars, omit_absent(player, 'PlayerDto'))
        records.append({'version': 11,
                'epoch': 1,
                'sequence': len(records) + 1,
                'origin': {'simulator': 'lmu',
                    'kind': 'live',
                    'source_time': duration(elapsed),
                    'received_at': duration(elapsed + 1)},
                'state': state})
    for step in range(1, laps * steps + 1):
        progress = step / steps
        elapsed += lap_times[min(laps - 1, (step - 1) // steps)] / steps
        emit(progress)
        if step == pit_lap * steps:
            elapsed += 5
            emit(progress, in_pits=True)
            elapsed += 15
            emit(progress, in_pits=True, stopped=True, added=refill_laps * consumption / 2)
            elapsed += 15
            emit(progress, in_pits=True, stopped=True, added=refill_laps * consumption, pit_complete=True)
            refuel = refill_laps * consumption
            pit_finished_at = elapsed
    return {'synthetic': True,
        'generator_version': 1,
        'seed': seed,
        'track': track,
        'car_class': car_class,
        'session_kind': kind,
        'wire_version': 11,
        'source_commit': CONTRACT['source_commit'],
        'snapshots': records}

def variants(session):
    """Adversarial terminal photos retain history but change current availability/epoch."""
    stale = copy.deepcopy(session)
    latest = stale['snapshots'][-1]
    latest['state']['source_state'] = 'stale'

    def degrade(value):
        if isinstance(value, dict):
            if len(value) == 1 and next(iter(value)) in ('reliable', 'estimated'):
                return {'stale': degrade(next(iter(value.values())))}
            return {k: degrade(v) for k, v in value.items()}
        if isinstance(value, list):
            return [degrade(v) for v in value]
        return value
    latest['state'] = degrade(latest['state'])
    latest['state']['capabilities'] = {key: 'with_data' for key in CAPABILITIES}
    stale['variant'] = 'stale_latest'
    reset = copy.deepcopy(session)
    latest = reset['snapshots'][-1]
    latest['epoch'] = 2
    latest['sequence'] = 1
    latest['origin']['received_at'] = duration(1)
    p = latest['state']['player']
    p['fuel_level_l'] = q(1.25)
    p['fuel_history'] = []
    p['fuel_per_lap_l'] = 'unavailable'
    p['fuel_laps_left'] = 'unavailable'
    reset['variant'] = 'epoch_reset'
    return [stale, reset]

def write_sessions(output, seed=124):
    output = pathlib.Path(output)
    output.mkdir(parents=True, exist_ok=False)
    manifest = {'synthetic': True,
        'seed': seed,
        'wire_version': 11,
        'source_commit': CONTRACT['source_commit'],
        'files': []}
    for track in TRACKS:
        for cls in ('LMGT3', 'Hypercar'):
            for kind in ('practice', 'qualifying', 'race'):
                session = build_session(seed, track, cls, kind)
                name = f"{track.lower().replace(' ', '-')}-{cls.lower()}-{kind}.jsonl"
                data = ''.join((json.dumps(s,
                            ensure_ascii=False,
                            separators=(',',
                                ':'),
                            allow_nan=False) + '\n' for s in session['snapshots'])).encode()
                (output / name).write_bytes(data)
                manifest['files'].append({k: v for k,
                        v in session.items() if k != 'snapshots'} | {'file': name,
                        'snapshots': len(session['snapshots']),
                        'sha256': hashlib.sha256(data).hexdigest(),
                        'bytes': len(data)})
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return manifest
if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--output', required=True)
    p.add_argument('--seed', type=int, default=124)
    args = p.parse_args()
    print(json.dumps(write_sessions(args.output, args.seed), indent=2))
