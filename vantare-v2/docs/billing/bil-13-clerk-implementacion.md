# BIL-13 — implementación y validación

Estado: fase 1 escrita; backend de fase 2 escrito, sin programador activado.
Suite Deno **420 PASS / 0 FAIL**; SQL sin ejecutar. Fases 3–5 pendientes.
Implementación detenida en la frontera de clientes y dependencias del scheduler,
según las stop conditions de Isaac. No desplegado. No-Go comercial.

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

El scheduler requiere decidir una dependencia no prevista en ADR: pg_cron,
pg_net y Vault, oficiales de Supabase, o identificar el scheduler existente. No
añadidos ni activados. La ruta del worker no se considera recuperación
automática operativa hasta programarla y comprobar el SLA real en sandbox. Ver
[guía oficial](https://supabase.com/docs/guides/functions/schedule-functions).
Native-license del candidato aún consulta grants sin estos filtros; el commit de
cliente debe cambiar también ese consumidor antes de desplegar el corte. La
creación de checkout uncertain heredada conserva cierre seguro sin emitir una
URL no vinculada, pero aún remite a soporte: falta reemplazar esa recuperación
anterior al pago por reconciliación automática del intento. No se declara fase 2
completa. No recrear ciegamente un checkout de resultado incierto.

Comandos locales desde la raíz del worktree:

```powershell
deno test --node-modules-dir=auto --allow-env --allow-read=.github,supabase/functions/scripts,supabase/functions/billing-webhook/testdata,vantare-v2/build,vantare-v2/cmd/vantare/main.go,vantare-v2/tools/generate_supabase_config.ps1 --config supabase/functions/deno.json supabase/functions
pwsh -File supabase/tests/run-clerk-identity-postgres.ps1
```

## Instancias y sandbox

La CLI oficial 2.0.2 confirma sesión **sandbox**, organización Vantare
`71f1b902-c29a-421b-aeb7-7861d8bbc08d`. Esto no demuestra compras
nuevas/licencias. No están presentes en este proceso SANDBOX_PROJECT_REF,
CLERK_ISSUER, CLERK_DOMAIN, POLAR_ACCESS_TOKEN, SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY ni CLERK_WEBHOOK_SIGNING_SECRET. Solo se comprobó
presencia, no valores secretos. Las tres variables públicas
CLERK_PUBLISHABLE_KEY, VITE_CLERK_PUBLISHABLE_KEY y
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY tampoco están presentes.

Existe una referencia pública al proyecto `ombjshwzqgeisazijduq` en config; no
confirma su instancia/configuración de producción. Falta confirmar el dominio
Clerk de producción y prefijo pk_live, y el proyecto Supabase de producción. No
se leyó .env ni se consultaron instancias productivas.

Consulta read-only del catálogo sandbox con CLI oficial: Launch
fd15a961-ed86-4cbc-9ffa-f8c16716b22f a 3000 céntimos EUR; Pro mensual
41cffd72-bd41-4904-a0e4-9083243d26d7 a **500**, sin trial. No hay producto anual
en las dos filas obtenidas. Ningún producto/precio modificado y ningún pago
simulado ejecutado: faltan backend y cliente para observar entrega.

| Caso                                              | Evidencia end-to-end de esta implementación |
| ------------------------------------------------- | ------------------------------------------- |
| Pro mensual / anual / trial / Launch → licencia   | Pendiente: backend sandbox y cliente        |
| Refund → retirada; failed/canceled → restauración | Local PASS; sandbox pendiente               |
| Disputa → suspensión/restauración                 | Local parsing PASS; SQL/sandbox pendiente   |
| Cancelación → fin del periodo                     | Pendiente sandbox                           |
| Huérfano → recuperado                             | Local PASS; sandbox pendiente               |
| Caída → reconciliación                            | Local PASS; SQL/scheduler/sandbox pendiente |

## Configuración que debe realizar Isaac

No ejecutar producción hasta completar fases 2–5 y aceptar el SHA exacto. No hay
un comando válido para activar la integración TPA hospedada desde `config.toml`:
se registra en los dos dashboards oficiales.

1. Clerk: seleccionar la instancia **sandbox**; Integrations → Supabase →
   activar integración; token con `role: authenticated`. Webhooks: endpoint
   `$SUPABASE_URL/functions/v1/clerk-webhook`, eventos user.created,
   user.updated, user.deleted. Configurar dominio y origen de compra públicos.
2. Supabase sandbox: Authentication → Third Party Auth → Clerk, dominio
   `$CLERK_DOMAIN`. Configurar issuer y azp con SQL parametrizado:

```powershell
supabase link --project-ref $env:SANDBOX_PROJECT_REF
supabase db push
@'
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
values (:'clerk_issuer',array[:'purchase_origin'],true)
on conflict(issuer) do update set authorized_parties=excluded.authorized_parties,enabled=true;
'@ | psql $env:SUPABASE_DB_URL -v ON_ERROR_STOP=1 -v clerk_issuer="$env:CLERK_ISSUER" -v purchase_origin="$env:CLERK_PURCHASE_ORIGIN"
supabase secrets set --project-ref $env:SANDBOX_PROJECT_REF CLERK_ISSUER="$env:CLERK_ISSUER" CLERK_WEBHOOK_SIGNING_SECRET="$env:CLERK_WEBHOOK_SIGNING_SECRET"
pwsh -File supabase/functions/scripts/deploy-approved-functions.ps1 -ProjectRef $env:SANDBOX_PROJECT_REF
npx -y @polar-sh/cli@2.0.2 auth login --sandbox
```

Cargar las variables de forma segura fuera de este chat; nunca entregar
secretos. El SQL de issuer va **después** de db push; el corte permanece cerrado
hasta registrarlo. SUPABASE_DB_URL debe apuntar solo a sandbox. Todavía no
desplegar sobre el candidato nativo: necesita completar fase 3 antes de retirar
su puente.

## Producción: comandos para Isaac, no ejecutados ni listos para activación

Primero completar clientes, retirada legacy, SQL y matriz real, y aceptar el
SHA. Clerk no ofrece aquí un comando CLI de TPA: en instancia Production,
Integrations→Supabase habilitada, dominio CLERK_DOMAIN, origen
CLERK_PURCHASE_ORIGIN y webhook firmado user.created/updated/deleted. Confirmar
solo el prefijo pk_live de CLERK_PUBLISHABLE_KEY y el dominio, sin compartir la
key. Supabase: registrar ese dominio en Third Party Auth; conservar auth.jwt/
roles. No borrar el schema Auth. Login/providers/emails se retiran en fase 4.

```powershell
supabase link --project-ref $env:PRODUCTION_PROJECT_REF
supabase db push
@'
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
values (:'clerk_issuer',array[:'purchase_origin'],true)
on conflict(issuer) do update set authorized_parties=excluded.authorized_parties,enabled=true;
'@ | psql $env:SUPABASE_DB_URL -v ON_ERROR_STOP=1 -v clerk_issuer="$env:CLERK_ISSUER" -v purchase_origin="$env:CLERK_PURCHASE_ORIGIN"
supabase secrets set --project-ref $env:PRODUCTION_PROJECT_REF CLERK_ISSUER="$env:CLERK_ISSUER" CLERK_WEBHOOK_SIGNING_SECRET="$env:CLERK_WEBHOOK_SIGNING_SECRET" POLAR_ENVIRONMENT=production POLAR_PRODUCT_MAP="$env:POLAR_PRODUCT_MAP" POLAR_ACCESS_TOKEN="$env:POLAR_ACCESS_TOKEN" POLAR_WEBHOOK_SECRET="$env:POLAR_WEBHOOK_SECRET" POLAR_WEBHOOK_SIGNATURE_SCHEME=standard CHECKOUT_SUCCESS_URL="$env:CHECKOUT_SUCCESS_URL" CHECKOUT_CANCEL_URL="$env:CHECKOUT_CANCEL_URL" OFFLINE_LICENSE_ED25519_PRIVATE_KEY="$env:OFFLINE_LICENSE_ED25519_PRIVATE_KEY" OFFLINE_LICENSE_KEY_ID="$env:OFFLINE_LICENSE_KEY_ID"
pwsh -File supabase/functions/scripts/deploy-approved-functions.ps1 -ProjectRef $env:PRODUCTION_PROJECT_REF
```

SUPABASE_DB_URL debe corresponder al proyecto elegido. Los valores se cargan
privadamente por Isaac; aquí solo se documentan nombres. No volcar auth whoami
ni respuestas completas de webhook endpoint: pueden contener material privado.

CLI Polar oficial, comandos para el catálogo si esos productos no existen:

```powershell
npx -y @polar-sh/cli@2.0.2 auth login --production
npx -y @polar-sh/cli@2.0.2 products create --org $env:POLAR_ORGANIZATION_ID --name "Vantare Pro Monthly" --visibility private --recurring-interval month --recurring-interval-count 1 --trial-interval day --trial-interval-count 7 --prices '[{"amount_type":"fixed","price_amount":599,"price_currency":"eur"}]'
npx -y @polar-sh/cli@2.0.2 products create --org $env:POLAR_ORGANIZATION_ID --name "Vantare Pro Annual" --visibility private --recurring-interval year --recurring-interval-count 1 --prices '[{"amount_type":"fixed","price_amount":5990,"price_currency":"eur"}]'
npx -y @polar-sh/cli@2.0.2 products create --org $env:POLAR_ORGANIZATION_ID --name "Vantare Launch Edition" --visibility private --prices '[{"amount_type":"fixed","price_amount":3000,"price_currency":"eur"}]'
```

No recrear productos existentes ni habilitar Pro Plus. POLAR_PRODUCT_MAP debe
usar IDs reales y ambos mapas inversos; trial mensual de siete días, Annual sin
segundo trial. POLAR_TRIAL_ANTI_ABUSE_CONFIRMED=true solo tras verificar la
política antiabuso Polar en sandbox. Webhooks en Dashboard Polar con formato
raw, API 2026-10, URL SUPABASE_URL/functions/v1/billing-webhook, eventos
order.paid, order.refunded, refund.created/updated y lifecycle de subscription.
Guardar POLAR_WEBHOOK_SECRET privadamente. Disputas se consultan por API, no
inventar un evento dispute inexistente en esta versión CLI. Permisos token:
lectura de orders/subscriptions/refunds/disputes y creación de checkout/portal
necesaria para los handlers existentes. Activación de scheduler y comandos de
retiro Auth pendientes de sus decisiones/verificación; este bloque no es un
despliegue completo listo para cobrar.

Prueba manual posterior en sandbox: sesión Clerk de cuenta A→POST
billing-checkout para cada productKey→completar Polar→observar ledger y
entitlement→pedir license-credential con fingerprint→verificar candados. Cuenta
B debe rechazar posesión del mismo checkout. Emitir/fallar/cancelar refund en
sandbox, simular disputa por fixtures firmados/API controlada, perder webhook e
interrumpir DB y comprobar recuperación con scheduler. Medir latencia y
conservar IDs/SHA/logs sanitizados; no llamar evidencia de sandbox a los
fixtures Deno actuales.

## Límites

La retirada del login/providers/emails legacy, los clientes y la matriz
monetaria no están entregados. Retención fiscal/soporte y purga de otros
contenidos RGPD siguen pendientes; no se declara borrado universal. Sin
dependencia nueva, producción, pagos reales, secretos, merge, promoción, release
ni subagentes.
