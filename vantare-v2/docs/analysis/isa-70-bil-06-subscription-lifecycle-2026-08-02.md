# ISA-70 / BIL-06 — ciclo de suscripción y recuperación de pago

Fecha: 2026-08-02
Base exacta aceptada (BIL-05): `c5109edad1a6261d6cadd9cbe3d7fc728be4a5e6`
Estado: candidato implementado en rama aislada; sin deploy, pagos ni mutación remota.

## Objetivo y resultado

BIL-06 convierte el estado remoto de una suscripción en acceso local acotado y
auditable. Polar continúa siendo la autoridad comercial. Vantare conserva la
proyección operacional, pero ya no interpreta `past_due` como un periodo pagado
ni permite que reintentos o eventos fuera de orden amplíen el acceso.

La política comercial no incluye un periodo de gracia independiente. Existe una
recuperación técnica de pago de hasta 72 horas, ligada al ciclo pagado que acaba
de fallar. Al terminar esa ventana, el usuario vuelve al modo gratuito. Una
compra lifetime u otra fuente independiente permanece intacta.

## Contrato temporal

El acceso se evalúa con límite exclusivo: `evaluated_at < valid_until`. En el
instante exacto de expiración el grant ya no concede acceso, aunque el proceso
de limpieza periódico todavía no haya actualizado su fila.

| Estado demostrado | Grant de suscripción | Recuperación |
| --- | --- | --- |
| `trialing` permitido por catálogo | Activo hasta el fin de trial demostrado | No |
| `active` | Activo hasta `current_period_end` demostrado | Cierra recuperación anterior |
| `uncanceled` | Activo hasta `current_period_end` demostrado | Cierra recuperación anterior |
| `canceled` al final de periodo | Activo solo hasta el periodo ya pagado | No se amplía |
| `past_due` | No inventa tiempo pagado | Fuente separada, máximo 72 h |
| `incomplete` / `incomplete_expired` | Revocado | No |
| `unpaid` / `revoked` / cancelación inmediata | Revocado | Cierra recuperación |

Los estados acotados (`active`, `trialing`, `uncanceled`, `past_due` y
cancelación al final de periodo) se ponen en quarantine si Polar no demuestra
`current_period_end`. Los estados terminales pueden revocar sin ese campo.

## Recuperación por ciclo

La identidad de recuperación incluye entorno, suscripción y `paidThrough` del
último ciclo pagado demostrado. Su fuente es independiente de la suscripción
comercial y puede vivir después de `paidThrough`: termina como máximo en
`firstFailure + 72 h`. No modifica ni prolonga `paidThrough`. Repetir el mismo
evento, replay, reconciliación o retry no reinicia el reloj.

Una evidencia antigua solo puede acortar una recuperación ya existente del
mismo ciclo exacto. Nunca crea una recuperación retrospectiva, nunca modifica
otro ciclo y nunca extiende el plazo. Una renovación posterior cierra la fuente
anterior; un fallo del nuevo ciclo crea una identidad nueva.

Las capabilities se toman del mapping comercial vigente en cada aplicación.
Una capability retirada del producto se revoca también en la fuente de
recuperación y no puede reaparecer desde grants históricos.

## Integración y convergencia

- El webhook aplica la proyección monótona de BIL-05 y el efecto lifecycle
  reanudable. Un fallo parcial conserva el efecto pendiente para replay.
- Un evento `stale_noop` solo puede aportar una primera evidencia anterior para
  acortar el mismo ciclo ya abierto; no altera la proyección comercial.
- Reconciliación calcula el mismo contrato, incluyendo ausencia remota,
  `past_due`, trial y múltiples capabilities de Pro Plus.
- Dry-run no aplica lifecycle. Apply repetido converge sin ampliar acceso.
- Dos workers concurrentes se serializan en PostgreSQL y conservan una sola
  ventana por ciclo.
- La lectura de entitlements filtra la expiración en cada petición; el RPC de
  expiración es limpieza operacional, no la frontera de autorización.

## Migración y fail-closed

La migración añade el estado canónico de ciclo y las fuentes de recuperación.
Datos legacy sin evidencia temporal suficiente se revocan. No se fabrica una
ventana nueva a partir de `updated_at`, no se convierte `past_due` histórico en
acceso indefinido y no se reinterpreta un trial legacy como válido sin mapping.

Las tablas y RPC permanecen server-only con RLS. No existe un writer desde el
cliente ni se exponen tokens, emails o payloads completos.

## Evidencia ejecutada

- Suite Deno activa completa: **144/144 PASS**.
- Suite focal de lifecycle, webhook, reconciliación y Polar: **84/84 PASS**.
- `deno check` de processors, stores, reconciliación y comando: **PASS**.
- PostgreSQL 17 desechable: clean install, upgrade y restore **PASS** con 48
  hardening + 53 inbox + 43 proyección + 17 reconciliación + 51 lifecycle.
- Upgrade legacy: 11 regresiones existentes + 8 lifecycle **PASS**.
- Concurrencia: inbox, device, reconciliación y lifecycle **PASS**.
- Restore corrupto o truncado, sentinel, RLS y grants: **PASS fail-closed**.
- Casos explícitos: límites exactos, retries, evento antiguo, conflicto de
  versión, trial, cancelación, Pro Plus, capability retirada, nueva renovación,
  fuente lifetime independiente y ausencia remota.

## Riesgos y límites

- El catálogo remoto todavía no demuestra Pro Plus ni trial; los paths existen
  pero siguen fail-closed hasta que BIL-01 autorice esos productos.
- La migración y el scheduler no se desplegaron. El cleanup debe invocar
  `billing_expire_subscription_grants(now())` desde un proceso server-side
  autorizado; nunca se editan grants manualmente.
- Refunds, chargebacks, ledger y política de devolución pertenecen a BIL-07.
- No hubo checkout real, cobro, refund, deploy, promoción de rama ni mutación
  en Polar o Supabase.
- Venta pública continúa **NO-GO**.

## Rollback

Antes de deploy, revertir el commit elimina el candidato. Si la migración ya se
aplicó, el rollback debe ser forward-only: detener callers, conservar auditoría
y desplegar una migración correctiva. No borrar tablas o grants con datos.
