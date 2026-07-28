# ENG-01 — auditoría clean-room de Engineer & Spotter

Estado: **investigación canónica en revisión técnica**
Issue: ISA-123
Base auditada: `67e263392b2192ee11f2ef4ccb161331dda3c735`
Fecha de corte: 2026-07-27

## Resultado

La base actual no es una implementación beta segura de Engineer & Spotter. Hay
algoritmos, fixtures y conceptos reutilizables, pero la ruta de producto arranca
con una fuente sintética presentada como conectada, no recibe la proyección de
Telemetry Core, no tiene dueño único ni preempción de audio y no implementa el
contrato transaccional del Pit Manager.

El camino recomendado es **caracterizar antes de migrar**, construir una
proyección tipada desde Telemetry Core y sustituir la composición y el
scheduler. No se recomienda ampliar el servicio legacy ni copiar código,
sonidos, frases o interfaz de CrewChief o DRE.

## Decisiones propuestas

1. Telemetry Core será la única fuente de verdad. Engineer consumirá una
   `EngineerProjection` tipada con presencia, frescura, procedencia y
   capacidades; no leerá memoria compartida ni REST de LMU en paralelo.
2. Spotter tendrá prioridad absoluta y audio crítico pre-renderizado. Un único
   dueño de audio soportará cancelación y preempción real.
3. La ruta crítica será determinista y basada en código. Ningún LLM decidirá
   hechos, prioridad, seguridad, pit, estrategia o comandos.
4. Pit Manager será una transacción
   preparar → explicar → confirmar → enviar una vez → verificar. Cualquier
   ambigüedad, dato obsoleto o falta de capacidad terminará cerrado en fallo.
5. PTT será el primer acceso de voz. Wake word multilingüe entra en beta solo
   después de superar licencia, ruido real, falsos positivos y recuperación.
6. UI, subtítulos e historial reflejarán audio realmente iniciado y capacidades
   reales. Nunca mostrarán un simulador como conexión viva.
7. La paridad avanzada relevante, Pit Manager seguro y wake word endurecida son
   parte de beta; no se aplazan silenciosamente a una fase posterior.

## Paquete

- [Fuentes y licencias](sources-and-licensing.md)
- [Auditoría del estado actual](current-state-audit.md)
- [Matriz de paridad y alcance](parity-and-scope-matrix.md)
- [Arquitectura y contratos propuestos](architecture-and-contracts.md)
- [Microcortes beta y gates](beta-microcuts-and-gates.md)
- [Referencia HTML interactiva](reference-ui.html)

## Límites de esta entrega

- Es documentación y una referencia visual estática; no cambia código de
  producto ni configura dependencias.
- La investigación externa describe capacidades observables y conceptos. No
  concede derecho a reutilizar código, modelos, voces, sonidos, textos ni
  activos.
- Las afirmaciones sobre rendimiento, calidad de voz y comportamiento real de
  LMU permanecen no verificadas hasta ejecutar bancos y sesiones controladas en
  el hardware objetivo.
- La arquitectura queda como propuesta. Tras cerrar el review técnico debe
  promoverse a una ADR numerada antes del primer microcorte de implementación.
  La aprobación de Isaac se reserva para la promoción posterior a `nightly`.

## Veredicto

**NO-GO para tratar el runtime actual como beta. GO para iniciar la secuencia
ENG-02…ENG-17, empezando por contratos, capacidades y caracterización.**
