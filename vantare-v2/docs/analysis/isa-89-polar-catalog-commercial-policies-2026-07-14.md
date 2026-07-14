# ISA-89 — Catalogo Polar y politicas comerciales cerradas

- Fecha del snapshot: 2026-07-14 21:40:34 UTC
- Estado: propuesta lista para decision de Isaac
- Rama: `vantareapp/isa-89-isa-7l-catalogo-polar-y-politicas-comerciales-cerradas`
- Base documental: `eebd4de`, que contiene `d54c5d6`
- Veredicto: **NO-GO para venta publica**

## 1. Resumen ejecutivo

El catalogo real de Polar coincide con dos de los tres productos acordados: Vantare Pro cuesta 4,99 EUR al mes y Vantare Launch Edition cuesta 30 EUR una vez. Vantare Supporter no existe. Los dos productos existentes son publicos, no archivados, usan precios fijos en EUR y no tienen metadata ni benefits.

La organizacion tampoco esta preparada para venta publica: el API devuelve `checkout_payments=false`, `subscription_renewals=false`, `refunds=false`, `payouts=false`, pais no configurado y cuenta de payout ausente. Esos hechos mantienen el NO-GO aunque el catalogo de Pro y Launch sea correcto.

El endpoint webhook esta habilitado y conserva un secreto, pero su seleccion de eventos no satisface el diseño objetivo. Recibe `customer.created` y `customer.updated`, que amplian innecesariamente la superficie de PII, y no recibe `customer.state_changed`, `subscription.uncanceled`, `refund.created` ni `refund.updated`. No se ha cambiado esa configuracion.

El repositorio solo reconoce `launch_lifetime` y `pro_monthly`, agrega ambos como `bundle` y no representa Supporter ni capabilities independientes. El portal acepta una `returnUrl` HTTPS suministrada por el cliente. Ambos puntos deben corregirse en ISA-72; este corte no implementa nada.

## 2. Alcance, metodo y certeza

Esta investigacion usa exclusivamente:

1. ISA-89 y sus comentarios/relaciones en Linear.
2. El repositorio real en `eebd4de`.
3. Cuatro GET de Polar: `/v1/organizations/`, `/v1/products/`, `/v1/benefits/` y `/v1/webhooks/endpoints`.
4. Documentacion oficial Polar consultada el 2026-07-14.

No se consultaron customers, orders, subscriptions, benefit grants, members ni ningun recurso con PII. No se hizo POST, PATCH, DELETE, pago, refund, deploy, webhook de prueba, migracion o cambio remoto.

Los hechos del API son una fotografia temporal de produccion. Las recomendaciones son propuestas. Las decisiones ya declaradas por Isaac en ISA-89 se tratan como restricciones de producto, pero la ADR permanece `Proposed` hasta que Isaac apruebe el paquete consolidado de la seccion 15.

### 2.1 Evidencia de acceso minimo

La configuracion local usa el nombre server-side `POLAR_ACCESS_TOKEN`; no se leyo, imprimio, copio ni midio su valor. No existe una variante `VITE_POLAR_ACCESS_TOKEN`. El GET de organizaciones devolvio HTTP 200 y una organizacion. Los cuatro recursos permitidos respondieron HTTP 200.

No aparecio ningun marcador `:write` en las respuestas y solo se ejecutaron metodos GET. Esto demuestra **cero uso de permisos write**, no demuestra que el token carezca tecnicamente de scopes write: la introspeccion oficial de OAuth necesita `client_id` y `client_secret`, material que no se solicito ni uso. [Polar OAuth token introspection](https://polar.sh/docs/api-reference/oauth2/connect/introspect-token) (acceso 2026-07-14, confianza media).

El token esta en un `.env.local` local no versionado y no tiene prefijo `VITE_`. Antes de una implementacion se propone mover su carga operativa fuera del arbol frontend y mantenerlo exclusivamente en backend/secret store. No se cambia en ISA-89.

## 3. Inventario sanitizado de organizacion

La respuesta de organizaciones sigue el contrato oficial de Polar. [Polar Organizations API](https://polar.sh/docs/api-reference/organizations/list) (acceso 2026-07-14, confianza media).

| Campo | Valor observado |
| --- | --- |
| ID | `3ecc2e66-8d6c-416f-b7e0-0baabc0396d4` |
| Nombre / slug | `Vantare` / `vantareapp` |
| Creada | `2026-07-09T21:58:25.805516Z` |
| Estado | `created` |
| Moneda por defecto | `eur` |
| Tax behavior | `location` |
| Proration | `prorate` |
| Customer updates | habilitado |
| Email | presente; valor omitido |
| Pais / website | no configurados |
| Account ID | presente; valor omitido |
| Payout account | ausente |
| API/dashboard | habilitados |
| Checkout payments | deshabilitado |
| Subscription renewals | deshabilitado |
| Refunds | deshabilitado |
| Payouts | deshabilitado |

Configuracion no sensible adicional observada:

- `customer_portal_settings.customer.allow_email_change=false`.
- `customer_portal_settings.subscription.update_plan=true`.
- `customer_portal_settings.subscription.update_seats=true`.
- `seat_based_pricing_enabled=true` y `member_model_enabled=true`, aunque los productos inventariados no usan precios por asiento.

**Inferencia:** el alta comercial/MoR no esta terminada. El API no explica la causa de cada capability deshabilitada, por lo que no se inventa un remedio. Isaac debe completar y revisar manualmente el onboarding exigido por Polar antes de cualquier smoke monetario.

## 4. Inventario de productos, precios, metadata y benefits

Polar modela compras one-time y suscripciones como productos y devuelve precios y benefits embebidos. [Polar Products API](https://polar.sh/docs/api-reference/products/list), [Polar Products](https://polar.sh/docs/features/products) (acceso 2026-07-14, confianza media).

| Producto real | Product ID | Visibilidad | Tipo | Intervalo | Price ID | Importe | Metadata | Benefits |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- |
| Vantare Pro | `0f91f52f-f92f-4a7a-9782-da2ec44cf8b8` | `public` | recurrente | 1 mes | `e61e9161-1568-416f-9822-bbd8fe3785dc` | 499 EUR cents | `{}` | ninguno |
| Vantare Launch Edition | `b1b1e348-acd6-4a81-ba67-db6d98aca2e6` | `public` | one-time | no aplica | `cbd08faa-0ea6-41ec-b4f1-336f5794ead4` | 3000 EUR cents | `{}` | ninguno |

Ambos productos y precios estan activos/no archivados, tienen `amount_type=fixed`, `source=catalog` y no tienen trial. El endpoint `/v1/benefits/` devolvio una lista vacia. La estructura observada coincide con el contrato oficial de benefits. [Polar Benefits API](https://polar.sh/docs/api-reference/benefits/list) (acceso 2026-07-14, confianza media).

No se propone usar Polar Benefits como autoridad de acceso local. Polar debe identificar el producto/precio comercial y Vantare debe mapearlo a capabilities estables. Crear benefits duplicados sin consumidor solo anadiria otra fuente de drift.

## 5. Contraste con el catalogo acordado

| Catalogo acordado | Polar real | Resultado | Accion propuesta, no ejecutada |
| --- | --- | --- | --- |
| Pro: 4,99 EUR/mes -> `vantare.pro` | Producto y precio exactos; sin metadata/benefits | Coincide comercialmente | Conservar IDs; anadir mapping local versionado |
| Launch Edition: 30 EUR one-time -> Pro lifetime | Producto y precio exactos; sin metadata/benefits | Coincide comercialmente | Conservar IDs; grant por order independiente |
| Supporter: 9,99 EUR/mes -> `vantare.pro` + `vantare.early_access` | No existe | Bloqueante | Crear manualmente solo tras aprobar ISA-89; precio fijo 999 EUR cents, mensual, publico cuando todo el pipeline pase gates |

El mapping actual del repositorio solo admite `launch_lifetime` y `pro_monthly`, y fuerza `entitlement_product_key="bundle"` (`supabase/functions/_shared/mapping.ts:1-24,189-205`). Por tanto, aunque Supporter se crease hoy en Polar, el backend actual lo rechazaria o no representaria `vantare.early_access` correctamente.

### 5.1 Mapping objetivo simetrico

| Catalog key | Product ID | Price ID | Billing | Capabilities | Regla |
| --- | --- | --- | --- | --- | --- |
| `pro_monthly` | `0f91f52f-f92f-4a7a-9782-da2ec44cf8b8` | `e61e9161-1568-416f-9822-bbd8fe3785dc` | subscription mensual | `vantare.pro` | valido hasta `paidThrough` |
| `launch_lifetime` | `b1b1e348-acd6-4a81-ba67-db6d98aca2e6` | `cbd08faa-0ea6-41ec-b4f1-336f5794ead4` | one-time | `vantare.pro` | lifetime por order pagada |
| `supporter_monthly` | **no asignado** | **no asignado** | subscription mensual | `vantare.pro`, `vantare.early_access` | valido hasta `paidThrough` |

El mapping debe validar en ambos sentidos `catalog_key -> product_id + price_id + capabilities` y `product_id + price_id -> catalog_key`. Un ID, precio, moneda, intervalo o capability desconocidos deben ir a quarantine y conceder cero acceso. Los IDs de Supporter no pueden inventarse y solo se incorporaran tras una lectura GET posterior a su creacion manual autorizada.

Metadata Polar recomendada para una mutacion humana posterior: `vantare_catalog_key` y `vantare_catalog_version`. La autorizacion no dependera exclusivamente de metadata libre; los IDs y atributos esperados se validaran en configuracion versionada por entorno.

## 6. Inventario sanitizado del webhook

Polar documenta que el listado devuelve URL, eventos, enabled y secreto. El secreto se redujo a `present=true`; nunca se mostro. [Polar Webhook Endpoints API](https://polar.sh/docs/api-reference/webhooks/endpoints/list) (acceso 2026-07-14, confianza media).

| Campo | Valor observado |
| --- | --- |
| Endpoint ID | `a03c8494-52dc-484c-bda8-26b47c542b18` |
| URL sin query/fragment | `https://ombjshwzqgeisazijduq.supabase.co/functions/v1/billing-webhook` |
| Formato | `raw` |
| Enabled | `true` |
| Secret | presente; valor omitido |
| Nombre | no configurado |

Eventos observados:

`order.paid`, `order.refunded`, `subscription.created`, `subscription.active`, `subscription.updated`, `subscription.canceled`, `subscription.revoked`, `subscription.past_due`, `customer.created`, `customer.updated`.

### 6.1 Diferencia de eventos

| Diferencia | Riesgo | Propuesta, no ejecutada |
| --- | --- | --- |
| `customer.created` y `customer.updated` activos | Payloads con PII innecesaria | Retirarlos; resolver identidad por UUID/external customer ID server-side |
| Falta `customer.state_changed` | Drift no dispara reconciliacion canonica | Anadirlo tras implementar inbox/reconciliacion |
| Falta `subscription.uncanceled` | Recuperacion puede llegar solo como update ambiguo | Anadirlo y probar cancel/uncancel fuera de orden |
| Faltan `refund.created` y `refund.updated` | Menos evidencia del lifecycle del refund | Anadirlos en ISA-71; `order.refunded` sigue siendo hecho de order |
| Falta `product.updated` | Drift de catalogo no alerta por evento | Opcional: anadirlo o cubrir con GET diario; no debe cambiar grants directamente |

No se debe cambiar el endpoint antes de que ISA-68 pueda persistir/quarantinar los nuevos tipos de forma segura. La secuencia es codigo/fixtures primero, configuracion manual despues, smoke read-only y finalmente sandbox.

## 7. Tabla consolidada de politicas

| Area | Politica propuesta para aprobar | Motivo e impacto | Control/test derivado |
| --- | --- | --- | --- |
| Autoridad | Polar es autoridad comercial; Vantare es autoridad de capabilities, dispositivo y offline | Evita duplicar contabilidad y mantiene autorizacion provider-neutral | Reconciliar el mismo customer a igual grant local |
| Identidad | UUID estable de cuenta + `external_customer_id`; email nunca es PK ni mapping | Email cambia y es PII | Cambio de email conserva grants; UUID distinto no los hereda |
| Launch offline | `vantare.pro` perpetuo offline con lease firmada sin expiracion comercial | Es la promesa lifetime; un refund solo se conoce al volver online | Firma invalida/cuenta distinta falla cerrado; al reconectar aplica revocacion atribuible |
| Pro/Supporter offline | Offline hasta `paidThrough`; sin extension local adicional | Respeta exactamente el periodo pagado | Limite inclusivo/exclusivo definido en UTC; reloj atrasado no extiende |
| Device policy | Sin device lock obligatorio | Evita bloquear reinstalaciones/usuarios legitimos | Device binding opcional solo como señal/seguridad, no requisito comercial |
| Grace | Cero dias/horas de gracia extra | No inventar acceso no pagado | `past_due` no extiende mas alla de `paidThrough` |
| Refund total | Revoca solo el grant de la compra/order atribuible | Conserva fuentes independientes | Dos orders; refund total de una mantiene la otra |
| Refund parcial | No revoca automaticamente | Un parcial no demuestra perdida total del derecho | Registra importe/estado minimo y alerta; grant permanece |
| Grants | Una fila/fuente por order, subscription, benefit o soporte | Evita que una compra pise otra | Lifetime + monthly concurrentes; cancel/refund aislado |
| Supporter previews | `vantare.early_access` solo mientras Supporter este pagado; al publicar una feature, su capability estable pasa a Pro/Launch | Separa producto comercial de flags temporales | Fixture de promocion no deja acceso duplicado/huérfano |
| Catalogo desconocido | Fail-closed + quarantine + reconciliacion | Un mapping incompleto no debe regalar premium | Producto/precio/moneda/intervalo desconocido concede cero |
| Portal | Customer resuelto server-side; return URL fija, nunca arbitraria | Evita open redirect y customer spoofing | URL distinta, encoded, con userinfo/query/fragment es rechazada |
| Sesion Windows | Refresh/session token en Windows Credential Manager; lease y reloj protegidos con DPAPI CurrentUser | Evita `localStorage` y JSON plano; la firma sigue dando integridad | Copia entre usuarios Windows, edicion y rollback de reloj fallan cerrado |
| Minimización | Solo UUIDs provider, estados, moneda/importe minimo, timestamps y hashes; no tarjeta, direccion, tax ID, IP, invoice, email duplicado ni payload en logs | Reduce impacto de fuga | Schema/log scan y fixtures sin PII |
| QA read-only | Solo organization/products/benefits/webhook endpoints/catalog state sin PII; nunca customers/orders/subscriptions/grants reales | Separa verificacion de catalogo de datos personales | Allowlist de rutas y metodo GET; CI sin token de produccion |

## 8. Retencion exacta propuesta

| Clase | Retencion | Regla de eliminacion/minimizacion |
| --- | --- | --- |
| Raw webhook procesado | 30 dias desde `processed_at` | Cifrado, acceso restringido; despues conservar solo hash/envelope normalizado |
| Raw webhook en quarantine | Hasta resolver + 90 dias, maximo operativo 180 dias | A los 180 dias exige decision de incidente/legal; nunca borrado silencioso sin resolucion |
| Envelope/evento normalizado y efectos idempotentes | 24 meses | Sin PII libre; IDs, tipo, timestamps, resultado, hashes |
| Auditoria de operador/replay/reparacion | 24 meses | Actor, ticket/motivo, before/after hash; nunca secreto/payload completo |
| Ledger minimo de grants/order/refund/subscription | Vida de la cuenta + 24 meses | Pseudonimizar UUID de cuenta al cerrar cuando sea legal; Polar conserva contabilidad MoR |
| Logs operativos | 30 dias online + 60 dias archivo restringido | Solo codigos/metricas; no body, email, URL completa, token o headers |

Una obligacion legal distinta prevalece, pero debe documentarse como legal hold separado. Polar, como Merchant of Record, conserva los documentos fiscales que le correspondan; Vantare no los duplica por defecto.

## 9. RPO, RTO y reconciliacion

| Objetivo | Valor propuesto | Como se mide |
| --- | --- | --- |
| RPO de evento aceptado | 0 eventos aceptados | Respuesta 2xx solo tras persistencia durable y firma valida |
| RPO de drift Polar/local | maximo 6 horas para suscripciones activas; 24 horas para lifetime/inactivas | Edad del ultimo Customer State confirmado |
| RTO P1 acceso incorrecto/backlog detenido | 4 horas | Desde alerta hasta pipeline reparado o lectura premium desactivada |
| RTO degradacion no autorizativa | 1 dia laborable | Catalog drift/metricas sin impacto de acceso |

Frecuencias propuestas:

1. Reconciliacion inmediata ante refund, revoke, mapping desconocido, evento fuera de orden, hash conflictivo o reparacion manual.
2. Cada 6 horas para cuentas con suscripcion activa o `past_due`.
3. Cada 24 horas para grants lifetime y barrido de catalogo/endpoints.
4. On-demand por UUID/external customer ID, `--dry-run` por defecto, sin busqueda por email.

## 10. Allowlist exacta de return URLs

Se propone una sola URL para checkout success, checkout cancel y portal return:

`http://127.0.0.1:39261/checkout/callback`

Comparacion exacta despues de parsear URL:

| Componente | Unico valor aceptado |
| --- | --- |
| scheme | `http` |
| host | `127.0.0.1` |
| port | `39261` |
| path | `/checkout/callback` |
| query / fragment / userinfo | vacios |

No se aceptan `localhost`, `::1`, wildcard, otro puerto, subpath, sufijo de dominio ni URL suministrada por el cliente. HTTP solo se permite para este loopback exacto; cualquier URL remota debe ser HTTPS y requeriria otra decision.

Esta URL procede de la decision de checkout existente (`docs/superpowers/plans/2026-07-06-checkout-01.md:13,58-59`). Sin embargo, el servidor actual solo registra `/auth/callback` (`internal/server/server.go:194`) y no implementa `/checkout/callback`; ademas, el portal actual exige HTTPS pero acepta cualquier dominio del body (`supabase/functions/billing-portal/index.ts:43-72`). Por ello la allowlist esta **cerrada como objetivo**, no operativa. ISA-72 debe implementar el callback, ignorar `returnUrl` del cliente y aplicar igualdad exacta.

## 11. Almacenamiento protegido en Windows

Propuesta concreta:

- Guardar refresh/session token en Windows Credential Manager, por usuario Windows y cuenta Vantare.
- Guardar lease firmada, `last_server_time`, nonce/counter y account UUID en un archivo atomico cifrado con DPAPI `CurrentUser`.
- La firma asimetrica de la lease, no DPAPI, prueba integridad y autoridad del backend.
- No usar `localStorage`, archivo JSON plano, registro en claro, logs ni argumentos de proceso.
- Borrar la sesion local al cerrar sesion; conservar datos de usuario no sensibles solo si la UX lo requiere.
- Una lease Launch perpetua puede copiarse dentro de la misma cuenta Windows si no se usa device lock; no puede editarse ni usarse bajo otra cuenta Vantare porque account UUID y firma se validan.

## 12. Limites read-only para implementacion y QA

### Permitido sin nueva aprobacion

- GET de organization, products, prices embebidos, benefits y webhook endpoint metadata sanitizada.
- Fixtures anonimizados y API sandbox con cuentas sinteticas, sin pago real.
- Customer State solo en sandbox con identidad sintetica creada para QA y scope minimo separado, cuando ISA-69 lo autorice.
- Lecturas locales/Supabase de filas sinteticas creadas por fixtures, con proyecto y usuario de test.

### Prohibido hasta gate separado

- Customers, orders, subscriptions, members, grants o cualquier PII de produccion.
- POST/PATCH/DELETE a Polar, Supabase remoto o webhook desplegado.
- Checkout real, pago, refund, dispute, cancelacion o customer session real.
- Token de produccion en CI, frontend, logs, fixtures o capturas.
- Cambiar productos, precios, benefits, webhooks, organization, secrets o deploys.

## 13. Matriz riesgo -> control -> test

| Riesgo | Control objetivo | Test seguro |
| --- | --- | --- |
| Supporter inexistente | NO-GO + mapping fail-closed | Fixture de ID desconocido concede cero |
| Pagos/renovaciones deshabilitados | Gate manual Polar antes de venta | GET de capabilities, sin checkout |
| Evento customer filtra PII | Allowlist de eventos y redaccion en ingress | Fixture con email no aparece en log/proyeccion |
| Webhook perdido tras claim | Inbox + efectos + processed en transaccion | Fallo inyectado tras cada efecto y replay converge |
| Evento viejo revive acceso | Version monotona por recurso + reconciliacion | revoke seguido de active antiguo no revive |
| Refund revoca otra compra | Grant por fuente | Dos orders, refund de una |
| Partial refund revoca premium | Regla explicita no-revoke | Fixture parcial mantiene grant y alerta |
| Open redirect | URL fija/igualdad exacta | Matriz localhost, userinfo, query, fragment y encoding |
| Cache offline editada | Firma + DPAPI + account UUID + reloj monotono | Editar/copiar/retroceder reloj falla cerrado |
| Token se filtra al bundle | Secret store backend y scan de artefactos | Build scan sin `POLAR_ACCESS_TOKEN` ni patron de token |
| Mapping drift precio/moneda | Mapping simetrico + GET diario | Precio o moneda distintos van a quarantine |
| PII retenida indefinidamente | TTL y campos permitidos | Job dry-run lista vencidos sin mostrar payload |

## 14. Dependencias y microcortes

No hace falta crear otra sub-issue: los huecos encajan en ISA-68 a ISA-77/88.

1. **ISA-68:** inbox atomica, redaccion PII, evento/effect idempotency y quarantine.
2. **ISA-69:** orden monotono, `customer.state_changed`, reconciliacion 6h/24h/on-demand.
3. **ISA-70:** `paidThrough`, past_due, cancel/uncancel/revoke sin grace.
4. **ISA-71:** ledger por fuente y refunds totales/parciales.
5. **ISA-72:** mapping de tres SKUs, capability matrix, callback local y allowlist exacta, portal sin URL cliente.
6. **ISA-73:** lease firmada, DPAPI/Credential Manager, account binding y rollback de reloj.
7. **ISA-74:** fixtures de los casos de esta matriz, sin pagos reales.
8. **ISA-75:** SLO, alertas, retention jobs y runbooks de reparacion.
9. **ISA-77:** Stripe por separado; ningun cambio en este programa hasta sus gates.
10. **ISA-88:** hardening/recuperacion Supabase sin eliminar recursos compartidos.

La creacion manual de Supporter y cualquier cambio del webhook deben ocurrir despues de que el codigo correspondiente este probado en sandbox y mediante aprobacion remota separada. ISA-68 no empieza con este documento: permanece bloqueada hasta la decision de Isaac.

## 15. Paquete unico de decision para Isaac

Isaac puede responder una sola vez con `APRUEBO ISA-89` o indicar cambios por numero:

1. Aprobar catalogo objetivo de tres SKUs y mapping de la seccion 5.1.
2. Aprobar offline perpetuo para Launch; Pro/Supporter hasta `paidThrough`; sin device lock y sin grace adicional.
3. Aprobar refunds/grants independientes de la seccion 7.
4. Aprobar identidad UUID + `external_customer_id`, email no PK.
5. Aprobar retenciones exactas de la seccion 8.
6. Aprobar RPO/RTO y reconciliacion 6h/24h/on-demand de la seccion 9.
7. Aprobar Credential Manager + DPAPI CurrentUser de la seccion 11.
8. Aprobar la unica return URL `http://127.0.0.1:39261/checkout/callback` y sus reglas exactas.
9. Aprobar limites read-only de implementacion/QA de la seccion 12.
10. Mantener NO-GO y el orden de microcortes de la seccion 14.

La aprobacion documental no autoriza crear Supporter, editar el webhook, habilitar pagos, desplegar, migrar, pagar, refundar ni empezar ISA-68. Cada mutacion requiere su gate separado.

## 16. Rollback documental y operativo

Este corte solo anade documentacion. Su rollback es revertir el commit documental; no hay estado Polar/Supabase que restaurar.

Para la implementacion futura, cada microcorte debe mantener billing deshabilitado, shadow/read anterior disponible y mapping anterior versionado. Si falla paridad o seguridad: desactivar billing, detener worker/lectura nueva, conservar inbox/ledger para diagnostico, volver a la proyeccion anterior y no borrar datos. Un rollback nunca ejecuta refunds, cancelaciones ni cambios Polar automaticamente.

## 17. Evidencia y fuentes primarias

- [Polar Organizations API](https://polar.sh/docs/api-reference/organizations/list)
- [Polar Products API](https://polar.sh/docs/api-reference/products/list)
- [Polar Products](https://polar.sh/docs/features/products)
- [Polar Benefits API](https://polar.sh/docs/api-reference/benefits/list)
- [Polar Webhook Endpoints API](https://polar.sh/docs/api-reference/webhooks/endpoints/list)
- [Polar OAuth token introspection](https://polar.sh/docs/api-reference/oauth2/connect/introspect-token)
- `docs/analysis/isa-7-billing-relaunch-2026-07-14.md`
- `docs/analysis/isa-7-polar-target-billing-architecture-2026-07-14.md`
- `docs/analysis/isa-7-supabase-architecture-audit-2026-07-14.md`
- `docs/adr/0003-proposed-polar-commercial-authority.md`
- `supabase/functions/_shared/mapping.ts`
- `supabase/functions/_shared/polar.ts`
- `supabase/functions/billing-portal/index.ts`

La confianza en hechos del catalogo es media: proceden de la API primaria actual pero de una sola fotografia. Las inferencias de readiness se etiquetan como tales. Antes de cualquier venta, repetir GET y comparar IDs, amounts, moneda, intervalos, visibility, capabilities y endpoint.
