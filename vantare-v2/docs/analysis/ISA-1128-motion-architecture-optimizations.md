# Optimizaciones de arquitectura del motor de animaciones (ISA-1128)

Fecha: 2026-09-12. Continuación de `ISA-1128-motion-engine-audit.md`.
Alcance: cómo gastar el mínimo de CPU/GPU/RAM posible y evitar spikes,
evaluado a nivel de arquitectura — no micro-optimizaciones de una línea.

## Modelo de coste actual

Antes de optimizar hay que saber dónde se gasta. El motor tiene tres
planos de ejecución con costes distintos:

| Plano | Qué corre ahí | Coste |
|---|---|---|
| Compositor (GPU) | WAAPI `transform`/`opacity`, transiciones CSS de la barra delta y fills de pedals | Casi gratis por animación; cada elemento animado puede promover una capa de compositor (~1 textura en VRAM) |
| Main thread — JS | React reconcile por tick (≤updateHz), layout effects, `deriveIndexOffsets`/`deriveOvertakes`, `querySelector` por fila, `setTimeout` de cleanup | El cuello real. Todo lo que no es transform/opacity pasa por aquí |
| Main thread — layout/paint | `getBoundingClientRect` (stride), invalidación de estilo por data-attrs, reflow del presupuesto de filas | Barato en aislamiento, caro si fuerza layout síncrono tras escrituras |

Conclusión del modelo: **las animaciones ya viven en el compositor donde
deben**. Lo que queda en main thread es reconcile + lecturas + timers +
selectores. Los spikes vienen de ráfagas (vuelta rápida + cruce + flag a
la vez) y de widgets ocultos animando igual que los visibles.

## Optimizaciones por impacto

### Alto impacto

#### O1 — Cancelar animaciones en vuelo antes de aplicar nuevas (anti-spike)

**Problema.** Cada `apply` de `useWidgetMotion` llama a
`row.animate(...)` sin cancelar las animaciones anteriores del mismo
elemento. Con updates a 20-30Hz y animaciones de 240-400ms, dos applies
seguidos apilan varias animaciones de `transform` sobre la misma fila —
se componen en el effect stack y se pelean hasta que expiran. En una
ráfaga (coche entra + cruce + mejor vuelta en el mismo segundo) es un
spike de compositor y un artefacto visual.

**Propuesta.** Una línea por fila antes de animar:

```ts
row.getAnimations().forEach((a) => a.cancel());
```

`getAnimations()` devuelve solo las de ese elemento (subtree=false por
defecto en Element) — O(animaciones del elemento), típicamente 0-2.

**Riesgo.** Nulo. Cancelar una animación terminada es no-op.

#### O2 — `matchMedia` singleton (micro-leak real)

**Problema.** `resolveMotionLevel` llama a
`matchMedia("(prefers-reduced-motion: reduce)")` en cada render de cada
host. Cada llamada crea un `MediaQueryList` nuevo que el navegador debe
trackear. Con 8 widgets re-renderizando a distintos Hz son decenas de
MQLs por segundo, y además un cambio de preferencia del SO **no se
propaga** hasta el siguiente render — si el widget no re-renderiza, el
nivel queda obsoleto.

**Propuesta.** Singleton a nivel de módulo con `change` listener:

```ts
const reducedMotionMql =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : null;
```

y que `resolveMotionLevel` lea `reducedMotionMql?.matches`. Si queremos
propagación reactiva, el host puede suscribirse con
`useSyncExternalStore` — pero con leer el valor fresco por render ya se
arregla la corrección (el siguiente tick aplica el nivel nuevo).

**Riesgo.** Ninguno; mismo comportamiento, menos objetos.

#### O3 — No animar widgets que no se ven (mayor ahorro por widget)

**Problema.** En una escena de OBS con 8 overlays, los que están fuera
de viewport, con `opacity: 0` u ocultos por la escena siguen ejecutando
FLIP, flashes y timers. El scheduler de pintura ya tiene cap de Hz pero
no sabe si el widget es visible.

**Propuesta.** Un `IntersectionObserver` compartido (uno por documento,
todos los hosts se suscriben) → el host calcula
`enabled = level !== "minimal" && visible`. Cuando `visible` es false el
hook sigue actualizando `prevRef` (para no animar una explosión acumulada
al reaparecer) pero salta el `apply` entero.

**Detalle importante.** Al volverse visible de nuevo, el VM anterior
puede estar muy viejo (posiciones completamente distintas). Hay que
resetear `prevRef` cuando la visibilidad pasa a true — reaparecer
"como siempre estuvo" es más correcto que una cascada de FLIP
acumulado.

**Coste.** Un observer compartido ~20 líneas; callbacks solo en cambios
de intersección (casi nunca).

**Riesgo.** Bajo. El caso a vigilar: OBS "studio mode" previsualiza
escenas — un widget oculto que debería seguir actualizando datos sí lo
hace (solo se omite la animación).

#### O4 — Eliminar los timers de cleanup con `anim.finished`

**Problema.** Cada flash (`data-cross`, `data-rise`, `data-fall`,
`data-newBest`, `data-pit`, ghosts) programa un `setTimeout` que se
acumula en `timersRef`, se limpia en unmount y compite con otros timers
en ráfagas. Es churn de timers por tick y un set que hay que mantener.

**Propuesta.** Las animaciones WAAPI se autodestruyen; para los efectos
basados en data-attr, la limpieza puede colgar de la animación CSS que
termina: `animationend`/`transitionend` listener una vez por efecto, o
`row.getAnimations({subtree:false})` si el flash es WAAPI. Opción más
simple que ya funciona: convertir los flashes a WAAPI sobre
`backgroundColor`/`opacity` con `fill:"none"` — el efecto expira solo,
sin timer ni dataset que retirar, y `finished.then()` cubre los casos
donde el attr sí debe retirarse.

**Coste/beneficio.** Desaparece `timersRef` entero del helper; el
cleanup de unmount se reduce a nada; en ráfagas no hay N timers
pendientes. Es también una simplificación de código, no solo de
rendimiento.

**Riesgo.** Los flashes actuales son CSS puro (data-attr → estilo
transitorio); moverlos a WAAPI los hace imperativos. Alternativa
igualmente válida: mantener data-attr + un solo timer por apply que
retira todos los attrs del batch — reduce N timers a 1.

### Impacto medio

#### O5 — Early-exit antes de construir Maps

`deriveIndexOffsets` construye un `Map` de ~30 entradas por update aunque
el orden no haya cambiado (la mayoría de ticks). Un check previo O(n):

```ts
const moved = next.rows.some((row, i) => prev.rows[i]?.id !== row.id);
```

evita el Map, los `querySelector` y el loop entero cuando nada se movió.
Lo mismo para `deriveOvertakes` (que además ahora es O(n) tras el fix,
pero sigue construyendo un Map por tick).

#### O6 — Cap de filas animadas simultáneas

Cada `transform` animado promueve una capa de compositor. 15 filas
moviéndose = 15 capas ≈ 15 texturas en VRAM. Endurance ya capa flashes
(máx. 4, stagger 40ms); el FLIP no está capado. Propuesta: en `reduced`,
solo animar |delta| ≥ 1 y como máximo N=8 filas — el resto hace snap.
Elegir las N de mayor |delta| es O(n) con un sort parcial, o simplemente
las primeras N encontradas (sesgo por posición, aceptable).

#### O7 — `contain: paint` en la raíz del widget

Ya hay `container-type: inline-size` (containment de layout+style de
inline-size). Añadir `contain: paint` a las secciones `.vf-*` impide que
un data-attr cambiando en una fila invalide nada fuera del widget y que
el paint de flashes se propague. Una línea de CSS; vigilar que no rompe
`position: sticky` ni sombras que deben dibujarse fuera del borde (el
glow del delta capsule vive dentro, verificar).

#### O8 — Stride del FLIP: de medir por apply a cachear por ResizeObserver

Hoy el stride se mide con `getBoundingClientRect` en cada apply — es una
lectura tras escrituras de React en el mismo layout effect, un reflow
forzado por tick animado. Es barato (una lectura) pero puede cachearse:
`ResizeObserver` sobre la primera fila o sobre la tabla → `strideRef`.
Ventaja: el apply pasa a cero lecturas de layout. Coste: un observer más.
Worth it solo si el perfilado muestra el reflow — sospecha de que es
sub-milisegundo; prioridad baja dentro del medio.

### Impacto bajo — evaluados y descartados

| Idea | Veredicto |
|---|---|
| Pool de arrays/closures por apply | Churn de GC imperceptible a ≤30Hz. No. |
| View Transitions API | Snapshottea el DOM por animación — *más* pesado que FLIP manual. No. |
| Canvas `measureText` para slots del pie | La estimación por caracteres ya cierra. No. |
| `content-visibility: auto` en filas | ≤20 filas, siempre visibles. Sin ganancia. |
| Web Animations en un worker | WAAPI no corre en workers; OffscreenCanvas no aplica a DOM. No viable. |
| Canal de datos imperativo (React solo estructura, rAF parchea DOM) | Es el techo teórico — lo que hacen los overlay engines nativos. Reescritura grande del pipeline de VMs; solo si un perfil real muestra React como cuello. Hoy el reconcile por tick es pequeño. Documentado, no recomendado ahora. |

## Riesgo residual que no cubre ninguna optimización

- **Layout thrash en el presupuesto de filas**: el slice de
  `visibleRows` es puro, pero si el DOM real discrepa de las constantes
  (fuente cargada tarde, zoom del OBS browser) el desajuste reaparece.
  Ya hay mediciones reales en el harness; sería prudente un assert en
  tests de Workshop que compare `scrollHeight` vs `clientHeight`.
- **Fuentes**: `font-display` y carga tardía de la tipografía del
  sistema de diseño puede re-flowear después del primer paint, anulando
  la estimación de slots. Fuera del motor, pero visible como "spike" en
  el primer segundo tras cargar el overlay.

## Protocolo de medición propuesto

Antes/después de cada optimización, en el harness con la escena
`standings-full` (la más densa):

1. Chrome DevTools Performance, 10s de grabación → main-thread busy
   durante el cruce múltiple.
2. `document.getAnimations().length` en el pico — capa de compositor
   proxy.
3. Memory → conteo de `Animation`/`Timeout` objects en heap snapshot.
4. Long tasks >50ms durante la escena.

Sin estas medidas, la lista anterior es hipótesis razonada, no hecho.

## Prompt de revisión adversarial (para pegar en el chat)

```text
CONTEXTO

- Repo: Vantare — overlays de telemetría (React 19 + TypeScript + Vite)
- Carpeta: /Users/isaacalbala/Desktop/vantare-isa1128/vantare-v2
- Rama: vantareapp/isa-1128-functional-widgets (issue ISA-1128)
- Frontend: frontend/ dentro de esa carpeta (pnpm)

Se acaba de construir un motor de animaciones compartido para los
widgets del overlay. Arquitectura: el host resuelve un presupuesto de
motion por widget (MotionLevel: full/reduced/minimal, derivado de
capabilities.performance.level que publica Go por frame +
prefers-reduced-motion) y lo pasa como prop a los renderers. Los
renderers usan un helper compartido useWidgetMotion (VM anterior en
ref, animaciones WAAPI imperativas en useLayoutEffect, timers de
cleanup). Hay dos sistemas de diseño con motion: vantare-functional
(Eficiencia, nuevo) y vantare-endurance (Redline, producción). El
Workshop (/workshop) reproduce escenas declarativas con transporte
rAF + interpolación muestreada al updateHz de cada widget.

Commits relevantes ya hechos en esta rama:
- b3eed3b4 — motor de motion para Eficiencia + harness de escenas
- e62db05c — política de nivel llega a Endurance + O(n) en
  deriveOvertakes
- abfa2936 — pie de standings/relative (≤5 una línea / >5 dos) +
  stride del FLIP medido del DOM

Defectos YA encontrados y corregidos en revisiones adversariales
previas — verifícalos como regresiones, no los reportes como nuevos:
motion sin enhebrar en templateBody de Endurance, O(n²) en
deriveOvertakes, stride del FLIP medido con getBoundingClientRect
(doble escala del viewport — corregido a offsetHeight), colisión del
prop motion con la variable del hook, Endurance ignorando el nivel,
transiciones CSS sin gate de nivel (resuelto con data-motion-level),
timer viejo apagando el flash nuevo (resuelto con schedule con clave),
cruce de relative por índice en vez de side, interpolación adelantando
overrides al inicio del intervalo, y setState por rAF sin cuantizar.

TAREA

Actúa como revisor adversarial del motor de animaciones. Tu trabajo
NO es confirmar que está bien: es encontrar defectos reales.

Alcance del review (lee el diff completo y los call sites, no solo los
archivos que se mencionen):

- frontend/src/overlay/core/widget-motion.ts (helper compartido)
- frontend/src/overlay/core/WidgetVisualHost.tsx (cómo llega motion/effects)
- frontend/src/overlay/design-systems/vantare-functional/*.tsx (apply de
  FLIP, flashes, cross-zero, data-effects)
- frontend/src/overlay/design-systems/vantare-endurance/**/use*Motion.ts
  y plantillas Redline (¿la política llega a TODAS?)
- frontend/src/overlay/design-systems/vantare-functional/functional-motion.ts
- frontend/src/overlay/authoring/OverlayWorkshopDevRoute.tsx +
  fixtures/animation-scenes.ts + scene-interpolation.ts (el transporte)
- tokens.css de cada sistema (los efectos que data-effects debería matar)

Hipótesis que debes intentar ROMPER activamente:

1. "El nivel de motion se respeta en todas partes" — busca un renderer,
   hook o plantilla que anime sin consultar el nivel. Prueba level=5 y
   prefers-reduced-motion y verifica en el DOM que nada se mueve.
2. "No hay trabajo por frame innecesario" — busca O(n²), allocations en
   hot path, layout reads tras writes, querySelector por fila, timers
   que se acumulan, animaciones que se apilan sin cancelar.
3. "La limpieza es correcta" — fuerza unmount durante una animación;
   ¿los timers disparan sobre nodos muertos? ¿prevRef retiene modelos?
4. "El harness reproduce la realidad" — ¿el muestreo a updateHz es real
   o la interpolación dibuja más suave que el producto? ¿la rAF del
   transporte corre a 60 aunque el widget sea de 5Hz?
5. "Los tests cubren los modos de fallo" — ¿hay un test que habría
   pillado el motion sin enhebrar en templateBody? ¿Los tests mockean
   WAAPI de forma que esconden errores (animate inexistente, etc.)?
6. "Las escenas mapean a los fixtures" — verifica que CADA escena tiene
   drivers presentes en la parrilla del estudio y que el patch llega al
   DOM (data-attrs, orden de filas).
7. "El pie de standings/relative no puede cortarse" — prueba 0, 1, 5, 6
   y 12 slots en ancho mínimo y máximo; mide scrollHeight vs
   clientHeight del footer y de la tabla; busca la fila a medias.

Reporta SOLO hallazgos accionables, ordenados por severidad, con
archivo:línea y el razonamiento que lo hace un defecto (no una opinión).
Si un área está limpia, dilo en una línea y sigue. No propongas
refactors estéticos. Si afirmas que algo funciona, muestra la evidencia
(test, medición DOM, o traza) — "los tests pasan" no es evidencia de que
el comportamiento visual sea correcto.
```

## Estado

Segunda revisión adversarial (externa, con mediciones DOM): los 10
hallazgos eran reales y están corregidos — doble escala en stride/presupuesto
(offsetHeight), `data-motion-level` gating de transiciones CSS, `flat`
alcanza efectos interiores, cancelación al deshabilitar + schedule con
clave, cruce de relative por `side`, setState cuantizado, overrides
discretos aterrizando en su keyframe, y nombres de escena vs fixture.

De las propuestas de arriba: O1 hecha (cancel por fila, excluyendo
CSSTransitions del flash), O4 parcial (schedule con clave en vez de
`finished`), O2 (matchMedia singleton) y O3 (IntersectionObserver)
siguen pendientes, O5-O8 sin tocar.
