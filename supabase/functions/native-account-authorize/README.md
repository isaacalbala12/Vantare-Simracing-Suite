# native-account-authorize — #1452

`POST {"version":1}`, OAuth Clerk en `Authorization`, sin apikey. Devuelve
`{version,account_id,data_access_token,expires_at}`. Body cerrado de 1 KiB y
bearer de 16 KiB. OAuth inválido: 401; cuenta Clerk `banned`/`locked`: 403;
fallo de configuración/proveedor/bootstrap/firma: 503. Respuestas `no-store`,
sin logs PII. El JWT tiene `role=authenticated`, `aud=authenticated`,
`sub=profiles.id`, `iss=<SUPABASE_URL>/auth/v1`; TTL máximo 300 s, nunca más que
el OAuth verificado. No reclama ni cambia el dispositivo de licencia.

Reutiliza el validador de `native-license` y `private.resolve_account_identity`
de #909. La migración `20261003200000_native_account_data.sql` expone un
adaptador solo para `service_role`, y cambia **cinco** FKs de envío/capturas de
`auth.users` a `profiles`. Mantiene sus acciones restrict/cascade y valida las
filas existentes; un huérfano aborta el apply. No migra validaciones/promociones
ni su lifecycle. Tampoco cambia `resolve_current_account`: RPCs que pasan por
ese resolver legacy (por ejemplo reset de dispositivo) requieren un corte
propio; este bearer sí sirve al envío y a las lecturas RLS del Testing Center
basadas en `auth.uid()`.

## Secretos/configuración de servidor

| Nombre                                      | Uso                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `CLERK_SECRET_KEY`                          | Clave Backend de la instancia; reutilizar la existente sin leerla/imprimirla.                                   |
| `CLERK_NATIVE_CLIENT_ID`                    | Cliente OAuth nativo permitido; PKCE de Clerk.                                                                  |
| `CLERK_ISSUER`                              | Origen HTTPS de esa misma instancia, con barra final opcional.                                                  |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Variables integradas de Edge, nunca del cliente.                                                                |
| `NATIVE_DATA_JWT_SECRET`                    | **El secreto HS256 legacy del proyecto**, no una clave inventada, service_role ni la clave Ed25519 de licencia. |
| `SUPABASE_JWT_SECRET`                       | Se admite como alternativa si ya existe en el runtime; no asumir que Edge la inyecta.                           |

La implementación solo firma HS256. Antes de habilitarla, el orquestador debe
confirmar administrativamente que PostgREST/gateway aún aceptan la clave legacy.
No se inspeccionaron ni cambiaron claves remotas. Si el proyecto la ha retirado
y solo acepta claves asimétricas, este corte no puede emitir un token aceptable:
no reutilizar service_role. Alternativa propuesta para revisión: importar una
clave dedicada ES256 y custodiar su privada en Edge, adaptar únicamente el
firmador WebCrypto y verificar `kid`/gateway/RLS. Importarla/configurarla es un
paso remoto separado. Referencias oficiales:
[JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys) y
[JWT externos](https://supabase.com/docs/guides/auth/jwts).

## Despliegue exacto — solo el orquestador, tras autorización

Desde la raíz Git (la carpeta que contiene `supabase/`), en el SHA revisado:

```powershell
# El project_id histórico del config no es el destino beta: usar ref explícita.
supabase link --project-ref olhwhfaczmrmooeaoqqf
supabase db push --linked --dry-run
# Revisar el inventario: SOLO las migraciones/prerrequisitos autorizados.
# Si aparecen otras pendientes, detener el apply y resolver el inventario.
supabase db push --linked

# Solo si falta, mediante fichero seguro EXTERNO con NATIVE_DATA_JWT_SECRET.
# No imprimirlo ni incluirlo en Git, logs, argumentos con valores o artifacts.
supabase secrets set --project-ref olhwhfaczmrmooeaoqqf --env-file C:/secure/native-data.secrets

deno run --config supabase/functions/deno.json --allow-read supabase/functions/scripts/verify-deploy-surface.ts
supabase functions deploy native-account-authorize --project-ref olhwhfaczmrmooeaoqqf --no-verify-jwt
```

`[functions.native-account-authorize] verify_jwt=false` está versionado. El
handler autentica antes de cualquier RPC privilegiado. La allowlist reconoce la
función; el wrapper comercial mantiene su selección anterior. No ejecutar el
deploy comercial completo. Clerk sigue la instancia Development indicada en el
contrato; no presentarla como configuración Production. Desplegar
`native-license` solo si también se aprueba su extracción compartida en este
SHA.

## Checks reproducibles

```powershell
# Desde raíz Git: algunos tests existentes necesitan .github relativo a cwd.
deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions
deno lint --config supabase/functions/deno.json --rules-exclude=no-import-prefix supabase/functions/_shared/native-auth.ts supabase/functions/native-account-authorize
supabase test db supabase/tests/native_admin.test.sql
```

La prueba `postgrest.integration.test.ts` es opcional y exige
`LOCAL_POSTGREST_URL` de loopback. Usa **solo** la clave pública de fixture
`local-postgrest-test-only-signing-secret-1452`, configurada como
`PGRST_JWT_SECRET` en PostgREST desechable; no sirve a un proyecto real ni al
stack local por defecto sin esa configuración explícita. Aplicar todas las
migraciones y cargar `supabase/tests/native_data_postgrest_seed.sql` en esa
base. Configurar `PGRST_DB_SCHEMAS=public`, `PGRST_DB_ANON_ROLE=anon`,
`PGRST_SERVER_HOST=127.0.0.1`, `PGRST_SERVER_PORT=55453`, y `PGRST_DB_URI` de la
base desechable. Usa `auth.uid()`/`auth.jwt()` de Supabase; un bootstrap de PG
simple debe reproducir la lectura de `request.jwt.claims` de esas funciones.

```powershell
$env:LOCAL_POSTGREST_URL = 'http://127.0.0.1:55453'
deno test --config supabase/functions/deno.json --allow-env --allow-net=127.0.0.1:55453 supabase/functions/native-account-authorize/postgrest.integration.test.ts
Remove-Item Env:LOCAL_POSTGREST_URL
```

Prueba resolver real por HTTP, firma emitida por el handler, RPC de rol, envío
real, lectura propia, aislamiento RLS, anonimato, alteración de firma y
caducidad. Clerk sigue inyectado; no es login físico ni prueba del gateway
Supabase remoto. En la suite normal aparece omitida, nunca como PASS sin stack
local.
