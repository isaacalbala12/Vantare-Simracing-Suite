# Ruta registrada A4 — primera pasada productiva

Capturas del TSX/CSS real en orbit-strategy-harness, 1672×941, con el runtime
de prueba preexistente. Ford/Imola procede de ese fixture. No son datos nuevos
de telemetría, ni evidencia Wails, ni una certificación de cálculo.

- start, combination-selected, rules, drivers, sessions: cinco pasos productivos.
- overview: create del repositorio simulado, sin sesiones ni parámetros
  inventados y sin cálculo. Mis estrategias usa list/open del mismo protocolo.
- 1280, 1024 y 768: reducción de ventana, con el escalado de Orbit existente.
  Sin overflow horizontal del documento. Los bloques largos se desplazan en
  workspace; esto no demuestra todavía todos los recorridos por teclado.

Se corrigió un fallo observado: al usar display:none para la columna de ancho
cero, el grid colocaba main en esa celda. Se conserva la celda con visibility:
hidden. El banco verifica ancho útil del editor >1000px en 1672 y observó
workspace1208px en1280. Script local C:/tmp/isa1094-route-journey.cjs.

Se alinearon título, check y footer completo, contexto sin bloques ajenos,
contraste secundario y fondo único del resumen. Continúan pendientes pestañas,
edición avanzada, cálculo, paridad completa y review visual independiente >9.

Dos repeticiones intermedias no llegaron al resumen porque apareció un error
de guardado. La repetición posterior terminó correctamente; no se ha demostrado
la causa de esos dos fallos. La UI permite hoy intentar abrir antes de tener
versión del repositorio, aunque el owner lo rechaza sin escribir; se añadirá
un gate visible y una prueba con carga retrasada. No presentar esos fallos como
solucionados ni como evidencia de aceptación nativa.

Gate general: 438 archivos/3420 tests frontend PASS; lint y build PASS. Avisos
heredados de teardown happy-dom y chunks Vite. Build final después de CSS PASS.
Logs C:/tmp/isa1094-t05k-{all,lint,final-build}.log.
