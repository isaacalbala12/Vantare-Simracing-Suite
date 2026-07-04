# Prompt: LMU weekly calendar hotfix

```text
Actualiza el calendario oficial LMU semanal para un hotfix.

Lee primero:
- AGENTS.md
- docs/current-plan.md
- docs/calendar-weekly-hotfix/README.md
- internal/calendar/seed/lmu-weekly-schedule.json
- internal/calendar/official_schedule.go
- internal/calendar/official_schedule_test.go

Objetivo:
Actualizar el seed oficial LMU con el calendario semanal proporcionado por el usuario, manteniendo el modelo de series/recurrent rules.

Calendario oficial nuevo:
[PEGA AQUI EL TEXTO OFICIAL COMPLETO DE LMU]

Reglas de modelado:
1. No materialices miles de eventos daily en el JSON.
2. Daily races deben ser `interval` series.
3. Weekly races deben ser `weekly-slots` series con dias y horas UTC exactas.
4. No conviertas manualmente UTC a local en el seed.
5. Mantener LMU-only. No anadir iRacing, ACC, AC Evo ni datos fake.
6. No reintroducir UI de importacion manual.
7. No cambiar contratos Wails.

Race duration vs event duration:
1. `durationMin` se mantiene como duracion de carrera (compatibilidad).
2. `raceDurationMin` = duracion de carrera publicada por LMU.
3. `eventDurationMin` = raceDurationMin + 11 (practica 3 + quali 8).
4. `sessions` = array con practice (3m, estimated), qualifying (8m, estimated), race (raceDurationMin, not estimated).
5. `sessionDurationsEstimated` = true para todas las series.
6. `sessionsSource` = "estimated-defaults".

Offsets horarios para daily series:
1. En cada tier, por orden del seed: primera serie `startOffsetMinute: 15`, segunda `:30`, tercera `:45`.
2. Weekly no usa `startOffsetMinute`; conserva slots UTC oficiales.

Modelo esperado por serie:
- `id`
- `name`
- `tier`
- `licenseLabel`
- `track`
- `vehicleClass`
- `setup`
- `durationMin`
- `raceDurationMin`
- `eventDurationMin`
- `sessions` (practice 3m estimated, qualifying 8m estimated, race raceDurationMin not estimated)
- `startOffsetMinute` (solo interval series)
- `splits`
- `assists`
- `tyreWarmers`
- `tyres`
- `recurrence`

UI esperada:
1. MonthView: compacta; no lista miles de salidas.
2. WeekView: usa `eventDurationMin` para altura/duracion visual.
3. DayView: expande daily series para el dia visible (solo 24h). Muestra inicio-fin de cada salida usando `eventDurationMin`.
4. Panel de detalle: panel central modal con fondo blur/dim. Muestra desglose avanzado de sesiones. Indica si las sesiones son estimadas.

Archivos permitidos normalmente:
- internal/calendar/seed/lmu-weekly-schedule.json
- internal/calendar/official_schedule_test.go
- docs/current-plan.md
- changelog existente, si aplica

Si necesitas tocar estos archivos, reporta por que antes de hacerlo salvo bug claro:
- internal/calendar/official_schedule.go
- frontend/src/hub/calendar/*
- frontend/src/hub/pages/CalendarPage.tsx
- cmd/vantare/main.go

Validaciones obligatorias:
1. El JSON contiene exactamente las series del texto oficial.
2. IDs estables y legibles.
3. `validFrom` coincide con `Daily Race Schedule from`.
4. `validUntil` cubre la semana oficial completa. Si no hay fecha explicita, usar `validFrom + 7 dias` (martes a martes).
5. Track, vehicleClass, setup, raceDuration, assists, tyreWarmers, tyres y splits salen del texto oficial.
6. Weekly `timesUTC` y `daysUTC` son exactos.
7. No se presenta informacion estimada como oficial.
8. No se materializan miles de eventos en JSON.
9. `eventDurationMin` = `raceDurationMin + 11` para todas las series.
10. `sessions` tiene practice 3m estimated, qualifying 8m estimated, race raceDurationMin not estimated.
11. `startOffsetMinute` sigue orden del seed: 15, 30, 45 por tier.

Tests esperados:
- carga del seed real.
- numero total de series esperado.
- conteo por tier.
- interval minutes por tier.
- duraciones race/event por serie.
- sessions y flag de estimacion.
- weekly days/times UTC.
- expansion weekly.
- DayView/expansion visible usa `eventDurationMin`, no `raceDurationMin`.
- `eventDurationMin = raceDurationMin + 11`.
- `startOffsetMinute` por tier y orden.

Checks obligatorios:
- go test -count=1 ./internal/calendar/...
- go test -count=1 ./internal/app/... ./cmd/vantare/...
- go vet ./internal/calendar/... ./cmd/vantare/...
- pnpm --dir frontend test -- CalendarPage CalendarHeroUpcomingPanel CalendarMonthView CalendarWeekView CalendarDayView calendar-view-math
- pnpm --dir frontend exec tsc -b
- git diff --check

Version bump:
1. Busca TODOS los archivos con version (rg "v0\\.|0\\.1\\.|version" frontend internal cmd package.json . -n).
2. Si hay mas de un origen de version o no esta claro cual se usa en UI/build, PARA y reporta exactamente que archivos/versiones encontraste. No edites versiones ambiguas.
3. Si el origen es unico y claro, haz bump x.x.x.1 en ese archivo.

Changelog:
Anade una entrada breve:
- fecha del hotfix.
- "Actualizado calendario oficial LMU semanal desde <fecha>".
- resumen Bronze/Silver/Gold/Weekly.
- sin prometer features nuevas.

Autorevision final:
1. Que texto oficial usaste?
2. Que series quedaron en el JSON?
3. ValidFrom/ValidUntil son correctos?
4. Daily series siguen como interval rules?
5. Weekly slots son UTC y correctos?
6. Race duration y event duration estan separados?
7. Sessions estan modeladas (practice 3m, qualifying 8m, race)?
8. Se marca si las sessions son estimadas?
9. eventDurationMin = raceDurationMin + 11?
10. startOffsetMinute sigue orden 15/30/45 por tier?
11. WeekView/DayView usan eventDurationMin visualmente?
12. Panel central muestra desglose avanzado?
13. No se presenta informacion estimada como oficial?
14. No materializaste miles de eventos?
15. No inventaste datos?
16. Que tests/checks pasaron?
17. Que archivos tocaste?
18. Que changelog anadiste?
19. No hiciste tag/release/Discord?
20. Si hiciste commit, da hash; si no, deja archivos listos para review.
```
