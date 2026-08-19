# 10 · Plan de porte al frontend real

Stack real: React 19 · Vite 8 · Tailwind 4 (`@theme` en `frontend/src/index.css`) · Wails 3 · temas JSON aplicados por `frontend/src/lib/theme.ts` · i18n propio (`frontend/src/i18n`) · Vitest + Testing Library · Playwright (`visual:*`).
Páginas existentes: `frontend/src/hub/pages/{Dashboard,Calendar,Engineer,Launcher,OverlaysStudio,Profiles,Roadmap,Settings,Telemetry}Page.tsx`, `hub/strategy`, `hub/testing-center`, `hub/components/*` (Topbar, ProSidebar, HubSubnav, ActiveOverlayCard…), `AppShell.tsx`.

## Principios del porte
1. **Tokens primero, píxeles después.** Nada se hardcodea: todo sale de `orbit.tokens.css` / tema.
2. **Componentes antes que páginas.** Un kit `ui/orbit/*` reutilizable; las páginas lo componen.
3. **Paridad visual verificable.** Cada fase termina con capturas Playwright comparadas con el HTML a 1920×1080 y 1920×900.
4. **Datos reales desde el día uno.** Los mocks del prototipo se sustituyen por los contratos existentes (calendar-lmu.json, launcher-contract, strategy-contract-v1, roadmap-source.json, Telemetry Core).
5. **Sin regresión funcional.** El Studio V3, licencias, launcher y calendario mantienen su lógica; cambia la piel y la disposición.

## Fase 0 · Fundamentos (1 sprint) — HECHA
- Añadir `frontend/src/themes/vantare-orbit.json` (desde `vantare-orbit.theme.json`) y **extender** `VantareTheme` (`coral, ember, cyan, line, lineStrong, primaryBg, primaryInk`, `radius/row/space`, `railWidth/columnWidth/topbarHeight`, `ease`) en `lib/theme.ts` + `cssVarsFromTheme`; mapear a `@theme` en `index.css` (`--color-orbit-*`, `--radius-orbit`, etc.).
- Cargar `orbit.tokens.css` (o su equivalente en `@theme`) y `fonts.css` con **Inter y Cascadia Code locales** (sin Google Fonts).
- Sprite de iconos como componente `<Icon name="i-inicio" />` (SVG symbols en `assets/orbit-icons.svg`).
- Selector de densidad → `document.body.dataset.density` (ya existe `?density`).
- **Definición de hecho**: `pnpm --dir frontend test` verde; storybook/harness (`topbar-visual-harness`) muestra tokens; capturas de un panel y un botón primario coinciden.

## Fase 1 · Shell (1 sprint) — HECHA
- `AppShell.tsx`: grid `81px 296px 1fr` con **Rail** (nuevo `hub/components/orbit/Rail.tsx`), **ContextColumn** (`ContextColumn.tsx` con slots por sección + bloques persistentes `SideRaces`, `SideProfile`, `SideLauncher` y pie `SimPill`+`PlanPill`), **Topbar** (adaptar `Topbar.tsx`: contexto por vista, sin densidad ni estado LMU; en Studio, perfil + Guardar + Abrir overlay).
- Navegación: mapear `hub/navigation.ts` a `VIEW_IDS`; `aria-current`; persistencia `vantare.orbit.*`.
- Gating: reutilizar `AccessGate` para candados/tooltips con motivo (`REQUIRED_PLAN`).
- Paleta de comando: nuevo `CommandPalette.tsx` (Ctrl K) con registro de destinos/acciones.
- Tooltips del rail (`data-tip`), plegado y regla `data-for` de duplicados; Ajustes oculta bloques.
- **DoD**: navegar por todas las secciones con la nueva shell (páginas actuales dentro), capturas del shell en 1080/900.

## Fase 2 · Kit de componentes (1–2 sprints) — HECHA
`frontend/src/ui/orbit/`: `Button` (primary/ghost/danger/sm, run/save states), `IconButton`, `Seg`, `Toggle`, `Input/Select/Textarea/Field`, `Pill`, `Chip` (tier/tyre), `StateChip`, `SubtleStatus`, `Kbd/Keycap`, `StatTile/StatRow`, `Panel/Surface(+Head)`, `Featured` (borde degradado), `ListRow` (ctx-row), `Monogram`, `Menu`, `Accordion` (details), `UnderlineTabs`, `Toast` (region), `Note`, `Tooltip`.
Cada uno con story/harness, tests de estados y tokens; sin CSS ad hoc en páginas.

## Fase 3 · Inicio + Ajustes (1 sprint) — HECHA
- `DashboardPage.tsx` → Inicio: `Hero` (saludo + `CommandSurface` + quick actions + `CountdownDial` con `nextStarts` del calendario real), `FocalProfile` (mini-lienzo con el **renderer real de widgets** en un contenedor cq: reutilizar host V3 en modo preview), `RacesPanel`, `ProfilesPanel`. Política de alturas (`03 · 3.6`).
- `SettingsPage.tsx` → cinco secciones con la columna contextual como navegación; Atajos con el contrato real de hotkeys; canales según licencia; changelog desde `docs/changelog.md`/release notes.
- **DoD**: capturas Inicio y las 5 de Ajustes; `?stress` equivalente en harness.

## Fase 4 · Studio + Launcher (1 sprint) — HECHA
- `OverlaysStudioPage.tsx`: lista de widgets a la columna contextual; inspector con acordeones (`inspector-sections.ts` ya define Design/Appearance/Content/Behavior/Layout/Actions → mapear Diseño=Design+Appearance, Comportamiento=Behavior+Content, Layout=Layout+Actions o mantener 6 acordeones); toolbar/statusbar/estado dirty.
- `LauncherPage.tsx`: `stat-row`, catálogo con monogramas (gradiente del contrato), tarjetas de perfil con cadena y políticas, "Crear perfil".
- **DoD**: `visual:overlay-studio` actualizado; e2e existentes verdes.

## Fase 5 · Carreras (1 sprint) — HECHA
- `CalendarPage.tsx`: motor `nextStarts` (intervalo/offset, slots UTC) sobre `configs/calendar-lmu.json` + seguimiento/recordatorios reales (`calendar:reminder`); cinco vistas; detalle; filtros en la columna.
- **DoD**: capturas de las 5 vistas; test unitario del motor con series de intervalo y semanales; timezone.

## Fase 6 · Estrategia (2 sprints) — HECHA
- `hub/strategy`: panel de evento sobre `strategy-contract-v1` (`StrategyEditorDocument`: stints, tyres con compound/condition/corner/state/origin, manualInputs). Componentes `EventHeader`, `RaceTimeline`, `LapDonut`, `StintList` (+`StintEditor`, `PitRow`), `DriversPanel`, `TyreInventory` (DnD con alternativas), `AvailabilityBoard`, `StrategyCards`. Planificador en dominio (`strategy-editor.ts`) — el del prototipo es referencia de comportamiento, no de código.
- **DoD**: `visual:strategy-planner` actualizado; tests de planificador (overrides, rotación, veredicto por vueltas); a11y del DnD.

## Fase 7 · Ingeniero + Telemetría + Roadmap (1–2 sprints) — HECHA
- `EngineerPage.tsx`: módulos, voz, salidas, radio real (`visual:engineer-radio` existe).
- `TelemetryPage.tsx`: estructura mapa→trazas→insights sobre sesiones DuckDB (ADR 0005) cuando exista TA-02+; hasta entonces estado vacío honesto.
- `RoadmapPage.tsx`: fases/áreas/hitos desde `roadmap-source.json`.

## Fase 8 · Cierre — EN CURSO (ISA-368)
- Retirar el sistema v5 del hub (clases `card-sleek`, `glass-panel`, uppercase de chrome) y actualizar `docs/DESIGN.md` para apuntar a este paquete como sistema del hub.
- Auditoría de accesibilidad (`08`) y de contenido (`09`); QA final (`11`).

## Mapeo rápido prototipo → código
| Prototipo | Destino |
|---|---|
| `:root` tokens, `[data-density]` | `themes/vantare-orbit.json`, `lib/theme.ts`, `index.css @theme` |
| `.shell/.global-rail/.sidebar/.topbar` | `AppShell.tsx`, `hub/components/orbit/{Rail,ContextColumn,Topbar}.tsx` |
| `.palette*` | `hub/components/orbit/CommandPalette.tsx` |
| `.btn*, .seg, .toggle, .pill, .chip, .stat, .surface…` | `ui/orbit/*` |
| `#view-inicio` | `hub/pages/DashboardPage.tsx` |
| `#view-studio` | `hub/overlay-studio/*` (inspector: `inspector/*`) |
| `#view-launcher` | `hub/launcher/*`, `LauncherPage.tsx` |
| `#view-carreras` | `hub/calendar/*`, `CalendarPage.tsx` |
| `#view-estrategia` | `hub/strategy/*`, `strategy/*` |
| `#view-ingeniero` | `hub/pages/EngineerPage.tsx`, `engineer/*` |
| `#view-telemetria` | `hub/pages/TelemetryPage.tsx` |
| `#view-roadmap` | `hub/roadmap/*`, `RoadmapPage.tsx` |
| `#view-ajustes` | `hub/settings/*`, `SettingsPage.tsx` |
| `#view-testing` | `hub/testing-center/*` |
| Sprite `i-*` | `assets/orbit-icons.svg` + `<Icon>` |
| Logos data-URI | `assets/brand/mark.png`, avatar desde cuenta |

## Riesgos y mitigaciones
- **Dos sistemas conviviendo** durante el porte → feature flag `hub.orbit` por página; shell nueva desde la fase 1 con páginas viejas dentro. **(El porte está completo; el flag `hub.orbit` y la shell V52 se están retirando en ISA-368.)**
- **Mini-lienzo con widgets reales** puede ser costoso → renderer V3 en modo preview estático (sin telemetría) o captura rasterizada cacheada.
- **Tipo `VantareTheme` rígido** → extender con campos opcionales y valores por defecto Orbit.
- **Fuentes** → empaquetar Inter/Cascadia; fallback a Segoe UI Variable.
- **Escala Windows 125–150 %** → revisar alturas ≤ 940px; política de scroll interno.
- **DnD en Wails/WebView2** → probar drag nativo; alternativas de clic/teclado son obligatorias.

## Estado (2026-08-19)

- **Fases 0–7 completadas** e integradas en `nightly`: commit `af2c90d1` (PR #279, "HUD-ORBIT — porte completo de Command Orbit v0.3 al hub") dentro de la release **v0.1.0.7-nightly.10**.
- **Fase 8 en curso** en **ISA-368**: retirada del sistema v5 del hub (clases `card-sleek`, `glass-panel`, uppercase de chrome, `ProSidebar`/`V52Shell`) y del flag `hub.orbit`, y sincronización de `docs/DESIGN.md` con este paquete.
- **Próximos pasos:** revisión de código / limpieza del porte, y decisión de promoción a `testers`.

## Definición de hecho global
Tokens en tema · shell nueva · kit completo · 9 páginas + Testing en Orbit · paridad visual documentada (capturas por página en `docs/design/orbit-v03/evidence/`) · a11y y contenido auditados · `DESIGN.md` actualizado · HTML del prototipo archivado como referencia histórica.
