# LMU weekly calendar hotfix flow

Carpeta operativa para actualizar el calendario oficial semanal de LMU sin redisenar la app.

## Objetivo

Permitir que un agente reciba el texto oficial semanal de LMU, actualice el calendario local y deje un hotfix listo para review/commit.

El flujo debe ser repetible cada semana:

1. Pegar el texto oficial de LMU.
2. Actualizar el seed local del calendario.
3. Validar expansion y UI.
4. Actualizar changelog/notas.
5. Preparar commit hotfix.

## Principios

- No materializar miles de eventos en JSON.
- Modelar las carreras diarias como series recurrentes.
- Modelar Weekly como slots UTC explicitos.
- Mantener LMU-only.
- No reintroducir UI de importacion manual.
- No presentar datos estimados como oficiales.

## Race duration vs event duration

LMU suele publicar duracion de carrera, por ejemplo `20m races`, `30m races`, `60m races`.

Eso no debe interpretarse como duracion total visual del evento.

Usar dos conceptos:

- `raceDurationMin`: duracion de la carrera publicada por LMU.
- `eventDurationMin`: ventana visual total del evento, incluyendo practica + qualy + carrera.

## Sesiones estimadas

Todas las series usan sesiones estimadas uniformes:

| Sesion | Duracion | Estimada |
|--------|--------:|:--------:|
| Practica | 3 min | Si |
| Qualy | 8 min | Si |
| Carrera | `raceDurationMin` | No |

`eventDurationMin = raceDurationMin + 11` (3 + 8).

Las sesiones estimadas deben mostrarse como estimadas, nunca como dato oficial absoluto.

## Offsets horarios para daily series

Cada serie daily tiene un `startOffsetMinute` fijo dentro de la hora:

- En cada tier, por orden del seed: primera serie `:15`, segunda `:30`, tercera `:45`.
- Weekly no usa `startOffsetMinute`; conserva slots UTC oficiales.

## Validez semanal

El calendario semanal es valido de martes a martes.

## Comportamiento visual esperado

### MonthView

- Mostrar patrones compactos y eventos importantes.
- No listar cada salida diaria.
- Usar `+N mas` para exceso de eventos.

### WeekView

- Grilla horaria semanal.
- Daily intervals como resumen compacto.
- Weekly/special/eventos concretos posicionados por hora.

### DayView

- Expandir daily series para el dia visible (solo ventana de 24h).
- Mostrar cada salida como bloque visual con hora inicio-fin.
- Usar `eventDurationMin` para altura/duracion visual.
- Mostrar solapes side-by-side.

## Panel de detalle

Al abrir una carrera/serie debe mostrarse un panel central modal con fondo blur/dim, no un drawer lateral.

Debe mostrar:

- Nombre de serie.
- Circuito.
- Categoria/clase.
- SR requerido.
- Setup fixed/open.
- Duracion total del evento.
- Desglose de sesiones.
- Aviso si las sesiones son estimadas.
- Assists.
- Tyre warmers.
- Tyres.
- Splits.
- Siguiente salida.
- Follow/unfollow.
- Inscripcion: CTA solo si existe URL real. Si no, estado honesto "Desde LMU / RaceControl".

## Archivos relacionados

Archivos que normalmente participan en un hotfix semanal:

- `internal/calendar/seed/lmu-weekly-schedule.json`
- `internal/calendar/official_schedule.go`
- `internal/calendar/official_schedule_test.go`
- `docs/current-plan.md`
- changelog del repo, si existe

Si un hotfix semanal necesita tocar frontend, revisar primero si es un bug existente. El cambio semanal normal deberia ser solo seed/tests/docs.

## Prompt reutilizable

Usar `weekly-update-prompt.md`.
