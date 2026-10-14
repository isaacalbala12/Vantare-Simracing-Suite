# native-license — acceso beta por módulos (#1451)

Firma las concesiones de cuenta y los módulos activos para todos. Los módulos
solo se incluyen en `native-license`: `license-credential` los omite para
mantener el conjunto cerrado del verificador Go/Wails congelado. Owner, tester y
nightly_tester abren todos los módulos en el núcleo sin filas individuales. El
cliente no acepta capacidades desconocidas. Los módulos son perpetuos, sin
`paid_through` ni `scope_version`; la caché y el envelope conservan sus reglas.
La migración no activa ningún módulo. No se despliega desde este worktree.

SQL para Isaac (SQL Editor administrativo; nunca desde anon/authenticated).
Sustituir el UUID de ejemplo por `profiles.id` de la cuenta, no por su ID Clerk.
`production` debe coincidir con `POLAR_ENVIRONMENT` del servidor; usar `sandbox`
si esa es la configuración. Cambiar `engineer` por `strategy`, `analysis` o
`calendar` cuando corresponda.

## Conceder a una cuenta (idempotente)

```sql
insert into public.billing_access_grants (
  user_id, provider, environment, source_type, source_id, capability,
  status, valid_until, resource_modified_at, snapshot_hash, metadata
) values (
  '00000000-0000-4000-8000-000000000444'::uuid,
  'vantare', 'production', 'support',
  'beta-module:00000000-0000-4000-8000-000000000444:engineer',
  'vantare.module.engineer', 'active', null, now(),
  encode(sha256(convert_to('beta-module:00000000-0000-4000-8000-000000000444:engineer', 'UTF8')), 'hex'),
  '{"reason":"beta module access"}'::jsonb
)
on conflict (provider, environment, source_type, source_id, capability)
do update set status = 'active', valid_until = null,
  resource_modified_at = now(), updated_at = now();
```

## Revocar a una cuenta

```sql
update public.billing_access_grants
set status = 'revoked', resource_modified_at = now(), updated_at = now()
where user_id = '00000000-0000-4000-8000-000000000444'::uuid
  and provider = 'vantare' and environment = 'production'
  and source_type = 'support' and capability = 'vantare.module.engineer';
```

## Activar / desactivar para todos

```sql
update public.module_rollout
set enabled_for_all = true, updated_at = now()
where module = 'vantare.module.engineer';

update public.module_rollout
set enabled_for_all = false, updated_at = now()
where module = 'vantare.module.engineer';
```

Desactivar globalmente mantiene las concesiones individuales y las operativas.
Revocar individualmente no supera un rollout global habilitado. Los cambios
surten efecto en la próxima renovación de credencial, no retiran por sí solos
una credencial ya firmada en caché. Las credenciales V1 no tienen vencimiento
global: una concesión de módulo perpetua requiere renovación/logout para
retirarse. El envelope V2, cuando se usa, limita la vigencia incluso sin grants.
Una caída de la consulta rollout da 503; no se firma ignorando esa tabla.

La tabla tiene RLS y solo `service_role` dispone de permisos. No ejecutar estas
operaciones hasta aplicar la migración nueva y desplegar `native-license` y
`license-credential` con su helper revisado. El endpoint Wails antiguo
rechazaría filas individuales de módulo si no se despliega también su filtro.

Checks locales:
`deno test --allow-env --allow-read native-license license-credential`.
