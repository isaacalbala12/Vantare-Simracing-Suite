# Hub nativo (ISA-1430)

Proceso GPUI independiente, misma revisión y kit Eficiencia que `vantare-ui`.
No usa Wails, runtime, credenciales ni servicios de red.

```powershell
cd native
cargo run --offline -j 2 -p vantare-hub
```

Todas las secciones del producto distribuido están en la navegación. Los
paneles que indican pendiente no implementan el servicio ni conceden acceso.

El botón Cerrar Hub y cerrar su ventana terminan el proceso. Un launcher puede
arrancarlo con `--control-stdin` y cerrar su stdin para pedir salida (100 ms de
sondeo); por defecto no se supervisa stdin para permitir arrancar sin consola.
La detección de entrada al juego y no relanzarlo tras el cierre pertenecen al
launcher y requieren integración; esta shell no demuestra ese gate físico.

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

`native-layouts.json` es un documento nativo versionado propio. No lee, migra
ni sobrescribe perfiles V4 de Wails. Nuevo/duplicar/cambiar layout; añadir tipos
del registro; seleccionar desde lista o canvas, mover por arrastre o inspector,
traer al frente, eliminar, mostrar/ocultar, bloquear, opacidad, filtro por
sesión y formato ES/EN/métrico/imperial. Los filtros no consideran actual una
sesión ausente u obsoleta. Workshop y Studio comparten la escena seleccionada.

El gesto conserva una preview fuera del documento y hace un único commit de
posición al soltar. Undo/redo acotados a 50 cambios. El documento admite hasta
32 layouts y 128 instancias por layout; se valida antes de cambiar o guardar.
Guardar usa el mismo protocolo de archivo/lock/conflicto del Workshop. Cargar
rechaza cambios locales sin guardar, JSON inválido o versión/tipo desconocidos.
Una importación fallida conserva documento y renderizadores actuales.

Límites: tamaño intrínseco del renderer, sin resize, editor de contenido por
widget, temas adicionales ni envío de configuración a overlays. No hay nombres
editables en la UI todavía (son campos del documento). La geometría de drag y
su undo tienen test de lógica; captura, interacción, DPI y paridad del editor
requieren revisión física. Studio sigue siendo parcial.
