"""Aggregate independent v2 Release runs with median and full range."""
import collections
import hashlib
import json
import pathlib
import statistics
import sys


def aggregate(root):
    groups=collections.defaultdict(list)
    identities=set()
    sources=[]
    metadata=None
    for path in sorted(root.glob('round-*/summary.json')):
        if not (path.parent/'complete.txt').exists():
            raise ValueError('incomplete run: '+str(path.parent))
        run=json.loads(path.read_text(encoding='utf-8-sig'))
        meta=run['metadata']
        if metadata is None:
            metadata={k:v for k,v in meta.items() if k not in ('widgets','phases','date')}
        if meta['profile']!='release' or meta['measurement_version'] not in (2,3):
            raise ValueError('Release v2 required')
        if not meta.get('collector_sha'):
            raise ValueError('explicit collector_sha required')
        identities.add((meta['executable_sha256'],meta['recording_sha256'],meta.get('core_sha256'),meta['profile'],meta['collector_sha'],meta['measurement_version']))
        groups[(meta['widgets'],meta['phases'])].append(run)
        sources.append(dict(directory=path.parent.name,summary_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                            widgets=meta['widgets'],phases=meta['phases'],ui=run['ui'],dwm=run['dwm'],gpu=run['gpu'],
                            received_photos=run.get('received_photos'),present_calls=run.get('present_calls')))
    if len(identities)!=1 or len(groups)!=6 or any(len(r)<5 for r in groups.values()):
        raise ValueError('need >=5 runs per six configurations from one Release executable and recording')
    result={}
    for (widgets,phases),runs in groups.items():
        metrics={}
        paths=[(p,f) for p in ('ui','dwm') for f in ('cycles_per_second','cycles_per_received_photo','mean_private_mib','mean_working_set_mib')]
        paths += [('gpu',p,f) for p in ('ui','dwm') for f in ('mean_busiest_engine_percent','mean_engine_sum_percent','peak_dedicated_mib')]
        paths += [(f,) for f in ('present_interval_p99_ms','receive_to_paint_p99_ms','receive_to_submit_p99_ms')]
        paths += [(f,) for f in ('receive_to_paint_median_ms','receive_to_submit_median_ms','presents_per_second')]
        stages=set().union(*(run.get('stages',{}) for run in runs))
        paths += [('stages',stage,field) for stage in sorted(stages)
                  for field in ('calls','cpu_cycles','wall_ns','cpu_cycles_per_call','wall_ns_per_call')]
        for path in paths:
            values=[]
            for run in runs:
                value=run
                for key in path:
                    value=value.get(key) if isinstance(value,dict) else None
                if value is not None:
                    values.append(value)
            metrics['.'.join(path)]=dict(median=statistics.median(values),minimum=min(values),maximum=max(values)) if values else None
        result[f'widgets={widgets},phases={phases}']=dict(runs=len(runs),metrics=metrics)
    result['_metadata']=metadata
    result['_runs']=sources
    (root/'campaign.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,indent=2))
    return result


if __name__=='__main__':
    aggregate(pathlib.Path(sys.argv[1]))
