# Handoff vivo — plataforma, cuenta y comercial

Última revisión técnica: 2026-08-11.
Estado operativo: consultar Linear y Git; este documento no autoriza dinero,
deploy, promoción, release ni comunicación pública.

## Resultado y fronteras

Plataforma reúne cuenta, licencia, Billing, calendario, ajustes, roadmap,
releases y migración de raíz. Polar posee comercio; Supabase identidad y estado
operacional. Testing Center es un proyecto independiente y solo mantiene aquí
una entrada temporal hasta disponer de handoff propio.

## Autoridad técnica

- [Contrato de producto](../product-contract.md) y [política](../execution-policy.md).
- [ADR 0008](../../adr/0008-polar-commercial-authority.md).
- [Arquitectura de licencia](../../licensing-auth-architecture.md) y
  [Billing](../../billing/).
- [Canales](../../branch-channels.md) y [runbook beta](../../release-beta-operations-runbook.md).
- [ADR 0007](../../adr/0007-testing-center-linear-operational-authority.md).

## Estado técnico actual

Billing dispone de inbox durable, efectos idempotentes, grants independientes,
reconciliación monotónica, ledger atribuible, separación sandbox/producción y
credencial offline Ed25519 ligada a cuenta/dispositivo. Los accesos operativos
Tester, Tester Nightly y Owner están separados de planes comerciales. Replay,
reparación, deploy y producción siguen bajo autorización.

La sesión WebView puede restaurarse tras OAuth externo. La migración de raíz
continúa bloqueada por worktrees activos: debe preservar historia y secretos,
simularse y tener rollback. El flujo de ramas es issue → Nightly → Testers →
Master; terminar una entrega no la promociona.

Testing Center conserva diagnóstico allowlisted, preview byte-exacto,
deduplicación, triage y feedback estructurado. Supabase es autoridad interna y
Linear la proyección operativa; GitHub queda para código, PR y CI. Codex,
Discord y efectos remotos no se infieren de contratos locales.

## Decisiones cerradas

- Polar posee productos, precios, orders, subscriptions y refunds.
- Un refund total atribuible revoca solo su grant; ambigüedad falla cerrada.
- Secretos viven fuera del cliente y del repositorio; el build solo incorpora
  claves públicas.
- Builds de canal requieren entitlement firmado y artefactos verificables.
- Borrado remoto, cobros, refunds, producción y Master requieren a Isaac.
- Los reportes libres requieren opt-in y preview; logs siguen desactivados por
  defecto cuando no existe un buffer productivo demostrable.

## Riesgos y bloqueos

- **P0:** conceder o revocar acceso comercial incorrectamente.
- **P0:** perder trabajo durante la migración de raíz.
- **P1:** mezclar roles operativos con catálogo comercial.
- **P1:** publicar una build sin updater, rollback o artefactos completos.
- **P1:** activar integraciones remotas desde evidencia local o sintética.

## Recomendación técnica

Continuar solo por el corte que Linear autorice. Antes de dinero o producción,
repetir la matriz monetaria end-to-end y presentar dry-run, backup y rollback.
Antes de migrar la raíz, inventariar todos los worktrees y ensayar la operación
en una copia recuperable.

## Evidencia

- [Matriz BIL-09](../../billing/bil-09-lifecycle-matrix.md).
- [Runbook BIL-10](../../billing/bil-10-observability-runbook.md).
- [Acceso operativo BIL-10C](../../billing/bil-10c-operational-access-runbook.md).
- [Testing Center UI](../../runbooks/testing-center-ui.md).
- [Outbox Linear](../../runbooks/testing-center-linear-outbox.md).
- [Feedback de candidatas](../../runbooks/testing-center-candidate-feedback.md).

## Historial

- [Cronología completa hasta 2026-08-10](../../archive/2026-08/handoffs/platform-commercial-through-2026-08-10.md).
