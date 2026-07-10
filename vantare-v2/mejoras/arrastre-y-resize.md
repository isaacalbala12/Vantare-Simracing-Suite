# Arrastre y resize — fluidez del canvas en Overlay Studio V3

Estado: documento de exploración. No implementa cambios; recoge el estado actual (~7/10 en fluidez), alternativas futuras y un diseño de benchmark autoiterable para que un agente pueda comparar soluciones más adelante.

**Ámbito:** `LayoutStudio` / `StudioCanvas` — mover y redimensionar widgets en el lienzo 1920×1080.  
**Fuera de alcance:** apariencia del widget (`WidgetStudio`), persistencia, recovery, zoom del canvas.

---

## 1. Síntoma que reportó el usuario

- Al **mover** o **redimensionar**, el widget no seguía el ratón de forma continua.
- Sensación de ~15 fps con micro-saltos.
- Con movimiento rápido del ratón, el marco del widget **iba detrás** del cursor unas milésimas de segundo.

No era comportamiento intencional ni una limitación de producto; era coste de render en la implementación React.

---

## 2. Implementación actual (post-optimización ~7/10)

Archivos principales:

| Archivo | Rol |
|---------|-----|
| `frontend/src/hub/overlay-studio/canvas/useCanvasInteraction.ts` | Estado de interacción, pointer events, snap, commit al soltar |
| `frontend/src/hub/overlay-studio/canvas/StudioWidgetFrame.tsx` | Marco visual + `WidgetVisualHost` |
| `frontend/src/hub/overlay-studio/canvas/StudioCanvas.tsx` | Orquestación del viewport y widgets |
| `frontend/src/hub/overlay-studio/canvas/canvas-snap.ts` | Guías y snapping |
| `frontend/src/hub/overlay-studio/overlay-studio-v3.css` | Estilos del frame |

### 2.1 Flujo actual

```
pointerdown → setPointerCapture → interactionRef (move|resize)
pointermove → applyMovePreview / applyResizePreview → interactionRef
              → requestAnimationFrame → setState (máx. 1× por frame)
pointerup   → flush rAF → dispatch widget/layout → idle
```

### 2.2 Optimizaciones ya aplicadas

1. **Batching con `requestAnimationFrame`:** como mucho un `setState` por frame (~60 Hz teórico).
2. **`sceneRect` cacheado** al inicio del drag: evita `getBoundingClientRect()` en cada `pointermove`.
3. **`React.memo` en `StudioWidgetFrame`:** widgets que no se mueven no re-renderizan.
4. **`memo(WidgetVisualHost)` durante el drag:** al mover, solo cambia `left`/`top` del marco; el contenido Delta no se repinta.
5. **`touch-action: none`** en `.osv3-widget-frame`.

### 2.3 Cuellos de botella que siguen

| Cuello | Impacto | Notas |
|--------|---------|-------|
| Preview vía **React state** | Alto | Cada frame reconcilia el árbol React del canvas activo |
| **Resize** recalcula escala intrínseca | Medio-alto | `resolveWidgetIntrinsicScale` + estilos del scaler en cada frame |
| **Snap** en cada frame | Medio | `snapWidgetLayout` recorre hermanos y targets |
| **Varios widgets** en el perfil | Medio | El canvas padre y guías siguen actualizándose |
| **Snapping intencional** | Bajo (UX) | Micro-saltos al “enganchar” a grid/bordes — no es bug |
| **Escala del canvas (Fit)** | Bajo durante drag | No debería cambiar mientras arrastras; sí al cambiar zoom |

### 2.4 Por qué ~7/10 y no 10/10

La preview sigue pasando por el ciclo React → DOM. Eso es correcto arquitectónicamente (un solo camino de verdad, tests sencillos) pero **más lento** que mutar el DOM directamente o usar solo `transform` en GPU durante el gesto.

---

## 3. Soluciones posibles (más allá de la actual)

Ordenadas de menor a mayor esfuerzo/riesgo. Cada fila es independiente; se pueden combinar.

### 3.1 Nivel A — refinamiento incremental (bajo riesgo)

**A1. Memoizar guías y toolbar durante interacción**  
Evitar que `CanvasGuides`, `CanvasToolbar` y `PreviewSourceControls` se re-rendericen cuando solo cambia `interaction.preview`.

**A2. Separar “chrome” y “visual” en dos capas**  
Durante move: capa de marco (barata) encima del visual congelado (screenshot o `pointer-events: none` + sin re-render). Durante resize: actualizar solo el scaler, no el `Renderer` interno.

**A3. Throttle de snap**  
Calcular snap cada 2 frames o solo cuando la velocidad del puntero es baja; snap completo en `pointerup`. Reduce saltos de CPU; puede sentirse menos “magnético” durante el drag.

**A4. `will-change: transform` solo durante interacción**  
Clase `.osv3-widget-frame--interacting` en el widget activo. Ayuda marginal si seguimos usando `left`/`top`.

**Estimación:** 1–2 días. Ganancia esperada: 7/10 → **7.5–8/10**.

---

### 3.2 Nivel B — preview imperativa (riesgo medio, mayor ganancia)

**B1. DOM directo durante el gesto**  
En `pointermove`, escribir `element.style.transform` o `left/top/width/height` en el nodo del frame vía `ref` / `data-widget-id`. React no se entera hasta `pointerup`, donde se hace un único `dispatch`.

```
pointermove → frameRef.style.transform = translate(dx, dy)   // sin setState
pointerup   → dispatch(layout final) → React sincroniza
```

**Pros:** latencia casi igual al puntero; menos trabajo en main thread.  
**Contras:** dos fuentes de verdad temporales; hay que revertir si Escape / lostpointercapture; tests más complejos.

**B2. Capa “ghost” única**  
Un solo `div` de preview que se mueve; el widget real queda opaco/disabled hasta soltar. Simplifica B1 con un solo ref.

**B3. `transform` para move, `width/height` solo para resize**  
Mover con `translate3d` (compositor); al soltar convertir a `x/y` lógicos. Resize sigue siendo más caro pero aísla el caso peor.

**Estimación:** 3–5 días + tests de regresión. Ganancia esperada: **8.5–9/10** en move; resize ~8/10.

---

### 3.3 Nivel C — motor fuera de React (riesgo alto)

**C1. Módulo `canvas-interaction-engine` sin React**  
Clase o módulo puro que escucha pointers, mantiene preview layout, expone `subscribe(listener)` para guías. React solo monta frames y recibe commits.

**C2. Web Worker para snap**  
Offload de `snapWidgetLayout` si hay muchos widgets. Solo útil con perfiles grandes; añade latencia de postMessage si el perfil es pequeño.

**C3. Offscreen / canvas 2D para overlay de guías**  
Guías dibujadas en un canvas superpuesto en lugar de divs React.

**Estimación:** 1–2 semanas. Ganancia: **9–9.5/10** en escenarios exigentes; complejidad de mantenimiento alta.

---

### 3.4 Nivel D — alternativas de stack (solo si el canvas crece mucho)

| Opción | Cuándo tiene sentido |
|--------|----------------------|
| **@dnd-kit** con modificadores custom | Si aparecen más gestos (multi-select drag, listas) |
| **Pixi / Konva** | Si el lienzo pasa a cientos de objetos animados |
| **CSS `anchor-name` / View Transitions** | Experimental; no recomendado ahora |

Para Vantare hoy, **B1/B2** es el mejor equilibrio coste/beneficio.

---

### 3.5 Matriz de decisión rápida

| Criterio | Actual (rAF + memo) | B: DOM imperativo | C: Motor puro |
|----------|---------------------|-------------------|---------------|
| Fluidez move | 7/10 | 9/10 | 9.5/10 |
| Fluidez resize | 6.5/10 | 8/10 | 8.5/10 |
| Mantenibilidad | Alta | Media | Baja |
| Tests unitarios | Fácil | Medio | Medio |
| Alineación WidgetStudio/LayoutStudio | OK | OK (commit único) | OK |

---

## 4. Benchmark autoiterable — diseño para un agente

Objetivo: que un **modelo o pipeline de agentes** pueda implementar variantes (A1, B1, …), ejecutar el mismo benchmark y **elegir la mejor por métricas**, sin depender de percepción humana.

### 4.1 Principios

1. **Determinista en CI** donde sea posible (Playwright + trace de eventos).
2. **Métricas objetivas** con umbrales, no “se siente bien”.
3. **Misma secuencia de input** para todas las variantes (trazas de puntero grabadas).
4. **Un score compuesto** para ranking automático.
5. **Regresión:** si el score empeora > X % respecto a baseline, falla el job.

### 4.2 Métricas propuestas

#### Latencia puntero → marco (principal)

| Métrica | Definición | Objetivo orientativo |
|---------|------------|----------------------|
| `pointerLagMs_p50` | Mediana de `(timestamp frame donde cambió posición del marco) − (timestamp pointermove)` | < 8 ms |
| `pointerLagMs_p95` | Percentil 95 de la misma | < 16 ms |
| `maxPointerLagMs` | Peor caso en la traza | < 33 ms |

Cómo medir: instrumentar el frame del widget con `data-preview-x/y` o leer `getBoundingClientRect()` tras cada `requestAnimationFrame` en el test.

#### Suavidad (jitter)

| Métrica | Definición | Objetivo |
|---------|------------|----------|
| `jitterPx` | Desviación estándar de `(delta visual entre frames) − (delta puntero esperado)` | < 1 px |
| `droppedFrames` | Frames de puntero sin actualización visual correspondiente | 0 en traza lenta; < 5 % en traza rápida |

#### Rendimiento

| Métrica | Definición | Objetivo |
|---------|------------|----------|
| `longTaskCount` | `PerformanceObserver` `longtask` > 50 ms durante el gesto | 0 |
| `avgFrameTimeMs` | Media de deltas entre rAF durante drag | < 12 ms |
| `p95FrameTimeMs` | Percentil 95 | < 16 ms |

#### Resize (subconjunto)

| Métrica | Definición |
|---------|------------|
| `resizeLagMs_p95` | Igual que pointer lag pero en handle `se` |
| `aspectLockDrift` | Error máximo vs ratio esperado durante resize locked |

#### Corrección funcional (gates, no optimizar)

- Un solo `dispatch` en `pointerup`.
- `dirty === false` durante preview.
- Escape restaura layout inicial.
- Snap con y sin Alt según `useCanvasInteraction.test.tsx`.

Si falla un gate, la variante se **descarta** aunque tenga buen score de fluidez.

### 4.3 Score compuesto (ejemplo)

```
score = 100
  - 2.0 * pointerLagMs_p95
  - 1.0 * avgFrameTimeMs
  - 5.0 * droppedFramesPct
  - 10.0 * longTaskCount
  - 3.0 * jitterPx
```

Normalizar por traza. El agente **maximiza `score`**. Pesos ajustables en `mejoras/arrastre-y-resize.benchmark.json`.

### 4.4 Arquitectura del harness

```
mejoras/
  arrastre-y-resize.md          ← este documento
  benchmarks/
    arrastre-y-resize.benchmark.json   ← pesos, umbrales, trazas
    traces/
      move-slow.json            ← [{t, clientX, clientY}, ...]
      move-fast.json
      resize-se.json
    results/
      baseline-2026-07-10.json  ← salida por variante
```

```
frontend/e2e/overlay-studio/
  drag-fluidity.bench.ts        ← Playwright + CDP Performance
  drag-fluidity.collect.ts      ← escribe métricas a results/
```

**Flujo de ejecución:**

1. Levantar harness: `overlay-studio-v3-harness.html` (ya existe en el repo).
2. Cargar perfil fixture con 1 widget Delta + opcional perfil “stress” con N widgets.
3. Reproducir traza: `page.dispatchEvent` o `page.mouse.move` con timestamps de la traza.
4. En paralelo, en `page.evaluate`:
   - Listener `pointermove` → push a `window.__dragBench.pointerEvents`
   - rAF loop → push `getBoundingClientRect()` del frame activo a `window.__dragBench.frameSamples`
5. Al terminar, calcular métricas en Node y escribir JSON.
6. Comparar con `baseline` y con otras variantes en `results/`.

### 4.5 Bucle autoiterable para un agente

Pseudoflujo para un agente (Orch, Paseo, o sesión manual con skill):

```text
1. Leer mejoras/arrastre-y-resize.md + baseline score
2. Elegir hipótesis (ej. "implementar B1 DOM imperativo solo en move")
3. Crear rama feat/canvas-drag-B1
4. Implementar cambio mínimo
5. Ejecutar:
     pnpm --dir frontend test -- useCanvasInteraction
     pnpm --dir frontend e2e -- drag-fluidity.bench.ts
6. Si gates OK y score > baseline + margen:
     marcar candidata; opcional commit
   Si no:
     revertir o iterar
7. Documentar en results/ VARIANT.md (qué cambió, score, tradeoffs)
8. Repetir con siguiente hipótesis de la sección 3
```

**Criterio de parada:** score no mejora en 3 iteraciones consecutivas, o se alcanza `pointerLagMs_p95 < 8 ms` en traza `move-fast`.

### 4.6 Trazas de puntero (formato)

```json
{
  "name": "move-fast",
  "sceneScale": 0.5,
  "steps": [
    { "type": "pointerdown", "t": 0, "x": 120, "y": 120, "widget": "delta-main" },
    { "type": "pointermove", "t": 16, "x": 125, "y": 120 },
    { "type": "pointermove", "t": 32, "x": 140, "y": 122 },
    { "type": "pointerup", "t": 200, "x": 400, "y": 180 }
  ]
}
```

`t` en ms desde el inicio. Las trazas se pueden **grabar una vez** con un modo dev (`?benchRecord=1`) y reutilizar.

### 4.7 Variantes a comparar (backlog inicial)

| ID | Descripción | Sección |
|----|-------------|---------|
| `baseline` | rAF + memo (actual) | §2 |
| `A1` | Memo guías/toolbar | §3.1 |
| `A3` | Snap throttled | §3.1 |
| `B1` | DOM imperativo move | §3.2 |
| `B2` | Ghost layer | §3.2 |
| `B1+B3` | transform move + commit | §3.2 |

El agente no debe mezclar dos variantes en un mismo commit; una variante = un experimento = un score.

### 4.8 Limitaciones del benchmark

- **Playwright ≠ Wails:** números absolutos en CI pueden diferir del desktop app; usar comparación **relativa** entre variantes en el mismo entorno.
- **GPU / DPR:** ejecutar con `--device-scale-factor=1` fijo en CI.
- **Snapping:** trazas deben incluir casos con y sin Alt para no optimizar solo el camino “sin snap”.
- **Subjetivo:** mantener checklist humano opcional (1–5 fluidez) como anexo, no como gate.

### 4.9 Integración CI (futuro)

- Job opcional `bench-drag-fluidity` en PRs que toquen `useCanvasInteraction*` o `StudioWidgetFrame*`.
- Solo **regresión** contra baseline guardado (no bloquear por score absoluto al inicio).
- Subir `results/*.json` como artefacto de GitHub Actions.

---

## 5. Verificación manual (hasta que exista el benchmark)

1. Abrir `overlay-studio-v3-harness.html`.
2. Seleccionar widget Delta.
3. Mover lento → debe seguir sin saltos visibles.
4. Mover rápido en diagonal → el marco no debe quedarse > ~1 frame detrás.
5. Redimensionar esquina `se` → más aceptable que antes; puede haber ligera latencia.
6. Mantener **Alt** → sin snap, movimiento más lineal.
7. **Escape** durante drag → vuelve a posición original.

---

## 6. Referencias en el repo

- Tests de comportamiento: `frontend/src/hub/overlay-studio/canvas/useCanvasInteraction.test.tsx`
- Harness visual: `frontend/overlay-studio-v3-harness.html`
- Plan maestro: `docs/superpowers/plans/2026-07-10-overlay-studio-rebuild-master.md`

---

## 7. Próximo paso recomendado (cuando se retome)

1. Implementar **§4.4** (harness mínimo + traza `move-fast` + score).
2. Fijar **baseline** con la implementación actual.
3. Probar variante **B1** (mayor ROI esperado en move).
4. Actualizar este doc con scores reales en una tabla al final.

---

*Última actualización: 2026-07-10. Fluidez percibida post-optimización: ~7/10.*