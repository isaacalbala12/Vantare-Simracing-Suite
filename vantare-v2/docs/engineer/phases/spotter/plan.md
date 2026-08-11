# Spotter observable — plan de fase

Estado: entrada documental preparada por ISA-313 / ENG-R01 Fase 5, pendiente de
revisión y aceptación humana. S1 aún no ha comenzado; solo después de aceptar
la Fase 5 tendrá issue, rama y replanning propios.

## Resultado

Vantare entrega un Spotter de seguridad y tráfico para LMU en español e inglés.
Una misma decisión fresca alimenta audio Kokoro preparado/cacheado y la salida
visual compartida. El piloto recibe avisos oportunos, o una degradación visible
y honesta cuando faltan señal, certeza, audio o dispositivo.

Vantare replica y mejora capacidades observables de CrewChief, no su
arquitectura, código, constantes, frases, sonidos, assets ni estructura. El
implementer trabaja solo con contratos y evidencia propios de Vantare y, cuando
corresponda, con el brief clean-room autorizado.

## Alcance

Incluye:

- ocupación lateral, tráfico cercano, clears y estados de ambos lados;
- tráfico multiclase, doblados y peligros demostrables;
- lifecycle de sesión, pérdida y recuperación de fuente;
- prioridad, cadencia, debounce, expiración, clears y cooldowns;
- reproducción, beeps o señales propias, dispositivo, hot-plug y fallback;
- sincronía de intención, locale, timing y lifecycle entre audio, radio,
  subtítulos, Desktop y OBS;
- medición separada de decisión, transporte, comienzo del player y audibilidad;
- aceptación acumulativa manual y evaluable por IA.

Quedan fuera el cambio de piloto, acciones sobre LMU, conversación libre,
wake word, otros simuladores y cualquier asset de terceros no autorizado.

## Arquitectura mínima

```text
Telemetría canónica
  -> estado Spotter
  -> mensaje y política
  -> audio Kokoro preparado/cacheado + visual compartido
```

- Telemetry Core es la única fuente de datos y calidad.
- Spotter mantiene solo el estado necesario para decidir seguridad y tráfico.
- La política gobierna prioridad, tempo, debounce, clears, cooldowns y
  expiración sin crear un framework nuevo.
- Kokoro es el único TTS de Vantare. Las alertas de seguridad usan clips
  preparados/cacheados y un camino inmediato simple. No se sintetiza en el
  hot path hasta que exista evidencia que justifique revisarlo.
- Audio y visual nacen de la misma presentación. `WidgetVisualHost` sigue
  siendo la frontera visual compartida; no se crea otro renderer.

Este plan no fija algoritmos, constantes, archivos ni abstracciones futuras.
Cada subfase decide el corte mínimo desde la Nightly vigente y se detiene si
requiere arquitectura, dependencia o alcance nuevos.

## Entrada común de cada subfase

1. Verificar Nightly, Linear, handoff, capacidades y evidencia actuales.
2. Leer este plan y la [aceptación acumulativa](acceptance.md).
3. Convertir la subfase probable en un microalcance con resultado observable,
   contratos y riesgos concretos.
4. Definir antes de editar la validación manual proporcional y la ampliación
   de la misma aceptación evaluable por IA.
5. Usar solo código, tests, contratos y evidencia permitidos por el
   [router Engineer](../../README.md).

## Subfases probables

### S1 — Autoridades y baseline confiable

- **Entrada:** vertical Nightly existente y riesgos del
  [baseline Vantare](audits/2026-08-11-vantare-baseline.md).
- **Resultado:** enable/reset, sensibilidad, locale, calidad por rival,
  secuencia y estado de salida tienen una autoridad honesta.
- **Salida:** ninguna deuda P1 de integración conocida impide ampliar Spotter.

### S2 — Núcleo lateral completo

- **Entrada:** autoridades de S1 estables y evidencia Vantare para geometría.
- **Resultado:** ocupación, transición y clear funcionan para uno o varios
  rivales sin copiar parámetros del competidor.
- **Salida:** escenarios laterales esperados y prohibidos quedan cubiertos.

### S3 — Lifecycle e inhibición LMU

- **Entrada:** señales canónicas demostrables de sesión y actividad.
- **Resultado:** pits, formación, cautiones, baja velocidad, pérdida de fuente,
  reconexión e identidad silencian y rearman sin estado obsoleto.
- **Salida:** todo silencio y rearme tiene motivo observable.

### S4 — Audio inmediato y visual compartido

- **Entrada:** núcleo seguro y contenido ES/EN propio, autorizado y aceptado.
- **Resultado:** una alerta se oye y se ve desde la misma presentación, o
  declara de forma visible por qué no puede hacerlo.
- **Salida:** cache, player, dispositivo, preempción y fallback son verificables.

### S5 — Tráfico multiclase y doblados

- **Entrada:** geometría y lifecycle estables con identidad/clase confiables.
- **Resultado:** tráfico más rápido o lento se informa con cadencia útil sin
  competir con avisos laterales de seguridad.
- **Salida:** precisión y silencio quedan demostrados con tráfico representativo.

### S6 — Peligros demostrables

- **Entrada:** señales LMU con provenance y freshness suficientes.
- **Resultado:** coche lento, detenido, accidente, bandera local o rejoin solo
  se anuncian cuando la evidencia permite afirmarlos.
- **Salida:** cada peligro queda implementado o declarado no disponible con
  razón y condición de reapertura.

### S7 — Cierre LMU/Windows

- **Entrada:** S1-S6 aceptadas y matriz acumulativa completa.
- **Resultado:** la vertical se valida en LMU y Windows con audio, dispositivo,
  visuales, reconexión, carga y tiempos observables.
- **Salida:** evidencia manual y de IA permite decidir el cierre de fase sin
  presentar capacidades condicionadas como terminadas.

## Regla de cierre

Cada subfase amplía [acceptance.md](acceptance.md); no crea otro protocolo ni
un documento por worker. Los reportes de workers son respuestas estructuradas.
La fase solo cierra cuando la aceptación acumulativa completa pasa, los límites
siguen visibles y handoff, Linear y documentos vivos reflejan el mismo estado.
