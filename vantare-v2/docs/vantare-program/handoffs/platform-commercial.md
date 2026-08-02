# Handoff vivo — plataforma comercial (Billing)

Estado: ISA-166 reconciliada; BIL-03 / ISA-72 implementada en rama aislada y pendiente de review; venta pública **NO-GO**.

Base de BIL-03: ISA-166 `c6a3ebf2181e6764a1b204e231cab4a348e3ab95`.

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
6. ISA-166 y la issue BIL activa en Linear.

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

ISA-166 sustituye a ISA-89 como gate vigente. Tras revisión independiente de
este corte, la siguiente implementación es **BIL-02 / ISA-68**. Después se sigue
el orden BIL-03, BIL-04 en paralelo cuando sea seguro, BIL-05..BIL-13.

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
  intento; un resultado incierto se bloquea en vez de arriesgar duplicados.
- Portal usa `PORTAL_RETURN_URL` y `PORTAL_RETURN_URL_ALLOWLIST` como lista JSON
  de URLs HTTPS exactas. El cliente normal envía un body vacío.
- Sandbox y production no pueden cruzarse ni por mapping, API host o URL alojada.
- No hubo deploy, migración remota, datos de customers, pagos ni cambios en Polar.
- Informe: `docs/analysis/isa-72-bil-03-checkout-mapping-portal-hardening-2026-08-02.md`.

## Riesgos que mantienen NO-GO

- Inbox actual no garantiza efectos completos ante fallo parcial.
- No hay reconciliación monotónica ni grants independientes completos.
- Subscription, recovery y refund no cumplen aún el contrato vigente.
- Cache offline y dispositivo necesitan integridad y vinculación correctas.
- Supabase necesita hardening y recuperación verificable.
- Catálogo/organización/webhook Polar no están listos para producción.

## Última actualización

2026-08-02 — ISA-72 / BIL-03, worker de implementación aislada. Tests backend y
frontend verdes; pgTAP pendiente de un entorno local con historial de migraciones
coherente. Sin deploy, pago, refund, secretos, PII ni mutaciones remotas.
