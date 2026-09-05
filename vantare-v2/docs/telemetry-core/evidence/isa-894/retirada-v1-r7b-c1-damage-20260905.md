# C1 · Hipótesis de daño resuelta — rama B (ISA-894, 2026-09-05)

Rama `vantareapp/isa-894-retirada-v1-r7b`. Rama elegida: **B**.
`wheelDetachedCount` viaja en el frame canónico pero ningún renderer
productivo lo consume; no se añade ningún campo canónico ni arquitectura.
Cero datos inventados. Sin push/PR/merge/promoción/apps/LMU.

## 1. Productor real de `snapshot.damage`: ninguno en producción

- `frontend/src/overlay/core/mock-scenarios.ts:427-476`
  (`buildMockTelemetry`): la base solo fija
  status/capturedAt/session/player/scoring; las variantes
  disconnected/error/stale la reducen. Jamás fija `damage`.
- `frontend/src/overlay/core/telemetry-adapter.ts:13-29`
  (`snapshotFromDisconnected/Error/Stale`): solo status, sin `damage`.
- Único escritor no-test del árbol:
  `frontend/src/overlay/authoring/fixtures/authoring-fixtures.ts:591-593`
  (`buildHarnessTelemetry`, dueño D/E1, intacto):
  `damage: input.widget === "car-damage-numbers" ? undefined : { body: 0,
  aero: 0, suspension: 0, tyres: [0, 0, 0, 0] }` — ceros sintéticos de
  harness, sin productor LMU/Wails detrás.
- Resto de escritores: fixtures inline de tests (borrados o actualizados
  en este corte). Conclusión literal: `body/aero/suspension/tyres` del
  snapshot nunca tuvieron productor real; eran passthrough de sintéticos.

## 2. Consumo productivo de `tyres` fraccionales y `wheelDetachedCount`

- `tyres`: solo
  `frontend/src/overlay/design-systems/vantare-crystal/car-damage-numbers/CarDamageNumbersCrystal.tsx:7`
  (`model.tyres?.length ? Math.max(...model.tyres)` → fila Tyre).
  `CarDamageVisualCrystal.tsx:7` pinta 4 iconos de rueda estáticos sin
  binding a `model.tyres`; `CarDamageVisualOriginal.tsx:1` solo usa
  `model.body`; `CarDamageNumbersOriginal.tsx:1` solo
  aero/body/suspension. Ningún otro renderer lee `tyres`.
- `wheelDetachedCount`: cero referencias en renderers y design-systems
  (`git grep` solo lo encuentra en `frontend/src/generated/telemetry.ts:387`
  como tipo, en la validación del store
  `frontend/src/telemetry-transport/overlay-frame-v2-store.ts:425-429`,
  en el fixture del test de performance y en las listas de gaps V2).
  **No es visible en ningún renderer actual.**

## 3. `DamageViewV2` mapea los 4 campos desde estado canónico (sin hueco de frame)

- `internal/telemetry/drivers/lmu/format.go:523-562`
  (`readDamageField`): `mDentSeverity[8]` → `dents`,
  `mOverheating`/`mDetached` → flags, `WheelDetachedFL/FR/RL/RR` →
  conteo → `damage.State`.
- `internal/telemetry/schema/damage/types.go:9-14`: `State` con
  `Dents[8]`, `Overheating`, `Detached`, `WheelDetachedCount`, observado
  de SHM, nunca derivado.
- `internal/telemetry/projection/overlayv2/builder_damage.go:8-58`
  (`BuildDamage`): sin señal → missing/invalid en los 4 campos; con
  señal fresca publica `Dents/Overheating/Detached/WheelDetachedCount`
  con su quality (`:43-51`).
- `internal/telemetry/projection/overlayv2/frame.go:329-333`
  (`DamageViewV2`): los 4 campos existen en el contrato generado.
- El golden `overlay_v2_20` los trae fresh (dents `[1..8]`,
  `wheelDetachedCount` fresh: fijado por
  `car-damage-c1.test.ts` + `car-damage-numbers-domain-free.test.ts`).
- El hueco declarado está solo en el render V2, no en el frame: ambos
  builders V2 mapean dents→body/aero/suspension, dejan `tyres:
  undefined` y declaran gaps `tyres/overheating/detached/
  wheelDetachedCount`
  (`car-damage-numbers-view-model-v2.ts:52-58,73-79`,
  `car-damage-visual-view-model-v2.ts:23-37,52-57`).

## 4. Diferencia legítima al pasar a V2 (sin producción atribuida)

- V1 = passthrough de fracciones sintéticas tal cual vinieran en el
  snapshot. V2 = `dents/2` canónico (aero=max(d0,d1)/2,
  suspension=max(d2,d3)/2, body=max(all)/2; `body/aero/suspension` ya
  estaban en `OVERLAY_V2_DAMAGE_*_INTENTIONAL_DIFFERENCES` y el
  comparador E4 los tiene `unsupported`, intacto).
- `tyres` pasa a `undefined` siempre → la fila Tyre de Crystal Numbers
  pinta `"n/a"`; es honestidad, no pérdida: jamás tuvo productor real.
- `overheating/detached/wheelDetachedCount` viajan en el frame para uso
  futuro sin renderer; decisión deliberada rama B registrada aquí y en
  `car-damage-c1.test.ts`.

## 5. Mecánica aplicada (mínima, sin tocar renderers ni Host)

- Producción ya resolvía por V2 vía `overlayV2ViewModelRegistry`
  (`overlay-v2-view-models.ts:134-135`, exigido por
  `overlay-v2-view-models.test.ts`) y `WidgetVisualHost.tsx:173-185`.
- Las definitions conservan el slot `buildViewModel` (ancla B1 del lote
  D4 intacta) pero sin passthrough: stub honesto `missing` + flags de
  contenido = conducta V1 exacta bajo la condición probada
  (cero productores). D4 retirará el slot con su lote.
- `car-damage-*-view-model.ts` quedan solo-tipo (los 4 renderers y los
  builders V2 los importan solo por tipo; misma ruta, cero cambios en
  renderers). Borrados: `shared/damage-reader.ts` y los 2 tests de
  builders V1. `harness-fixtures.test.ts:150` pasa visual a `missing`
  (los ceros sintéticos ya no resuelven `ready`).

## 6. Checks

- RED previo: `car-damage-c1.test.ts` 2 failed / 2 passed (`0db6b39e`).
- GREEN: focales C1 + domain-free + ambos guards + harness-fixtures +
  overlay-v2-view-models 51/51; vecinos renderers + fixture + registry
  14/14 (`49809c3f`).
- `git grep damage-reader|readDamage|buildCarDamage*ViewModel(` limpio
  salvo las propias anclas del lock C1 en el guard B1.
- `pnpm --dir frontend typecheck` verde; `pnpm --dir frontend build`
  PASS; ESLint focal limpio; `git diff --check` limpio.
