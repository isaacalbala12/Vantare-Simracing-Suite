"""Deterministic evidence, minimal model input and strict, downgraded proposals."""
import csv
from datetime import datetime, timezone
import io
import json
import math
import re
from difflib import SequenceMatcher
from privacy import redact, clean_tree, system

MODEL = 'opencode-go/deepseek-v4.1-flash'
AREAS = {'overlays','ingeniero','estrategia','launcher','calendario','testing-center','telemetria','plataforma','licencias','studio','otro'}


def utc(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)


def candidates(report, history):
    ctx = report.get('context') or {}
    errors = ((ctx.get('telemetry_summary') or {}).get('errors') or [])
    fingerprints = {e.get('fingerprint') for e in errors if isinstance(e, dict)} - {None}
    result = []
    for other in history:
        age = (utc(report['created_at']) - utc(other['created_at'])).total_seconds()
        if other['id'] == report['id'] or not 0 <= age <= 14 * 86400:
            continue
        oc = other.get('context') or {}
        of = {e.get('fingerprint') for e in (oc.get('telemetry_summary') or {}).get('errors', []) if isinstance(e, dict)}
        same = ctx.get('game') == oc.get('game') and ctx.get('app_version') == oc.get('app_version')
        similar = SequenceMatcher(None, report['title'].casefold(), other['title'].casefold()).ratio() >= .7
        if same or fingerprints & of or similar:
            result.append({'id': other['id'], 'title': redact(other['title']), 'app_version': oc.get('app_version'), 'game': oc.get('game')})
    return result[:15]


def fragment_stats(content):
    """Only numeric allowlisted simulator channels, never original samples."""
    try:
        rows = json.loads(content) if content.lstrip().startswith('[') else list(csv.DictReader(io.StringIO(content)))
        if not isinstance(rows, list):
            return {}
        allowed = ('speed','rpm','gear','throttle','brake','fps','timestamp_ms','telemetry_latency_ms')
        output = {}
        for key in allowed:
            values = []
            nan = 0
            for row in rows[:20000]:
                if not isinstance(row, dict) or key not in row:
                    continue
                try:
                    v = float(row[key])
                    if math.isfinite(v):
                        values.append(v)
                    else:
                        nan += 1
                except (ValueError, TypeError):
                    nan += 1
            if values:
                output[key] = {'min': min(values), 'max': max(values), 'nan': nan, 'count': len(values)}
        times = sorted(float(row['timestamp_ms']) for row in rows if isinstance(row, dict) and 'timestamp_ms' in row and math.isfinite(float(row['timestamp_ms'])))
        if times:
            span = times[-1] - times[0]
            if span > 60000:
                return {}
            gaps = [b-a for a,b in zip(times,times[1:]) if b>a]
            if gaps:
                cadence = sorted(gaps)[len(gaps)//2]
                output['gaps'] = sum(g > cadence * 3 for g in gaps)
        return output
    except (ValueError, TypeError, KeyError):
        return {}


def extract(report, history, versions):
    ctx = report.get('context') or {}
    consent = ctx.get('consent') or {}
    if consent.get('version') != 'triage-v2':
        raise ValueError('external_ai_consent_missing')
    items = set(consent.get('items') or [])
    summary = ctx.get('telemetry_summary') or {}
    errors = [{k:e[k] for k in ('type','message','first_line','fingerprint') if k in e}
              for e in summary.get('errors', [])[:20] if isinstance(e,dict)] if 'telemetry_summary' in items else []
    events = [{k:e[k] for k in ('name','at') if k in e} for e in summary.get('events', [])[-20:] if isinstance(e,dict)] if 'telemetry_summary' in items else []
    performance = {k:{p:v[p] for p in ('p50','p95') if p in v and type(v[p]) in (int,float) and math.isfinite(v[p])}
                   for k,v in summary.get('performance', {}).items() if k in ('overlay_fps','cpu_percent','memory_mb','telemetry_latency_ms') and isinstance(v,dict)} if 'telemetry_summary' in items else {}
    refs = set()
    for error in errors:
        if isinstance(error.get('fingerprint'), str) and re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', error['fingerprint']):
            refs.add('error:' + error['fingerprint'])
    for metric, values in performance.items():
        if metric in ('overlay_fps','cpu_percent','memory_mb','telemetry_latency_ms') and isinstance(values, dict):
            refs.update(f'perf:{metric}_{p}' for p in ('p50','p95') if p in values)
    logs = []
    stats = {}
    evidence = bool(errors)
    for attachment in report.get('attachments') or []:
        content = attachment.get('content') or ''
        if attachment.get('kind') not in items:
            continue
        if attachment['kind'] == 'app_log':
            lines = content.splitlines()[-2000:]
            wanted = set()
            for i, line in enumerate(lines):
                if re.search(r'\b(?:WARN|ERROR)\b', line):
                    wanted.update(range(max(0, i-5), min(len(lines), i+6)))
            logs = [{'line': i+1, 'text': redact(lines[i])} for i in sorted(wanted)[:300]]
            evidence |= bool(content.strip())
        elif attachment['kind'] == 'telemetry_fragment':
            stats = fragment_stats(content)
            evidence |= bool(stats)
    duplicate = candidates(report, history)
    value = {'title': redact(report['title']), 'body': redact(report['body']),
             'app_version': ctx.get('app_version'), 'app_channel': ctx.get('app_channel'),
             'game': ctx.get('game'), 'game_version': ctx.get('game_version'),
             'system': system(ctx.get('system') or {}) if 'system' in items else {},
             'errors': clean_tree(errors), 'performance': clean_tree(performance),
             'events': clean_tree(events), 'log': logs, 'fragment_statistics': stats, 'duplicate_candidates': duplicate}
    # Preserve valid JSON while trimming evidence, never slice serialized JSON.
    while len(json.dumps(value, ensure_ascii=False)) > 24000:
        if value['log']:
            value['log'].pop(0)
        elif value['events']:
            value['events'].pop(0)
        elif value['errors']:
            value['errors'].pop(0)
        elif value['duplicate_candidates']:
            value['duplicate_candidates'].pop()
        elif len(value['body']) > 200:
            value['body'] = value['body'][:-100]
        else:
            raise ValueError('extract_too_large')
    # References can only address data that survived the final budget.
    refs = {f"error:{e['fingerprint']}" for e in value['errors'] if isinstance(e.get('fingerprint'), str)} | {
        f'perf:{m}_{p}' for m,v in value['performance'].items() for p in ('p50','p95') if p in v}
    traceable = bool(ctx.get('app_version') in versions.get(report['channel'], []) and ctx.get('game') in ('lmu','acc') and ctx.get('game_version'))
    return value, {'traceable': traceable, 'evidence': evidence, 'content_minimum': len(report['body'].strip()) >= 200,
                   'refs': refs, 'lines': {x['line'] for x in value['log']}, 'candidates': {x['id'] for x in value['duplicate_candidates']}}


def validate(raw, facts):
    keys = {'schema','verdict','criteria','duplicate_of','severity','area','evidence_refs','summary','preliminary_fix','confidence','reasons'}
    if not isinstance(raw, dict) or set(raw) != keys or raw['schema'] != 'vantare.triage.v2':
        raise ValueError('model_schema')
    if raw['verdict'] not in ('valido','dudoso','spam') or raw['area'] not in AREAS or raw['severity'] not in (None,'critica','alta','media','baja'):
        raise ValueError('model_enum')
    criteria = raw['criteria']
    if not isinstance(criteria, dict) or set(criteria) != {'contenido_minimo','evidencia','no_duplicado'} or criteria['contenido_minimo'] not in ('si','no') or criteria['evidencia'] not in ('si','debil','no') or criteria['no_duplicado'] not in ('si','no'):
        raise ValueError('model_criteria')
    confidence = raw['confidence']
    if type(confidence) not in (int,float) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
        raise ValueError('model_confidence')
    if raw['duplicate_of'] is not None and raw['duplicate_of'] not in facts['candidates']:
        raise ValueError('unknown_duplicate')
    for field, limit, nullable in [('summary',200,False),('preliminary_fix',600,True)]:
        if raw[field] is None and nullable:
            continue
        if not isinstance(raw[field], str) or len(raw[field]) > limit:
            raise ValueError('model_text')
    if not isinstance(raw['reasons'], list) or len(raw['reasons'])>5 or any(not isinstance(r,str) or len(r)>200 for r in raw['reasons']):
        raise ValueError('model_reasons')
    if not isinstance(raw['evidence_refs'], list) or len(raw['evidence_refs'])>50:
        raise ValueError('model_refs')
    for ref in raw['evidence_refs']:
        if isinstance(ref,str) and ref in facts['refs']:
            continue
        match = re.fullmatch(r'log:L(\d+)-L(\d+)', ref) if isinstance(ref,str) else None
        if not match or not 0 < int(match[1]) <= int(match[2]) <= 2000 or not set(range(int(match[1]),int(match[2])+1)) <= facts['lines']:
            raise ValueError('unknown_evidence')
    result = clean_tree(raw)
    # IDs and schema/criteria stay exact; only free model text is redacted again.
    for k in ('schema','verdict','criteria','duplicate_of','severity','area','evidence_refs','confidence'):
        result[k] = raw[k]
    result['summary'] = result['summary'][:200]
    result['preliminary_fix'] = result['preliminary_fix'][:600] if result['preliminary_fix'] is not None else None
    result['reasons'] = [r[:200] for r in result['reasons']]
    result['criteria'] = dict(criteria)
    if not facts['content_minimum']:
        result['criteria']['contenido_minimo'] = 'no'
    if not facts['evidence'] or not raw['evidence_refs']:
        result['criteria']['evidencia'] = 'no'
    if raw['duplicate_of']:
        result['criteria']['no_duplicado'] = 'no'
    result['trazable'] = 'si' if facts['traceable'] else 'no'
    if not facts['traceable'] or result['criteria']['evidencia']=='debil' or (
        result['verdict']=='valido' and any(v!='si' for v in result['criteria'].values())):
        result['verdict'] = 'dudoso'
    if result['verdict'] == 'spam' and confidence < .7:
        result['verdict'] = 'dudoso'
    return result
