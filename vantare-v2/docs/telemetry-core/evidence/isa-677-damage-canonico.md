# ISA-696 / ISA-677 — Daño canónico extremo a extremo

Fecha: 2026-08-21. Rama: `vantareapp/isa-696-damage-canonico`, base `origin/nightly@418f26bc` (tras rebase de 686/687). Issue: #696.

## 1. Campos de daño disponibles en la SM de LMU 1.4.1.3

La memoria `LMU_Data` (ObjectOut) expone el daño solo en la fila de telemetría del player (stride 1888, base 128468). La layout admitida queda ampliada:

| Campo | Offset dentro de la fila | Tipo | Ancho | Fuente en rF2 |
|---|---|---|---|---|
| `mOverheating` | 541 | uint8 0/1 | 1 | `rF2VehicleTelemetry.mOverheating` |
| `mDetached` | 542 | uint8 0/1 | 1 | `mDetached` (piezas no rueda) |
| `mDentSeverity[8]` | 544 | uint8[8] | 8 | bytes 0=none,1=some,2=more (Pack=4) |
| `wheel.mDetached` FL | 1026 | uint8 0/1 | 1 | `rF2Wheel.mDetached` en wheel 0 (base 848+178) |
| `wheel.mDetached` FR | 1286 | 1 | | wheel 1 |
| `wheel.mDetached` RL | 1546 | 1 | | wheel 2 |
| `wheel.mDetached` RR | 1806 | 1 | | wheel 3 |

Verificado por cálculo Pack=4 sobre `RF2Data.cs` (CrewChiefV4) y por volcado de `testdata/lmu-fixture.bin` raw (track fixture no sanitizado) donde `mDentSeverity` sobrevive; las fixtures sanitizadas 1.4.1.3 (`52ff620c...`) la borraban porque el sanitizer solo copiaba campos admitidos — corregido para copiar daño del player. `WheelDetachedCount` se deriva como suma de los 4 `mDetached` de rueda (0..4).

Fixtures pinneadas 1.3 y 1.4.1.3 siguen en 324820 bytes; la sanitización reconstruye desde cero y solo los offsets admitidos viajan.

## 2. Fuente real del widget v1 y veredicto de paridad

- **v1 widgets `car-damage-visual` / `car-damage-numbers`** leen `snapshot.damage` (`widget-types/shared/damage-reader.ts`) vía Wails legacy, no vía proyección canónica. El adaptador de proyección v1 lista `damage` como `unsupported-by-projection`.
- **Único lector Go previo:** `engineer/telemetry.VehicleTelemetry.DentSeverity[8]int32` y `WheelDetachedCount` — privado de Engineer, nunca promovido al esquema canónico hasta este trabajo.
- **Paridad v2 vs v1:** **No comparable** como valor mostrado. Las dos fuentes responden preguntas distintas: v1 es una estimación del camino Wails (fuente no canónica y sin offsets auditados), v2 es la lectura directa de los 8 bytes de dent + overheating/detached + conteo de ruedas desprendidas. Un `0.9` en v1 y un `2` en SM no se pueden esperar iguales sin inventar escala. Se declara como `not-comparable` en `OVERLAY_SHADOW_POLICIES` (`car-damage-visual`/`car-damage-numbers`) con `unsupported(path=damage)`. El frame v2 no intenta reproducir `tyres` (4 fracciones 0..1) porque la SM no expone tal fraccionamiento; `tyres` queda `missing` y se lista como gap declarado.
- **VM v2 en shadow:** `car-damage-numbers-view-model-v2.ts` y `car-damage-visual-view-model-v2.ts` mapean dents→fracción `dent/2` clamp 1: `aero=max(d0,d1)/2`, `suspension=max(d2,d3)/2`, `body=max(all)/2`, `tyres=undefined`. `overheating/detached/wheelDetachedCount` viajan pero no se pintan en estos widgets. Comparador por fase con gate solo `phase=live`; fuera de live se cuenta como diferencia declarada (ver `overlay-shadow-comparator.ts` y dominio libre).

## 3. Cadena completa driver → builder

```
LMU_Data fila telemetría (offsets 541,542,544,1026,1286,1546,1806)
  → layout.go (admittedFields) → format.go:readDamageField() → Observation.Vehicles[].Damage (schema.Field[damage.State], provenance observed)
  → batch_mapper.go:mapVehicle() → core.VehicleState.Damage
  → core.Reducer ( ObservedState.Vehicles )
  → derive.FinalState (transporte sin derivar)
  → projection/overlayv2: BuildDamage() → FrameV2.damage (DamageViewV2 QValues)
  → builder_player.go: damageQuality() → CapabilitiesV2 Available["damage"] fresh/stale/missing/invalid
  → frontend contract: frame.go → telemetry-contract-gen → generated/telemetry.ts Overlayv2DamageViewV2
  → VM v2 shadow: car-damage-*-view-model-v2.ts (dents/2, gate live, flag OFF)
```

*No hay derivación inventada: el daño es observado, no derivado.*

## 4. Tamaños @104

| Artefacto | Bytes | Límite | Estado |
|---|---|---|---|
| Sintético completo @104 (`TestFrameV2SyntheticFullUnder64KiBWith104Vehicles`) | 36206 | < 65536 | ✅ |
| Golden real compacto @1 `overlay_v2_1.golden.json` | 3739 | — | — |
| @20 | 12433 | — | — |
| @44 | 21174 | — | — |
| @104 | 44110 | — | — |

Incremento vs lote2b (36037 sintético) ≈ +169 B por la sección `damage` (3 QValues + array de 8 bytes + separadores): **constante**, no escala con parrilla.

## 5. Archivos y commits

Commits (Co-Authored-By: Muse Spark):
- `6960e118 feat(telemetry): mapear daño LMU en driver y catalogo (ISA-696 T1)`
- `275f965c feat(telemetry): transportar daño hasta FinalState (ISA-696 T2)`
- `23c30d01 feat(overlayv2): capability damage y builder v2 (ISA-696 T3)`
- `ab216eda feat(frontend): VM v2 daño y dominio libre en sombra (ISA-696 T4)`
- `T5` (este) evidencia, changelog fragment, current-plan

Archivos tocados:
- `internal/telemetry/schema/damage/types.go` (nuevo)
- `internal/telemetry/catalog/{ids,catalog}.go` + `catalog_test.go` + `signal-catalog.md`
- `internal/telemetry/drivers/lmu/{layout,format,capture,capture_test,layout_test,strategy_signal_audit_test}.go`
- `internal/telemetry/core/reducer.go` + `batch_mapper.go`
- `internal/telemetry/capability/capability.go` + `drivers/lmu/capabilities.go`
- `internal/telemetry/projection/overlayv2/{frame,builder_damage,builder_player,cadence,cadence_test,frame_test,builder_player_test,damage_capability_test,testdata/overlay_v2_*.golden.json}.go`
- `frontend/src/generated/telemetry.ts`
- `frontend/src/overlay/telemetry-shadow/overlay-v2-features.ts` + `telemetry-overlay-shadow-harness/evidence.ts`
- `frontend/src/overlay/widget-types/car-damage-{numbers,visual}/car-damage-*-view-model-v2.ts` + `car-damage-numbers-domain-free.test.ts`
- Evidencia, changelog fragment y `docs/current-plan.md` (T5)

## 6. Gates

Por commit (excluyendo `build/ios` preexistente y panic preexistente de `internal/app/launcher`):

- `go build ./...` (vía `go build ./internal/... ./tools/...`) ✅
- `go vet ./tools/... ./internal/telemetry/... ./internal/app/...` → solo 3 `unsafe.Pointer` preexistentes ✅
- `go test ./tools/... ./internal/telemetry/... ./internal/app/... -count=1` → verde; `damage_capability` tripwire retirado y goldens regenerados ✅
- `pnpm --dir frontend test -- car-damage-numbers-domain-free` 6/6 ✅ ; full `pnpm --dir frontend test` según lote2b 406 archivos / 2978 tests verde (flaky `TestingCenterPage` aislado)
- `pnpm --dir frontend exec tsc -b --noEmit` ✅
- `go run ./tools/telemetry-contract-gen -check` ✅
- Centinelas `TestCachedProjectorMatchesProjectV2ByteForByte` y `TestFrameV2SyntheticFullUnder64KiBWith104Vehicles` ✅ por commit
- `git diff --check` ✅

## 7. URL del PR

(Tras push) `gh pr create` contra `nightly`, cuerpo con `Closes #696`. URL: rellenar tras T5 push.

## 8. Pendientes

- Decidir fuente Tyre-wear/tyre-damage fina vs wheel detachment si el widget v1 espera 4 fracciones; hoy se declara gap.
- Validar LMU live con daño real (colisión) y confirmar que dents 0/1/2 mapean a fracciones esperadas (hoy `dent/2`).
- Cuando se habilite `OVERLAY_V2_DAMAGE` en `DEFAULT_OVERLAY_V2_FEATURES`, retirar `snapshot.damage` Wails y el camino v1 (F9).
- Integrar `damage` en `AppState` del harness visual y métricas de sombra si se vuelve comparable.
