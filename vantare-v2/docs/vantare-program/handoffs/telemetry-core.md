# Handoff vivo — Telemetry Core

Última revisión técnica: 2026-08-11.
Estado operativo: consultar Linear y Git; este documento no elige issue, rama
ni siguiente acción.

## Resultado y fronteras

Telemetry Core es el único núcleo live, modular y neutral al simulador. El
driver LMU posee Shared Memory y REST local como fuentes complementarias.
Overlay, Engineer, Strategy y Analysis consumen proyecciones versionadas y no
abren readers propios.

## Autoridad técnica

- [ADR 0004](../../adr/0004-telemetry-core-modular-observation-architecture.md).
- [ADR 0009](../../adr/0009-historical-storage-sqlite-mcap.md).
- [Contrato Telemetry Core](../../telemetry-core/README.md).
- El microplan exacto enlazado por Linear.

## Estado técnico actual

Driver, fusión, reducer single-writer, coordinador de sesión, derivaciones y
proyecciones forman una única cadena. Estado de fuente, observaciones y hechos
son contratos separados; missing, stale y unsupported conservan semántica
explícita. Overlay y Engineer ya consumen proyecciones canónicas; replay sigue
siendo harness, no fuente productiva.

Snapshot observado el 2026-08-10: el stack final estaba promovido a Nightly y
el arreglo determinista del soak lógico se integró después sin cambiar runtime.
Ese snapshot no demuestra el canal actual; verificar `origin/nightly`, PR y CI.
La proyección live de Strategy continúa como consumidor separado y no reabre la
adquisición LMU.

## Decisiones cerradas

- Un único owner para readers LMU y lifecycle.
- Reducer single-writer y snapshots inmutables; fan-out con backpressure.
- Campos ausentes no se codifican como cero ni se inventan por fallback.
- Proyecciones por producto son versionadas y fail-closed.
- Recording histórico, replay y diagnóstico no cambian la autoridad live.
- Raw y diagnóstico se limitan, correlacionan y sanitizan antes de exportar.

## Riesgos y bloqueos

- **P1:** reintroducir un reader o modelo canónico paralelo en un consumidor.
- **P1:** confundir estado de fuente con datos usables.
- **P1:** ampliar señales Strategy sin evidencia LMU real.
- **P2:** regresiones de identidad, generación o reset entre reconexiones.
- **P2:** flakes Windows de filesystem ocultando un fallo real.

## Recomendación técnica

Resolver el corte enlazado por Linear sobre la base verificada. Para cualquier
señal nueva, capturar evidencia sanitizada, atravesar la cadena completa y
probar compatibilidad old/new antes de publicarla en una proyección.

## Evidencia

- [Gate final ISA-117](../../telemetry-core/final-gate-isa-117.md).
- [Matriz shadow Overlay](../../telemetry-core/overlay-shadow-matrix.md).
- [Cutover Engineer ISA-112](../../telemetry-core/engineer-cutover-isa-112.md).
- [Recording sink ISA-102](../../telemetry-core/recording-sink-sqlite-isa-102.md).
- [Baseline de refs](../../telemetry-core/baseline-refs.md) como snapshot histórico.

## Historial

- [Cronología completa hasta 2026-08-10](../../archive/2026-08/handoffs/telemetry-core-through-2026-08-10.md).
