# BIL-09 — Matriz sandbox del ciclo de vida comercial

## Propósito

Este corte comprueba que el catálogo aprobado y los motores de BIL-02 a BIL-08
convergen hacia el mismo resultado comercial sin pagos, cuentas o servicios
reales. La fixture es exclusivamente `sandbox`, usa UUID reservados y no es una
configuración desplegable.

Fuentes ejecutables:

- `supabase/functions/_shared/test-fixtures.ts`: catálogo sintético completo.
- `supabase/functions/billing-webhook/testdata/lifecycle-matrix.v1.json`:
  estados de suscripción versionados.
- `supabase/functions/billing-webhook/lifecycle-matrix.test.ts`: contrato
  transversal sobre las funciones reales.

## Catálogo esperado

| Producto | Tipo | Capabilities | Canales | Trial |
|---|---|---|---|---|
| Launch Edition | Pago único | `launch_v1`, Testers | Stable, Testers | No |
| Pro | Suscripción | Pro | Stable | 7 días con antiabuso confirmado |
| Pro Plus | Suscripción | Pro, Testers, Nightly | Stable, Testers, Nightly | No |

## Suscripciones: evento → precondición → resultado

| Escenario remoto | Precondición relevante | Resultado esperado |
|---|---|---|
| `trialing` | Trial Pro explícitamente habilitado | Acceso hasta `paidThrough` |
| `active` / renovación | Fin de periodo futuro demostrado | Acceso hasta el nuevo `paidThrough` |
| `canceled` al final | `cancelAtPeriodEnd=true` | Acceso solo hasta el periodo pagado |
| `uncanceled` | Fin de periodo futuro | Se conserva el acceso pagado |
| `past_due` | Ciclo pagado local demostrado | No extiende `paidThrough`; abre recuperación |
| `past_due` sin evidencia | Sin ciclo pagado fiable | Revocado, sin inventar recuperación |
| `unpaid` / `revoked` | Cualquier estado anterior | Revocado |
| Estado desconocido | Contrato proveedor no reconocido | Revocado (fail closed) |

La ventana de recuperación de 72 horas pertenece al registro de recuperación;
nunca convierte una fecha vencida en una fecha pagada nueva.

## Reconciliación y compras

- Customer State puede activar Pro/Pro Plus y beneficios conocidos.
- Una suscripción local ausente del snapshot remoto se revoca.
- Una compra lifetime se preserva: no se infiere su ausencia desde el listado de
  suscripciones.
- El mismo plan ejecutado dos veces produce `applied` y después `unchanged`.
- Orders se materializan antes que refunds aunque las páginas lleguen invertidas.
- Un refund parcial mantiene su grant; solo la suma confirmada igual o superior
  al importe atribuible revoca esa compra.
- Otra compra independiente permanece activa.
- Producto, order o refund no atribuible queda en quarantine sin grant.

## Cobertura de riesgos anteriores

| Corte | Riesgo protegido por BIL-09 |
|---|---|
| BIL-01 | Catálogo exacto por entorno, capabilities y canales |
| BIL-02 | Duplicados/reintentos no deben repetir el resultado comercial |
| BIL-03 | La identidad de cuenta se mantiene separada de IDs comerciales |
| BIL-04 | Grants independientes, sin colapsar productos |
| BIL-05 | Customer State converge y falla cerrado ante datos desconocidos |
| BIL-06 | `paidThrough` y recuperación no se amplían artificialmente |
| BIL-07 | Refund atribuible revoca solo su compra; compras múltiples sobreviven |
| BIL-08 | El estado final conserva capacidades y canales que firma la credencial |

Los tests unitarios existentes siguen siendo la cobertura detallada de inbox,
leases, quarantine/replay, fallos parciales y conflictos de versión. Esta matriz
no los duplica: demuestra que sus salidas encajan en un contrato completo.

## Límites y operación

- No ejecuta checkout, pago, refund, portal, webhook remoto ni deploy.
- No contiene PII, emails, tokens, firmas ni IDs reales de Polar/Supabase.
- No autoriza venta pública. Los smoke monetarios controlados siguen pendientes.
- Una versión nueva de la fixture exige incrementar `schemaVersion` o crear un
  archivo nuevo; no se reescribe evidencia histórica silenciosamente.

## Verificación

```powershell
deno test --node-modules-dir=auto --allow-env --allow-read --no-lock --no-check `
  supabase/functions/billing-webhook/lifecycle-matrix.test.ts

$tests = Get-ChildItem supabase/functions -Recurse -Filter '*.test.ts' |
  Where-Object { $_.FullName -notmatch '_deprecated' } |
  ForEach-Object { $_.FullName }
deno test --node-modules-dir=auto --allow-env --allow-read --no-lock --no-check @tests
```
