# Spotter Vantare — auditoría del estado actual

Fecha: 2026-08-11. Base: rama ISA-313, merge-base
`origin/nightly@0fecff216e19ef0c9cccf68a4d04dda6a269f021`, HEAD inicial de
la auditoría `ad94fb6d191f9a2230630f36ce1d3032bb12e9fc`.

## Objetivo

Trazar el flujo productivo completo del Spotter, separar comportamiento
demostrado de intención documental e identificar los gaps que debe resolver la
Fase 1.

## Método

La auditoría cita rutas y símbolos del repositorio, revisa tests, fixtures y
replays existentes y ejecuta checks focales no mutantes cuando sean razonables.
Una afirmación sin evidencia de código o test se marca como inferencia.

## Flujo productivo

~~~text
LMU shared memory
  -> Telemetry Core canónico
  -> Engineer projection V1 + manifest/freshness
  -> projectioninput (bridge acotado al frame legacy)
  -> geometría + máquina Spotter
  -> candidato tipado
  -> policy/scheduler + revalidación
  -> delivery cancelable + ACK started
  -> Presentation ES/EN/it/pt-BR
  -> una salida visual canónica (Wails/SSE)
  -> Desktop / OBS / subtítulos / engineer-radio
  -> audio cache-only si locale, asset y player coinciden
~~~

| Capa | Estado real y autoridad |
|---|---|
| Ingesta | Telemetry Core es la única fuente productiva. Engineer no abre shared memory, REST, archivo ni socket (`internal/app/telemetry_core_runtime.go`, `EngineerProjectionRuntime`). |
| Proyección | `internal/telemetry/projection/engineer` expone sesión, grid completo, controles, pit, gaps y pose espacial con capability, provenance y freshness explícitas. |
| Identidad/lifecycle | `ClassifyBoundary` y los facts cancelan por epoch, sesión, coche, equipo, piloto, conexión e inicio/fin de sesión (`internal/telemetry/projection/engineer/boundary.go`; `EngineerService.ConsumeFact`). |
| Bridge | `projectioninput.Adapter.FrameFor` convierte una familia autorizada al modelo legacy. Es productivo, pero sigue siendo una frontera de compatibilidad que convierte ausencias de filas individuales en valores cero. |
| Detector | `spotter.ClassifyWithActiveSides` alinea rivales al coche, filtra pits/baja velocidad y aplica envolvente de entrada/salida. `spotter.Machine.Process` reduce las zonas a izquierda/derecha y produce siete intents. |
| Runtime | `core.Runtime.ProcessSpotterFrame` es productivo. Solo Spotter, Fuel, Penalties, Laps, Timings y PitStops atraviesan hoy `EngineerService.ConsumeObservation`. |
| Policy | `projectioninput.CandidateFromMessage` crea claims cerrados; `messagepolicy.Scheduler` revalida, deduplica, ordena y registra outcomes acotados. |
| Delivery | Existe una única entrega activa. Spotter preempta Engineer de prioridad inferior; otro Spotter espera. Un clear necesita contexto cuya entrega recibió ACK `started`. |
| Presentación | `presentation.Resolver` crea texto visual y de voz desde la misma decisión. Wails y SSE reciben el mismo `EngineerNotification`; el stream ordenado es la autoridad de Desktop/OBS. |
| Audio | Composición instala player y `AudioRouter` cache-only. No existe síntesis productiva en el camino crítico; miss, error o mismatch degradan a visual. |
| Visual | `EngineerSubtitles` y `engineer-radio` reciben ViewModels puros; `WidgetVisualHost` sigue siendo la frontera compartida, sin renderer Spotter alternativo. |

Rutas principales: `internal/telemetry/projection/engineer/v1.go`,
`internal/engineer/projectioninput/adapter.go`,
`internal/engineer/spotter`, `internal/engineer/core/runtime.go`,
`internal/engineer/messagepolicy`, `internal/engineer/service`,
`internal/engineer/presentation`, `internal/server/engineer_sse.go`,
`frontend/src/engineer` y el widget `engineer-radio`.

## Capacidades demostradas

| Capacidad | Estado | Evidencia/límite |
|---|---|---|
| Left/right | **Productiva y probada** | Proyección -> bridge -> geometría -> policy -> delivery; unitarios y oracle sintético. |
| Rival a cada lado | **Productiva y probada sintéticamente** | Se reduce a `StateBoth`/`three_wide`; no hay captura real LMU extremo a extremo. |
| Still-there | **Productiva parcial y probada** | Cadencia/caducidad existen para izquierda/derecha; `StateBoth` sostenido carece de recordatorio propio. |
| Clear de lado/total | **Productiva y endurecida** | Espera/histéresis más antecedente con ACK iniciado y misma generación. |
| Pits y baja velocidad | **Productiva en el modelo disponible** | Jugador/rival en pits y speed gate tienen tests; pit exit/rearme real no. |
| Sensibilidad | **Expuesta pero inconsistente** | Clasificación usa el preset; revalidación policy usa siempre Normal. |
| Prioridad/preempción | **Productiva y probada** | Spotter cancela entrega/audio Engineer inferior; Spotter no corta Spotter. |
| Source loss/reconnect | **Productiva y probada** | Limpia salida; recovery exige snapshot estrictamente posterior al borde. |
| Desktop/OBS/subtítulos/radio | **Productiva y probada por componentes** | Mismo store/visual ViewModel; no existe una prueba única desde replay hasta ambas superficies. |
| Audio | **Productivo solo ante cache hit; no demostrado por defecto** | No sintetiza; ACK `started` no demuestra sonido en dispositivo. |
| Dos rivales paralelos en el mismo lado | **Datos parciales, semántica ausente** | Geometría puede devolver dos zonas del mismo lado, pero `Machine` las colapsa a un booleano. |
| Cuatro coches en paralelo | **Ausente** | No hay estado/intención específica. |
| Dimensiones reales del vehículo | **Ausente** | Se usan valores fijos por preset, no capability por coche/clase. |
| Movimiento relativo/teleport | **Dato disponible parcialmente, no consumido** | La proyección porta velocidad local, pero el detector no la usa para plausibilidad o closing speed. |
| Ghost/active/control state | **Ausente** | No existe campo canónico; una pose fresca puede cruzar el detector sin conocer si la fila representa un rival activo. |
| Formación/FCY/clasificación privada | **Solo harness/docs; gate productivo muerto** | `GamePhase` existe en el frame legacy, pero `adaptSession` no lo puebla: el gate actual no puede activarse productivamente. |
| `GridSide` de formación | **Código muerto y deuda clean-room** | `geometry.go` expone una clasificación sin consumidor productivo, bloqueada además por el `GamePhase` no poblado y con un umbral atribuido al competidor. S1 debe retirarla o rederivarla antes de tocar geometría. |
| Tráfico multiclase | **Código legacy parcial, no autorizado** | Familia `multiclass` no atraviesa la allowlist productiva. |
| Blue flag/doblados/slow/stopped/accident/local flags | **Ausente o no autorizado para Spotter** | Faltan señales canónicas y paridad LMU; no debe inferirse desde el código de monitores legacy. |
| Rejoin seguro | **Ausente** | No hay contrato ni intención dedicada. |

La vertical existente es valiosa: no hace falta reconstruir proyección, policy,
delivery, Presentation ni renderizado. El trabajo de Fase 1 consiste en cerrar
semántica y aceptación, no en crear otro Spotter.

## Tests, fixtures y observabilidad

Existe cobertura amplia, pero fragmentada:

- `internal/engineer/spotter/*_test.go`: alineación, geometría, histéresis,
  pits, velocidad, estados, debounce, clears y fixtures JSONL sintéticas;
- `internal/engineer/projectioninput/*_test.go`: gates, adaptación, calidad y
  claims desde la observación canónica;
- `internal/engineer/messagepolicy/spotter_*_test.go`: matriz de
  supersession, antecedente iniciado, expiración y límites;
- `internal/engineer/service/*_test.go`: entrada canónica, lifecycle,
  reconnect, preempción, output modes, stream y locale/audio;
- `internal/engineer/replayoracle`: reloj virtual, outcomes y goldens V1/V2;
- `internal/server/engineer_sse_test.go`: snapshot/stream/cierre SSE;
- `frontend/src/engineer/*test*`: parsing, generación, TTL y subtítulos;
- `frontend/scripts/engineer-radio-visual.mjs` y baselines: paridad visual del
  widget, no semántica Spotter.

Los replays `left-basic`, `right-basic`, `three-wide` y `all-clear` son
sintéticos. Las fixtures llamadas `LiveLMU` en tests de servicio también son
builders, no capturas. `testdata/lmu-fixture.bin` sí posee procedencia LMU
sanitizada, pero demuestra principalmente el transporte de pose espacial; no
recorre una maniobra de tráfico completa hasta audio y superficies.

No existe hoy una aceptación acumulativa única que:

1. ingiera un replay canónico representativo de LMU;
2. atraviese el composition root productivo;
3. capture decisión, ACK, audio/cache, Wails, SSE, Desktop y OBS;
4. compare orden, prohibiciones, deadlines, lifecycle y métricas;
5. produzca un resultado machine-readable que otra IA pueda evaluar.

La observabilidad actual cubre outcomes de policy, delivery y `dropCount`, pero
no explica de extremo a extremo por qué se aceptó/rechazó cada rival ni separa
cache hit, inicio del player y audibilidad física.

## Gaps y riesgos

### P1 — corregir antes de ampliar funcionalidad

1. **Apagar Spotter inutiliza el resto de Engineer.**
   `EngineerService.SetSpotterEnabled` llama a `runtime.SetEnabled` con el
   resultado combinado. Con Spotter apagado, las otras familias autorizadas
   empiezan a iterarse, pero `ProcessMonitorFrame` devuelve falso de forma
   determinista, aborta el resto de la observación y el servicio marca
   `connected=false` con un error engañoso de familia no registrada. Además
   cancela la entrega activa, scheduler y cola completos, por lo que puede
   perder un Fuel ya en vuelo. El control Spotter debe ser independiente del
   owner global y tener regresión “Spotter off no altera conexión, error ni
   Fuel pendiente/en reproducción”.

2. **La sensibilidad tiene dos autoridades.**
   `core.Runtime.processSpotterLocked` clasifica con el preset configurado;
   `projectioninput.SemanticEvidence` vuelve a clasificar con
   `SensitivityNormal` y sin reutilizar los lados activos/histéresis de la
   máquina. En los bordes una decisión puede validarse contra una topología
   distinta de la que la originó. La corrección debe producir una sola decisión
   espacial versionada que detector y revalidación compartan.

3. **El audio por defecto no coincide con la presentación.**
   Presentation arranca en español; el canal Spotter de `AudioConfig` arranca
   en inglés. `AudioRouter` rechaza el mismatch y composición no reconcilia los
   defaults. El comportamiento predeterminado es visual-only aunque haya
   cache. Debe existir una única elección ES/EN compartida y diagnosticable.

4. **Una fila incompleta puede convertirse en un rival válido de coordenadas
   cero.** El gate exige que exista al menos un rival con posición/pit usables,
   pero `FrameFor` adapta después todas las filas. En cada fila no usable,
   posición, pit y lap distance quedan como ceros; la geometría considera el
   origen una coordenada válida. Confirmado por la combinación de
   `projectioninput.requireBaseSignals`, `Adapter.adaptVehicle` y
   `spotter.ClassifyWithActiveSides`. El filtro debe ser por rival, preservar
   ausencia y fallar cerrado.

5. **Faltan plausibilidad de movimiento y semántica ghost/active.** La
   proyección contiene velocidad local, pero el detector usa posición estática.
   Tampoco conoce control/ghost/garage. Teleport, reset, fila stale o rival
   fantasma pueden crear entrada o clear falsos.

6. **Three-wide incompleto.** Dos rivales realmente paralelos en el mismo lado
   terminan como un solo `Left` o `Right`; solo un rival por lado produce
   `StateBoth`. Se pierde si el jugador está a la izquierda, centro o derecha
   del grupo. Es un gap de seguridad, no una variante cosmética.

7. **Existe deuda clean-room en código y tests, no solo falta de procedencia.**
   `types.go`, `geometry.go`, `overlap.go`, `state.go` y `core/runtime.go`
   contienen valores
   o claims fijos y
   comentarios de “paridad CC”; tests de geometría también nombran al
   competidor y atribuyen parámetros concretos. Parte de esos comentarios ya
   contradice el upstream público. Antes de aceptar el núcleo debe inventariarse
   y retirarse toda referencia cuya única autoridad sea CrewChief, rederivar
   dimensiones/envolventes/tiempos con capturas LMU propias y convertir los
   tests en contratos observables Vantare, incluido el mapeo multiclass. Un
   review clean-room independiente certifica el resultado.

8. **Las secuencias continuas duplicadas o regresivas se procesan.** `Sequence`
   existe, pero `strictlyAfter` solo se aplica al recuperar un reconnect. Una
   serie `10 -> 5` se acepta y además rebaja el cursor con el que se evaluará el
   reconnect siguiente. Debe rechazarse todo snapshot que no avance dentro del
   mismo epoch y probarse la combinación regresión->disconnect->reconnect.
   Evidencia: `engineer_service.go` (`ConsumeObservation`/`lastObservation`) y
   `canonical_input_test.go`, que hoy solo cubre stale durante reconnect.

9. **`audio-only` puede terminar `completed` sin ninguna salida.** Un cache
   miss, error del resolver o player ausente deja el path vacío, pero la entrega
   todavía emite `started` y `completed`; al no existir salida visual en ese
   modo, el usuario no recibe nada y health tampoco explica el fallo. Esos casos
   necesitan outcome no-success y diagnóstico explícito. Evidencia:
   `internal/engineer/service/delivery_runtime.go` y
   `output_policy_test.go`.

10. **La métrica actual no mide comienzo audible.** El ACK y el P95
    `decision-to-start` ocurren antes del player. En Windows, creación del
    proceso PowerShell/WPF por clip, una espera inicial de 200 ms y el límite de
    reproducción de 8 s quedan fuera. Por tanto, el objetivo audible <150 ms no
    es demostrable con esta ruta sin sustituirla o redefinir explícitamente el
    endpoint. La aceptación debe
    separar decisión, transporte, publicación visual, comienzo del player y
    confirmación manual de audibilidad. Evidencia:
    `internal/engineer/delivery/contract.go` y
    `internal/engineer/audio/player_windows.go`.

### P2 — cerrar dentro de la fase

11. **Disable/re-enable no resetea de forma explícita la máquina Spotter.** La
   entrega y cola se cancelan, pero `Runtime.SetEnabled` solo cambia el booleano.
   Un estado lateral anterior puede sobrevivir y producir still/clear tardío.

12. **`started` no significa audible.** El ACK ocurre antes de publicar visual
    y antes de ejecutar el player. Es correcto como inicio contractual de la
    entrega, pero métricas y UI no deben presentarlo como sonido emitido por el
    dispositivo.

13. **Hub y superficies no consumen el mismo lifecycle.** Desktop/OBS usan
    `engineer:stream` con snapshot/generation; EngineerPage usa eventos legacy
    de status/notification. Puede mostrar historial o estado distinto tras
    reconnect.

14. **La UI afirma persistencia que no existe.** EngineerPage muestra
    “guardado automático”, mientras los ajustes actuales viven en memoria. La
    persistencia general pertenece a una fase posterior, pero Fase 1 no debe
    prometerla.

15. **No hay presupuesto de latencia extremo a extremo probado.** Existen
    deadlines y un timeout corto del lookup de cache, pero no una medición desde
    `CapturedAt` hasta visual y comienzo real del player bajo carga.

16. **Un drop dentro de una conexión activa no fuerza resnapshot.** El canal de
    backend descarta al llenarse y el frontend acepta saltos de secuencia. Si se
    pierde exactamente un clear o status, solo el TTL local recupera la UI. La
    prueba acumulativa debe provocar backpressure y exigir detección de gap más
    rehidratación o documentar expresamente otro contrato. Evidencia:
    `EngineerService.SubscribePresentation` y
    `frontend/src/engineer/engineer-presentation-store.ts`.

17. **Cache y dispositivo carecen de diagnóstico contractual.** Cache miss,
    locale mismatch y error de lookup convergen en path vacío; la métrica
    `TTSCacheCount` no refleja el cache cableado. El player Windows usa el
    dispositivo implícito y no confirma hot-plug ni comienzo audible. Fase 1
    debe exponer hit/miss/mismatch/player-failed y dejar audibilidad/hot-plug a
    smoke manual además del test automatizable. Evidencia:
    `delivery_runtime.go`, `engineer_service.go` y `player_windows.go`.

18. **Geometría y conteo pierden información útil.** Las dimensiones son
    globales, la máquina conserva presencia booleana y no identidad/cantidad,
    y no hay semántica four-wide. La identidad canónica sí sobrevive al reorden
    y a generaciones, pero falta probarla atravesando Spotter. La subfase
    lateral debe decidir explícitamente sustitución de rival en el mismo lado,
    tamaños por clase y degradación segura para cuatro coches. Evidencia:
    `spotter/geometry.go`, `spotter/overlap.go` y `spotter/state.go`.

19. **La envolvente lateral puede aceptar segmentos paralelos.** El gate actual
    considera una zona amplia de hasta 20 m antes de clasificar; está demostrado
    en código que una pose lateral lejana puede entrar al cálculo, aunque el
    falso positivo en LMU real es una inferencia pendiente. Pit lanes y tramos
    adyacentes deben ser escenarios negativos y los límites deben rederivarse
    con capturas propias.

20. **Cambiar sensibilidad en caliente mezcla contratos.** `SetSensitivity`
    cambia el preset sin resetear la máquina; un overlap activo puede entrar con
    una geometría y salir con otra. Debe definirse cancelación/rearme y probarse
    el cambio durante ocupación, no solo los tres presets por separado.

### Riesgos de arquitectura

- extender el Spotter sobre `telemetry.Frame` aumentaría la pérdida de
  presencia/calidad; las nuevas señales deben entrar por el contrato canónico;
- crear un renderer Spotter nuevo duplicaría `WidgetVisualHost` y rompería la
  paridad Desktop/OBS;
- convertir el replay oracle en una segunda fuente productiva mezclaría test y
  runtime; la aceptación debe invocar las mismas fronteras, no cablearse como
  driver real;
- integrar TTS dentro del camino crítico introduciría latencia no cancelable;
  Kokoro debe preparar/cachear assets fuera de la decisión inmediata;
- aprobar `multiclass`, `flags` u `opponents` porque “ya existe código” eludiría
  capabilities y tests de paridad.

## Implicaciones para la Fase 1

La secuencia correcta es vertical y acumulativa:

1. cerrar los P1 de autoridad, filtrado por rival, enable/reset y defaults;
2. convertir el núcleo lateral en una aceptación canónica completa;
3. añadir solo las señales LMU que permitan inhibir/rearmar sin inventar;
4. completar three-wide direccional y plausibilidad con evidencia propia;
5. hacer utilizable audio ES/EN cacheado desde un pack propio/licenciado;
   Kokoro solo puede generarlo si su gate independiente pasa, manteniendo
   visual como fallback;
6. añadir tráfico multiclase como familia informativa separada;
7. cerrar con sesión LMU/Windows real y promover sus capturas sanitizadas al
   corpus acumulativo.

La fase no debe afirmar terminada ninguna capacidad solo porque pasa el oracle
sintético. El cierre exige validación manual LMU y que una IA pueda ejecutar la
misma aceptación acumulativa hasta superficies y transporte, verificando
también que los escenarios prohibidos permanecen silenciosos.
