# Spec ISA-694 — Strategy Planner definitivo (corte A+B)

Fecha: 2026-08-21
Issue: [#694](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/694)
Metodología: Spec-Driven Development. Este documento es la fase **SPECIFY**.
No autoriza implementación. Tras su aprobación se redacta el PLAN técnico y
después los TASKS (issues de GitHub).

Complementa, no sustituye:

- `docs/strategy-planner/isa-694-current-state-and-rework-brief.md` (diagnóstico).
- `docs/adr/0006-strategy-planner-unified-domain-and-ownership.md` (ownership).
- `docs/strategy-planner/projection-ownership.md` (proyecciones).

## 1. Objetivo

Convertir Strategy Planner en el producto definitivo de estrategia de Vantare
para LMU, que se ampliará a muy largo plazo pero no se replanteará. La app aún
no está publicada: este corte define el producto, no un parche.

**Qué es:** un motor determinista que calcula la mejor estrategia de carrera
—la que completa la distancia en menos tiempo bajo tus condicionantes reales—
alimentado automáticamente por la telemetría histórica DuckDB que LMU ya graba,
validado contra múltiples sesiones, consciente del clima, de los pilotos del
equipo y del ahorro de combustible/energía como arma estratégica; más un
pipeline editorial que analiza el corpus de estrategias reales corridas por los
pilotos y publica las mejores por combinación dentro de la app.

**Quién lo usa:** pilotos y equipos de endurance en LMU, desde el piloto suelto
de carreras diarias hasta el equipo con varios pilotos y stints asignados.

**Qué NO es (en este corte):** ejecución live del plan (corte C posterior),
modelo de tráfico/rivales, Monte Carlo, replanning autónomo, multi-sim.

## 2. Decisiones de producto fijadas (Isaac, 2026-08-21)

| # | Decisión |
|---|---|
| D1 | A+B es un solo producto: "manual" es el caso degenerado de "asistido" — misma fórmula, distinta procedencia del dato. C (live) es un corte posterior ampliado sobre A+B. |
| D2 | LMU only en este corte. Contratos sim-agnósticos con `simId`. |
| D3 | La UI Orbit es negociable a nivel de pantallas, **no** de features ya mostradas. |
| D4 | Migración real de los datos Orbit en `localStorage` (no backup-y-reset). |
| D5 | Clima dentro del corte: perfiles seco/mojado derivados, estrategias por escenario, forecast capturado del REST local de LMU (el piloto entra en una práctica de la combinación que correrá). Reacción live al clima = corte C. Mini-overlay ingame con el clima previsto: pieza pequeña del módulo Overlays. |
| D6 | El ahorro de fuel/VE por vuelta es **variable de decisión del optimizador**: el motor detecta cuándo ahorrar elimina una parada y compara tiempos totales honestamente (coste en ritmo vs pit loss evitado). |
| D7 | Tráfico diferido hasta tener datos. Parámetros empíricos anotados: ~20 % de vueltas con tráfico, pérdida 0,5–4 s/vuelta. El clasificador de vueltas **etiqueta** tráfico desde el día uno para acumular el corpus. |
| D8 | Safety car / FCY: no existen en LMU. Fuera. |
| D9 | Percentil de ritmo derivado como señal de nivel de piloto. Contra histórico propio/equipo ahora; contra comunidad cuando exista corpus. |
| D10 | Recogida de datos: Cloudflare Worker + almacenamiento desde el día uno (subida opt-in automatizada de bundles derivados, no telemetría cruda). Backend al mínimo coste posible. |
| D11 | Catálogo curado hospedado en GitHub (estático, versionado, firmado); la app lo descarga y cachea. |
| D12 | Curación: predigestión **determinista** (el LLM nunca ve tablas crudas, solo resúmenes compactos); las primeras 2 semanas el LLM analiza e Isaac decide con un flujo sencillo; después se automatiza progresivamente con skills que codifican qué es bueno/malo. El ranking objetivo lo dan métricas deterministas (backtest); el LLM cura y redacta. |
| D13 | Pipeline editorial corre en el PC de Isaac como tarea programada recurrente usando sus suscripciones (sin coste API por review). |
| D14 | Campaña de testers de ~2 semanas generando corpus y ejemplos, **después** de que A+B cumpla sus gates. Testers prueba el producto completo y lo alimenta. |
| D15 | El catálogo también publica **perfiles de referencia por combinación** (consumo/ritmo/degradación típicos, anonimizados) para el arranque en frío; se sustituyen por los datos propios cuando existen. Además, el primer arranque descubre e importa los DuckDB que LMU ya tiene en disco. |
| D16 | La **estrategia observada** (qué corrió realmente cada piloto: vueltas de parada, compuestos, stints, resultado) se extrae de cada sesión de carrera como familia de derivación de primera clase. El corpus de carreras reales es la base de datos de estrategias. |
| D17 | Desarrollo mediante SDD con gates humanos. Workers: `muse-spark-1.2-contributor` vía MCP T3 Code; tareas complejas y review adversarial con Codex `gpt-5.6-sol` razonamiento high; checks sencillos con Codex `gpt-5.6-terra` high. Claude planifica, orquesta y revisa. |
| D18 | **Decidido (Isaac, 2026-08-21): subida automática.** Se modifica el contrato de producto (`docs/vantare-program/product-contract.md`) dentro del ADR 0009 para permitir consentimiento permanente **opt-in y revocable**, con cola de subida visible, historial, pausa y borrado; el bundle sigue siendo anonimizado y sin telemetría cruda. Los DuckDB de LMU viven en la misma ruta estándar en todos los PCs, lo que habilita el descubrimiento automático. |
| D19 | **Decidido (Isaac, 2026-08-21, gate F0-1):** se aceptan las degradaciones de A1/A4/A5 (ver §3) y, en paralelo, las familias bloqueadas se recuperarán mediante una **campaña de capturas controladas** (sesiones diseñadas por Isaac y por los testers en F7b: vueltas A/B de mezcla, paradas cronometradas). No se invierte en resolver la alineación de relojes dentro de este corte; si algún día se necesita, la vía será que Vantare capture sus propios marcadores en vivo — decisión aparte. |

## 3. Asunciones explícitas (a validar en el spike de Fase 0)

Estas asunciones sostienen el diseño. Si alguna cae, se revisa el spec antes de
seguir (documento vivo).

1. **A1 — resuelta en F0-1 (2026-08-21): DEGRADED, en dos mitades.**
   *Calidad intracanal:* PASS — Fuel, VE, wear ×4, presiones y temperaturas
   presentes en 336/336 sesiones con cadencia estable, resolución sobrada y
   cero nulos. *Derivabilidad cruzada:* FAIL por causa raíz única — los
   canales continuos y los eventos no comparten reloj (`TimeOriginUnknown`,
   desfases de hasta miles de segundos; en carreras largas el continuo solo
   cubre la ventana del piloto local). Consecuencias aceptadas por Isaac:
   - la **curva combinada de ritmo por stint** (`CombinedStintPaceCurve`,
     `identifiability=combined_only`) es el entregable estándar; curvas
     separadas peso-fuel / edad-neumático solo si un gate de
     identificabilidad pasa sobre datos que lo permitan;
   - degradación por **eje/rueda**, no por esquina (requiere `LapBoundary`
     reconciliado y mapping de esquina versionado, futuro);
   - `TyresCompound` llega con códigos 0–2 sin mapping semántico: curvas por
     compuesto condicionadas a resolver ese mapping;
   - clima: `Minimum Path Wetness` como buckets de evento; `CloudDarkness` y
     `OffpathWetness` son booleanos no informativos y no se convierten en
     porcentajes;
   - antes de F3a se congela el contrato de segmentos temporales
     (`ContinuousSegment`, `LapBoundary`, `StintBoundary`, `TrackLocation`)
     sin comprimir huecos en silencio.
2. **A2:** El REST local de LMU expone el forecast de la sesión y ese forecast
   es **estable entre la práctica y la carrera** de la misma combinación. El
   cliente REST actual solo consulta standings/sessionInfo: el endpoint de
   forecast hay que descubrirlo. A2 solo puede darse por válida con una pareja
   real práctica→carrera; sin esa pareja queda `UNRESOLVED` y **bloquea el
   contrato de forecast** (no el resto del corte). Si LMU regenera clima por
   split, el flujo de captura se rediseña.
3. **A3 — resuelta en F0-1: VALID.** Los seis campos de identidad presentes
   en 336/336 sesiones; spot-check de 8 sesiones confirmado por Isaac
   (2026-08-21, 8/8 correctas). La clasificación automática por metadata es
   viable; las sesiones cortas/sin vuelta se clasifican como "identificadas
   pero no utilizables" por familia.
4. **A4 — resuelta en F0-1: INVALID como desglose; degradada con dos ramas.**
   `In Pits` cubre el carril completo, sin marcadores de cajón/servicio ni
   reloj común. Rama degradada aceptada: `ObservedPitLaneInterval` + tasas
   observadas (repostaje 1,9–4,0 L/s; VE ~2,5 pp/s) con calidad degradada, y
   tránsito/servicio como input manual. El breakdown observado exacto queda
   condicionado a reloj común y marcadores (futuro).
5. **A5 — resuelta en F0-1: INVALID como derivada del corpus actual.** Solo
   una sesión tiene dos mezclas utilizables (N=2, confundida). La curva
   coste-del-ahorro entra con procedencia **manual**, y su derivación queda
   condicionada al protocolo A/B de capturas controladas (≥5 vueltas limpias
   alternadas por nivel, mismo stint/compuesto/clima, repetida).
6. **A6 — resuelta en F0-1: VALID.** Bundle por sesión: mediana 3,96 KB JSON /
   1,28 KB gzip (p95 5,0/1,5 KB); corpus completo de Isaac ~0,45 MB gzip. El
   volumen no bloquea la subida automática ni la predigestión.

## 4. Arquitectura objetivo

Tres capas productivas + pipeline editorial. Ownership según ADR 0006; las
novedades (curación, Worker, roles del LLM, clima, perfiles de piloto) se
consolidan en un **ADR 0009** nuevo durante la fase PLAN.

```text
LMU DuckDB (nativo, en disco del piloto)      LMU REST local (forecast)
        │                                             │
        ▼                                             ▼
[Telemetry Analysis]  ──────────────  StrategyInputProjection v2
  discovery/staging/helper (existe)      + WeatherScenario v1
  clasificación de sesiones (nuevo)      + PilotProfile v1
  derivación multi-sesión (nuevo)        + ObservedStrategy v1
        │
        ▼
[Strategy Planner — Go, autoridad única]
  presupuestos fuel/VE (existe) · modelo de carrera (existe)
  solver ampliado (ahorro, compuestos, pilotos, clima, curvas) (nuevo)
  backtesting (nuevo) · draft→revisión→ActivePlan (existe)
  API de aplicación para Orbit (nuevo)
        │
        ▼
[Orbit UI]  features conservadas, pantallas negociables,
  cutover: localStorage y cálculo TS mueren con migración real
        │ (export opt-in, anonimizado)
        ▼
[Cloudflare Worker + storage]  →  PC de Isaac (tarea programada:
  predigestión determinista → informe LLM → decisión de Isaac)
        │
        ▼
[Catálogo GitHub firmado]  →  la app descarga: mejores estrategias
  por combinación + perfiles de referencia (arranque en frío)
```

Guards que se mantienen (ADR 0006 / projection-ownership):

- Strategy no abre DuckDB ni importa storage de Telemetry Analysis.
- Ningún valor stale/missing/invalid se convierte en cero o estimación.
- La ausencia de capability no habilita fallback sintético.
- El LLM nunca calcula ni ordena el ranking: redacta, cura y explica.
- Un solo motor de cálculo: ningún número que el usuario lea sale de una
  fórmula TypeScript. El TS solo da forma de presentación (view-models).

## 5. Función objetivo del motor

**Mejor estrategia = menor tiempo total en completar la distancia de carrera,
para ti, con tus datos.** No modela rivales ni posición en pista (D7).

```text
tiempo_total = Σ stints [ Σ vueltas ( ritmo_base(piloto asignado)
                                     + peso_fuel(nivel en esa vuelta)
                                     + edad_neumático(vuelta, compuesto)
                                     + delta_clima(condición en esa vuelta)
                                     + coste_ahorro(nivel de ahorro del stint) ) ]
             + Σ pit (tránsito + servicios reales de cada parada)
             + formación
```

- **Restricciones duras** (violarlas = candidato inviable, mostrado con
  motivo): capacidades fuel/VE, vida e inventario físico de neumáticos,
  disponibilidad y tiempo de conducción por piloto, reglas del evento.
- **Variables de decisión:** nº de paradas y vueltas de parada, litros/%
  por servicio, compuesto por stint, piloto por stint, nivel de ahorro
  fuel/VE por stint (D6).
- **Incertidumbre determinista:** cada input derivado llega con rango y
  confianza; el motor evalúa caso esperado y caso malo, rankea por esperado y
  expone el riesgo. Variantes rápida/equilibrada/conservadora = misma función
  objetivo, distinta tolerancia al caso malo. Mismos inputs ⇒ mismo ranking.
- **Clima:** ranking por escenario + recomendación robusta (la que menos
  pierde si el escenario falla).
- **Explicabilidad:** todo resultado expone inputs, asunciones, procedencia,
  restricción vinculante y sensibilidades.

## 6. Familias de derivación

Las familias 1–9 y 11 las produce **Telemetry Analysis** en su paquete público
(`StrategyInputProjection v2` / `ObservedStrategy v1`), sobre N sesiones
agrupadas por combinación (selección manual o automática). La familia 10
(forecast) tiene otro owner: **Telemetry Core expone la señal REST y Strategy
persiste `WeatherScenario` cuando el usuario captura**; Analysis no interviene.

1. Validez de vueltas: exclusión con motivo; **etiqueta** out/in-lap, pit,
   incidente, tráfico (D7).
2. Consumo Fuel y VE por vuelta: media, rango, varianza, confianza; por
   condición de clima y, si hay datos, por mezcla.
3. Ritmo representativo y percentil del piloto (D9).
4. `CombinedStintPaceCurve`: curva combinada de ritmo por stint
   (`identifiability=combined_only`, rango y N); las curvas separadas
   peso-fuel / edad-neumático solo tras pasar el gate de identificabilidad
   (A1/D19).
5. Degradación por eje/rueda y vida útil estimada; por compuesto cuando el
   mapping semántico de `TyresCompound` esté resuelto; por esquina, futuro
   condicionado (A1).
6. Pit degradado: `ObservedPitLaneInterval` + tasas observadas, con
   tránsito/servicio manual; breakdown exacto condicionado a marcadores
   (A4/D19).
7. Curva coste-del-ahorro: procedencia manual, derivable solo vía protocolo
   A/B de capturas controladas (A5/D19).
8. Buckets de clima seco/húmedo/mojado vía `Path Wetness` (D5).
9. Clasificación de sesión y combinación (A3).
10. Captura y persistencia del forecast (A2).
11. **Estrategia observada** de cada carrera (D16).

Todo dato viaja con **tres ejes independientes**, alineados con el contrato
Strategy existente (`internal/strategy/contract/metadata.go`):

- **presencia/calidad:** el enum exacto se congela en F1 tomando como base el
  del contrato Strategy vigente (`valid | missing | invalid | stale |
  unsupported | unknown`); la ausencia o invalidez no es una procedencia;
- **procedencia:** el vocabulario vigente del contrato (`observed | corrected
  | manual | derived | estimated | range | unknown`) **más el valor nuevo
  `reference`** que v2 introduce para datos del catálogo comunitario; la
  adición se declara en la matriz v1→v2. "Measured" del lenguaje de producto
  mapea a `observed`;
- **confianza:** muestra, rango, varianza y versión de cálculo.

El paso de los contratos v1 existentes a v2 exige una matriz explícita
productor/consumidor old→new con compatibilidad, retirada y fixtures.

## 7. Stack y comandos

Sin dependencias nuevas salvo aprobación explícita (AGENTS). El Worker de
Cloudflare es infraestructura nueva aprobada por D10, con su propio
subproyecto mínimo.

```text
Backend:    Go (internal/strategy, internal/telemetryanalysis)
Frontend:   TypeScript/React estricto (frontend/src/hub/strategy-orbit)
Helper:     runtime DuckDB firmado fuera del proceso Wails (existe)
Cloud:      Cloudflare Worker + storage de objetos (nuevo, coste mínimo)
Catálogo:   estático en GitHub, firmado
Editorial:  CLI Go en el repo, ejecutada por tarea programada en PC de Isaac

go test ./internal/strategy/... ./internal/telemetryanalysis/...
go test -count=100 ./internal/strategy/manual ./internal/strategy/solver
go test -tags "duckdb_integration windows" ...   # con runtime+fixture reales
pnpm --dir frontend test
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend lint
pnpm --dir frontend visual:orbit-strategy
```

## 8. Estrategia de testing

| Nivel | Qué protege |
|---|---|
| Unit + property/fuzz Go | fórmulas, conservación de recursos, unidades separadas (existe; se amplía a cada extensión) |
| Paridad solver vs enumeración exhaustiva | cada nueva variable de decisión se valida en tamaños pequeños antes de confiar en la poda (técnica ya usada) |
| Integración DuckDB (`duckdb_integration`) | helper real + fixtures LMU sanitizados; pasa a ser obligatoria en los gates |
| Derivación sobre corpus real | fixtures de sesiones reales de Isaac en `testdata/`; resultados esperados versionados |
| Backtest holdout | carreras reservadas que el motor no vio; métrica cuantitativa de aceptación |
| Contract tests | productor/consumidor old/new de cada proyección versionada |
| Frontend unit + visual | UI Orbit; el gate visual deja de usar runtime mock donde afirme integración |
| Evidencia Wails/LMU manual | checklist reproducible por Isaac en cada gate de fase |

## 9. Boundaries

**Siempre:**

- SDD con gates: ninguna fase implementa sin spec/plan/tasks aprobados.
- Cambios pequeños, tests antes de refactor, evidencia final según AGENTS.
- Todo dato visible con procedencia; cero sintéticos presentados como reales.
- Anonimización por defecto en exportación/subida (sin nombres de piloto;
  ID de instalación opt-in).
- Actualizar handoff, issue y `docs/roadmap/plan.md` en el mismo PR que
  cambie alcance o entregue hitos.

**Preguntar primero (Isaac):**

- Dependencias nuevas; cambios de schema de contratos ya versionados.
- Todo lo reservado en AGENTS: promociones, releases, gasto, secretos.
- Retirar el store Orbit (solo tras migración verificada con rollback).
- Publicar el Worker o el catálogo por primera vez.

**Nunca:**

- Cálculo TS como autoridad; segundo motor; fallback sintético.
- Strategy abriendo DuckDB o storage de Analysis.
- LLM calculando, rankeando o mutando planes.
- Subir telemetría cruda o datos personales al Worker.
- Debilitar tests para pasar un gate.

## 10. Criterios de éxito del corte A+B

Medibles, verificables por Isaac, previos a la campaña de testers (D14):

1. Una sola autoridad de persistencia y una sola de cálculo; `localStorage`
   Orbit migrado con backup, preview y rollback verificados.
2. Activar activa una revisión inmutable exacta; exportar exporta lo visible;
   round-trip import/export íntegro; reinicio Wails conserva todo.
3. Flujo asistido end-to-end con DuckDB LMU reales: descubrir → clasificar →
   derivar → proyección → solver → plan con procedencia visible.
4. El solver resuelve los casos de decisión clave y los explica: ahorro que
   elimina una parada corta (ejemplo canónico D6), parada extra que compensa
   por degradación, cambio de compuesto por escenario de clima, asignación de
   pilotos bajo restricciones.
5. Backtest con **tres gates separados y prerregistrados** (el backtest de la
   estrategia observada valida calibración del modelo, no el contrafactual de
   estrategias no corridas; no se afirma más de lo que demuestra):
   - **calibración:** error de predicción sobre carreras holdout reservadas
     (split por combinación y fecha, N mínimo y métricas fijados en F0;
     propuesta inicial: < 2 % en tiempo total y paradas exactas en seco);
   - **factibilidad:** ningún plan recomendado viola restricciones al
     reproducirse contra los datos reales;
   - **calidad de ranking (PASS/FAIL objetivo):** sobre las carreras holdout
     donde la estrategia corrida difiere de la recomendada, el signo de la
     diferencia de tiempo total predicha (recomendada vs corrida) coincide con
     el resultado simulado contra los datos reales en al menos el porcentaje
     prerregistrado en F0, con su N mínimo; y el tiempo predicho del plan
     recomendado no supera al del mejor candidato enumerado por el propio
     motor (regret interno cero dentro del modelo). La optimalidad se afirma
     solo dentro del modelo validado.
   El solver además cumple un presupuesto de cómputo p95 fijado en F1.
6. Forecast capturado en práctica y aplicado a la carrera de la misma
   combinación (A2 validada).
7. Pipeline editorial completo en frío: bundles de prueba → Worker → tarea
   programada → informe predigerido → decisión de Isaac → catálogo firmado →
   visible en la app con procedencia "referencia comunitaria". La publicación
   del Worker y la publicación del primer catálogo son **dos gates explícitos
   e independientes de Isaac**.
8. Suites Go, frontend, build, lint, visuales e integración DuckDB verdes;
   evidencia Wails/LMU manual documentada.
9. Ningún copy presenta un dato sintético o de referencia como propio.

## 11. Fuera de alcance del corte

Live/ejecución (C), replanning, Monte Carlo, modelo de tráfico (D7), rivales y
posición, multi-sim, automatización total de la curación (D12 la hace
progresiva), endpoint de comunidad pública más allá del Worker opt-in,
rediseño visual completo de Orbit.

## 12. Fases previstas (se detallan en la fase PLAN)

Cada fase termina con gate revisable y deja producto coherente aunque la
siguiente se retrase (principio rector: custodia antes que ambición).

```text
F0  Spike empírico sobre corpus real de Isaac (valida A1–A6, fija umbral #5)
F1  Contratos v2 + ADR 0009 + regresiones de defectos actuales (freeze Orbit)
F2  Custodia: API de aplicación, cutover Orbit→Go, migración localStorage
F3  Derivación: familias 1–11 sobre multi-sesión, clasificación, forecast
F4  Motor: curvas, peso fuel, ahorro, compuestos, pilotos, clima, backtest
F5  Producto asistido en Orbit + catálogo/arranque en frío
F6  Pipeline editorial: exportador, Worker, tarea programada, curación
F7  Endurecimiento + campaña de testers (2 semanas) + decisión de promoción
```

## 13. Política de ejecución

- Orquestador: Claude (revisa diffs, evidencia y handoff; troceo de issues).
- Workers: `muse-spark-1.2-contributor` vía MCP T3 Code para el grueso;
  Codex CLI `gpt-5.6-sol` high para tareas complejas (solver, derivación de
  curvas, migración). Un worker por issue/worktree; sin paralelismo sobre la
  misma rama (AGENTS).
- Cada fase repite el ciclo SDD: plan de fase → tasks → implementación
  incremental con TDD → gate de Isaac.

## 14. Preguntas abiertas

1. Umbral numérico definitivo del backtest (se fija con datos del spike, F0).
2. Mecanismo de firma del catálogo y custodia de la clave (propuesta en F1).
3. Autenticación mínima del Worker de subida (token opt-in vs anónimo con
   rate-limit; propuesta en F1 con coste como criterio).
4. Qué pantallas de Orbit se renegocian al introducir el flujo asistido
   (propuesta de UX en F5, features intactas por D3).
5. ~~Consentimiento de subida~~ — resuelta: ver D18 (subida automática con
   salvaguardas; el contrato de producto se modifica en el ADR 0009).

## 15. Siguientes pasos

1. Isaac revisa y aprueba/corrige este spec (gate SPECIFY).
2. Redactar PLAN técnico: dependencias, orden, riesgos por fase, ADR 0009.
3. Redactar TASKS: issues de GitHub pequeñas con aceptación, verificación y
   rollback por tarea.
4. El PR de ISA-694 que introduzca este rumbo actualiza
   `docs/roadmap/plan.md` y el handoff de Strategy en el mismo PR (AGENTS).
