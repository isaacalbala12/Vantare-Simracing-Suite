# Descuento por informes · #1593 / VANTA-39

Preparación local, sin despliegue ni llamadas Polar reales. Catálogo SQL vacío
más `REPORT_PROMOTION_ENABLED` ausente/false mantienen la campaña inerte. No se
crean productos, descuentos, códigos, enlaces ni scheduler automáticamente.

## Reglas y decisiones conservadoras

Altas mensuales Pro/Pro Plus desde **26/10/2026 19:00 Europe/Madrid** inclusive
hasta **02/11/2026 00:00 Europe/Madrid** exclusivo. La hora final no figura en
el encargo: se elige la más restrictiva y debe confirmarse antes de activar. 45
días significa 1080 horas desde el alta, intervalo `[alta, alta+45 días)`. La
aritmética de meses usa Europe/Madrid, independientemente de la conexión SQL. No
se inventa un premio anual; la campaña se expresa en cobros mensuales.

Cuenta solo `testing_contribution_reviews.decision=accepted`, con contribución
`accepted/fixed`, enviada dentro de la ventana. La revisión humana, evidencia,
duplicados y cupos UTC de #1594 siguen en su frontera; no se duplican ni
alteran. Una aceptación tardía puede premiar un informe enviado a tiempo. Dos
decisiones spam posteriores al alta eliminan la promoción, también si llegan
tras la ventana. La pérdida es irreversible. Un solo registro por cliente y
entorno; cambiar o recrear la suscripción no reinicia el premio. El producto
también es inmutable.

Antes de sustituir el descuento se exige una factura pagada en el ledger B02 de
la misma suscripción/cuenta/entorno: `subscription.active` puede preceder al
cobro.

Primer cobro: descuento de lanzamiento de **un** mes sobre producto normal, sin
trial y sin códigos adicionales. Desde el siguiente cobro, dos aceptados dan 3
meses; cinco dan 6. El tramo mayor sustituye al menor y sus seis meses empiezan
en el siguiente cobro; no son 3+6 acumulados. Repetir el mismo tramo no lo
renueva. La elección compara céntimos con el 20 % de creador durante sus dos
primeros meses de calendario; empate favorece informes. Para normales, 2 EUR de
Pro y 3 EUR de Plus ahorran más que el 20 %. Sin premio puede ganar creador. El
primer mes ya facturado nunca se reabre ni se consume como mes de informes.

## Catálogo y operación posterior autorizada

`private.report_promotion_catalog` admite solo productos **normales mensuales**
de precio 599/999 céntimos y lanzamiento 399/699 céntimos. Insertar los IDs
observados de cada entorno, nunca IDs inventados ni de otro entorno. Los tres
IDs de descuentos se guardan por producto. `private.report_promotion_creators`
permite exclusivamente los IDs de creador autorizados para ese producto. La
asociación de creador se recoge del `discount_id` observado en el webhook; no
acepta texto del usuario ni metadata libre. No importa códigos de otra campaña.

**Conflicto comercial pendiente:** #1620 usa productos propios con base
permanente 3,99/6,99 y códigos limitados a esos productos. No se les pueden
aplicar además 2/3 EUR sin bajar de la tarifa aprobada. Esta campaña separada
usa normales; no migra suscripciones ni cambia precios, productos o links de
#1620. Sus códigos no son válidos aquí hasta que Isaac autorice códigos/ámbito y
distribución para los normales. La entrada de códigos/atribución en checkout
nativo no se añade. Los links existentes de #1620 conservan su campaña y NO
cumplen el precio normal desde mes 2 de esta promoción. Resolver la distribución
antes de habilitarla.

Preparar en Polar, tras autorización de Isaac, sin ejecutarlo en esta entrega:

| Plan mensual normal | Importe fijo EUR | Duración repeating              | Precio final |
| ------------------- | ---------------: | ------------------------------- | -----------: |
| Pro · 5,99          |             2,00 | 1, 3 y 6 meses, tres descuentos |         3,99 |
| Pro Plus · 9,99     |             3,00 | 1, 3 y 6 meses, tres descuentos |         6,99 |

Seis descuentos en total, `type=fixed`, moneda `eur`, `amount=200/300`,
`duration=repeating`, `duration_in_months=1/3/6`, restringidos al ID mensual
normal de su plan. Sin código público, sin descuentos compuestos. Conservar los
productos normales existentes; no se necesita crear producto nuevo para esto.
Para usar creadores en esta campaña: descuento separado `type=percentage`,
`basis_points=2000`, repeating 2 meses, restringido a esos normales; no ampliar
silenciosamente los IDs/códigos existentes ni cambiar su campaña. Validar
primero la atribución al sustituir el descuento de mes 1; hoy solo se conserva
si el webhook observa el descuento de creador. Es un prerrequisito de
distribución.

Aplicar migración revisada, configurar catálogo y variables por el procedimiento
seguro del operador: `POLAR_ENVIRONMENT`, `POLAR_ACCESS_TOKEN`,
`REPORT_PROMOTION_SECRET`, `REPORT_PROMOTION_ENABLED=true`, además de Supabase
integradas. Scopes Polar subscriptions read/write; no products write. Deploy de
esta función NO está en wrappers: añadirlo requiere paso autorizado. Verificar
gateway/auth y programar POST con `apikey` igual al secreto dedicado, sin
cuerpo. Páginas de 50: pasar `?after=<next_cursor>` hasta cursor null y
reiniciar desde el principio en la siguiente pasada. Ejecutar antes de la
próxima renovación y después de revisiones/webhooks; sugerencia 1 minuto, sin
scheduler creado aquí. Una aceptación posterior a la generación de la factura
afecta el cobro siguiente; no altera una factura ya emitida.

## Idempotencia, permisos y borrado

El webhook firmado solo observa tras persistir lifecycle/ownership. Versiones
repetidas o antiguas no abren otra campaña. Cada decisión de descuento produce
una operación durable, con actor `system:1593`, UUID interno, tramo y
timestamps; no guarda correo, nombre, cuerpo, logs ni código humano. La revisión
de origen sigue en #1594. Cambios pendientes superados se conservan como
superseded.

Lease de 60 s por operación; cada HTTP tiene timeout 10 s. GET antes de PATCH:
si Polar ya conserva el ID deseado, se confirma sin volver a escribir. Así una
respuesta perdida no reinicia `repeating`. Un descuento desconocido, producto,
precio, moneda o intervalo distintos bloquean la operación para revisión. PATCH
envía únicamente `discount_id` (o null); no toca producto/precio, trial,
prorrateo, cancelación ni metadata. Fallo de HTTP/ACK deja pendiente el
reintento. No se envía `Idempotency-Key` sin contrato publicado: la recuperación
es GET y operación durable, no una promesa de exactly-once de la red.

RPC exclusivamente service_role, tablas privadas con RLS y sin escritura
directa. Antes de preparar, tomar lease, PATCH y ACK se vuelve a comprobar la
barrera B03 por UUID; el borrado conserva historial financiero privado y oculta
la campaña. Un tombstone observado impide efectos; un borrado que llegue después
del último check y durante una petición HTTP ya enviada no puede cancelar esa
petición. Esa carrera entre proveedores requiere reconciliación/cancelación
comercial, igual que otros efectos remotos; no se afirma atomicidad entre
Postgres y Polar. Kill switch se comprueba por cuenta y justo antes de escribir.

Owner: `native_admin_account` añade `report_promotion` con aceptados, tramo,
spam, ventana y último descuento confirmado. Miniapp muestra esos datos; no
concede acceso nuevo. El descuento es el último confirmado/observado, no una
simulación de factura Polar; puede estar pendiente de reconciliación. Merge con
#1639 pendiente: reutilizar este campo/pequeño bloque de detalle en su nueva UI,
sin sustituir la implementación de gestión. No se fusionó su rama aquí.
Propuesta para usuario: endpoint autenticado de solo lectura con su progreso y
ventana, y una línea en Testing Center. Requiere contrato/DTO/UI y se deja
fuera.

## Pruebas locales

Desde la raíz, con `~/orq/docker.lock` adquirido y liberado mediante trap:

```sh
python3 supabase/tests/run-report-promotion-local.py --output ~/evidence/1593/sql --only report_promotion.test.sql
DENO_NO_PACKAGE_JSON=1 deno test --config supabase/functions/deno.json --no-lock --cached-only --allow-env --allow-read --allow-write supabase/functions
```

El runner SQL usa contenedor desechable `--network none`, sin puertos/DSN.
Necesita un dump de esquema Storage local sin datos, por defecto
`~/evidence/1608/r6/storage-schema.sql` (prerrequisito explícito del Mac de
pruebas). También ejecuta el catálogo completo y compara por suite con el mismo
runner sobre nightly. Controles
`--mutation launch/window/tier/spam/creator/deleted/idempotency/first-month/invoice`
deben fallar; no se altera producto ni tests en esos controles. Fixtures
históricos mueven fechas con SQL privilegiado, conservando triggers/cupos; no
abren admisión. No hay credenciales ni sandbox real usados. Ventas, webhooks
alojados, facturas reales y repetición calendaria Polar necesitan verificación
sandbox autorizada.
