# Runbook BIL-07 — Orders y refunds atribuibles

## Objetivo

Operar y diagnosticar el ledger local de compras one-time y refunds sin emitir
acciones monetarias ni revocar una fuente equivocada.

## Invariantes

1. Solo `billing_reason=purchase`, producto Launch one-time conocido y
   `subscription_id=null` entran en el ledger.
2. `order.refunded` agregado nunca revoca por sí solo.
3. Solo refunds identificados con `refund_id + order_id + payment_id`, estado
   `succeeded`, moneda coherente y suma demostrada pueden revocar.
4. Refund parcial conserva acceso; refund total revoca únicamente esa order.
5. Una subscription nunca se cancela mediante este flujo.
6. Eventos ambiguos, datos missing, balance aplicado o conflictos de ownership
   quedan cerrados y se reconcilian; nunca se corrigen suponiendo valores.

## Estados esperados

### Order

- `paid`: agregado reembolsado cero.
- `partially_refunded`: agregado mayor que cero y menor que `net_amount`.
- `refunded`: agregado igual a `net_amount`.

### Refund

- `pending`: sin efecto de acceso.
- `succeeded`: suma atribuible para la order.
- `failed`: sin efecto de acceso.
- `canceled`: sin efecto de acceso.

Un refund `succeeded` es terminal para el ledger local; un evento posterior no
puede degradarlo.

## Quarantine y diagnóstico

Revisar primero el motivo sanitizado del inbox. Casos esperados:

- identidad o amount/currency ausente;
- order no encontrada por entrega fuera de orden;
- producto o tipo de billing desconocido;
- mismo ID con propietario, producto, checkout, payment, moneda o importe
  contradictorio;
- mismo `modified_at` con otro hash;
- suma de refunds superior al importe de la order;
- `applied_balance_amount` ausente o distinto de cero.

No editar tablas manualmente ni marcar un efecto como completado. Obtener un
snapshot read-only autorizado, normalizar orders antes de refunds y ejecutar la
misma reconciliación determinista. El dry-run debe quedar sin issues antes de
aplicar cualquier reparación local.

## Replay seguro

1. Confirmar que el payload minimizado conserva IDs, estados, importes, moneda,
   `modified_at`, `billing_reason`, `subscription_id` y balance aplicado.
2. Confirmar que la order pertenece al mismo entorno y cuenta.
3. Repetir mediante el replay administrativo auditado del inbox.
4. Verificar el resultado del ledger antes del efecto de acceso.
5. Si sigue en quarantine, detenerse; no forzar la proyección.

## Verificación local

```powershell
$tests = Get-ChildItem supabase/functions -Recurse -Filter '*.test.ts' |
  Where-Object { $_.FullName -notmatch '_deprecated' } |
  ForEach-Object { $_.FullName }
deno test --allow-env --allow-read @tests
./supabase/tests/run-supabase-hardening-postgres.ps1
git diff --check
```

El runner PostgreSQL debe validar instalación limpia, upgrade, restore, RLS,
grants y los 37 casos de order/refund. Ningún check local autoriza deploy ni un
refund real.

## Rollback

Antes de cualquier deploy, el rollback es abandonar esta rama: no existe estado
remoto que revertir.

Si en el futuro la migración ya estuviera desplegada:

1. desactivar el worker/flag de billing y detener nuevos efectos;
2. volver al runtime BIL-06 sin ejecutar revocaciones desde agregados;
3. conservar inbox, `billing_orders` y `billing_refunds` como evidencia;
4. no borrar ni truncar tablas y no emitir refunds/cancelaciones;
5. restaurar desde backup probado solo ante corrupción demostrada;
6. corregir mediante una migración forward y reconciliación read-only previa.

No se incluye una down migration destructiva porque perder el ledger impediría
auditar o reconciliar grants ya observados.

## Stop conditions

Detener la operación ante:

- customer balance no cero;
- ownership o mapping contradictorio;
- refund sin order/payment atribuible;
- suma superior al máximo demostrado;
- diferencias entre clean, upgrade y restore;
- necesidad de pago/refund real, secreto, PII o mutación productiva.
