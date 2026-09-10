# Plan ejecutable y continuidad — SDD v1.0

[Especificación](README.md) · [Aceptación](acceptance.md) · ISA-1091.

## 1. Regla de avance

Al reanudar la implementación, recorrer las tareas siguientes en orden de
dependencia. Terminar un corte, un commit, un test, una review o una issue **no
es motivo para devolver el trabajo pidiendo permiso para continuar**. Informar
avance, registrar evidencia y pasar a la siguiente tarea autorizada. La petición
de consolidación no reactiva por sí sola la implementación pausada.

El flujo conserva pequeñas unidades de cambio sin convertirlas en pequeñas
unidades de aprobación. Spec, plan y tareas se consolidan en este paquete;
los gates ya satisfechos en el chat no se vuelven a pedir. Una ampliación real
de alcance se propone con evidencia antes de ejecutar la parte nueva.

### Siempre

1. Verificar raíz/HEAD/rama/worktree/status y issue antes de editar. Usar worktree
   aislado; el stack local puede continuar desde el corte anterior registrado.
   No desarrollar en checkout principal ni exigir promoción para continuar.
2. Leer requisito, código y tests de la tarea. Reutilizar antes de añadir.
   Confirmar archivos concretos en la issue. Una fila de la tabla es un paquete:
   si supera cinco paths de lógica/tests, dividirlo en cortes dependientes antes
   de tocar código. Esta división rutinaria no requiere otra consulta a Isaac.
3. Reusar issue existente cuando corresponde; crear issue hija si el corte no
   está cubierto. Cada una indica este SDD, IDs R/A/T, base exacta y pruebas.
   Mantener área/proyecto Vantare y contrato de roadmap. No duplicar #1089/#1030.
4. Bug: reproducción RED, corrección mínima y GREEN. Feature: casos observables
   del contrato antes/durante implementación. Ejecutar gates pertinentes.
5. Review personal de diff, errores, permisos, original intacto, coste y tests.
   Aplicar Ponytail/revisión de código al alcance de cada bloque; #1038 ya hizo
   la auditoría inicial, no repetirla como una fase vacía. El orquestador revisa
   personalmente el diff completo y la evidencia; el informe del ejecutor no basta.
6. Actualizar handoff único, evidencia, issue y roadmap cuando cambie estado
   público/alcance; regenerar JSON. Commit pequeño con staging explícito.
7. Si pasa: siguiente tarea. Si falla: diagnosticar/corregir dentro de alcance.
   No declarar verde parcial. Si un gate depende de dato/decisión ausente,
   bloquear ese gate y avanzar a la primera tarea independiente elegible.

### Autorización conservada

- Implementación, documentación, bugs necesarios del recorrido, pruebas,
  investigaciones acotadas, issues, ramas/worktrees y commits del alcance.
- Push/PR draft/CI permitidos por política dentro de issue; no son requisito
  para cada corte ni permiso de integrar. Mantener estado remoto verificable.
- PC/build/app/banco autorizados por Isaac, coordinando exclusividad vigente.
  Usar build/configuración canónicos; no leer/copiar .env ni secretos.
- LMU permanece intacto. Cerrar sólo instancias propias identificadas.
- La instrucción posterior de Isaac autoriza delegar código y pruebas en
  `opencode-go/muse-spark-1.3-contributor`, variante `xhigh`, mediante OpenCode.
  El orquestador conserva planes, decisiones de producto/arquitectura,
  documentación, issues, reparto de cortes y revisión personal. El ejecutor
  sólo edita los paths de código/tests asignados; no cambia planes ni delega.
  Un único ejecutor por worktree, sin ediciones concurrentes del orquestador.
  La revisión adversarial exclusivamente visual sigue siendo un gate distinto:
  si no está disponible, dejarlo pendiente, sin fingir nota.

### Detener sólo lo afectado

| Situación real | Acción antes de consultar |
|---|---|
| Dato de producto no inferible: tolerancia empírica o verdad de un incidente | Preparar propuesta comparada con evidencia y agrupar preguntas; continuar mecánica/UI independiente. |
| Dependencia nueva o cambio de owners/arquitectura | Agotar alternativa simple existente y presentar necesidad/impacto/rollback. |
| Base o trabajo ajeno en conflicto | Preservar cambios, documentar la discrepancia; no reset/switch del principal. |
| Fallo de causa todavía desconocida | Diagnosticar con reproducción; si no se puede explicar/verificar, detener ese corte y aportar evidencia. |
| Necesidad de muchísimos más archivos que el microcorte previsto | Dividir si sigue en este SDD; si aparece otro subsistema/alcance, presentar revisión concreta. |
| PC ocupado o acceso Wails/licencia no disponible | No interferir ni bypass. Hacer tareas sin runtime y reanudar al liberarse. |
| Nightly, master, release, gasto, datos reales irreversibles o secretos | Preparar entrega concreta; pedir autorización reservada. No inferirla de «continúa». |
| Rechazo automático de herramienta | Explicar acción y razón recibida; usar alternativa segura permitida, nunca eludir la protección. |

La falta de anotaciones completas impide certificar precisión; no impide
terminar editor, cálculo del modelo, documentación ni pruebas controladas.
No inventar un timeout de espera que transforme silencio en aprobación.

## 2. Orden y dependencias

```text
T00 baseline y matriz
 -> T01 reproducir/corregir timeout -> T02 entradas -> T03 estados/resultados
 -> T04 shell A4 -> T05 combinación -> T06 reglas -> T07 pilotos
 -> T08 biblioteca -> T09 copia/reapertura
 -> T10 valor/historial -> T11 usos -> T12 clasificación -> T13 límites
 -> T14 revisiones del plan -> T15 cálculo/resultado -> T16 stint -> T17 parada
 -> T18 integración visual -> T22 recorrido Wails -> T23 entrega

T00 -> T19 semántica/anotación -> T20 calibración -> T21 reserva/evaluación
T02/T03/T11/T12/T13/T15/T16/T17 -> T21
T18/T21/T22 -> T23 -> T24 investigación live (sin implementarla)
```

Ejecución secuencial por worktree, con el reparto de responsabilidades anterior. T19 puede
adelantarse entre cortes si necesita preparar datos o una decisión con antelación;
no abrir la reserva antes de T20. Si T01 necesita una decisión de presupuesto,
continuar T04–T14 con estados de cálculo honestos; no inventar resultados para UI.
Prioridad práctica: una reproducción acotada del bloqueo, después completar el
frente visual aprobado y su conexión. No posponer A4 detrás de refactors generales.

## 3. Backlog con salida comprobable

Cada paquete se divide sólo donde haga falta. Los paths de módulos son reales;
los archivos nuevos se nombran en la issue hija tras revisar consumidores.
Estimación S=1–2 y M=3–5 archivos de lógica/tests por microcorte. Documentación,
traducciones y evidencia asociadas no justifican ampliar silenciosamente lógica.

| ID / issue a reutilizar | Dependencias | Trabajo y archivos principales | Salida y verificación | Tamaño |
|---|---|---|---|---|
| T00 / #1091 y sucesora de ejecución | — | Inventario del stack, contratos y gates. `docs/strategy-planner/sdd/`, handoffs; lectura de código. | A17/A21: localizar implementado vs pendiente, verificar estado GitHub y registrar base. No rehacer #1066–1090. | S |
| T01 / #1089 | T00 | `application/orbit_calculation.go`, `solver/compute_budget.go` y ruta culpable demostrada; fixture/test Imola saneado. | RED del deadline; perfil y corrección con igual semántica, factibilidad/objetivo comparados, cancelación real. A12/A19. | M por corte |
| T02 / hijas #694 | T01 o baseline explicado | Adapter `orbitSolverInput` en aplicación, tipos/cliente y tests, por familia en cortes distintos. | Inventario campo a campo de reglas/pilotos/neumáticos/Fuel/VE; no defaults perdidos. A10/A11. | M por familia |
| T03 / hijas #694 | T02 | Resultado/evaluación final y bridge; TS separado si >5. | A12/A13: estados óptimo/factible/parcial/inviable/timeout y obsolescencia inequívocos; no éxito transitorio falso. | M |
| T04 / continuación #1063 | T00 | `StrategyOrbitPage.tsx`, componentes/styles Orbit por pantalla. | A04/A06: estructura A4 y sidebar comprimido; navegación real, vacíos/errores, referencias visuales mapeadas. Capturas antes de conectar más lógica. | M por pantalla |
| T05 / hija #1028 | T04 | `strategy-calendar-selection.ts`, eventos/selector y tests; persistencia aparte si falta snapshot. | A03/A05: calendario/personalizada en una Combinación, identidad correcta, volver conserva selección; sin feed no inventa evento. | M |
| T06 / hija #1028 | T05/T02 | UI reglas + contratos/application sólo donde inventario T02 muestre hueco. | A10: todas las reglas aplicables llegan al solver; ausencias y procedencia visibles; duración/vueltas distintas. | M por grupo |
| T07 / hija #1028 | T06/T02 | UI pilotos, perfiles/estimación y persistencia. | A11: delta s/vuelta versionado, disponibilidad/límites, ningún consumo/desgaste fabricado. | M |
| T08 / continuación #1088 | T05 | `StrategyRecordedSessions.tsx`, `strategy-recorded-session.ts`, cliente Analysis/catalog cuando necesario. | A01/A03: búsqueda automática de metadatos autorizados, propuestas compatibles, filtros, apertura explícita ≤4, cientos de filas usables y cancellation. | M por corte |
| T09 / fiabilidad existente #819/#821/#803 según hueco | T08 | Analysis source/store/service y UI en cortes separados. | A02/A15: copia opcional verificada, original ausente/cambiado, reapertura explícita/reinicio, runtime y permisos con causa. Reutilizar recuperación ya implementada. | M |
| T10 / continuación #1033 | T08 | UI Datos/Revisiones, `analysis-client.ts`, comandos escalares existentes. | A07/A08: cambiar valor real con motivo, guardar/cargar/restaurar, conflicto/guardado incierto, original y calidad intactos. | M por vista |
| T11 / hija #1033 | T10 | `corrections*`, clasificación/derivación por familia, servicio/cliente/UI en cortes. | A08/A09: excluir una vuelta de ritmo conserva Fuel/VE sanos; restaurar y propagar dependientes. No nuevo umbral. | M por capa |
| T12 / hija #1033 | T11 | Correcciones tipadas de clasificación y consumidores. | A08/A09: tipos/campos permitidos, cambio de identidad canónica invalida combinación; no autoriza datos ni cambia reloj. | M por capa |
| T13 / hija #1033 | T12/T19 semántica necesaria | Corrección de límite, segmentos/derivados y UI avanzada. | A08: anclajes temporales reales, rechazar ambigüedad/solape, recomputar familias, restaurar sin mutar fuente. | M por capa |
| T14 / continuación C7 #1033 | T10 y operaciones presentes | `document/`, `repository/`, aplicación y vista Revisiones en cortes. | A15/A16: aceptar snapshot completo, editar genera borrador desactualizado, reiniciar reproduce revisión exacta; fuente ausente sólo bloquea derivación. | M por corte |
| T15 / hija #1028 | T03/T06/T07/T14 | Carrera/Cálculo/Plan A4 y cliente cálculo. | A12/A13: propuesta real, explicación de entradas/recursos/incertidumbre, cancelación y guardado explícito. Sin escenarios generales de ahorro. | M por pantalla |
| T16 / hija #1028 | T15 | Detalle stint, constraints y tests solver/cliente separados. | A14: fijar piloto/duración/arrastrar límite, validar, recalcular y mostrar coste frente a óptimo comparable. Alternativa accesible al arrastre. | M por corte |
| T17 / hija #1028 | T16 | Detalle parada, servicio y evaluación final existente. | A14: cantidades y reservas reales, paralelismo/secuencia según reglas, no doble conteo de tránsito/servicio, ventana obligatoria. | M por corte |
| T18 / continuación #1063 | T04–T17 | Capturas y revisión visual de cada pantalla/estado; fixes acotados productivos. | A06: >9/10 individual en revisión adversarial visual y evidencia comparable; i18n/teclado/resoluciones. Solicitud agrupada de revisión humana al completar recorrido. | M por corrección |
| T19 / #1030 | T00 | Corpus de preparación, relojes, anotaciones y protocolo existentes. | A09/A19: matriz señal/familia/condición, casos adjudicados independientes, desconocidos explícitos; fuentes reservadas intactas. | S por informe/caso |
| T20 / #1030 | T19 | Informe de calibración, criterios y regresiones de Analysis por familia. | A19: medir contaminación/descarte/errores; propuesta agrupada de umbrales/N a Isaac; congelar antes de evaluar. Ajustes implementados sólo tras decisión aplicable. | M por criterio |
| T21 / #1030 | T20 + modelo final | Backtests/replay/evaluación con carreras completas reservadas, sin fuga futura. | A19: métricas preregistradas y suficiente muestra; separar matemáticas/empírico; FAIL/inconcluso no se convierte en PASS. | M por banco |
| T22 / hija de gate #439 | T18 y flujo funcional | E2E/Wails real, runtime/cuenta de distribución y casos de fallo; medir coste. | A01–A18: recorrido, guardar/reiniciar, copia/error, hashes, cancelación, memoria/tiempo; fixture/CDP/diagnóstico separados de producción. | M por escenario |
| T23 / issue de entrega | T18/T21/T22 | Informe final, handoffs, roadmap, PR draft/CI si procede. | Todos los gates con artefacto; revisión humana visual y autorización de integración pendientes separadas. Sin merge automático. | S |
| T24 / seguimiento live #436 y diseño posterior | T23 aceptación del registrado | Investigación OSS y SDD live, no código live. | A20: comparación extensa con fuentes primarias, licencias y experimentos, recomendación sobre incertidumbre/Monte Carlo; nueva decisión de arquitectura. | S por informe |

T24 no bloquea entregar el editor registrado y no se marca completado por una
búsqueda superficial. Los números históricos del programa live deben verificarse
en GitHub antes de elegir la issue; no abrir duplicadas usando títulos antiguos.

## 4. Comandos verificables

Desde el directorio `vantare-v2` del worktree de la issue. Ejecutar sólo lo que
corresponde al cambio; no volver a ejecutar suites intactas sin razón después
de aprobar el corte. En cada combinación final de cambios, sí correr gates completos.

```powershell
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend typecheck
pnpm --dir frontend run test --maxWorkers=2
pnpm --dir frontend lint
pnpm --dir frontend build
go test ./...
go vet ./internal/app ./internal/strategy/... ./internal/telemetryanalysis/... ./cmd/vantare
git diff --check
```

`pnpm typecheck` usa `tsc -b --noEmit`; nunca `tsc -p tsconfig.json` solution-style.
Build frontend antes de Go cuando falten assets embebidos. Usar gofmt sobre Go
modificado. Cache Go aislada si hay conflicto reproducido del entorno, sin limpiar
cache compartida ni cambiar instalación. No instalar dependencias nuevas.

Desde la raíz Git, regenerar roadmap con base protegida comprobada:

```powershell
python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly
```

Banco nativo opt-in existente, tras seleccionar fuente de **preparación** y
runtime autorizado mediante el procedimiento documentado, sin abrir secretos:

```powershell
go test ./internal/app -run "^TestRecordedStrategyRealDuckDB$" -count=1 -v
```

Confirmar nombre exacto con búsqueda del test antes del banco; sin
`ISA1088_REAL_SOURCE`/`ISA1088_RUNTIME_APP` se omite y no cuenta como PASS real.
No usar `ISA1088_EXPORT_CATALOG` contra datos de usuario ni una app abierta.
El banco controla autorización/repo y no sustituye la aceptación de licencia.

Build/arranque de distribución: seguir `docs/release-artifacts.md` y procedimiento
canónico vigente del repo, verificar ruta antes de ejecutar. No reproducir aquí
comandos que incrusten secretos. Un binario diagnóstico sin tags production
puede probar UI/reader, pero se etiqueta como tal y no cierra A18 distribución.

## 5. Formato mínimo de evidencia por corte

```text
Tarea Txx / requisitos Rxx / aceptación Axx / issue
Base, rama, HEAD, worktree y archivos
Caso reproducido o comportamiento nuevo
RED -> cambio -> GREEN (si bug)
Checks con comando, exit code, omisiones y causa
Artefacto real/fixture/prototipo y sus límites
Riesgos; criterio de rollback; siguiente tarea elegible
Commit/push/PR/CI y promoción realmente alcanzados
```

Rollback del corte mediante revert acotado del commit, conservando fuentes y
revisiones. No reset destructivo ni eliminación de datos como recuperación.
Si cambia un contrato persistido, especificar compatibilidad o rechazo explícito
y cómo volver al binario anterior sin perder datos nuevos antes de implementarlo.

## 6. Decisiones que pueden necesitar a Isaac

No queda una nueva elección de diseño, simulador, motor o arquitectura para
empezar. Pendientes acotados:

1. **Calibración:** tolerancias/N tras mediciones; se prepara una propuesta única.
2. **Verdad de incidentes:** sólo casos sin evidencia suficiente; agrupar para
   adjudicación o conservar desconocidos y continuar con otros casos.
3. **Aceptación visual final:** recorrido completo tras >9/10, no pantalla por
   pantalla como bloqueo de implementación. La primera aprobación A4 se conserva.
4. **Promoción/publicación:** autorización separada sobre entrega concreta.

Si las fuentes de preparación bastan, no preguntar por más archivos. Si la
reserva no basta para certificar, demostrar qué combinaciones/casos faltan y
seguir todo trabajo independiente. No terminar el desarrollo con «faltan datos»
cuando todavía hay UI, integración o tests implementables.
