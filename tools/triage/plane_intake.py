"""Plane CE 1.4.2 API v1. Metadata only; never accepts a Supabase report."""
import html
import json
import math
import os
from pathlib import Path
import stat
import urllib.error
import urllib.parse
import urllib.request
import uuid
from privacy import redact

SOURCE = 'vantare-testing-contribution'
WORKSPACE = 'vantare-simracing-suite'
PROJECT = '89da40f4-ae2a-443d-9e3e-6024e01247c9'


class PlaneError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__('plane_intake_' + str(code))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_token(path):
    path = Path(path)
    info = path.lstat()
    if os.name != 'posix' or not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
        raise PlaneError('restricted_credential_required')
    token = path.read_text(encoding='utf-8').strip()
    if not token or len(token)>8192 or '\n' in token or '\r' in token:
        raise PlaneError('invalid_credential')
    return token


def identifier(value):
    if str(uuid.UUID(value)) != value:
        raise PlaneError('invalid_identifier')
    return value


def content(payload):
    contribution = payload['contribution']
    if payload['type'] != 'triage.proposal' or contribution['channel'] != 'testers':
        raise PlaneError('tester_proposal_required')
    id = identifier(contribution['id'])
    proposal = payload['triage']
    verdict = {'valido':'válido','dudoso':'dudoso','spam':'spam'}[proposal['verdict']]
    confidence = proposal['confidence']
    if type(confidence) not in (int,float) or not math.isfinite(confidence) or not 0<=confidence<=1:
        raise PlaneError('invalid_confidence')
    if contribution.get('game') not in ('lmu','acc','none'):
        raise PlaneError('invalid_game')
    title = redact(contribution['title'])[:255].strip() or 'Informe de tester'
    rows = [('Canal','testers'),('Juego',contribution['game']),
            ('Versión',redact(contribution.get('game_version') or 'No disponible')[:120]),
            ('Veredicto',verdict),('Confianza',format(confidence,'.3f')),
            ('Resumen',redact(proposal['summary'])[:200]),
            ('Contribución',id),('Fuente externa',SOURCE)]
    # Fixed text markers also reconcile a POST whose response was lost before
    # CE v1's second step could persist the work item's external identifiers.
    body = ''.join('<p>'+html.escape(k+': '+v)+'</p>' for k,v in rows)
    body += '<p>Aceptar en Intake no acepta este informe para el descuento. Solo la RPC de review, tras confirmación humana, lo hace.</p>'
    return id, {'issue':{'name':title,'description_html':body,'priority':'none'}}


class Intake:
    def __init__(self, config, token, opener=None):
        url=urllib.parse.urlsplit(config['base_url'])
        if url.scheme not in ('http','https') or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ('','/'):
            raise PlaneError('invalid_url')
        if url.scheme=='http' and url.hostname not in ('sapphireos.tail357eab.ts.net','192.168.1.57'):
            raise PlaneError('private_transport_required')
        if config['workspace']!=WORKSPACE or config['project_id']!=PROJECT:
            raise PlaneError('vanta_project_required')
        self.base=config['base_url'].rstrip('/')+'/api/v1/workspaces/'+WORKSPACE+'/projects/'+PROJECT+'/'
        self.token=token
        self.opener=opener or urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
        self.enabled=False

    def call(self, path='', method='GET', data=None):
        req=urllib.request.Request(self.base+path,method=method,
            data=None if data is None else json.dumps(data,ensure_ascii=False).encode('utf-8'),
            headers={'X-API-Key':self.token,'Content-Type':'application/json'})
        try:
            with self.opener.open(req,timeout=15) as response:
                raw=response.read(2*1024*1024+1)
                if len(raw)>2*1024*1024:raise PlaneError('response_limit')
                return json.loads(raw)
        except urllib.error.HTTPError as error:
            raise PlaneError(error.code) from None
        except (OSError,ValueError):
            raise PlaneError('unavailable') from None

    def ensure_enabled(self):
        if self.enabled:return
        project=self.call()
        if project.get('id')!=PROJECT:raise PlaneError('project_mismatch')
        if project.get('intake_view') is not True:
            self.call('', 'PATCH', {'intake_view':True})
            if self.call().get('intake_view') is not True:raise PlaneError('enable_failed')
        self.enabled=True

    def lookup(self, id):
        query=urllib.parse.urlencode({'external_id':id,'external_source':SOURCE})
        try:
            result=self.call('work-items/?'+query)
        except PlaneError as error:
            if error.code==404:return None
            raise
        # v1 returns ONE work item, not a paginated list, for both identifiers.
        if result.get('external_id')!=id or result.get('external_source')!=SOURCE:
            raise PlaneError('external_identity_mismatch')
        return identifier(result['id'])

    def reconcile(self, id):
        cursor=None;seen=set();found=[]
        for _ in range(100):
            query={'per_page':100,'fields':'id,issue,issue_detail'}
            if cursor:query['cursor']=cursor
            page=self.call('intake-issues/?'+urllib.parse.urlencode(query))
            rows=page if isinstance(page,list) else page['results']
            for row in rows:
                detail=row.get('issue_detail') or {}
                body=detail.get('description_html') or ''
                if '<p>Contribución: '+id+'</p>' in body and '<p>Fuente externa: '+SOURCE+'</p>' in body:
                    found.append(identifier(row['issue']))
            if isinstance(page,list) or not page.get('next_page_results'):
                if len(set(found))>1:raise PlaneError('ambiguous_recovery')
                return next(iter(found),None)
            cursor=page.get('next_cursor')
            if not isinstance(cursor,str) or not cursor or cursor in seen:raise PlaneError('pagination')
            seen.add(cursor)
        raise PlaneError('reconciliation_limit')

    def publish(self, payload, state):
        id,body=content(payload)
        record=state.intake_record(id)
        if record and record[0]=='published':return
        self.ensure_enabled()
        existing=self.lookup(id)
        if existing:
            state.intake_recorded(id,'published',existing);return
        issue_id=identifier(record[1]) if record and record[1] else None
        if not issue_id:issue_id=self.reconcile(id)
        if not issue_id:
            if record and record[0]=='creating':
                # An uncertain POST must never be repeated blindly. Reconcile on
                # later passes; a permanently absent row needs operator review.
                raise PlaneError('creation_uncertain')
            state.intake_recorded(id,'creating',None)
            try:
                result=self.call('intake-issues/','POST',body)
            except PlaneError as error:
                if error.code in (400,401,403,404,429):state.intake_forget_rejected(id)
                raise
            issue_id=identifier(result['issue'])
        state.intake_recorded(id,'created',issue_id)
        # POST CE 1.4.2 ignores external metadata. Its nested PATCH uses
        # IssueSerializer, which supports the work item's external fields.
        self.call('intake-issues/'+issue_id+'/', 'PATCH',
                  {'issue':{'external_id':id,'external_source':SOURCE}})
        if self.lookup(id)!=issue_id:raise PlaneError('metadata_not_confirmed')
        state.intake_recorded(id,'published',issue_id)
