# 03 · Shell y layout

## 3.1 Estructura

```
┌──────┬────────────────┬──────────────────────────────────────────────┐
│ rail │ columna        │ topbar (70px)                                 │
│ 81px │ contextual     ├──────────────────────────────────────────────┤
│      │ 296px          │ workspace (vista activa)      │ dock derecho │
│      │ (plegable → 0) │                               │ (opcional)   │
└──────┴────────────────┴──────────────────────────────────────────────┘
```
`.shell { display:grid; grid-template-columns: 81px 296px minmax(0,1fr); height:100vh }` · plegada: `81px 0 minmax(0,1fr)` con transición 220 ms. Body `min-width: 1180px; overflow-x: auto; overflow-y: hidden`.

## 3.2 Rail global (81px, `#0b0c0e`)
- Marca arriba (losa 49px con el chevrón), botones 52×52 radio 14 con icono 23px stroke 1.75, `gap 8px`, `padding 16px 10px`.
- Orden: Inicio · Overlays Studio · Launcher · Carreras · Estrategia · Ingeniero · Telemetría (con punto ámbar "próximamente") · Roadmap · [Testing Center si canal ≠ stable] · — abajo: **plegar columna** · Comando (Ctrl K) · Ajustes · Avatar (→ Cuenta).
- Estado activo: fondo `linear-gradient(135deg, rgba(213,47,73,.24), rgba(255,106,95,.07))`, anillo interior `rgba(240,71,85,.22)`, barra izquierda 3×19px `--red` con glow. Bloqueado por plan: color `#4d4a50` + candado 15px abajo-derecha + tooltip con el motivo.
- Tooltips propios: `data-tip` (no `title`), a la derecha (`left: calc(100% + 14px)`), `#1c1c21`, 12.5px/600, aparecen con hover y con foco de teclado. Requiere `overflow: visible` en el rail.

## 3.3 Columna contextual (296px, `#0f1013`)
Cabecera: título de la sección (`#contextTitle`, 14px/700), pill de versión con punto verde, botón plegar (‹).
Cuerpo (`.ctx-panel`, uno por sección, `flex: 1 1 auto; min-height:160px; overflow-y:auto`):
| Sección | Contenido contextual |
|---|---|
| Studio | Widgets del perfil (búsqueda, lista con ojo, "Añadir widget") |
| Carreras | Categoría (Todas/Bronce/Plata/Oro/Semanal con punto) + **Seguidas** con hora y cuenta atrás |
| Launcher | Perfiles con ▶ · Catálogo (n · detectadas) |
| Estrategia | Estrategias del evento (estado, stints, paradas) · Otros eventos · **Nueva estrategia** |
| Telemetría | Sesiones grabadas (circuito, coche, fecha, vueltas, mejor) |
| Roadmap | Fases con % (salta a la fase) |
| Ajustes | Secciones (Cuenta, Aplicación, Actualizaciones, Atajos, Diagnóstico) |
| Inicio, Ingeniero, Testing | sin contexto |

Bloques persistentes (`.side-data`, `flex: 0 1 auto; overflow-y:auto`), debajo del contexto o arriba si no hay: **Próximas carreras** (3, hora + "en mm:ss", ✓ seguidas) · **Perfil de overlay** (activo con ▶ abrir/detener + recomendado) · **Launcher** (2 perfiles con ▶). Regla `data-for`: el bloque se oculta cuando la sección activa lo muestra en su contexto (Carreras, Studio, Launcher). En **Ajustes** se ocultan todos.
Pie (anclado, `margin-top:auto`): pill **LMU** (única fuente textual del estado del sim) + pill del **plan** (→ Cuenta).
Plegado: botón del rail (aria-pressed) o ‹ de la cabecera; preferencia persistida; auto-plegada ≤ 1152px; deshabilitado cuando no hay nada que mostrar.

## 3.4 Topbar (70px, translúcida)
Izquierda: contexto de la vista — eyebrow ("Centro operativo") + `/` + h1 (16px/650). En Studio añade selector de perfil (260px) y botones **Guardado/Guardar** (ghost con punto rojo si hay cambios) y **Abrir/Detener overlay** (primario; verde translúcido cuando está en directo). Derecha: pill de actualización (oculto si no hay). No hay densidad ni estado de LMU aquí.

## 3.5 Workspace
`.content { flex:1; min-height:0; position:relative }` · vistas `.view` (display none/block, Studio grid). Contenido centrado `min(1508px, 100% - 62px)` con `padding 24px 0`.
Vista de producto: `.module-head` (eyebrow + h2 31px + p) con acciones a la derecha, y debajo grids específicos. Fondo con radial carmín suave arriba (`.product-view`).

## 3.6 Política de alturas (sin scroll de página)
- **Inicio**: `.inicio-wrap` flex column 100%: hero (236px) → focal → grid inferior `minmax(0,1fr)` con paneles `display:flex; min-height:0` y listas `overflow:auto`. ≤ 940px alto: hero 200, dial 200, focal 340px de mini-lienzo sin descripción, cabeceras 50px.
- **Carreras / Telemetría / Estrategia / Ingeniero**: `.module-wrap { height:100%; display:flex; flex-direction:column }`, la rejilla principal `flex:1; min-height:0; align-items:stretch`, y el panel que crece con `overflow:auto` interno (lista de próximas, timeline horizontal, insights, stints, radio).
- **Launcher / Roadmap / Ajustes**: caben a 1080; por debajo hacen scroll de vista como respaldo.
- Studio: grid `minmax(0,1fr) 395px` (`right-closed` → `0`), stage 16:9 con `container-type: inline-size`, statusbar 39px.

## 3.7 Responsive
| Condición | Efecto |
|---|---|
| ≤ 1500px ancho | oculta el rótulo "Browser View" (solo icono) |
| ≤ 1152px ancho | columna 216px y auto-plegada; hero a una columna (sin dial); rejillas a 2 columnas; inspector 264px; grids internos estrechados |
| ≤ 940px alto | Inicio compacto (ver 3.6) |
| ≤ 790px alto | padding superior 21px, hero-side 210px |
| reduced motion | animaciones y transiciones a 0 |
