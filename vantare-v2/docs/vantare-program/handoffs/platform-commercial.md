# Handoff vivo — plataforma comercial (Billing)

Estado: ISA-179 / BIL-04B integra de forma controlada BIL-02, BIL-03 y BIL-04;
matriz conjunta completa, pendiente de review independiente y venta pública
**NO-GO**.

Entradas exactas: BIL-02 `08bb83a959dee601ca5884fba6ac96b399c5e2bd`,
BIL-03 `2a6288a36e368b322e8262534988277d1e16025e` y BIL-04
`eea8b760dc382c82c3f6b9f193782f9e1469b8d7`. Base común:
ISA-166 `c6a3ebf2181e6764a1b204e231cab4a348e3ab95`.

## Procedencia y alcance

Este handoff incorpora selectivamente el contexto vivo de plataforma comercial
documentado originalmente en el commit `67e263392b2192ee11f2ef4ccb161331dda3c735`.
No importa otros cambios posteriores, no convierte esta rama histórica en base
global y no sustituye el flujo de ramas vigente del repositorio principal.

Leer, por orden:

1. `docs/analysis/isa-166-polar-catalog-policy-reconciliation-2026-08-01.md`.
2. `docs/adr/0003-proposed-polar-commercial-authority.md`.
3. `docs/analysis/isa-7-polar-target-billing-architecture-2026-07-14.md`.
4. `docs/analysis/isa-7-supabase-architecture-audit-2026-07-14.md`.
5. `docs/analysis/isa-89-polar-catalog-commercial-policies-2026-07-14.md`
   únicamente como snapshot histórico.
6. `docs/billing/bil-02-webhook-inbox-runbook.md`.
7. `docs/analysis/isa-179-bil-04b-controlled-integration-2026-08-02.md`.
8. ISA-179 y las issues BIL relacionadas en Linear.

## Fronteras de autoridad

- Polar: productos, precios, customer comercial, orders, subscriptions,
  refunds y estado comercial.
- Supabase: identidad y almacenamiento operacional; se mantiene KEEP+HARDEN.
- Vantare: capabilities, dispositivo, leases offline y resolución de acceso.
- Stripe: legado histórico inerte hasta BIL-12, nunca runtime paralelo.

## Contrato vigente

- Pro: 4,99 EUR/mes, Stable.
- Pro Plus: 9,99 EUR/mes, Pro + Testers/Beta + Nightly.
- Launch Edition: 30 EUR una vez, alcance adquirido de por vida + Testers/Beta,
  nunca Nightly por sí sola.
- Trial Pro: siete días, método de pago, conversión y recordatorio; una vez por
  cuenta/método solo si el proveedor puede demostrarlo.
- Primer fallo de renovación: recuperación técnica máxima de 72 horas, separada
  de `paidThrough`; después, modo gratuito.
- Offline: Launch perpetuo para su alcance; subscription hasta expiración
  firmada; renovar exige conexión.
- Identidad: UUID de cuenta. Un dispositivo activo, reemplazable mediante login.
- Refund total revoca únicamente el grant atribuible; refund parcial no revoca
  automáticamente. Grants de compras distintas son independientes.

## Estado remoto observado el 2026-08-01

- Pro y Launch existen con precio e intervalo correctos.
- Pro Plus no existe.
- Pro no tiene trial; metadata y benefits están vacíos.
- Pagos, renovaciones, refunds y payouts están deshabilitados.
- El webhook está activo pero no incluye `customer.state_changed`,
  `subscription.uncanceled`, `refund.*` ni `benefit_grant.*`.
- No se realizó ninguna mutación remota ni se consultó PII.

## Orden y siguiente acción

ISA-166 sustituye a ISA-89 como gate de catálogo. BIL-02 / ISA-68 está
implementada en su rama aislada: reemplaza el claim prematuro de
`license_events` por inbox durable, leases atómicos, efectos reanudables,
quarantine y replay auditado. Sigue pendiente de review independiente y no está
desplegada. Después se sigue el orden BIL-03, BIL-04 en paralelo cuando sea
seguro, BIL-05..BIL-13.

Cada issue usa rama/worktree propios, TDD y review. La promoción sigue la política
vigente de la plataforma; esta rama no promueve, no hace merge y no habilita
billing. Pagos, refunds, cambios productivos y publicación requieren su gate.

## BIL-03 / ISA-72

- Mapping v2 exige entorno explícito, versión de catálogo, organización, IDs de
  producto y precio simétricos, capabilities, canales y alcance Launch v1.
- Launch y Pro son obligatorios. Pro Plus es una key reconocida, pero permanece
  indisponible hasta que exista un producto/precio aprobado; no hay IDs ficticios
  en runtime.
- El trial permanece desactivado. Solo puede habilitarse para Pro, exactamente
  siete días y con `POLAR_TRIAL_ANTI_ABUSE_CONFIRMED=true` además del contrato.
- Checkout usa `auth.uid()` UUID y `attemptId` UUID. La tabla server-only
  `billing_checkout_attempts` evita una segunda llamada remota para el mismo
  intento; un resultado incierto se bloquea en vez de arriesgar duplicados. Los
  intentos caducan en 30 minutos, una URL vencida no se reutiliza y la limpieza
  posterior queda acotada.
- Portal usa `PORTAL_RETURN_URL` y `PORTAL_RETURN_URL_ALLOWLIST` como lista JSON
  de URLs HTTPS exactas. El cliente normal envía un body vacío.
- Sandbox y production no pueden cruzarse ni por mapping, API host, URL alojada
  o identidad en `billing_customers`. Filas legacy sin entorno quedan en
  cuarentena hasta reconciliación explícita.
- Timeout y cancelación cubren también la lectura/validación del body de Polar.
- No hubo deploy, migración remota, datos de customers, pagos ni cambios en Polar.
- Informe: `docs/analysis/isa-72-bil-03-checkout-mapping-portal-hardening-2026-08-02.md`.

## Riesgos que mantienen NO-GO

- El inbox durable de BIL-02 queda integrado localmente, pero ISA-179 aún no
  está revisada ni desplegada.
- `price_id_to_checkout_key` aún no gobierna el webhook ni los grants; por ahora
  el lifecycle resuelve producto y conserva esa deuda explícita, sin falsa GO.
- No hay reconciliación monotónica ni grants independientes completos.
- Subscription, recovery y refund no cumplen aún el contrato vigente.
- Cache offline y dispositivo necesitan integridad y vinculación correctas.
- Supabase necesita hardening y recuperación verificable.
- Catálogo/organización/webhook Polar no están listos para producción.

## BIL-02 / ISA-68

- Recepción durable antes de efectos con identidad `(provider,event_id)` y
  SHA-256; claim/lease atómico, estados explícitos, retry acotado y recuperación
  de leases huérfanos.
- Efectos idempotentes separados del inbox: una reanudación omite los ya
  completados y repite únicamente los pendientes; `license_events` queda como
  auditoría y no como claim prematuro.
- Replay administrativo auditado, tablas y RPC restringidas a `service_role`,
  payload minimizado y sin persistir emails del webhook.
- Retry programado y worker ocupado responden `503` con `Retry-After` derivado
  del estado durable mientras no exista scheduler. El runbook documenta la
  operación y el pgTAP original cubre 53 aserciones, concurrencia y rollback.

## BIL-04 / ISA-88

- Intento OAuth creado antes del navegador, ligado a provider/state, con expiración, consumo atómico y una sola aceptación incluso bajo concurrencia.
- Bridge de sesión global, Supabase solo en memoria del WebView, Credential Manager como persistencia exclusiva, rotación protegida contra session fixation y logout request/ack fail-closed.
- Restore, rotación y borrado quedan serializados; credenciales protegidas inválidas/corruptas —incluido un blob nulo o vacío de Credential Manager— se eliminan y una rotación concurrente no puede resucitar la sesión tras logout.
- Separación explícita entre claim de dispositivo y lectura pura de entitlements; wrapper legacy ya no muta.
- RPCs con grants mínimos, `SECURITY DEFINER`/`search_path` endurecido también para checkout, `device_bound` honesto, reset con fingerprint real y carreras concurrentes.
- `validate-license` archivada fuera de la superficie desplegable; verificador automático permite solo checkout, portal y webhook, y un workflow de despliegue dedicado obliga a pasar por el wrapper protegido.
- PostgreSQL 17 desechable valida clean install, upgrade, 48 pgTAP y restore fail-closed con RLS, grants y centinela; añade carreras claim/reset y reset/reset y rechaza dumps truncados/corruptos en PowerShell 5.1/7. Estado remoto de RLS/migraciones/backups/PITR no pudo confirmarse sin ampliar acceso y sigue como gate.
- Informe: `docs/analysis/isa-88-bil-04-supabase-hardening-recovery-2026-08-02.md`.

## Última actualización

2026-08-02 — ISA-179 / BIL-04B compone el inbox durable de BIL-02 con el
aislamiento por entorno y el hardening de BIL-03/04. La simulación previa, la
resolución de ownership y la matriz Deno/PostgreSQL/Go/frontend/guards quedan
documentadas y verdes. BIL-05 solo puede partir del SHA canónico de ISA-179 tras
review independiente. Sin deploy, pago, refund, replay remoto, secretos, PII ni
mutaciones Polar/Supabase.
