insert into public.profiles(id,email) values
 ('11111111-1111-4111-8111-111111111111','first@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','second@example.invalid');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://legacy.clerk.invalid','user_conflict','11111111-1111-4111-8111-111111111111'),
 ('https://legacy.clerk.invalid/','user_conflict','22222222-2222-4222-8222-222222222222');
