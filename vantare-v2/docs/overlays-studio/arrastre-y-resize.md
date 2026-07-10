# Arrastre y resize — fluidez del canvas en Overlay Studio V3

Estado: documento de exploración + registro de implementación.  
Ámbito: `LayoutStudio` / `StudioCanvas` — mover y redimensionar widgets en el lienzo 1920×1080.  
Fuera de alcance: apariencia del widget (`WidgetStudio`), persistencia, recovery, zoom del canvas.

**Índice de la carpeta:** [README.md](./README.md)  
**Anti-regresión (obligatorio para agentes):** [canvas-drag-imperative-preview.md](./canvas-drag-imperative-preview.md)

---

## Estado actual (2026-07-10)

| Aspecto | Estado |
|---------|--------|
| Variante **B1** (DOM imperativo) | ✅ Implementada (`dc382bf`) |
| Teleport / rastro con ratón rápido | ✅ Corregido con preview imperativa |
| Fluidez percibida move | ~8.5–9/10 (estimado; sin benchmark automatizado aún) |
| Fluidez resize | ~8/10 (sigue recalculando escala intrínseca) |
| Benchmark autoiterable (§4) | Pendiente |

---

## 1. Síntoma que reportó el usuario

- Al **mover** o **redimensionar**, el widget no seguía el ratón de forma continua.
- Sensación de ~15 fps con micro-saltos.
- Con movimiento rápido del ratón, el marco del widget **iba detrás** del cursor unas milésimas de segundo.
- **Regresión posterior:** teleport al iniciar drag y **rastro visual** al mover rápido (misma clase de bug que la preview legacy antes de mover el DOM directo).

No era comportamiento intencional ni una limitación de producto; era coste de render en la implementación React.

---

## 2. Implementación actual (post-B1)

Archivos principales:

| Archivo | Rol |
|---------|-----|
| `frontend/src/hub/overlay-studio/canvas/useCanvasInteraction.ts` | Gestos, snap, preview en ref, commit al soltar |
| `frontend/src/hub/overlay-studio/canvas/canvas-frame-preview.ts` | Helpers DOM imperativos durante el gesto |
| `frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.tsx` | Marco visual; `previewActive` congela geometría React |
| `frontend/src/hub/overlay-studio/canvas/StudioCanvas.tsx` | Orquestación del viewport y widgets |
| `frontend/src/hub/overlay-studio/canvas/canvas-snap.ts` | Guías y snapping |
| `frontend/src/hub/overlay-studio/overlay-studio-v3.css` | Estilos del frame + `--interacting` |

### 2.1 Flujo actual (B1)

```
pointerdown → setPointerCapture → interactionRef (move|resize)
pointermove → applyMovePreview / applyResizePreview
           → applyStudioFrameLayoutPreview()   // DOM directo
           → interactionRef.preview (commit)
           → setState solo para guías (RAF, opcional)
pointerup   → dispatch widget/layout → idle
Escape      → resetStudioFrameLayoutPreview(start) → idle
```

`resolveLayout()` **no** devuelve preview; siempre `widget.layout` del documento.

### 2.2 Optimizaciones aplicadas (histórico + B1)

1. **Preview imperativa (B1):** posición transitoria fuera del ciclo React — fix principal teleport/rastro.
2. **`sceneRect` cacheado** al inicio del drag.
3. **`React.memo` en `StudioWidgetFrame`** y **`memo(WidgetVisualHost)`**.
4. **`previewActive`:** React no pisa `left/top/w/h` durante el gesto.
5. **`.osv3-widget-frame--interacting`:** `will-change` + `translateZ(0)`.
6. **`touch-action: none`** en `.osv3-widget-frame`.

### 2.3 Cuellos de botella que siguen

| Cuello | Impacto | Notas |
|--------|---------|-------|
| **Resize** recalcula escala intrínseca | Medio-alto | `resolveWidgetIntrinsicScale` + scaler en cada frame DOM |
| **Snap** en cada frame | Medio | `snapWidgetLayout` recorre hermanos |
| **Varios widgets** en el perfil | Bajo-medio | Guías y canvas padre siguen actualizándose |
| **Snapping intencional** | Bajo (UX) | Micro-saltos al enganchar — no es bug |
| **Re-renders de guías** | Bajo | Batching RAF solo para guías |

### 2.4 Implementación anterior (obsoleta — no restaurar)

Antes de B1, la preview pasaba por `requestAnimationFrame` + `setState(preview)` + `resolveLayout() → preview`. Eso producía ~7/10 en fluidez y regresiones de teleport/rastro. **No volver a ese patrón.** Ver [canvas-drag-imperative-preview.md](./canvas-drag-imperative-preview.md).

---

## 3. Soluciones posibles (más allá de la actual)

Ordenadas de menor a mayor esfuerzo/riesgo. **B1 ya está hecho.**

### 3.1 Nivel A — refinamiento incremental (bajo riesgo)

**A1. Memoizar guías y toolbar durante interacción**  
Evitar que `CanvasToolbar` y `PreviewSourceControls` se re-rendericen cuando solo cambian guías.

**A2. Separar “chrome” y “visual” en dos capas**  
Durante move: capa de marco barata encima del visual congelado.

**A3. Throttle de snap**  
Snap cada 2 frames o con puntero lento; snap completo en `pointerup`.

**A4. `will-change`** — parcialmente cubierto por `--interacting`.

**Estimación:** 1–2 días. Ganancia: marginal sobre B1.

---

### 3.2 Nivel B — preview imperativa

**B1. DOM directo durante el gesto** — ✅ **IMPLEMENTADO**

```
pointermove → frame.style.left/top/...   // sin setState de posición
pointerup   → dispatch(layout final) → React sincroniza
```

**B2. Capa “ghost” única** — no necesario si B1 es estable.

**B3. `transform` para move, `width/height` solo para resize** — mejora futura opcional.

---

### 3.3 Nivel C — motor fuera de React (riesgo alto)

**C1.** Módulo `canvas-interaction-engine` sin React.  
**C2.** Web Worker para snap con muchos widgets.  
**C3.** Canvas 2D para guías.

Solo si el lienzo crece mucho en complejidad.

---

### 3.4 Matriz de decisión (actualizada)

| Criterio | Pre-B1 (rAF + memo) | **B1 actual** | C: Motor puro |
|----------|----------------------|---------------|---------------|
| Fluidez move | 7/10 | **8.5–9/10** | 9.5/10 |
| Teleport/rastro | Regresión | **Corregido** | Corregido |
| Mantenibilidad | Alta | Media-alta | Baja |
| Tests | Fácil | Medio (OK) | Medio |

---

## 4. Benchmark autoiterable — diseño para un agente

Objetivo: que un agente pueda comparar variantes (A1, B3, …) con métricas objetivas.

### 4.1 Métricas propuestas

#### Latencia puntero → marco (principal)

| Métrica | Objetivo orientativo |
|---------|----------------------|
| `pointerLagMs_p50` | < 8 ms |
| `pointerLagMs_p95` | < 16 ms |
| `maxPointerLagMs` | < 33 ms |

#### Gates funcionales (obligatorios)

- Un solo `dispatch` en `pointerup`.
- `dirty === false` durante preview.
- Escape restaura layout inicial.
- Sin teleport en primer `pointermove` rápido.
- Tests `useCanvasInteraction.test.tsx` en verde.

### 4.2 Ubicación futura del harness

```
docs/overlays-studio/benchmarks/
  arrastre-y-resize.benchmark.json
  traces/move-slow.json, move-fast.json, resize-se.json
  results/baseline-YYYY-MM-DD.json
```

### 4.3 Variantes a comparar (backlog)

| ID | Descripción | Estado |
|----|-------------|--------|
| `baseline-pre-b1` | rAF + preview en React state | Obsoleto |
| **`B1`** | DOM imperativo | **Producción** |
| `A1` | Memo toolbar | Pendiente |
| `B3` | transform move + commit | Pendiente |

### 4.4 Criterio de parada del bucle agente

Score no mejora en 3 iteraciones, o `pointerLagMs_p95 < 8 ms` en traza `move-fast`.

---

## 5. Verificación manual

1. `pnpm --dir frontend exec vite --config vite.overlay-studio-harness.config.ts --host 127.0.0.1`
2. Abrir `http://127.0.0.1:5176/overlay-studio-v3-harness.html`
3. Mover lento → sin saltos visibles.
4. Mover rápido en diagonal → sin teleport ni rastro.
5. Redimensionar esquina `se`.
6. **Alt** → sin snap.
7. **Escape** → posición original.

---

## 6. Referencias en el repo

- Anti-regresión: [canvas-drag-imperative-preview.md](./canvas-drag-imperative-preview.md)
- Tests: `frontend/src/hub/overlay-studio/canvas/useCanvasInteraction.test.tsx`
- Preview legacy (patrón): `frontend/src/hub/preview/PreviewCanvas.tsx`
- Plan maestro: `docs/superpowers/plans/2026-07-10-overlay-studio-rebuild-master.md`

---

## 7. Próximo paso recomendado

1. Implementar harness mínimo §4 + traza `move-fast`.
2. Fijar baseline con B1 actual.
3. Evaluar A1 o B3 solo si el benchmark lo justifica.

---

*Última actualización: 2026-07-10. Variante B1 en producción.*