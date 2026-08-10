# Criterios medibles de éxito — Spikes de la suite de telemetría

Estado: draft para revisión (Isaac + Sol). Complementa ADR-0090/0091 y `contracts.md`.
Regla general: cada criterio es un número o un veredicto binario, medido y anotado en el apéndice del ADR correspondiente. "Va fino" no es un resultado.

Hardware de referencia: la máquina de desarrollo de Isaac (Windows 11). Todos los tiempos en frío salvo indicación.

## Spike 1 — DuckDB en Go (CGO) dentro del pipeline real

Driver: **`github.com/duckdb/duckdb-go/v2` (oficial)**, que enlaza DuckDB estáticamente por defecto.
Dataset de prueba: sesión de carrera real de Algarve (178 MB, 71 vueltas, 685k muestras @100 Hz por canal).

| # | Criterio | Umbral |
|---|---|---|
| D1 | `go build` con `duckdb-go/v2` compila en el Taskfile de Windows y en el pipeline de release (GoReleaser/workflow actual) sin tocar el toolchain más allá de lo documentado | binario producido en CI |
| D2 | Incremento de tamaño del binario de la app | **informativo** (se mide y anota; no dispara plan B por sí solo — mover DuckDB a otro proceso no reduce el total distribuido) |
| D3 | Apertura en solo lectura de la copia de la sesión de 178 MB | < 2 s |
| D4 | Lectura completa de un canal de 685k filas a `[]float32` | < 500 ms |
| D5 | Importación completa de la sesión (todos los canales de la slice + laps + metadata → store canónico) | < 15 s |
| D6 | `go test ./...` sigue pasando; sin crashes CGO en 20 importaciones consecutivas (incl. un archivo con `.wal` huérfano y uno de garaje) | 0 crashes |
| D7 | Cierre limpio: la app termina sin procesos zombis ni archivos bloqueados | verificado |
| D8 | **Esquema físico del store**: prototipo comparativo de (a) base DuckDB única vs. (b) catálogo + un archivo por sesión — midiendo tiempos de D3–D5 en ambos, borrado de una sesión, tamaño total y complejidad de backup | decisión documentada **antes de la fase 1a** |

**Fallo de D1/D6 ⇒ plan B** (proceso auxiliar persistente que embebe DuckDB, ADR-0090 §3) y se re-mide D3–D8 sobre el plan B antes de continuar.

## Spike 2 — dockview + uPlot en WebView2/Wails v3

Matriz: 1 / 4 / 8 / 12 paneles, cada uno un uPlot con ~100k puntos, cursor sincronizado por facetas.

| # | Criterio | Umbral |
|---|---|---|
| W1 | Cursor sincronizado entre todos los paneles visibles | p95 < 16,7 ms por actualización, en toda la matriz |
| W2 | Renders de React provocados por hover/scrub (React DevTools profiler) | 0 |
| W3 | Zoom (rueda + drag de rango) en panel con 100k puntos | p95 < 33 ms hasta frame estable |
| W4 | Resize continuo de splitter con 8 paneles visibles | sin frame > 50 ms; estrategia de throttle documentada |
| W5 | Memoria tras 20 ciclos de abrir/cerrar los 12 paneles | heap JS vuelve a ±10% de línea base tras GC |
| W6 | Panel en tab oculta | 0 frames de render y 0 peticiones de datos (verificado con contadores) |
| W7 | Serialización → deserialización del layout completo (12 paneles, 2 syncGroups, facetas mixtas), incl. reconciliación `panels[]` ↔ `dockviewState` | round-trip sin pérdida |
| W8 | Popout: el popout nativo de dockview exige una URL `http(s)` del **mismo origen** vía `window.open` — probar con la URL del servidor local | veredicto A/B: si falla, demo mínima de segunda ventana nativa Wails v3 con sync de facetas cross-window; floating interno solo como constancia de último recurso |
| W9 | Drag-and-drop de paneles entre grupos y a floating | sin errores de consola ni estados huérfanos |

## Spike 3 — Cadena de gráficas y datos (servidor → panel)

| # | Criterio | Umbral |
|---|---|---|
| G1 | `GET /api/analysis/channel` con reducción M4 a ~1500 buckets sobre canal de 685k filas | < 100 ms servidor + < 20 ms decode en frontend |
| G2 | Carga inicial del workspace de la slice (4 paneles, 2 vueltas: velocidad, pedales, delta, mapa) desde click en vuelta hasta pintado | < 400 ms |
| G3 | Zoom que pasa de M4 a datos completos (re-fetch del rango) | < 150 ms extremo a extremo |
| G4 | Reducción `transitions` sobre canal `gear` de una vuelta | todas las transiciones presentes (comparado contra datos completos) |
| G5 | Cancelación: zoom rápido encadenado (10 zooms en 1 s) | solo la última petición completa llega al panel; el resto abortadas (verificado por contador de servidor) |
| G6 | Delta por distancia entre 2 vueltas, validado con **fixtures sintéticos** de perfil conocido (vueltas construidas analíticamente donde el delta en cada punto tiene solución cerrada) | error < 0,02 s en TODO punto intermedio del fixture; y sobre datos reales, error de cierre < 0,05 s vs. diferencia oficial de tiempos |

## Presupuesto de memoria global (sesión de análisis típica)

| # | Criterio | Umbral |
|---|---|---|
| M1 | Workspace slice (4 paneles, 2 vueltas cargadas) | heap JS < 250 MB |
| M2 | Proceso Go con 3 sesiones importadas y 1 abierta | RSS extra sobre línea base de la app < 300 MB |
| M3 | Importación de sesión de 178 MB | pico de RSS del importador < 1 GB |

## Protocolo

1. Cada spike produce un apéndice en su ADR con la tabla rellenada (valor medido, no solo pass/fail) y el commit del código de spike.
2. El código de spike vive en rama propia y **no** entra en `develop`; la vertical slice se implementa limpia después, con lo aprendido.
3. Un criterio fallido no se negocia a la baja en silencio: se lleva a decisión (Isaac + Sol) con alternativas.
