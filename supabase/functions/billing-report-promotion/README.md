# Descuento por informes · #1593 / VANTA-39 · ronda 3

Candidato local de PR #1659. Catálogo vacío y flag ausente/false: no se activa.
No crea productos, descuentos, enlaces, scheduler ni despliegue automáticamente.
La migración sigue inédita; sus correcciones son para el candidato, no un
upgrade sobre una migración ya aplicada. Si se hubiera aplicado, revisar un
upgrade aparte.

## Reglas vigentes

- Altas Pro/Plus **mensuales** desde 26/10/2026 19:00 Europe/Madrid inclusive
  hasta 02/11/2026 19:00 exclusivo. Cierre confirmado por el orquestador. Los
  tests incluyen 18:59/19:00/19:01 y las dos 02:30 del cambio de hora 25/10.
- Informes enviados en `[alta, alta+1080 horas)`. Cuenta solo revisión humana
  aceptada de #1594, con estado accepted/fixed. Su frontera conserva evidencia,
  duplicados y cupos UTC 1/día, 2/semana. Aceptar tarde un informe enviado a
  tiempo es válido. No se añaden descuentos anuales.
- Primer mes a lanzamiento. Desde el segundo, normal salvo tramo: 2 aceptados
  dan **3 cobros mensuales rebajados**; 5 dan **6** en sustitución del tramo
  menor. El mayor permite seis cobros **en total**: descuenta los ya consumidos con
  el tramo menor; nunca son 3+6 acumulados.
- Se consumen periodos únicos de órdenes `subscription_cycle` /
  `subscription_cycle_after_trial` **pagadas**, con el descuento del tramo,
  importe de descuento positivo y una línea completa sin prorrateo.
  `subscription_create` identifica la factura inicial y no consume premio. IDs
  repetidos no suman; una devolución posterior no repone meses ya consumidos.
- Reconciliación de órdenes alimenta el mismo ledger por order ID aunque el
  inbox ya esté completado o en cuarentena. Guarda origen y fecha de
  reconciliación sin payload ni PII. Si una orden pagada conocida carece de
  periodo/importe completos, deja un hueco durable y una incidencia Owner; no
  rearma cupones hasta recuperarla. El ledger cierra el hueco al reconciliar.
- El contador no usa `current_period_end` del espejo. Inicio y último fin son
  los periodos de las facturas liquidadas. Un PATCH tardío no pierde un mes: la
  factura previa sin rebaja no cuenta y se sirven los tres/seis cobros futuros.
- **Dos spams** posteriores al alta bloquean nuevos tramos desde ese momento,
  incluso tras 45 días. **Se conservan los meses ya concedidos** hasta
  terminarlos. **Devolver la factura inicial**, parcialmente incluida, pierde el
  premio de informes de forma durable. Estas políticas son decisión del
  orquestador en R2.

Los bloques de descuento se limitan al saldo real pendiente: 6 si quedan al
menos 6, 3 si quedan al menos 3 y 1 en los saldos menores. El cupón fijo de un
mes sirve también para esos saldos, siempre fuera de la factura inicial. Solo se
rearma tras una factura liquidada que confirma su uso. Así un traslado o una
reparación no concede más meses de los pendientes aunque el worker se pare
después del PATCH. El corte del segundo spam se guarda con la fecha de la
revisión humana. Un cron atrasado conserva un tramo ganado antes de ese corte y
no concede otro con aceptaciones posteriores. Devolver el primer mes sigue
perdiendo el premio.

## Cambio de plan o suscripción

Una campaña por cliente/entorno. Conserva alta, ventana y tramo originales al
pasar Pro↔Plus o a una segunda alta, incluso fuera de la semana. El premio sigue
la suscripción activa más reciente. Versiones de distintas suscripciones se
comparan por alta, no por el modified_at global de otra; una entrega atrasada no
roba el premio. Si la vigente está inactiva, puede volver a una anterior activa.

Cada cambio deja registro privado con suscripción/producto anterior y nuevo y
fecha de la observación. Antes de aplicar el premio en otra suscripción, se
limpia el anterior mediante operación propia, esperando sus leases en vuelo. No
se borra un descuento ajeno. Si la anterior está canceled/paused, se considera
ya limpia: no admite PATCH ni puede facturar. Queda motivo durable
mirror_inactive o remote_inactive (GET vivo), con fecha y traslado; el premio
sigue a la vigente. El caso comercial no lanza conflicto ni cuarentena del
webhook. Errores HTTP/de catálogo se marcan para revisión y no bloquean a los
demás clientes.

## Primer mes consumido y checkout

El derecho al primer mes pertenece a la cuenta/entorno durante la semana de
lanzamiento. report_promotion_launch_uses conserva consumo, reserva y referencia
remota incluso tras la limpieza de billing_checkout_attempts. El intento
comercial caduca a los 30 minutos; eso no consume ni pierde el derecho.

Una nueva solicitud espera el intento en vuelo. Al cumplirse los 30 minutos:
si no se recibió ID remoto (creating/uncertain), libera esa reserva y conserva
el derecho por cuenta para un intento nuevo, también al cambiar Pro→Plus.
Lo hace bajo lock de cuenta y solo si aún no hay consumo/suscripción/orden.
Registra promotion_checkout_recovered, visible al Owner aunque todavía no haya
suscripción; el pago posterior resuelve la incidencia sin borrar su auditoría.
Una respuesta tardía del intento anterior no recupera su reserva. Un checkout
remoto huérfano sin ID/enlace entregado puede quedar en Polar; reconciliar sus
hechos si llegasen, sin prometer atomicidad entre proveedores.

Con ID remoto conocido se mantiene GET autenticado y comprobación de
cuenta/producto: abierto para el mismo plan devuelve el mismo enlace;
expired/failed permite reemplazarlo con CAS. Confirmed/succeeded espera los
hechos comerciales y muestra mensaje específico. **Pro→Plus con checkout Pro
abierto:** no crea otro ni reutiliza un enlace del plan equivocado; devuelve
409 promotion_checkout_plan_change_pending, explica esperar su caducidad y
conserva el primer mes. La incidencia es visible al Owner; tras expirar/fallar
el checkout previo, un intento nuevo elige Plus. Fallos de comprobación o
espera sin ID antes del plazo tienen mensaje y código propios, no 503 genérico
permanente. La ausencia del espejo por sí sola no libera un ID conocido.

La factura pagada consume la marca durable desde SQL incluso sin flag. El
historial de suscripciones/órdenes también impide otra oferta, aunque el
catálogo se configure tarde. El borrado/traslado/refund no elimina la marca. La
consulta precede a reservar el intento comercial y a llamar a Polar; un fallo
RPC devuelve 503 sin marcarlo incierto. No se promete backfill ni refund de
compras normales anteriores a activar la campaña.

## Creador y catálogo

`report_promotion_catalog` admite productos normales mensuales con 599→399
céntimos Pro y 999→699 Plus. No migra ni modifica los productos de lanzamiento
permanente ni los links de #1620: no se les pueden sumar otros 2/3 EUR. Resolver
esa distribución antes de activar esta campaña sobre normales.

La allowlist de creador guarda ID, producto, `basis_points` (1..10000), duración
**exacta de dos meses** y `validated_at`. El operador debe cotejar en Polar tipo
porcentaje, importe, duración, moneda y scope; no introducir IDs de otra
campaña. La selección compara su ahorro real en céntimos con el fijo; empate
favorece informes. Un 40 % autorizado puede ganar al tramo. El GET vivo
actualiza el próximo ciclo para evaluar su vencimiento; nunca consume con ese
reloj los meses de informes. Al acabar la campaña solo se retiran IDs propios de
lanzamiento/informes: se conserva un beneficio ajeno o de creador sin
reaplicarlo ni prolongarlo.

Pendiente de autorización de Isaac en Polar real:

| Producto normal mensual | Descuento fijo EUR | Duración repeating              |
| ----------------------- | -----------------: | ------------------------------- |
| Pro 5,99 EUR            |               2,00 | 1, 3 y 6 meses, tres descuentos |
| Plus 9,99 EUR           |               3,00 | 1, 3 y 6 meses, tres descuentos |

Seis descuentos, EUR, restringidos al ID mensual normal de su plan, sin código
público ni descuento compuesto. No hace falta crear productos. Para creadores en
normales: descuento independiente, inicialmente 2000 basis_points y dos meses,
con atribución y distribución aprobadas; no ampliar silenciosamente los de
#1620. No se añade un campo de código en la app en esta entrega.

## Operaciones, reintentos y fallos

Operación durable por cuenta, lease de 60 s, timeout HTTP de 10 s. GET antes de
PATCH; si el ID ya coincide, no se escribe. El ACK no reinicia repeating tras
una respuesta perdida. Solo `discount_id` en PATCH: no precio, producto, trial,
prorrateo, cancelación, metadata ni un Idempotency-Key sin contrato publicado.

Un cobro liquidado sin descuento después del último ACK prueba una renovación
perdida/expirada. Una factura que consume el cupón de un mes también permite su
rearme si queda saldo. Se repara una vez para ese ID de factura con
**clear/attach**: primero se confirma y persiste fase `cleared`, después se
asocia el descuento. La fase durable permite recuperar tanto la respuesta
perdida de clear como de attach sin reiniciar dos veces. El premio termina solo
tras consumir su contador. No se cambia ni devuelve una factura ya emitida: la
corrección sirve cobros futuros.

Cada cliente tiene captura de error propia. Se registra código de conjunto
cerrado, intentos, fechas y resolución; no PII adicional ni cuerpo HTTP. El
payload Owner incluye la incidencia y la miniapp muestra «descuento pendiente de
revisión». El lote devuelve `failed` y continúa. Presupuesto de 45 s con cursor
del último cliente procesado: un cliente lento no salta al siguiente ni atasca
todas las páginas. Kill switch comprueba por cliente y justo antes de cada
PATCH; detiene los efectos.

## Seguridad y operación posterior

Tablas privadas con RLS, sin escrituras directas service_role; RPC solo
servidor. Todos los security definer fijan owner `postgres`. Actor de auditoría
`system:1593`; solo UUID internos, IDs comerciales, tramos y fechas. Sin
correo/nombre/informe/log. B03 se comprueba antes de preparar, lease, cada PATCH
y ACK. Cuenta borrada oculta la promoción; historial financiero privado
permanece. Una petición ya enviada entre proveedores no es atómica con un
borrado posterior: reconciliar/cancelar.

Configurar tras autorización `POLAR_ENVIRONMENT`, `POLAR_ACCESS_TOKEN`,
`REPORT_PROMOTION_SECRET`, `REPORT_PROMOTION_ENABLED` y las variables Supabase
integradas. Token con subscriptions read/write y checkouts read para
recuperación; sin products write. El bloque
`[functions.billing-report-promotion] verify_jwt=false` es obligatorio y su gate
lo comprueba: el handler valida el secreto dedicado. Sigue fuera de wrappers de
deploy.

Programar POST con `apikey` igual al secreto dedicado; sin cuerpo. Pasar
`?after=<next_cursor>` hasta null y volver al inicio en la siguiente pasada.
Sugerencia: cada minuto y después de revisiones. No hay scheduler creado aquí.
El flag solo habilita concesiones y escrituras de descuento. False o variable
ausente detienen esos efectos, pero **nunca apagan el ledger de facturas**:
contabilidad tiene default explícito true y el catálogo SQL filtra productos.
billing-reconcile repara por order ID incluso un efecto histórico ya completado
o un inbox en cuarentena. Conserva origen y fecha de recuperación. Una factura
pagada conocida con datos incompletos deja un hueco durable y la incidencia
promotion_invoice_details_missing; impide rearmar hasta recuperar los datos. La
ausencia de factura inicial muestra promotion_initial_invoice_missing. Ambas se
resuelven al llegar los hechos, sin duplicar créditos. Reconciliar órdenes antes
de activar/retomar tras una interrupción; no dar por completo un historial solo
por el espejo de suscripción.

## Caducidad y riesgo aceptado por Isaac · ronda 3

El saldo ganado caduca a los **seis meses de calendario Europe/Madrid** desde la
revisión humana que alcanza el tramo. Único valor configurable:
private.report_promotion_policy.reward_valid_months (fila singleton, inicial 6,
rango 1..120, solo operador de base). La duración se guarda como
reward_expires_at al conceder un nuevo tramo; cambiar la configuración afecta
solo a nuevas concesiones. El tramo mayor sustituye al menor y obtiene su plazo
desde la quinta aceptación. El consumo conserva la fecha de la primera
concesión: subir a seis no repone los meses ya consumidos del tramo de tres.

El límite es exclusivo. Al vencer no se puede asociar ni rearmar otro cupón, y
las operaciones pendientes se invalidan. **Un bloque finito ya confirmado se
respeta hasta su término natural**; la caducidad no lo retira ni lo reinicia.
Devolución inicial y limpieza por cambio de suscripción conservan sus reglas. El
payload Owner expone reward_expires_at y reward_expired; los clientes que
todavía no pinten estos campos pueden ignorarlos.

**Multi-cuenta: riesgo aceptado expresamente por Isaac.** La unidad es
cuenta/entorno; no se añade huella de tarjeta, normalización de correo ni cruce
entre cuentas. Una persona con varias cuentas puede repetir la promoción. No se
afirma protección contra ese abuso ni se recoge PII adicional.

Owner recibe aceptados, tramo, descuento confirmado, incidencia y pérdida por
refund/spam; estados de política visibles en la miniapp. El descuento es el
último confirmado/observado, no una simulación de factura. Integrar el pequeño
bloque al fusionar #1639. Progreso en app del usuario sigue como propuesta para
otro contrato/DTO.

## Verificación local

Adquirir `~/orq/docker.lock` y liberar con trap. Desde raíz:

```sh
python3 supabase/tests/run-report-promotion-local.py --output ~/evidence/1593-r3/sql --only report_promotion.test.sql
DENO_NO_PACKAGE_JSON=1 deno test --config supabase/functions/deno.json --no-lock --cached-only --allow-env --allow-read --allow-write supabase/functions
```

Docker desechable sin red ni puertos, sin DSN. El runner y los tests ejecutan
producto como NOSUPERUSER BYPASSRLS; supervisor solo instala extensiones y la
migración histórica de infraestructura. Storage schema local requerido mediante
`--storage-schema`, por defecto `~/evidence/1608/r6/storage-schema.sql`. El
catálogo se compara con el mismo actor/runner sobre nightly: registrar todos los
fallos heredados, no compararlo con los números anteriores bajo superusuario.

Controles `--mutation`: launch, launch-end, window, tier, spam, creator,
deleted, idempotency, first-month, invoice, transfer, settlements, repair,
first-refund, launch-used, checkout-proof, cleanup-inactive, invoice-gap,
initial-incident y reward-expiry. Deben fallar; no se relajan tests ni cambian
funciones de producto para dejarlos verdes. Deno cubre fallo de lote, checkout
activado y clear/attach. Sin servicios reales ni sandbox autenticado.
Facturas/renovaciones Polar reales, Windows, nueva revisión independiente y QA
visual siguen pendientes.
