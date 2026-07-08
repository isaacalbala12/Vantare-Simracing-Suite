# Plan: Carreras de intervalo en la vista diaria

> **Fecha**: 2026-07-07
> **Estado**: 🔴 PENDIENTE
- Estado: ✅ COMPLETADO

---

## 0. Contexto

El calendario LMU tiene series de intervalo (Bronce cada 15min, Plata cada 20min, Oro cada 30min) con 3 pistas por tier. Actualmente el DayView solo muestra carreras weekly y special en la línea de tiempo; las series de intervalo aparecen como una banda de "Horario" estática arriba.

**Problema**: El usuario quiere ver las carreras de intervalo en la línea de tiempo de 24h, pero no puede haber 600+ eventos (3 series × ~96 eventos/día por tier).

**Solución**: Representar cada carrera de intervalo como un evento individual en la línea de tiempo, pero con un patrón escalonado predecible (3 carreras/hora por tier, nunca 2 del mismo tier a la vez). Esto da ~6-9 eventos visibles por hora en vez de ~600.

---

## 1. Corte 1 — Mock Data: offsets escalonados

### Objetivo
Añadir `offsetMinutes` a cada serie en `configs/calendar-lmu.json` para crear el patrón escalonado real.

### Datos actuales (todos offset=0)
| Tier | Serie | Intervalo | Offset actual |
|------|-------|-----------|---------------|
| beginner | LMGT3 Fixed | 15min | 0 |
| beginner | McLaren Challenge | 15min | 0 |
| beginner | LMP3 Fixed | 15min | 0 |
| intermediate | LMGT3 Sprint Cup | 20min | 0 |
| intermediate | Prototype Fixed | 20min | 0 |
| intermediate | ELMS Sprint Trophy | 20min | 0 |
| advanced | One Stint Sprint | 30min | 0 |
| advanced | ELMS Super 60 | 30min | 0 |
| advanced | WEC-Xperience | 30min | 0 |

### Patrón objetivo (escalonado)
| Min | Bronce | Plata | Oro |
|-----|--------|-------|-----|
| :00 | LMGT3 Fixed (Sebring) | | |
| :10 | | LMGT3 Sprint Cup (COTA) | |
| :15 | McLaren Challenge (Monza) | | |
| :20 | | Prototype Fixed (Barcelona) | |
| :25 | | | One Stint Sprint (Paul Ricard) |
| :30 | LMP3 Fixed (Fuji) | | |
| :35 | | ELMS Sprint Trophy (Portimao) | |
| :40 | | | ELMS Super 60 (Spa) |
| :45 | LMGT3 Fixed (Sebring) | | |
| :50 | | LMGT3 Sprint Cup (COTA) | |
| :55 | | | WEC-Xperience (Silverstone) |

### OffsetMinutes a asignar
| Serie | Nuevo offset |
|-------|-------------|
| LMGT3 Fixed | 0 |
| McLaren Challenge | 15 |
| LMP3 Fixed | 30 |
| LMGT3 Sprint Cup | 10 |
| Prototype Fixed | 30 |
| ELMS Sprint Trophy | 50 |
| One Stint Sprint | 25 |
| ELMS Super 60 | 40 |
| WEC-Xperience | 55 |

### Checks
- [ ] Cada serie tiene `offsetMinutes` asignado
- [ ] Los offsets no causan colisiones dentro del mismo tier
- [ ] El patrón se repite correctamente cada hora
- [ ] Los eventos generados por `expandWeeklySlots` o similar respetan los offsets
- [ ] `pnpm --dir frontend test` pasa
- [ ] El mock data sigue siendo válido JSON

---

## 2. Corte 2 — DayView: eventos de intervalo en la línea de tiempo

### Objetivo
Modificar `CalendarDayView.tsx` para que las series de intervalo aparezcan como eventos individuales en la grid de 24h, con límite de 3 por tier por hora para no saturar.

### Diseño visual
Cada evento de intervalo se muestra como un bloque en la línea de tiempo:
- **Posición**: basada en `startTime` (offset + hora del día)
- **Duración**: `eventDurationMin` de la serie (ej: 31min para beginner)
- **Color**: color del tier (`tierStyle()`)
- **Contenido**: nombre de la serie + pista
- **Altura**: proporcional a la duración (mínimo 18px para que sea clickeable)

### Lógica de render
```
1. Para cada tier activo en el filtro:
   a. Calcular todos los startTimes del día (offset + interval × n)
   b. Para cada startTime, crear un DayEvent
   c. Limitar a 3 eventos por tier por hora (el primero de cada slot)
2. Combinar con eventos weekly y special existentes
3. Pasar a segmentEvents() para detectar solapamientos
4. Renderizar con la misma lógica que los eventos existentes
```

### Rendimiento
- Máximo ~27 eventos visibles por día (3 tiers × 3 eventos/hora × 3 horas visibles en viewport)
- Cálculo O(1) por tier (no se expanden todos los eventos del día)
- Sin cambios en el render loop existente

### Archivos a modificar
- `frontend/src/hub/calendar/CalendarDayView.tsx` — lógica de generación de eventos de intervalo
- `frontend/src/hub/calendar/CalendarDayView.test.tsx` — tests del nuevo comportamiento
- `frontend/src/hub/calendar/calendar-view-math.ts` — posible helper `expandIntervalSlots()`
- `frontend/src/hub/calendar/calendar-view-math.test.ts` — tests del helper

### Checks
- [ ] Los eventos de intervalo aparecen en la línea de tiempo del DayView
- [ ] Cada tier tiene su color correcto
- [ ] Los bloques muestran nombre + pista
- [ ] La altura es proporcional a la duración
- [ ] El filtro funciona (seleccionar "Oro" solo muestra eventos ORO)
- [ ] No hay más de 3 eventos del mismo tier por hora visibles
- [ ] El scroll del DayView funciona correctamente
- [ ] `pnpm --dir frontend test` pasa
- [ ] Rendimiento: el DayView carga en <200ms

---

## 3. Bugfixes conocidos

### B-1: Filtro no se aplica en mes y semana
- **Síntoma**: Al filtrar por tier en vista mes/semana, los eventos weekley siguen apareciendo
- **Causa**: `matchesTierFilter` para "weekly" retorna `true` para todos los weekly, sin importar el tier del filtro
- **Fix**: Cuando el filtro es beginner/intermediate/advanced, los eventos weekly deben filtrarse por tier de la serie asociada
- **Estado**: Pendiente

### B-2: Bandas "Horario" muestran tiers que no están activos
- **Síntoma**: Al filtrar por "Oro", las bandas de Horario siguen mostrando Bronce y Plata
- **Causa**: `getDailyPatternSummary` retorna todos los tiers sin importar el filtro
- **Fix**: Aplicar el filtro activo a las bandas de Horario (con opacidad reducida para context)
- **Estado**: Pendiente (parcialmente implementado con `isActive`)

### B-3: Rail muestra items duplicados
- **Síntoma**: Algunas veces el rail muestra la misma carrera 2 veces
- **Causa**: `buildUpcomingRaceItems` puede generar duplicados cuando una serie tiene múltiples tracks
- **Fix**: Deduplicar por `id` en el array plano retornado
- **Estado**: Pendiente de verificación

---

## 4. Orden de ejecución

```
Corte 1 (datos) → Corte 2 (visualización) → Bugfixes B-1, B-2, B-3
```

Corte 1 y2 se pueden hacer en paralelo si se mockean los offsets en el código de test.
Los bugfixes se hacen después de Corte 2.

---

## 5. Criterios de aceptación

- [ ] El DayView muestra carreras de intervalo como eventos individuales
- [ ] El patrón es predecible: 3 carreras/hora por tier, escalonadas
- [ ] El filtro funciona en todas las vistas (mes, semana, día)
- [ ] No hay saturación visual (máximo ~27 eventos visibles)
- [ ] El rendimiento es aceptable (<200ms para DayView)
- [ ] Todos los tests pasan
- [ ] El mock data refleja el patrón real de LMU
