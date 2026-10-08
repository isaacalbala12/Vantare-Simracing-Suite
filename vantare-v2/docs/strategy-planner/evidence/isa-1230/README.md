# Evidencia ISA-1230 — T02e4 custodia recorded de neumáticos físicos

## Alcance

- `RecordedWizardDraft` conserva opcionalmente el inventario físico y los
  parámetros de ritmo por compuesto del contrato de cálculo.
- `parseRecordedDraftPayload` valida su forma antes de exponer un borrador
  persistido y exige que ambas partes físicas aparezcan juntas.
- `recordedCalculationEvent` clona y transporta ambos valores sin aliasing.
- Los borradores v1 anteriores, que no contienen estos campos, conservan su
  JSON y siguen siendo válidos.

## Decisión mínima

Se amplía el mismo borrador v1 y el adaptador existente. No se crea otro
documento, repositorio, normalizador ni modelo de neumáticos. El conteo de
neumáticos publicado en el calendario no se transforma en individuos.

La custodia sólo acepta la forma física canónica. Rechaza el antiguo
`remainingPercent` en este contexto porque migrarlo fabricaría origen,
condición y estado. Go mantiene la autoridad sobre factibilidad, capacidad y
compatibilidad con las demás entradas del solver.

## Pruebas

- Round-trip de inventario y ritmo explícitos, sin aliasing.
- Compatibilidad byte a byte de la forma v1 sin datos físicos.
- Rechazo de una sola mitad, IDs duplicados, máximo inválido, presencia u
  origen inválidos, confianza no canónica, curva inválida y neumático legacy.
- Transporte exacto al evento de cálculo y conservación de ceros.
- Focales: 38 PASS.
- Frontend completo: 448 archivos y 3790 tests PASS; el `AbortError` heredado
  de teardown de Happy DOM no cambió el código cero.
- Typecheck, ESLint focal/completo, build y `git diff --check`: PASS. El aviso
  de tamaño de chunks del build es heredado.
- Roadmap: 23 + 64 + 21 tests y digest `--check`: PASS.
- Astra high: sin P0/P1/P2 después de corregir confianza de proyección y
  rechazo de formas no canónicas; sin capa eliminable.

## Límites

Sin UI de inventario, inferencia LMU/DuckDB, conversión de agregados,
app/Wails/LMU, push, PR, CI remota, integración o release. T02f continúa con
servicios y formación usando los contratos existentes.
