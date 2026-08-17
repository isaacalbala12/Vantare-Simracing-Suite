# Briefing 01 · Shell (rail, columna contextual, topbar, paleta)

## Objetivo
Sustituir la shell actual (`AppShell.tsx`, `ProSidebar`, `Topbar`) por la de Orbit, manteniendo dentro las páginas actuales hasta que cada una se porte. Feature flag `hub.orbit` para convivencia.

## Alcance
- `AppShell.tsx`: grid `81px 296px minmax(0,1fr)`; `.collapsed` → `81px 0 1fr` (transición 220 ms). Body `min-width:1180px`.
- `hub/components/orbit/Rail.tsx`: marca (losa 49px + chevrón), botones 52px con `Icon` 23px/1.75, orden fijo (`03 · 3.2`), Testing Center solo si canal ≠ stable, `aria-current`, bloqueados por plan con candado + `Tooltip` con motivo, `soon` para Telemetría; abajo: plegar columna (`aria-pressed`, deshabilitado sin contenido), paleta, Ajustes, avatar (→ Cuenta).
- `hub/components/orbit/ContextColumn.tsx`: cabecera (título por sección, versión, ‹ plegar), slot de contexto por sección (vacío hasta que cada briefing lo rellene), bloques persistentes `SideRaces` (3 próximas con "en mm:ss", tick 1 s), `SideProfile` (activo con ▶ abrir/detener + recomendado), `SideLauncher` (2 perfiles con ▶); regla `hiddenFor` (Carreras/Studio/Launcher) y ocultar todos en Ajustes; pie: `Pill` LMU (única fuente textual del estado del sim) + `Pill` plan.
- `Topbar.tsx`: eyebrow + `/` + h1 por vista; en Studio: selector de perfil 260px + `Button state=dirty|saved` + `Button state=running`; derecha: pill de actualización (oculto en `none`). Quitar densidad y estado LMU de aquí.
- `hub/components/orbit/CommandPalette.tsx`: Ctrl K / botón / superficie de comando; grupos "Ir a" (10 destinos + Cuenta) y "Acciones" (abrir/detener overlay, guardar); filtro en vivo, oculta grupos vacíos, ↑↓ ↵ Esc, ítems bloqueados con "Requiere <plan>".
- Persistencia `vantare.orbit.{view,sidebar,rightDock,density}` con wrapper tolerante.
- Sin `title` nativo en el rail; tooltips propios (`data-tip`) visibles con hover **y** foco.

## Criterios de aceptación
- [ ] Todas las páginas actuales cargan dentro de la nueva shell con `hub.orbit=true`.
- [ ] Rail: activo con barra izquierda 3×19 y fondo degradado; bloqueado (plan Free → Estrategia) muestra candado y tooltip "Requiere el plan Overlays · plan actual Free"; clic → toast de acceso.
- [ ] Columna: en Inicio muestra los 3 bloques arriba; en Carreras oculta "Próximas carreras"; en Ajustes solo muestra su contexto; plegar desde rail y desde ‹; preferencia persiste; ≤ 1152px auto-plegada.
- [ ] Pie de columna siempre visible a 1920×900 (sin recorte).
- [ ] Topbar Studio: Guardar deshabilitado en `saved`, punto rojo en `dirty`; Abrir overlay ↔ Detener overlay (verde).
- [ ] Ctrl K abre paleta con foco en el input; escribir "guard" oculta el grupo "Ir a"; ↵ ejecuta; Esc cierra.
- [ ] Capturas de la shell en Inicio (1080 y 900) coinciden con `evidence/inicio.png` / `inicio-900.png` en rail, columna y topbar.

## Referencias
`03-shell-y-layout.md`, `05-patrones.md § 5.1–5.2`, `12` (RailProps, ContextColumnProps, TopbarProps, CommandPaletteProps), `14 shell.*`.
