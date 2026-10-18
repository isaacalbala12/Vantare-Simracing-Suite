"""Valid writes: positive control rolls back before each real deletion race.

Placeholders are generated fixtures, never inputs or remote identifiers.
"""
CASES = [
 ('profile-update', "update public.profiles set email='restored@example.invalid',display_name='Restored' where id='{a}'"),
 ('alias-insert', "insert into public.account_identities(issuer,subject,account_id) values('{issuer}','user_new_alias','{a}')"),
 ('alias-clear', "update public.account_identities set deleted_at=null,user_event_at=now() where issuer='{issuer}' and subject='{subject}'"),
 ('device-insert', "insert into public.devices(user_id,fingerprint_hash) values('{a}',repeat('b',64)) on conflict(user_id) do update set fingerprint_hash=excluded.fingerprint_hash"),
 ('reset-clerk', "set local role authenticated; select public.reset_active_device(repeat('b',64))"),
 ('claim-clerk', "set local role authenticated; select public.claim_active_device(repeat('a',64))"),
 ('reset-native', "set local role authenticated; select public.reset_active_device(repeat('b',64))"),
 ('native-claim', "set local role service_role; select public.native_claim_license_device('{issuer}','{subject}',repeat('a',64))"),
 ('native-resolve', "set local role service_role; select public.native_resolve_account('{issuer}','{subject}')"),
 ('bootstrap', "set local role authenticated; select public.clerk_bootstrap_account()"),
 ('license-insert', "insert into public.licenses(user_id,tier,is_active,hwid) values('{a}','pro',false,'new-hwid')"),
 ('license-update', "update public.licenses set hwid='restored',is_active=true where id='{license}'"),
 ('validation', "insert into public.license_validations(license_id,user_id,hwid,is_valid) values('{license}','{a}','new-hwid',true)"),
 ('hwid-change', "insert into public.hwid_changes(license_id,new_hwid) values('{license}','new-hwid')"),
 ('rate-limit-user', "insert into public.rate_limits(user_id,endpoint) values('{a}','license')"),
 ('rate-limit-license', "insert into public.rate_limits(license_id,endpoint) values('{license}','license')"),
 ('legacy-subscription', "insert into public.subscriptions(user_id,plan) values('{a}','pro')"),
 ('license-event', "insert into public.license_events(user_id,event_type,payload) values('{a}','late','{{\"email\":\"restored\"}}')"),
 ('customer-upsert', "insert into public.billing_customers(user_id,provider,provider_customer_id,email,metadata,environment) values('{a}','polar','{case}','restored@example.invalid','{{\"pii\":true}}','sandbox') on conflict(user_id,provider,environment) do update set email=excluded.email,metadata=excluded.metadata"),
 ('billing-subscription', "insert into public.billing_subscriptions(user_id,provider,provider_subscription_id,status,environment) values('{a}','polar','{case}','active','sandbox')"),
 ('checkout-claim', "select * from public.claim_billing_checkout_attempt('{a}','{attempt}','pro_monthly','sandbox','fixture')"),
 ('checkout-complete', "select public.complete_billing_checkout_attempt('{a}','{attempt}','new-checkout-{case}','https://checkout.invalid/fixture')"),
 ('checkout-uncertain', "select public.mark_billing_checkout_attempt_uncertain('{a}','{attempt}')"),
 ('checkout-binding', "insert into public.billing_checkout_bindings(environment,provider_checkout_id,user_id,attempt_id,checkout_key,catalog_version) values('sandbox','new-binding-{case}','{a}','{attempt}','pro_monthly','fixture')"),
 ('resource', "insert into public.billing_commercial_resources(user_id,provider,environment,resource_type,resource_id,remote_state,remote_modified_at,snapshot_hash) values('{a}','polar','sandbox','order','new-{case}','paid',now(),repeat('c',64))"),
 ('order', "select * from public.billing_record_order_snapshot('sandbox','new-order-{case}','{a}','product',null,'paid',true,100,'eur',0,now(),repeat('a',64))"),
 ('refund', "select * from public.billing_record_refund_snapshot('sandbox','refund-{case}','order-{case}',null,'pending',10,'eur',now(),repeat('d',64))"),
 ('access-block', "insert into public.billing_access_blocks(environment,source_type,source_id,cause_type,cause_id,user_id,blocked,remote_modified_at,snapshot_hash) values('sandbox','order','order-{case}','refund','new-{case}','{a}',true,now(),repeat('e',64))"),
 ('grant', "insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,resource_modified_at,snapshot_hash,metadata) values('{a}','polar','sandbox','order','new-{case}','launch_bundle','active',now(),repeat('f',64),'{{\"pii\":true}}')"),
 ('entitlement', "insert into public.user_entitlements(user_id,product_key,status,source,metadata) values('{a}','bundle','active','billing_projection','{{\"pii\":true}}')"),
 ('reconciliation', "insert into public.billing_reconciliation_runs(user_id,provider,environment,trigger_kind,snapshot_hash,plan_hash,observed_hash,plan,operation_count,changed_count,status) values('{a}','polar','sandbox','manual',repeat('a',64),repeat('b',64),repeat('c',64),'[]',0,0,'unchanged')"),
 ('recovery', "insert into public.billing_subscription_recovery_cycles(user_id,provider,environment,subscription_id,cycle_paid_through,first_failure_at,recovery_until) values('{a}','polar','sandbox','{case}',now(),now(),now()+interval '3 days')"),
 ('operational', "insert into public.operational_access_assignments(user_id,role,status,granted_at,granted_by,grant_reason,correlation_id) values('{a}','tester','active',now(),'fixture:admin','fixture grant','{case}')"),
 ('operational-audit', "insert into public.operational_access_audit(target_user_id,role,action,actor_ref,reason,correlation_id,policy_version) values('{a}','tester','grant','fixture:admin','fixture grant','{case}',1)"),
 ('operational-retirement', "insert into public.operational_legacy_grant_retirements(target_user_id,retired_count,actor_ref,reason,correlation_id) values('{a}',1,'fixture:admin','fixture retirement','{case}')"),
 ('membership', "insert into public.testing_center_memberships(user_id,actor_id,role) values('{a}','fixture-{case}','tester') on conflict(user_id) do update set active=true"),
 ('answer', "insert into public.testing_answers(questionnaire_id,account_id,score,note) values('{questionnaire}','{a}',4,'private answer')"),
 ('contribution', "insert into public.testing_contributions(id,account_id,channel,title,body) values('{new_id}','{a}','master','private title','private body')"),
 ('followup', "update public.testing_report_followup set consent=true where contribution_id='{contribution}'"),
 ('report', "insert into public.testing_center_reports(report_id,reporter_id,reporter_user_id,reporter_role,channel,state) values('new-report-{case}','fixture-{case}','{a}','tester','testers','draft')"),
 ('report-payload', "update public.testing_center_report_payloads set action_text='restored private text' where report_id='report-{case}'"),
 ('report-evidence', "insert into public.testing_center_evidence(evidence_id,report_id,kind,digest) values('new-evidence-{case}','report-{case}','report_context',repeat('d',64))"),
 ('report-key', "insert into public.testing_center_report_submission_keys(reporter_user_id,idempotency_key,payload_digest,report_id) values('{a}','new-key-{case}',repeat('a',64),'report-{case}')"),
 ('report-event', "insert into public.testing_center_report_events(event_id,report_id,actor_id,actor_user_id,actor_role,operation_digest) values('event-{case}','report-{case}','fixture-{case}','{a}','tester',repeat('b',64))"),
 ('evidence-batch', "insert into public.testing_center_evidence_batches(batch_id,reporter_user_id,channel,idempotency_key,manifest_digest) values('{new_id}','{a}','testers','new-key',repeat('a',64))"),
 ('screenshot', "update public.testing_center_screenshot_evidence set state='uploading' where evidence_id='{evidence}'"),
 ('evidence-outbox', "insert into public.testing_center_evidence_outbox(job_id,evidence_id,kind) values('{new_id}','{evidence}','validate')"),
 ('storage-owner', "insert into storage.objects(bucket_id,name,owner_id) values('testing-center-evidence','new-{case}','{a}')"),
 ('storage-manifest', "insert into storage.objects(bucket_id,name) values('testing-center-evidence','v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/{batch}/{evidence}')"),
 ('admin-audit', "insert into public.admin_audit_log(actor_account_id,action,target) values('{a}','get_account','{case}')"),
 ('admin-rate', "insert into private.native_admin_rate(actor,window_start,requests) values('{a}',now(),1)"),
 ('admission-account', "select public.testing_report_admit('account','{a}',date_trunc('week',now() at time zone 'UTC')::date)"),
]

SETUP = """
insert into private.clerk_issuers(issuer,authorized_parties,enabled,native_data_issuer)
 values('{issuer}',array['https://app.invalid'],true,'http://127.0.0.1:54321/native-data/v1');
insert into public.profiles(id,email,display_name) values('{a}','before@example.invalid','Before');
insert into public.account_identities(issuer,subject,account_id) values('{issuer}','{subject}','{a}');
insert into public.licenses(id,user_id,tier,is_active) values('{license}','{a}','free',false);
insert into public.devices(user_id,fingerprint_hash) values('{a}',repeat('a',64));
insert into public.billing_customers(user_id,provider,provider_customer_id,email,environment)
 values('{a}','polar','{case}','before@example.invalid','sandbox');
select * from public.billing_record_order_snapshot('sandbox','order-{case}','{a}','product',null,'paid',true,100,'eur',0,now(),repeat('a',64));
insert into public.testing_questionnaires(id,version,channel,title,question) values('{questionnaire}','1.0.0','testers','Fixture','Question');
insert into public.testing_contributions(id,account_id,channel,title,body) values('{contribution}','{a}','master','Fixture','Private body');
insert into public.testing_report_followup(contribution_id) values('{contribution}');
insert into public.testing_center_reports(report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
 values('report-{case}','fixture-{case}','{a}','tester','testers','draft');
insert into public.testing_center_report_payloads(report_id,action_text,expected_text,observed_text,app_version,os_family,os_version,module,include_diagnostic,include_logs)
 values('report-{case}','Private action','Expected','Observed','1.0.0','windows','windows_11','account',false,false);
insert into public.testing_center_evidence_batches(batch_id,reporter_user_id,channel,idempotency_key,manifest_digest)
 values('{batch}','{a}','testers','fixture',repeat('a',64));
insert into public.testing_center_screenshot_evidence(evidence_id,batch_id,position,object_path,media_type,byte_size,sha256,width,height)
 values('{evidence}','{batch}',1,'v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/{batch}/{evidence}','image/png',100,repeat('a',64),10,10);
"""

# Indirect tables: valid SQL writes exercise each FK path, including composite
# candidate/validation/order references. No trigger/function is replaced in QA.
CASES += [
 ('technical-issue', "update public.testing_center_technical_issues set flow_state='needs_info' where technical_issue_id='issue_{h}'"),
 ('candidate', "update public.testing_center_candidate_builds set build_version='1.0.1' where candidate_id='candidate-{case}'"),
 ('validation-snapshot', "insert into public.testing_center_validation_snapshots(validation_id,technical_issue_id,candidate_id,channel,app_version,candidate_sha,actor_id,actor_user_id,actor_role,decision,replay_key,decision_digest,projection_digest,transport_digest,sanitized_projection,redacted_values,truncated_fields) values('validation-{case}','issue_{h}','candidate-{case}','testers','1.0.0','{sha}','{a}','{a}','tester','accepted','{case}','{h}','{h}','{h}','{{}}',0,0)"),
 ('candidate-validation', "update public.testing_center_validations set actor_role='primary_tester' where validation_id='validation-{case}'"),
 ('promotion', "insert into public.testing_center_promotions(promotion_id,candidate_id,validation_id,from_channel,to_channel,exact_sha,validated_sha,state) values('{case}','candidate-{case}','validation-{case}','testers','master','{sha}','{sha}','pending')"),
 ('tc-audit', "insert into public.testing_center_audit(audit_id,aggregate_id,from_state,to_state,origin,actor_id,actor_user_id,actor_role,operation_digest) values('{case}','issue_{h}','reported','needs_info','testing_center','{a}','{a}','tester','{h}')"),
 ('pause', "insert into public.testing_center_pauses(pause_id,scope,reason_code,requested_by_id,requested_by_user_id) values('{case}','global','owner_requested','{a}','{a}')"),
 ('consent', "insert into public.testing_center_posthog_consent_events(consent_event_id,report_id,revision,actor_user_id,diagnostics_consent,replay_consent,idempotency_key,operation_digest) values('posthog_consent_{h}','report-{case}',1,'{a}',true,false,'{case}','{h}')"),
 ('posthog-evidence', "insert into public.testing_center_posthog_evidence(evidence_id,report_id,correlation_id,channel,app_version,candidate_sha,os_family,os_release,module,fault_source,fault_code,error_name,replay_consent,replay_available,projection_digest,transport_digest,canonical_projection,error_expires_at) values('posthog_{h}','report-{case}','correlation_{h}','testers','1.0.0','{sha}','windows','windows_11','account','backend','backend.operation.failed','Error',false,false,'{h}','{h}','{{}}',now()+interval '30 days')"),
 ('triage', "insert into public.testing_center_triage_results(report_id,triage_state,incomplete_reason) values('report-{case}','incomplete','missing_server_context')"),
 ('occurrence', "insert into public.testing_center_issue_occurrences(report_id,technical_issue_id,is_primary,functional_fingerprint,compatibility_digest) values('report-{case}','issue_{h}',true,'{h}','{h}')"),
 ('effect-outbox', "update public.testing_center_effect_outbox set state='needs_owner' where effect_id='effect_{h2}'"),
 ('destination', "update public.testing_center_issue_destinations set updated_at=now() where technical_issue_id='issue_{h}'"),
 ('supersession', "insert into public.testing_center_effect_supersessions(legacy_effect_id,superseded_by_effect_id,prior_state,prior_attempt_count,prior_updated_at) values('effect_{h}','effect_{h2}','pending',0,now())"),
 ('linear-projection', "insert into public.testing_center_linear_projection_snapshots(effect_id,technical_issue_id,primary_report_id,source_snapshot,source_digest,marker,occurrence_count) values('effect_{h}','issue_{h}','report-{case}','{{}}','{h}','{case}',1)"),
 ('linear-binding', "update public.testing_center_linear_issue_bindings set bound_by_id='fixture-other' where external_issue_id='{new_id}'"),
 ('linear-reconciliation', "insert into public.testing_center_linear_reconciliations(technical_issue_id,effect_id,external_issue_id,observed_state) values('issue_{h}','effect_{h}','{new_id}','linear_created')"),
 ('linear-webhook', "insert into public.testing_center_linear_webhook_deliveries(delivery_id,webhook_id,organization_id,external_issue_id,event_name,event_action,webhook_timestamp_ms,event_created_at,payload_digest,outcome) values('{batch}','{evidence}','{license}','{new_id}','Issue','update',1,now(),'{h}','pending')"),
 ('agent-job', "update public.testing_center_agent_jobs set updated_at=now() where job_key='{job}'"),
 ('agent-effect', "insert into public.testing_center_agent_effect_outbox(effect_id,job_key,effect_kind,effect_target,effect_generation,payload_digest) values('{case}','{job}','github_dispatch','triage',1,'{h}')"),
 ('agent-callback', "insert into public.testing_center_agent_callbacks(delivery_id,job_key,head_sha,callback_kind,outcome,payload_digest,disposition) values('{case}','{job}','{sha}','triage','eligible','{h}','applied')"),
 ('agent-phase', "insert into public.testing_center_agent_phase_callbacks(delivery_id,job_key,head_sha,phase,payload_digest,fencing_token,run_id,disposition) values('{case}','{job}','{sha}','red_verified','{h}',1,1,'applied')"),
 ('agent-reservation', "insert into public.testing_center_agent_reservations(reservation_key,job_key,reservation_kind,binding_digest) values('{case}','{job}','branch','{h}')"),
 ('agent-audit', "insert into public.testing_center_agent_audit(job_key,execution_generation,policy_version,from_state,to_state,actor,operation_digest) values('{job}',1,'testing-center.autofix-policy.v2','triage_queued','triaged','fixture','{h}')"),
 ('codex-run', "insert into public.testing_center_codex_runs(run_id,technical_issue_id,attempt,state,origin) values('{case}','issue_{h}',1,'queued','orchestrator')"),
 ('codex-control', "insert into public.testing_center_codex_execution_control(technical_issue_id,run_id,request_digest,evidence_digest,analysis_base_sha,nightly_head_sha,ancestry_proof_digest) values('issue_{h}','{case}','{h}','{h}','{sha}','{sha}','{h}')"),
 ('dossier', "insert into public.testing_center_codex_dossier_snapshots(dossier_digest,transport_digest,dossier_idempotency_key,rejection_validation_id,technical_issue_id,candidate_id,channel,candidate_sha,correction_issue_id,target_branch,nightly_sha,status,canonical_dossier) values('{h2}','{h2}','{case}','validation-{case}','issue_{h}','candidate-{case}','testers','{sha}','issue_{h2}','vantareapp/isa-1608-fixture','{sha}','incomplete','{{}}')"),
 ('owner-disposition', "insert into public.testing_center_owner_dispositions(disposition_id,rejection_validation_id,technical_issue_id,actor_id,actor_user_id,disposition,reason,disposition_digest) values('disposition_{h}','validation-{case}','issue_{h}','{a}','{a}','dismiss_with_reason','fixture reason','{h2}')"),
 ('deletion-queue', "insert into private.clerk_deleted_objects(issuer,subject,bucket_id,name) values('{issuer}','{subject}','testing-center-evidence','new-{case}')"),
]

INDIRECT_SETUP = """
insert into public.testing_center_technical_issues(technical_issue_id,report_id,state,flow_state,origin)
 values('issue_{h}','report-{case}','open','reported','orchestrator');
insert into public.testing_center_candidate_builds(candidate_id,technical_issue_id,channel,build_version,exact_sha,author_id,state)
 values('candidate-{case}','issue_{h}','testers','1.0.0','{sha}','fixture-author','pending');
insert into public.testing_center_validations(validation_id,candidate_id,channel,exact_sha,candidate_author_id,decision,actor_id,actor_user_id,actor_role)
 values('validation-{case}','candidate-{case}','testers','{sha}','fixture-author','accepted','{a}','{a}','tester');
insert into public.testing_center_effect_outbox(effect_id,effect_key,effect_type,technical_issue_id,primary_report_id,state)
 values('effect_{h}','github_issue_create:issue_{h}','github_issue_create','issue_{h}','report-{case}','superseded'),
 ('effect_{h2}','linear_issue_create:issue_{h}','linear_issue_create','issue_{h}','report-{case}','pending');
insert into public.testing_center_issue_destinations(technical_issue_id,destination,active_effect_id)
 values('issue_{h}','linear','effect_{h2}');
insert into public.testing_center_linear_issue_bindings(external_issue_id,organization_id,technical_issue_id,effect_id,bound_by_id)
 values('{new_id}','{license}','issue_{h}','effect_{h2}','fixture');
insert into public.testing_center_agent_jobs(job_key,technical_issue_id,execution_generation,policy_version,report_digest,dossier_digest,nightly_base_sha,state)
 values(public.testing_center_agent_job_key('issue_{h}','{h}','{sha}','testing-center.autofix-policy.v2'),
 'issue_{h}',1,'testing-center.autofix-policy.v2','{h}','{h}','{sha}','triage_queued');
"""

CASES.append(('calendar', "insert into public.race_schedule_publications(status,schedule,source_text,valid_from,series_count,created_by) values('draft','{{}}','Fixture schedule',now(),1,'{a}')"))

CASES += [
 ('inbox', "select * from public.billing_receive_webhook('polar','sandbox','new-{case}','order.paid','{h}','{{\"type\":\"order.paid\",\"data\":{{\"customer_id\":\"{case}\"}}}}')"),
 ('inbox-effect', "insert into public.billing_webhook_effects(inbox_id,effect_key) values('{inbox}','fixture')"),
 ('inbox-replay', "insert into public.billing_webhook_replay_audit(inbox_id,actor_id,reason_code,previous_status) values('{inbox}','fixture','fixture','received')"),
 ('tc-idempotency', "insert into public.testing_center_idempotency(aggregate_id,idempotency_key,payload_digest,from_state,to_state,origin) values('issue_{h}','fixture','{h}','reported','needs_info','orchestrator')"),
 ('admin-target', "insert into public.admin_audit_log(actor_account_id,action,target) values('{other}','set_tester','{a}')"),
 ('admin-mutation-result', "insert into public.admin_audit_log(actor_account_id,action,target,after_value) values('{other}','set_tester','set_tester','[{{\"account_id\":\"{a}\"}}]')"),
]

CASES.append(('calendar-publisher', "insert into public.race_schedule_publications(status,schedule,source_text,valid_from,series_count,created_by,published_by,published_at) values('published','{{}}','Fixture schedule',now(),1,'{other}','{a}',now())"))

CASES += [
 ('inbox-checkout', "select * from public.billing_receive_webhook('polar','sandbox','new-{case}','order.paid','{h}','{{\"data\":{{\"checkout_id\":\"checkout-{case}\"}}}}')"),
 ('inbox-order', "select * from public.billing_receive_webhook('polar','sandbox','new-{case}','order.paid','{h}','{{\"data\":{{\"id\":\"order-{case}\"}}}}')"),
 ('inbox-refund', "select * from public.billing_receive_webhook('polar','sandbox','new-{case}','refund.updated','{h}','{{\"data\":{{\"order_id\":\"order-{case}\"}}}}')"),
 ('inbox-subscription', "select * from public.billing_receive_webhook('polar','sandbox','new-{case}','subscription.updated','{h}','{{\"data\":{{\"id\":\"subscription-{case}\"}}}}')"),
 ('inbox-nested-customer', "select * from public.billing_receive_webhook('polar','sandbox','new-{case}','order.paid','{h}','{{\"data\":{{\"customer\":{{\"id\":\"{case}\"}}}}}}')"),
]

# R5: service persistence roots not present in the old objects/FK closure.
CASES += [
 ('storage-multipart-upload', "insert into storage.s3_multipart_uploads(id,upload_signature,bucket_id,key,version,owner_id) values('{case}','fixture','testing-center-evidence','{case}','fixture','{a}')"),
 ('storage-multipart-part', "insert into storage.s3_multipart_uploads_parts(upload_id,part_number,bucket_id,key,etag,version,owner_id) values('{case}',1,'testing-center-evidence','{case}','fixture','fixture','{a}')"),
 ('storage-abort-queue', "insert into private.clerk_deleted_uploads(issuer,subject,bucket_id,name,upload_id) values('{issuer}','{subject}','testing-center-evidence','{case}','{case}')"),
]

# R6: buckets also persist account ownership in the real Storage schema.
CASES += [
 ('storage-bucket-owner', "insert into storage.buckets(id,name,owner) values('{case}','{case}','{a}')"),
 ('storage-bucket-owner-id', "insert into storage.buckets(id,name,owner_id) values('{case}','{case}','{a}')"),
]

CASES += [
 ('storage-bucket-child-object', "insert into storage.objects(bucket_id,name) values('{case}','{case}')"),
 ('storage-bucket-child-upload', "insert into storage.s3_multipart_uploads(id,upload_signature,bucket_id,key,version) values('{case}','fixture','{case}','{case}','fixture')"),
 ('storage-bucket-child-part', "insert into storage.s3_multipart_uploads_parts(upload_id,part_number,bucket_id,key,etag,version) values('{case}',1,'{case}','{case}','fixture','fixture')"),
]

# R7: descendants incorporated from nightly (#1612).
CASES += [
 ('pilot-profile', "insert into public.pilot_profiles(account_id,profile) values('{a}','{{\"public_name\":\"Fixture\"}}')"),
 ('pilot-operation', "insert into pilot_private.operations(account_id,op_id,result) values('{a}','{new_id}','{{}}')"),
 ('pilot-photo-ownerless', "insert into storage.objects(bucket_id,name) values('pilot-photos','{a}/{h}.jpg')"),
]

# #1702: valid writes for four existing admin guards and eleven later tables.
# Financial/report history is retained; a tombstone must stop fresh writes.
CASES += [
 ('admin-block', "insert into private.admin_account_blocks values('{a}',false,null)"),
 ('admin-payment', "insert into private.admin_payments(environment,payment_id,account_id,product,paid_at,amount_cents,currency,modified_at) values('sandbox','{case}','{a}','Fixture',now(),100,'eur',now())"),
 ('admin-history', "insert into private.admin_payment_history values('sandbox','{a}')"),
 ('admin-payout', "insert into private.admin_creator_payouts(creator_id,amount_cents,actor) values('{new_id}',100,'{a}')"),
 ('admin-deletion-record', "insert into private.admin_account_deletions(account_id,issuer,subject,confirmation_hash) values('{a}','{issuer}','{subject}','{h}')"),
 ('mail-contact', "insert into private.mail_contacts(email,account_id,erasure_account,locale,evidence) values('{case}@example.invalid','{a}','{a}','en','fixture')"),
 ('mail-budget', "insert into private.mail_consent_budget values('{a}',now(),1)"),
 ('mail-delivery', "insert into private.mail_deliveries(campaign_id,email,locale) values('{new_id}','{case}@example.invalid','en')"),
 ('report-promotion', "insert into private.report_promotions(account_id,environment,subscription_id,original_subscription_id,product_id,subscribed_at,current_started_at,first_renewal,observed_at) values('{a}','sandbox','{case}','{case}','{case}',now(),now(),now(),now())"),
 ('promotion-invoice', "insert into private.report_promotion_invoices(environment,order_id,account_id,subscription_id,product_id,discount_amount,billed_at,period_start,period_end) values('sandbox','{case}','{a}','{case}','{case}',0,now(),now(),now()+interval '1 month')"),
 ('promotion-gap', "insert into private.report_promotion_invoice_gaps values('sandbox','{case}','{a}',now(),now(),null)"),
 ('promotion-failure', "insert into private.report_promotion_failures(account_id,environment,code,first_at,last_at) values('{a}','sandbox','promotion_account_failed',now(),now())"),
 ('promotion-launch-use', "insert into private.report_promotion_launch_uses(account_id,environment,product_id,reserved_at) values('{a}','sandbox','{case}',now())"),
 ('promotion-change', "insert into private.report_promotion_changes(account_id,environment,subscription_id,product_id,tier) values('{a}','sandbox','{case}','{case}',0)"),
 ('promotion-transfer', "insert into private.report_promotion_transfers(account_id,environment,subscription_id,product_id,next_subscription_id,next_product_id,observed_at,cleanup_after) values('{a}','sandbox','{case}','{case}','next','next',now(),now())"),
]

# #1711: direct account UUIDs without a FK still own retained commercial rows.
CASES += [
 ('creator-attribution', "insert into private.creator_checkout_attributions values('sandbox','{a}','{attempt}','{new_id}','FIXTURE','{new_id}',now())"),
 ('creator-renewal', "insert into private.creator_renewal_operations(environment,subscription_id,account_id,creator_id,first_order_id,product_id,checkout_key,creator_discount_id) values('sandbox','{case}','{a}','{new_id}','{case}','{new_id}','pro_monthly','{new_id}')"),
 ('creator-revocation', "insert into private.creator_subscription_revocations values('sandbox','{case}','{a}','subscription_revoked',now())"),
 ('creator-terms', "insert into private.report_creator_terms(environment,subscription_id,account_id,duration_months) values('sandbox','{case}','{a}',6)"),
 ('report-renewal-candidate', "insert into private.report_renewal_candidates values('sandbox','{case}','{a}','{new_id}',100,now()+interval '1 month')"),
 ('payment-incident', "insert into private.billing_payment_incidents(environment,account_id,resource_id,reason) values('sandbox','{a}','{case}','fixture')"),
]

# R9: Edge admission must preserve live writes and reject a racing tombstone.
CASES += [
 ('testing-admitted-classic', "set local role service_role; select public.testing_report_submit_admitted('{a}','{new_id}','master','Fixture','Private body',true)"),
 ('testing-admitted-triage', "set local role service_role; select public.testing_contribution_submit_admitted('{a}','{new_id}','testers','[contenido retirado por privacidad]','[contenido retirado por privacidad]',jsonb_build_object('app_version','1.0.0','app_channel','testers','game','lmu','system','{{}}'::jsonb,'consent',jsonb_build_object('version','triage-v2','items',jsonb_build_array('app_log'),'accepted_at','2026-10-13T00:00:00Z')),jsonb_build_array(jsonb_build_object('kind','app_log','content','Fixture','sha256',encode(sha256(convert_to('Fixture','UTF8')),'hex'))))"),
]

CASES += [('testing-triage-review', 'insert into public.testing_contribution_reviews(contribution_id,reviewer,decision,note,model_verdict,model_confidence,proposal) values(\'{new_id}\',\'{a}\',\'accepted\',\'Reviewed\',\'valido\',0.9,\'{{"schema":"vantare.triage.v2","verdict":"valido","confidence":0.9,"summary":"Synthetic test","criteria":{{"contenido_minimo":"si","evidencia":"si","no_duplicado":"si"}},"trazable":"si","duplicate_of":null,"severity":"media","area":"telemetria","preliminary_fix":null,"reasons":["Evidence reviewed"],"evidence_refs":["log:L1-L1"]}}\')')]
