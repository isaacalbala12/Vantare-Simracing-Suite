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

Pendiente de Workshop completo: catálogo de 22 widgets de fase 2, configuración
de contenido por widget, edición/timeline de escenas y exportación de capturas
desde Hub. El comparador y el binario de captura existentes de `ui` siguen
siendo el camino de paridad. Este corte no los duplica ni afirma paridad aprobada.

## Studio local

```powershell
cargo run --offline -j 2 -p vantare-hub -- --studio --data-dir C:/tmp/hub-local
```

Editor de un único layout: selección, añadir/eliminar/ordenar instancias,
coordenadas globales (admite negativas), visibilidad, opacidad 0..1 y undo/redo
acotado a 50 cambios. Drag mantiene preview fuera del documento y confirma
una sola edición al soltar. Mismo renderer que Workshop/overlays.

**Solo preview en memoria; se pierde al cerrar.** Guardar muestra un bloqueo,
no escribe otro documento. La autoridad será `vantare_ui::layout` de fase 2
en `%LOCALAPPDATA%/Vantare/native/layout.json`, junto al enum Settings por kind.
Las pequeñas funciones load/save dejan esa integración señalada. No existen
proyectos múltiples, filtros propios, bloqueo, escala ni preferencias por
instancia. No se leen perfiles V4 ni el antiguo `native-layouts.json`.

Canvas de preview 1920×1080, otros monitores quedan fuera de la preview.
Tamaños intrínsecos; editor de contenido/Settings y escritura en cada edición
esperan integrar la API de fase 2. Tests de geometría/undo no sustituyen
arrastre físico, DPI, aplicación a overlays ni paridad.

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
