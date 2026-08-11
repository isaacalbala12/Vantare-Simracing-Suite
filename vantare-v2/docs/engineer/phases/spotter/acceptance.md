# Spotter observable — aceptación acumulativa

Estado: contrato de aceptación de la fase. S1 aún no ha comenzado.

## Propósito

Esta es la única aceptación acumulativa de Spotter. Cada subfase amplía el
mismo recorrido manual y la misma ruta evaluable por IA; no crea un protocolo,
harness o documento paralelo por worker.

Antes de S1 no se fija un comando definitivo. La primera subfase elegirá la
ruta existente más pequeña que atraviese las fronteras productivas aplicables
y documentará cómo descubrirla, ejecutarla y evaluar su salida.

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
| S1 | autoridades, secuencia, locale, salida honesta y aislamiento |
| S2 | topologías laterales, identidad, clears y negativos espaciales |
| S3 | inhibición, rearme, generación, disconnect y reconnect |
| S4 | cache, audio, player, dispositivo, preempción y paridad visual |
| S5 | clase, doblados, grupos, cadencia y prioridad informativa |
| S6 | peligros demostrables y silencios por capability insuficiente |
| S7 | recorrido completo LMU/Windows, carga, tiempos y regresión |

## Cierre

Una subfase no cierra si solo existe evidencia manual o solo automatizada. La
fase completa exige repetir la matriz acumulativa, resolver findings
bloqueantes y registrar límites, SHA, entorno y resultados en el handoff vivo.
