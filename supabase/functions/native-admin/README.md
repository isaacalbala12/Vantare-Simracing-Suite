# native-admin — #1456

Edge de administración v1: OAuth Clerk verificado, cuenta no bloqueada y
asignación `owner` activa, policy_version 1 y no caducada. El cliente nunca
recibe service_role ni el secreto Clerk. Anónimo/OAuth inválido: 401; no
owner/bloqueado: 403. Body JSON cerrado de 8 KiB; bearer 16 KiB; solo POST; todo
`no-store`. Respuesta feliz `{version:1,ok:true,...}`, error
`{version:1,ok:false,error}`. No hay eliminación de cuentas/datos ni efectos
externos Clerk.

`search_accounts` también admite `query: ""`: devuelve cuentas Vantare ya
mapeadas al issuer configurado, ordenadas por alta descendente y UUID
descendente para desempatar. `limit` 1–50 y `cursor` UUID opcional;
`next_cursor` es null en la última página. No crea cuentas ni consulta todo el
directorio de Clerk. La búsqueda con texto conserva el contrato anterior; no
admite cursor y devuelve hasta 50 coincidencias. Para el listado vacío, la
migración `20261005160000_native_admin_account_pages.sql` debe preceder al
despliegue Edge.

Cada petición registra `native_admin_timing` con acción, duración total y fases
(OAuth, perfil actor, resolución, permiso/presupuesto, búsqueda Clerk, RPC y
enriquecimiento), sin datos personales ni credenciales. El perfil del actor se
reutiliza para enriquecer su detalle, sin omitir la validación de bloqueo/owner.
No se cachea la autenticación ni la revocación de OAuth.

| Acción              | Campos además de version/action                          | Resultado                                                                                |
| ------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `search_accounts`   | `query` (1–200 bytes), `limit` opcional 1–50, defecto 50 | `accounts:[{account_id,email,name,created_at,last_seen_at,roles,modules,reports_count}]` |
| `get_account`       | `account_id` UUID                                        | `account:{...}`                                                                          |
| `set_tester`        | `account_id`, `enabled` boolean                          | `account_id,enabled`                                                                     |
| `set_module`        | `account_id`, `module`, `enabled` boolean                | `account_id,module,enabled`                                                              |
| `get_rollout`       | Ninguno                                                  | `rollout:[{module,enabled_for_all,updated_at}]`                                          |
| `set_rollout`       | `module`, `enabled_for_all` boolean                      | `rollout:{...}`                                                                          |
| `list_reports`      | `status?`, `limit?` 1–100 defecto 100, `cursor?`         | `reports:[...],next_cursor`                                                              |
| `get_report`        | `report_id` (1–256 bytes)                                | `report:{...,payload,screenshots:[{evidence_id,media_type,position,url,expires_at}]}`    |
| `set_report_status` | `report_id`, `status`                                    | `report_id,status`                                                                       |

Módulos: `vantare.module.analysis`, `.calendar`, `.engineer`, `.strategy`.
Estados: `draft`, `submitted`, `validated`, `duplicate_linked`, `incomplete`,
`closed` (los del esquema existente). Cambiar estado no lanza triage, agentes,
promociones ni altera el estado de una issue técnica asociada. `list_reports`
ordena por `report_id` ascendente; el cursor es el último ID devuelto,
exclusivo. Puede devolver una página final vacía. Cada fila contiene
`report_id,account_id,email,name,last_seen_at,status,created_at,module,app_version,
action_text,expected_text,observed_text,context_text,has_screenshots`.

Correo/nombre/último login provienen de Clerk Backend `/v1/users`; se agrupan
los IDs en una consulta. La búsqueda filtra correo/nombre y devuelve solo
mappings existentes del issuer configurado: nunca crea cuentas destino ni une
por email. Las cuentas legacy sin mapping Clerk conservan
`email/name/last_seen_at=null`. `created_at` es la creación del perfil interno.
`modules` muestra acceso efectivo (grant individual, rollout u operativo).
Revocar un grant individual no vence un rollout global ni owner/tester; las
credenciales ya firmadas requieren renovación.

`set_tester` actualiza rol operativo y membership del canal testers en **una**
transacción. Usa `operational_access_set` existente; conserva owner, incluso al
desactivar tester. Un owner vivo sigue pudiendo reportar como owner. Un owner
activo pero caducado no se sustituye: 409 `account_conflict` al intentar
conceder tester; el operador debe resolver su rol por el procedimiento operativo
existente. Conceder tester reemplaza nightly_tester según la exclusividad del
esquema.

La migración `20261003201000_native_admin.sql` añade un rate budget persistente
de **60 peticiones/minuto UTC por actor**, reservado antes de consultar el
directorio o firmar capturas. La verificación owner se repite dentro de la RPC
de ejecución y se bloquea su asignación durante la transacción. Los rechazos
OAuth dependen además de los límites de Clerk/gateway. No hay cola ni scheduler.

Cada acción ejecutada (incluidas lecturas) escribe `admin_audit_log` con actor,
acción, objetivo, antes/después y timestamp. Los cambios y la auditoría
confirman juntos: si falla el registro, se revierte la mutación. Para tester se
guardan asignación y membership; para módulos, las filas de grant, incluso si el
acceso efectivo no cambia por rollout. Auditoría append-only, RLS, escritura
únicamente desde RPC security-definer y EXECUTE solo service_role. Lecturas
masivas dejan el snapshot de resultados en auditoría privada; incluye texto de
los reportes. Si Clerk/Storage falla después de leer/auditar SQL, el HTTP da 503
y la lectura ya queda auditada; no se presenta como acción satisfactoria al
cliente.

Capturas: solo evidencias `ready` ligadas al reporte, bucket privado existente
`testing-center-evidence`. URLs firmadas por 600 s; no se devuelven rutas
internas. Se admite el máximo histórico de 10 al consultar, aunque el cliente
beta adjunta como máximo 3. Esta función no valida bytes ni sustituye
prepare/upload/finalize/attach.

## Despliegue exacto — orquestador, tras autorización

Prerrequisitos: #909, `native_license_bridge`, #1451 `module_rollout`, y
`20261003200000_native_account_data.sql`. **No** se crea owner automáticamente.
Tiene que existir una asignación owner vigente mediante el flujo administrativo
anterior. Reutilizar `CLERK_SECRET_KEY`, `CLERK_NATIVE_CLIENT_ID`,
`CLERK_ISSUER`, `POLAR_ENVIRONMENT` (`production` o `sandbox`) y las variables
Edge integradas `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`. Esta función no
necesita signing key de datos ni Ed25519. No se leyeron los secretos existentes.

```powershell
# Desde raíz Git, SHA revisado. Ref beta explícita, no project_id histórico.
supabase link --project-ref olhwhfaczmrmooeaoqqf
supabase db push --linked --dry-run
# Continuar SOLO si el inventario contiene el conjunto previamente autorizado.
supabase db push --linked
deno run --config supabase/functions/deno.json --allow-read supabase/functions/scripts/verify-deploy-surface.ts
supabase functions deploy native-admin --project-ref olhwhfaczmrmooeaoqqf --no-verify-jwt
```

Si falta una variable, configurarla mediante el procedimiento seguro del
orquestador y autorización propia, sin imprimir/copiar valores. Config
versionada: `[functions.native-admin] verify_jwt=false`. Allowlist TS/PowerShell
reconoce las dos funciones nuevas, pero el wrapper comercial no las despliega
por defecto. No se cambió el workflow ni se ejecutó ninguno de estos comandos
remotos.

## Verificación

```powershell
deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions
supabase test db supabase/tests/native_admin.test.sql
```

Upgrade desechable: aplicar hasta #1451, cargar
`supabase/tests/native_account_data_upgrade_seed.sql`, aplicar las dos nuevas
migraciones, ejecutar `native_account_data_upgrade.test.sql` y
`native_admin.test.sql`. Examinar plan pgTAP y ausencia de `not ok`; psql por sí
solo no convierte aserciones fallidas en exit no cero. Se probaron localmente
clean/upgrade, rechazo no-owner/caducado, acciones felices, snapshots, FKs,
preservación owner, rate limit y rollback de rol/membership ante fallo de
auditoría. Los tests Deno cubren Clerk/Storage inyectados y límites del
protocolo. Falta QA real autorizada de owner, directorio Clerk y URLs Storage
tras desplegar.
