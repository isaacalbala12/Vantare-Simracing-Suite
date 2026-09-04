# ISA-894 · R7b: retirada del legacy frontend de telemetría V1 (microplan ejecutable)

Fecha: 2026-09-04. Issue: #894 (`roadmap:required`, ya declarada en la issue).
Rama única: `vantareapp/isa-894-retirada-v1-r7b`.
Worktree único y writer único: `C:\tmp\vantare-v1-retirada-r7b\vantare-v2`.
Base exacta: `5198e4cd5a007893faedd89151168ae26bf7e951` (R7a final).
Maestro: `docs/superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md`.
Predecesores: R7a final comprometido en esta misma línea
(`7ee3f87b` código/contratos + `5198e4cd` checkpoint documental);
PR draft de referencia R6b: #977 (R7b se apilará sobre él cuando exista su PR).

Estado de este documento: **solo plan**. No cambia código, no cambia entrega
pública y por tanto **no toca `plan.md` ni `roadmap.json` en este commit**:
el mero microplan no modifica el roadmap público (verificado en lectura
obligatoria: `plan.md` es fuente manual del relato público y este commit solo
añade un plan + bloque de handoff). `plan.md`+digest se actualizarán en el
mismo PR que entregue código R7b, si ese PR cambia entrega pública.

## Invariantes que todo subcorte respeta

- Rollback exclusivo por **build anterior verificada en R0**. El binario nuevo
  no incluye V1 como plan B: sin switches de retorno ni shadow de compatibilidad.
- `Strategy` / `Engineer` / `Analysis` v1 son **contratos independientes vivos**;
  no forman parte de esta retirada.
- **Go / proyección tipada es la autoridad** de dominio. No crear snapshot
  genérico ni otra autoridad browser. Sin datos sintéticos, sin `Date.now` del
  frontend como autoridad temporal.
- No inventar datos ni renderer. No afirmar runtime no verificado.
- Commits pequeños en **UNA sola rama R7b** y **un único draft PR apilado sobre
  #977**. No múltiples PRs, no merge, no promoción, no release, no apps/LMU/
  navegadores, no `.env*`.

## Orden de ejecución (secuencial, un writer)

```text
A paridad de historias V2 (prerrequisito, sin borrar nada legacy)
  → B contratos/transporte/shadow/harness V1 (RED de ausencia)
  → C fixtures V2 puros + migración de previews al mismo Host
  → D Host/definitions/viewmodels por lotes
  → E auxiliares y borrado final
  → F ausencia/bundle/gates/docs y cierre
```

Ningún borrado de `TelemetrySnapshot`/derived antes de que A esté verde.
Ningún borrado de `damage-reader`/builders legacy antes de que el subcorte C/D
correspondiente documente qué se conserva y qué diferencias son intencionales.

---

## A · Prerrequisito de paridad: historias V2 sin sintéticos (hecho 2)

### A1 · Controles: timestamps reales + speed/rpm/gear por muestra, historia 120, resets canónicos

- Objetivo: V2 conserva, sin sintéticos, la información visible de controles
  que hoy solo existe en el camino legacy: timestamps reales y
  speed/rpm/gear por muestra, historia acotada 120 y resets canónicos.
- Archivos permitidos/esperados: proyección Go que emita la historia de
  controles + tipos generados (solo vía `task telemetry:contract`), builder V2
  y view-model V2 de controles, tests focales. Prohibido: tocar legacy,
  crear snapshot genérico, usar `Date.now` del frontend como autoridad.
- Test RED previo: test V2 que exige historia de controles con timestamps
  reales monótonos, campos speed/rpm/gear por muestra, tope 120 y resets
  canónicos; falla mientras falte cualquier pieza.
- Aceptación (máx. 3):
  1. Historia acotada 120 con timestamps reales y resets canónicos, sin sintéticos.
  2. Ninguna otra autoridad browser creada; Go/proyección tipada sigue siendo autoridad.
  3. Tests focales + `go test` del paquete afectado en verde.
- Checks: focales RED→GREEN, `task telemetry:contract:check` si cambia contrato,
  `pnpm --dir frontend test` focal, `go test` paquete afectado.
- Reviewer: spec (contrato/autoridad) + quality en el PR apilado.
- Rollback/stop: revert del micro-commit. **STOP historias**: si la historia
  canónica no existe en Go o exige nueva autoridad browser/snapshot genérico/
  `Date.now` frontend → parar y pedir ADR/decision; no borrar legacy.

### A2 · Fuel: serie real por vuelta acotada 64, requiredFuel derivable desde Go

- Objetivo: V2 conserva la serie real de fuel por vuelta (tope 64) y
  `requiredFuel` derivable desde autoridad Go, sin sintéticos.
- Archivos: proyección Go de fuel + tipos generados (solo vía task),
  builder/view-model V2 de fuel, tests focales. Prohibido lo mismo que A1.
- Test RED previo: test V2 que exige serie real por vuelta acotada 64 y
  `requiredFuel` derivable desde Go; falla sin ello.
- Aceptación:
  1. Serie real por vuelta, tope 64, sin sintéticos.
  2. `requiredFuel` derivable desde autoridad Go.
  3. Focales en verde, sin nueva autoridad browser.
- Checks/reviewer/rollback: como A1.
- Stop: como STOP historias de A1.

### A3 · Delta: proyectar historia canónica Go con timestamps reales; regresión conservada, sin pruebas automáticas de vueltas

- Objetivo: delta proyecta la historia canónica **ya existente en Go** con
  timestamps reales, sin singleton ni `Date.now` del frontend. Delta sigue
  excluido de pruebas automáticas de vueltas, pero su regresión se conserva.
- Archivos: view-model/builder V2 de delta, tests de regresión migrados a V2.
  Prohibido: singleton temporal frontend, pruebas automáticas de vueltas del
  jugador, snapshot genérico.
- Test RED previo: test de regresión V2 que exige proyección de la historia
  canónica Go con timestamps reales; falla con singleton/`Date.now`.
- Aceptación:
  1. Delta V2 proyecta historia canónica Go con timestamps reales.
  2. Regresión conservada en builders V2; sin pruebas automáticas de vueltas.
  3. Sin singleton ni autoridad temporal frontend.
- Checks/reviewer/rollback: como A1.
- Stop: como STOP historias de A1.

---

## B · RED de ausencia y retirada de contratos/transporte/shadow/harness V1 (hecho 1)

### B1 · Guardias RED de ausencia V1 frontend

- Objetivo: fijar guardias estructurales que fallan mientras exista V1
  productivo en frontend (nombres auditados: `overlay-projection-v1`,
  `adapter`/`observer`/`projection-telemetry-adapter`, shadow
  runtime/comparator/sanitizer, harnesses/scripts/HTML, `ProductID` overlay,
  eventos/allowlist/counters V1). Preservan `Strategy`/`Engineer`/`Analysis` v1.
- Archivos permitidos/esperados: tests de guardia nuevos + evidencia; ningún
  borrado todavía.
- Test RED previo: **este subcorte ES el RED** — los guardias fallan en rojo
  citando restos V1; el worker fija en el test las rutas exactas encontradas.
- Aceptación:
  1. Guardia rojo reproducible que cita cada resto productivo V1.
  2. `Strategy`/`Engineer`/`Analysis` v1 explícitamente exentos y en verde.
  3. Cero cambios productivos en este commit.
- Checks: `pnpm --dir frontend test` focal del guardia (rojo esperado),
  `git diff --check`.
- Reviewer: spec.
- Rollback/stop: revert del commit. Stop si un resto citado resulta ser
  consumidor necesario sin migrar → reclasificar a C/D, no borrar.

### B2 · Retirar proyección/adapter/observer/transporte V1 + eventos/allowlist/counters

- Objetivo: poner en verde el guardia retirando lo citado en B1, con contratos
  explícitos de ausencia.
- Archivos: `overlay/projection/overlay-projection-v1*`,
  `overlay-projection-adapter*`, `transports/projection-telemetry-adapter*`,
  `transports/projection-observer*`, eventos/allowlist/counters exclusivos V1,
  `ProductID` overlay, y sus tests exclusivos. Prohibido tocar V2/host/fixtures
  de otros subcortes en el mismo commit.
- Test RED previo: guardia B1 en rojo.
- Aceptación:
  1. Guardia B1 en verde; cero referencias productivas a lo retirado.
  2. Contratos explícitos de ausencia donde había tipos/eventos V1.
  3. Focales + typecheck del área en verde.
- Checks: focales, `pnpm --dir frontend typecheck` (o el typecheck real vigente),
  `rg` de ausencia del lote.
- Reviewer: spec + quality en el PR.
- Rollback/stop: revert del micro-commit (rollback real = build anterior R0).
  Stop si aparece caller productivo no inventariado → parar el lote.

### B3 · Retirar shadow V1 (runtime/comparator/sanitizer) + harnesses/scripts/HTML

- Objetivo: retirar el shadow de compatibilidad V1 y sus harnesses/scripts/HTML,
  que no vuelven como plan B.
- Archivos: `overlay/telemetry-shadow/*` exclusivo V1,
  `telemetry-cutover-runtime-harness`, `telemetry-overlay-shadow-harness`,
  scripts/HTML de harness V1, y sus tests exclusivos.
- Test RED previo: guardia B1 (parte shadow/harness) en rojo.
- Aceptación:
  1. Shadow/harness V1 ausentes del bundle y del árbol productivo.
  2. Guardia correspondiente en verde.
  3. Tests semánticos útiles migrados a frontera V2 o citados como evidencia
     histórica (no debilitados).
- Checks: focales, build frontend del área o completa según alcance, `rg` ausencia.
- Reviewer: quality.
- Rollback/stop: revert del micro-commit. Stop si un harness es la única
  cobertura de una garantía V2 → migrar cobertura primero.

---

## C · Daño documentado + fixtures V2 puros (hechos 3 y 4, primera mitad)

### C1 · Daño: repoint de definitions a V2; borrar damage-reader y builders legacy

- Objetivo: re-apuntar definitions de daño a V2 y borrar `damage-reader` y
  builders legacy, documentando que los tyres fraccionales no eran producidos
  productivamente; conservar `wheelDetachedCount`, calidad V2 y diferencias
  intencionales.
- Archivos: definitions de `car-damage-*`, view-models/builders legacy de daño,
  damage-reader, tests. Prohibido: inventar datos, crear renderer.
- Test RED previo: test que exige definitions resolviendo a V2 y ausencia de
  damage-reader/builders legacy; falla antes del repoint/borrado.
- Aceptación:
  1. Definitions a V2; damage-reader y builders legacy ausentes.
  2. Evidencia documenta: tyres fraccionales no producidos productivamente;
     `wheelDetachedCount`, calidad V2 y diferencias intencionales conservados.
  3. Focales en verde sin datos inventados.
- Checks: focales, `rg` ausencia damage-reader, typecheck del área.
- Reviewer: spec (verifica no-invención) + quality.
- Rollback/stop: revert. **STOP daño**: si algún consumidor necesita un campo
  legacy realmente producido y V2 no lo conserva → parar, no inventar el dato;
  pedir decisión.

### C2 · Fixture V2 puro + migración de previews al mismo WidgetVisualHost

- Objetivo: crear fixture V2 puro (no wrapper de snapshot) y migrar al mismo
  `WidgetVisualHost`: HomeMiniStage, ProfilePreview, UI Orbit, Workshop,
  Parity, StudioHarness y sus tests. Preservar InPlaceEdit/Studio real ya V2.
- Archivos: nuevo fixture V2, consumidores citados y sus tests. Prohibido:
  wrapper sobre snapshot legacy, tocar Host/definitions de D en este commit.
- Test RED previo: test que renderiza cada preview contra fixture V2 puro;
  falla con wrapper snapshot o con Host legacy.
- Aceptación:
  1. Fixture V2 puro sin wrapper snapshot; previews citadas en el mismo Host.
  2. InPlaceEdit/Studio real ya V2 preservados.
  3. Tests migrados en verde.
- Checks: focales, typecheck del área.
- Reviewer: quality.
- Rollback/stop: revert. Stop si una preview pierde información visible sin
  equivalente V2 → volver a A (paridad) antes de migrarla.

---

## D · Host endurecido + definitions/viewmodels por lotes (hechos 4 segunda mitad, 5 y 6 parcial)

### D1 · Endurecer WidgetVisualHost (quitar snapshot/harness legacy/hack input)

- Objetivo: quitar del Host la prop snapshot, la rama harness legacy y el hack
  del acumulador de input; exigir `frame`/`source` para los 18 V2 y auxiliar
  explícito para Calendar/Engineer.
- Archivos: `overlay/core/WidgetVisualHost.tsx` y sus tests. Prohibido mezclar
  con borrado de definitions en el mismo commit.
- Test RED previo: test que exige Host sin prop snapshot/rama legacy/hack y
  con `frame`/`source` obligatorios (auxiliar solo Calendar/Engineer); falla antes.
- Aceptación:
  1. Sin prop snapshot, sin rama harness legacy, sin hack de input.
  2. `frame`/`source` exigidos para los 18 V2; auxiliar solo Calendar/Engineer.
  3. Tests del Host en verde.
- Checks: focales, typecheck, lint del archivo.
- Reviewer: spec + quality.
- Rollback/stop: revert. Stop si un consumidor productivo no puede entregar
  `frame`/`source` → migrar ese consumidor primero (C2), no reabrir la prop.

### D2–D4 · Retirar buildViewModel legacy de 20 definitions + viewmodels/tests redundantes, por lotes

- Objetivo: retirar `buildViewModel` legacy de las 20 definitions y los
  viewmodels/tests redundantes, migrando tests semánticos a builders V2.
  Por lotes pequeños (p. ej. ~7+7+6); cada lote es un commit.
- Archivos por lote: lote de definitions + sus view-model legacy + tests
  redundantes; builders V2 destino. Conservar `race-schedule` (Calendar) y
  `engineer-radio` auxiliares. Prohibido mezclar lotes o incluir E/F.
- Test RED previo (por lote): test que exige ausencia de `buildViewModel`
  legacy en el lote y cobertura semántica en builders V2; falla antes.
- Aceptación (por lote):
  1. Lote sin `buildViewModel` legacy ni viewmodels/tests redundantes.
  2. Tests semánticos migrados a builders V2 (no debilitados).
  3. `race-schedule` y `engineer-radio` auxiliares conservados.
- Checks: focales del lote, typecheck, `rg` ausencia del lote.
- Reviewer: quality (spec solo si cambia contrato visible).
- Rollback/stop: revert del lote. Stop si un test semántico no tiene
  equivalente V2 → parar el lote y reclasificar a paridad (A).

---

## E · Auxiliares, switch diagnóstico y borrado final (hechos 6 resto, 7 y 8)

### E1 · Retirar telemetry-snapshot, telemetry-adapter, derived store, input accumulator, mocks y preview fixtures

- Objetivo: retirar `telemetry-snapshot`, `telemetry-adapter`, derived store,
  acumulador de input, mock scenarios y widget preview fixtures legacy, con
  tests semánticos ya migrados a builders V2 (D).
- Archivos: módulos citados + tests. Conservar `race-schedule` Calendar y
  `engineer-radio` auxiliares.
- Test RED previo: guardia de ausencia del lote; falla mientras exista.
- Aceptación:
  1. Módulos citados ausentes del árbol productivo y del bundle.
  2. Cobertura semántica vive en builders V2.
  3. Auxiliares Calendar/Engineer intactos.
- Checks: focales, typecheck, build, `rg` ausencia, revisión de bundle (F).
- Reviewer: quality.
- Rollback/stop: revert. Stop si algo citado sigue importado por un preview
  no migrado → volver a C2.

### E2 · Switch diagnóstico overlay-v2-features: retirar si no tiene función V2 independiente

- Objetivo: retirar el switch diagnóstico de rollback `overlay-v2-features` y
  sus suscripciones si no tienen función V2 independiente. Rollback aprobado
  es el binario anterior, no un switch.
- Archivos: switch, suscripciones y tests asociados. Si una parte del catálogo
  es necesaria para demand/capabilities, simplificarla **sin switch de retorno**.
- Test RED previo: test que exige ausencia del switch / o test que fija la
  función V2 independiente mínima si existe.
- Aceptación:
  1. Switch de retorno ausente; sin camino de vuelta dentro del binario.
  2. Si hubo función necesaria, simplificada sin switch.
  3. Focales en verde.
- Checks: focales, `rg` ausencia del switch, typecheck.
- Reviewer: spec + quality.
- Rollback/stop: revert. **STOP switch**: si la retirada del switch exige
  cambiar capabilities/demand o arquitectura → parar y fijar stop condition
  con ADR; no reintroducir switch de retorno.

### E3 · Borrar testdata Go overlay V1 huérfano + package scripts/harnesses, limpiar bundle

- Objetivo: borrar el `testdata` Go de overlay V1 quedado huérfano en R7a,
  packages de scripts/harnesses restantes y limpiar el bundle.
- Archivos: `internal/telemetry/projection/overlay/testdata/` huérfano,
  packages scripts/harness restantes, config de bundle si aplica.
- Test RED previo: guardia que exige cero referencias productivas al testdata
  y a los packages; falla si algo los importa.
- Aceptación:
  1. Testdata huérfano y packages citados borrados.
  2. Cero imports productivos restantes.
  3. Bundle sin legacy (verificado en F).
- Checks: `go test` paquetes afectados, focales frontend, `rg` ausencia.
- Reviewer: quality.
- Rollback/stop: revert. Stop si algún test/harness R7b aún los importa →
  completar C/D/E1 primero.

---

## F · Ausencia/bundle/gates/docs y cierre (hecho 9)

### F1 · Verificación final de ausencia, bundle y gates completos

- Objetivo: demostrar binario sin V1 y gates completos sobre el SHA final.
- Archivos: ninguno productivo (solo evidencia en `docs/telemetry-core/evidence/isa-894/`).
- Test RED previo: n/a (este subcorte ejecuta los gates, no cambia código).
- Aceptación:
  1. `rg`/guardias de ausencia: cero referencias productivas/bundling legacy.
  2. Gates completos en verde sobre el SHA final (ver Checks finales).
  3. Dos reviews frescas con P0/P1/P2=0.
- Checks: ver Checks finales obligatorios.
- Reviewer: dos reviewers independientes (spec + quality).
- Rollback/stop: n/a (sin cambio). Si un gate falla por causa no entendida →
  stop general y no se abre PR.

### F2 · Cierre docs/evidence/handoff/issue + plan.md y roadmap en el mismo PR si cambia entrega pública

- Objetivo: cerrar evidencia, handoff, issue y —**solo si el PR cambia entrega
  pública**— `plan.md` + `roadmap.json` regenerado (nunca editado a mano) en
  el mismo PR.
- Archivos: evidencia, handoff vivo, `plan.md` (condicional), `roadmap.json`
  (solo vía script). Este microplan documental no los toca.
- Aceptación:
  1. Evidencia literal con inventario borrado/preservado, TDD rojo/verde, gates.
  2. Handoff e issue reflejan estado real (rama/SHA/PR/CI, sin afirmar merge).
  3. Si cambia entrega pública: `plan.md` actualizado + digest regenerado con
     `--check` verde en el mismo PR.
- Checks: `roadmap_digest.py` + `--check`, `git diff --check`.
- Reviewer: orquestador.
- Rollback/stop: revert documental. Stop si la issue/base/SHA no coinciden.

---

## Checks finales obligatorios (sobre el SHA final R7b, antes de abrir el draft PR)

- Focales RED→GREEN de cada subcorte + contrato generado
  (`task telemetry:contract` y `task telemetry:contract:check` si aplica).
- `pnpm --dir frontend test`, `pnpm --dir frontend typecheck`
  (es decir `tsc -b --noEmit`; nunca `tsc -p tsconfig.json`),
  `pnpm --dir frontend build`, `pnpm --dir frontend lint`.
- `gofmt` en Go tocado; `go test ./... -count=1`; `go vet ./...`
  (separar deuda heredada —tres `unsafe.Pointer` fuera del diff— de regresiones).
- Roadmap digest + check (solo si el PR toca entrega pública):
  `python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly`
  y la misma orden con `--check`.
- `rg`/guardias/bundle de ausencia: cero V1 productivo en árbol y bundle.
- Dos reviews frescas (spec + quality) con P0/P1/P2=0 sobre el SHA final.
- Checks no ejecutados y motivo, si los hay.

## Stops específicos (además de los generales de AGENTS.md)

- **Historias (A)**: sin historia canónica en Go, o necesidad de snapshot
  genérico / autoridad browser / `Date.now` frontend → parar, pedir ADR.
- **Daño (C1)**: campo legacy realmente producido sin equivalente V2 →
  parar, no inventar el dato.
- **Feature switch (E2)**: retirar el switch exige cambiar capabilities/demand
  o arquitectura → parar, fijar stop condition con ADR, no reintroducir switch.

## Entrega

Commits pequeños, staging limitado a rutas, en la rama única R7b; **un único
draft PR apilado sobre #977** hacia `nightly`; sin merge, promoción, release
ni anuncio. Terminado en rama, integrado, promocionado y publicado son estados
distintos: el reporte final identifica rama, base, HEAD, commit, push, PR, CI
y nivel realmente alcanzado, sin afirmar datos ni runtime no verificados.
