"""Disposable loopback PostgreSQL only. macOS/Linux; never accepts a DSN."""
import argparse, os, pathlib, socket, subprocess, tempfile, json, time, urllib.request, urllib.error, urllib.parse, re
from generate_schema_snapshot import (compose, write_or_check, SNAPSHOT_IMAGE,
 SNAPSHOT_DUMP_OPTIONS, verify_snapshot_source)
from commercial_tombstone_race import run_tombstone_race
from commercial_write_race import run_write_races
from commercial_lock_order import run_lock_order
from commercial_admin_lock_order import run_admin_lock_order
from commercial_storage_race import run_storage_owners, run_storage_multipart, run_storage_buckets
from commercial_roadmap_role import run_roadmap_role_regression, run_existing_role_regression
from commercial_owner_alert import run_owner_alert_race
from commercial_checkout_terminal import run_terminal_checkout_race
from commercial_migration_lock import run_migration_lock_regression
from commercial_admin_erasure import STEM as ERASURE_STEM, CONSTRAINTS as ERASURE_CONSTRAINTS, run_erasure_sql, run_erasure_e2e, run_erasure_retained_guard, SYNC_STEM, LIMITS_STEM, SEND_STEM, run_send_sql, run_send_retained_guard, run_sync_sql, run_sync_retained_guard
from commercial_admin_gate import run_admin_gate_race, run_admin_gate_e2e
from commercial_admin_effects import run_admin_effects_race
from commercial_admin_owner import STEM as ADMIN_OWNER_STEM, SNAPSHOT as ADMIN_OWNER_SNAPSHOT, run_admin_owner_regressions, run_admin_owner_precheck
from commercial_admin_report_root import run_admin_report_cutover
from commercial_admin_minimal_audit import AUDIT_STEM, AUDIT_SNAPSHOT, run_minimal_audit, seed_audit_upgrade, audit_schema
from commercial_admin_owner_target import run_target_owner_race
from commercial_admin_confirmations import STEM as CONFIRM_STEM, SNAPSHOT as CONFIRM_SNAPSHOT, run_confirmations

from commercial_admin_explicit_sync import STEM as EXPLICIT_SYNC_STEM, run_explicit_sync
from commercial_admin_owner_policy import ACK_STEM, run_owner_ack_regressions, STEM as OWNER_POLICY_STEM, SNAPSHOT as OWNER_POLICY_SNAPSHOT, run_owner_policy_regressions
parser=argparse.ArgumentParser()
parser.add_argument('--pg-bin', required=True)
parser.add_argument('--docker', action='store_true', help='Own disposable Supabase PostgreSQL container; pg-bin supplies clients only')
parser.add_argument('--output', required=True)
parser.add_argument('--qa-e2e', action='store_true', help='Hold disposable local backend for the isolated native licensing runner')
parser.add_argument('--qa-edge-origin')
parser.add_argument('--migration-newlines', choices=['lf','crlf'], default='lf')
parser.add_argument('--before-private-write-barriers', action='store_true', help='RED: omit only the #1702 private-table guards')
parser.add_argument('--baseline', action='store_true')
parser.add_argument('--schema-snapshot', choices=['write','check'], help='Replay every migration locally, then write/check the derived domain schema')
parser.add_argument('--b01', action='store_true', help='Only real bridge JWT/RLS/Pilot/license/tombstone checks after all migrations; no unrelated writer matrix')
parser.add_argument('--before-b01', action='store_true')
parser.add_argument('--postgrest-bin')
parser.add_argument('--deno-bin')
parser.add_argument('--admin-erasure-only', action='store_true')
parser.add_argument('--admin-reports-only', action='store_true', help='Admin report root and optional effect/lease regressions only')
parser.add_argument('--legacy-retirement-inventory', action='store_true', help='Read-only catalog inventory after migrations')
parser.add_argument('--legacy-retirement-only', action='store_true', help='Replay full chain, then verify final 7b closure and rollback')
parser.add_argument('--owner-disposition-only', action='store_true', help='Replay full chain, then test the operational owner disposition boundary')
parser.add_argument('--admin-effects-only', action='store_true', help='Only admin effect/lease SQL suites, races and optional admin Edge E2E')
parser.add_argument('--admin-owner-only', action='store_true', help='Admin owner and identity regression SQL; all migrations replayed first')
parser.add_argument('--admin-deno-bin', help='Only admin Edge→SQL E2E, also accepts existing Windows Deno from WSL')
parser.add_argument('--signer-module')
parser.add_argument('--upgrade', choices=['identity', 'identity-conflict', 'refunds'])
parser.add_argument('--concurrency', action='store_true', help='Only the two-transaction tombstone regression')
parser.add_argument('--writers', action='store_true', help='All user-write barriers, two real transactions per route; no pgTAP required')
parser.add_argument('--before-write-barrier', action='store_true', help='RED control: omit r4 barrier and dependent r5 migrations')
parser.add_argument('--storage-schema', help='pg_dump --schema-only --no-owner --no-acl -n storage from a disposable Supabase stack')
parser.add_argument('--storage-owners', action='store_true', help='Real Storage owner text/UUID/manifest regression')
parser.add_argument('--storage-multipart', action='store_true', help='Two-transaction multipart persistence and cleanup queue')
parser.add_argument('--lock-order', action='store_true', help='Real writer-first and deletion-first operational RPC races')
parser.add_argument('--before-lock-order', action='store_true', help='RED: omit only r5 UUID-before-rows migration')
parser.add_argument('--before-storage-multipart', action='store_true', help='RED: omit only the r5 multipart barrier/abort queue')
parser.add_argument('--admin-lock-order', action='store_true', help='Native admin actor/target, both real transaction orders')
parser.add_argument('--before-admin-lock-order', action='store_true', help='RED: omit r6 outer admin lock migration')
parser.add_argument('--storage-buckets', action='store_true', help='Real Storage bucket ownership regression')
parser.add_argument('--before-storage-buckets', action='store_true', help='RED: omit r6 bucket ownership barrier')
parser.add_argument('--pilot-patch-drift', choices=['owner','deletion','objects','uploads'], help='Pilot migration must reject changed source text atomically')
parser.add_argument('--before-pilot-identity', action='store_true', help='RED: omit only r8 Pilot identity permissions/cutover')
parser.add_argument('--before-posthog-consent-clear', action='store_true', help='RED: omit R9 privacy revocation correction only')
parser.add_argument('--before-deleted-authorizer', action='store_true', help='RED: omit only R10 deleted-authorizer replay revocation')
parser.add_argument('--before-testing-identity', action='store_true', help='RED: omit R9 server UUID adapter correction only')
parser.add_argument('--testing-identity', action='store_true', help='F1IP and triage live/deleted after ALL migrations')
parser.add_argument('--pilot-profile', action='store_true', help='Pilot live/deleted native-data regression after ALL migrations')
parser.add_argument('--before-admin-deleted-reads', action='store_true', help='RED: omit r7 admin read fix')
args=parser.parse_args()
if args.schema_snapshot and not args.docker:
 parser.error('--schema-snapshot requires --docker with the pinned PostgreSQL image')
if args.admin_erasure_only: args.admin_reports_only=True
if args.admin_reports_only: args.admin_effects_only=True
legacy_writers_enabled=(not args.baseline and (not args.admin_effects_only or args.admin_reports_only) and
                        not args.upgrade and not any(
                         value for name,value in vars(args).items() if name.startswith('before_')))
owner_enabled=(not args.baseline and (not args.admin_effects_only or args.admin_reports_only) and
               not args.upgrade and not any(
                value for name,value in vars(args).items() if name.startswith('before_')))
if args.qa_e2e and (not args.postgrest_bin or not args.deno_bin or args.b01):
 parser.error('--qa-e2e requires --postgrest-bin and --deno-bin, without --b01')
if args.qa_e2e:
 if not re.fullmatch(r'http://127\.0\.0\.1:[0-9]{1,5}',args.qa_edge_origin or ''):
  parser.error('--qa-edge-origin must be explicit IPv4 HTTP loopback')
 qa_output=pathlib.Path(args.output).resolve()
 if not qa_output.is_relative_to('/mnt/d/VantareServer/qa/licencias-e2e') or (qa_output/'qa-e2e-owned').read_bytes()!=b'VANTA-126 qa-e2e fixture':
  parser.error('--qa-e2e requires an owned directory under the dedicated QA root')
admin_owner_enabled=owner_enabled
if args.b01 and (not args.postgrest_bin or not args.deno_bin):
 parser.error('--b01 requires --postgrest-bin and --deno-bin')
if args.b01:
 b01_options={'b01','pg_bin','output','postgrest_bin','deno_bin','signer_module','storage_schema','docker','migration_newlines'}
 if any(value for name,value in vars(args).items() if name not in b01_options):
  parser.error('--b01 cannot be combined with historical controls or another test mode')
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=pathlib.Path(args.output).resolve(); OUT.mkdir(parents=True,exist_ok=True)
BIN=pathlib.Path(args.pg_bin).resolve()
ENV={k:v for k,v in os.environ.items() if not k.startswith(('PG','PGRST'))}
# Run the Edge boundary tests in this CI gate too. Provider calls are fixtures;
# Deno can fetch pinned modules, but the tests receive no runtime network access.
if args.deno_bin and not args.baseline:
 edge_suites=['billing-webhook/process.test.ts','billing-reconcile/worker.test.ts',
  'license-credential/','native-license/']
 edge_env='--allow-env=BILLING_OWNER_ALERT_SECRET,BILLING_OWNER_ALERT_URL,BILLING_RECONCILE_SECRET,CHECKOUT_CANCEL_URL,CHECKOUT_SUCCESS_URL,CLERK_ISSUER,CLERK_NATIVE_CLIENT_ID,CLERK_SECRET_KEY,OFFLINE_LICENSE_ED25519_PRIVATE_KEY,OFFLINE_LICENSE_KEY_ID,POLAR_ACCESS_TOKEN,POLAR_API_BASE_URL,POLAR_DEBUG_ERRORS,POLAR_ENVIRONMENT,POLAR_PRODUCT_MAP,POLAR_TRIAL_ANTI_ABUSE_CONFIRMED,POLAR_WEBHOOK_SECRET,POLAR_WEBHOOK_SECRET_FORMAT,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_URL,DENO_DEPLOYMENT_ID,REPORT_PROMOTION_ENABLED' if args.qa_e2e else '--allow-env'
 edge=subprocess.run([args.deno_bin,'test','--frozen',edge_env,'--allow-read',
  '--config',str(ROOT/'supabase/functions/deno.json'),
  *[str(ROOT/'supabase/functions'/suite) for suite in edge_suites]],
  env=ENV,capture_output=True,text=True,timeout=180)
 (OUT/'license-reconciliation-edge.log').write_text(edge.stdout+edge.stderr,encoding='utf-8')
 if edge.returncode: raise RuntimeError(edge.stdout+edge.stderr)
 print(edge.stdout,flush=True)

def run(prog,*args):
 r=subprocess.run([str(BIN/prog),*map(str,args)],env=ENV,capture_output=True,text=True)
 if r.returncode: raise RuntimeError(r.stderr)
 return r.stdout
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='vantare-commercial-') as tmp:
 data=pathlib.Path(tmp)/'data'
 container='vantare-commercial-'+os.urandom(6).hex()
 database='commercial' if args.docker else 'postgres'
 def docker(*parameters):
  r=subprocess.run(['docker',*parameters],env=ENV,capture_output=True,text=True,timeout=60)
  if r.returncode: raise RuntimeError(r.stderr+r.stdout)
  return r.stdout
 if args.docker:
  # No caller-provided DSN/container: only this invocation's fresh local server.
  # The image keeps password auth for TCP even with socket trust. These are
  # public fixture credentials, generated for no external database or service.
  try:
   docker('run','--rm','-d','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust',
    '-p',f'127.0.0.1:{port}:5432',SNAPSHOT_IMAGE)
   for attempt in range(120):
    if 'PostgreSQL init process complete' in docker('logs',container):
     ready=subprocess.run(['docker','exec',container,'pg_isready','-U','postgres'],capture_output=True)
     if ready.returncode==0: break
    time.sleep(.2) # Actual server readiness, not a timed test race.
   else: raise RuntimeError('disposable PostgreSQL startup timed out')
   docker('exec',container,'createdb','-U','postgres','--template=template0',database)
   docker('exec',container,'psql','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-c',
    "alter role postgres password 'commercial-local-fixture'; alter role supabase_admin password 'commercial-local-fixture';")
   ENV['PGPASSWORD']='commercial-local-fixture'
  except BaseException:
   docker('rm','-f',container)
   raise
 else:
  run('initdb','-D',data,'-U','postgres','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale')
  sockets='-c unix_socket_directories=' if args.qa_e2e else f'-k {tmp}'
  run('pg_ctl','-D',data,'-l',OUT/'postgres.log','-o',f'-h 127.0.0.1 -p {port} {sockets}','-w','start')
 conn=['-X','-h','127.0.0.1','-p',str(port),'-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At']
 def admin_conn():
  result=conn.copy()
  if args.docker: result[result.index('-U')+1]='supabase_admin'
  return result
 try:
  (OUT/'server-version.log').write_text(run('psql',*conn,'-c','select version()'))
  runner=(ROOT/'supabase/tests/run-supabase-hardening-postgres.ps1').read_text()
  bootstrap=runner.split("Write-Utf8NoBom $bootstrap @'",1)[1].split("'@",1)[0]
  if args.writers or args.concurrency or args.storage_owners or args.storage_multipart or args.lock_order or args.admin_lock_order or args.storage_buckets:
   bootstrap=bootstrap.replace('create extension if not exists pgtap;', '')
  # Supabase normally provisions service_role table privileges via defaults.
  # Reproduce that contract in plain PG; each migration still revokes its ACLs.
  bootstrap += "\nalter default privileges in schema public grant all on tables to service_role;\n"
  # Modern PostgREST sends the JSON GUC; preserve the legacy GUC for old fixtures.
  bootstrap += """
do $$ begin create role authenticator noinherit; exception when duplicate_object then null; end $$;
-- The minimal fixture follows the Storage version used by the probe suite.
alter table storage.objects add column if not exists version text;
do $fixture$ begin
 if to_regprocedure('storage.foldername(text)') is null then
  execute $ddl$create function storage.foldername(text) returns text[] language sql immutable as $$
   select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]
  $$$ddl$;
 end if;
end $fixture$;
create or replace function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub')::uuid
$$;
"""
  (OUT/'bootstrap.sql').write_text(bootstrap)
  run('psql',*conn,'-c',f"alter database {database} set timezone='UTC'")
  if args.storage_schema:
   run('psql',*conn,'-f',pathlib.Path(args.storage_schema).resolve())
  run('psql',*conn,'-f',OUT/'bootstrap.sql')
  if args.docker:
   # The image's postgres role is NOSUPERUSER. Reuse the existing disposable
   # hardening harness helper for dblink workers; its EXECUTE ACL is postgres
   # only. This never changes a product role or deployed function.
   helper=runner.split("Write-Utf8NoBom $dblinkHelper @'",1)[1].split("'@",1)[0]
   (OUT/'dblink-helper.sql').write_text('create extension if not exists dblink with schema extensions;\n'+helper)
   run('psql',*admin_conn(),'-f',OUT/'dblink-helper.sql')
   conn+=['-v','dblink_unrestricted=1','-v','dblink_password=commercial-local-fixture']
  if args.storage_schema:
   run('psql',*conn,'-c',"create role supabase_storage_admin noinherit bypassrls; grant usage on schema storage to supabase_storage_admin; grant all on all tables in schema storage to supabase_storage_admin;")
  legacy_acl_query="""select c.relname||':'||coalesce((
    select string_agg(a::text,',' order by a::text) from unnest(c.relacl) a
   ),'<null>') from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in (
    'testing_center_reports','testing_center_evidence',
    'testing_center_technical_issues','testing_center_screenshot_evidence',
    'testing_center_evidence_batches','testing_center_report_payloads',
    'testing_center_report_submission_keys','testing_center_report_events')
   order by c.relname"""
  legacy_acl_before=None
  admin_owner_previous=None
  admin_report_root_applied=False
  owner_policy_previous=None
  owner_ack_previous=None
  retirement_stem='20261104120500_isa_1896_legacy_retirement'
  retirement_before=None
  owner_disposition_stem='20261104164800_isa_1936_owner_disposition_authority'
  owner_disposition_before=None
  owner_validation_before=None
  owner_disposition_snapshot="""select encode(convert_to(pg_get_functiondef(p.oid),'UTF8'),'hex')
    ||'|'||coalesce(p.proacl::text,'<null>') from pg_proc p
    where p.oid='public.testing_center_record_owner_disposition(text,text,text,text,text,text,text,uuid)'::regprocedure"""
  owner_validation_snapshot="""select jsonb_build_object(
    'validate',pg_get_functiondef('public.testing_center_validate_candidate(text,text,text,text,text,text)'::regprocedure),
    'validate_acl',(select coalesce(proacl::text,'<null>') from pg_proc
      where oid='public.testing_center_validate_candidate(text,text,text,text,text,text)'::regprocedure),
    'projection',pg_get_functiondef('public.testing_center_record_validation_projection(jsonb,text,text,text,text,uuid)'::regprocedure),
    'projection_acl',(select coalesce(proacl::text,'<null>') from pg_proc
      where oid='public.testing_center_record_validation_projection(jsonb,text,text,text,text,uuid)'::regprocedure))"""
  retirement_schema_before=None
  retired_tables=['testing_center_reports','testing_center_evidence','testing_center_triage_results',
    'testing_center_issue_occurrences','testing_center_posthog_consent_events',
    'testing_center_posthog_evidence','testing_center_report_events',
    'testing_center_report_payloads','testing_center_report_submission_keys',
    'testing_center_screenshot_evidence','testing_center_evidence_batches',
    'testing_center_evidence_outbox']
  def retirement_snapshot():
   snapshot=json.loads(run('psql',*conn,'-c',"""select jsonb_build_object(
     'clerk',pg_get_functiondef('public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure),
     'storage',pg_get_functiondef('private.storage_owner_accounts(jsonb)'::regprocedure),
     'v2_owner',pg_get_functiondef('private.testing_center_v2_owner(text)'::regprocedure),
     'clerk_acl',(select coalesce(proacl::text,'<null>') from pg_proc where oid='public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure),
     'storage_acl',(select coalesce(proacl::text,'<null>') from pg_proc where oid='private.storage_owner_accounts(jsonb)'::regprocedure),
     'v2_owner_acl',(select coalesce(proacl::text,'<null>') from pg_proc where oid='private.testing_center_v2_owner(text)'::regprocedure),
     'policy',(select to_jsonb(p) from pg_policies p where schemaname='public'
       and tablename='testing_center_technical_issues' and policyname='testing_center_issues_select_own'),
     'storage_policy',(select to_jsonb(p) from pg_policies p where schemaname='storage'
       and tablename='objects' and policyname='testing_center_evidence_insert_own_slot'),
     'fks',(select jsonb_agg(pg_get_constraintdef(c.oid) order by c.conname)
       from pg_constraint c where c.contype='f' and c.conname in
       ('testing_center_technical_issues_report_id_fkey',
        'testing_center_effect_outbox_primary_report_id_fkey',
        'testing_center_linear_projection_snapsho_primary_report_id_fkey')),
     'technical_constraints',(select jsonb_agg(jsonb_build_object(
       'name',c.conname,'definition',pg_get_constraintdef(c.oid)) order by c.conname)
       from pg_constraint c where c.conrelid='public.testing_center_technical_issues'::regclass
         and c.contype='c'),
     'kept_triggers',(select jsonb_agg(jsonb_build_object(
       'table',t.tgrelid::regclass::text,'name',t.tgname,
       'definition',pg_get_triggerdef(t.oid),'args',encode(t.tgargs,'escape'))
       order by t.tgrelid::regclass::text,t.tgname)
       from pg_trigger t join pg_class c on c.oid=t.tgrelid
       where not t.tgisinternal and c.relnamespace='public'::regnamespace
         and c.relname like 'testing_center_%' and c.relname not in
           ('testing_center_reports','testing_center_evidence','testing_center_triage_results',
            'testing_center_issue_occurrences','testing_center_posthog_consent_events',
            'testing_center_posthog_evidence','testing_center_report_events',
            'testing_center_report_payloads','testing_center_report_submission_keys',
            'testing_center_screenshot_evidence','testing_center_evidence_batches',
            'testing_center_evidence_outbox')),
     'orphan_functions',(select jsonb_agg(jsonb_build_object(
       'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
       'acl',coalesce(p.proacl::text,'<null>'),'comment',obj_description(p.oid,'pg_proc'))
       order by p.oid::regprocedure::text)
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname in ('public','private') and p.proname=any(array[
         'testing_center_report_evidence_for_account','testing_center_report_for_account',
         'testing_center_report_payload_for_account','testing_center_authorize_posthog_linear_link',
         'testing_center_expire_posthog_evidence','testing_center_load_codex_evidence',
         'testing_center_prepare_linear_projection','testing_center_queue_codex_dry_run'])),
     'rpcs',(select jsonb_agg(jsonb_build_object(
       'signature',p.oid::regprocedure::text,
       'definition',pg_get_functiondef(p.oid),
       'acl',coalesce(p.proacl::text,'<null>'),
       'comment',obj_description(p.oid,'pg_proc')) order by p.proname,p.oid::regprocedure::text)
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname=any(array[
         'testing_center_report_submit_admitted','testing_center_triage_report',
         'testing_center_prepare_screenshot_batch','testing_center_finalize_screenshot',
         'testing_center_can_insert_evidence_object','testing_center_submit_report',
         'testing_center_submit_report_with_evidence',
         'testing_center_submit_report_without_transport_size',
         'testing_center_set_posthog_consent','testing_center_record_posthog_evidence']))
   )""").strip())
   # The replay also runs with CRLF SQL. Compare all nonblank source bytes,
   # while ignoring only source line endings and B03's blank-line whitespace.
   for key in ('clerk','storage','v2_owner'):
    snapshot[key]=re.sub(r'(?m)^[ \t\r]+$', '', snapshot[key].replace('\r\n','\n'))
   if snapshot['rpcs'] is not None:
    for rpc in snapshot['rpcs']:
     rpc['definition']=rpc['definition'].replace('\r\n','\n')
   if snapshot['orphan_functions'] is not None:
    for rpc in snapshot['orphan_functions']:
     rpc['definition']=rpc['definition'].replace('\r\n','\n')
   if snapshot['kept_triggers'] is not None:
    for trigger in snapshot['kept_triggers']:
     for key in ('definition','args'):
      trigger[key]=re.sub(r'(?m)[ \t]+$', '',trigger[key].replace('\r\n','\n'))
    if not args.docker:
     # PG16 orders generated UNION branches differently from pinned PG17.
     # The PG17 CI checks all retained barriers exactly; local PG16 still
     # checks every v2 barrier and the behavioral insert/rollback probes.
     snapshot['kept_triggers']=[trigger for trigger in snapshot['kept_triggers']
       if trigger['name']!='a_account_write_barrier']
   return json.dumps(snapshot,sort_keys=True)
  def retirement_schema():
   tables=tuple(argument for table in retired_tables for argument in ('-t','public.'+table))
   # The pinned Supabase container is PG17; Ubuntu's pg_dump client is PG16.
   # Use the matching server image client for the exact before/after snapshot.
   if args.docker:
    ddl=docker('exec',container,'pg_dump','-h','127.0.0.1','-p','5432',
      '-U','postgres','-d',database,'--schema-only','--no-owner',*tables)
   else:
    ddl=run('pg_dump','-h','127.0.0.1','-p',str(port),'-U','postgres',
      '-d',database,'--schema-only','--no-owner',*tables)
   lines=[line for line in ddl.splitlines()
     if not line.startswith(('\\restrict ','\\unrestrict '))]
   if not args.docker:
    # PG16's pg_dump renders four historical UNION branches in a different
    # order than the PG17 production image. PG17 CI compares every byte;
    # locally omit only these four equivalent trigger statements.
    rendered=('testing_center_evidence_outbox','testing_center_posthog_evidence',
      'testing_center_screenshot_evidence','testing_center_triage_results')
    lines=[line for line in lines if not (line.startswith('CREATE TRIGGER a_account_write_barrier')
      and any(' ON public.'+table+' ' in line for table in rendered))]
   return '\n'.join(lines)
  channel_role_before=None
  channel_role_after=None
  erasure_previous=None
  acl_restatement_stem='20261104181200_isa_1896_acl_restatement'
  for m in sorted((ROOT/'supabase/migrations').glob('*.sql')):
   # Historical suites run against the pre-retirement schema. CI also replays
   # the complete chain with --legacy-retirement-only and tests the final state.
   if m.stem==retirement_stem and not (args.legacy_retirement_only or args.schema_snapshot or args.owner_disposition_only): continue
   if not legacy_writers_enabled and 'isa_1896_close_legacy_report_writers' in m.name: continue
   if m.stem==acl_restatement_stem and not legacy_writers_enabled: continue
   if not owner_enabled and 'isa_1896_owner_unification' in m.name: continue
   if not owner_enabled and 'isa_1928_channel_owner_authority' in m.name: continue
   # Same historical modes as the R6 authority prerequisite; full CI has none.
   if m.stem==ADMIN_OWNER_STEM and not admin_owner_enabled: continue
   if m.stem in (OWNER_POLICY_STEM,ACK_STEM,ERASURE_STEM,SYNC_STEM,LIMITS_STEM,SEND_STEM,AUDIT_STEM,CONFIRM_STEM,EXPLICIT_SYNC_STEM) and not legacy_writers_enabled: continue
   if m.stem=='20261104024000_isa_1910_admin_report_root' and not legacy_writers_enabled: continue
   if args.before_deleted_authorizer and 'revoke_deleted_authorizer' in m.name: continue
   if args.before_posthog_consent_clear and any(n in m.name for n in ('posthog_consent_clear','revoke_deleted_authorizer')): continue
   if args.before_testing_identity and 'testing_server_identity' in m.name: continue
   if args.before_pilot_identity and 'pilot_identity' in m.name: continue
   # RED controls omit the dependent adapters as well as their missing guards.
   legacy = args.baseline or args.before_write_barrier
   if legacy and 'isa_1711_account_id_write_barriers' in m.name: continue
   if (legacy or args.before_private_write_barriers or args.before_deleted_authorizer or args.before_posthog_consent_clear) and 'isa_1702_private_write_barriers' in m.name: continue
   if legacy and m.name.startswith(('2026101416','2026101509')) and 'isa_1608_' in m.name: continue
   if args.before_storage_multipart and 'managed_storage_abort' in m.name: continue
   if (args.before_admin_deleted_reads or args.before_admin_lock_order or args.before_lock_order) and 'admin_deleted_reads' in m.name: continue
   if args.before_storage_buckets and 'storage_buckets' in m.name: continue
   if args.before_admin_lock_order and 'admin_uuid_before_rows' in m.name: continue
   r5 = m.name.startswith('2026101415') and 'isa_1608_' in m.name
   if r5 and (args.baseline or args.before_write_barrier): continue
   if args.before_storage_multipart and 'storage_multipart' in m.name: continue
   if args.before_lock_order and 'uuid_before_rows' in m.name: continue
   if args.before_write_barrier and 'account_write_barrier' in m.name: continue
   if args.baseline and ('isa_1608_commercial' in m.name or 'account_write_barrier' in m.name): continue
   if args.before_b01 and 'commercial_b01' in m.name: continue
   cutover = 'commercial_b03' in m.name and args.upgrade
   if cutover:
    result=run('psql',*conn,'-f',ROOT/'supabase/tests'/('commercial_'+args.upgrade.replace('-', '_')+'_upgrade.before.sql'))
    (OUT/'upgrade-before.log').write_text(result)
   pilot_patch='pilot_cutover' in m.name and args.pilot_patch_drift
   if pilot_patch:
    signature,pattern={
     'owner':('private.storage_owner_accounts(jsonb)','  -- Deprecated owner'),
     'deletion':('public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)','    delete from public.testing_answers'),
     'objects':('public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)','where o.owner_id::text=account::text'),
     'uploads':('public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)','where u.owner_id=account::text'),
    }[args.pilot_patch_drift]
    # Whitespace/comment drift preserves the real function's behavior.
    replacement=pattern.replace('-- Deprecated','-- Historical') if args.pilot_patch_drift=='owner' else pattern.replace(' ', '  ')
    definition=run('psql',*conn,'-c',f"select pg_get_functiondef('{signature}'::regprocedure)").strip()
    assert pattern in definition
    run('psql',*conn,'-c',definition.replace(pattern,replacement))
    before=run('psql',*conn,'-c',"select pg_get_functiondef('private.storage_owner_accounts(jsonb)'::regprocedure),pg_get_functiondef('public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure)")
   # Exercise exactly the chosen on-disk newline format, including function bodies.
   migration_source=OUT/'migration-sources'/m.name
   migration_source.parent.mkdir(exist_ok=True)
   source=m.read_text(encoding='utf-8')
   migration_source.write_bytes(source.replace('\n','\r\n').encode('utf-8') if args.migration_newlines=='crlf' else source.encode('utf-8'))
   if args.docker and 'visual_roadmap_clickup' in m.name:
    run_roadmap_role_regression(run, conn, admin_conn(), migration_source, OUT)
   existing_roles={
    '20261013160000_testing_contribution_triage.sql':('vantare_triage',"select to_regprocedure('private.testing_system_valid(jsonb)') is null",2),
    '20261013225839_pilot_profile_private.sql':('pilot_profile_writer',"select to_regnamespace('pilot_private') is null",None),
    '20261015195425_web_purchase_erasure_pull.sql':('web_purchase_erasure',"select to_regclass('private.web_purchase_erasure_clock') is null",None),
   }
   if args.docker and m.name in existing_roles:
    run_existing_role_regression(run, conn, admin_conn(), migration_source, OUT, *existing_roles[m.name])
   if 'isa_1770_terminal_checkout_attempts' in m.name and not (args.admin_effects_only or args.admin_owner_only):
    run_migration_lock_regression(run, conn, migration_source, OUT, BIN, ENV)
   if legacy_writers_enabled and 'isa_1896_close_legacy_report_writers' in m.name:
    legacy_acl_before=run('psql',*conn,'-At','-c',legacy_acl_query)
   if m.stem==CONFIRM_STEM and not args.schema_snapshot:
    confirmation_previous=run('psql',*conn,'-c',CONFIRM_SNAPSHOT)
   if m.stem==AUDIT_STEM and not args.schema_snapshot:
    audit_previous=run('psql',*conn,'-c',AUDIT_SNAPSHOT)
    # Match the Supabase PG17 image, not Ubuntu's PG16 pg_dump client.
    audit_container_dump=(lambda: docker('exec',container,'pg_dump','-h','127.0.0.1','-p','5432',
     '-U','postgres','-d',database,'--schema-only')) if args.docker else None
    audit_schema_previous=audit_schema(run,conn,audit_container_dump)
    seed_audit_upgrade(run,conn)
   if m.stem==ADMIN_OWNER_STEM:
    admin_owner_previous=json.loads(run('psql',*conn,'-c',ADMIN_OWNER_SNAPSHOT))
   channel_stem='20261104084000_isa_1928_channel_owner_authority'
   channel_role_snapshot_query="""select string_agg(
     p.oid::regprocedure::text||'|'||encode(convert_to(pg_get_functiondef(p.oid),'UTF8'),'hex')||'|'||coalesce(p.proacl::text,'<null>'),
     E'\\n' order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in (
     'public.testing_center_current_role()'::regprocedure,
     'private.testing_report_submit_for_account(uuid,uuid,text,text,text,boolean)'::regprocedure,
     'private.testing_contribution_submit_for_account(uuid,uuid,text,text,text)'::regprocedure,
     'private.testing_contribution_submit_v2_for_account(uuid,uuid,text,text,text,jsonb,jsonb)'::regprocedure)"""
   if m.stem==channel_stem:
    channel_role_before=run('psql',*conn,'-At','-c',channel_role_snapshot_query).strip()
   if m.stem==owner_disposition_stem:
    owner_disposition_before=run('psql',*conn,'-At','-c',owner_disposition_snapshot).strip()
    if args.owner_disposition_only:
     owner_validation_before=json.loads(run('psql',*conn,'-At','-c',owner_validation_snapshot))
   archive_stem='20261104014000_isa_1896_legacy_archive'
   archive_fixture=(m.name==archive_stem+'.sql' and legacy_writers_enabled
                    and not (args.testing_identity or args.pilot_profile or args.b01))
   if archive_fixture:
    b03_before=run('psql',*conn,'-At','-c',"""select pg_get_functiondef(
      'public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure)""")
    run('psql',*conn,'-f',ROOT/'supabase/tests/testing_center_legacy_archive.before.sql')
    preflight=run('psql',*conn,'-f',ROOT/'supabase/tests/testing_center_legacy_archive.preflight.sql')
    (OUT/'testing_center_legacy_archive.preflight.log').write_text(preflight)
    if 'public.testing_center_reports|archivar vinculadas|7' not in preflight:
     raise RuntimeError('7b2 preflight did not count every legacy parent')
    run('psql',*conn,'-c',"""insert into public.testing_center_evidence_batches
      (batch_id,reporter_user_id,channel,idempotency_key,manifest_digest)
      values('18960000-0000-4000-8000-000000000701',
        '18960000-0000-4000-8000-0000000007b2','nightly',
        '7b2-storage-guard',repeat('7',64));
      insert into public.testing_center_screenshot_evidence
      (evidence_id,batch_id,report_id,position,object_path,media_type,
       byte_size,sha256,width,height)
      values('18960000-0000-4000-8000-000000000702',
        '18960000-0000-4000-8000-000000000701','report_'||repeat('7',64),
        1,'v1/'||repeat('7',32)||'/18960000-0000-4000-8000-000000000701/'||
        '18960000-0000-4000-8000-000000000702','image/jpeg',100,
        repeat('7',64),10,10);""")
    try: run('psql',*conn,'-f',migration_source)
    except Exception as error:
     if 'legacy_archive_storage_present' not in str(error): raise
    else: raise RuntimeError('7b2 archived Storage-linked rows')
    run('psql',*conn,'-c',"""delete from public.testing_center_screenshot_evidence
      where evidence_id='18960000-0000-4000-8000-000000000702';
      delete from public.testing_center_evidence_batches
      where batch_id='18960000-0000-4000-8000-000000000701';""")
    run('psql',*conn,'-c',"update public.testing_center_effect_outbox set state='pending' where effect_id='effect_'||repeat('9',64)")
    try: run('psql',*conn,'-f',migration_source)
    except Exception as error:
     if 'legacy_archive_pending_effect' not in str(error): raise
    else: raise RuntimeError('7b2 discarded a pending effect')
    run('psql',*conn,'-c',"update public.testing_center_effect_outbox set state='completed' where effect_id='effect_'||repeat('9',64)")
    run('psql',*conn,'-c',"update public.testing_center_agent_jobs set state='triage_queued' where technical_issue_id='legacy-7b2-issue'")
    try: run('psql',*conn,'-f',migration_source)
    except Exception as error:
     if 'legacy_archive_pending_effect' not in str(error): raise
    else: raise RuntimeError('7b2 discarded a queued agent job')
    run('psql',*conn,'-c',"update public.testing_center_agent_jobs set state='completed' where technical_issue_id='legacy-7b2-issue'")
    run('psql',*conn,'-c',"update public.testing_center_codex_runs set state='queued' where run_id='legacy-7b2-run'")
    try: run('psql',*conn,'-f',migration_source)
    except Exception as error:
     if 'legacy_archive_pending_effect' not in str(error): raise
    else: raise RuntimeError('7b2 discarded a queued Codex run')
    run('psql',*conn,'-c',"update public.testing_center_codex_runs set state='completed' where run_id='legacy-7b2-run'")
    run('psql',*conn,'-c',"update public.testing_center_linear_webhook_deliveries set outcome='pending' where delivery_id='18960000-0000-4000-8000-000000000713'")
    try: run('psql',*conn,'-f',migration_source)
    except Exception as error:
     if 'legacy_archive_pending_effect' not in str(error): raise
    else: raise RuntimeError('7b2 discarded a pending Linear delivery')
    run('psql',*conn,'-c',"update public.testing_center_linear_webhook_deliveries set outcome='applied' where delivery_id='18960000-0000-4000-8000-000000000713'")
    run('psql',*conn,'-c',"""do $tamper$
      declare definition text;
      begin
        definition:=pg_get_functiondef(
          'public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure);
        if position('expected_text=''Deleted''' in definition)=0 then
          raise exception 'legacy_redaction_fixture_missing';
        end if;
        execute replace(definition,'expected_text=''Deleted''',
          'expected_text=''Altered''');
      end $tamper$;""")
    try: run('psql',*conn,'-f',migration_source)
    except Exception as error:
     if 'legacy_archive_account_redaction_source_drift' not in str(error): raise
    else: raise RuntimeError('7b2 accepted changed legacy redaction')
    run('psql',*conn,'-c',"""do $restore$
      declare definition text;
      begin
        definition:=pg_get_functiondef(
          'public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure);
        execute replace(definition,'expected_text=''Altered''',
          'expected_text=''Deleted''');
      end $restore$;""")
   if m.stem=='20261104024000_isa_1910_admin_report_root':
    assert (OUT/'20261104014000_isa_1896_legacy_archive.sql.log').exists(), 'admin cutover must follow actual 7b2 in the clean replay'
    result=run('psql',*conn,'-f',ROOT/'supabase/tests/testing_legacy_admin_closed.test.sql')
    (OUT/'testing_legacy_admin_closed.pre-cutover.log').write_text(result,encoding='utf-8')
    assert 'not ok ' not in result and '# Looks like' not in result, result
   if m.stem==OWNER_POLICY_STEM:
    result=run('psql',*conn,'-f',ROOT/'supabase/tests/native_admin_characterization.test.sql')
    (OUT/'native_admin_characterization.before-owner-policy.log').write_text(result)
    assert 'not ok ' not in result and '# Looks like' not in result, result
    owner_policy_previous=json.loads(run('psql',*conn,'-c',OWNER_POLICY_SNAPSHOT))
   if m.stem==ACK_STEM:
    owner_ack_previous=json.loads(run('psql',*conn,'-c',OWNER_POLICY_SNAPSHOT))
   if m.stem==retirement_stem:
    retirement_before=retirement_snapshot()
    retirement_schema_before=retirement_schema()
    if args.legacy_retirement_only:
     probe=OUT/'retirement-unprivileged.sql'
     probe.write_text("set role authenticated;\n\\i '"+str(migration_source).replace("'","''")+"'\n",encoding='utf-8')
     denied=subprocess.run([str(BIN/'psql'),*map(str,conn),'-f',str(probe)],
       env=ENV,capture_output=True,text=True)
     if denied.returncode==0 or 'legacy_retirement_requires_bypassrls' not in denied.stderr:
      raise RuntimeError('retirement role guard did not fail closed: '+denied.stderr)
     for reference in (
       "perform pg_catalog.to_regclass('public.testing_center_reports');",
       "perform pg_catalog.to_regclass('PUBLIC.TESTING_CENTER_REPORTS');",
       'perform (select count(*) from pg_catalog.pg_class c, testing_center_reports r);',
       "perform public.testing_center_load_codex_evidence('fixture');",
     ):
      run('psql',*conn,'-c',"""create function public.testing_center_legacy_reference_probe()
        returns void language plpgsql as $$ begin """+reference+" end $$")
      dangling=subprocess.run([str(BIN/'psql'),*map(str,conn),'-f',str(migration_source)],
        env=ENV,capture_output=True,text=True)
      if dangling.returncode==0 or 'legacy_retirement_dangling_catalog_reference' not in dangling.stderr:
       raise RuntimeError('retirement catalog guard did not fail closed for '+reference+': '+dangling.stderr)
      if run('psql',*conn,'-c',"select to_regclass('public.testing_center_reports') is not null").strip()!='t':
       raise RuntimeError('failed catalog guard partially retired the schema')
      run('psql',*conn,'-c','drop function public.testing_center_legacy_reference_probe()')
     references=run('psql',*conn,'-c',"""select jsonb_build_object(
       'triggers',(select coalesce(jsonb_agg(jsonb_build_object(
         'table',t.tgrelid::regclass::text,'name',t.tgname,
         'definition',pg_get_triggerdef(t.oid),'args',encode(t.tgargs,'escape'),
         'has_v2',exists(select 1 from pg_trigger b where b.tgrelid=t.tgrelid
           and b.tgname='b_account_write_barrier_v2')) order by t.tgrelid::regclass::text),'[]'::jsonb)
         from pg_trigger t where not t.tgisinternal and t.tgname='a_account_write_barrier'
           and encode(t.tgargs,'escape') ~ '(public\\.|\\m(from|join|update|into|references|table)\\s+)testing_center_(reports|evidence|triage_results|issue_occurrences|posthog_consent_events|posthog_evidence|report_events|report_payloads|report_submission_keys|screenshot_evidence|evidence_batches|evidence_outbox)\\M'),
       'functions',(select coalesce(jsonb_agg(jsonb_build_object(
         'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
         'acl',coalesce(p.proacl::text,'<null>'),'comment',obj_description(p.oid,'pg_proc'))
         order by p.oid::regprocedure::text),'[]'::jsonb)
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname not in ('pg_catalog','information_schema') and p.prokind='f'
           and (pg_get_functiondef(p.oid) ~ '((public\\.|\\m(from|join|update|into|references|table)\\s+)testing_center_(reports|evidence|triage_results|issue_occurrences|posthog_consent_events|posthog_evidence|report_events|report_payloads|report_submission_keys|screenshot_evidence|evidence_batches|evidence_outbox)|private\\.testing_center_legacy_archive)\\M'
             or p.proname='testing_center_queue_codex_dry_run')))""")
     (OUT/'retirement-live-references.before.json').write_text(references,encoding='utf-8')
   if m.stem==ERASURE_STEM:
    erasure_previous=json.loads(run('psql',*conn,'-c',ERASURE_CONSTRAINTS))
   acl_restatement_query="""select jsonb_object_agg(n.nspname||'.'||c.relname,
     coalesce(c.relacl::text,'<null>') order by n.nspname,c.relname)
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where (n.nspname,c.relname) in (
       ('private','admin_effects'),('public','testing_center_technical_issues'),
       ('public','testing_center_effect_outbox'),
       ('public','testing_center_linear_projection_snapshots'))"""
   if m.stem==acl_restatement_stem:
    acl_restatement_before=run('psql',*conn,'-At','-c',acl_restatement_query).strip()
   try: result=run('psql',*conn,'-f',migration_source)
   except Exception as e:
    (OUT/(m.name+'.log')).write_text(str(e))
    if pilot_patch and 'P0001' in str(e) and 'pilot_cutover_'+args.pilot_patch_drift+'_changed' in str(e):
     after=run('psql',*conn,'-c',"select pg_get_functiondef('private.storage_owner_accounts(jsonb)'::regprocedure),pg_get_functiondef('public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure)")
     assert before==after, 'failed Pilot migration left a partial function patch'
     assert run('psql',*conn,'-c',"select count(*) from pg_trigger where tgrelid='pilot_private.operations'::regclass and tgname='a_account_write_barrier'").strip()=='0', 'failed Pilot migration left a partial trigger'
     print('Pilot patch drift '+args.pilot_patch_drift+': rejected atomically PASS',flush=True)
     raise SystemExit(0)
    if cutover and args.upgrade=='identity-conflict' and '23505' in str(e) and 'account_alias_conflict' in str(e):
     result=run('psql',*conn,'-f',ROOT/'supabase/tests/commercial_identity_conflict_upgrade.test.sql')
     (OUT/'upgrade-results.log').write_text(result)
     if 'not ok ' in result or '# Looks like' in result: raise RuntimeError(result)
     print('identity-conflict upgrade: rejected atomically PASS',flush=True)
     raise SystemExit(0)
    raise RuntimeError(m.name+': '+str(e))
   if pilot_patch: raise AssertionError('Pilot migration silently accepted '+args.pilot_patch_drift+' source drift')
   if cutover and args.upgrade=='identity-conflict':
    raise AssertionError('ambiguous historical issuer aliases were not rejected by B03')
   (OUT/(m.name+'.log')).write_text(result)
   if m.stem==CONFIRM_STEM and not args.schema_snapshot:
    run_confirmations(run,conn,OUT,confirmation_previous,args.migration_newlines,BIN,ENV)

   if m.stem==EXPLICIT_SYNC_STEM and not args.schema_snapshot:
    run_explicit_sync(run,conn,OUT,args.migration_newlines)
   if m.stem==AUDIT_STEM and not args.schema_snapshot:
    run_minimal_audit(run,conn,OUT,audit_previous,audit_schema_previous,args.migration_newlines,BIN,ENV,audit_container_dump)
   if m.stem==acl_restatement_stem:
    assert run('psql',*conn,'-At','-c',acl_restatement_query).strip()==acl_restatement_before, 'ACL restatement changed relacl'
    run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(acl_restatement_stem+'.down.sql'))
    assert run('psql',*conn,'-At','-c',acl_restatement_query).strip()==acl_restatement_before, 'ACL rollback changed relacl'
    run('psql',*conn,'-f',migration_source)
    print('ADR 0106 four-table exact relacl up/down/reapply PASS',flush=True)
   if m.stem=='20261104024000_isa_1910_admin_report_root':
    admin_report_root_applied=True
    assert run('psql',*conn,'-At','-c',"select has_function_privilege('service_role','public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)','EXECUTE')").strip()=='t'
    print('Clean chain: actual 7b2 then admin cutover; Clerk deletion remains executable PASS',flush=True)
   if m.stem==channel_stem:
    channel_role_after=run('psql',*conn,'-At','-c',channel_role_snapshot_query).strip()
    if channel_role_before==channel_role_after:
     raise RuntimeError('#1928 did not make the membership allowlist explicit')
    run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(channel_stem+'.down.sql'))
    if run('psql',*conn,'-At','-c',channel_role_snapshot_query).strip()!=channel_role_before:
     raise RuntimeError('#1928 rollback changed one of four functions or ACLs')
    run('psql',*conn,'-f',migration_source)
    if run('psql',*conn,'-At','-c',channel_role_snapshot_query).strip()!=channel_role_after:
     raise RuntimeError('#1928 reapply changed current_role definition or ACL')
    print('#1928 four channel functions and ACLs: exact rollback/reapply PASS',flush=True)
   if archive_fixture:
    def archive_check(name):
     result=run('psql',*conn,'-f',ROOT/'supabase/tests'/name)
     (OUT/(name+'.log')).write_text(result)
     if 'not ok ' in result or '# Looks like' in result:
      raise RuntimeError(name+' failed')
    archive_check('testing_center_legacy_archive.test.sql')
    b03_patched=run('psql',*conn,'-At','-c',"""select position(
      'VANTA131 legacy archive erasure begin' in pg_get_functiondef(
      'public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure))>0""").strip()
    if b03_patched!='t': raise RuntimeError('7b2 did not extend B03 account deletion')
    legacy_writer_text=run('psql',*conn,'-At','-c',"""select
      position('testing_center_reports' in pg_get_functiondef(
        'public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure))=0
      and position('update public.testing_center_report_payloads set action_text' in pg_get_functiondef(
        'public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure))=0""").strip()
    if legacy_writer_text!='t': raise RuntimeError('7b2 retained dead legacy payload writer')
    mapped_ids=run('psql',*conn,'-At','-c',"""select jsonb_object_agg(legacy_source_id,id order by legacy_source_id)
      from public.testing_contributions where legacy_source_id is not null""").strip()
    run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(archive_stem+'.down.sql'))
    b03_after=run('psql',*conn,'-At','-c',"""select pg_get_functiondef(
      'public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure)""")
    def without_blank_lines(definition):
     return '\n'.join(line for line in definition.split('\n') if line.strip())
    if without_blank_lines(b03_after)!=without_blank_lines(b03_before):
     raise RuntimeError('7b2 rollback changed B03 beyond blank lines')
    b03_restored=run('psql',*conn,'-At','-c',"""select position(
      'VANTA131 legacy archive erasure begin' in pg_get_functiondef(
      'public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure))=0""").strip()
    if b03_restored!='t': raise RuntimeError('7b2 rollback kept B03 archive erasure')
    legacy_redaction_restored=run('psql',*conn,'-At','-c',"""select position(
      'update public.testing_center_report_payloads set action_text' in pg_get_functiondef(
      'public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure))>0""").strip()
    if legacy_redaction_restored!='t': raise RuntimeError('7b2 rollback did not restore legacy redaction')
    archive_check('testing_center_legacy_archive.rollback.test.sql')
    run('psql',*conn,'-c',"""update private.testing_center_legacy_archive
      set row_sha256=repeat('0',64)
      where source_table='public.testing_center_reports'
        and source_id='report_'||repeat('7',64)""")
    try:
     run('psql',*conn,'-f',migration_source)
    except Exception as error:
     if 'legacy_archive_hash_or_count_mismatch' not in str(error): raise
    else:
     raise RuntimeError('corrupt archive did not abort 7b2 atomically')
    unchanged=run('psql',*conn,'-At','-c',"""select
      (select count(*) from public.testing_center_reports where
        reporter_user_id='18960000-0000-4000-8000-0000000007b2')::text||'|'||
      (select count(*) from public.testing_contributions where
        account_id='18960000-0000-4000-8000-0000000007b2')::text""").strip()
    assert unchanged=='7|0', 'failed 7b2 replay changed pilot rows'
    run('psql',*conn,'-c',"""update private.testing_center_legacy_archive
      set row_sha256=encode(public.digest(convert_to("row"::text,'UTF8'),'sha256'),'hex')
      where source_table='public.testing_center_reports'
        and source_id='report_'||repeat('7',64)""")
    run('psql',*conn,'-c',"""update private.testing_center_legacy_archive
      set "row"=pg_catalog.jsonb_set("row",'{reporter_id}',
        '"changed"'::jsonb)
      where source_table='public.testing_center_reports'
        and source_id='report_'||repeat('7',64)""")
    run('psql',*conn,'-c',"""update private.testing_center_legacy_archive
      set row_sha256=encode(public.digest(convert_to("row"::text,'UTF8'),'sha256'),'hex')
      where source_table='public.testing_center_reports'
        and source_id='report_'||repeat('7',64)""")
    try: run('psql',*conn,'-f',migration_source)
    except Exception as error:
     if 'legacy_archive_hash_or_count_mismatch' not in str(error): raise
    else: raise RuntimeError('changed archive JSON did not abort 7b2')
    run('psql',*conn,'-c',"""update private.testing_center_legacy_archive
      set "row"=pg_catalog.jsonb_set("row",'{reporter_id}',
        '"legacy-7b2"'::jsonb)
      where source_table='public.testing_center_reports'
        and source_id='report_'||repeat('7',64)""")
    run('psql',*conn,'-c',"""update private.testing_center_legacy_archive
      set row_sha256=encode(public.digest(convert_to("row"::text,'UTF8'),'sha256'),'hex')
      where source_table='public.testing_center_reports'
        and source_id='report_'||repeat('7',64)""")
    run('psql',*conn,'-f',migration_source)
    archive_check('testing_center_legacy_archive.test.sql')
    replay_ids=run('psql',*conn,'-At','-c',"""select jsonb_object_agg(legacy_source_id,id order by legacy_source_id)
      from public.testing_contributions where legacy_source_id is not null""").strip()
    if replay_ids!=mapped_ids: raise RuntimeError('legacy report IDs changed on replay')
    run('psql',*conn,'-c',"""create table private.vanta131_archive_restore_probe as
      select * from private.testing_center_legacy_archive;""")
    run('psql',*conn,'-c',"insert into public.profiles(id) values('18960000-0000-4000-8000-0000000007b3') on conflict (id) do nothing")
    run('psql',*conn,'-c',"""insert into private.testing_center_legacy_archive
      (source_table,source_id,"row",row_sha256)
      select source_table,'report_'||repeat('b',64),changed,
        encode(public.digest(convert_to(changed::text,'UTF8'),'sha256'),'hex')
      from private.testing_center_legacy_archive source
      cross join lateral (select jsonb_set(jsonb_set(source."row",
        '{report_id}',to_jsonb('report_'||repeat('b',64))),
        '{reporter_user_id}',to_jsonb('18960000-0000-4000-8000-0000000007b3'::text))
        as changed) other_account
      where source_table='public.testing_center_reports'
        and source_id='report_'||repeat('7',64);""")
    run('psql',*conn,'-c',"""insert into private.testing_center_legacy_archive
      (source_table,source_id,"row",row_sha256)
      select source_table,'report_'||repeat('b',64),changed,
        encode(public.digest(convert_to(changed::text,'UTF8'),'sha256'),'hex')
      from private.testing_center_legacy_archive source
      cross join lateral (select jsonb_set(source."row",'{report_id}',
        to_jsonb('report_'||repeat('b',64))) as changed) other_account
      where source_table='public.testing_center_issue_occurrences'
        and source_id='report_'||repeat('7',64);""")
    deletion=run('psql',*conn,'-At','-c',"""select public.apply_clerk_user_event(
      'vanta131-archive-delete',repeat('7',64),
      'https://vanta131-archive.clerk.invalid','user_legacyarchive7b2',
      'user.deleted',now(),null)""").strip()
    if deletion!='applied': raise RuntimeError('archive account deletion not applied: '+deletion)
    erased=run('psql',*conn,'-At','-c',"""select
      (select count(*) from private.testing_center_legacy_archive
        where source_id<>'report_'||repeat('b',64))::text||'|'||
      (select count(*) from private.testing_center_legacy_archive
        where source_id='report_'||repeat('b',64))::text||'|'||
      (select count(*) from public.testing_contributions
        where account_id='18960000-0000-4000-8000-0000000007b2')::text""").strip()
    if erased!='0|2|0': raise RuntimeError('account erasure crossed owners or retained data: '+erased)
    run('psql',*conn,'-c',"""insert into private.testing_center_legacy_archive
      (source_table,source_id,"row",row_sha256)
      select source_table,'effect_'||repeat(suffix,64),changed,
        encode(public.digest(convert_to(changed::text,'UTF8'),'sha256'),'hex')
      from private.vanta131_archive_restore_probe source
      cross join (values ('8','b'),('9','c')) as pair(original,suffix)
      cross join lateral (select source."row"||jsonb_build_object(
        'effect_id','effect_'||repeat(suffix,64),
        'effect_key',(source."row"->>'effect_key')||'_b',
        'primary_report_id','report_'||repeat('b',64)) as changed) cloned
      where source_table='public.testing_center_effect_outbox'
        and source_id='effect_'||repeat(original,64);
      insert into private.testing_center_legacy_archive
      (source_table,source_id,"row",row_sha256)
      select source_table,'effect_'||repeat('b',64),changed,
        encode(public.digest(convert_to(changed::text,'UTF8'),'sha256'),'hex')
      from private.vanta131_archive_restore_probe source
      cross join lateral (select source."row"||jsonb_build_object(
        'legacy_effect_id','effect_'||repeat('b',64),
        'superseded_by_effect_id','effect_'||repeat('c',64)) as changed) cloned
      where source_table='public.testing_center_effect_supersessions';""")
    cross_owner_down=subprocess.run([str(BIN/'psql'),*map(str,conn),'-f',
      str(ROOT/'supabase/rollbacks'/(archive_stem+'.down.sql'))],
      env=ENV,capture_output=True,text=True)
    if cross_owner_down.returncode or 'missing-parent rows=4' not in cross_owner_down.stderr:
     raise RuntimeError('cross-owner rollback did not skip missing issue: '+cross_owner_down.stderr)
    cross_owner_restored=run('psql',*conn,'-At','-c',"""select
      (select count(*) from public.testing_center_reports where
        report_id='report_'||repeat('b',64))::text||'|'||
      (select count(*) from public.testing_center_issue_occurrences where
        report_id='report_'||repeat('b',64))::text||'|'||
      (select count(*) from public.testing_center_effect_outbox where
        effect_id in ('effect_'||repeat('b',64),'effect_'||repeat('c',64)))::text||'|'||
      (select count(*) from public.testing_center_effect_supersessions where
        legacy_effect_id='effect_'||repeat('b',64))::text""").strip()
    if cross_owner_restored!='1|0|0|0':
     raise RuntimeError('cross-owner rollback lost report or restored dangling issue')
    run('psql',*conn,'-c',"""delete from public.testing_center_reports
      where report_id='report_'||repeat('b',64);
      delete from private.testing_center_legacy_archive
      where source_id in ('report_'||repeat('b',64),
        'effect_'||repeat('b',64),'effect_'||repeat('c',64));""")
    run('psql',*conn,'-f',migration_source)
    run('psql',*conn,'-c',"""insert into private.testing_center_legacy_archive
      select * from private.vanta131_archive_restore_probe;
      drop table private.vanta131_archive_restore_probe;""")
    skipped=subprocess.run([str(BIN/'psql'),*map(str,conn),'-f',
      str(ROOT/'supabase/rollbacks'/(archive_stem+'.down.sql'))],
      env=ENV,capture_output=True,text=True)
    if skipped.returncode or 'skipped deleted-owner rows=26' not in skipped.stderr:
     raise RuntimeError('rollback did not count deleted-owner archive rows: '+skipped.stderr)
    if run('psql',*conn,'-At','-c',"select count(*) from public.testing_center_reports").strip()!='0':
     raise RuntimeError('rollback resurrected deleted-account reports')
    run('psql',*conn,'-f',migration_source)
    # The rest of the commercial suite assumes an empty report catalogue.
    # Remove only this disposable characterization fixture after verifying it.
    run('psql',*conn,'-c',"""delete from public.testing_report_followup f
      using public.testing_contributions c
      where f.contribution_id=c.id and c.legacy_source_id is not null;
      delete from public.testing_contributions where legacy_source_id is not null;
      delete from private.testing_center_legacy_archive;""")
    run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(archive_stem+'.down.sql'))
    run('psql',*conn,'-f',migration_source)
    empty=run('psql',*conn,'-At','-c',"""select
      (select count(*) from public.testing_center_reports)::text||'|'||
      (select count(*) from private.testing_center_legacy_archive)::text||'|'||
      (select count(*) from public.testing_contributions
        where legacy_source_id is not null)::text""").strip()
    if empty!='0|0|0': raise RuntimeError('empty 7b2 migration changed rows: '+empty)
    run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(archive_stem+'.down.sql'))
    run('psql',*conn,'-f',ROOT/'supabase/tests/testing_center_legacy_archive.states.before.sql')
    state_move=subprocess.run([str(BIN/'psql'),*map(str,conn),'-f',
      str(migration_source)],env=ENV,capture_output=True,text=True)
    if state_move.returncode or 'predeleted_drained=2' not in state_move.stderr:
     raise RuntimeError('7b2 did not count and drain predeleted rows: '+state_move.stderr)
    result=run('psql',*conn,'-f',ROOT/'supabase/tests/testing_center_legacy_archive.states.test.sql')
    (OUT/'testing_center_legacy_archive.states.test.sql.log').write_text(result)
    if 'not ok ' in result or '# Looks like' in result:
     raise RuntimeError('legacy archive state mapping failed: '+result)
    skipped_states=subprocess.run([str(BIN/'psql'),*map(str,conn),'-f',
      str(ROOT/'supabase/rollbacks'/(archive_stem+'.down.sql'))],
      env=ENV,capture_output=True,text=True)
    if skipped_states.returncode or 'skipped deleted-owner rows=0, missing-profile rows=1' not in skipped_states.stderr:
     raise RuntimeError('state rollback did not skip ineligible owners: '+skipped_states.stderr)
    if run('psql',*conn,'-At','-c',"select count(*) from public.testing_center_reports").strip()!='6':
     raise RuntimeError('state rollback restored a deleted or missing owner')
    run('psql',*conn,'-f',migration_source)
    run('psql',*conn,'-c',"""delete from public.testing_contributions
      where legacy_source_id is not null;
      delete from private.testing_center_legacy_archive;""")
  def owner_disposition_down():
   down=ROOT/'supabase/rollbacks'/(owner_disposition_stem+'.down.sql')
   down_source=OUT/'migration-sources'/down.name
   down_text=down.read_text(encoding='utf-8')
   down_source.write_bytes(down_text.replace('\n','\r\n').encode('utf-8')
    if args.migration_newlines=='crlf' else down_text.encode('utf-8'))
   run('psql',*conn,'-f',down_source)
  if args.owner_disposition_only:
   result=run('psql',*conn,'-f',ROOT/'supabase/tests/testing_owner_disposition_authority.test.sql')
   if re.search(r'^not ok ',result,re.M):
    raise RuntimeError('owner disposition characterization failed:\n'+result)
   validation=run('psql',*conn,'-f',ROOT/'supabase/tests/testing_owner_validation_authority.test.sql')
   if re.search(r'^not ok ',validation,re.M):
    raise RuntimeError('owner validation characterization failed:\n'+validation)
   if owner_disposition_before is not None:
    owner_disposition_down()
    restored=run('psql',*conn,'-At','-c',owner_disposition_snapshot).strip()
    if restored!=owner_disposition_before:
     raise RuntimeError('owner disposition rollback changed function or ACL')
    restored_validation=json.loads(run('psql',*conn,'-At','-c',owner_validation_snapshot))
    expected_validation=dict(owner_validation_before)
    expected_validation['validate']=expected_validation['validate'].replace(
     'v_user_id uuid := auth.uid();','v_user_id uuid := private.current_account();')
    if restored_validation!=expected_validation:
     raise RuntimeError('owner validation rollback changed body beyond identity or ACL')
    run('psql',*conn,'-f',ROOT/'supabase/migrations'/(owner_disposition_stem+'.sql'))
    replay=run('psql',*conn,'-f',ROOT/'supabase/tests/testing_owner_disposition_authority.test.sql')
    if re.search(r'^not ok ',replay,re.M):
     raise RuntimeError('owner disposition reapply failed:\n'+replay)
    replay=run('psql',*conn,'-f',ROOT/'supabase/tests/testing_owner_validation_authority.test.sql')
    if re.search(r'^not ok ',replay,re.M):
     raise RuntimeError('owner validation reapply failed:\n'+replay)
   print('Operational owner disposition boundary PASS',flush=True)
   raise SystemExit(0)
  if args.schema_snapshot:
   # The runner owns a fresh loopback database; no DSN or hosted endpoint is accepted.
   if run('psql',*conn,'-c',"select to_regclass('public.testing_center_reports') is null and to_regclass('private.testing_center_legacy_archive') is null").strip()!='t':
    raise RuntimeError('schema snapshot requires the final legacy retirement migration')
   dump=docker('exec',container,'pg_dump','-h','127.0.0.1','-p','5432',
    '-U','postgres','-d',database,*SNAPSHOT_DUMP_OPTIONS)
   image_id=docker('inspect','--format','{{.Image}}',container).strip()
   image_digests=json.loads(docker('image','inspect',image_id,'--format','{{json .RepoDigests}}'))
   verify_snapshot_source(dump,image_digests or [])
   catalog={}
   relations={
    'storage.buckets': "select id,name,public,file_size_limit,allowed_mime_types from storage.buckets",
    'cron.job': "select jobname,schedule,active,md5(command) as command_md5 from cron.job",
    'private.admin_audit_policy': "select singleton,closed_retention_days from private.admin_audit_policy",
    'private.report_promotion_policy': "select singleton,reward_valid_months from private.report_promotion_policy",
    'private.billing_compensation_policy': "select environment,enabled,amount_basis from private.billing_compensation_policy",
    'private.report_promotion_catalog': "select environment,product_id,plan,normal_cents,launch_cents from private.report_promotion_catalog",
   }
   for relation,query in relations.items():
    if run('psql',*conn,'-c',f"select to_regclass('{relation}') is not null").strip()!='t':
     catalog[relation]=[]
     continue
    payload=run('psql',*conn,'-c',f"select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from ({query}) t").strip()
    catalog[relation]=json.loads(payload)
   groups=compose(dump,catalog)
   generated=OUT/'schema'
   write_or_check(generated,groups)
   if args.schema_snapshot=='check':
    drift=write_or_check(ROOT/'supabase/schema',groups,check=True)
    if drift: raise RuntimeError('derived schema drift: '+', '.join(drift))
   print('Derived domain schema '+('matches' if args.schema_snapshot=='check' else 'written')+
    ': '+', '.join(sorted(groups)),flush=True)
   raise SystemExit(0)
  # Historical oracles unwind the dependent ACK before the owner policy.
  def owner_policy_down():
   if owner_ack_previous is not None:
    run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(ACK_STEM+'.down.sql'))
   run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(OWNER_POLICY_STEM+'.down.sql'))
  def owner_policy_up():
   run('psql',*conn,'-f',ROOT/'supabase/migrations'/(OWNER_POLICY_STEM+'.sql'))
   if owner_ack_previous is not None:
    run('psql',*conn,'-f',ROOT/'supabase/migrations'/(ACK_STEM+'.sql'))
  if args.admin_erasure_only:
   assert args.admin_deno_bin, 'erasure gate requires --admin-deno-bin'
   run_erasure_sql(run,conn,OUT,BIN,ENV,erasure_previous)
   run_sync_sql(run,conn,OUT,BIN,ENV,args.migration_newlines)
   run_send_sql(run,conn,OUT,BIN,ENV)
   run_erasure_e2e(args.admin_deno_bin,conn,OUT,BIN,ENV)
   run_send_retained_guard(run,conn,OUT,BIN,ENV)
   run_sync_retained_guard(run,conn,OUT,BIN,ENV)
   run_erasure_retained_guard(run,conn,OUT,BIN,ENV)
   raise SystemExit(0)
  if args.legacy_retirement_only:
   assert retirement_before is not None and retirement_schema_before is not None
   closed=run('psql',*conn,'-c',"""select
     to_regclass('public.testing_center_reports') is null,
     to_regclass('private.testing_center_legacy_archive') is null,
     to_regclass('public.testing_center_technical_issues') is not null,
     to_regclass('public.testing_center_agent_jobs') is not null,
     position('testing_center_reports' in pg_get_functiondef(
       'public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure))=0,
     position('testing_center_screenshot_evidence' in pg_get_functiondef(
       'private.storage_owner_accounts(jsonb)'::regprocedure))=0""").strip()
   if closed!='t|t|t|t|t|t': raise RuntimeError('final 7b schema or function closure failed: '+closed)
   if json.loads(retirement_snapshot())['rpcs'] is not None:
    raise RuntimeError('final 7b retained an obsolete report RPC')
   result=run('psql',*conn,'-f',ROOT/'supabase/tests/testing_center_legacy_retirement.test.sql')
   (OUT/'testing_center_legacy_retirement.test.sql.log').write_text(result)
   if 'not ok ' in result or '1..29' not in result: raise RuntimeError(result)
   actor_result=run('psql',*conn,'-f',ROOT/'supabase/tests/testing_center_legacy_retirement_actor.test.sql')
   (OUT/'testing_center_legacy_retirement_actor.test.sql.log').write_text(actor_result)
   if 'not ok ' in actor_result or '1..6' not in actor_result: raise RuntimeError(actor_result)
   if owner_disposition_before is not None:
    owner_disposition_down()
   run('psql',*conn,'-c',"""insert into private.clerk_issuers(issuer,authorized_parties,enabled)
     values('https://retirement.invalid',array['https://retirement.invalid'],true)
     on conflict(issuer) do nothing;
     insert into public.profiles(id) values('18960000-0000-4000-8000-000000000081');
     insert into public.account_identities(issuer,subject,account_id)
     values('https://retirement.invalid','user_18960000000040008000000000000081',
       '18960000-0000-4000-8000-000000000081');
     insert into public.testing_contributions(id,account_id,channel,title,body)
     values('18960000-0000-4000-8000-000000000083',
       '18960000-0000-4000-8000-000000000081','testers','Rollback fixture','Rollback fixture');
     insert into public.testing_center_technical_issues(
       technical_issue_id,contribution_id,state,flow_state,origin)
     values('issue_v2_'||repeat('8',64),'18960000-0000-4000-8000-000000000083',
       'open','queued','orchestrator');
     select public.apply_clerk_user_event('retirement-rollback-delete',repeat('8',64),
       'https://retirement.invalid','user_18960000000040008000000000000081',
       'user.deleted',now(),null);""")
   orphan_down=subprocess.run([str(BIN/'psql'),*map(str,conn),'-f',
     str(ROOT/'supabase/rollbacks'/(retirement_stem+'.down.sql'))],
     env=ENV,capture_output=True,text=True)
   if orphan_down.returncode==0 or 'legacy_retirement_rollback_orphaned_v2_issue' not in orphan_down.stderr:
    raise RuntimeError('rollback accepted a retained orphan issue: '+orphan_down.stderr)
   if run('psql',*conn,'-c',"select to_regclass('private.testing_center_legacy_archive') is null").strip()!='t':
    raise RuntimeError('orphan rollback guard changed the schema before aborting')
   run('psql',*conn,'-c',"delete from public.testing_center_technical_issues where technical_issue_id='issue_v2_'||repeat('8',64)")
   run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(retirement_stem+'.down.sql'))
   retirement_after=retirement_snapshot()
   retirement_schema_after=retirement_schema()
   (OUT/'retirement-before.json').write_text(retirement_before)
   (OUT/'retirement-after.json').write_text(retirement_after)
   (OUT/'retirement-before.sql').write_text(retirement_schema_before)
   (OUT/'retirement-after.sql').write_text(retirement_schema_after)
   if retirement_after!=retirement_before or retirement_schema_after!=retirement_schema_before:
    earlier=json.loads(retirement_before); later=json.loads(retirement_after)
    changed=[key for key in earlier if earlier[key]!=later[key]]
    old_lines=retirement_schema_before.splitlines()
    new_lines=retirement_schema_after.splitlines()
    first=next((i for i in range(max(len(old_lines),len(new_lines)))
      if old_lines[i:i+1]!=new_lines[i:i+1]),None)
    headers=[line for line in old_lines[:first or 0] if line.startswith('-- Name: ')]
    raise RuntimeError('final 7b rollback drift: catalog '+','.join(changed)+
      ', schema line '+str(first)+', object '+(headers[-1] if headers else '<header>'))
   if run('psql',*conn,'-c',"""select bool_or(has_table_privilege(role_name,
     'private.testing_center_legacy_archive','SELECT,INSERT,UPDATE,DELETE'))
     from (values('anon'),('authenticated'),('service_role')) roles(role_name)""").strip()!='f':
    raise RuntimeError('final 7b rollback exposed the private archive')
   run('psql',*conn,'-c',"""insert into private.testing_center_legacy_archive
     (source_table,source_id,\"row\",row_sha256) values
     ('public.testing_center_reports','archive-guard','{}',repeat('a',64))""")
   blocked=subprocess.run([str(BIN/'psql'),*map(str,conn),'-f',
     str(ROOT/'supabase/migrations'/(retirement_stem+'.sql'))],
     env=ENV,capture_output=True,text=True)
   if blocked.returncode==0 or 'legacy_retirement_archive_not_empty' not in blocked.stderr:
    raise RuntimeError('final 7b failed to reject a populated archive: '+blocked.stderr)
   if run('psql',*conn,'-c',"select to_regclass('public.testing_center_reports') is not null").strip()!='t':
    raise RuntimeError('failed final 7b migration changed the schema')
   run('psql',*conn,'-c',"delete from private.testing_center_legacy_archive where source_id='archive-guard'")
   run('psql',*conn,'-f',ROOT/'supabase/migrations'/(retirement_stem+'.sql'))
   if run('psql',*conn,'-c',"select to_regclass('public.testing_center_reports') is null").strip()!='t':
    raise RuntimeError('final 7b reapply failed')
   run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(retirement_stem+'.down.sql'))
   run('psql',*conn,'-c','drop policy testing_center_evidence_insert_own_slot on storage.objects')
   run('psql',*conn,'-f',ROOT/'supabase/migrations'/(retirement_stem+'.sql'))
   if run('psql',*conn,'-c',"select to_regclass('public.testing_center_reports') is null").strip()!='t':
    raise RuntimeError('final 7b failed with an already absent Storage policy')
   if owner_disposition_before is not None:
    run('psql',*conn,'-f',OUT/'migration-sources'/(owner_disposition_stem+'.sql'))
   print('Final 7b closure, absent Storage policy, empty-archive guard, exact rollback and reapply PASS',flush=True)
   raise SystemExit(0)
  # All four product principals must retain the same safe attributes after
  # the full managed replay, including the later CREATE ROLE statements.
  if args.legacy_retirement_inventory:
   retired_tables=[
    'testing_center_reports','testing_center_evidence',
    'testing_center_triage_results','testing_center_issue_occurrences',
    'testing_center_posthog_consent_events','testing_center_posthog_evidence',
    'testing_center_report_events','testing_center_report_payloads',
    'testing_center_report_submission_keys','testing_center_screenshot_evidence',
    'testing_center_evidence_batches','testing_center_evidence_outbox']
   schema=run('pg_dump','-h','127.0.0.1','-p',str(port),'-U','postgres',
     '-d',database,'--schema-only','--no-owner',
     *(argument for table in retired_tables for argument in ('-t','public.'+table)))
   (OUT/'legacy-retirement-tables.schema.sql').write_text(schema)
   relations=run('psql',*conn,'-c',"""with recursive walk(relid,depth,path) as (
       select 'public.testing_center_reports'::regclass::oid,0,
         array['public.testing_center_reports'::regclass::oid]::oid[]
       union all
       select fk.conrelid,walk.depth+1,walk.path||fk.conrelid
       from walk join pg_constraint fk on fk.contype='f' and fk.confrelid=walk.relid
       where not fk.conrelid=any(walk.path)
     ) select min(depth)::text||'|'||relid::regclass::text
       from walk group by relid order by 1""")
   (OUT/'legacy-retirement-relations.log').write_text(relations)
   inventory=run('psql',*conn,'-c',"""select p.oid::regprocedure::text
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname in ('public','private') and p.prokind='f'
       and pg_get_functiondef(p.oid) ~
         'testing_center_(reports|evidence|technical_issues|screenshot_evidence|evidence_batches|report_payloads|report_submission_keys|report_events|legacy_archive)'
     order by 1""")
   (OUT/'legacy-retirement-functions.log').write_text(inventory)
   external_dependencies=run('psql',*conn,'-c',"""select conrelid::regclass::text||'|'||conname||'|'||pg_get_constraintdef(c.oid)
     from pg_constraint c where c.contype='f'
       and c.confrelid=any(array[
         'public.testing_center_reports'::regclass,
         'public.testing_center_evidence'::regclass,
         'public.testing_center_triage_results'::regclass,
         'public.testing_center_issue_occurrences'::regclass,
         'public.testing_center_posthog_consent_events'::regclass,
         'public.testing_center_posthog_evidence'::regclass,
         'public.testing_center_report_events'::regclass,
         'public.testing_center_report_payloads'::regclass,
         'public.testing_center_report_submission_keys'::regclass,
         'public.testing_center_screenshot_evidence'::regclass,
         'public.testing_center_evidence_batches'::regclass,
         'public.testing_center_evidence_outbox'::regclass])
       and c.conrelid<>all(array[
         'public.testing_center_reports'::regclass,
         'public.testing_center_evidence'::regclass,
         'public.testing_center_triage_results'::regclass,
         'public.testing_center_issue_occurrences'::regclass,
         'public.testing_center_posthog_consent_events'::regclass,
         'public.testing_center_posthog_evidence'::regclass,
         'public.testing_center_report_events'::regclass,
         'public.testing_center_report_payloads'::regclass,
         'public.testing_center_report_submission_keys'::regclass,
         'public.testing_center_screenshot_evidence'::regclass,
         'public.testing_center_evidence_batches'::regclass,
         'public.testing_center_evidence_outbox'::regclass])
     order by 1""")
   (OUT/'legacy-retirement-external-fks.log').write_text(external_dependencies)
   for label,signature in [
    ('clerk-erasure','public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'),
    ('storage-owner','private.storage_owner_accounts(jsonb)')]:
    definition=run('psql',*conn,'-c',f"select pg_get_functiondef('{signature}'::regprocedure)")
    (OUT/f'legacy-retirement-{label}.sql').write_text(definition)
   old_rpcs=run('psql',*conn,'-c',"""select jsonb_agg(jsonb_build_object(
     'signature',p.oid::regprocedure::text,
     'definition',pg_get_functiondef(p.oid),
     'acl',coalesce(p.proacl::text,'<null>'),
     'comment',obj_description(p.oid,'pg_proc')) order by p.oid)::text
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=any(array[
       'testing_center_report_submit_admitted','testing_center_triage_report',
       'testing_center_prepare_screenshot_batch','testing_center_finalize_screenshot',
       'testing_center_can_insert_evidence_object','testing_center_submit_report',
       'testing_center_submit_report_with_evidence',
       'testing_center_submit_report_without_transport_size',
       'testing_center_set_posthog_consent','testing_center_record_posthog_evidence'])""")
   (OUT/'legacy-retirement-old-rpcs.json').write_text(old_rpcs)
   print(relations,flush=True)
   print(inventory,flush=True)
   print(external_dependencies,flush=True)
   raise SystemExit(0)
  role_contract=run('psql',*conn,'-c',"""
   select count(*)=4 and bool_and(not (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)
    and not rolinherit and rolcanlogin=(rolname='vantare_roadmap_publisher')
    and (rolname not in ('vantare_roadmap_publisher','vantare_triage') or rolconnlimit=2))
   from pg_roles where rolname in ('vantare_roadmap_publisher','vantare_triage','pilot_profile_writer','web_purchase_erasure')
  """).strip()
  assert role_contract=='t', 'managed product role attributes changed'
  (OUT/'managed-role-contract.log').write_text('Four product roles: safe attributes PASS\n')
  if admin_owner_previous is not None:
   run_admin_owner_precheck(run,conn,OUT,BIN,ENV)
  if not (args.baseline or args.before_write_barrier or args.before_testing_identity or args.admin_effects_only or args.admin_owner_only):
   admission='20261103093000_isa_1896_report_admission'
   run('psql',*conn,'-c',"""insert into private.testing_report_attempts
    (scope,subject,week_start,day_start,attempts) values
    ('ip',repeat('f',64),date_trunc('week',now() at time zone 'UTC')::date,(now() at time zone 'UTC')::date,60),
    ('account','18960000-0000-4000-8000-000000000092',date_trunc('week',now() at time zone 'UTC')::date,(now() at time zone 'UTC')::date,5);
    insert into private.testing_report_admitted_keys(account_id,report_key,body_digest)
    values('18960000-0000-4000-8000-000000000092','rollback-fixture',repeat('a',64));""")
   run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(admission+'.down.sql'))
   restored=run('psql',*conn,'-c',"""select
    (select attempts from private.testing_report_attempts where scope='ip' and subject=repeat('f',64))=21,
    (select attempts from private.testing_report_attempts where scope='account' and subject='18960000-0000-4000-8000-000000000092')=5,
    to_regclass('private.testing_report_admitted_keys') is null;""").strip()
   if restored!='t|t|t': raise RuntimeError('step 2 rollback lost quota data or retained retry keys')
   run('psql',*conn,'-f',ROOT/'supabase/migrations'/(admission+'.sql'))
   run('psql',*conn,'-c',"delete from private.testing_report_attempts where subject=repeat('f',64) or subject='18960000-0000-4000-8000-000000000092';")
  if owner_enabled and not args.admin_effects_only:
   owner_stem='20261103235000_isa_1896_owner_unification'
   admin_owner_current=None
   if owner_disposition_before is not None:
    owner_disposition_down()
   # Channel writers depend on private.is_owner; unwind them before step 8.
   run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(channel_stem+'.down.sql'))
   channel_predecessor=run('psql',*conn,'-At','-c',channel_role_snapshot_query).strip()
   if channel_predecessor!=channel_role_before:
    expected=dict(line.split('|',1) for line in channel_role_before.splitlines())
    actual=dict(line.split('|',1) for line in channel_predecessor.splitlines())
    raise RuntimeError('#1928 did not restore its predecessor before step 8 rollback: '+
                       ', '.join(name for name in expected if expected[name]!=actual.get(name)))
   if owner_policy_previous is not None:
    owner_policy_down()
   if admin_owner_previous is not None:
    # Respect the deployed dependency order: admin down, R6 down/up, admin up.
    admin_owner_current=json.loads(run('psql',*conn,'-c',ADMIN_OWNER_SNAPSHOT))
    run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(ADMIN_OWNER_STEM+'.down.sql'))
   run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(owner_stem+'.down.sql'))
   role_snapshot=run('psql',*conn,'-At','-c',"select encode(convert_to(pg_get_functiondef(p.oid),'UTF8'),'hex')||'|'||coalesce(p.proacl::text,'<null>') from pg_proc p where p.oid='public.testing_center_current_role()'::regprocedure").strip()
   result=run('psql',*conn,'-f',ROOT/'supabase/tests/testing_owner_unification_rollback.test.sql')
   (OUT/'testing_owner_unification_rollback.test.sql.log').write_text(result)
   if 'not ok ' in result or '1..8' not in result:
    raise RuntimeError('step 8 owner rollback failed')
  if not args.baseline and not args.before_testing_identity and not (args.admin_effects_only or args.admin_owner_only):
   for stem,suite,count in [
    ('20261103114000_isa_1896_calendar_acl','testing_step3_acl_rollback.test.sql',16),
    ('20261103114100_isa_1896_candidate_membership','testing_step3_channel_rollback.test.sql',1),
   ]:
    run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(stem+'.down.sql'))
    result=run('psql',*conn,'-f',ROOT/'supabase/tests'/suite)
    (OUT/(suite+'.log')).write_text(result)
    if 'not ok ' in result or f'1..{count}' not in result:
     raise RuntimeError(suite+' failed after rollback')
    run('psql',*conn,'-f',OUT/'migration-sources'/(stem+'.sql'))
  if owner_enabled and not args.admin_effects_only:
   run('psql',*conn,'-c',"""insert into public.profiles(id) values
    ('13100000-0000-4000-8000-000000000009');
    insert into public.testing_center_memberships(user_id,actor_id,role)
    values('13100000-0000-4000-8000-000000000009','vanta131-backfill-owner','owner');""")
   run('psql',*conn,'-f',OUT/'migration-sources'/(owner_stem+'.sql'))
   migrated=run('psql',*conn,'-At','-c',"""select private.is_owner('13100000-0000-4000-8000-000000000009')
    and (select granted_by='migration:vanta131' from public.operational_access_assignments
      where user_id='13100000-0000-4000-8000-000000000009' and role='owner');""").strip()
   if migrated!='t': raise RuntimeError('step 8 legacy owner was not backfilled')
   run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(owner_stem+'.down.sql'))
   restored_role=run('psql',*conn,'-At','-c',"select encode(convert_to(pg_get_functiondef(p.oid),'UTF8'),'hex')||'|'||coalesce(p.proacl::text,'<null>') from pg_proc p where p.oid='public.testing_center_current_role()'::regprocedure").strip()
   if restored_role!=role_snapshot: raise RuntimeError('step 8 rollback changed current_role definition or ACL')
   reverted=run('psql',*conn,'-At','-c',"""select (select status='revoked' and revoked_by='rollback:vanta131'
    from public.operational_access_assignments where user_id='13100000-0000-4000-8000-000000000009'
    and role='owner') and (select role='owner' from public.testing_center_memberships
    where user_id='13100000-0000-4000-8000-000000000009');""").strip()
   if reverted!='t': raise RuntimeError('step 8 rollback lost legacy membership or live grant')
   run('psql',*conn,'-f',OUT/'migration-sources'/(owner_stem+'.sql'))
   if run('psql',*conn,'-At','-c',"select private.is_owner('13100000-0000-4000-8000-000000000009')").strip()!='t':
    raise RuntimeError('step 8 reapply did not restore legacy owner')
   run('psql',*conn,'-c',"create function private.vanta131_owner_down_guard_probe() returns boolean language sql as 'select private.is_owner(null::uuid)'")
   guard=subprocess.run([str(BIN/'psql'),*map(str,conn),'-v','ON_ERROR_STOP=1','-f',str(ROOT/'supabase/rollbacks'/(owner_stem+'.down.sql'))],env=ENV,capture_output=True,text=True)
   if guard.returncode==0 or 'owner_rollback_dependency' not in guard.stderr:
    raise RuntimeError('step 8 rollback did not fail closed on dependent function: '+guard.stderr)
   run('psql',*conn,'-c','drop function private.vanta131_owner_down_guard_probe()')
   if admin_owner_current is not None:
    run('psql',*conn,'-f',ROOT/'supabase/migrations'/(ADMIN_OWNER_STEM+'.sql'))
    if json.loads(run('psql',*conn,'-c',ADMIN_OWNER_SNAPSHOT))!=admin_owner_current:
     raise RuntimeError('admin owner changed after dependency rollback/reapply')
   if owner_policy_previous is not None:
    owner_policy_up()
   run('psql',*conn,'-f',OUT/'migration-sources'/(channel_stem+'.sql'))
   channel_restored=run('psql',*conn,'-At','-c',channel_role_snapshot_query).strip()
   if channel_restored!=channel_role_after:
    expected=dict(line.split('|',1) for line in channel_role_after.splitlines())
    actual=dict(line.split('|',1) for line in channel_restored.splitlines())
    raise RuntimeError('#1928 role contract lost after step 8 rollback/reapply: '+
                       ', '.join(name for name in expected if expected[name]!=actual.get(name)))
   if owner_disposition_before is not None:
    run('psql',*conn,'-f',OUT/'migration-sources'/(owner_disposition_stem+'.sql'))
  if args.testing_identity:
   agent_v2='20261103190100_isa_1896_agent_v2_read'
   run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(agent_v2+'.down.sql'))
   old_read=run('psql',*conn,'-At','-c',"select pg_get_functiondef('public.testing_center_get_agent_job_state(text)'::regprocedure) like '%testing_center_reports%'").strip()
   if old_read!='t': raise RuntimeError('step 7a agent rollback lost old authorized read')
   run('psql',*conn,'-f',ROOT/'supabase/migrations'/(agent_v2+'.sql'))
   report_v2='20261103190000_isa_1896_report_v2'
   run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(report_v2+'.down.sql'))
   absent=run('psql',*conn,'-At','-c',"select to_regclass('private.testing_report_v2_keys') is null").strip()
   if absent!='t': raise RuntimeError('step 7a rollback retained v2 keys')
   run('psql',*conn,'-f',ROOT/'supabase/migrations'/(report_v2+'.sql'))
   for name in ['testing_followup_F1IP.test.sql','testing_report_admission_v2.test.sql','commercial_testing_identity.test.sql','testing_step3_channel.test.sql','commercial_posthog_consent.test.sql','testing_report_rich_admission.test.sql','testing_report_legacy_closed.test.sql','testing_report_v2.test.sql','testing_center_agent_closeout_callbacks.test.sql']:
    if legacy_writers_enabled and name=='testing_report_rich_admission.test.sql': continue
    result=run('psql',*conn,'-f',ROOT/'supabase/tests'/name)
    (OUT/(name+'.log')).write_text(result)
    if 'not ok ' in result or '# Looks like' in result: raise RuntimeError(result)
    print(name+' PASS',flush=True)
   raise SystemExit(0)
  if args.pilot_profile:
   result=run('psql',*conn,'-f',ROOT/'supabase/tests/commercial_pilot_deletion.test.sql')
   (OUT/'commercial_pilot_deletion.test.sql.log').write_text(result)
   if 'not ok ' in result or '# Looks like' in result: raise RuntimeError(result)
   print('Pilot native-data live/deleted PASS',flush=True)
   raise SystemExit(0)
  if args.upgrade:
   result=run('psql',*conn,'-f',ROOT/'supabase/tests'/('commercial_'+args.upgrade+'_upgrade.test.sql'))
   (OUT/'upgrade-results.log').write_text(result)
   if 'not ok ' in result or '# Looks like' in result: raise RuntimeError(result)
   print(args.upgrade+' historical upgrade PASS',flush=True)
   raise SystemExit(0)
  if args.storage_buckets:
   if not args.storage_schema: raise ValueError('--storage-schema from local Storage required')
   run_storage_buckets(BIN,conn,ENV,run,OUT)
   raise SystemExit(0)
  if args.admin_lock_order:
   run_admin_lock_order(BIN,conn,ENV,run,OUT)
   raise SystemExit(0)
  if args.lock_order:
   run_lock_order(BIN,conn,ENV,run,OUT)
   raise SystemExit(0)
  if args.storage_multipart:
   if not args.storage_schema: raise ValueError('--storage-schema from local Storage required')
   run_storage_multipart(BIN,conn,ENV,run,OUT)
   raise SystemExit(0)
  if args.storage_owners:
   if not args.storage_schema: raise ValueError('--storage-schema from local Storage required')
   run_storage_owners(BIN,conn,ENV,run,OUT)
   raise SystemExit(0)
  if args.writers:
   run_write_races(BIN,conn,ENV,run,OUT,fixture_conn=admin_conn() if args.docker else None)
   raise SystemExit(0)
  if not args.baseline and not (args.admin_effects_only or args.admin_owner_only):
   run_tombstone_race(BIN,conn,ENV,run,OUT/'concurrency-results.log')
  if args.concurrency:
   raise SystemExit(0)
  if args.postgrest_bin:
   run('psql',*admin_conn(),'-c',"create role bridge_fixture login noinherit password 'commercial-local-fixture'; grant anon,authenticated,service_role to bridge_fixture;")
   if not args.baseline:
    run('psql',*conn,'-c',"insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('https://fixture.clerk.invalid',array['https://app.invalid'],true)")
   else:
    # Original managed profiles SELECT is a Supabase default privilege.
    run('psql',*conn,'-c','grant select on public.profiles to authenticated')
   account=run('psql',*conn,'-c',"select public.native_resolve_account('https://fixture.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa')").strip()
   if not args.before_b01 and not args.baseline:
    native_origin=args.qa_edge_origin if args.qa_e2e else 'http://127.0.0.1:54321'
    run('psql',*conn,'-c',f"update private.clerk_issuers set native_data_issuer='{native_origin}/native-data/v1' where issuer='https://fixture.clerk.invalid'")
   script=ROOT/'supabase/tests/commercial-bearers.ts'
   config=ROOT/'supabase/functions/deno.json'
   if args.deno_bin.endswith('.exe'):
    def wp(p): return 'C:'+str(p)[6:]
    script,config=wp(script),wp(config)
   read_root=ROOT/'supabase/functions'
   if args.deno_bin.endswith('.exe'): read_root=wp(read_root)
   reads=str(read_root)
   if args.signer_module: reads+=','+args.signer_module.removeprefix('file:///')
   generator=[args.deno_bin,'run','--cached-only','--no-lock','--allow-read='+reads,'--config',str(config),str(script),account]
   if args.signer_module: generator.append(args.signer_module)
   if args.qa_e2e:
    if not args.signer_module: generator.append(str(ROOT/'supabase/functions/native-account-authorize/index.ts'))
    generator.append('--qa-e2e')
   tokens_result=subprocess.run(generator,env=ENV,capture_output=True,text=True,timeout=30)
   if tokens_result.returncode: raise RuntimeError('Bearer fixture generation failed: '+tokens_result.stderr)
   generated=json.loads(tokens_result.stdout)
   tokens=generated['tokens']
   # Production ES256 uses only public material in the verifier. Keep a legacy
   # key solely for historical baseline/before-B01 RED controls.
   jwt_keys=generated['jwks']
   if args.baseline or args.before_b01:
    import base64
    jwt_keys['keys'].append({'kty':'oct','alg':'HS256','k':base64.urlsafe_b64encode(b'commercial-fixture-signing-material-local-only-32-bytes').decode().rstrip('=')})

   with socket.socket() as probe:
    probe.bind(('127.0.0.1',0)); http_port=probe.getsockname()[1]
   env=ENV|{'PGRST_DB_URI':f'postgres://bridge_fixture:commercial-local-fixture@127.0.0.1:{port}/{database}',
     'PGRST_DB_SCHEMAS':'public','PGRST_DB_ANON_ROLE':'anon','PGRST_SERVER_HOST':'127.0.0.1','PGRST_SERVER_PORT':str(http_port),
     'GHCRTS':'-N2', 'PGRST_DB_POOL':'2', 'PGRST_JWT_SECRET':json.dumps(jwt_keys),
     'PGRST_JWT_AUD':'authenticated' if args.before_b01 or args.baseline else 'vantare-native-data'}
   with (OUT/'postgrest.log').open('w') as log:
    proc=subprocess.Popen([args.postgrest_bin],env=env,stdout=log,stderr=log)
    try:
     for attempt in range(100):
      try:
       with socket.create_connection(('127.0.0.1',http_port),timeout=.1): break
      except OSError:
       if proc.poll() is not None: raise RuntimeError('PostgREST startup failed')
       time.sleep(.1) # TCP readiness; avoids repeated OpenAPI introspection.
     if args.qa_e2e:
      # Synthetic, ephemeral key only; never stdout or an evidence artifact.
      (OUT/'qa-e2e-ready.json').write_text(json.dumps({'postgrest':f'http://127.0.0.1:{http_port}',
       'pg_port':port,'account':account,'privateJwk':generated['qaPrivateJwk']}))
      deadline=time.monotonic()+7200
      while not (OUT/'qa-e2e-stop').exists():
       if proc.poll() is not None or time.monotonic()>deadline: raise RuntimeError('QA backend stopped or timed out')
       time.sleep(.1) # Operational stop-file readiness, not a licensing clock.
      raise SystemExit(0)
     if args.baseline:
      def old_profile():
       req=urllib.request.Request(f'http://127.0.0.1:{http_port}/profiles?select=id',headers={'Authorization':'Bearer '+tokens['valid']})
       with urllib.request.urlopen(req,timeout=5) as r: return json.load(r)
      assert old_profile()==[{'id':account}], 'B03 baseline bearer must work before deletion'
      try:
       run('psql',*conn,'-c',"select public.apply_clerk_user_event('baseline-deleted',repeat('e',64),'https://fixture.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','user.deleted',now(),null)")
      except RuntimeError as failure:
       assert 'apply_clerk_user_event' in str(failure) and 'does not exist' in str(failure), 'unexpected baseline database failure'
      leaked=old_profile()
      (OUT/'jwt-results.log').write_text('B03 signed prior bearer own profile before user.deleted: 1; after deletion delivery: '+str(len(leaked))+'\n')
      assert leaked==[], 'B03: historical valid bearer still reads profile after user.deleted'
     # Through PostgREST with the JWT emitted by the actual native handler.
     def save_pilot(token,photo=None,revision=0,op='16080000-0000-0000-0000-000000000021'):
      req=urllib.request.Request(f'http://127.0.0.1:{http_port}/rpc/pilot_profile_save',
       data=json.dumps({'p_profile':{'public_name':'Native pilot'},'p_photo_hash':photo,
         'p_expected_revision':revision,'p_op_id':op}).encode(),
       headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
      try:
       with urllib.request.urlopen(req,timeout=30) as r: return r.status,json.load(r)
      except urllib.error.HTTPError as e: return e.code,json.load(e)
     if not args.baseline and not args.before_b01:
      code,profile=save_pilot(tokens['valid'])
      assert code==200 and profile['revision']==1, f'native Pilot create: {code} {profile}'
      assert save_pilot(tokens['valid'])==(code,profile), 'native Pilot replay differs'
      run('psql',*conn,'-c',f"insert into storage.objects(bucket_id,name) values('pilot-photos','{account}/"+'a'*64+".jpg')")
      code,profile=save_pilot(tokens['valid'],'a'*64,1,'16080000-0000-0000-0000-000000000022')
      assert code==200 and profile['revision']==2 and profile['photo_hash']=='a'*64, f'native Pilot photo: {code} {profile}'
      assert save_pilot(tokens['other'])[0]>=400, 'unbound native JWT saved Pilot'
      (OUT/'pilot-jwt-results.log').write_text('signed native JWT: create without photo 200, replay 200, update with photo 200, mismatched binding denied\n')
     def reset(token):
      req=urllib.request.Request(f'http://127.0.0.1:{http_port}/rpc/reset_active_device',data=b'{"device_fingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
      try:
       with urllib.request.urlopen(req,timeout=30) as r: return r.status
      except urllib.error.HTTPError as e: return e.code
     status=reset(tokens['valid'])
     (OUT/'jwt-results.log').write_text('actual authorize handler JWT / own reset status='+str(status)+'\n')
     assert status==204, f'Clerk-only reset expected 204, got {status}'
     def profiles(token):
      headers={'Authorization':'Bearer '+token} if token else {}
      with urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{http_port}/profiles?select=id',headers=headers),timeout=5) as r:
       return json.load(r)
     assert profiles(tokens['valid'])==[{'id':account}], 'own RLS profile missing'
     assert profiles(tokens['other'])==[], 'signed mismatching UUID read profile'
     # #1708 proved legacy 200 before #1709. The new close migration now
     # denies that path; a real ES256 Edge -> service adapter must replace it.
     if not args.baseline and not args.before_b01:
      run('psql',*conn,'-c',f"insert into public.testing_center_memberships(user_id,actor_id,role) values('{account}','fixture:b01-1704','tester')")
      legacy_payload={'p_contract_version':'testing-center.v1','p_channel':'testers',
       'p_action_text':'Open Hub','p_expected_text':'Hub appears','p_observed_text':'Hub hangs',
       'p_context_text':None,'p_app_version':'0.1.0','p_os_family':'windows','p_os_version':'11',
       'p_module':'hub','p_include_diagnostic':False,'p_include_logs':False,
       'p_diagnostic_payload':None,'p_diagnostic_digest':None,'p_idempotency_key':'b01-legacy-fixture-1704'}
      def legacy_submit(token):
       req=urllib.request.Request(f'http://127.0.0.1:{http_port}/rpc/testing_center_submit_report',
        data=json.dumps(legacy_payload).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
       try:
        with urllib.request.urlopen(req,timeout=30) as r: return r.status,json.load(r)
       except urllib.error.HTTPError as e: return e.code,None
      code,_=legacy_submit(tokens['valid'])
      assert code==403, f'closed legacy tester RPC expected 403, got {code}'
      def report_edge(mode):
       report_script=ROOT/'supabase/tests/commercial-report.ts'
       if args.deno_bin.endswith('.exe'): report_script=wp(report_script)
       test_input={'serviceToken':generated['serviceToken'],'nativeToken':tokens['valid'],'publicJwk':generated['jwks']['keys'][0]}
       result=subprocess.run([args.deno_bin,'run','--cached-only','--no-lock','--config',str(config),
        '--allow-net=127.0.0.1:'+str(http_port),str(report_script),f'http://127.0.0.1:{http_port}',account,mode],
        env=ENV,input=json.dumps(test_input),capture_output=True,text=True,timeout=45)
       if result.returncode: raise RuntimeError('Real Edge report fixture failed: '+result.stderr)
       (OUT/('report-edge-'+mode+'.log')).write_text(result.stdout)
       return result.stdout
      edge_report=json.loads(report_edge('live'))
      report_path='/testing_contributions?id=eq.'+urllib.parse.quote(edge_report['report_id'],safe='')
      def contribution_rows(token):
       req=urllib.request.Request(f'http://127.0.0.1:{http_port}'+report_path,headers={'Authorization':'Bearer '+token})
       with urllib.request.urlopen(req,timeout=5) as r: return json.load(r)
      assert len(contribution_rows(tokens['valid']))==1, 'own v2 report missing'
      assert contribution_rows(tokens['other'])==[], 'v2 report leaked across identity'
      assert legacy_submit(tokens['other'])[0] in (401,403), 'mismatched legacy submit not denied'
      (OUT/'legacy-report-jwt-results.log').write_text('ES256 legacy RPC 403; Edge v2 diagnostic/triage/simple and shared durable quota PASS; own contribution 1; mismatched identity read 0 and submit denied\n')
     # Anonymous may receive 401/403 or an empty RLS result; never private data.
     try: assert profiles(None)==[], 'anonymous read profile'
     except urllib.error.HTTPError as e: assert e.code in (401,403)
     results=[]
     for name,token in tokens.items():
      if name=='valid': continue
      code=reset(token); assert code>=400, f'{name} unexpectedly authorized'
      results.append(name+': denied '+str(code))
     has_b02=run('psql',*conn,'-c',"select to_regclass('public.billing_access_blocks') is not null").strip()=='t'
     if has_b02:
      fixture=f"""
        select public.billing_record_order_snapshot('sandbox','native-pro','{account}','fixture-pro',null,'paid',true,100,'eur',0,now(),repeat('a',64),'native-subscription');
        insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,valid_until,resource_modified_at,snapshot_hash)
         values('{account}','polar','sandbox','subscription','native-subscription','vantare.plan.pro','active',now()+interval '1 day',now(),repeat('a',64)),
          ('{account}','polar','sandbox','order','native-independent-launch','vantare.edition.launch_v1','active',null,now(),repeat('b',64));
        select public.billing_record_refund_snapshot('sandbox','native-refund','native-pro',null,'pending',10,'eur',now()+interval '1 second',repeat('c',64));
        select public.billing_sync_order_access('sandbox','native-pro','["vantare.plan.pro"]');
      """
      run('psql',*conn,'-c',fixture)
      license_script=ROOT/'supabase/tests/commercial-license.ts'
      if args.deno_bin.endswith('.exe'): license_script=wp(license_script)
      license_command=[args.deno_bin,'run','--cached-only','--no-lock','--no-config','--allow-net=127.0.0.1:'+str(http_port),str(license_script),f'http://127.0.0.1:{http_port}',account]
      license_tokens=json.dumps({'serviceToken':generated['serviceToken'],'dataToken':tokens['valid']})
      issued=subprocess.run(license_command,env=ENV,input=license_tokens,capture_output=True,text=True,timeout=30)
      if issued.returncode: raise RuntimeError('Native SQL emission fixture failed: '+issued.stderr)
      (OUT/'native-issuance.log').write_text(issued.stdout)
      print(issued.stdout.strip(),flush=True)
      run('psql',*conn,'-c',f"insert into private.admin_account_blocks(account_id,blocked,reason) values('{account}',true,'local fixture')")
      blocked=subprocess.run([*license_command,'blocked'],env=ENV,input=license_tokens,capture_output=True,text=True,timeout=30)
      if blocked.returncode: raise RuntimeError('Legacy SQL blocked fixture failed: '+blocked.stderr)
      (OUT/'legacy-blocked-issuance.log').write_text(blocked.stdout)
      print(blocked.stdout.strip(),flush=True)
      run('psql',*conn,'-c',f"delete from private.admin_account_blocks where account_id='{account}'")
     run('psql',*conn,'-c',"select public.apply_clerk_user_event('jwt-delete',repeat('d',64),'https://fixture.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','user.deleted',now(),null)")
     if not args.baseline and not args.before_b01:
      code,profile=save_pilot(tokens['valid'])
      assert code>=400, 'previous native JWT recreated erased Pilot'
      with (OUT/'pilot-jwt-results.log').open('a') as result_log: result_log.write('same signed native JWT after deletion: denied '+str(code)+'\n')
     code=reset(tokens['valid']); assert code>=400,'previous bearer survived deletion'
     assert profiles(tokens['valid'])==[], 'previous bearer read profile after deletion'
     if not args.baseline and not args.before_b01:
      report_edge('deleted')
      assert contribution_rows(tokens['valid'])==[], 'previous bearer read v2 report after tombstone'
      assert legacy_submit(tokens['valid'])[0] in (401,403), 'previous bearer submitted legacy report after tombstone'
      with (OUT/'legacy-report-jwt-results.log').open('a') as result_log:
       result_log.write('same ES256 token after tombstone: v2 read 0; legacy submit denied\n')
     results.append('previous bearer after tombstone: denied '+str(code))
     with (OUT/'jwt-results.log').open('a') as result_log: result_log.write('\n'.join(results)+'\n')
     print('PostgREST real signed bridge JWT: own reset + '+str(len(results))+' denials PASS',flush=True)
    finally:
     proc.terminate(); proc.wait(timeout=10)
  if args.b01:
   print('B01 targeted gate PASS; unrelated SQL suites/write races not selected',flush=True)
   raise SystemExit(0)
  if legacy_writers_enabled:
   closed_stem='20261103231148_isa_1896_close_legacy_report_writers'
   if owner_policy_previous is not None:
    owner_policy_down()
   run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(closed_stem+'.down.sql'))
   assert legacy_acl_before is not None, 'missing pre-close relacl snapshot'
   assert run('psql',*conn,'-At','-c',legacy_acl_query)==legacy_acl_before, \
    '7b1 rollback did not restore the eight original relacl values'
   for name in ['testing_legacy_writers_rollback.test.sql',
                'native_admin.test.sql','testing_report_rich_admission.test.sql']:
    result=run('psql',*conn,'-f',ROOT/'supabase/tests'/name)
    (OUT/(name+'.rollback.log')).write_text(result)
    if 'not ok ' in result or '# Looks like' in result:
     raise RuntimeError(name+' failed under writer rollback')
   run('psql',*conn,'-f',ROOT/'supabase/migrations'/(closed_stem+'.sql'))
   if owner_policy_previous is not None:
    owner_policy_up()
  suites=['clerk_identity_cutover_test.sql',
   'billing_owner_alert.test.sql',
   'billing_webhook_inbox.test.sql','billing_commercial_projection.test.sql',
   'billing_reconciliation.test.sql','billing_subscription_lifecycle.test.sql',
   'billing_observability.test.sql','operational_access.test.sql','billing_order_refund_ledger.test.sql',
   'canonical_device_claim.test.sql','visual_roadmap_clickup.test.sql']
  if not legacy_writers_enabled: suites.append('native_admin.test.sql')
  if admin_report_root_applied and owner_policy_previous is None: suites.append('native_admin_characterization.test.sql')
  if legacy_writers_enabled:
   suites+=['testing_legacy_writers_closed.test.sql']
  if owner_enabled:
   suites+=['testing_owner_unification.test.sql','testing_channel_submission_authority.test.sql']
  for optional in ['checkout_terminal_attempts.test.sql','commercial_tombstone.test.sql','commercial_data_boundary.test.sql','commercial_refunds.test.sql','commercial_admin_deleted.test.sql','commercial_storage_probe.test.sql','commercial_pilot_deletion.test.sql','testing_followup_F1IP.test.sql','commercial_testing_identity.test.sql','testing_step3_channel.test.sql','commercial_posthog_consent.test.sql','testing_report_rich_admission.test.sql','testing_report_legacy_closed.test.sql']:
   if (ROOT/'supabase/tests'/optional).exists() and not (legacy_writers_enabled and optional=='testing_report_rich_admission.test.sql'):
    suites.append(optional)
  if not (args.baseline or args.before_write_barrier or args.before_testing_identity):
   suites.append('testing_report_admission_v2.test.sql')
  if not (args.baseline or args.before_private_write_barriers or args.before_testing_identity):
   suites+=['testing_report_v2.test.sql','testing_center_agent_closeout_callbacks.test.sql']
  if not (args.baseline or args.before_deleted_authorizer or args.before_posthog_consent_clear): suites.append('commercial_private_writes.test.sql')
  if not (args.baseline or args.before_deleted_authorizer or args.before_posthog_consent_clear or args.before_private_write_barriers):
   suites+=['commercial_account_id.test.sql','report_creator_renewals.test.sql','founders_review_r2.test.sql']
  suites += ['native_admin_gate.test.sql','native_admin_gate_rollback.test.sql']
  suites += ['native_admin_effects.test.sql','native_admin_effects_rollback.test.sql']
  suites += ['native_admin_effects_review.test.sql']
  suites += ['native_admin_effects_review_rollback.test.sql']
  suites += ['native_admin_effects_r2.test.sql']
  if admin_owner_previous is not None:
   suites += ['native_admin_owner_authority.test.sql']
  if args.admin_owner_only:
   suites=['native_admin_owner_authority.test.sql','commercial_testing_identity.test.sql']
  if legacy_writers_enabled: suites += ['native_admin_report_root.test.sql']
  if args.admin_reports_only:
   guard=run('psql',*conn,'-c',"select to_json(encode(tgargs,'escape')) from pg_trigger where tgrelid='public.admin_audit_log'::regclass and tgname='a_account_write_barrier'")
   (OUT/'admin-audit-guard.json').write_text(guard,encoding='utf-8')
   suites=['native_admin_report_root.test.sql','native_admin_characterization.test.sql','native_admin_effects_r2.test.sql','testing_report_v2.test.sql']
   if owner_policy_previous is not None:
    suites.remove('native_admin_characterization.test.sql')
  elif args.admin_effects_only:
   suites=[name for name in suites if name.startswith("native_admin_effects")]
  if owner_policy_previous is not None: suites.append('native_admin_owner_policy.test.sql')
  for name in suites:
   # This existing suite deliberately SET ROLEs to the isolated publisher,
   # whose membership is not granted to managed postgres by the product.
   test_conn=admin_conn() if args.docker and name=='visual_roadmap_clickup.test.sql' else conn
   try: result=run('psql',*test_conn,'-f',ROOT/'supabase/tests'/name)
   except Exception as e:
    (OUT/(name+'.log')).write_text(str(e)); raise
   (OUT/(name+'.log')).write_text(result)
   if 'not ok ' in result or '# Looks like' in result: raise RuntimeError(result)
   print(name+' PASS',flush=True)
  if admin_owner_previous is not None and not args.baseline:
   run_admin_owner_regressions(run,conn,OUT,BIN,ENV,admin_owner_previous)
  if args.admin_owner_only:
   assert admin_owner_previous is not None, 'owner migration was not applied'
   print('Admin owner targeted gate PASS; unrelated suites/races not selected',flush=True)
   raise SystemExit(0)
  if not args.baseline:
   if owner_policy_previous is not None:
    if owner_ack_previous is not None:
     run_owner_ack_regressions(run,conn,owner_ack_previous)
     run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(ACK_STEM+'.down.sql'))
    try: run_owner_policy_regressions(run,conn,OUT,BIN,ENV,owner_policy_previous)
    finally:
     if owner_ack_previous is not None:
      run('psql',*conn,'-f',ROOT/'supabase/migrations'/(ACK_STEM+'.sql'))
    run_target_owner_race(run,conn,OUT,BIN,ENV)
    result=run('psql',*conn,'-f',ROOT/'supabase/tests/native_admin_owner_ack.test.sql')
    (OUT/'native_admin_owner_ack.test.sql.log').write_text(result)
    if 'not ok ' in result or '# Looks like' in result: raise RuntimeError(result)
    print('native_admin_owner_ack.test.sql PASS',flush=True)
   if legacy_writers_enabled and (args.admin_reports_only or not args.admin_effects_only):
    if owner_policy_previous is not None:
     owner_policy_down()
    try: run_admin_report_cutover(run,conn,OUT,BIN,ENV)
    finally:
     if owner_policy_previous is not None:
      owner_policy_up()
   if args.admin_reports_only:
    run_admin_lock_order(BIN,conn,ENV,run,OUT)
   if args.deno_bin and not args.admin_effects_only:
    diagnostic=subprocess.run([args.deno_bin,'test','--cached-only','--no-lock','--allow-env',
     '--config',str(ROOT/'supabase/functions/deno.json'),str(ROOT/'supabase/functions/_shared/polar-checkout-diagnostic.test.ts')],
     env=ENV,capture_output=True,text=True,timeout=60)
    (OUT/'polar-checkout-diagnostic.log').write_text(diagnostic.stdout+diagnostic.stderr,encoding='utf-8')
    if diagnostic.returncode: raise RuntimeError(diagnostic.stdout+diagnostic.stderr)
    print('Polar checkout diagnostic privacy and standard payload PASS',flush=True)
   if not args.admin_effects_only: run_admin_gate_race(run,conn,OUT,BIN,ENV)
   run_admin_effects_race(run,conn,OUT,BIN,ENV)
   if args.admin_deno_bin or args.deno_bin:
    run_admin_gate_e2e(args.admin_deno_bin or args.deno_bin,conn,OUT,BIN,ENV)
   if erasure_previous is not None:
    run_erasure_sql(run,conn,OUT,BIN,ENV,erasure_previous)
    run_sync_sql(run,conn,OUT,BIN,ENV,args.migration_newlines)
    run_send_sql(run,conn,OUT,BIN,ENV)
    if args.admin_deno_bin or args.deno_bin:
     run_erasure_e2e(args.admin_deno_bin or args.deno_bin,conn,OUT,BIN,ENV)
     run_send_retained_guard(run,conn,OUT,BIN,ENV)
     run_sync_retained_guard(run,conn,OUT,BIN,ENV)
     run_erasure_retained_guard(run,conn,OUT,BIN,ENV)
   if not args.admin_effects_only:
    run_terminal_checkout_race(BIN,conn,ENV,run,OUT)
    run_owner_alert_race(run,conn,OUT)
   if args.deno_bin and not args.admin_effects_only:
    owner_tests=subprocess.run([args.deno_bin,'test','--cached-only','--no-lock','--allow-env',
     '--config',str(ROOT/'supabase/functions/deno.json'),str(ROOT/'supabase/functions/owner-alert-receiver/index.test.ts')],
     env=ENV,capture_output=True,text=True,timeout=120)
    (OUT/'owner-alert-edge.log').write_text(owner_tests.stdout+owner_tests.stderr,encoding='utf-8')
    if owner_tests.returncode: raise RuntimeError(owner_tests.stdout+owner_tests.stderr)
    print('Owner alert HMAC/durable ACK/email regressions PASS',flush=True)
   if not args.admin_effects_only:
    # This historical race corpus seeds legacy payloads through SQL fixtures.
    # Run it with the 7b2 rollback, which restores B03 redaction; the 7b2
    # production state drains those tables and closes their API writers.
    if legacy_writers_enabled and (ROOT/'supabase/migrations'/(archive_stem+'.sql')).exists():
     if owner_policy_previous is not None:
      owner_policy_down()
     run('psql',*conn,'-f',ROOT/'supabase/rollbacks/20261104024000_isa_1910_admin_report_root.down.sql')
     run('psql',*conn,'-f',ROOT/'supabase/rollbacks'/(archive_stem+'.down.sql'))
     run_write_races(BIN,conn,ENV,run,OUT,fixture_conn=admin_conn() if args.docker else None)
    else:
     run_write_races(BIN,conn,ENV,run,OUT,fixture_conn=admin_conn() if args.docker else None)
 finally:
  if args.docker:
   (OUT/'postgres.log').write_text(docker('logs',container))
   docker('rm','-f',container)
  else: run('pg_ctl','-D',data,'-m','fast','-w','stop')
