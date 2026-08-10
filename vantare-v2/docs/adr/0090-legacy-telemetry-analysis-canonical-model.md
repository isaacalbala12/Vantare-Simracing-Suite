# ADR-0090 (legacy): Modelo canónico de datos para la suite de análisis de telemetría

- Status: Legacy (renumerado desde ADR-0004 el 2026-08-10 para no colisionar con la secuencia activa de ADR; contenido original: Accepted 2026-08-08, revisado por Isaac + Sol)
- Date: 2026-08-08
- Deciders: Product (isaac); Advisors: Fable (Claude), Sol (GPT 5.6 Sol Pro)

## Contexto

Vantare incorpora una sección de **análisis de telemetría post-sesión** (clase MoTeC i2 / Coach Dave Delta): comparación de vueltas, análisis por zonas del trazado, y en fases futuras coaching con LLMs, algoritmos deterministas y recreación 3D básica del circuito. Objetivos del producto, en orden: estética (definitiva en el futuro, tokenizada desde ya) y rendimiento máximo (scrub a 60fps, carga instantánea).

### Verdad terreno (recon 2026-08-08 sobre datos reales)

Le Mans Ultimate graba telemetría nativa en `UserData\Telemetry\` como **un archivo DuckDB por sesión** (`{Circuito}_{P|R}_{fechaISO}Z.duckdb`), con `config.json` declarando canal→frecuencia. Hallazgos verificados sobre 376 archivos (3,6 GB):

- **Una tabla por canal**, no tabla ancha. 56 canales muestreados (`value FLOAT`, o `value1..value4` para las 4 ruedas) **sin timestamp**: el tiempo es implícito (`row_index / frecuencia`), anclado al reloj de sesión vía el canal `GPS Time` (100 Hz, segundos; verificado que cuadra con los `ts` de eventos).
- 42 **eventos** con `ts DOUBLE + value`: `Lap` (nº de vuelta), `Lap Time`, sectores, `Gear`, `In Pits`, TC/ABS, flags, bias, compuestos.
- **Frecuencias heterogéneas por canal**: 1–100 Hz según `config.json` (RPM/velocidad/volante/suspensión a 100 Hz; pedales a 50 Hz; G-forces, GPS, Lap Dist, Path Lateral, Track Edge a 10 Hz; temperaturas ambientales a 1 Hz).
- **Unidades declaradas** en `channelsList` (C, %, RPM, m, m/s, km/h, kPa, Nm, deg, s, L, kW).
- **GPS sintético**: lat/lon centrados en (60°, 0°) — es la posición x/y del mundo proyectada como offsets angulares; decodificable a metros. **No existe elevación (z)** en el archivo nativo.
- `metadata` incluye piloto, sesión, circuito, coche, clima y el **setup completo del coche en JSON**.
- ~8% de archivos con `.wal` huérfano (cierre inesperado del juego). Existen sesiones "de garaje" sin conducción real (Lap Dist máx. de metros, 0 vueltas válidas).
- Volumetría: ~90 MB/hora de carrera.

DuckDB **no admite lector y escritor en procesos distintos**: nunca se abre el archivo del juego in situ ni durante la grabación.

## Decisión

### 1. Arquitectura de datos en capas

```text
adaptador por simulador → raw inmutable → esquema canónico versionado → canales derivados versionados
```

- **Adaptador por simulador**: para LMU es un *importador de archivos* (DuckDB nativo). Para simuladores futuros sin grabación nativa será un *grabador live* (la infraestructura de captura a 60 Hz ya existe en `internal/telemetry/`). Ambos convergen en el mismo esquema canónico.
- **Raw inmutable**: el archivo nativo del sim jamás se modifica. La importación toma una **copia gestionada por Vantare** (raw store propio, con hash SHA-256 registrado) — no se depende del original de LMU, que el juego o el usuario pueden borrar o modificar. Esa copia es la fuente de re-derivación: el store canónico es **reconstruible**, lo que hace reversibles las decisiones de formato.
- **Esquema canónico versionado** (`schemaVersion`): modelo propio de Vantare, independiente del sim.
- **Derivados versionados** (`derivationVersion` por canal): recalculables en masa cuando mejora un algoritmo, sin re-importar.

### 2. Esquema canónico

- **Eje temporal**: tiempo de sesión en **`int64` (microsegundos)**, no float. El modelo soporta dos clases de serie:
  - **Regular**: `t0` + periodo en ticks (`periodUs`) + recuento — cubre los canales muestreados de LMU (tiempo implícito) sin almacenar un timestamp por muestra. Los **gaps** se modelan como segmentos (lista de tramos regulares), no se rellenan.
  - **Irregular**: timestamps explícitos por muestra — cubre eventos y cualquier fuente futura sin frecuencia fija.
- **Canal** = serie de valores + metadatos obligatorios:
  - nombre canónico, tipo/shape (escalar, por-rueda `[FL, FR, RL, RR]` — orden fijo del contrato —, vector), dominio (continuo, entero, enum/estado, booleano);
  - **unidad canónica y unidad original** del sim, con la conversión aplicada registrada. La unidad canónica se normaliza por familia (velocidad en m/s, temperatura en °C, presión en kPa, ángulo en rad…), sin pretender "SI estricto" donde no aplica (RPM, porcentajes se quedan como están, documentados);
  - convención de **signo** y sistema de coordenadas cuando aplique (ej.: volante + = derecha, lateral + = izquierda del path);
  - frecuencia real (Hz) o marca de irregular;
  - **provenance completa**: `native` | `derived`, simulador y `adapterVersion`, `sourceHash` del raw del que procede, y para derivados: algoritmo, parámetros, versión de derivación y canales de los que depende;
  - **calidad/validez**: cobertura (proporción de la sesión con datos), flags de calidad conocidos.
- Prohibido fingir resolución: interpolar no crea información (p. ej. G lateral nativa a 10 Hz se etiqueta a 10 Hz).
- **Vistas por distancia como cache derivada**: el remuestreo por distancia (necesario para comparar vueltas) es una vista/cache precomputada al cerrar cada vuelta; **nunca sustituye** los datos originales indexados por tiempo.
- **Entidades del catálogo**: `Session` (sim, circuito, coche, clase, tipo, clima, fecha, setup JSON, estado de importación, `sourceHash`), `Lap` (nº, tiempos de vuelta y sectores, validez, in/out lap, rango temporal), `Channel` (metadatos anteriores), `TrackShape` (polilínea por distancia `s` con x, y — y z cuando exista fuente — más, **por tramo**: ancho estimado *o desconocido*, cobertura y confianza de la estimación; un único `Track Edge` escalar no garantiza conocer el ancho real. Sirve al mapa 2D, al delta por distancia y a la futura malla 3D).

### 3. Motor de almacenamiento

- **DuckDB como store analítico propio de Vantare** (base separada del archivo del juego): catálogo de sesiones/vueltas + series canónicas + caches derivadas. Razones: la fuente nativa ya es DuckDB, lectura columnar parcial, SQL analítico para la capa determinista, interoperabilidad Parquet/Arrow si hiciera falta exportar.
- El DuckDB de LMU se trata como **fuente externa de solo lectura**, nunca como store canónico.
- **Riesgo aceptado y pendiente de spike**: `go-duckdb` exige CGO (hay libs estáticas para Windows amd64). Debe validarse dentro del pipeline real de build de Wails/GoReleaser **antes** de escribir código de producción. **Plan B**: un **proceso auxiliar persistente que embebe DuckDB** (binario Go aparte o wrapper) hablando con la app por el servidor HTTP local existente (`internal/server/`) — el CLI de DuckDB **no** vale como sidecar interactivo; queda relegado a importación batch y recuperación manual.

### 4. Política de importación

- **Watcher** del directorio de telemetría de LMU; se importa **al finalizar la grabación**, nunca en vivo.
- Detección de "grabación finalizada" mediante **máquina de estados**, no solo tamaño estable: debounce temporal + tamaño estacionario + **prueba de apertura/bloqueo** (intento de apertura de la copia; si el juego mantiene el archivo bloqueado o el WAL sigue creciendo, se reintenta). Estados: `detected → settling → probing → copying → importing → done | quarantined | garage`.
- **Idempotencia por fingerprint**: hash del par `.duckdb + .wal` (no por nombre de archivo). Re-ver el mismo contenido no duplica; un import interrumpido se detecta por estado y se rehace desde la copia gestionada.
- "Archivo estable" ≠ "sesión válida". El importador clasifica:
  - **OK**: importación completa.
  - **WAL huérfano**: se copia `.duckdb` + `.wal` juntos y se deja que DuckDB reproduzca el WAL sobre la copia; si el replay falla → **cuarentena** con aviso al usuario (nunca importación silenciosamente corrupta ni parcial sin marcar).
  - **Sesión de garaje** (sin vueltas válidas / Lap Dist despreciable): se cataloga como tal y se excluye de las vistas de análisis por defecto.

### 5. Canales derivados iniciales (todos con procedencia y versión)

- **`tangentialAccelerationEstimate` a 100 Hz**: derivada de `Ground Speed`/`Wheel Speed` (100 Hz nativos) con filtrado Savitzky-Golay. Nombrada como *estimación tangencial* deliberadamente: derivar la velocidad escalar **no** produce la G longitudinal real del vehículo (ignora la componente centrípeta proyectada y el filtrado suaviza picos); sus parámetros de filtrado van en la provenance. La `G Force Long` nativa (10 Hz) se conserva como canal separado. **G lateral: se mantiene nativa a 10 Hz** (derivarla a más requiere heading de alta frecuencia, solo disponible vía captura live futura).
- **Delta continuo entre vueltas** (por distancia, contra vuelta de referencia).
- **Trazado 2D** (`TrackShape`): decodificación del GPS sintético a metros + `Path Lateral`/`Track Edge` para centerline y ancho **estimado con cobertura y confianza por tramo** (ancho desconocido es un estado válido). **Elevación**: no disponible en archivo nativo; se incorporará vía captura live (`Vec3 position` del shared memory ya existente) cuando se aborde.
- **Segmentación automática en curvas** (por curvatura del trazado) como base de la vista de zonas.

## Alternativas consideradas

- **Formato binario propio + compresión Gorilla**: rechazado — complejidad prematura, mantenimiento caro, y la fuente nativa ya es columnar.
- **Parquet / Arrow IPC como store primario**: aplazado — DuckDB los habla nativamente si hicieran falta como formato de exportación/intercambio; como store añaden gestión de archivos sin aportar el catálogo SQL.
- **JSONL** (precedente en `internal/engineer/replay/`): rechazado para análisis — no escala a cientos de miles de muestras por sesión con acceso columnar.
- **Tabla ancha remuestreada a frecuencia única**: rechazado — destruye la procedencia y finge resolución.

## Consecuencias

- La sección de Telemetría gana una dependencia de peso (DuckDB vía CGO o sidecar) que exige validación en spike y aprobación explícita (política del repo sobre dependencias nuevas).
- El frontend nunca toca DuckDB: consume vueltas/canales precocinados vía el servidor HTTP local en binario (ArrayBuffer). Downsampling para overview **por tipo de canal**: continuos con **M4 (`first/min/max/last` por bucket)** y datos completos al hacer zoom; canales de estado/enum/booleanos (marcha, flags, In Pits) con **preservación de transiciones** (nunca se pierde un cambio de valor). LTTB queda descartado para telemetría analítica (oculta picos).
- Añadir un simulador nuevo = escribir un adaptador; el resto de la suite no cambia.
- El re-cálculo masivo de derivados es una operación soportada de primera clase (versionado por canal).

## Preguntas abiertas (a resolver en spikes, antes de código de producción)

1. `go-duckdb` (CGO) compila y enlaza limpio en el pipeline Windows de Wails/GoReleaser? Si no → sidecar.
2. Layout físico del store: ¿una base DuckDB única vs. catálogo + un archivo por sesión? (afecta a borrado/retención y a backups).
3. Precisión de la decodificación del GPS sintético (proyección exacta a metros) y estabilidad del centro (60°, 0°) entre circuitos y versiones de LMU.
4. Umbrales de clasificación de "sesión de garaje" y de detección de "archivo estable".
5. Retención: ¿importamos todo el histórico (3,6 GB actuales) o bajo demanda?
