"""Summarize PresentMon v1 CSV and Windows resource samples, without dependencies."""
import csv
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path


def percentile(values, fraction):
    ordered = sorted(values)
    index = (len(ordered) - 1) * fraction
    low = math.floor(index)
    high = math.ceil(index)
    return ordered[low] + (ordered[high] - ordered[low]) * (index - low)


def frames(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        rows = [{key.lower(): value for key, value in row.items()} for row in csv.DictReader(stream)]
    # One dominant swap chain, never sum rendering from separate swap chains.
    chains = Counter(row['swapchainaddress'] for row in rows)
    if not chains:
        raise ValueError('PresentMon did not capture any game presents')
    chain = chains.most_common(1)[0][0]
    chain_rows = [row for row in rows if row['swapchainaddress'] == chain]
    # First interval began before capture and may include loading/alt-tab time.
    values = [float(row['msbetweenpresents']) for row in chain_rows[1:]
              if float(row['msbetweenpresents']) > 0]
    if any(not math.isfinite(value) for value in values):
        raise ValueError('Non-finite frametime')
    if len(values) < 100:
        raise ValueError('Insufficient frames')
    mean = statistics.mean(values)
    return dict(frames=len(values), swapchain=chain, swapchain_count=len(chains),
                fps=1000 / mean, frametime_mean_ms=mean,
                frametime_p1_ms=percentile(values, .01),
                frametime_p99_ms=percentile(values, .99),
                observed_seconds=sum(values) / 1000)


def resources(path, overlay_prefixes):
    by_time = defaultdict(list)
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        for row in csv.DictReader(stream):
            by_time[row['seconds']].append(row)
    samples = []
    contaminated = set()
    unfocused_samples = 0
    missing_game_samples = 0
    for timestamp, group in by_time.items():
        if float(timestamp) < 1:
            continue  # first sample has no process CPU delta
        contaminated.update(row['name'] for row in group
                            if row['name'].lower() in ('cargo', 'rustc', 'cargo-nextest', 'link', 'cl'))
        selected = [row for row in group if row['name'].lower().startswith(tuple(overlay_prefixes))]
        game_rows = [row for row in group if row['name'].lower() == 'le mans ultimate']
        if 'foreground_pid' in group[0] and (not game_rows or
                group[0]['foreground_pid'] != game_rows[0]['pid']):
            unfocused_samples += 1
        if group[0].get('game_present', 'True') != 'True':
            missing_game_samples += 1
        samples.append(dict(cpu=sum(float(row['cpu_percent'] or 0) for row in selected),
                            ram=sum(int(row['working_set_bytes']) for row in selected) / 1048576,
                            system_cpu=float(group[0]['system_cpu_percent']),
                            system_ram=float(group[0]['system_used_bytes']) / 1048576))
    if not samples:
        raise ValueError('No resource samples')
    if any(not math.isfinite(value) or value < 0 for sample in samples for value in sample.values()):
        raise ValueError('Non-finite or negative resource sample')
    return dict(overlay_cpu_percent=statistics.mean(s['cpu'] for s in samples),
                overlay_working_set_mib=statistics.mean(s['ram'] for s in samples),
                system_cpu_percent=statistics.mean(s['system_cpu'] for s in samples),
                system_used_mib=statistics.mean(s['system_ram'] for s in samples),
                background_build_processes=sorted(contaminated), resource_samples=len(samples),
                unfocused_samples=unfocused_samples, missing_game_samples=missing_game_samples)


def summarize(folder):
    folder = Path(folder)
    metadata = json.loads((folder / 'run.json').read_text(encoding='utf-8-sig'))
    result = metadata | frames(folder / 'frames.csv') | resources(folder / 'resources.csv',
                           ['vantare'] if metadata['scenario'] == 'Vantare' else
                           ['tinypedal'] if metadata['scenario'] == 'TinyPedal' else
                           ['racelab'] if metadata['scenario'] == 'RaceLab' else ['__none__'])
    result['valid'] = (not result['background_build_processes']
                       and metadata.get('purpose') != 'calibration'
                       and not result['unfocused_samples'] and not result['missing_game_samples']
                       and result['observed_seconds'] >= .9 * metadata['seconds']
                       and (metadata['scenario'] == 'Base' or result['overlay_working_set_mib'] > 0))
    (folder / 'summary.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


if __name__ == '__main__':
    import sys
    print(json.dumps(summarize(sys.argv[1]), indent=2))
