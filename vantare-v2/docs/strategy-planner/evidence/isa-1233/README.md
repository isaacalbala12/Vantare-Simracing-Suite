# Evidencia ISA-1233 — T02f3a cliente TypeScript de servicios y formación

## Alcance

- El evento TypeScript acepta el desglose de parada exacto de Go y el tiempo de
  formación opcional.
- `pitLossSeconds` permanece requerido por compatibilidad; Go lo ignora cuando
  hay servicios explícitos.
- El parser de resultados conserva `formationSeconds`, incluido cero, y no lo
  añade a respuestas anteriores.

## Decisión mínima

Se amplía el tipo y parser existentes en un único archivo de cliente. Relajar
ahora `pitLossSeconds` ampliaría el contrato y exigiría una decisión adicional
sobre el doble frontend, por lo que queda fuera de este corte. El doble sólo
acredita transporte y parsing; no replica el cálculo Go.

## Pruebas

- Petición con los cinco campos de servicios, formación y campo legacy intactos.
- Respuestas con formación 30 y cero conservadas.
- Null, texto e infinito rechazados; el golden legacy sigue sin el campo.
- `strategy-application-client.test.ts`: 60/60 PASS.
- Suite frontend completa: 448 archivos y 3796 tests PASS. Happy DOM imprimió
  el `AbortError` heredado y el proceso terminó correctamente con código cero.
- Typecheck, ESLint focal, lint completo, build web y `git diff --check`: PASS.
- El build conserva el aviso heredado de chunks mayores de 500 kB.
- Roadmap regenerado y estable: digest 23/23, Discord 64/64 y contrato 21/21.
- Astra high: sin P0/P1/P2 y sin capas adicionales recomendadas.

## Límites

Sin custodia/adaptación recorded, UI, cambios Go/solver, cálculo frontend,
app/Wails/LMU, DuckDB, push, PR, CI remota, integración o release. T02f3b amplía
el borrador existente.
