# ISA-894 R7b/D5 — auxiliares conservados fuera de Telemetry V2

Fecha: 2026-09-05. Rama local
`vantareapp/isa-894-retirada-v1-r7b`. Base D5 `df3da0c8`.

## Resultado

`race-schedule` y `engineer-radio` se conservan como las dos únicas familias
fuera del registro productivo Telemetry V2:

- `race-schedule` recibe eventos y estado exclusivamente mediante
  `buildAuxiliaryViewModel` y el store Calendar;
- `engineer-radio` recibe exclusivamente `EngineerPresentation` mediante
  `buildAuxiliaryViewModel` y el bus de Engineer.

`WidgetVisualHost` consulta primero la autoridad V2 y, cuando no existe,
acepta únicamente una autoridad auxiliar explícita. Los dos tipos no aparecen
en `overlayV2ViewModelRegistry`; las 18 familias de telemetría sí.

No se cambia código productivo en D5. Se identifica una dependencia que E1
debe resolver antes de borrar `TelemetrySnapshot` y `mock-scenarios`: las
definitions auxiliares aún conservan firmas legacy `buildViewModel`,
`buildRuntimeViewModel` y `buildPreviewViewModel`, y sus tests usan snapshots
solo como argumento ignorado. E1 retirará esas firmas/callers sin alterar
`buildAuxiliaryViewModel` ni sus fuentes reales. E1 también retirará el
`buildPreviewViewModel` snapshot-real que Track Map conserva temporalmente.

## Evidencia

- Tests de Engineer, Calendar, Host, registro V2 y RuntimeSurface: 92/92 PASS.
- Guard D2–D5: 17/17 PASS dentro del focal D4.
- Registro: 18 entradas V2; `race-schedule` y `engineer-radio` ausentes.
- Árbol: solo esas dos definitions conservan `buildViewModel`, por decisión
  D5 y hasta la limpieza de contrato E1.
- Typecheck y build ya verdes sobre el mismo SHA D4; D5 no modifica código.

## Estado

APROBADO por review adversarial read-only
`ses_f902344d8ffefwjrSlff0BTYTs`: P0/P1/P2 = 0; P3 = 2 informativos, ya
asignados a E1/F1 (preview Track Map y comando exacto del focal). Sin push,
PR, merge, promoción, release, apps ni LMU.
