# ISA-71 / BIL-07 — Ledger atribuible de orders y refunds

Fecha: 2026-08-02

Estado: candidato aislado, sin deploy ni promoción

Base exacta aceptada: BIL-06 `f8803988c945b6eda63e871e333bd7205b93ccb1`

Rama: `vantareapp/isa-71-bil-07-ledger-de-orders-y-refunds`

## Resultado

BIL-07 sustituye la revocación implícita por nombre de evento por un ledger
server-only donde cada compra y cada refund conservan identidad propia. El
acceso de Launch Edition se deriva únicamente de la suma de refunds
`succeeded` identificados y atribuibles a esa order.

El corte no emite refunds, no consulta customers/orders reales, no despliega y
no habilita billing. La venta pública continúa **NO-GO**.

## Contrato implementado

- Cada `order.paid` one-time válida crea o actualiza una fuente independiente
  por `environment + order_id`.
- Un refund parcial confirmado conserva activo el grant de esa compra.
- Varios refunds parciales solo revocan al alcanzar exactamente el importe
  refundable demostrado de la order.
- `pending`, `failed` y `canceled` se auditan, pero nunca revocan.
- Un refund `succeeded` no puede retroceder posteriormente a otro estado.
- `order.refunded.refunded_amount` se conserva como dato agregado de
  reconciliación; nunca sustituye a refunds identificados.
- Dos compras del mismo producto son fuentes distintas. El refund de una order
  antigua no puede modificar el grant de una compra posterior.
- Identidad ausente o contradictoria —order, refund, payment, cuenta, producto,
  checkout, moneda o importe— falla cerrada y queda disponible para quarantine
  y replay auditado.
- Las orders conocidas de subscriptions se ignoran sin ruido y no entran en
  este ledger. Un refund aislado que no puede atribuirse a una order one-time
  queda en quarantine. En ambos casos el acceso sigue gobernado exclusivamente
  por BIL-06.
- Los eventos se ordenan por `modified_at + snapshot_hash`; duplicados son
  idempotentes, versiones antiguas son no-op auditado y colisiones de versión
  no mutan acceso.

## Customer balance

Polar documenta que `applied_balance_amount` modifica el máximo refundable.
BIL-07 no adivina esa fórmula: el runtime actual exige el campo y acepta solo
valor cero. Un valor ausente, negativo o distinto de cero va a quarantine y no
puede revocar acceso. Una reconciliación futura podrá ampliar este soporte
cuando exista un contrato probado para balance, impuestos y refund máximo.

Fuentes primarias:

- [Polar — Get Order](https://polar.sh/docs/api-reference/orders/get).
- [Polar — Manage Refunds](https://polar.sh/docs/features/refunds).
- [Polar — order.refunded](https://polar.sh/docs/api-reference/webhooks/order.refunded).
- [Polar — refund.updated](https://polar.sh/docs/api-reference/webhooks/refund.updated).

## Persistencia y privacidad

La migración `20260802120000_billing_order_refund_ledger.sql` crea:

- `billing_orders`: UUID de cuenta local, entorno, IDs técnicos de order,
  product y checkout, estados, importes mínimos, moneda, versión y hash.
- `billing_refunds`: IDs técnicos de refund, order y payment, estado, importe,
  moneda, versión y hash.
- RPCs server-only para registrar snapshots monótonos y sincronizar únicamente
  los grants de la order afectada.

Ambas tablas tienen RLS, carecen de grants para `anon` y `authenticated`, y no
duplican email, nombre, dirección, recibo ni otros datos fiscales. La
proyección rechaza colisiones de propietario tanto en recursos como en grants.

## Reconciliación

`order-refund-reconciliation.ts` aplica primero todas las orders y después los
refunds, aunque las páginas remotas lleguen desordenadas. Solo sincroniza una
order si todas sus observaciones son seguras y el producto conserva un mapping
conocido. Cualquier hueco devuelve una issue determinista; no borra historia ni
ejecuta acciones remotas.

El servicio es una pieza pura y testeable para el job operativo posterior. Este
corte no añade un scheduler ni amplía permisos remotos.

## Replay y fallos parciales

El ledger se escribe antes de marcar su efecto durable como completado. El
resultado monótono se valida antes de avanzar: un conflicto nunca puede quedar
marcado como efecto válido y ser aceptado en un replay posterior. Si falla la
sincronización de acceso después de persistir el ledger, el retry reutiliza la
misma observación y reanuda únicamente el efecto pendiente.

## Evidencia

- Suite Deno activa de todas las Edge Functions: 164/164 PASS.
- Suite focal order/refund y processor: cubre partial/total, múltiples refunds,
  estados no succeeded, balance, identidad de payment, replay y fallo parcial.
- PostgreSQL 17 desechable: clean install, upgrade desde BIL-06 y restore PASS;
  37/37 aserciones propias además de RLS, grants, ownership, dos purchases,
  refund antiguo, duplicados y orden monótono. Dos observaciones concurrentes
  del primer snapshot de una order convergen en una sola fila (`apply` +
  `duplicate`) sin error de unicidad.
- `git diff --check` y escaneo de secretos/PII forman parte del gate precommit.

Los números definitivos se registran en el comentario de entrega de Linear una
vez ejecutado el último gate sobre el diff cerrado.

## Riesgos y límites

- El webhook remoto observado todavía no incluye `refund.created` y
  `refund.updated`; BIL-07 no autoriza modificarlo.
- Pagos, renovaciones, refunds y payouts siguen deshabilitados en el snapshot
  comercial conocido.
- `applied_balance_amount != 0` no está soportado automáticamente y requiere
  reconciliación.
- No existe todavía evidencia sandbox de un refund monetario real; pertenece a
  BIL-09/BIL-11 y requiere gate humano.
- Disputes/chargebacks y política operativa posterior permanecen fuera de este
  corte salvo cuando Polar los materialice como refund atribuible y confirmado.

## Veredicto

El diseño elimina la revocación global insegura y representa correctamente
refunds parciales/totales por fuente. Puede pasar a review técnico aislado si
los gates finales permanecen verdes. No es un GO de venta, deploy o promoción.
