# Briefing 03 · Inicio (`?view=inicio`)

## Objetivo
Portar `hub/pages/DashboardPage.tsx` al Inicio de Orbit: hero de comando con dial, focal del perfil activo con widgets reales, próximas carreras y perfiles. Sin scroll de página; compacto ≤ 940px de alto.

## Estructura (de arriba abajo)
1. **Hero** (grid `1fr 300px`, gap 40): izquierda `greet` (saludo por franja horaria + punto de estado del sim, solo color), `Featured` **command surface** (86px; icono 44 con degradado de marca; "Busca, abre o lanza algo en Vantare…" + ejemplo; kbd Ctrl K; abre paleta), quick chips (Abrir Studio · Abrir overlay · Crear plan · Lanzar perfil). Derecha `CountdownDial` (236px; 200 compacto) con `next-race` (eyebrow "Próxima serie", nombre · circuito, "en mm:ss" 20px mono, "Cada N min · Tier", botón → Carreras).
2. **Focal** (`Featured`, ancho completo, grid `1fr 470px`): eyebrow "Perfil activo", h2 = nombre del perfil, descripción "delta, relative y standings en el lienzo · Overlays Studio", meta (`1920 × 1080` · `n widgets visibles` · estado del overlay con punto), botones Abrir Studio (primary) / Abrir overlay (ghost), ↗; `MiniStage` con el perfil activo.
3. **Grid 12** (`flex:1; min-height:0`): Próximas carreras (7 col; 4 filas `ListRow` con hora mono a la izquierda —la primera coral—, serie, circuito · nota, chip de licencia; lista con scroll interno) · Perfiles (5 col; activo con tick "Activo", recomendado con "Activar"). Actividad reciente oculta si vacía.

## Datos reales
Perfil activo y widgets: `settings.activeOverlayProfileId` + `hub:profiles`; estado overlay: `overlay:status`; próximas salidas: motor `nextStarts` (`13.3`) sobre `configs/calendar-lmu.json` y series seguidas; sim: `telemetry:source-status`; plan: licencia.

## Comportamiento
- Dial y "en mm:ss" se actualizan cada segundo; al pasar la salida se recalcula la siguiente.
- Abrir/Detener overlay desde la focal cambia el meta y el topbar/columna (una fuente).
- Clic en fila de carrera → Carreras con esa serie seleccionada; "Ver todas" → Carreras; "Gestionar" → Studio/Perfiles.
- ≤ 940px alto: hero 200, dial 200, focal sin descripción y mini-lienzo 340, cabeceras 50px.

## Criterios de aceptación
- [ ] A 1920×1080 y 1920×900 no hay scroll de página; las 4 carreras se ven a 900 (lista con scroll interno si hiciera falta).
- [ ] El mini-lienzo muestra los widgets **reales** del perfil activo en su posición y escala (no cajas grises).
- [ ] El estado del sim aparece como texto solo en el pie de la columna; en el hero solo el punto de color.
- [ ] Al seguir/dejar de seguir una serie en Carreras, el dial cambia de objetivo.
- [ ] Capturas coinciden con `evidence/inicio.png` e `inicio-900.png` (estructura, medidas, tipografía).

## Referencias
`06-pantallas.md § Inicio`, `03 · 3.6`, `13.3–13.4`, `14 home.*`.
