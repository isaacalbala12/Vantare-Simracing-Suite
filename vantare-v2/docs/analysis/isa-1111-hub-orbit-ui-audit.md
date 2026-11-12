# ISA-1111 — Auditoría de optimización UI del Hub Orbit

- **Issue:** [#1111](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1111) (`roadmap:not-required`, `area:ui`)
- **Rama:** `vantareapp/isa-1111-hub-orbit-ui-audit`
- **Base:** `origin/nightly@a2958ea1`
- **Fecha:** 2026-09-10
- **Tipo:** investigación (solo evidencia; ningún archivo fuera de `docs/analysis/`)
- **Ámbito:** `vantare-v2/frontend/src/hub/` (shell Orbit + páginas Inicio, Carreras, Ajustes, Strategy, Launcher, Ingeniero, Telemetría, Roadmap, Testing Center y la superficie Studio embebida). Los overlays en juego (entry `overlay.html`) quedan fuera salvo lo que comparten con el Hub.

## Método y comandos

Medidas estáticas reproducibles sobre la base exacta:

```sh
cd vantare-v2/frontend
pnpm install --prefer-offline
pnpm build            # tsc -b && vite build -> dist/ (tabla de chunks)
grep -o 'from"\./[^"]*"' dist/assets/AppShell-*.js | sort -u   # imports estáticos del chunk del Hub
grep -rn "setInterval\|setTimeout\|requestAnimationFrame" src/hub | grep -v test
grep -rn "Events\.On(" src/hub | grep -v test | wc -l          # 76 sitios de suscripción
```

Análisis de código: entry (`main.tsx`, `AppShell.tsx`), shell (`HubApp.tsx`, `components/orbit/OrbitShell.tsx`), hooks de datos (`orbit/use-calendar-starts.ts`, `orbit/use-overlay-state.ts`), providers (`LauncherStoreProvider`, `ChainRunnerProvider`), i18n y CSS (`styles/orbit-*.css`, `fonts.css`, `index.css`).

**Limitación declarada:** la auditoría se ejecutó en macOS. No hay runtime WebView2 real ni PresentMon; el coste de proceso lo certifican los bancos de #891/#912/#924 en Windows y aquí solo se cita como referencia. Nada de lo medido aquí sustituye una prueba física Wails/LMU.

## Estado verificado del trabajo previo (contra código, no contra la issue)

| Trabajo | Estado real en `nightly@a2958ea1` |
| --- | --- |
| #776 (tick de calendario estable, O(doc) historial Studio) | **No integrado.** Vive en `origin/vantareapp/isa-776-ui-perf-corte-1`. El tick de 15 s sigue en `use-calendar-starts.ts:58-61`. |
| #800 (lazy por página con prefetch, modo rendimiento, reloj de Carreras) | **No integrado.** Vive en `origin/vantareapp/isa-nav-perf-corte-1` (40 archivos, +1110/-187: lazy por página + boundary con reintento + SWR del documento Studio + gate `fontsReady`). `OrbitShell.tsx:46-72` sigue importando las 10 páginas de forma estática. |
| #785 (medir coste GPU WebView2 en el Hub) | **No integrado** (rama propia; sin commits en nightly). |
| #829 (remonte de widgets al volver a Studio) | Parcial: `7fe4e1d6` integró la geometría persistida del stage (opción 3). El remonte progresivo de widgets persiste como comportamiento de fondo. |
| #912 (reducir coste renderer/host con profiling) | Solo instrumentación (`4aa8ac7f`, PR #927): modo profile CDP, resumen `.cpuprofile`, benchmark del pull. La reducción en sí sigue abierta. |
| #924 (banco de medida F0) | Integrado (`b2010ec3`, `c93d93ba`, `c4eb1168`): banco Windows ETW/PresentMon. |
| #943 (perfil v4 + Ajustes › Rendimiento) | Integrado (`ade6f561`, `9723148f`). |

Consecuencia directa: **las tres medidas de mayor impacto ya desarrolladas (lazy por página, tick estable, medición GPU) están escritas pero no integradas.** El primer paso de optimización no es escribir código nuevo sino decidir la integración de esas ramas.

## Medidas

### Carga eager del Hub (entry `index.html` → `#/hub`)

`AppShell-*.js` importa estáticamente `widget-visibility`, `studio-profile-client` y `builtin-systems` (evidencia: `from"./widget-visibility-BNiyhKh4.js"` dentro del chunk). Lo que se descarga, parsea y ejecuta al arrancar el Hub:

| Recurso | Bytes | Contenido |
| --- | ---: | --- |
| `index-*.js` | 5.972 | entry, temas JSON, `AppBootFallback` |
| `preload-helper-*.js` | 192.282 | runtime compartido (modulepreload) |
| `AppShell-*.js` | **1.053.550** | las 10 páginas Orbit + `overlay-studio` completo + auth + i18n |
| `widget-visibility-*.js` | **925.777** | renderers de todos los widgets (dep. estática vía Studio) |
| `studio-profile-client-*.js` | 74.829 | persistencia del Studio |
| `builtin-systems-*.js` | 10.161 | registro de design systems |
| **JS total eager** | **≈ 2.262.571 (2,26 MB)** | ~630 kB gzip |
| `preload-helper-*.css` | 284.984 | Tailwind v4 + keyframes de widgets (`ven-red-*`) + `@font-face` |
| `AppShell-*.css` | 151.220 | `orbit-*.css` de todas las páginas |
| `widget-visibility-*.css` | 61.643 | CSS de widgets (acompaña al chunk JS) |
| **CSS total eager** | **≈ 497.847 (≈ 0,5 MB)** | render-blocking |
| Fuentes que usa el Hub | ~436-580 kB | Inter variable 48 kB + **CascadiaCode.ttf 388 kB** (+ Jakarta/JetBrains donde aplique cristal) |

Para comparar, el entry de overlay (`overlay.html`) arranca con 1.289 B de JS: el contraste confirma que la página paga el coste de superficies que quizá nunca abra.

### Suscripciones y actividad en reposo

Conteo de suscripciones `Events.On` que quedan activas con el Hub montado en Inicio, sin tocar nada:

- `HubShell` (`HubApp.tsx:136-206`): 7 suscripciones + 4 `Emit` de arranque (`app:version:get`, `telemetrySourceStatusRequest`, `settings:get`, `updater:settings:get`).
- `OrbitShellBody` (`OrbitShell.tsx:167-210`): 5 suscripciones de updater.
- `useOverlayState` (`use-overlay-state.ts:29-70`): 4 suscripciones + 3 `Emit` (`hub:list`, `settings:get`, `overlay:status:get`).
- `useCalendarStarts` (`use-calendar-starts.ts:44-61`): 4 suscripciones + 2 `Emit` + `setInterval` 15 s.
- `useNotificationPreferences`: 1 suscripción a `settings`.
- `LauncherStoreProvider` (`LauncherStoreProvider.tsx:17-19`): `store.start()` suscribe snapshot + progreso de discovery al bridge Wails desde el arranque.
- `ChainRunnerProvider` (`ChainRunnerProvider.tsx:25-28`): 2 suscripciones (`launcher:chain:step/done`).
- `hub-suspend-guard` (`hub-suspend-guard.ts:86`): 1 suscripción `hub:can-suspend` + listener de visibilidad.
- `SideRaces` (`SideRaces.tsx:34`): `setInterval` 1 s mientras la columna está abierta.
- `ScheduleReviewNotice` (`ScheduleReviewNotice.tsx:12-30`, solo owner): 1 suscripción + `Emit` + `setInterval` 60 s + listeners `focus`/`visibilitychange`/`storage`, montado en **todas** las vistas no-Studio (`OrbitShell.tsx:588`).

Total aproximado en reposo: **~25 suscripciones Wails, ~10 peticiones al backend, 3 intervalos permanentes** (1 s / 15 s / 60 s).

### Lo que ya está bien (no reabrir)

- `AppRuntime` es `lazy` (`main.tsx:13`); el fallback de boot es ligero.
- Studio usa `OrbitKeepAlive` con `activityGate` que **sí pausa la telemetría** al ocultarse (`StudioTelemetryProvider.tsx:23,85`); el patrón existe y es correcto.
- `CommandPalette` devuelve `null` cerrada (`CommandPalette.tsx:31`).
- `LicenseGate` ya no destruye el árbol del Hub en revalidaciones (`HubApp.tsx:37-103`).
- El zoom responsive ya va coalescido por `requestAnimationFrame` con medición real documentada (`use-orbit-responsive-zoom.ts:42-54`).
- El guard de suspensión del Hub (ISA-940) responde a `hub:can-suspend` con blockers reales.
- `updateNews` y `blocks` están memoizados; `orbitStore` tolera `localStorage` ausente.

## Hallazgos

### P1 — El Hub paga por adelantado todas las páginas, el Studio y los renderers de widgets

`OrbitShell.tsx:46-72` importa estáticamente las 10 páginas (`StrategyOrbitPage` son 3.825 líneas con sus stores; `StudioRoute` arrastra todo `overlay-studio` → `WidgetVisualHost` → `widget-visibility` 926 kB). Resultado: 2,26 MB de JS + 0,5 MB de CSS parseados antes de pintar Inicio, aunque la sesión nunca salga de Inicio. En WebView2 el coste no es de red (es local) sino de **parseo/compilación/ejecución del hilo principal**, y además queda residente en memoria todo el tiempo.

La corrección ya existe sin integrar: rama `origin/vantareapp/isa-nav-perf-corte-1` (#800) implementa `lazy` por página + boundary con reintento + prefetch. Propuesta: **issue de integración/actualización de #800** en vez de rehacer el trabajo; verificar su diff sobre la nightly vigente (el branch lleva semanas sin mergear y hubo movimiento en `OrbitShell`).

### P1 — Cada navegación desmonta la página y repite el handshake Wails

La cadena de ternarios `OrbitShell.tsx:590-620` monta solo la vista activa (salvo Studio, keep-alive). En cada ida y vuelta la página re-suscribe sus eventos y **re-emite las peticiones de datos**: `useOverlayState` emite `hub:list` + `settings:get` + `overlay:status:get` en cada montaje (`use-overlay-state.ts:61-63`); `useCalendarStarts` emite `calendar:get` + `calendar:refresh:status:get` (`use-calendar-starts.ts:53-54`).

Agravante: los hooks no son singletons. `useOverlayState` se instancia en la shell (`OrbitShell.tsx:131`), en el topbar del Studio (`StudioTopbarControls.tsx:36`) y **dos veces** en Ajustes (`SettingsOrbitPage.tsx:794` y `:1382`) → hasta 3 instancias simultáneas = 12 suscripciones y 9 peticiones duplicadas. `useCalendarStarts` se instancia en la shell, en `ScheduleImportSection` (Ajustes) y en `StrategyOrbitPage.tsx:419` → doble tick de 15 s y doble petición de calendario.

Propuesta: promover ambos a stores de módulo con suscripción única (patrón `launcher-store-core`/`calendar-store`, que ya existe en el repo) o, como mínimo, deduplicar las instancias dentro de `SettingsOrbitPage`. Esto reduce a la vez trabajo en reposo y coste de remonte, y es independiente del lazy de #800.

### P2 — Ticks perpetuos que re-renderizan la shell en reposo

- `SideRaces` tickea cada 1 s (`SideRaces.tsx:34`) para la cuenta atrás: re-render continuo del bloque mientras la columna está abierta. La cuenta atrás podría derivar del `tick` de 15 s de la shell, o de un tick que solo exista cuando la próxima salida está cerca (a >1 h de precisión de minuto basta 30 s).
- `useCalendarStarts` tickea cada 15 s (`use-calendar-starts.ts:58-61`) en la shell: `buildRaceStarts` devuelve una **nueva** array en cada tick → invalida el memo `blocks` (`OrbitShell.tsx:333-406`) → re-renderiza la columna entera aunque las salidas no hayan cambiado. La corrección "tick estable" ya está escrita en la rama de #776.
- `ScheduleReviewNotice` (owner): 60 s + focus + visibilitychange + `Emit` por refresh en cada vista no-Studio.

Ninguna es cara por sí sola; juntas mantienen al renderer despertando cada segundo con el Hub abierto. Propuesta: integrar/actualizar #776 y revisar la cadencia real que necesita cada consumidor.

### P2 — CSS monolítico render-blocking de 0,5 MB

`index.html` enlaza `preload-helper-*.css` (285 kB) antes de pintar: contiene Tailwind completo, 25 `@keyframes` de diseños de widgets overlay (`ven-red-*`, `ven-rel-*`, `ven-dred-*` — nada de esto se usa en el Hub) y 17 `@font-face`. `AppShell-*.css` (151 kB) agrega las `orbit-*.css` de todas las páginas, visitadas o no. La división por página iría gratis con el lazy de #800; mientras tanto la hoja compartida mezcla dos superficies (hub y overlay) con necesidades distintas.

Además `fonts.css` declara todo con `font-display: block` (Inter, Cascadia, Rajdhani, Space Mono): bloquea el primer texto hasta descargar la fuente; y `CascadiaCode.ttf` pesa 388 kB en TTF — el mismo archivo en woff2 rondaría ~150-190 kB. Las 4 TTF `tower-*` (~476 kB) solo sirven al widget Tower.

Propuesta: issue de división de CSS por superficie + conversión de Cascadia a woff2 + revisión deliberada de `font-display` (block es intencional para overlays; para el Hub `swap`/fallback puede ser mejor).

### P3 — Sin `React.memo` en las piezas permanentes de la shell

`Rail`, `Topbar`, `ContextColumn`, `SideRaces`, `SideProfile`, `SideLauncher` no están memoizados. Cualquier `setState` de `OrbitShellBody` — y hay muchos: `sourceStatus` (cada cambio de estado de telemetría), `update`, `settings`, tick de carreras — re-renderiza todo el árbol de la shell incluida la columna y la topbar. Con la superficie actual el coste es pequeño pero constante; con memo + props primitivas pasaría a ~0 en reposo. Propuesta: memo selectivo medido, no masivo (regla `rerender-memo`).

### P3 — Diccionarios i18n eager (656 kB fuente)

`i18n/i18n.ts:1-12` importa los 4 locales completos (es/en/pt/it × 14 namespaces ≈ 656 kB de fuente TS). Solo un idioma está activo. En el bundle minificado es menor, pero sigue siendo código muerto al 75 % en cada sesión. Propuesta: lazy por locale (cada locale como chunk dinámico) o extracción a JSON servido bajo demanda. Impacto modesto; encaja dentro de la issue de bundle.

### P3 — Assets muertos en el build productivo

`dist/assets/tower-reference-*.png` (1.866 kB) solo lo importa `OverlayWorkshopDevRoute` (`import.meta.env.DEV`), pero se emite a `dist` y viaja embebido en el binario Wails. Igual para las `tower-*.ttf` si el fixture no las usa. No cuestan runtime; cuestan tamaño de artefacto. Propuesta: excluir assets de la ruta dev del bundle productivo o moverlos a un directorio servido solo en dev.

### P3 — Listeners globales acumulados en ventana/documento

Conteo de listeners permanentes sobre `window`/`document` con la shell montada: `resize` (OrbitShell + `useOrbitResponsiveZoom` + páginas con su propio resize), `keydown` (paleta Ctrl+K en `OrbitShell.tsx:487` + atajos de zoom en `use-orbit-responsive-zoom.ts:157`), `wheel` no-pasivo (`:158`, necesario para `preventDefault` del zoom Ctrl+rueda pero evalúa cada rueda), `focus`/`visibilitychange`/`storage` (notice + guard). Cada uno es barato, pero el `wheel` no-pasivo es el único que puede retrasar scroll. Propuesta: revisar junto con la consolidación de listeners (`client-event-listeners`).

## Propuesta de issues de corrección (en orden)

1. **Integración del lazy por página** — rebase/verificación de `isa-nav-perf-corte-1` sobre nightly vigente, con los gates de siempre. Cierra P1-bundle y parte del coste percibido de navegación. (`roadmap:required`, `area:ui`)
2. **Stores de datos compartidos del Hub** — `useOverlayState`/`useCalendarStarts` a suscripción única de módulo; elimina los handshakes duplicados y el remonte caro. (`roadmap:required`, `area:ui`)
3. **Cadencias de la shell** — integrar #776 (tick estable) + revisar `SideRaces` 1 s y `ScheduleReviewNotice` 60 s. (`roadmap:required`, `area:ui`)
4. **División de CSS y fuentes** — CSS por superficie/página, Cascadia→woff2, `font-display` revisado, assets dev-only fuera del build. (`roadmap:required`, `area:ui`)
5. **Memo selectivo de la shell** — tras 1-3, medir y aplicar `React.memo` donde el re-render siga siendo visible en perfil. (`roadmap:required`, `area:ui`)

Dependencias: 1 es el de mayor impacto y desbloquea la división de CSS (4); 2-3 son independientes entre sí y pequeños; 5 va el último porque sus números dependen de los anteriores.

## Evidencia añadida / no ejecutada

- Ejecutado: `pnpm install`, `pnpm build` (exit 0, tabla de chunks real de esta base), inspección de `dist/`, greps de suscripciones/timers/imports sobre `src/hub`.
- No ejecutado: `pnpm test`/`lint` (el diff no toca código), profiling WebView2/ETW (macOS; pertenece al banco Windows de #924), ni medición de navegación real (requiere la app corriendo; propuesta como criterio de aceptación de las issues 1-3).
- `git diff --check` se verificará antes del commit del informe.
