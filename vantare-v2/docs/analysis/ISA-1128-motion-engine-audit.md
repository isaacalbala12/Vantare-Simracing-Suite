# Auditoría del motor de animaciones (ISA-1128)

Fecha: 2026-09. Alcance: todo lo que mueve píxeles en el overlay — scheduler
de pintura, política de rendimiento Go→web, motores de motion por widget y
escenas del Workshop.

## Piezas que existen

### 1. Scheduler de pintura — `core/telemetry-rate-coordinator.ts`

- Una única rAF compartida; cada widget se suscribe con su `widgetType`.
- Presupuestos por widget desde `frame.capabilities.performance.widgetHz`
  (número Hz, `"dirty"`, `"event"` o monitor) más un techo global `rafCap`.
- Detección de cambios por firma JSON de la sección del frame que toca a
  cada tipo de widget; los widgets "event" (racing-flags, engineer-radio)
  despiertan sin heredar el cap.
- `dispose` para la rAF cuando no quedan suscriptores. Correcto y simple.

### 2. Política de rendimiento — `internal/app/performance/policy.go`

Go publica por frame `capabilities.performance`:

- `level` 1-5 (Maximum → Minimum), `mode` auto/custom/manual,
  `reason` cpu/frametime/user/vr/unavailable.
- `effects`: `full` | `noBlur` | `flat`.
- `rafCap` por nivel (60/40/30/20), `sourceHz`, tabla `widgetHz` cerrada
  por nivel (pedals 60→20Hz, standings 30→5Hz, weather dirty→, etc.).
- `CadenceFor` escala las cadencias de sección Go-side.
- `WidgetEffects` (por widget) existe en el struct de política.

### 3. Motores de motion — solo `vantare-endurance` (Redline)

Patrón común: derivaciones puras testables (`*-motion.ts`) + hook
(`use*Motion`) con el VM anterior en ref, animaciones imperativas
`element.animate()` dentro de `useLayoutEffect` (React no re-renderiza por
movimiento), timers con presupuestos y limpieza.

- **standings**: FLIP por posición en clase (duración escala con filas
  recorridas), flashes de adelantamiento (máx. 4, stagger 40ms), vuelo de la
  corona de mejor vuelta, pit in/out, reveal de compuesto (4.2s), battle
  box que cristaliza a los 2.5s y se disuelve, ghosts de retiradas,
  conteo escalonado de deltas de posición.
- **relative**: FLIP con rects medidos (atraviesa el eje del jugador),
  flashes de cruce (máx. 3), enter/ghost de filas.
- **delta**: pulso al cruzar cero, marcador de nueva referencia.
- **pedals**: pico de freno (puro, sin DOM).
- Resets de ciclo de vida por `motionIdentity`/`motionSequence`
  (cambio de sesión limpia timers, animaciones y estado).

### 4. Escenas del Workshop — `animation-scenes.ts` + `scene-interpolation.ts`

Escenas nombradas por widget con frames declarativos (`frameMs` por
escena) e interpolación. Sirven para iterar la animación sin telemetría
real; declaradas gaps (`unsupportedSignal`) para no sugerir animaciones
que la proyección real no puede reproducir.

## Hallazgos

### H1 — La política llega al scheduler pero no a los renderers (grande)

`effects`, `level`, `mode`, `reason` y `sourceHz` viajan en el frame y
**ningún renderer ni el host los leen** — solo `rafCap`/`widgetHz` se
obedecen en el coordinator. Lo más caro visualmente (los
`backdrop-filter` de los paneles glass en los 5 sistemas) es exactamente
lo que `noBlur`/`flat` existen para quitar. Go incluso diagnostica
"variante no disponible" cuando level≥3 pide effects=full.

### H2 — `WidgetEffects` por widget está calculado pero `json:"-"`

La política Go tiene presupuesto de efectos POR widget y no lo
serializa. Es la pieza exacta que falta para "perfiles de animación
juntados con perfiles de widgets": quitar el `-` y exponerlo en el
runtime context lo hace real.

### H3 — El motion no respeta nada

`enabled` en los hooks = `model.status === "ready"`. No hay
`prefers-reduced-motion` (existe en los tokens de la shell, no en el
overlay), ni gate por `level`/`effects`. En Level 4-5 (Saving/Minimum)
el motor sigue lanzando FLIP, flashes, battles y timers — contradice el
presupuesto que el propio sistema publica.

### H4 — Motion solo existe en Endurance

Original, Crystal, Functional e iRacing teletransportan sus cambios. Si
la dirección es que el movimiento sea parte de la identidad Vantare,
falta ~80% de la cobertura; si es rasgo de Redline, es decisión
consciente — pero conviene declararlo.

### H5 — El patrón está triplicado, sin motor compartido

prevRef + `element.animate` imperativo + set de timers + limpieza se
reescriben en `useStandingsMotion` (449 l.), `useRelativeMotion` (249 l.)
y `useDeltaMotion` (72 l.). Funciona, pero cada hook reimplementa
schedule/cleanup/budgets. Un helper `useWidgetMotion(model, onDiff)`
compartido quita ~150 líneas por hook y unifica las reglas (p.ej. "un
solo render nunca anima").

### H6 — Costes concretos (sin medir en este análisis, ordenados)

1. **VM rebuild por pintura por widget**: el host reconstruye el VM en
   cada paint que supera el cap — standings con 60 filas a 30Hz es el
   coste dominante probable. No hay memoización entre frames idénticos
   (la firma JSON existe pero para dirty/event, no para widgets a Hz).
2. `useRelativeMotion` mide `getBoundingClientRect` por fila en cada
   modelo dentro de `useLayoutEffect` — ~20 lecturas de layout forzadas
   por paint de relative. Necesario para atravesar las uniones de eje;
   podría caer a stride×índice si se acepta la aproximación.
3. `signature()` serializa la sección entera del widget en el chequeo de
   techo dirty (1 Hz por widget dirty) — acotado, escala con filas.
4. Stepping de deltas y reveals de gomas: `setState` por paso/timer —
   acotados por presupuestos.
5. `clearImperativeMotion` recorre el subárbol + `getAnimations` por
   elemento — solo en reset de sesión, aceptable.
6. Fills de pedales/barras de delta: transiciones CSS — correcto.
7. Escenas del Workshop reproducen frames sin pasar por el coordinator:
   iteran diseño, no ejercitan caps — nota, no bug.

### H7 — Volante iRacing (nuevo)

La rotación pasaba por atributo `transform` (sin transición → salto por
frame). Corregido a `style.transform` + `transition: transform 90ms`.

## Propuesta — unir motion con perfiles

1. **`MotionLevel`** derivado una vez por widget:
   `full` (level 1-2) / `reduced` (level 3) / `minimal` (level 4-5 o
   `prefers-reduced-motion: reduce`). El host lo inyecta a los hooks —
   today `enabled` booleano pasa a `motionLevel`.
   - `reduced`: FLIP sí, flashes/battles/crown/ghosts no.
   - `minimal`: cero animación; los valores actualizan al instante.
2. **`effects` al DOM**: atributo en el root del host
   (`data-effects="noBlur|flat"`) y CSS por sistema que mata
   backdrop-filter, glows y gradientes pesados. Una regla, todos los
   sistemas.
3. **Perfil por widget**: serializar `WidgetEffects` (quitar `json:"-"`)
   y exponerlo en `OverlayRuntimeContext` → perfil e instrumento (pedals
   siempre barato/full, standings puede bajar a reduced).
4. **Helper compartido** `useWidgetMotion(model, derive, apply)` que
   centralice prevRef/timers/cleanup; los 3 hooks quedan como
   `derive`+`apply` específicos.
5. **Escenas** podrían respetar un `motionLevel` simulado en la query
   del Workshop para previsualizar cada perfil.

## No tocado aquí

- VM rebuild por paint (punto 1 de H6) merece micro-benchmark antes de
  optimizar: `signature` ya existe como base.
- La tabla `WidgetHzFor` es cerrada Go-side; añadir tipos de widget pide
  tocarla (Pedales Avanzados comparte `pedals-telemetry-compact` ✓).
