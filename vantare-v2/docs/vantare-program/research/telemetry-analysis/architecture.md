# Arquitectura propuesta — Analysis sobre Telemetry Core

Estado: propuesta en review. No crea un segundo reader LMU ni altera el Core.
Requiere recording/replay/histórico versionado de TC-05/06 y el contrato de
producto trazado en esta investigación.

```text
original externo / recording Vantare
        │  discovery (metadata, consentimiento)
        ▼
Import adapter ──► immutable raw copy o reference local
        │                 │
        ▼                 ▼
validar + parsear      puerto de índice/biblioteca local
        │                 │
        ▼                 ▼
normalizar ──────► SessionCanonical vN + manifest + quality/provenance
        │                         │
        ├──► cache de pirámides/segmentos/trazas derivadas versionadas
        │                         │
        ▼                         ▼
Comparador determinista ◄──── selección de dos vueltas primarias
        │
        ├──► oportunidades / tarjetas (regla + evidencia + confianza)
        ├──► ViewModel de resumen y workspace
        └──► CSV / paquete Vantare preparado para revisión
```

## Fronteras y responsabilidades

| Componente | Posee | No posee |
|---|---|---|
| Telemetry Core | captura live, calidad, tiempo, fusión, capabilities, recording/replay contract | UI Analysis, consejo, almacenamiento de biblioteca |
| Discovery | metadatos, deduplicación por hash, elecciones del usuario | contenido del archivo antes de permiso/parser |
| Import adapter | lectura de un formato concreto y errores tipados | reglas de producto o contexto global |
| Normalizador | unidades, presencia, source/provenance, versión canónica | inventar una unidad/rango o corregir raw |
| Índice/biblioteca | manifiestos, búsquedas, referencias y estado de copia opcional | sincronización remota automática |
| Cache | artefactos reproducibles derivados de `(session, parser, normalizer, algorithm)` | sustituir raw o ocultar versión |
| Comparador | alineación, elegibilidad, delta, estadísticas y teoría etiquetada | lectura live, causalidad setup, LLM |
| Recomendador | reglas puras versionadas, evidencia y confianza | texto de autoridad sin inputs |
| UI | selección, visualización, notas/exportación | acceso directo a filesystem/LMU/DB |

El adapter DuckDB de LMU histórico no vive en `internal/telemetry`: ADR 0004 y el guard de imports prohíben `database/sql` y drivers DuckDB en Core/recording. Debe ser un adapter de infraestructura/producto fuera del Core, cableado desde composition root hacia puertos de importación/normalización. La ref `codex/strategy-product-a@b9f193720b80484150691512a3fb1e09da9db41f` no aporta código DuckDB recuperable; solo sirve como antecedente aislado de Strategy, no como dependencia de diseño.

## Modelo mínimo propuesto

`SessionManifest` identifica fuente, hash, sim/track/vehicle normalizados, parser y estado. `Lap` conserva validez, motivo de descarte, tiempos/sectores observados y muestras por distancia/tiempo. `ChannelDescriptor` contiene ID estable, unidad, rango solo si demostrado, categoría, source y quality. `Comparison` conserva IDs de A/B, elegibilidad, alineador/version, intervalos, resultados y warnings. `Finding` contiene `ruleID@version`, severidad, confianza, evidenceRefs, acción y limitaciones. `Annotation` se asocia a IDs/intervalos pero nunca modifica raw.

Para el DuckDB histórico LMU observado, el adapter usa catálogo por sesión (`channelsList`, `eventsList`, `metadata`), no un esquema Go fijo. `ChannelDescriptor` añade `samplingKind` (`continuous-implicit-frequency`, `discrete-timestamped`, `event-timestamped`), `declaredFrequency`, `timeOrigin`, `sourceTable` y `schemaFingerprint`. Las continuas generan su eje desde frecuencia declarada conservando ese hecho en provenance; discreto/evento conserva `ts` observado. Las consultas son por proyección de canales, rango y lote; nunca un join de todas las tablas del archivo. Una mezcla de frecuencias solo se resamplea mediante algoritmo/version explícitos y con resultado quality-aware.

El corpus COTA observado distribuye 56 canales entre 1, 2, 5, 7, 10, 20, 50 y 100 Hz (4, 2, 1, 2, 14, 3, 10 y 20 respectivamente). El cache debe por ello ser columnar y por canal/rango, con pirámides de resolución de lectura para gráfico y un cache de alineación materializado solo para el conjunto seleccionado. La referencia de distancia no se calcula desde una frecuencia “típica”: exige una señal de progreso demostrada y, si mezcla series, conserva tasa/origen y algoritmo de resampling en el resultado. Los presupuestos se medirán sobre esta distribución y archivos mayores, no se extrapolarán desde fixture pequeña.

La clave de cache incorpora hashes de input y versiones: `normalizer@N`, `alignment@N`, `curve-detector@N`, `finding-rules@N`. Toda invalidación es determinista; un cache corrupto se descarta y recalcula. No hay modelo de “workspace global mutable”: un preset contiene selección y layout, no datos duplicados.

## Comparación por distancia y degradación

El alineador convierte muestras válidas a progreso de vuelta monotónico y después interpola de manera explícita a una malla común. Rechaza vuelta con progreso no monotónico, longitud incompatible, calidad insuficiente o discontinuidad no explicada. Solo dos vueltas alimentan el delta principal; hasta dos adicionales se renderizan como trazas sin cambiar la referencia. La teoría toma mejores intervalos elegibles y deja el algoritmo/version a la vista.

Hasta que LMU demuestre progreso/longitud/posición, el sistema no ejecuta este alineador sobre LMU. Puede indexar, mostrar metadatos, validar parser y presentar “distancia pendiente”; no calcula una alternativa silenciosa por tiempo como si fuese el mismo resultado.

## Rendimiento, almacenamiento y seguridad

Importar y normalizar se ejecuta fuera del hilo de UI con cancelación y progreso. Las vistas leen cache precomputado/paginas, no el raw completo. El presupuesto inicial se define en TA-03 con corpus y benchmark antes de prometer frecuencia, tamaño o tiempo de carga. El original es read-only; la copia opcional usa escritura atómica, hash y rollback. La tecnología concreta del índice queda deliberadamente abierta: TA-03 debe elegirla mediante evidencia de corpus, rendimiento y mantenimiento, y cualquier dependencia nueva requiere su issue y aprobación explícitas.

Para LMU histórico DuckDB, discovery trata la presencia de `.duckdb.wal` como escritura activa y no abre la sesión. Solo después de observar ausencia de WAL y estabilidad de tamaño/mtime durante una ventana definida puede crear una copia estable o usar una conexión read-only demostrada. Vantare jamás lee el WAL en curso ni solicita o fuerza un checkpoint sobre la biblioteca del usuario. Los diagnósticos no contienen rutas, bytes raw, nombres personales ni payloads. Exportar prepara un artefacto temporal revisionable y nunca incluye PII por defecto.

## Algoritmos iniciales permitidos

1. selección de vueltas compatibles;
2. alineación por distancia **solo con contrato demostrado**;
3. delta acumulado por intervalo;
4. detectores simples y versionados de zona: diferencia de punto de freno, fase de gas, velocidad mínima, velocidad de salida y marcha;
5. ranking por tiempo explicable, cobertura de evidencia y confianza.

No están permitidos: fórmulas ingresadas por usuario, puntuación opaca, regresión que afirme causalidad de setup, imputación de missing, ni LLM que produzca reglas.
