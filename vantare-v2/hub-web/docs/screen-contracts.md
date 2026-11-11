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

Tras el contrato inicial de lectura, `calendar.configLoad` proyecta las revisiones
independientes de preferencias, series seguidas y avisos. `calendar.utcSet`,
`calendar.notifyWeekSet` y `calendar.followSet` exigen `expectedRevision` de 64
hexadecimales y el mismo permiso `AccessView.calendar` del módulo. Se sube el
wire provisionalmente a 19. El número definitivo lo asigna el orquestador al
aprobar el PR, seguido de un único rebase y regeneración sobre nightly.

Cada acción cambia un solo campo del documento fijo correspondiente, conserva
campos desconocidos (también anidados) y escribe con `files::Mode::Observed`.
La comparación bajo bloqueo evita la carrera entre lectura y escritura. Un
conflicto devuelve `calendarConflict {current}` cerrado, sin rutas ni mensajes.
Documentos dañados, demasiado grandes, enlaces y versiones futuras se protegen;
la lectura no siembra archivos. Solo una acción explícita puede crear su fichero
privado ausente. La respuesta de éxito se prepara antes de escribir: una lectura
posterior fallida no convierte un guardado ya realizado en un rechazo.

Los avisos se leen completos para respetar la configuración GPUI existente;
esta entrega solo modifica `notifyWeek`. El editor de franjas/tandas, los canales,
ICS y el feed se entregan después. No hay cambios en IPC, services o derechos.
