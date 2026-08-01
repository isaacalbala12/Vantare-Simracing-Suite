# Strategy Planner unificado — plan maestro por microcortes

**Fecha:** 2026-08-01
**Autoridad:** ISA-134 / STR-00, ADR 0006 y contrato global de producto
**Base inicial:** `ISA-117@170eaebbaa6744019ead96a2c78201b4da2fb9bb`
**Referencia histórica:** `codex/strategy-product-a@b9f1937`
**Estado:** listo para ejecución después de review de STR-00

## Objetivo

Construir un único Strategy Planner capaz de crear, calcular, comparar,
guardar, ejecutar y adaptar planes de carrera en modo manual, asistido y live,
con neumáticos físicos, Fuel y Virtual Energy separados, riesgo explícito e
integraciones seguras con Telemetry Analysis, Telemetry Core, Engineer y
Overlays.

## Reglas para cada worker

1. Leer `AGENTS.md`, `docs/current-plan.md`, `docs/agent-workflow.md`, el
   handoff Strategy, ADR 0006 y esta sección del plan.
2. Verificar rama, base y worktree limpio antes de editar.
3. Una issue, una rama, un worktree y un PR draft.
4. TDD: escribir o identificar primero la prueba observable que protege el
   comportamiento.
5. No ampliar el alcance ni rescatar rutas de Product A fuera de la matriz.
6. No leer Shared Memory, REST, DuckDB ni archivos LMU desde Strategy.
7. No presentar estimaciones como mediciones ni estrategias como óptimas sin
   prueba.
8. Actualizar handoff/current-plan y dejar evidencia en Linear.
9. Ejecutar review propio; el orquestador asigna revisión independiente.
10. No promover a `nightly`, `testers` ni `master` dentro de estos cortes.

## Gate común de salida

- Criterios de aceptación de la issue completos.
- Tests focales verdes y `git diff --check`.
- Go: `gofmt` y tests de paquetes tocados; `go test ./...` si cambia contrato
  compartido.
- Frontend: tests focales, suite completa y build si cambia UI/contratos.
- Playwright para todo cambio visual o flujo integrado.
- Sin dependencias nuevas salvo decisión explícita.
- Sin P0/P1/P2/P3 razonable en review independiente.
- Commit/push/PR draft, Linear y handoff actualizados.

## Mapa de dependencias

```text
STR-01 -> STR-02 -> STR-03 -> STR-04
                    |          |
                    +-> STR-05 -> STR-06 -> STR-08 -> STR-09
                                      \       /
                                       STR-07

Telemetry Analysis projection -> STR-10 -> STR-11
STR-05/06/08/09/11 -> STR-12 -> STR-13 -> STR-14
STR-03/04/13 -> STR-15 -> STR-16
Telemetry Core projection + STR-16 -> STR-17 -> STR-18
STR-18 -> STR-19 and STR-20
all implementation cuts -> STR-21 -> STR-22
```

Los cortes independientes con dependencias satisfechas pueden ejecutarse en
paralelo, pero nunca sobre el mismo worktree.

---

## Milestone STR-01 — Rescate controlado

### STR-01 — Rescate selectivo y caracterización de Product A

**Objetivo:** traer únicamente los fixtures, tests y piezas permitidas que
reduzcan riesgo sin introducir integraciones obsoletas.

**Incluye:**

- Lista permitida exacta desde la matriz de rescate.
- Copia selectiva de fixtures y tests de caracterización.
- Namespace temporal claramente histórico si el contrato aún no es final.
- Reproducción de todos los resultados Product A documentados.
- Registro de cualquier diferencia contra `b9f1937`.

**No incluye:** HubApp, topbar, locales, CSS global, settings, Calendar, access
policy, solver como autoridad ni merge/cherry-pick por rango.

**Tests:** Go de estrategia y fixtures; frontend focal solo si se rescata una
prueba de flujo; guard que enumera los archivos importados.

**Entrega:** branch limpia con una matriz `origen -> destino -> motivo`; cero
integración productiva todavía.

## Milestone STR-02 — Núcleo de documentos

### STR-02 — Contrato unificado, unidades y estados

**Objetivo:** definir `PlanDraft`, `PlanRevision`, `ActivePlan`,
`StrategyExecutionState`, `ReplanProposal` y errores/capabilities versionados.

**Decisiones cerradas:** Fuel y VE son tipos incompatibles; el draft es mutable,
la revisión inmutable y la activación atómica; cada campo derivado conserva
procedencia/confianza.

**Tests:** round-trip, migrations iniciales, invariantes, property tests de
unidades, hash reproducible y compilación espejo TypeScript.

### STR-03 — Persistencia local, recuperación y galería privada

**Objetivo:** almacenar documentos Strategy con migraciones, recuperación de
borrador, revisiones y galería `Mis planes`.

**Incluye:** escritura atómica, backup/rollback, duplicación, etiquetas, filtro
por simulador/circuito/coche/evento, borrado seguro y límites.

**No incluye:** sesiones de telemetría, cuenta cloud ni comunidad.

**Tests:** corrupción/interrupción, dos escritores, migration fixtures,
recuperación tras cierre y borrado sin afectar archivos externos.

### STR-04 — Servicio de aplicación, comandos, dirty y undo/redo

**Objetivo:** una única fachada de aplicación y un store frontend que separen
draft, snapshot guardado, activo y ejecución.

**Comandos mínimos:** crear, abrir, editar, guardar revisión, duplicar, activar,
desactivar, undo, redo, restaurar y cerrar.

**Tests:** idempotencia, orden de comandos, rechazo de versión obsoleta, dirty
correcto, recovery y ninguna mutación desde eventos de telemetría.

## Milestone STR-03 — Planificador manual

### STR-05 — Cálculo manual de carrera, recursos y pit

**Objetivo:** endurecer vueltas/tiempo, Fuel, VE, reservas, repostaje, ahorro y
servicios de pit.

**TDD obligatorio:** oráculos manuales documentados para carrera por vueltas y
tiempo; límites cero; vuelta final; capacidad; recursos insuficientes; servicio
paralelo/secuencial; repairs/penalties opcionales.

**Restricción:** ningún preset LMU se declara real sin procedencia.

### STR-06 — Inventario físico de neumáticos

**Objetivo:** modelar cada neumático individual, desgaste, estado, origen,
compuesto, stints y esquina persistente.

**Incluye:** máximo individual, clasificación 80–90 % o valor exacto, mezclas,
estado libre/montado/usado/descartado y rangos 40–70 % cuando no hay datos.

**Tests:** no mover entre esquinas después del primer uso, duplicados,
inventario insuficiente, mixed compounds y trazabilidad de estimación.

### STR-07 — Shell visual y navegación del workspace

**Objetivo:** implementar la experiencia casi 1:1 del HTML de referencia.

**Pantallas:** galería, importación/entrada, revisión, workspace de tres
columnas, comparación y guardado.

**Columnas:** estrategias a la izquierda; stints en el centro; inventario y
entrada manual a la derecha. Wide/medium/compact sin reinterpretar proporciones.

**Tests:** componentes, accesibilidad, teclado, estados empty/error/loading y
Playwright con capturas de referencia. El harness debe arrancar/parar solo y
tener timeout diagnóstico; no se regenera baseline para ocultar diferencias.

### STR-08 — Editor de stints y drag and drop de neumáticos

**Objetivo:** construir, insertar, duplicar, reordenar y eliminar stints, y
arrastrar neumáticos explícitamente a FL/FR/RL/RR.

**Tests:** pointer/teclado, cancelación, corner lock, inventario agotado,
undo/redo, scroll, touchpad y estado tras reload.

### STR-09 — Entrada rápida, tabla avanzada y fuel-save

**Objetivo:** permitir promedios manuales simples y una tabla por vuelta sin
convertir Strategy en una herramienta de análisis.

**Incluye:** Fuel/VE, consumo, ritmo, desgaste, pit loss, reparaciones y
penalizaciones. Correcciones de los inputs Strategy son no destructivas.

**Tests:** cálculos de ahorro por stint y total, unidades, rangos, formato,
validación y actualización coherente de tarjetas.

## Milestone STR-04 — Planificación asistida

### STR-10 — Adapter de StrategyInputProjection

**Objetivo:** consumir la proyección histórica publicada por Telemetry Analysis.

**Precondición:** contrato versionado de Analysis disponible. Si no existe, la
issue documenta el schema requerido y queda bloqueada sin crear un parser local.

**Incluye:** selección de sesión/vueltas, capabilities, procedencia,
compatibilidad, freshness y ausencia de datos. Nunca SQL ni rutas LMU.

**Tests:** fixtures de contrato, versiones compatibles/incompatibles, missing,
invalid y no leakage de almacenamiento privado.

### STR-11 — Derivados de planificación y confianza

**Objetivo:** convertir la proyección en consumos, ritmos, desgaste, pit loss y
rangos adecuados para Strategy.

**Incluye:** filtros de vueltas inválidas/out/in/SC/FCY, promedios robustos,
correcciones del usuario sobre el input del plan y explicación de procedencia.

**Tests:** datos escasos, outliers, condiciones incompatibles, intervalos y
reproducción determinista.

## Milestone STR-05 — Optimizador y escenarios

### STR-12 — Solver determinista v2 y auditoría de escenarios

**Objetivo:** reemplazar el solver Product A con un motor que minimice tiempo
total esperado bajo restricciones físicas y de evento.

**Debe incluir:** ritmo, degradación, Fuel, VE, pit, neumáticos físicos,
reparación/penalización opcional y constraints. Cada resultado explica por qué
es válido y cómo se calculó.

**TDD:** oráculos pequeños exhaustivos, invariantes, property/fuzz tests,
comparación contra enumeración y fixtures históricos. Nunca etiquetar “óptimo”
si el espacio no fue cubierto o la prueba no lo demuestra.

### STR-13 — Variantes, robustez y comparación

**Objetivo:** presentar rápida, robusta y conservadora, rango probable,
supuestos, riesgo y diferencia frente a activa.

**Incluye:** tres principales, variantes guardadas adicionales, sensibilidad a
consumo/ritmo/desgaste/pit y comparación visual.

**Tests:** ranking estable, empates, rangos, escenarios dominados, explicación
y accesibilidad.

### STR-14 — Reglas de evento y escenarios dinámicos

**Objetivo:** incorporar seco/lluvia, SC/FCY, daños, penalizaciones, reparación,
duración efectiva y eventos de Calendar sin inventar datos.

**Incluye:** reglas versionadas, manual fallback y procedencia. Monte Carlo solo
si un benchmark demuestra valor; de lo contrario, escenarios deterministas y
análisis de sensibilidad.

**Tests:** matriz por escenario, cambios de reglas y degradación segura ante
capability ausente.

## Milestone STR-06 — Galería y ejecución live

### STR-15 — Galerías, revisiones y paquetes compartibles

**Objetivo:** separar `Vantare`, `Comunidad` y `Mis planes`.

**Incluye:** planes oficiales firmados/versionados, publicación comunitaria
voluntaria, privacidad por defecto, import/export local, metadatos de
compatibilidad y retirada por autor.

**No incluye:** publicar automáticamente planes privados.

### STR-16 — Activación y lifecycle del plan

**Objetivo:** activar atómicamente una revisión, conservar plan anterior,
versionar cambios y ofrecer rollback.

**Tests:** doble activación, restart, revision mismatch, rollback, draft dirty y
lectores concurrentes.

### STR-17 — Motor de ejecución live

**Objetivo:** consumir `StrategyLiveProjection v1` de Telemetry Core y mantener
stint, recursos, desviación y próxima acción sin adquirir LMU.

**Precondición:** proyección Core disponible. Si falta una señal, publicar
missing/stale y continuar parcialmente.

**Tests:** replays, epoch/reset, duplicados, out-of-order, stale, reconexión,
backpressure y cero valores inventados.

### STR-18 — Replanificación y aceptación

**Objetivo:** detectar cambios de consumo, desgaste, clima, SC/FCY, daño,
penalización, parada o duración; explicar impacto y proponer una revisión.

**Regla:** sin aceptación explícita se mantiene el plan anterior. Aplicar una
propuesta es idempotente y deja auditoría.

**Tests:** propuesta, rechazo, timeout, dos propuestas, cambio de epoch y
explicación de consecuencia.

### STR-19 — Contrato Engineer y Pit Manager

**Objetivo:** permitir que Engineer comunique/provoque propuestas y que Pit
Manager ejecute solo acciones seguras y confirmadas.

**Incluye:** comandos versionados, confirmación voz/UI, feedback de resultado y
capability. Ningún acceso al store privado.

### STR-20 — Read model y widgets Strategy

**Objetivo:** exponer a Desktop/OBS datos de solo lectura: stint, próxima
parada, Fuel/VE, neumáticos, fuel-save, desviación y próxima acción.

**Tests:** paridad Desktop/OBS, stale/missing, licencia, rendimiento y ausencia
de dependencias del editor.

## Milestone STR-07 — Gate y cutover

### STR-21 — Calidad integral, replays y rendimiento

**Objetivo:** cerrar accesibilidad, cuatro idiomas, diagnósticos, privacidad,
errores, onboarding, benchmarks, soak y E2E.

**Matriz mínima:** manual sin telemetría, histórico completo/parcial, live,
reconexión, parrilla grande, Overlay+Engineer+Strategy simultáneos, 24 h lógico,
Windows 10/11, wide/medium/compact.

**Evidencia:** resultados de tests, capturas, perfiles, drops/latencia, paquete
diagnóstico sanitizado y limitaciones reales.

### STR-22 — Cutover y retirada histórica

**Objetivo:** activar el producto unificado y retirar UI/código Product A solo
después de paridad y consumidores cero.

**Incluye:** auditoría estática/dinámica, migraciones, rollback, retirada de
flags/adapters temporales, documentación y checklist manual.

**Stop condition:** esta issue no promociona. Entrega la rama completa para que
Isaac la valore; la promoción a `nightly` es una issue posterior y explícita.

## Definición de producto completo

El módulo está técnicamente listo para revisión manual cuando:

- crea y guarda planes manuales sin telemetría;
- consume Analysis/Core únicamente por contratos públicos;
- gestiona neumáticos individuales, Fuel y VE correctamente;
- calcula y compara variantes explicables con riesgo;
- adapta un plan live sin cambiarlo silenciosamente;
- integra Engineer y Overlays mediante comandos/read models;
- conserva privacidad local, migraciones y rollback;
- todos los gates STR-21/22 pasan y no quedan hallazgos razonables abiertos.
