# Hub nativo (ISA-1430)

Proceso GPUI independiente, misma revisión y kit Eficiencia que `vantare-ui`.
No usa Wails ni importa el runtime. Consume DTO/IPC del supervisor para cuenta,
licencias, roadmap y reportes; el supervisor posee la red y las credenciales.

```powershell
cd native
cargo run --offline -j 2 -p vantare-hub
```

Todas las secciones del producto distribuido están en la navegación. La presencia
de una sección no acredita acceso, conexión remota ni paridad funcional completa.

El botón Cerrar Hub, el cierre de ventana y el flanco no-Live→Live solicitan
el mismo cierre protegido. Primero deben resolverse las decisiones del Launcher
y guardarse los documentos: un formulario Strategy sin confirmar, un conflicto
o un error de escritura mantiene el Hub abierto y muestra el error. La preservación
de datos tiene prioridad incluso si el juego ya está activo; tras resolverlo,
se puede cerrar manualmente. El Hub no es hijo del launcher. Live exige origen `SourceKind::Live` **y**
`state.source_state == SourceState::Live` (DTO v4). Waiting, Stale, Lost y
Replay no cierran; primera foto Live establece referencia y tampoco cierra.
El cierre cancela el Subscriber, sin parar núcleo, overlays ni Engineer.
La escena del Workshop no participa en esta decisión. La entrada física
al juego y la clasificación real de su estado siguen pendientes de QA.
`--control-stdin` y EOF son exclusivamente el ciclo de desarrollo (100 ms).

La paridad y los bloqueos están en el
[microplan](../../docs/superpowers/plans/2026-09-30-fase-5-hub-studio-workshop.md).

## Desarrollo en Linux y macOS (#1437)

Los gates de desarrollo se ejecutan desde `native/`: `cargo fmt --check`,
`cargo check --workspace --all-targets -j 4`,
`cargo clippy --workspace --all-targets -j 4 -- -D warnings`,
`cargo test --workspace --no-fail-fast -j 4` y
`cargo test --workspace --test lifecycle -j 4`.
El discovery del sistema y la lectura de accesos directos `.lnk` solo están
disponibles en Windows; Unix conserva las fuentes explícitas de prueba.
Los tests que ejecutan `cmd.exe` también son exclusivos de Windows. La captura
de paridad por Win32/PowerShell no está disponible en Unix; estos gates no
verifican paridad visual ni el comportamiento Windows.

## Workshop local

```powershell
cargo run --offline -j 2 -p vantare-hub -- --workshop --data-dir C:/tmp/hub-local
# O recompilar/reabrir al guardar Rust/fuentes con PowerShell 7:
./hub/dev.ps1 -DataDir C:/tmp/hub-local
```

Catálogo: `Kind::ALL`, sin copia de widgets. Selección de escenas versionadas,
reload JSON a 150 ms (última foto válida ante error), unidades/idioma del
formateador, fondo del escenario y comparación con una foto fijada sobre el
mismo renderer. El fondo pertenece al escenario, no al widget.

`--scene RUTA` admite un snapshot DTO JSON o un JSONL (una foto DTO por línea,
misma época, revisiones crecientes y tiempos de recepción no decrecientes).
JSONL: play/pausa, step, inicio, loop y cadencia de la captura. No genera
transiciones ni señales nuevas. Archivos hasta 16 MiB y 512 fotos. La escena
`lmu47` distribuida viene del corpus real; otras escenas son reconstrucciones
de paridad. Un archivo externo no adquiere procedencia por su nombre.

La selección se guarda en `workshop-selection.json` en `--data-dir` (por
defecto `<directorio de datos>/VantareNative/hub`, separado de Wails). El
directorio base es `%LOCALAPPDATA%` en Windows, `$XDG_DATA_HOME` (o
`$HOME/.local/share`) en Linux y `$HOME/Library/Application Support` en macOS.
Un error inicial de documento/escena termina con error, sin reemplazarlo por
datos ficticios.
Guardar o cerrar conserva widget/escena/foto/loop/unidades/idioma; la comparación
es temporal. Los locks y temporales son archivos hermanos; tras una muerte
abrupta revisar los restos antes de quitarlos. Conflictos o falta de permisos
no sobrescriben el archivo. Cierre normal rechazado si falla guardar; EOF
supervisado siempre cierra y devuelve error si no pudo guardar.

Pendiente de Workshop completo: catálogo de 22 widgets (Kind::ALL expone 18 en esta integración), configuración
de contenido en Workshop (Studio ya ofrece las opciones aplicadas), edición/timeline de escenas y exportación de capturas
desde Hub. El comparador y el binario de captura existentes de `ui` siguen
siendo el camino de paridad. Este corte no los duplica ni afirma paridad aprobada.

## Studio local

```powershell
cargo run --offline -j 2 -p vantare-hub -- --studio --data-dir C:/tmp/hub-local --layout C:/tmp/hub-local/layout.json
```

Editor del único `vantare_ui::layout::Layout`: selección, añadir/eliminar/ordenar
instancias, visibilidad, opacidad 0..1 y undo/redo acotado a 50 cambios. Canvas
edita posición global mediante drag y controles X/Y; admite negativas. Drag
mantiene preview fuera del documento y confirma una sola edición al soltar.
Inspector edita los `Settings` tipados. Mismo `Overlay::configured` que overlays;
no hay otra implementación visual ni otro formato de layout.

Al abrir una instalación limpia, Hub y overlays inicializan el documento mediante
la misma API: Standings, Relative, Delta y Pedals en el monitor principal. Si otro
proceso lo creó después de prepararlo, se relee antes de pintar o editar. Un layout
vacío guardado por el usuario se conserva; los conflictos de ediciones posteriores
siguen exigiendo recarga explícita.

Cada edición, undo y redo se guarda mediante `layout::Document::save` antes de
confirmarla. Usa `<directorio de datos>/Vantare/native/layout.json`, independiente
de `--data-dir`. Conflicto por bytes/error conserva documento, selección e historial.
Recargar layout acepta explícitamente el archivo externo y descarta historial;
si es inválido, conserva el anterior. Un archivo inválido al arrancar falla sin
abrir ventana ni reemplazarlo. Tamaño/normalización/backup/escritura pertenecen
solo a la API común. Cerrar no vuelve a escribir el layout ni pisa cambios externos.

Opciones aplicadas de Standings: cabecera, pie, marca (auto/oculta/visible) y
métricas de pie `none`, `track`, `estimatedLaps`. Plantillas, métricas de cabecera,
marca legacy, slots alternativos y variantes de Delta/Pedals/BroadcastTower/
PedalsTelemetry/RacingFlags/HeadToHead que solo se persisten se muestran sin
edición con «pendiente». Se conservan al editar otra propiedad. Otros widgets
no tienen opciones extra en la API actual. Fuente: constructores de `ui` y
`ui/layout-evidence.md`; habilitar variantes exige que su renderer las aplique.

Para probar en un archivo aislado, usar `--layout C:/tmp/hub-local/layout.json`
en Hub y en `vantare-overlays`; sin ese argumento ambos usan el layout común.
`hub/dev.ps1 -Layout C:/tmp/hub-local/layout.json` conserva esa ruta al recompilar.
El overlay ya vigila el archivo: no se añade comando de aplicación desde Hub.
Canvas de preview 1920×1080, otros monitores quedan fuera de esta preview.
Tests de documento/geometría no sustituyen arrastre físico, DPI, vigilancia
de ventanas/OBS ni paridad.

## Secciones locales

Calendario lee el seed oficial UTC de Go. El empaquetado caduca el 1 de
septiembre de 2026: se muestra histórico y no ofrece próximas carreras.
Seguir/dejar de seguir guarda `calendar-following.json`. Para una agenda
explícita, dejar un catálogo UTC en `--data-dir/official-schedule.json` y
pulsar Cargar; fallo conserva la última agenda. Se ofrecen hasta 20 salidas
de las siguientes 24 horas de series seguidas si la publicación es vigente.
No hay publicación, Discord, zonas distintas de UTC ni recordatorios.

| Sección | Implementación actual y contrato |
| --- | --- |
| Notificaciones | Errores locales, dedupe, lectura y destinos cerrados; memoria del proceso. |
| Ajustes | Preferencias locales de apariencia y Workshop; [contrato](src/settings/README.md). |
| Testing Center | Editor del servicio de reportes y diagnóstico local separado; [contrato](src/testing/README.md). |
| Cuenta / licencias / roadmap | DTO/IPC al supervisor, sin red ni credenciales en el Hub; `src/services`. |
| Launcher | Catálogo, perfiles, cadenas y política de cierre; [contrato](src/launcher/README.md). |
| Strategy | Documento y solver local, datos/revisiones y editor; `src/strategy.rs`. |
| Análisis | Lectura acotada y cancelable mediante el helper de storage; `src/analysis`. |
| Engineer | Report v2 con frescura, entregas observadas y ajustes para su propietario; [contrato](src/engineer/MODEL.md). |

El proceso Engineer pertenece al supervisor y sigue independiente del Hub.
Estas rutas implementadas no prueban login/envío remoto, juego, OBS o empaquetado.
El worker de servicios publica su evento de cancelación antes de conectar o leer
el saludo. El cierre lo señala y espera el join en el ejecutor de fondo; no bloquea
el hilo UI durante el join. GPUI limita las futures de cierre a 200 ms; señalar
el evento y cerrar el sender despierta también connect/hello y recv pendientes.
Descartar una conexión no cancela al propietario, por
lo que una reconexión conserva su evento hasta el cierre del Hub.
La navegación, el rail, la paleta y el contenido usan la misma proyección de las
capacidades del núcleo recibidas por Cuenta. Requiere sesión no caducada y política
vigente sin error; logout, cierre del servicio o error revocan la proyección. El
Hub consulta LicenseStatus por IPC una vez por segundo cuando el canal está libre;
la política pierde vigencia a los dos segundos aunque no llegue otra respuesta.
Los bits ausentes no acreditan Free ni Studio básico: ese dato no está en el DTO.
Las restricciones de capturas/demo permanecen aisladas de la autoridad productiva.
El microplan y los bloques fechados conservan la evidencia de los hitos anteriores.


## Verificación de proceso

`--pipe NOMBRE` selecciona un pipe local privado; por defecto usa el nombre
por usuario de IPC. Desde native, después de construir el binario:

```powershell
./hub/verify-process.ps1
```

Usa una copia y datos temporales propios más un pipe sin productor para
comprobar proceso vivo, guardado y salida total por EOF. No lanza núcleo ni
juego ni demuestra entrada al juego, paridad, DPI/OBS o presupuesto de memoria.
La condición de cierre usa DTO v4 y el Studio usa la API común de layout.
El smoke usa una ruta de layout aislada y no lee el layout personal.

## Kit visual

`src/orbit.rs` reproduce los tokens y piezas de Command Orbit v0.3
(`frontend/src/styles/orbit.tokens.css`): columna de contexto, barra superior,
cabecera de página, tarjetas, filas de ajuste, interruptores, botones, selects
y notas. Toda sección nueva compone estas piezas; no define colores ni tamaños
propios. La dirección visual la mantiene el orquestador.
