# ipc — fotos versionadas

## Recuperación de documentos — #1869, paso 5

`files::Doc<T>::open_or_quarantine` comparte la lectura acotada y la protección
ante documentos dañados de Hub-layout, Launcher, General y Apariencia.
Si el contenido no se puede decodificar/validar, toma el mismo lock del escritor,
comprueba los bytes y crea una copia durable exclusiva `<documento>.invalid`.
Si existe otra copia diferente usa `.1.invalid`, `.2.invalid`, etc.; una copia
regular idéntica se reutiliza. Nunca sigue un enlace al comprobar esas copias.
El original permanece intacto al arrancar. El documento en memoria usa valores
por defecto y un aviso con el nombre de la copia; al guardar comprueba los bytes
dañados originales con CAS. Si otro editor cambia el archivo, su edición gana.

Una versión desconocida es `Unsupported`, no corrupción: no se archiva ni se
reescribe. Un fallo de lectura, tamaño excesivo o copia fallida también permite
mostrar valores por defecto con aviso, sin habilitar la sobrescritura del archivo
presente. Los permisos y el contenido se pueden reparar fuera de la aplicación
y recargar. No se leen documentos que excedan su límite para intentar repararlos.
Esto no cambia el sondeo de los overlays: conservan el último layout válido.
No se modifica ningún protocolo ni se mueve ninguna raíz de datos.


## Documentos locales — #1869, paso 4

`files` comparte lectura acotada y guardado entre Launcher, layout, Engineer y
Workshop. Rechaza componentes `.env*`, toma el lock del SO, intenta retirar únicamente
temporales numéricos del mismo documento, escribe y sincroniza un temporal
exclusivo, lo cierra y renombra sin borrar primero el destino. `Observed`
compara los bytes antes y después (`None` solo permite crear); `Replace` conserva la espera entre guardados
de Workshop. Solo el layout pide `.bak`. Los nombres legacy de hermanos JSON
se conservan para extensiones personalizadas. Un editor externo debe respetar
el lock: la segunda comparación reduce la carrera, pero no puede excluirlo.
`Error` distingue conflicto, ocupado, tamaño, entorno e I/O. La fachada
`launcher::files` conserva los helpers String read/save y el límite por llamada: el documento
de Strategy del Hub admite sus archivos de migración de hasta 12 MiB.
El repositorio de Strategy conserva su escritor propio.

La limpieza de huérfanos es best effort: un error de borrado, enumeración o
inspección se registra y no impide intentar el guardado con otro temporal.
Los errores de lectura incluyen la ruta y el límite; Engineer conserva el aviso
«Engineer supera 64 KiB». `Kind` clasifica conflictos sin interpretar mensajes;
`Failure` conserva kind y texto al clonar un error para UI. Testing Center,
Ajustes, Launcher, Calendario, Strategy y Engineer mantienen ese tipo hasta el
diagnóstico/presentación. El diagnóstico sanitizado recibe solo el kind.
La fachada String sigue para consumidores que solo muestran el error;
`save_with_limit` devuelve el error tipado para quienes necesitan clasificarlo.
`Busy` significa guardado en curso y nunca se clasifica como `Conflict`; no ofrece
recargar ni descartar un borrador pendiente. `Failure` solo expone kind y Display,
sin Deref a texto. Los fallos de crear, bloquear y reemplazar incluyen el destino;
TooLarge incluye ruta y límite.

Cambios intencionados del paso 4: `layout.show.json.bak` ya no se escribe
(la solicitud es estado derivado); hide sigue retirando copias antiguas.
Freshness recupera la carpeta temporal del sistema (`%TEMP%` en Windows)
para `Vantare/native/logs` solo si falta la base. Una raíz relativa o la falta
de override QA en tests siguen siendo errores y no usan ese fallback.

## Rutas locales — #1869

`paths::Root` posee el cálculo de base, native, Hub por defecto, layout,
Engineer, Launcher, Services, rights y logs. Sus métodos solo producen rutas;
los dueños de documentos conservan lectura, guardado y flags explícitos.
Errores tipados distinguen base ausente, ruta relativa, plataforma y guard QA;
la conversión a `io::Error` conserva su clase. La política de plataforma y la
defensa de tests están en [native](../README.md#rutas-locales--1869-paso-3).
No cambia ningún DTO ni la raíz física del Hub del paso 10.

## Registro de frescura — #1868, paso 5

`freshness.log` conserva una línea por transición de estado/capacidades.
El motivo usa el vocabulario neutral de domain y `detail` contiene el diagnóstico
opcional del adaptador. La UI no inventa detalles que no recibe por el pipe.
La raíz del registro y la política de fallos de escritura se conservan.

## Contrato vigente de acceso

Tres versiones independientes: servicios v19, control v7 y fotos v11. Se comprueba
la versión antes del esquema estricto, también la Policy anidada. Desajuste es
VersionMismatch/transitorio, sin revocar; un peer antiguo que cierra sin responder
puede dar desconexión genérica. El launcher usa services de su misma generación;
mezcla nuevo-services/viejo-núcleo no soportada. Instalador valida conjunto/hashes.
No se negocian permisos ni se distribuyen EXE sueltos. [ADR 0102](../../docs/adr/0102-modelo-acceso-nativo.md).

Control v7 publica Policy.state: Active/Grace permiten catálogo y módulos; los
demás estados deniegan. Gratis puede seguir Active al vencer Pro. signed_until_ms
y grace_until_ms separan firma/margen efectivo; TTL 2s. Policy.error es diagnóstico;
Policy::denied es el constructor conservador. ClockBehind.until_ms está en pared
(lápida efectiva menos forward_millis) y el aviso manual muestra fecha local.

Solo runtime::rights verifica firma y claims. InstallOnline transporta credencial
HTTP fresca; Install se conserva por compatibilidad de control, nunca como replay
de services desde disco. Imagen, nonce, secuencia y permisos de mutación se
mantienen. Rechazos firma/subject/device: rights-credential-invalid, clasificado
InvalidCredential y Version/Transient en services. REJECTED conserva lápida,
denegación y caducidad; iat conserva UNAVAILABLE/Clock. El lector v7 congelado
trata la etiqueta nueva como UnknownLegacy/Transient; su SHA-256 se verifica.

Services v19 no tiene TransferRights. Un peer anterior se rechaza antes del comando
retirado/esquema; declarar v19 con ese comando es Protocol, sin revocar. Solo los
actos explícitos Logout, cambio de identidad y DeviceReset invalidan derechos.
Account.session es enum cerrado SignedOut/SignedIn/NeedsSignIn/Pending; no concede
permisos. AccountCancel abandona OAuth/FAPI y conserva cuenta/derechos. Reply no
transporta tokens; AccountEmail/LoginLink redactan Debug.

LicenseStatus es local al supervisor: Policy, última Session observada y aviso,
sin arrancar helper. null no implica SignedOut. Aviso definitivo/DeviceLimit vive
en memoria hasta Verified, cierre o login confirmados. Transient/lectura/pérdida
de respuesta no lo consumen. Policy conserva diagnóstico tras reiniciar supervisor.
Solo Feed fresco confirma derechos/compra; scheduler único en
[runtime](../runtime/README.md#contrato-vigente-de-licencias-y-supervisor), presentación
[Hub](../hub/README.md#contrato-vigente-de-acceso-y-cuenta).

No cambian formatos activos de cuenta/binding/authority/guardias. Los restos
candidate/pending se apartan sin leer al arrancar, conservando rollback aislado
v17/pre-NeedsSignIn (`scripts/license-generation-rollback.ps1`). La compatibilidad
se conserva por la posible RC9; no se retiran lectores de disco ni fixtures aquí.
Historial/versiones anteriores: Git y [evidencia](../../docs/vantare-program/license-simplification-evidence.md).


DTO explícito, transporte autenticado y demanda; la versión de foto es independiente de servicios y control.

MailConsent confirma el endpoint native-mail-consent, nunca un flag local.
El protocolo de MailConsent no transporta correo, identidad ni tokens.
BillingProduct incluye Founders y CatalogAccess distingue su catálogo; ningún
mensaje transporta tokens ni negocia permisos con una generación anterior.

## #1562 · Ocultar fuera de pista

DTO v10 añade `state.driving_situation` a fotos completas y parciales, también
con demanda vacía. Campo ausente se lee Unknown; valor desconocido se rechaza.
En la entrega original el pipe live admitía v10; #1638 lo eleva a v11.
Los lectores guardados aceptan v7/v8/v9/v10/v11
sin reescribir originales. Servicios y control mantienen sus versiones propias.
Ver [contrato y señales](../runtime/README.md).

## #1638 · Avisos de sesión

DTO v11 añade los siete campos de `Session.timing` al grupo `SessionInfo`.
El cable solo negocia v11: hay que recompilar Core, Hub y overlays juntos.
Los lectores explícitos de datos guardados aceptan v7–v10 y convierten estos
campos a `Unavailable`; no cambian los archivos originales. Los tests y la
geometría demo usan ese lector de fixtures, nunca el pipe productivo.
Contrato, relojes, límites y conexión con #1653:
[`session-alerts-contract.md`](../../docs/telemetria/session-alerts-contract.md).

## #1868 · Caracterización y frontera compartida (pasos 0–1)

Las fronteras actuales no son equivalentes. Los tests conservan esta tabla
antes de consolidarlas; «reinicia» significa descartar memoria anterior:

| Cambio | Trackers | Retención en pausa / situación | Journal SessionChanged | Hidratación IPC |
| --- | --- | --- | --- | --- |
| SessionId | reinicia | reinicia | sí | reinicia |
| Coche jugador | reinicia | reinicia | no | si se entrega identidad |
| Circuito / tipo | conserva | reinicia | no | conserva |
| Fuente | conserva | reinicia | no | conserva |
| Situación | conserva | conserva | no | reinicia |

El orden de coches no cambia la frontera IPC; cambiar sus IDs sí, cuando se
entregan. El test de pipe `driving_situation_changes_keep_the_demanded_pipe_connected`
reproduce la reconexión en el commit previo de tests del paso 0. El paso 1 lo
activa como regresión: `Boundary` compartida fuerza toda la demanda al cambiar
de situación, también si la fuente sigue en Live. No cambia el DTO v11.
Usa demanda de 16/250 ms y una señal centinela a 5 s para observar reconexiones
sin inferirlas de un umbral de latencia. El test puro fija la cadencia a 16 ms.
La revisión P3 añade Flags a 0 ms como barrera: se espera la revisión exacta
antes de publicar otra, sin sondeos de 16 ms ni fotos rezagadas. Un emisor
`test-support` con máscaras explícitas comprueba completa→parcial después de
rehidratar: llega el reloj nuevo y se conserva la señal lenta de la nueva
situación. Usa el codec/suscriptor reales y cierra su hilo y pipe al terminar.
La pausa se prueba con pipe real hasta `Overlay::project_snapshot`, llamada
desde `Overlay::ingest`; no acredita una ventana GPUI ni una sesión física.

## #1868 · Conversión y reparto únicos (paso 3)

`signal_fields!` en dto.rs declara una sola vez qué campos lleva cada señal.
Genera la selección, la restauración y la presencia de datos de coche/jugador.
Las identidades y metadatos del sobre siguen viajando siempre. La conversión
completa usa la misma selección con toda la demanda; la lectura por valor
pide prestado el DTO al único decodificador, sin clonarlo entero. Se conservan
los tipos y atributos serde de v11, los lectores guardados y los bytes del cable.
La compilación impide omitir o repetir un campo al construir cada DTO; los tests
comparan las cuatro calidades con el original y ejercitan rehidratación y JSON.

## Seguimiento #1869, paso 6

`files::future_version` centraliza la comprobación de versión desconocida de
Launcher, layout del Hub, Apariencia y el documento agregado. No determina la
validez del resto del esquema. Un número desconocido se conserva como Unsupported;
un tipo inválido es InvalidInput. Los errores CAS incluyen la ruta del documento
y siguen clasificados como Conflict, sin comparar mensajes.

Hasta el paso 8, un campo nuevo con igual version puede ser rechazado por un
lector estricto y archivado como corrupción. Por este riesgo de rollback,
reducedMotion NO se añade al layout en 6. Store v2 publica appearance.json como
espejo temporal solo al guardar Apariencia por acción del usuario.
