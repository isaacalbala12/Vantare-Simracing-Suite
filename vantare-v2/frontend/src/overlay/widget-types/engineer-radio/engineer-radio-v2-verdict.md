# Verdicto engineer-radio — ISA-781 T3

**Fuente auditada**: `frontend/src/overlay/widget-types/engineer-radio/engineer-radio-definition.ts`

- `buildEngineerRadioViewModel(snapshot, _content, runtime)` recibe `_snapshot: TelemetrySnapshot` pero **no lo lee** (parámetro prefijado con `_`). La única entrada real es `runtime.engineerPresentation: EngineerPresentation | undefined` y `runtime.engineerSubtitlesEnabled`.
- La vista se resuelve vía `buildEngineerVisualViewModel(presentation)` (`frontend/src/engineer/engineer-visual-view-model.ts`), que formatea el `EngineerPresentation` procedente del bus de radio de ingeniería (`internal/app/engineer` / transporte de facts), no del estado canónico de telemetría (`derive.FinalState` / `ObservedState`).

**Conclusión**: engineer-radio **no depende del snapshot v1 ni del frame v2 de telemetría**. Es un consumidor del canal de Engineer (facts/presentation), separado de Overlay v2. No requiere migración ni lectura sustitutiva desde `OverlayFrameV2`. Cuando F9 borre `TelemetrySnapshot` y el adapter `overlay-projection-adapter.ts`, engineer-radio seguirá funcionando porque ya está desacoplado; su preview usa `runtime.engineerPresentation` o un fixture estático (`"Ahorra combustible..."`).

**Implicación para el cutover v2**: Ningún cambio aditivo en `FrameV2` es necesario para este widget. El widget no bloquea la retirada de v1.

**Evidencia**:
- `engineer-radio-definition.ts:23-38` — `_snapshot` ignorado, `runtime.engineerPresentation` como única fuente.
- `internal/telemetry/projection/overlayv2/cadence.go` — el regulador explícitamente no importa ni retiene facts de Engineer (ver `TestCadenceDoesNotDelayFacts`).
