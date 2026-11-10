"""Release v2 measurement. Process cycles are never converted to CPU seconds."""
import collections
import csv
import json
import math
import pathlib
import sys


def number(v):
    return float(str(v).replace(',', '.'))


def percentile(values, p):
    return sorted(values)[max(0, math.ceil(len(values)*p/100)-1)] if values else None


def present_windows(events, frequency):
    windows=collections.defaultdict(list)
    for event in events:
        if event['kind']=='present':
            windows[event['value']].append(event['clock'])
    intervals=[(b-a)*1000/frequency for ticks in windows.values()
               for a,b in zip(sorted(ticks),sorted(ticks)[1:])]
    return sorted(windows),intervals


def recording_window(events, start, end, offset_seconds=0):
    photos = sorted((e for e in events if e['kind']=='replay_event'), key=lambda e:e['clock'])
    offset=offset_seconds*1e9
    if not photos or photos[0]['value']-offset > start*1e9:
        raise ValueError('recording trace started after stable window')
    endpoints = [next((e['clock'] for e in photos if e['value']-offset >= s*1e9), None) for s in (start,end)]
    if None in endpoints or endpoints[0]>=endpoints[1]:
        raise ValueError('recording position did not cover stable window')
    return tuple(endpoints)


def process_summary(rows, start, end, frequency, photos):
    active = [r for r in rows if start<=int(r['qpc'])<=end]
    if len(active)<2:
        raise ValueError('too few stable samples')
    def cycles_at(t):
        a = max((r for r in rows if int(r['qpc'])<=t),key=lambda r:int(r['qpc']),default=None)
        b = min((r for r in rows if int(r['qpc'])>=t),key=lambda r:int(r['qpc']),default=None)
        if a is None or b is None:
            raise ValueError('samples do not bracket stable window')
        x,y=int(a['qpc']),int(b['qpc'])
        return int(a['cpu_cycles']) if x==y else int(a['cpu_cycles'])+(int(b['cpu_cycles'])-int(a['cpu_cycles']))*(t-x)/(y-x)
    cycles=cycles_at(end)-cycles_at(start)
    seconds=(end-start)/frequency
    return dict(seconds=seconds,cpu_cycles=cycles,cycles_per_second=cycles/seconds,
                cycles_per_received_photo=cycles/photos if photos else None,
                mean_private_mib=sum(int(r['private_bytes']) for r in active)/len(active)/2**20,
                peak_private_mib=max(int(r['private_bytes']) for r in active)/2**20,
                mean_working_set_mib=sum(int(r['working_set_bytes']) for r in active)/len(active)/2**20 if all('working_set_bytes' in r for r in active) else None,
                peak_working_set_mib=max(int(r['working_set_bytes']) for r in active)/2**20 if all('working_set_bytes' in r for r in active) else None)


def phase_summary(events,start,end,frequency):
    stages=collections.defaultdict(collections.Counter)
    for e in events:
        if e['kind']=='span' and start<=e['clock']<=e['end']<=end:
            failed=e['value']==2**64-1
            stages[e['label']].update(calls=1,wall_ns=(e['end']-e['clock'])*1e9/frequency,
                                       cpu_cycles=0 if failed else e['value'],cycle_errors=int(failed))
    return {name:dict(values, cpu_cycles_per_call=values['cpu_cycles']/values['calls'],
                      wall_ns_per_call=values['wall_ns']/values['calls'])
            for name,values in stages.items()}


def read_csv(path):
    with path.open(encoding='utf-8-sig',newline='') as stream:
        return list(csv.DictReader(stream))


def read_trace(path):
    events=[]
    frequency=None
    expected_events=None
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        if line.startswith('trace frequency='):
            header=dict(v.split('=') for v in line.split()[1:])
            frequency=int(header['frequency'])
            if int(header['overflow']):
                raise ValueError('trace overflow: discard run')
        elif line.startswith('trace_end events='):
            expected_events=int(line.split('=',1)[1])
        elif line.startswith('trace\t'):
            _,kind,label,clock,end,epoch,sequence,value=line.split('\t')
            events.append(dict(kind=kind,label=label,clock=int(clock),end=int(end),epoch=int(epoch),sequence=int(sequence),value=int(value)))
    if not frequency:
        raise ValueError('missing trace clock')
    if expected_events!=len(events):
        raise ValueError('truncated trace: discard run')
    return frequency, events


def summarize(root):
    if not (root/'complete.txt').exists():
        raise ValueError('incomplete run')
    metadata=json.loads((root/'metadata.json').read_text(encoding='utf-8-sig'))
    if metadata.get('measurement_version')!=2 or metadata.get('profile')!='release':
        raise ValueError('solo dev: not a Release v2 baseline')
    frequency,events=read_trace(root/'stderr.log')
    core_frequency,core_events=read_trace(root/'core.stderr.log')
    if frequency!=metadata.get('qpc_frequency') or core_frequency!=frequency:
        raise ValueError('trace and sampler clocks differ')
    origin=metadata.get('replay_schedule_origin_seconds',0)
    offset=origin-metadata.get('recording_first_event_seconds',0)
    raw_positions=[e['value']/1e9 for e in core_events if e['kind']=='replay_event']
    if not raw_positions or abs(min(raw_positions)-origin)>0.000001:
        raise ValueError('replay scheduling origin differs from the recording reader contract')
    if metadata.get('recording_event_count') is not None and len(raw_positions)!=metadata['recording_event_count']:
        raise ValueError('replay event count differs from manifest: discard run')
    positions=[position-offset for position in raw_positions]
    if not positions or max(positions)<metadata['recording_duration_seconds']-0.1:
        raise ValueError('replay did not reach the end of the recording: discard run')
    start,end=recording_window(core_events,metadata['stable_start_seconds'],metadata['stable_end_seconds'],offset)
    received_ticks=[e['clock'] for e in events if e['kind']=='received']
    if not received_ticks or min(received_ticks)>start:
        raise ValueError('receiver started after stable recording window')
    stable=[e for e in events if start<=e['clock']<=end]
    load=[number(r['load_percent']) for r in read_csv(root/'system.csv') if start<=int(r['qpc'])<=end]
    if not load or max(load)>metadata['maximum_total_system_load_percent']:
        raise ValueError('missing or excessive stable system load: discard run')
    received={(e['epoch'],e['sequence']):e['clock'] for e in stable if e['kind']=='received'}
    if not received:
        raise ValueError('no received photos')
    processes={name:process_summary(read_csv(root/filename),start,end,frequency,len(received)) for name,filename in [('ui','process.csv'),('dwm','dwm.csv')]}
    presents=sorted(e['clock'] for e in stable if e['kind']=='present')
    windows,intervals=present_windows(stable,frequency)
    submitted=sorted(e['clock'] for e in events if e['kind']=='present_end')
    latencies={'receive_to_paint_ms':[],'receive_to_submit_ms':[]}
    for e in stable:
        key=e['epoch'],e['sequence']
        if e['kind']=='data_paint' and key in received:
            latencies['receive_to_paint_ms'].append((e['clock']-received[key])*1000/frequency)
            tick=next((t for t in submitted if t>=e['clock']),None)
            if tick is not None:
                latencies['receive_to_submit_ms'].append((tick-received[key])*1000/frequency)
    changes=collections.Counter((e['epoch'],e['sequence']) for e in stable if e['kind']=='notify')
    paints=collections.Counter((e['epoch'],e['sequence']) for e in stable if e['kind']=='data_paint')
    gpu_rows=[r for r in read_csv(root/'gpu.csv') if start<=int(r['qpc'])<=end]
    gpu={}
    for name in ('ui','dwm'):
        selected=[r for r in gpu_rows if r['process']==name]
        if not selected:
            raise ValueError('missing GPU samples for '+name)
        gpu[name]=dict(mean_busiest_engine_percent=sum(number(r['busiest_engine_percent']) for r in selected)/len(selected),mean_engine_sum_percent=sum(number(r['engine_sum_percent']) for r in selected)/len(selected),peak_dedicated_mib=max(number(r['dedicated_bytes']) for r in selected)/2**20)
    stages=phase_summary(events,start,end,frequency)
    if any(stage['cycle_errors'] for stage in stages.values()):
        raise ValueError('thread cycle query failed in stable phase: discard run')
    if metadata.get('phases') and not stages:
        raise ValueError('phases requested but no stable spans were recorded')
    fast=any(feature.replace('-','_').upper()=='GPUI_FAST' for feature in metadata.get('features',[]))
    text_supported=metadata.get('phases',False) and not fast
    text_diagnostics=dict(status='measured' if text_supported else 'unavailable in fast backend' if fast else 'phases disabled',
        steady_calls=stages.get('text_layout',{}).get('calls',0) if text_supported else None,
        steady_cpu_cycles=stages.get('text_layout',{}).get('cpu_cycles',0) if text_supported else None,
        full_run_calls=sum(e['kind']=='span' and e['label']=='text_layout' for e in events) if text_supported else None,
        scope='Native text shaping on cache misses. Hot cache lookup and glyph painting are included in paint; zero native calls does not mean zero text painting cost.')
    sampler_path=root/'sampler.csv'
    sampler_rows=[r for r in read_csv(sampler_path) if start<=int(r['qpc'])<=end] if sampler_path.exists() else []
    sampler=dict(status='measured direct collector process only' if sampler_rows else 'not recorded',
                 cpu_cycles=sum(int(r['cpu_cycles']) for r in sampler_rows) if sampler_rows else None,
                 iterations=len(sampler_rows),
                 scope='Get-Counter iteration including its sampling wait; provider process cost and system perturbation excluded')
    result=dict(metadata=metadata,stable_qpc=[start,end],received_photos=len(received),**processes,gpu=gpu,
                native_text_layout=text_diagnostics,sampler=sampler,
                recording_last_position_seconds=max(positions),
                stable_recording_position_seconds=[metadata['stable_start_seconds'],metadata['stable_end_seconds']],
                stable_system_load_mean_percent=sum(load)/len(load),stable_system_load_peak_percent=max(load),
                present_calls=len(presents),presents_per_second=len(presents)/((end-start)/frequency),
                present_window_ids=sorted(windows),present_intervals_ms=intervals,present_interval_p99_ms=percentile(intervals,99),
                **{k.replace('_ms','_median_ms'):percentile(v,50) for k,v in latencies.items()},
                **latencies,**{k.replace('_ms','_p99_ms'):percentile(v,99) for k,v in latencies.items()},
                notifications=dict(collections.Counter(e['label'] for e in stable if e['kind']=='notify')),
                changed_widgets_per_changed_snapshot=sum(changes.values())/len(changes) if changes else None,
                data_widget_paints_per_painted_snapshot=sum(paints.values())/len(paints) if paints else None,
                stages=stages,
                limits='Cycles are not CPU seconds. Stages overlap; never sum. API present cadence and receive-to-submit latency do not measure physical display timing. GPU engine sums may exceed 100%. Physical VRR verification remains manual.')
    (root/'summary.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,indent=2))
    return result


if __name__=='__main__':
    summarize(pathlib.Path(sys.argv[1]))
