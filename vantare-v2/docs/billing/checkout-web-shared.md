# VANTA-42 / #1620 · Compra compartida, caducidad y reembolso automático

**R5 vigente:** [seguridad de compensación y ACK D1](checkout-review-r5.md).
El reembolso está apagado por defecto; exige intento Vantare y resolución
terminal no aplicable, nunca solo falta de licencia/cuarentena. IVA pendiente
de sandbox y política net/gross; ACK D1 exige evidencia firmada independiente.
Los apartados R4 siguientes documentan el mecanismo previo, no autorizan activarlo.

Rama `vantareapp/isa-1620-checkout-web`, actualizada mediante merge de nightly
`9e48eb86f8d2cfc43b64010d2b1ac1c58768826a` (#1661/#1593), PR #1663.
Entrega de código y pruebas locales. No acredita despliegue ni apertura.

## Integración vigente con nightly (R8)

La oferta inicial, atribución/renovación de creador, arbitraje de informes y
Founders proceden de nightly, incluidos los contracargos. El adaptador web
consulta billing_launch_checkout y reserva creador mediante
claim_billing_creator_checkout_attempt, igual que la app. Ningún segundo cupón
entra en el primer pago. Si la oferta mostrada ya fue consumida, la web rechaza
antes de Polar; no sustituye silenciosamente 3,99/39,90 por precio normal.

La migración checkout_web_nightly_integration conserva la transacción de
atribución de #1661 y devuelve además guard_version=2. Añade Founders al guard
compartido, respeta billing_purchase_policy y mantiene el bloqueo entre Founders
y una compra aún pendiente. No habilita su CTA web ni modifica derechos históricos.
El marcador begin y binding siguen obligatorios antes de publicar una URL.

La reserva de lanzamiento de #1593 solo se libera antes del plazo si el intento
anterior tiene resolución canónica terminal; mantiene CAS y todo bloqueo de pago
abierto/incierto. Las comprobaciones conjuntas prueban que un rechazo cierto
permite nuevo intento y que una prueba antigua no reemplaza otra reserva viva.

Compensación permanece apagada. Siguen siendo obligatorios sandbox net/gross,
inventario de pedidos/inbox y receptor privado Owner con ACK antes de activarla.
Los fallos del ledger de informes conservan su cursor para reintento, procesando
los otros ítems de la página; una observación financiera inválida aislada conserva
su incidencia Owner y no impide avanzar. La baja D1 automática y su ACK firmado
conservan los cuatro únicos permisos del rol de pull, comprobados tras nightly.

## Contrato y barrera de cuenta

Las migraciones canónicas son:
- `20261015191316_checkout_web_shared_guard.sql`: guard compartido.
- `20261015193638_checkout_automatic_compensation.sql`: protocolo guard **2**,
  marcador previo al POST, compensación y resolución de intentos.
- `20261015195425_web_purchase_erasure_pull.sql`: baja D1 por pull, mantenimiento
  y avisos duraderos al Owner.

Se mantienen los cinco argumentos y outcomes de claim. App/Worker exigen
guard 2 antes de Polar. La RPC bloquea UUID antes de filas (#1622), rechaza
tombstone/derecho activo y serializa cuenta/entorno/familia entre canales.
`billing_begin_checkout_request` sella intento/producto con un nonce aleatorio
ANTES del POST. Complete exige ese marcador y retiene el binding mediante el
trigger original. Sin ACK no se devuelve URL. El webhook sigue resolviendo
solo por binding/customer; metadata nunca concede licencia ni vincula cuenta.

## Caducidad automática (F1)

Un lease local caducado no demuestra que un checkout pueda dejar de cobrar.
Cada ejecución del reconciliador:
1. Resuelve `unpaid_expired` los intentos no enviados, bajo el mismo lock UUID.
   Begin compite con caducidad: solo uno puede ganar, y no hay POST sin su ACK.
2. Para checkouts conocidos, consulta Polar; solo `expired/failed` autoritativos
   liberan el hold, y no si existe un cobro observado aún sin reembolsar.
   `open/confirmed/succeeded`, timeout o error conservan el hold.
3. Recorre también sesiones Polar para recuperar ACK perdidos mediante el nonce
   sellado. Solo guarda ID de recuperación/estado: no fabrica binding ni URL.
4. Un rechazo cierto 400/401/403/404/422/429 del POST libera el intento.
   Un fallo de transporte/5xx sigue incierto. Reutilizar UUID terminal devuelve
   `checkout_attempt_expired`; el siguiente clic explícito crea uno nuevo.

El guard ignora únicamente intentos con resolución terminal. Un intento incierto
no permite evadir el bloqueo cambiando periodo, pestaña o canal. Un hold enviado
sin ID recuperable queda conservadoramente retenido y genera aviso al Owner.
No se borra ni se vuelve a cobrar para salir de un estado desconocido.

## Cobro sin licencia: compensación, nunca recuperación por soporte

El reconciliador existente observa pedidos iniciales pagados del catálogo y
organización verificados, antes de procesar cualquier proyección de su página.
Renovaciones y otros productos no se convierten en compensaciones de checkout.
El registro privado tiene clave única entorno/pedido y snapshot inmutable.
Tras 15 minutos de gracia, si no hay bundle completo de grants del origen
canónico, selecciona el reembolso. Grants históricos completos también prueban
cumplimiento: no se reembolsa una suscripción antigua legítima ya caducada.
Una selección de reembolso impide activar grants tardíos del pedido/suscripción;
se refresca la cuenta viva sin resucitar una baja de #1622.

Lease de dos minutos por pedido; reintentos con backoff 30 s hasta una hora.
Antes de cada escritura se lee pedido y lista paginada de refunds, validando
organización/producto/pedido/moneda. Se solicita solo el neto restante tras
descuentos; Polar añade el impuesto. Éxito exige confirmar todo el neto y todo
el impuesto en el pedido autoritativo. Un 201 no es liquidación definitiva.
Una suscripción se revoca idempotentemente tras aceptar/encontrar el refund
para impedir renovaciones. Tras respuesta POST o ACK DB perdidos se relee:
no se repite a ciegas. No se inventa una cabecera de idempotencia de Polar.
La unicidad local y los límites del pedido evitan duplicar el importe; no se
promete exactamente una petición HTTP bajo todos los fallos posibles.

Cada fallo deja código cerrado, auditoría y outbox Owner; un refund pendiente
tras tres intentos también alerta. Un éxito financiero no elimina un aviso
anterior sin entregar. El ledger financiero sin correo ni UUID de cuenta
sobrevive la baja para terminar la devolución. Sin cobro, solo caduca el intento.
Soporte no activa/vincula pagos a medias ni pide otro pago: el sistema devuelve
el dinero. Owner puede reparar configuración/API; la cola sigue reintentando.

## Baja automática D1 por pull (#1622)

El tombstone canónico encola un UUID borrado. Un contador transaccional serializa
el orden de commit: una secuencia ordinaria podría saltarse un evento no
confirmado. La RPC STABLE `web_purchase_erasure_pull` solo lee hasta 50 eventos
desde el cursor confirmado del consumidor fijo. No borra cuentas.

El cron Worker de cinco minutos instala en una transacción D1 el hash HMAC de
supresión, borra las filas de cuenta y guarda cursor local. Después purga sus
contadores y confirma rango/recuento mediante `web_purchase_erasure_ack`.
La supresión impide INSERT/UPDATE tardíos admitidos antes de la baja. No existe
endpoint HTTP destructivo. Un ACK perdido repite borrados idempotentes.
El cursor de servidor solo avanza tras los borrados; #1622 no espera red externa.

Credencial separada **D1_ERASURE_JWT**, rol NOLOGIN NOINHERIT
`web_purchase_erasure` (miembro de authenticator), sin acceso directo a tablas.
Solo cuatro RPC: pull de lectura, ACK de cursor, fallo cerrado y lookup de
estado de hasta 50 intentos. No tiene funciones de compra, licencia ni borrado.
Se exige JWT firmado por el proyecto: `iss=supabase`,
`role=web_purchase_erasure`, `aud=authenticated`,
`purpose=web_purchase_erasure`, con expiración corta y rotación operativa.
Un JWT Clerk no puede asumir este propósito. Isaac provisiona el JWT mediante
su procedimiento privado; jamás copiar la clave de firma del proyecto al Worker.
El transporte de baja nunca lee service_role; la compra conserva su credencial
servidor previa. Variables Worker: `SUPABASE_PUBLIC_KEY`, `D1_ERASURE_JWT`,
`PURCHASE_ERASURE_SALT` (>=32), además de URL/binding y salt de ritmo existentes.

Tres fallos consecutivos generan aviso Owner; un éxito reinicia el contador.
Un watchdog independiente del backend alerta si no hay heartbeat en 15 minutos,
incluyendo JWT caducado o cron ausente que no puede reportarse a sí mismo.
Logs contienen códigos/recuentos, sin UUID/JWT/respuestas. Los hashes de supresión
y tombstones fuente duran mientras dure la barrera #1622. Rotar el salt requiere
pausar compras y reejecutar TODO el stream desde cursor cero antes de reabrir.
No resetear el cursor ni borrar hashes por antigüedad sin ese procedimiento.

## Conservación y observación

D1: URLs/IDs minimizados tras resolución; fila terminal purgada 24 h después.
Una fila sin intento canónico se purga a las 24 h; toda caché restante a 30 días
tras consultar el estado canónico. El hold financiero sigue en Supabase.
El cron también conserva la minimización ready a 24 h de caducidad y purga a
30 días, contadores por ventana de cinco minutos y logs operativos 30 días.
Supabase purga intentos resueltos >30 días (hasta 100/tick), auditoría operativa
y avisos entregados >30 días. Bindings/ledger financiero conservan su retención
de billing; un hold incierto no se elimina ciegamente. A partir de una hora
genera aviso sin datos personales. La privacidad debe reflejar estos plazos.

Avisos: outbox durable, entrega HTTPS firmada HMAC SHA-256 con timestamp,
ID estable y reintento. Variables backend: `BILLING_OWNER_ALERT_URL`,
`BILLING_OWNER_ALERT_SECRET` (>=32). Isaac configura un receptor privado que
muestre los incidentes al Owner y valide firma/ventana temporal/dedupe antes
de habilitar venta; la prueba usa un receptor doble, no una bandeja real.
No se ha añadido una pantalla a la miniapp Admin. El ACK HTTP del receptor
significa aceptación durable, nunca descartar si no se mostró/persistió.
Sin configuración/ACK la outbox sigue pendiente; no se silencian fallos.
El payload tiene entorno, tipo, código y correlación hash, sin PII.

## Despliegue posterior autorizado (venta cerrada)

1. Revisar rama y web juntas. Actualizar Edge a guard 2 antes de migrar:
   con esquema antiguo las compras fallan cerradas, sin POST no marcado.
2. Aplicar migraciones por pipeline autorizado; verificar ACL y contrato.
   Clientes R3 exigen guard 1 y se cierran al recibir 2; complete exige begin.
3. Publicar/configurar y programar billing-reconcile cada cinco minutos
   con su secreto servidor existente, POLAR_ACCESS_TOKEN con permisos necesarios
   de lectura/refund/revocación, mapa completo y destino Owner privado.
   Su despliegue sigue pendiente: continúa fuera de wrappers generales.
4. Aplicar D1 0003/0004/**0005**, publicar Worker actualizado y configurar
   credencial mínima/salts y cron. No mantener Worker antiguo con esquema nuevo.
5. Verificar borrado/ACK perdido/alertas/refund y todos los planes en sandbox
   autorizado; completar privacidad/Clerk/retornos antes de pedir apertura.
   Pro renueva a **5,99 €/mes y 59,99 €/año**. Isaac debe comprobar y ajustar
   productos/precios recurrentes de Polar: el código web no modifica Polar.
   Pro Plus conserva su contrato aprobado: 6,99/69,90 de lanzamiento también
   en renovación, 9,99/99,90 para altas normales. Sin decisión nueva de Plus.

No se cambian mapas reales, PURCHASE_OPEN ni cierre comercial #1633. Los
comandos de despliegue quedan reservados al orquestador/Isaac, sin ejecutarlos.

## Evidencia reproducible

```sh
python3 supabase/tests/run-checkout-web-docker.py --output ~/evidence/web-compra/r4-docker
# RED F1 esperado (guard R3 retiene la familia tras expiración terminal):
python3 supabase/tests/run-checkout-web-docker.py --before-expiry --output ~/evidence/web-compra/r4-f1-red
deno test --cached-only --no-lock --node-modules-dir=none --config supabase/functions/deno.json --allow-env --allow-read --allow-write supabase/functions
```

71 migraciones, **212 pgTAP y 13 carreras reales PASS**; RED F1 busy frente a
claimed esperado, no por función ausente. Locks observados con pg_blocking_pids,
sin sleeps como oráculo. Runner adquiere lock Docker y limpia contenedor propio.
Edge **630 PASS, 0 FAIL, 2 ignored** preexistentes. Tests sin permiso de red.
Fmt/lint producción y nuevos tests PASS; ocho require-await previos permanecen
en tests históricos. Calidad456 y superficie de deploy PASS. Native no cambia:
sin compilación Rust/telemetría. Web:66 tests, SQLite real, E2E cinco planes con
webhook real, Chrome40 capturas/CSP/backoff/precios/reintento explícito PASS.

Referencias públicas contrastadas: [Polar refund2026-10](https://polar.sh/docs/api-reference/2026-10/refunds/create-refund),
[revocación](https://polar.sh/docs/api-reference/2026-10/subscriptions/revoke-subscription)
y [JWT Supabase](https://supabase.com/docs/guides/auth/jwts). Lectura de documentos,
sin llamadas a las APIs de cobro/identidad.
