# Creador desde la renovación · VANTA-83 / #1661 · ronda 4

Decisión Isaac: el primer periodo no recibe descuento de creador. El código
atribuye la venta y puede acompañar al lanzamiento. Pro 5,99/59,99 EUR, primer
periodo 3,99/39,90; Pro Plus 9,99/99,90, primer periodo 6,99/69,90. La promoción
inicial sigue siendo once del 26-oct al 26-nov-2026 19:00 Madrid.

## Configuración y duración

Fuente única `supabase/functions/scripts/polar-launch-prices.json`:
`creator_discount_basis_points=2000`; `creator_renewals` configura 11 meses para
mensuales y 12 para anuales, anclados en la primera renovación con descuento.
Mensual: meses 2–12; anual: una renovación anual desde el segundo año. La
comisión conserva 30 % mes 1 / 10 % meses 2–12, sin pago automático ni extensión
por la oferta anual. Cambiar esta tabla no altera cupones históricos: preflight
rechaza drift y requiere revisión manual.

Polar cuenta repeating desde el primer ciclo en que lo utiliza; asociarlo tras
el cobro inicial no rebaja esa factura. Documentación primaria:
[Create Discount](https://polar.sh/docs/api-reference/discounts/create),
[modelo de expiración](https://github.com/polarsource/polar/blob/main/server/polar/models/discount.py),
[aplicación a ciclos](https://github.com/polarsource/polar/blob/main/server/polar/subscription/service.py).
La comprobación real de calendario, IVA y primera renovación sigue en checklist
sandbox; los tests locales no acreditan una factura de Polar.

El script con `--creator CODE` crea dos cupones sin `code` público, restringidos
respectivamente a normales mensuales/anuales. Salida `creator_discounts[CODE]`
y `creator_annual_discounts[CODE]`. Ninguno entra en el primer checkout.
La miniapp Owner crea ambos en sandbox y registra los dos IDs por intervalo. El operador incorpora ambos IDs al mapa de checkout. No se adoptan
cupones históricos de dos meses ni se modifica su comportamiento silenciosamente.

## Flujo y recuperación

1. POST billing-checkout `{productKey,attemptId,creatorCode?}` con OAuth de la
   cuenta. Solo código exacto allowlisted, sin IDs ni importes del cliente.
2. `claim_billing_creator_checkout_attempt` guarda claim y atribución en una
   transacción (rollback completo si el creador no es válido): creador activo, cuenta
   viva, intento creando suscripción. Guarda cuenta/entorno/intento/creador/ID.
   El checkout Polar lleva metadata `creator_code` y solo descuento inicial de
   lanzamiento si aplica. Fuera de campaña: precio normal, sin descuento inicial
   de creador. Sin trial cuando se atribuye creador.
3. Al completar se conserva la binding de checkout. Un order.paid
   subscription_create, ya admitido por identidad/ledger, puede preparar la
   operación. La metadata del webhook no concede atribución. No se crea desde
   un checkout ajeno, una renovación ni una orden sin pagar.
4. `billing_creator_renewal_prepare` fija primera orden y creator ID por
   suscripción, selecciona ganador, guarda perdedor y adquiere lease 60 s.
   GET Polar comprueba ID, producto, precio/moneda/intervalo y estado activo.
   #1680 valida el único precio seleccionado en `subscription.prices`: ID del
   mapa del plan, producto esperado, catálogo fijo EUR y céntimos normales.
   Si llega `price_id` legacy debe coincidir; el intervalo del precio, si llega,
   también. `subscription.amount` debe ser entero y coincidir con el descuento
   gestionado devuelto en `discount`, cuyo ID debe igualar `discount_id`:
   fijo → normal menos `min(amounts.eur, normal)`; porcentaje → normal menos
   `Math.round(normal * (basis_points / 10000))`. Polar redondea el ahorro antes
   de restarlo; no se redondea el importe final. Sin cupón exige importe normal
   y `discount=null`. Datos ausentes/malformados o importe incoherente fallan
   cerrado, sin ACK de éxito. GET y respuesta PATCH usan la misma validación;
   permanecen la allowlist durable y todos los controles del precio base.
   `prices` distinto de una entrada falla antes de autorización/PATCH.
   La respuesta de una escritura incoherente conserva incidencia y retry;
   un GET posterior coherente recupera ACK sin volver a escribir.
   RPC de autorización revalida lease, borrado, pago inicial no reembolsado y
   ausencia de Founders inmediatamente antes del PATCH.
5. PATCH solo discount_id; nunca precio/producto, factura, reembolso o dinero.
   GET ya coincidente no escribe: recuperación de respuesta perdida sin
   reiniciar repeating. Descuento remoto ajeno bloquea y deja incidencia.
   ACK durable solo después de confirmar. Fallo libera lease, registra
   creator_renewal_discount_failed visible Owner y permite retry del inbox.
   La reconciliación de órdenes usa el mismo procesador. No se crea scheduler.

La comisión usa la atribución de la primera compra de la cuenta, independiente
del descuento de esa factura. Se conservan fallback de lectura de descuentos
históricos y liquidaciones ya asentadas, sin reatribuirlas. Los datos privados
son server-only; RPC sin permisos anon/authenticated y search_path vacío.

## Contrato con VANTA-39 / rama isa-1593-descuento-informes

La rama se ha leído, no modificado. Su estado revisado todavía asume creador de
dos meses y tiene escritor propio de descuentos. **Antes de activar ambas
campañas juntas**, #1659 debe adoptar este contrato y coordinar su escritor con
el lease común; no ejecutar dos PATCH independientes. No se afirma integración
ni validación de su rama en esta entrega.

El backend de informes, después de verificar su elegibilidad y saldo, publica
`billing_set_report_renewal_candidate(p_environment,p_user,p_subscription,
p_discount,p_savings,p_valid_until)`. Solo service_role, cuenta/suscripción
ligadas; 200 c Pro o 300 c Plus. Una operación en vuelo bloquea el cambio para
reintentar; una candidatura distinta vuelve pending la selección.
A continuación invoca `applyCreatorRenewal` con cuenta/suscripción/producto/key
servidor, initial=false; el primer pago ya está en la operación durable.
Elige mayor ahorro sobre el normal: Pro creador 120 c vs informes 200 c;
Plus 200 c vs 300 c. Empate favorece informes. Guarda not_applied y Owner lo ve.
Un fallo no deshace la atribución ni la comisión del primer pago.

El adaptador #1659 debe conservar sus 3/6 cobros totales, caducidad, reembolso,
spam, transferencias y fases clear/attach. Debe conservar también el límite
temporal original del creador al volver de informes: **nunca reasociar el cupón
completo de 11 meses para reiniciar el derecho**. Publicar/retirar candidatura
no inventa ni consume un periodo. No extender un descuento vencido ni retirar
un ID ajeno. Este límite necesita prueba conjunta al integrar las ramas;
la candidatura de informes queda sin publicar hasta esa integración.

Founders no recibe descuentos ni comisión de creador. Incluye Stable y Nightly
vitalicios, y cancela la renovación Pro/Plus al fin pagado sin reembolso. Un
reembolso Founders retira sus derechos y no reactiva la suscripción.

### Producto de lanzamiento histórico · P3-4 / #1682

El guardia del mapa solo admite `polar_product_id` normal. Una suscripción
antigua sobre `polar_launch_product_id` puede quedar bloqueada con incidencia
`creator_renewal_product_mismatch`; esta entrega no amplía la allowlist ni
convierte productos/precios. El catálogo actual aplica once sobre productos
normales y no crea ese caso. Antes de operar suscripciones históricas: inventariar
producto/precio/atribución y decidir su tratamiento en una issue autorizada.
No cambiar el ID por el normal para forzar el ACK ni reaplicar cupones a ciegas.

## Checklist pendiente del operador

- Revisar/copiar mapa real e IDs de cupones antes de desplegar; no hay despliegue.
- Primer checkout con y sin campaña: atribución, precio y un solo cupón inicial.
- Primer order.paid llega antes/después de subscription.created; retry y ACK perdido.
- Próxima factura mensual/anual: creador 20 %, sin modificar factura inicial.
- Calendario 28/29/30/31 y duración real de repeating; IVA de Founders con precio
  configurado y tax_behavior nulo.
- Integración #1659: candidatura posterior al primer pago, mayor ahorro,
  pérdida/expiración/traslado y regreso sin extender ninguno de los derechos.
- Sin servicios comerciales reales, dinero ni capturas en esta entrega.

## Ronda 5 · decisiones F1/F2 y defensas F3/F4/F5

Isaac acepta que cualquier persona que conozca un código activo puede usarlo,
sin vinculación personal ni fecha de caducidad de campaña. Se mantienen el primer
periodo sin descuento de creador y el tramo de renovaciones configurado.

Un reembolso confirmado (parcial incluido) de la factura de origen o de la
suscripción, o subscription.revoked, retira el cupón de creador. Un marcador
privado por cuenta/entorno/suscripción conserva la decisión aunque el evento
llegue antes del primer order.paid. Bloquea nuevas aplicaciones y sus ACK en
vuelo. La retirada espera el lease anterior, hace GET y PATCH solo discount_id=null
cuando coincide con el ID de creador guardado. Cupón ajeno/informes o null no se
modifica; ACK confirma retirada/no aplicabilidad. Replay no repite la escritura.
Fallo deja pending e incidencia creator_renewal_revocation_failed en Owner.
Una observación activa/reconciliación vuelve a intentar solo retiradas ya
solicitadas: no inicia revocaciones por sí sola. Si Polar rechaza PATCH en una
suscripción terminal, conserva pendiente visible; no afirma haber retirado el
cupón. Reintenta si vuelve activa y requiere revisión antes de reactivarla.
No hay refunds ni cancelaciones adicionales automáticos.

Los cupones quedan ligados al creador en private.admin_creators: discount_id
mensual y annual_discount_id UUID anual. La miniapp verifica ambos en Polar y
los registra en la misma activación, sin rotarlos silenciosamente. Producción
requiere registrar esos IDs verificados junto al creador antes de aceptar el
código. billing_save_creator_attribution exige UUID no nulo/no cero y pertenencia
al mismo creador activo, entorno e intervalo del intento; cualquier discrepancia
revierte el claim entero. Se conservan filas y lectura de cupones históricos.

**Rotar lanzamiento (F4):** no sustituir polar_launch_discount_id mientras haya
checkouts/facturas iniciales antiguas sin conciliar. Si se rota antes de preparar
por primera vez el descuento de creador, el cupón remoto anterior puede quedar
fuera del conjunto gestionado: se falla cerrado, pending e incidencia Owner.
Las operaciones ya preparadas conservan su ID inicial. Antes de rotar, inventariar
checkouts y órdenes, conciliar y verificar el ID remoto por cuenta/entorno.
Conservar IDs/evidencia antiguos y revisar cada pending; nunca ampliar managedIds
sin verificar propiedad, borrar historia o reiniciar repeating para forzar éxito.
La retirada por reembolso usa el ID de creador persistido, independiente de esa
rotación y de que el código ya no esté en el mapa vivo.

F5 prueba el cableado real del procesador: sin mapa de creadores no llama;
subscription_create pasa el checkout firmado; subscription_cycle o reason ausente
pasan initial=false y el helper envía p_checkout=null. Metadata contradictoria no
cambia cuenta/producto/clave ni crea atribución. Pruebas mutantes detectan tanto
initial=true fijo como la retirada sin PATCH.

## O1/O3 · contracargos y alcance definitivo (16-oct-2026)

Isaac confirma: cualquier reembolso confirmado, parcial incluido, de cualquier
factura de la suscripción retira permanentemente su descuento de creador, no solo
el del primer pago. Una disputa/contracargo también lo retira cuando llega su
señal de revocación o reembolso. No afecta a otras suscripciones ni restaura el
20 % al ganar la disputa/reactivar. Conserva GET → autorización → PATCH solo si
el cupón remoto coincide con el persistido → ACK; lease, marcador durable,
reintentos e incidencia Owner existentes. Una cancelación programada al final
del periodo pagado no inicia retirada; `subscription.updated`/`canceled` con
`status=canceled` y `cancel_at_period_end=false` sí equivale a revocación final.
No se deduce del estado local de impago, caducidad ni de metadata editable.

### Señales oficiales verificadas, sin cambiar Polar

- El enum público [WebhookEventType](https://github.com/polarsource/polar/blob/main/server/polar/models/webhook_endpoint.py)
  no contiene `dispute.*`. No hay evento nuevo que Isaac deba activar.
- [DisputeService](https://github.com/polarsource/polar/blob/main/server/polar/dispute/service.py)
  llama `_revoke` para resoluciones de disputa; revoca inmediatamente la
  suscripción asociada. La señal pública es `subscription.revoked`, con su
  actualización equivalente `subscription.updated` (`canceled`, sin fin diferido).
  Esto no prueba entrega inmediata de disputas abiertas; no se promete tal cosa.
- Resoluciones rápidas/preventivas pueden crear
  [refund con dispute](https://github.com/polarsource/polar/blob/main/server/polar/refund/service.py):
  `refund.created`/`refund.updated`, `reason=dispute_prevention`, `status=succeeded`.
  Polar puede dejar `subscription_id=null` en ese refund. Nuestra identidad y
  suscripción salen del ledger de `order_id`, nunca del refund ni su metadata.
- Mantener `subscription.revoked`, `subscription.updated`, `refund.created`,
  `refund.updated` y `order.refunded` en el webhook. Ya estaban contemplados;
  verificar selección real y entregas en sandbox. No configurar eventos Stripe
  `charge.dispute.*` en Polar: pertenecen a su integración interna.

O2 sigue pendiente en sandbox: comprobar GET→PATCH sobre una suscripción ya
revocada (Polar podría rechazarlo); entonces queda retirada pendiente/incidencia
Owner y debe resolverse antes de reactivar. Validar también payload real de una
disputa/resolución y la entrega de `subscription.revoked`/`updated` y refunds
preventivos; no existe cobertura automática de la apertura si Polar no emite señal.
Este encargo no añade sondeo ni modifica la configuración real de Polar.
