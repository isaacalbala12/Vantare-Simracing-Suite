-- Explicit rollback for the isolated product-feedback migration.
select cron.unschedule('vantare-product-feedback-expiry');
drop function if exists public.purge_expired_product_feedback();
drop table if exists public.product_feedback;
