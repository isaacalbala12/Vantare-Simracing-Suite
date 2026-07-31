# Hallazgos técnicos LMU y del repositorio

Fecha: 2026-07-27. La auditoría del worker fue exclusivamente de repositorio y no leyó contenido de `UserData`, `.env`, secretos ni telemetría personal. Separadamente, el agente root inspeccionó en modo read-only una única sesión COTA ya completada y documentó solo su esquema y distribución agregada; no abrió la sesión live ni alteró archivos. Las rutas, tamaños y semánticas restantes se reproducen desde los archivos enlazados.

## Lo que el Core ya demuestra

Telemetry Analysis no puede abrir readers LMU. El contrato de proyecto sitúa la consulta histórica/avanzada detrás de persistencia derivada versionada y mantiene la adquisición, fusión, calidad, tiempo y capabilities en Telemetry Core ([fronteras](../../../telemetry-core/README.md)). El driver LMU posee Shared Memory y REST local, y usa presencia/freshness/provenance por campo; ausencia no se transforma en cero ([driver Shared Memory](../../../telemetry-core/lmu-shared-memory-driver.md), [REST](../../../telemetry-core/lmu-rest-driver.md)).

La auditoría raw documenta un único mapping `LMU_Data` de 324.820 bytes, dos mappings auxiliares y REST local. Los parsers público y Engineer comparten el buffer principal, pero aún divergen; eso es deuda bajo caracterización, no permiso para que Analysis reutilice lectores legacy. La captura de menú/pista se sanitiza por lista blanca; boxes y garaje faltan como fixtures reales ([auditoría](../../../telemetry-core/lmu-raw-acquisition-audit.md)).

## Inventario de canales disponibles y calidad

El [catálogo generado](../../../telemetry-core/signal-catalog.md) registra 24 IDs estables. La siguiente taxonomía no inventa unidades/rangos: “unknown” y “unsupported” son estados reales del ledger.

| Grupo | Señales actuales | Uso potencial post-sesión | Estado de evidencia |
|---|---|---|---|
| Identidad | driver name | etiquetar propietario o fuente sin exponer PII por defecto | soportado, sensible |
| Sesión | tipo, vuelta, source time, track, número de vehículos | filtro, segmentación, comparación compatible | mix: count/seconds demostrados; otros sin unidad |
| Vehículo | RPM, marcha, nombre, velocidad m/s, player present | curvas de velocidad/marcha y control de elegibilidad | velocidad m/s demostrada; RPM/rangos aún desconocidos |
| Controles | throttle, brake, clutch | frenada, aplicación de gas y solapamiento | ratio `[0,1]` demostrado |
| Ruedas/energía | temperatura freno, fuel | tabla avanzada / contexto | unidad/rango parcialmente desconocidos; no habilitar consejo v1 sin validación |
| Posición/orientación | position, orientation | mapa y alineación por distancia | catalogadas pero unidad/rango/continuidad no demostrados |
| Standings/pit/weather | posición, vueltas completas, pit, in-pit, ambiente | contexto de sesión, filtros y confusores | REST o Shared Memory con freshness; semántica parcial |

Los únicos solapamientos que el Core declara semánticamente equivalentes son `session.source_time`, `session.track_name`, `session.type`, `session.vehicle_count` y `vehicle.player_present`; el resto no se debe fusionar por conveniencia. La matriz conserva cero, `false` y texto vacío presente como valores legítimos ([matriz de autoridad](../../../telemetry-core/lmu-authority-matrix.md)).

## Live frente a histórico

| Nivel | Evidencia actual | Puede alimentar Analysis | No puede afirmar |
|---|---|---|---|
| Live raw | Shared Memory/REST del driver LMU | solo mediante futura grabación consentida y versionada | que un frame aislado sea sesión histórica válida |
| Snapshot canónico | reducer + derivaciones | proyecciones con calidad/provenance | datos ausentes como valores observados |
| Derivación actual | `controls.history@1`, límite 120, síncrona y versionada | contexto acotado de controles | distancia, delta, “mejor vuelta” o teoría |
| Fixture | menú/pista sanitizados, tests | characterization y demo sanitizada si el contrato lo permite | perfil de rendimiento o sesión de usuario |
| Replay Engineer | JSONL de test/harness | solo tests/harness | importación de producto |
| Archivos LMU UserData | no hallados por el worker dentro del checkout; una sesión COTA externa completada fue inspeccionada por root en read-only | pendiente de corpus sanitizado y parser propio | soporte actual de importación |

La documentación vigente declara explícitamente que distancia de vuelta, longitud de pista, tiempo dentro de vuelta, clase y referencias demostradas aún no existen; gaps/delta permanecen `missing` ([handoff Core](../../handoffs/telemetry-core.md)). Por tanto, el contrato de UI de comparación por distancia es un objetivo condicionado a TA-04/TC-05+ y no un claim del runtime actual.

## Rutas y herramientas observadas

`internal/telemetry/drivers/lmu` contiene el driver canónico; `internal/telemetry/schema`, `catalog`, `core` y `derive` definen los contratos. `internal/telemetry/lmu` e `internal/engineer/lmu` son parsers/offsets legacy a conservar para paridad hasta su retirada aprobada. `cmd/lmu-dump` produce un CSV de depuración de lectura live, mientras que `cmd/lmu-debug`/`cmd/lmu-api-probe` son herramientas diagnósticas; ninguna es una API de importación.

El root observó el 2026-07-27 ~22:28, sin abrir ni alterar la sesión live, LMU v1.3000 con SimHub activos y `C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Telemetry` escribiendo `Circuit de Barcelona_R_2026-07-27T20_26_15Z.duckdb` junto a `.duckdb.wal`; una sesión COTA Race previa tenía aproximadamente 99,6 MB. Esto cambia el descubrimiento prioritario: LMU histórico actual es DuckDB/WAL activo, no MoTeC genérico. TA-02 debe hacer discovery metadata-only, considerar cualquier WAL presente como escritura activa, esperar su ausencia y una ventana definida de estabilidad, y demostrar una apertura read-only segura sobre copia sanitizada antes de indexar. Queda prohibido leer un WAL a medio escribir, solicitar o forzar un checkpoint, escribir la biblioteca del usuario o asumir que un `.duckdb` activo es consistente.

El root abrió después, **solo en read-only**, el archivo COTA ya completado (~99,6 MB) con DuckDB 1.5. El esquema observado es table-per-channel: `channelsList(channelName, frequency, unit)` tenía 56 filas, `eventsList(eventName, unit)` 42 y `metadata(key, value)`. Las series continuas no traen `ts`: su eje se deriva de frecuencia declarada; eventos y canales discretos sí contienen `ts`. Se observaron más de 200 tablas/columnas que abarcan input filtrado/no filtrado, velocidad/RPM/marcha, GPS/track/path, G-force, fuel/VE/SoC, aero/TC/ABS, clima/wetness, neumáticos/frenos/suspensión por rueda, flags/vueltas/pits. Es evidencia local de formato, no autorización para abrir otras sesiones ni para afirmar unidades/semántica canal por canal sin un manifest sanitizado.

La distribución de esas 56 filas fue heterogénea: 1/2/5/7/10/20/50/100 Hz tenían respectivamente 4/2/1/2/14/3/10/20 canales. Las unidades declaradas incluían 14 `%`, 12 `C`, 10 `m`, 3 `G`, 3 `deg`, 3 `m/s`, 2 `RPM`, 2 `s` y una de `L`, `Nm`, `Pa`, `kPa`, `kW`, `km/h` y sin unidad. Esta distribución es una medición del archivo COTA, no un rango universal de LMU; demuestra que el adapter no puede asumir tasa homogénea, eje común ni unidad completa para cada canal.

La consecuencia de diseño es obligatoria: el parser versionado parte de catálogo+frecuencia y lee únicamente canales solicitados; reconstruye un eje explícito con origen, frecuencia y calidad declarados para cada serie continua, y conserva `ts` observado en eventos/discretos. No ejecuta un `JOIN` global ingenuo sobre todas las tablas ni asume una frecuencia común. La alineación de dos canales exige comprobar base temporal/frecuencia, longitud, offset y calidad; si no coinciden, produce incompatibilidad explicable o resampling versionado, nunca una correlación silenciosa.

La búsqueda de nombres y extensiones no halló `UserData\\Telemetry`, parser MoTeC, importador `.ld`, `.ibt` o formato histórico de producto **dentro del checkout**. Esto no contradice la observación runtime anterior: el directorio vive en la instalación de LMU, fuera del worktree. Cualquier discovery futuro enumera sólo metadatos (ruta redacted, extensión, tamaño, mtime, WAL presente, estabilidad y hash opcional bajo consentimiento) hasta que se apruebe el parser.

## Refs históricas: Strategy y DuckDB

Auditoría read-only el 2026-07-27: `codex/strategy-product-a` resuelve a `b9f193720b80484150691512a3fb1e09da9db41f`. Esa ref contiene el motor y UI de Strategy Product A (`internal/strategy/*`, bridge/export y tests), pero `git grep` no encuentra `duckdb` en código de producción. Es **recuperable como evidencia de modelado/tDD de Strategy**, pero no como adapter histórico DuckDB ni como arquitectura final de Analysis.

El diseño histórico `develop:vantare-v2/docs/superpowers/specs/2026-07-13-strategy-planner-product-b-design.md` sí documenta DuckDB LMU como fuente offline y propone: detectar → esperar que no cambie → instantánea local → abrir solo lectura → inventariar esquema → normalizar lo mínimo. Conserva valor como antecedente de flujo seguro, pero es un spec de Product B histórico, no autoridad ejecutable actual: la autoridad vigente es el contrato/handoff de Telemetry Analysis y ADR 0004.

La evidencia actual de frontera es más fuerte: [ADR 0004](../../../adr/0004-telemetry-core-modular-observation-architecture.md) prohíbe que `core` dependa de DuckDB, y [dependency rules](../../../telemetry-core/dependency-rules.md) reserva `recording` para puertos/formatos e indica que un adapter DuckDB debe vivir **fuera** de `internal/telemetry`, conectado desde composition root. El guard [`internal/telemetry/architecture_test.go`](../../../../internal/telemetry/architecture_test.go) rechaza `database/sql`, `go-duckdb` y las bindings de DuckDB en código productivo del Core. Por tanto TA-02/03 debe diseñar un adapter histórico de producto/infraestructura fuera del Core, no añadir una DB bajo `internal/telemetry` ni reciclar Strategy A como base.

## Decisiones de auditoría

- **Conservar:** ledger de señales, quality/provenance, sanitización de fixtures y separación de driver/consumidor.
- **Endurecer:** manifest de importación con versión de parser, hash, procedencia, consentimiento y campos faltantes; fixtures reales de boxes/garaje; contrato de distancia y track geometry.
- **Rehacer:** nada en TA-01. La duplicidad parser/offsets pertenece a la cadena TC, no a Analysis.
- **Eliminar:** nada. No se borra ningún fixture ni herramienta.
- **Aplazar:** MoTeC/CSV y `UserData\\Telemetry` hasta contrato legal/técnico del formato y archivo de muestra sanitizado.

## Riesgos técnicos

Los offsets pueden mantenerse accesibles tras actualización de LMU y aun cambiar semántica; el driver opera fail-closed ante build/firma desconocida. Datos de ruedas del parser Engineer contienen placeholders y riesgos de truncamiento. REST puede ser parcial/stale y no debe “rellenar” una sesión histórica. La rama no posee recording productivo ni persistence histórica; TA-01 no lo simula.
