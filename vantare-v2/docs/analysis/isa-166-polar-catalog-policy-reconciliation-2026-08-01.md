# ISA-166 / BIL-01B — Reconciliación de políticas y catálogo Polar

Fecha de observación: 2026-08-01 21:37 UTC

Base documental: `7a570655253ea8c4e51047f6ebd2e97e3a49f8a6` (ISA-89)

Rama: `vantareapp/isa-166-bil-01b-reconciliacion-de-politicas-y-catalogo-polar-actual`

Estado comercial: **NO-GO para venta pública**

## Propósito y límites

Este documento reconcilia el snapshot histórico de ISA-89 con las decisiones de
producto aprobadas después del 2026-07-14. No reemplaza ni reescribe el informe
original: ISA-89 continúa siendo la evidencia de aquel momento y este documento
es su adenda vigente.

La comprobación remota se hizo únicamente mediante `GET` contra Polar. El token
se extrajo mecánicamente dentro del proceso local y no se imprimió, persistió ni
copió. No se consultaron customers, orders, subscriptions, pagos ni PII. Tampoco
se crearon o modificaron productos, precios, benefits, webhooks, configuración,
deploys o datos.

Rutas leídas:

- `GET /v1/organizations/?slug=vantareapp&limit=10` → 200.
- `GET /v1/products/?organization_id=<Vantare>&limit=100` → 200.
- `GET /v1/benefits/?limit=100` → 200.
- `GET /v1/webhooks/endpoints?organization_id=<Vantare>&page=1&limit=100` → 200.

El filtro `organization_id` fue necesario para listar el webhook dentro del
scope del token. Los resultados siguientes están deliberadamente sanitizados.

## Inventario Polar sanitizado

### Organización

| Campo operativo | Observado |
| --- | --- |
| Organización | Vantare (`vantareapp`) |
| Estado | `created` |
| Detalles comerciales enviados | No |
| País / website / payout account | Ausentes |
| Moneda de presentación | EUR |
| Comportamiento fiscal | Según ubicación |
| API / dashboard | Habilitados |
| Checkout payments | Deshabilitado |
| Subscription renewals | Deshabilitado |
| Refunds | Deshabilitado |
| Payouts | Deshabilitado |
| Múltiples subscriptions | Deshabilitado |
| Grace de revocación de benefits | 0 |
| Prevención de abuso de trial | Deshabilitada |
| Customer Portal | Uso y cambio de plan visibles; cambio de email deshabilitado |
| Emails transaccionales de subscription | Habilitados |

La organización sigue sin estar preparada para cobrar o renovar. La recuperación
de pago de Vantare no debe implementarse alterando `paidThrough` ni confundirse
con la grace de benefits de Polar.

### Productos y precios

| Producto observado | Precio | Intervalo | Trial | Metadata | Benefits | Estado |
| --- | ---: | --- | --- | --- | --- | --- |
| Vantare Pro | 4,99 EUR | Mensual | No | Vacía | Ninguno | Público, activo |
| Vantare Launch Edition | 30,00 EUR | Una vez | No aplica | Vacía | Ninguno | Público, activo |

No existe Vantare Pro Plus. Ninguno de los productos actuales contiene metadata
de catálogo ni benefits. Vantare Pro todavía no tiene configurado el trial de
siete días.

### Webhook

Existe un endpoint `raw`, habilitado y con secreto presente. La URL observada
apunta a la función `billing-webhook` de Supabase. Está suscrito a:

- `order.paid`, `order.refunded`;
- `subscription.created`, `active`, `updated`, `canceled`, `revoked`,
  `past_due`;
- `customer.created`, `customer.updated`.

Faltan al menos los eventos necesarios para la arquitectura objetivo:

- `customer.state_changed`;
- `subscription.uncanceled`;
- `refund.created`, `refund.updated`;
- `benefit_grant.created`, `cycled`, `updated`, `revoked`.

No se editó el endpoint. La ausencia se resuelve únicamente después de que el
inbox, las transiciones y los fixtures correspondientes estén preparados.

## Contrato comercial vigente

| Oferta | Precio | Acceso de producto | Canales | Vigencia |
| --- | ---: | --- | --- | --- |
| Gratuito | 0 | Funciones gratuitas definidas por producto | Stable | Sin entitlement comercial |
| Vantare Pro | 4,99 EUR/mes | Módulos publicados para Pro | Stable | Hasta expiración firmada |
| Vantare Pro Plus | 9,99 EUR/mes | Todo Pro + previews, tests, encuestas y soporte superior | Stable, Testers/Beta y Nightly | Hasta expiración firmada |
| Launch Edition | 30 EUR una vez | Módulos existentes al comprar y sus mejoras internas | Stable y Testers/Beta; nunca Nightly por sí sola | Perpetua para el alcance adquirido |
| Trial Pro | 7 días | Igual que Pro, no Pro Plus | Stable | Siete días; una por cuenta/método si Polar lo puede demostrar |

El mapping objetivo no debe representar Launch como un `vantare.pro` global y
perpetuo que desbloquee automáticamente módulos futuros. BIL-03 debe modelar una
edición/versionado de alcance estable y resolver capabilities de forma explícita.
Una propuesta mínima y legible es:

- `vantare.plan.pro` para la suscripción Pro vigente;
- `vantare.edition.launch_v1` para el conjunto adquirido por Launch Edition;
- `vantare.channel.testers` para Pro Plus y Launch Edition;
- `vantare.channel.nightly` únicamente para Pro Plus.

Los nombres exactos son contrato de implementación de BIL-03; la semántica de
producto anterior sí es obligatoria.

## Políticas reconciliadas

| Tema | Decisión vigente | Invariante comprobable |
| --- | --- | --- |
| Autoridad | Polar comercial; Supabase KEEP+HARDEN; Vantare capabilities, dispositivo y lease offline | Ningún webhook aislado se convierte en autoridad final |
| Grants | Uno por fuente/compra/subscription | Revocar una fuente no borra otra |
| Trial | 7 días, método de pago, conversión y recordatorio; una por cuenta/método cuando sea demostrable | Un trial no se puede reiniciar cambiando solo email o dispositivo |
| Fallo de renovación | Recuperación técnica máxima de 72 h desde el primer fallo confirmado | `recoveryUntil` es separado de `paidThrough`; no se renueva ni se desplaza con retries |
| Fin de recuperación | Downgrade al modo gratuito | Ningún estado `past_due` amplía un mes completo |
| Cancelación | Acceso hasta el fin ya pagado | Cancelar no revoca antes de `paidThrough` |
| Refund total | Revoca solo el grant de la compra atribuible | Otra compra o Launch independiente permanece |
| Refund parcial | No revoca automáticamente | Va a ledger/reconciliación, no a revocación agregada |
| Chargeback/fraude confirmado | Revoca la fuente afectada en la siguiente conexión | No borra datos locales |
| Offline Launch | Lease firmado perpetuo para el alcance adquirido | Cuenta/firma inválidas fallan cerrado; revocación se aplica al reconectar |
| Offline subscription | Hasta expiración firmada; una renovación exige conexión | Estar offline no crea una renovación |
| Identidad | UUID de cuenta; email solo login/presentación | Cambiar email no cambia ownership |
| Dispositivo | Un dispositivo activo, reemplazable mediante login | Copiar la lease a otra cuenta/dispositivo no concede acceso |
| Portal | Polar Customer Portal | URL de retorno allowlisted; sesión sensible nunca se registra |
| Impuestos/monedas | Precio final con impuestos cuando aplique; solo monedas soportadas por Polar | La UI no promete una moneda que checkout no ofrece |

La recuperación de 72 horas sustituye la política histórica de «cero grace».
No extiende el periodo comprado: es un estado técnico independiente, acotado y
auditable. El entitlement offline ordinario sigue expirando en su fecha firmada.

## Diferencias objetivo frente a Polar actual

| Requisito | Estado actual | Corte responsable | Gate |
| --- | --- | --- | --- |
| Pro 4,99 EUR mensual | Coincide | BIL-03 valida mapping | No mutar ahora |
| Launch 30 EUR one-time | Coincide | BIL-03 valida alcance versionado | No mutar ahora |
| Pro Plus 9,99 EUR mensual | Ausente | Gate remoto posterior a BIL-03 | Crear solo con autorización separada |
| Trial Pro 7 días | Ausente; antiabuso deshabilitado | BIL-03/BIL-09 | Demostrar capacidad antes de prometer «una vez» |
| Benefits/capabilities | Benefits vacíos; metadata vacía | BIL-03/BIL-05 | Mapping fail-closed y grants independientes |
| Eventos de reconciliación/recovery | Webhook incompleto | BIL-02/BIL-05/BIL-06 | Añadir eventos solo tras fixtures |
| Cobros/renovaciones/refunds/payouts | Deshabilitados | BIL-11/BIL-13 | NO-GO hasta onboarding comercial y smoke autorizado |
| País, datos comerciales y payout | Ausentes | Operación humana/Polar | No se resuelve con código |

## Orden de ejecución revisado

1. **BIL-02 / ISA-68:** inbox webhook atómica y replay.
2. **BIL-03 / ISA-72:** catálogo, trial, mapping, checkout y portal; puede
   avanzar en paralelo a BIL-02.
3. **BIL-04 / ISA-88:** hardening y recuperación Supabase; puede avanzar en
   paralelo cuando no solape migraciones con BIL-02/BIL-03.
4. **BIL-05 / ISA-69:** orden monótono, grants y reconciliación; depende de
   inbox y mapping.
5. **BIL-06 / ISA-70:** subscription y recuperación de pago de 72 horas.
6. **BIL-07 / ISA-71:** ledger de orders/refunds.
7. **BIL-08 / ISA-73:** credencial offline y dispositivo único reemplazable;
   depende de subscription/recovery y hardening Supabase.
8. **BIL-09 / ISA-74:** fixtures y matriz completa después de todos los contratos
   funcionales y el hardening Supabase.
9. **BIL-10 / ISA-75:** observabilidad y runbooks sobre inbox, reconciliación y
   Supabase endurecido.
10. **BIL-11 / ISA-76:** smoke monetario con aprobación específica.
11. **BIL-12 / ISA-77:** retirada reversible de Stripe.
12. **BIL-13 / ISA-90:** gate final GO/NO-GO.

ISA-89 queda como antecedente histórico, no como blocker de ejecución. ISA-166
es el gate vigente que bloquea BIL-02..BIL-13 hasta cerrar su revisión.

## Riesgos y decisiones posteriores

- Polar debe completar onboarding/KYC/capabilities comerciales antes de vender.
- Debe comprobarse en sandbox si Polar puede hacer cumplir «un trial por cuenta
  y método»; si no, Vantare no debe afirmar una garantía falsa.
- Refunds, desistimiento, retención fiscal y emails comerciales requieren revisión
  legal/operativa; no cambian las invariantes técnicas seguras.
- El alcance de Launch Edition necesita un manifiesto versionado antes de añadir
  módulos futuros.
- El material de firma y la sesión local deben almacenarse de forma protegida en
  Windows y tener rotación/rollback documentados.
- El webhook no se amplía hasta que sus nuevos eventos tengan handlers, fixtures
  y comportamiento fail-closed.

## Checklist de consistencia

- [x] Pro Plus reemplaza Supporter en el contrato vivo.
- [x] Trial de siete días aparece en catálogo objetivo y gates.
- [x] Recuperación de pago de 72 horas reemplaza «sin gracia» sin modificar
  `paidThrough`.
- [x] Launch, Pro y Pro Plus tienen canales distintos.
- [x] Un dispositivo activo y reemplazo por login quedan explícitos.
- [x] Offline distingue lifetime de subscription.
- [x] Refund total/parcial y grants independientes no se contradicen.
- [x] ISA-89 se conserva como snapshot histórico.
- [x] El inventario fue GET/read-only, sanitizado y sin PII.
- [ ] Pro Plus existe y está configurado en Polar.
- [ ] Trial y prevención de abuso están demostrados.
- [ ] Organización Polar puede cobrar, renovar, refundar y recibir payouts.
- [ ] Webhook objetivo, mapping y benefits/grants pasan fixtures.
- [ ] Smoke monetario y reconciliación cierran el NO-GO.

## Fuentes

- Snapshot histórico: `docs/analysis/isa-89-polar-catalog-commercial-policies-2026-07-14.md`.
- Arquitectura: `docs/analysis/isa-7-polar-target-billing-architecture-2026-07-14.md`.
- Supabase: `docs/analysis/isa-7-supabase-architecture-audit-2026-07-14.md`.
- ADR reconciliada: `docs/adr/0003-proposed-polar-commercial-authority.md`.
- [Polar — List Organizations](https://polar.sh/docs/api-reference/organizations/list).
- [Polar — List Products](https://polar.sh/docs/api-reference/products/list).
- [Polar — List Benefits](https://polar.sh/docs/api-reference/benefits/list).
- [Polar — List Webhook Endpoints](https://polar.sh/docs/api-reference/webhooks/endpoints/list).

## Veredicto

El inventario remoto confirma Pro y Launch, pero también confirma que Pro Plus y
el trial faltan, los benefits/metadata están vacíos, el webhook no cubre el
lifecycle objetivo y la organización no puede procesar pagos o renovaciones.
Las políticas de producto ya están reconciliadas; la operación continúa
**NO-GO para venta pública**. La siguiente issue ejecutable es BIL-02 / ISA-68.
