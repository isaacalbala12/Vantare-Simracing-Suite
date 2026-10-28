"""Generate, validate and run the separate proposed compact-context campaign."""
import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import threading
import time

from bench import stats, resource_summary
from .cases import build_cases
from .client import Client
from .generate import write_sessions
from .wire import validate

HERE = Path(__file__).resolve().parent


def write_json(path, value):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)


def generate(output, seed):
    output = Path(output)
    manifest = write_sessions(output, seed)
    for entry in manifest['files']:
        for line in (output / entry['file']).read_text(encoding='utf-8').splitlines():
            validate(json.loads(line))
    cases = build_cases(seed)
    write_json(output / 'cases.json', cases)
    return {'snapshots': sum(item['snapshots'] for item in manifest['files']), 'cases': len(cases),
            'synthetic': True, 'gpu_used': False}


def run_reserved(cases, request, iteration, emit, check):
    """Client admission: <=3 non-radio requests, with the fourth slot kept for radio.

    This is not llama-server slot priority. Overlap must be assessed from actual
    timestamps, including active_longs_at_admission; short responses may finish
    before radio can overlap. No artificial output padding is added.
    """
    grouped = defaultdict(list)
    controls = []
    for case in cases:
        if case['kind'] == 'raw_current_dto':
            controls.append(case)
        else:
            grouped[(case['source_session'], case['locale'], case['source_history_count'])].append(case)
    active = 0
    lock = threading.Lock()

    def long_request(case, visible):
        nonlocal active
        admitted = False
        try:
            check()
            with lock:
                active += 1
                admitted = True
            return request(case, iteration, 'long', first_visible=visible)
        finally:
            if admitted:
                with lock:
                    active -= 1
            visible.set()  # errors/no visible text must not deadlock admission

    with ThreadPoolExecutor(max_workers=3) as longs, ThreadPoolExecutor(max_workers=1) as radio:
        for group in grouped.values():
            radio_cases = [case for case in group if case['kind'].startswith('radio')]
            other_cases = [case for case in group if not case['kind'].startswith('radio')]
            for offset, radio_case in enumerate(radio_cases):
                check()
                visible = threading.Event()
                futures = [longs.submit(long_request, case, visible)
                           for case in other_cases[offset * 3:(offset + 1) * 3]]
                visible.wait()  # bounded by request timeout; no timed sleep
                check()
                with lock:
                    active_at_admission = active
                futures.append(radio.submit(request, radio_case, iteration, 'reserved_radio',
                                             active_longs=active_at_admission))
                for future in as_completed(futures):
                    emit(future.result())
    for case in controls:
        check()
        emit(request(case, iteration, 'raw_control'))


def summarize(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row['kind'], row['locale'], row['history'])].append(row)
    result = []
    for key, items in sorted(groups.items()):
        successful = [item for item in items if not item['error']]
        result.append({'kind': key[0], 'locale': key[1], 'history': key[2], 'attempts': len(items),
            'errors': sum(bool(item['error']) for item in items),
            'timeouts': sum(bool(item['error']) and ('timeout' in item['error']['type'].lower()
                or 'timed out' in item['error']['message'].lower()) for item in items),
            'verifiable_passes': sum(item['quality']['verifiable_pass'] for item in items),
            'language_proxy': {str(value): sum(item['quality']['language_proxy'] is value for item in items)
                              for value in (True, False, None)},
            'ttft_ms_successful': stats([item['ttft_ms'] for item in successful]),
            'total_ms_successful': stats([item['total_ms'] for item in successful]),
            'stream_tokens_per_s_proxy': stats([item.get('completion_tokens_per_generation_s_proxy') for item in successful]),
            'radio_admitted_with_active_long': sum(item['lane'] == 'reserved_radio'
                and item['active_longs_at_admission'] > 0 for item in items),
            'human_language_and_semantics': 'pending'})
    return result


def throughput(rows):
    complete = [row for row in rows if not row['error'] and 'started_utc' in row]
    if not complete:
        return None
    start = min(datetime.fromisoformat(row['started_utc']) for row in complete)
    end = max(datetime.fromisoformat(row['ended_utc']) for row in complete)
    tokens = sum(row['usage'].get('completion_tokens', 0) for row in complete)
    return {'completion_tokens_successful': tokens, 'wall_seconds': (end-start).total_seconds(),
            'aggregate_tokens_per_s': tokens / (end-start).total_seconds(),
            'note': 'Whole campaign HTTP throughput including gaps/admission, not a GPU decode kernel rate.'}


def run(args):
    if os.name != 'nt':
        raise ValueError('This campaign guard/sampler targets SapphireOS Windows')
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=False)
    source = Path(args.cases).read_bytes()
    cases = json.loads(source)
    if len({case['id'] for case in cases}) != len(cases) or not all(case.get('synthetic') for case in cases):
        raise ValueError('Expected unique labelled synthetic cases')
    client = Client(args.base_url, args.model, args.timeout)
    stop, abort = output / 'monitor.stop', output / 'ABORT.json'
    guard = subprocess.Popen(['pwsh', '-NoProfile', '-File', str(HERE / 'guard.ps1'),
        '-Output', str(output / 'safety.jsonl'), '-StopFile', str(stop), '-AbortFile', str(abort)],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    monitor = None
    if args.engine_pid:
        monitor = subprocess.Popen(['pwsh', '-NoProfile', '-File', str(HERE.parent / 'resources.ps1'),
            '-EnginePid', str(args.engine_pid), '-Output', str(output / 'resources.jsonl'), '-StopFile', str(stop)],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    rows, failure = [], None
    def check():
        if abort.exists() or guard.poll() is not None:
            raise RuntimeError('Campaign aborted/contaminated: inspect ABORT.json and safety.jsonl')
    metadata = {'protocol': 'synthetic-lmu-compact.proposal.v1', 'synthetic': True,
        'model': args.model, 'base_url': args.base_url, 'quiet_window_id': args.quiet_window_id,
        'seed': 124, 'temperature': 0, 'passes': args.passes, 'slots': 4, 'reserved_radio_slots': 1,
        'context_per_slot': 8192, 'kv': 'f16', 'cases_sha256': hashlib.sha256(source).hexdigest(),
        'source_sha256': {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                          for path in sorted(HERE.glob('*.py'))},
        'started_utc': datetime.now(timezone.utc).isoformat(),
        'note': 'Separate from reference 930 campaign. Model selection requires manual prose review.'}
    try:
        # Wait for an actual first safety sample, not a guessed monitor startup delay.
        deadline = time.monotonic() + 15
        while not (output / 'safety.jsonl').exists() or (output / 'safety.jsonl').stat().st_size == 0:
            check()
            if time.monotonic() > deadline:
                raise TimeoutError('Safety guard did not produce a sample')
            threading.Event().wait(.05)
        check()
        # CPU template/tokenizer work is entirely outside the concurrency campaign.
        preflight = []
        for case in cases:
            check()
            preflight.append({'id': case['id'], 'tokens': client.preflight(client.payload(case))})
        write_json(output / 'token-preflight.json', preflight)
        with (output / 'requests.jsonl').open('x', encoding='utf-8') as stream:
            def emit(row):
                rows.append(row)
                stream.write(json.dumps(row, ensure_ascii=False, allow_nan=False) + '\n')
                stream.flush()
            for iteration in range(args.passes):
                run_reserved(cases, client.request, iteration, emit, check)
                check()
    except Exception as error:
        failure = {'type': type(error).__name__, 'message': str(error)}
    finally:
        stop.touch()
        for process in (guard, monitor):
            if process:
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()  # only this runner's own monitor, never the engine
                    process.wait()
                    failure = failure or {'type': 'MonitorTimeout', 'message': 'Own monitor failed to stop'}
        metadata.update(ended_utc=datetime.now(timezone.utc).isoformat(), failure=failure,
            contaminated=abort.exists(), guard_exit_code=guard.returncode,
            sampler_exit_code=monitor.returncode if monitor else None)
        report = {'metadata': metadata, 'summary': summarize(rows),
                  'throughput': throughput(rows),
                  'resources': resource_summary(output / 'resources.jsonl', [row for row in rows if 'started_utc' in row]),
                  'requests': rows}
        write_json(output / 'results.json', report)
    if failure:
        raise RuntimeError(failure['message'])
    return {'requests': len(rows), 'errors': sum(bool(row['error']) for row in rows), 'output': str(output)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    gen = sub.add_parser('generate')
    gen.add_argument('--output', required=True)
    gen.add_argument('--seed', type=int, default=124)
    execute = sub.add_parser('run')
    execute.add_argument('--cases', required=True)
    execute.add_argument('--output', required=True)
    execute.add_argument('--base-url', required=True)
    execute.add_argument('--model', required=True)
    execute.add_argument('--quiet-window-id', required=True)
    execute.add_argument('--engine-pid', type=int)
    execute.add_argument('--passes', type=int, default=5)
    execute.add_argument('--timeout', type=float, default=60)
    args = parser.parse_args()
    if args.command == 'run' and (args.passes < 5 or args.timeout <= 0):
        parser.error('At least five passes and positive timeout required')
    print(json.dumps(generate(args.output, args.seed) if args.command == 'generate' else run(args)))


if __name__ == '__main__':
    main()
