# TC-07 — Migración de Overlay Studio/Desktop/OBS

**Objetivo:** cambiar únicamente la entrada de telemetría de Overlay, preservando interacción, diseño, frecuencia y paridad de los 21 diseños Crystal y Original.

## ISA-105 / TC-07A — Proyección Overlay y shadow comparator

- Mapear proyección canónica a los ViewModels ya existentes.
- Crear comparator old/new por campo con tolerancias justificadas y reporte sanitizado.
- Ejecutar ambos pipelines solo en harness/shadow temporal.
- Cubrir Delta, Standings, Relative, Pedals y resto de tipos consumidores sin tocar renderizadores.
- No regenerar baselines para ocultar diferencias.

## ISA-106 / TC-07B — Shadow Wails/SSE en Studio, Desktop y OBS

- Conectar la proyección nueva detrás de selector interno no productivo.
- Comparar mismo frame/sequence en Wails y SSE.
- Validar reconnect, stale, missing, menú/garaje/pista y ausencia de LMU.
- Telemetría no marca documentos Studio como dirty.
- Drag/resize/canvas siguen independientes de la frecuencia de telemetría.

## ISA-107 / TC-07C — Cutover Overlay y retirada del selector

- Activar core nuevo como única fuente Overlay.
- Mantener un microcorte de rollback por revert; eliminar selector tras aprobación.
- Playwright/harness: Studio, Desktop y OBS; wide/medium/compact; Original/Crystal; mock solo harness.
- LMU real: conexión, vuelta, pits, clasificación relativa, desconexión/reconexión.
- Visual suite y benchmark sin degradación no explicada.

## Gates

```powershell
go test ./internal/telemetry/... ./internal/app/... -count=1
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend visual:overlay-studio
pnpm --dir frontend bench:overlay-studio-drag
```

- ISA-93 y su matriz 21/21 siguen siendo autoridad visual.
- `delta-crystal-ready-studio` histórico no se regenera como arreglo.
- Isaac prueba personalmente Studio/Desktop/OBS antes de continuar a Engineer.

## Stop conditions

- cambiar CSS/renderizadores/canvas para adaptar telemetría;
- background de harness se compara como parte del widget;
- comparator omite mismatches o baja thresholds;
- queda un segundo consumer productivo del servicio Overlay antiguo;
- mock aparece como connected live.
