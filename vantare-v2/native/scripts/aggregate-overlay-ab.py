"""Paired ABBA analysis. Ratios below one favor B; A/A defines the noise floor."""
import argparse
import hashlib
import json
import math
import pathlib
import statistics
import datetime
import random


def round_ratio(values, times=None):
    if len(values) != 4 or any(not math.isfinite(v) or v <= 0 for v in values):
        raise ValueError('four positive finite ABBA observations required')
    times=list(range(4)) if times is None else times
    if len(times)!=4 or any(b<=a for a,b in zip(times,times[1:])):
        raise ValueError('four increasing observation times required')
    midpoint=(times[1]+times[2])/2
    weight=(midpoint-times[0])/(times[3]-times[0])
    reference=(1-weight)*math.log(values[0])+weight*math.log(values[3])
    return math.exp((math.log(values[1])+math.log(values[2]))/2-reference)


def describe(values):
    mean = statistics.mean(values)
    return dict(median=statistics.median(values), minimum=min(values), maximum=max(values),
                cv=statistics.stdev(values) / mean if len(values) > 1 else None)


def median_interval(values):
    # Resample complete rounds, never individual frames. Fixed seed is reproducible.
    generator=random.Random(139)
    medians=sorted(statistics.median(generator.choices(values,k=len(values))) for _ in range(4000))
    return [medians[99],medians[3899]]


def compare(aa, ab):
    if min(len(aa), len(ab)) < 8:
        raise ValueError('at least eight complete rounds in A/A and A/B required')
    # Conservative empirical bound: no normal-distribution or independent-frame assumption.
    floor = max(abs(math.log(value)) for value in aa)
    effect = abs(math.log(statistics.median(ab)))
    interval=median_interval(ab)
    return dict(aa=describe(aa), ab=describe(ab), aa_ratios=aa, ab_ratios=ab,
                ab_median_round_bootstrap_95=interval,
                interval_excludes_no_change=interval[1]<1 or interval[0]>1,
                noise_log_bound=floor, separates_from_noise=effect > floor,
                noise_gate_passed=floor <= math.log(1.025),
                acceptance='Noise separation is necessary, not sufficient: game-PC VRR and visual gates remain mandatory.')


def aggregate(root):
    manifest = json.loads((root / 'ab-order.json').read_text(encoding='utf-8-sig'))
    rounds = {'aa': {}, 'ab': {}}
    identities = set()
    binaries = {'aa': set(), 'ab': set()}
    labels = {}
    for entry in manifest:
        folder = root / entry['directory']
        if not (folder / 'complete.txt').exists():
            raise ValueError('incomplete run: ' + str(folder))
        source = folder / 'summary.json'
        run = json.loads(source.read_text(encoding='utf-8-sig'))
        meta = run['metadata']
        collector = meta.get('collector_sha')
        if not collector or meta['profile'] != 'release':
            raise ValueError('Release and explicit collector_sha required')
        identities.add((collector, meta['core_sha256'], meta['recording_sha256'],
                        meta['widgets'], meta['phases'], meta.get('replay_speed',1)))
        expected_label = 'A' if entry['slot'] in (0,3) else 'B'
        if entry['label'] != expected_label:
            raise ValueError('ABBA label does not match slot')
        label_key = entry['experiment'], entry['label']
        digest = meta['executable_sha256']
        if label_key in labels and labels[label_key] != digest:
            raise ValueError('binary changed within an experiment label')
        labels[label_key] = digest
        binaries[entry['experiment']].add(meta['executable_sha256'])
        slots = rounds[entry['experiment']].setdefault(entry['round'], {})
        if entry['slot'] in slots:
            raise ValueError('duplicate ABBA slot')
        slots[entry['slot']] = dict(value=run['ui']['cycles_per_second'],
                                   started=datetime.datetime.fromisoformat(entry['started']).timestamp(),
                                   metrics=dict(cycles_per_received_photo=run['ui'].get('cycles_per_received_photo'),
                                                working_set_mib=run['ui'].get('mean_working_set_mib'),
                                                presents_per_second=run.get('presents_per_second'),
                                                receive_to_paint_median_ms=run.get('receive_to_paint_median_ms'),
                                                receive_to_submit_median_ms=run.get('receive_to_submit_median_ms'),
                                                **{f'{stage}.{field}':value for stage,fields in run.get('stages',{}).items()
                                                   for field,value in fields.items()
                                                   if field in ('cpu_cycles_per_call','wall_ns_per_call')}),
                                   summary_sha256=hashlib.sha256(source.read_bytes()).hexdigest())
    if len(identities) != 1 or len(binaries['aa']) != 1 or len(binaries['ab']) != 2:
        raise ValueError('mixed collector/core/recording/configuration or invalid A/A–A/B binaries')
    if labels.get(('aa','A')) != labels.get(('ab','A')):
        raise ValueError('A/A must characterize the actual A reference binary')
    ratios = {}
    for experiment, groups in rounds.items():
        ratios[experiment] = []
        for _, slots in sorted(groups.items()):
            if set(slots) != {0, 1, 2, 3}:
                raise ValueError('incomplete ABBA round')
            ratios[experiment].append(round_ratio([slots[i]['value'] for i in range(4)],
                                                  [slots[i]['started'] for i in range(4)]))
    result = compare(ratios['aa'], ratios['ab'])
    result['rounds'] = rounds
    result['metric_round_ratios'] = {}
    for experiment,groups in rounds.items():
        metrics=set().union(*(slot['metrics'] for slots in groups.values() for slot in slots.values()))
        result['metric_round_ratios'][experiment]={}
        for metric in sorted(metrics):
            values=[]
            for _,slots in sorted(groups.items()):
                observations=[slots[i]['metrics'].get(metric) for i in range(4)]
                values.append(round_ratio(observations,[slots[i]['started'] for i in range(4)])
                              if all(value is not None and value>0 for value in observations) else None)
            result['metric_round_ratios'][experiment][metric]=dict(
                per_round=values,summary=describe([value for value in values if value is not None])
                if any(value is not None for value in values) else None)
    result['within_round_cv'] = {
        experiment: {number: describe([slots[i]['value'] for i in range(4)])['cv']
                     for number, slots in groups.items()}
        for experiment, groups in rounds.items()}
    result['acceptance_gates'] = dict(
        aa_noise=result['noise_gate_passed'],
        gpu_frame_time='pending: second-resolution GPU occupancy is insufficient',
        physical_vrr='pending: Isaac game-PC procedure in VRR-GATE.md',
        matched_release_visuals='pending',
        accepted=False)
    (root / 'ab-comparison.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=pathlib.Path)
    print(json.dumps(aggregate(parser.parse_args().directory), indent=2))
