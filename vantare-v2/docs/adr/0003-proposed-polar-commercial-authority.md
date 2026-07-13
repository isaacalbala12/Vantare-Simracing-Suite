# ADR-0003: Polar como autoridad comercial y grants locales por fuente

- Status: Proposed
- Date: 2026-07-14
- Deciders: Product (Isaac), pendiente
- Related: ISA-7, ISA-68 a ISA-77
- Detail: `docs/analysis/isa-7-polar-target-billing-architecture-2026-07-14.md`

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

## Estado

Esta ADR es **Proposed**. No autoriza schema, codigo, despliegue, migracion, pago ni retirada de Polar, Supabase o Stripe. Solo Isaac puede aceptarla.

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
- La cache offline no es autorizativa sin firma, expiracion, usuario y device binding validos.

## Rollback

La adopcion debe hacerse con schema oscuro, shadow ingest, dual projection y lectura por cohorte. Cada fase mantiene la lectura anterior disponible y no borra datos. Retirar estructuras anteriores requiere una ADR/issue posterior y aprobacion separada.

## Criterio para aceptar esta ADR

Isaac revisa las decisiones humanas pendientes del informe, aprueba explicitamente catalogo, grace/offline, refund/dispute, retencion y device policy, y confirma el orden de ISA-68 a ISA-77. Hasta entonces permanece Proposed.
