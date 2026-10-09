# Relative LMU: fuentes y respaldo (#1496, feedback del 9 de octubre)

Base autorizada: `vantareapp/isa-1496-integracion-prueba@e55a43b3`.
Entrega aislada: `vantareapp/isa-1496-fb-relative`.
Brief: `C:/tmp/feedback-0910/relative.md`; reglas: `comun.md`.

## Decisión y cambio

El dato actual `Car.relative_s` del adaptador manda, conservando valor y
calidad, incluso sin vuelta completada y en boxes. Sin jugador identificable
se retira: el dato deja de tener referencia. El núcleo conserva únicamente
el respaldo `Estimated`, sin memoria entre observaciones. Best/last conservan
su prioridad histórica; si faltan, el periodo es `Car.estimated_lap_s`, que
el adaptador LMU ya lee de `mEstimatedLapTime` (scoring +472). El SDK lo
describe como el tiempo estimado usado por el juego para sus tiempos/gaps.
No se convierte ese periodo nativo en un **gap nativo**: la diferencia
modular sigue siendo una aproximación y permanece `Estimated`.

El respaldo no usa periodos caducados, no finitos ni <=0, tiempos de vuelta
caducados ni rivales confirmados en boxes. No inventa un periodo constante.
ACC conserva sus entradas y su prioridad best/last; sus goldens y hash
completo no se regeneran. El widget y el contrato IPC no se modifican. El respaldo sigue ocultando
rivales confirmados en boxes: no se elimina esa protección para rellenar
una foto de garaje.

## Fuente nativa investigada: conexión pendiente

SDK oficial **instalado**, leído sin modificar ni redistribuir:
`C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Support/SharedMemoryInterface/InternalsPlugin.hpp`.
SHA-256: `9b6ee8cf610fa5049b18df580a9a9bc9ebb91346fc466584d576a6442abcf68f`.
Probe MSVC x64/pack(4): `sizeof(TelemInfoV01)=1888`, ruedas +848;
`mTimeGapCarAhead` +780, `mTimeGapCarBehind` +784,
`mTimeGapPlaceAhead` +788, `mTimeGapPlaceBehind` +792 (float32).
Los dos primeros son candidatos para **vecinos inmediatos**; los otros
corresponden a clasificación. Ninguno incluye ID del rival ni un vector
de gaps al jugador para toda la parrilla. No se asignan a coches por nombre,
posición de clasificación o con una semántica inventada.

El fixture real 1.3 conserva en el jugador `(0, 5.394757270812988,
-35.08456802368164, 14.636457443237305)` en esos cuatro campos;
no certifica a qué IDs corresponde cada vecino ni la convención de signo.
Las diez capturas 1.4.x conservan ceros en los cuatro campos del jugador.
El corpus LMU47 sanitizado contiene **3600 SHM**, **239 REST**, y cero valores
no nulos en los cuatro campos de las 47 filas de telemetría. En las 3600
fotos del jugador: best=-1, last=0, estimado=211.5734100341797 s.
REST standings conserva solo carNumber/lapsCompleted/pitstops/player/
position/slotID/vehicleName; no contiene el gap relativo.
El inventario REST propio del 30 de septiembre tampoco contiene una sesión
con coches. `/rest/hud` confirma componentes visibles, no sus valores.

Como contraste de código público, las [bindings generadas de REST](https://github.com/snipem/go-lmu-api/blob/main/lib/models.go)
no ofrecen un gap relativo por coche en standings/trackmap. Esas bindings
advierten que infieren formas de una sola respuesta: **no prueban ausencia
universal** del dato en LMU ni sustituyen nuestras capturas. No se añade
un endpoint o campo especulativo a producción.

**Pregunta para el orquestador/Isaac (sin bloquear esta corrección local):**
¿obtener una captura SHM+REST sin eliminar estos cuatro campos, con el
Relative del juego y vecinos anotados? Recomendación: confirmar identidad,
signo, ceros/marcadores, boxes y frescura antes de publicar un gap `Reliable`.
La conexión del gap nativo para toda la parrilla queda pendiente de esa
fuente comprobada; esta entrega no afirma haberla resuelto.

## Tendencia, stint, proyección y repostaje

La base aprobada no contiene `runtime/src/core/trend.rs`, `stint.rs` ni
`relative_trend_s_per_lap`. No se crean contratos ni módulos paralelos.
El SDK y los corpus revisados no proporcionan esa tendencia por vuelta,
proyección ni litros realmente repostados. REST `strategy/usage` aparece
como candidato de historial de stint en las bindings públicas, pero no hay
cuerpo real admitido con identidad/frescura/unidades para estos contratos.
Recomendación: aplicar prioridad nativa en la rama que introduce esos
campos después de capturar y confirmar su semántica, sin confundir fuel a
repostar con fuel ya repostado. Este punto permanece pendiente por base/fuente.

## Evidencia y reproducción

`C:/tmp/feedback-0910/relative-evidence/source-inventory.json` contiene el
recuento completo del corpus; `layout.cpp`/`layout.exe` son el probe externo.
Se ejecutó la regeneración de ambos goldens LMU y de snapshots/secuencia
con el replay productivo a época 1463 y reloj grabado. El resultado
descomprimido es **idéntico** a la base: 10 DTO estáticos y 3839 LMU47.
En LMU47, los **47 coches están confirmados en boxes en todas las fotos**;
los 180433 campos Relative permanecen `Unavailable`. No se falsea esta
captura para anunciar un Relative lleno. Se conservan los gzip originales,
las fixtures y el comparador estricto; el generador temporal fue retirado.
La mejora del periodo se demuestra con regresiones controladas del núcleo,
no con una captura positiva de LMU47.
No se alteran corpus, oráculos Go, ACC, tolerancias ni campos de UI.

Manual: abrir LMU con Relative visible antes de completar una vuelta y
comparar signos/vecinos; deben verse valores estimados donde hay tiempo en
vuelta y periodo actual, o «—» en ausencia/boxes. Confirmar también la
caducidad y reconexión. No se ejecutó ese ensayo físico, OBS ni macOS.
