begin;
select plan(8);

select is((select environment from public.billing_subscriptions where provider_subscription_id='legacy-active-sub'), 'sandbox', 'upgrade derives subscription environment from commercial resource');
select is((select paid_through = current_period_end from public.billing_subscriptions where provider_subscription_id='legacy-active-sub'), true, 'active legacy subscription derives bounded paid through');
select is((select status from public.billing_access_grants where source_id='legacy-active-sub'), 'active', 'proven unexpired legacy subscription grant remains active');
select is((select valid_until = (select paid_through from public.billing_subscriptions where provider_subscription_id='legacy-active-sub') from public.billing_access_grants where source_id='legacy-active-sub'), true, 'migrated commercial grant is bounded by paid through');
select is((select paid_through is null from public.billing_subscriptions where provider_subscription_id='legacy-past-due-sub'), true, 'past due legacy row cannot invent paid through');
select is((select status from public.billing_access_grants where source_id='legacy-past-due-sub'), 'revoked', 'unproven past due legacy grant is revoked');
select is((select count(*)::integer from public.billing_subscription_recovery_cycles), 0, 'upgrade never synthesizes recovery cycles');
select is((select count(*)::integer from public.billing_access_grants where source_type='subscription_recovery'), 0, 'upgrade never synthesizes recovery grants');

select * from finish();
rollback;
