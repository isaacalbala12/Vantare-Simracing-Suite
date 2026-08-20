# 10 — Matriz de decisión (Agente H)

Fecha: 2026-08-19. Entradas: 01–08, `bench/results/*`, la revisión cruzada 09 y las verificaciones de código propias marcadas **[VERIFICADO-H]** en 09.

Las puntuaciones parciales de los agentes son **entrada, no resultado**: A puntuó la actual 74/100, B la simplificada 83/100, E dio 11/20 y 16/20 en fiabilidad, F dio 8/14/15 sobre 18 en mantenibilidad LLM, C dio 9/18 y 15/18 en multi-sim, G puntuó su Opción D en 89/100. Cada celda de esta matriz es un arbitraje propio con su evidencia.

**No se usa LOC como indicador de complejidad.** Los indicadores efectivos son: sitios de edición coherente por señal, número de cursores independientes, número de autoridades por concepto, bytes y milisegundos por frame medidos, caminos plausibles pero muertos, y escenarios que fallan de forma insegura (09 §6).

---

## 1. Las cuatro opciones, definidas con precisión

| Opción | Definición operativa |
|---|---|
| **A — Mantener actual con pequeñas correcciones** | Se conserva la topología (driver → fusion → mapper → reducer → coordinator → derive → 4 proyecciones → hubs → adapter legacy → widgets). Correcciones acotadas: borrar código sin llamador, `failStop` selectivo, subir o eliminar el límite de payload, evicción del presupuesto de vehículos, watchdog de edad, propagar `freshness` al widget. **No** se cambia la frontera de commit ni el contrato del frontend |
| **B — Simplificación fuerte** | `SimDriver → SourceFrame → TelemetryEngine (reducer+coordinator+derive fusionados) → un `OverlayFrame` único → un publisher → un store → widgets`. Se borran catálogo, subpaquetes `schema/*`, `projection.Field`, `core.Fanout`, RFC7396, seal, escáner de claves, `projection/analysis`, hub de Strategy, write path de Recording, adapter legacy y `TelemetrySnapshot` |
| **C — Híbrida (recomendada)** | Se conserva el núcleo semántico: `schema.Field`, identidad con generaciones, reducer single-writer, derivaciones Go, facts, replay, catálogo, fusión (generalizada a N fuentes) y proyecciones **por producto**. Se cambian: la **frontera de commit** (una sola transacción `Engine.Apply` con prepare/commit), la **publicación** (fuera del commit, un Publisher parametrizado, status dentro del frame, latest-wins, cadencias por sección reguladas antes de serializar), los **consumidores** (Engineer y Recording asíncronos y acotados; Strategy aislada y sin transporte público hasta tener Planner), el **borde de producto** (builders Go de ViewModels por feature → `OverlayFrame v2` compacto; contrato TS generado desde los tipos wire Go) y el **frontend** (se retiran adapter legacy, `TelemetrySnapshot` e histories duplicadas). Se elimina el código sin consumidor (`core.Fanout`, RFC7396, seal, Analysis live, `statusRevision` contigua) |
| **D — Alternativa de G** | C **más**: catálogo declarativo promovido a **fuente de generación** de `CanonicalState`, matriz de autoridad y capabilities; **registry** de señales; y partición del wire en **tres tiers** de cadencia con cursores independientes |

C y D **no son direcciones opuestas**: C incorpora las fases 0–2 de D (borrar lo muerto, generar el contrato TS, generar la exhaustividad de la matriz de autoridad). La diferencia es exactamente **cuánto se genera y cuándo**, y si se parte el wire ahora.

---

## 2. Ponderación

Se mantienen los pesos del encargo sin ajuste. Justificación explícita de por qué **no** los muevo, teniendo la licencia de ±3:

- Subir "corrección" por el incidente de 104 coches sería sesgo retrospectivo: ya pesa 20, el máximo del cuadro, y el hallazgo se refleja en las **notas**, no en el peso.
- Subir "rendimiento" tampoco: lo medido no es un problema de CPU sino de forma del payload, y eso está contabilizado en corrección (fallo terminal) y en rendimiento a la vez.
- Bajar "coste de migración" beneficiaría mecánicamente a las opciones más ambiciosas justo en la dimensión donde el proyecto tiene menos evidencia (nadie ha migrado un widget). Se deja en 6 y se explora en §8 (sensibilidad).

| Criterio | Peso |
|---|---:|
| Corrección semántica y fiabilidad | 20 |
| Extensibilidad multi-simulador | 18 |
| Mantenibilidad por agentes LLM | 18 |
| Rendimiento y consumo de recursos | 15 |
| Facilidad de añadir widgets/señales | 10 |
| Testabilidad y observabilidad | 8 |
| Coste y riesgo de migración | 6 |
| Preparación futura sin anticipación excesiva | 5 |

---

## 3. Resultado

| Opción | Corrección /20 | Multi-sim /18 | LLM /18 | Rend. /15 | Widgets /10 | Test /8 | Migración /6 | Futuro /5 | **Total** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **A — Mantener actual** | 13 | 12 | 9 | 9 | 4 | 5 | 5 | 3 | **60** |
| **B — Simplificación fuerte** | 16 | 15 | 14 | 13 | 9 | 6 | 3 | 3 | **79** |
| **C — Híbrida** | **18** | 16 | **16** | 13 | 9 | 7 | **5** | 4 | **88** |
| **D — Registry generado + tiers** | 17 | **17** | 15 | 13 | 9 | 7 | 2 | **5** | **85** |

---

## 4. Opción A — Mantener la arquitectura actual con pequeñas correcciones

### Corrección semántica y fiabilidad — **13/20**

**Evidencia a favor.** `schema.Field[T]` hace inexpresable el bug del delta negativo documentado en `docs/delta-best-live-inventory.md` (02 §1); `NewField` rechaza construir un campo presente con `FreshnessMissing` (`quality.go:56-58`); TTL con reloj monotónico, no wall-clock (`fusion.go:442-450`); `forceStale` propaga staleness a toda la parrilla (`fusion.go:207`); cero aliasing hacia consumidores, con clon en construcción y en cada lectura (`envelope/types.go:49-64`); atomicidad por componente real y testeada; absorción tipada de frames no mapeables tras un incidente histórico.

**Evidencia en contra.** No hay frontera transaccional de sistema: cinco propietarios de estado con cinco cursores, y `coord.Apply`/`derive.Apply` devuelven error **después** de que el reducer haya commiteado **[VERIFICADO-H]** (`telemetry_core_runtime.go:642-652` vs `reducer.go:137`), lo que produce `ErrStaleBatch` en bucle hasta `setTerminal` (D-01). `failStop` es terminal e irreversible por causas transitorias (D-02). 104 coches rechazados por el transporte, medido a partir de 103 **[MEDIDO]** (D-08). Presupuesto acumulativo de 104 identidades sin evicción (D-04). Una fila ausente un frame genera identidad nueva y, si es el player, borra `ControlsHistory` y la referencia de delta (D-03). La frescura se congela y el status `error` no llega porque `failStop` cierra los hubs antes (D-06). `statusRevision` contigua sobre un canal que coalesce (D-07). Engineer síncrono bajo mutex compartido con la UI **[VERIFICADO-H]**. Cero `recover()` en todo el pipeline **[VERIFICADO-H]**.

**Por qué 13 y no 11 (E) ni 15 (A).** Cuatro de los ocho defectos (D-02, D-04, D-06, D-08) **sí** son parcheables dentro de esta opción sin mover fronteras. D-01 y D-03 no: exigen cambiar quién commitea y cómo se decide la identidad, que es precisamente lo que A define como intocable.

**Ventajas.** El núcleo está terminado y verde; ninguna clase de bug ya cerrada se reabre. **Inconvenientes.** Preserva dos modos de fallo terminales por causas transitorias y el colapso de calidad en el último salto (`fieldIsUsable`). **Incertidumbre.** Media: no está demostrado que `failStop` selectivo sea suficiente sin tocar el orden de commit.

**A 6 meses.** Se entrega LMU sin sobresaltos salvo con parrillas grandes; la deuda del frontend crece con cada señal. **A 2 años.** Con dos simuladores, `TelemetrySnapshot` habrá acumulado más alias y nombres paralelos; retirarlo será mucho más caro que hoy.

### Extensibilidad multi-simulador — **12/20→/18: 12/18**

**Evidencia.** A favor: `driver.Descriptor`/`Capability`, matriz de autoridad versionada, catálogo con `LedgerExistingUnproduced`, `architecture_test.go:130` ya contempla `drivers/iracing`, y hay código escrito pensando en iRacing (`format.go:366`). En contra: el composition root declara `DriverManager[lmu.Observation]` y `*lmu.BatchMapper` como tipos concretos, el sink habla LMU, `IsUnmappableFrame` es de LMU y `SourceStatus` fija `Kind:"lmu"` **[VERIFICADO-H]**; el manifiesto de capabilities de Engineer está hardcodeado a `Supported` para las siete (`:170-178`); `capabilities()` del Overlay **infiere** capability de la disponibilidad del dato por frame **[VERIFICADO-H]**, y ese array no lo lee nadie en el frontend.

**Por qué 12 y no 9 (C) ni 14 (A).** La mitad inferior del stack es genuinamente agnóstica en forma; la superior la colapsa. C castiga de más al no acreditar el diseño; A acredita el diseño sin descontar que **nunca se ha ejercido**.

**Ventajas.** Las fronteras difíciles (drivers aislados, schema neutro) ya existen. **Inconvenientes.** La declaración de capabilities está rota en las tres capas a la vez. **Incertidumbre.** Alta: no hay segundo driver.

**A 6 meses.** iRacing exigiría reescribir el composition root de todas formas. **A 2 años.** Los widgets ya leen `place`, `inPits` y una jerarquía WEC cableada (`HYPERCAR/LMP2/LMP3/GT3`); con dos sims eso es divergencia visible para el usuario.

### Mantenibilidad LLM — **9/18**

**Evidencia.** A favor: `architecture_test.go` parsea el AST de todo el árbol y falla con `archivo:línea` y la frontera cruzada — es el mejor activo del repositorio para agentes; `ValidateDefinitions` rechaza ciclos y productores duplicados; los tests TS leen los goldens Go directamente. En contra: 21 saltos y 18 archivos de producción entre el offset y el píxel (07 §1.1); **47 archivos y cinco nombres para el mismo escalar** (09 C-08); 1.533 líneas de `Fanout` que un agente tomará por el camino vivo; `scoring: Record<string, unknown>` con 101 lecturas por string y 16 claves que el adapter nunca escribe pero los mocks del Studio sí — **un camino de verificación que confirma comportamiento falso**; documentación obligatoria de ~13.400 líneas con contradicciones activas contra el wiring real.

**Por qué 9 y no 8 (F).** Añado un punto por la limpieza de código muerto que A sí incluye, que es exactamente el hallazgo de mayor riesgo de F.

**Ventajas.** Guardarraíles de import ejemplares e intactos. **Inconvenientes.** Guardarraíles fuertes en una dimensión y ninguno en las dos donde un LLM se equivoca de verdad: dónde se calcula y qué nombres existen. **Incertidumbre.** Baja: es lo mejor medido de la investigación.

**A 6 meses.** Cada señal nueva repite el peaje. **A 2 años.** El coste por señal crece con cada producto y cada sim añadido.

### Rendimiento — **9/15**

**Evidencia [MEDIDO].** El pipeline Go cabe en presupuesto (proyección+marshal 1,013 ms de media a 104 coches, dentro de 16,67 ms). Pero Overlay v1 mide 269.573 B a 104 coches → **15,43 MiB/s a 60 Hz**, cruza el límite del Hub, y el frontend gasta 5,89 ms de media y 7,94 ms p99 en parse+decode+adapter, de los cuales ~1,68 ms son el adapter legacy. Publicar el full a 60 Hz serializa standings, sesión y clima que no cambian a esa frecuencia.

**Ventajas.** Ningún cambio, ningún riesgo de regresión. **Inconvenientes.** Subir el límite es mitigación, no arquitectura; el gasto del frontend se mantiene íntegro. **Incertidumbre.** Alta en el valor absoluto (Node ≠ WebView2; benchmark combinado sin perfilar), baja en el orden de magnitud relativo.

**A 6 meses.** Aceptable con parrillas de 20–40 coches. **A 2 años.** Con enduro de 62+ coches y un segundo producto vivo, el presupuesto del frontend se agota.

### Facilidad de añadir widgets/señales — **4/10**

**Evidencia.** Señal medida: 47 archivos, 7 puntos de contacto obligatorios en Go, tres saltos de re-tipado en TS, 4 locales i18n y 6 matrices de documentación mantenidas a mano. Widget con señales existentes: **0 archivos Go** —el mejor caso del sistema— pero ~20 archivos de frontend, de los cuales 11 no rompen la compilación si se olvidan.

**Ventajas.** El caso "widget sobre señal existente" ya es barato en backend. **Inconvenientes.** El caso "señal nueva" es el más caro medido de la investigación. **Incertidumbre.** Baja: está medido sobre un diff real.

### Testabilidad y observabilidad — **5/8**

**Evidencia.** 453 tests, 19 benchmarks, 17 goldens, paridad de replay por digest en dos pacings, trazas reales de LMU (1.846 muestras), relojes y backoff inyectables. En contra: **ninguno** de los seis fallos críticos tiene test, y todos son fallos *entre* componentes; no hay test de 104 coches; `Metrics()` y `HubMetrics` no tienen lectores productivos; ningún golden tiene flag `-update`; buena parte de lo testeado no se ejecuta en producción, lo que **infla la sensación de cobertura**.

### Coste y riesgo de migración — **5/6**

Es la opción más barata por definición. No es 6/6 porque `failStop` selectivo, evicción y watchdog tocan el único archivo por el que pasa el 100 % de la telemetría productiva, con 3 goroutines, 2 mutexes y una máquina de ciclo de vida.

### Preparación futura — **3/5**

`engineer/boundary.go` es previsión genuina y correcta. Strategy, Analysis y recording son infraestructura escrita confundida con producto conectado: eso es deuda disfrazada de preparación.

---

## 5. Opción B — Simplificación fuerte

### Corrección — **16/20**

**A favor.** Una sola frontera de commit elimina de raíz D-01 y la clase entera "un consumidor mata al productor"; el status dentro del frame elimina D-07 y la ventana en blanco del escenario 20; el full snapshot puro hace que "perder secuencias" deje de ser un concepto para el estado continuo; Engineer y Recording desacoplados hacen invisible la latencia de un consumidor.

**En contra.** Fusionar reducer, coordinator y pipeline **no crea atomicidad por sí solo**: hay que preservar cada invariante con su test, y B lo reconoce como el paso de riesgo medio de su plan. Se pierden dos defensas en profundidad (seal in-process y escáner de claves prohibidas) a cambio de tipado, que es una permuta razonable pero real. Latest-wins hace que "el frame que se ve" no sea determinista bajo carga, lo que complica la paridad de replay que hoy sí está bien cubierta. Y B propone borrar el catálogo, que es la única fuente declarativa desde la que se puede generar exhaustividad (09 C-10).

**Ventajas.** Ataca directamente los dos defectos que más duelen. **Inconvenientes.** Simplifica también donde la complejidad expresa semántica real. **Incertidumbre.** Alta: no existe implementación vertical productiva del Engine único.

**A 6 meses.** Entrega más rápida si la migración se controla widget a widget; un big bang produciría regresiones. **A 2 años.** Probablemente reintroduzca proyecciones por producto y versionado independiente que hoy elimina; B estima esa probabilidad en 30 % y yo la subo a ~45 % dado que Strategy ya tiene contrato escrito.

### Multi-simulador — **15/18**

`SourceFrame` + `Capabilities` declaradas por driver es correcto y es la dirección. Se descuenta por dos cosas: el `OverlayFrame` único tiende al superset por acumulación (todo campo nuevo va ahí, sin frontera que obligue a preguntarse a qué producto pertenece), y la afirmación "cero archivos existentes modificados" para un sim nuevo es **factualmente falsa** con el composition root actual (09 C-15).

### Mantenibilidad LLM — **14/18**

Resuelve de raíz "un camino productivo evidente" y "una autoridad por concepto", que son los dos criterios donde la actual saca 1/3. Se descuenta por: no incorpora codegen, así que el contrato TS sigue transcrito a mano; hay que reescribir `architecture_test.go` y durante esa ventana el repositorio pierde su mejor guardarraíl; y el riesgo de `OverlayFrame` god-object es real. Coincide con la nota de F (14/18).

### Rendimiento — **13/15**

El frame compacto está medido: 35.209 B frente a 269.573 B (−86,9 %) y 0,310 ms frente a 1,013 ms de proyección+marshal a 104 coches; `JSON.parse` de 0,211 ms frente a 1,84 ms. Regular antes de serializar es la mayor ganancia disponible. No sube más porque **no se ha medido Wails/WebView2/OBS** y porque el prototipo compacto es sintético.

### Widgets/señales — **9/10** · Testabilidad — **6/8** · Migración — **3/6** · Futuro — **3/5**

Widget nuevo sin dominio y señal nueva en ~6 archivos son ganancias reales. Testabilidad baja porque la migración puede perder replay y guards heredados. Migración es el punto más débil y B lo admite sin adornos: retirar el adapter toca todos los widgets y ya se intentó una vez, dejando `overlay-shadow-comparator.ts` (1.132 líneas) como cicatriz. Futuro bajo: posponer productos es sano, pero un frame único obliga a reconstruir límites después.

---

## 6. Opción C — Híbrida (recomendada)

### Corrección — **18/20**

**A favor.** Conserva íntegro lo que está probado (calidad, identidad, reducer, derive, facts, replay, fusión con TTL, absorción de frames no mapeables) y añade exactamente lo que falta: una transacción lógica `Engine.Apply` con prepare/commit donde el mapper no avanza cursor hasta el commit (cierra D-01); publicación **fuera** del commit con fallo no terminal (cierra D-02 y el escenario 23); evicción o degradación del presupuesto de vehículos (cierra D-04); ventana de gracia en la identidad de slot y desacople "cambio de player ≠ epoch" (cierra D-03); watchdog de edad en el consumidor y publicación del status `error` **antes** de cerrar hubs (cierra D-06); status dentro del frame (cierra D-07); frame compacto con margen 7× a 104 coches (cierra D-08); Engineer asíncrono con timeout (cierra el escenario 21); `recover()` por frontera de consumidor.

**En contra.** No está construido: los −2 puntos son riesgo de implementación, no de diseño. Durante la transición coexisten la ruta legacy y la nueva, lo que exige disciplina estricta de shadow y retirada.

**Ventajas.** Cierra cinco de los siete escenarios inseguros por construcción, sin reabrir ninguna clase de bug cerrada. **Inconvenientes.** Periodo de doble ruta. **Incertidumbre.** Media-baja en la dirección, media en el calendario.

**A 6 meses.** Payload seguro, fallo no terminal, frontend más simple y la primera capability multi-sim declarada. **A 2 años.** Canonical estable, productos desacoplados, Analysis post-sesión separada del vivo.

### Multi-simulador — **16/18**

**A favor.** `CanonicalState` con núcleo universal + módulos por capability + extensiones nativas tipadas por namespace; `Supported` estable por driver y `Available/Mode` por sesión; fusión promovida a paquete compartido con `SourceSlotID` abierto y lista ordenada de fuentes (necesario para ACC, que tiene tres); autoridad y modo declarados en el ViewModel, nunca `simId`; test de arquitectura que prohíba nombres de sim bajo `widget-types/**`.

**En contra (por qué 16 y no 17–18).** La forma exacta de `SourceFrame` multi-fuente **no está probada** con un segundo driver; y el composition root sigue exigiendo una reescritura sustancial (interfaz `ObservationMapper`, `DriverManager` multi-candidato real, `IsUnmappableFrame` promovido a `internal/telemetry/driver`, `SourceStatus.Kind/Name` derivados del descriptor activo).

**A 6 meses.** iRacing entra como paquete nuevo más una reescritura acotada y única del composition root. **A 2 años.** Cuatro sims con capabilities heterogéneas sin `if simulator ==` en ninguna capa.

### Mantenibilidad LLM — **16/18**

**A favor.** Es la única opción que **no abre una ventana sin guardarraíles**: `architecture_test.go` se conserva y se amplía en vez de reescribirse (F le da 3/3 en el criterio de tests por esto). Cada paso es una retirada verificable de código con consumidor cero o duplicado, revisable por diff. Añade una autoridad por concepto (delta, standings, relative, gaps suben a Go), retira el camino falso (`Fanout`, RFC7396, Analysis live) y el camino de verificación mentiroso (mocks más ricos que producción, al desaparecer `scoring[]` sin tipar), y genera el contrato TS.

**En contra.** Conserva más tipos legítimos que B (catálogo, proyecciones por producto, subpaquetes de schema), así que la amplificación por señal baja menos: ~22–28 archivos frente a ~12–16 de B. Coincide con F (15/18) y añado un punto por incorporar la generación de contratos, que F puntúa `●○○` en las tres arquitecturas evaluadas precisamente porque ninguna la incluía.

### Rendimiento — **13/15**

Obtiene la misma compactación medida que B (−86,9 % bytes, −69 % latencia de proyección+marshal, −88 % de parse en el frontend) **sin serializar el canonical**, más cadencias por sección reguladas antes de proyectar. No sube más por la misma razón que B: Wails/WebView2/React/OBS siguen sin medir, y el compacto es un prototipo sintético.

### Widgets/señales — **9/10**

ViewModels listos, columnas por enum tipado, cambios de datos que no invaden widgets. No es 10 porque el registro disperso del frontend (11 puntos que no rompen la compilación) **no lo arregla ninguna arquitectura de telemetría**; es un trabajo aparte.

### Testabilidad y observabilidad — **7/8**

Preserva la suite y los goldens, permite shadow por widget, gate de contrato generado, matriz de escenarios y test de 104 coches, y añade las tres métricas que hoy faltan (latencia de Engineer, edad del último frame, contador de fallos de publicación). No es 8 porque hace falta trabajo específico para goldens actualizables y para un test end-to-end buffer→widget que hoy no existe en ninguna de las cuatro opciones.

### Coste y riesgo de migración — **5/6**

Incremental y reversible por builder; no toca el canonical primero; el comparador shadow ya existe como andamio. No es 6 porque retirar el legacy no es gratis y el periodo de doble ruta tiene coste real. **Es la única opción que combina una nota alta aquí con una nota alta en corrección**, y ese cruce es lo que decide la matriz.

### Preparación futura — **4/5**

Deja puertos limpios para Strategy, Recording y Analysis sin mantener hubs vacíos; evita event sourcing, protocolo binario y canonical generado prematuros. No es 5 porque pospone deliberadamente decisiones (tiers, registry) que podrían resultar necesarias.

---

## 7. Opción D — Registry generado + builders + facts + tiers

### Corrección — **17/20**

**A favor.** Todo lo de C, más: generar la matriz de autoridad como `switch` exhaustivo convierte en error de compilación el `panic` de `fusion.ruleFor` cuando falta una regla; generar el contrato TS elimina la deriva silenciosa de 28 campos espejados a mano.

**En contra.** La generación introduce una clase de error propia: un artefacto generado editado a mano desaparece en el siguiente `go generate` — y G admite que **no ha resuelto ese modo de fallo**, solo lo mitiga. Tres tiers con cursores independientes permiten pintar una posición de hace 250 ms junto a una velocidad actual: aceptable si el contrato lo declara, pero es una fuente nueva de incoherencia visible.

### Multi-simulador — **17/18**

La mejor de las cuatro. Un catálogo generador con `Scope`/`Products` por señal hace que un sim nuevo sea "+5 archivos nuevos, +2 modificados" en el análisis de G, y que las capabilities se deriven en vez de escribirse a mano en cuatro proyecciones. Se descuenta 1 por la misma razón que C: sin segundo driver, es diseño no ejercido.

### Mantenibilidad LLM — **15/18**

**Tensión real y no resuelta.** Una fuente declarativa única es lo más descubrible posible para un agente (G puntúa A3 en 92/100 en este eje). Pero introduce una etapa de build en un repositorio que hoy compila con `go build ./...` puro y **0 `go:generate`** **[VERIFICADO-H]**, más artefactos generados que un agente puede editar por error, más un generador que hay que depurar. Para un equipo casi enteramente de agentes con un orquestador que no revisa línea a línea, esa superficie nueva pesa. Por eso 15 y no 16–17.

### Rendimiento — **13/15**

Los tiers **podrían** rendir más que el frame compacto de un solo canal, pero la cifra que lo sostiene (−98 %) es aritmética explícitamente marcada como inferencia por su autor, y **no hay medición de tiers en ningún escenario**. Lo medido es lo mismo que sostiene a B y C. Sin evidencia diferencial, no puede puntuar por encima.

### Widgets — **9/10** · Testabilidad — **7/8**

Idénticos a C: los builders son la pieza común. La generación reproducible y el diff de esquema son fuertes; añaden superficie de tooling.

### Coste y riesgo de migración — **2/6**

La peor de las cuatro y la razón principal por la que no gana. Introduce simultáneamente generador, registry, builders y tiers **antes** del segundo simulador, es decir, antes de saber qué abstraen realmente iRacing y ACC. G lo reconoce: 60/100 en este eje frente a 92 de la actual, y su propio plan pone la generación del canonical como fase 8, la última y opcional.

### Preparación futura — **5/5**

La máxima, y el único eje donde supera claramente a C.

**A 6 meses.** Mayor inversión y menos entrega visible que C. **A 2 años.** Superaría a C si hay 3+ simuladores y cientos de señales; también podría convertirse en un generador difícil de depurar por agentes.

---

## 8. Ranking y sensibilidad

**Ranking: C (88) > D (85) > B (79) > A (60).**

### 8.1 ¿Cambia el ganador moviendo ±3 en los criterios más inciertos?

Los dos criterios con más incertidumbre son **coste de migración** (nadie ha migrado un widget: todas las notas son estimaciones) y **preparación futura** (depende de cuándo lleguen el segundo y el tercer simulador). Son también los que más separan a C de D.

| Escenario de ponderación | A | B | C | D | Ganador |
|---|---:|---:|---:|---:|---|
| Base (6 / 5) | 60,0 | 79,0 | **88,0** | 85,0 | C por 3,0 |
| Migración 3, Futuro 8 (máximo ajuste a favor de D) | 59,3 | 79,3 | **87,9** | 87,0 | **C por 0,9** |
| Migración 9, Futuro 2 (máximo ajuste a favor de A/C) | 60,7 | 78,7 | **88,1** | 83,0 | C por 5,1 |
| Corrección 23, Migración 3 | 59,5 | 79,9 | **88,2** | 86,6 | C por 1,6 |
| LLM 21, Rendimiento 12 (peso al equipo de agentes) | 59,7 | 78,7 | **88,1** | 84,9 | C por 3,2 |
| Multi-sim 21, LLM 15 (peso a los tres sims futuros) | 60,5 | 79,2 | **88,0** | 85,3 | C por 2,7 |

Método: al cambiar un peso, la nota de cada opción se reescala proporcionalmente (`nota / peso_antiguo × peso_nuevo`); la suma de pesos se mantiene en 100 compensando entre los dos criterios movidos.

**C gana en las seis ponderaciones exploradas**, pero el margen frente a D se comprime de 3,0 a **0,9 puntos** cuando se minimiza el coste de migración y se maximiza la preparación futura. Ese margen está **dentro del error de una puntuación cualitativa**: la lectura honesta no es "C aplasta a D", sino **"C y D son la misma dirección, y C es D ordenada por evidencia disponible"**.

### 8.2 Condiciones de reevaluación (falsables)

La decisión debe revisarse a favor de D si ocurre **cualquiera** de estas tres cosas, todas comprobables:

1. **Prueba de amplificación fallida.** Tras completar C, añadir un campo al canonical sigue exigiendo edición mecánica coordinada en **más de diez sitios**. Entonces la parte de generación de D (catálogo → estado + matriz + capabilities) deja de ser anticipación y pasa a ser respuesta a evidencia.
2. **Tercer simulador confirmado en el plan a 12 meses.** Con tres drivers y capabilities heterogéneas, el coste de mantener a mano cuatro proyecciones más cuatro matrices supera el coste del generador.
3. **Medición de tiers positiva.** Un prototipo de publisher con tres cadencias mide una mejora material **frente al frame compacto de un solo canal** en WebView2 y en OBS, no solo en bytes.

Y debe revisarse a favor de B si, tras el vertical slice, la coexistencia legacy/nueva resulta ingobernable y la migración por widget se estanca — en cuyo caso la respuesta correcta sería acelerar la retirada del legacy, no reintroducir la fusión del núcleo.

### 8.3 Por qué A queda descartada

A no pierde por poco: pierde por 28 puntos, y pierde en el criterio de mayor peso. La razón es concreta y no opinable: **cuatro de los siete escenarios que hoy fallan de forma insegura (9, 16, 21, 23) no se pueden cerrar sin mover la frontera de commit, la política de identidad o el contrato de salida**, y mover cualquiera de las tres deja de ser "una pequeña corrección". A es la opción de menor riesgo inmediato y de mayor riesgo acumulado.

---

## 9. Decisión

**Opción C — Arquitectura híbrida, 88/100.**

Confianza **alta** en la dirección: está sostenida por evidencia convergente de siete agentes con incentivos opuestos, por siete hechos verificados en código y por mediciones crudas conservadas. Confianza **media** en los números absolutos de rendimiento, porque describen una implementación que aún no existe y que no se ha medido en WebView2 ni en OBS.

La decisión **no depende** de que el frame compacto alcance exactamente −86,9 %, ni de resolver la discrepancia entre 128 µs y 8,07 ms. Depende de tres cosas que sí están cerradas: **el sistema muere con una parrilla que él mismo declara soportar**, **cinco cursores independientes convierten cualquier anomalía transitoria en "reinicia la aplicación"**, y **el último kilómetro tira la semántica que las siete capas anteriores construyeron con cuidado**.
