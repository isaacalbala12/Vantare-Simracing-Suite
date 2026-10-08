# BIL-13 — implementación y validación

Estado actual: fases 1–2 y clientes fase 3 escritos; fase 4 parcial; fase 5 real
pendiente. Backend 464 PASS, SQL sin ejecutar. No desplegado. No-Go comercial.
Los apartados r1 siguientes conservan evidencia histórica; ronda actual abajo.

Worktree `C:/tmp/vantare-isa1514-impl`, rama
`vantareapp/isa-1514-identidad-impl`, base
`4994643871b64829ff907de55252d8a5599eb90f` (#1517). PR draft contra
`vantareapp/isa-1514-identidad-clerk`. HEAD y enlace final en GitHub #1514.

## Fase 1

- `_shared/auth.ts`: sesión Clerk validada por TPA/PostgREST, RPC devuelve UUID
  interno; rechaza errores de autenticación, indisponibilidad y UUID inválido.
- Migración `20261008210000_clerk_identity_cutover.sql`: mapping, issuer/azp
  permitido, bootstrap explícito, RLS sin altas implícitas, sustitución de las
  FKs a Auth, RPCs sin auth.uid, retirada del trigger Auth y tombstones.
- `clerk-webhook`: firma Svix comprobada sobre bytes UTF-8 exactos, límite 1
  MiB, timestamp, email primario verificado, alta/actualización/borrado
  transaccional. Errores DB devuelven 503 para que Svix reintente. Eventos no
  guardan cuerpo.
- Configuración TPA parametrizada y superficies de deploy actualizadas.

Validación: 14 tests dirigidos PASS; suite completa Deno **411 PASS, 0 FAIL**.
El primer intento dirigido encontró dos errores de tipos del mock fetch; se
corrigieron y se ejecutó de nuevo con comprobación de tipos. No --no-check.
pgTAP: 23 assertions preparadas; Docker y psql ausentes, **no ejecutadas**. El
runner instala historia SQL completa en un contenedor desechable. No prueba por
sí solo el token firmado contra un proyecto remoto.

## Fase 2: backend escrito; falta aceptación operativa

- Checkout existente requiere el nuevo wrapper Clerk; usa UUID interno como
  external_customer_id. Trigger transaccional retiene binding de checkout,
  cuenta y entorno antes de devolver la URL, incluso tras caducar el intento.
- Resolver del webhook exige binding de servidor o cliente Polar previamente
  vinculado. UUID, email y metadata por sí solos no atribuyen pagos.
- Refund no exige payment_id, como el schema oficial Polar. Pending/succeeded
  bloquean la fuente; failed/canceled despejan su bloqueo sin extender Pro ni
  retirar otros bloqueos. Parcial emitido también retira la fuente.
- Órdenes Pro conservan subscription_id y nunca conceden Pro perpetuo. Las
  restricciones independientes filtran grants/read-model/credencial web; un
  evento tardío de suscripción no puede levantar un refund o contracargo.
- Disputas oficiales obtenidas por API:
  early_warning/needs_response/under_review suspenden; lost es victoria del
  cliente y despeja el bloqueo según Isaac; won es victoria del comercio y no
  autoriza restauración. Prevented despeja disputa, pero mantiene el bloqueo
  independiente de un refund emitido.
- Firmas Polar actuales Standard Webhooks; legacy solo con opción explícita. No
  probar ambas codificaciones para un mismo endpoint.
- Worker billing-reconcile server-only: API Polar,
  órdenes/suscripciones/refunds/ disputas, paginación completa mediante cursor
  durable y lease de dos minutos. Hasta ocho páginas por invocación y
  presupuesto de 45 segundos, checkpoint tras cada página. Caída/reintento son
  idempotentes; la cuarentena se reevalúa automáticamente con el vínculo actual.
  Disputa sin orden se vuelve a consultar en el siguiente ciclo, sin atascar
  recuperación de órdenes.

Validación final local: **420 Deno PASS**, guard de deploy Deno y PowerShell
PASS, git diff --check PASS. Incluye recuperación huérfano→binding→grant, caída
DB y reintento sin grants duplicados, firmas de librería oficial, propiedad/env
y refund sin payment_id/restauración/desorden. Dos fallos iniciales entendidos:
el catálogo fixture concede dos capabilities Launch, y una aserción histórica
permitía refund parcial; expectativas corregidas a catálogo/política vigente.
pgTAP: **47 assertions** en dos scripts; no ejecutadas por ausencia de Docker/
psql. No se confunde memoria del ledger con transacciones Postgres reales. Sin
Go, frontend ni Rust modificados; sus suites no ejecutadas.

GitGuardian señaló una clave pública de ejemplo del nuevo signature.test.ts
como credencial Clerk. Se cambió a material efímero generado durante el test
(1 focal PASS) sin debilitar guard ni validación de firma. El scanner seguía
señalando el commit anterior: los dos commits propios de fase 2 se consolidaron
con la corrección desde el principio. Historia anterior conservada en referencia
local; push con lease exacto. Solo se inspeccionaron metadatos/ruta de la alerta,
sin abrir valores. CI final debe consultarse por SHA en #1523; no heredar verde.

Scheduler autorizado e implementado con pg_cron/pg_net/Vault, inicialmente
inactivo, cada minuto. Secreto dedicado BILLING_RECONCILE_SECRET, nunca
service_role en cron. Checkouts se reconcilian por external_customer_id API,
marcador de intento persistido, entorno/producto/catálogo y ventana de creación.
Intentos inciertos nunca se borran al caducar ni se recrean ciegamente. Filas
históricas sin prueba de correlación quedan cerradas.

Native-license y emisor web comparten billing_effective_access_grants. Rutas
nativas verifican OAuth/PKCE del candidato y cuenta Clerk no bloqueada; resuelven
el mismo UUID que TPA. Puente de datos existente conserva cinco minutos, añade
claims firmados Clerk y exige mapping/issuer/UUID. JWT de login Supabase sin
marcador carece de autoridad. No hay intercambio OAuth a sesión web.

Comandos locales desde la raíz del worktree:

```powershell
deno test --node-modules-dir=auto --allow-env --allow-read=.github,supabase/functions/scripts,supabase/functions/billing-webhook/testdata,supabase/functions/native-account-authorize/testdata,vantare-v2/build,vantare-v2/cmd/vantare/main.go,vantare-v2/tools/generate_supabase_config.ps1 --config supabase/functions/deno.json supabase/functions
pwsh -File supabase/tests/run-clerk-identity-postgres.ps1
```

## Ronda actual: clientes, retirada y evidencia

Fases 1–2 escritas; fase 3 escrita en ramas aisladas; fase 4 parcial; fase 5 real
pendiente. Backend principal: **464 Deno PASS / 0 FAIL**, tipos incluidos.
Candidato: **516 PASS / 0 FAIL / 1 ignored** (PostgREST local sin DB). Guards
TS/PowerShell PASS; Deno check de handlers nuevos PASS. Web **12 tests PASS**,
build y node --check PASS. Capturas reales 1280×800 y 390×844: compra cerrada sin
configuración y sin overflow. No prueba login/pago real.

Rust: fmt/clippy -D warnings y 13 checks de configuración pública PASS. Suite
workspace **1218 PASS**, 6 omitidos por perfil. Captura nativa no aceptada:
panic heredado en sidebar.rs:286, Role::GenericContainer, antes de Cuenta. DuckDB oficial, cola de compilación y -j 2.
Primer run falló por junction C:/ruta real E: en test IPC; repetido con target
absoluto. Test propio corregido soltando Store antes de limpiar DPAPI.
SQL: **62 assertions no ejecutadas** (23 identidad, 24 billing, 11 recovery/
scheduler, 4 frontera nativa). Windows sin Docker/psql; SSH a isaac@192.168.1.57
remoto linux agotó plazo dos veces. Proyecto sandbox pausado.

Integración para «Vantare | Rework a Rust» (bases comprobadas antes de editar):

- Rama vantareapp/isa-1514-identidad-native, base candidato a8f9bdc3. Commit
  OAuth 0e3436fc y commit de compra beca9206 separado. Archivos supabase native-billing-*,
  native-account-authorize, emisor nativo; Rust services billing/protocol/app,
  Hub services/view, packaging build-config/config-tests. IPC v4: integrar
  servicios y Hub juntos. Compra conserva intento por cuenta/producto/entorno,
  valida host Polar y renueva licencia cada 5 s durante 10 min al volver.
- Repo web isaacalbala12/vantare-simracing-suite-web, base #1502 378185d3; rama
  vantareapp/isa-1514-compra-clerk, commit ab7c2e6. purchase.html, purchase*.mjs/css, Worker con
  configuración pública allowlist, checkout-config y tests. SDK oficial Clerk,
  token fresco por llamada, sin JWT persistido, productKey/attemptId al servidor;
  billing-status confirma derechos al volver, redirect no concede licencia.
  Polling limitado a diez minutos. No cambio del diseño de #1502.

Aplicar migraciones/issuer/orígenes antes de desplegar las 11 funciones
comerciales, después integrar clientes con el mismo sandbox. Sin merge aquí.
SHAs exactos y compare links en #1523. Roadmap plan.md/digest ausentes en base
(#1517), no recreados. Actualizado el único handoff platform-commercial.

Fase 4 hecha en servidor: FKs/triggers/join Auth retirados por r1, getUser
sustituido, grants/RLS/credenciales usan Clerk, signup/anon local deshabilitado,
validate-license deprecated fuera del deploy. Pendiente: providers/login/email,
hooks/SMTP/templates hospedados y fuentes Wails/Electron signup/reset/password/
refresh tras integrar/aceptar clientes y verificar cero consumidores. No declarar
retirada física completa; conservar auth.jwt/roles/schema/historia. Sin backfill.

## Sandbox confirmado y bloqueo operativo

Supabase lbaxvpzexoferfvfkplz «Vantare Testing» confirmado por Isaac. **INACTIVE**:
link exige Restore project desde panel; conector restore rechaza permisos; deploy
API devuelve 404 INACTIVE. Ninguna migración/función aplicada. Producción
olhwhfaczmrmooeaoqqf prohibida y no tocada.

Clerk app app_3IWU2X4AuYRQJgZZuBF0cOGO2Ir. Development
ins_3IWU2coRM80qPPQKHmwnSn5oaPJ, dominio público
enabled-lionfish-1336.clerk.accounts.dev. Production
ins_3KCjsAhL9oCANH5ZBWt8fqmTvKm, clerk.vantare.app confirmado por Isaac.
Configuración production autorizada; las comprobaciones siguientes dieron
**No changes detected** (role ya authenticated), sin usuarios ni escrituras:

```powershell
npx -y clerk@3.4.1 config patch --app app_3IWU2X4AuYRQJgZZuBF0cOGO2Ir --instance ins_3IWU2coRM80qPPQKHmwnSn5oaPJ --json '{"session":{"claims":{"role":"authenticated"}}}' --dry-run
npx -y clerk@3.4.1 config patch --app app_3IWU2X4AuYRQJgZZuBF0cOGO2Ir --instance ins_3KCjsAhL9oCANH5ZBWt8fqmTvKm --json '{"session":{"claims":{"role":"authenticated"}}}' --dry-run
```

No config/env pull ni lectura de secretos. CLI Clerk webhooks solo ofrece relay
local y verificación; endpoint Svix persistente requiere panel.

Polar CLI oficial 2.0.2, Vantare sandbox 71f1b902-c29a-421b-aeb7-7861d8bbc08d:

| Producto | Product ID | Price ID | EUR | Trial |
| --- | --- | --- | --- | --- |
| Pro mensual | 41cffd72-bd41-4904-a0e4-9083243d26d7 | e6674b3a-5d30-434d-88b4-827167f462c3 | 5,99/mes | 7 días |
| Pro anual | 0ffa6373-57ae-44a3-9ec3-5661d37fb689 | af881ab0-a4ab-4fee-96a2-12a1602343eb | 59,90/año | 7 días |
| Launch | fd15a961-ed86-4cbc-9ffa-f8c16716b22f | a6a594ea-8275-4922-b1ac-e48ca64003da | 30,00 | No |

Dos escrituras iniciales, un PATCH trial anual; última ejecución writes=0.
Launch intacto, tres productos activos. Evidencia C:/tmp/isa1514-r3-catalog*.log.

| Caso | Local | Evidencia real sandbox |
| --- | --- | --- |
| Catálogo mensual/anual/trial/Launch | 3 tests PASS | CLI precios/trials, sync writes=0 |
| Compra web/nativa, UUID común, credencial | Auth/emisor PASS | Pendiente backend/configuración |
| Refund retira; failed/canceled restaura | Deno PASS | Pendiente |
| Disputa suspende/restaura | Parsing PASS | Pendiente SQL/API real |
| Cancelación/expiración trial | Grants PASS | Pendiente |
| Un equipo; Launch offline/reconexión | Emisor/candidato PASS | Pendiente prueba física |
| Caída/huérfano/intento incierto | Deno PASS, SQL preparado | Pendiente scheduler operativo |

## Comandos sandbox pendientes (solo nombres de variables)

Restaurar Testing desde panel. Cargar variables privadamente, sin .env ni valores
en chat/logs. Registrar Clerk development en Supabase Third Party Auth. Endpoint
Svix SUPABASE_URL/functions/v1/clerk-webhook, user.created/updated/deleted; guardar
CLERK_WEBHOOK_SIGNING_SECRET. OAuth nativo y redirect loopback:
CLERK_NATIVE_CLIENT_ID. Webhook Polar sandbox firmado a billing-webhook.
SANDBOX_PROJECT_REF y SUPABASE_DB_URL deben señalar exclusivamente Testing.
CLERK_DOMAIN debe estar en el proceso CLI para validar config.toml.

```powershell
supabase link --project-ref $env:SANDBOX_PROJECT_REF --yes
supabase db push --linked --include-all --yes
supabase secrets set --project-ref $env:SANDBOX_PROJECT_REF CLERK_ISSUER="$env:CLERK_ISSUER" CLERK_SECRET_KEY="$env:CLERK_SECRET_KEY" CLERK_NATIVE_CLIENT_ID="$env:CLERK_NATIVE_CLIENT_ID" CLERK_WEBHOOK_SIGNING_SECRET="$env:CLERK_WEBHOOK_SIGNING_SECRET" POLAR_ENVIRONMENT=sandbox POLAR_ACCESS_TOKEN="$env:POLAR_ACCESS_TOKEN" POLAR_PRODUCT_MAP="$env:POLAR_PRODUCT_MAP" POLAR_WEBHOOK_SECRET="$env:POLAR_WEBHOOK_SECRET" POLAR_WEBHOOK_SIGNATURE_SCHEME=standard CHECKOUT_SUCCESS_URL="$env:CHECKOUT_SUCCESS_URL" CHECKOUT_CANCEL_URL="$env:CHECKOUT_CANCEL_URL" OFFLINE_LICENSE_ED25519_PRIVATE_KEY="$env:OFFLINE_LICENSE_ED25519_PRIVATE_KEY" OFFLINE_LICENSE_KEY_ID="$env:OFFLINE_LICENSE_KEY_ID" BILLING_RECONCILE_SECRET="$env:BILLING_RECONCILE_SECRET" NATIVE_DATA_JWT_SECRET="$env:NATIVE_DATA_JWT_SECRET" CORS_ALLOWED_ORIGINS="$env:CORS_ALLOWED_ORIGINS"
pwsh -File supabase/functions/scripts/deploy-approved-functions.ps1 -ProjectRef $env:SANDBOX_PROJECT_REF
```

SQL parametrizado, ejecutar después de migraciones mediante psql con
-v ON_ERROR_STOP=1 y sin echo/debug. Variables: clerk_issuer=CLERK_ISSUER,
purchase_origin=CLERK_PURCHASE_ORIGIN, native_data_issuer=NATIVE_DATA_ISSUER,
project_url=SUPABASE_URL, reconcile_secret=BILLING_RECONCILE_SECRET:

```sql
insert into private.clerk_issuers(issuer,authorized_parties,enabled,native_data_issuer)
values (:'clerk_issuer',array[:'purchase_origin'],true,:'native_data_issuer')
on conflict(issuer) do update set authorized_parties=excluded.authorized_parties,enabled=true,native_data_issuer=excluded.native_data_issuer;
select vault.create_secret(:'project_url','billing_project_url');
select vault.create_secret(:'reconcile_secret','billing_reconcile_secret');
update private.billing_scheduler set enabled=true where singleton;
```

NATIVE_DATA_JWT_SECRET debe corresponder a firma admitida por PostgREST sandbox;
no usar clave arbitraria. CHECKOUT_SUCCESS_URL apunta a purchase.html (servidor
agrega product/returned). POLAR_PRODUCT_MAP conserva catálogo/version/IDs arriba.
CORS_ALLOWED_ORIGINS incluye CLERK_PURCHASE_ORIGIN. Vault se crea una vez; si
existe, actualizar por nombre sin leer decrypted_secret. Observar cursor/request_id,
no net.http_request_queue (contiene cabeceras privadas). Retirar providers Auth
hospedados y ejecutar pgTAP/matriz después de restaurar.

Web Worker: CLERK_DOMAIN, CLERK_PUBLISHABLE_KEY (pk_test), SUPABASE_URL,
SUPABASE_ANON_KEY pública, POLAR_ENVIRONMENT=sandbox.
Nativo: VANTARE_SUPABASE_URL, VANTARE_SUPABASE_ANON_KEY, VANTARE_CLERK_ISSUER,
VANTARE_CLERK_CLIENT_ID, VANTARE_CLERK_REDIRECT, VANTARE_ACCOUNT_BRIDGE_URL,
VANTARE_LICENSE_PUBLIC_KEYS, VANTARE_BILLING_ENVIRONMENT, VANTARE_BUILD_CHANNEL,
VANTARE_VERSION.

Matriz: cuenta nueva sandbox, IDs comerciales/UUID/dispositivo/grants/credencial
sin JWT/email/secretos, medir replay/ciclo scheduler y límites reales de trial/
cancelación. Fixtures no sustituyen compras. Rollback cierra compra y preserva
inbox/grants/mapping; build compatible, sin snapshots sobre pagos nuevos.
