# ISA-694 — Estado actual y briefing de rework de Strategy Planner

Fecha de corte: 2026-08-21

Base auditada: `origin/nightly@2ab9741db4adc1e66443e8e6cb8063e60759f0e8`

Issue: [#694 — Auditoría actual y plan de rework de Strategy Planner](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/694)

Estado del documento: diagnóstico para planificación. No autoriza implementación,
merge, promoción ni release.

## 1. Propósito

Este documento reúne el estado verificable de Strategy Planner para que otro
modelo pueda preparar un plan específico de recuperación sin reconstruir el
contexto desde documentos históricos, ramas antiguas o interfaces mock.

Debe responder, en particular, a estas preguntas:

1. ¿Qué calcula hoy correctamente el backend manual?
2. ¿Qué puede obtener automáticamente desde las sesiones DuckDB de LMU?
3. ¿Qué piezas existen pero no están conectadas al producto?
4. ¿Qué partes de Command Orbit deben conservarse y cuáles deben sustituirse?
5. ¿Hasta dónde debe llegar el producto antes de considerarlo coherente?

## 2. Resumen ejecutivo

Strategy Planner no está vacío ni completamente fallido. Contiene una base de
dominio y cálculo valiosa, pero el producto visible está partido en dos:

```text
Command Orbit visible
├── modelo propio de eventos y estrategias
├── persistencia propia en localStorage
├── cálculo propio en TypeScript
├── datos de ejemplo y fallbacks sintéticos
└── activación únicamente local

Backend Strategy canónico
├── documentos, drafts y revisiones inmutables
├── repositorio con migración y recuperación
├── cálculo manual de Fuel y Virtual Energy
├── solver determinista de stints y paradas
├── inventario físico de neumáticos
├── importación/exportación
└── motor live todavía no compuesto en Nightly

Telemetry Analysis / DuckDB
├── discovery y autorización de archivos
├── staging read-only
├── helper DuckDB aislado
├── catálogo y lectura normalizada de canales
└── sin StrategyInputProjection ni derivados para Strategy
```

El resultado es una interfaz avanzada visualmente sobre una base funcional
paralela, mientras el backend correcto queda en gran parte desconectado.

### Veredicto

- **Cálculo manual backend:** funcional y con pruebas fuertes para las fórmulas
  que realmente implementa.
- **Desgaste manual:** agregado aritmético de valores introducidos; no es todavía
  un modelo predictivo de degradación.
- **Solver backend:** funcional bajo un modelo lineal y entradas ya preparadas;
  no descubre esas entradas desde telemetría.
- **Automatización DuckDB → Strategy:** no implementada.
- **Runtime live:** el motor existe, pero Nightly no resuelve y compone todavía
  una revisión activa ejecutable.
- **UI Orbit:** buena base visual, pero no es actualmente un frontend fiel del
  backend Strategy.
- **Promoción:** Strategy Planner debe permanecer bloqueado para `testers` hasta
  recuperar una única autoridad y un flujo real de extremo a extremo.

## 3. Fuentes de verdad aplicables

Las decisiones arquitectónicas actuales proceden principalmente de:

- `AGENTS.md`.
- `docs/adr/0006-strategy-planner-unified-domain-and-ownership.md`.
- `docs/strategy-planner/projection-ownership.md`.
- `docs/superpowers/plans/2026-08-01-strategy-planner-unified-master.md`.
- `docs/strategy-planner/str-05-manual-calculation.md`.
- `docs/strategy-planner/str-09-manual-inputs.md`.
- `docs/adr/0005-duckdb-helper-for-historical-telemetry.md`.
- `docs/vantare-program/handoffs/strategy-planner.md`.
- `docs/vantare-program/handoffs/telemetry-analysis.md`.

ADR 0006 fija una regla fundamental: Strategy es propietario de sus drafts,
revisiones, planes activos, cálculo y ejecución. Telemetry Analysis es
propietario de la importación y normalización histórica. Strategy no debe abrir
DuckDB directamente ni duplicar su almacenamiento.

## 4. Respuesta directa sobre los cálculos backend

### 4.1 Fuel manual

El paquete `internal/strategy/manual` implementa un cálculo real, puro y
determinista de Fuel.

Entradas principales:

- vueltas de carrera;
- capacidad física;
- capacidad utilizable por servicio;
- cantidad inicial;
- consumo por vuelta;
- consumo de formación;
- reserva absoluta, por vueltas o porcentual;
- procedencia y confianza de cada dato.

Fórmula central:

```text
raceNeed = raceLaps × consumptionPerLap
totalNeed = raceNeed + formation + reserve
additionalRequired = max(totalNeed - startAmount, 0)
stopsRequired = ceil(additionalRequired / usableCapacity)
```

También calcula:

- combustible total necesario;
- combustible adicional;
- cantidad de cada repostaje;
- vueltas disponibles con el combustible inicial;
- ahorro total y por vuelta necesario para eliminar una parada;
- viabilidad matemática de ese ahorro.

Protecciones observadas:

- rechaza `NaN`, infinitos y negativos;
- rechaza cantidad inicial o utilizable superior a la capacidad física;
- falla si se necesita repostar y la capacidad de servicio es cero;
- controla overflow y el máximo entero compartido;
- asigna conservadoramente el último repostaje para no quedar por debajo por
  redondeo binario;
- conserva las asunciones y su procedencia.

Conclusión: **la aritmética de presupuesto de Fuel manual está bien construida y
fuertemente probada dentro de su modelo**. Esto no demuestra que el consumo
introducido sea representativo de una carrera real; esa calidad depende de la
fuente de entrada.

### 4.2 Virtual Energy manual

Virtual Energy utiliza la misma conservación de recurso, pero mantiene tipos y
unidades separados de Fuel.

Calcula:

- necesidad total y por stint;
- consumo de formación y reserva;
- cantidad adicional;
- número de recargas o servicios;
- recarga por servicio;
- ahorro necesario para eliminar una parada.

Los consumos acumulados pueden superar el 100 % durante una carrera, aunque la
cantidad instantánea siga representándose como porcentaje. Fuel y Virtual
Energy no se suman ni se convierten entre sí.

Conclusión: **la aritmética manual de Virtual Energy funciona bajo el mismo
modelo determinista y tiene pruebas específicas de separación de unidades y
conservación**.

### 4.3 Carrera, ritmo y pit

El backend manual calcula:

- carreras por número de vueltas;
- carreras por tiempo;
- regla de completar vuelta actual;
- regla explícita de completar vuelta actual más una;
- vueltas de formación separadas;
- tiempo de conducción;
- entrada, tránsito y salida de pit;
- repostaje y neumáticos en paralelo o secuencial;
- reparación y penalización;
- pérdida por parada y pérdida total.

La frontera temporal utiliza aritmética racional para evitar vueltas fantasma
en divisiones como `0.3 / 0.1`.

El cálculo manual de un plan completo recibe una fila por vuelta, valida que el
número de filas coincida con la suma de los stints y obtiene:

- consumo medio de Fuel;
- consumo medio de Virtual Energy;
- ritmo medio;
- desgaste medio introducido;
- necesidades exactas por stint;
- pérdida total de pit;
- ahorro de recursos por stint.

### 4.4 Desgaste y neumáticos manuales

Aquí es importante no sobredimensionar lo existente.

`CalculateManualPlan` acepta un porcentaje de desgaste por cada vuelta y:

- valida que esté entre 0 y 100;
- calcula la media de las filas;
- suma el desgaste de cada stint;
- devuelve esos totales en el resultado.

No calcula todavía:

- una curva aprendida de degradación física;
- degradación distinta por esquina;
- relación temperatura/presión/desgaste;
- efecto del compuesto, pista, clima o carga de combustible;
- cambio no lineal del ritmo con la edad del neumático;
- vida útil inferida desde sesiones históricas.

Por tanto, **el desgaste manual se contabiliza correctamente, pero el backend no
lo predice**. El valor debe ser introducido o derivado por una capa todavía
pendiente.

El paquete `internal/strategy/tyres` sí implementa un inventario físico:

- identidad de cada neumático;
- compuesto;
- estado disponible/usado/descartado;
- esquina bloqueada cuando corresponde;
- compatibilidad de asignaciones;
- imposibilidad de usar el mismo neumático dos veces en un stint;
- validación de inventario suficiente.

Ese inventario resuelve custodia y asignación, no predicción de desgaste.

### 4.5 Solver automático del backend

`internal/strategy/solver` genera candidatos deterministas de stints y paradas.

Entradas principales:

- vueltas de carrera;
- tiempo base por vuelta;
- degradación lineal por vuelta dentro de un stint;
- pérdida de pit;
- capacidad y consumo de Fuel;
- capacidad y consumo de Virtual Energy;
- límite de vida del neumático.

El coste de degradación de un stint de `L` vueltas sigue:

```text
degradationCost = degradationPerLap × L × (L - 1) / 2
```

El solver:

- encuentra el límite vinculante entre Fuel, energía y neumáticos;
- usa vueltas enteras;
- enumera candidatos alrededor del óptimo;
- compara tiempo total, paradas y margen;
- mantiene Fuel y energía separados;
- puede decidir que una parada adicional compensa por degradación;
- ofrece variantes rápida, equilibrada y conservadora;
- incluye sensibilidad a consumo y degradación;
- es determinista y explica sus asunciones.

Limitaciones del modelo:

- degradación lineal;
- un único tiempo base por vuelta;
- no existe efecto explícito de tráfico, clima, safety car o evolución de pista;
- no modela por sí mismo ventanas reglamentarias o disponibilidad de pilotos;
- no aprende parámetros;
- no hace Monte Carlo;
- no demuestra que una estrategia sea óptima fuera de este modelo cerrado.

Conclusión: **el solver funciona correctamente respecto de su modelo, pero ese
modelo necesita inputs preparados y no debe confundirse con una simulación
completa de carrera**.

## 5. Evidencia sobre corrección matemática

En la auditoría se ejecutó:

```text
go test -count=100 ./internal/strategy/manual ./internal/strategy/solver
```

Resultado:

- `internal/strategy/manual`: PASS 100 repeticiones.
- `internal/strategy/solver`: PASS 100 repeticiones.

La cobertura incluye:

- 10.000 presupuestos deterministas de recursos;
- fuzz de conservación de Fuel;
- fuzz de conservación del breakdown de pit;
- límites exactos de carrera por tiempo;
- Fuel y energía separados;
- comparación del solver con enumeración exhaustiva;
- suma exacta de partes del tiempo total;
- degradación incluida en el resultado;
- degradación capaz de cambiar la parada óptima;
- límites de neumático como recurso vinculante;
- candidatos explicables e inviables no ocultados;
- determinismo e invariantes del solver.

La evidencia permite afirmar corrección interna respecto de las fórmulas. No es
una validación empírica contra una colección amplia de carreras LMU reales.

## 6. Estado real de DuckDB y Telemetry Analysis

### 6.1 Qué existe

Telemetry Analysis puede:

- descubrir candidatos sin exponer rutas privadas;
- exigir estabilidad y autorización del usuario;
- crear un manifiesto reproducible;
- copiar el artefacto a staging privado sin modificar el original;
- cargar un runtime DuckDB firmado/fijado;
- ejecutar el helper fuera del proceso Wails;
- inspeccionar catálogo, metadata y canales;
- leer páginas acotadas;
- preservar `missing`, `invalid`, `stale`, `unknown` y ceros reales;
- revalidar la identidad del artefacto para evitar cambios durante la lectura;
- normalizar canales continuos y eventos timestamped.

El corpus de esquema LMU demuestra que DuckDB puede contener, entre otros:

- `Fuel Level`;
- `Virtual Energy`;
- `Tyres Wear` por cuatro ruedas;
- temperaturas de carcasa, goma, centro, izquierda y derecha;
- presiones;
- temperatura de llanta;
- compuesto;
- mezcla de combustible.

La suite estándar ejecutada fue:

```text
go test -count=1 ./internal/telemetryanalysis/...
```

Resultado: PASS.

### 6.2 Qué no existe

No se encontró implementación productiva de `StrategyInputProjection v1`.

Tampoco existe todavía el flujo que:

1. seleccione vueltas válidas de una sesión;
2. detecte outliers, pit, cautions o vueltas incompletas;
3. calcule consumo de Fuel por vuelta;
4. calcule consumo de Virtual Energy por vuelta;
5. calcule ritmo representativo;
6. derive degradación y vida útil de neumáticos;
7. estime pit loss desde eventos reales;
8. produzca rangos y confianza;
9. entregue esos datos al adaptador Strategy;
10. convierta la proyección en inputs reproducibles del solver.

Las issues que describen exactamente ese puente siguen abiertas en backlog:

- [#442 — ISA-159 / TA-05, productor StrategyInputProjection v1](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/442).
- [#428 — ISA-145 / STR-10, adaptador histórico Strategy](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/428).
- [#429 — ISA-146 / STR-11, derivados de planificación y confianza](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/429).

No hay consumidores productivos de `ParseLMUDuckDBCatalog`,
`NormalizeLMUDuckDBPage`, `duckdbadapter.NewReader` o
`duckdbadapter.ProductionTrust` fuera de los propios paquetes y pruebas de
Telemetry Analysis.

Conclusión: **DuckDB se puede abrir y leer de forma segura, pero no alimenta
automáticamente Strategy Planner**.

### 6.3 Límite de la prueba DuckDB actual

Los tests estándar prueban contrato, normalización, seguridad y adaptador sin
ejecutar necesariamente el helper real.

La integración real está protegida por el build tag:

```text
duckdb_integration && windows
```

y exige `VANTARE_DUCKDB_RUNTIME` y `VANTARE_DUCKDB_FIXTURE` absolutos. Esa prueba
no se ejecutó en esta auditoría porque el worktree no contiene el bundle runtime
DuckDB instalado. Existe evidencia histórica documentada de TA-03C, pero no se
eleva a prueba actual de un producto Strategy end-to-end.

## 7. Telemetry Core live no sustituye al histórico DuckDB

Telemetry Core ofrece actualmente a Strategy una proyección live v1 con:

- sesión y pista;
- progreso y vuelta;
- estado de pit;
- Fuel actual y capacidad.

La proyección declara explícitamente ausentes:

- Virtual Energy;
- neumáticos;
- clima;
- consumo por vuelta histórico;
- degradación aprendida.

El motor live incorporado por PR #219 consume esta proyección y mantiene estados
`missing/fresh/stale/invalid/unsupported`. No inventa objetivos. Si el plan
activo no contiene un objetivo Fuel para la vuelta completada, la desviación
queda missing.

Nightly todavía no compone una ejecución completa porque una `ActivePlan`
identifica una revisión, pero falta resolverla a stints y objetivos de ejecución
normalizados.

La PR draft [#280 — ISA-340 / STR-17A](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/280)
intentó resolver esa frontera, pero no forma parte de Nightly y debe portarse,
no integrarse a ciegas, sobre Telemetry Core actual.

## 8. Estado de la interfaz Command Orbit

### 8.1 Activos que deben conservarse

- dirección visual y navegación;
- jerarquía de eventos y variantes;
- formularios y wizard como base de experiencia;
- layout responsive;
- tarjetas de stints, comparación e inventario;
- tests visuales como protección de presentación.

### 8.2 Autoridades paralelas que deben desaparecer

`StrategyOrbitPage` no utiliza hoy el backend canónico como autoridad principal.

Mantiene en `localStorage`:

- eventos;
- pilotos;
- variantes;
- orden de pilotos;
- disponibilidad;
- `activeStrategyId`.

También calcula planes en `strategy-orbit-model.ts`, separado del solver Go.

Problemas resultantes:

- “Activar” solo selecciona un ID local;
- no se guarda una revisión inmutable;
- el runtime live no recibe esa activación;
- guardar puede fallar silenciosamente;
- abrir el editor canónico puede fallar silenciosamente;
- exportar utiliza el draft canónico global y puede no corresponder a lo
  visible;
- cada evento reutiliza inventario de un ejemplo global Spa;
- se fabrican valores de ritmo, consumo, depósito y pit;
- el gate visual usa runtime mock;
- no existe productor Go real del roster que consume la pantalla.

### 8.3 Defecto concreto de eliminación de pilotos

Al eliminar uno de varios pilotos, el orden de una estrategia puede conservar
el ID eliminado. `buildPlan` accede después a ese piloto sin validarlo y puede
romper la pantalla. No existe una regresión para este caso.

### 8.4 Tamaño y mantenibilidad

`StrategyOrbitPage.tsx` supera aproximadamente las 2.400 líneas y concentra
presentación, estado, formularios, cálculo, persistencia, navegación y diálogos.

No se recomienda una división masiva previa. Primero debe recuperarse la
autoridad canónica y después extraer adaptadores y componentes en cortes
pequeños protegidos por tests.

## 9. Cronología relevante

### Integrado en Nightly

- PR #192, merge `7e39104a`: contratos, repositorio, aplicación, cálculo,
  solver, paquetes y lifecycle Strategy.
- PR #219, merge `8de4f511`: motor live consumidor de Telemetry Core, sin
  composition root final.
- PR #279, merge `af2c90d1`: porte de Command Orbit.
- PR #283, merge `fd45ef0f`: Orbit pasa a ser la única shell y se elimina la
  antigua pantalla Strategy V52.
- PR #478, merge `5b1feec7`: menú, wizard y ampliación de la UI Orbit.

### No integrado

- PR #280 / ISA-340: abierta y draft en `a593347f`; sus checks históricos
  pasaron sobre ese SHA, pero su implementación no está en Nightly.
- ISA-159 / TA-05: backlog.
- ISA-145 / STR-10: backlog.
- ISA-146 / STR-11: backlog.

## 10. Estado por capacidad

| Capacidad | Núcleo backend | Conectada a Orbit | Datos reales automáticos | Estado |
|---|---:|---:|---:|---|
| Cálculo Fuel manual | Sí | No, Orbit usa cálculo TS | No | Núcleo válido, producto desconectado |
| Cálculo Virtual Energy manual | Sí | No | No | Núcleo válido, producto desconectado |
| Carrera por vueltas/tiempo | Sí | Parcial y duplicada | No | Requiere reconexión |
| Pit y solape de servicios | Sí | Modelo simplificado paralelo | No | Requiere reconexión |
| Desgaste introducido manualmente | Suma/media | Parcial | No | Contabilidad, no predicción |
| Predicción de degradación | Modelo lineal si recibe parámetro | UI usa otro modelo | No | Input histórico ausente |
| Inventario físico de neumáticos | Sí | Parcial, con inventario ejemplo | No | Custodia desconectada |
| Solver de stints/paradas | Sí | No, cálculo TS propio | No | Núcleo válido, producto desconectado |
| Lectura segura DuckDB | Sí, en Telemetry Analysis | No | Lee canales, no los deriva | Infraestructura lista |
| StrategyInputProjection | No | No | No | Bloqueante |
| Activación de revisión exacta | Dominio sí | No | No aplica | UI engañosa actualmente |
| Ejecución live | Motor parcial | No | Fuel live parcial | Composition root pendiente |
| Replanning live | Contratos parciales | No | No | Futuro |

## 11. Riesgos principales

### P0 — Integridad y semántica de producto

El usuario puede interpretar como guardada, activa o exportada una estrategia
que no corresponde al estado canónico. Antes de exponer Strategy como estable,
debe existir una sola autoridad.

### P1 — Resultados divergentes

El cálculo TypeScript y el cálculo Go pueden responder distinto a las mismas
entradas. No debe mantenerse un segundo motor productivo.

### P1 — Automatización inexistente presentada como avanzada

La presencia de DuckDB, canales de neumáticos y un solver no implica que exista
un ciclo automático. Faltan productor, adaptador y derivados.

### P1 — Datos locales sin migración

Eliminar el store Orbit directamente podría perder estrategias creadas por
usuarios de Nightly. Es necesario inventariar, previsualizar, respaldar y migrar.

### P1 — Live sobre una revisión no resoluble

El motor live no debe arrancar con defaults sintéticos. Necesita una revisión
activa exacta, normalizada y compatible.

### P2 — Evidencia mock confundida con runtime

Los tests visuales son valiosos para UI, pero no prueban Wails, DuckDB, LMU ni
persistencia instalada.

### P2 — Documentación desactualizada

El handoff Strategy todavía describe el estado anterior a Orbit y conserva
referencias a Linear. No puede usarse por sí solo como fotografía actual.

## 12. Alcance de producto recomendado

Antes de planificar hay que evitar dos extremos:

- quedarse en una calculadora visual sin custodia ni datos reales;
- intentar construir de golpe simulación avanzada, IA, Monte Carlo, live
  adaptativo y catálogo comunitario.

Se recomienda fijar el objetivo del rework en tres niveles acumulativos.

### Nivel A — Strategy manual coherente

Debe ser el primer corte obligatorio y candidato a `testers`:

1. Command Orbit conserva su presentación.
2. Crear/editar opera sobre el draft canónico.
3. Calcular llama exclusivamente al backend manual y solver Go.
4. Guardar crea una revisión inmutable.
5. Activar activa una revisión exacta o el botón no se denomina “Activar”.
6. Exportar exporta exactamente la revisión visible.
7. Fuel, Virtual Energy, ritmo, desgaste y pit muestran procedencia.
8. Inventario de neumáticos pertenece al evento/plan, no a un ejemplo global.
9. No hay fallbacks sintéticos presentados como datos reales.
10. Los datos Orbit existentes tienen migración o respaldo verificable.

### Nivel B — Strategy asistido por telemetría histórica

Debe completar la promesa original de DuckDB:

1. Telemetry Analysis produce `StrategyInputProjection v1`.
2. Strategy consume solo esa proyección pública.
3. Se filtran vueltas inválidas y se explica cada exclusión.
4. Se derivan consumo Fuel, consumo VE, ritmo, pit loss y desgaste.
5. Cada derivado incluye muestra, rango, confianza y procedencia.
6. El usuario puede seleccionar sesiones y aplicar overrides sin destruir el
   dato original.
7. El solver usa esas entradas y produce resultados reproducibles.
8. La UI distingue medido, derivado, manual, missing e inválido.
9. Existe prueba con un DuckDB LMU sanitizado real de extremo a extremo.

### Nivel C — Ejecución live del plan

Debe cerrar el ciclo operativo sin convertirlo en replanning autónomo:

1. Resolver una `ActivePlan` a una revisión ejecutable exacta.
2. Componer `StrategyLiveRuntime` sobre el único Telemetry Core.
3. Mostrar progreso, consumo real, objetivo y desviación.
4. Degradar correctamente en stale/missing/reconnect.
5. Activar/desactivar de forma durable y recuperable tras reinicio.
6. No modificar automáticamente el plan activo.
7. Generar propuestas explícitas de replan para aceptación posterior.
8. Validar Wails y LMU reales.

### Fuera del rework inicial

Salvo decisión expresa, deberían quedar fuera:

- Monte Carlo;
- modelos de IA;
- predicción compleja de safety car;
- optimización meteorológica avanzada;
- estrategia de tráfico multi-clase;
- mercado o comunidad de estrategias;
- sync cloud;
- replanning autónomo sin confirmación;
- catálogo masivo de estrategias prefabricadas;
- rediseño visual completo de Command Orbit.

## 13. Secuencia técnica sugerida para el futuro plan

Esta sección orienta al planificador; no es todavía un plan aprobado.

### Fase 0 — Freeze y caracterización

- bloquear nuevas features sobre el store Orbit;
- añadir regresiones de los defectos actuales;
- inventariar documentos canónicos y datos `localStorage`;
- definir una matriz de supervivencia de cada pieza.

### Fase 1 — Contrato y migración

- confirmar o versionar el documento Strategy que necesita Orbit;
- diseñar migración idempotente desde el store Orbit;
- realizar backup y preview;
- resolver identidad de evento, draft, revisión y plan activo.

### Fase 2 — Cutover manual

- crear un adaptador fino Orbit → aplicación Strategy;
- retirar llamadas productivas a `buildPlan`;
- conectar manual, solver, tyres, save, activate y export;
- conservar el renderer y los flujos visuales.

### Fase 3 — Histórico

- ejecutar TA-05;
- ejecutar STR-10;
- ejecutar STR-11;
- probar DuckDB real → proyección → override → solver.

### Fase 4 — Live

- portar la parte útil de ISA-340 sobre Nightly actual;
- activar revisión exacta;
- verificar lifecycle y reconnect;
- cerrar con evidencia Wails/LMU.

### Fase 5 — Retirada y limpieza

- eliminar store y matemática paralelos después de migrar;
- dividir `StrategyOrbitPage` por responsabilidad;
- actualizar handoff, roadmap e issues;
- promover solo tras pruebas reales del canal.

## 14. Decisiones que debe pedir el modelo planificador

Antes de generar tareas de implementación debe obtener respuesta explícita a:

1. ¿El objetivo aprobado incluye solo Nivel A, A+B o A+B+C?
2. ¿Qué simuladores deben soportar Fuel, Virtual Energy y neumáticos en este
   corte: LMU únicamente o contrato multi-sim desde el inicio?
3. ¿El usuario puede crear una estrategia sin sesión histórica?
4. ¿Cuál es el comportamiento cuando falta Virtual Energy o desgaste?
5. ¿Qué representa exactamente “desgaste”: porcentaje consumido por vuelta,
   vida restante, pérdida de ritmo o los tres con contratos separados?
6. ¿La degradación lineal actual es suficiente para la primera versión
   asistida?
7. ¿Qué datos locales de Nightly deben migrarse y durante cuánto tiempo se
   mantiene rollback?
8. ¿Debe seguir visible la UI Strategy mientras el cutover está incompleto?
9. ¿Cuáles son los criterios exactos de entrada a `testers`?
10. ¿ISA-340 se cierra, se reemplaza o se conserva como fuente de tests y
    commits para portado?

## 15. Gates mínimos de aceptación

### Nivel A

- una sola autoridad de persistencia;
- una sola autoridad de cálculo;
- ninguna estrategia activa sin revisión exacta;
- import/export round-trip de la estrategia visible;
- migración de datos Orbit probada;
- reinicio Wails conserva draft, revisión y activación;
- tests Go, frontend, build y visuales verdes;
- cero copy que presente un dato sintético como real.

### Nivel B

- DuckDB LMU real sanitizado leído por el helper productivo;
- proyección histórica versionada;
- derivados reproducibles con calidad y procedencia;
- tests de vueltas inválidas, pit, outliers y datos ausentes;
- paridad entre cálculo manual con los mismos inputs y cálculo asistido;
- ningún acceso DuckDB desde Strategy.

### Nivel C

- activar y desactivar revisiones reales;
- reinicio recupera la misma revisión;
- fresh/stale/missing/invalid verificados;
- reconnect degrada snapshots anteriores;
- evidencia LMU live del único pipeline Telemetry Core;
- ninguna mutación autónoma del plan activo.

## 16. Evidencia ejecutada durante ISA-694

```text
pnpm --dir frontend exec vitest run src/hub/strategy-orbit src/strategy
PASS — 18 archivos / 183 tests

pnpm --dir frontend typecheck
PASS

pnpm --dir frontend visual:orbit-strategy
PASS — runtime mock, no prueba Wails real

go test -count=100 ./internal/strategy/manual ./internal/strategy/solver
PASS

go test -count=1 ./internal/strategy/...
PASS

go test -count=1 ./internal/app -run 'Strategy|TelemetryCore.*Strategy'
PASS

go test -count=1 ./internal/telemetryanalysis/...
PASS
```

No ejecutado:

- integración `duckdb_integration` con runtime firmado y fixture real;
- aplicación Wails instalada;
- sesión LMU real;
- suite Go global;
- build y lint frontend completos;
- CI remoto de esta rama.

## 17. Estado Git y de entrega

- Worktree: `C:\tmp\vantare-isa694`.
- Rama: `vantareapp/isa-694-auditoria-rework-strategy-planner`.
- Base auditada: `origin/nightly@2ab9741d`.
- Issue: #694, `state:in-progress`, área Estrategia.
- No existe PR de ISA-694 al redactar este documento.
- No se ha modificado código de producto.
- No se ha realizado merge, promoción ni release.

## 18. Instrucción para el siguiente modelo

El siguiente modelo debe tratar este documento como briefing de diagnóstico, no
como autorización de implementación.

Su primera entrega debe ser un plan revisable que:

1. elija explícitamente el nivel objetivo;
2. trace contratos y dependencias;
3. preserve datos locales;
4. conserve la UI Orbit;
5. elimine autoridades paralelas mediante cutover incremental;
6. separe evidencia unitaria, integración DuckDB, Wails y LMU;
7. proponga issues pequeñas con orden, gates y rollback;
8. se detenga antes de codear hasta recibir aprobación de Isaac.
