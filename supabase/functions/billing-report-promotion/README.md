# Descuento por informes · #1593 / VANTA-39

PR #1659 integrado en nightly 9e48eb86f; endurecimiento en PR #1673.
**Decisión de Isaac: el programa de informes no se abre con el lanzamiento.**
Se anunciará más adelante; queda apagado por defecto y sin fechas de inscripción.
El primer periodo usa siempre la oferta
canónica de #1661 y su protección por cuenta, independiente de ese flag.
No crea productos, descuentos, enlaces, scheduler ni despliegue automáticamente.
Las migraciones nuevas 20261016090001/090002 actualizan #1659 integrado;
la migración histórica solo añade una nota sobre la RPC retirada.

## Reglas vigentes

- La inscripción Pro/Plus **mensual** tendrá una ventana propia, independiente
  de la oferta inicial de #1661. Sus fechas se fijarán cuando se anuncie el
  programa; no se heredan ni se generan desde el JSON de lanzamiento.
  La política SQL privada arranca con enrollment_enabled=false y
  enrollment_starts_at/enrollment_ends_at=NULL. Flag Edge ausente/false y
  configuración SQL apagada impiden altas automáticas con el lanzamiento.
  Activar solo el flag no abre la inscripción: SQL exige habilitación y ambas
  fechas finitas, apertura inclusiva y cierre exclusivo. No hay alta retroactiva
  automática. Las fechas de pruebas son ficticias, no un anuncio comercial.
- Informes enviados en `[alta, alta+1080 horas)`. Cuenta solo revisión humana
  aceptada de #1594, con estado accepted/fixed. Su frontera conserva evidencia,
  duplicados y cupos UTC 1/día, 2/semana. Aceptar tarde un informe enviado a
  tiempo es válido. No se añaden descuentos anuales.
- El primer periodo usa únicamente la oferta de checkout que corresponda según
  #1661; el programa de informes no lo rebaja. Cuando se active el programa,
  el premio empieza desde el segundo mes: 2 aceptados dan **3 cobros mensuales
  rebajados**; 5 dan **6** en sustitución del tramo
  menor. El mayor permite seis cobros **en total**: descuenta los ya consumidos
  con el tramo menor; nunca son 3+6 acumulados.
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
pasar Pro↔Plus o a una segunda alta, incluso fuera de la ventana. El premio sigue
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

## Registro SQL de la oferta inicial (P3-D)

Se retira la RPC de compatibilidad report_promotion_checkout: los cupones de
reparación por informes no pueden conceder el primer periodo. El único acceso
es billing_launch_checkout, con comprobación SQL de entorno, clave, producto,
cupón once, reloj finito y ventana registrados. La lógica única de reserva y
consumo por cuenta queda privada, sin permiso de ejecución para service_role.

private.billing_launch_offers arranca vacío y es exclusivo del operador:
sin registro válido, falla cerrado y no reserva ni consume el derecho.
Antes de desplegar el checkout actualizado:

1. Validar el mapa y los descuentos once de #1661 (importe fijo, duración once,
   producto y entorno correctos) con el procedimiento de su catálogo.
2. Generar localmente, sin red, un SQL revisable desde ese mismo mapa:
   `deno run --allow-read --allow-write supabase/functions/scripts/prepare-launch-offers-sql.ts --map approved-map.json --environment sandbox --output reviewed.sql`.
   Cambiar solo el entorno para preparar producción. Si el mapa incluye trial
   Pro, añadir --trial-anti-abuse-confirmed únicamente tras verificarlo.
3. Revisar el SQL y aplicarlo con el usuario operador de migraciones; no con
   las claves de API. Aplicarlo antes de cambiar Edge. Esta entrega no aplica
   registros ni modifica productos/descuentos reales.
4. Ejecutar el SELECT que imprime el generador (también abajo) con el operador.
   Comparar cada clave activa del mapa con producto, cupón once, fechas y versión
   aprobados. Las cuatro claves posibles son pro_monthly, pro_annual,
   pro_plus_monthly y pro_plus_annual. Registro vacío, clave activa ausente o
   cualquier diferencia: detener la activación y no desplegar Edge.
5. Repetir la misma proyección es idempotente. Una diferencia de cupón,
   producto, ventana, catálogo o claves registradas aborta toda la transacción;
   exige una migración de rotación revisada. No borra ni sustituye ofertas.
   El generador no consulta Polar ni certifica por sí solo la semántica remota.

Consulta de preparación del checkout (usar el entorno aprobado):

```sql
select environment, checkout_key, product_id, discount_id, starts_at, ends_at,
       catalog_version, registered_at
from private.billing_launch_offers
where environment = 'production'
order by checkout_key;
```

Este registro habilita únicamente la oferta inicial, no el programa por informes.

La proyección procede del único polar-launch-prices.json de #1661 y del
validador loadPolarProductMap. No se añade una segunda configuración pública
ni una vía de concesión heredada. Un cambio en el catálogo requiere actualizar
y revisar su proyección SQL, manteniendo el mismo procedimiento de despliegue.

## Primer mes consumido y checkout

El derecho al primer mes pertenece a la cuenta/entorno durante la ventana de
lanzamiento de #1661 (26-oct→26-nov, 19:00 Madrid). report_promotion_launch_uses conserva consumo, reserva y referencia
remota incluso tras la limpieza de billing_checkout_attempts. El checkout usa billing_launch_checkout con la oferta once allowlisted del
mapa canónico de #1661, para mensual y anual, sin depender del catálogo de premios.
El RPC exige
p_attempt y reserva siempre el beneficio antes de concederlo. El intento
comercial caduca a los 30 minutos; eso no consume ni pierde el derecho.

Una nueva solicitud espera el intento en vuelo. Al cumplirse los 30 minutos: si
no se recibió ID remoto (creating/uncertain), libera esa reserva y conserva el
derecho por cuenta para un intento nuevo, también al cambiar Pro→Plus. Lo hace
bajo lock de cuenta y solo si aún no hay consumo/suscripción/orden. Registra
promotion_checkout_recovered, visible al Owner aunque todavía no haya
suscripción; el pago posterior resuelve la incidencia sin borrar su auditoría.
Una respuesta tardía del intento anterior no recupera su reserva. Un checkout
remoto huérfano sin ID/enlace entregado puede quedar en Polar; reconciliar sus
hechos si llegasen, sin prometer atomicidad entre proveedores.

Con ID remoto conocido se mantiene GET autenticado y comprobación de
cuenta/producto: abierto para el mismo plan y huella de oferta/creador devuelve el mismo enlace;
expired/failed permite reemplazarlo con CAS. Confirmed/succeeded espera los
hechos comerciales y muestra mensaje específico. **Pro→Plus con checkout Pro
abierto:** no crea otro ni reutiliza un enlace del plan equivocado; devuelve 409
promotion_checkout_plan_change_pending, explica esperar su caducidad y conserva
el primer mes. La incidencia es visible al Owner; tras expirar/fallar el
checkout previo, un intento nuevo elige Plus. Fallos de comprobación o espera
sin ID antes del plazo tienen mensaje y código propios, no 503 genérico
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

El contrato vigente es #1661, integrado en nightly `1f07e8e28`. El creador atribuye la
venta inicial, **sin rebajar esa factura**; el 20 % empieza en la primera
renovación. La fuente de porcentaje y duración es el mismo archivo
`../scripts/polar-launch-prices.json` que importa `_shared/creator-renewal.ts`:
11 meses mensuales / 12 anuales; informes sigue siendo solo mensual. El
almacenamiento histórico `report_promotion_creators` queda inerte: no se
consulta para elegir ni asociar un cupón. No configurar nuevos creadores ahí.

**Un único arbitraje:** `report_promotion_renewal_prepare` publica o retira la
candidatura con la RPC de #1661 `billing_set_report_renewal_candidate`, y pide
selección a su implementación original de `billing_creator_renewal_prepare`. Su
comparación en céntimos es la única: mayor ahorro, empate informes. Pro: 200 c
frente a 120 c; Plus: 300 c frente a 200 c. El perdedor queda en
`creator_renewal_operations.not_applied`, visible al Owner. Sin atribución
privada, solo informes; sin premio, solo creador. La metadata no atribuye nada.

Las cuentas de la promoción tienen **un solo escritor externo**, el worker de
informes. El webhook de #1661 guarda atribución/primer pago si faltan y delega
sin error ni cuarentena; no vuelve a asociar una candidatura guardada que pueda
estar agotada. Fuera de esta promoción conserva el flujo normal de #1661. Cuando
hay creador se usa su lease de 60 s, autorización y ACK, además de las barreras
del premio. Un callback de informes no puede saltárselo usando el claim antiguo;
sus alias están revocados. El escritor de creador también espera una operación
de informes ya en vuelo. Se publica la candidatura incluso antes de conocer un
creador, para que una atribución que llegue por reconciliación respete el
premio. Un error libera solo su token, nunca el de otro worker. El helper
compartido de #1661 se incorpora con sus comprobaciones GET/PATCH/ACK y reconoce
cupones anteriores de informes y remanentes. Solo PATCH de `discount_id`, sin
descuentos acumulados.

**No reiniciar el creador al volver:** `report_creator_terms` fija una vez el
plazo original desde la primera renovación rebajada (por creador o informes),
con los meses de configuración guardados al entrar en convivencia. Las facturas
iniciales no inician ese reloj. Usa periodos de facturas liquidadas, nunca el
espejo de suscripción. El plazo corre aunque gane informes. Si vuelve el
creador, solo se asocia un cupón validado que cabe en los meses restantes. GET
ya coincidente no reinicia nada. Si falta ese cupón, devuelve
`creator_renewal_remainder_unconfigured`, incidencia Owner durable; conserva los
derechos y permite reintentar después de configurar. Al expirar el creador se
descarta su ahorro antes de comparar: puede pasar a ganar informes. Un bloque de
informes ya confirmado termina naturalmente aunque haya caducado su saldo;
después puede volver el creador vigente.

**Unión R7:** esta rama fusiona nightly `460c39e45` (#1661 y retirada definitiva #1672), incluidos Founders,
guards de checkout, atribución y hooks de renovación/retirada de creador.
La migración instala el puente sobre el contrato actual de revocación;
si cambia el orden de instalación, ejecutar como operador
`select public.install_report_creator_bridge()` y comprobar `true`. Es
idempotente y conserva el payload Owner más reciente. Hay un único JSON:
el catálogo completo de #1661, sin una copia parcial de informes. El checkout usa
su cupón once para el primer periodo; el repeating1 de informes solo consume
saldo desde el segundo mes. Conserva claim/atribución atómicos y huella de oferta.
Si
hay atribución pero faltan su operación inicial, puente, producto o remanente,
la escritura se detiene con incidencia específica, sin un PATCH independiente.
#1661 bloquea iniciar cambios de plan con creador activo. Si aun así llega un
hecho comercial válido, el premio de informes sigue la suscripción vigente y
conserva el historial de traslado. El cupón mensual de creador de #1661 cubre
ambos productos normales; se actualiza el producto servidor observado, sin
reiniciar su reloj. Al limpiar una suscripción previa, retira la candidatura de
informes y conserva/restaura solo su creador vigente bajo el lease común. Una
anterior canceled/paused se considera limpia sin PATCH. Devolver el primer mes
permite exclusivamente retirar el descuento propio: nunca asociar otro.

Los gates ejecutan los tests de ambas funciones en el árbol Git unido real.
prepare-report-creator-fixture.py ahora archiva ese árbol y exige el ancestro
nightly integrado: no superpone copias de ficheros ni usa271e20053.

**Revocación durante PATCH→ACK:** una respuesta confirmada conserva su recibo.
Solo un token común propio y vivo admite el conflicto blando; se guarda
revocation_pending_at y libera el lease sin marcar completado el creador ni
crear una incidencia falsa. La retirada queda pendiente y se reintenta por
#1661. Tokens ajenos/caducados y cuentas borradas siguen rechazados.
La revocación también retira remanentes de creador verificados para el mismo
producto/cupón/entorno; conserva cupones de informes o manuales. Un refund de
renovación retira creador y permite el saldo de informes; el refund inicial
mantiene su política de pérdida, con limpieza negativa bajo el lease común.

**Prerrequisito obligatorio ANTES de activar la convivencia:** crear y validar
todos los remanentes mensuales20% de1..10meses para cada producto/cupón de creador.
Deben estar listos antes de la primera renovación posterior a los meses de
informes. Si falta alguno, no activar; el fallo queda visible y no autoriza
asociar de nuevo once meses. Crearlos en Polar real requiere a Isaac.

Pendiente de autorización de Isaac en Polar real:

| Producto normal mensual | Descuento fijo EUR | Duración repeating              |
| ----------------------- | -----------------: | ------------------------------- |
| Pro 5,99 EUR            |               2,00 | 1, 3 y 6 meses, tres descuentos |
| Plus 9,99 EUR           |               3,00 | 1, 3 y 6 meses, tres descuentos |

Seis descuentos, EUR, restringidos al ID mensual normal de su plan, sin código
público ni descuento compuesto. No hace falta crear productos. Para creadores:
usar el catálogo aprobado de #1661 (20 %, mensual repeating 11 meses / anual
repeating 12 meses, sin código público), nunca ampliar un cupón histórico de dos
meses. Para volver de informes sin reiniciar el plazo, el operador valida
remanentes mensuales del mismo porcentaje y producto: duraciones 1..10 meses
según los saldos posibles, por cupón de creador/producto. Registrar IDs en
`private.report_creator_remainders` con fecha de validación. No crear ni
modificar esos cupones automáticamente; su ausencia es incidencia, no permiso
para reasociar once meses. No hacen falta nuevos productos.

## Inscripción pendiente del anuncio (P3-E)

REPORT_PROMOTION_ENABLED no se configura a true en esta entrega: ausente y
false apagan la observación Edge y el worker. Además, la inscripción se valida
en SQL mediante private.report_promotion_policy (solo operador): enrollment_enabled
false y enrollment_starts_at/enrollment_ends_at sin fechas. No se puede habilitar
sin fijar ambas fechas finitas y ordenadas. No hay RPC pública para configurarlas.
Una fila ausente o apagada falla cerrado incluso si se llama directamente a la
observación con service_role. El calendario de checkout #1661 no las configura.

Cuando Isaac anuncie el programa se fijarán su ventana y activación con el
operador, se validarán catálogo/cron/condiciones y solo entonces se habilitará
el flag. No se programa ni se anuncia aquí una fecha. Las ventanas habilitadas
en tests sirven únicamente para probar las reglas.

Cerrar la inscripción no borra derechos que ya se hayan concedido ni sus hechos
contables: la política SQL controla primeras inscripciones. La observación de
derechos existentes y el ledger siguen sus reglas de idempotencia; el flag
operativo conserva su kill switch sobre PATCH. No se purgan datos ni se retiran
premios existentes como efecto de esta decisión.

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
El flag habilita al único escritor de descuentos de las cuentas de la campaña,
incluido el creador cuando convive con informes. Debe mantenerse su cron activo.
Apagarlo detiene nuevas asociaciones de ambos para esas cuentas; los cupones ya
confirmados siguen su calendario. False o variable ausente detienen esos
efectos, pero **nunca apagan el ledger de facturas**: contabilidad tiene default
explícito true y el catálogo SQL filtra productos. billing-reconcile repara por
order ID incluso un efecto histórico ya completado o un inbox en cuarentena.
Conserva origen y fecha de recuperación. Una factura pagada conocida con datos
incompletos deja un hueco durable y la incidencia
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
último confirmado/observado, no una simulación de factura. La miniapp de #1639
incluye el bloque en la ficha Persona, junto al plan y sus pagos; conserva los
permisos y controles de cuenta de esa miniapp. La lista paginada puede omitirlo
hasta abrir el detalle. Progreso en app del usuario sigue como propuesta para
otro contrato/DTO.

## Verificación local

R7 usa el árbol Git unido con nightly460c39e45, incluidos #1661 y #1672.
SQL completo:79 suites,52 PASS/27 FAIL idénticas a nightly77/50/27;265
aserciones adicionales de informes/convivencia, cero regresiones.
Dirigido en ambos órdenes:177+88+89+43+36 PASS. Edge707PASS/0FAIL/2ignored
frente a nightly662/0/2. Diez controles SQL y siete Edge detectados, incluidos
guards de checkout, hook de creador, retirada, recuperación, once y JWT.
Rust Windows serial:fmt/check/Clippy PASS, Nextestci1826PASS/14skips con
telemetría y lifecycle18PASS.24 entradas nativas iguales Mac/Windows.
Evidencia ~/evidence/1593-r7; no acredita servicios reales ni activación.


Adquirir `~/orq/docker.lock` y liberar con trap. Desde raíz:

```sh
python3 supabase/tests/run-report-promotion-local.py --output ~/evidence/1593-r4/sql --only report_promotion.test.sql
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
initial-incident, reward-expiry, accounts-deleted, attempt-required, tier-total
checkout-no-id, checkout-owner-incident y reconciliation-item-incident. Deben
fallar; no se relajan tests ni cambian funciones de producto para dejarlos
verdes. Deno cubre fallo de lote, checkout activado y clear/attach. Sin
servicios reales ni sandbox autenticado. Facturas/renovaciones Polar reales,
nueva revisión independiente y QA visual siguen pendientes.

## Reconciliación por elemento · ronda 4

Cada elemento tiene su captura de error: una factura problemática no impide
procesar las siguientes órdenes, suscripciones, devoluciones o disputas de la
página. Un fallo deja código saneado en la respuesta y, para órdenes conocidas,
intenta registrar el hueco contable visible al Owner. Si ese registro también
falla, se informa incident_recorded=false. La página se termina, pero conserva
su cursor para repetirla en la siguiente invocación; los elementos ya aplicados
se deduplican. El handler sale del bucle y marca la pasada fallida, sin repetir
ocho veces la misma página en una petición.

## Acabado de recuperación y diagnóstico · ronda 5

La app nativa traduce únicamente los códigos allowlisted 503
promotion_checkout_recovery_pending / payment_pending y recovery_required, y 409
promotion_checkout_plan_change_pending, a mensajes propios y seguros:
esperar/comprobar el pago, conservar el primer mes o esperar al cambio de plan.
No muestra prosa remota ni borra el intento durable al recibir estos códigos. El
error HTTP genérico sigue vigente para códigos desconocidos y otros servicios.
La comprobación Windows usa fixtures DPAPI y HTTP loopback; no acredita pagos
reales ni QA visual del Hub.

La espera sin ID usa retry_at del RPC y el reloj inyectado: minutos restantes
redondeados hacia arriba, reintento inmediato si venció y texto sin plazo si
falta o es inválido. No promete siempre treinta minutos: el intento puede tener
un vencimiento posterior. El primer mes sigue perteneciendo a la cuenta.

Un GET con dueño o producto distinto registra promotion_checkout_owner_mismatch
en el mismo almacén privado de incidencias por cuenta/entorno antes de
rechazarlo. El Owner lo recibe incluso sin suscripción. No devuelve su enlace ni
libera su reserva por ese desajuste.

Los fallos de subscriptions/refunds/disputes guardan historia operativa en
private.billing_reconciliation_item_failures, con entorno, recurso, digest de
identidad del elemento, ID remoto acotado si existe, código fijo, contador y
primera/última fecha. Sin ID se guarda solo el digest del snapshot; nunca el
cuerpo ni el mensaje del proveedor. La RPC es exclusiva de service_role, con
owner postgres y search_path vacío; no se conceden accesos directos a la tabla.
Es historia de fallos (no afirma que sigan abiertos); el operador puede
consultarla en el entorno autorizado, ordenando por last_at para diagnosticar.
La política de retención futura debe conservar la traza necesaria; no se añade
una poda automática en este candidato.

Si falla también el registro, incident_recorded=false y el cursor queda
retenido: se reintentan elemento y registro sin abortar la página. Los huecos de
órdenes siguen su registro contable existente visible al Owner.

## Integración con nightly eb553c7fe · 16/10/2026

El merge de #1639 conserva pagos/devoluciones y la promoción: un mismo
order.paid actualiza la factura del ledger y el recibo del Owner, con sus
propios efectos durables. La minimización del evento mantiene descuento,
periodo, totales e impuestos necesarios para ambas proyecciones. La restricción
comercial sigue siendo autoridad antes del espejo de gestión. Los dobles
rechazan RPC desconocidas y admiten explícitamente las de ambas funciones.

La respuesta de detalle Owner conserva plan, pagos y accesos, y añade
report_promotion opcional; se prueban juntos en SQL y Rust. La demo aprobada
mantiene sus personas/acciones y muestra un ejemplo falso para Ana. No añade
operaciones de descuentos a la miniapp ni activa la campaña.

## Pruebas conjuntas con #1661 · ronda 6

```sh
python3 supabase/tests/prepare-report-creator-fixture.py --output ~/evidence/1593-r6/joint-new
# Con el lock Docker:
python3 supabase/tests/run-report-promotion-local.py --root ~/evidence/1593-r6/joint-new --output ~/evidence/1593-r6/joint-new-sql --only report_promotion.test.sql report_creator_renewals.test.sql creator_renewal.test.sql
```

El fixture usa el commit aprobado 271e20053, no un checkout ajeno que pueda
moverse. Añade solo los componentes de integración documentados; conserva los
tests y el modelo once/Founders de #1661. El catálogo combinado debe compararse
también con ese mismo commit sin modificar, además de la comparación aislada con
nightly. La suite conjunta comprueba solo informes Pro/Plus, solo creador,
ambos, mayor ahorro, cambio temporal en ambos sentidos, plazo original,
remanente ausente visible al Owner, lease, ACK, repetición y caducidad.
