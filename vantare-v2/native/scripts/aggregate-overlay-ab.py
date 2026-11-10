"""Interleaved paired campaigns; one predeclared CPU metric and round-level inference."""
import argparse
import hashlib
import json
import math
import pathlib
import statistics
import sys

if sys.version_info < (3, 11):
    raise SystemExit('Python 3.11 or newer is required')

PRIMARY = 'ui.cycles_per_second'
# NIST two-sided 95% critical values, df 1..23 (published to three decimals).
# https://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm
T975 = (12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306,
        2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120,
        2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069)


def round_ratio(values, times=None, labels=('A', 'B', 'B', 'A')):
    if len(values) != 4 or any(not math.isfinite(v) or v <= 0 for v in values):
        raise ValueError('four positive finite observations required')
    times = list(range(4)) if times is None else times
    if len(times) != 4 or any(b <= a for a, b in zip(times, times[1:])):
        raise ValueError('four increasing stable-window times required')
    if tuple(labels) not in (('A', 'B', 'B', 'A'), ('B', 'A', 'A', 'B')):
        raise ValueError('ABBA or BAAB required')
    # Regress log(cost) on time and B membership. With equal intervals this
    # is the balanced ratio; unequal real intervals still remove linear drift.
    x = [t - statistics.mean(times) for t in times]
    z = [float(label == 'B') - .5 for label in labels]
    logs = [math.log(value) for value in values]
    y = [value - statistics.mean(logs) for value in logs]
    tt = sum(t*t for t in x)
    tz = sum(t*b for t, b in zip(x, z))
    beta = (sum(a*b for a, b in zip(y, z))*tt
            - sum(a*t for a, t in zip(y, x))*tz) / (tt-tz*tz)
    return math.exp(beta)


def describe(values):
    return dict(median=statistics.median(values), minimum=min(values), maximum=max(values),
                cv=statistics.stdev(values)/statistics.mean(values) if len(values) > 1 else None)


def log_t_interval(values):
    if not 2 <= len(values) <= 24:
        raise ValueError('t interval supports 2..24 independent rounds')
    logs = [math.log(value) for value in values]
    mean = statistics.mean(logs)
    margin = T975[len(logs)-2]*statistics.stdev(logs)/math.sqrt(len(logs))
    return dict(ratio=math.exp(mean), interval_95=[math.exp(mean-margin), math.exp(mean+margin)],
                degrees_of_freedom=len(logs)-1, unit='complete round log-ratios, not frames')


def compare(aa, ab):
    if len(aa) != len(ab) or not 8 <= len(aa) <= 24:
        raise ValueError('8..24 matched A/A and A/B rounds required')
    bound = max(abs(math.log(value)) for value in aa)
    inference = log_t_interval(ab)
    noise_ok = bound <= math.log(1.025)
    low, high = inference['interval_95']
    if not noise_ok:
        verdict = 'invalid_noise'
    elif high < 1 and abs(math.log(inference['ratio'])) > bound:
        verdict = 'improvement'
    elif low > 1 and abs(math.log(inference['ratio'])) > bound:
        verdict = 'regression'
    else:
        verdict = 'inconclusive'
    return dict(aa=describe(aa), ab=describe(ab), aa_ratios=aa, ab_ratios=ab,
                aa_log_bias=statistics.mean(map(math.log, aa)), noise_log_bound=bound,
                noise_percent_bound=100*math.expm1(bound), noise_gate_passed=noise_ok,
                inference=inference, verdict=verdict, accepted=verdict == 'improvement')


def metric(run, name):
    value = run
    for key in name.split('.'):
        value = value.get(key) if isinstance(value, dict) else None
    return value


def aggregate(root):
    plan = json.loads((root/'ab-plan.json').read_text(encoding='utf-8-sig'))
    if plan['protocol'] != 3 or plan['primary_metric'] != PRIMARY:
        raise ValueError('predeclared protocol 3 and primary CPU metric required')
    manifest = json.loads((root/'ab-order.json').read_text(encoding='utf-8-sig'))
    study = plan.get('study', 'engine')
    expected_order = []
    for number in range(1, plan['rounds']+1):
        experiments = ('aa', 'ab') if number % 2 else ('ab', 'aa')
        if study != 'engine':
            experiments = ('ab',)
        pattern = ('A', 'B', 'B', 'A') if number % 2 else ('B', 'A', 'A', 'B')
        expected_order.extend((experiment, number, slot, label)
            for experiment in experiments for slot, label in enumerate(pattern))
    if [(entry['experiment'], entry['round'], entry['slot'], entry['label']) for entry in manifest] != expected_order:
        raise ValueError('campaign order differs from interleaved predeclared plan')
    rounds = {'aa': {}, 'ab': {}}
    identities, binaries, labels = set(), {'aa': set(), 'ab': set()}, {}
    previous_midpoint = None
    for entry in manifest:
        folder = root/entry['directory']
        if not (folder/'complete.txt').exists():
            raise ValueError('incomplete run: '+str(folder))
        source = folder/'summary.json'
        run = json.loads(source.read_text(encoding='utf-8-sig'))
        meta = run['metadata']
        if not meta.get('collector_sha') or meta['profile'] != 'release' or meta.get('measurement_version') != 3 or meta.get('collector_dirty'):
            raise ValueError('Release and explicit collector_sha required')
        declared=plan['config']
        expected_hash=declared['a_hash'] if entry['experiment']=='aa' or entry['label']=='A' else declared['b_hash']
        if meta['executable_sha256'] != expected_hash:
            raise ValueError('binary differs from predeclared artifact')
        if meta['core_sha256'] != declared['core_hash'] or meta['recording_sha256'] != declared['recording_hash']:
            raise ValueError('core or recording differs from the predeclared campaign')
        for observed,expected in (('widgets','widgets'),('phases','phases'),('render_load','stress'),('quiet_control','quiet')):
            if meta.get(observed,False) != declared[expected]:
                raise ValueError('configuration differs from the predeclared campaign')
        identities.add((meta['collector_sha'], meta.get('collector_script_sha256'), meta['core_sha256'],
            meta['recording_sha256'], meta['widgets'], meta['phases'], meta.get('render_load', False),
            meta.get('gpu_frame_timing', False), meta['qpc_frequency'], meta.get('power_plan'),
            meta.get('priority'), meta.get('affinity_mask'), meta.get('stable_start_seconds'),
            meta.get('stable_end_seconds')))
        if meta.get('replay_speed', 1) != 1:
            raise ValueError('accelerated replay is excluded from engine comparisons')
        digest = meta['executable_sha256']
        label_key = entry['experiment'], entry['label']
        if label_key in labels and labels[label_key] != digest:
            raise ValueError('binary changed within an experiment label')
        labels[label_key] = digest
        binaries[entry['experiment']].add(digest)
        slots = rounds[entry['experiment']].setdefault(entry['round'], {})
        if entry['slot'] in slots:
            raise ValueError('duplicate balanced slot')
        if study == 'sampler':
            expected = 'full' if entry['label'] == 'A' else 'light'
            if meta.get('sampler_mode') != expected:
                raise ValueError('sampling control mode does not match its label')
        elif meta.get('sampler_mode', 'full') != 'full':
            raise ValueError('engine comparisons use the full collector')
        start, end = run['stable_qpc']
        if start >= end or meta['qpc_frequency'] <= 0:
            raise ValueError('invalid stable-window clock')
        midpoint = (start+end)/(2*meta['qpc_frequency'])
        if previous_midpoint is not None and midpoint <= previous_midpoint:
            raise ValueError('stable-window clock moved backwards')
        previous_midpoint = midpoint
        names = [PRIMARY, 'ui.cycles_per_received_photo', 'ui.mean_working_set_mib',
                 'process_cycles_per_present_informative', 'presents_per_second',
                 'receive_to_paint_median_ms', 'receive_to_submit_median_ms',
                 'gpu_render.mean_ms', 'gpu_render.p99_ms']
        names += [f'stages.{stage}.{field}' for stage in run.get('stages', {})
                  for field in ('cpu_cycles_per_call', 'wall_ns_per_call')]
        slots[entry['slot']] = dict(label=entry['label'], value=metric(run, PRIMARY),
            stable_midpoint=midpoint,
            metrics={name: metric(run, name) for name in names},
            frequency_context=run.get('frequency_context',{}),sampler=run.get('sampler',{}),
            gpu_coverage=run.get('gpu_render',{}).get('coverage'),
            gpu_disjoint_dropped=run.get('gpu_render',{}).get('disjoint'),
            summary_sha256=hashlib.sha256(source.read_bytes()).hexdigest())
    if len(identities) != 1:
        raise ValueError('mixed collector/core/recording/configuration')
    if plan.get('role') == 'primary' and (study != 'engine' or meta['widgets'] != 22 or meta['phases'] or meta.get('render_load')):
        raise ValueError('primary is fixed: normal cadence, 22 widgets, phases off')
    if study == 'engine':
        if len(binaries['aa']) != 1 or len(binaries['ab']) != 2 or labels.get(('aa', 'A')) != labels.get(('ab', 'A')):
            raise ValueError('invalid A/A and A/B binary identities')
    elif study == 'sampler':
        if len(binaries['ab']) != 1:
            raise ValueError('sampling control must use one UI binary')
    elif study != 'quiet' or len(binaries['ab']) != 2:
        raise ValueError('invalid informative control identities')
    ratios = {'aa': [], 'ab': []}
    for experiment, groups in rounds.items():
        for number, slots in sorted(groups.items()):
            if set(slots) != {0, 1, 2, 3}:
                raise ValueError('incomplete balanced round')
            pattern = ['A', 'B', 'B', 'A'] if number % 2 else ['B', 'A', 'A', 'B']
            if [slots[i]['label'] for i in range(4)] != pattern:
                raise ValueError('ABBA/BAAB alternation differs from the plan')
            ratios[experiment].append(round_ratio([slots[i]['value'] for i in range(4)],
                [slots[i]['stable_midpoint'] for i in range(4)], pattern))
    if len(ratios['ab']) != plan['rounds']:
        raise ValueError('campaign differs from predeclared round count')
    if study == 'engine':
        result = compare(ratios['aa'], ratios['ab'])
    else:
        result = dict(ab=describe(ratios['ab']), ab_ratios=ratios['ab'],
                      inference=log_t_interval(ratios['ab']), verdict='informative', accepted=False)
    result.update(plan=plan, rounds=rounds, primary_metric=PRIMARY,
                  physical_vrr='pending: separate game-PC gate, not inferred from server CPU')
    if plan.get('role') != 'primary' and result['verdict'] != 'invalid_noise':
        result['verdict'], result['accepted'] = 'informative', False
    result['within_round_cv'] = {experiment: {number: describe([slot['value'] for slot in slots.values()])['cv']
        for number, slots in groups.items()} for experiment, groups in rounds.items()}
    result['informative_metrics'] = {}
    for experiment, groups in rounds.items():
        metrics = set().union(*(slot['metrics'] for slots in groups.values() for slot in slots.values()))
        result['informative_metrics'][experiment] = {}
        for name in sorted(metrics):
            per_round = []
            for _, slots in sorted(groups.items()):
                observations = [slots[i]['metrics'].get(name) for i in range(4)]
                per_round.append(round_ratio(observations, [slots[i]['stable_midpoint'] for i in range(4)],
                    [slots[i]['label'] for i in range(4)])
                    if all(value is not None and value > 0 for value in observations) else None)
            valid = [value for value in per_round if value is not None]
            result['informative_metrics'][experiment][name] = dict(per_round=per_round,
                summary=describe(valid) if valid else None)
    (root/'ab-comparison.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=pathlib.Path)
    print(json.dumps(aggregate(parser.parse_args().directory), indent=2))
