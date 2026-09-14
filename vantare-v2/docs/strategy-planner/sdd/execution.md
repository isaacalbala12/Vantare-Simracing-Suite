# Plan ejecutable y continuidad — SDD v1.2

[Especificación](README.md) · [Aceptación](acceptance.md) · ISA-1091.

## 0. Punto de reanudación comprobado — 2026-09-14

Corte auditado: `c2d5b45b43bbf8ff0efb2cd16f1598f7a4925eff`, rama
`vantareapp/isa-1104-recorded-classification`, worktree `C:/tmp/vantare-isa1104`.
T12 está cerrado **localmente**; esto no significa que T00–T12 estén aceptados
como conjunto. La cabecera del [handoff](../../vantare-program/handoffs/strategy-planner.md)
prevalece sobre sus notas históricas de «siguiente corte».

| Paquete | Estado comprobado y trabajo que se conserva | Cierre restante |
|---|---|---|
| T00/T01 | SDD y corrección local del coste repetido de pit #1089; regresión Imola existente. | Revalidación nativa y presupuesto del modelo completo en T22; no reabrir el algoritmo sin reproducción. |
| T02/T03/T06/T07 | Reglas transportadas en #1092; T02d1 #1222 añade horizonte por vueltas; T02d2a #1224 transporta capacidad/reservas; T02d2b #1225 fija cargas en SolverV2, T02d2c #1226 las conecta a CalculateOrbit Go y T02d2d #1227 adapta el evento TypeScript desde el asistente. T02e backend #1228 acredita curvas/vida derivadas y conecta inventario físico explícito; T02e3 #1229 alinea su contrato TypeScript y T02e4 #1230 lo custodia en el borrador recorded y lo transporta sin convertir agregados. T02f1 #1231 transporta el desglose explícito de parada al modelo único del solver, T02f2 #1232 separa el tiempo de formación en reloj, conducción y horizonte, T02f3a #1233 alinea el cliente TypeScript y T02f3b #1234 custodia ambos datos en el borrador recorded y los adapta al evento. T02g1 #1235 aplica el perfil del único piloto antes de optimizar cuando existen límites; T02g2a #1236 permite que SolverV2 conserve una secuencia cíclica opcional sin perder su selección libre; #1238 mantiene el presupuesto para secuencias largas con pilotos equivalentes; T02g2b #1237 conecta perfiles y secuencia desde Strategy; T02g3 #1246 distingue rotación fija y selección libre por vueltas en CalculateOrbit; T03a #1248 distingue cancelación de deadline, T03b #1249 evita colisiones de comandos entre montajes, T03c #1250 espera las entradas derivadas cuando hay telemetría seleccionada, T03d #1251 rechaza optimalidad desconocida y T03e #1252 conserva presupuesto agotado en escenarios meteorológicos; T07a #1240 edita máximos continuo y total, T07b #1241 añade mínimo/máximo de vueltas, T06a #1242 edita ventanas obligatorias de pit, T06b #1243 compuestos obligatorios, T06c #1244 compuestos permitidos por clima y T07c #1245 indisponibilidad por vueltas en los contratos existentes; duración, Fuel/VE, paradas, nombres y delta ya están presentes. | T03a–e queda cerrado sobre el contrato actual. Resolver disponibilidad horaria sin convertirla por ritmo medio; conectar selector de orden, modo libre temporal, plan parcial y optimalidad final en T15; clima individual sigue en #1239. Una pantalla presente no cierra la familia. |
| T04/T05/T08/T09 | Shell/asistente unificado, biblioteca paginada, apertura explícita, configuración guardada/reabierta. | Paridad final T18, recuperación/copia y reinicio real T22; reutilizar servicios existentes y resolver sólo gaps observados. |
| T10/T11 | Valor, uso por familia e historial de fuente implementados; bancos reales previos. | T11i visual/nativo pendiente; recuperación duradera de comandos y revisión completa del plan en T14/T22. |
| T12 | Clasificación tipada e identidad canónica v4; J9 Imola→Monza 23.99 s y Monza→Imola 35.98 s, hashes intactos. | Gate visual/nativo compartido T18/T22; J9 no demuestra precisión empírica ni cálculo completo. |
| T13–T18 | T13a–e cerrado localmente; T14a #1254 conserva la entrada exacta del cálculo, T14b #1255 la abre por referencia en Go sin fuente, T14c #1257 exige esa misma referencia en el cliente TypeScript, T14d #1259 publica todas las referencias históricas sin payloads, T14e #1260 permite consultar cada resultado exacto, T14f #1261 recupera el comando completo de corrección y T14g #1263 hace lo mismo con `save_revision`. T15a1 #1264 conecta el criterio de orden recorded y T15a2a #1265 prepara conjuntamente las revisiones exactas sin duplicar el evento. | Completar estimaciones/input/ciclo/resultado T15, stint/parada y paridad. |
| T19–T21 | Inventario y protocolo #1030; preparación expuesta identificada. | Semántica/anotación, calibración y reserva suficiente de carreras completas; A19 sigue pendiente. |
| T22/T23 | Bancos nativos sin GUI existen; WebView2 `ERROR_INVALID_STATE` reproducido en T11i. | Diagnóstico acotado, recorrido de distribución, aceptación y entrega verificable. |
| T24 | Aplazado por decisión de producto. | Investigación live sólo tras aceptación del registrado; no implementación live. |

Evidencia de los gaps: [matriz T02](../evidence/isa-1092/README.md),
`StrategyRecordedRules.tsx`, `StrategyRecordedDrivers.tsx` y el panel Plan de
`StrategyRecordedWorkflow.tsx` bajo `frontend/src/hub/strategy-orbit/`.
No repetir T12 ni declarar terminadas las entradas sólo por su posición en el DAG.

**Siguiente corte elegible:** T15a2a obtiene de Analysis una proyección conjunta exacta y validada para el borrador, sin crear un Event paralelo ni combinar sesiones en React. T15a2b debe conservar en Go el delta explícito entre pilotos después de resolver el ritmo observado; T15a2c llevará la condición temporal al solver antes de habilitar selección libre. Después T15b conecta calcular/cancelar y T15c el resultado parcial, la optimalidad final y aceptar/guardar separados. A12/A13 siguen abiertos. La disponibilidad horaria legacy necesita otra referencia temporal y permanece pendiente. La aceptación visual permanece en T18 y el recorrido Wails en T22.
En paralelo lógico, preparar inventario T02 restante y preflight documental T22a;
la ejecución física sigue siendo de un único escritor por worktree.

## 1. Regla de avance

Al reanudar la implementación, recorrer las tareas siguientes en orden de
dependencia. Terminar un corte, un commit, un test, una review o una issue **no
es motivo para devolver el trabajo pidiendo permiso para continuar**. Informar
avance, registrar evidencia y pasar a la siguiente tarea autorizada. Isaac ya
autorizó iniciar el alcance y continuar su ejecución; no existe pausa por corte.

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
- Push/PR draft/CI se rigen por la autorización vigente del chat y AGENTS.md;
  este plan no amplía permisos. El corte auditado no tiene push/PR/CI remota.
- Los bancos sin GUI con fuentes de preparación y runtime confiado están
  autorizados. Para app/build de escritorio, respetar la coordinación e
  instrucción vigente del PC; en la revisión documental actual no se ejecutan.
  No leer/copiar .env ni secretos. LMU permanece intacto y sólo se cierran
  procesos propios identificados.
- El proveedor de ejecución es una elección operativa, no un contrato de
  producto. Tras comprobar que las sesiones SWE-2 Max consumían mucho contexto
  sin producir cambios, Isaac aceptó que el orquestador ejecute directamente
  los cortes para no bloquear el avance. Devin queda disponible sólo si aporta
  una ventaja concreta; no usar OpenCode. Astra puede asesorar cuando la
  solución simple no esté clara, sin convertir su informe en aceptación.
- Ante `resource_exhausted`, sesión perdida o adaptador no disponible, conservar
  archivos/logs y comprobar estado antes de reintentar. No lanzar bucles de
  sesiones ni duplicar trabajo. El orquestador puede ejecutar localmente el
  corte ya cerrado si el adaptador bloquea, registrando el relevo y comprobando
  que el ejecutor anterior está detenido. No cambia el contrato ni los gates.
- Un único escritor por worktree, sin ediciones concurrentes de orquestador y
  ejecutor. La revisión adversarial exclusivamente visual sigue siendo un gate
  distinto: si no está disponible, dejarlo pendiente, sin fingir nota.

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
BASE local T12 c2d5b45b + capacidades previas (no aceptación integral)
  -> T19a semántica temporal -> #1208 alineación LMU -> T13a contrato -> T13b..e límites
  -> T14a..g revisiones reproducibles y comandos recuperables

T02 restante -> T06 reglas completas / T07 perfiles y conducción -> T03a-e contrato actual cerrado
T14 + T02/T03/T06/T07 cerrados -> T15a..c cálculo/plan
T15 -> T16a..b stint -> T17a..b parada -> T18 paridad completa

T19a -> T19b anotación -> T20a preparación -> decisión umbrales/N
  -> T20b congelación -> T21a..b evaluación reservada del modelo final
T13/T15/T16/T17 cerrados -> T21b

T22a diagnóstico/preflight temprano (sin bloquear implementación independiente)
T18 + flujo funcional -> T22b..c Wails/distribución
T18/T21/T22 -> T23 entrega y aceptación -> T24 investigación live
```

Prioridad: T13c-e, después completar entradas/reglas/pilotos/estados pendientes
antes de conectar T15; la mecánica T14 puede avanzar desde T10, pero su cierre
integra las operaciones T13 soportadas. Adelantar
preparación/anotación y diagnóstico del gate nativo entre cortes para no descubrir
esos bloqueos al final. No abrir resultados de reserva antes de congelar T20 y
el modelo final que se evalúa. Si falta adjudicación/umbral, continuar UI,
integridad y pruebas matemáticas; la certificación empírica queda pendiente.

## 3. Backlog con salida comprobable

Cada paquete se divide sólo donde haga falta. Los paths de módulos son reales;
los archivos nuevos se nombran en la issue hija tras revisar consumidores.
Estimación S=1–2 y M=3–5 archivos de lógica/tests por microcorte. Documentación,
traducciones y evidencia asociadas no justifican ampliar silenciosamente lógica.

| ID / issue a reutilizar | Dependencias | Trabajo y archivos principales | Salida y verificación | Tamaño |
|---|---|---|---|---|
| T00 / #1091 y sucesora de ejecución | — | Inventario del stack, contratos y gates. `docs/strategy-planner/sdd/`, handoffs; lectura de código. | A17/A21: localizar implementado vs pendiente, verificar estado GitHub y registrar base. No rehacer #1066–1090. | S |
| T01 / #1089 | T00 | `application/orbit_calculation.go`, `solver/compute_budget.go` y ruta culpable demostrada; fixture/test Imola saneado. | RED del deadline; perfil y corrección con igual semántica, factibilidad/objetivo comparados, cancelación real. A12/A19. | M por corte |
| T02 / #1092 y cortes ligados | T01 o baseline explicado | Adapter `orbitSolverInput` en aplicación, tipos/cliente y tests, por familia en cortes distintos. | Inventario campo a campo de reglas/pilotos/neumáticos/Fuel/VE; no defaults perdidos. A10/A11. | M por familia |
| T03 / #1248–#1253 | T02 | Contrato actual de resultado, evaluación final, bridge y obsolescencia. | Cerrado localmente: factible no probado, inviable, cancelado, timeout, presupuesto agotado, respuesta vigente y carga pendiente. Plan parcial y optimalidad final pasan a T15; A12/A13 siguen abiertos. | M |
| T04 / #1093; referencia visual #1063 | T00 | `StrategyOrbitPage.tsx`, componentes/styles Orbit por pantalla. | A04/A06: estructura A4 y sidebar comprimido; navegación real, vacíos/errores, referencias visuales mapeadas. Capturas antes de conectar más lógica. | M por pantalla |
| T05 / #1094 | T04 | `strategy-calendar-selection.ts`, eventos/selector y tests; persistencia aparte si falta snapshot. | A03/A05: calendario/personalizada en una Combinación, identidad correcta, volver conserva selección; sin feed no inventa evento. | M |
| T06 / hija #1028 | T05/T02 | UI reglas + contratos/application sólo donde inventario T02 muestre hueco. | A10: todas las reglas aplicables llegan al solver; ausencias y procedencia visibles; duración/vueltas distintas. | M por grupo |
| T07 / hija #1028 | T06/T02 | UI pilotos, perfiles/estimación y persistencia. | A11: delta s/vuelta versionado, disponibilidad/límites, ningún consumo/desgaste fabricado. | M |
| T08 / #1095; base #1088 | T05 | `StrategyRecordedSessions.tsx`, `strategy-recorded-session.ts`, cliente Analysis/catalog cuando necesario. | A01/A03: búsqueda automática de metadatos autorizados, propuestas compatibles, filtros, apertura explícita ≤4, cientos de filas usables y cancellation. | M por corte |
| T09 / fiabilidad existente #819/#821/#803 según hueco | T08 | Analysis source/store/service y UI en cortes separados. | A02/A15: copia opcional verificada, original ausente/cambiado, reapertura explícita/reinicio, runtime y permisos con causa. Reutilizar recuperación ya implementada. | M |
| T10 / #1096; contrato #1033 | T08 | UI Datos/Revisiones, `analysis-client.ts`, comandos escalares existentes. | A07/A08: cambiar valor real con motivo, guardar/cargar/restaurar, conflicto/guardado incierto, original y calidad intactos. | M por vista |
| T11 / #1099; contrato #1033 | T10 | `corrections*`, clasificación/derivación por familia, servicio/cliente/UI en cortes. | A08/A09: excluir una vuelta de ritmo conserva Fuel/VE sanos; restaurar y propagar dependientes. No nuevo umbral. | M por capa |
| T12 / #1104; contrato #1033 | T11 | Correcciones tipadas de clasificación y consumidores. | A08/A09: tipos/campos permitidos, cambio de identidad canónica invalida combinación; no autoriza datos ni cambia reloj. | M por capa |
| T13 / hija #1033 | T12/T19 semántica necesaria | Corrección de límite, segmentos/derivados y UI avanzada. | A08: anclajes temporales reales, rechazar ambigüedad/solape, recomputar familias, restaurar sin mutar fuente. | M por capa |
| T14 / continuación C7 #1033 | T10; cierre integral con T13 y operaciones presentes | `document/`, `repository/`, aplicación y vista Revisiones en cortes. | A15/A16: aceptar snapshot completo, editar genera borrador desactualizado, reiniciar reproduce revisión exacta; fuente ausente sólo bloquea derivación. | M por corte |
| T15 / hija #1028 | T02/T03/T06/T07/T14 | Carrera/Cálculo/Plan A4 y cliente cálculo. | A12/A13: propuesta real, explicación de entradas/recursos/incertidumbre, cancelación y guardado explícito. Sin escenarios generales de ahorro. | M por pantalla |
| T16 / hija #1028 | T15 | Detalle stint, constraints y tests solver/cliente separados. | A14: fijar piloto/duración/arrastrar límite, validar, recalcular y mostrar coste frente a óptimo comparable. Alternativa accesible al arrastre. | M por corte |
| T17 / hija #1028 | T16 | Detalle parada, servicio y evaluación final existente. | A14: cantidades y reservas reales, paralelismo/secuencia según reglas, no doble conteo de tránsito/servicio, ventana obligatoria. | M por corte |
| T18 / nueva issue de validación; referencia #1063 | T04–T17 | Capturas y revisión visual de cada pantalla/estado; fixes acotados productivos. | A06: >9/10 individual en revisión adversarial visual y evidencia comparable; i18n/teclado/resoluciones. Solicitud agrupada de revisión humana al completar recorrido. | M por corrección |
| T19 / #1030 | T00 | Corpus de preparación, relojes, anotaciones y protocolo existentes. | A09/A19: matriz señal/familia/condición, casos adjudicados independientes, desconocidos explícitos; fuentes reservadas intactas. | S por informe/caso |
| T20 / auditoría #1030; ajuste productivo en hija | T19 | Informe de calibración, criterios y regresiones de Analysis por familia. | A19: medir contaminación/descarte/errores; propuesta agrupada de umbrales/N a Isaac; congelar antes de evaluar. Ajustes implementados sólo tras decisión aplicable. | M por criterio |
| T21 / #1030 | T20 + modelo final | Backtests/replay/evaluación con carreras completas reservadas, sin fuga futura. | A19: métricas preregistradas y suficiente muestra; separar matemáticas/empírico; FAIL/inconcluso no se convierte en PASS. | M por banco |
| T22 / nueva issue de validación recorded | Preflight desde T00; cierre tras T18 y flujo funcional | E2E/Wails real, runtime/cuenta de distribución y casos de fallo; medir coste. | A01–A18: recorrido, guardar/reiniciar, copia/error, hashes, cancelación, memoria/tiempo; fixture/CDP/diagnóstico separados de producción. | M por escenario |
| T23 / issue de entrega | T18/T21/T22 | Informe final, handoffs, roadmap, PR draft/CI si procede. | Todos los gates con artefacto; revisión humana visual y autorización de integración pendientes separadas. Sin merge automático. | S |
| T24 / nueva issue de investigación tras aceptación | T23 aceptación del registrado | Investigación OSS y SDD live, no código live. | A20: comparación extensa con fuentes primarias, licencias y experimentos, recomendación sobre incertidumbre/Monte Carlo; nueva decisión de arquitectura. | S por informe |

T24 no bloquea entregar el editor registrado y no se marca completado por una
búsqueda superficial. GitHub verificado al 13-09: #439 (gate integral antiguo) y
#436 (replanificación live) están cerradas y no autorizan estos nuevos cortes.
#1063 es prototipo, #1033 es contrato documental y #1030 es auditoría/tooling:
reutilizar su evidencia, no ejecutar producto bajo un alcance incompatible.
Buscar sucesoras vigentes antes de crear las issues T13–T24 que falten.

## 3.1 Cortes restantes y condiciones de salida

Las letras son subcortes de los IDs estables, no nuevas fases. Cada uno recibe
issue vigente, base exacta y hasta cinco paths de lógica/tests confirmados tras
leer consumidores. Esta tabla fija comportamiento y orden; no autoriza elegir
archivos a ciegas ni ampliar el alcance de una issue histórica documental.

| Orden / corte | Entrega concreta | Gate para pasar al siguiente |
|---|---|---|
| 1 · T19a | Auditar en preparación el eje temporal de muestra/vuelta/stint: unidad, origen, resets, segmentos, duplicados, límites inclusivos/exclusivos y correspondencia con boxes. Producir matriz de anclas soportadas y casos desconocidos. | Al menos caso válido y rechazo por discontinuidad/ambigüedad con identidad exacta; no etiqueta de trompo deducida de lentitud. Si la señal no soporta una edición, esa capacidad queda no disponible, con causa. |
| 1b · #1208 | Alinear canales continuos LMU al reloj de eventos mediante `GPS Time`, corregir cobertura y sustituir el join ordinal de `fuel_jump`. | RED/GREEN S125/S266/S026; sin stints fantasma ni muestreo desplazado; ausencia o puente inválido fallan cerrados; banco real con hashes intactos. |
| 2 · T13a / #1211 · cerrado localmente | Contrato mínimo de `set_stint_boundary` y `remove_stint_boundary`: sólo límites originales, ancla directa `lap_event`, validación compartida, snapshot/versión y rollback. Distingue límite observado Analysis de restricción del plan T16. | Decisión, compatibilidad v1–v4, consumidores y RED de T13b fijados en `stint-boundary-corrections-t13.md`; sin otro motor de segmentación. |
| 3 · T13b / #1212 · cerrado localmente | Tipos, constructor y validación pura en dos paths. | RED/GREEN para target, reloj, cobertura, forma, colisión, inversión, frontera terminal, orden e inmutabilidad; sin persistencia ni derivados. |
| 3b · T13c / #1214 · cerrado localmente | Representación y custodia: guardado mixto con valor/uso/clasificación, replay/Resolve/Restore, cuota y guardado incierto. | Snapshots anteriores sin cambio de bytes/digest; rechazo atómico de conflicto y grupos desconocidos; rollback preserva historial. |
| 4 · T13d→e / #1216/#1220 · cerrado localmente | Vista/derivación, servicio, contrato TS, cliente, edición avanzada e historial sobre el flujo existente. | Mover o retirar recalcula dependientes, conserva invariantes/original y se guarda, recupera, restaura, proyecta y adopta por las rutas existentes. A08 local; visual/nativo en T18/T22. |
| 5 · T02d→g + T06/T07 | T02d1 #1222 y T02d2a–d #1224–#1227 cierran localmente horizonte y recursos; T02e #1228–#1230 inventario/curvas; T02f #1231–#1234 servicios/formación; T02g1 #1235 conecta el perfil único, T02g2a #1236 añade una secuencia multipiloto opcional, #1238 conserva su presupuesto, T02g2b #1237 conecta perfiles/secuencia y T02g3 #1246 distingue fijo/libre por vueltas en CalculateOrbit; T07a/T07b #1240/#1241 editan tiempo/vueltas, T06a #1242 ventanas de pit, T06b #1243 compuestos obligatorios, T06c #1244 compuestos por clima y T07c #1245 indisponibilidad por vueltas sin duplicar contratos. T15 conectará el selector recorded y resolverá el modo libre temporal; la disponibilidad horaria permanece separada. #1239 conserva pendiente el clima individual. | Cada campo respaldado llega al solve y evaluación final o se rechaza con razón; cero/ausente/no aplicable distintos. Delta entre pilotos sólo altera ritmo. No promedio que elimine límites, inventario o perfiles antes de optimizar. |
| 6 · T03 / cerrado localmente | T03a #1248 distingue cancelación y timeout; T03b #1249 evita colisiones entre montajes; T03c #1250 espera las entradas derivadas; T03d #1251 valida optimalidad; T03e #1252 conserva presupuesto agotado con clima; T03f #1253 reconcilia el cierre sin fabricar estados. | El contrato actual distingue factible no probado, inviable, cancelado, timeout y presupuesto agotado; descarta respuestas antiguas y no anuncia éxito durante la carga. Plan parcial y optimalidad final quedan en T15; A12/A13 permanecen abiertos. |
| 7 · T14a→g | T14a #1254 guarda la entrada exacta usada por el resultado y detecta A→B. T14b #1255 abre A por referencia completa mediante el bridge Go tras reabrir el repositorio, sin fuente ni fallback. T14c #1257 transporta esa referencia en el cliente TypeScript y rechaza una respuesta válida ausente o distinta. T14d #1259 enumera todas las referencias sin cargar payloads. T14e #1260 permite elegir y consultar A desde Mis estrategias aunque no exista borrador. T14f #1261 conserva y recupera el comando completo de corrección con autoridad vigente. T14g #1263 custodia `save_revision`, lo resuelve contra la revisión inmutable aunque HEAD avance y exige decisión explícita en Orbit. | A15/A16 cerrados localmente: aceptar A, crear B, cerrar/reabrir A exacta con reglas/pilotos/constraints/versiones/resultado; fuente ausente conserva consulta, no derivación. Sin sustituir por HEAD/base ni reintentar escritura incierta a ciegas. |
| 8 · T15a→c | T15a1 #1264 conserva el criterio fijo/libre, secuencia/candidatos y mapeo exacto de variante; legacy equivale a fijo. T15a2a #1265 solicita la proyección conjunta de las revisiones exactas mediante el productor Analysis existente, sin escritura ni segunda autoridad. Continuar con delta entre pilotos, horizonte libre temporal y entrada completa/readiness; después ciclo calcular/cancelar y resultado explicable con aceptar/guardar separados. | A12/A13 y E01/E02 controlados: propuesta real, unidades/recursos y procedencia, incertidumbre y límites; estados parciales/finales comprobados, sin tarjeta decorativa ni fórmula alternativa en React. Comparación matemática acotada y replay. |
| 9 · T16a→b | Constraints y evaluación de stint; después detalle/arrastre/teclado con obsolescencia y selección sincronizada. | Mismo cambio por drag/teclado produce mismo constraint, respeta piloto/tiempo/Fuel/VE/neumático; comparación sólo con mismo modelo/fuentes/reglas y causa de inviabilidad visible. |
| 10 · T17a→b | Servicios y recursos de parada; después detalle productivo y recálculo. | Tránsito separado de servicio, concurrencia o secuencia según reglas, cantidades/inventario/ventanas y reservas validadas sin doble conteo. E07 sobre decisión final, no sólo preview. |
| Transversal · T19b | Anotar preparación de forma independiente para invalidada sana, incidente, lentitud sana, pits y condiciones; conservar desconocidos y procedencia por familia. | Matriz señal/familia/condición y acuerdo/incertidumbre; no consumir holdout para explicar o ajustar casos. Puede avanzar mientras se completa UI. |
| Transversal · T20a→b | Medir criterio actual y candidatos; informe con contaminación/descarte/cobertura/error, coste y propuesta agrupada de umbrales/N. Tras decisión aplicable, implementar sólo el ajuste aprobado y congelar versiones. | Una propuesta concreta para Isaac; baseline, intervalos por carrera y límites. Antes de evaluación: hashes, split/deduplicación, selección, versiones, métricas y N registrados. Sin umbral aprobado, seguir resto y conservar A19 inconcluso. |
| 11 · T21a→b | Primero verificar reserva suficiente sin mirar sus resultados; después ejecutar modelo final congelado, replay y backtests sin fuga futura. | A19 con informe de métricas/N/intervalos y fallos; no contar Imola/Monza expuestos como holdout. Muestra insuficiente es inconclusa; si se ajusta tras evaluar, nueva reserva antes de volver a certificar. |
| 12 · T18 | Capturas comparables de asistente, Carrera, Datos avanzado, Cálculo, Plan, Revisiones, Stint y Parada en estados obligatorios; corregir y repetir. | >9/10 **cada pantalla**, revisión exclusivamente visual separada, teclado/escalado/ES-EN-PT-IT; conjunto ordenado para Isaac. Sin nota agregada que esconda fallo. |
| Transversal · T22a | Inventariar bloqueo WebView2 con logs/PID/configuración ya disponibles, procedimiento canónico y plan de reproducción acotado. La reproducción GUI se ejecuta sólo cuando la instrucción vigente del PC lo permita. | Causa demostrada o diagnóstico inconcluso con siguiente prueba; no declarar solucionado por cambiar puerto/perfil sin comparación, no cerrar procesos ajenos. Las correcciones fuera de Strategy reciben issue propia. |
| 13 · T22b→c | Recorrer E01–E08 en Wails real: primero diagnóstico autorizado y luego configuración de distribución/licencia; guardar/reiniciar, copia/original ausente, cancelación, errores y volumen. | A01–A18 aplicables con hashes, logs/capturas saneados, recursos liberados y tiempos/memoria; tres repeticiones si se compara rendimiento. Un banco de reader o fake de authorizer no cierra distribución. |
| 14 · T23 | Consolidar informe de A01–A19/A21 y E01–E08, diff/reviews/handoff/roadmap/issues; preparar entrega aislada y, cuando esté autorizado, PR/CI. | Sin P0/P1 del recorrido ni criterios pendientes ocultos; aceptación visual y empírica registradas. Reconciliar stack con base remota actual sin reescritura destructiva; gates sobre SHA final. No marcar integrado/publicado por cierre local. |
| Posterior · T24a→c | Inventario OSS con fuentes primarias y licencias; comparar algoritmos/replay/Monte Carlo/calibración/coste y experimentos reproducibles; informe y propuesta SDD live. | Recorded aceptado antes de iniciar. Separar permiso de estudiar, reutilizar código y cambiar arquitectura; no código live ni nueva dependencia antes de decisión. Investigación extensa con límites y recomendación, no lista de enlaces. |

## 3.2 Checkpoints de orquestación

- **C0 — listo para límites:** T19a aporta anclas comprobadas, #1208 elimina
  la mezcla de relojes y T13a cierra contrato/issue. Si no hay ancla
  defendible, declarar capacidad no disponible
  y continuar entradas/revisiones; no fabricar timestamps para desbloquear UI.
- **C1 — listo para calcular:** T13/T14 y matriz T02/T06/T07/T03 cerrados
  localmente. El orquestador contrasta payload real, persistencia y replay antes
  de asignar T15; no basta el aspecto del asistente.
- **C2 — recorrido funcional:** T15/T16/T17 pasan casos observables y
  matemáticos; las vistas finales están listas para T18 y E2E.
- **C3 — evidencia de aceptación:** T18, T21 y T22 con artefactos del mismo
  corte aplicable. Bloqueos de muestra, WebView2 o distribución siguen visibles;
  trabajo local implementado puede revisarse sin llamarlo producto terminado.
- **C4 — entrega:** T23 distingue listo para aceptación, aceptado, PR/CI,
  integración y publicación. Una aprobación de visuales no autoriza promoción.

Tras cada corte: informe del ejecutor → comprobar diff y logs → actualizar único
handoff/issue → commit acotado → elegir siguiente corte elegible. No detener el
programa por completar una casilla. Consultas humanas agrupadas sólo para
umbrales/N, incidentes realmente indeterminados, aceptación final y promociones.

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
