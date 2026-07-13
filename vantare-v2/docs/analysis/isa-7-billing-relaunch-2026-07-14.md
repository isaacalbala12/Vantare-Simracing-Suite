---
topic: "ISA-7 — Billing Polar y retirada segura de Stripe"
type: "technical"
goals: "Verificar checkout, webhook, entitlement, suscripcion, portal, cancelacion/refund y recuperacion; inventariar Polar/Stripe; proponer retirada reversible por microcortes"
date: "2026-07-14"
methodology: "Auditoria nueva desde develop@c49e14a; evidencia local reproducible y documentacion oficial Polar; sin pagos ni mutaciones remotas. Confianza: alta/media/baja."
---

# ISA-7 — Auditoria de billing relanzada

> **Tipo:** investigacion tecnica de alto riesgo | **Fecha:** 2026-07-14
>
> **Base:** `develop@c49e14aab474ee132c0368e92918f78d66a162c8`
>
> **Rama:** `vantareapp/isa-7-billing-relaunch-20260714`
>
> **Restricciones:** sin pagos reales, gasto, secretos, mutaciones remotas, migraciones, borrados, retirada de Stripe ni merge.

## Alcance y metodo

Esta auditoria reconstruye desde cero el estado de billing del repositorio y lo contrasta con la documentacion oficial vigente de Polar. No reutiliza la rama, cambios ni conclusiones de la ejecucion anterior. Las afirmaciones sobre el repositorio citan archivo y linea o salida reproducible; las afirmaciones sobre Polar enlazan documentacion oficial consultada el 2026-07-14.

El objetivo no es demostrar que una URL de checkout puede crearse, sino determinar si el ciclo completo conserva acceso y trazabilidad ante entrega duplicada o desordenada de webhooks, cancelacion, refund, fallo de red y revalidacion posterior.

## Veredicto ejecutivo

**NO-GO para venta publica y para retirar Stripe.** Polar ya puede crear sesiones de checkout y existe una ruta completa de codigo, pero el sistema no es todavia seguro ante fallos parciales, eventos desordenados, refunds parciales ni recuperacion de pagos. La bandera de billing permanece cerrada por defecto, lo que limita la exposicion inmediata.

La recomendacion es mantener Stripe como legado historico inerte, sin reactivarlo ni borrarlo, y corregir Polar mediante microcortes verificables. El mayor riesgo no esta en crear el checkout: esta en que un webhook sea marcado como procesado antes de completar sus escrituras. Un fallo intermedio puede dejar un entitlement parcial y hacer que el retry sea aceptado como duplicado sin reparar nada.

| Flujo | Estado | Evidencia principal | Condicion para avanzar |
|---|---|---|---|
| Checkout | AMBAR | Autenticado, producto allowlisted y secretos server-side; no hay deduplicacion local de doble clic/retry | Intento local reutilizable y fixture de retry |
| Webhook | ROJO | Firma y timestamp verificados; claim no atomico con efectos y sin proteccion temporal | Inbox atomica, estados de proceso y replay |
| Entitlement | ROJO | RPC/RLS correctos; estado puede quedar parcial o retroceder por evento antiguo | Reconciliacion monotona con Customer State/grants |
| Suscripcion | ROJO | Cubre eventos principales, pero `created` puede activar prematuramente y falta `uncanceled` | Maquina de estados y fixtures de ciclo completo |
| Portal | AMBAR | Customer ID resuelto server-side; `returnUrl` HTTPS arbitraria del cliente | Allowlist de origen y no registrar URL/token sensible |
| Cancelacion | AMBAR/ROJO | Conserva acceso al final de periodo; falta uncancel y prueba terminal real | Secuencia sandbox cancel/uncancel/revoke |
| Refund | ROJO | Todo `order.refunded` lifetime revoca, incluso parcial o no atribuible | Ledger por orden y comprobacion de estado/importe |
| Recuperacion | ROJO | `past_due` puede extender acceso hasta el nuevo fin de periodo | Politica explicita de gracia y reconciliacion de grants |

## Limites de la evidencia

- Se reviso el arbol local limpio en el commit base indicado, no despliegues ni secretos.
- Se uso documentacion oficial Polar vigente consultada el 2026-07-14. Es fuente primaria; la confianza se marca media cuando no existe segunda fuente independiente y baja cuando la propia documentacion discrepa.
- No se hicieron pagos, refunds, cancelaciones, redeliveries, escrituras en Supabase/Polar/Stripe ni cambios de configuracion remota.
- Los smokes historicos documentados sirven como contexto, no como evidencia nueva. En particular, generar una URL de produccion sin pagar no valida cobro, webhook, entitlement, portal ni refund de produccion.

## Arquitectura reconstruida

```text
UI desktop
  -> Supabase Auth JWT
  -> billing-checkout (JWT obligatorio)
  -> Polar Checkout alojado
  -> webhook publico firmado
  -> billing-webhook (service role)
  -> billing_customers / billing_subscriptions / user_entitlements / license_events
  -> RPC get_account_entitlements
  -> cliente Go + cache offline

UI desktop
  -> billing-portal (JWT obligatorio)
  -> Customer Session Polar
  -> portal alojado (cancelacion, metodo de pago, facturas)
```

Fronteras de confianza: UI a Edge Function, Edge Function a Polar, Internet a webhook publico, service role a Postgres, RPC a cliente local y navegador externo a checkout/portal. Los activos protegidos son dinero, acceso premium, identidad de cliente, estado de suscripcion, historial de auditoria, vinculacion de dispositivo y secretos server-side.

## Evidencia por flujo

### 1. Checkout

Controles correctos:

- `billing-checkout` requiere usuario autenticado, rechaza campos de cliente como `priceId`, `productId`, `user_id` y `email`, y solo acepta una `productKey` incluida en el mapping server-side (`supabase/functions/billing-checkout/index.ts:25-33`, `:74-107`).
- La llamada a Polar envia `products`, `external_customer_id` igual al UUID autenticado, URLs configuradas y metadata minima; el token va en `Authorization` desde entorno (`supabase/functions/_shared/polar.ts:149-170`).
- El frontend solo habilita billing si `VITE_BILLING_ENABLED` es exactamente `true`; el default efectivo es cerrado (`vantare-v2/frontend/src/lib/billing-client.ts:4-5`).

Gap: cada solicitud crea una sesion nueva. Polar no documenta una cabecera de idempotencia para `POST /v1/checkouts`; `external_customer_id` deduplica identidad, no intentos. Doble clic, retry de red o dos ventanas pueden producir multiples checkouts abiertos. No debe concederse acceso por redirect ni por estado `confirmed`; Polar solo considera pago exitoso el estado `succeeded` y la señal de orden pagada.

**Hallazgo alto C1 — mapping asimetrico.** La validacion no exige que cada clave obligatoria tenga tambien reverse mapping producto Polar -> clave interna ni etiqueta el mapping por entorno (`supabase/functions/_shared/mapping.ts:189-240`). Es posible que checkout acepte un producto y el webhook posterior lo marque `unknown_product_id`, despues de haber reclamado el evento. Sandbox y produccion necesitan mappings separados, completos y validados al arrancar/deploy.

Fuente: [Create Checkout Session](https://polar.sh/docs/api-reference/checkouts/create-session), [Checkout Session](https://polar.sh/docs/features/checkout/session), [Authentication](https://polar.sh/docs/integrate/authentication). Fuente primaria Polar, acceso 2026-07-14, confianza media.

### 2. Recepcion y autenticidad del webhook

Controles correctos:

- El endpoint no requiere JWT, como corresponde a un webhook externo, pero valida body crudo con `POLAR_WEBHOOK_SECRET`, `webhook-id`, `webhook-timestamp` y `webhook-signature` antes de procesar (`supabase/functions/_shared/webhook-verify.ts:28`; `supabase/config.toml`).
- La verificacion usa HMAC, comparacion temporalmente constante y ventana de timestamp; existen tests de compatibilidad.
- El esquema de base impone unicidad en `(event_type, idempotency_key)` (`supabase/migrations/20260709120000_provider_agnostic_billing.sql:113-115`).

**Hallazgo critico W1 — claim antes de efectos.** `processPolarWebhook` llama a `claimWebhookEvent` antes de validar/aplicar todos los recursos (`supabase/functions/billing-webhook/process.ts:193-209`, `:542-568`). El claim y los upserts posteriores no forman una transaccion. Si falla un upsert despues del insert, Polar reintenta; el retry encuentra la clave duplicada y retorna aceptado sin completar el trabajo. Resultado: evento perdido de forma silenciosa o estado parcial.

**Hallazgo alto W2 — no hay defensa contra eventos antiguos.** Los upserts no comparan `modified_at`, timestamp de recurso ni version aplicada. Retry tardio/redelivery manual puede hacer que `active` viejo pise `revoked`, o que cancelacion anterior pise un uncancel. La documentacion publica describe secuencias, pero no garantiza orden contractual; retries y redelivery hacen el orden no confiable.

**Hallazgo medio W3 — superficie operativa.** No se observa limite explicito de body. Polar corta la entrega a los 10 segundos, recomienda responder antes de 2 segundos y reintenta hasta 10 veces; tras 10 fallos consecutivos deshabilita el endpoint. El procesamiento sin inbox/worker aumenta el riesgo de timeout y deshabilitacion.

Fuente: [Webhook endpoints](https://polar.sh/docs/integrate/webhooks/endpoints), [Delivery and retries](https://polar.sh/docs/integrate/webhooks/delivery), [Webhook events](https://polar.sh/docs/integrate/webhooks/events). Fuente primaria Polar, acceso 2026-07-14, confianza media.

### 3. Entitlements y cliente offline

Controles correctos:

- Las tablas nuevas son provider-agnostic y tienen RLS; el usuario puede leer sus filas pero no escribir entitlements (`20260709120000_provider_agnostic_billing.sql`).
- El RPC solo concede acceso para estados permitidos y dispositivo compatible; el hotfix posterior elimina una ambiguedad del RPC (`20260709150000_fix_get_account_entitlements_device_binding.sql`).
- El cliente Go usa request con contexto y, sin cache premium, un fallo de backend cae a cuenta autenticada sin entitlement, no a premium abierto (`internal/license/supabase_client.go:46`, `internal/license/service.go:193-216`).

**Hallazgo alto E1 — gracia offline no coincide con la politica declarada.** Si la cache contiene `expires_at` futuro, un fallo de backend devuelve `StateGrace` hasta esa fecha (`internal/license/service.go:225-247`). Para una mensualidad puede equivaler al resto del periodo, no a 24 horas. El limite `GracePeriod` solo se aplica cuando no hay expiracion. Hay que elegir y documentar una sola politica.

**Hallazgo alto E2 — webhook como unica convergencia.** No existe reconciliacion periodica visible contra Customer State/grants. Un evento perdido, una deshabilitacion del endpoint o una transicion no soportada pueden persistir indefinidamente.

**Hallazgo critico E3 — cache local manipulable.** La cache es JSON en texto plano, sin firma/MAC y sin vinculo persistido a user ID o fingerprint (`internal/license/cache.go:12-17`, `:46-113`). Una copia o edicion local puede conservar entitlements y una expiracion futura. El device binding remoto no protege el camino offline si la cache no es autentica y no esta ligada a la identidad/dispositivo que la consume.

Polar define Customer State como snapshot de cliente, suscripciones activas y benefits/grants. Debe ser la fuente de reconciliacion, manteniendo los webhooks como disparadores y registro. Fuente: [Customer State](https://polar.sh/docs/integrate/customer-state), [Benefits](https://polar.sh/docs/features/benefits/introduction). Fuente primaria Polar, acceso 2026-07-14, confianza media.

### 4. Suscripcion, cancelacion y recuperacion

El procesador cubre `subscription.created`, `active`, `updated`, `canceled`, `past_due` y `revoked` (`process.ts:587-634`). La cancelacion al final del periodo conserva `active` hasta `current_period_end`, comportamiento correcto (`process.ts:297-323`).

**Hallazgo critico S1 — activacion prematura.** Para `subscription.created`, si falta `status`, la derivacion puede tratar el snapshot como activo. Polar indica que `created` puede ocurrir antes de que el primer pago termine; la activacion debe depender de `subscription.active`, orden pagada o snapshot reconciliado.

**Hallazgo alto S2 — estados incompletos.** No se procesa `subscription.uncanceled`; tampoco se modelan de forma explicita `incomplete`, `incomplete_expired` o `unpaid`, ni `benefit_grant.*`/`customer.state_changed`. Un catch-all `updated` no reemplaza fixtures y reglas monotonicamente seguras.

**Hallazgo critico S3 — extension por impago.** Polar adelanta el periodo antes de cobrar una renovacion. El codigo de `past_due` guarda `expires_at=current_period_end` nuevo (`process.ts:297-302`, `:607-625`). El RPC considera `past_due` elegible hasta esa fecha. Un impago puede conceder casi otro periodo completo, aunque la politica interna citada sea 24 horas y Polar configure grants con gracia inmediata/2/7/14/21 dias.

Polar reintenta pagos en los dias 2, 7, 14 y 21; actualizar metodo en portal dispara un retry inmediato. Hay una discrepancia oficial: una guia dice que al agotar retries termina `canceled`, mientras la API/eventos contemplan `unpaid`. La autorizacion debe converger por `subscription.revoked` y grants actuales, y el estado exacto debe capturarse en sandbox antes de codificarlo.

Fuente: [Subscriptions](https://polar.sh/docs/features/subscriptions/introduction), [Manage subscriptions](https://polar.sh/docs/features/subscriptions/manage), [Failed payments](https://polar.sh/docs/features/subscriptions/failed-payments), [subscription.created](https://polar.sh/docs/api-reference/webhooks/subscription.created), [subscription.revoked](https://polar.sh/docs/api-reference/webhooks/subscription.revoked). Fuente primaria Polar, acceso 2026-07-14; confianza media, baja para el estado terminal contradictorio.

### 5. Portal

Controles correctos: el endpoint exige JWT, ignora customer IDs del cliente, busca el `provider_customer_id` del usuario y crea la Customer Session con token server-side (`billing-portal/index.ts:91-179`). El enlace de sesion debe tratarse como una credencial sensible y no registrarse.

**Hallazgo alto P1 — return URL abierta.** Una persona autenticada puede enviar cualquier URL HTTPS y esta prevalece sobre la configurada (`billing-portal/index.ts:56-64`, `:145-179`; frontend `billing-client.ts:107-111`). Aunque no concede acceso a otro customer, habilita redireccion a dominio de phishing y amplifica fuga accidental de informacion de navegacion/sesion. La funcion debe usar la URL fija o una allowlist exacta de origen/path.

Polar ofrece portal alojado para suscripciones, facturas, beneficios, cancelacion al final de periodo y actualizacion del metodo de pago. Una Customer Session es preautorizada y su URL no debe aparecer en logs. Fuente: [Customer Portal](https://polar.sh/docs/features/customer-portal/introduction), [Customer Sessions](https://polar.sh/docs/api-reference/customer-portal/sessions/create). Fuente primaria Polar, acceso 2026-07-14, confianza media.

### 6. Refunds

**Hallazgo critico R1 — refund parcial revoca lifetime.** Cualquier `order.refunded` revoca un entitlement lifetime/launch vigente (`process.ts:500-522`, `:642-647`). Polar emite `order.refunded` tanto para refund parcial como total; el refund es asincrono y puede estar `pending`, `succeeded`, `failed` o `canceled`. El codigo no comprueba importe total, estado del refund ni `revoke_benefits`.

**Hallazgo critico R2 — no hay ledger por orden.** El entitlement resume el plan actual, pero no conserva una relacion autorizativa suficiente entre order, importe, producto y grant. Reembolsar una compra antigua puede revocar una compra lifetime posterior valida. Para suscripciones, Polar aclara que devolver dinero no cancela ni revoca por si mismo; son acciones separadas.

Fuente: [Orders](https://polar.sh/docs/features/orders), [Refunds](https://polar.sh/docs/features/refunds), [Create Refund](https://polar.sh/docs/api-reference/refunds/create), [order.refunded](https://polar.sh/docs/api-reference/webhooks/order.refunded). Fuente primaria Polar, acceso 2026-07-14, confianza media.

## Inventario Polar / Stripe

El inventario distingue referencias ejecutables, tests, persistencia historica, documentacion y archivo. Una busqueda literal tambien encuentra falsos positivos como nombres CSS `SideStripe`; no son billing.

| Clase | Polar | Stripe | Decision |
|---|---|---|---|
| Produccion | Edge Functions checkout/portal/webhook; shared mapping, API y firma; frontend provider-neutral | No se encontro import/runtime Stripe fuera de `_deprecated` | Polar es unico proveedor ejecutable; no reactivar Stripe |
| Test/fixtures | Tests Deno de checkout, portal, mapping, firma y processor; tests frontend/Go provider-neutral | Fixtures/tests solo dentro del webhook deprecado | Conservar legado hasta cerrar gates; nuevos fixtures Polar sin pago |
| Migraciones/DB | Tablas provider-agnostic de julio y RPC/hotfix | Esquema inicial conserva `subscriptions.payment_provider default 'stripe'` y tablas legacy | No borrar ni migrar datos en ISA-7; documentar deuda historica |
| Configuracion | `configs/polar-product-mapping.example.json` sin secretos | `configs/stripe-price-mapping.json` contiene placeholders y solo alimenta codigo deprecado | Marcar historical-only; retirada en cambio separado |
| Documentacion | Plan actual y smokes Polar; arquitectura de licensing aun describe Stripe | 59 coincidencias aproximadas entre docs activas/archivo, varias historicas | Actualizar arquitectura antes de retirada fisica |
| Archivo | No aplica | `_deprecated/stripe-webhook/**` y `docs/archive/sql/*.stripe-obsolete` | Preservar por rollback/auditoria hasta validacion manual |

Conclusiones del inventario:

1. No hay coexistencia activa de dos procesadores de pago en runtime.
2. Stripe sigue presente como historia, configuracion placeholder, migracion legacy y documentacion desactualizada.
3. Retirarlo ahora no mejora la seguridad de Polar y reduce capacidad de explicar/recuperar datos historicos.
4. La retirada correcta es etiquetar, comprobar consumidores y archivar por etapas; nunca borrar filas o columnas historicas sin plan de migracion y backup aprobados.

## Modelo de amenazas resumido

| Amenaza | Control actual | Gap / respuesta |
|---|---|---|
| Spoof de usuario/producto | JWT, UUID server-side, allowlist de producto | Mantener tests negativos y mapping server-only |
| Spoof/replay de webhook | Firma, timestamp, clave unica | SDK/fixtures reales, body limit, inbox atomica y retencion definida |
| Tampering/out-of-order | Upserts por recurso | Guardar version/timestamp y no permitir regresion terminal |
| Repudio | `license_events` | Registrar recibido/procesando/procesado/fallido, hash y error saneado |
| Fuga de secretos/PII | Env server-side y errores saneados | No loggear Customer Session, payload completo, token, email o secret |
| Denegacion de servicio | Timeout externo y verificacion temprana | Limite de body, respuesta durable <2s, cola/replay y alerta por endpoint |
| Elevacion de privilegios | RLS/RPC y sin escrituras cliente | Corregir refund, gracia y eventos viejos que mantienen acceso |
| Phishing/open redirect | Solo HTTPS | Allowlist exacta de return URL |
| Manipulacion de cache local | Device binding en validacion online | Firmar/MAC, ligar a usuario+fingerprint y rotar formato |

No se encontraron secretos hardcodeados en los archivos revisados. Los nombres de variables de entorno son referencias, no valores. Los logs de debug de Polar deben permanecer desactivados en produccion y seguir enmascarando email/detalles.

## Idempotencia y consistencia: contrato propuesto

1. Verificar firma sobre body crudo y validar esquema/tamano.
2. Insertar `webhook-id`, hash, tipo, recurso y timestamp en una inbox con estado `received`; el insert unico y el commit durable preceden al 2xx.
3. Un worker reclama la fila de forma atomica, aplica todos los efectos en una transaccion DB o marca `failed` reintentable.
4. Un duplicado solo retorna 2xx si esta `processed`; si esta `failed/received`, debe reanudarse, no descartarse.
5. Cada recurso guarda la ultima version/`modified_at`; snapshots anteriores no pueden degradar el estado.
6. `revoked`/grant revocado prevalece sobre activaciones antiguas. `canceled` al final de periodo no equivale a revoked.
7. Tras ambiguedad, hueco o evento terminal, reconciliar Customer State/grants y guardar evidencia de la convergencia.
8. Checkout usa `checkout_attempt_id` local y reutiliza sesion abierta para mismo usuario/producto.
9. Refund se aplica a ledger de order/grant, nunca al entitlement agregado solo por nombre de evento.

## Alternativas evaluadas

### A. Retirar Stripe inmediatamente

Rechazada. No corrige ningun riesgo Polar, puede romper interpretacion de datos legacy y viola el gate explicito de no retirar Stripe sin validacion completa.

### B. Mantener Stripe historico inerte y endurecer Polar por microcortes — recomendada

Minimiza superficie activa: Polar sigue como unico runtime, Stripe no se toca y cada riesgo se corrige con tests/rollback propio. Permite revisar manualmente antes de exponer pagos.

### C. Reintroducir coexistencia activa Polar + Stripe

Rechazada salvo decision de producto futura. Duplica webhooks, conciliacion y soporte y no existe necesidad demostrada.

### D. Autorizar directamente desde Customer State sin mirror local

Util como reconciliacion, no como unica ruta. La aplicacion necesita cache offline, device binding y auditoria local. El mejor equilibrio es mirror local convergente cuyo origen comprobable sea Customer State/grants.

## Plan por microcortes y rollback

Cada corte debe ser un PR independiente, sin pagos reales salvo el gate manual indicado.

1. **Inbox webhook atomica.** Añadir estados `received/processing/processed/failed`, hash y transaccion; test de fallo despues del claim y retry. Rollback: apagar consumer nuevo y reprocesar filas no terminales con la version anterior solo si no hay efectos parciales.
2. **Orden y reconciliacion.** Persistir version temporal por recurso, soportar `customer.state_changed`/grants y comando de reconciliacion dry-run. Rollback: desactivar job; conservar snapshots y no borrar historial.
3. **Maquina de suscripcion y gracia.** No activar `created`; cubrir incomplete/unpaid/uncanceled; definir una politica entre 24h local y grace de Polar. Rollback: feature flag de politica, nunca ampliar acceso automaticamente.
4. **Ledger de orders/refunds.** Guardar atribucion order-product-grant, distinguir partial/total y refund succeeded; impedir que una orden antigua revoque otra compra. Rollback: pausar automatismo de revocacion y enviar casos ambiguos a revision/reconciliacion.
5. **Cache offline autentica.** Ligar cache a user+fingerprint, proteger integridad y acotar expiracion/gracia; migracion de formato fail-closed para premium. Rollback: invalidar cache nueva y requerir revalidacion online, no aceptar cache legacy manipulable.
6. **Checkout, mapping y portal hardening.** Reutilizar intento abierto, validar mapping bidireccional por entorno, allowlist exacta de URLs, body limit, revisar uso del SDK oficial sin introducir dependencia sin aprobacion. Rollback: mantener billing flag off y volver a URL fija.
7. **Fixtures sandbox seguros.** Capturar payloads anonimizados de created/active/cancel/uncancel/past_due/recovery/revoked y refunds partial/total/failed, sin efectuar pago real; añadir pruebas de duplicado, orden inverso y fallo parcial. No ejecutar `smoke-webhook-deployed.ts` contra un endpoint real: firma POSTs que mutan entitlements. Rollback: fixtures son datos de test, removibles sin tocar produccion.
8. **Observabilidad y runbook.** Metricas de lag/fallos/duplicados/reconciliacion, alerta de endpoint deshabilitado y runbook sin payload sensible. Rollback: desactivar alertas ruidosas, mantener audit log.
9. **Smoke monetario controlado — gate humano.** Solo con presupuesto, cuenta, importe y refund aprobados por Isaac; nunca automatizado en esta auditoria. Validar alta, webhook, entitlement, portal, cancelacion/refund y recuperacion. Rollback: procedimiento manual previamente ensayado y evidencia financiera conciliada.
10. **Retirada Stripe reversible.** Tras todos los gates, etiquetar consumidores, actualizar arquitectura, mover config placeholder y codigo deprecado a un paquete/archivo historico; migraciones y datos se preservan. Cualquier DROP/borrado requiere proyecto separado, backup y aprobacion expresa. Rollback: restaurar archivos archivados; no depender de recuperar datos borrados.

## Checklist de validacion manual de Isaac

### Antes de habilitar billing

- [ ] Revisar y aprobar cada PR de microcorte; nada mergeado automaticamente.
- [ ] Confirmar que `VITE_BILLING_ENABLED` sigue false hasta completar el gate.
- [ ] Verificar que sandbox y produccion tienen tokens, productos, endpoints y secretos aislados sin mostrar valores.
- [ ] Confirmar producto, moneda, importe, impuestos, URLs y politica de refunds en dashboard.
- [ ] Confirmar grace de Polar y politica offline Vantare; deben ser coherentes y estar documentadas.
- [ ] Confirmar alertas, responsable y runbook de webhook/reconciliacion.

### Suite segura obligatoria

- [ ] Duplicado simultaneo y secuencial del mismo `webhook-id`.
- [ ] Fallo despues de persistir inbox y antes/durante efectos; retry converge.
- [ ] Eventos active/revoked en ambos ordenes; nunca revive un snapshot antiguo.
- [ ] created/incomplete no concede acceso; active/grant actual si.
- [ ] cancel-at-period-end mantiene acceso; uncancel lo restaura; revoked lo corta.
- [ ] past_due aplica exactamente la gracia aprobada y recovery vuelve a active.
- [ ] Refund parcial no revoca compra lifetime; total exitoso solo revoca su grant/order.
- [ ] Refund de suscripcion no cancela la suscripcion por si solo.
- [ ] Customer State repara evento perdido y deja auditoria.
- [ ] Portal solo retorna a origen permitido y sus URLs/tokens no aparecen en logs.
- [ ] Cliente offline expira exactamente segun politica y revalida al recuperar red.
- [ ] Cache copiada/editada o de otro usuario/dispositivo no concede premium offline.
- [ ] Mapping falla el deploy si falta cualquier relacion directa/inversa o mezcla entornos.

### Gate monetario y produccion

- [ ] Isaac aprueba por escrito gasto maximo, cuenta y ventana.
- [ ] Se ejecuta una compra minima real y su refund solo por persona autorizada.
- [ ] Se reconcilian recibo, order, webhook, ledger, entitlement y refund.
- [ ] Se observa al menos un ciclo/escenario de suscripcion acordado o se documenta la excepcion.
- [ ] Se prueba recovery de pago con procedimiento controlado, sin manipular datos reales ajenos.
- [ ] Solo entonces se decide habilitar ventas y, en otro gate, retirar residuos Stripe.

## Sub-issues propuestas

1. [ISA-68 — Inbox webhook atomica y replay seguro](https://linear.app/vantareapp/issue/ISA-68/isa-7a-inbox-webhook-atomica-y-replay-seguro).
2. [ISA-69 — Orden monotono y reconciliacion con Customer State/grants](https://linear.app/vantareapp/issue/ISA-69/isa-7b-orden-monotono-y-reconciliacion-polar).
3. [ISA-70 — Maquina de suscripcion, dunning y politica de gracia](https://linear.app/vantareapp/issue/ISA-70/isa-7c-suscripcion-dunning-y-politica-de-gracia).
4. [ISA-71 — Ledger de orders y refunds parciales/totales](https://linear.app/vantareapp/issue/ISA-71/isa-7d-ledger-de-orders-y-refunds).
5. [ISA-72 — Hardening de checkout, mapping y portal](https://linear.app/vantareapp/issue/ISA-72/isa-7e-hardening-de-checkout-mapping-y-portal).
6. [ISA-73 — Integridad y vinculacion de cache offline](https://linear.app/vantareapp/issue/ISA-73/isa-7f-integridad-de-cache-offline).
7. [ISA-74 — Fixtures sandbox y matriz de regresion lifecycle](https://linear.app/vantareapp/issue/ISA-74/isa-7g-fixtures-sandbox-y-matriz-lifecycle).
8. [ISA-75 — Observabilidad y runbook operativo](https://linear.app/vantareapp/issue/ISA-75/isa-7h-observabilidad-y-runbook-billing).
9. [ISA-76 — Smoke monetario controlado](https://linear.app/vantareapp/issue/ISA-76/isa-7i-smoke-monetario-controlado).
10. [ISA-77 — Retirada reversible del legado Stripe](https://linear.app/vantareapp/issue/ISA-77/isa-7j-retirada-reversible-del-legado-stripe).

Estas unidades viven como hijas de ISA-7. ISA-68 a ISA-75 bloquean el smoke monetario; ISA-76 bloquea la retirada Stripe.

## Checks ejecutados

| Check | Resultado | Alcance |
|---|---|---|
| `go test ./internal/license/...` | PASS (16.884s) | Cliente, cache, RPC y plan/licencia |
| `pnpm test -- billing-client PaywallScreen AccountSettings entitlements-refresh` | NO EJECUTADO: `vitest` no disponible; `node_modules` ausente | No se instalaron dependencias por limite de la auditoria |
| `deno test --allow-env functions` | NO EJECUTADO: falta resolucion local de `npm:standardwebhooks` con auto-install desactivado | No se cambio config ni se instalaron paquetes |

La imposibilidad de arrancar dos suites reduce la confianza local y debe resolverse en un entorno reproducible ya provisionado. No se oculto ni se convirtio en PASS.

## Recomendacion final

Mantener billing deshabilitado para venta publica. Implementar la alternativa B en el orden propuesto, priorizando W1, R1/R2 y S3. No retirar ni modificar Stripe, no migrar/borrar datos y no habilitar produccion hasta que Isaac valide manualmente los gates completos. El siguiente hito valido no es otra URL de checkout: es demostrar convergencia idempotente ante fallo parcial, orden inverso, cancelacion, refund y recovery.

## Fuentes oficiales Polar

- [API overview y entornos](https://polar.sh/docs/api-reference/introduction) — Primary, acceso 2026-07-14.
- [Checkout Session](https://polar.sh/docs/features/checkout/session) — Primary, acceso 2026-07-14.
- [Webhooks: endpoints](https://polar.sh/docs/integrate/webhooks/endpoints), [delivery](https://polar.sh/docs/integrate/webhooks/delivery) y [events](https://polar.sh/docs/integrate/webhooks/events) — Primary, acceso 2026-07-14.
- [Subscriptions](https://polar.sh/docs/features/subscriptions/introduction), [management](https://polar.sh/docs/features/subscriptions/manage) y [failed payments](https://polar.sh/docs/features/subscriptions/failed-payments) — Primary, acceso 2026-07-14.
- [Orders](https://polar.sh/docs/features/orders) y [Refunds](https://polar.sh/docs/features/refunds) — Primary, acceso 2026-07-14.
- [Customer Portal](https://polar.sh/docs/features/customer-portal/introduction), [Customer State](https://polar.sh/docs/integrate/customer-state) y [Benefits](https://polar.sh/docs/features/benefits/introduction) — Primary, acceso 2026-07-14.
