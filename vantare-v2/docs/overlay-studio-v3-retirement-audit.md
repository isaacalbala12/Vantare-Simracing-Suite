# Overlay Studio V3 — retirement audit (Fase 8.7)

Fecha: 2026-07-11  
Rama: `refactor`  
Commits retirement: `888ebda` (8.7A) … `d44cc12` (8.7F); cierre documental 8.7G en el commit de esta auditoría.

## Objetivo

Verificar que V3 es el único camino de producción para editor, preview de perfiles, runtime Desktop/OBS y diseños de usuario; retirar duplicados legacy con evidencia de cero consumidores.

## Búsqueda de consumidores (2026-07-11)

Patrones auditados en `frontend/src/**/*.{ts,tsx}`:

| Patrón | Resultado |
|--------|-----------|
| `LayoutStudio`, `useOverlayStudioState`, `WidgetSettingsPanel` | Sin matches en producción (solo roadmap i18n histórico) |
| `PreviewCanvas`, `PreviewInspector`, `hub/preview` | Carpeta eliminada |
| `WidgetRenderer`, `WIDGET_COMPONENTS`, `shared-widget-map`, `WidgetHost`, `EditOverlayApp` | Eliminados |
| `widget-catalog`, `widget-variants`, `widget-presets`, `WidgetPresetSection`, `WidgetVariantManager` | Eliminados |
| `widget-design-gallery`, `WidgetDesignGallery` | Eliminados (8.7E) |
| `preset:*` (frontend) | Sin matches |
| `preset:*` (Go handlers) | Eliminados `PresetService` (8.7F) |

Únicos matches residuales aceptados:

- `WidgetRendererProps` — tipo V3 en `overlay/core/design-system-definition.ts` (no es el renderer legacy).
- `roadmap.next.phase.r4.title` — texto histórico de roadmap en locales.

## Microcortes ejecutados

| Microcorte | Commit | Qué se retiró |
|------------|--------|----------------|
| 8.7A | `888ebda` | Editor legacy `hub/overlays` (34 archivos); conservados perfiles/OBS/community |
| 8.7B | `4d42087` | `PreviewPage`, `WidgetsPage`, módulos preview legacy |
| 8.7C | `e4e558d` | `EditOverlayApp`, `WidgetEditFrame`, `shared-widget-map`, `WidgetHost`, ruta `/overlay/edit` |
| 8.7D | `9d43657` | `WidgetRenderer`, `PreviewWidgetFrame`, `overlay/widgets/*Widget.tsx`, `StartEditOverlay` Go; miniaturas → V3 |
| 8.7E | `fcd5778` | `widget-design-gallery`, presets/variants frontend |
| 8.7F | `d44cc12` | `PresetService` Go + handlers `preset:*` |
| 8.7G | (este doc) | Auditoría + inventario vivo actualizado |

## Archivos retenidos (justificación)

| Artefacto | Motivo |
|-----------|--------|
| `hub/overlays/OwnProfilesView`, `RecommendedProfilesView`, `ProfilePreview`, OBS/community | Hub V3 sigue usándolos |
| `lib/widget-factory.ts` | `builtin-systems.ts` (registry Hub) aún depende de `WIDGET_TYPES` |
| `overlay/widgets/widget-design-system.ts` | Bridge tokens para `hub/registry` (no galería legacy) |
| `overlay/widgets/widget-preview-fixtures.ts` | Fixtures deterministas V3 + helper legacy `applyCanonicalPreviewOverrides` (solo tests) |
| `internal/app/profile_service.go` | Runtime overlay display-mode / JSON legacy decode (ADR: conservar migración Go) |
| `WidgetDesignService` migración `widget-presets.json` | One-shot en memoria para usuarios con presets antiguos |

## Reemplazos V3

| Legacy | V3 |
|--------|-----|
| Editor dual Widget/Layout | `hub/overlay-studio/OverlayStudioV3` |
| Preview perfiles | `ProfilePreview` + `WidgetVisualHost` + `previewDocument` |
| Desktop/OBS widgets | `DesktopOverlayRuntime`, `ObsOverlayRuntime` |
| Diseños oficiales | `overlay/design-systems/official-designs.ts` |
| Diseños usuario | `widget-design-client.ts` + `WidgetDesignService` |
| Persistencia perfil | `StudioProfileService` + `studio:profile:*` |

## Gates retirement (2026-07-11)

```text
pnpm --dir frontend test     → 207 files / 1561 PASS (1 flaky preexistente bajo carga paralela)
pnpm --dir frontend build    → PASS
pnpm --dir frontend visual:overlay-studio → 59 baselines 0.000% delta + parity + studio QA
go test ./internal/app/... ./cmd/vantare/... → PASS
```

Flaky documentado: `useCanvasInteraction.test.tsx` > `keeps imperative preview when telemetry publishes during drag` — pasa en ejecución aislada; interacción con paralelismo Vitest/happy-dom.

## Smoke manual

Usuario validó Wails Desktop tras 8.7D: **PASS** (miniaturas + studio).