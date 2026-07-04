# LMU weekly calendar hotfix checklist

Checklist operativo para actualizar el calendario LMU semanal sin tocar producto.

## 1. Preparacion

- [ ] Confirmar que el texto oficial de LMU corresponde a la semana que se va a publicar.
- [ ] Guardar el texto oficial completo en la tarea o chat del worker.
- [ ] Revisar `git status --short` y no mezclar cambios ajenos.
- [ ] Leer:
  - `AGENTS.md`
  - `docs/current-plan.md`
  - `docs/calendar-weekly-hotfix/README.md`
  - `docs/calendar-weekly-hotfix/weekly-update-prompt.md`
  - `internal/calendar/seed/lmu-weekly-schedule.json`

## 2. Edicion del seed

- [ ] Actualizar solo `internal/calendar/seed/lmu-weekly-schedule.json` salvo que el calendario oficial traiga un formato nuevo.
- [ ] Mantener `version: 1` salvo cambio de schema.
- [ ] Actualizar `validFrom` con `Daily Race Schedule from`.
- [ ] Actualizar `validUntil` como `validFrom + 7 dias` si el texto oficial no da fecha final.
- [ ] Actualizar `updated` con fecha UTC del hotfix.
- [ ] Mantener daily races como `recurrence.kind = "interval"`.
- [ ] Mantener Weekly como `recurrence.kind = "weekly-slots"` con dias/horas UTC exactos.
- [ ] No materializar miles de eventos en JSON.

## 3. Campos obligatorios por serie

Para cada serie:

- [ ] `id` estable y legible.
- [ ] `name` exacto desde el calendario oficial.
- [ ] `tier`: `beginner`, `intermediate`, `advanced` o `weekly`.
- [ ] `licenseLabel` desde el texto oficial.
- [ ] `track`.
- [ ] `vehicleClass`.
- [ ] `setup`: `fixed` u `open`.
- [ ] `durationMin` = duracion de carrera publicada por LMU.
- [ ] `raceDurationMin` = duracion de carrera publicada por LMU.
- [ ] `eventDurationMin` = `raceDurationMin + 11`.
- [ ] `sessions`: practice 3m estimated, qualifying 8m estimated, race `raceDurationMin` not estimated.
- [ ] `startOffsetMinute`: 15, 30, 45 por orden dentro de cada tier daily.
- [ ] `splits`.
- [ ] `assists`.
- [ ] `tyreWarmers`.
- [ ] `tyres`.
- [ ] `recurrence`.

## 4. Validaciones de datos

- [ ] Beginner tiene las series oficiales del texto.
- [ ] Intermediate tiene las series oficiales del texto.
- [ ] Advanced tiene las series oficiales del texto.
- [ ] Weekly tiene dias UTC exactos.
- [ ] Weekly tiene horas UTC exactas.
- [ ] No se inventan circuitos, coches, precios, votos, ratings, fechas ni URLs.
- [ ] Las sesiones estimadas estan marcadas como estimadas.
- [ ] No se presenta practica/qualy estimada como dato oficial absoluto.

## 5. Tests y checks

Ejecutar:

```powershell
go test -count=1 ./internal/calendar/...
go test -count=1 ./internal/app/... ./cmd/vantare/...
go vet ./internal/calendar/... ./cmd/vantare/...
pnpm --dir frontend test -- CalendarPage CalendarHeroUpcomingPanel CalendarMonthView CalendarWeekView CalendarDayView calendar-view-math
pnpm --dir frontend exec tsc -b
pnpm --dir frontend lint
pnpm --dir frontend build
git diff --check
```

Si `TestParse_AcceptsValidLines` falla por fixture preexistente, documentarlo y ejecutar los tests de calendario relevantes de forma enfocada.

## 6. Version y changelog

- [ ] Buscar origen real de version antes de tocarla.
- [ ] Si hay multiples fuentes ambiguas, parar y reportar.
- [ ] Si el origen es claro, preparar bump `x.x.x.1`.
- [ ] Actualizar `docs/changelog.md` con la plantilla de `changelog-template.md`.
- [ ] Actualizar `docs/current-plan.md` con una nota breve.

## 7. Review final

- [ ] Revisar diff del seed completo.
- [ ] Confirmar que no se tocaron UI/backend salvo necesidad justificada.
- [ ] Confirmar que no se incluyeron `.gitignore`, `hub_main.html`, `.aider*`, `.agents/skills/*`, screenshots o caches.
- [ ] Dejar commit hotfix listo o commiteado segun instruccion del usuario.
