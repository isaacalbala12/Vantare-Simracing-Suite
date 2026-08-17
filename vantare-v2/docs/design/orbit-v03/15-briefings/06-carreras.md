# Briefing 06 · Carreras (`?view=carreras`)

## Objetivo
Portar `CalendarPage.tsx` / `hub/calendar` a Orbit con las cinco vistas y el motor de salidas sobre `configs/calendar-lmu.json` (series por intervalo y semanales), seguimiento y recordatorios reales.

## Motor (dominio, con tests)
`nextStarts`, `upcoming` de `13.3`; zona horaria local con `Intl`; `FOLLOWED` desde el estado real de recordatorios (`calendar:reminder`).

## Estructura
- Cabecera: eyebrow "Calendario LMU", h2 "Carreras", lead; `Seg` **Próximas · Día · Semana · Mes · Timeline**; topbar "Actualizar horario".
- Grid `1fr | 338px` (`height:100%`): **Calendario** (`Surface fill`: título dinámico + reloj/zona; nav ‹ Hoy › en Día/Semana/Mes) · **Detalle** (eyebrow tier, título, circuito · clase, hechos Configuración/Carrera/Cadencia/Próxima salida/Sesiones, 4 próximas horas como `Kbd` —la primera coral—, botón **Seguir serie / ✓ Siguiendo**, nota de recordatorios).
- Vistas:
  1. **Próximas**: `ListRow` con hora 17px mono + "en mm:ss" (primera coral), serie ✓, circuito · clase, duración · setup, chip; 24 filas; scroll interno.
  2. **Día**: 24 filas horarias con `ev-chip` `:mm serie` (pasadas .35, seguidas borde verde, hora actual sombreada).
  3. **Semana**: rejilla `200px + 7` (Lun…Dom, hoy coral), celdas "cada N min · :mm+" o slots UTC; hoy sombreado.
  4. **Mes**: 7×6, hoy con número en losa carmín; "n series diarias", semanales; especiales desde `events` del fixture (si tienen fecha) o ninguno.
  5. **Timeline**: `HorizontalTimeline` filas por serie (punto tier, nombre, circuito · duración), 24 h desde la hora en punto, bloques color tier (ancho `min(race, every−3)`), ✓ seguidas, línea "ahora"; scroll horizontal interno.
- Columna contextual: eyebrow "Categoría" (Todas/Bronce/Plata/Oro/Semanal con punto y contador) + eyebrow "Seguidas" (`ListRow` con hora y "en"). El bloque persistente "Próximas carreras" se oculta aquí.

## Comportamiento
- Filtro de categoría afecta a las 5 vistas y al detalle. Clic en fila/chip/bloque → detalle y `on` en la vista.
- Seguir/dejar de seguir → columna, hero (dial) y ✓ en vistas; toast con los minutos de recordatorio.
- "en mm:ss" refresca cada segundo; listas de la columna cada 30 s.

## Criterios de aceptación
- [ ] Tests del motor: casos (a)–(d) de `13.3` verdes; cambio de zona horaria mueve las horas mostradas pero no las UTC.
- [ ] Las cinco vistas cambian sin scroll de página; el timeline tiene línea "ahora" en la posición correcta y scroll horizontal.
- [ ] Seguir una serie en Free muestra el bloqueo (botón deshabilitado con motivo).
- [ ] Capturas ≈ `evidence/carreras-proximas.png`, `carreras-timeline.png`, `carreras-mes.png`.

## Referencias
`06 § Carreras`, `04` (HorizontalTimeline, ListRow, Kbd), `13.3`, `14 races.*`, `configs/calendar-lmu.json`.
