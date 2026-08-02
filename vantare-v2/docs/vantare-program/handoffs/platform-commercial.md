# Handoff vivo — plataforma comercial (Billing)

Estado: reconciliación ISA-166 en curso; venta pública **NO-GO**.

Base de esta rama: ISA-89 `7a570655253ea8c4e51047f6ebd2e97e3a49f8a6`.

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

## Riesgos que mantienen NO-GO

- Inbox actual no garantiza efectos completos ante fallo parcial.
- No hay reconciliación monotónica ni grants independientes completos.
- Subscription, recovery y refund no cumplen aún el contrato vigente.
- Cache offline y dispositivo necesitan integridad y vinculación correctas.
- Supabase necesita hardening y recuperación verificable.
- Catálogo/organización/webhook Polar no están listos para producción.

## Última actualización

2026-08-01 — ISA-166 / BIL-01B, worker documental. Sin código, deploy, pago,
refund, migración, secretos, PII ni mutaciones remotas.
