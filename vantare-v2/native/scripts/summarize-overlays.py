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


def recording_window(events, start, end):
    photos = sorted((e for e in events if e['kind']=='received'), key=lambda e:e['clock'])
    endpoints = [next((e['clock'] for e in photos if e['value'] >= s*1e9), None) for s in (start,end)]
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
                peak_private_mib=max(int(r['private_bytes']) for r in active)/2**20)


def phase_summary(events,start,end,frequency):
    stages=collections.defaultdict(collections.Counter)
    for e in events:
        if e['kind']=='span' and start<=e['clock']<=e['end']<=end:
            failed=e['value']==2**64-1
            stages[e['label']].update(calls=1,wall_ns=(e['end']-e['clock'])*1e9/frequency,
                                       cpu_cycles=0 if failed else e['value'],cycle_errors=int(failed))
    return dict(stages)


def read_csv(path):
    with path.open(encoding='utf-8-sig',newline='') as stream:
        return list(csv.DictReader(stream))


def summarize(root):
    if not (root/'complete.txt').exists():
        raise ValueError('incomplete run')
    metadata=json.loads((root/'metadata.json').read_text(encoding='utf-8-sig'))
    if metadata.get('measurement_version')!=2 or metadata.get('profile')!='release':
        raise ValueError('solo dev: not a Release v2 baseline')
    events=[]
    frequency=None
    for line in (root/'stderr.log').read_text(encoding='utf-8-sig').splitlines():
        if line.startswith('trace frequency='):
            header=dict(v.split('=') for v in line.split()[1:])
            frequency=int(header['frequency'])
            if int(header['overflow']):
                raise ValueError('trace overflow: discard run')
        elif line.startswith('trace\t'):
            _,kind,label,clock,end,epoch,sequence,value=line.split('\t')
            events.append(dict(kind=kind,label=label,clock=int(clock),end=int(end),epoch=int(epoch),sequence=int(sequence),value=int(value)))
    if not frequency:
        raise ValueError('missing trace clock')
    start,end=recording_window(events,metadata['stable_start_seconds'],metadata['stable_end_seconds'])
    stable=[e for e in events if start<=e['clock']<=end]
    received={(e['epoch'],e['sequence']):e['clock'] for e in stable if e['kind']=='received'}
    if not received:
        raise ValueError('no received photos')
    processes={name:process_summary(read_csv(root/filename),start,end,frequency,len(received)) for name,filename in [('ui','process.csv'),('dwm','dwm.csv')]}
    presents=sorted(e['clock'] for e in stable if e['kind']=='present')
    intervals=[(b-a)*1000/frequency for a,b in zip(presents,presents[1:])]
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
        gpu[name]=dict(mean_engine_sum_percent=sum(number(r['engine_sum_percent']) for r in selected)/len(selected),peak_dedicated_mib=max(number(r['dedicated_bytes']) for r in selected)/2**20)
    result=dict(metadata=metadata,stable_qpc=[start,end],received_photos=len(received),**processes,gpu=gpu,
                present_calls=len(presents),present_intervals_ms=intervals,present_interval_p99_ms=percentile(intervals,99),
                **latencies,**{k.replace('_ms','_p99_ms'):percentile(v,99) for k,v in latencies.items()},
                notifications=dict(collections.Counter(e['label'] for e in stable if e['kind']=='notify')),
                changed_widgets_per_changed_snapshot=sum(changes.values())/len(changes) if changes else None,
                data_widget_paints_per_painted_snapshot=sum(paints.values())/len(paints) if paints else None,
                stages=phase_summary(events,start,end,frequency),
                limits='Cycles are not CPU seconds. Stages overlap; never sum. API present cadence and receive-to-submit latency do not measure physical display timing. GPU engine sums may exceed 100%. Physical VRR verification remains manual.')
    (root/'summary.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,indent=2))
    return result


if __name__=='__main__':
    summarize(pathlib.Path(sys.argv[1]))
