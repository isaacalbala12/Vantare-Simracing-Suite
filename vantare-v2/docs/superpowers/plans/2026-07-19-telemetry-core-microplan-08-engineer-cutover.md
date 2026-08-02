# TC-08 — Migración y preservación de Engineer/Spotter

**Objetivo:** conservar toda la funcionalidad real de Engineer Release y sustituir únicamente su adquisición/modelo de telemetría por una proyección del core.

## ISA-108 / TC-08A — Auditoría de requirements/capabilities por monitor

- Revalidar los 30/30 directorios de `engineer-rescue-matrix.md` contra schema/proyección reales.
- Para cada monitor: inputs, unidad, freshness, historial, hechos, geometría, fallback permitido y estado sin capability.
- Clasificar KEEP/ADAPT/HARDEN/DISABLE. REPLACE/DELETE funcional vuelve a Isaac.
- Distinguir unsupported, unavailable, not-yet-observed, invalid y not-applicable.

## ISA-109 / TC-08B — Proyección Engineer y adapter puro

- Construir `EngineerProjection` desde snapshot/hechos canónicos.
- Adaptar al modelo esperado por monitores sin abrir LMU ni REST.
- Geometría Spotter conserva precisión/orientación y frame de referencia.
- El adapter no inventa datos; missing permanece missing.

## ISA-110 / TC-08C — Replay parity de monitores y eventos

- Ejecutar fixtures legacy y canónicos sobre los mismos monitores.
- Comparar avisos, prioridad, cooldowns, transitions y ausencia de spam.
- Cubrir Spotter left/right/three-wide/all-clear, flags, fuel, tyres, damage, penalties, pit, driver swaps y session end.
- Diferencias requieren clasificación y aprobación; no adaptar el golden a ciegas.

## ISA-111 / TC-08D — Separar runtime sin cambiar comportamiento

- EngineerService consume proyección/facts y deja de poseer Source/service live.
- Conservar audio/TTS, commands, notification store, Pit Manager y replay harness.
- Lifecycle/cancelación única desde composition root.
- Simulator queda solo en tests/harness y nunca conectado en producción.

## ISA-112 / TC-08E — Cutover productivo Engineer sobre LMU real

- Activar proyección canónica como única entrada.
- Validar en LMU states y sesiones largas; observar spotter con rivales reales cuando sea seguro.
- Pruebas de audio/TTS/cooldowns y desconexión.
- Eliminar selector shadow después de aprobación manual.

## Gate TC-08

- 30/30 módulos inventariados y funcionalidad preservada o explícitamente deshabilitada por falta real de dato;
- cero readers/pollers Engineer;
- replay parity aprobado;
- no warnings basados en datos sintéticos;
- Isaac prueba Engineer/Spotter y aprueba antes de retirement.

## Stop conditions

- eliminar o reescribir un monitor para facilitar la migración;
- degradar geometría Spotter sin evidencia;
- TTS/Pit Manager/comandos cambian de comportamiento fuera de alcance;
- una capability ausente se sustituye por estimación no etiquetada;
- Engineer abre LMU directa o indirectamente.
