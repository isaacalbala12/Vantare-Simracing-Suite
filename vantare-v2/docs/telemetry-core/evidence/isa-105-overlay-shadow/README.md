# ISA-105 / TC-07A — evidencia Overlay Shadow

Evidencia reproducible del harness diagnóstico no productivo de ISA-105.
No demuestra conexión live, cutover, paridad visual, renderer, Studio, Desktop
ni OBS. Los datos proceden exclusivamente de fixtures locales sanitizadas.

## Contenido

- `coverage.json`: inventario derivado en runtime de
  `widgetTypeRegistry` y `OVERLAY_SHADOW_POLICIES`. Debe conservar 18
  definiciones registradas y 18 políticas cubiertas.
- `report.json`: salida directa de `compareOverlayShadow` para el escenario
  fijo `partial`, después de aplicar las reglas reales del comparator y su
  sanitización. Incluye Pedals y Standings; no es un resumen escrito a mano.
- `screenshots/*.png`: capturas wide, medium y compact del mismo escenario
  `partial`.
- `screenshots/index.json`: viewport, escenario y SHA-256 de cada PNG.

`coverage.json` prueba que el inventario cubre los 18 tipos registrados. No
significa que los 18 tengan paridad: cada entrada conserva `exact`, `partial`,
`not-comparable` o `external` según su política real.

El reporte contabiliza todos los widgets y campos. Solo serializa hasta 64
diferencias y, por separado, hasta 64 muestras no-mismatch; una igualdad nunca
puede consumir el cupo ni ocultar una diferencia.

## Regeneración

Desde `frontend`:

```powershell
pnpm test:telemetry-overlay-shadow -- --evidence-dir ../docs/telemetry-core/evidence/isa-105-overlay-shadow
```

El runner abre únicamente
`telemetry-overlay-shadow-harness.html`, recorre los cinco escenarios, valida
consola, errores de página, overflow y DOM prohibido, captura los tres tamaños,
obtiene coverage/report mediante el módulo real del harness y cierra el puerto
antes de escribir la evidencia.

## Límites y privacidad

- No contiene payload raw, snapshots completos, nombres, equipos, IDs de
  vehículos, rutas locales ni otros datos personales.
- Los paths del reporte son aliases de contrato sanitizados, nunca rutas del
  sistema ni identificadores del payload.
- Los valores redacted permanecen redacted.
- Delta y Relative continúan sin señales suficientes y no se convierten en
  PASS mediante fixtures o tolerancias.
