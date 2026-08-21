# ISA-732 — políticas de migración de Orbit

Este documento fija cómo el motor de `internal/strategy/application/legacy_migration.go`
trata, una por una, las 28 filas de
`evidence/isa-694-spike/matriz-migracion-orbit.csv`. El frontend no interpreta
el JSON: codifica en base64 los bytes UTF-8 de ambas claves y Go decide el
preview, la cuarentena y el commit.

## Transacción y recuperación

1. `preview_legacy_migration` calcula el fingerprint sin parsear y hace un
   primer commit atómico con `status=backed_up`, los bytes raw y el documento
   canónico anterior.
2. Solo después construye el preview exacto. Cada cuarentena incluye clave,
   path, código, explicación y raw.
3. `migrate_legacy` exige confirmar el mismo fingerprint y hace un segundo
   commit atómico con `status=committed`. Repetirlo devuelve
   `alreadyImported` sin subir la generación.
4. Si hay crash entre ambos commits, el reintento parte del journal
   `backed_up`; no vuelve a insertar eventos.
   Si el usuario cancela y el localStorage cambia, un preview nuevo conserva
   el backup anterior en `supersededJournals` antes de crear otro journal.
5. `rollback_legacy_migration` restaura el documento anterior y archiva el
   documento vigente completo en `migrationArchives`. Los drafts, revisiones,
   activaciones y su audit trail no se borran ni se reescriben.
6. La entrada JSON de aplicación conserva su límite de 4 MiB. El límite del
   documento persistido es 12 MiB porque guarda a propósito la raíz raw y los
   fragmentos raw por evento; el repositorio completo sigue limitado a 64 MiB.

## Matriz 28/28

| # | Campo de la matriz | Política implementada |
|---:|---|---|
| 1 | events / raíz | Backup antes de `json.Unmarshal`; JSON roto va a `invalid_json`. |
| 2 | events / `events` | Ausente produce aviso distinto de `[]`; tipo no-array va a `invalid_events`. |
| 3 | events / `activeId` | Solo activa IDs migrados; inválido o colgante se cuarentena y deja la activación vacía. |
| 4 | event / `id` | Falta o vacío conserva el evento raw en `missing_event_id`; colisión distinta usa `event_id_collision`. |
| 5 | event / `name` | Valor efectivo `id` con provenance `legacy_synthetic_default`; string explícito es `manual`. |
| 6 | event / `source` | Ausente usa `custom` sintético; enum desconocido bloquea y cuarentena el evento, sin reescribirlo. |
| 7 | event / `seriesId` | Solo string no vacío; otro tipo se conserva en `invalid_series_id`. |
| 8 | event / `track` | String explícito manual; ausente es `missing/unknown`; tipo inválido se cuarentena. |
| 9 | event / `cls` | Igual que `track`, sin inventar una clase observada. |
| 10 | event / `durationMin` | Entero positivo explícito manual; ausente/inválido usa 60 con `legacy_synthetic_default`. |
| 11 | event / `startAt` | RFC3339 explícito manual; ausente/inválido queda `null/unknown`, nunca `now`. |
| 12 | event / `team` | String explícito manual; inválido queda missing y raw en cuarentena. |
| 13 | event / `drivers` | Valida lista, ID único, strings y ritmos finitos; cada piloto roto se cuarentena; cero válidos bloquea el evento. |
| 14 | event / `tankL` | Número finito positivo manual; ausente/inválido usa 90 con `legacy_synthetic_default`. |
| 15 | event / `pitLossSec` | Número finito no negativo manual; ausente/inválido usa 60 con `legacy_synthetic_default`. |
| 16 | event / `strategies` | Valida ID, enums, order no vacío, referencias vivas y objetos overrides/tyres; variante rota se cuarentena. |
| 17 | event / `availability` | Valida piloto, estado, enteros, límites diarios, `from < to` y no solapes; conserva ventanas inválidas. |
| 18 | event / `activeStrategyId` | Solo activa una variante migrada; referencia colgante se cuarentena y avisa. |
| 19 | event / `teamMode` | `solo|team` explícito; desconocido queda missing y se cuarentena. |
| 20 | event / `fillMode` | `manual` se mapea; `telemetry` o desconocido bloquea el evento y conserva raw hasta que el contrato lo soporte. |
| 21 | event / `lastOpenedAt` | RFC3339 estricto; inválido queda missing y se conserva en cuarentena. |
| 22 | `writeStrategyEvents` | Tras éxito se verifica `vantare.v03orbit.strategy.migrated`; el store antiguo devuelve `false` y no llama a `setItem`. |
| 23 | strategy / raíz | Backup raw antes de parsear; corrupción usa `invalid_json`. |
| 24 | strategy / `wrapped.variants` | Exige mapa JSON; shape inválida usa `invalid_variant_map`; availability se procesa aparte. |
| 25 | strategy / mapa plano | El preview avisa de shape ambigua y valida cada entrada; no convierte propiedades inválidas en variantes. |
| 26 | strategy / `availability` | Aplica las mismas reglas estrictas de la fila 17; sin destino único se conserva como `orphan_legacy_availability`. |
| 27 | strategy / variante existente | Superpone solo campos realmente presentes y validados; no pisa name/mode/tyres con defaults del parser. |
| 28 | strategy / variante local | Exige `order` vivo no vacío; defaults de name/note/mode/state llevan `legacy_synthetic_default`; sin destino seguro se conserva como orphan. |

## Límites del corte

La página continúa leyendo el store antiguo hasta F2(d). F2(c) solo añade el
diálogo de preview/confirmación/resultado y, tras éxito, vuelve ese store de
solo lectura. No cambia `buildPlan`, el roster legacy, el cálculo, el guardado
de revisiones, la activación productiva ni la limpieza de sintéticos de
F2(d–f). La prueba con el localStorage real de Isaac dentro de Wails pertenece
al gate de fase y no es evidencia de esta issue.
