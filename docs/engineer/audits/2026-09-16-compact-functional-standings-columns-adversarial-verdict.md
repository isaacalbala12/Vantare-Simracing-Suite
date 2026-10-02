# Adversarial verdict

**Claims reviewed:** compactar todas las métricas de columnas del Standings de
Eficiencia, conservar el nombre como columna flexible, reducir el padding
horizontal y mantener el comportamiento de Signature/Broadcast.

**Scope:** `functional-standings-layout.ts`, `StandingsFunctional.tsx`,
`standings-content.ts`, los tests de geometría/render y las reglas de
`tokens.css`. Los demás cambios locales del checkout se trataron como ajenos y
no se revirtieron.

**Independent reads:** se revisaron las 11 métricas declaradas en
`STANDINGS_METRIC_IDS`, el `colgroup` real del renderer, la selección de
columnas del fixture del Workshop y el CSS que gobierna `vf-standings`.

**Evidence:**

- Vitest focalizado: 4 archivos, 68 tests, 68 pasados.
- ESLint focalizado: exit 0.
- `git diff --check`: exit 0.
- Workshop/Safari verificado en Signature, Broadcast y Study con `gap`,
  `bestLap`, `lastLap` y `pit` activos; las columnas permanecen ordenadas,
  compactas y el texto se adapta mediante ellipsis cuando el estudio es más
  estrecho.
- El test de presupuesto verifica explícitamente `position`, `driverNumber`,
  `driverName`, `vehicleClass`, `gap`, `interval`, `currentLap`, `lastLap`,
  `bestLap`, `pit` y `tireCompound`.

**Confirmed:** el cálculo de ancho y el renderer comparten la misma función;
las métricas no se ocultan ni se fusionan, el nombre sigue absorbiendo el
espacio sobrante y Signature/Broadcast mantienen sus excepciones visuales.

**Refuted / gaps:** la suite completa del frontend no queda verde por fallos
ajenos de `localStorage` (32 archivos/355 tests en el entorno actual), y el
typecheck global tropieza con cambios locales no relacionados en Delta. El
fixture del Workshop no expone las 11 métricas simultáneamente en una sola
vista; la cobertura de esas métricas es por prueba de geometría y la captura
visual cubre las combinaciones que sí expone el estudio.

**Risk:** low.

**Decision:** pass, with the environmental gaps above recorded explicitly.
