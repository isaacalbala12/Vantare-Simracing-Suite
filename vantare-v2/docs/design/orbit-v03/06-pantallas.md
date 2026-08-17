# 06 · Especificación por pantalla

Cada ficha: propósito · estructura (de arriba abajo) · datos y fuente · interacciones · estados · medidas clave · harness. Todas caben a 1920×1080 sin scroll de página (ver `03 · 3.6`).

---

## Inicio (`?view=inicio`)
**Propósito.** Centro de mando: qué viene, qué overlay está en pista, lanzar algo.
**Estructura.**
1. `hero` (2 col: `1fr 300px`, gap 40): izquierda saludo 39px con punto de estado del sim (color), **command surface** (86px, icono 44, texto 16px, kbd Ctrl K), quick actions (Abrir Studio · Abrir overlay · Crear plan · Lanzar perfil); derecha `hero-side` 236px con **dial** y tarjeta `next-race` (eyebrow "Próxima serie", título, "en mm:ss" 20px mono, cadencia · licencia, botón →).
2. `focal` (ancho completo, `1fr 470px`): eyebrow "Perfil activo", h2 = nombre del perfil, descripción, meta (1920×1080 · n widgets · estado overlay con punto), botones Abrir Studio (primario) / Abrir overlay (ghost), flecha ↗; **mini-lienzo** con los widgets reales.
3. Grid 12: Próximas carreras (7 col; 4 filas: hora mono coral la primera, serie, circuito, chip de licencia) · Perfiles (5 col; activo con tick, recomendado con "Activar"). Actividad oculta si vacía.
**Datos.** Series del fixture y `nextStarts`; perfil activo y estado del overlay; plan.
**Interacciones.** Todo navega; dial y "en" se actualizan cada segundo; overlay conmuta desde focal.
**Estados.** sim connected/searching/disconnected (color del punto y de la focal); overlay running (meta verde). ≤ 940px alto: compacto.

## Overlays Studio (`?view=studio`)
**Estructura.** Columna contextual = lista de widgets (búsqueda, filas con grip/nombre/subtítulo/ojo, "Añadir widget"). Workspace: toolbar 60px (seg fondo Rejilla/Degradado/Negro · seg Mock/Live · área segura · Browser View · plegar inspector · zoom −/Ajustar/+), stage 16:9 (rejilla 1.25cqw/6.25cqw, área segura 4.5 %, etiqueta 1920×1080), widgets `.cw` con selección (borde carmín, marco punteado, 8 tiradores, etiqueta "nombre · w × h"), statusbar (X·Y, "Lienzo · 1920×1080", "n widgets · x seleccionado"). Inspector 395px: cabecera (kind "widget", nombre 17px, meta "diseño · w × h", acciones ojo/duplicar/eliminar) + acordeones **Diseño** (Sistema, Diseño, Aplicar a todos, Guardar como diseño), **Comportamiento** (Frecuencia, Visible en boxes, sesiones Carrera/Práctica/Clasificación, nota ámbar), **Layout** (X/Y/W/H, bloquear proporción, Frente/Fondo/Centrar/Restablecer).
**Datos.** `WIDGETS` (nombre, sistema, diseño, x/y/w/h), `DESIGNS` por widget.
**Interacciones.** Selección sincronizada lista↔lienzo; resúmenes del inspector en vivo; guardar (dirty→saved); abrir/detener overlay; zoom 100/125/150; Live deshabilitado sin sim.
**Harness.** `?rightDock=closed`, `?stress=1` (20 widgets).

## Launcher (`?view=launcher`)
**Estructura.** Cabecera + estado de detección. `stat-row`: Aplicaciones (7 · 0 detectadas) · Perfiles (2) · Última ejecución (—) · Atajo global (Ctrl Alt L). Grid `390px|1fr`: **Aplicaciones** (7 filas con monograma degradado, nombre, categoría · método, estado "Catálogo"; nota de estado neutral) · **Perfiles**: tarjeta destacada (Creador de Contenido: icono 46, eyebrow, título, descripción, editar, **▶ Lanzar**, cadena LMU→OBS→Spotify con esperas, políticas) + Pro + "Crear perfil" punteada.
**Datos.** `LauncherApp` (id, nombre, abreviatura, categoría, método, gradiente) y `LaunchProfile` (pasos con delay, políticas alreadyRunning/failure/exit) del contrato real.
**Contexto (columna).** Perfiles con ▶, catálogo con contador; bloque persistente Launcher oculto aquí.

## Carreras (`?view=carreras`)
**Estructura.** Cabecera con seg **Próximas · Día · Semana · Mes · Timeline**. Grid `1fr|338px`: superficie de calendario (cabecera con título dinámico + reloj/zona + nav ‹ Hoy › en Día/Semana/Mes) y **Detalle** (eyebrow tier, título, circuito · clase, hechos Configuración/Carrera/Cadencia/Próxima salida/Sesiones, 4 próximas horas como kbd (la primera coral), botón **Seguir serie / ✓ Siguiendo**, nota de recordatorios 30·15·10·5·2).
- **Próximas**: 24 filas ordenadas por salida (hora 17px mono, "en mm:ss", serie ✓, circuito · clase, duración · setup, chip).
- **Día**: 24 filas horarias con chips `:mm serie` (pasadas .35, seguidas borde verde, hora actual resaltada).
- **Semana**: rejilla `200px + 7`, cabeceras Lun…Dom (hoy coral), celda "cada N min · :mm+" o slots UTC; hoy sombreado.
- **Mes**: 7×6, hoy con número en losa carmín; "n series diarias", semanales, especiales (ámbar, muestra).
- **Timeline**: filas por serie (punto tier, nombre, circuito · duración), eje 24 h desde la hora actual, bloques color tier con ✓ seguidas, línea "ahora"; scroll horizontal interno.
**Datos.** `SERIES` (10) desde `configs/calendar-lmu.json` (tier, licencia, circuito, clase, setup, duración, sesiones, `every/offset` o `weeklyUTC/days`); `FOLLOWED`.
**Interacciones.** Filtro por categoría (columna) afecta a las 5 vistas; clic en fila/chip/bloque → detalle; Seguir actualiza columna, hero y timeline; refresco de cuentas atrás cada segundo.

## Estrategia (`?view=estrategia`)
**Estructura.** Cabecera de evento (`ev-mark` 52, crumb "Estrategia › Estrategia #1 · Al día/Borrador", h2 26px, subtítulo, chips fecha/duración/clase/equipo; **⚙ Ajustes** con menú Telemetría / Modelo de combustible / Información / Exportar; **Restablecer**). Pestañas **Resumen · Estrategias · Disponibilidad de pilotos**.
- **Resumen**: KPIs compactos (Duración · Depósito con vueltas máx. · Tiempo de parada · Paradas con stints/vueltas) → grid `1fr|360px`: **Línea de carrera** (filas por piloto, eje 14:00→18:00 cada 30 min, bloques S1…, marcas PIT) · **Distribución** (donut Vueltas/Tiempo + leyenda) → grid `1fr|340px`: **Stints** (cabecera con "Repartir pilotos", salida, tarjetas `#n · Piloto(select con color) · Hora · Vueltas (rango) · Combustible · Ventana de boxes (~Vn) · Setup · lápiz`, filas **PIT** entre tarjetas con duración/litros/vuelta/neumáticos, bandera; lista con scroll interno) · panel derecho con seg **Pilotos** (tarjetas: avatar, nombre, licencia, ritmo+consumo Seco/Lluvia/Eco, Editar) / **Neumáticos** (inventario arrastrable).
- Editor de stint (lápiz): Vueltas · Combustible · Ritmo · Volver a automático + esquema FL/FR/RL/RR con drop.
- **Estrategias**: tarjetas #1/#2 (estado, nota, stints·paradas, vueltas, ritmo medio, consumo medio, tiempo; Activar/Duplicar) + Nueva; **veredicto** de comparación por vueltas completadas.
- **Disponibilidad**: barras por piloto 13:00→18:30 (ok/quizá/no) + formulario piloto/estado/desde/hasta que recorta tramos.
**Datos.** `EV` (inicio, duración, depósito, parada), `DRIVERS` (ritmo/consumo por modo), `STRATS` (orden de pilotos, modo, overrides, asignación de neumáticos), `TYRES` (24, compuesto, condición por usos), `AVAIL`.
**Modelo.** vueltas = ⌈duración ÷ ritmo medio⌉; stints = mín. que cabe en depósito, equilibrados, respetando overrides; rotación de pilotos se repite; tiempo total = vueltas × ritmo + paradas × parada.
**Contexto (columna).** Estrategias del evento (activa `.sel`), otros eventos, **Nueva estrategia**.

## Ingeniero (`?view=ingeniero`)
**Estructura.** Cabecera (Probar voz, estado LMU · 15 Hz). Fila de 4 módulos (Ingeniero de pista · Spotter · Subtítulos · Estrategia en vivo *próximamente*) con icono/toggle. Grid `460px|1fr`: **Voz** (voz, fader de volumen, atenuar el juego, sensibilidad del spotter seg) + **Salidas por categoría** (Spotter/Combustible/Penalizaciones/Vueltas/Diferencias/Boxes con punto de color y seg A+V/V/A/Off) · **Radio** (filtro Todo/Spotter/Ingeniero, feed con hora, icono S/I, título, detalle, salida; exportar). Feed con scroll interno.
**Datos.** Runtime real de Telemetry Core; en el prototipo, 7 mensajes de muestra.

## Telemetría (`?view=telemetria`)
**Estructura.** Cabecera (título sesión, seg *vs mejor propia / vs mejor sesión / vs referencia Vantare*, "Datos sintéticos"). `stat-row`: Vuelta analizada · Delta a referencia (coral) · Sectores (S1 verde/S2/S3 rojo) · Consistencia (verde). Grid `400px|1fr` × 2 filas: **Mapa** (col 1, fila 1: tramos por curva coloreados, etiquetas T1…, meta, coche; leyenda gana/neutro/pierde) · **Dónde se va el tiempo** (col 1, fila 2: insights ordenados por pérdida, `Tn · título · explicación · ±s · metros`, scroll interno) · **Trazas** (col 2, filas 1–2: Velocidad 150px, Acelerador/Freno 100, Volante 80, Delta 110; seg Distancia/Tiempo; cursor con "m · km/h"; leyenda).
**Datos.** ADR 0004/0005: canales throttle/brake/steering/speed/delta por distancia; sesiones desde DuckDB. Prototipo: `CORNERS` (8) y canales sintéticos deterministas.
**Interacciones.** Hover en trazas mueve el cursor y el coche en el mapa; clic en curva/insight enfoca; cambiar referencia reescala deltas.
**Contexto (columna).** Sesiones (circuito · coche · fecha · vueltas · mejor).

## Roadmap (`?view=roadmap`)
**Estructura.** Cabecera + estado "Fuente disponible · v0.1.x". `stat-row`: Fase actual · Áreas (7) · Hitos (5) · Canal. **Fases** (4 columnas con barra de progreso, eyebrow estado · versión · %, título, highlights con viñetas de color de fase). Grid 2: **Áreas** (7 tarjetas con acento por estado) · **Hitos** (línea vertical con puntos por estado).
**Datos.** `docs/roadmap-source.json` (phases/areas/milestones, progreso 0/10/25/50/75/100).
**Contexto.** Fases → salta y resalta.

## Ajustes (`?view=ajustes&settings=…`)
**Cuenta**: tarjeta de identidad (avatar 64 con logo, nombre, correo enmascarado, badges Plan/Canal/Dispositivo, Comprobar acceso/Cerrar sesión) + tarjeta de **plan** (carmín, módulos incluidos con ticks) → Sesión (kv) · Dispositivos.
**Aplicación**: Interfaz (idioma, densidad, tema con 3 muestras, reducir animaciones) · Sistema (inicio con Windows, cerrar a la bandeja, notificaciones, unidades).
**Actualizaciones**: versión grande + estado + "Buscar" + auto; **3 tarjetas de canal** (Stable activa, Testers/Nightly con candado, versión · fecha); Novedades (changelog).
**Atajos**: explicación + Restablecer + "Sin conflictos"; 4 grupos (Overlay 4 · Launcher y carrera 3 · Studio 4 · Global 2) con keycaps físicos; "sin asignar" punteado.
**Diagnóstico**: 4 estados (Telemetry Core, Overlay, CPU·memoria, Datos locales) · Datos y registros (carpeta, registros, muestreo, **Preparar informe**) · Últimos eventos (log mono con niveles).
**Contexto (columna).** Solo las 5 secciones; bloques persistentes ocultos. Título/lead de la cabecera cambian por sección.

## Testing Center (`?channel=nightly&view=testing`)
Formulario (módulo, qué hiciste, qué esperabas, qué ocurrió, contexto) + Consentimiento (diagnóstico preparado; replay y logs no disponibles) + Enviar/Descartar. Solo visible con canal testers/nightly (botón matraz en el rail).
