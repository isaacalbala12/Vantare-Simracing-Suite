# Strategy recorded editor Implementation Plan

> **For agentic workers:** Use `executing-plans` to execute the approved phase
> task by task. Do not dispatch other agents unless execution authority permits
> it. One issue and worktree per slice; no implementation from this master alone.

**Goal:** Entregar el asistente y editor de Strategy sobre archivos registrados,
con correcciones reversibles, resultados explicables y validación real LMU.

**Architecture:** Analysis conserva lectura, sesiones y derivación; Strategy
conserva configuración, selección, revisiones y SolverV2. Toda la experiencia
visible vive dentro de Strategy. No se crean lectores o cálculos paralelos.

**Tech Stack:** Go, React/TypeScript, Wails y reader DuckDB aprobado; herramientas
actuales del repositorio, sin nuevas dependencias.

---

Fecha: 2026-09-08. Issue documental #1028; primera ejecución #1030.
La spec `../specs/2026-09-08-strategy-recorded-editor-design.md`, contenido del
commit `a009231a`, fue aprobada por Isaac en esta conversación. El cambio de su
marca a aprobada es administrativo; no reabre sus decisiones.
Este plan v1 fue aprobado por Isaac. La ejecución posterior autorizada de #819
entregó dos cortes locales hasta `4ce96ded`; no autoriza merge o release.
Base histórica de inspección: `nightly@d6d0992f`.

## Propuesta visual revisable — #1063

Sobre la corrección instrumental `609a4390`, se prepara la propuesta navegable
`../../strategy-planner/prototypes/recorded-editor/index.html`: siete pasos y
pantalla resumen/revisión. Es un artefacto documental independiente, sin solver
ni persistencia; no inicia la sustitución productiva. Pendiente criterio visual
de Isaac antes de implementar la composición, como fija la spec aprobada.

## 1. Cómo ejecutar este programa

El corte tiene dependencias empíricas: no es correcto escribir ahora algoritmos o
umbrales completos que dependen de #1030. Este documento cubre todo el alcance y
ordena entregas; el plan de auditoría enlazado es el primer bloque ejecutable.
Cada fase posterior tendrá su microplan con contratos, código/tests previstos,
comandos y archivos exactos, después de resolver sus prerrequisitos. No se usan
estos nombres de entregas como issues implícitas ni como permiso para programar.

- [x] Revisar este plan y el plan acotado de #1030.
- [ ] Ejecutar #1030: `2026-09-08-strategy-recorded-editor-audit.md`.
- [ ] Revisar evidencia y fijar umbrales con Isaac antes de modificar filtros.
- [ ] Abrir issues pequeñas para carencias demostradas de la siguiente fase.
- [ ] Ejecutar y revisar cada corte; actualizar el único handoff y su issue.
- [ ] Promover solo con autorización de Isaac y gates del canal.

Estado #1030: banco 367 fuentes y matriz completados; cuatro muestras observadas,
reserva congelada pero insuficiente para evaluación de carreras completas.
Anotación independiente y umbrales siguen pendientes. Fiabilidad puede avanzar
en #819/#821/#803; contrato documental de correcciones propuesto en #1033.
Ver `../../strategy-planner/evidence/isa-1030/README.md` y `next-slices.md`.

### Gate añadido por Isaac: revisión personal antes de nuevas secciones

#1038 aplica Ponytail + code review sin subagentes sobre `4ce96ded`.
Informe: `../../strategy-planner/evidence/isa-1038/README.md`.
Veredicto **NO-GO**: seis reproducciones confirman fallos de factibilidad,
reserva, coste, reloj, boxes y recuperación. También se trazó el fixture de
referencia en la ruta normal y la cancelación solo local de UI.

- [x] Entregar revisión por flujos con cobertura y límites explícitos (#1038).
- [x] #1041: evaluación del plan final, recursos/reserva/coste; no prueba óptimo global.
- [x] #1042: reloj normal coherente; comparador Weather delimitado a distancia fija.
- [x] #819/#821: reconciliación y deadline locales con regresiones.
- [ ] #819/#821: evidencia de interfaz aislada Wails y reader físico.
- [x] #1043: etiquetado de boxes; #1030 conserva calibración pendiente.
- [x] #445: producción vacía sin confianza aprobada; fixtures fuera del cálculo normal.
- [x] Revisar personalmente fixes y revalidar código hasta `5a5feb44`.
- [ ] Completar F0 empírico y propuesta visual antes de filtros/editor productivos.

Cierre local: `../../strategy-planner/evidence/isa-1038/closeout.md`.
La propuesta documental #1033 está preparada: ADR 0010, contrato de correcciones
y microplan `2026-09-08-analysis-corrections-contract-implementation.md`.
No hay implementación ni aceptación del editor. Esta propuesta no elimina gates
empíricos/Wails ni autoriza integración o publicación.

Se proponen microcortes, no un rewrite. Las nuevas revisiones deben fijar
entradas, fuentes/correcciones y versión del motor; guardar el resultado solo
no permite recalcularlo. Live y OSS/Monte Carlo mantienen su aplazamiento.

## 2. Mapa de reutilización inspeccionado

Rutas relativas a `vantare-v2/`.

| Responsabilidad | Archivos existentes que se revisan primero |
|---|---|
| Fuentes y lectura neutra | `internal/telemetryanalysis/contract.go`, `discovery.go`, `historical.go`, `duckdbadapter/reader.go` |
| Autorización y disponibilidad | `internal/telemetryanalysis/authorized_store.go`, `sessioncatalog.go`, `internal/strategy/coldstart/lmu_importer.go`, `service.go` |
| Calidad por familia | `internal/telemetryanalysis/lapvalidity.go`, `consumptionpace.go`, `derivedcurves.go`, `required_channels.go` |
| Proyección pública | `internal/telemetryanalysis/strategyprojection/projection.go`, `contract.go`, `provenance.go` |
| Evento y custodia | `internal/strategy/document/`, `repository/`, `application/` |
| Cálculo y evidencia | `internal/strategy/application/orbit_calculation.go`, `solver/solver_v2_solve.go`, `backtest/holdout.go`, `backtest_test.go` |
| Entrada/selección | `frontend/src/hub/strategy-orbit/StrategyOrbitPage.tsx`, `strategy-calendar-selection.ts`, `strategy-session-selection.ts` |
| Presentación de datos | `frontend/src/hub/strategy-orbit/StrategyAnalysisPanel.tsx`, `StrategyColdStartBanner.tsx`, `StrategyWeatherPanel.tsx` |

El catálogo ya filtra combinaciones; `AnalyzedLap.FamilyUse` ya conserva inclusión
por familia; existen tests de separación temporal en backtest. Son capacidades
existentes, no demostración de cumplimiento de toda la nueva spec.

## 3. Fases y entregas verticales

### F0 — Evidencia antes de cambios (#1030)

Dependencia: spec aprobada y aprobación del plan. Entrega: matriz de gaps,
inventario real sanitizado, criterios anotados, protocolo de evaluación y lista
de siguientes issues. No cambia comportamiento.

Aceptación: separar incidente de invalidación y variación normal; medir por
familia; no publicar PASS sin muestra ni usar carreras reservadas para ajustar.
Verificación exacta en el plan de auditoría. Gate: evidencia suficiente para
definir filtros o limitaciones explícitas del corte.

### F1 — Elegir fuentes y recuperar el trabajo

Dependencia: F0, lectura de #819/#821/#803 contra la base de ejecución.

| Corte | Resultado observable | Aceptación | Archivos iniciales |
|---|---|---|---|
| F1a | Fuentes autorizadas y búsqueda | Permiso por ubicación; nuevos archivos dentro del permiso; sin ampliación silenciosa | `discovery.go`, `contract.go`, `coldstart/lmu_importer.go` y tests vecinos |
| F1b | Referencia al original y copia opcional | Detectar archivo cambiado/desaparecido; copia solo elegida; hashes y originales intactos | `historical.go`, `authorized_store.go`, `application/` y tests vecinos |
| F1c | Importación recuperable | Corrupción no equivale a vacío; cancelar termina backend; error de runtime visible | Reutilizar #819/#821/#803, separadas por defecto |

Cada contrato/backend se conecta a una superficie existente para verificar el
recorrido; el rediseño visual completo espera F3. No fusionar tres issues de
fiabilidad en un cambio único.

### F2 — Revisar y corregir observaciones

Dependencia: F0 y fuentes identificables de F1.

| Corte | Resultado observable | Aceptación | Archivos iniciales |
|---|---|---|---|
| F2a | Criterio por familia | Invalidada utilizable incluida; tramos sanos verificables; anomalías con causas | `lapvalidity.go`, `lapvalidity_test.go`, `consumptionpace.go` y su test |
| F2b | Correcciones reversibles | Valor original/motivo, deshacer y revisión; sesión distinta de selección de plan | Contrato y custodia Analysis; archivo nuevo de correcciones justificado en microplan |
| F2c | Visión avanzada dentro de Strategy | Incluir/excluir, revisar stints/vueltas y ver efecto por familia sin alterar raw | `StrategyAnalysisPanel.tsx`, cliente público existente, tests y nuevos componentes acotados |
| F2d | Combinación de sesiones comparable | Calidad y condiciones visibles; ausencia explícita cuando falta soporte | `sessioncatalog.go`, `consumptionpace.go`, `derivedcurves.go` y tests separados por familia |

No implementar a la vez todas las familias ni añadir muestras/canales editables
sin un caso de corrección demostrado. Si un corte excede unos cinco archivos de
lógica/test, se divide por operación observable antes de empezar.

### F3 — Asistente Manual/Automático

Dependencia: F1, proyección de selección F2 y revisión visual de prototipos.

| Corte | Resultado observable | Aceptación | Archivos iniciales |
|---|---|---|---|
| F3a | Entradas y navegación | Manual configura; Automático propone combinaciones; un mismo recorrido | `StrategyOrbitPage.tsx`, componentes de pasos acotados y tests |
| F3b | Evento y combinación | Calendario o personalizada; categoría/coche y trazado correctos; no repetir datos fijados | `strategy-calendar-selection.ts`, su test, contrato de evento y validación |
| F3c | Condiciones y resistencia | Duración/vueltas, reglas, pilotos y Fuel/VE requeridos según evento | `internal/strategy/document/`, `application/`, formulario y tests; dividir por contrato si excede el corte |
| F3d | Revisar antes de generar | Selección propuesta y causas; volver atrás conserva trabajo; teclado/foco y responsive | Pasos del asistente, selección existente y tests de interacción |

El asistente se divide por pasos; no se añaden cientos de líneas al componente
central ni se reescribe toda su lógica en una sola issue. La extracción necesaria
para un paso conserva tests de comportamiento, sin limpieza ajena.

### F4 — Propuesta, resultados parciales y restricciones

Dependencia: F2/F3 y protocolo de calidad fijado.

| Corte | Resultado observable | Aceptación | Archivos iniciales |
|---|---|---|---|
| F4a | Resultado parcial honesto | Calcular familias respaldadas; configuración guardable; sin falso óptimo | Contrato de aplicación/proyección y vista de resultado |
| F4b | Propuesta inicial verificable | Mínimo dentro del modelo; recursos separados; reserva, pilotos y ventanas | `orbit_calculation.go`, SolverV2 y tests de paridad; solo gaps demostrados |
| F4c | Piloto estimado | Referencia más delta s/v, aviso y revisión; sin inferir Fuel/desgaste | Documento/pilotos, adaptador de cálculo y campo UI con tests |
| F4d | Editar restricciones y stints | Arrastrar solicita restricción; recalcular; coste versus propuesta e inviabilidad | Editor de stints, aplicación y tests de resultado |
| F4e | Alternativas y cálculo vigente | Alternativas útiles con mismas reglas; respuesta vieja no reemplaza nueva; cancelación | Adaptador/cancelación y presentación con tests |

Unidades, resultados y reglas pertenecen a Go. Cada cambio de comportamiento
empieza por un test que reproduce el caso y conserva un oráculo independiente.

### F5 — Guardar y reproducir

Dependencia: F2/F4. Revisiones referencian fuentes, selección, correcciones,
reglas, estimaciones y versión de cálculo exactas. Guardar/reiniciar reproduce
la propuesta; cambios posteriores no la reescriben. Original desaparecido sin
copia implica imposibilidad de repetir ese análisis, no pérdida silenciosa del
plan visible. Archivos iniciales: `repository/`, `document/`, `application/` y
`strategy-orbit-lifecycle.ts`, con slices separados de persistencia y UI.

No hay requisito de migración de planes antiguos; retirada de rutas de producto
obsoletas se hace solo al sustituir su recorrido, sin borrado masivo de datos.

### F6 — Gate completo

Dependencia: F0-F5. Ejecutar protocolo cerrado de F0 sobre evaluación reservada,
pruebas matemáticas y recorrido Wails de spec §8. Medir exclusiones erróneas,
contaminación retenida, calibración, factibilidad, tiempo y memoria; informar
N/cobertura. Si hay una corrección tras mirar evaluación, ese conjunto deja de
ser una prueba ciega para el nuevo ajuste: registrar nueva versión y otro corte
de evaluación o declarar limitación de evidencia.

La aceptación física de una estrategia contrafactual no se prueba con replay del
modelo: separar esa afirmación de calibración sobre lo ocurrido. Solo Isaac
acepta el corte y autoriza la promoción aplicable.

### F7 — Investigación posterior live

Bloqueada hasta aceptación F6. Estudio OSS de optimización y recálculo, métodos
de incertidumbre/Monte Carlo, validación y licencias. Produce conclusiones y una
spec distinta, no código live anticipado. No sustituye el pipeline Core existente.

## 4. Gates de cada issue de implementación

Desde el worktree asignado, en `vantare-v2/`:

```powershell
pnpm --dir frontend test
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend lint
go test ./...
git diff --check
```

Ejecutar frontend cuando se toque frontend y Go cuando se toque Go/contratos.
Construir frontend antes de Go si requiere `go:embed`. Lint/fallos heredados se
reportan separados; no se ocultan. Integración DuckDB usa runtime verificado;
Wails y corpus real son gates distintos. Coordinar exclusividad antes de builds,
UI o bancos en el PC compartido. No prometer verde por un test omitido.

Documentación viva, issue y `plan.md` se actualizan con lo efectivamente entregado;
el digest se genera desde la raíz Git con el comando canónico. No incrementar
porcentajes arbitrariamente ni convertir los hitos nuevos a feature antes de tiempo.

## 5. Cobertura y límites

| Spec | Fases |
|---|---|
| 1 alcance LMU, formatos ampliables y live diferido | F1, F7 |
| 2 asistente y reglas | F3, F4 |
| 3 originales, copia, correcciones y revisión | F1, F2, F5 |
| 4 calidad por cálculo y comparabilidad | F0, F2, F6 |
| 5 propuesta, restricciones, estimación y parciales | F4 |
| 6 owners y reutilización | Todas, comprobados en F0 |
| 7 errores y continuidad | F1, F4, F5 |
| 8 evidencia matemática y real | F0, F6 |
| 9 secuencia | Este maestro y microplan de F0 |

Riesgos principales: señales insuficientes para detectar incidentes, corpus sin
cobertura, sesgo al seleccionar solo vueltas rápidas, calidad distinta entre
familias y contratos actuales demasiado agregados para corregir muestras. F0
debe clasificarlos con evidencia antes de diseñar soluciones; una limitación
aceptada reduce el alcance declarado, nunca se tapa con datos inventados.
