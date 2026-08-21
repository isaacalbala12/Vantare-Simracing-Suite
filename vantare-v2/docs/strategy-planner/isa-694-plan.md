# Plan técnico ISA-694 — Strategy Planner definitivo (corte A+B)

Fecha: 2026-08-21 (rev. 2 tras review adversarial Codex `gpt-5.6-sol` high)
Fase SDD: **PLAN** (el spec aprobado es `isa-694-spec.md`; los TASKS se
derivan de este plan como issues de GitHub).
Estado: hallazgos de la review incorporados; pendiente de verificación delta y
gate de Isaac. No autoriza implementación.

## 1. Principios de ejecución

1. **Custodia antes que ambición.** Cada fase deja un producto coherente y
   entregable a nightly aunque la siguiente se retrase.
2. **Datos antes que código.** Ninguna derivación se implementa sin haberse
   demostrado sobre el corpus real en F0; ningún contrato se congela antes.
3. **Incremental con paridad.** Cada extensión del solver se valida contra
   enumeración exhaustiva en tamaños pequeños que cubre **exactamente el mismo
   espacio de decisión**, antes de confiar en podas.
4. **Un worker, una issue, un worktree.** Sin paralelismo sobre la misma rama.
   Claude planifica, orquesta y revisa; review técnica con Codex `gpt-5.6-sol`
   high; checks sencillos con Codex `gpt-5.6-terra` high; grueso con
   `muse-spark-1.2-contributor` vía T3 Code (D17).
5. **Documento vivo.** Si un descubrimiento invalida una asunción A1–A6, se
   actualiza spec y plan antes de seguir implementando.
6. **Ningún checkpoint acepta suites rojas.** Los defectos actuales se
   documentan con tests de caracterización **verdes** que demuestran el
   comportamiento defectuoso observable; cada test se invierte en la misma
   issue/PR que corrige su defecto (F2).

## 2. Mapa de componentes y dependencias

```text
                    ┌──────────── F0 spike (corpus real) ────────────┐
                    ▼                                                ▼
     F1 contratos + ADR 0009 + caracterizaciones           umbrales backtest
          │                          │
   ┌──────┴───────┐                  │
   ▼              ▼                  │
F2 custodia   F3a derivaciones       │   (solo F3a es paralelizable con F2:
(Strategy +    puras (Analysis)      │    derivación pura sobre Analysis;
 Orbit +           │                 │    F3b/F3c dependen de Core y de F2a)
 migración)        │                 │
   │          F3b forecast Core      │
   │          F3c captura Strategy ◄─┼── (F3c depende de F2a: repositorio/API)
   │               │                 │
   └──────┬────────┘                 │
          ▼                          │
    F4 motor ampliado ◄──────────────┘
          │
    F5 producto asistido (Orbit) ◄── consumidor único de catálogo
          │                          (envelope+fixture firmado desde F1)
    F6 pipeline editorial ─────────► usa el mismo builder/formato de F1
          │
    F7a gate release-candidate (#1–#9) ── GO de Isaac ──► F7b campaña testers
```

Módulos afectados por fase:

| Fase | Go | Frontend | Otro |
|---|---|---|---|
| F0 | scripts de spike (fuera de producto) | inventario localStorage | corpus DuckDB de Isaac, REST LMU vivo |
| F1 | contratos en su owner correcto (ver F1.2), ADR 0009 | tests de caracterización Orbit | specs de contratos, fixture de catálogo firmado |
| F2 | `internal/strategy/{contract,application,repository}`, bindings Wails | `strategy-orbit/*` | migración localStorage |
| F3a | `internal/telemetryanalysis/*` (derivación) | — | fixtures reales en `testdata/` |
| F3b | `internal/telemetry/drivers/lmu` (REST forecast), señal en Core | — | — |
| F3c | comando/repositorio `WeatherScenario` en Strategy | — | — |
| F4 | `internal/strategy/{solver,manual,backtest}` | — | corpus holdout |
| F5 | read models / API de aplicación | `strategy-orbit/*` UI asistida, overlay clima | catálogo fixture |
| F6 | `cmd/vantare-curator`, exportador | export UI + cola de subida | Worker Cloudflare, tarea programada PC Isaac |
| F7 | endurecimiento transversal | ídem | campaña, evidencia Wails/LMU |

## 3. Fases en detalle

### F0 — Spike empírico sobre corpus real

**Objetivo:** validar A1–A6 con los DuckDB de Isaac y fijar los umbrales y el
protocolo de backtest. Incluye los prerrequisitos estructurales que las once
derivaciones necesitan, no solo los canales.

Trabajo (2 issues, worker Codex `gpt-5.6-sol` high; scripts desechables en
`docs/strategy-planner/evidence/isa-694-spike/`):

**Issue F0-1 — telemetría:**

1. Inventario del corpus: sesiones, combos, tipos, metadata disponible (A3).
   Isaac etiqueta a mano una muestra de sesiones (qué carrera/práctica/combo
   son realmente) como **ground truth**; la clasificación automática de F3a se
   acepta solo si coincide con ese etiquetado en la tasa fijada aquí.
2. Calidad de **todos** los canales de A1: `Tyres Wear`, `Fuel Level`,
   `Virtual Energy`, mezcla, `Path Wetness`, `CloudDarkness`, temperaturas,
   presiones y compuesto.
3. **Prerrequisitos estructurales:** alineación temporal entre canales
   continuos y eventos (el modelo actual declara `TimeOriginUnknown` para
   continuos), segmentación fiable de vueltas (`HistoricalSession.Laps` hoy no
   se rellena — `internal/telemetryanalysis/historical.go`), identidad de
   stint y piloto, localización por vuelta/esquina. Sin esto no hay pit loss,
   estrategia observada ni degradación por esquina: veredicto explícito.
4. Separabilidad peso-fuel vs edad-neumático entre stints; si no separa,
   medir la curva combinada y documentar la pérdida de identificabilidad.
5. Pit events: desglose tránsito/servicio/ritmo de repostaje y recarga VE (A4).
6. Curva coste-del-ahorro desde datos de mezcla si existen (A5).
7. Estimación de tamaño de bundle derivado (A6).

**Issue F0-2 — forecast y backtest:**

8. REST local: descubrir el endpoint de forecast (el cliente actual solo
   consulta standings/sessionInfo); captura en práctica real con Isaac.
   **A2 solo pasa con una pareja práctica→carrera real; si no existe, queda
   `UNRESOLVED` y bloquea el contrato de forecast**, no el resto del corte.
9. Protocolo de backtest prerregistrado: N mínimo, split por combinación y
   fecha (sin leakage), métricas de calibración, agregación e intervalos;
   backtest manual de al menos una carrera → propuesta de umbrales.
10. Inventario y matriz campo-a-campo del `localStorage` Orbit real
    (`strategy-events-store.ts` tiene dos claves, descarta entradas inválidas
    y aplica defaults silenciosos de 90 L / 60 s): corpus golden de todas las
    shapes legacy para la migración de F2.

**Checkpoint:** informe en `evidence/` con veredicto por asunción
(válida / degradada / inválida / unresolved) + fixtures sanitizadas elegidas
para `testdata/` + umbrales y protocolo de backtest + matriz de migración.
Lo reviso yo; Isaac decide umbrales y degradaciones de alcance.

**Estado (2026-08-21):** F0-1 (#701) **completada** — informe en
`evidence/isa-694-spike/informe-f0-1.md`; veredictos A1 DEGRADED, A3 VALID
(spot-check 8/8 de Isaac), A4 INVALID→rama degradada, A5 INVALID→manual+A/B,
A6 VALID; degradaciones aceptadas por Isaac como D19. F0-2 (#702)
**parcial**: endpoint de forecast descubierto y verificado en vivo
(`/rest/sessions/weather`, PRACTICE/QUALIFY/RACE × 5 nodos; el forecast de
RACE es visible desde la práctica); pendientes la pareja práctica→carrera
(A2) y el protocolo de backtest con umbrales.

### F1 — Contratos en su owner, ADR 0009, caracterizaciones

**Objetivo:** congelar **todas** las superficies que F2–F6 consumirán, cada
una bajo su propietario correcto, para que ninguna fase posterior rehaga
contratos.

Trabajo (4 issues tras F0):

1. **ADR 0009** (yo redacto, Codex sol revisa como threat model): pipeline
   editorial (predigestión determinista, LLM cura/redacta, Isaac decide),
   modelo de consentimiento de subida según D18 (decisión de Isaac sobre el
   contrato de producto), seguridad del Worker (idempotencia/replay,
   validación estricta de schema, cuotas, dedupe, retención y borrado,
   redacción de logs, abuso de storage), catálogo firmado (envelope con
   `keyId`, rotación y revocación, expiración, versión monotónica, protección
   rollback/freeze, bytes canónicos, política ante firma válida con schema
   incompatible, runbook de compromiso de clave), custodia de la clave,
   ownership del forecast (Core produce la señal; Strategy persiste
   `WeatherScenario` al capturar), y perfiles de piloto.
2. **Contratos de Analysis** (worker muse-spark): `StrategyInputProjection v2`
   y `ObservedStrategy v1` viven en un **paquete público propiedad de
   Telemetry Analysis** (Analysis no importa dominio privado de Strategy;
   Strategy solo consume). Incluye la **matriz v1→v2** (productores,
   consumidores, compatibilidad, retirada y fixtures old/new contra el
   contrato v1 existente) y el **contrato de segmentos temporales** exigido
   por F0-1: `ContinuousSegment`, `LapBoundary` (con fuente y calidad),
   `StintBoundary` (con causa y confianza) y `TrackLocation` por distancia
   normalizada — sin comprimir huecos en silencio. Las familias reflejan las
   degradaciones D19 (curva combinada, pit degradado, ahorro manual).
3. **Contratos de Strategy** (worker muse-spark): documento Strategy v2 (lo
   que Orbit necesita: evento, pilotos, variantes, inventario por evento —
   diseñado con la matriz de migración de F0), **vector de decisión e I/O del
   solver** (paradas en vueltas arbitrarias, cantidades Fuel/VE por servicio,
   compuesto, piloto, nivel de ahorro por stint; modelo de coste de pit
   dependiente de servicios; formación; reglas de evento y ventanas;
   presupuesto p95 de cómputo), comando de captura `WeatherScenario v1`,
   `StrategyWeatherReadModel v1` para el overlay (Overlays jamás lee Core,
   REST ni repositorios directamente), `PilotProfile v1`, `CurationBundle v1`
   y `Catalog v1` con su envelope de firma + **fixture de catálogo firmado**
   para que F5 tenga consumidor único y F6 use el mismo builder.
4. **Caracterizaciones verdes + freeze** (worker muse-spark): tests verdes
   que documentan los defectos actuales de Orbit (eliminación de piloto rompe
   `buildPlan`, guardado/activación silenciosos, defaults sintéticos) como
   comportamiento observable a corregir; se invierten en F2 con cada fix.
   Freeze: ninguna feature nueva sobre el store localStorage.

**Checkpoint:** ADR 0009 accepted por Isaac **con las dos ramas de D18
modeladas** (la decisión en sí no bloquea F1 ni el gate PLAN: su único punto
de bloqueo es el arranque de F6a); contratos compilan bajo su owner con
contract tests old/new; suites verdes. Review Codex sol del conjunto.

### F2 — Custodia: API de aplicación, cutover Orbit→Go, migración

**Objetivo:** una sola autoridad de persistencia y cálculo. Elimina el P0.
Entregable a nightly por sí misma.

Trabajo (6 issues secuenciadas; la (a) con Codex sol por ser dominio):

- **(a) Documento v2 + API de aplicación** implementando el contrato de F1.3
  sobre el repositorio canónico (migración de schema interna versionada —
  `repository/migration.go` hoy declara v1 sin predecesor migrable y debe
  evolucionar).
- **(b) Bindings Wails + cliente TS fino** (`strategy-orbit-bridge` pasa a
  ser el único acceso).
- **(c) Migración localStorage→canónico** conforme a la matriz de F0:
  transaccional con journal y fingerprint, dry-run con preview exacto, backup
  exportado automático, políticas de colisión de IDs y de corruptos
  parciales, distinción dato real vs default sintético legacy (90 L/60 s no
  se migran como si fueran datos del usuario), reintentos tras crash, y
  **rollback semántico definido**: restaura el backup sin destruir revisiones
  creadas después (se archivan, nunca se borran silenciosamente). El store
  viejo queda read-only tras migrar; se retira en F7 con OK de Isaac.
- **(d) Cutover de cálculo:** "Calcular" llama a manual+solver Go; retirar
  rutas productivas de `buildPlan`/`strategy-orbit-model` (queda solo shaping
  de presentación); las caracterizaciones de F1 se invierten con cada fix.
- **(e) Guardar/Activar/Exportar honestos:** revisión inmutable, activación
  de revisión exacta, export de lo visible, errores visibles.
- **(f) Limpieza de sintéticos:** fuera datos Spa y fallbacks fabricados;
  donde falte dato, `missing` con presencia/procedencia visibles.

**Checkpoint (gate de fase, candidato a nightly):** criterios #1 y #2 del
spec; suites verdes; evidencia manual Wails con la migración real del
localStorage de Isaac. Review Codex sol del diff completo.

### F3 — Derivación (a: Analysis puro; b: forecast Core; c: captura Strategy)

**F3a — derivaciones puras de Analysis** (paralelizable con F2; 5 issues,
muse-spark salvo curvas con Codex sol):

- **(a1)** Clasificación de sesiones y combos (A3).
- **(a2)** Validez y etiquetado de vueltas (out/in, pit, incidente, tráfico
  — etiqueta, no solo exclusión —, outliers; motivo por exclusión), sobre la
  segmentación de vueltas validada en F0.
- **(a3)** Consumo Fuel/VE, ritmo representativo y percentil por bucket de
  clima, con rango y confianza.
- **(a4)** Curvas: peso-fuel, degradación por compuesto/esquina (al nivel de
  identificabilidad demostrado en F0), vida útil, coste-del-ahorro.
- **(a5)** Pit loss real + `ObservedStrategy` + agregación multi-sesión +
  productor `StrategyInputProjection v2` en el paquete público de Analysis.

**F3b — forecast en Core** (1 issue, muse-spark; tras F0-2): el driver LMU
añade la consulta REST de forecast descubierta en F0 y Core la expone como
señal con presencia/freshness. **Solo si A2 quedó `VALID`**, o con una
degradación de alcance aceptada expresamente por Isaac; `UNRESOLVED` o
`INVALID` dejan F3b/F3c sin arrancar.

**F3c — captura en Strategy** (1 issue, muse-spark; depende de F2a y F3b):
comando de captura que persiste `WeatherScenario v1` en el repositorio
Strategy, según contrato F1.3.

**Checkpoint:** derivaciones reproducen resultados esperados sobre fixtures
reales de `testdata/`; integración `duckdb_integration` verde con runtime
real; guard: cero acceso de Strategy a DuckDB. Review Codex sol.

### F4 — Motor ampliado y backtesting

**Objetivo:** implementar el **vector de decisión completo congelado en F1.3**
(el spec §5 manda; nada se redefine aquí). Depende de F3a para inputs reales;
arranca contra fixtures de F0/F1.

Orden estricto, una extensión por issue, paridad exhaustiva sobre el mismo
espacio de decisión en cada una (Codex sol en solver/backtest; muse-spark en
arneses):

1. **Modelo de coste de pit dependiente de servicios:** el solver deja el
   `PitLossSeconds` escalar y pasa al desglose real (tránsito + repostaje por
   cantidad + neumáticos + solape paralelo/secuencial), reutilizando el
   modelo pit de `internal/strategy/manual`; cantidades Fuel/VE por servicio
   como variable, formación incluida.
2. Curvas de degradación no lineales (por tramos) en coste de stint.
3. Efecto peso-fuel en el tiempo por vuelta.
4. **Ahorro como variable de decisión** (D6) con su test canónico (último
   stint corto absorbido por ahorro) y el caso inverso.
5. Compuesto por stint contra inventario físico + reglas de evento y
   ventanas obligatorias del contrato F1.3.
6. Asignación de pilotos a stints (perfiles, disponibilidad, límites de
   conducción como restricciones duras).
7. Escenarios de clima: plan por escenario + recomendación robusta.
8. Evaluación esperado/caso-malo desde rangos; variantes como tolerancia al
   caso malo; presupuesto p95 de cómputo verificado.
9. **Backtesting** (`internal/strategy/backtest`, nuevo): replay contra
   carrera real según el protocolo prerregistrado de F0; gates separados de
   calibración, factibilidad y calidad de ranking (spec criterio #5).

**Checkpoint:** paridad exhaustiva verde por extensión; determinismo;
explicabilidad (restricción vinculante y sensibilidades); holdout bajo los
umbrales de F0; p95 dentro de presupuesto. Review Codex sol por extensión.

### F5 — Producto asistido en Orbit

**Objetivo:** el flujo B visible con verdad de procedencia. Pantallas
negociables, features intactas (D3).

Trabajo (5 issues, muse-spark; propuesta UX previa mía para lo negociable):

- **(a)** Selector de combinación/sesiones con agrupación automática y
  exclusiones explicadas.
- **(b)** Inputs derivados con presencia/procedencia/rango/confianza;
  overrides no destructivos.
- **(c)** Escenarios de clima en el flujo de plan; UI de captura de forecast
  (consume F3c); **overlay de clima previsto consumiendo exclusivamente
  `StrategyWeatherReadModel v1`** (issue propia en Overlays, con guard
  arquitectónico).
- **(d)** Ejemplos validados propios: backtests visibles por combinación.
- **(e)** **Consumidor único de catálogo:** fetch + verificación de firma +
  caché del envelope de F1.3, probado contra el fixture firmado; perfiles de
  referencia como arranque en frío (procedencia `reference`); importación
  inicial de DuckDB ya presentes en disco.

**Checkpoint:** flujo end-to-end con DuckDB reales en Wails (criterio #3);
visual tests actualizados; ningún dato sin presencia/procedencia. Review
Codex sol.

### F6 — Pipeline editorial

**Objetivo:** bundles → Worker → curación en PC de Isaac → catálogo GitHub,
con la seguridad del ADR 0009. **F6(a–b) puede ir en paralelo con F4/F5; F6c
depende del contrato y resultados de backtest de F4.9** (su scoring los
consume), y F6(d–f) van detrás de F6c.

Trabajo (6 issues; Worker y firma con Codex sol, resto muse-spark):

- **(a) Exportador anonimizado** (`CurationBundle v1`): sin telemetría cruda,
  sin nombres, ID de instalación opt-in; **UX de consentimiento según D18**:
  preview exacto por bundle y acción explícita, o —si Isaac modifica el
  contrato de producto— consentimiento permanente revocable con cola visible,
  historial, pausa y borrado.
- **(b) Worker Cloudflare** (`infra/curation-worker`): implementa el
  protocolo del ADR 0009 (idempotencia, validación de schema, cuotas, dedupe,
  retención, redacción de logs). **Publicarlo = gate explícito de Isaac.**
- **(c) Curador CLI** (`cmd/vantare-curator`): sincroniza bundles,
  predigestión determinista (agregación por combo, dedupe, scoring por
  backtest, clustering de estrategias observadas) → resumen compacto; el LLM
  nunca ve tablas crudas (D12).
- **(d) Generador de perfiles de referencia** (D15): agregación anonimizada
  por combinación con métricas de muestra y calidad, como entrega del
  curador.
- **(e) Ciclo editorial:** tarea programada en el PC de Isaac + análisis LLM
  del resumen + flujo de decisión simple; skills acumulables de curación.
- **(f) Publicación:** builder del catálogo firmado (el mismo formato/builder
  del fixture de F1.3) + publicación a GitHub. **Primer catálogo público =
  segundo gate explícito de Isaac.**

**Checkpoint (criterio #7):** ciclo completo en frío con bundles de prueba;
pruebas adversariales de la superficie Worker/firma según ADR 0009. Review
Codex sol de seguridad.

### F7 — Release candidate y campaña de testers

**F7a — gate release-candidate:** barrido de los criterios #1–#9 del spec;
retirada del store legacy (con OK de Isaac); checklist de evidencia Wails/LMU
reproducible; guía de onboarding de testers. Termina con **GO/NO-GO explícito
de Isaac**. Ningún tester ni bundle real antes de ese GO.

**F7b — campaña (2 semanas):** testers generan corpus y ejemplos; el ciclo
editorial corre en vivo (curación LLM + decisión de Isaac); ventana de fixes;
al cierre, decisión de promoción a `testers` — **la dispara Isaac, nunca el
plan**. Actualización final de roadmap, handoff e issues.

## 4. Riesgos y mitigaciones

| Riesgo | Prob. | Mitigación |
|---|---|---|
| A2 falla o queda UNRESOLVED | media | F0 lo fija; fallback: escenario manual; F3b/F3c no arrancan |
| Prerrequisitos estructurales (relojes, vueltas, stints) débiles | media | F0-1.3 los mide antes de contratos; degradar familias afectadas explícitamente |
| Separabilidad fuel/neumático débil | media | curva combinada por stint + claims de compuesto acotados (spec vivo) |
| Migración pierde o inventa datos | baja | matriz F0 + golden corpus + journal/fingerprint/dry-run + defaults legacy no migrados como datos + rollback semántico |
| Explosión combinatoria del solver | media | vector congelado en F1, extensiones incrementales con paridad sobre el mismo espacio, presupuesto p95 |
| Backtest optimista (leakage, N bajo) | media | protocolo prerregistrado en F0; gates de calibración/factibilidad/ranking separados |
| Superficie pública Worker/catálogo | media | ADR 0009 como threat model con pruebas adversariales; dos gates de Isaac; runbook de compromiso de clave |
| Privacidad de subidas vs contrato de producto | alta | decisión D18 explícita de Isaac antes de F6a; sin ella, preview manual por bundle |
| Calidad de workers irregular | media | issues pequeñas, aceptación precisa, review Codex sol por PR + mi revisión |
| Deriva de alcance | alta | gates SDD; hallazgos fuera de alcance → issue nueva |
| LMU cambia schema DuckDB/REST | media | contratos versionados con matriz old/new; clasificador tolerante |
| Divergencia F2∥F3a | baja | solo F3a corre en paralelo; F3c espera a F2a; contract tests de F1 |

## 5. Checkpoints de verificación (resumen)

```text
F0: veredicto A1–A6 + umbrales/protocolo backtest + matriz migración → gate Isaac
F1: ADR 0009 accepted (incl. D18) + contratos en su owner + fixture firmado → gate Isaac
F2: custodia única, migración probada                                → candidato nightly
F3: derivación reproducible + forecast/captura si A2 ok              → review Codex + yo
F4: paridad por extensión + holdout bajo umbral + p95                → review Codex + yo
F5: E2E asistido en Wails con DuckDB reales                          → candidato nightly
F6: ciclo editorial en frío + seguridad adversarial                  → gates Isaac (Worker, catálogo)
F7a: criterios #1–#9                                                 → GO/NO-GO Isaac
F7b: campaña 2 semanas                                               → decisión promoción Isaac
```

## 6. Obligaciones documentales del expediente (AGENTS)

- El PR de ISA-694 que introduce este rumbo **actualiza en el mismo PR**
  `docs/roadmap/plan.md` (hito de plan del rework — hecho en esta rama), el
  handoff de Strategy y `docs/current-plan.md`.
- La issue #694 se sincroniza: base real del worktree
  (`origin/nightly@2ab9741d`; el cuerpo declaraba `64a33318`), alcance A+B,
  decisiones D1–D18 y estado del gate PLAN, antes de derivar TASKS.

## 7. Trabajo que me reservo como orquestador

- Redactar ADR 0009 y las issues (TASKS) de cada fase.
- Propuestas UX de lo negociable en F5 antes de tocar pantallas.
- Revisión final de cada PR (diff + evidencia + coherencia con spec).
- Mantener spec/plan/handoff/roadmap vivos.

## 8. Fuera de este plan

Todo lo listado en spec §11. El corte C (live) se planificará con su propio
ciclo SDD sobre la base A+B, rescatando de ISA-340/PR #280 tests y diseño de
la frontera `ActivePlan→revisión ejecutable` como referencia, no como merge.
