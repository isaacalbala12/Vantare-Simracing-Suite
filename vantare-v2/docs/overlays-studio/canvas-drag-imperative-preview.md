# Canvas drag — preview imperativa (anti-regresión)

Estado: **implementado** (commit `dc382bf`, 2026-07-10).  
Ámbito: `LayoutStudio` / `StudioCanvas` — mover y redimensionar widgets en el lienzo 1920×1080.

---

## 1. Síntomas que NO deben volver

| Síntoma | Cuándo aparece |
|---------|----------------|
| **Teleport** | El widget salta a otra posición al empezar a arrastrar o en el primer `pointermove` rápido |
| **Rastro** | Al mover rápido queda una estela o “fantasma” del marco en posiciones anteriores |
| **Retraso** | El marco va claramente detrás del cursor (~15 fps, micro-saltos) |

Estos bugs ya ocurrieron en la **preview legacy** (`PreviewCanvas`) y se repitieron en Overlay Studio V3 cuando la posición transitoria pasó por React state.

---

## 2. Causa raíz

Durante el gesto, el flujo incorrecto era:

```
pointermove → interactionRef → requestAnimationFrame → setState(preview)
           → resolveLayout() devuelve preview
           → StudioWidgetFrame re-renderiza left/top desde props
```

Si el padre re-renderiza a la vez (telemetría, guías, selección, toolbar), React **reconcilia** el estilo del frame con el layout del documento (posición vieja) mientras el puntero ya movió el widget. Resultado: pisado del DOM, teleport y rastro visual.

La preview legacy ya documentaba la solución en código:

```119:124:frontend/src/hub/preview/PreviewCanvas.tsx
    // Move the DOM element directly to avoid parent re-renders.
    const frame = document.querySelector(`[data-testid="preview-widget-frame-${drag.widgetId}"]`) as HTMLElement | null;
    if (frame) {
      frame.style.left = `${nextPos.x}px`;
      frame.style.top = `${nextPos.y}px`;
    }
```

---

## 3. Solución obligatoria (Nivel B1)

### 3.1 Flujo correcto

```
pointerdown → setPointerCapture → interactionRef (move|resize), preview = start
pointermove → applyMovePreview / applyResizePreview
           → interactionRef.preview (solo para commit)
           → applyStudioFrameLayoutPreview(widgetId, layout)  // DOM directo, sin setState de posición
           → setState solo para guías (RAF opcional)
pointerup   → dispatch widget/layout una vez → idle
Escape / lostpointercapture → resetStudioFrameLayoutPreview(start) → idle
```

### 3.2 Contrato React vs DOM

| Fase | Quién controla `left/top/w/h` |
|------|-------------------------------|
| Idle | React (`StudioWidgetFrame` props desde `widget.layout`) |
| Gesto activo (`previewActive`) | **Cache + DOM imperativo** — React pinta geometría desde `getStudioFrameLayoutPreview`, nunca desde `widget.layout` del documento |
| Tras commit | React sincroniza desde el documento actualizado |

### 3.3 Archivos implicados

| Archivo | Responsabilidad |
|---------|-----------------|
| `canvas/canvas-frame-preview.ts` | `findStudioFrameElement`, `applyStudioFrameLayoutPreview`, `resetStudioFrameLayoutPreview` |
| `canvas/useCanvasInteraction.ts` | Gestos; `resolveLayout()` **siempre** devuelve `widget.layout`; preview solo en ref |
| `canvas/StudioWidgetFrame.tsx` | Prop `previewActive`: no aplicar geometría desde props |
| `canvas/StudioCanvas.tsx` | `previewActive={interaction.isWidgetPreviewActive(widget.id)}` |
| `overlay-studio-v3.css` | `.osv3-widget-frame--interacting` (`will-change`, `translateZ(0)`) |

---

## 4. Anti-patrones (prohibidos)

1. **Devolver `interaction.preview` desde `resolveLayout`** durante el drag — reintroduce la carrera React/DOM.
2. **Batching de posición con `requestAnimationFrame` + `setState`** — como mucho 1 frame de retraso; con re-renders del padre empeora.
3. **Re-renderizar `WidgetVisualHost` en cada frame de move** — el memo del marco ayuda, pero no sustituye preview imperativa.
4. **Mezclar `transform` de preview con `left/top` de React** sin una sola fuente de verdad durante el gesto.

---

## 5. Tests de regresión

Archivo: `frontend/src/hub/overlay-studio/canvas/useCanvasInteraction.test.tsx`

Casos que protegen este fix:

- Entrada síncrona a modo `move` en `pointerdown`
- `pointermove` actualiza `frame.style.left` sin marcar documento dirty
- Primer `pointermove` no teleporta (posición intermedia coherente)
- Un solo `dispatch` en `pointerup`
- `Escape` y `lostpointercapture` restauran geometría inicial

Ejecutar:

```bash
pnpm --dir frontend test -- src/hub/overlay-studio/canvas/useCanvasInteraction.test.tsx
```

---

## 6. Checklist manual (antes de cerrar un PR que toque el canvas)

1. Harness: `overlay-studio-v3-harness.html`
2. Arrastrar **lento** — sin saltos
3. Arrastrar **rápido** en diagonal — sin teleport ni rastro
4. Redimensionar esquina `se` — fluido aceptable
5. **Alt** — sin snap
6. **Escape** — vuelve a posición original
7. Soltar — un solo cambio en el documento (dirty una vez)

---

## 7. Si alguien propone “volver a React state para simplificar tests”

Los tests ya comprueban `frame.style.*`, que es exactamente lo que escribe la preview imperativa. No hace falta sacrificar fluidez: el commit sigue siendo un único `dispatch`; solo la **visualización transitoria** sale del ciclo React.

Para más alternativas y benchmark futuro, ver [arrastre-y-resize.md](./arrastre-y-resize.md).

---

## 8. Refuerzos anti-regresión (2026-07-10)

Si las **guías se mueven pero el widget no** (o solo teletransporta al soltar), React re-renderizó el frame con `previewActive=true` pero **sin geometría en `style`** (o con `widget.layout` viejo del documento), borrando la preview imperativa.

Causas típicas:

- `useStudioTelemetrySnapshot()` publica un snapshot **nuevo por referencia** en cada tick.
- Widgets más pesados (p. ej. Standings) aumentan re-renders del árbol.
- Actualizaciones de guías (`setInteraction` por RAF) re-renderizan el canvas.

### 8.1 Capas obligatorias (no quitar sin reemplazo equivalente)

| Capa | Archivo | Qué hace |
|------|---------|----------|
| **Cache de preview** | `canvas-frame-preview.ts` | `getStudioFrameLayoutPreview` guarda el último layout imperativo por widget |
| **Re-aplicación post-commit React** | `StudioWidgetFrame.tsx` | `useLayoutEffect` reescribe geometría si `previewActive` tras cada render |
| **Snapshot congelado** | `StudioCanvas.tsx` | Mientras `interaction.kind !== "idle"`, no pasar snapshots nuevos a los frames |
| **Tests** | `useCanvasInteraction.test.tsx` | Caso `keeps imperative preview when telemetry publishes during drag` |

### 8.2 Test de regresión extra

```bash
pnpm --dir frontend test -- canvas-frame-preview.test.ts useCanvasInteraction.test.tsx
```

### 8.3 Si vuelve a fallar

1. Confirmar que `previewActive` **no** vuelve a aplicar `left/top/w/h` desde props (sigue siendo DOM imperativo).
2. Confirmar que **no** se reintroduce `resolveLayout() → preview` en React state.
3. Revisar si un cambio nuevo pasa `snapshot` u otro prop inestable a `StudioWidgetFrame` durante el gesto.
4. Ejecutar checklist manual §6 y el test de telemetría durante drag.

---

## 9. Una sola geometría visual (2026-07-14)

El rectángulo persistido en `widget.layout` es también el frame visual en Studio, en la preview de perfiles y en runtime. No debe existir una normalización del frame derivada del contenido.

El contenido se renderiza en una capa de coordenadas canónicas común (`WidgetVisualViewport`), cuya anchura base procede de `defaultSize.width`. La escala depende únicamente de `layout.w`; la altura lógica se deriva de `layout.h / scale`. Así, un resize proporcional escala tipografía y composición completas sin modificar el frame ni depender del contenido.

Durante un gesto, `canvas-frame-preview.ts` modifica `left`, `top`, `width`, `height`, el `translate` transitorio del **frame** y la geometría de ese viewport común. No puede introducir una escala exclusiva de Studio: ProfilePreview y runtime deben usar exactamente el mismo cálculo.

Tests que protegen este contrato:

- `StudioWidgetFrame.test.tsx`: los 12 tipos registrados conservan exactamente el frame `w/h` y escalan desde una anchura canónica estable.
- `ProfilePreview.test.tsx` y `RuntimeWidgetFrame.test.tsx`: usan el mismo viewport y cálculo.
- `canvas-frame-preview.test.ts`: la capa imperativa no conoce contenido; solo frame y anchura base declarada por el viewport.

---

*Última actualización: 2026-07-14.*
