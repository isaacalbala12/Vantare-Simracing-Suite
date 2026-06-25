# Mock Live Demo UX

## Current Flow

- **Startup source mode:**
  - `-live=true` (default): `TelemetrySourceManager.NewTelemetrySourceManager` arranca con mock, intenta conectar LMU si `useLive=true`.
  - `-live=false`: modo mock explícito para dev/testing.
  - `main.go:645` loggea source info al arranque.

- **Overlay open behavior:**
  - `main.go:601-614`: `overlay:start` llama `EnsureLiveTelemetry()` antes de abrir.
  - Si falla, loggea fallback, emite `telemetry:source-status`.
  - Luego `hubSvc.StartOverlay(target)` abre la ventana.
  - La ventana overlay usa mock fallback si live no está disponible.

- **Hub/topbar source indicator:**
  - `HubApp.tsx:29` escucha `telemetry:source-status`.
  - `HubApp.tsx:33` emite `telemetry:source-status:get` al montar.
  - `Topbar.tsx:41-47` mapea estado a labels: `Fuente pendiente`, `LMU conectado` (verde), `Esperando LMU`, `Mock`.
  - Chip compacto inline con badge de version.
  - Sin `title`, sin `aria-label`, sin tests.

- **WidgetStudio preview scenario selector:**
  - `WidgetStudio.tsx:31`: `useState<MockSessionScenario>("race")` — estado local, no persiste.
  - Solo visible cuando Standings está seleccionado.
  - `aria-pressed` ya presente en el HTML.
  - Tests existentes: mock no marca dirty (line 330), pero activo se verifica por className (lines 271, 300).

## Problems Found

- [x] **P3.1**: Topbar source chip sin `title` ni `aria-label`.
- [x] **P3.2**: No existe `Topbar.test.tsx` — riesgo de regresión.
- [x] **P3.3**: Tests de mock scenario usan className en vez de `aria-pressed`.
- [ ] **No blocking**: Label "Mock" algo ambigua pero funcional. No cambiar sin decisión de producto.

## Decisions

- Source indicator debe ser global y compacto (ya lo es).
- WidgetStudio mock scenario selector es preview-only y no debe marcar dirty (ya verificado).
- Abrir overlay debe preferir live y caer a mock con estado claro (ya implementado).
- `-live=false` es modo mock/dev explícito.

## Required Fixes

- [x] **Fix 1**: Añadir `title` y `aria-label` al chip de source en Topbar.
- [x] **Fix 2**: Crear `Topbar.test.tsx` con tests de source status.
- [x] **Fix 3**: Tests de mock scenario: usar `aria-pressed` en vez de className.

## Manual Checklist

1. Open app without LMU.
2. Confirm topbar shows mock/fallback state clearly.
3. Open overlay from `Mis perfiles`.
4. Confirm overlay opens even if LMU is unavailable.
5. Confirm status remains honest (`Mock`/fallback, not fake live).
6. Start LMU if available and reopen overlay.
7. Confirm status changes to `LMU conectado` when live source is active.
8. In WidgetStudio Standings, switch `Práctica`/`Qualy`/`Carrera`.
9. Confirm preview changes and `Guardar` does not activate from scenario switching alone.
10. Modify a real widget setting and confirm `Guardar` activates.
