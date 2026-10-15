# Founders — VANTA-83 / #1661

Preparado en rama de issue; sin despliegue, producto Polar, cobros ni apertura de venta.
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

**Único sitio para las fechas:** fila `singleton=true` de
`private.founders_sale_config`, creada por `20261015195335_founders_plan.sql`.
Valores iniciales: `[2026-10-26 19:00 Europe/Madrid, 2026-11-26 19:00 Europe/Madrid)`.
Ambos corresponden a las 18:00 UTC. Apertura inclusiva y cierre exclusivo.
Una modificación administrativa revisada de esa fila cambia todas las comprobaciones;
ni app ni web fijan fechas propias. La RPC pública `founders_sale_window()` devuelve
fechas, disponibilidad calculada por el reloj SQL y precio, sin datos de cuentas.

La variable existente **`POLAR_PRODUCT_MAP`** debe contener la entrada opcional
`checkout_keys.founders` y sus mapas inversos. **No hay ID real en esta entrega**.
Isaac crea el producto de pago único de 50 EUR con impuestos incluidos, sin trial,
sin códigos/descuento, y configura su ID en
`POLAR_PRODUCT_MAP.checkout_keys.founders.polar_product_id` y el precio en
`polar_price_ids`. La entrada exige `plan_sku: "founders"`, `billing_type: "one_time"`,
`lifetime: true`, `active: true`, `capabilities: ["vantare.plan.founders"]`,
`channels: ["stable"]`, `launch_scope_version: null`, `trial: {"enabled": false}`,
`entitlement_product_key: "bundle"`. Ausencia de entrada deja la compra deshabilitada.
No retirar el mapping después del cierre: lo necesitan reembolsos y reconciliación.

## Suscripciones y cobros duplicados — decisión conservadora pendiente de Isaac

La compra Founders se bloquea con suscripción activa, trial, impago o un periodo
pagado aún vigente, incluida una cancelación al final del periodo. Un dueño de
Founders tampoco puede iniciar otro checkout de plan. Nunca se cancela ni modifica
una suscripción automáticamente en Polar. Isaac debe decidir cómo facilitar una
transición asistida si el periodo pagado alcanza el final de la venta; esta entrega
no devuelve dinero ni prorratea. Si llegan derechos de ambas fuentes, Founders
prevalece en el catálogo y un reembolso suyo deja los otros derechos independientes.

La comprobación SQL se hace antes de crear o reutilizar checkout y otra vez al
reclamar el intento. El bloqueo por cuenta serializa intentos Founders contra otros
intentos; se conserva la clave idempotente existente y el resultado incierto.
Esto no cancela enlaces antiguos ya abiertos en Polar ni evita compras hechas por
fuera del endpoint: no ofrecer enlaces directos de producto.

## Pago, reembolso y borrado

Se conserva inbox firmado, atribución por UUID/binding del servidor, ledger
monótono y bloqueos de #1622. Toda orden Founders, también al reconciliar una ya reembolsada, exige pago único, EUR,
`total_amount=5000`, sin descuento y `paid_at` (o `created_at` de la orden si el
proveedor no envía `paid_at`) dentro de la ventana. Un evento tardío de un pago
válido se acepta por su fecha de pago; uno inválido queda en cuarentena sin derecho.
Reembolsos y reconciliación siguen funcionando después del cierre. Cambiar las
fechas no invalida el replay ni el reembolso de una orden ya admitida. Los bloqueos
efectivos de #1622 retiran el acceso por reembolso, también parcial o pendiente,
sin retirar otras fuentes. Gestión consulta esos derechos efectivos y distingue
Founders tanto en el plan como en su pago. Los tombstones impiden nueva compra
y la barrera de escrituras existente evita resucitar una cuenta borrada.

**Límite que requiere validación antes de vender:** la API documentada de Polar
`CheckoutCreate` no admite `expires_at` como entrada. El endpoint bloquea nuevas
sesiones fuera de ventana y el webhook no concede derechos a pagos tardíos, pero
un enlace de Polar ya entregado puede seguir aceptando un pago. Isaac debe validar
el cierre operativo del producto/enlaces antes de activar Founders. Los pagos
fuera de plazo se revisan manualmente; no se hacen refunds automáticos.
Referencia comprobada: [crear checkout Polar](https://polar.sh/docs/api-reference/checkouts/create-session).

La licencia perpetua offline mantiene el comportamiento existente de pago único:
una credencial ya firmada no se puede revocar retroactivamente sin conexión.
El backend retira el derecho inmediatamente y la próxima renovación lo refleja;
no se promete revocación instantánea de una máquina desconectada.

## Integración web posterior — VANTA-42 (sin tocar su repo)

1. Leer `POST /rest/v1/rpc/founders_sale_window`, cuerpo `{}`, clave pública del
   proyecto. Respuesta: `{"opens_at":"…","closes_at":"…","available":false,
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
4. Tratar 409 `founders_sale_closed`, `founders_subscription_active`,
   `founders_already_owned`, `account_unavailable`; 503 indica que la elegibilidad
   o estado no se ha podido comprobar, no permite inventar otro intento.
   El checkout conserva también sus errores de intento ocupado/incierto/caducado.
5. No aplicar el código de creador ni el descuento de suscripciones al plan.
   No mostrarlo como una promoción ni prometer canales privados.

Textos para app/web y base de revisión legal (no sustituyen condiciones aprobadas):

| Idioma | Compra | Contenido | Suscripción vigente |
|---|---|---|---|
| ES | Founders · 50 € · pago único | Todos los módulos y widgets presentes y futuros, para siempre. Sin caducidad ni renovación. | Con una suscripción vigente, la compra queda bloqueada para evitar otro cobro. No se cancela automáticamente. |
| EN | Founders · €50 · one-time payment | All current and future modules and widgets, forever. No expiry or renewal. | Purchases are blocked while a subscription is current to avoid another charge. It is never cancelled automatically. |
| IT | Founders · 50 € · pagamento unico | Tutti i moduli e widget presenti e futuri, per sempre. Senza scadenza né rinnovo. | L’acquisto è bloccato con un abbonamento in corso per evitare un altro addebito. Nessuna cancellazione automatica. |
| PT-BR | Founders · € 50 · pagamento único | Todos os módulos e widgets atuais e futuros, para sempre. Sem vencimento nem renovação. | A compra é bloqueada enquanto houver uma assinatura vigente para evitar outra cobrança. Nenhum cancelamento automático. |

El Hub sigue mayoritariamente en español; el bloque Founders permite consultar
estos cuatro idiomas sin cambiar preferencias de widgets ni traducir otras pantallas.

## Verificación y límites

SQL local desechable en el Mac bajo `~/orq/docker.lock`: aplicar migraciones y
`python3 supabase/tests/run-admin-local.py --output <evidencia> --test founders.test.sql
--test native_admin.test.sql --test commercial_refunds.test.sql --test commercial_tombstone.test.sql`.
La prueba de Founders cubre límites exactos, configuración, idempotencia, bloqueo de
suscripción y reintentos, derecho perpetuo, Owner, reembolso y cuenta borrada.
Edge: mapping/checkout/Polar/webhook/credenciales. Rust: firma y formato,
catálogo futuro, módulos offline, invalidación y confirmación de compra distinta de Pro.
Gates y SHA finales se registran en #1661, PR y handoff. No se capturó la app (#1655).
