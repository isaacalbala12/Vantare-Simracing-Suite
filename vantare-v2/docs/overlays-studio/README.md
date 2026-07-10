# Overlays Studio — documentación viva

Carpeta de referencia para agentes y desarrolladores que trabajan en **Overlay Studio V3** (`frontend/src/hub/overlay-studio/`).

Objetivo: evitar regresiones conocidas (especialmente en el canvas) y dejar decisiones de diseño en un solo sitio.

## Documentos

| Documento | Para qué sirve |
|-----------|----------------|
| [canvas-drag-imperative-preview.md](./canvas-drag-imperative-preview.md) | **Leer primero** si tocas drag/resize. Síntoma, causa, solución obligatoria y anti-patrones. |
| [arrastre-y-resize.md](./arrastre-y-resize.md) | Exploración de fluidez, alternativas (A/B/C), benchmark futuro y verificación manual. |

## Regla rápida (canvas)

Durante `pointermove` / resize en el lienzo:

- **Sí:** mover el frame con DOM imperativo (`canvas-frame-preview.ts`) y commitear solo en `pointerup`.
- **No:** pasar la posición transitoria por `setState` / `resolveLayout` → React pisa el DOM y reaparecen teleport + rastro.

Patrón de referencia en el repo legacy: `frontend/src/hub/preview/PreviewCanvas.tsx` (comentario: *"Move the DOM element directly to avoid parent re-renders"*).

## Archivos clave del canvas

| Archivo | Rol |
|---------|-----|
| `canvas/useCanvasInteraction.ts` | Gestos, snap, commit |
| `canvas/canvas-frame-preview.ts` | Helpers DOM imperativos |
| `canvas/StudioWidgetFrame.tsx` | Marco; `previewActive` congela estilos React |
| `canvas/StudioCanvas.tsx` | Orquestación |
| `canvas/useCanvasInteraction.test.tsx` | Tests de regresión |

## Verificación manual

```bash
pnpm --dir frontend exec vite --config vite.overlay-studio-harness.config.ts --host 127.0.0.1
```

Abrir `http://127.0.0.1:5176/overlay-studio-v3-harness.html` y arrastrar rápido en diagonal (sin teleport ni rastro).

## Tests

```bash
pnpm --dir frontend test -- src/hub/overlay-studio/canvas/useCanvasInteraction
```

## Contexto más amplio

- ADR rebuild: `docs/adr/0003-overlay-studio-v3-rebuild.md`
- Plan maestro: `docs/superpowers/plans/2026-07-10-overlay-studio-rebuild-master.md`
- Separación WidgetStudio / LayoutStudio: `AGENTS.md`