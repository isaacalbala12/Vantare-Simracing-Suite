# BIL-13 — implementación y validación

Estado: fase 1 escrita y validación local Deno; SQL sin ejecutar. Fases 2–5
pendientes. No desplegado. No-Go comercial: falta la matriz real completa.

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

| Caso                                              | Evidencia end-to-end de esta implementación |
| ------------------------------------------------- | ------------------------------------------- |
| Pro mensual / anual / trial / Launch → licencia   | Pendiente: backend sandbox y cliente        |
| Refund → retirada; failed/canceled → restauración | Pendiente fase 2 y sandbox                  |
| Disputa → suspensión/restauración                 | Pendiente fase 2 y sandbox                  |
| Cancelación → fin del periodo                     | Pendiente sandbox                           |
| Huérfano → recuperado                             | Pendiente fase 2 y sandbox                  |
| Caída → reconciliación                            | Pendiente fase 2 y sandbox                  |

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
psql $env:SUPABASE_DB_URL -v ON_ERROR_STOP=1 -v clerk_issuer="$env:CLERK_ISSUER" -v purchase_origin="$env:CLERK_PURCHASE_ORIGIN" -c "insert into private.clerk_issuers(issuer,authorized_parties,enabled) values (:'clerk_issuer',array[:'purchase_origin'],true) on conflict(issuer) do update set authorized_parties=excluded.authorized_parties,enabled=true;"
supabase link --project-ref $env:SANDBOX_PROJECT_REF
supabase db push
supabase secrets set --project-ref $env:SANDBOX_PROJECT_REF CLERK_ISSUER="$env:CLERK_ISSUER" CLERK_WEBHOOK_SIGNING_SECRET="$env:CLERK_WEBHOOK_SIGNING_SECRET"
pwsh -File supabase/functions/scripts/deploy-approved-functions.ps1 -ProjectRef $env:SANDBOX_PROJECT_REF
npx -y @polar-sh/cli@2.0.2 auth whoami --json
```

Cargar las variables de forma segura fuera de este chat; nunca entregar
secretos. El SQL de issuer va **después** de db push; el corte permanece cerrado
hasta registrarlo. SUPABASE_DB_URL debe apuntar solo a sandbox. Todavía no
desplegar sobre el candidato nativo: necesita completar fase 3 antes de retirar
su puente.

Para producción, tras validación y autorización separada, repetir los pasos de
Dashboard en instancias de producción, usar CLERK_DOMAIN/CLERK_ISSUER/azp
productivos y sustituir SANDBOX_PROJECT_REF por PRODUCTION_PROJECT_REF en los
comandos. Configurar además POLAR_ENVIRONMENT, POLAR_PRODUCT_MAP,
POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET, CHECKOUT_SUCCESS_URL,
CHECKOUT_CANCEL_URL, OFFLINE_LICENSE_ED25519_PRIVATE_KEY y
OFFLINE_LICENSE_KEY_ID. Los comandos definitivos de cobros/reconciliación quedan
pendientes de fase 2; no presentar este listado como despliegue completo listo
para cobrar.

## Límites

La retirada del login/providers/emails legacy, los clientes y la matriz
monetaria no están entregados. Retención fiscal/soporte y purga de otros
contenidos RGPD siguen pendientes; no se declara borrado universal. Sin
dependencia nueva, producción, pagos reales, secretos, merge, promoción, release
ni subagentes.
