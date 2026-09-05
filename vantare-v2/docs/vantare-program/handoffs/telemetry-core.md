# Handoff vivo — Telemetry Core

## R7b/E4 ejecutado en rama — oráculo shadow y builders legacy fuera, tipos vivos in situ — 2026-09-05, ISA-894

Commits locales `5391ac7d` (RED: guard E4 1 failed | 17 passed, fallo
exacto) + `92e5dd17` (GREEN, 60 ficheros, +439/−6112); el corte completo
suma +493/−6119, neto −5626.
Borrados 26 ficheros: `telemetry-shadow/` restante (comparator/sanitizer,
6 tests, 2 JSON S1) + 16 `*-view-model.test.ts` legacy (el preflight decía
28 por error de conteo). Los 16 builders quedan en tipos y helpers puros
(`withStandingsMotionIdentity`, `resolve*CellValue`,
`formatPedalsTelemetry*`, `DeltaTone`, tipos ViewModel/Row) sin mover ni
duplicar; cero callers productivos verificados por `rg` (STOP no activado).
15 tests migrados: 8 renderers/contract a literales (pit/gaps/stress
intactos), 7 V2 a aserciones nativas. B1 E4 en ausencia (B2-prep retirado),
v1-guard sin las 17 entradas E4, view-models sin shadow. Preservados:
race-schedule, car-damage, accumulator/historias (E1), scoring-readers y su
cadena relative pendiente de confirmar/retirar en E1d, geometría, goldens V2,
evidencia histórica. Checks: focales
497+297+144+105 PASS; typecheck, lint, build, `rg` y diff-check verdes.
Suite completa y Go pendientes de E1d/F1. Evidencia:
[`retirada-v1-r7b-e4-oraculo-20260905.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-e4-oraculo-20260905.md).
Review adversarial Muse + Ponytail `full` `ses_f8fac15bcffe4LyafYHDCmts0C`:
APPROVE, P0/P1/P2 = 0. P3 de evidencia, guard y formato cerrados sin nueva
abstracción. La suite completa accidental dejó 3234 PASS y 5 fallos heredados
fuera del diff E4 (cuatro de transport/store y uno i18n Studio), bloqueadores
explícitos de E1d/F. Siguiente: E1d. Sin push, PR, merge, promoción, apps ni LMU.

## R7b/E3 aprobado — 2026-09-05, ISA-894

Review adversarial read-only Muse `ses_f8fc90211ffeBn9PPLG9rIKxi4`:
APPROVE, P0/P1/P2 = 0/0/0. Revisión principal y adversarial repitieron
los dos tests Go, guard B1 18/18 y diff-check: PASS. El único P3 es una
frase histórica sin wiring en `compact_frame.go`; no bloquea ni amplía E3.
E3 cerrado; siguiente E4.

## R7b/E3 ejecutado en rama — testdata overlay y bench frontend fuera, prototipo intacto — 2026-09-05, ISA-894

Commits locales `572911f4` (RED: guard E3 1 failed | 17 passed, fallo
exacto con los 5 artefactos) + `745a1048` (GREEN, 6 ficheros, 1482
deletions, 0 inserciones). Borrados los 3 JSON
`overlay/testdata/` (`lmu-1.4-delta`, `overlay_v1_pre_d7`,
`overlay_v1`) y los 2 entrypoints research bench
(`frontend-bench-entry.ts` + `frontend-bench.mjs`, importaban el
adapter V1 ya borrado en B2). `contracts_test.go` pierde solo la
entrada overlay (strategy y analysis intactos). Guard B1 E3 de
presencia a ausencia (2 entrypoints + 3 JSON); `compact_frame.go`
(tag `researchbench`, sin cableado V1), Go bench, checks vite/html
research y custodia S1 intactos. Inventario `rg` previo: cero
consumidores ejecutables reales fuera de `contracts_test` (STOP no
activado). Checks: `TestGoldenContractsDoNotLeakCanonicalInternals`
PASS, `TestOverlayV1ContractsRetired` PASS, guard 18/18, `rg` limpio
salvo anclas del guard, `git diff --check` limpio, `gofmt` limpio.
Suite completa pendiente de E1d/F1. Evidencia:
[`retirada-v1-r7b-e3-bench-20260905.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-e3-bench-20260905.md).
Siguiente: E4. Sin push, PR, merge, promoción, apps ni LMU.

## R7b/E2 aprobado y guard simplificado — 2026-09-05, ISA-894

Review adversarial read-only Muse `ses_f8fd55932ffeI9eCwgS6qguYrF`:
APPROVE, P0/P1 = 0/0. Su P2 detectó que el guard E2 de 155 líneas
duplicaba el guard B1; se eliminó y B1 conserva solo los locks mínimos.
Corregidos además el comentario del Host y el conteo de 7 gates.
Revisión principal: 145 focales PASS, typecheck PASS, lint PASS y build
PASS. E2 cerrado; E3 tiene preflight GO.

## R7b/E2 ejecutado en rama — sistema features/rollback fuera, V2 directo — 2026-09-05, ISA-894

Commits locales `1fce8fef` (RED: guard E2 6 failed | 1 passed) +
`6ae800f2` (GREEN +74/−479, neto −405). Borrados
`overlay-v2-features.ts` + su test; callsites
Composite/OBS/Studio sin generación ni suscripción; hilo
`overlayV2Features` fuera de edit/runtime/definition; Host sin
`v2Rollback`/rama/gates; registry `{ buildViewModelV2 }` directo sin
`feature`; tests exclusivos fuera y cobertura productiva
reformulada. Corrección al microplan: el inventario real demostró
cero consumidor productivo del catálogo, así que no se mueve a otro
archivo, se elimina. Guard 7/7, focales 300/300, typecheck, lint,
build, `rg` en `src`/`dist` y diff-check PASS. Suite completa
pendiente de E1d/F1. Evidencia:
[`retirada-v1-r7b-e2-switch-20260905.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-e2-switch-20260905.md).
Siguiente: E3. Sin push, PR, merge, promoción, apps ni LMU.

## R7b/E1c aprobado — 2026-09-05, ISA-894

Review adversarial read-only Muse `ses_f8feb3bdfffe8KVwkns5tWs53q`:
APPROVE, P0/P1/P2 = 0/0/0. Los P3 no bloqueantes (clases/códigos del
golden V2 y reproducibilidad de la evidencia) quedan registrados en el
expediente. La revisión principal repitió 46 focales PASS, typecheck PASS,
lint PASS y build PASS. E1c cerrado; siguiente microcorte: E2.

## R7b/E1c ejecutado en rama — megamódulo fuera, helper V2 conservado, contract sobre frame V2 — 2026-09-05, ISA-894

Commits locales `f8ee3f74` (RED: lock E1c enumera 4 ficheros) +
`d5a34a16` (GREEN +69/−1244, neto −1175). Borrados `authoring-fixtures.ts`
+ su test exclusivo + shim `harness-fixtures.ts` (cero callers
productivos) + su test V1. `authoring-v2-scenario-widget.ts` conservado
como único helper V2 de Workshop/Parity (cae su comentario rancio que lo
mandaba a borrar, igual que el de `authoring-v2-workshop-frame.ts`).
Contract Endurance migrado a frame V2 canónico (bloques
`[lmp2, gte, hypercar]`, tope WEC con stress60) sin copiar funciones ni
datos inventados; builders legacy intactos para E4 y núcleo para E1d.
Focales 176/176 + vecinos 411/411 PASS; typecheck verde; build PASS;
ESLint/diff-check/`rg` limpios. Suite completa pendiente de E1d/F1.
Evidencia:
[`retirada-v1-r7b-e1c-autoria-20260905.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-e1c-autoria-20260905.md).
Siguiente: E2. Sin push, PR, merge, promoción, apps ni LMU.

## R7b/E1c STOP resuelto por inventario — comparator conserva 16 builders hasta E4 — 2026-09-05, ISA-894

Inventario read-only Muse `ses_f8ffd7b62ffeka520j86RvC7SE`: los 16 builders
legacy no pueden caer en E1c porque `overlay-shadow-comparator.ts` los importa
como oráculo. El agente se abortó sin cambios antes de forzar la contradicción.
Orden corregido: E1c retira solo autoría legacy; E2/E3 limpian switch y
fixtures; E4 borra comparator + builders; E1d elimina al final snapshot,
adapters, mocks y coordinador. `authoring-v2-scenario-widget.ts` se conserva
como único helper V2 de Workshop/Parity, sin duplicación. Sin push, PR, merge,
promoción, apps ni LMU.

## R7b/E1b corte mínimo — harness snapshot Studio fuera, helper diferido a E1c (P1 cerrado) — 2026-09-05, ISA-894

Commits locales `62a541b5` (RED 2/2) + `59c564a0` (borrado del
harness) + `4d4f6ca6` (revert del churn: helper restaurado
byte-idéntico, migraciones Parity/Workshop revertidas) + `59140b41`
(RED/guard en harness-only) + `c090fae0` (docs corregidas) + `048b045b`
(sin pin positivo de la deuda E1c). Retirado únicamente
`studio-v1-snapshot-test-harness.ts` (cero importadores); el guard B1
lo saca de diferidos E1 sin más cambios. `authoring-v2-scenario-widget.ts`
y `authoring-fixtures.ts` quedan con dueño explícito E1c y caen
juntos; los tipos `Mock*` de Studio son dueños E1d. D5 y E4 intactos.
Focales E1b+guard+E1a+autoridad+Parity 71/71 PASS; typecheck verde;
build PASS; ESLint/diff-check limpios. Suite completa pendiente de
E1d/F1. Evidencia:
[`retirada-v1-r7b-e1b-autoria-20260905.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-e1b-autoria-20260905.md).
Review adversarial `ses_f9002a0fbffeti4QtvJc4maIzG`: **APPROVE final**,
P0/P1/P2 = 0 tras corregir dos P2 documentales. Siguiente: E1c. Sin push, PR, merge,
promoción, apps ni LMU.

## R7b/E1a APROBADO final — contrato sin snapshot, siguiente E1b — 2026-09-05, ISA-894

Commits locales `79856dba` (RED 3/1) + `c99770a5` (GREEN).
`WidgetTypeDefinition` pierde `TelemetrySnapshot` y sus tres firmas
snapshot; `race-schedule`/`engineer-radio` conservan solo
`buildAuxiliaryViewModel` con fuentes Calendar/Engineer intactas;
`track-map` pierde el preview snapshot de la definition; el live V2 ya está
cableado en el registro y su builder preview V2 queda sin caller. Ajustes mínimos exigidos por el contrato en
`authoring-fixtures`, comparador, `studio-catalog` y guard. Focales
31/31 y vecinos 87/87 PASS; typecheck verde; build PASS; diff-check y
`rg` de ausencia PASS; suite completa pendiente de E1d/F1. Evidencia:
[`retirada-v1-r7b-e1a-contrato-20260905.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-e1a-contrato-20260905.md).
Review adversarial read-only `ses_f90150e42ffelt0XRK9JV2t3oI`: **APPROVE**,
P0/P1/P2 = 0; P3 informativos con dueño E1d/F1. Siguiente: E1b. Sin push,
PR, merge, promoción, apps ni LMU.

## R7b/D5 APROBADO final — Calendar y Engineer siguen auxiliares — 2026-09-05, ISA-894

Sin cambio productivo. `race-schedule` y `engineer-radio` son las dos únicas
familias fuera de las 18 entradas V2 y llegan al Host solo mediante
`buildAuxiliaryViewModel`, desde Calendar y Engineer respectivamente. Focal de
definitions, Host, registro y RuntimeSurface: 92/92 PASS. E1 debe retirar sus
firmas snapshot ignoradas y migrar tests antes de borrar `TelemetrySnapshot` y
`mock-scenarios`, junto al preview snapshot de Track Map, conservando intacta
la autoridad auxiliar. Evidencia:
[`retirada-v1-r7b-d5-auxiliares-20260905.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-d5-auxiliares-20260905.md).
Review adversarial read-only `ses_f902344d8ffefwjrSlff0BTYTs`: **APPROVE**,
P0/P1/P2 = 0; P3 = 2 informativos con dueño E1/F1. Siguiente: E1. Sin push,
PR, merge, promoción, apps ni LMU.

## R7b/D4 APROBADO final — las 18 definitions productivas V2-only — 2026-09-05, ISA-894

Commits `ca462478` (RED exacto 6/6), `6a5da362` (GREEN) y `4eaa0eb8`
(tests C1 de daño alineados). Las seis definitions finales ya no publican
`buildViewModel`; con D2+D3, las 18 familias productivas son V2-only. E1/E4
conservan temporalmente cuatro builders reales y los dos stubs `missing` de
daño mediante llamadas directas, sin registro ni fallback. RED 21/23;
focales 64/64, 140/140 y 68/68 PASS; typecheck, ESLint, build, diff-check y
`rg` PASS. Suite final 3412/3418, mismos seis fallos heredados ajenos.
Evidencia:
[`retirada-v1-r7b-d4-final-20260905.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-d4-final-20260905.md).
Review adversarial read-only `ses_f90288574ffeuvXgeIjpxMIP8z`: **APPROVE**,
P0/P1/P2 = 0; P3 = 2 informativos y propiedad E1/E4 (casts temporales y
tests legacy restantes). Siguiente: D5. Sin push, PR, merge, promoción, apps
ni LMU.

## R7b/D3 APROBADO final — seis definitions dinámicas V2-only — 2026-09-05, ISA-894

Commits `e3f9d5a5` (RED exacto 6/6) y `367a4df7` (GREEN).
`racing-flags`, `delta-advanced`, `delta-trace`, `pedals`,
`pedals-telemetry-compact` y `multiclass-relative` ya no publican
`buildViewModel`. Los builders y tipos legacy permanecen solo para los
oráculos E1/E4, que ahora los importan directamente sin registro paralelo ni
fallback silencioso. RED 21/23; focales 64/64 y 164/164 PASS; typecheck,
ESLint focal, build, diff-check y `rg` PASS. Suite completa 3412/3418 con los
mismos seis fallos heredados ajenos de D2. Evidencia:
[`retirada-v1-r7b-d3-dinamicos-20260905.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-d3-dinamicos-20260905.md).
Review adversarial read-only `ses_f90340906ffeafGj8G38G6gaWj`: **APPROVE**,
P0/P1/P2 = 0 y P3 = 1 informativo por cinco casts temporales `as never` de
E4. Siguiente: D4. Sin push, PR, merge, promoción, apps ni LMU.

## R7b/D2 APROBADO final — seis definitions core/status V2-only — 2026-09-05, ISA-894

Commits `fe29411c` (RED exacto 6/6), `caebb5e8` (GREEN) y `5139b09c`
(test de perfiles sin aserción V1). `standings`, `relative`, `delta`,
`fuel-strategy`, `pedals-telemetry` e `input-telemetry` ya no publican
`buildViewModel`; el contrato lo hace opcional y el registro deja de exigirlo.
El frame manual Fuel incorpora `requiredFuel/history/sessionLaps` `missing` y
cierra el fallo heredado A2. Los `*-view-model.ts` sobreviven porque contienen
tipos de renderer y el oráculo E4; `authoring-fixtures` (E1) y el comparador
(E4) llaman temporalmente a los builders D2 de forma directa, sin registro
nuevo ni fallback silencioso. Focal 223/223 y revalidación 75/75 PASS;
typecheck, ESLint focal, build, diff-check y `rg` PASS. Suite completa final
3412/3418: seis fallos heredados fuera de D2 (4 transport, 1 i18n Studio,
1 gaps Fuel). Evidencia:
[`retirada-v1-r7b-d2-core-20260905.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-d2-core-20260905.md).
Review adversarial read-only `ses_f903df475ffeAngN0noGhhxIBo`: **APPROVE**,
P0/P1/P2/P3 = 0; reprodujo guard+registry 23/23 y perfiles+Host+comparador
68/68. Siguiente: D3. Sin push, PR, merge, promoción, apps ni LMU.

## R7b/D1 APROBADO final — Host sin snapshot ni rama legacy — 2026-09-05, ISA-894

Commits locales `e92d58dc` (RED: `WidgetVisualHost.d1.test.tsx` 22 passed /
1 failed, fallo estructural exigido `not.toContain("TelemetrySnapshot")`) +
`556c68ed` (GREEN + ajustes estrictos). Inventario previo con `rg`: cero
callers productivos con `snapshot={` (los 9 callers pasan solo
widget/renderMode/runtime/diagnostics; STOP no activado, V1 no se reabre).
El Host pierde prop/import `TelemetrySnapshot`, la rama
`harnessMode && snapshot` (`buildPreview/Runtime/ViewModel`,
`definition.buildViewModel`) y el hack `input-telemetry`
(`recordInputTelemetrySample`/`readInputTelemetryHistory` + cast); +1/−20 neto.
`WidgetTypeDefinition.buildViewModel` intacto (dueños D2/D3/D4), `v2Rollback`
intacto (dueño E2), renderers/UX/frontera única intactos, cero sintéticos.
Ajustes mínimos: 2 tests legacy a frame V2 (`-0.420`/`-0.42` honestos),
props snapshot retiradas, fixture de contrato a runtime V2 canónico, guard a
ausencia (baseline sin entrada del Host).

Checks sobre `556c68ed`: focales Host/guard 79/80 (el fallo es deuda heredada
verificada en base: `v2.test [fuel-strategy]`, `makeFrame` manual sin
`requiredFuel` A2, dueño D2); vecinos 99/99; `pnpm typecheck` verde; ESLint
focal limpio; `pnpm build` PASS (aviso chunks preexistente);
`git diff --check` limpio; `rg` ausencia limpio en Host y callers. Evidencia
exacta en
[`retirada-v1-r7b-d1-host-20260905.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-d1-host-20260905.md).
Review adversarial Muse Spark 1.3 Contributor + Ponytail `full`
`ses_f905396d3ffemkM0VzgKBBux38`: **APPROVE**, P0/P1/P2/P3=0; reprodujo
27/27 D1+guard, 44/45 Host/V2/fixture con el único fallo fuel heredado y
typecheck verde. `plan.md`/`roadmap.json` sin tocar (deuda del PR R7b,
microplan F2). Siguiente: D2 por lotes (daño ya resuelto en C1, su slot cae
en D4). Sin push, PR, merge, promoción, apps ni LMU.

## R7b/C1 APROBADO final — daño rama B, sin productores snapshot — 2026-09-05, ISA-894

Commits locales `0db6b39e` (RED: `car-damage-c1.test.ts` 2 failed / 2
passed) + `49809c3f` (GREEN + borrado + guardias). Rama elegida: **B** —
`wheelDetachedCount` viaja en el frame canónico pero ningún renderer lo
consume; sin campo canónico nuevo, sin arquitectura, sin datos
inventados. Evidencia exacta en
[`retirada-v1-r7b-c1-damage-20260905.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-c1-damage-20260905.md):
cero productores reales de `snapshot.damage` (`buildMockTelemetry` y
`telemetry-adapter` jamás la fijan; solo ceros sintéticos de
`authoring-fixtures.ts:591-593` + tests); `tyres` solo lo lee
`CarDamageNumbersCrystal.tsx:7`; `wheelDetachedCount` invisible en
toda superficie de render; `BuildDamage` (`builder_damage.go:43-51`)
publica los 4 campos desde `damage.State` (driver
`format.go:523-562`); diferencia legítima = passthrough sintético vs
dents/2 canónico + tyres `undefined` (fila Tyre `"n/a"`, honestidad).

Producción ya resolvía por V2 vía `overlayV2ViewModelRegistry` + Host;
las definitions conservan el slot `buildViewModel` (ancla B1 del lote D4
intacta) como stub honesto `missing`, y D4 lo retirará con su lote. Los
ficheros `car-damage-*-view-model.ts` quedan solo-tipo (renderers
intactos, misma ruta); borrados `shared/damage-reader.ts` y los 2 tests
de builders V1; `harness-fixtures` visual pasa a `missing`.
v1-authority-guard pierde 3 entradas de ficheros sin `TelemetrySnapshot`
(sin debilitar el detector); B1 suma lock C1 (ausencia + anclas +
rama fijada en test) y conserva todos sus locks.

Checks: focales 51/51 + vecinos 14/14; `git grep` de ausencia limpio
salvo anclas del propio lock; `pnpm typecheck` verde; `pnpm build`
PASS; ESLint focal y `git diff --check` limpios. Review adversarial Muse
Spark 1.3 Contributor + Ponytail `full` `ses_f906578d5ffeWmc0D6dNFAZ9dQ`:
**APPROVE**, P0/P1/P2=0; observaciones P3 solo informativas. Confirma que el
stub `missing` es correcto mientras `WidgetTypeDefinition.buildViewModel`
siga siendo obligatorio: D1 elimina la rama legacy del Host y D4 retira el
slot de las definitions de daño; conectar un builder V2 a la firma snapshot
sería incorrecto. Siguiente: D1 y luego D2/D3/D4 por lotes (daño ya resuelto,
su slot cae en D4). Sin push, PR, merge,
promoción, apps ni LMU.

## R7b/B2 APROBADO final — proyección/transporte Overlay V1 retirados — 2026-09-05, ISA-894

Commits `c1214a4a` (tests de contrato a productos V1 independientes) +
`c8558a5e` (borrado + V2-only): salen del árbol `overlay-projection-v1*`,
`overlay-projection-adapter*`, `projection-telemetry-adapter*`,
`projection-observer*` (prod + tests) y el puente snapshot
`authoring-v2-fixture.ts`. `overlay-wails-pull` queda V2-only (allowlist de
dos eventos, sin `receivedV1Projections`, con test de rechazo legacy) y
`TELEMETRY_PRODUCTS`/regex pierden `overlay`; `projection-golden` conserva
solo Engineer/Strategy/Analysis. `ObsOverlayApp` ya estaba sin parte adapter.
Entrypoints research-bench intactos (E3); comparator/sanitizer/testdata/
resultados intactos (E4). Inventario `rg` previo sin callers productivos
fuera del lote; literales negativos útiles preservados (R2 Desktop,
no-suscripción Studio, URLs OBS).

Evidencia: guard B1 `16 passed (16)` — B2 verde y E4 presente como oráculo
afirmado; authority-guard 4/4 (registra 24 menciones reales del comparator
por el tipo local de B2-prep, sin debilitar el detector); focales
contracts/wails-pull/golden + comparator 33/33 + vecinos
(Composite/Obs/scenario/harness/store) 55/55; `pnpm typecheck` verde (mueren
los cuatro errores heredados con sus módulos); `pnpm build` PASS;
ESLint focal limpio; `rg` de ausencia limpio salvo literales negativos
útiles y el propio guard; `git diff --check` limpio. Suite completa
`3385 passed / 7 failed (3392)`: los 7 son deuda heredada verificada en
base — 4 en attach/store (reproducidos en `b434161a` sin este corte) + 3
de i18n/Fuel documentados desde B3; cero regresión B2. Siguiente: C1,
hipótesis de daño contra productor. Sin push, PR, merge, promoción,
apps ni LMU.

Review adversarial Muse + Ponytail `full` `ses_f9078d02affef8Jg2joBcn5vsz`:
**APPROVE**, P0/P1=0. El único P2 era inventario muerto de B3 en el
authority-guard y el P3 documental decía que el adapter se borraría en el
futuro; `3e2a4a30` elimina ambas imprecisiones. Revalidación del guard 20/20,
`git diff --check` limpio. P0/P1/P2/P3 abiertos = 0.

## R7b/B2-prep APROBADO — oráculo desacoplado del adapter V1 — 2026-09-05, ISA-894

Commit `3a268792`: comparator y test ya no importan
`overlay-projection-adapter` ni `authoring-v2-fixture`. El oráculo declara solo
la forma estructural que consume y el test conserva localmente la misma
conversión del golden V2. Cero ramas runtime cambiadas. Comparator 33/33,
ESLint, escaneo y diff-check PASS; guard `3 failed | 13 passed (16)`, con
B2-prep verde y solo B2 deliberadamente RED. Typecheck mantiene los cuatro
errores heredados B2 exactos. Review Muse + Ponytail `full`
`ses_f908e1c01ffeglp64iO3rfc8iV`: **APPROVE**, P0/P1/P2/P3=0. Siguiente:
B2 físico. Sin push, PR, merge, promoción, apps ni LMU.

## R7b/B3 APROBADO — runtime y tooling shadow V1 retirados — 2026-09-05, ISA-894

Commits `429a8bae`, `8aeb858c` y `b3652e11`: salen del árbol el runtime y la
activación shadow V1, los dos packages harness, sus HTML y Playwright, y los
cinco `sesion-v1-*`. Las garantías útiles de Controls quedan en el test del
comparator; los cuatro casos exclusivos de ingesta/fases V1 desaparecen con su
runtime. Comparator, sanitizador, testdata y resultados históricos siguen
intactos como oráculo E4.

El paquete S1 ya no importa tooling activo: `recalcular.mjs` contiene la
clausura exacta usada al publicar en `659b2c57`. Recalcula ON 6074/0, OFF V1=0
y shadow null 5/5, p99 67,6/49,1 ms y reducción 75,0 %; hashes PASS sin
reescribir CSV, sesiones ni resúmenes. Comparator 33/33 y bench 32/32 PASS.
Guard `4 failed | 12 passed (16)`: B3 verde, solo B2-prep y B2 siguen RED.
Suite sin guard 3442/3445 con los tres fallos heredados de i18n/Fuel; typecheck
y build reducen la deuda R7a de ocho a cuatro errores, todos en los módulos B2.
ESLint focal y diff-check PASS.

Review adversarial Muse + Ponytail `full` `ses_f909a2067ffeG4XRGFJHILQUbD`:
**APPROVE**, P0/P1/P2=0; dos P3 informativos ya poseen dueño B2/E4. Siguiente:
B2-prep y después B2. Sin push, PR, merge, promoción, apps ni LMU.

## R7b/C2b7 APROBADO final — contratos de autoría V2 puros, C2 cerrado — 2026-09-05, ISA-894

Commits `8f12c448` + `15f7f5ce`: `projection-gaps` deja de leer texto del
adapter V1 y congela sus ausencias contra los ViewModels V2 de producto;
`animation-scenes` deja los builders snapshot V1 y ejecuta Standings/Relative
mediante `buildWorkshopFrameV2`. Los adelantamientos usan dos filas Hypercar
canónicas y conservan orden por posición; Relative solo transforma gap, lado y
presencia. Los huecos sin señal V2 (`driverNumber`, `tireCompound` y
`bestLapText` de Delta) permanecen explícitos, con placeholders y captions
honestas. Standings sí conserva `bestLap` por fila y prueba el traspaso de
corona con dueño anterior explícito.

El RED focal inicial expuso siete expectativas legacy falsas; el GREEN final
cubre 71/71 pruebas focales/vecinas. ESLint del alcance, escaneo V1 y
`diff --check` están limpios. La suite frontend sin la guardia deliberada deja
3462/3465 PASS: los tres fallos restantes son deuda heredada ajena de Fuel e
i18n. Typecheck mantiene exactamente los ocho errores R7a heredados, cero
nuevos; build sigue no evaluable. La guardia queda `6 failed | 10 passed (16)`:
C2 pasa 2→0 y solo siguen RED B3, B2-prep y B2. Reviews finales Ponytail
`full`: spec `ses_f90aee3afffems8ei5Qwdtdvv8` y quality
`ses_f90ab6e2effeolpsN6jxzGzg2c`, ambas **APPROVE**, P0/P1/P2/P3=0 sobre
HEAD `15f7f5ce`. Siguiente: B3, retirar runtime/harness/scripts shadow V1. Sin
push/PR/merge/promoción/apps/LMU.

## R7b/C2b6c APROBADO final — Workshop V2 puro, C2 queda 2→0 — 2026-09-05, ISA-894

Base `76f413dedf3a9a600fefa6b417a93caf4de0ea19`; commits
`20ee2932` + `70e3881d` + `adce805f`. Workshop deja snapshot, builders,
seeders y puente V1: construye una sola vez el escenario V2 canónico, aplica el
diseño una sola vez y falla rápido ante widget o sistema desconocidos. Conserva
sus cinco variantes de forma y añade las cinco variantes dev reales
`standings-stress60`, `standings-replay`, `relative-multiclass`, `pedals-zero` y
`pedals-full`; Engineer Radio y Race Schedule permanecen como fuentes
auxiliares explícitas. Las escenas Relative transforman `relative` y
`relativeSettled` y se prueban a través del ViewModel de producto; señales sin
sumidero V2 (`lapDistanceMeters`, `tireCompound` y best-lap de Delta) siguen
declaradas como no representables, sin dato inventado.

El bucle adversarial encontró y cerró tres huecos de prueba y un defecto real:
identidad exacta del coche que cruza, orden canónico multiclase, oráculo de orden
independiente y escala del historial de pedales. Este último escribía `1` donde
el contrato exige `1000` permille; quedó reproducido RED, corregido y validado
mediante `decodeControlsHistory`. Evidencia final: nueve suites focales/vecinas,
117/117 PASS; ESLint del alcance, escaneo y `diff --check` limpios. Typecheck
mantiene exactamente los ocho errores R7a heredados, cero nuevos; build sigue no
evaluable. El guard deliberadamente RED queda `7 failed | 9 passed (16)` y C2
conserva exactamente dos anclas: `projection-gaps.test.ts` y
`animation-scenes.test.ts`. Reviews finales Ponytail `full`: spec
`ses_f90ce6163ffeJVbLSvSwAhPOVi` y quality
`ses_f90cb7c21ffeG92Ct5MFSBXHwO`, ambas **APPROVE**, P0/P1/P2/P3=0.
Siguiente: C2b7, gaps/scenes 2→0. Sin push/PR/merge/promoción/apps/LMU.

## R7b/C2b6b APROBADO final — Parity V2 puro, siguiente Workshop 8→2 — 2026-09-05, ISA-894

Commits `d98a7daa` + `f4b9b262` + `a13c4428` + `2035477f`:
`OverlayParityHarness` deja snapshot, builders, seeders y puente V1. Sus 20
widgets usan el golden canónico V2; las cinco variantes admitidas son solo de
forma y un test común fija que ninguna altera el frame. Las variantes que
fabrican telemetría se rechazan en Parity y siguen bajo contrato Workshop.
Crystal resuelve una vez el manifest, conserva dimensiones exactas y falla
rápido; Engineer Radio permanece como fuente auxiliar e Input consume
`controls.history`. Guard C2 12→8 sin silenciarlo; focales 55/55 y vecinos
26/26; ESLint, escaneo y diff-check limpios. Typecheck continúa NO verde con
los ocho errores R7a heredados exactos y build no evaluable. Reviews finales
Ponytail `full`: spec `ses_f9119e586ffepXBtcGwG2QaySu` y quality
`ses_f9116bc39ffe3TBoDcMWQ1fhi3`, ambas **APPROVE**, P0/P1/P2=0. Los P3
informativos de calidad quedan cubiertos por el test shape-only y por el dueño
E1 del helper visual temporal. Siguiente: C2b6c, migrar únicamente Workshop y
su compatibilidad (8→2); gaps/scenes permanecen en C2b7. Sin
push/PR/merge/promoción/apps/LMU.

## R7b/C2b6a APROBADO final — compat Endurance V2, siguiente C2b6b 12→N — 2026-09-05, ISA-894

Commit `b3d1a5ac`: TrackMap layout y los 23 shells Endurance eliminan
snapshot, mock, puente V1 y filas Relative fabricadas; usan únicamente el
escenario canónico V2. El nombre `Sebring` del golden resuelve exactamente a
la geometría real mediante generador+pack sincronizados. Relative conserva el
contrato 2+jugador+2. Guard C2 14→12; focales 10/10 y paquete del generador
PASS; ESLint, escaneo y diff-check limpios. Typecheck permanece NO verde con
los ocho errores R7a heredados exactos; build no evaluable y `go test ./...`
no es verde solo porque falta el `frontend/dist` embebido. Reviews Ponytail
`full`: spec `ses_f91516404ffeDJqxZpQXxO8W3d` y quality
`ses_f91535269ffeD2T3we4lnb5xlf`, ambas **APPROVE**, P0/P1/P2=0. Siguiente:
C2b6b sobre una sola familia coherente; B3/B2 siguen bloqueados. Sin
push/PR/merge/promoción/apps/LMU.

## R7b/C2b5a APROBADO final — cerrado, siguiente C2b6 14→2 por variantes — 2026-09-05, ISA-894

Commits `04da9dcc` + hardening `9648dbf4`: el responsive deja el megamódulo
legacy y publica solo el golden canónico V2 por `setOverlayFrame`. Sus tres
widgets salen del registro productivo con ids/layouts/sistemas/contenido
conservados; Standings pasa por `parseStandingsContent` para mantener columnas
tipadas. No se inventa delta: el placeholder sigue la calidad del golden.
Guard C2 15→14; prueba propia 1/1 y focales 60/60; ESLint, escaneo y diff-check
limpios. Typecheck NO verde con los ocho errores R7a heredados exactos, cero
nuevos; build no evaluable. Reviews finales Ponytail `full`: spec
`ses_f91679b01ffesHBssaqhByrm3D` y quality
`ses_f9169dd50ffe0p4nCIdjJCvfj9`, ambas **APPROVE**, P0/P1/P2=0. Parity
intacto pasa a C2b6 por variante. Sin push/PR/merge/promoción/apps/LMU.

## R7b/C2b5 preflight Ponytail — decisión aplicada en C2b5a — 2026-09-05, ISA-894

Ponytail `full` aplicado por orquestador y dos Muse read-only. Sesiones
`ses_f9174bb27ffeCalPtlXMEnfdEW` (orden/variantes) y
`ses_f9174bb4dffeNawSBoZnHHUOPQ` (runtime/TDD) coinciden en **STOP** para el
C2b5 monolítico 15→10: Parity mezcla escenarios de forma con escenarios que
cambian datos o son contrato dev/producto, y degradarlos todos a `default`
perdería cobertura. El mínimo completo pasa a ser C2b5a: solo
`responsive-overlay-main.tsx`, 15→14, runtime V2 canónico y widgets desde el
registro productivo, sin importar el megamódulo `authoring-fixtures.ts` ni
crear snapshots/seeds/fallbacks. Parity se mueve a C2b6 por variante. Si el
golden V2 no conserva la información visible, STOP. Pendiente RED→GREEN,
checks y doble review del SHA exacto. Sin código/push/PR/merge/promoción/apps/LMU.

## R7b/C2b4 APROBADO final — cerrado, siguiente C2b5a 15→14 — 2026-09-05, ISA-894

Commits `71ef8cad` + hardening `cad73784`/`dd7806a9` + contrato de test `7aa7352b`: Studio mock deja V1/puente y publica solo un escenario V2
canónico por `setOverlayFrame`. `mockSession` transforma únicamente
`session.phase` conservando quality; `mockLocation` transforma únicamente el
pit de la fila de `player.id`, con fail-fast sin ids/coches inventados. El
fixture es determinista e inmutable; el provider avanza la secuencia del
envelope como productor de autoría para que cambios sucesivos del mismo golden
no sean descartados por el coordinador; el máximo incluye el frame live
retenido y el test reproduce la colisión exacta. Se preservan primer paint, conmutación,
start/stop live y suspensión. El test usa el tipo canónico real.
Al entrar en live, el último frame conserva su forma con fuente `stopped`
antes de arrancar el adapter: evita deduplicar un primer frame live con el
mismo `epoch+sequence` y mantiene visible el placeholder desconectado.

El test amplio ya no exige el delta `-0.150` sintético del mock V1: el golden
V2 lo declara `missing` y se comprueba `data-status="missing"` + `—`. Sin
cambio productivo ni dato inventado. Evidencia: focales 40/40 y suite Studio
255/255; ESLint y diff-check limpios; guard deliberadamente
RED `7 failed | 8 passed (15)`, C2 **16 declaradas / 15 activas**; typecheck NO
verde con exactamente los 8 errores R7a heredados, cero nuevos; build no
evaluable. Review spec `ses_f917912d4ffe10UO1E5ZtcPHAW`: **APPROVE**,
P0/P1/P2=0. Review quality `ses_f917912f0ffejyS439XE3hcShv`: **APPROVE**,
P0/P1/P2=0; solo P3 informativos. Ambas acreditan Ponytail `full`.
Siguiente: C2b5a; B3/B2 siguen bloqueados. Sin push/PR/merge/promoción/apps/LMU.
`27204349` retira además los dos snapshots V1 del test de pérdida de LMU: la
simulación usa exclusivamente frame/source V2 y el escaneo de los ficheros
Studio tocados queda sin snapshot/build/publish/puente legacy.

## R7b/C2b3 APROBADO final — cerrado, siguiente C2b4 17→15 — 2026-09-04, ISA-894

Spec re-review `ses_f91f06dd6ffeGxyzv99sMczVrR`: **APPROVE**, P0/P1/P2=0
(solo P3 handoff duplicado y evidencia mutante no versionada). Quality
re-review `ses_f91ee235effemoyuBxFI9m5wW7`: **APPROVE**, P0/P1/P2=0 (P3
opcionales no bloqueantes). Estado literal: guard deliberadamente RED
`7 failed | 8 passed (15)` con C2 en **18 declaradas / 17 activas**;
focales 32/32; typecheck NO verde con los 8 heredados R7a; build no
evaluable. Siguiente: C2b4 (provider Studio mock, 17→15). Sin push/PR/
merge/promoción/apps/LMU.

## R7b/C2b3 historial — REQUEST_CHANGES, fix y cierre técnico (APROBADO arriba) — 2026-09-04, ISA-894

Quality C2b3: **REQUEST_CHANGES** (P1 único: faltaba lock permanente tras
retirar las 6 anclas + limpieza del singleton). Fix en commit `79bf23e7`
(solo guard/focales, cero producción): 9 locks negativos exactos
(`snapshot={`, constantes retiradas, `buildMockTelemetry`) para los 3
previews dentro del test existente de callers (15 intactos, fuera del array
RED C2) + los 3 ficheros en el loop sin-imports-V1; prueba de mutante sin
tocar producción (anclas inyectadas en copia temporal, detectadas por la
misma lógica). Limpieza ownership C2b3: `PREVIEW_V2_RUNTIME` eliminado del
módulo y su test (solo vivía allí; sin `deprecated`, menos código); el
focal de aislamiento fija args exactos race/track/ready/standings/
vantare-crystal/default con espía call-through (sin mock falso).
Aritmética intacta: **18 declaradas / 17 activas** (visible en el diff del
guard y en el `expected 17`; no se cambia la cifra). Guard tras el fix:
`7 failed | 8 passed (15)`; focales 32/32; ESLint y `diff --check` limpios;
typecheck con los 8 heredados (no verde); build no evaluable por bloqueo
heredado. Pendiente: re-review. Sin push/PR/merge/promoción/apps/LMU.

Writer único, rama `vantareapp/isa-894-retirada-v1-r7b`, base `5f7fca59`.
Commit de código `b61a7441` (5 ficheros, +120/−26): `HomeMiniStage`,
`ProfilePreview` y `ui-orbit-harness` pierden `buildMockTelemetry` y la prop
`snapshot`; cada uno construye su runtime con `buildAuthoringV2ScenarioRuntime`
(escenario race/track/ready, frame canónico de 20 coches) vía factory por
instancia (`useMemo`) o por llamada (`buildStageV2Runtime`): sin singleton
mutable compartido, sin `TelemetrySnapshot`, adapters/shadow V1, fallbacks ni
sintéticos; el `?raw` vive solo en el módulo C2a. TDD: RED literal en
`ProfilePreview.isolation.test.tsx` (`expected 0 to be greater than or equal
to 2`) → GREEN con dos consumidores vivos aislados (mutar standings en uno no
contamina al otro). Layout/renderer/widgets/cadencias intactos. Guard en el
mismo commit: C2 con **18 declaradas / 17 activas** (hereda la inactiva de
C2a); deliberadamente RED `7 failed | 8 passed (15)` con `expected 17`.
Focales: `ProfilePreview` 5/5 (4 existentes + aislamiento) y `HomeOrbitPage`
19/19; ESLint focal y `git diff --check` limpios; `pnpm --dir frontend
typecheck` NO verde con exactamente los 8 errores R7a heredados y cero
nuevos; build no evaluable/no ejecutado por bloqueo heredado (no se declara
verde). Riesgo: los previews muestran valores canónicos V2 (los campos con
calidad `missing` en el golden pintan placeholder, igual que toda superficie
V2; no es pérdida de información real). Guard/typecheck/build globales NO
verdes. Siguiente: C2b4 (provider Studio mock, 17→15). Sin push/PR/merge/
promoción/apps/LMU.

## R7b/C2b2 APROBADO final — cerrado, siguiente C2b3 23→17 — 2026-09-04, ISA-894

Spec C2b2 `ses_f91ff25dbffejp7kMw0wLaqfg5`: **APPROVE**, P0/P1/P2=0 (P3
redacción, aplicado aquí). Quality C2b2 `ses_f91fc9c29ffegp92tei06icSpN`:
**APPROVE**, P0=P1=P2=P3=0. Estado literal: guard deliberadamente RED
`7 failed | 8 passed (15)` con 23 anclas C2 activas; focal StudioRoute 9/9;
typecheck NO verde con los 8 errores heredados R7a; build no ejecutado.
Siguiente: C2b3 (previews Hub, 23→17). Sin push/PR/merge/promoción/apps/LMU.

Writer único, rama `vantareapp/isa-894-retirada-v1-r7b`, base `1f6a4308`.
Commit de test `56449665` (2 ficheros, +6/−26, cero producción):
`StudioRoute.test.tsx` pierde import del golden V1, `canonicalEnvelope` y
eventos legacy `status`/`projection` del caso StrictMode; golden V2 canónico
(`overlay_v2_1`) intacto; lifecycle/listeners/store/repaint/editor
preservados (focal 9/9, mismo número baseline; `studio-overlay-telemetry`
3/3). El `coordinator.publish` manual queda citado como historia auxiliar E1
(inputHistory, no autoridad de proyección ni frame V1); los literales
negativos `telemetry:overlay:projection` y `telemetry:overlay:status:get` se
conservan bajo ownership B2 (dos literales, ninguno es input V1). Barrido del fichero: solo queda ese
literal negativo; cero `TelemetrySnapshot`, `buildMockTelemetry`,
builders/seeds, `authoring-fixtures`/bridge, `overlay_v1`, goldens V1 o
`canonicalEnvelope`. (Corrección de redacción: donde decía "solo queda ese
literal negativo", léase esos dos literales negativos.) Guard en el mismo
commit: C2 con **24 declaradas / 23
activas** (hereda la inactiva de C2a); deliberadamente RED
`7 failed | 8 passed (15)` con `expected 23`. ESLint focal y
`git diff --check` limpios; `pnpm --dir frontend typecheck` NO verde con
exactamente los 8 errores R7a heredados y cero nuevos; build no ejecutado en
este subcorte (documentado). Guard/typecheck/build globales NO verdes.
Siguiente: C2b3 (previews Hub, 23→17). Sin push/PR/merge/promoción/apps/LMU.

## R7b/C2b1 APROBADO final — cerrado, siguiente C2b2 24→23 — 2026-09-04, ISA-894

Spec C2b1 Muse `ses_f920fe705ffez0fE6o5MTU6efP`: **APPROVE**,
P0=P1=P2=P3=0. Quality C2b1 Muse `ses_f920d0602ffeQ1MIm8eKW0J3RY`:
**APPROVE** final — P2 cerrado con el pin shadow (`ffdf2bf6`), sin P0–P3
pendientes (historial REQUEST_CHANGES conservado abajo). Estado literal:
guard deliberadamente RED `7 failed | 8 passed (15)` con 24 activas; focal
17/17; typecheck NO verde con los 8 heredados R7a; build no ejecutado.
Siguiente: C2b2 (StudioRoute test V2-only, 24→23). Sin push/PR/merge/
promoción/apps/LMU.

(Historial del cierre técnico, previo al APROBADO final de arriba.) Spec
C2b1 Muse `ses_f920fe705ffez0fE6o5MTU6efP`: **APPROVE**, 0/0/0/0; quality
C2b1 Muse `ses_f920d0602ffeQ1MIm8eKW0J3RY` dio entonces **REQUEST_CHANGES**
(P2 único + P3 informativo), ya cerrado arriba. Fix P2 en commit `ffdf2bf6` (solo guard): pin
estructural dentro del test existente de callers (15 intactos, sin entrada
nueva al array C2) que exige ausencia de `overlay-v2-shadow-runtime` en
`CompositeApp.tsx` (owner C2b1); la regresión falla aunque no exponga
diagnóstico. La sonda `payload: {}` queda validada y el P3 opcional se
mantiene como informativo aceptado porque el filtro es por nombre; no se
reintroduce golden V1, no se amplía la prueba y no se toca producción.
Guard tras el fix: `7 failed | 8 passed (15)` con 24
activas; focal 17/17; ESLint y `diff --check` limpios; typecheck con los 8
heredados (no verde); build no ejecutado. Siguiente intacto: C2b2 24→23
entonces; estado vigente arriba. Sin push/PR/merge/promoción/apps/LMU.

Writer único, rama `vantareapp/isa-894-retirada-v1-r7b`, base `08c660e5`.
Commit de test `5a99fa14` (2 ficheros, +20/−38, cero producción):
`CompositeApp.test.tsx` pierde el import del golden V1 y el `vi.mock` + mock
del shadow runtime (módulo que producción ya no importa desde R2); la sonda
R2 negativa usa envelope V1 inline mínimo con payload irrelevante (no es
fixture de datos) y conserva que nada se pinta + diagnóstico sin `shadow`;
los asserts shadow vacuos se sustituyen por render V2 real (`Driver 000`) y
diagnóstico sin `shadow`. Barrido completo del fichero: cero
`TelemetrySnapshot`, `buildMockTelemetry`, builders/seeds authoring,
`authoring-fixtures`, `authoring-v2-fixture`, `overlay-v2-shadow-runtime`,
nombres/goldens V1 o seeds. Guard actualizado en el mismo commit: C2 con
**25 declaradas / 24 activas** (hereda la inactiva de C2a). Focal
`CompositeApp.test.tsx` **17/17 verde** (baseline previo también 17/17);
guard deliberadamente RED `7 failed | 8 passed (15)` con `expected 24`;
ESLint focal y `git diff --check` limpios; `pnpm --dir frontend typecheck`
NO verde con exactamente los 8 errores R7a heredados y cero nuevos; build no
ejecutado en este subcorte (documentado). Guard/typecheck/build globales NO
verdes. Siguiente: C2b2 (StudioRoute test V2-only, 24→23). Sin push/PR/
merge/promoción/apps/LMU. Nota: el bloque inferior ("C2b1 CERRADO") describía
el cierre técnico previo a las reviews; el estado vigente es el bloque
superior (APROBADO final).

## R7b/C2b1 CERRADO en rama (Desktop test V2-only) — siguiente C2b2 24→23 — 2026-09-04, ISA-894

## R7b/C2b0 APROBADO final — cerrado, siguiente C2b1 26→24 — 2026-09-04, ISA-894

Spec final Muse `ses_f921b746cffeVYW5VLt14SAKGY`: **APPROVE**,
P0=0 P1=0 P2=0 (P3 informativo). Quality final Muse
`ses_f921f9197ffe7ax5CGD6KkQOMb`: **APPROVE**, P0=P1=P2=P3=0. Alcance
cerrado: solo guard + 3 docs vivos, cero producción. Estado literal: guard
deliberadamente RED `7 failed | 8 passed (15)` con C2 en **26 anclas**
activas; typecheck NO verde con los 8 errores heredados R7a; build no
ejecutado. Siguiente: C2b1 (Composite test V2-only, 26→24). Sin push/PR/
merge/promoción/apps/LMU.

Quality review Muse `ses_f92271085ffeQRY7qOv1BrisR0`: **REQUEST_CHANGES**
sobre `276ab8e4` (la spec anterior hizo timeout: sin veredicto, no se inventa
ninguno). Fixes en commit `c0745202` (solo guard, cero producción): las 4
falsas alarmas siguen fuera de `contentAbsentAll`; dentro del mismo test C2
(sin tests nuevos, 15 intactos) comprobación positiva mínima y exacta de
`import type { TelemetryAdapter }` + módulo canónico en las 4 rutas (owner
E1; falla ante import runtime o cambio de módulo; el módulo neutral no se
vigila como V1); `StudioTelemetryProvider.tsx` añadido al loop sin-imports-V1
de `V1_MODULES_B2`. Metodología de conteo aclarada: 31 declaradas/30 activas
antes (una inactiva desde C2a), 27 declaradas/26 activas después; la secuencia
30→26→…→0 es de ACTIVAS y coincide con el `expected …(26)` de Vitest. Guard
tras el fix: `7 failed | 8 passed (15)`; ESLint focal, `diff --check` y
typecheck (8 heredados exactos) limpios de regresión. Pendiente: nueva
spec+quality del checkpoint endurecido. Sin push/PR/merge/promoción/apps/LMU.

## R7b/C2b0 CERRADO en rama (guard, cero producción) — siguiente C2b1 26→24 — 2026-09-04, ISA-894

Writer único, rama `vantareapp/isa-894-retirada-v1-r7b`, base `a32c18cb`.
Commit de test/gobernanza `9e7cf552` (un fichero, +4/−4): retira del bloque
C2 del guard las 4 entradas `transports/telemetry-adapter` de `StudioRoute`,
`OverlayStudioV3`, `studio-overlay-telemetry` y `StudioTelemetryProvider`
(false-positive: `import type` bajo ownership E1, sin V1 en runtime/bundle;
producción intacta) y deja comentario mínimo que lo explica. Baseline previo:
guard `7 failed | 8 passed (15)` con C2 en 30 anclas; resultado: guard
**deliberadamente RED** `7 failed | 8 passed (15)` con C2 en **26 anclas**
exactas (cero menciones a `transports/telemetry-adapter` dentro de las anclas
negativas C2; las dos menciones `overlay-projection-adapter` siguen C2b7). ESLint focal y `git diff --check`
limpios; typecheck registra los 8 heredados R7a (no verde, no necesario para
cero producción); build no ejecutado. El guard global NO está verde: C2 sigue
en rojo hasta C2b7. Siguiente: C2b1 (Composite test V2-only, 26→24). Sin
push/PR/merge/promoción/apps/LMU.

## R7b/C2b APROBADO en re-review — desbloqueado, siguiente C2b0 — 2026-09-04, ISA-894

Re-review spec Muse `ses_f9240634bffeNNMnf3wHltlOI6`: **APPROVE**,
P0/P1/P2/P3=0. Re-review quality Muse `ses_f923cf6acffeSiLRo6Z3APoEit`:
**APPROVE**, P0/P1/P2=0; P3 no bloqueante: el golden `controls.history`
trae 2 muestras y C2b5 activa STOP/defer E1 si son insuficientes. Cero
código tocado; este commit solo registra la aprobación, sin reescribir la
historia anterior. Checkpoint C2b **desbloqueado, siguiente C2b0** con el
mismo writer. Sin push/PR/merge/promoción/apps/LMU.

## R7b/C2b CORREGIDO tras doble REQUEST_CHANGES — pendiente re-review, no escribir C2b0 — 2026-09-04, ISA-894

Spec review Muse `ses_f9240634bffeNNMnf3wHltlOI6`: **REQUEST_CHANGES**.
Quality review Muse `ses_f923cf6acffeSiLRo6Z3APoEit`: **REQUEST_CHANGES**.
Cero código tocado; este commit solo corrige microplan, evidencia y handoff.
C2b0 NO mueve ni duplica `TelemetryAdapter` (los cuatro imports Studio son
type-only; 30→26 = quitar esas anclas false-positive del guard, tipo
canónico hasta E1). Se documenta el import colgado de
`StudioTelemetryProvider.test.tsx` (`wails-telemetry-adapter` inexistente,
C2b4 lo corrige al tipo canónico). Factory por consumidor en C2b3 con
aislamiento de `standings` obligatorio; bundle no evaluable hasta
desbloquear los 8 errores R7a. `mockSession/mockLocation` solo con
transformación V2 demostrable. C2b5 retira solo USOS (helpers quedan D/E1);
input history solo desde `OverlayControlsHistoryV2` en runtime/captura;
`engineer-radio` por frontera auxiliar. C2b6 dividido por superficies
(6a, 6b…), con `buildMockTelemetry` oculto de TrackMap/shells en aceptación.
C2b7 separa gaps de scenes (builders de scenes migran o STOP/defer).
Guard numérico necesario, no suficiente (escaneo total por subcorte).
Orden `B1 → C2 → B3 → B2-prep → B2` intacto; spec + quality por subcorte;
cero sintéticos. Siguiente: re-review spec + quality del checkpoint
corregido antes de escribir C2b0. Sin push/PR/merge/promoción/apps/LMU.

## R7b/C2b MICROPLAN preparado — pendiente review antes de C2b0 — 2026-09-04, ISA-894

Auditoría read-only Muse `ses_f9245f094ffew97dEQcTBvLIio` mapeó las 30
anclas C2 activas y detectó seis bordes que impedían tratarlas como un bloque.
El microplan queda dividido C2b0→C2b7 con conteos
`30→26→24→23→17→15→10→2→0`. C2b0 NO mueve ni duplica `TelemetryAdapter`:
corrige/reclasifica las cuatro entradas type-only false-positive del guard y
mantiene el tipo canónico hasta E1 o refactor neutral futuro.
Histories E1 solo pueden permanecer en tests con dueño explícito; callers no
conservan snapshot. Previews usan factory V2 y miden bundle cuando el build sea
interpretable. Seeds, variants, scenes y gaps solo migran desde datos V2
demostrados; ausencia de productor activa STOP, nunca fallback/default o dato
sintético. Siguiente: review spec + quality del microplan y ejecutar C2b0 con
el mismo writer. Sin push/PR/merge/promoción/apps/LMU.

## R7b/C2a CERRADO en rama (doble APPROVE, sin push) — siguiente C2b — 2026-09-04, ISA-894

Writer único en `C:\tmp\vantare-v1-retirada-r7b\vantare-v2`, rama
`vantareapp/isa-894-retirada-v1-r7b`, base `41c584a7` (preflight C2 cerrado).
Commit de código `50c5f8f6`: crea
`frontend/src/overlay/authoring/fixtures/authoring-v2-scenario-fixture.ts`
(65 líneas, único fichero tocado). Semilla exacta
`internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json`
(20 filas, 3 clases, jugador `vehicle-000` dentro, relative con
side/authority del productor, source `live`): el escenario default devuelve
clones profundos exactos de frame y source; `standings-multiclass` solo
re-selecciona standings sin reescribir el productor; track y relative
canónicos intactos; estados ready→live, stale→stale,
disconnected→stopped, error→error; `PREVIEW_V2_RUNTIME` ready con 20 filas.
API estable `AuthoringV2Scenario` con session/location/state/widget/system/
variant: state/variant sí se especializan (source y standings-multiclass);
session/location/widget/system quedan reservados sin alterar el fixture
todavía. Cero
`TelemetrySnapshot`, `buildMockTelemetry`, `Date.now`, adapters, transports o
shadow-runtime V1; sin sintéticos. TDD: RED previo (módulo inexistente,
import sin resolver) → GREEN 7/7 del focal
`authoring-v2-scenario-fixture.test.ts` (el contrato lo puso el preflight, no
se tocó). Checks: ESLint focal limpio (ambos ficheros), `git diff --check`
limpio, `pnpm --dir frontend typecheck` con exactamente los 8 errores
heredados R7a en los 3 módulos documentados
(`overlay-projection-v1.ts:172`, `projection-observer.ts:72,207,209`,
`telemetry-cutover-runtime-harness/main.ts:40,41,53,54`), cero nuevos (no
verde); build no ejecutado (bloqueado por esos 8 preexistentes). Sin push/PR/
merge/promoción/apps/LMU. C2 NO está completo: callers/previews/compat (C2b)
pendientes. Riesgo: el RED pendiente real son las 30 anclas C2 del guard más
compat tests (histórico C2a: tras C2b0 son 26 activas; el fichero `authoring-v2-fixture.test.ts` del primer RED ya no
existe: el preflight lo retiró en `da516230`/`1e73fcfb`); el singleton
`PREVIEW_V2_RUNTIME` queda como riesgo C2b (factory/ownership con consumidores
reales), no se toca en este corte.

Revisión spec post-C2a Muse `ses_f925a2447ffecpXMuKkjuSaKaN`: **APPROVE**,
P0/P1/P2=0, con 7 P3. Cierres aplicados en este corte (pureza/sencillez, sin
entrar en C2b): tipo local estrecho `AuthoringV2Variant`
(`"default" | "standings-multiclass"`, sin importar `HarnessVariant` de
authoring-fixtures ni duplicar sus 10 variantes; variante desconocida falla
rápido en vez de no-op silencioso), fail-fast en carga si el golden carece de
frame/source/standings (sin fallbacks `undefined`/`[]`), focal endurecido a
9/9 con identidad distinta de clones y aislamiento ante mutaciones, y estas
correcciones de docs. `PREVIEW` singleton queda explícitamente para C2b.

Revisión quality post-C2a Muse `ses_f92522698ffeDQwN643LThbEoz`:
**REQUEST_CHANGES**, P2=2. Cierres en commit `fdb1130d` (sin entrar en C2b):
P2-1, el test multiclass comparaba `scenarioStandings` contra `rows` (el
propio campo, tautología) — ahora contra `canonicalStandings`; P2-2,
aislamiento profundo real — identidad distinta (`not.toBe`) al menos de
session, relative, player y standings, mutación tipada explícita de
`session.track.v`, `player.id` y `relative[0].name` vía cast a mutable solo en
el test (el contrato productivo sigue readonly) y segunda invocación igual al
canónico. P3 barato: el fail-fast exige además `player.id`, `session.track` y
relative no vacío con side/authority de productor (se exigen, no se
sintetizan). Independencia aclarada: es de valores runtime/bundle — el módulo
ya no importa nada de `authoring-fixtures.ts` (ni siquiera `type`; el
`import type` anterior se borró con el tipo local). Riesgos C2b registrados,
sin optimizar: singleton `PREVIEW_V2_RUNTIME` (factory/ownership con
consumidores reales) y tamaño bundle del golden `?raw` (~33,5 KB). HEAD tras
la corrección: `fdb1130d` (código+focal); este bloque se cierra en el commit
documental siguiente.

Re-review quality `ses_f92522698ffeDQwN643LThbEoz` sobre `6c4ead7f`:
**APPROVE**, P0/P1/P2=0. Reprodujo focal 9/9, guard
`7 failed | 8 passed (15)` con 30 anclas C2 restantes, ESLint y diff-check;
typecheck conserva solo los 8 errores heredados. C2a queda cerrado. C2b debe
resolver dos P3 explícitos al conectar consumidores: aislamiento cruzado del
array `standings` y factory/ownership de `PREVIEW_V2_RUNTIME`, midiendo además
el impacto del golden `?raw` en el bundle. No B3/B2 todavía.

## R7b/C2 PRE-FLIGHT CERRADO — siguiente C2a, no B3/B2 — 2026-09-04, ISA-894

B1 sigue sin cambios productivos. El preflight descubrió que ejecutar B2
directamente rompería el oráculo E4, dos tests C2 y los harnesses B3. El orden
canónico queda corregido a **B1 → C2 → B3 → B2-prep → B2 → C1 → D/E/F**.
`v1-retirement-b1.guard.test.ts` tiene 15 tests en rojo reproducible:
7 failed que enumeran en una ejecución B2 (9 rutas + 5 anclas ProductID/golden
y 4 anclas wails-pull), B3 (19 rutas + 6 referencias activas) y C2 (31 anclas
de callers/previews/fixtures), más B2-prep (3 imports); 8 passed para diferidos
y exentos. La tabla B0
queda en 15/15 grupos tras añadir `OverlayStudioV3`, `StudioTelemetryProvider`,
las tres previews Hub, el fixture authoring completo y el golden pre-D7. El
recalculador S1 queda preservado y B3 solo elimina su dependencia activa.
Comparator/sanitizer permanecen como oráculo hasta E4; B2-prep solo
desacoplará sus tipos del adapter, sin conducta. Evidencia y microplan:
`retirada-v1-r7b-b1-guardias-20260904.md` y
`2026-09-04-telemetria-v1-retirada-r7b-frontend.md`. Tras corregir los cinco
P1 de la primera quality review, re-review spec `ses_f928d2…` y quality
`ses_f928adc…` dan **APPROVE, P0/P1/P2=0** sobre `fc0a4262`; focal RED
`7 failed | 8 passed`, ESLint y diff-check reproducidos. B1 queda cerrado.
El primer RED C2 (`b72af09d`) descubrió consumidores legacy fuera del inventario
y el intento de moverlos a un módulo snapshot nuevo se abortó sin commit. Grafo
corregido: módulo puro nuevo en C2; helpers legacy existentes permanecen D/E1;
puente snapshot actual queda solo para E4 hasta B2-prep/B2. El checkpoint
corregido `5b254087` tiene doble APPROVE fresco: spec Muse
`ses_f92712299ffeGIc4JPPXEs97MN` y quality Muse
`ses_f926b66f5ffe1QN1JaDlihRZbW`, ambos P0/P1/P2=0. Verificaron 31 anclas C2
(30 activas), golden V2 de 20 coches como semilla exacta, 15 grupos B0 y árbol
limpio. Siguiente: reanudar **C2a** con el mismo writer. Los callers C2 deben dejar
también sus builders/seeds snapshot; el escenario default debe igualar el
golden V2 de 20 coches. No B3/B2 todavía. Sin push/PR/
merge/promoción/apps/LMU.

## R7b/A3 CERRADO — doble APPROVE, siguiente B1 — 2026-09-04, ISA-894

A3 CERRADO con APPROVE de spec (`ses_f92d…`) y APPROVE fresh de quality
(`ses_f92cc…`), P0/P1/P2=0 sobre HEAD `d9dd3951` (sin push/PR/merge).
Payloads re-medidos por el reviewer: **52723 / 61049 / 66677 B**
(base 104/17/17, 20ch+A3 bajo 64 KiB, 32ch+adverso+A3 bajo 72 KiB).
Riesgos no bloqueantes heredados: strings sin cota, endurecimientos P3
posibles del validador, deriva nominal documental; no se convierten en
scope. Siguiente: **B1** (guardias estructurales RED de ausencia V1).
`plan.md`/`roadmap.json` sin tocar (cierre combinado R7b pendiente).

## R7b/A3 ejecutado sin push (Delta, pendiente de revisiones) — 2026-09-04, ISA-894

Commits locales `ca4b032a → 8d2173a1` (docs decisión, Go 72 KiB por producto,
frontend 72 KiB + validador fuel, Go DeltaHistoryV2 + fixture/gates +
goldens, contrato TS, decoder V2, fix evidence harness, pin replay).
Gates: overlayv2/derive/transport/contract-gen ok; delta-trace 11/11;
transport 64/64; suite frontend 3439/3441 (2 fallos A2 preexistentes:
fuel-strategy VM y gaps del comparador, fuera de alcance, verificados
independientes); typecheck con exactamente los 8 heredados R7a, cero nuevos
(no verde); build bloqueado solo por esos 8 (preexistente).
Bytes MEDIDOS: base 104/17/17 **52723**; 20ch+A3 **61049** (margen +4487
bajo 64 KiB); 32ch+adverso+A3 **66677** (margen +7051 bajo 72 KiB); coste A3
+3353/+4013. `256 KiB` genérico intacto; ningún otro producto cambia.
Re-review spec P0 (hard clamp): override explícito >72 KiB en overlay-v2
resuelve a 72 KiB en constructor y `PublishStatus` vía regla única
`resolvePublisherMaxPayloadBytes`; menores explícitos intactos; frontend sin
cambios (ya correcto).
`plan.md`/`roadmap.json` sin tocar (cierre combinado R7b). Siguiente:
revisión de especificación + revisión adversarial de calidad.

## R7b/A3 bloqueado en preflight (Delta, cero producción) — 2026-09-04, ISA-894

Sobre `9847c544`, el inventario confirmó cero consumidores wire de
`DeltaSample.SourceTime`/`LapDistance` y que Delta Trace solo necesita los 120
instantes reales + segundos. El primer preflight sobre el fixture histórico
104/104 midió 67.561–68.221 B y activó el STOP de 65.536 B. La revisión
adversarial descubrió que ese fixture es inalcanzable: producción limita
`Relative` y `RelativeSettled` a 17 filas. Una segunda medida temporal,
alcanzable (Standings 104 + Relative 17 + settled 17 + bestLap fresh), dio
52.796 B base y 56.149–56.809 B con A3; con strings de 20 caracteres,
62.245–62.905 B. Sin embargo, con strings libres de 32 caracteres el frame
base todavía cabe (63.860 B) y A3 lo hace fallar (67.213–67.873 B), creando
una nueva región legal de rechazo. Por ello A3 sigue `BLOCKED`: cero código,
cero tests RED persistidos y tree limpio tras eliminar los artefactos.

Evidencia exacta:
[`retirada-v1-r7b-a3-delta-preflight-20260904.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-a3-delta-preflight-20260904.md).
Decisión pendiente: aprobar un presupuesto Publisher mayor con gate de no
regresión o una recodificación lossless del wire mediante ADR. No reducir 120
muestras, precisión, calidad, información, funciones ni cadencia; no continuar
B–F mientras falte la paridad Delta V2. Este bloque prevalece sobre A2 para el
estado y la siguiente acción.

## R7b/A2 ejecutado en rama (fuel, sin push) — 2026-09-04, ISA-894

Writer unico en `C:\tmp\vantare-v1-retirada-r7b\vantare-v2`, rama
`vantareapp/isa-894-retirada-v1-r7b`, base exacta `d32b56f1` (limpia,
verificada antes de empezar). Commits locales A2 (sin push/PR/merge/
promocion/release, sin apps/LMU/navegadores, sin `.env*`, sin dependencias
nuevas): `564016fc` (derive: `FuelHistory` 64 con ownership/clone/reset
canonicos + ventana 3/10 intacta y separada) → `97b66d05` (proyección:
`FuelHistoryV2` + `SessionLaps` siempre + `RequiredFuel` = perLap x
sessionLaps peor-de + dirty signals fuel + goldens + stress) → `0bfb7f3f`
(contrato TS solo vía `go run ./tools/telemetry-contract-gen`; `task` CLI
ausente, comando real reportado literal) → `63bf4eec` (decoder history +
requiredFuel en litros, sin `Date.now`, `DECLARED_GAPS` a `fuelPercent`) →
evidencia + este checkpoint. Este bloque prevalece sobre el inferior solo en
el avance A2; siguiente accion: A3 y resto de R7b por sus writers; el cierre
combinado R7b hara `plan.md`+digest (no se tocan aqui).

TDD RED→GREEN literal en
[`retirada-v1-r7b-a2-fuel-20260904.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-a2-fuel-20260904.md):
RED derive (build failed: `MaxFuelHistory`/`History` undefined) → GREEN
(`derive` ok, 2 correcciones de fixture propias, cero diseño); RED
proyección (build failed: `History`/`SessionLaps`/`RequiredFuel`
undefined) → GREEN (overlayv2 ok; `Basis` intacto, comentario
requiredFuel-ausente derogado en el builder); RED decoder (3/5 fail:
history `[]`, requiredFuel `undefined`) → GREEN (fuel-strategy 17/17,
shadow focal 33/33). Gate duro: sintético @104 63613 → 64208 bytes (+595,
margen 1328 bajo 65536) PASS con gate intacto; preflight local ~559 bytes
dio PROCEED antes de tocar producción. Contrato check + `git diff
--exit-code` verdes. `pnpm typecheck`: CORRECCIÓN del orquestador — el
reporte inicial afirmó 8 errores pero la repetición sobre `5f4d5a02` dio 9
(`evidence.ts` del shadow harness sin los 3 campos Fuel nuevos, `TS2739`);
fix mínimo `missing` + aclaración de unidades (wire sigue
`frame.units.fuel`, widget liters-only documentado) en commit explícito;
repetición con salida íntegra confirma los 8 heredados R7a byte-idénticos,
cero nuevos; no se declara verde global. `go vet` limpio en el diff;
`git diff --check` limpio. `fuel.sessionLaps` queda en wire sin decoder
widget (forma v1 conservada; documentado). Sin runtime físico: todo
sintético/determinista; LMU/Wails pendiente de Isaac.

Cierre A2: doble aprobación fresca sobre `c59efbff` — spec
`ses_f9536ddf4ffeOAJpR9axTS4Twt` APPROVE P0/P1/P2=0 y quality
`ses_f95328eeeffeh7zGiYvEN3dSKC` APPROVE P0/P1/P2=0; P3 no aplicados (no
bloqueantes, fuera de alcance). Deuda para auditoría en evidencia A2
(preference Fuel vs `SectionFuel` <=1s, naming liters-only, comentario
non-fresh, cobertura stint-only, average no finito, decoder malformed sin
tests). **A2 CERRADO**; siguiente A3 con preflight obligatorio (margen
1328 bajo 65536).

## R7b/A1 ejecutado en rama (controles, sin push) — 2026-09-04, ISA-894

Writer unico en `C:\tmp\vantare-v1-retirada-r7b\vantare-v2`, rama
`vantareapp/isa-894-retirada-v1-r7b`, base exacta
`f287288825af7aff9f234e984dd3fa59a9d32779` (limpia). Commits locales A1
(sin push/PR/merge/promocion/release, sin apps/LMU/navegadores, sin `.env*`,
sin dependencias nuevas):
`5416847c` (derive: `ControlSample` + `SpeedMPS`/`EngineRPM`/`Gear` como
`schema.Field` desde el `VehicleState` activo + tests + golden fiel) →
`5e3e60ca` (proyección: `ControlsHistoryV2` exacto de 8 miembros con
`CapturedAtMS` y motion con calidad + tests + goldens regenerados vía
`UPDATE_GOLDEN=1`) → `8e8aeaf0` (contrato TS solo vía
`go run ./tools/telemetry-contract-gen`; `task` CLI ausente en el worktree,
comando real reportado literal) → `6d3a9116` (decoder absoluto `CapturedAtMS`
+ frontera fail-closed V2 + fixtures + evidencia exacta). Este bloque
prevalece sobre el inferior solo en el avance A1; siguiente accion: A2/A3 y
resto de R7b por sus writers; el cierre combinado R7b hara `plan.md`+
digest (no se tocan aqui).

TDD RED→GREEN literal en
[`retirada-v1-r7b-frontend-20260904.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7b-frontend-20260904.md):
RED derive (build failed: `SpeedMPS`/`EngineRPM`/`Gear` undefined) → GREEN
(`go test ./internal/telemetry/derive/` ok); RED proyección (build failed:
`CapturedAtMS`/`SpeedMPS` undefined) → GREEN (overlayv2 ok);
RED decoder (5/5 fail: reconstruía desde `generatedAt` 1999 → 915148800000)
→ GREEN (input-telemetry 5/5→18/18 con su dir, transport 62/62, Host+shadow
114/114, suite frontend completa 442/3430). Gate duro: sintético @104
53982 → 63613 bytes (+9631, margen 1923 bajo 65536) PASS; sección @120
1515 → 11146 bytes. Contrato check + `git diff --exit-code` verdes.
`pnpm typecheck`: 8 errores heredados R7a byte-idénticos antes/después
(`ProductID` vs `"overlay"` en `overlay-projection-v1.ts`,
`projection-observer.ts`, `telemetry-cutover-runtime-harness/main.ts`,
ámbito B, fuera de A1), cero nuevos, cero de controles; no se declara verde
global. `go test ./internal/... ./tools/...` PASS sin FAIL;
`cmd/vantare`+`frontend` en setup-failed preexistente por `dist/` ausente
(build bloqueado por los mismos 8 errores; idéntico en base). `go vet` solo
los tres `unsafe.Pointer` heredados fuera del diff; `git diff --check`
limpio. Revisión del orquestador en curso: el bloque vacío transitorio
`if view.WindowMS != 0 {}` ya quedó eliminado y reemplazado por aserciones
reales de `CapturedAtMS`; reset epoch+`SameSession` intacto en
`TestPipelineResetsHistoryAtEveryDeclaredIdentityBoundary` + reset con motion
nuevo. Sin runtime físico: todo sintético/determinista; LMU/Wails pendiente
de Isaac.

## R7b planificado (microplan, sin codigo) + R7a final comprometido — 2026-09-04, ISA-894

Writer unico en `C:\tmp\vantare-v1-retirada-r7b\vantare-v2`, rama
`vantareapp/isa-894-retirada-v1-r7b`, base exacta `5198e4cd5a007893faedd89151168ae26bf7e951`
(R7a final). Secuencia documental conocida: `d242f634` → `2a2ab054` →
`46d519d5` → `e4342b69` → `20e0aaf1` (HEAD revisado SPEC por el orquestador);
HEAD de trabajo = el commit de esta corrección (su hash queda en el propio
commit y en el reporte, no inventado aquí). Sin apps/LMU/navegadores, sin
`.env*`, sin push/PR/merge/promocion/release.

R7a final comprometido en esta linea: `7ee3f87b` (retirada de contratos Overlay
V1: `telemetrytransport.ProductOverlay` + `knownProduct`,
`internal/telemetry/projection/overlay/v1.go`, raices Overlay V1 de
`tools/telemetry-contract-gen`, wire `Overlay*V1` + `"overlay"` del TS generado
solo via `task telemetry:contract`; Hub a Strategy, negativas a Engineer,
rutas/eventos a literales historicos de ausencia, bench `researchbench` a
Strategy/brazos comparativos sin V1; TDD RED→GREEN con
`TestOverlayV1ContractsRetired`) + `5198e4cd` (checkpoint documental: microplan
R7a, evidencia y bloque de handoff). Evidencia:
[`retirada-v1-r7a-contratos-go-20260904.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r7a-contratos-go-20260904.md).
Los JSON de `overlay/testdata/` quedan huerfanos hasta R7b. Estado heredado de
R7a: Go/contract/frontend-runtime verdes; `pnpm typecheck` en rojo con 8 errores
en 3 modulos legacy de R7b; build/dist/`cmd/vantare` bloqueados en cascada.

R7b planificado, todavia **sin codigo productivo**: microplan ejecutable en
[`2026-09-04-telemetria-v1-retirada-r7b-frontend.md`](../../superpowers/plans/2026-09-04-telemetria-v1-retirada-r7b-frontend.md),
**corregido tras REQUEST_CHANGES adversarial** (commit de corrección sobre
`d242f634`, solo estos 2 docs) y **recorregido tras segunda revisión de calidad
REQUEST_CHANGES** (commit sobre `2a2ab054`; sin afirmar aprobación futura) y
**autocorregido por arquitectura del orquestador sobre `46d519d5`** (commit
sobre `46d519d5`; `46d519d5` era el HEAD revisado) y **recorregido por
contradicción B0/B3/E3 sobre `e4342b69`** (commit `20e0aaf1`; `e4342b69` era el
HEAD revisado) y **corregido SPEC sobre `20e0aaf1`** (este commit; sin afirmar
aprobación futura). Esta ronda SPEC: E2 absorbe el residuo rollback del Host
(`WidgetVisualHost.tsx:121-126`, 8 gates, 2 tests) con `rg`
`v2Rollback`+`overlay-v2-rollback`; A3 refuerza la omisión
`SourceTime`/`LapDistance` con inventario `rg` y STOP conservar/migrar.
Ronda anterior: B0 en 13 grupos (fila sesion-v1/B3 separada de
entrypoints research-bench/E3; Go bench preservado sin dueño de borrado);
B3 dueño exclusivo de runtime/2 packages harness/scripts-HTML sesion-v1
(E3 no los toca); E3 dueño exclusivo de los 3 JSON + 2 entrypoints frontend +
residuales verificados; A2/A3 con microcheckpoints a–d en texto propio.
Autocorrecciones: A1 ya no usa Q
único + arrays acortados —derive añade exactamente `schema.Field` por campo
(SpeedMPS/EngineRPM/Gear) y el wire lleva `QValue` por muestra siempre
alineados, sin `V` en missing, sin sentinel ni pérdida; A1/A3 cambian edades
relativas a `GeneratedAt` por `CapturedAtMS []int64` absolutos cache-safe
(`cadence.go:331-340`: la sección memoizada sobrevive a varios
`frame.GeneratedAt`), sin rebaseo ni reconstrucción dependiente del frame;
STOP explícito si el formato con calidad no cabe en 64 KiB. Segunda ronda:
gate de payload efectivo Publisher 64 KiB (frame @104 < 64 KiB; Hub 256 KiB
secundaria) con bytes absolutos/delta en evidencia exacta
`docs/telemetry-core/evidence/isa-894/retirada-v1-r7b-frontend-20260904.md`;
A1 cerrado (reset vigente epoch+SameSession, fuente m/s sin SpeedKPH canónico,
`CapturedAtMS` absolutos cache-safe, tipos exactos, sin "preferentemente"/"p. ej.");
A2 con contrato `FuelHistoryV2` fijado y derogación del comentario
`builder_fuel.go:44-48`; A3 mínimo (`DeltaHistoryV2`, mapping exacto,
`Trend` intacto); B0 consistente en 13 grupos; D5 sin RED; microcheckpoints
a–d por A en la misma rama/PR (A2/A3 en texto propio); E2 fijado según callsites (catálogo estático a
`overlay/core/overlay-v2-feature-catalog.ts`, default directo en los 3
callsites, más Host `WidgetVisualHost.tsx:121-126` con sus 8 gates
`!v2Rollback` simplificados y 2 tests del código `overlay-v2-rollback`
actualizados; E2 dueño del residuo rollback, no diferido a D1; `rg`
`v2Rollback`+`overlay-v2-rollback` en árbol y bundle); E3 exacto (3 JSON nombrados, `frontend-bench-entry.ts`/`.mjs` fuera,
Go bench preservado, `sesion-v1-*` y packages harness solo en B3,
`vite.config`/HTML intactos por `rg` limpio). Primera ronda: A1 ya no llama canónica
a la historia actual (verificado: `ControlSample` sin Speed/RPM/Gear); A2 separa
ventana 3/10 de la nueva historia 64 y fija `requiredFuel` = perLap × sessionLaps
sin derivar de `EstimatedLaps`; A3 corrige premisa (`SelfDelta.History` existe,
`DeltaViewV2` sin campo: el corte lo agrega) y elimina singleton/`Date.now`
solo tras verde; omisión `SourceTime`/`LapDistance` reforzada con inventario
`rg` (delta-trace legacy solo `{capturedAt, deltaSeconds}`; cero consumidores
wire en `delta*/`; STOP conservar/migrar si aparece consumidor real); comparator/sanitizer sobreviven como oráculo hasta E4 (D no se
queda sin oráculo); tabla B0 asigna dueño/corte a los 13 grupos sin
`etc.`; C1 pasa a hipótesis contra productor (ramas A/B con evidencia, sin
inventar fracciones); C2/D1 resueltos (C2 no exige Host V2-only; D1 verifica
cero callers y elimina); E2 con expectativa única falsable sin disyunción;
F declarado verificación no-TDD; rollback R0 literal (artefacto+hash por código,
restauración física pendiente manual de Isaac, no probada); D2/D3/D4 en lotes
explícitos de 6 + corte auxiliar D5 (conservación, sin RED); comando exacto
`pnpm --dir frontend typecheck`; `plan.md`+digest como deuda obligatoria del PR
de código (`roadmap:required`), no del commit solo-plan.
Orden: A paridad V2; B guardias RED + retirada V1 (oráculo conservado); C daño
hipótesis + fixture V2 puro y previews; D1 Host + D2/D3/D4 lotes + D5
auxiliares; E borrado final + E4 oráculo + E2 switch; F gates/cierre. Commits pequeños en UNA rama R7b y un único draft PR
apilado sobre #977; rollback exclusivo por build anterior R0 (artefacto+hash
preservados, compatibilidad verificada por código; restauración física no
probada, pendiente manual de Isaac).
`Strategy`/`Engineer`/`Analysis` v1 independientes se preservan. Este commit no
toca `plan.md`/`roadmap.json`: el mero microplan no cambia el roadmap público;
se actualizarán en el mismo PR que entregue código si cambia entrega pública.
Este bloque prevalece sobre los inferiores solo en el avance R7a→R7b;
**siguiente accion: ejecutar R7b**; solo el combinado R7a+R7b se publica.

## R6b Hub Overlay Telemetry V1 inerte retirado y publicado en PR draft #977 — 2026-09-04, ISA-894

Writer unico en `C:\tmp\vantare-v1-retirada-r6b\vantare-v2`, rama
`vantareapp/isa-894-retirada-v1-r6b`, base exacta `58d1e8fe`. HEAD de
codigo/test/microplan `c5c85012` y cierre documental `afafe3ce`, publicados
en el PR draft [#977](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/977)
hacia `nightly`; sin merge, promocion ni release.

R6b retira de `TelemetryCoreRuntime` el Hub Overlay Telemetry V1 inerte:
campo, `NewHub(ProductOverlay...)`, import `overlayprojection` huerfano,
accessor `Hub()`, cierre, metricas `Transport` y contadores
`ProjectionsPublished`/`OverlayProjectionsPublished`, mas la rama huerfana de
`productName` y las versiones huerfanas que marco el wiring guard (misma
doctrina que `FromFreshness` en R6a.1). Migra 11 tests + harness a ausencia
estructural o Strategy correcto, con peticion Overlay negativa en el replay.
Conjunto 58d1e8fe → c5c85012: 15 archivos, +351/-269 (14 de
codigo/test mas microplan). Evidencia:
[`retirada-v1-r6b-hub-20260904.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r6b-hub-20260904.md).

TDD: RED estructural con 10 restos literales (2 campos Hub, `hub`/`Hub()`,
3 metricas, 4 restos en fuente); GREEN con retirada minima y guard
endurecido. Gates: focales, `internal/app` + `telemetrytransport` + `server`
+ `cmd/vantare` afectados, wiring guard sin excepciones nuevas,
`pnpm --dir frontend build` PASS (dist real) y `go test ./... -count=1` PASS
fresco completo sobre `c5c85012`, `go vet` solo con los tres `unsafe.Pointer`
heredados fuera del diff, gofmt y `diff --check` limpios. Reviews finales
sobre SHA `c5c85012` + diff local final: spec
`ses_f95dacf4bffe1EM9LaZK5VfOmm` APPROVE P0/P1/P2/P3=0 (cumplimiento R6b) y
quality `ses_f95d7c49bfferYo8uws0fzpJDf` APPROVE P0/P1/P2/P3=0
(calidad/lifecycle/tests/huerfanos), con sus 4 mejoras minimas ya cerradas
en `c5c85012`.

R6b NO significa Overlay Telemetry V1 ausente del binario: quedan para R7
los tipos y contratos (incluido `ProductOverlay`), el tooling y el frontend
legacy. R7 se divide en R7a (Go/contratos/tooling) y R7b (frontend legacy).
Strategy/Engineer/Analysis V1 son contratos independientes vivos y no forman
parte de esta retirada. La auditoria integral V2 y el bucle de rendimiento
aun no comienzan; no se certifica rendimiento optimo. Rollback solo por la
build anterior verificada en R0. Este bloque prevalece sobre los inferiores
en el avance de retirada, sin repetir su contenido.

## R6a + R6a.1 productor Overlay V1 y constructores huerfanos retirados, cerrado localmente — 2026-09-04, ISA-894

Writer unico Muse en `C:\tmp\vantare-v1-retirada-r6a\vantare-v2`, rama
`vantareapp/isa-894-retirada-v1-r6a`, base exacta R5 `2371958d`. R6a,
commit `fcf96568`, retira el unico productor runtime de Overlay V1 y su
activacion (19 archivos, +373/-393, con `-3` lineas en
`settings-contract.ts`). R6a.1, commit `8878178d`, retira los
constructores huerfanos `overlay.ProjectV1`/`ProjectorV1` y
`telemetrytransport.NewOverlayFull`, y el export huerfano
`projection.FromFreshness`, migrando sus tests a hechos canonicos y Overlay V2 (17 archivos,
+470/-1130; sin frontend). Conjunto: 35 archivos, +839/-1519. Sin apps,
LMU, navegadores, `.env*`, merge, promocion o release. Evidencia:
[`retirada-v1-r6a-r6a1-20260904.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r6a-r6a1-20260904.md).

TDD: RED arquitectonico del wiring guard citando `NewOverlayFull` y
`overlay.ProjectV1` sin caller productivo, mas el replay canonico que no
compilaba contra V1 retirado; GREEN retirando ambos constructores, con
doble excepcion minima al microplan: digest canonico con OverlayFrame V2
determinista (`ProjectV2` puro, golden `fffecdb4…faea`) y garantia fija
del fingerprint canonico LMU14 (`393155d6…092b6b4`). La politica de
fallos conserva `ErrPayloadTooLarge` real en policy V2 no terminal y en
legacy fail-stop. Gates: wiring guard, focales, `internal/app` +
`internal/telemetry`, `go test ./...` PASS; `go vet` solo con los tres
`unsafe.Pointer` heredados fuera del diff; gofmt, `diff --check` y
frontera por simbolo limpios. Frontend heredado verde de R6a, no
repetido en R6a.1. Spec review Muse `ses_f95fb746cffeIJegu669xjgMYj`:
APPROVE, P0/P1/P2=0. Quality review Muse `ses_f95f72d65ffe0O1cnMMxgbWNPs`:
APPROVE, P0/P1/P2=0, P3=3: researchbench con V1 (a R7), golden canonico
deliberadamente en ProjectV2, y comentario del Hub acotado ya corregido
sin logica (focal 2/2 PASS). Roadmap `telemetry-live` actualizado en
ES/EN/PT/IT con digest regenerado y `--check` verde.

R6a/R6a.1 NO significan V1 ausente del binario: quedan para R6b/R7 el
Hub Overlay inerte y luego los tipos y contratos, el tooling y el
frontend Overlay legacy segun callers. Strategy/Analysis/Engineer V1 son
contratos independientes vivos que se preservan y estan fuera del alcance
de la retirada Overlay V1; el V1 de investigacion bajo tag
`researchbench` tampoco se toca en este corte y se retira en R7. La
auditoria integral V2 y el bucle de rendimiento aun no comienzan; no se
certifica rendimiento optimo. Rollback solo por la build anterior
verificada en R0. Publicado en
[PR draft #976](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/976)
contra `nightly`, rama remota `vantareapp/isa-894-retirada-v1-r6a`,
apilada sobre #969/#970/#971/#972/#973/#974/#975: el codigo/test esta en
`8878178d` y este documento se incorpora en el commit de cierre
`9451ad6b`. Sin merge ni promocion; este bloque prevalece sobre los
inferiores en el avance de
retirada, sin repetir su contenido.

## R5 ruta SSE publica Overlay V1 retirada y publicada — 2026-09-04, ISA-894

Writer unico Muse en `C:\tmp\vantare-v1-retirada-r5\vantare-v2`, rama
`vantareapp/isa-894-retirada-v1-r5`, base exacta R4 `d9893379`. Commit de
codigo/test/microplan `cd5b33c3` y hardening de integracion `4daea04a`;
sin apps, LMU, navegadores, `.env*`, merge, promocion o release.

R5 elimina `ServerConfig.OverlayProjection`, el registro de
`GET /telemetry/overlay/projection` y su wiring en `main`. El harness ya no
publica ni compara Overlay V1 por HTTP, exige 404 con el Hub V1 interno vivo y
conserva Strategy Wails/SSE, Overlay V2 SSE/pull, Engineer y shutdown. Evidencia:
[`retirada-v1-r5-ruta-sse-20260904.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r5-ruta-sse-20260904.md).

TDD: RED cancelable porque R4 abria el SSE V1 en lugar de responder 404;
GREEN con servidor, lifecycle, paquetes focales y `go test ./...` PASS.
Build frontend PASS. Vet focal PASS; vet global conserva tres avisos heredados
de `unsafe.Pointer` fuera del diff. Revision de especificacion Muse
`ses_f9646e4bfffe3U670drv4bDWWB`: APPROVE, P0/P1/P2=0.
La primera review de calidad Muse `ses_f9641e0e8ffeTifyWR2BSh084U` tambien
aprobo sin P0/P1/P2; su P3 sobre la ausencia de una asercion negativa de
integracion se endurecio en el harness antes del SHA final.
Review final Muse `ses_f963d3a8fffeYpLFm41Uwq6EdJ` sobre `4daea04a`:
APPROVE, P0/P1/P2=0.
[PR draft #975](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/975)
abierta contra `nightly`, apilada sobre #969/#970/#971/#972/#973/#974; sin
merge ni promocion.

R5 NO significa V1 ausente del binario: productor, Hub, flag, persistencia,
metricas, tipos, builders, fixtures y tooling siguen. El inventario R6
recomienda dos microcortes: R6a elimina produccion/configuracion V1 dejando el
Hub inerte; R6b elimina Hub, metricas de transporte y constructor huerfano.
R7 retira contratos/tooling/frontend legacy cuando ya no tengan callers. La
auditoria integral V2 y el bucle de rendimiento aun no empiezan. Rollback solo
por build anterior R0.

## R4 OBS V2-only publicado en PR draft — 2026-09-04, ISA-894

Writer único en `C:\tmp\vantare-v1-retirada-r4\vantare-v2`, rama
`vantareapp/isa-894-retirada-v1-r4`, base exacta R3 `f755a527`. Candidato
`c2bc2142`; sin apps, LMU, navegadores, `.env*`, merge, promoción o release.

R4 elimina de OBS la construcción y ejecución del adapter SSE V1 y la
activación/diagnóstico/dispose del shadow. Conserva store, binding y SSE
OverlayFrame V2, `invalid-frame`, Engineer, perfil, calendario, Race Schedule,
flags V2, diagnósticos, StrictMode y teardown. Evidencia:
[`retirada-v1-r4-obs-20260904.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r4-obs-20260904.md).

TDD: RED 3 fallos/7 superados por el tercer EventSource V1; GREEN 10/10.
Checks del orquestador: OBS/V2 25/25, typecheck, build, ESLint focal,
`diff --check` y frontera V1/shadow PASS. Review de especificación Muse
`ses_f96617126ffeAzP2TFMF1g0Uqs`: APPROVE, P0/P1/P2/P3 bloqueantes=0.
Review de calidad/adversarial Muse `ses_f965c73b9ffexbDbAPyPAF3m76`:
APPROVE, P0/P1/P2/P3 bloqueantes=0; reprodujo 25/25 tests, typecheck, ESLint,
frontera y digest. [PR draft #974](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/974)
abierto contra `nightly`, apilado sobre #969/#970/#971/#972/#973; CI pendiente.

R4 NO significa V1 ausente del binario: productor, ruta SSE, configuración,
contratos, adapters, tipos, builders y fixtures legacy siguen. Siguiente corte:
retirar la producción/publicación y ruta V1 por dependencia, antes de borrar
tipos y tooling. La auditoría V2 y el bucle de rendimiento aún no empiezan.
Rollback exclusivamente por build anterior R0.

## R3 Studio V2-only publicado en PR draft — 2026-09-04, ISA-894

Writer único en `C:\tmp\vantare-v1-retirada-r3\vantare-v2`, rama
`vantareapp/isa-894-retirada-v1-r3`, base exacta R2 `cc443e53`. Candidato
`b4c0a38c`; worktree limpio al congelar código/test/microplan. Sin apps, LMU,
navegadores, `.env*`, merge, promoción o release.

R3 elimina del ciclo productivo de Studio la construcción y ejecución del
adapter Overlay Projection V1. El lifecycle recibe el coordinador existente,
resetea el store, adjunta listeners V2 antes del pull, conserva restart,
invalid-frame, diagnósticos, auxiliares y cleanup. Los mocks de autoría,
fixtures, OBS, backend, productor, rutas, flags y tipos siguen intactos.
Evidencia:
[`retirada-v1-r3-studio-20260904.md`](../../telemetry-core/evidence/isa-894/retirada-v1-r3-studio-20260904.md).

TDD: el RED V2-only produjo 3 fallos por
`options.legacy.coordinator`; GREEN focal 3/3 y Studio 23/23. Typecheck, build,
ESLint focal y `diff --check` PASS. Review de especificación Muse
`ses_f96748a29ffeuTz9Gdq49MyRqb`: APPROVE, P0/P1/P2/P3=0. Review de
calidad/adversarial Muse `ses_f96711213ffenLfc0LKeJ6ncbY` sobre `cb9a3068`:
APPROVE, P0/P1/P2/P3 bloqueantes=0. [PR draft #973](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/973)
abierto contra `nightly`, apilado sobre #969/#970/#971/#972; CI pendiente.
Siguiente migración: OBS V2-only; después se puede retirar la
ruta/productor/flags/builders V1 según el inventario.

R3 NO significa V1 ausente del binario y no inicia auditoría V2 ni bucle de
rendimiento. Rollback exclusivamente por build anterior R0.

## R2 Desktop V2-only publicado en PR draft — 2026-09-04, ISA-894

Writer unico en `C:\tmp\vantare-v1-retirada-r2\vantare-v2`, rama
`vantareapp/isa-894-retirada-v1-r2`, base exacta R1 `c3cb104a`. Candidato de
codigo/test `992d1177`; worktree limpio al congelar cada commit. Sin apps, LMU,
navegadores, `.env*`, merge, promocion o release. Este bloque prevalece sobre
R1 en el avance de retirada, sin repetir su contenido.

R2 retira de `CompositeApp` el adapter/observer V1 y la activacion/reporting del
shadow legacy. Desktop conserva pull Wails, store/binding V2, Engineer, Calendar,
RaceSchedule, features y teardown. TDD: el RED creo shadow una vez al entregar
V1 (`1 failed, 15 passed`); GREEN ignora V1, pinta un snapshot V2 solo y cierra
la sesion pull al desmontar. Evidencia:
`docs/telemetry-core/evidence/isa-894/retirada-v1-r2-desktop-20260904.md`.

Checks del orquestador: focales 5 archivos/42 tests, typecheck, build, lint,
Go focal R1, `rg` de frontera y diff-check PASS; roadmap frontend 49 tests,
Python 23 tests y digest reproducible PASS. Review spec Muse
`ses_f96873b0effe2VItOuu03U5Dgw` sobre `4fe69f12`: APPROVE, P0/P1=0; P3
endurecidos en `992d1177`. Review calidad/adversarial Muse
`ses_f9681a57bffeSnlDKCNUB0t4uR` sobre `20e5c0c3`: APPROVE,
P0/P1/P2/P3 bloqueantes=0. [PR draft #972](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/972)
abierto contra `nightly`, apilado sobre #969/#970/#971; CI pendiente. Siguiente
migracion: Studio V2-only; despues OBS V2-only; solo entonces retirar
ruta/productor/flags/builders V1 segun dependencias.

R2 NO significa V1 ausente del binario: OBS/Studio, productor/SSE, flags,
builders, tipos y tooling legacy siguen. Tampoco inicia auditoria V2, bucle de
rendimiento ni prueba fisica. Rollback unicamente por build anterior R0.

## R1 publicado en PR draft — 2026-09-04, ISA-894

Writer único en `C:\tmp\vantare-v1-retirada-r1\vantare-v2`, rama
`vantareapp/isa-894-retirada-v1-r1`, base exacta `d687d38c` (R0). Sin
apps, LMU, navegadores, `.env*` ni secretos. HEAD revisado `78cce939`, rama
publicada y [PR draft #971](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/971)
abierto contra `nightly`; depende de #969 y #970. Sin merge, promoción ni
release. Este bloque prevalece sobre los inferiores en lo que describa R1;
no repite R0.

R1 = pull dirigido de Wails exclusivamente V2 (microplan
`docs/superpowers/plans/2026-09-03-telemetria-v1-retirada-r1.md`). Commit de
código `fba4ed5a` (6 archivos Go): `OverlayPullTransport` pierde `hub *Hub`,
`NewOverlayPullTransport(registry)`, `Pull` sin guard de hub, `currentEvents`
sólo status/snapshot V2 sin error, y `main.go` compone sólo
`OverlayV2Publishers()`. Intactos: ACK, replay, latest-wins, sesiones
retiradas, cleanup y estados del registry. Harness conserva golden/SSE V1 y
lee el cursor V1 desde SSE; bench sólo V2 (1/20/44/104) con warm-up de ACK
real y métrica única `v2_bytes`. TDD RED→GREEN con
`TestOverlayPullExcludesLegacyEvenWhenPublished` (RED: `deliver=true
want=false` y 3 eventos vs 1). Evidencia:
`docs/telemetry-core/evidence/isa-894/retirada-v1-r1-20260903.md`. Roadmap:
entrada `telemetry-live` actualizada y `roadmap.json` regenerado por script.

Checks: gofmt limpio, typecheck, build frontend, `telemetrytransport`,
focales `cmd/vantare` (harness + replay + HTTP pull), vitest focal 14/14,
bench smoke sintético, `rg` sin firmas antiguas, `git diff --check` limpio.
`go test ./...`: la primera pasada falló sólo por el flaky heredado
`TestDownloadStallTimerRestartsWithEveryChunk` (updater, fuera del diff); la
repetición del orquestador sobre el mismo código dio PASS completo con exit 0
(updater 2.870s). Roadmap: `roadmap-data` 30/30, tests Python 23/23 + 21/21,
digest `--check` sin cambios; contrato local con issue viva no ejecutable por
ausencia de `GITHUB_TOKEN` (queda para CI del PR). R1 NO es retirada física
total de V1 (productor/SSE/builders/flags siguen) ni auditoría V2; sin prueba
física Wails/LMU.

Dos revisiones independientes del SHA final terminaron `APPROVE`, con
P0/P1/P2/P3 = 0. **Siguiente acción:** esperar los checks del PR #971 y
corregir únicamente fallos atribuibles a R1; ningún merge/promoción desde
este corte.

## R0 completado y revisado — 2026-09-03, ISA-894

Isaac aprueba ejecutar R0 («sí, agree»). Writer único en
`C:\tmp\vantare-v1-retirada-r0`, rama `vantareapp/isa-894-retirada-v1-r0`,
base `8e8ec17b2d2b660d717316c10925a6b93d073d1c` (candidato #969).
La diferencia respecto a `2abd32f9` del plan es sólo documentación/roadmap;
Nightly remoto verificado permanece `659b2c57`. No se toca el checkout principal.

Tres Muse leen en snapshots aislados de la misma base: frontend/catálogo
`ses_f97d0cf51ffeAeZYBKiE0ACNk9`, Go/transporte
`ses_f97d0bc82ffeF0g7zlxOmfPJPH` y compatibilidad
`ses_f97d0a6f5ffe8clDFCBlgrBxqZ`. Main consolida documentos y ejecuta focales.
Sin modificación productiva, borrado V1, apps/LMU, benchmark o promoción.

Copia privada ya creada en
`C:\tmp\vantare-v1-rollback-4864b5c6-20260903\vantare-redline-rfix4-4864b5c6.exe`:
30.851.584 bytes y SHA256 `cb69a4d56ca7cb59078cb7bd7e223b33c34aa927ec808c2e49154386b878faba`,
idéntico al original. Commit `4864b5c6` presente. Copia verificada, no restauración
funcional. Código 4864b5c6 y base 8e8ec17b idénticos (diff sólo documental);
ambos soportan perfiles V4/settings 6. Cambiar ubicación/CWD puede seleccionar
otros datos; recovery settings/updater puede escribir al arrancar. No se copian
datos ni se cambia canal. Ver [rollback](../../telemetry-core/evidence/isa-894/retirada-v1-rollback-20260903.md).

Los lectores han entregado inventario y suplemento, snapshots limpios. Main
contrasta suscripciones dinámicas (sí hay listeners legacy de diagnóstico),
Host V2/auxiliar, constructor/tests pull y consumo fail-closed del contador por
el banco. Rechaza paridad V1 nueva como gate, supuesto pre-V4, borrado masivo de
bench y conservación de shadow por nombre. El [inventario](../../telemetry-core/evidence/isa-894/retirada-v1-inventario-20260903.md)
clasifica los 20 widgets, fuentes auxiliares, productor/transporte/contratos y
tooling; marca explícitamente qué unidades no se pueden borrar aún.

[Checks](../../telemetry-core/evidence/isa-894/retirada-v1-checks-20260903.md): instalación
offline frozen sin actualizar dependencias; 3 archivos/16 tests frontend,
typecheck, build, focal de emisión/guardias Go y ocho paquetes Go PASS, exit 0.
Avisos Node/Vite conservados. No suites completas ni rendimiento/LMU/rollback
físico. Preparado [R1](../../superpowers/plans/2026-09-03-telemetria-v1-retirada-r1.md):
pull Go V2-only en dos archivos productivos y cuatro tests/bench, pendiente de
ejecución. No se inicia auditoría V2 ni bucle de experimentos.

Spec review Muse `ses_f97c50549ffe5Pd8t5IrwarC5l`: **APPROVE** sobre
`3e11d93ac8ea2f697b4de6e7ea083593704d3909` (9 documentos, cero código
productivo). Snapshot limpio, lectura de código y diff; no ejecutó checks.
44 tests de roadmap PASS y 26 enlaces locales resueltos. Digest reproducible y
contrato de issue/diff completo validados localmente con issue viva de GitHub.
Se corrigieron los campos formales de la issue (encabezados exactos y contrato),
sin cambiar el alcance. Sus cuatro IDs reflejan el diff apilado de #969; R0
sólo cambia `telemetry-live` respecto a 8e8ec17b.

Calidad/adversarial Muse `ses_f97c1e8c4ffe32HX5LyfBqZ2xS`: **APPROVE** sobre
el mismo `3e11d93a`; cero Critical/Important bloqueantes, snapshot limpio.
Main incorpora aclaraciones menores: son 18 builders que importan snapshot,
helpers de tests localizados, workdir/nombre del paquete, Lookup con comprobación
de publisher activo y líneas del cursor SSE. No se adopta ignorar el booleano
de Lookup. El diff de estas aclaraciones y registro de review lo revisa main;
las reviews no se presentan como prueba física ni certificación de V2.

R0 queda completado dentro de su alcance: nueve documentos/roadmap, copia
privada y focales. No código productivo, apps, LMU, datos privados, auditoría
integral, rendimiento ni experimento ejecutados. Siguiente corte propuesto R1,
todavía sin implementar; no repetir R0 ni el interrogatorio.

Entrega en rama `vantareapp/isa-894-retirada-v1-r0`, apilada sobre #969;
destino permitido draft a Nightly, dependiente de #969. Ningún merge/push
directo a Nightly autorizado. #969 sigue draft con tres checks SUCCESS
en 8e8ec17b; ese CI no se atribuye a la nueva rama R0. Estado de publicación
de R0 se contrasta en la issue/PR remotos, nunca se infiere de este registro.

Este bloque prevalece sobre los estados históricos de aprobación inferiores.

**Publicación R0:** [PR #970](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/970)
creada draft a Nightly, depende de #969; push de rama confirmado en
`5190b1fcf6fc97bae49ac243b4034d5fa030b259`. Dos commits de R0 hasta ese punto:
evidencia `3e11d93a` y cierre/reviews `5190b1fc`. Este registro posterior sólo
documenta la PR. CI de R0 pendiente de comprobar en el HEAD remoto final;
sin merge, release o promoción. Issue #894 permanece abierta, retirada sin ejecutar.

## Decisión de diseño y registro previo — 2026-09-03, ISA-962

El alcance del maestro sigue vigente. Los estados de R0 en este registro son
anteriores y quedan sustituidos por la cabecera actual; no son otra cola activa.

Isaac sustituye completamente el programa anterior por el
[maestro de Telemetría V2](../../superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md).
Este es su único handoff vivo. Secuencia: retirada segura completa de V1 (#894),
auditoría integral de V2 en cuatro carriles de sólo lectura y bucle de mejoras
comparables. Rollback mediante build/commit previo verificado; no dejar V1
dentro del nuevo ejecutable. Se conservan las garantías de ADR 0004/0008.

La autorización de diseño reemplaza el bloqueo histórico por falta de permiso
genérico de Cut 2 y la prioridad Redline. No borra resultados FAIL ni permite
ignorar consumidores, pérdida de información, riesgos de datos o gates de seguridad.
Isaac hará las pruebas manuales LMU; no hay otra sesión física, tarea programada,
merge ni release autorizados desde esta sustitución.

Fase 3: mantener información, apariencia, frescura y cadencias. Cinco experimentos
consecutivos sin mejora medida o ocho horas acumuladas de ejecución del bucle,
lo primero. La mejora sólo reinicia consecutivos. Únicamente Muse Spark 1.3
Contributor xhigh mediante MCP OpenCode; revisión adversarial independiente.

**Estado actual:** Isaac aprueba el maestro escrito («estoy de acuerdo»).
SPECIFY aprobado; [microplan R0](../../superpowers/plans/2026-09-03-telemetria-v1-retirada-r0.md)
preparado para revisión. Dos Muse en snapshots de `2abd32f9` hicieron exploración
acotada de dependencias y rollback, contrastada por main; no es la auditoría V2.
Ninguna retirada ni prueba de rendimiento nueva. Código del candidato
`4864b5c6`, documentación en `2abd32f9`, PR #969 draft; S3 FINAL PASS acotado
según su evidencia. S4/S5/S2 no ejecutadas; memoria y rendimiento global V2
no certificados. Esas afirmaciones no cambian por aprobar este plan.

**Siguiente acción:** revisar R0 y ejecutarlo tras su aprobación: inventario
completo, copia privada del exe con hash, compatibilidad/rollback y regresiones
protectoras. No repetir el brainstorming ni inventariar de cero lo ya contrastado.
No reactivar la cola antigua. Los registros inferiores son históricos cuando
contradigan este bloque; conservan sus cifras y resultados, no permisos actuales.

**Exploración de PLAN:** [base verificada](../../telemetry-core/evidence/isa-894/retirada-v1-base-20260903.md).
Workers `ses_f97dbe79fffexMAi0IEDDID27H` y `ses_f97dbe353ffehpum1nA3FSjGzb`
terminados, sin cambios en sus snapshots. Main rechaza la reimposición de gates
históricos sugerida por el primero y corrige su ruta SSE contra código actual.
Exe previo localizado y SHA256 confirmado `cb69a4d5…878faba`; todavía no se ha
copiado ni restaurado. Los guardias de coexistencia y dependencias mixtas
frontend/pull exigen sustitución de pruebas y clasificación, no borrado ciego.
La propuesta R0 no es autorización de implementación o promoción. CI de
`2abd32f9` estaba en progreso al preparar este corte; no se hereda como PASS.
Autorrevisión del plan: comandos/rutas, variables y alcance de cada tarea
comprobados; sin cambios productivos. Digest regenerado y reproducible,
44 tests de roadmap PASS y diff-check limpio. Focales Go/frontend de R0 aún
no ejecutados: pertenecen al microplan propuesto, no a esta entrega documental.

**Entrega documental:** commit coordinador `79e88db6`, incorporado al candidato
como `f92dc2cc`; los dos checkpoints S3 anteriores también se incorporaron sin
cambiar código productivo. Muse independiente `ses_f97e0b4d0ffeCuPPcbastUkozY`
revisa ese diff en snapshot aislado: APPROVE documental, sin P0/P1/P2 bloqueantes.
Main verifica archivo histórico íntegro, enlaces del maestro, diff-check,
digest reproducible y 44 tests de roadmap PASS. El guard completo local no pudo
leer la issue por ausencia de `GITHUB_TOKEN`; su resultado remoto debe comprobarse
para el nuevo HEAD, sin atribuirle el CI de `c13b8888`. No se ejecutan suites
Go/frontend porque este corte sólo toca documentación y JSON generado.
Issues #962/#894/#924 reconciliadas; #951/#952 fuera de la cola activa y #956
conservada como entrada diagnóstica. Ninguna cerrada como entregada por esta
decisión. PR #969 sigue draft; no merge, promoción ni release. Cambio ajeno de
`configs/calendar-lmu.json` preservado, hash sin variación.

## Resultado

Un único núcleo live modular y neutral al simulador. El driver LMU posee Shared
Memory y REST local como fuentes complementarias. Overlay, Engineer, Strategy
y Analysis consumen proyecciones versionadas y nunca abren readers propios.

## Autoridad

- `docs/superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md`: alcance y secuencia operativa actuales.

- `docs/adr/0004-telemetry-core-modular-observation-architecture.md`.
- `docs/telemetry-core/README.md` y su evidencia.
- `docs/superpowers/plans/2026-07-19-telemetry-core-final-architecture-master.md`.
- Issue y microplan activos en GitHub.

## Estado real

- 2026-09-01, decisión operativa ISA-894/ISA-962: Delta queda fuera de S3 y
  ningún gate depende de completar o validar vueltas del jugador. Las nuevas
  comprobaciones duran cinco minutos, se ejecutan con el jugador en pista y
  siguen el orden S3 → S4 → S5 → S2. El colector falla cerrado fuera de cinco
  minutos y S3 selecciona un perfil Redline sin Delta. La evidencia histórica
  larga se conserva; esta reducción no autoriza Cut 2 ni promoción.

- 2026-09-01, ISA-958 en rama: `CachedProjector` publica `relativeSettled`
  como autoridad única para Endurance Redline. Mantiene una ventana ordenada
  de máximo 8+jugador+8 hasta que otra ventana permanezca estable 7 s; si los
  candidatos oscilan, no salta mientras todos los IDs aceptados sigan realmente
  observados, y rehidrata sus campos desde cada `FinalState`. Ausencia real,
  cambio de sesión/epoch/jugador o falta de jugador reinician inmediatamente.
  El store rechaza secuencias atrasadas dentro del mismo stream y valida ambos
  arrays con side/orden/ID/jugador canónicos. Classic/Minimal/Neo siguen usando
  `relative` inmediato. El adaptador Redline no admite estado de estabilidad
  frontend, evitando un segundo hold. `RelativeRowV2` mantiene posición, última
  vuelta y posición 3D de la misma fila; no cruza Standings. Focales Go y
  frontend, typecheck y diff-check verdes. El candidato integrado superó 441
  archivos/3.418 pruebas frontend, `go test ./...`, build y lint; la revisión
  adversarial de la autoridad aislada fue APPROVE. S3 Wails/LMU sigue pendiente.

- 2026-08-31, ISA-957 en rama: `StandingRowV2` incorpora la mejor vuelta
  canónica con calidad y el ViewModel de Standings separa por fase la métrica
  de mejor vuelta del gap de clasificación. Los goldens V2 y el contrato TS se
  regeneraron desde Go; sin promoción ni prueba Wails/LMU nueva.

- 2026-08-30, ISA-894/PR #955, S1 definitiva: ON y OFF usaron el mismo exe
  `d02054e3…`/dist `5b8e388c…`, Spa práctica y 14 coches. El parser corregido
  deja transporte/paridad en PASS: ON comparó 6.074 frames con cero mismatch
  exacto; OFF recibió cero V1 y mantuvo `shadow=null`; delivery fue 67,6/49,1
  ms p99 frente a 250 ms. El único FAIL común real es memoria: renderers
  +732/+310 MiB/h ON y +314/+308 OFF. Una fase OFF diagnóstica de 10 min con
  polling CDP periódico desactivado redujo la suma renderer post-warm-up de
  +467,4 a +116,7 MiB/h (75 % observado), pero dejó un PID en +134,9 MiB/h.
  Heap JS post-warm-up creció solo +1,7 MiB Hub y +3,8 MiB Overlay con nodos
  estables; no hay retaining paths porque la captura no incluyó snapshots.
  #956 separará PID/target, dominators y una lane `-tags production` sin CDP.
  El gesto fue cruce a pista y escapatoria por teclado, sin vuelta lanzada
  completa; puede requerir repetición estricta. Evidencia:
  `docs/telemetry-core/evidence/isa-894/s1-definitiva-20260830.md`; las tres
  crudas sanitizadas, checkpoints, CSV, resúmenes, SHA-256 y recálculo
  ejecutable están versionados bajo `s1-definitiva/`. Corte 2 sigue bloqueado;
  sin merge, promoción ni release.
- 2026-08-30, seguimiento ISA-894/PR #955 después de S1 ON completa (20 min):
  el segundo fallo `StrictMode` del colector era la enumeración de una lista
  vacía de screenshots finales; el parser y el script toleran listas/targets y
  propiedades CDP opcionales. Los mismatches fuera de `live` ya son
  `not-comparable` con razón de fase. En `live`, `standings.remainingText`
  conserva exactitud pero exige `session|standings` reconstruidas en el mismo
  cursor; el historial de controles pasa a `partial` porque V1/V2 no comparten
  timestamp por muestra, mientras los controles instantáneos siguen exactos.
  S1 observó pendientes de +825,8 y +311,5 MiB/h en renderer no asignados,
  +119,7 GPU, +23,8 Go y +15,0 browser: el gate de memoria sigue FAIL. No hay
  colección shadow ilimitada demostrada (pares/secuencias 64, historial 120,
  35 claves observadas), pero sí hasta 651.120 objetos V2 de historial creados
  sin valor de paridad. El shadow deja de retener/decodificar ese historial,
  limita métricas a 128 claves y publica tamaños retenidos; el colector añade
  heap JS/nodos/listeners por target CDP. La build antigua no asignó PID a
  target, así que no se atribuye toda la pendiente al shadow: hace falta nueva
  ON con esta instrumentación y el diferencial OFF. Evidencia:
  `docs/telemetry-core/evidence/isa-894/diagnostico-s1-on.md`. Vitest completo
  433/433 y 3.294/3.294, focal 98/98, banco Node 88/88, typecheck y lint pasan.
  No hay merge, promoción ni release; corte 2 sigue bloqueado.
- 2026-08-30, seguimiento ISA-894 tras la primera S1 ON real: el colector
  abortó a los 0,20 min porque el target Hub no publica
  `overlay_v2_transport`; el parser ahora normaliza todos los campos CDP
  opcionales antes de aplicar `StrictMode`, con regresión para Hub, overlay sin
  transporte y target vacío. Los 6 mismatches de los 2 frames previos al fallo
  (`speedKph`, `currentLapText`, `lastLapText`, dos cada uno) siguen siendo
  exactos y no se descuentan. El diagnóstico los atribuye al cursor de frame
  actualizado sobre secciones V2 cacheadas, a comparar `currentLap` aunque la
  columna shadow esté oculta y a los placeholders distintos para última vuelta
  ausente. El comparador ya publica/valida `sectionMask`, registra la caché como
  no comparable, omite la columna oculta y normaliza solo placeholders ausentes;
  valores exactos reales siguen fallando. La captura abortada no prueba
  divergencia de payload ni paridad; el corte 2 permanece bloqueado hasta
  repetir S1 ON completa con cero mismatch exacto real.
  Evidencia:
  `docs/telemetry-core/evidence/isa-894/diagnostico-s1-on-20260830.md`.
- 2026-08-30, ISA-894 corte 1 y guardarraíles corte 3 están rebasados sobre
  `origin/nightly@cd03518b` (#954, #942 y #948 incluidos). El schema persistido
  v6 conserva Automático de #948 y añade el interruptor V1 apagado. La app no construye ni publica V1
  por defecto; ajuste `overlayV1Emit=true` o
  `VANTARE_OVERLAY_V1_EMIT=1` lo reactivan tras reinicio. La revisión del PR
  #953 queda atendida: el shadow se crea al primer V1 y en OFF no registra el
  callback V2 (`shadow=null` en 3/3 preflights); el guard Go usa AST para
  resolver `Emit`/`EmitEvent`, constantes y asignaciones locales simples, y
  rechaza la polaridad negada de `overlayV1Emit`; el guard TS recorre cada
  `.ts/.tsx` de `frontend/src/overlay/**` con exclusiones estrechas y congela
  por fichero/conteo el inventario V1 que solo puede retirar el corte 2. El A/B
  final usó una build de diagnóstico con Supabase embebido desde el
  `frontend/.env.local` autorizado: un solo exe SHA-256 `83cfc4cb…a40722`, un
  solo dist `7e95fb08…9f12f`, Spa práctica, 18 coches, A1 y tres corridas
  alternadas de 180 s por estado, sin `-Forzar`. Las seis alcanzaron por CDP
  `license:changed=active`, cuenta autenticada, `configured=true` y
  `deviceOK=true`. OFF recibió 0 V1/16 V2 y `shadow=null`; ON recibió 21 V1/18
  V2 y conservó 48 mismatches diagnósticos. Apagar V1 bajó CPU Go 2,626 ->
  1,707 %, CPU del renderer no asignado 2,256 -> 1,189 % y su RAM 134,70 ->
  96,31 MiB. CPU Go/renderer fue repetible con ruido ≤5 %; RAM renderer tuvo
  8,34 % de ruido OFF y limita la precisión. RAM Go bajó 2,5 %, pequeña y
  repetible. Browser no mejoró y hubo 0/96.977 frames perdidos. El banco ahora
  falla cerrado ante una build `unconfigured` o una sesión no autenticada y
  publica manifiestos de licencia sanitizados. Una regresión adicional
  fija el banco a 180 s de pared: antes hacía 180 iteraciones y prolongaba CPU/RAM.
  El corte 2 sigue
  bloqueado por paridad no exacta y no se tocó. Se añadió el colector autónomo
  `scripts/bench/sesion-v1.ps1` para S1–S5: higiene, hashes, muestreo por PID,
  checkpoints CDP, p99/histograma, screenshots, transiciones humanas/automáticas,
  cierre limpio y veredicto JSON/Markdown. Declara ventanas esperadas, exige
  `pull` y `shadow=null` en cada observación OFF, valida cada ciclo S4 con avance
  V2 y empareja aperturas S5 por clave. Las sesiones las coordinarán Isaac y
  el orquestador tras fusionar corte 1. Issue `roadmap:not-required`: no se
  modifica roadmap. Se publican los seis CSV A/B sanitizados con SHA crudo y
  publicado. Go build/test, vet acotado, contrato, 433 ficheros/3.287 tests
  frontend, typecheck, lint y 38 tests del banco pasan. El digest local está
  bloqueado por estado externo: `origin/nightly@cd03518b` conserva
  `digest.lastCommit=9a9179aa`, anterior al merge #948. Esta rama no copia ni
  regenera ese roadmap. Evidencia en `docs/telemetry-core/evidence/isa-894/`.
  No hay merge, promoción ni release.

- 2026-08-30, ISA-893 parte de `origin/nightly@ca166b38` después
  de integrar #936. El store V2 conserva una sola suscripción imperativa al
  coordinador por generación; cada widget memoizado se suscribe a su sección
  y Studio ya no se suscribe directamente al store. Los 18 widgets
  telemétricos seleccionan ViewModels V2 puros en el `WidgetVisualHost`
  compartido; `engineer-radio` y `race-schedule` usan exclusivamente sus
  canales auxiliares. Surface, editor in-place e inspector resuelven layout y
  visibilidad con un contexto mínimo derivado de V2. Frame ausente, inválido,
  stale, source error y rollback diagnóstico son estados visibles sin fallback
  visual V1. El test de 60 frames conserva 2 renders de Standings en nivel 5 y
  60 en nivel 1. La suite completa (424 ficheros, 3.227 tests), typecheck,
  lint, build frontend, pruebas Go de telemetry/app, contrato generado,
  roadmap y `wails3 task build` pasaron antes de la review. Los hallazgos
  P1.1–P1.5 y P2 tienen commits independientes: diagnóstico antes del filtro,
  fallos ligados a revisión, Calendar productivo, rollback por generación,
  builders V2 de catálogo y diagnósticos productivos. La captura Wails/LMU
  histórica de `cbfb63b8` pintó 20/20, pero precedía esas correcciones. La
  segunda revalidación pasó sobre `68580bac`: build propia, CDP 9243,
  user-data separado, 246 frames V2 live y 20/20 frames montados. La sonda
  exigió el renderer productivo: 19/20 renderizaron; `engineer-radio` quedó
  correctamente oculto porque no hubo presentación de Engineer, sin inyectar
  ninguna. Hubo cero errores de renderer, diagnósticos de autoridad o frames
  sin renderer injustificados. Se cerró limpiamente el PID propio y LMU PID
  16792 permaneció intacto. JSON, PNG, hashes y los 20 códigos quedan
  en `docs/telemetry-core/evidence/isa-893/wails-runtime-pending.md`. Roadmap:
  `milestones:telemetry-live`. PR #941 sigue draft; sin merge, promoción ni
  release.

- 2026-08-28, rebase y revisión adversarial ISA-884: los siete commits del PR
  #888 quedaron lineales sobre `origin/nightly@c59a7d64`. La revisión encontró
  un P1 en `deriveVehicleGap`: la ausencia o invalidez del hecho de vueltas de
  clasificación anulaba también un progreso temporal válido. `c244b354` separa
  ambas derivaciones y añade regresiones para clasificación ausente y sesión
  completa sin `lap_progress_time`, que permanece `missing` y nunca cero. Go
  completo, frontend 421 archivos/3.192 tests, typecheck, build y diff-check
  pasan. `go vet` conserva solo tres avisos Win32 `unsafe.Pointer` idénticos a
  Nightly. El lint global conserva el error heredado de `_damage` no usado en
  `car-damage-numbers-view-model-v2.ts`, también idéntico a Nightly; por ello el
  PR permanece draft y no se marca ready. Sin merge, promoción ni release.

- 2026-08-28, ISA-896 renueva por efecto la generación V2 completa de Desktop
  y OBS, y la pareja coordinador/store derivado de Studio. El segundo setup de
  StrictMode crea objetos nuevos; cada cleanup detiene, desuscribe y dispone
  solo los recursos de su propia generación. Las regresiones con un frame V2
  real cubren repintado, ausencia de `invalid-contract:disposed` y una sola
  sesión pull/SSE activa tras el remount. La build propia
  `bin/vantare-isa896.exe`, abierta con CDP en `9240`, pintó cuatro
  `runtime-widget-frame`; tras `overlay:stop` y `overlay:start-active` creó una
  ventana WebView2 nueva y volvió a pintar cuatro, sin el error disposed. Esta
  prueba no afirma telemetría LMU live: LMU no se tocó y los widgets mostraron
  el perfil activo sin datos de sesión. Evidencia en
  `docs/telemetry-core/evidence/isa-896/lifecycle-remount.md`. La review
  independiente aprobó funcionalmente cinco ciclos Wails reales: sin fuga,
  generación vieja ni pérdida de eventos iniciales; dejó el rebase como único
  bloqueo operativo. La rama
  `vantareapp/isa-896-overlay-v2-remount-lifecycle` quedó rebasada de nuevo
  sobre la base viva `origin/nightly@4aa8ac7f`, con HEAD funcional
  `2cbe66da`. El mock Wails de
  Studio retira ahora cada callback y la regresión exige un listener activo por
  evento y un scheduler activo después del doble setup. PR #937 está ready con
  auto-merge activo y pendiente de sus gates; sin merge, promoción ni release
  en este corte.

- 2026-08-28, ISA-926 implementa la política de rendimiento F1 en la rama
  `vantareapp/isa-926-performance-policy-niveles`. Go resuelve niveles 1–5,
  `custom` y el fallback explícito de `auto`; la cadencia efectiva se aplica al
  `SectionScheduler` en el tick siguiente. OverlayFrame v2 publica
  `capabilities.performance`, su decoder TypeScript falla cerrado y el
  coordinador visual gobierna realmente `rafCap`, techos por widget y dirty/event;
  `event` queda exento del cap y el techo dirty se satisface una sola vez por
  secuencia/firma. Sobre las generaciones por efecto de #896, una única
  suscripción imperativa lleva el store V2 al coordinador; la superficie no
  recibe frames por props y cada widget memoizado se suscribe a su techo. La
  integración de 60 frames/1 s mide Standings 2 renders en nivel 5 y 60 en
  nivel 1; un layout nuevo repinta una vez de inmediato. `session` y `spotter`
  mantienen su cadencia base; D8 se demuestra por la
  ruta canónica de spotter. V2 no tiene señal canónica de bandera y la verifica
  #893. Frames antiguos sin política se
  normalizan a paridad; Ajustes antiguos y nuevos usan inicialmente nivel 1.
  `sourceHz` mide frames del driver en una ventana móvil de dos segundos,
  `reason` es un enum cerrado y niveles 3–5 mantienen efectos completos con el
  diagnóstico `variante no disponible`. Un smoke Wails propio en CDP 9242 pintó
  cuatro widgets antes y después de stop/start, sin `disposed`, y cerró PID y
  puerto propios. La rama está rebasada sobre `origin/nightly@f2e73d3a`; no hay
  banco físico LMU, merge ni promoción. PR existente #936 permanece en revisión. Evidencia:
  `docs/telemetry-core/evidence/isa-926-performance-policy.md`. Roadmap:
  `milestones:performance-policy`.

- 2026-08-28, ISA-891 completa el lifecycle de Overlay V2 y lleva Studio al
  mismo transporte dirigido que Desktop. `6bd72d37` publica y retiene un único
  status V2 aunque no haya frames ni consumidores; un consumidor tardío recibe
  el último estado sin activar el publisher de snapshots. El contrato generado
  cierra los ocho estados canónicos y las fronteras Go/TypeScript rechazan
  valores desconocidos. `f6269aaf` elimina de Studio las suscripciones globales
  de proyección y compone V1+V2 sobre una única sesión HTTP pull, con listeners
  registrados antes de iniciarla, lifecycle idempotente y estado V2 puro
  entregado al `WidgetVisualHost` compartido detrás de las flags existentes.
  Las regresiones cubren status sin frame, alta tardía, revisión monotónica,
  reinicio/rollback, StrictMode y consumidor con una sola petición pendiente.
  `274b632d` evita deliveries vacíos, aplica pacing 16/100/250 ms y reinicia el
  cursor V2 al abrir una nueva sesión Studio. La reproducción stale bajó del
  busy-poll de 1.744 requests/15 s al backoff acotado; una prueba real LMU
  Practice pintó 18 participantes y completó Mock -> Live sin errores de
  revisión, siempre con `maxInFlight=1`. En 30 s el browser WebView2 se mantuvo
  entre ~39,6 y 41,5 MiB; es evidencia corta, no el soak de retirada.
  La revisión de protocolo añadió `0966f44c`: una respuesta HTTP perdida se
  conserva como único delivery pendiente y se retransmite hasta su ack; después
  se entrega solo el último snapshot acumulado.
  La auditoría independiente Fable 5 (`claude-fable-5`, thread
  `556f9ac3-513c-4bd7-a194-6064baaa615d`) terminó `ACCEPT WITH FINDINGS`, sin
  P0/P1. `f652e67f` corrige los cuatro P2 reproducidos: rechaza generaciones
  retiradas con memoria fija por sender, serializa revisión y publicación V2,
  recupera JSON/excepción/timeout del pull y evita suscribir Studio a paints V2
  con flags vacías. No añade goroutines, channels, colas ni dependencias.
  Rama `vantareapp/isa-891-overlay-v2-studio-lifecycle`, creada sobre la base
  original `nightly@741d31bf`, sincronizada mediante `e0b6a18f` con
  `nightly@d9909aef` y resincronizada mediante `ad1397d8` con la vigente
  `origin/nightly@1c45cc82`. `9eb2535b` elimina una carrera del test Studio:
  espera la carga asíncrona observable del perfil en vez de asumir que el mount
  del canvas ya la completó. `go test ./...`,
  typecheck, build frontend, contrato generado, ESLint del diff, race detector
  del transporte, 23 tests de roadmap, 64 de comunicaciones, 26 de release
  notes y build Wails
  Windows están verdes sobre el HEAD sincronizado; la suite frontend final
  cubre 421 archivos y 3.184 tests. El lint global conserva una deuda ajena al diff en
  `car-damage-numbers-view-model-v2.ts`; el gate del diff pasa. La auditoría
  abrió ISA-896 para corregir Desktop+OBS+Studio bajo
  StrictMode/remount; el PR parcial #857 no está en Nightly. No retira V1 ni
  cambia la autoridad visual. El digest está regenerado contra la Nightly
  vigente. El HEAD revisado `df629d3a` está publicado en el PR draft #897 y el
  run remoto `33134533397` terminó verde: gate bloqueante Vantare 11m02s, ruta
  de promoción y GitGuardian. No hubo merge ni promoción.
  Una prueba adicional LMU Live de 14,5 minutos, con 10,24 minutos de Hub +
  Overlay, mantuvo el browser WebView2 56,9 -> 57,5 MiB y pendiente -0,142
  MiB/min, sin reproducir la fuga original. La suma de renderers sí creció
  193,9 -> 463,8 MiB (máximo 520,6; ~22,2 MiB/min), por lo que el siguiente
  trabajo queda separado en #912 para perfilar host Go y paints/retención de
  UI antes de optimizar. La primera lectura de código señala que el coordinador
  visual ignora hoy `updateHz`, copia las histories derivadas en cada snapshot
  y Desktop/OBS suscriben el árbol raíz al shadow V2 aun con features vacías;
  son hipótesis de profiling, no cambios aprobados ni causas cerradas.
  El tramo se detuvo por decisión del usuario y no cumple el gate de cinco
  sesiones de 20 minutos de ISA-894.

- 2026-08-28, ISA-912 arrancó desde `origin/nightly@73b86191` y la rama quedó
  rebasada sobre `origin/nightly@42f2e368` para atribuir y reducir el coste del
  host Go y del renderer sin cambiar la autoridad de
  telemetría ni la frontera `WidgetVisualHost`. La auditoría read-only de
  Opus 5 (`claude-opus-5`, thread
  `b995e4c1-d11c-474e-8f10-8771a0c63ea1`) y la revisión adversarial de Fable 5
  (`claude-fable-5`, thread `43c006ac-6b4a-495a-9583-93e9e8c5cc33`) quedaron
  reconciliadas contra el código. Hechos: Shared Memory 60 Hz y REST 4 Hz
  atraviesan el mismo fan-out; el shadow repite reducer/coordinator/derive por
  lote; Strategy se proyecta aunque su transporte no exista; Overlay v1 se
  proyecta, serializa y retiene sin comprobar consumidor; el pull vuelve a
  recorrer/copiar los payloads; Desktop y OBS suscriben su raíz al store v2
  con flags vacías; el coordinador visual ignora `updateHz`; histories y
  settings visuales se reconstruyen en cada paint. No está atribuido todavía
  el peso relativo de cada fase ni si los picos proceden de GC, JSON, commits
  React o paint. El primer borrador de Opus fue rechazado al revisar el diff:
  podía retornar de un segundo `stop` antes de terminar el flush, su test no
  enfrentaba timer y shutdown y el benchmark comparaba tamaños distintos. El
  commit corregido se integró como `87019bc0`: hook `runtime/pprof` a fichero,
  opt-in, máximo dos minutos, sin listener y `noop` bajo `production`, más un
  benchmark pull comparable `dual`/`v1-only`/`v2-only`. El orquestador verificó
  el cierre concurrente con `-race`, el guard de producción, el benchmark y
  `go test ./...`. El capturador CDP de renderer y este expediente quedan
  incluidos en la rama; su cleanup detiene la sonda rAF incluso si CDP falla a
  mitad de captura. No se cambió semántica, cadencia, V1/V2, shadow ni
  apariencia. Un segundo microcorte integrado como `c834cebe` añade retardo
  opt-in al perfil para separar startup y régimen caliente. La revisión del
  worker corrigió además contratos que aún nombraban dos variables, amplió el
  guard `production` a las tres y eliminó un test que afirmaba un vencimiento
  temporal que no ejecutaba. Los checks focales normal/production, `gofmt`,
  `vet` y `-race -count=3` pasaron de nuevo en el worktree canónico.
  La primera captura emparejada Wails/LMU de 30 s midió el host en 18,74 % de un
  core con Hub y 42,28 % con Overlay. `runtime.cgocall` quedó plano en 29,28 s
  frente a 29,32 s; los deltas Go identificables aparecieron en JSON y pull:
  `encoding/json.appendCompact` 1,30 s, `OverlayPullTransport.Pull` 0,70 s,
  `Hub.ReplaySnapshot` 0,66 s y `json.Marshal` 1,62 s con Overlay frente a
  0,54 s con Hub. Esas cifras se solapan y explican solo una fracción de los
  7,06 core·s externos de incremento; servidor HTTP/Wails, segunda ventana, GC
  y scheduler siguen sin atribuir. CDP observó 43,63 pulls/s, rAF p99 <=8,6 ms, cero frames >32
  ms y cero long tasks. Su tracing infló transitoriamente la memoria del
  renderer; una ventana posterior sin CDP la acotó en 143,6 -> 149,8 MiB y el
  árbol en 95,36 % de un core. No autoriza retirar V1 antes de #893/#894. La
  hipótesis de retener en el Hub el evento V1 ya codificado quedó rechazada
  antes de integrar: habría movido el marshal desde 43,63 pulls/s a
  aproximadamente 64 publicaciones/s, también con Hub solo, mientras el
  benchmark excluía la publicación del reloj. El segundo candidato mantuvo la
  codificación a demanda y eliminó solo la copia profunda previa al marshal. A
  44 coches redujo B/op un 24,0 % en V1-only y un 21,5 % en dual, pero la matriz
  Wails/LMU de tres repeticiones no superó el gate runtime. Las medianas fueron
  host 37,65 -> 37,98 % de un core, árbol 141,16 -> 141,63 %, renderer p95
  113,11 -> 118,93 % (+5,1 %) y máximo host 151,95 -> 166,15 % (+9,3 %).
  `TaskDuration` bajó solo 2,0 %, `ScriptDuration` quedó igual, rAF p99 permaneció
  en 8,5 ms y hubo cero frames >32 ms/long tasks. `ReplaySnapshot` bajó 9,7 %
  en pprof, aún bajo el 10 %. El gate vinculante lo deja NO-GO; se retiró todo
  el cambio productivo y sus tests. Los perfiles, traces y tres series a 100 ms
  por variante quedan inventariados por nombre, tamaño y SHA-256 en el
  expediente. La revisión adversarial final Fable 5 sobre `a163eafc` (thread
  `3d850815-4ef3-4af6-9257-1a28fb4212f2`) no encontró bloqueos de lifecycle,
  concurrencia, benchmark ni arquitectura. Sí detectó que la atribución textual
  excedía los segundos explicados, que el test del entorno podía convertir una
  regresión en `SKIP`, que el resumen CDP filtraba rutas absolutas y que CI no
  ejecuta los guards `production`/`-race`. Los tres primeros quedan corregidos
  en la rama; el hueco CI se separó como ISA-916. El capturador CDP dispone
  además del schema v2 con modos `trace`, `metrics` y `profile`; el resumen de
  CPU conserva basenames, rechaza perfiles ilegibles y el `.cpuprofile` crudo
  queda ignorado y fuera del repo. Su test Node focal pasa 3/3. La revisión
  independiente de PR terminó `REQUEST_CHANGES` por la base desactualizada y
  este estado operativo obsoleto, no por un defecto del hook. Ambos quedan
  corregidos: rama remota
  `vantareapp/isa-912-overlay-webview2-performance`, quinto rebase lineal sobre
  `origin/nightly@b2010ec3` tras avanzar Nightly y PR #927 listo para review;
  ISA-912 está en
  `state:in-review`. La punta validada previa a este cierre documental fue
  `c0d6f467`, antes del quinto rebase; el run remoto previo `33204677737` terminó
  verde, incluidos topología,
  contrato de roadmap, build frontend, suites Go/frontend, lint del alcance y
  build Wails de Windows. La anotación audit del contrato de roadmap
  descubrió que el primer digest conservaba el orden del JSON candidato
  intermedio; se regeneró desde el JSON protegido de esa base y el validador
  base/candidato quedó paritario. No hubo merge, promoción ni release.

- 2026-08-27, ISA-889 corrige el bloqueo permanente del Overlay despues de un
  reconnect LMU. El transporte acotado de ISA-879 puede entregar como primer
  snapshot visible de un epoch nuevo una secuencia mayor que 1; el store
  frontend exigia exactamente `sequence=1`, conservaba el cursor anterior y
  rechazaba despues todos los frames del nuevo epoch. `57c76109` acepta una
  proyeccion completa de un epoch estrictamente mayor como nueva base y deja
  `snapshot-resync` como diagnostico; regresiones de epoch, regresiones o
  duplicados contradictorios dentro del mismo epoch y desajustes de status
  siguen cerrados. Suite frontend completa (417 archivos, 3.143 tests), 26
  focales, typecheck, build, ESLint del diff y `git diff --check` verdes. Una
  build Wails aislada en 39263/9231 recibio LMU Live y pinto Practice, 18
  participantes, Relative, Standings y pedales. El reconnect nativo tambien
  queda acreditado sin reload: epoch 1 termino en secuencia 166.097 y, tras
  reiniciar LMU, la misma ventana acepto epoch 2 empezando en la primera
  observacion 2.290, avanzo a 4.203 en 30 s y continuo con Relative/Standings
  `ready`, 18 filas y el jugador en P10. Evidencia:
  `docs/telemetry-core/evidence/isa-889-overlay-epoch-resync.md`. Rama
  `vantareapp/isa-889-overlay-epoch-resync`; PR #890 integrado en `nightly` el
  2026-08-28 como `741d31bf`. El hito `telemetry-live` y su digest declaran la
  continuidad tras reconnect. El gate post-merge oficial `33125373076` y el
  digest `33125373082` terminaron en verde. ISA-889 está cerrada en estado
  Nightly; no existe promoción a testers, master ni release.

- 2026-08-27, ISA-884: Relative pasa a significar tráfico físico alrededor del
  jugador. El driver LMU admite `mTimeIntoLap` scoring `+464` como
  `standings.lap_progress_time`; `standings.relative-gaps@2` calcula en Go el
  arco temporal firmado más corto y conserva `relativeLapDelta` por separado.
  `BuildRelative` selecciona por topología circular de `LapDistance`, de modo
  que una fila física no desaparece si sus segundos están `missing`. V1 y V2
  consumen la misma derivación; la proyección orienta su signo por el lado
  físico y no anula los segundos por estado pit. El comparador shadow vuelve a
  comparar `gapText`, y el frontend no contiene lógica de simulador. SimX mapea su
  equivalente temporal exacto al mismo contrato; los drivers sin equivalente
  dejan la señal ausente. La fixture LMU 1.3/1.4 con cero uniforme
  contradictorio prueba fail-closed, mientras los tests admiten cero individual
  y valores negativos reales. Evidencia:
  `docs/telemetry-core/evidence/isa-884-relative-lap-progress-time.md`. Rama
  `vantareapp/isa-884-relative-time` rebasada sobre
  `origin/nightly@2672f211`, publicada en el PR draft #888. Para
  `9771592b`, el run remoto `33107781445` terminó completamente verde:
  promotion path, blocking gates y GitGuardian pasaron. Sin merge, promoción
  ni release. Gates locales: Go completo, telemetry, LMU x20, derive x20,
  frontend 3.144 tests, typecheck, lint focal y build verdes. La build combinada
  acredita LMU -> Go -> SSE -> Wails nativo: Relative 2+jugador+2 con los cuatro
  gaps presentes, incluidos rivales en pit; V1/V2 alineados en reconstrucción
  dan `mismatch: []`. El soak final de 142 s termina en 585,8 MiB totales y
  175,3 MiB para el WebView mayor, sin pendiente monotónica. #887 separa los
  falsos positivos del shadow al emparejar una sección V2 memoizada a 4 Hz con
  la cabecera global a 60 Hz.

- 2026-08-27, ISA-879 elimina los bridges Overlay v1/v2 globales y los
  sustituye por una sesion pull/ack `single-in-flight`, `latest-wins` y ligada
  al ciclo de vida de una ventana Overlay. `68ae7eae` introduce el limite,
  `e1069c7f` retira el bridge sin caller y `dee06f34` saca solicitud/cierre del
  bus global. La prueba LMU nativa descubrio una segunda frontera: aunque Hub
  recibia cero frames, `DispatchWailsEvent` aun materializaba ~62 KB v1 + ~9,6
  KB v2 por `ExecuteScript`; un renderer limpio crecio 538,3 -> 2.370,1 MiB en
  2 min. Descartar V2 no cambio la pendiente y descartar todos los eventos justo
  antes de listeners aun llevo el heap a 734,2 MiB; un GC completo lo redujo a
  7,2 MiB. Era presion de asignacion por convertir el JSON en JavaScript, no
  retencion React. `21af8511` devuelve el mismo `OverlayPullResponse` en el
  cuerpo HTTP y elimina todo evento/`ExecuteScript` de frames, manteniendo ack,
  latest-wins, una peticion pendiente y cierre nativo. En 10 min 01 s, browser
  quedo 50,4 -> 64,1 MiB (max 69,8), renderer Overlay 101,5 -> 109,4 MiB (max
  111,1) y Hub 61,1 -> 61,1 MiB. `Detener overlay` elimino target y renderer;
  LMU siguio abierto. El reader opt-in y Strategy observaron LMU `live` con
  jugador, pero la proyeccion Overlay permanecio `stale` por fast frame
  detenido/pausado: falta una repeticion breve sin pausa para acreditar esa
  fase exacta. Go serial completo, 415 archivos/3.139 tests frontend, 26
  focales, typecheck, build y ESLint del diff estan verdes. Rama
  `vantareapp/isa-879-wails-telemetry-bounded`; PR #883 fusionada en
  `origin/nightly@2672f211`. Run post-rebase `33101779769` completamente verde.
  Sin promoción a `testers`/`master` ni release.

- 2026-08-27, diagnostico inicial de ISA-879 sobre `origin/nightly@a02a1463` tras una
  reproduccion LMU/Wails real: con solo Hub visible, el proceso browser de
  WebView2 crecio de ~9,3 a 11,4 GB privados mientras el renderer React se
  mantuvo en ~197 MB. Overlay v1 cruzaba ~2,68 MiB/s y el shadow v2 ~0,56
  MiB/s. La auditoria confirma que `TelemetryCoreRuntime.Start` activa ambos
  bridges aunque no exista ventana Overlay y que `wailsEmitter` usa el
  `Event.Emit` global. Wails difunde cada frame a todas las ventanas y acaba en
  `ExecuteScript(..., nil)`, despues del ultimo limite `latest-wins`; incluso
  `WebviewWindow.EmitEvent` vuelve al bus global y solo rellena `Sender`. La
  decision minima de ISA-879 es sustituir exclusivamente el push Wails de
  Overlay por demanda/acuse dirigido: una respuesta agregada v1+v2, como
  maximo una entrega pendiente, reemplazo por el ultimo estado y publisher v2
  activo solo durante la sesion consumidora. Strategy, Engineer, OBS, el
  driver y las proyecciones no cambian. Tests sinteticos no acreditan el soak
  WebView2/LMU real.

- 2026-08-21, ISA-697 / Deuda #677 Tanda 2: `TelemetryEngine.Apply` pasa de 650190 B/op 344 allocs/op @104 a 168400 B/op 327 allocs/op (-74% bytes, -5% allocs) en rama `vantareapp/isa-697-apply-churn` sobre `origin/nightly@f10b817d` (5 commits: 1 benchmark + 4 perf). Cambios: `envelope.NewSnapshotOwned` + `Peek` para no clonar donde se lee sin mutar, `Commit` directo en reducer/coordinator/pipeline, y `validateObservedState` sin map (sort). Goldens y replay parity verdes; snapshot sigue value-semantic. Evidencia `docs/telemetry-core/evidence/isa-677-apply-churn.md`, fragmento `ISA-697.json`. Queda techo ~150KB/B/op sin COW en envelope y gaps 104 por frame.

- 2026-08-20, ISA-679: `CapabilityModesV2` deja de ser un hueco. Los modos se
  resuelven por tick con `capability.ResolveModes` (declaración del driver ×
  evidencia de la sesión) en la raíz de composición, y `BuildCapabilities` los
  republica sin importar `capability` ni ningún driver, respetando ADR 0004.
  LMU publica `spatial: ["xyz"]` con posición del mundo fresca y degrada a
  `lap-distance` y luego a `none`; SimX publica `lap-distance`, sin
  `personal-best`, con `gaps: estimated`. Goldens v2 regenerados solo en el
  bloque `modes`; centinelas byte-a-byte y de 64 KiB verdes; contrato TS sin
  cambios. Evidencia:
  `docs/telemetry-core/evidence/isa-679-capability-modes.md`.
  Pendiente: ningún widget consume todavía los modos, y la procedencia
  `official`/`estimated` de gaps sigue siendo declarativa por driver.

- ISA-678 cierra el follow-up de consumo de combustible que ISA-372 / F8 lote 2a
  dejó por escrito: `derive.FuelUsage` es ahora la autoridad única del consumo
  por vuelta (media de las últimas 3 vueltas válidas, reset por sesión y stint,
  `fuel.per-lap@1`), `fuel.perLap` queda poblado y `fuel.estimatedLaps` prefiere
  `floor(remaining / perLap)` publicando su base en el campo aditivo
  `fuel.basis`. `requiredFuel` sigue ausente con motivo. La media canónica
  **difiere a propósito** de la de Overlay v1 —otra ventana y otro criterio de
  validez—, así que el comparador de sombra la declara diferencia intencional en
  vez de compararla. Evidencia:
  `docs/telemetry-core/evidence/isa-678-fuel-perlap.md`. Rama
  `vantareapp/isa-678-fuel-perlap-canonico` sobre `nightly@e2d67180`, en PR; sin
  merge ni promoción.
- ISA-372/F10 está implementada localmente sobre `tc-integration@74e1a5a6` en
  `vantareapp/isa-372-tc-f10-capabilities-multisim`. La fusión se promovió a
  `internal/telemetry/fusion` (N slots, índice por señal, `ErrRuleMissing` en
  lugar de `panic`), `internal/telemetry/capability` declara
  Supported/Available/Modes con spatial longitudinal y lateral separadas, el
  manifiesto de Engineer se deriva del driver activo y el composition root dejó
  de estar instanciado sobre `lmu.Observation`. El driver sintético SimX prueba
  el contrato extremo a extremo: llega a Overlay v2 con standings, sesión e
  instrumentos poblados y con su degradación declarada, y el diff de la rama no
  contiene ningún archivo bajo `frontend/`. Queda un hueco conocido: el builder
  de Overlay v2 aún expande el canal de adquisición a capabilities de producto y
  pertenece al lote 2a de F8; el runtime ya le entrega también los ids
  declarados. Evidencia:
  `docs/telemetry-core/evidence/isa-372-f10-multisim.md`. Sin push, PR, merge ni
  promoción.

- ISA-372/F8 lote 2b está implementada localmente sobre
  `tc-integration@b17f6228` en `vantareapp/isa-372-tc-f8-builders-lote2b`, y
  cierra los builders del contrato v2: todas las secciones del frame quedan
  pobladas o declaradas con evidencia. `controls` es nueva y aditiva y sube a
  Go el historial de pedales que Overlay v1 acumulaba en el navegador, un
  acumulador por id de widget, de modo que dos widgets mirando la misma vuelta
  podían discrepar y un remount perdía la vuelta. La forma en el wire es
  compacta a propósito -tres arrays paralelos de enteros por mil más un solo
  `windowMs`, porque las muestras son una por tick canónico- y cuesta 1.515 B
  al máximo de 120 muestras sin escalar con la parrilla, porque es solo del
  jugador. `derive/pipeline.go` gana `CapturedAt` en `ControlSample` copiado
  del sobre igual que `SelfDeltaSample` ya hacía: es el mínimo para que la
  serie lleve su base de tiempo, no una derivación nueva. `builder_spotter.go`
  publica presencia lateral desde `WorldPosition` y `Orientation` canónicos con
  los mismos metros y las mismas puertas que `internal/engineer/spotter` a
  sensibilidad normal; no se reutiliza su código porque clasifica un frame rF2
  de producto y `internal/telemetry` no puede importar producto, pero dos tests
  anclan umbral a umbral y veredicto a veredicto contra su geometría para que
  no se separen en silencio. Divergencias declaradas para F13: sin puerta de
  Full Course Yellow porque el canónico no tiene fase de sesión, sensibilidad
  fija en normal y sin lista de zonas. `mode` es `xyz` solo cuando la
  clasificación pudo ejecutarse; si no, `none` con los lados en missing, porque
  "no hay nadie al lado" y "no se puede saber" son respuestas distintas. El
  spotter va sin paridad v1: no existe widget de spotter ni en v1 ni en v2,
  así que no se crea un ViewModel sin consumidor y la cobertura son tests del
  builder con casos sintéticos. `damage` se declara inexistente con
  evidencia: no hay señal de daño en `core.VehicleState` ni en `schema/**`, y
  Overlay Projection v1 tampoco la lleva -el adaptador la lista como
  `unsupported-by-projection`-; los widgets v1 la leen del camino Wails
  heredado y el único lector real de daño es el privado de Engineer
  (`DentSeverity`, `WheelDetachedCount`), nunca promovido al canónico. Queda
  ausente de `CapabilitiesV2` en vez de presente y vacía, con un tripwire que
  falla el día que aparezca en el canónico. Enganche para F10, en orden:
  dominio de daño canónico, mapeo del driver de LMU, capability en el
  descriptor y solo entonces builder. El comparador cubre `controls` con
  métrica `{feature,field,phase}` y gate solo en `phase=live`; la serie se
  compara por solapamiento desde la muestra más nueva y no por longitud, porque
  el acumulador del navegador y el historial canónico empiezan en momentos
  distintos. Presupuesto verde: sintético @104 sube de 34.650 B a 36.037 B por
  la ventana llena de 120 muestras, que es el peor caso real, y el golden real
  compacto @104 de 22.942 B a 23.116 B, un incremento constante en cualquier
  parrilla. Evidencia:
  `docs/telemetry-core/evidence/isa-372-f8-lote2b.md`. Sin push, PR, CI remoto,
  merge, promoción ni release.
- ISA-372/F11 está implementada localmente sobre `tc-integration@f7e2cc07` en
  `vantareapp/isa-372-tc-f11-cadencias`. La cadencia de Overlay v2 se regula por
  sección antes de proyectar y serializar: `SectionScheduler` puro con reloj
  inyectado, dirty-trigger y techo para el tier lento, y un `CachedProjector`
  que memoiza por sección manteniendo el frame completo. Los defaults son cero,
  o sea el comportamiento actual sin regulación, hasta medir en el binario real.
  El benchmark @104 baja de 480 a 76 construcciones por segundo simulado y de
  39.118 a 26.516 ns/op, con los mismos 78.829 B/s porque el contrato publica
  frame completo. El coordinador del frontend queda solo visual. Falta aplicar
  la línea de integración en `telemetry_core_runtime.go` y retirar la excepción
  del wiring guard. Evidencia:
  `docs/telemetry-core/evidence/isa-372-f11-cadencias.md`. Sin push, PR, CI
  remoto, merge, promoción ni release.
- ISA-372/F8 lote 2a está implementada localmente sobre
  `tc-integration@74e1a5a6` en `vantareapp/isa-372-tc-f8-builders-lote2a`. Tres
  features más del frame v2 quedan pobladas con su dominio subido a Go.
  `builder_delta.go` publica `requested`, `available[]`, la `reference`
  efectiva y la `authority`, sustituyendo el repliegue silencioso a
  `player.deltaSeconds` que `delta-view-model.ts` (:111-118) hacía sin decir
  qué referencia usaba; `PreferencesV2` gana `DeltaReference` normalizada.
  `builder_relative.go` sube la selección de la ventana de
  `relative-row-selection.ts` (:9-48): el orden canónico es descendente por gap
  relativo derivado, reproduce el orden de salida de v1 y queda acotado a 8+8
  más el ancla, de modo que el coste de la sección no crece con la parrilla;
  `RelativeRowV2` gana `classId` de forma aditiva y el validador del transporte
  lo acepta. `builder_fuel.go` publica depósito y capacidad canónicos y la
  proyección `ceil(remaining/lastLap)` con la peor calidad de sus dos entradas.
  Decisión explícita en fuel: `perLap` se declara ausente en lugar de derivarse
  aquí, porque su serie de consumo por vuelta solo existe hoy en el snapshot de
  TypeScript y reconstruirla en la proyección crearía una segunda autoridad
  sobre el consumo; la derivación pertenece a `derive/` y queda como follow-up.
  Los ViewModels v2 de `delta`, `relative` y `fuel-strategy` quedan en shadow
  detrás de features apagadas por defecto y ningún widget se conmuta. El
  comparador cubre las tres features con tolerancias explícitas por campo y
  filas de relative por identidad con orden significativo; el gate sigue
  leyendo solo `phase=live`. Presupuesto verde: sintético @104 = 34.650 B y
  golden real compacto @104 sube de 21.775 B a 22.942 B. Queda a vigilar en
  sesión real que v1 ordena relative por distancia de vuelta y v2 por gap
  derivado: bajo tráfico pueden divergir y hay que leer
  `{feature="relative",field="rows.order",phase="live"}` antes de conmutar.
  Evidencia: `docs/telemetry-core/evidence/isa-372-f8-lote2a.md`. Sin push, PR,
  CI remoto, merge, promoción ni release.
- ISA-372/F8 lote 1 está implementada localmente sobre `tc-integration@f7e2cc07`
  en `vantareapp/isa-372-tc-f8-builders-lote1`. El comparador shadow v2
  segmenta por fase y el gate lee sólo `phase=live`: los 317k mismatches de
  `gear` de la sesión #1 y los 213+213 de la sesión #2 eran retención v1 frente
  a ocultación v2 en fase stale, una diferencia de contrato intencional que
  ahora se cuenta como `declaredDifferences`. La fase `transition` cubre el
  caso en que el status v1 y el `source.state` v2 discrepan: con 54 coches de
  IA el driver oscila stale↔live y ambos productores cruzan el borde en
  instantes distintos, lo que producía los 153 mismatches de `display.status`.
  Los acumuladores y el histograma de parseo rotan por epoch/sesión y los
  percentiles describen sólo la ventana live. La ventana de emparejamiento sube
  de 8 a 64 con desalojo por secuencia más atrasada, lo que corrige el atasco
  de ~2 minutos medido. `builder_session.go` documenta la bandera ausente y
  `builder_standings.go` sube a Go el orden de la clasificación, incluido el
  fallback `index+1` que el widget aplicaba en silencio, y deriva
  `ClassPosition` de ese orden. Los ViewModels v2 de `standings` y
  `racing-flags` quedan en shadow detrás de features apagadas por defecto y
  ningún widget se conmuta. Presupuesto verde: sintético @104 = 34.650 B y
  golden real compacto @104 con 104 filas = 21.775 B. Quedan declarados
  ausentes bandera de sesión, dorsal, mejor vuelta por fila e intervalo al
  coche de delante; `relative`, `delta`, `fuel` y `spotter` siguen sin poblar.
  Evidencia: `docs/telemetry-core/evidence/isa-372-f8-lote1.md`. Sin push, PR,
  CI remoto, merge, promoción ni release.
- ISA-372/F7 está implementada localmente sobre `tc-integration@f65f485f` en
  `vantareapp/isa-372-tc-f7-aislamiento-consumidores`. Engineer usa un puerto
  asíncrono default-on: snapshots latest-wins cap 1 con timeout/recover y facts
  ordenados por un canal separado con cursor/resync. El test F0 de Engineer
  lento bajó de 92,9868 ms síncrono a 1,5167 ms tras F7.1 (0,5007 ms en una
  repetición focal final). Strategy conserva builder y consumidor in-process,
  pero su transporte público queda default-off con rollback explícito.
  Recording registra rango de gap y `Incomplete` al saturarse sin bloquear,
  aunque sigue desconectado hasta F12. Suite Go aplicable, build, contract-gen,
  wiring guard y diff-check pasan; vet conserva sólo tres `unsafe.Pointer`
  heredados. El resync automático del consumidor Engineer y la sesión LMU real
  quedan pendientes. Evidencia:
  `docs/telemetry-core/evidence/isa-372-f7-consumer-isolation.md`. Sin push, PR,
  CI remoto, merge, promoción ni release.
- ISA-372/F6 está implementada localmente sobre `tc-integration@bafe94d5` en
  `vantareapp/isa-372-tc-f6-overlay-frame-v2-slice`. OverlayFrame v2 fija el
  contrato compacto completo y puebla solo player/session/capabilities; el
  sintético completo de 104 vehículos mide 34.650 bytes. El runtime lo
  construye después del commit, publica v1 primero y aísla fallos v2. Publisher
  latest-wins, replay, store TS generado y Wails/SSE quedan cableados en
  shadow. `pedals-telemetry` compara valores mostrados por epoch/secuencia, con
  feature v2 default-off para el usuario. Node sintético midió CPU p99/op
  0,720 ms; no acredita WebView2. Evidencia, procedimiento y gate real pendiente:
  `docs/telemetry-core/evidence/isa-372-f6-overlay-v2-slice.md`. Sin push, PR,
  CI remoto, merge, promoción ni release.
- ISA-372/F3 está implementada localmente sobre `tc-integration@c52d6c1d` en
  `vantareapp/isa-372-tc-f3-engine-apply`. `TelemetryEngine.Apply` prepara y
  confirma reducer/coordinator/derive como una transacción, y el mapper no
  confirma su candidato hasta que esa aplicación completa acepta el batch.
  Identidad usa gracia de slot, LRU inactiva y `StintID`; el shadow Go es privado,
  muestreado y auto-disable. Métricas y regresiones cubren atomicidad,
  reintento, identidad y divergencias. Build, suite Go aplicable, replay por
  digest y diff-check pasan; vet conserva solo tres `unsafe.Pointer`
  heredados. Benchmark sintético @104 cumple p99 < 1 ms solo en ventanas de
  200; bajo ejecución adaptativa sostenida sube a 10,5–12,1 ms por GC, así que
  el objetivo sostenido sigue pendiente. Evidencia y límites:
  `docs/telemetry-core/evidence/isa-372-f3-engine-apply.md`. Sin push, PR, CI
  remoto, merge, promoción ni release; LMU/Wails/OBS y gate de estabilidad
  real pendientes.
- ISA-372/F2 está implementada localmente sobre
  `tc-integration@98c3e2f2` en la rama
  `vantareapp/isa-372-tc-f2-watchdog-stale`. Backend y store degradan a stale
  por edad con reloj inyectable, recuperan al volver frames, aceptan revisiones
  de status mayores no contiguas y conservan el último full sin inventar
  valores. Métricas, diagnóstico, rollback default-on y escenarios de
  reconnect/late join quedan cubiertos. Frontend 390/2.866, Go focal/global,
  builds, lint focal y Playwright de estados pasan con las deudas heredadas
  citadas en `docs/telemetry-core/evidence/isa-372-f2-watchdog.md`. Sin push,
  PR, CI remoto, merge, promoción ni release.
- ISA-372/F4 está implementada localmente sobre `isa-373@3e9c77ed` en la rama
  `vantareapp/isa-372-tc-f4-guard-wiring-y-borrado`, pendiente de promoción.
  El guard AST de wiring queda activo; `core.Fanout`, RFC 7396 Go/TS, seal
  SHA-256, transporte live de Analysis/facts y `telemetry-store.ts` quedaron
  retirados tras demostrar cero llamadores productivos. El contrato de resync
  y retención acotada de facts vive ahora en el puerto Engineer para F7. El
  benchmark mediano del Hub bajó de 44.718 a 38.502 ns/op. No hubo push, PR,
  merge, promoción ni release; Linear queda a cargo del orquestador.
- ISA-160 / TC-10A está integrada en
  `nightly@8880a8800e07e2af21fe5ff37a714578bf8fcd00`. ISA-161 / TC-10B se
  construyó originalmente desde esa base. Su primer rebase local fue sobre
  `origin/nightly@234794d`; la base y merge-base actuales son
  `origin/nightly@b6df494298578ff9a043bbd9b48a66eb1512010f`. Tiene Tasks 1-4
  implementadas y revisadas en el HEAD previo a documentación reescrito
  `fee981be42f7a3053c2673182939fb8898609510`. El único driver/pipeline LMU
  produce Overlay y Strategy desde el mismo `FinalState`, sin readers, REST o
  storage privados adicionales. `Hub()` sigue siendo Overlay y
  `StrategyHub()` posee un Hub Strategy separado.
- `StrategyLiveProjection v1` publica sesión (`sourceTimeSeconds`, end,
  remaining y maximum laps), progreso (lap, sector y distancia), pit y Fuel
  amount/capacity derivados atómicamente del mismo campo canónico. Presencia,
  procedencia y freshness se conservan; capabilities: `session`, `progress`,
  `pit` y `fuel`. Virtual Energy, tyres, weather y facts permanecen ausentes,
  sin fallback.
- Wails sirve status/projection namespaced y replay de status; SSE registra
  `GET /telemetry/strategy/projection` loopback-only. El transporte publica
  latest full y resync full, sin fabricar delta. Lifecycle, fail-stop y
  teardown cubren ambos hubs. Replay, compatibilidad old/new, soak simultáneo
  Overlay+Engineer+Strategy y benchmark están documentados en
  `docs/telemetry-core/evidence/isa-161-strategy-live-producer.md`. `-race` no
  fue ejecutable por `CGO_ENABLED=0` y ausencia de GCC.
- El gate LMU sanitizado pasa sobre el HEAD del primer rebase `879d5be`: proceso
  `Le Mans Ultimate` activo, probe opt-in read-only, build normalizada
  `1.4.0.0` supported, runtime `live`, `player-present=false` y fingerprint
  `LMU_Data/runtime:build=1.4.0.0;size=324820;evidence=active-grid-bijective;telemetry=not-required-no-player`.
  No persistió raw, IDs ni PII. Acredita adquisición/mapping/runtime y ausencia
  correcta de telemetría rápida sin jugador; no acredita un full Strategy con
  Fuel live en pista. Fixtures hash-pinned y replay siguen siendo la evidencia
  de Fuel; la validación con jugador/Fuel en pista no se ejecutó.
- Gates locales finales sobre el HEAD del primer rebase `879d5be`: Telemetry,
  app/server, frontend build,
  `go test ./...` y frontend 367 archivos/2.636 tests pasan. Los dos
  `AbortError` de teardown happy-dom conservan exit 0. Vet global termina con
  exit 1 solo por tres `unsafe.Pointer` heredados; `gofmt` global lista el
  `diagnostics_service.go` heredado de `origin/nightly`, fuera del diff
  ISA-161. Diff-check queda limpio. Esta es evidencia local del primer rebase,
  no CI remoto de aquel SHA.
- Estado de entrega: la rama ISA-161 está publicada y el PR draft
  [#212](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/212)
  está OPEN/CLEAN/MERGEABLE hacia `nightly@b6df494`. Para `19dddea`, el
  [run 31639192366](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31639192366)
  terminó COMPLETED/SUCCESS: promoción válida, frontend build, Go, frontend
  tests, visual advisory y lint advisory pasaron; GitGuardian también pasó.
  Cualquier amend posterior requiere checks del nuevo HEAD y el estado final se
  consulta en el PR. Linear sigue pendiente por reautenticación; no hubo
  integración, promoción ni release. ISA-152 / STR-17 conserva el bloqueo
  absoluto hasta promoción aceptada a `nightly`. El motor live Strategy no
  existe.
- ISA-311 corrige el flake del soak lógico sin modificar el runtime: el test
  sigue recorriendo Overlay, Engineer, recording coordinator y SQLite reales,
  pero usa un reloj lógico fijo y un adapter de writer test-only con deadline
  global de 30 s para que la latencia del disco compartido no se confunda con
  el presupuesto temporal por operación. El límite real de 500 ms y sus
  regresiones permanecen intactos. El reloj aislado reveló todavía 1/20 cierres
  por contexto; la solución completa pasa soak 20/20, regresiones temporales
  20/20, build frontend y `go test ./... -count=1` sobre
  `origin/nightly@ff286f4`. Los HEAD `6ac6f9e`, `756315d` y `0a1e750` pasaron
  sin rerun los runs `31416018600`, `31416779711` y `31435630710`. PR #200 se
  promovió por rebase a `nightly@54f267b`; Linear refleja ISA-311 en `Nightly`.
  `testers`, `master` y release permanecen fuera del alcance.
- Proyecto Linear: `Telemetry Core — Modular Runtime & LMU`.
- Stack técnico final aprobado: `170eaebbaa6744019ead96a2c78201b4da2fb9bb`.
- Promoción ISA-171 / TC-09G completada en
  `nightly@c5eb3c906bc0f93a747adac13f3efcc9f731f8b9`.
- La protección de `nightly` prohíbe merge commits. El commit lineal promovido
  conserva exactamente el árbol aprobado `e63c54fb4db2a848e296ca06d92d90fdbc2b3c96`
  y registra como procedencia el stack `170eaeb`; rollback mediante revert del
  commit `c5eb3c9`.
- La simulación encontró solo tres conflictos documentales de gobernanza; cero
  conflictos de código. `testers` y `master` están fuera del alcance.
- Gates de integración frescos: Go bloqueante completo, ISA-118 focal,
  frontend bloqueante 1.978/1.978, build, cutover/shadow Playwright, 7/7
  fuzzers, soak/lifecycle, replays, benchmark, auditoría de consumidores y dos
  sistemas visuales pasan. El canvas conserva la flake externa ISA-172 y no se
  modifica en este corte.
- PR #65: el primer CI bloqueó correctamente una equivalencia válida de rutas
  Windows 8.3/largas en `diagnostics`. La corrección mínima usa identidad real
  del directorio, conserva los guards contra reparse points y convierte los
  errores ignorados del test en fallos explícitos. El segundo CI confirma ese
  paquete verde y expone la misma comparación textual en la frontera del
  catálogo Wails; se aplica el mismo contrato de identidad y una regresión 8.3.
  El timeout del spy permanece en 2 s para no ocultar el fallo. Review
  independiente, CI del PR y gate post-promoción `30729804412`: PASS.
- El inventario detallado siguiente conserva la historia técnica de cada corte.
- Follow-up Strategy live: ISA-160 / TC-10A ya está en `nightly@8880a88` e
  ISA-161 / TC-10B produce/cablea `StrategyLiveProjection v1` en su rama de
  issue sin reabrir la adquisición LMU. La base y merge-base actuales son
  `origin/nightly@b6df494`; falta su entrega remota y promoción.
- TC-01–TC-03: cerrados.
- TC-04A ISA-35: cerrado.
- TC-04B ISA-36: cerrado.
- TC-04C ISA-37: implementado y presente en la base.
- TC-04D ISA-38: implementado, entregado y presente en la base.
- TC-05A ISA-39: cerrado técnicamente; correcciones del primer review
  aceptadas sin P0/P1/P2/P3.
- TC-05B ISA-40: cerrado técnicamente tras re-review `ACCEPT` sin
  P0/P1/P2/P3.
- TC-05C ISA-41 y TC-06A ISA-101: cerrados en la base aprobada de ISA-102.
- TC-06B ISA-102: implementación completa y tercera review `ACCEPT` sin
  P0/P1/P2/P3 conocidos. No hay wiring productivo.
- TC-06C ISA-103: dos reviews finales `ACCEPT`, P0/P1/P2/P3 = 0; los hallazgos
  iniciales y los tres casos límite posteriores quedaron corregidos y están
  cubiertos por regresiones repetidas.
  Replay permanece exclusivamente en tests/harness y migraciones productivas
  no tienen pasos mientras v1 sea el único schema real. El test heredado de
  cancelación REST dejó de usar el ticker productivo y pasa x100 de forma
  determinista; el runtime LMU no cambió.
- TC-06D ISA-104: implementación y gates D7 completos; preparada para entrega
  apilada sobre ISA-103.
  Catálogo metadata-only, inspector local, paquete sanitizado byte-exacto,
  eventos Wails correlacionados, cancelación acotada, UI responsive e
  internacionalizada, captura raw limitada y tap LMU sin wiring productivo.
  Reviews integradas backend y UI: `ACCEPT`, P0/P1/P2/P3 = 0.
- TC-07A ISA-105: implementación y re-review D6 completas; código final
  `f6b43b7`, `ACCEPT`, P0/P1/P2/P3 = 0. PR draft `#41`; Linear `In Review`.
- TC-07A.1 ISA-129: D0-D8 aceptados y publicados; D9 ha cerrado la evidencia
  real y está en gates/review final. Overlay v1
  conserva versión y claves base; añade
  campos opcionales de sesión, scoring, fuel, gaps y self-delta/history. Los
  dos goldens prueban old/old, old/new, new/old y new/new sin relajar el
  decoder. Adapter y comparator consumen solo señales demostradas; flags,
  equipo, número, compuesto, weather y daños siguen missing. Focal Go x20,
  Telemetry Core completo, frontend 297 archivos/2.020 tests, lint focal y
  build pasan. El harness D8 recorre una captura real LMU 1.4 de 38 vehículos
  por Driver/Fusion -> BatchMapper -> Reducer -> SessionCoordinator -> Derive
  -> Overlay v1, con una apertura/cierre y bytes idénticos en 20 ejecuciones.
  El trace real Delta de 1.846 muestras atraviesa la cadena canónica y el mismo
  golden exacto consumido por decoder/adapter TypeScript. Reorder, vacancy y
  generación, reset de sesión, cambio de jugador y freshness completo se
  prueban como transiciones controladas, no como evidencia real adicional. El
  cruce corrigió arrays vacíos `null` a `[]`. D9 añade una secuencia real
  sanitizada `InPit=false -> true -> false` dentro de la misma sesión —sin
  inferir garaje, box, pit lane o fase de parada— y un ciclo
  real connected -> disconnected -> reconnected sin payload desconectado. D5
  implementó el mapper canónico
  `Observation → Batch`: fixture real 44/44, identidad opaca por slot y
  generación, jugador/header coherentes cuando existe y limpieza segura al
  desaparecer, sesión/epoch literal según §2.4 y commit de estado únicamente
  tras aceptación del sink. El adapter real del `DriverManager` y el reloj
  duradero conservan continuidad y detectan resets entre reconexiones. Focal
  x20 y Telemetry Core pasan. Review D8 final `APPROVE`, P0/P1/P2/P3 = 0. D4B capturó y
  hash-pinned LMU 1.4
  real en menú y pista, ha probado los ocho solapes SHM/REST —incluido circuito
  antes de anonimizar— y ha habilitado únicamente `1.4.0.0` mediante file y
  product version coincidentes. Lector productivo opt-in `live` PASS. Sin
  derivaciones, wiring, PR, merge ni promoción todavía.
- TC-07B ISA-106: shadow Wails/SSE implementado sobre ISA-129. Legacy conserva
  autoridad de render; Studio/Desktop/OBS observan el contrato canónico sin
  dirty ni mutaciones visuales. Gates Go, frontend y Playwright verdes.
- TC-07C ISA-107: cutover implementado. Overlay Projection v1 es la única
  fuente alcanzable de Studio/Desktop/OBS; el runtime legacy dejó de arrancar.
  Código legacy inerte se elimina en TC-09, no durante el cutover.
- TC-08A ISA-108: auditoría 30/30 completa. La matriz vigente está en
  `docs/telemetry-core/engineer-capability-audit-isa-108.md`. No cambia
  comportamiento ni elimina funcionalidad. Confirma que sesión, grid, fuel,
  pit, laps y gaps son proyectables, mientras flags, engine, tyre, damage,
  conditions y driver swaps deben quedar deshabilitados sin capability.
- TC-08A.1 ISA-130: geometría implementada y verificada antes de ISA-109.
  World position, orientation y local velocity atraviesan el core con
  evidencia LMU real; los offsets y tests sintéticos legacy no se usan como
  autoridad. Suite global, repeticiones, fuzzing y benchmarks pasan; los dos
  avisos Win32 de vet son heredados.
- TC-08B ISA-109: proyección y entrada pura implementadas. El payload contiene
  sesión, parrilla completa, fuel, gaps y geometría con calidad explícita. Se
  reutiliza el contrato ENG-02/03 aprobado, incorporado como segundo padre de
  la rama; no se arrastran su UI ni sus assets de investigación. No hay wiring.
- TC-08C ISA-110: matriz ejecutable 21/21 y bridge replay fail-closed.
  Spotter normal, fuel, contador genérico de sanciones, laps, timings y
  entrada/salida de pit tienen escenarios de paridad. El resto permanece
  parcial o disabled; no hay wiring productivo.
- TC-08D ISA-111: runtime Engineer separado de toda fuente live/sintética;
  entrada canónica acotada por familia, todavía sin wiring LMU productivo.
- TC-08E ISA-112: cutover productivo implementado. El único runtime LMU
  publica estado, observación y hechos hacia Engineer; Engineer no abre un
  reader propio y sus errores quedan aislados de Overlay. La captura real de
  38 coches demuestra la cadena completa y ausencia de falsos Spotter ante
  tráfico lejano. ISA-113 detectó que el shell aún abre otro grafo legacy.
- TC-09A ISA-113: auditoría completada. El runtime canónico es único productor
  de Overlay/Engineer, pero `app.New(-live)` todavía abre una adquisición LMU
  y REST legacy para status/diagnostics/ops. ISA-114 debe migrarlos y retirarla.
- TC-09B ISA-114: implementación completa en revisión. El composition root ya
  no crea `app.App` ni un segundo reader/poller. Status, diagnostics y ops usan
  `TelemetryCoreRuntime`; solo el driver canónico contiene APIs de adquisición
  LMU. El backend legacy y sus CLIs quedan retirados.
- TC-09C ISA-115: implementación completa en revisión. Un único decoder/mapper
  Overlay y lifecycle compartido para Wails/SSE; eventos, adapters y selector
  shadow legacy retirados sin cambiar UI.
- TC-09D ISA-116: implementación y review completadas. Fuzzing de siete
  fronteras, métricas payload-free, benchmarks de la cadena y soak lógico de
  dos horas con 64 vehículos, seis consumidores, Engineer y SQLite pasan.
- TC-09E ISA-87: lifecycle productivo y harness Wails/SSE cerrados; shutdown
  ordenado, hotkeys Win32 corregidos y owners de recursos verificados.
- TC-09F ISA-117: gate técnico final cerrado. Auditoría, fuzz, replay, soak,
  lifecycle, frontend, Playwright, Crystal y evidencia LMU real pasan. Isaac
  aprobó el checklist humano y la issue quedó `Done`; su promoción controlada
  continúa exclusivamente mediante ISA-171.

Existe wiring productivo canónico para Overlay y Engineer. Gaps, delta, pit y
reconexión tienen inputs, algoritmo, fixtures reales y proyección demostrados.
No queda otro corte de implementación de Telemetry Core. La siguiente acción
es la validación integrada Nightly/Pro Plus y la recogida de feedback antes de
considerar cualquier paso a `testers`; `master` permanece fuera de alcance.
`go vet` conserva tres avisos heredados de `unsafe.Pointer` Win32; ISA-118 e
ISA-131/ISA-94 poseen la deuda externa.

## Decisiones

- Preferencia por señal, no autoridad global entre Shared Memory y REST.
- Cero es legítimo; missing/stale/invalid no se inventan.
- Raw en memoria; persistencia solo con consentimiento.
- LMU usa sus archivos históricos y no duplica recording por defecto.
- Reducer single-writer sin I/O; derivaciones lineales/versionadas/acotadas.
- Replays raw, canónicos e históricos son niveles distintos.
- Mocks/simulator solo en harness explícito.

## Evidencia y riesgos

- ISA-37: focal x20, Core, guard ADR, race, fuzz 10 s, benchmark, frontend
  build y suite global Go en verde.
- ISA-38: fan-out sin goroutines, snapshot latest-wins de capacidad uno, log de
  hechos compartido/acotado y resync explícito; tests de soak 20.000, lectores
  concurrentes y 1.000 cierres simultáneos. El cursor causal, teardown
  cancelado, métricas de dos lectores y agotamiento máximo tienen regresiones.
  Focal x20, Telemetry completo, race focal x5 con GCC UCRT64, vet focal, build
  frontend y suite global Go PASS tras la corrección; re-review ACCEPT.
- ISA-39: cuatro proyecciones v1 pequeñas, golden JSON, calidad/presencia
  explícitas, capabilities por producto y versiones canonical/projection/
  recording independientes. La frontera corregida y aprobada es
  `core -> derive -> projection`; Overlay publica `controls.history` sin
  duplicar el tipo derivado. Sin transporte o wiring. ENG-02 debe consumir el
  contrato `projection/engineer` y no duplicar envelope/versioning. Focal x20,
  Telemetry, guard ADR, vet, race x5 y frontend build PASS. Global conserva la
  contención Windows conocida de settings. Una pasada intermedia mostró una
  ejecución load-sensitive del teardown REST LMU; Telemetry final y el focal
  aislado x20 pasan, y ninguna ruta del driver está en el diff.
- ISA-39 review: los campos del jugador ausente ya no usan el zero-value de Go;
  serializan calidad `unknown/missing` explícita en Engineer, Strategy y
  Analysis. El guard de arquitectura rechaza imports entre subárboles de
  productos y conserva únicamente raíz común + árbol propio.
- ISA-40: hub local sin wiring global, full obligatorio, delta RFC 7396
  equivalente y opcional, resync full ante late join/reconnect/gap/consumer
  lento, status separado y coherente por `statusRevision`, facts con secuencia
  independiente y adapters Wails/SSE con JSON idéntico. Constructors tipados y
  sello privado impiden sustituir los `PayloadV1` por canonical/final/raw.
  Cada hub y envelope quedan aislados por `ProductID`; Wails y SSE comparten
  nombre namespaced y JSON. Epoch solo avanza, facts comprueba continuidad
  desde `after` y el delta se reseala. Límite duro de 256 KiB; SSE
  loopback-only. Focal x20, vet focal, race x5,
  Telemetry, guard ADR, frontend 1851/1851, build y suite global Go PASS.
  Benchmark full de 64 vehículos: 258–303 µs/op, ~128,7 KiB/op y
  1.964–1.965 allocs/op.
- ISA-41: decoder/store TypeScript compartido para cuatro productos, payloads
  opacos y versión v1. Status/snapshot coherentes, full de resync, delta
  continuo, facts con cursor independiente y teardown compartido. Harness
  explícito sin ruta productiva; golden Go consumidos por tests. Un fixture
  compartido fija rutas, eventos, estados y límites en Go y TypeScript. Focal
  36/36, frontend 1.887/1.887, build, lint focal, TC-05B Go x20 y proyecciones
  Go y suite global Go PASS. El primer review quedó corregido: reframe
  coherente tras cambio de status, extensiones seguras, cap duro de 256 KiB y
  attach/teardown transaccionales; pendiente re-review independiente.
- ISA-101: benchmark aislado con exactamente los mismos bytes sanitizados para
  framing, SQLite modernc y MCAP. Cinco repeticiones nominal/4×/ráfaga y una
  de 24 h lógica conservaron counts, cursor y SHA-256; queries de rango/cursor,
  crecimiento y tamaños quedaron en CSV. Throughput de cierre se separa de
  checkpoints/RPO.
- ISA-101 crash/recovery: kills deterministas cubren antes de append, antes de
  commit, después de commit/antes de manifest y después del replace. En el
  límite intermedio SQLite/framing recuperan DB `240` con watermark `200`;
  before-append conserva accepted `200`; opening/recording/recovering reinician
  incomplete sin mezclar `accessMode`. Accepted es volátil: no hay ACK durable
  por lote ni pérdida exacta inferible. MCAP no ofrece commit parcial y sigue
  `NO-GO` autoritativo; su recovery CLI upstream no quedó verificado localmente.
- ISA-101 packaging: probes CGO=0 PASS para framing, SQLite y MCAP; DuckDB
  bloqueado por build tags CGO y ausencia de `gcc`. Build base Wails CGO=0
  PASS. SQLite queda `GO` condicionado a TC-06B; MCAP candidato condicionado
  para intercambio/replay; DuckDB y
  framing propio `NO-GO` autoritativo.
- ISA-101 checks: tests del módulo x5 para framing/SQLite/MCAP y tags combinados,
  vet por candidato, builds CGO=0, Telemetry completo, suite Go global, frontend
  build, Wails Windows, invariantes de 48 filas/16 digests y `diff --check`
  PASS. Race no está disponible en este host CGO=0 sin `gcc`; frontend test no
  se repitió porque el corte no cambia frontend.
- ADR 0005 y `docs/telemetry-core/historical-storage-schema.md` fijan manifest
  atómico, observed/facts autoritativos, derived reconstruible, raw opt-in
  separado, chunks versionados/CRC, accepted volátil/watermark/committed,
  `RecordingPayloadV1`/`RecordingFactV1` allowlisted con golden y errores
  unknown tipados, integridad/modo de acceso separados, COW con switch solo por
  manifest, versiones futuras read-only y recovery sobre copia.
- ISA-102 materializa ese contrato: puertos neutrales, mapper real
  pseudonimizado, cola no bloqueante, SQLite modernc privado, manifest
  atómico, reader por rangos, recovery COW del bundle DB/WAL/SHM, límites de
  crecimiento y teardown. Crash boundaries, fallos, privacidad, benchmark y
  packaging CGO=0 están en
  `docs/telemetry-core/recording-sink-sqlite-isa-102.md`.
- La primera review de ISA-102 detectó siete inconsistencias confirmadas,
  corregidas sin ampliar alcance: deadlines reales en todas las operaciones,
  fallo terminal sobre Stop, batch v1 con snapshot obligatorio y tiempos
  mixtos, lease Windows cross-process, catálogo FactType único, cursores/reason
  cerrados y validación NaN/Inf/presence. Pendiente re-review independiente.
- La segunda review añadió tres correcciones: ledger RPO exacto para
  checkpoints parciales/epochs, contexto cooperativo hasta la escritura
  atómica del manifest y DSN URI seguro para caracteres reservados/Unicode.
  Casos nuevos x100 y paquete completo x10 pasan. La tercera review read-only
  del orquestador cerró `ACCEPT` sin P0/P1/P2/P3 conocidos. La repetición
  fresca dejó recording y Telemetry Core en verde. La suite Go global falló
  únicamente por la contención Windows heredada de ISA-118 bajo carga; su caso
  focal x20 pasó y la suite global serial posterior quedó completamente verde.
  Vet focal y build Wails Windows con CGO desactivado también pasan; no hay una
  regresión atribuible a TC-06B.
- Bench ISA-38 fechado: snapshot escalar 231,1–251,6 ns/op y hecho
  129,1–136,2 ns/op, ambos 0 B/op/0 allocs; snapshot con copia de 64 vehículos
  3,753–5,432 µs/op, 16.384 B/op y 1 alloc.
- ISA-104 backend: raíz histórica canónica en LocalAppData o data portable;
  toda la cadena rechaza symlinks/junctions/reparse. Prepare/List/Inspect
  comparten máximo dos operaciones, lifecycle de aplicación y cancelación
  correlacionada; cancel-before-request usa TTL 30 s y cap 64 sin goroutine.
  `ProfileService` entrega snapshots defensivos bajo sincronización.
- ISA-104 UI: solo current+ready abre Inspect; future/corrupt/current no
  disponible son metadata-only. El cliente recalcula SHA-256 y tamaño antes de
  preview/copy/download. Los estados no inspeccionados muestran `—` en lugar
  de zero-values desconocidos y el contraste local medido es 4,592:1. Vitest
  focal 64/64, suite frontend 1.923/1.923, build, lint focal y Playwright con
  seis capturas pasan; consola/overflow/procesos residuales en cero. Evidencia:
  `docs/telemetry-core/evidence/isa-104-inspector/`.
- ISA-104 hardening final: la raíz raw valida toda la cadena antes y después de
  crear y rechaza symlink/junction/reparse; Settings/Launcher entrega snapshots
  profundos, incluido `LastLaunchedAt`; el catálogo conserva top-K global
  determinista con más de 500 entradas. Tests junction Windows, focales
  repetidos y race pasan. Suite Go global serial final: PASS.
- **P3 heredado:** seis avisos `unsafe.Pointer` Win32 en vet global; los seis
  archivos son idénticos a la base ISA-105.
- **Deuda heredada reproducida:** ISA-118 conserva historial de flakiness por
  contención Windows de `app-settings.json.tmp`, pero la ejecución global final
  de ISA-129 queda PASS. El lint global conserva 32 errores y 2 warnings fuera
  del área focal; el único error heredado dentro de un archivo tocado se cerró.
- **P2 operativo cerrado:** ISA-121 creó y protegió Nightly/Testers. La
  promoción controlada se ejecuta mediante ISA-171.
- **Gates funcionales ISA-129 cerrados:** pit/outlap, disconnect/reconnect y las
  dos vueltas Delta proceden de evidencia real sanitizada; no hay sustitución
  sintética ni cutover.

## Issues

| Estado | Issues |
|---|---|
| Cerradas | ISA-23–37, incluyendo ISA-96/97/100 según Linear |
| En revisión | ISA-38 / TC-04D, implementación aceptada técnicamente |
| Cerrada técnicamente | ISA-39 / TC-05A, re-review `ACCEPT` |
| Cerrada técnicamente | ISA-40 / TC-05B, re-review `ACCEPT` |
| Cerradas en la base ISA-102 | ISA-41 / TC-05C e ISA-101 / TC-06A |
| Cerrada técnicamente | ISA-102 / TC-06B, tercera review `ACCEPT` |
| Cerrada técnicamente | ISA-103 / TC-06C, dos reviews finales `ACCEPT` |
| Cerrada técnicamente | ISA-104 / TC-06D, reviews integradas `ACCEPT` |
| En revisión | ISA-105 / TC-07A, PR draft `#41`, D6 `ACCEPT` |
| Cerrada técnicamente | ISA-129 / TC-07A.1; D0-D9 aceptados |
| En revisión | ISA-106 / TC-07B, ISA-107 / TC-07C e ISA-108 / TC-08A |
| Cerradas técnicamente | ISA-130 / TC-08A.1 e ISA-109 / TC-08B |
| Cerradas técnicamente | ISA-110 / TC-08C, ISA-111 / TC-08D e ISA-112 / TC-08E |
| Auditoría cerrada | ISA-113 / TC-09A, matriz proof-first sin borrados |
| En revisión | ISA-114 / TC-09B, backend duplicado retirado |
| En revisión | ISA-115 / TC-09C, frontend/transporte legacy retirado |
| Cerrada técnicamente | ISA-116 / TC-09D, hardening y soak `APPROVE` |
| Cerrada técnicamente | ISA-87 / TC-09E, Wails/SSE y teardown integrado |
| Aprobada | ISA-117 / TC-09F, gate final completo en `170eaeb` |
| Completada | ISA-171 / TC-09G, promoción controlada a `nightly@c5eb3c9` |
| Integrada en Nightly | ISA-160 / TC-10A en `nightly@8880a88` |
| PR draft / CI verde en corte publicado | ISA-161 / TC-10B, PR draft [#212](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/212) OPEN/CLEAN/MERGEABLE a `nightly@b6df494`; [run 31639192366](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31639192366) SUCCESS para `19dddea`; Linear pendiente, sin integración |

## Arquitectura objetivo (ISA-371 / ISA-372)

- ISA-372 / F5 genera el contrato TypeScript wire desde raíces Go explícitas
  de las cuatro proyecciones y telemetrytransport, sin generar el canonical.
  `contracts.ts` reexporta el resultado, los cuatro goldens quedan intactos y
  CI regenera/compara. El conteo histórico de 28 campos estaba obsoleto:
  Overlay Vehicle v1 tiene 30 y Go/TS ya coincidían. El espejo vive realmente
  en `overlay/projection/overlay-projection-v1.ts`, fuera del alcance editable
  F5; queda pendiente un corte que sustituya allí los aliases por imports del
  generado. Evidencia:
  `docs/telemetry-core/evidence/isa-372-f5-contract-gen.md`.
- ISA-372 / F1 implementa la política de fallo no terminal sobre
  `isa-373@3e9c77ed`: errores de producto, payload y consumidor descartan y
  cuentan el frame, publican `degraded` y no cierran adquisición; solo errores
  de programación llaman `failStop`. Overlay y Strategy quedan aislados entre
  sí, las cinco fronteras de consumidor recuperan panics y el status terminal
  se entrega antes de `ErrClosed`.
- `TelemetryFailurePolicyV2` queda on por defecto con rollback explícito a
  legacy. El límite sigue en 256 KiB: 104 vehículos todavía descartan Overlay
  v1 hasta F6, pero no matan el runtime. Métricas nuevas: frames descartados,
  fallos por producto, panics por boundary, fail-stops, percentiles de payload
  y transiciones de lifecycle. Evidencia:
  `docs/telemetry-core/evidence/isa-372-f1-failure-policy.md`.
- Los cuatro tests F0 de F1 están activos y la suite local pasa con las deudas
  citadas. La sesión LMU real de 60 minutos queda pendiente de Isaac. Estado:
  nueve commits locales, sin push, PR, CI remoto, merge, promoción ni release.
- ISA-373 / F0 deja la red de seguridad ejecutable sin modificar producción.
  Los tests rojos permanecen saltados con el defecto y la fase que los activa:
  techo de payload y grid 104 (D-08/D-02), commit mapper/reducer (D-01),
  publicación terminal, panic y consumidor lento (D-02 y riesgos 7/13), gracia
  de identidad, historial y firma stale (D-03 y riesgo 11), historial de 300
  vehículos (D-04), watchdog/orden del status terminal (D-06) y store frontend
  con edad/revisión no contigua (D-06/D-07).
- Sin `Skip`, los tests fallan por la causa prevista. La reutilización real de
  un slot por otro coche ya asigna una identidad nueva y se conserva como
  comportamiento correcto a migrar literalmente. El runtime no ofrece todavía
  inyección de driver ni reloj; F0 usa el sink real post-driver y documenta el
  reloj faltante sin añadir hooks de producción.
- Baseline versionada en
  `docs/telemetry-core/evidence/baseline-2026-08/`: mediana de proyección Overlay
  + JSON para 1/20/44/104 vehículos, con salida cruda. A 104 son 1.593.117 ns/op,
  1.160.221 B/op, 29 allocs/op y 277.119 payload bytes.
- Estado: diez commits locales sobre `origin/nightly@7a92241d`; sin push, PR,
  merge, promoción ni release. Linear queda a cargo del orquestador.

## Siguiente acción exacta

El orquestador debe revisar los commits F1 y los cuatro commits F5, integrar el
carril F2 sin sobrescribir sus archivos reservados y actualizar Linear cuando
las issues propias existan. Isaac debe ejecutar la sesión LMU real de 60
minutos y decidir si acepta la entrega aislada. No hacer push, PR, merge o
promoción desde este worker. F6 sigue siendo el dueño del payload compacto de
104 vehículos; F3 sigue siendo el dueño de la transacción única del engine.
El orquestador debe revisar los cinco commits F2, actualizar Linear cuando la
issue propia exista y decidir el siguiente corte de integración. Isaac debe
ejecutar la verificación LMU/Wails/OBS descrita en la evidencia. No hacer push,
PR, merge o promoción desde este worker. F6 sigue siendo el dueño del payload
compacto de 104 vehículos; F3 sigue siendo el dueño de la transacción única
del engine.

## Gate final

TC-09 exige Core, recording, Overlay y Engineer simultáneos; soak automatizado
de dos horas; sesión LMU real; reconexión; frecuencia/drops/latencia; teardown;
y evidencia para Isaac.

## Última actualización

2026-08-19, ISA-372/F5: contrato TypeScript wire generado localmente desde Go,
reexports en frontend, goldens compartidos y gate de regeneración local/CI.
Hallazgo documentado: Overlay Vehicle v1 tiene 30 campos y el espejo ya era
paritario. Sin cambios de red o canonical; sin push, PR, CI remoto, merge,
promoción ni release. Integración F2 pendiente del orquestador.
2026-08-19, ISA-372/F2: watchdog backend y frontend implementado con reloj
inyectable, stale/recovery, revisión no contigua, métricas, diagnóstico,
rollback y tests de reconnect/late join. Gates locales y Playwright de estados
pasan; runtime LMU/Wails/OBS real pendiente. Cinco commits locales, sin push,
PR, CI remoto, merge, promoción ni release.

2026-08-19, ISA-372/F1: política v2 no terminal implementada localmente sobre
`isa-373@3e9c77ed`, con rollback legacy, métricas, recover por consumidor,
status terminal entregable y cuatro tests F0 activados. Gates locales pasan
con las excepciones preexistentes documentadas; sesión LMU de 60 minutos
pendiente de Isaac. Sin push, PR, CI remoto, merge, promoción ni release.

2026-08-12, ISA-161: ISA-160 ya está integrada en `nightly@8880a88` e ISA-161
surgió originalmente de esa base. El primer rebase fue sobre `234794d`; la base
y merge-base actuales son `origin/nightly@b6df494`. Tasks 1-4 y sus reviews
locales están cerradas en el HEAD previo a documentación reescrito `fee981b`:
contrato Strategy v1 aditivo,
segundo Hub sobre el mismo `FinalState`, Wails/SSE locales y
replay/resync/soak/benchmark.
Fuel amount/capacity conserva atomicidad y quality; VE, tyres, weather y facts
siguen ausentes. Race no se ejecutó por falta de CGO/GCC. El opt-in LMU
read-only pasó sobre el HEAD del primer rebase `879d5be` con build `1.4.0.0`
supported, runtime live y
player ausente; acredita adquisición/mapping/runtime, no un full Strategy ni
Fuel live en pista. Telemetry, app/server, Go global, frontend build y
367 archivos/2.636 tests pasan; dos `AbortError` de teardown terminan con exit
0. Vet conserva solo tres `unsafe.Pointer` heredados y gofmt lista el
`diagnostics_service.go` heredado, fuera de ISA-161. La rama está publicada y
el PR draft #212 permanece OPEN/CLEAN/MERGEABLE a `nightly@b6df494`; el run
`31639192366` y GitGuardian pasaron para `19dddea`. Cualquier amend posterior
requiere checks de su nuevo HEAD y el estado final se consulta en el PR. Linear
continúa pendiente por reautenticación. No hubo merge, promoción ni release.
ISA-152 no está desbloqueada hasta la promoción aceptada de ISA-161 a
`nightly`.

2026-08-01, ISA-117: gate técnico final completado sobre ISA-87 `4233c9f`.
La auditoría demuestra un solo owner LMU y cero rutas legacy productivas. Go
global, siete fuzzers, replay, soak de dos horas, lifecycle x5, frontend
2.016/2.016, build, Playwright cutover/shadow, Crystal 21/21, fixtures LMU
reales x5 y lectura live LMU 1.4 pasan. Cero P0/P1/P2 atribuibles a Telemetry
Core. Deuda externa: ISA-118 e ISA-131/ISA-94; `-race` sin GCC y tres avisos
Win32 vet heredados. Documento, rollback y checklist:
`docs/telemetry-core/final-gate-isa-117.md`. Estado: `In Review`; sin merge ni
promoción.

2026-08-01, ISA-87: status y Overlay Projection v1 coinciden byte a byte entre
el transporte real de eventos Wails y SSE. El composition root posee un
shutdown único y ordenado; Engineer forma parte de él y los hotkeys terminan
su hilo Win32 mediante `PostThreadMessageW`. El harness integrado prueba
SQLite, puerto, suscriptores, goroutines, bridges y owners de handles. Documento:
`docs/telemetry-core/wails-lifecycle-teardown-isa-87.md`. Siguiente: ISA-117.

2026-08-01, ISA-116: siete fronteras pasan fuzzing; métricas runtime/transporte
sin payload; soak lógico exacto de dos horas con 64 vehículos, seis
consumidores, Engineer y SQLite sin rechazos ni crecimiento; benchmarks de
toda la cadena documentados. La validación del Hub conserva seguridad y reduce
el full de 64 vehículos desde 258–303 µs históricos a 47,2–50,5 µs. Go global,
frontend 2.016/2.016, build y Playwright cutover pasan. `-race` queda no
ejecutable por ausencia de GCC; vet conserva tres avisos Win32 heredados.
Documento: `docs/telemetry-core/hardening-isa-116.md`. Siguiente: ISA-87.

2026-08-01, ISA-115: `telemetry:update`, los adapters Wails/SSE antiguos,
`normalizeLegacyTelemetry`, el selector fail-open y el harness shadow runtime
quedan retirados. Studio/Desktop/OBS comparten Overlay Projection v1; el
decoder/mapper autoritativo vive en `overlay/projection` y el comparador
histórico queda no productivo hasta ISA-117. Source status usa un contrato y
eventos `telemetry-core:*` únicos. Documento:
`docs/telemetry-core/frontend-retirement-isa-115.md`. Siguiente: ISA-116.

2026-08-01, ISA-114: status, diagnostics y métricas leen el runtime canónico y
el segundo grafo LMU se retira completo. Solo
`internal/telemetry/drivers/lmu` utiliza APIs de memoria compartida. Engineer
conserva monitores, audio, comandos, Pit Manager y SSE; los readers
experimentales sin wiring se eliminan y las fixtures Extended restantes son
decoders puros sin I/O. Documento:
`docs/telemetry-core/backend-retirement-isa-114.md`. Siguiente: ISA-115.

2026-08-01, ISA-113: la matriz final demuestra que `app.New(true)` todavía
abre el reader y poller REST legacy, aunque ya no publique widgets. El status
visible, diagnostics y ops mantienen ese grafo alcanzable junto al driver
canónico. Se clasificaron backend, Engineer, frontend, transports, fixtures y
tooling con KEEP/MOVE/DELETE y orden de retirada. Cero borrados. Documento:
`docs/telemetry-core/consumer-retirement-matrix-isa-113.md`. Siguiente: ISA-114.

2026-08-01, ISA-112: la composición productiva inyecta `EngineerService` en
`TelemetryCoreRuntime`. Estado de fuente, observaciones y hechos siguen
contratos separados; live no conecta sin datos usables y stale/error/stop
desconectan. Los errores Engineer no interrumpen LMU ni Overlay. El fixture
real LMU 1.4 de 38 coches atraviesa ese runtime con una apertura de `LMU_Data`
y no produce falsos Spotter ante tráfico lejano. ISA-113 encontró otra apertura
legacy en el shell, fuera del runtime Engineer. El solape audible real queda en
el gate manual final. Documento:
`docs/telemetry-core/engineer-cutover-isa-112.md`. Siguiente: ISA-113.

2026-08-01, ISA-111: `EngineerService` ya no construye fuentes. Solo consume
snapshot/hechos canónicos; ejecuta seis familias aprobadas de forma aislada,
resetea por límites y reporta desconectado hasta evidencia real. Suite global
serial y build frontend pasan; race no está disponible con CGO desactivado.
Documento: `docs/telemetry-core/engineer-runtime-separation-isa-111.md`.
Siguiente: ISA-112.

2026-08-01, ISA-110: el replay enumera Spotter + 20 monitores y falla cerrado
para cualquier familia o señal no aprobada. Seis escenarios atraviesan la
proyección canónica y reproducen geometría/transiciones observables; el bridge
solo acepta fresh+supported y no está conectado a producción. Documento:
`docs/telemetry-core/engineer-replay-parity-isa-110.md`. Siguiente: ISA-111.

2026-08-01, ISA-130: posición mundo, velocidad local y orientación se admiten
por vehículo desde el único reader LMU hasta Reducer. La fixture real LMU 1.3
`959c5142…e5ff` demuestra 44/44 filas, matriz right-handed y el signo local
mediante un oráculo independiente. Cero permanece presente; NaN/Inf y matriz
degenerada quedan invalid por campo; la caducidad vuelve stale toda la
geometría. El sanitizador zero-rebuild conserva ya esos spans para una futura
captura 1.4. No se activa Spotter y las fixtures 1.4 anteriores a cero no se
presentan como prueba espacial. Siguiente corte: ISA-109.

Gates finales ISA-130: Telemetry Core x10, focal x20, suite Go global, build
frontend y dos fuzzers pasan. Parse de 44 vehículos: 49,3–53,7 µs/op;
sanitización diagnóstica: 164,5–201,2 µs/op. Vet focal conserva solo dos avisos
Win32 heredados de `unsafe.Pointer`. No hay wiring Spotter ni promoción.

2026-08-01, ISA-129 D9: el harness D8 y el trace Delta real se conservan sin
repetir las vueltas. Cuatro frames LMU 1.4 zero-rebuild cierran una secuencia
`InPit=false -> true -> false` dentro de la misma sesión, sin ampliar el
booleano a etiquetas de garaje/box/pit lane, y la reconexión después
de ausencia completa de proceso/mapping. Los hashes y sidecars se reproducen
x20; la desconexión no contiene payload y el reconnect abre una sesión/epoch
nueva sin aceptar un grid vacío. Los cuatro benchmarks, Telemetry Core,
frontend 297/2.020, build, lint focal y `diff --check` pasan. `-race` sigue no
disponible con CGO desactivado. Mi suite Go global final pasa; la review
independiente reprodujo el P3 Windows heredado ISA-118 de
`app-settings.json.tmp` en global, serial y focal. Está fuera del diff y no se
corrige en ISA-129. Lint global y seis warnings Win32 siguen fuera del área
focal y reproducidos en la base exacta. La review independiente final cerró
`APPROVE`, P0/P1/P2/P3 abiertos = 0, después de endurecer los JSON de evidencia,
forzar el tracking de los cuatro binarios y resolver el ledger sin duplicarlo.
Pendientes solo commit D9, push, PR draft, Linear y ledger global; no hay merge
ni promoción.

2026-07-31, ISA-129 D7 aceptado: contrato Overlay v1 aditivo con dos
goldens y matriz de compatibilidad completa. El decoder normaliza ausencias y
rechaza campos conocidos inválidos; el adapter conserva calidad y no inventa
datos. La matriz 18/18 queda en 2 exactos, 10 parciales, 5 no comparables y 1
externo. El cambio legítimo del payload actualizó el hash del replay canónico y
la expectativa del harness; las suites amplias pasan. Review final `APPROVE`,
P0/P1/P2/P3 = 0. Siguiente acción exacta: D8, sin wiring productivo, PR, merge
ni promoción en este punto.

2026-07-31, ISA-129 D6 aceptado: remaining, gaps relativos y self-delta se
derivan exclusivamente de observaciones canónicas demostradas. La sesión LMU
real queda preservada como fixture sanitizada de 1.846 muestras a 10 Hz, tres
wraps y dos vueltas comparables, con SHA-256
`d8f01beee1380d771e5e29de5dfa9e5de72517e1bf447bc14881ee44df7fe938`.
El test compara contra un oráculo independiente por distancia, fija 100 ms de
incertidumbre y exige una diferencia superior. Focales x20, dos fuzzers de
10 s, Telemetry Core, vet focal, benchmarks y `diff --check` PASS. Review final
`APPROVE`, P0/P1/P2/P3 = 0. Sin proyección Overlay, wiring productivo, PR,
merge ni promoción. Siguiente: D7.

2026-07-31, ISA-129 D5 aceptado: mapper síncrono fuera de cada driver, 44 identidades
estables en la fixture real, sesión/epoch/generaciones atómicos y campos
canónicos completos sin derivaciones. Focal x20, Telemetry Core y suite Go
global serial PASS. Review independiente final `APPROVE`, P0/P1/P2/P3 = 0.
`go test -race` no es ejecutable en este entorno porque Go informa
`-race requires cgo` y `CGO_ENABLED=0`; no se cambió el toolchain para ocultar
el gate. Sin wiring productivo, PR, merge ni promoción.

2026-07-31, ISA-129 D4B: cuatro evidencias LMU 1.4 reales y sanitizadas fijadas
por SHA-256. Pista: práctica, 38 vehículos y jugador; REST live correlacionado.
Los sentinels negativos finitos de lap distance y gaps son `missing`, nunca
cero. La revisión adversarial añadió correlación de circuito mediante digest
privado en memoria y recapturó el par final. Driver y CLI x20, Telemetry Core,
lector opt-in y auditoría de privacidad PASS. La suite Go global reprodujo solo
la contención Windows heredada de `app-settings.json.tmp`; el focal aislado
pasó al repetir y la suite global serial quedó verde. Siguiente: D5. Sin PR,
merge, wiring productivo ni promoción.
