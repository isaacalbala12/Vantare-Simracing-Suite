# VANTA-42 R5 · Seguridad de compensación y baja D1

Instrucción vigente del orquestador tras review-r4. Sustituye las condiciones
financieras R4: **un webhook pendiente o una cuarentena genérica NO son motivo
de reembolso automático**. Ramas aisladas; sin despliegue ni API real.

## A1: alcance e interruptor

Migración checkout_review_safety: private.billing_compensation_policy por entorno,
enabled=false y amount_basis=NULL de fábrica. Solo el operador PostgreSQL puede
configurar la política; service_role no puede activarla. El runtime no interpreta
un flag del comprador. No habilitar sin revisión e inventario de solo lectura.

Observar pedido inicial del catálogo exige binding canónico o nonce sellado
de un intento Vantare. Checkout Links de creador, pedidos históricos sin vínculo
e intentos de otro origen generan incidencia Owner, nunca una compensación.
Un job legítimo tampoco se selecciona solo porque falten grants tras15min.

El procesador real del webhook debe haber terminado como no aplicable.
billing_resolve_checkout_non_applicable verifica de nuevo la barrera de cuenta
borrada o el intento sellado ya terminado, y guarda una resolución financiera
sin PII. No confundir un evento duplicado con un cobro duplicado: un replay
válido no se devuelve. Cualquier caso no probado va a Owner.

La selección consulta billing_webhook_inbox del pedido/checkout. received,
processing, failed y cuarentenas genéricas impiden selección. Solo resolución
terminal explícita permite continuar; histórico cumplido pasa a activated
sin quitar grants, incluso si el webhook válido terminó tarde. No se fabrica
identidad ni licencia desde metadata. Los helpers R4 sin guard son privados,
sin EXECUTE para los roles API. Un candidato que cambie aborta la transacción.

## A2: IVA configurable, pendiente de sandbox

refundRequestAmount encapsula net/gross; la política se fija y conserva por job.
En net se solicita neto restante; en gross se suma impuesto restante. El agregado
de pedido mantiene neto e impuesto separados; refunds brutos se normalizan con
su tax_amount. Se comprueba total neto+IVA, moneda, organización y ausencia de
saldo aplicado antes de cualquier escritura. Si no converge, no se hace otro
POST y se registra retry/aviso Owner. Éxito exige confirmación total de ambos.

Los dobles cubren ambos contratos y un impuesto/agregado incoherente con aviso.
**No prueban cuál usa Polar real.** Isaac debe verificar en sandbox autorizado
pedido con IVA, refund parcial/completo, resultado tras timeout y campos
refunded_amount/refunded_tax_amount/amount/tax_amount antes de elegir amount_basis
y habilitar enabled. No se asume que Polar añade IVA automáticamente.
Se mantiene read-before-write, lease y prohibición de repetir un POST incierto.

## A3/A4: progreso acotado

Un intento no publicado ni recuperado con marcador/producto sellados caduca
a las24h y deja aviso Owner. No publica/reutiliza la URL anterior. Complete
rechaza el intento terminado; un pago tardío sin binding cae en cuarentena y
debe pasar por resolución terminal antes del reembolso. Checkouts conocidos,
publicados o confirmed conservan verificación autoritativa Polar. Los antiguos
intentos sin marcador suficiente permanecen conservadores y se escalan.

Un rechazo4xx con ACK perdido también acaba por ese plazo aunque se cambie
de periodo; reintentar el producto original confirma antes el rechazo cierto.
El reconciliador aísla observación, procesamiento y replay por ítem. Un veneno
genera incidencia durable sin congelar otros pedidos/cursor; el inbox conserva
su retry. Si ni siquiera se puede persistir la incidencia, el tick falla.

## B1/B2: evidencia de baja y privilegios

El Worker instala la supresión y borra D1; consulta cero filas restantes para
cada UUID del lote antes del ACK. Firma digest SHA256 canónico de id:UUID
ordenados con HMAC independiente del JWT. Protocolo firmado:
v1, cursor origen, cursor destino, recuento, cero restantes y digest, separados
por LF. Supabase reconstruye hash/recuento desde su outbox y valida firma/CAS.
JWT de pull filtrado no puede falsificar recibos ni avanzar heartbeat/cursor.
El ACK antiguo sin prueba queda sin permiso. Rollback, ACK perdido y borrado
incompleto están probados con SQLite real; servidor rechaza MAC/hash falsos.

Nuevo secreto Worker: PURCHASE_ERASURE_ACK_SECRET (>=32).
Isaac provisiona la misma clave en la fila privada
private.web_purchase_erasure_proof_key del entorno, por su vía segura, sin
imprimirla ni incluirla en repo/argumentos/logs. El rol mínimo no puede leerla.
La prueba demuestra la declaración firmada por el Worker; no es atestación
remota de hardware ni protege si se compromete el Worker con ambas credenciales.

D1_ERASURE_JWT: validez máxima operativa1h; rotar cada30min por canal privado.
No dar clave de firma del proyecto al Worker. Verificar exp/iat al provisionar.
Si falla rotación, el watchdog15min independiente alerta; no alargar el JWT
para silenciarlo. Salt de supresión rota solo con replay completo ya documentado.

Auditoría pgTAP: cero RPC adicionales de aplicación ejecutables por el rol a
través de PUBLIC. Se retira EXECUTE PUBLIC de funciones de aplicación que lo
heredaban y se conserva el acceso anterior de anon/authenticated/service_role.
Extensiones del fixture pgTAP no son RPC de producto. No se cambian tablas RLS
ni autoridades de compra/borrado de #1622. Repetir esta auditoría tras integrar
otras ramas que añadan RPC y no volver a conceder PUBLIC sin revisión.

## Verificación

235 pgTAP /72 migraciones /13 carreras, 632 Edge/2ignored preexistentes;
SQLite ACK con evidencia, borrado incompleto y ACK perdido. Repetir checks
afectados tras los cambios comerciales de R5 y registrar el total final.
Sin gates Rust porque native no cambia. Evidencia ~/evidence/web-compra/r5-*.

### Reproducción offline con Deno2.9

El wildcard npm de la base necesita metadatos no disponibles en caché después
del reinicio. La evidencia r5-deno-imports.json fija temporalmente los mismos
paquetes/versiones ya presentes en deno.lock: @polar-sh/sdk0.48.1 y
standardwebhooks1.0.0. No se cambió dependencia, lock ni package.json.
Comando desde raíz:
deno test --config supabase/functions/deno.json
--import-map ~/evidence/web-compra/r5-deno-imports.json
--node-modules-dir=none --cached-only --no-lock --allow-env --allow-read
--allow-write=$TMPDIR supabase/functions
Sin permiso de red; escritura solo temporal exigida por dos fixtures existentes.
Lint de producción y test de compensación excluye no-import-prefix, regla nueva
de Deno2.9 que señala cuatro imports HTTPS preexistentes; no se cambia la política
del repo. Resto de reglas activas. Fmt5archivos y calidad/superficie PASS.
