# Hub nativo (ISA-1430)

Proceso GPUI independiente, misma revisión y kit Eficiencia que `vantare-ui`.
No usa Wails, runtime, credenciales ni servicios de red.

```powershell
cd native
cargo run --offline -j 2 -p vantare-hub
```

Todas las secciones del producto distribuido están en la navegación. Los
paneles que indican pendiente no implementan el servicio ni conceden acceso.

El botón Cerrar Hub y cerrar su ventana terminan el proceso. El Hub no es
hijo del launcher: consume el pipe IPC con Subscriber y cierra al observar
Replay→Live. Primera foto Live no cierra. **Pendiente DTO v4**: la base actual
no expone SourceState; falta exigir estado Live para cubrir Waiting→Live.
No usar este corte como prueba completa de cierre al entrar al juego.
`--control-stdin` y EOF son exclusivamente el ciclo de desarrollo (100 ms).

La paridad y los bloqueos están en el
[microplan](../../docs/superpowers/plans/2026-09-30-fase-5-hub-studio-workshop.md).

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
defecto `%LOCALAPPDATA%/VantareNative/hub`, separado de Wails). Error inicial
de documento/escena: salida con error, sin reemplazarlo por datos ficticios.
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

Cada edición, undo y redo se guarda mediante `layout::Document::save` antes de
confirmarla. Usa `%LOCALAPPDATA%/Vantare/native/layout.json`, independiente de
`--data-dir`. Conflicto por bytes/error conserva documento, selección e historial.
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

Notificaciones contiene errores locales reales, hasta 50, con dedupe,
unread/read/clear y destinos cerrados. Vive durante el proceso, como el
contrato Go; no tiene toasts ni emisores remotos. Ajustes guarda el formato
del Workshop sobre su estado existente. Testing Center muestra únicamente
contexto del snapshot local del Workshop; no genera ni envía un reporte.
Cuenta/licencias, Strategy, Engineer, análisis, Launcher y roadmap conservan
sus dependencias explícitas en el microplan y en cada pantalla.

## Verificación de proceso

`--pipe NOMBRE` selecciona un pipe local privado; por defecto usa el nombre
por usuario de IPC. Desde native, después de construir el binario:

```powershell
./hub/verify-process.ps1
```

Usa una copia y datos temporales propios más un pipe sin productor para
comprobar proceso vivo, guardado y salida total por EOF. No lanza núcleo ni
juego ni demuestra entrada al juego, paridad, DPI/OBS o presupuesto de memoria.
La condición de cierre espera SourceState de DTO v4; las APIs comunes de
Settings/layout y esa condición se completan en el orden del microplan.
