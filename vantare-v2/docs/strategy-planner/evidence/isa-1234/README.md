# Evidencia ISA-1234 — T02f3b custodia recorded de servicios y formación

## Alcance

- El borrador recorded v1 acepta servicios explícitos de parada y tiempo de
  formación como datos opcionales.
- El parser existente comprueba la forma completa, números finitos y el modo de
  servicio; la factibilidad continúa siendo autoridad de Go.
- El adaptador conserva ausencia y cero y clona los servicios al crear el evento.
- `createRecordedWizardDraft()` y la versión persistida permanecen intactos.

## Decisión mínima

Tres cambios productivos dentro de los modelos, parser y adaptador existentes.
No se añade validador, versión, migración, estado de presencia ni cálculo
TypeScript. Astra high confirmó que éste es el corte mínimo correcto.

## Pruebas

- RED: nueve fallos demostraron falta de validación y transporte.
- Round-trip de servicios completos y formación cero, sin compartir objeto.
- Borrador legacy idéntico y ausencia de campos conservada.
- Formas incompletas, null, tipos incorrectos, infinito y modo inválido rechazados.
- Focales recorded: 48/48 PASS.
- Suite frontend completa: 448 archivos y 3806 tests PASS. Happy DOM imprimió
  el `AbortError` heredado y el proceso terminó correctamente con código cero.
- Typecheck, ESLint focal, lint completo y build web: PASS.
- El build conserva el aviso heredado de chunks mayores de 500 kB.
- Roadmap regenerado y estable: digest 23/23, Discord 64/64 y contrato 21/21.
- Astra high: sin P0/P1/P2 y sin código productivo que eliminar.

## Límites

Sin UI, nueva versión/migración, cálculo TypeScript, cambios Go/solver, perfiles,
estados finales, app/Wails/LMU, DuckDB, push, PR, CI remota, integración o
release. T02g continúa con perfiles antes de optimizar.
