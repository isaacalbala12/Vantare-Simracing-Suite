# Plan técnico ISA-694 — Strategy Planner definitivo (corte A+B)

Fecha: 2026-08-21
Fase SDD: **PLAN** (el spec aprobado es `isa-694-spec.md`; los TASKS se
derivan de este plan como issues de GitHub).
Estado: pendiente de review adversarial (Codex `gpt-5.6-sol`) y gate de Isaac.
No autoriza implementación.

## 1. Principios de ejecución

1. **Custodia antes que ambición.** Cada fase deja un producto coherente y
   entregable a nightly aunque la siguiente se retrase.
2. **Datos antes que código.** Ninguna derivación se implementa sin haberse
   demostrado sobre el corpus real en F0; ningún contrato se congela antes.
3. **Incremental con paridad.** Cada extensión del solver se valida contra
   enumeración exhaustiva en tamaños pequeños antes de confiar en podas.
4. **Un worker, una issue, un worktree.** Sin paralelismo sobre la misma rama.
   Claude orquesta, trocea y revisa; review técnica con Codex `gpt-5.6-sol`
   high; checks sencillos con `gpt-5.6-terra` high; grueso con
   `muse-spark-1.2-contributor` vía T3 Code.
5. **Documento vivo.** Si un descubrimiento invalida una asunción A1–A6, se
   actualiza spec y plan antes de seguir implementando.

## 2. Mapa de componentes y dependencias

```text
                         ┌──────────── F0 spike (corpus real) ────────────┐
                         ▼                                                ▼
        F1 contratos v2 + ADR 0009 + regresiones/freeze          umbral backtest
              │                       │
     ┌────────┴─────────┐             │
     ▼                  ▼             │
F2 custodia        F3 derivación      │        (F2 ∥ F3: módulos disjuntos,
(Strategy app +    (Telemetry         │         workers y worktrees separados)
 Orbit cutover +    Analysis)         │
 migración)             │             │
     │                  ▼             │
     │             F4 motor ampliado ◄┘  (consume curvas/proyección de F3;
     │                  │                 arranca antes contra fixtures F0/F1)
     └──────┬───────────┘
            ▼
      F5 producto asistido (Orbit)      F6 pipeline editorial
      (proyección visible, escenarios,  (exportador, Worker, curador, catálogo)
       catálogo con datos de muestra)   (F6a ∥ F4/F5; F6b tras F5)
            │                                │
            └──────────────┬─────────────────┘
                           ▼
              F7 endurecimiento + campaña testers (2 semanas)
```

Módulos afectados por fase:

| Fase | Go | Frontend | Otro |
|---|---|---|---|
| F0 | scripts de spike (fuera de producto) | — | corpus DuckDB de Isaac |
| F1 | `internal/strategy/contract` (tipos compile-only) | — | `docs/adr/0009`, specs de contratos |
| F2 | `internal/strategy/{application,repository,contract}`, bindings Wails | `strategy-orbit/*` (bridge, stores, page) | migración localStorage |
| F3 | `internal/telemetryanalysis/*` (nuevos paquetes de derivación), señal forecast en Core | selector de sesiones (mínimo) | fixtures reales en `testdata/` |
| F4 | `internal/strategy/{solver,manual,backtest}` | — | corpus holdout |
| F5 | read models / API de aplicación | `strategy-orbit/*` UI asistida | catálogo de muestra |
| F6 | `cmd/vantare-curator` (CLI), exportador | export UI + fetch catálogo | Worker Cloudflare (subproyecto), tarea programada PC Isaac |
| F7 | endurecimiento transversal | ídem | campaña, evidencia Wails/LMU |

## 3. Fases en detalle

### F0 — Spike empírico sobre corpus real

**Objetivo:** validar A1–A6 con los DuckDB de Isaac (corpus declarado
suficiente) y fijar el umbral de backtest del criterio de éxito #5.

Trabajo (1 issue, worker Codex `gpt-5.6-sol` high; scripts desechables fuera
del árbol de producto, p. ej. `docs/strategy-planner/evidence/isa-694-spike/`):

1. Inventario del corpus: sesiones, combos, tipos, metadata disponible (A3).
2. Calidad de canales: resolución/ruido de `Tyres Wear`, `Fuel Level`,
   `Virtual Energy`, mezcla, `Path Wetness` (A1).
3. Separabilidad peso-fuel vs edad-neumático entre stints; si la muestra no
   separa, medir la curva combinada de decaimiento por stint y documentar la
   pérdida de identificabilidad (A1).
4. Pit events: ¿se puede desglosar tránsito/servicio/ritmo de repostaje y
   recarga VE? (A4).
5. Curva coste-del-ahorro desde datos de mezcla, si existen vueltas con
   mezclas distintas (A5).
6. REST local: forma del endpoint de forecast; captura durante una práctica
   real con ayuda de Isaac; estabilidad práctica→carrera si el corpus o una
   sesión doble lo permite (A2).
7. Estimación de tamaño de bundle derivado (A6).
8. Backtest manual de una carrera real contra un plan reconstruido a mano →
   propuesta de umbral.

**Checkpoint:** informe en `evidence/` con veredicto por asunción
(válida / degradada / inválida) + selección de sesiones sanitizables para
`testdata/` + umbral propuesto. Lo reviso yo; Isaac decide el umbral y
cualquier degradación de alcance. **Si A2 falla**, el flujo forecast pasa a
escenario manual (el spec se actualiza).

### F1 — Contratos v2, ADR 0009, freeze y regresiones

**Objetivo:** congelar el lenguaje común antes de tocar producto.

Trabajo (3 issues paralelizables tras F0):

1. **ADR 0009** (yo redacto, Codex revisa): pipeline editorial y sus
   fronteras (predigestión determinista, LLM cura/redacta, Isaac decide),
   Worker de subida opt-in anonimizada, catálogo firmado en GitHub con
   procedencia `reference`, alcance de clima por escenarios, perfiles de
   piloto, y el punto fino de ownership del forecast: **Telemetry Core
   expone la señal forecast del REST (adquisición live); Strategy persiste
   `WeatherScenario` cuando el usuario captura** — Analysis no interviene.
2. **Contratos** (worker muse-spark, tipos Go compile-only + spec doc cada
   uno): `StrategyInputProjection v2` (11 familias del spec §6),
   `WeatherScenario v1`, `PilotProfile v1`, `ObservedStrategy v1`,
   `CurationBundle v1`, `Catalog v1`. Todos con `simId`, procedencia
   (`measured|derived|manual|reference|missing`), muestra, rango, confianza,
   unidad y versión de cálculo. Contract tests productor/consumidor.
3. **Freeze + regresiones** (worker muse-spark): tests de caracterización de
   los defectos actuales de Orbit (eliminación de piloto rompe `buildPlan`,
   guardado/activación silenciosos), marcados como comportamiento a corregir
   en F2; nota de freeze: ninguna feature nueva sobre el store localStorage.

**Checkpoint:** ADR accepted por Isaac; contratos compilan con tests de
contrato; regresiones rojas documentadas. Review Codex del conjunto.

### F2 — Custodia: API de aplicación, cutover Orbit→Go, migración

**Objetivo:** una sola autoridad de persistencia y cálculo. Elimina el P0.
Entregable a nightly por sí misma.

Trabajo (6 issues secuenciadas, workers muse-spark; la (a) con Codex sol por
ser modelado de dominio):

- **(a) Modelo de documento ampliado + API de aplicación.** El documento
  Strategy canónico incorpora lo que Orbit necesita y hoy vive en
  localStorage: evento, pilotos (orden/disponibilidad), variantes por evento,
  inventario de neumáticos por evento (no ejemplo global). Queries y comandos
  de aplicación que Orbit consumirá tal cual (crear/editar/listar/comparar).
  Migración de schema con versión.
- **(b) Bindings Wails + cliente TS fino** (`strategy-orbit-bridge` deja de
  ser puente a localStorage y pasa a ser el único acceso).
- **(c) Migración localStorage→canónico:** inventario, preview visible,
  backup exportado automático, import idempotente, verificación, rollback.
  El store viejo queda read-only tras migrar; se borra en F7.
- **(d) Cutover de cálculo:** "Calcular" llama a manual+solver Go; retirar
  rutas productivas de `buildPlan`/`strategy-orbit-model` (queda solo shaping
  de presentación); las regresiones de F1 pasan a verde.
- **(e) Guardar/Activar/Exportar honestos:** guardar crea revisión inmutable,
  activar referencia una revisión exacta, exportar exporta la revisión
  visible; errores visibles, nunca silenciosos.
- **(f) Limpieza de sintéticos:** fuera datos Spa de ejemplo y fallbacks
  fabricados; donde falte dato, `missing` con procedencia visible.

**Checkpoint (gate de fase, candidato a nightly):** criterios #1 y #2 del
spec; suites Go/frontend/build/visual verdes; evidencia manual Wails
(migración real del localStorage de Isaac). Review Codex del diff completo.

### F3 — Derivación en Telemetry Analysis

**Objetivo:** producir `StrategyInputProjection v2` real desde multi-sesión.
Corre en paralelo con F2 (módulos disjuntos, worktrees separados).

Trabajo (6 issues, muse-spark salvo curvas con Codex sol):

- **(a) Clasificación de sesiones y combos** (A3): agrupación automática
  coche/clase/pista/tipo/clima; "carrera diaria X en combinación Y" con sus
  prácticas.
- **(b) Validez y etiquetado de vueltas:** out/in, pit, incidente, tráfico
  (etiqueta, no solo exclusión — D7), outliers; motivo por exclusión.
- **(c) Consumo, ritmo y percentil:** Fuel/VE por vuelta con rango y
  confianza por bucket de clima; ritmo representativo; percentil vs histórico
  propio (equipo cuando haya perfiles importados).
- **(d) Curvas:** efecto peso-fuel, degradación por compuesto/esquina, vida
  útil, coste-del-ahorro — con el método validado en F0 y sus límites de
  identificabilidad documentados en el resultado.
- **(e) Pit loss real + ObservedStrategy:** desglose de paradas; extracción
  de la estrategia corrida de cada sesión de carrera con resultado.
- **(f) Agregación multi-sesión + productor de proyección:** combinación
  ponderada por calidad/frescura, confianza creciente con muestra, salida
  `StrategyInputProjection v2` versionada. Señal forecast en Core +
  persistencia `WeatherScenario` al capturar (según ADR 0009).

**Checkpoint:** cada derivación reproduce resultados esperados sobre fixtures
reales de `testdata/` (seleccionadas en F0); integración `duckdb_integration`
verde con runtime real; cero acceso de Strategy a DuckDB. Review Codex.

### F4 — Motor ampliado y backtesting

**Objetivo:** el solver decide sobre el espacio completo del spec §5.
Depende de F3 para inputs reales, pero arranca contra fixtures de F0/F1.

Orden estricto, una extensión por issue, paridad exhaustiva en cada una
(worker Codex `gpt-5.6-sol` high en solver y backtest; muse-spark en arneses):

1. Curvas de degradación no lineales (por tramos) en coste de stint.
2. Efecto peso-fuel en el tiempo por vuelta (litros a bordo por vuelta).
3. **Ahorro como variable de decisión** (D6): niveles de ahorro por stint con
   su coste de ritmo; test canónico "último stint de 5 vueltas → repartir el
   ahorro elimina la parada y gana tiempo total"; y el caso inverso donde no
   compensa.
4. Compuesto por stint contra inventario físico (`internal/strategy/tyres`).
5. Asignación de pilotos a stints: perfiles por piloto, disponibilidad y
   límites de tiempo de conducción como restricciones duras.
6. Escenarios de clima: plan por escenario + recomendación robusta (mínima
   pérdida si el escenario falla); compuestos wet/dry.
7. Evaluación esperado/caso-malo desde rangos; variantes
   rápida/equilibrada/conservadora como tolerancia al caso malo.
8. **Backtesting:** replay de carrera real contra plan; error por stint y
   total; arnés de holdout con las carreras reservadas; métrica del gate.

**Checkpoint:** paridad exhaustiva verde en cada extensión; determinismo
(mismos inputs ⇒ mismo ranking); explicabilidad (restricción vinculante y
sensibilidades en cada resultado); backtest holdout bajo el umbral fijado en
F0. Review Codex por extensión, no al final.

### F5 — Producto asistido en Orbit

**Objetivo:** el flujo B visible: sesiones → derivados → plan, con verdad de
procedencia. Pantallas negociables, features intactas (D3).

Trabajo (5 issues, muse-spark; propuesta UX previa mía para lo negociable):

- **(a)** Selector de combinación/sesiones con agrupación automática y
  exclusiones explicadas.
- **(b)** Inputs derivados visibles con procedencia, rango y confianza;
  overrides no destructivos (el dato original se conserva).
- **(c)** Escenarios de clima en el flujo de plan; captura de forecast desde
  práctica ("métete en una práctica de la combinación"); mini-overlay ingame
  de clima previsto (módulo Overlays, issue propia pequeña).
- **(d)** Ejemplos validados propios: backtests de tus carreras visibles por
  combinación.
- **(e)** Catálogo en la app: fetch+verificación+caché del formato `Catalog
  v1` con datos de muestra; perfiles de referencia como arranque en frío
  (procedencia `reference`, sustituidos por datos propios al existir);
  importación inicial de DuckDB ya presentes en disco.

**Checkpoint:** flujo end-to-end con DuckDB reales en Wails (criterio #3);
visual tests actualizados; ningún dato sin procedencia. Review Codex.

### F6 — Pipeline editorial

**Objetivo:** bundles → Worker → curación en PC de Isaac → catálogo GitHub.
F6a puede ir en paralelo con F4/F5; F6b (curador completo) tras F5.

Trabajo (5 issues; Worker y firma con Codex sol, resto muse-spark):

- **(a) Exportador anonimizado** en la app: `CurationBundle v1` (derivados,
  estrategias observadas, backtests; sin telemetría cruda, sin nombres; ID de
  instalación opt-in).
- **(b) Worker Cloudflare** (subproyecto mínimo, p. ej. `infra/curation-worker`):
  endpoint de subida con token opt-in y rate-limit, storage de objetos, coste
  ~cero; **publicarlo requiere OK explícito de Isaac** (boundaries).
- **(c) Curador CLI** (`cmd/vantare-curator`, Go): sincroniza bundles,
  predigestión determinista (agregación por combo, dedupe, scoring por
  backtest, clustering de estrategias observadas) → resumen compacto. El LLM
  nunca ve tablas crudas (D12).
- **(d) Ciclo editorial:** tarea programada en el PC de Isaac (sus
  suscripciones) que ejecuta curador + análisis LLM sobre el resumen + flujo
  de decisión simple para Isaac; skills que codifican qué es bueno/malo se
  acumulan aquí para automatización progresiva.
- **(e) Publicación:** builder del catálogo firmado + publicación a GitHub +
  verificación de firma en la app (mecanismo de firma decidido en ADR 0009).

**Checkpoint (criterio #7):** ciclo completo en frío con bundles de prueba,
de exportar hasta ver el resultado curado en la app. Review Codex de la
superficie de seguridad (Worker, firma, anonimización).

### F7 — Endurecimiento y campaña de testers

**Objetivo:** cerrar gates, correr la campaña, decidir promoción.

Trabajo: barrido de los criterios #1–#9 del spec; borrado del store legacy
(tras verificación de migración, con OK de Isaac); checklist de evidencia
Wails/LMU reproducible; guía de onboarding de testers; campaña de 2 semanas
con el ciclo editorial funcionando en vivo (curación LLM + decisión de
Isaac); ventana de fixes; actualización de `docs/roadmap/plan.md`, handoff e
issues. **La promoción a testers la dispara Isaac, nunca el plan.**

## 4. Riesgos y mitigaciones

| Riesgo | Prob. | Mitigación |
|---|---|---|
| A2 falla (forecast inestable o no expuesto) | media | F0 lo detecta; fallback: escenario manual; el resto del corte no depende |
| Separabilidad fuel/neumático débil en datos reales | media | F0 mide; degradar a curva combinada por stint y acotar claims de compuesto (spec vivo) |
| Migración pierde datos de Isaac/testers | baja | backup automático exportado + preview + store viejo read-only hasta F7 + rollback probado |
| Explosión combinatoria del solver | media | extensiones incrementales con paridad exhaustiva; presupuesto de cómputo por búsqueda; si hace falta poda mayor, decisión explícita |
| Calidad de workers (muse-spark) irregular | media | issues pequeñas, aceptación precisa, review Codex sol de cada PR + mi revisión de diff y evidencia |
| Deriva de alcance ("ya que estamos") | alta | gates SDD; todo hallazgo fuera de alcance → issue nueva, jamás se cuela |
| LMU cambia schema DuckDB/REST en un update | media | contratos versionados; corpus versionado; clasificador tolerante con `unknown` |
| Límites free-tier del Worker | baja | bundles pequeños (A6 lo valida), rate-limit, tamaño máximo |
| Divergencia temporal F2∥F3 | baja | módulos disjuntos; integración en F4/F5 con contract tests de F1 |

## 5. Checkpoints de verificación (resumen)

```text
F0: informe de asunciones + umbral fijado          → gate Isaac
F1: ADR 0009 accepted + contratos compilan          → gate Isaac (ADR)
F2: custodia única, migración probada               → candidato nightly
F3: derivación reproducible sobre fixtures reales   → review Codex + yo
F4: paridad + holdout bajo umbral                   → review Codex + yo
F5: E2E asistido en Wails con DuckDB reales         → candidato nightly
F6: ciclo editorial completo en frío                → OK Isaac (Worker público)
F7: gates #1–#9 + campaña                           → decisión promoción Isaac
```

Cada fase repite internamente el ciclo SDD (plan de fase ya aquí → tasks como
issues → implementación TDD) y termina con: diff revisado por mí, review
Codex, evidencia según AGENTS, handoff actualizado.

## 6. Trabajo que me reservo como orquestador

- Redactar ADR 0009 y las issues (TASKS) de cada fase.
- Propuestas UX de lo negociable en F5 antes de tocar pantallas.
- Revisión final de cada PR (diff + evidencia + coherencia con spec).
- Mantener spec/plan/handoff/roadmap vivos.

## 7. Fuera de este plan

Todo lo listado en spec §11. El corte C (live) se planificará con su propio
ciclo SDD sobre la base A+B, rescatando de ISA-340/PR #280 tests y diseño de
la frontera `ActivePlan→revisión ejecutable` como referencia, no como merge.
