#!/usr/bin/env python3
"""Inert by default. Read-only polling, DeepSeek proposals and signed T3 delivery."""
import argparse
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.parse
import urllib.request
import uuid
from analysis import MODEL, extract, validate, utc
from privacy import redact, clean_tree
from state import State
import model
import plane_intake

PROJECT = 'ombjshwzqgeisazijduq'


def canonical_id(value):
    parsed = str(uuid.UUID(value))
    if value != parsed:
        raise ValueError('invalid_id')
    return parsed


def load_config(path):
    value = json.loads(Path(path).read_text(encoding='utf-8'))
    if value.get('enabled') is not True or value.get('privacy_approved') is not True:
        raise ValueError('activation_and_written_privacy_approval_required')
    approval = value.get('privacy_conditions_sha256')
    conditions = Path(value['privacy_conditions_file'])
    if not isinstance(approval, str) or hashlib.sha256(conditions.read_bytes()).hexdigest() != approval:
        raise ValueError('written_privacy_conditions_required')
    target = urllib.parse.urlsplit(value['webhook_url'])
    if target.scheme != 'https' or not target.hostname or target.username or target.password or target.fragment:
        raise ValueError('invalid_webhook_target')
    if set(value.get('provider', {})) != {'opencode-go'}:
        raise ValueError('dedicated_provider_definition_required')
    return value


def read_reports(config, state, credential):
    # Secret remains in process memory/env, never CLI arguments or logs.
    parsed = urllib.parse.urlsplit(Path(credential).read_text(encoding='utf-8').strip())
    if parsed.scheme not in ('postgres','postgresql') or not parsed.hostname.endswith('.pooler.supabase.com') or parsed.port != 5432 or parsed.path != '/postgres' or urllib.parse.unquote(parsed.username) != 'vantare_triage.'+PROJECT:
        raise ValueError('dedicated_readonly_connection_required')
    env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
    env.update(PGHOST=parsed.hostname,PGPORT='5432',PGDATABASE='postgres',PGUSER=urllib.parse.unquote(parsed.username),
               PGPASSWORD=urllib.parse.unquote(parsed.password),PGSSLMODE='verify-full',PGSSLROOTCERT=config['ca'],PGCONNECT_TIMEOUT='15')
    pending = [canonical_id(id) for id in state.pending_ids()]
    pending_clause = 'c.id in ('+','.join("'"+id+"'::uuid" for id in pending)+')' if pending else 'false'
    cursor = state.cursor()
    cursor_clause = 'true' if cursor is None else "(c.created_at,c.id) > (timestamptz '"+utc(cursor[0]).isoformat()+"','"+canonical_id(cursor[1])+"'::uuid)"
    projection = '''jsonb_build_object('id',c.id,'channel',c.channel,'created_at',c.created_at,'title',c.title,'body',c.body,
      'context',(select jsonb_build_object('app_version',x.app_version,'app_channel',x.app_channel,'game',x.game,'game_version',x.game_version,
        'system',x.system,'telemetry_summary',x.telemetry_summary,'consent',x.consent) from public.testing_contribution_context x where x.contribution_id=c.id),
      'attachments',coalesce((select jsonb_agg(jsonb_build_object('kind',a.kind,'content',a.content,'sha256',a.sha256))
        from public.testing_contribution_attachments a where a.contribution_id=c.id),'[]'::jsonb))'''
    history_projection = '''jsonb_build_object('id',c.id,'created_at',c.created_at,'title',c.title,
      'context',(select jsonb_build_object('app_version',x.app_version,'game',x.game,
        'consent',jsonb_build_object('version',x.consent->'version'),
        'telemetry_summary',jsonb_build_object('errors',coalesce((select jsonb_agg(jsonb_build_object('fingerprint',e->'fingerprint'))
          from jsonb_array_elements(coalesce(x.telemetry_summary->'errors','[]'::jsonb)) e),'[]'::jsonb)))
      from public.testing_contribution_context x where x.contribution_id=c.id))'''
    query = f'''begin read only; set local statement_timeout='10s';
      select jsonb_build_object('queue',coalesce((select jsonb_agg(v) from (select {projection} v
        from public.testing_contributions c where c.state='received' and ({cursor_clause} or {pending_clause})
        order by c.created_at,c.id limit 20) q),'[]'::jsonb),
        'history',coalesce((select jsonb_agg(v) from (select {history_projection} v from public.testing_contributions c
        where c.created_at > statement_timestamp()-interval '14 days'
        and exists(select 1 from public.testing_contribution_context x where x.contribution_id=c.id and x.consent->>'version'='triage-v2')
        order by c.created_at desc limit 500) h),'[]'::jsonb)); rollback;'''
    result = subprocess.run(['psql','-X','-qAt','-v','ON_ERROR_STOP=1'],env=env,input=query.encode(),capture_output=True,timeout=25)
    if result.returncode or len(result.stdout)>32*1024*1024:
        raise ValueError('readonly_poll_failed')
    value=json.loads(result.stdout)
    for report in value['queue']+value['history']:
        canonical_id(report['id'])
        for attachment in report.get('attachments') or []:
            content=attachment['content'].encode('utf-8')
            if len(content)>262144 or hashlib.sha256(content).hexdigest()!=attachment['sha256']:
                raise ValueError('invalid_attachment')
    return value['queue'],value['history']


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('webhook_redirect_denied')


def deliver(payload, url, secret):
    body=json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    signature='sha256='+hmac.new(secret,body,hashlib.sha256).hexdigest()
    request=urllib.request.Request(url,data=body,headers={'Content-Type':'application/json','X-Hub-Signature-256':signature},method='POST')
    with urllib.request.build_opener(NoRedirect()).open(request,timeout=10) as response:
        if not 200<=response.status<300:
            raise ValueError('webhook_delivery_failed')


def verify_delivery(body, signature, secret, now, seen):
    if len(body)>65536:
        raise ValueError('delivery_size_limit')
    expected='sha256='+hmac.new(secret,body,hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,signature):
        raise ValueError('invalid_signature')
    value=json.loads(body)
    id=canonical_id(value['delivery_id'])
    age=now-utc(value['sent_at']).timestamp()
    if age<0 or age>86400 or id in seen or value['type'] not in ('triage.proposal','triage.failed'):
        raise ValueError('stale_or_replayed_delivery')
    if value['contribution']['id']!=id:
        raise ValueError('delivery_identity_mismatch')
    return value


def pass_once(state, reports, history, versions, analyze, send, now, intake=None):
    for id in state.purge(now):
        print(json.dumps({'id':id,'status':'intake_expired'}))
    def intake_send(id, payload):
        try:
            intake(payload,state);state.intake_delivered(id)
        except plane_intake.PlaneError as error:
            print(json.dumps({'id':id,'status':'intake_pending','reason':error.code}))
        except Exception:
            print(json.dumps({'id':id,'status':'intake_pending'}))
    if intake is not None:
        for id in state.intake_deliveries(now):
            intake_send(id,state.payload(id))
    # Retry delivery before polling/model work. Persisted spool prevents reanalysis.
    for id in state.deliveries(now):
        try:
            send(state.payload(id));state.delivered(id,now)
        except Exception:
            print(json.dumps({'id':id,'status':'delivery_pending'}))
    for report in reports[:20]:
        id=canonical_id(report['id']);state.discover(report,now)
        attempt=state.attempt(id)
        if attempt is None:
            continue
        base={'delivery_id':id,'sent_at':datetime.fromtimestamp(now,timezone.utc).isoformat(),
              'contribution':{'id':id,'channel':report['channel'],'created_at':report['created_at'],
                  'title':redact(report['title']),'body_redacted':redact(report['body']),
                  **{k:clean_tree((report.get('context') or {}).get(k)) for k in ('app_version','game','game_version')}}}
        started=time.monotonic()
        invoked=False
        try:
            minimal,facts=extract(report,history,versions)
            invoked=True
            proposal=validate(analyze(minimal),facts)
            payload={**base,'type':'triage.proposal','triage':proposal,
                     'engine':{'model':MODEL,'prompt':'triage-v2','duration_ms':int((time.monotonic()-started)*1000),'attempt':attempt}}
            publish_intake=intake is not None and report['channel']=='testers'
            state.analyzed(id,payload,now,intake=publish_intake)
        except Exception:
            if attempt<3:
                state.analysis_failed(id);print(json.dumps({'id':id,'status':'analysis_retry'}));continue
            payload={**base,'type':'triage.failed','triage':None,
                     'engine':{'model':MODEL if invoked else None,'prompt':'triage-v2','duration_ms':int((time.monotonic()-started)*1000),'attempt':attempt}}
            state.analyzed(id,payload,now,failed=True)
            publish_intake=False
        if publish_intake:
            intake_send(id,payload)
        try:
            send(payload);state.delivered(id,now)
            print(json.dumps({'id':id,'status':'delivered'}))
        except Exception:
            print(json.dumps({'id':id,'status':'delivery_pending'}))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',required=True)
    args=parser.parse_args()
    try:
        # Default config fails here, before credentials, network, state or model.
        config=load_config(args.config)
        credentials=Path(os.environ['CREDENTIALS_DIRECTORY'])
        state=State(config['state_dir'])
        try:
            import fcntl
            with (state.root/'worker.lock').open('a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                reports,history=read_reports(config,state,credentials/'supabase-url')
                key=(credentials/'t3-hmac').read_bytes().strip()
                intake_config=config.get('plane_intake') or {}
                intake=None
                if intake_config.get('enabled') is True:
                    client=plane_intake.Intake(intake_config,plane_intake.read_token(credentials/'plane-token'))
                    intake=client.publish
                pass_once(state,reports,history,config['known_versions'],
                    lambda v:model.run(v,credentials/'opencode-go-auth',config['provider']),
                    lambda p:deliver(p,config['webhook_url'],key),int(time.time()),intake=intake)
        finally:
            state.close()
    except Exception:
        print(json.dumps({'status':'inactive_or_failed','detail':'protected configuration/operation; no raw diagnostic'}))
        return 1
    return 0


if __name__=='__main__':
    raise SystemExit(main())
