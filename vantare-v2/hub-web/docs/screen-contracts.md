# Contrato por pantalla · VANTA-138

## Testing Center: Triage (`triage`)

El módulo registra únicamente `triage.prepare { selection, consent }` y
`triage.send { previewId, consent }`. Ambos exigen cuenta verificada, no bloqueada
y derechos de tester en el anfitrión. La selección usa un enum cerrado y no admite
duplicados; el identificador preparado tiene exactamente 64 dígitos hexadecimales.
El título y la descripción del editor son locales: no forman parte del wire ni se
transfieren al núcleo. Este recibe esos campos vacíos, como en el GPUI.

El anfitrión valida y proyecta la previsualización con lista cerrada de claves y
límites; no reenvía mensajes libres del servicio. La pantalla invalida la revisión
y el consentimiento al cambiar datos, selección, sesión o conexión, y serializa
las peticiones mediante la cola de Testing. Añadir estos métodos sube el wire de
10 a 11. El módulo no declara respuestas diferidas.

La vista muestra el contenido del informe, no la petición HTTP completa: el núcleo
lo envía dentro de un sobre fijo con versión, consentimiento e identificador
(idempotencia). No se modifica ese sobre desde el renderer. Tras recibir la vista
previa, se limpia el consentimiento y hay que volver a marcarlo antes de enviar;
es una mejora de seguridad respecto al GPUI. Una preparación abandonada puede
vivir en el núcleo hasta 30 minutos, aunque la pantalla ya la haya invalidado.

## Testing Center: diagnóstico local (`report_local`)

El módulo posee `report.localPrepare { fields }` y
`report.localExport { preparedHash }`, sus DTO, bindings, corpus, validadores,
mock y estado de sesión. `LocalReportView.preparedHash` es el SHA-256 del JSON
UTF-8 exacto: el proceso principal lo calcula al recibir la preparación y la
pantalla lo comprueba antes de habilitar Exportar. El proceso principal exige
ese mismo hash y elige la ruta mediante su diálogo nativo. No admite rutas,
texto ni opciones de tiempo del renderer.

Cada preparación se consume al abrir el diálogo, incluso si se cancela o hay
conflicto; otra exportación requiere preparar y revisar de nuevo. Mientras el
diálogo está abierto, se rechaza otra preparación con `busy` sin cambiar su
snapshot. Solo `report.localExport` está exento del timeout del Client: el
diálogo depende del usuario. Los demás métodos conservan su plazo habitual y
cerrar la conexión rechaza también esta petición pendiente.

El estado nativo del módulo conserva los hashes de los nueve binarios fijos
por nombre, tamaño y fecha de modificación. Un cambio invalida esa entrada;
no se añaden hilos ni se modifica IPC/Services. El JSON tiene un máximo de
64 KiB y no incluye texto privado. Se conserva la versión del wire de la base
(v7 al introducir este módulo).

Cada pantalla mantiene su contrato en
`native/hub-host/src/protocol/modules/<id>/`. Los ids reservados `contract` y `validators` se rechazan. El identificador usa solo letras minúsculas y
guiones bajos entre palabras (`testing`, `roadmap`, `studio`). El build descubre
las carpetas por orden alfabético. No hay un registro que editar a mano.

## Archivos propios

| Archivo                 | Responsabilidad                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wire.rs`               | Enums `Request`, `Reply`, `HostError`, `Topic`, `Event` que aporte la pantalla. Omitir los que no aporte. Derivar serde y, en tests/feature `bindings`, `TS`. Mantener el formato de rustfmt.                                                                                |
| `bindings.rs`           | `pub(crate) fn typescript() -> String` para DTO y constantes; `pub(crate) fn corpus() -> serde_json::Value` con `{host, ui}`, serializando variantes Rust reales. Los aliases de los cinco enums y las listas de métodos/temas se exportan automáticamente.                  |
| `dispatch.rs`           | `pub(super) fn dispatch(session: &mut Session, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()>`. Solo recibe solicitudes de sus variantes, por tabla cerrada. Tests de la pantalla en este archivo o en un submódulo propio.                                  |
| `state.inc`, `init.inc` | Opcionales: campos e inicializadores Rust de la sesión. Para estado nuevo, preferir un campo `<id>_state` con un tipo concreto de la pantalla. El constructor aporta `args`, `core`, `settings`, `confirmation`, `privacy`. No usar estado global ni `Any`.                  |
| `remote.inc`            | Opcional: variantes de la operación pendiente. Si existe, `dispatch.rs` aporta `complete(&mut Session, Option<(u32, RemoteKind)>, u32, Result<services_protocol::Reply, HostError>) -> Result<Reply, HostError>`. Validar ID y tipo de respuesta antes de actualizar estado. |
| `tick.rs`               | Opcional: `pub(super) fn tick(&mut Session, &mut Pipe) -> io::Result<()>`, sin bloqueos ni esperas.                                                                                                                                                                          |
| `model.rs`              | Opcional: modelo público como `crate::<id>`. `model.path` conserva la ruta de los modelos anteriores; no duplicarlos.                                                                                                                                                        |

Los fragmentos `.inc` son tokens Rust insertados en el tipo/constructor concretos;
el compilador comprueba campos, tipos e inicialización. Los nombres de variantes
y de campos deben ser únicos. Los métodos llevan `#[serde(rename = "pantalla.accion")]`
en una línea; los temas usan variantes unitarias con `camelCase`. No introducir
renombres de temas excepcionales ni literales escapados en los nombres del wire.
Los enums mantienen `deny_unknown_fields` donde corresponde. No hay JSON abierto
ni mecanismo para ejecutar métodos no registrados.

En TypeScript la pantalla mantiene:

- `src/contract/modules/<id>.ts`: exporta `methods` desde su fichero generado y
  `isRequest`, `isReply`, `isError`, `isEvent`, todos con
  `(value: Record<string, unknown>) => boolean`. Un caso no admitido devuelve
  `false`; comprobar claves exactas, rangos y revisiones. La agregación exige
  coincidencia exacta entre módulos y validadores.
- `src/mock/modules/<id>.ts`: `create(context: MockContext): MockHandler`.
  Mantener su estado en el cierre de esa sesión; `undefined` significa que el
  mensaje pertenece a otra pantalla y `null` es una ausencia de respuesta
  simulada expresamente. Los datos, permisos y errores son locales de QA.
- El cuerpo del PR incluye una sección `Handoff`: estado, SHA/checks, evidencia
  y siguiente paso. No editar los archivos del handoff compartido en los PR.

Si el módulo declara `Topic`, `dispatch.rs` aporta también
`subscribe(&mut Session, &mut Pipe, Topic) -> io::Result<()>` para publicar
el estado inicial. La tabla y la retirada de la suscripción se agregan sin editar
el receptor central.

El registro visual `screens/<id>/entry.tsx` y `SectionChrome` sigue igual;
véase [screen-registration.md](screen-registration.md).

## Generación y comprobación

Usar la cola y el target propio definidos en `native/README.md`:

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File native/hub-host/regenerate-and-check.ps1
```

Esto exporta y comprueba `src/contract/generated/<id>.ts` y
`src/contract/generated/corpus/<id>.json`. **Versionar solo esos archivos propios.**
Un test Rust rechaza módulos generados sobrantes o ausentes, compara cada archivo
con Rust y exige muestras de todas las variantes del wire. Un test por módulo ejecuta todas sus muestras de solicitud contra el `dispatch.rs`
real, con pipe en memoria, ficheros temporales y servicios desconectados. Corre en
Windows y Linux; detecta un brazo omitido aunque exista el handler en la tabla.
Las suscripciones mantienen además la comprobación de ruta única.

```text
cd hub-web
bun run contract:index
bun run typecheck
bun run lint
bun run test
bun run build
```

Los índices `generated/contract.ts`, `generated/corpus.json`,
`generated/validators.ts` y `generated/mocks/` se reconstruyen y están ignorados
por Git. Los consumidores conservan el import `generated/contract`.
`typecheck`, los builds Vite y Vitest generan sus índices antes de usarlos;
no hace falta Rust para trabajar en la interfaz con los módulos ya exportados.
Los tests del índice comprueban la incorporación de otro módulo, la unión cerrada
y que los módulos anteriores no cambian. Los aliases se extraen únicamente de los
cinco enums de cada módulo, no de otros DTO con nombres parecidos.

Cada `wire.rs` debe terminar exactamente con:

```rust
#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
```

`wire.rs`, `dispatch.rs`, `bindings.rs` y `tick.rs` no son recorridos por
`cargo fmt`, porque los módulos se incluyen desde `OUT_DIR`. Formatearlos
explícitamente con `rustfmt --edition 2024 <archivos>`.
Un test invoca `rustfmt --check` sobre todos ellos y falla si no están formateados.
El build rechaza variantes/renombres en la misma línea, temas agrupados y nombres
serializados duplicados entre solicitudes o entre respuestas de distintos módulos.

El exportador Rust escribe exclusivamente módulos y corpus propios. El único
generador del índice agregado es `scripts/contract-index.ts`; tras ejecutar el
exportador, usar `bun run contract:index` antes de consumir el índice.
No editar los índices, `protocol.rs`, `protocol/bindings.rs`, `lib.rs` ni
`ui_process.rs` para añadir una pantalla. Un cambio del transporte compartido
(versión, autenticación, cierre, cola de servicios) sigue requiriendo coordinación.

## Migrar un PR ya abierto

Antes de portar las variantes, respetar las tres reglas que `build.rs` impone:

1. El id admite solo letras minúsculas y `_` entre palabras, sin segmentos vacíos.
   `contract` y `validators` están reservados.
2. Cada `wire.rs` termina con el submódulo de bindings:

   ```rust
   #[cfg(any(test, feature = "bindings"))]
   pub(crate) mod bindings;
   ```

3. El atributo `#[serde(rename = "pantalla.accion")]` y su variante van en
   **líneas separadas**, con el formato de rustfmt. Los temas son variantes
   unitarias, una por línea. El build rechaza nombres que no pueda enrutar.

Rebasar con `--onto` sobre el nightly que integre esta separación. Portar sus
variantes, DTO/constantes/muestras, estado y handlers al módulo de la pantalla,
y sus validadores y mock a los archivos propios. Regenerar y revisar el diff:
los otros módulos no deben cambiar. No recuperar los antiguos índices versionados
al resolver conflictos. Las únicas respuestas de error aceptadas siguen siendo
las declaradas por Rust; mantener CAS y las comprobaciones de permisos existentes.

La migración conserva el wire v6, sus límites, la autenticación y el guard de
cierre. La apariencia no cambia. Se eliminan dos muestras duplicadas de un mismo
evento `updates`; permanece la cobertura de todas sus variantes.

### Respuestas diferidas

Solo el módulo `testing` puede declarar `deferred.reply` (el build rechaza cualquier otro conjunto). Puede devolver `Result<Option<Reply>, HostError>`
desde `complete`: `None` retiene la petición mientras llega la confirmación de
una segunda operación del núcleo. Los módulos sin ese archivo conservan su
firma y el generador envuelve su respuesta en `Some`, sin cambiar su wire.
El módulo registra `(id, Instant)` en `session.deferred` únicamente después de
que la segunda operación se acepte. El receptor envía la respuesta final o el
error; una desconexión, el plazo del protocolo o un cierre responde
`CoreUnavailable` antes de retirar la petición. Las respuestas tardías de esa
petición cancelada se descartan. No se introducen variantes en el wire v6.

`ReportDraftView` gana el campo `legacy` sin subir la versión del wire (v6).
Distingue `archived` (se archivó el antiguo y ganó el borrador protegido) de
`preserved` (el origen sigue conservado por un fallo o por no poder importarlo).

## Calendario (`calendar`): datos de solo lectura

`calendar.load {}` lee los documentos existentes del GPUI sin crearlos ni modificarlos:
`official-schedule.json`, `fallback-schedule.json`, `official-schedule-previous.json`,
`calendar-following.json`, `calendar-prefs.json` y `calendar-stamps.json`.
`calendar.refresh {}` solicita únicamente `CalendarRefresh` al núcleo; conserva en
memoria la última publicación válida. La persistencia con CAS se incorpora junto
con las acciones de Calendario, no con esta primera lectura. Cachés inválidas se
señalan mediante `invalidCache`, sin rutas ni mensajes libres y sin retirar el original.

Ambos métodos requieren `verified && !blocked && AccessView.calendar` en el
anfitrión. La finalización vuelve a comprobar el permiso, la familia y el ID de
respuesta; rechaza una respuesta inválida antes de sustituir ningún snapshot.
El refresco usa la cola compartida de servicios; otra solicitud de refresco en
vuelo devuelve `busy`. La capa de memoria del núcleo prevalece sobre una caché
de disco anterior durante la sesión. Sin esa capa, retirar un fichero retira su
publicación. Ningún refresco inventa sellos de comprobación: se conservan los
sellos válidos del núcleo leídos del documento de caché.
Las fechas exigen `T`/`Z` mayúsculas, segundos de 00 a 59 y, si hay fracción,
de una a tres cifras; Rust y TypeScript comparten el corpus de casos límite.
Errores del servicio sin clasificación tipada se agrupan en `rejected`; transporte
y ocupación conservan `coreUnavailable` y `busy`. No hay método genérico, URL,
ruta ni JSON abierto del renderer. Se proyectan los campos públicos conocidos y
se exportan desde Rust los límites y días admitidos para los validadores TS.

Añadir ambos métodos usa el protocolo v16, reservado tras Inicio (v15). `chrono` es dependencia directa con las mismas opciones
que Services y reutiliza `chrono 0.4.45` del lock; no se añade paquete nuevo.
No se modifica IPC/Services, runtime, derechos, supervisor ni el GPUI congelado.
Las vistas, favoritos/avisos, ICS y publicación de `session-alerts-feed.json` se
entregan por separado. El feed conserva el esquema IPC existente.

### Calendario: preferencias con CAS

`calendar.configLoad` devuelve los valores y las revisiones independientes de
preferencias, series seguidas y avisos. `documents` distingue `ready`, `protected`
y `unavailable` por documento; solo `ready` lleva una revisión utilizable. Un
archivo ausente válido usa sus valores iniciales y la revisión de ausencia, sin
crearlo. La vista no expone bytes, rutas ni mensajes libres.

`calendar.utcSet`, `calendar.notifyWeekSet` y `calendar.followSet` exigen
`expectedRevision` de 64 hexadecimales y `AccessView.calendar`. Cada escritura
valida únicamente su documento; un archivo protegido no bloquea los otros. Las
respuestas conservan la última proyección de los documentos que no se tocan.
CAS compara los bytes observados bajo el bloqueo de `files::Mode::Observed` y
los conflictos devuelven `calendarConflict {current}` para revisión y reintento
explícitos. No se reescribe ni cambia la revisión si el valor ya era el pedido;
un no-op tampoco crea un documento ausente ni toma el cerrojo de escritura.

La política de disco es la del GPUI congelado: Following exige `seriesIds` y
rechaza campos desconocidos; Alerts, Band, Slot y Channels también los rechazan.
Channels presente exige sus tres booleanos. Following/Alerts rechazan `version`,
que no forma parte de esos esquemas. Prefs admite campos desconocidos y el Hub
los conserva. Archivos incompatibles, enlaces y excesos de límite se protegen y
se mantienen intactos. Al crear avisos se serializa `CalendarAlerts::default()`
completo antes de aplicar `notifyWeek` (GPUI `calendar/alerts.rs:99-140`).

Seguir una serie nueva exige un horario vigente cargado (oficial o respaldo),
nunca `previous`. Su ausencia o caducidad devuelve el error cerrado
`calendarScheduleUnavailable`. Quitar una serie retirada y los no-ops no exigen
un catálogo vigente. El reloj se pasa explícitamente al cálculo y los tests no
usan la fecha real.

`State.base` recibe `Args.data`, cuyo valor normal es `Root::from_env().hub()`,
el mismo origen que las opciones normales del GPUI (`hub/src/main.rs:117-126`
y `hub/src/shell.rs:1574`). En QA ambos pueden recibir una raíz aislada explícita.
Las escrituras preservan valores admitidos, no el orden de claves ni el formato:
la configuración aislada de hub-host no activa `serde_json/preserve_order`; al
reescribir un `Value` sus mapas se ordenan por clave. No se cambia esa feature.

Wire 19. Esta entrega solo modifica UTC,
seguimiento y `notifyWeek`; editor de avisos, ICS y feed van aparte. Lanzamiento
diferido pendiente en #2089. Sin cambios en IPC, services, runtime o derechos.

## Studio (`studio`, v18)

El módulo ofrece `studio.get`, tema `studio`, `visibility`, `add`, `remove`,
`instance`, `undo`, `redo` y `track`. Todas las escrituras del diseño requieren
`baseRevision`; el historial de sesión conserva como máximo 50 pasos. `add`
devuelve `{ value, added }`, con la identidad asignada por Rust. El catálogo,
enums, límites y patrón de revisión se generan desde Rust. No acepta posiciones,
tamaños, rutas ni ajustes internos del widget.

El diseño ausente no se crea. Se conservan los campos desconocidos y los valores
JSON opacos; la primera edición ordena alfabéticamente las claves raíz y compacta
el documento, igual que Ajustes. Las minis con `settings.companionFor` se ocultan;
quitar y cambiar la visibilidad del principal afectan también a sus minis.
Quitar borra sus frecuencias específicas. El núcleo genera la mini de avisos de
sesión al cargar: el anfitrión no la fabrica.

Las modificaciones y mostrar exigen derechos frescos y no estar en Live. Ocultar
es una retirada segura de la petición y no exige derechos ni diseño válido.
La suscripción emite una vez y sondea cada 500 ms; al desuscribirse o entrar en
Live no lee el diseño. Deshacer/rehacer vuelve a comprobar los derechos al
restaurar un widget Pro. Posición/tamaño se editan sobre los overlays, no en el Hub;
la entrada a ese modo está inactiva hasta #2025.

### Historial local de Calendario (wire v22)

`calendar.historyLoad` ofrece las ocho últimas publicaciones de
`calendar-history.json`, solo para `AccessView.calendar`, cuenta verificada y no
bloqueada. Lee el mismo directorio de datos que GPUI. No crea, repara ni escribe
el documento y no contacta al núcleo. Proyecta solo inicio/fin, sello de primera
observación y serie/nombre/circuito; nunca rutas ni bytes libres.

Se conserva la lectura de campos desconocidos que admite GPUI
`calendar/history.rs:10-55`; esos campos no salen al renderer y el original no
se modifica. Un documento ausente ofrece lista vacía, uno ilegible, enlazado,
corrupto o fuera de límites ofrece lista vacía con `invalidCache`. Fechas en
segundos Unix, hasta ocho semanas y 256 series por semana, texto con los límites
comunes, sin duplicados. La lectura máxima es 64 KiB y no devuelve una proyección
parcial. Las semanas se ordenan por inicio. El consumidor podrá calcular la
rotación y mediana de publicación del GPUI; no se inventa historial de carreras.
Wire v22 aprobado; sin nuevos paquetes ni cambios en
IPC, services, runtime, derechos o supervisor.

## Launcher: buzón y registro (`launcher_resident`, v23)

`launcher.resident.get {}` y el tema `launcherResident` leen los formatos ya
publicados por el residente. No crean launcher.json ni escriben en el buzón:
no existe método de respuesta. Esc y cerrar el cajón solo cierran su vista local;
la decisión continúa pendiente y puede volver a consultarse. Sus acciones se
muestran inactivas con ese motivo, conforme al alcance de solo lectura.

Solo se proyectan frescura, ejecución, presencia de error, identidad decimal
exacta de la decisión, su tipo cerrado, acciones/etiquetas nativas y estados de
registro de atajos. Los mensajes, progreso libre, rutas, argumentos y PIDs no
llegan al renderer. Los atajos reutilizan la proyección de Ajustes: solo se
confirman si coinciden perfil y combinación en un estado fresco (menos de 3 s).
El sondeo es de 500 ms, solo suscrito y fuera de Live; subscribe registra la
primera vista para no repetirla. No se crean hilos ni se piden servicios.

No se muestra un contador n/total: Status contiene progress como texto libre y
el residente copia progress.message (resident.rs:426), sin publicar ese par de
campos. Los textos del cajón son cerrados por tipo de decisión para no reenviar
rutas que pueda contener el mensaje nativo. Es una diferencia conocida con GPUI.

El GPUI abre el cajón al recibir una decisión (`launcher/view.rs:178`). Se conserva
la apertura automática, pero no es modal: no bloquea edición ni controles de
ventana, y empieza por debajo de `--topbar-h`. La limitación de respuesta se
muestra como texto visible y descripción accesible, además del tooltip.
El sondeo lee solo el estado del residente; la proyección de launcher.json se
cachea por fecha de modificación y tamaño. Se conserva el parser validado del
crate (incluida su comprobación de duplicados), solo al cambiar esos metadatos.
La lectura sigue enlaces igual que launcher::open; no añade una política de
resolución de enlaces. La comprobación de tamaño del marco se hace al cachear,
con los metadatos de buzón de mayor tamaño posible. En Live, get devuelve una
vista vacía/desconectada sin leer disco, y no se emiten eventos.
Un estado de versión futura, inválido o caducado se ve como desconectado. Los
errores de registro se muestran en cada atajo; no se convierten en un error
general del residente. Un error general también puede corresponder al documento
o al inicio con Windows, por lo que su texto no afirma que fallase un lanzamiento.

## Escritura de avisos de Calendario (wire v24)

`calendar.alertsSave { alerts, expectedRevision }` guarda el documento tipado de
avisos con CAS local y devuelve `CalendarConfigView`. El wire exige todos sus
campos (incluidos días/modo de cada banda y los tres canales); los defaults de
compatibilidad solo se admiten al leer el documento antiguo del disco. El anfitrión exige
`AccessView.calendar`, cuenta verificada y no bloqueada antes de acceder al disco.
No hay rutas, argumentos de programas ni peticiones a servicios. La versión v24 sigue al buzón del residente (v23).

La revisión de 64 hex minúsculas identifica los bytes observados, incluido el
caso de documento ausente. Sin cambios, conserva la revisión y no escribe ni
adquiere el cerrojo. Un documento ausente parte del `CalendarAlerts::default()`
completo del GPUI; los documentos que el GPUI rechaza quedan protegidos.
Un documento ajeno protegido no bloquea esta escritura.

Bandas nuevas o modificadas: solo series diarias del horario vigente, oficial o
respaldo. Tandas nuevas: instante UTC exacto de una salida publicada y no pasada.
No se usa `previous` ni se inventan salidas. Los avisos antiguos pueden
conservarse o eliminarse sin horario; cambiar canales o antelación no exige red.
El error cerrado `calendarScheduleUnavailable` explica que falta un horario
vigente; `calendarConflict` devuelve el ganador y `busy` permite reintentar.

No habilita lanzamiento automático: se puede conservar un `autoLaunch` antiguo
sin activarlo en el anfitrión, o apagarlo. Pasar de falso a verdadero se rechaza.
El lanzamiento diferido sigue pendiente en #2089; no se cambian IPC, runtime,
rights ni supervisor. El feed de sesión y la exportación ICS van en PR propios.
