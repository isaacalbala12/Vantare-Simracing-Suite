# Fase A — Cierre Alpha LMU

> Objetivo: producto usable de extremo a extremo para Le Mans Ultimate.
> Entregable: `v0.2.0-alpha.1`
> Estado: en planificación. No empezar implementación hasta que cada punto esté aprobado.

## Implementaciones

| # | Implementación | Estado | Notas |
|---|---|---|---|
| 1 | Editor visual: drag & drop de widgets en PreviewCanvas | `pending` | Ver detalle abajo |
| 2 | Editor visual: resize de widgets en PreviewCanvas | `pending` | |
| 3 | Selección de widget + panel de propiedades básico | `pending` | |
| 4 | Guardar layout desde el editor | `pending` | Depende de 1 y 2 |
| 5 | Demo mode toggle en Preview Workbench | `pending` | |
| 6 | Demo mode alimenta widgets con mock-telemetry | `pending` | Depende de 5 |
| 7 | Delta Best live en backend | `pending` | Requiere fixture + tracker |
| 8 | Delta Widget consume deltaBest real | `pending` | Depende de 7 |
| 9 | Hotkeys: toggle overlay visibilidad | `pending` | |
| 10 | Hotkeys: cambio de perfil siguiente/anterior | `pending` | Depende de 9 |
| 11 | OBS setup facilitado en hub | `pending` | |
| 12 | Ops panel: CPU ya no N/D | `pending` | |
| 13 | Visibilidad condicional básica en boxes | `pending` | |

## Implementación 1 — Drag & drop de widgets

### Qué es
Poder arrastrar cada widget dentro del canvas del Preview Workbench para cambiar su posición `(x, y)`.

### Cómo se haría
- Añadir eventos `mousedown`, `mousemove`, `mouseup` en `PreviewWidgetFrame.tsx` (o envolver cada widget en un contenedor draggable).
- Estado local en `PreviewCanvas` o `PreviewPage`: `dragging: { widgetId, startX, startY, offsetX, offsetY }`.
- Al soltar, actualizar `widget.position.x` e `y` en el perfil activo.
- Llamar al binding Go `layout:save` (o `ProfileService`) para persistir.
- Añadir test que simule drag y verifique que la posición cambia.

### Preguntas pendientes de decisión
1. ¿El editor debe tener un **modo "editar" explícito** (botón toggle), o siempre debe ser draggable en Preview?
2. ¿Snap a grid (múltiplos de 8px/16px) o posición libre?
3. ¿Límites del canvas (no salirse) o permitir quedar parcialmente fuera?

### Aproximación recomendada
Usar mouse events nativos en lugar de `@dnd-kit/core`, porque el canvas es absoluto y pixel-perfect; una librería de drag genérica abstrae demasiado.

## Implementación 2 — Resize de widgets

### Qué es
Poder redimensionar cada widget desde handles en esquinas o bordes.

### Cómo se haría
- Añadir handles de resize (esquinas + bordes) en `PreviewWidgetFrame.tsx`.
- Estado local de resize: `resizing: { widgetId, handle, startX, startY, startW, startH }`.
- Al soltar, actualizar `widget.position.w` y `h`.
- Persistir con el mismo binding de guardado.

### Preguntas pendientes
1. ¿Aspect ratio fijo por tipo de widget o libre?
2. ¿Tamaño mínimo por widget?
3. ¿Snap de tamaño a grid también?

## Implementación 3 — Selección de widget + panel de propiedades

### Qué es
Click en un widget lo selecciona y muestra un panel lateral con propiedades editables: posición, tamaño, nombre, tipo, enabled.

### Cómo se haría
- Estado `selectedWidgetId` en `PreviewPage`.
- Panel derecho o inferior con campos editables.
- Los cambios se propagan al perfil.

## Implementación 4 — Guardar layout desde el editor

### Qué es
Persistir cambios de posición/tamaño/visibilidad del perfil activo.

### Cómo se haría
- Reutilizar `ProfileService.saveProfile` de Go vía Wails events.
- Mostrar indicador visual de "guardado".
- Añadir atajo Ctrl+S.

## Implementación 5 y 6 — Demo mode

### Qué es
Un toggle en Preview Workbench que alimente los widgets con datos simulados en lugar de telemetría live.

### Cómo se haría
- Añadir `demoMode: boolean` al estado de `PreviewPage`.
- Cuando esté activo, enviar periódicamente datos de `frontend/src/overlay/widgets/mock-telemetry.ts` al `telemetryRef`.
- El overlay preview debe reaccionar como si viniera de LMU.

### Preguntas pendientes
1. ¿Demo mode solo en Preview o también en overlay runtime?
2. ¿Datos mock estáticos o animados (coches moviéndose, vueltas avanzando)?
3. ¿Qué widgets deben funcionar en demo mode? (probablemente todos los de standings/relative/delta/telemetry/pedals)

## Implementación 7 y 8 — Delta Best

### Qué es
Calcular en backend la diferencia entre la vuelta actual y la mejor vuelta del jugador, y mostrarla en el Delta Widget.

### Cómo se haría
- Revisar `internal/telemetry/delta/tracker.go`.
- Crear fixture LMU con datos de referencia.
- Exponer `deltaBest` en el telemetry bridge y fusion.go.
- Conectar `DeltaWidget.tsx` al `telemetryRef`.

## Implementación 9 y 10 — Hotkeys

### Qué es
Atajos de teclado globales Windows para:
- Toggle visibilidad del overlay (ej: `Ctrl+Shift+V`).
- Cambiar al perfil siguiente/anterior.

### Cómo se haría
- En Go: paquete de hotkeys globales (`github.com/micropkg/go-hotkeys` o similar).
- Binding Wails: eventos `hotkey:toggleOverlay`, `hotkey:nextProfile`, `hotkey:prevProfile`.
- UI en hub para configurar (simple input de tecla).

## Implementación 11 — OBS setup facilitado

### Qué es
Sección en el hub que muestre la URL del overlay, botón para copiar y mini instrucciones.

### Cómo se haría
- Mostrar `http://localhost:{port}/overlay/{profileId}`.
- Botón "Copiar URL".
- Instrucciones: Browser Source en OBS, resolución 1920x1080.

## Implementación 12 — Ops panel CPU

### Qué es
Mostrar el porcentaje de CPU real del proceso en OpsPanel.

### Cómo se haría
- En Go: `github.com/shirou/gopsutil/process` o `runtime.ReadMemStats` + medición de CPU.
- Exponer `cpuPercent` en ops sampler.
- Mostrar en `OpsPanel.tsx`.

## Implementación 13 — Visibilidad condicional básica en boxes

### Qué es
Mostrar u ocultar widgets automáticamente según el jugador esté en boxes o en pista.

### Cómo se haría
- En perfil JSON: `visibilityRules: [{ condition: "inPit", show: [...], hide: [...] }]`.
- En Go o frontend evaluar la regla.
- Implementar primero una regla simple como prueba de concepto.

## Criterios de cierre de fase

- [ ] Todas las implementaciones aprobadas e implementadas.
- [ ] `go test ./...` pasando.
- [ ] `pnpm --dir vantare-v2/frontend test` pasando.
- [ ] `pnpm --dir vantare-v2/frontend build` pasando.
- [ ] Instalador NSIS generado y probado en Windows.
- [ ] CHANGELOG.md actualizado.
- [ ] Tag `v0.2.0-alpha.1` y release en GitHub.

## Notas

- No se toca multisimulador, auth, ni comunidad en esta fase.
- El foco es que un usuario con LMU pueda instalar, diseñar sin sim, y usar en carrera.
- Certificado de firma queda fuera del plan.

## Decisiones pendientes por implementación

### Implementación 1 (drag & drop)
1. Modo editar explícito vs siempre draggable
2. Snap a grid vs posición libre
3. Límites del canvas vs permitir salirse

### Implementación 2 (resize)
1. Aspect ratio fijo vs libre
2. Tamaño mínimo por widget
3. Snap de tamaño a grid

### Implementación 5-6 (demo mode)
1. ¿Solo en Preview o también en runtime?
2. ¿Datos estáticos o animados?
3. ¿Scope de widgets a cubrir?
