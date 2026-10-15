# Founders — VANTA-83 / #1661

Preparado en rama de issue; sin despliegue, cobros ni apertura de venta. El producto Polar ya existe según
confirmación del orquestador; esta rama no modifica producción.
Decisión de Isaac del 15-oct-2026 y encargo del orquestador: **plan propio de 50 EUR,
pago único, todos los módulos y widgets actuales y futuros para siempre**.
No es Launch Edition, un descuento ni un precio de suscripción.

## Contrato y configuración

El derecho es `vantare.plan.founders`, de fuente Polar `order`, sin `valid_until`,
sin `scope_version`. El catálogo `Founders` permite cualquier widget y módulo,
incluidos identificadores futuros; no depende de enumerar cada módulo comprado.
No concede roles Owner/tester ni canales privados: el producto se configura con
`channels: ["stable"]`. Isaac debe validar por separado cualquier ampliación de canales.
IPC de servicios v10 y control v5; fotos siguen v10. Recompilar juntos Hub,
services, runtime y overlays; se rechazan componentes con contratos anteriores.

**Único sitio para abrir/cerrar la venta:** fila `singleton=true` de
`private.founders_sale_config`, creada por `20261015195335_founders_plan.sql`.
`opens_at = 2026-10-26 19:00 Europe/Madrid` (18:00 UTC),
`sales_enabled = true` por defecto. No existe fecha de fin.
El precio de fundador subirá más adelante, sin fecha prevista.
El reloj SQL decide la apertura. La RPC pública `founders_sale_window()` conserva
su nombre por compatibilidad y devuelve apertura, interruptor, disponibilidad y precio.
`subscription_transition = end_period` recoge la política definitiva, confirmada
por Isaac: no renovar la suscripción al acabar el periodo pagado, sin reembolso.
La alternativa proporcional se ha retirado para simplificar, con autorización de Isaac.

La variable existente **`POLAR_PRODUCT_MAP`** debe incorporar la entrada
`checkout_keys.founders` y sus mapas inversos. Los valores documentados de
producción están **en un único archivo**:
[`supabase/functions/scripts/founders-production-config.json`](../../../supabase/functions/scripts/founders-production-config.json).
Es un **fragmento para fusionar** con la configuración existente; no sustituye
el mapa completo ni es un fallback automático de sandbox o producción.
Conservar `schema_version`, `catalog_version` y todas las entradas/IDs anteriores.
Verificar que coincidan entorno y organización antes de fusionar. El producto
«Vantare Founders» y su precio único de **50,00 EUR** ya existen, según Isaac.
El archivo contiene organización, producto, precio y contratos de derecho,
sin secretos; no se repiten esos IDs en código, SQL ni textos.

La entrada exige `plan_sku: "founders"`, `billing_type: "one_time"`,
`lifetime: true`, `active: true`, `capabilities: ["vantare.plan.founders"]`,
`channels: ["stable"]`, `launch_scope_version: null`, `trial: {"enabled": false}`,
`entitlement_product_key: "bundle"`. Ausencia de entrada deja compra deshabilitada.
No retirar el mapping después del cierre: lo necesitan reembolsos y reconciliación.
Configurar no equivale a desplegar ni habilitar ventas antes de la beta pública.

**Inventario de producción comunicado por Isaac:** además de Founders, solo
existen Pro mensual **4,99 EUR** y Launch Edition **30 EUR** (retirada de oferta,
pero se conservan sus IDs para lectura histórica). **No existen todavía** Pro
anual, los precios decididos 5,99/59,99 ni Pro Plus. Los IDs de sandbox no sirven
para rellenar esos huecos de producción. Los precios del contrato son objetivos
pendientes de configurar, no una descripción del catálogo real. Esta entrega
no crea, actualiza, archiva ni publica productos en Polar.

## Suscripciones y cobros duplicados — decisión definitiva de Isaac

Pro y Pro Plus pueden comprar Founders. El derecho se activa antes de llamar a
Polar: no depende de que la cancelación responda. Se registra una transición
por suscripción en `private.founders_subscription_transitions`; se solicita
`PATCH /subscriptions/{id}` con `{"cancel_at_period_end":true}` y solo se marca
`completed` tras confirmar el mismo ID y ese estado. No se revoca el periodo
pagado ni se emiten reembolsos. Owner muestra `pending` o `completed` por cliente.
Un fallo deja la incidencia pendiente y el inbox del webhook reintenta; la escritura
de estado deseado es idempotente incluso tras perder la respuesta de Polar.
El mismo pedido en reconciliación vuelve a intentar la transición pendiente.
Una cuenta borrada o un derecho reembolsado no inicia nuevas cancelaciones.

Un dueño de Founders no inicia otro checkout de plan. La comprobación SQL se hace
antes de crear/reutilizar checkout y otra vez al reclamar el intento. El bloqueo
por cuenta evita intentos simultáneos incompatibles. Si coexisten derechos,
Founders prevalece; su reembolso no retira derechos de otras fuentes ni reactiva
la renovación previamente cancelada. Esa reactivación requeriría una decisión del cliente.

Launch Edition se retira de los botones de compra, resolución de checkout y
catálogo comercial. `launch_lifetime`, sus IDs y el lector admin se conservan
para compras históricas y reembolsos. El script no exige ni modifica ese producto.
El producto Founders existente se configura mediante el fragmento anterior;
el script valida 50 EUR y prepara el plan
**offline**, sin crear un producto real por su cuenta.
La aplicación del catálogo completo en producción queda bloqueada: los productos
recurrentes heredados de #1620 todavía no implementan el nuevo primer periodo
Pro y la no acumulación del código. VANTA-42/#1624 deben reconciliarlo antes de
activar esa campaña. Las simulaciones de sandbox conservan la historia técnica.

## Pago, reembolso y borrado

Se conserva inbox firmado, atribución por UUID/binding del servidor, ledger
monótono y bloqueos de #1622. Toda orden Founders, también al reconciliar una ya reembolsada, exige pago único, EUR,
`total_amount=5000`, sin descuento y `paid_at` (o `created_at` de la orden si el
proveedor no envía `paid_at`) a partir de la apertura y con venta habilitada. Un pago inválido queda en cuarentena sin derecho.
Reembolsos y reconciliación siguen funcionando después del cierre. Cambiar la
configuración no invalida el replay ni el reembolso de una orden ya admitida. Los bloqueos
efectivos de #1622 retiran el acceso por reembolso, también parcial o pendiente,
sin retirar otras fuentes. Gestión consulta esos derechos efectivos y distingue
Founders tanto en el plan como en su pago. Los tombstones impiden nueva compra
y la barrera de escrituras existente evita resucitar una cuenta borrada.

**Cierre futuro:** Polar `CheckoutCreate` no admite `expires_at` como entrada.
El interruptor del servidor impide crear/reutilizar sesiones, pero Isaac deberá
cerrar también el producto/enlaces ya entregados en Polar cuando decida cerrar
la venta. Un pago no admitido queda en cuarentena para revisión, sin devolución
automática. No retirar los mappings históricos. No ofrecer enlaces directos.
Referencia: [crear checkout Polar](https://polar.sh/docs/api-reference/checkouts/create-session).

La licencia perpetua offline mantiene el comportamiento existente de pago único:
una credencial ya firmada no se puede revocar retroactivamente sin conexión.
El backend retira el derecho inmediatamente y la próxima renovación lo refleja;
no se promete revocación instantánea de una máquina desconectada.

## Integración web posterior — VANTA-42 (sin tocar su repo)

1. Leer `POST /rest/v1/rpc/founders_sale_window`, cuerpo `{}`, clave pública del
   proyecto. Respuesta: `{"opens_at":"…","sales_enabled":true,"available":false,
   "amount_cents":5000,"currency":"eur"}`. Convertir fechas a la zona del usuario.
2. Autenticación del checkout existente: `POST /functions/v1/billing-checkout`
   con bearer de cuenta Supabase; **no pasar un JWT Clerk directamente**. La web
   que use OAuth nativo debe acordar su puente de cuenta con VANTA-42; el endpoint
   `/functions/v1/native-billing-checkout` conserva su validación OAuth nativa.
3. Cuerpo exacto `{"productKey":"founders","attemptId":"<UUID>"}`. Reutilizar
   UUID en reintento; nunca enviar usuario, email, importe, precio o producto Polar.
   Respuesta 200 `{"url":"https://polar.sh/…","reused":false}` (sandbox usa su host).
   Abrir esa URL. Volver de checkout no demuestra pago: renovar licencia y exigir
   `vantare.plan.founders` antes de mostrar compra confirmada.
4. Tratar 409 `founders_sale_closed`, `founders_already_owned`, `account_unavailable`; 503 indica que la elegibilidad
   o estado no se ha podido comprobar, no permite inventar otro intento.
   El checkout conserva también sus errores de intento ocupado/incierto/caducado.
5. No aplicar el código de creador ni el descuento de suscripciones al plan.
   No mostrarlo como una promoción ni prometer canales privados.

Textos para app/web y base de revisión legal (no sustituyen condiciones aprobadas):

| Idioma | Compra | Contenido | Suscripción vigente |
|---|---|---|---|
| ES | Founders · 50 € · precio de fundador | Todos los módulos y widgets presentes y futuros, para siempre. Pago único. Disponible desde la beta pública. Este precio subirá más adelante, sin fecha prevista. | Founders se activa al instante. Si tienes Pro o Pro Plus, se desactiva su renovación al terminar el periodo pagado, sin reembolso automático. El servidor confirma la disponibilidad. |
| EN | Founders · €50 · founder price | All current and future modules and widgets, forever. One-time payment. Available from the public beta. This price will rise later, with no date set. | Founders activates immediately. If you have Pro or Pro Plus, renewal stops at the end of the paid period, with no automatic refund. The server confirms availability. |
| IT | Founders · 50 € · prezzo fondatore | Tutti i moduli e widget presenti e futuri, per sempre. Pagamento unico. Disponibile dalla beta pubblica. Il prezzo aumenterà in futuro, senza una data prevista. | Founders si attiva subito. Con Pro o Pro Plus, il rinnovo termina alla fine del periodo pagato, senza rimborso automatico. Il server conferma la disponibilità. |
| PT-BR | Founders · € 50 · preço de fundador | Todos os módulos e widgets atuais e futuros, para sempre. Pagamento único. Disponível a partir da beta pública. O preço aumentará no futuro, sem data prevista. | Founders é ativado imediatamente. Com Pro ou Pro Plus, a renovação termina ao final do período pago, sem reembolso automático. O servidor confirma a disponibilidade. |

El Hub sigue mayoritariamente en español; el bloque Founders permite consultar
estos cuatro idiomas sin cambiar preferencias de widgets ni traducir otras pantallas.

## Verificación y límites

SQL local desechable en el Mac bajo `~/orq/docker.lock`: aplicar migraciones y
`python3 supabase/tests/run-admin-local.py --output <evidencia> --test founders.test.sql
--test native_admin.test.sql --test commercial_refunds.test.sql --test commercial_tombstone.test.sql`.
La prueba de Founders cubre límites exactos, configuración, idempotencia, convivencia con
suscripción y cancelación al final del periodo y reintentos, derecho perpetuo, Owner, reembolso y cuenta borrada.
Edge: mapping/checkout/Polar/webhook/credenciales. Rust: firma y formato,
catálogo futuro, módulos offline, invalidación y confirmación de compra distinta de Pro.
Gates y SHA finales se registran en #1661, PR y handoff. No se capturó la app (#1655).
