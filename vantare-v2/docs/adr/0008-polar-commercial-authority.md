# ADR-0008: Polar como autoridad comercial y grants locales por fuente

- Status: Accepted (contrato; implementación y venta siguen NO-GO)
- Date: 2026-07-14; reconciliada el 2026-08-01
- Deciders: Product (Isaac), decisiones consolidadas en ISA-166
- Related: ISA-7, ISA-89 (histórico), ISA-166, ISA-68 a ISA-77, ISA-88, ISA-90
- Detail: `docs/analysis/isa-7-polar-target-billing-architecture-2026-07-14.md`
- Decision package: `docs/analysis/isa-89-polar-catalog-commercial-policies-2026-07-14.md`
- Current reconciliation: `docs/analysis/isa-166-polar-catalog-policy-reconciliation-2026-08-01.md`

## Contexto

Vantare usa Polar para checkout, orders, subscriptions, refunds y portal, y proyecta acceso en Supabase para que el cliente Go pueda validar capabilities y dispositivo. La auditoria ISA-7 encontro que el receptor actual reclama el webhook antes de completar sus efectos, no protege contra eventos antiguos y agrega lifetime y monthly en una unica fila por `user_id + product_key`.

Polar ofrece Customer State, events firmados segun Standard Webhooks y recursos separados para orders, subscriptions, refunds y benefit grants. El cliente, sin embargo, necesita una autorizacion provider-neutral, device binding y una ventana offline que Polar no modela.

## Decision propuesta

1. Polar sera la autoridad canonica de producto/precio, customer comercial, order/pago, subscription, refund/dispute y benefit grant.
2. Vantare mantendra una proyeccion local durable y reconciliable; no autorizara directamente por el ultimo webhook.
3. La unidad autorizativa local sera un grant ligado a su fuente (`order`, `subscription`, `benefit_grant` o soporte), no una unica fila agregada por capability.
4. La capability agregada seguira activa mientras exista al menos una fuente valida.
5. Los webhooks entraran en una inbox durable; eventos, efectos y estado procesado tendran idempotencia separada y commit transaccional.
6. Customer State/API Polar reparara drift periodica y bajo demanda.
7. Vantare seguira siendo autoridad de capabilities, device policy y leases offline firmadas.
8. Mapping comercial sera simetrico, versionado y separado por entorno; desconocidos iran a quarantine fail-closed.

## Catálogo y políticas vigentes

ISA-89 conserva la propuesta y el snapshot observado el 2026-07-14. ISA-166
registra las decisiones posteriores ya aprobadas y el inventario del 2026-08-01:

| SKU | Precio | Capabilities | Offline |
| --- | --- | --- | --- |
| `pro_monthly` | 4,99 EUR/mes | Plan Pro vigente | hasta expiración firmada |
| `launch_lifetime` | 30 EUR one-time | Edición Launch versionada + Testers/Beta | perpetuo para el alcance adquirido |
| `pro_plus_monthly` | 9,99 EUR/mes | Plan Pro + Testers/Beta + Nightly | hasta expiración firmada |

Pro y Launch existen en Polar con precio/intervalo correctos. Pro Plus no existe
y no puede crearse hasta un gate remoto posterior. Launch debe conservar un
alcance versionado: no puede representarse como un plan global perpetuo que
desbloquee automáticamente módulos futuros. Los IDs reales y diferencias de
organization, webhook y mapping están inventariados en ISA-166.

Las políticas aceptadas son: grants independientes por fuente; trial Pro de siete
días con método de pago, conversión y recordatorio; recuperación técnica máxima
de 72 horas desde el primer fallo confirmado, separada de `paidThrough`; refund
total revoca solo el grant atribuible; refund parcial no revoca automáticamente;
identidad por account UUID + Polar `external_customer_id`; email no es PK; un
dispositivo activo reemplazable mediante login; retorno allowlisted; sesión de
Windows y estado offline protegidos. Launch funciona offline de forma perpetua
para su alcance adquirido; Pro y Pro Plus solo hasta su expiración firmada.

La retencion propuesta es 30 dias para raw procesado, quarantine hasta resolver + 90 dias (maximo operativo 180 dias), 24 meses para eventos/efectos/auditoria y vida de cuenta + 24 meses para el ledger minimo. El objetivo es RPO 0 para eventos aceptados, drift maximo de 6 horas para suscripciones activas y 24 horas para lifetime/inactivas, con RTO P1 de 4 horas.

## Estado

Esta ADR queda **Accepted como contrato arquitectónico y de producto** mediante
las decisiones consolidadas en ISA-166. No autoriza schema, código, despliegue,
migración, pago ni retirada de Polar, Supabase o Stripe.

El inventario ISA-166 mantiene el NO-GO: falta Pro Plus y el trial, el webhook
carece de eventos objetivo y la organización Polar observada tiene pagos,
renovaciones, refunds y payouts deshabilitados. Aceptar esta ADR no habilita
venta pública ni autoriza mutaciones remotas.

## Consecuencias positivas

- Un retry despues de fallo parcial puede converger sin perder eventos.
- Un refund de una order no revoca otra order o subscription valida.
- El orden de entrega deja de ser una condicion de correccion.
- La autorizacion local puede funcionar offline sin exponer datos comerciales.
- Polar conserva la responsabilidad comercial y fiscal propia de Merchant of Record.

## Costes y riesgos

- Requiere nuevas estructuras de inbox, ledger, grants, reconciliacion y lease firmada.
- Durante la transicion habra dual projection y comparacion de paridad.
- La operacion necesita alertas, quarantine y herramientas de reparacion.
- La retencion de payloads/eventos necesita una decision privacy/legal.
- La clave de firma de leases introduce material criptografico server-side que exige gestion y rotacion.

## Alternativas consideradas

### Autorizar directamente desde Customer State en cada arranque

Rechazada como unica ruta porque elimina offline fiable, aumenta dependencia de red y no resuelve device policy ni auditoria local. Customer State se conserva como reconciliador canonico.

### Conservar una fila agregada `user_entitlements`

Rechazada como modelo objetivo porque no representa multiples fuentes concurrentes y vuelve ambiguos refunds, soporte manual y transiciones monthly/lifetime.

### Confiar en orden/exactly-once del webhook

Rechazada. Polar documenta retries y redelivery; no existe garantia publica de orden global o exactly-once.

### Duplicar toda la contabilidad de Polar

Rechazada. Vantare solo necesita hechos minimos para autorizacion, soporte y reconciliacion; impuestos, invoices y payment methods permanecen en Polar.

## Invariantes de aceptacion

- Ningun estado pending/confirmed/incomplete concede premium.
- Ningun evento viejo revive una fuente revocada.
- Ningun refund cambia una fuente distinta de su order/subscription.
- Un evento no queda `processed` sin todos sus efectos comprometidos.
- Mapping desconocido concede cero capabilities y genera evidencia reparable.
- La cache offline no es autorizativa sin firma, vigencia, usuario y device binding validos.
- La excepcion lifetime puede no tener expiracion comercial, pero siempre requiere firma y account UUID validos; un refund se aplica al siguiente contacto online.
- Pro y Pro Plus nunca exceden su expiración firmada durante el uso offline.
- La recuperación de pago no modifica `paidThrough`, nace del primer fallo
  confirmado, dura como máximo 72 horas y no se reinicia con retries.
- Solo existe un dispositivo activo, pero el usuario puede reemplazarlo mediante
  login verificado sin perder la propiedad de la compra.
- La URL de retorno debe coincidir exactamente con la allowlist y no puede proceder del cliente.

## Rollback

La adopcion debe hacerse con schema oscuro, shadow ingest, dual projection y lectura por cohorte. Cada fase mantiene la lectura anterior disponible y no borra datos. Retirar estructuras anteriores requiere una ADR/issue posterior y aprobacion separada.

## Criterio para ejecutar esta ADR

ISA-166 debe cerrar con inventario sanitizado, documentación coherente y review
independiente. Después puede comenzar BIL-02 / ISA-68. Cada microcorte conserva
sus propios tests y gates; la venta pública sigue bloqueada hasta BIL-13.

La retención, RPO/RTO y revisión legal/operativa se mantienen como gates de sus
issues correspondientes. No contradicen ni reabren el contrato de catálogo,
recovery, offline, refunds, identidad, dispositivo o canales aquí aceptado.
