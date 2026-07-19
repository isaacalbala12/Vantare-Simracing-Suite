# ADR 0004: Telemetry Core modular basado en observaciones

## Estado

Aceptado para planificación. La implementación comienza en ISA-26 y requiere validación manual de Isaac antes de cualquier integración en `develop`.

## Fecha

2026-07-19

## Contexto

Vantare necesita que Overlay Studio/Desktop/OBS, Engineer/Spotter, Strategy Planner y una futura sección avanzada de análisis compartan telemetría sin compartir sus decisiones de producto. En LMU existen dos fuentes principales y complementarias: Shared Memory y REST local. El código integrado en `develop@f492007` conserva dos modelos y runtimes, fusión por bloques, fallbacks sintéticos, semántica de ausencia basada en valores cero y contratos internos publicados casi directamente a Wails/SSE.

El proyecto aún no es público. Se prioriza la arquitectura final, la eliminación posterior de código muerto y la posibilidad de incorporar otros simuladores sin convertir el runtime en un sistema dinámico de plugins.

## Decisión

Construir un Telemetry Core nuevo en paralelo con estas propiedades:

1. Un `DriverManager` mantiene exactamente un driver de simulador activo.
2. El driver LMU posee Shared Memory y REST local y emite lotes de observaciones tipadas.
3. Los datos raw no salen del driver salvo grabación diagnóstica explícita.
4. La autoridad se decide por campo mediante reglas versionadas de validez, frescura y precedencia; no por sustitución de bloques completos.
5. Un reducer single-writer sin I/O produce estado observado consistente.
6. Una cadena ordenada y acotada de derivaciones produce el snapshot canónico final.
7. Estado continuo y hechos ordenados usan canales distintos.
8. Los productos consumen proyecciones versionadas; nunca el snapshot canónico completo ni un driver.
9. Grabación, replay, Wails y SSE son adaptadores externos al reducer.
10. Mock, simulator y replay solo existen bajo tests o harness explícitos.

## Módulos y dirección de dependencias

```text
internal/telemetry/schema             tipos de dominio, IDs, unidades y envelopes
internal/telemetry/driver             puertos mínimos y lifecycle
internal/telemetry/drivers/lmu        Shared Memory + REST + autoridad LMU
internal/telemetry/core               reducer, sesión, tiempo, estado y hechos
internal/telemetry/derive             algoritmos canónicos ordenados
internal/telemetry/projection/*       contratos por producto
internal/telemetry/recording          puertos de grabación y replay
internal/app                          composition root y transportes
```

Reglas:

- `schema` no importa paquetes internos de producto, transporte, app o driver concreto.
- `core` no importa LMU, Engineer, Overlay, Strategy, Wails, SSE ni DuckDB.
- `drivers/lmu` no importa productos.
- `projection/*` puede leer schema/core públicos, pero no adquirir telemetría.
- los productos solo importan su proyección;
- `internal/app` es el único composition root que conoce implementaciones concretas;
- tests arquitectónicos impiden dependencias inversas.

## Modelo de datos

- Los tipos runtime son structs Go; no se usa `map[string]any` en el camino caliente.
- Los dominios se separan en identidad, sesión, vehículo, controles, ruedas, energía, pits, clasificación, clima y espacio.
- El catálogo documenta ID estable, unidad, dominio, presencia, fuentes y política de calidad. Los IDs nunca se reutilizan.
- `0`, `false` y cadena vacía pueden ser valores legítimos. Presencia y calidad son explícitas.
- Se distinguen `observed`, `derived` y `estimated`, además de `fresh`, `stale`, `missing` e `invalid`.
- El snapshot final es inmutable por ownership; ningún slice/map mutable se comparte con consumidores.

## Tiempo, identidad y secuencia

Cada lote conserva:

- tiempo de la fuente cuando exista;
- UTC de recepción;
- edad monotónica interna no serializada;
- epoch del core y secuencia monotónica.

`SessionCoordinator` mantiene identidades separadas de evento, sesión, vehículo, equipo y piloto. Cambiar de fuente o variar el número de participantes no crea por sí mismo una sesión nueva.

## Estado y hechos

- Snapshots: latest-wins, adecuados para valores continuos.
- Hechos: ordenados y no descartables silenciosamente, por ejemplo vuelta completada, cambio de piloto, entrada a boxes o pérdida de conexión.
- Todo consumidor recibe primero un snapshot completo. Un salto de secuencia exige resincronización; los diffs son solo una optimización.

## Política de grabación

El directo tiene prioridad. La grabación usa una cola limitada y escritura por lotes. Si el almacenamiento no puede mantener el ritmo, la grabación se detiene, queda marcada como incompleta y el usuario recibe un aviso. Nunca bloquea el reducer ni pierde muestras silenciosamente. DuckDB queda detrás de un puerto y necesita auditoría/benchmark antes de ser elegido de forma irreversible.

## Alternativas descartadas

### Mantener y ampliar los dos pipelines actuales

Descartado: conserva modelos, lifecycle, parsers y fallbacks divergentes.

### Bus dinámico de señales o plugins cargables

Descartado: aumenta complejidad, errores en runtime y coste de depuración sin un segundo simulador real.

### Snapshot universal consumido directamente por todos

Descartado: crea un God Object y acopla productos a cada cambio canónico.

### Event sourcing completo

Descartado: Vantare necesita replay y hechos ordenados, no reconstruir todo el producto desde un log transaccional universal.

### Reescritura destructiva inmediata

Descartado: impide shadow comparison y dificulta demostrar que Overlay y Engineer conservan funcionalidad.

## Consecuencias

- Habrá una etapa temporal con pipeline nuevo y antiguo, limitada a shadow validation.
- El plan requiere más cortes iniciales, pero reduce el riesgo de romper todos los productos al cambiar una fuente.
- Las proyecciones se convierten en contratos públicos internos versionados.
- Engineer conserva su lógica y solo sustituye adquisición/modelo de entrada.
- El código viejo se elimina únicamente después de consumidores cero y aprobación de Isaac.

## Validación obligatoria

- tests de dependencias/imports;
- table tests y fuzzing de parsers/fusión;
- `go test -race` en entorno compatible;
- tests de mutación/inmutabilidad;
- benchmarks y soak con parrilla grande;
- replay raw, canónico e histórico;
- fallos de Shared Memory, REST, disco y consumidores lentos;
- pruebas reales LMU en menú, garaje, pista, boxes, cambio de sesión y endurance;
- Playwright y paridad visual para Overlay;
- replay parity y prueba manual para Engineer/Spotter.

## Riesgo residual

La arquitectura no puede considerarse completamente validada hasta capturar telemetría real de LMU en los estados anteriores. Cambios del simulador podrán exigir extensiones compatibles del driver, pero no deben alterar productos ni el core.
