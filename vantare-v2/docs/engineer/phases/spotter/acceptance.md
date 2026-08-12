# Spotter observable — aceptación acumulativa

Estado: contrato de aceptación de la fase. S1 está en replanning técnico con
ISA-327 (cortes A/B/C); la implementación no ha comenzado hasta aprobar su
microplan.

## Propósito

Esta es la única aceptación acumulativa de Spotter. Cada subfase amplía el
mismo recorrido manual y la misma ruta evaluable por IA; no crea un protocolo,
harness o documento paralelo por worker.

Antes de S1 no se fija un comando definitivo. La primera subfase (Corte C)
crea la única ruta acumulativa S1 — `service/s1_cumulative_test.go` — sobre
`EngineerService` productivo, atraviesa las fronteras productivas aplicables
y documenta cómo descubrirla, ejecutarla y evaluar su salida; no se elige una
ruta existente ni se crea otro protocolo.

## Invariantes evaluables

- La entrada procede de Telemetry Core con identidad, freshness y capability.
- Un mismo estado Spotter origina el mensaje y todas sus salidas.
- Timings, tempo, cadencia, debounce, clears, cooldowns y expiración se prueban
  como comportamiento de producto.
- La alerta inmediata nunca espera síntesis. Usa un clip Kokoro
  preparado/cacheado cuando está autorizado y disponible.
- Audio, beep o señal, dispositivo y estado del player son observables.
- Radio, subtítulos, Desktop y OBS conservan intención, locale, prioridad, TTL
  y lifecycle; el visual usa `WidgetVisualHost`.
- Datos ausentes, stale, degradados o no soportados fallan cerrados.
- Ninguna expectativa deriva de constantes, frases, sonidos o assets de
  CrewChief.

## Cobertura clean-room acumulativa

Cada capacidad sanitizada del
[brief clean-room](../../../vantare-program/research/engineer/crewchief-clean-room-brief-2026-08-10.md)
se registra en la matriz acumulativa como `implementada`, `mejorada` o
`no disponible`. Cada fila exige evidencia propia de Vantare, escenario
esperado, escenarios prohibidos y condición de reapertura si no está
disponible. Una capacidad omitida o sustentada solo por evidencia del
competidor impide cerrar la subfase aplicable.

Cada subfase inspecciona el código, tests, fixtures, replays y documentación
que toca. El gate clean-room falla y reporta la ruta y línea exactas si detecta
referencias a rutas o líneas upstream, identificadores copiados o valores
atribuidos directamente al competidor. El finding se elimina o se rederiva con
evidencia propia antes del cierre; no se acepta como deuda posterior.

Todo fixture o replay nuevo o modificado incluye un manifiesto evaluable con:
origen propio o licenciado; simulador, build y schema; campos sanitizados; hash;
permiso de uso; y confirmación de ausencia de datos personales o secretos. La
aceptación de IA valida el manifiesto antes de incorporar el artefacto al corpus
acumulativo; un manifiesto ausente o inválido impide promoverlo.

Los resultados y gates de S1-S5 y S7 son obligatorios y no renunciables para Beta:
`no disponible` no permite cerrarlos. Solo un peligro individual de S6 puede
quedar `no disponible` cuando telemetría y capability demuestren su ausencia;
requiere evidencia propia, degradación visible y condición de reapertura. El
cambio de piloto permanece excluido y no cuenta como capacidad pendiente.

## Escenarios esperados

La matriz se incorpora de forma progresiva:

1. enable/disable y re-enable limpio sin apagar otras familias Engineer;
2. entrada, permanencia, cambio y clear a izquierda, derecha y ambos lados;
3. uno o varios rivales, sustitución de identidad y tráfico multiclase;
4. pits, formación, cautión, baja velocidad, pérdida de fuente y reconexión;
5. prioridad, preempción, cola, expiración, cache hit/miss y locale ES/EN;
6. dispositivo disponible/ausente, hot-plug, cancelación y fallback visual;
7. peligros LMU cuya señal haya sido demostrada;
8. carga y tiempos separados hasta visual, player y juicio humano audible.

Cada escenario registra entrada, estado esperado, mensaje/salida esperada,
eventos prohibidos y reason de silencio o degradación cuando aplique.

## Escenarios prohibidos

- mensaje o clear sin antecedente fresco en la misma generación;
- evento duplicado por rebote, replay, cursor regresivo o reconexión;
- geometría, clase, peligro o estado inferidos con datos insuficientes;
- audio o visual tardío después de expiración, cancelación o preempción;
- resultado `audio-only` exitoso sin clip, player o dispositivo;
- divergencia de intención o locale entre audio y visual;
- síntesis Kokoro en el hot path o uso de un segundo motor TTS;
- renderer, fuente LMU o runtime paralelo;
- frases, sonidos, assets, constantes o estructura del competidor;
- presentar una simulación, ACK de transporte o fallback como audibilidad real.

## Evidencia mínima por subfase

### Manual

- entorno y versión exactos;
- guion breve reproducible y escenarios recorridos;
- salida observada en superficies y, cuando aplique, audio/dispositivo reales;
- juicio humano explícito para audibilidad o contenido;
- fallos, limitaciones y capabilities no disponibles sin maquillarlos.

S4 y S7 no pueden cerrar sin prueba humana ES/EN de audio Kokoro autorizado en
un dispositivo real. La evidencia incluye timing hasta comienzo del player,
juicio de audibilidad y paridad con la salida visual compartida. Si licencia,
pack, dispositivo o entorno impiden la prueba, se registra un bloqueo explícito
y la subfase permanece abierta; el fallback visual no sustituye este gate.

### Evaluable por IA

- punto de entrada y prerrequisitos descubribles desde este documento;
- ejecución determinista o acotada sobre código y contratos productivos;
- resultado inequívoco con esperado, observado y prohibidos;
- evidencia de timings y lifecycle aplicables;
- fallo visible cuando falta una precondición;
- referencia a la evidencia humana cuando la propiedad no es automatizable.

## Ampliación por subfase

| Subfase | Ampliación mínima |
|---|---|
| S1 | autoridades, secuencia, locale, salida honesta y aislamiento; el Corte C crea `service/s1_cumulative_test.go` como única ruta acumulativa S1 sobre `EngineerService` productivo (no replayoracle) con esperado/observado/prohibidos |
| S2 | topologías laterales, identidad, clears y negativos espaciales |
| S3 | inhibición, rearme, generación, disconnect y reconnect |
| S4 | cache, audio, player, dispositivo real, prueba humana ES/EN, timing/audibilidad, preempción y paridad visual; un bloqueo explícito impide cerrar |
| S5 | clase, doblados, grupos, cadencia y prioridad informativa |
| S6 | peligros demostrables; solo un peligro sin telemetría/capability puede quedar no disponible con evidencia, degradación visible y reapertura |
| S7 | recorrido completo LMU/Windows, audio Kokoro autorizado ES/EN en dispositivo real, timing/audibilidad humana, paridad visual, carga y regresión; un bloqueo explícito impide cerrar |

## Cierre

Una subfase no cierra si solo existe evidencia manual o solo automatizada. La
fase completa exige repetir la matriz acumulativa, resolver findings
bloqueantes y registrar límites, SHA, entorno y resultados en el handoff vivo.
