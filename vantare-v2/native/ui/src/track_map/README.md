# TrackMap Eficiencia — ISA-1427

Worker Codex, rama `vantareapp/isa-1427-w-track-map`, base asignada
`6973c81f29574a573d76f3fae48e128d6964960a`. Solo commits locales para revisión
de Claude Opus 5.5. Notion no disponible según el encargo de Isaac; seguimiento
GitHub [#1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427)
por excepción explícita. Reconciliación de Notion pendiente del orquestador.

## Comportamiento y límites

- Proyección pura: misma transformación uniforme para trazado y marcadores,
  padding 12, viewport 320 × 220, path redondeado a dos decimales. Identidad y
  clases de Snapshot. Los metros del plano x/y se trasladan sin girar por yaw.
- Reliable y Stale de pose se muestran; Unavailable, Estimated y coordenadas
  no finitas se omiten, conforme a groundPosition fresh/stale del productivo.
  Un `(0, 0)` real sí se muestra. No hay marcadores inventados.
- Sin geometría se muestra `PISTA SIN MAPA` / `TRACK NOT MAPPED`, sin etiqueta
  ni pie, como `unknown-track`. El modelo no contiene `OverlaySourceStatusV2.state`
  (enum de conexión sin unidad; calidad no representable): no se infiere
  `no-telemetry`, error, stopped, detecting o connecting de un reloj/capacidad.
- Señal ausente: `session.track_geometry` (polilínea cerrada de puntos x/y,
  metros en el mismo plano y origen que Car.pose, identidad de circuito y
  etiqueta; calidad `Unavailable` en el Snapshot actual). No se amplía modelo,
  IPC ni adaptadores. La función productiva `domain::track_map::project` no
  contiene catálogo de circuitos ni geometría de reserva.
- Solo con `parity-capture`, `scene.rs` suministra los 582 puntos originales
  de Sebring del pack frontend al coincidir estado, origen y época con la
  fixture embebida. Otra fuente, circuito, estado o pose pierde esa geometría.
  La secuencia puede avanzar sin repintar; no cambia el dibujo. No es evidencia
  LMU real. El trazado es un circuito del pack (synthetic=false como el
  productivo), mientras que todos los coches pertenecen a una demostración.
- La fixture DTO v3 conserva epoch=3 y sequence=2 del frame congelado. Los
  20 coches tienen 19 groundPosition útiles; el jugador carece de posición y
  no se dibuja. Pose no permite separar x/y de yaw: yaw=0 es una orientación
  solo de la escena, explícitamente sin medición y sin uso en el renderer.
- Geometría congelada: SVG en (8,8), 304 × 209, escala 0,95, separador y pie
  en y=223/230. El panel completo mide 320 × 248 (la referencia captura el
  desbordamiento real del layout base 320 × 220). Vacío: 320 × 220.
- No hay animaciones ni avisos en TrackMapFunctional: Wake::Idle siempre y
  animating=false. Se actualiza solo si cambia el ViewModel visible.
- Apariencia por defecto del manifest; no se portan controles de Studio ni
  settings de color, ni el catálogo completo de circuitos. Sin dependencias
  nuevas, unsafe, acceso al runtime o lógica por simulador.

## Kit compartido

Se reutiliza `domain::format::Preferences`/`Language` y `ui::efficiency` para
panel, marco, rectángulos, colores e Inter. Los círculos SVG, la selección de
color por clase y el borde superior al 24% faltan en el kit y permanecen en
este módulo; pueden extraerse cuando el orquestador confirme otro consumidor.
El degradado sigue la aproximación existente de Standings (primer tramo;
los tramos restantes aportan menos de 1% de blanco). Stroke usa la teselación
GPUI; no introduce otra biblioteca SVG ni renderer.

## Validación

Fecha: 2026-09-30. Gates ejecutados antes de cada commit, sin superar dos
jobs de compilación:

| Hito | cargo fmt --check | clippy workspace/all-targets -j 2 -D warnings | test workspace -j 2 |
| --- | --- | --- | --- |
| Dominio, 5172874f63b8447a523f137139324a2bc4d371a6 | PASS | PASS | 289 PASS, 4 ignored, 0 fallos |
| Widget, ebb71bb5f7b1e31ae4af75b04ac1fc7443a24a92 | PASS | PASS | 291 PASS, 4 ignored, 0 fallos |
| Escena y paridad | PASS | PASS | 292 PASS, 4 ignored, 0 fallos |

También PASS `rustfmt --edition 2024 --check ui/src/track_map/mod.rs
ui/src/track_map/scene.rs`, clippy UI/all-targets con `parity-capture` y
`cargo test -p vantare-ui --features parity-capture -j 2`: 41 PASS, 0 fallos.
Los cuatro ignored son los dos tests de Shared Memory LMU (lib y grabadora),
REST LMU y live ACC. No se han ejecutado comprobaciones físicas LMU/ACC/OBS,
DPI mixto ni presupuestos de rendimiento; esta entrega es una paridad de demo.
No se han ejecutado gates Go/frontend porque no se modifican esas rutas.

Captura exclusivamente con `ui/compare.ps1 -Widget track-map -MaxPercent 4`:
**1495 / 79360 px diferentes = 1,8838 %**, umbral por canal 8, RGBA
premultiplicado, sin máscaras, salida 0. Tamaño 320 × 248. El path completo
reconstruido coincide literalmente con el congelado y los 19 centros coinciden
con geometry.json (tolerancia numérica 1e-12). La diferencia restante se concentra
en el pie (zona x=0,y=227,w=161,h=21: 760 px) y en bordes del SVG; también hay
pocos píxeles de esquinas. Rasterización de texto y teselación de GPUI frente a
Chrome; el degradado mantiene la aproximación ya descrita. No hay píxeles
ocultados ni referencias modificadas.

Artefactos locales en `%TEMP%/vantare-parity/track-map/`: `track-map.png`,
`track-map.diff.png` y logs `domain.*.log`, `widget.*.log`, `parity.*.log`,
`capture.*.log`. SHA256 candidato:
`31e821d94b738a7228fd7518c43d5e786bfe55db56a4413c0abc39a571269228`.
SHA256 referencia intacta:
`fa748d4690a777af71eac8248f8037bc00a868c4aa6809e56579340b62c60071`.

Reproducción desde native (el script de la base fija -j 4; se limita a dos
mediante una función local, sin modificar tooling de otro worker):

```powershell
function cargo {
    $taskCargoArgs = @($args)
    for ($taskArgIndex = 0; $taskArgIndex -lt $taskCargoArgs.Count; $taskArgIndex++) {
        if ($taskCargoArgs[$taskArgIndex] -eq '-j') { $taskCargoArgs[$taskArgIndex + 1] = '2' }
    }
    & cargo.exe @taskCargoArgs
}
.\ui\compare.ps1 -Widget track-map -MaxPercent 4
Remove-Item Function:cargo
```

Para comprobar la ausencia honesta en producción, ejecutar el Workshop sin
`parity-capture` y con la misma fixture: debe mostrar PISTA SIN MAPA, sin
marcadores ni pie. Para revisar los tests específicos:
`cargo test -p vantare-domain track_map -j 2` y
`cargo test -p vantare-ui --features parity-capture track_map -j 2`.

Incidencia fuera de alcance: la opción opcional `diff.py --json` falla al
serializar numpy.int64; el modo normal usado por compare.ps1 pasa y conserva
el PNG de diferencias. No se modifica el comparador.

Decisiones para Opus: asignar propietario/contrato al trazado común y al
estado de conexión antes de activar mapas live; decidir la extracción al kit
de círculos, colores de clase y borde superior. No se crean dependencias nuevas.
Seguimiento Notion e integración siguen pendientes del orquestador; este worker
no realiza push, PR, merge, release ni promoción.
