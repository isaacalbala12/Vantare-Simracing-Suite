# #1704 / VANTA-96 - B01 ES256 preparado, sin activar

El bridge firma **ES256 con kid** desde `NATIVE_DATA_ES256_PRIVATE_JWK`.
`testing-report-submit` verifica con `NATIVE_DATA_ES256_PUBLIC_JWK`, sin privada.
No hay fallback a HS256, NATIVE_DATA_JWT_SECRET ni SUPABASE_JWT_SECRET.
Se conservan issuer `<SUPABASE_URL>/native-data/v1`, audiencia
`vantare-native-data`, role authenticated, sub UUID interno, procedencia Clerk
verificada y TTL <=300 s y <=OAuth. SQL/RLS y el bearer opaco de Rust no cambian.

Generador protegido, pruebas, importacion autorizada, limites y reversion:
[runbook ES256](../../../vantare-v2/docs/runbooks/native-data-es256.md).

La confianza gestionada y el registro Clerk Production siguen siendo una
activacion separada pendiente de Isaac. El arnes prepara PostgREST local
con publica ES256; su ejecucion real y CI siguen pendientes del workflow #1702.
No certifica gateway/Storage gestionado ni login real.
Importar una clave le da autoridad de proyecto: dedicada no limita los roles
que podria emitir quien posea la privada. No compartir claves de licencia/Clerk.

## Historico #1452 / B01 HS256 - NO EJECUTABLE

Los comandos antiguos de link/db push/deploy y la tabla que proponia
NATIVE_DATA_JWT_SECRET o SUPABASE_JWT_SECRET se han retirado de esta guia.
No provisionar esos secretos ni ejecutar el procedimiento antiguo para este
corte. La referencia se conserva en el
[README historico de nightly bf5dc5b62](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/bf5dc5b6295c0a6d491f8ee53e9552f07d798c48/supabase/functions/native-account-authorize/README.md).
Sus claims, claves y ref de proyecto estan sustituidos por el runbook ES256
actual. Solo ese runbook describe la propuesta de activacion, pendiente de Isaac.

## Checks reproducibles

```powershell
# Desde raíz Git: algunos tests existentes necesitan .github relativo a cwd.
deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions
deno lint --config supabase/functions/deno.json --rules-exclude=no-import-prefix supabase/functions/_shared/native-auth.ts supabase/functions/native-account-authorize
supabase test db supabase/tests/native_admin.test.sql
```

La prueba `postgrest.integration.test.ts` es opcional y solo admite un
PostgREST desechable en loopback. Generar un par **TEST ES256** fuera de Git con
`new-native-data-key.ps1`. Configurar `PGRST_JWT_SECRET` con un **JWKS JSON**:
`{"keys":[<contenido de TEST-public.jwk>]}`. No usar la privada ni una cadena
HS256 como secreto del verificador. El kid del bearer debe coincidir con el de
esa publica. No usar claves productivas ni el stack local por defecto.

Aplicar todas las migraciones y cargar `supabase/tests/native_data_postgrest_seed.sql`.
Configurar `PGRST_DB_SCHEMAS=public`, `PGRST_DB_ANON_ROLE=anon`,
`PGRST_SERVER_HOST=127.0.0.1`, `PGRST_SERVER_PORT=55453`, y `PGRST_DB_URI` de la
base desechable. El seed fija el issuer logico de datos en
`http://127.0.0.1:54321/native-data/v1`, independiente del puerto HTTP de prueba;
si se fija `PGRST_JWT_AUD`, debe ser `vantare-native-data`. El bootstrap debe
reproducir `auth.jwt()` desde `request.jwt.claims` y `private.current_account()`.

```powershell
# Solo rutas a archivos TEST protegidos generados fuera del checkout.
$env:LOCAL_POSTGREST_URL = 'http://127.0.0.1:55453'
$env:LOCAL_POSTGREST_PRIVATE_JWK_FILE = 'C:/secure/TEST-private.jwk'
try {
  deno test --config supabase/functions/deno.json --allow-env `
    --allow-read=C:/secure/TEST-private.jwk --allow-net=127.0.0.1:55453 `
    supabase/functions/native-account-authorize/postgrest.integration.test.ts
} finally {
  Remove-Item Env:LOCAL_POSTGREST_URL,Env:LOCAL_POSTGREST_PRIVATE_JWK_FILE
}
```

Prueba resolver real por HTTP, firma del handler, RPC de rol/reset, envio legacy
permitido a la membership tester, lectura propia y aislamiento de reporte/perfil,
anonimato, firma alterada y caducidad. La RPC legacy testing_center_submit_report
sigue autorizada en SQL; no confundirla con testing_report_submit ni afirmar que
el admission Edge la cierra. Su posible bypass preexistente requiere seguimiento
separado (#1709), sin ampliar permisos ni cambiar el producto en este corte.

Clerk sigue inyectado; no es login fisico ni prueba del gateway/Storage gestionado.
En la suite normal aparece omitida, nunca como PASS sin stack. El arnes
`run-commercial-local.py --b01` incluye tambien el envio legacy y su aislamiento
para confirmar la expectativa por PostgREST real en el gate pendiente de #1702.
