"""Aggregate independent v2 Release runs with median and full range."""
import collections
import json
import pathlib
import statistics
import sys


def aggregate(root):
    groups=collections.defaultdict(list)
    identities=set()
    for path in sorted(root.glob('round-*/summary.json')):
        if not (path.parent/'complete.txt').exists():
            raise ValueError('incomplete run: '+str(path.parent))
        run=json.loads(path.read_text(encoding='utf-8-sig'))
        meta=run['metadata']
        if meta['profile']!='release' or meta['measurement_version']!=2:
            raise ValueError('Release v2 required')
        identities.add((meta['executable_sha256'],meta['recording_sha256'],meta.get('core_sha256'),meta['profile']))
        groups[(meta['widgets'],meta['phases'])].append(run)
    if len(identities)!=1 or len(groups)!=6 or any(len(r)<5 for r in groups.values()):
        raise ValueError('need >=5 runs per six configurations from one Release executable and recording')
    result={}
    for (widgets,phases),runs in groups.items():
        metrics={}
        paths=[(p,f) for p in ('ui','dwm') for f in ('cycles_per_second','cycles_per_received_photo','mean_private_mib')]
        paths += [('gpu',p,f) for p in ('ui','dwm') for f in ('mean_busiest_engine_percent','mean_engine_sum_percent','peak_dedicated_mib')]
        paths += [(f,) for f in ('present_interval_p99_ms','receive_to_paint_p99_ms','receive_to_submit_p99_ms')]
        for path in paths:
            values=[]
            for run in runs:
                value=run
                for key in path:
                    value=value[key]
                if value is not None:
                    values.append(value)
            metrics['.'.join(path)]=dict(median=statistics.median(values),minimum=min(values),maximum=max(values)) if values else None
        result[f'widgets={widgets},phases={phases}']=dict(runs=len(runs),metrics=metrics)
    (root/'campaign.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,indent=2))
    return result


if __name__=='__main__':
    aggregate(pathlib.Path(sys.argv[1]))
