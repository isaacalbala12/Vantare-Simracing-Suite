# ISA-1038 — revisión personal de Strategy

Fecha: 2026-09-08. Candidato: `4ce96ded2dc185f49034c1b303ba0251134d2a2c`.
Base de comparación: `nightly@d6d0992f`. Rama documental:
`vantareapp/isa-1038-strategy-review`. Ponytail + code-review-and-quality.
Revisión realizada personalmente; los dos subagentes iniciales fueron detenidos
por instrucción de Isaac y sus informes no se usan como evidencia.

## Veredicto

**NO-GO para iniciar las nuevas secciones.** La base tiene piezas reutilizables,
pero la salida de Orbit pierde garantías que sí comprueba el solver. No basta
con sustituir campos manuales por datos de DuckDB. Primero hay que corregir y
revalidar el recorrido completo del dato hasta el plan mostrado y guardado.

Esta entrega es revisión y propuesta de saneamiento: no contiene fixes. No
declara precisión empírica, óptimo de carrera validado ni aceptación Wails.

## Hallazgos accionables

Rutas relativas a `vantare-v2/`, líneas del candidato indicado.

### R1 · P1 · La edición posterior al solver invalida factibilidad y reserva — #1041

`internal/strategy/application/orbit_calculation.go:306` redistribuye las vueltas;
`:349-360` sustituye consumos y combustible por piloto/override; `:414` solo
recalcula el booleano de reserva si el último stint es manual.

- Reproducción `underfuel`: una vuelta necesita 1 L, se fija 0,1 L; devuelve
  plan, `overcapacity=false` y reserva final satisfecha. La reserva final no
  demuestra que se pueda llegar a ella.
- Reproducción `driver_reserve`: dos pilotos consumen 1 y 3 L/vuelta; el solver
  usa media 2. La salida tiene reserva efectiva 0,533 y requerida 0,8, pero
  `reserveSatisfied=true`.

Arreglo mínimo: evaluar la decisión final con los recursos/pilotos efectivos,
reutilizando `solver.ReplayDecisionV2` y el dominio existente. No copiar
factibilidad u optimalidad de una decisión diferente. Declarar la diferencia
entre plan editado viable y óptimo demostrado; cubrir también energía virtual.

### R2 · P1 · Las vueltas ignoran el tiempo de boxes — #1042

`internal/strategy/application/orbit_calculation.go:268-288` fija las vueltas con
`PitLoss=0`; `:393-398` suma después las paradas. Reproducción `timed_finish`:
carrera de 240 s, vuelta de 60 s y parada de 300 s; devuelve cuatro vueltas y
540 s. Las tres últimas comienzan a 360, 420 y 480 s, ya vencido el reloj.
No se denuncia simplemente que el total supere la duración: terminar la vuelta
en curso sí puede hacerlo bajo `TimedFinishCurrentLap`.

Arreglo mínimo: resolver conjuntamente horizonte, paradas y recursos con la
regla de llegada explícita. Reutilizar `manual.CalculateRace`; recortar vueltas
después del solver sin reevaluar servicios repetiría R1.

### R3 · P1 · Orbit elimina costes calculados por el solver — #1041

`internal/strategy/application/orbit_calculation.go:357` reconstruye cada tiempo
como vueltas por ritmo más ahorro. Omite la degradación calculada; `:397`
publica el total reconstruido. Reproducción `ReviewCost`: mismos cuatro giros,
mismo único stint, degradación de 2 s/vuelta: solver 252 s (12 s de degradación),
Orbit 240 s. Esto afecta tiempo, comparación y confianza en la estrategia.

Arreglo mínimo: una evaluación común del plan definitivo y su desglose. Añadir
paridad de totales con degradación y peso de combustible; no otro calculador.

### R4 · P2 · Boxes dentro de una vuelta no etiqueta esa vuelta — #1043

`internal/telemetryanalysis/lapvalidity.go:442-455` observa el estado de boxes
solo al final de la vuelta. Prueba del etiquetador: vuelta [60,120] s y boxes
[80,100] s produce etiquetas vacías y ritmo incluido. Otros filtros pueden
excluir determinadas vueltas, pero no reparan esta pérdida de información.

Arreglo mínimo: solapamiento de intervalos/eventos con las vueltas, con tests
de fronteras y varios giros. Mantener calidad por familia. La reproducción
demuestra la lógica; no demuestra frecuencia del caso en el corpus LMU.

### R5 · P2 · Catálogo restaurado y progreso pueden discrepar — #819

`internal/strategy/coldstart/service.go:124` acepta el estado persistido sin
compararlo con el catálogo. `:170-185` omite locators declarados importados.
Los backups de estado y catálogo avanzan por separado. Prueba de la frontera:
catálogo restaurado vacío + estado aceptado de una sesión devuelve importado=1,
sin oferta de importación; incluso `ImportNext` acaba sin llamar al importer.

Arreglo mínimo: reconciliación explícita entre sesiones realmente conservadas
y progreso, con identidad verificable. No borrar la decisión del usuario ni
volver a importar indiscriminadamente. Ya estaba pendiente en #819: no es una
regresión nueva descubierta tras declararla completa, porque sigue abierta.

### R6 · P1 · Datos de prueba se ofrecen como referencia normal — #445

`cmd/vantare/main.go:1558-1562` conecta `FixtureSignedV1` y claves TEST;
`internal/strategy/catalog/consumer.go:25-35` declara ese default. El fixture
versionado contiene `engineSourceHash=sha256:test-engine-source`, cifras y
procedencia `production-community`. `StrategyReferencePanel.tsx:39-57` muestra
referencias utilizables sin etiqueta de prueba. `strategy-reference-catalog.ts:39-41`
permite convertir esos valores en overrides efectivos.

Es una traza estática completa, no una captura de Wails. No se afirma un ataque
remoto: la URL del build normal está vacía. Arreglo mínimo: estado vacío en
producción mientras no exista catálogo real aprobado; fixtures solo en tests o
un modo de demostración inequívoco que no alimente planes reales. No requiere
publicar un catálogo, rotar claves ni abrir red.

Además, el panel enumera todas las combinaciones y `applyReferenceProfile`
no exige compatibilidad con el evento destino. #445 debe cubrir esa condición
antes de ofrecer referencias reales de otra combinación.

### R7 · P2 · Cancelar en la UI no cancela el trabajo de Go — #821

`frontend/src/strategy/strategy-application-client.ts`, métodos `cancel`,
`dispose` y callback de timeout, solo retiran listeners y rechazan promesas.
`internal/app/strategy_application_bridge.go:65` usa el contexto de aplicación.
`coldstart/service.go:142-232` conserva el mutex durante el lote. Hay timeout
por petición de reader (5/15/30 s), pero no deadline total por candidato; leer
muchas páginas puede prolongar la importación. `CalculateOrbit` sí tiene su
deadline Go de 8 s: no confundir ambas rutas.

Arreglo mínimo ya descrito en #821: deadline por candidato, propagación y error
tipado. No basta aumentar el timeout de interfaz. No se indujo un bloqueo de
disco, ni se abrió LMU para esta revisión.

## Cobertura y límites

Auditoría integral por flujos y fronteras, no afirmación de haber leído cada
línea de cada test. Incluye código existente, no solo los 16 archivos del diff
productivo acumulado (585 inserciones, 70 eliminaciones). El alcance central
inventariado contiene 180 archivos Go en Strategy y 63 en Analysis, incluidos
el adapter y la proyección. El conteo incluye tests; no es una métrica de
cobertura línea a línea.

| Flujo | Inspección personal y evidencia | Conclusión |
|---|---|---|
| Entrada y selección | Orbit, session/calendar selection, application/session_catalog, sessioncatalog | Identidades de combinación y selección explícita reutilizables; no normalizar coches por intuición. |
| Autorización/lectura | authorized_store, coldstart, startup factory, reader/client, staging y tests existentes | Original no cruza al helper, usa copia; runtime validado y protocolo limitado. #819/#821 siguen abiertos. |
| Calidad y derivados | lapvalidity, consumptionpace, derivedcurves, projectionproducer, contrato público y matriz #1030 | R4; MAD, tráfico, temperatura y separabilidad aún requieren validación empírica. |
| Cálculo | Orbit, manual/race/resources, SolveV2, dominancia, búsqueda simple, replay, costes, presupuesto, tyres/driver/weather | R1–R3. Solver reutilizable; no reemplazarlo entero. |
| Custodia | document_service, service Save/Activate, repository atomic/load/validation, contrato/hash, transfer/packaging y tests | Versionado optimista, hash, backup y reconciliación existentes; conservar. Hash válido no prueba corrección numérica. |
| Interfaz/contrato | cálculo latest-wins, lifecycle, cold-start banner/client, selección, reference panel y tests | R6/R7; la nueva revisión reproducible debe conservar entradas y procedencia. |
| Backtest | RunRace/replay, holdout, identity y validated_examples | Infraestructura útil; proveedor de carreras `nil` en startup. Sin holdout independiente suficiente; no prometer validación desde tests. |
| Superficies aplazadas | live engine, scenario, pilotprofile, curation upload/worker, catálogo | Inspección de fronteras/consentimiento y tests; no auditoría exhaustiva de live, servicio remoto o criptografía. Se mantiene aplazamiento acordado. |

Los probes son de caracterización: PASS significa que se reprodujo el defecto,
no que el producto esté correcto. `coldstart` usa un store de prueba para aislar
la incoherencia; la prueba no simula un corte físico de corriente. El probe de
boxes prueba el etiquetador y la política por familia, no todo el parser LMU.
Seis casos reproducidos: coste, bajo combustible, reloj, reserva entre pilotos,
catálogo/progreso y boxes. Están conservados como `.go.txt`, fuera de la suite
productiva, con salida en `reproductions.log`.

## Ponytail: qué reutilizar y qué evitar

1. Mantener Analysis como autoridad de lectura/derivación y Strategy como
   autoridad de plan. DuckDB queda en el adapter LMU, no en el contrato genérico.
2. Quitar el recálculo paralelo de costes/factibilidad de Orbit mediante la
   evaluación existente. Extraer funciones solo si elimina responsabilidades
   mezcladas; repartir el mismo algoritmo entre ficheros no arregla el problema.
3. No ampliar `StrategyOrbitPage` (más de 2200 líneas) con las nuevas pantallas.
   Separar el asistente y la pantalla editable por responsabilidad dentro de
   sus microplanes; no un framework de formularios/DSL ni un estado paralelo.
4. Recuperación: reconciliar identidades y progreso antes de introducir un
   gestor genérico de backups. Conservar cuarentena y errores explícitos.
5. Rendimiento: `readAllPages` acumula páginas de cada candidato y hasta cuatro
   importaciones corren simultáneas; cada Add reescribe catálogo+backup. Son
   riesgos de escala a medir, no mejoras de rendimiento demostradas ni permiso
   para añadir cachés o una nueva base de datos.

## Lo que es funcionalidad pendiente, no un bug nuevo

- Asistente nuevo, correcciones reversibles por sesión/stint/vuelta/subvuelta,
  calidad recalculada y formatos futuros: #1028/#1033 y fases aprobadas.
- Adapter de reglas/inventario/perfiles al solver: los tipos existen, Orbit
  no los rellena. Llevarlos a la siguiente fase de cálculo con contratos/tests.
- `TyreAgeCurve` separable no se consume en el solver; no basta que Analysis
  publique la familia para afirmar que el coste está integrado.
- La revisión visible captura evento/variante/resultado, pero no
  planningInputs, selección completa, hashes de fuentes/correcciones ni versión
  del motor (`StrategyOrbitPage.tsx:720-746`). Es custodia de lo mostrado;
  falta el contrato de reproducción exacta que exige el nuevo editor.
- Tráfico no equivale a incidente; los tests exigen conservar esas vueltas.
  No cambiar ese criterio sin la anotación y el acuerdo de #1030.
- No hay carreras completas independientes suficientes para el holdout de
  aceptación. El umbral 2% existente es provisional, no criterio aprobado.

## Orden concreto de saneamiento

1. #1041: plan final, recursos/reserva y coste; microcortes separados con RED.
2. #1042: horizonte temporal coherente con paradas y recursos.
3. #819: reconciliación y prueba Wails aislada; #821: deadline/cancelación.
4. #1043: boxes; #1030: protocolo/calibración sin inventar umbrales.
5. #445: sacar fixtures de la ruta real y verificar compatibilidad.
6. Revisión personal del diff y revalidación del recorrido completo. Solo
   entonces nuevas secciones según el maestro. Live/Monte Carlo después.

No autoriza resolver todo con un gran refactor. Las issues registran trabajo
pendiente; esta entrega no afirma que estén arregladas o integradas.

## Checks

- `go test ./internal/strategy/... ./internal/telemetryanalysis/... -count=1`:
  **20 paquetes PASS**. No equivale a `go test ./...` del repo completo.
- Probes: seis casos **reproducidos**, exit 0, log adjunto. Eliminados los
  archivos temporales de los paquetes tras conservar su texto.
- `pnpm --dir frontend exec vitest run src/hub/strategy-orbit src/strategy --maxWorkers=2`:
  **32 archivos / 273 tests PASS**, 33,10 s. Se ejecutó personalmente en
  `C:/tmp/vantare-isa819-recovery/vantare-v2`, mismo HEAD verificado y limpio,
  con sus dependencias existentes; sin modificar código ni instalar nada.
- Build/typecheck/lint/global frontend no repetidos: no cambia TS/Go productivo.
  Los resultados previos de #819 están en su evidencia, no son ejecuciones nuevas.
- Roadmap regenerado desde `origin/nightly`; `--check` devuelve «sin cambios».
  `git diff --check` PASS; no diferencias productivas contra `4ce96ded`.
- Sin Wails visual, replay real nuevo, carrera LMU, power-loss físico, carga de
  corpus, pentest ni benchmark. No se accedió a originales DuckDB o secretos.

Para reproducir en un worktree del candidato: copiar cada `.go.txt` al paquete
correspondiente como `isa1038_review_test.go`, comprobar antes que no exista,
ejecutar `go test` de esos tres paquetes con `-run TestISA1038Review -v -count=1`
y retirar solo esos ficheros temporales. Los casos esperan observar los fallos;
al corregirlos deben convertirse en regresiones que exijan el comportamiento
correcto, no conservarse como tests verdes de bugs.

Entrega documental local. Sin push, PR, CI remota, merge, promoción o release.
Acciones GitHub limitadas a las issues del trabajo autorizado.
