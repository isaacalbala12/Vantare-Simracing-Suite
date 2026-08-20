# Auditoría de cableado · Command Orbit v0.3

Recorrido control a control de toda la UI Orbit portada: qué se espera de cada
control (`06-pantallas.md` y el briefing de su pantalla) y qué hace de verdad el
código. Estados:

- **OK** — hace lo que promete contra el flujo real.
- **CORREGIDO** — estaba roto (sin handler, navegaba mal, no reflejaba estado) y
  se ha cableado en esta pasada.
- **HONESTO** — no hay flujo real detrás (backend inexistente). Debe quedar
  deshabilitado con motivo visible (`data-tip`) o con un toast que explique por
  qué. Nunca un botón mudo.

Resumen: **142 controles auditados** · 131 OK de partida · **8 corregidos** ·
**11 honestos-sin-backend** (3 de ellos convertidos en honestos aquí).

---

## Shell · rail (`components/orbit/Rail.tsx`)

| Control | Esperado | Estado |
| --- | --- | --- |
| Marca (losa superior) | Rótulo con tooltip propio; sin `title` nativo | **CORREGIDO** — usaba `title` nativo; ahora `data-tip` + `aria-label` |
| Inicio / Studio / Launcher / Carreras / Estrategia / Ingeniero / Telemetría / Roadmap (8 botones) | `navigate(view)`, `aria-current`, candado por plan | OK |
| Testing Center (matraz) | Solo con canal testers/nightly; navega | OK — `RAIL_ORDER` filtrado por `testingCenterChannel` |
| Botón bloqueado por plan | Tooltip «Requiere el plan X · plan actual Y» + toast al pulsar | OK |
| Telemetría `soon` | Punto de «próximamente» + rótulo | OK |
| Plegar columna | `aria-pressed`, persiste en `vantare.orbit.sidebar`, deshabilitado sin contexto | OK |
| Paleta | Abre/cierra `CommandPalette` | OK |
| Ajustes | `navigate("ajustes","application")` | OK |
| Avatar | `navigate("ajustes","account")` | OK |

## Shell · topbar (`components/orbit/Topbar.tsx`)

| Control | Esperado | Estado |
| --- | --- | --- |
| Pill de actualización | Llevar a Ajustes › Actualizaciones | **CORREGIDO** — emitía `updater:install` a ciegas, sin confirmación ni estado; ahora `navigate("ajustes","updates")` |
| Slot Studio (selector de perfil, Guardar, Abrir/Detener overlay) | Cambia perfil, guarda con estado `dirty/saved`, conmuta overlay | OK |
| Slot Launcher (buscador) | Filtra el catálogo en vivo | OK |
| Slot Carreras | Controles de la vista | OK |

## Shell · columna contextual

| Control | Esperado | Estado |
| --- | --- | --- |
| ‹ plegar | Igual que el rail, misma preferencia | OK |
| Pill LMU | Estado del sim (única fuente textual) | OK |
| Pill de plan | → Ajustes › Cuenta | OK |
| SideRaces «Ver todas» | → Carreras | OK |
| SideRaces fila | → Carreras con la serie preseleccionada | OK |
| SideProfile ▶ | Abrir/detener overlay del activo | OK |
| SideProfile fila activa | → Studio | OK |
| SideProfile «recomendado» | **Activar** el perfil recomendado | **CORREGIDO** — solo abría el Studio; ahora emite `hub:set-active` (mismo evento que Inicio y `ActiveOverlayCard`) y confirma con toast |
| SideLauncher «Gestionar» | → Launcher | OK |
| SideLauncher ▶ | Lanza el perfil (`launcher:profile:run`) | OK |
| Columna en Studio › **Perfiles** | Contexto propio de la pantalla | **CORREGIDO** — quedaba **vacía**: `ProfilesOrbitPage` no portaba nada al hueco. Ahora lista los perfiles (ListRow, activo marcado con chip, clic → editar layout) |
| Columna en Studio › editor | Lista de widgets | OK (`StudioWidgetList`) |
| Columna en Ajustes | Solo las 5 secciones, bloques ocultos | OK |

## Shell · paleta de comandos

| Control | Esperado | Estado |
| --- | --- | --- |
| Ctrl K / Esc | Abre y cierra, foco en el input | OK |
| 11 destinos («Ir a» 9 del rail + Ajustes + Cuenta) | Navegan; bloqueados avisan | OK |
| Filtro en vivo | Oculta grupos vacíos | OK |
| ↑ ↓ ↵ | Mueve el cursor y ejecuta | OK |
| Acción «Abrir/Detener overlay» | Conmuta el overlay real | OK |
| Acción «Guardar perfil» | `studio:save`, atendido por `StudioTopbarControls` | OK |

## Inicio

| Control | Esperado | Estado |
| --- | --- | --- |
| Superficie de comando | Abre la paleta | OK |
| Chip «Abrir Studio» | → Studio | OK |
| Chip «Abrir/Detener overlay» | Conmuta overlay, el rótulo sigue el estado | OK |
| Chip «Crear plan» | → Estrategia | OK |
| Chip «Lanzar perfil» | → Launcher | OK |
| Dial ↗ | → Carreras con la serie del objetivo | OK |
| Focal «Abrir Studio» | → Studio | OK |
| Focal «Abrir/Detener overlay» | Conmuta y refleja estado | OK |
| Filas de carreras | → Carreras con serie | OK |
| «Ver todas» | → Carreras | OK |
| «Gestionar» perfiles | → Studio › Perfiles (`target="profiles"`) | OK |
| Fila de perfil | Activo → Studio; resto → activar (`hub:set-active`) | OK |

## Overlays Studio

| Control | Esperado | Estado |
| --- | --- | --- |
| Seg de fondo · Seg Mock/Live | Cambian la vista previa; Live deshabilitado sin sim, con motivo | OK |
| Área segura | Conmuta, `aria-pressed` | OK |
| Browser View | Abre la ventana real | OK |
| Plegar inspector | Persiste en `vantare.orbit.rightDock` | OK |
| Zoom − / + | Escalones reales del store | OK |
| Ojo / duplicar / eliminar del inspector y de la lista | Comandos del store V3 | OK |
| Añadir widget | Abre el catálogo real | OK |
| Selector de perfil (topbar) | Cambia de perfil con el diálogo de cambios sin guardar | OK |
| Guardar | `save()` del store; deshabilitado en `saved` | OK |
| Mis perfiles: Editar / Activar / Abrir overlay / Detener / Nuevo perfil / Volver | Flujos reales de `StudioRoute` | OK |

## Launcher

| Control | Esperado | Estado |
| --- | --- | --- |
| ▶ de cada perfil | `launcher:profile:launch` | OK |
| Lápiz (editar) | Abre `ProfileEditor` real | OK |
| «Crear perfil» | Borrador local + `launcher:profile:save`, editor abierto en el mismo clic | OK |
| Buscador (topbar) | Filtra el catálogo de apps | OK |
| Columna: fila de perfil | Lanza el perfil | OK |
| Favoritos | Solo ordenan y colorean el monograma; **no hay control de marcar favorito** en Orbit | HONESTO — no existe control, no hay botón mudo (pendiente de producto) |

## Carreras

| Control | Esperado | Estado |
| --- | --- | --- |
| Seg de vistas (5) | Cambia de vista | OK |
| ‹ Hoy › | Desplaza el offset y vuelve a hoy | OK |
| Seguir / dejar de seguir | Actualiza columna, hero y timeline | OK (deshabilitado sin permiso de recordatorios) |
| «Actualizar horario» | Recarga y avisa con toast | OK |
| Filtro de categoría (columna) | Afecta a las 5 vistas | OK |
| Filas / chips / bloques | Seleccionan el evento | OK |
| Seguidas de la columna | → detalle | OK |

## Estrategia

| Control | Esperado | Estado |
| --- | --- | --- |
| Repartir (auto-asignar) | Rota el orden de pilotos | OK |
| Lápiz de tramo | Abre/cierra el editor del stint | OK |
| «Volver a automático» | Limpia el override; deshabilitado si no es manual | OK |
| × de esquina / arrastrar juego | Monta y desmonta neumáticos | OK |
| Restablecer | Vuelve a «Al día» | OK |
| ⚙ Telemetría / Combustible / Info | Sin flujo real | HONESTO — toast «próximamente» |
| ⚙ Exportar | Exporta el plan | OK (toast de error honesto si falla) |
| Activar / Duplicar / Nueva estrategia | Flujos reales del editor | OK |
| Botón «Activa» (tarjeta activa) | Estado, no acción | **CORREGIDO** — deshabilitado sin motivo; ahora con `data-tip` |
| Editar piloto | Sin flujo real (los ritmos los publica el hub) | **CORREGIDO → HONESTO** — era un toast que solo repetía el nombre; ahora deshabilitado con motivo |
| Columna · estrategias | Activa la estrategia | OK |
| Columna · **otros eventos** | Debía hacer algo | **CORREGIDO → HONESTO** — `ListRow` es un `<button>` y no tenía `onClick`: control mudo. Ahora explica que el puente publica un único evento activo |
| Columna · «Nueva estrategia» | Crea y activa | OK |
| Disponibilidad: añadir tramo / pilotos / estado / horas | Recalcula el tablero | OK |
| «Añadir tramo» de stints | No existe: los stints los deriva el algoritmo desde paradas y overrides | n/a (no es un control del porte) |

## Ingeniero

| Control | Esperado | Estado |
| --- | --- | --- |
| Toggle Ingeniero / Spotter / Subtítulos | Puente real | OK |
| Toggle Estrategia en vivo | Sin contrato | HONESTO — deshabilitado + «próximamente» |
| «Probar voz» | Habla con la voz y el volumen elegidos; avisa si no hay motor | OK |
| Selector de voz · volumen | Persisten en preferencias | OK |
| Toggle «Atenuar el juego» | Sin control de volumen del juego | **CORREGIDO → HONESTO** — deshabilitado sin motivo; ahora con `data-tip` explicando por qué |
| Seg de sensibilidad | Puente real | OK |
| Seg de salidas (por categoría) | Puente real | OK |
| Filtro de radio | Filtra el feed | OK |
| «Exportar» radio | Sin backend | HONESTO — toast «próximamente» |

## Telemetría

| Control | Esperado | Estado |
| --- | --- | --- |
| Seg de referencia (mejor/sesión/…) | Reescala deltas, tramos e insights | OK |
| Seg Distancia / Tiempo | Cambiar eje | **CORREGIDO → HONESTO** — `onChange` era `() => undefined` (handler muerto). Ahora hay estado real y «Tiempo» va deshabilitado con el motivo (la fuente no expone marca de tiempo por muestra) |
| Insights | Enfocan la curva en el mapa | OK |
| Mapa: segmentos | Enfocan y mueven el cursor | OK |
| Trazas: hover | Mueve el cursor y el readout | OK |
| Columna: sesiones | Cambian la sesión activa | OK |

## Roadmap

| Control | Esperado | Estado |
| --- | --- | --- |
| Columna: fases | Saltan y resaltan la fase 1,6 s | OK |

## Ajustes

| Control | Esperado | Estado |
| --- | --- | --- |
| Columna: 5 secciones | Cambian de sección y persisten | OK |
| Cuenta: «Comprobar acceso» | Revalida la licencia | OK |
| Cuenta: «Cerrar sesión» | Cierra sesión | OK |
| Cuenta: «Restablecer dispositivo» | Libera el dispositivo | OK |
| Aplicación: idioma / densidad / tema / reducir animaciones | Aplican y persisten | OK |
| Sistema: inicio con Windows / minimizado | Puente real; deshabilitados si el sistema no lo soporta | OK |
| Sistema: notificaciones (2) | Puente real | OK |
| Actualizaciones: «Buscar» | `updater.refresh` | OK |
| Actualizaciones: instalar | `updater.install` con modal de downgrade | OK |
| Actualizaciones: 3 canales | `changeChannel`; bloqueados con candado | OK |
| Atajos: «Restablecer» / «Guardar» | Reales | OK |
| Atajos: grabar (por fila) | `startCapture` | OK |
| Diagnóstico: «Abrir carpeta» | `storage:reveal` | OK |
| Diagnóstico: muestreo de CPU | Persiste | OK |
| Diagnóstico: «Preparar informe» | Cliente de diagnóstico real | OK |
| Diagnóstico: «Registros» | Abre la carpeta de registros | **CORREGIDO** (ISA-379) — el backend escribe un log rotado (`internal/applog`) y publica `logs` como tercera ubicación de `storage`; la fila ofrece «Abrir». Sin sitio donde escribir, explica por qué en vez de pintar un botón mudo |
| Diagnóstico: «Últimos eventos» | Log con niveles | **CORREGIDO** (ISA-379) — anillo de 200 entradas en el backend; `applog:get` da el snapshot y `applog:entry` empuja cada nueva. Lista con nivel, filtro y copiar. Sin backend (maqueta) sigue diciendo que no hay canal |

## Testing Center

| Control | Esperado | Estado |
| --- | --- | --- |
| Campos del formulario (5) | Guardan borrador | OK |
| Consentimiento de diagnóstico | Adjunta el informe | OK |
| Consentimiento de replay / logs | Sin backend | HONESTO — casillas deshabilitadas con la razón escrita al lado |
| «Enviar» | Envío real; deshabilitado sin red o mientras envía | OK |
| «Descartar» | Limpia el borrador | OK |

## Atajos y persistencia de la shell

| Control | Esperado | Estado |
| --- | --- | --- |
| Ctrl K | Abre/cierra la paleta | OK |
| Esc | Cierra la paleta | OK |
| Vista al recargar | `vantare.orbit.view` | OK |
| Columna al recargar | `vantare.orbit.sidebar` (auto-plegada ≤ 1152 px sin tocar la preferencia) | OK |
| Densidad al recargar | `vantare.orbit.density` | OK |
| Dock del inspector al recargar | `vantare.orbit.rightDock` | OK |

---

## Pendiente por decisión de producto

1. **Marcar favorito en el Launcher**: hoy `isFavorite` solo ordena y colorea; no
   hay control para alternarlo en Orbit (sí en el Launcher clásico).
2. **Estrategias por evento**: el puente `strategy:roster` publica un único
   evento activo. Hasta que publique varios, «Otros eventos» solo puede explicar.
3. **Editar pilotos**: los ritmos vienen del hub; no hay comando para escribirlos.
4. **Eje temporal en Telemetría** y **Exportar radio**: dependen de que la fuente
   (DuckDB, ADR 0004/0005) se exponga al frontend.
