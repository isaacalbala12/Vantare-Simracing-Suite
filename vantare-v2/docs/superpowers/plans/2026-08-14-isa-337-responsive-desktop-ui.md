# Plan técnico: UI responsive integral de escritorio

Estado: aprobado por Isaac el 2026-08-14; listo para issue de implementación
Issue de planificación: ISA-337 / UI-RESP-01
Spec aprobada: `docs/superpowers/specs/2026-08-14-responsive-desktop-ui-design.md`
Base auditada: `origin/nightly@b635d795128de6600b9c5008d0e4bc143872d976`
Review técnico: T3 Code `77fee96e-3d11-4711-ae75-676a73a3de49`, Fable 5
(`claude-opus-5`) / `claudeAgent` high, GO CON CAMBIOS incorporado

## Resultado esperado

La aplicación debe mantener todas sus funciones desde la ventana mínima Wails
`900x600` hasta 4K, 32:9 y tamaños superiores. Los workspaces que pueden
paralelizar información aprovechan más ancho; formularios y texto conservan
límites legibles. No hay overflow horizontal global, controles inaccesibles ni
pérdida de estado al redimensionar.

Este plan cambia únicamente layout y su evidencia. No porta Fable, no rediseña
la navegación, no toca contratos de negocio ni reabre la geometría
Studio/Desktop/OBS de ISA-326.

## Preflight obligatorio por corte

Antes de cada tarea:

1. consultar la issue ejecutable y sus dependencias en Linear;
2. crear o verificar su rama/worktree aislados desde la base declarada;
3. confirmar rama, HEAD, merge-base y `git status --short` limpio;
4. leer la spec, este plan y los archivos/tests del write set;
5. ejecutar primero el gate focal o caracterización aplicable;
6. parar ante dependencia, arquitectura, base o archivos adicionales no
   previstos.

ISA-337 sigue siendo una issue documental. La implementación requiere una
issue ejecutable nueva antes de editar producto. El orquestador decidirá si los
cortes viven como tareas secuenciales de una misma rama o como issues hijas
según el estado de `nightly`; nunca compartirán worktree entre agentes.

## Evidencia de la auditoría

- Wails limita la ventana principal a `900x600` en `cmd/vantare/main.go`; el
  viewport CSS útil todavía debe medirse en Windows.
- `V52Shell` usa ancho completo solo cuando `activeSection === "profiles"`; el
  resto del Hub sigue bajo `max-w-[1920px]`.
- También conservan `max-w-[1920px]` independientes `Topbar`, `HubSubnav` y
  `UpdateBanner`.
- El código ya usa Tailwind responsive, flex/grid y algunos CSS fluidos; no
  hace falta otra capa.
- `frontend/src/calendar-visual-harness.tsx` ya monta el `HubApp` productivo y
  `vite.calendar-harness.config.ts` ya sustituye solo el runtime Wails.
- Calendar, Strategy, Studio y Testing Center ya tienen runners visuales con
  comprobaciones parciales de overflow.
- Studio ya dispone de modos wide/medium/compact y de un gate propio. Este plan
  adapta su chrome sin cambiar `layoutViewport`, widgets ni drag/resize.
- La exploración Fable ISA-328/332/333 está en otro worktree y no es fuente de
  código productivo para este plan.

## Decisiones técnicas

### D1. Reutilizar el harness real del Hub

El gate general abrirá
`calendar-harness.html?access=power-tester#/hub`, navegará por los destinos
reales mediante el topbar y reutilizará `wails-runtime-mock.ts`. Ese modo hace
alcanzables Engineer, Strategy y Telemetry. Testing Center no es alcanzable con
el mock actual y queda cubierto por su runner especializado; no se modifica el
mock solo para forzar una ruta. No se crea un nuevo entrypoint React, proveedor,
router ni configuración Vite.

### D2. Un runner general, runners especializados intactos

Se añadirá un único `hub-responsive-visual.mjs` para shell, destinos y matriz
global. Los runners de Calendar, Strategy, Studio y Testing Center continúan
validando sus interacciones especializadas. El runner general los complementa;
no duplica sus fixtures ni baselines.

### D3. Invariantes en toda la matriz, pocas capturas

T0 caracteriza cuatro tamaños: suelo Wails medido, `1366x768`, `1920x1080` y
`5120x1440`. T14 recorre la matriz completa. En todos mide overflow —incluidos
contenedores que recortan—, bounds, capas fijas, acciones alcanzables y errores.
Solo captura suelo, `1920x1080`, `3840x2160` y `5120x1440`. Idiomas se prueban
en dos tamaños sobre superficies traducidas y con cadenas largas sintéticas en
las demás; DPR usa contextos separados y dos destinos representativos.

### D4. CSS antes que JavaScript

La corrección usa primero flujo normal, flex wrapping, grid auto-fit,
`minmax()`, `min()`, `max()`, `clamp()` y límites locales. Se conservan los
breakpoints Tailwind existentes. No se introduce viewport store, contexto,
hook compartido ni lista de relaciones de aspecto.

### D5. Cambio solo con fallo demostrado

Cada corte comienza ejecutando el gate sobre su superficie. Si ya cumple spec,
se registra PASS y se cierra sin editar producto. No se hacen conversiones
mecánicas de unidades, limpieza CSS ni “mejoras” oportunistas.

### D6. Ownership local del ancho

El shell deja de decidir el ancho legible de todas las páginas. Las páginas
informativas y formularios mantienen su propio `max-width`; galerías, métricas
y workspaces pueden crecer. Esto evita sustituir un límite global incorrecto
por un estirado global igualmente incorrecto.

## Grafo de dependencias

```text
Spec aprobada
    |
    v
T0 gate global read-only
    |
    v
T1 shell fluido ----> T2 navegación y dock
    |                         |
    +-------------------------+
    |
    +--> T3 Dashboard
    +--> T4 Auth/onboarding
    +--> T5 Settings/diagnósticos
    +--> T6-T7 Launcher
    +--> T8-T9 Calendar
    +--> T10 Engineer/Telemetry
    +--> T11 Roadmap/Testing Center
    +--> T12 Strategy
    +--> T13 Studio chrome
             |
             v
       T14 matriz final + smoke Windows + handoff
```

T3-T13 dependen del shell estable. Pueden convertirse en issues aisladas, pero
se ejecutan secuencialmente salvo que tengan worktrees, bases y write sets
independientes. T12 y T13 siempre conservan sus gates especializados.

## Tareas

## T0. Gate responsive global e inventario reproducible

**Descripción:** añadir el runner general reutilizando el harness existente. Su
modo `--audit` recoge todos los fallos sin convertirlos en excepciones
aceptadas; el modo estricto termina con código distinto de cero ante cualquier
invariante rota.

**Aceptación:**

- [ ] Recorre los destinos alcanzables del Hub en cuatro tamaños iniciales;
      Testing Center se delega explícitamente a su runner especializado.
- [ ] Informa viewport, destino, selector y métrica de cada fallo.
- [ ] Detecta tanto overflow global como contenido recortado por contenedores
      `hidden|clip`, y distingue overflow local declarado.
- [ ] Usa un puerto propio (`5177`) y no mata ni colisiona con Calendar en
      `5175`.
- [ ] No crea otro harness, baseline masivo ni allowlist genérica de overflow.

**Verificación:**

- [ ] `corepack pnpm --dir frontend responsive:audit`
- [ ] `corepack pnpm --dir frontend build`
- [ ] revisar que el reporte inicial coincide con inspección manual de al menos
      el suelo Wails medido, `1920x1080` y `5120x1440`.

**Dependencias:** ninguna después de aprobar este plan.
**Archivos probables:**

- `frontend/scripts/hub-responsive-visual.mjs`
- `frontend/package.json`
- `docs/analysis/isa-337-responsive-baseline.md`

**Tamaño:** M, 3 archivos.

## T1. Shell fluido y ownership de anchura

**Descripción:** retirar el límite universal del contenedor principal y dejar
que cada página controle su ancho, conservando padding, dock y scroll vertical.
El `overflow-x-hidden` global del contenido se retira o se mueve únicamente a
contenedores semánticos locales; no puede ocultar fallos del gate.

**Aceptación:**

- [ ] El shell no impone `1920px` a todas las páginas.
- [ ] `V52Shell`, `HubSubnav` y `UpdateBanner` no crean límites globales
      incoherentes; `Topbar` se completa en T2.
- [ ] El contenido no queda bajo navegación/dock ni genera overflow global.
- [ ] Resize conserva el mismo subtree y estado de la página.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- V52Shell`
- [ ] runner estricto focal en Dashboard y Settings para toda la matriz.
- [ ] `corepack pnpm --dir frontend build`

**Dependencias:** T0.
**Archivos probables:**

- `frontend/src/hub/components/V52Shell.tsx`
- `frontend/src/hub/components/V52Shell.test.tsx`
- `frontend/src/hub/components/HubSubnav.tsx`
- `frontend/src/hub/components/UpdateBanner.tsx`
- `frontend/scripts/hub-responsive-visual.mjs`

**Tamaño:** M, 5 archivos.

## T2. Topbar y Launcher Dock

**Descripción:** asegurar que navegación, cuenta, estado de telemetría y dock
usan el espacio disponible, cambian de presentación sin scroll horizontal y
mantienen targets accesibles.

**Aceptación:**

- [ ] Todos los destinos siguen alcanzables en el suelo Wails medido; por
      debajo de `lg`, los perfiles del dock conservan una ruta accesible.
- [ ] Los cuatro idiomas se prueban donde el chrome consume i18n; donde aún no
      lo hace, cadenas largas sintéticas demuestran que el layout no recorta.
- [ ] Topbar y dock no tapan contenido ni crean un segundo límite global.
- [ ] Abrir/cerrar navegación compacta conserva foco y `aria-expanded`.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- Topbar LauncherDock`
- [ ] runner global en compacto, 1080p y 32:9 con navegación por teclado.
- [ ] lint focal de los archivos modificados.

**Dependencias:** T1.
**Archivos probables:**

- `frontend/src/hub/components/Topbar.tsx`
- `frontend/src/hub/components/Topbar.test.tsx`
- `frontend/src/hub/components/LauncherDock.tsx`
- `frontend/src/hub/components/LauncherDock.test.tsx`
- `frontend/src/index.css`

**Tamaño:** M, 5 archivos.

## Checkpoint A: fundación

- [ ] T0-T2 revisadas con diff completo.
- [ ] Tests focales, build y runner del shell PASS.
- [ ] Cero dependencia o servicio responsive nuevo.
- [ ] Isaac valida shell en `900x600`, `1920x1080` y `5120x1440` antes de
      continuar con todas las páginas.

## T3. Dashboard

**Descripción:** adaptar hero, calendario, carrusel y tarjetas del inicio para
que apilen en compacto y aprovechen columnas útiles en ancho sin estirar texto.

**Aceptación:**

- [ ] Acción principal, estado y calendario permanecen visibles y alcanzables.
- [ ] El contenido paralelizable usa más ancho sin superar límites de lectura.
- [ ] Los estados de calendario vacío/cargado no cambian el ancho del shell.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- DashboardPage DashboardFeatureCarousel`
- [ ] runner global, destino Dashboard, matriz completa e idiomas.

**Dependencias:** T2.
**Archivos probables:**

- `frontend/src/hub/pages/DashboardPage.tsx`
- `frontend/src/hub/pages/DashboardPage.test.tsx`
- `frontend/src/hub/components/DashboardFeatureCarousel.tsx`
- `frontend/src/hub/components/DashboardFeatureCarousel.test.tsx` (crear)
- `frontend/src/hub/calendar/CalendarHeroUpcomingPanel.tsx`

**Tamaño:** M, 5 archivos.

## T4. Acceso y onboarding

**Descripción:** validar login, paywall, configuración incompleta y onboarding
con poca altura, textos largos, teclado y diálogos dentro del viewport.

**Aceptación:**

- [ ] Todas las acciones son alcanzables en `900x600` mediante scroll vertical.
- [ ] Planes, errores y textos traducidos no fuerzan overflow horizontal.
- [ ] No cambia autenticación, billing, entitlement ni lógica de cierre.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- LoginScreen PaywallScreen BetaWelcome`
- [ ] Playwright focal en `900x600`, `1280x720` y `3840x2160`.

**Dependencias:** T2.
**Archivos probables:**

- `frontend/src/hub/auth/LoginScreen.tsx`
- `frontend/src/hub/auth/LoginScreen.test.tsx`
- `frontend/src/hub/auth/PaywallScreen.tsx`
- `frontend/src/hub/auth/PaywallScreen.test.tsx`
- `frontend/src/hub/onboarding/BetaWelcome.tsx`

**Tamaño:** M, 5 archivos.

## T5. Settings y diagnósticos

**Descripción:** hacer que subnavegación, formularios y paneles de diagnóstico
sean alcanzables sin ensanchar el documento; conservar límites legibles en 4K.

**Aceptación:**

- [ ] Subnavegación y acciones de guardado funcionan en el suelo Wails.
- [ ] Valores largos, rutas y payloads usan wrap o overflow local explícito.
- [ ] Ningún cambio alcanza settings, updater o diagnóstico de negocio.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- SettingsPage DiagnosticsPanel AccountSettings StorageSettings`
- [ ] `corepack pnpm --dir frontend e2e:diagnostics`
- [ ] runner global, destino Settings, matriz e idiomas.

**Dependencias:** T2.
**Archivos probables:**

- `frontend/src/hub/pages/SettingsPage.tsx`
- `frontend/src/hub/pages/SettingsPage.test.tsx`
- `frontend/src/hub/components/HubSubnav.tsx`
- `frontend/src/hub/components/HubSubnav.test.tsx`
- `frontend/src/hub/settings/diagnostics/DiagnosticsPanel.tsx`

**Tamaño:** M, 5 archivos. Si otro panel falla, se abre otro microcorte; no se
amplía este write set silenciosamente.

## Checkpoint B: superficies comunes

- [ ] T3-T5 PASS en runner global y tests focales.
- [ ] Capturas compacta/1080p/4K/32:9 revisadas.
- [ ] Formularios y texto conservan anchura legible.

## T6. Launcher: shell y catálogo de apps

**Descripción:** adaptar las columnas principales, cards de apps, onboarding y
estado de sesión sin alterar detección ni cadenas de lanzamiento.

**Aceptación:**

- [ ] Apps y sesión se apilan en compacto y usan columnas útiles en ancho.
- [ ] Nombres y rutas largas no ensanchan el shell.
- [ ] Lanzar, reintentar y cancelar mantienen comportamiento y foco.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- LauncherPage AppsPanel LauncherOnboarding`
- [ ] runner global más `launcher-visual-compare.mjs` cuando sea aplicable.

**Dependencias:** T2.
**Archivos probables:**

- `frontend/src/hub/pages/LauncherPage.tsx`
- `frontend/src/hub/pages/LauncherPage.test.tsx`
- `frontend/src/hub/launcher/AppsPanel.tsx`
- `frontend/src/hub/launcher/AppsPanel.test.tsx`
- `frontend/src/hub/launcher/LauncherOnboarding.tsx`

**Tamaño:** M, 5 archivos.

## T7. Launcher: perfiles y diálogos

**Descripción:** asegurar que perfiles, editor y decisiones conservan sus
acciones en ventanas compactas y no se estiran de forma ilegible en ultrawide.

**Aceptación:**

- [ ] Galería/editor cambian composición sin perder selección o borrador.
- [ ] Todos los diálogos quedan dentro del viewport y tienen scroll interno si
      lo necesitan.
- [ ] No cambia persistencia, comandos ni orden de lanzamiento.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- ProfilesPanel ProfileEditor LauncherDecisionDialog`
- [ ] runner global con modal abierto en compacto y 32:9.

**Dependencias:** T6.
**Archivos probables:**

- `frontend/src/hub/launcher/ProfilesPanel.tsx`
- `frontend/src/hub/launcher/ProfilesPanel.test.tsx`
- `frontend/src/hub/launcher/ProfileEditor.tsx`
- `frontend/src/hub/launcher/ProfileEditor.test.tsx`
- `frontend/src/hub/launcher/LauncherDecisionDialog.tsx`

**Tamaño:** M, 5 archivos.

## T8. Calendar: frame, rail y toolbar

**Descripción:** corregir ownership de altura, sidebar/rail, toolbar y detalle
sin cambiar store, eventos, zona horaria o datos.

**Aceptación:**

- [ ] Rail y detalle pasan de columnas a flujo compacto sin quedar inaccesibles.
- [ ] Menús de toolbar se mantienen dentro del viewport.
- [ ] El área de calendario usa scroll local previsto, no scroll horizontal global.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- CalendarPage CalendarToolbar CalendarRaceRail`
- [ ] `corepack pnpm --dir frontend exec node scripts/calendar-visual-final.mjs`

**Dependencias:** T2.
**Archivos probables:**

- `frontend/src/hub/pages/CalendarPage.tsx`
- `frontend/src/hub/pages/CalendarPage.test.tsx`
- `frontend/src/hub/calendar/CalendarToolbar.tsx`
- `frontend/src/hub/calendar/CalendarToolbar.test.tsx`
- `frontend/src/hub/calendar/CalendarRaceRail.tsx`

**Tamaño:** M, 5 archivos.

## T9. Calendar: mes, timeline y próximos

**Descripción:** validar las tres vistas con contenido de estrés; solo modificar
la vista que falle el gate especializado.

**Aceptación:**

- [ ] Mes, timeline y próximos son operables en `900x600` y 32:9.
- [ ] Overflow semántico permanece local y accesible por teclado.
- [ ] Cambiar de vista y redimensionar conserva selección y detalle.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- CalendarMonthView CalendarTimelineView CalendarUpcomingView`
- [ ] runner Calendar y runner global en toda la matriz.

**Dependencias:** T8.
**Archivos probables:**

- `frontend/src/hub/calendar/CalendarMonthView.tsx`
- `frontend/src/hub/calendar/CalendarMonthView.test.tsx`
- `frontend/src/hub/calendar/CalendarTimelineView.tsx`
- `frontend/src/hub/calendar/CalendarTimelineView.test.tsx`
- `frontend/src/hub/calendar/CalendarUpcomingView.tsx`

**Tamaño:** M, 5 archivos.

## Checkpoint C: workspaces operativos

- [ ] T6-T9 PASS y sin cambio de lógica Launcher/Calendar.
- [ ] Tests, runners especializados y build verdes.
- [ ] Resize conserva selección, borradores y vista activa.

## T10. Engineer y Telemetry

**Descripción:** adaptar paneles, listas y estados informativos de ambos destinos
sin tocar transportes, monitores o contratos de telemetría.

**Aceptación:**

- [ ] Controles Engineer y feed son alcanzables con poca altura.
- [ ] Telemetry usa el ancho de forma equilibrada sin agrandar texto/ilustración.
- [ ] Estados live/missing/preview conservan semántica.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- EngineerPage TelemetryPage`
- [ ] runner global con `?access=power-tester` en ambos destinos y stress de
      cadenas largas; locales reales solo si la superficie ya consume i18n.

**Dependencias:** T2.
**Archivos probables:**

- `frontend/src/hub/pages/EngineerPage.tsx`
- `frontend/src/hub/pages/EngineerPage.test.tsx`
- `frontend/src/hub/pages/TelemetryPage.tsx`
- `frontend/src/hub/pages/TelemetryPage.test.tsx`

**Tamaño:** M, 4 archivos.

## T11. Roadmap y Testing Center

**Descripción:** validar filtros, tabs, timeline, formulario y preview. Testing
Center conserva su gate de canal y runner propio.

**Aceptación:**

- [ ] Filtros/tabs Roadmap envuelven sin ocultar estado activo.
- [ ] Formulario/preview Testing Center no cambia bytes, consentimientos ni submit.
- [ ] Roadmap pasa la matriz global; Testing Center pasa la misma matriz en su
      runner especializado, preservando su gate de canal.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- RoadmapPage TestingCenterPage`
- [ ] `corepack pnpm --dir frontend visual:testing-center`
- [ ] runner global para Roadmap y `visual:testing-center` para Testing Center.

**Dependencias:** T2.
**Archivos probables:**

- `frontend/src/hub/pages/RoadmapPage.tsx`
- `frontend/src/hub/pages/RoadmapPage.test.tsx`
- `frontend/src/hub/roadmap/RoadmapProjectTabs.tsx`
- `frontend/src/hub/testing-center/TestingCenterPage.tsx`
- `frontend/src/hub/testing-center/TestingCenterPage.test.tsx`

**Tamaño:** M, 5 archivos.

## T12. Strategy Planner

**Descripción:** adaptar galerías, entry, workspace, comparación e inventario
manteniendo su CSS y runner especializados; no tocar dominio, store ni cálculos.

**Aceptación:**

- [ ] Las cinco superficies Strategy pasan la matriz y conservan acciones.
- [ ] Tablas/grids complejos usan overflow local o recomposición explícita.
- [ ] Drag/drop, dirty state y datos calculados no cambian.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- StrategyPlannerPage`
- [ ] `corepack pnpm --dir frontend visual:strategy-planner`
- [ ] runner global en Strategy con resize en caliente.

**Dependencias:** T2.
**Archivos probables:**

- `frontend/src/hub/strategy/StrategyPlannerPage.tsx`
- `frontend/src/hub/strategy/StrategyPlannerPage.test.tsx`
- `frontend/src/hub/strategy/strategy-planner.css`
- `frontend/scripts/strategy-planner-visual.mjs`

**Tamaño:** M, 4 archivos.

## T13. Overlay Studio: chrome responsive

**Descripción:** adaptar lista, canvas, inspector y action bars al área del Hub.
Antes de editar se lee
`docs/overlays-studio/canvas-drag-imperative-preview.md`. No se modifica
posición transitoria, `layoutViewport`, ViewModels ni renderizadores.

**Aceptación:**

- [ ] Chrome Studio aprovecha ancho y todos sus paneles son accesibles en compacto.
- [ ] Canvas sigue representando literalmente la superficie arbitraria de ISA-326.
- [ ] Drag/resize conserva preview DOM imperativa y un commit en `pointerup`.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test -- src/hub/overlay-studio`
- [ ] `corepack pnpm --dir frontend visual:overlay-studio`
- [ ] `corepack pnpm --dir frontend bench:overlay-studio-drag`
- [ ] runner global en el destino `profiles` para comprobar Studio dentro de
      `V52Shell`.
- [ ] si cambia un baseline especializado: inspección manual, luego
      `visual:overlay-studio:update` y justificación en el commit; nunca
      regeneración automática.

**Dependencias:** T2 e ISA-326 ya integrada en la base.
**Archivos probables:**

- `frontend/src/hub/overlay-studio/OverlayStudioV3.tsx`
- `frontend/src/hub/overlay-studio/OverlayStudioV3.test.tsx`
- `frontend/src/hub/overlay-studio/overlay-studio-v3.css`
- `frontend/scripts/overlay-studio-visual.mjs`

**Tamaño:** M, 4 archivos.

## Checkpoint D: workspaces complejos

- [ ] T10-T13 PASS con runners generales y especializados.
- [ ] Cero diff en negocio, persistencia, geometría de documento o renderers.
- [ ] Benchmark Studio sin regresión material.

## T14. Matriz final, runtime Windows y cierre

**Descripción:** ejecutar el gate estricto ya creado en T0 sobre la matriz
completa, validar escalado real Windows y cerrar evidencia viva.

**Aceptación:**

- [ ] Matriz completa x destinos del Hub PASS, Testing Center PASS en su runner,
      con cuatro capturas revisadas.
- [ ] Smoke Wails PASS a escala 100%, 125%, 150% y 200% cuando el host lo permita.
- [ ] Handoff, Linear y current-plan reflejan solo evidencia realmente
      alcanzada; el fragmento usa la issue de implementación real si aplica.

**Verificación:**

- [ ] `corepack pnpm --dir frontend test`
- [ ] `corepack pnpm --dir frontend build`
- [ ] `corepack pnpm --dir frontend lint`
- [ ] runners global, Calendar, Strategy, Studio, Testing Center y diagnósticos.
- [ ] `git diff --check` y revisión completa del diff.
- [ ] smoke productivo según el handoff, sin imprimir configuración local.

**Dependencias:** T3-T13.
**Archivos probables:**

- `frontend/scripts/hub-responsive-visual.mjs`
- `docs/current-plan.md`
- `docs/vantare-program/handoffs/overlays-launcher-hub.md`

**Tamaño:** M, 3 archivos más el fragmento real si la issue lo requiere y
artefactos temporales ignorados.

## Estrategia de issues y commits

- ISA-337 solo versiona spec, plan y review.
- Tras aprobar el plan se crea una issue de implementación con base exacta y
  write set inicial T0-T2.
- Los checkpoints B-D se convierten en issues hijas solo si el primer baseline
  demuestra que no caben con seguridad en la misma entrega. No se precrea una
  jerarquía especulativa.
- Cada tarea produce un commit focal; staging solo por rutas.
- No se promociona ningún corte sin aprobación inicial de Isaac.
- Si un corte necesita más de cinco archivos productivos, se divide antes de
  editar; los tests y el runner focal cuentan en su write set declarado.

## Política de revisión

1. Revisión técnica read-only de esta spec y plan antes de implementar.
2. Review de diff después de T0-T2 y de cada checkpoint.
3. El revisor busca especialmente reglas globales, excepciones por resolución,
   tests complacientes, ocultación de contenido y cambios de negocio.
4. Un PASS visual no sustituye tests de comportamiento; un test DOM no
   sustituye navegador real.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Alcance transversal | Alto | gate primero, tareas <=5 archivos, checkpoints |
| Runner lento | Medio | 4 tamaños en T0; matriz completa solo en T14; contextos DPR focales |
| Falsos negativos de recorte | Alto | auditar contenedores hidden/clip y bounds de sus descendientes |
| Falsos positivos de overflow | Medio | reportar elemento/métrica; allowlist solo local y justificada |
| CSS global rompe módulos | Alto | ownership local y runner completo tras cada checkpoint |
| Ultrawide se vuelve una fila interminable | Medio | límites por contenido y auto-fit con máximos legibles |
| Compacto oculta acciones | Alto | acciones recuperables, foco y scroll vertical como invariantes |
| Studio pierde paridad | Alto | ISA-326 y runner/benchmark especializados bloqueantes |
| Fable se mezcla con producción | Alto | exclusión expresa y cero lectura como fuente de implementación |
| Lint heredado confunde cierre | Bajo | ejecutar global y separar deuda preexistente de regresiones nuevas |

## Stop conditions

Parar y pedir revisión si:

- el baseline exige navegación, arquitectura o diseño visual nuevos;
- aparece una dependencia nueva;
- un corte supera cinco archivos productivos o cruza dos módulos;
- una corrección requiere cambiar contratos de negocio, Studio o widgets;
- el runner no puede distinguir overflow semántico local de overflow global;
- tests o build fallan por una causa no entendida;
- la base de la issue no coincide con `nightly` declarada;
- se necesita promoción de canal, release o acción reservada a Isaac.

## Definición de terminado

El trabajo técnico completo solo está terminado cuando:

- criterios de la spec y T0-T14 están demostrados;
- suite frontend, build y gates visuales afectados pasan;
- lint no contiene regresiones nuevas;
- smoke Windows cubre tamaños y escalados declarados;
- diff y evidencia reciben review independiente sin críticos;
- handoff, current-plan y Linear coinciden;
- rama, base, HEAD, commit, push, PR, CI y promoción se informan sin confundir
  entrega local con integración o release.

## Preguntas abiertas para revisión

1. ¿El runner general debe quedar como gate de CI en todos los PR o ejecutarse
   solo en issues responsive y promociones? Recomendación: focal durante los
   cortes y bloqueante en el checkpoint final/promociones para controlar coste.
2. ¿La validación manual de escalado Windows 100/125/150/200 se dispone en un
   único monitor o en varios? No cambia código; solo el alcance de evidencia.
3. ¿Qué viewport CSS útil produce la ventana Wails mínima y sus límites están
   expresados en DIP o píxeles físicos? T0 debe medirlo antes de fijar el suelo
   del gate; no cambia el mínimo sin autorización.

Estas preguntas no cambian el alcance aprobado. Isaac autorizó iniciar el
desarrollo el 2026-08-14; la implementación se ejecuta en una issue, rama y
worktree nuevos desde la cabeza vigente de `nightly`.
