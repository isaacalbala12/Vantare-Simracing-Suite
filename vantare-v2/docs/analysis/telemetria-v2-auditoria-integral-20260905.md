# Telemetría V2 — auditoría integral (ISA-987)

## Alcance y evidencia

Fase 2 del maestro aprobado de 2026-09-03, owner #962. Candidato de #894:
`28bac67650837d2a56d2466bfcbf7adf41436af7`, congelado y sin cambios productivos
durante esta auditoría. Rama documental `vantareapp/isa-987-auditoria-integral-v2`.
No equivale a Nightly ni a una certificación de rendimiento óptimo.

Cuatro lectores independientes Muse Spark 1.3 Contributor (`opencode-go`,
`xhigh`) con Ponytail full, sin delegación anidada. Cada lector tiene un
snapshot detached separado del mismo SHA; main contrasta los hallazgos antes
de consolidarlos. No apps, LMU, pruebas físicas ni suites pesadas concurrentes.

## Matriz de cobertura asignada antes de revisar

| Carril | Rutas y fronteras asignadas | Comprobación |
| --- | --- | --- |
| A Core/datos | `internal/telemetry/drivers/{lmu,simx}`, `core`, `engine`, `schema`, `derive` | Adquisición → autoridad/mapper → reducer/coordinator → derivaciones/facts → commit; identidad, calidad y ownership |
| B Transporte/lifecycle | `internal/app/telemetry_core_runtime*`, `telemetrytransport`, `projection/engineer`, `recording`, `strategy_live_runtime`, `frontend/src/telemetry-transport` | Start/stop, cancelación, ACK, retry, epoch, frescura, colas, gaps y aislamiento |
| C Rendimiento | `derive/pipeline` y trackers, `projection/overlayv2`, runtime/publisher/pull, stores/coordinador/viewmodels frontend | Trabajo por frame, copias, serialización, demanda, cachés, renders e instrumentación |
| D Arquitectura/seguridad/calidad | Tests de arquitectura/wiring, schema/contratos/generador, composition root y HTTP, bridges, WidgetVisualHost/consumidores | Fronteras de confianza, validación, código sin consumidores, duplicación, abstracciones y cobertura |
| Main integración | Engine.Apply → runtimeBatchSink → proyecciones → Publisher → pull HTTP → cliente y stores | Contrastar wiring y causas; resolver duplicados y supuestos de los cuatro informes |

Sesiones: A `ses_f8ec62b3cffeM2hmP4opPdpshv`; B
`ses_f8ec37f03ffetUOHhGjsLskwwN`; C `ses_f8ec220c5ffe3GNAWpJg3jDvmz`;
D `ses_f8ec22063ffe2u1OeS0E4ma5lF`.

## Veredicto consolidado

Pasada estática integral terminada, con reproducciones focales y contraste
principal. **No certifica ausencia de todos los defectos ni rendimiento óptimo.**
Se conservan las premisas del núcleo: adquisición única, autoridad por campo,
estado tipado Go, prepare/commit, separación de productos y proyecciones.
No hay evidencia que justifique reescribir el núcleo o cambiar de lenguaje.
Hay cuatro problemas prioritarios demostrables, tres simplificaciones directas
y dos grupos de hipótesis para medir. No se ha cambiado código productivo.

Todos los rangos siguientes pertenecen al SHA congelado de cabecera. Los
resultados de los lectores se contrastaron contra los callers reales; las
adendas corrigen afirmaciones iniciales que no se sostuvieron. El bucle
experimental aún no ha comenzado y no se ha atribuido ningún porcentaje de
ahorro, reducción de RAM ni ganancia frente al HUD de LMU.

## Defectos priorizados

### D1 · P1 · Engineer puede acumular ejecuciones tras el timeout

- **Evidencia:** `internal/app/engineer_port.go:291-310`: cada observación crea
  un canal, goroutine y timer. Al vencer el timer no termina la llamada
  `ConsumeObservation`; `run:235-249` puede sacar otra observación y lanzar
  otra ejecución. La cola cap-1 acota pendientes, no ejecuciones en vuelo.
  `cmd/vantare/main.go:2123-2128` conecta el servicio Engineer real.
- **Escenario:** consumidor bloqueado más de 250 ms, con observaciones nuevas.
  Cada timeout permite otra llamada; si nunca retorna, el número retenido no
  tiene cota. Puede haber solapamiento y resultados tardíos. No afirmamos que
  el servicio actual esté bloqueándose en la máquina: es un fallo demostrable
  de la garantía de aislamiento ante un consumidor lento.
- **Teardown asociado:** `telemetry_core_runtime.go:688-690,867-877` pide
  parada, pero no espera `engineerPort.Stop(ctx)`/`done`. El puerto queda fuera
  del waitgroup. Facts/status se ejecutan síncronamente en ese puerto y también
  pueden impedir su cierre si un callback no retorna.
- **Invariante:** recursos y cierre acotados; consumidor no compromete el Core.
- **Prueba protectora faltante:** mantener el consumidor bloqueado durante
  varios timeouts, verificar máximo de llamadas simultáneas y cierre con
  deadline. El test existente `TestEngineerTimeoutIsBoundedAndCounted`
  (`telemetry_core_runtime_consumer_test.go:150`) libera el callback tras el
  primer timeout, por lo que no comprueba esa cota.
- **Microcorte mínimo:** no crear nuevas ejecuciones mientras la anterior
  siga viva; conservar sólo el último pendiente, contar drops y hacer explícito
  el resultado de Stop. Un contexto no cancela por magia una interfaz que no
  recibe contexto. No prometer cero goroutines retenidas por un callback
  arbitrario sin contrato cooperativo; sí impedir su crecimiento ilimitado.

### D2 · P1 · Un gap de facts puede dejar Engineer sin hechos hasta nuevo epoch

- **Evidencia:** `engineer_port.go:108-110,126-145,253-270` fija
  `factBoundary`, drena la cola y rechaza los siguientes facts del mismo epoch.
  `ResyncFacts:148` puede limpiarlo, pero no hay caller productivo de este
  método; `rg` en `internal`/`cmd` encuentra definición/tests, no wiring.
  El contador y error quedan en runtime, no se notifica el boundary a `engSvc`.
- **Escenario:** overflow de la cola de 64 o discontinuidad de secuencia;
  cesa la entrega posterior en ese epoch aunque el consumidor se recupere.
  No es una pérdida silenciosa en métricas, pero sí falta un protocolo de
  recuperación en el borde del consumidor real.
- **Invariante:** hechos ordenados con gap/resincronización explícitos.
- **Prueba faltante:** overflow → consumidor conoce pérdida → resync o
  degradación explícita → recuperación sin reiniciar toda telemetría.
  Los tests de `FactCursor`/overflow demuestran detección, no esa integración.
- **Microcorte mínimo:** conectar el boundary y la recuperación existente al
  consumidor, sin inventar hechos ni replay ilimitado. Si el sufijo retenido
  ya no basta, exigir resincronización explícita. El canal exacto se fija en el
  microplan de este corte; no introducir un bus genérico.

### D3 · P2 · El timeout del pull no cubre el cuerpo HTTP

- **Evidencia:** `frontend/src/telemetry-transport/overlay-wails-pull.ts:286-308`:
  `return response.json()` dentro de `try/finally` permite que `clearTimeout`
  se ejecute al recibir las cabeceras, antes de terminar el cuerpo.
- **Reproducción main:** Node 24.14.1 importó el TS productivo sin modificarlo.
  Con `fetch` resuelta (200), `json()` pendiente y timers controlados, salida:
  `{"active":true,"completed":0,"pendingTimeouts":[],"aborted":false}`.
  No hay timeout ni nuevo poll mientras ese body no termine.
- **Invariante:** recuperación y tiempo de espera acotados.
- **Microcorte mínimo:** esperar `response.json()` dentro del `try` para
  mantener el abort hasta terminar el cuerpo. Añadir un test de body pendiente;
  `overlay-wails-pull.test.ts:300-321` sólo simula cabeceras que nunca llegan.
- Es una reproducción controlada del cliente, **no evidencia de un cuelgue
  observado en Wails/LMU**. Reproductor sin red ni escritura:

```js
// node --input-type=module (desde vantare-v2)
import {createBrowserOverlayWailsPullClient} from './frontend/src/telemetry-transport/overlay-wails-pull.ts';
const timers = new Map(); let next = 0; let signal;
globalThis.setTimeout = (fn, ms) => { timers.set(++next, {fn, ms}); return next; };
globalThis.clearTimeout = id => timers.delete(id);
globalThis.fetch = async (_, init) => {
  signal = init.signal;
  return {ok: true, status: 200, json: () => new Promise(() => {})};
};
const client = createBrowserOverlayWailsPullClient(); client.start();
for (let i = 0; i < 10; i++) await Promise.resolve();
console.log({active: client.getDiagnostics().active,
  completed: client.getDiagnostics().requestsCompleted,
  pendingTimeouts: [...timers.values()].map(t => t.ms), aborted: signal.aborted});
```

### D4 · P2 · Damage no envejece con la fuente LMU congelada

- **Evidencia:** `drivers/lmu/driver.go:482-535` omite Damage al aplicar
  `withFreshness`. `drivers/lmu/fusion.go:287-326` corrige espacial mediante
  `forceStale`, pero también omite Damage. `format.go:520` copia el daño de la
  fila al nivel superior; `batch_mapper.go:389` lo pasa al canónico y
  `projection/overlayv2/builder_damage.go:18` conserva su calidad.
- **Reproducción main:** pequeño programa Go temporal con `Fusion.Merge`
  productivo, fuente SharedMemory, SourceTime Stale y fila jugador con
  Damage/WorldPosition Fresh. Resultado:
  `source=2 player=2 spatial=2 damage-row=1 damage-top=1 (fresh=1 stale=2)`.
  El programa fue retirado tras la prueba; no modificó el producto ni abrió
  el simulador. Es prueba de contrato con valores controlados, no captura LMU.
- **Invariante:** calidad/frescura fiel por campo; stale no equivale a fresh.
- **Microcorte mínimo:** envejecer Damage en la frontera común de fusión y
  cubrir congelación y TTL, preservando Missing/Invalid. No añadir de forma
  ciega todas las asignaciones duplicadas a `withFreshness`: espacial ya se
  corrige en la fusión.
- El lector A descartó inicialmente todo este hallazgo; main comprobó que
  su descarte era correcto para espacial pero **incorrecto para Damage**.

## Simplificaciones justificadas; ahorro todavía sin medir

### S1 · Primera candidata · Retirar el verificador de transición del Core

`telemetry_core_runtime.go:336,976` crea e invoca `telemetryShadow` por defecto.
`telemetry_shadow.go:48-60,79-91,96-112` mantiene un segundo reducer,
coordinator y pipeline, y procesa cada lote aceptado. Sólo la comparación se
muestrea cada 30 lotes; no el segundo procesamiento. El presupuesto de 2 ms
lo desactiva después de un exceso, no elimina el coste previo ni garantiza
que se desactive siempre. No es el comparador de Overlay V1 ya retirado.

El camino no publica a productos. Candidato: retirar ese verificador de
producción y sus métricas/opciones huérfanas, conservando tests de atomicidad
y una referencia histórica por Git. Inventariar antes los consumidores de
métricas y los toggles `TelemetryEngineApply`, `TelemetryFailurePolicyV2`,
`EngineerAsyncPort`, watchdog; no eliminar interfaces de producto v1 por nombre.
La eliminación de ramas antiguas asociadas se divide si amplía demasiado el
diff. Medir antes/después; no asumir que la CPU se reducirá a la mitad.

### S2 · No proyectar Strategy si no existe destino

`telemetry_core_runtime.go:995` ejecuta `strategyprojection.ProjectV1(final)`
siempre. `publishProjections:1387` sólo usa ese resultado con `strategyHub != nil`.
La configuración productiva por defecto tiene `StrategyPublicTransport=false`
(`main.go:1305,2127`). `projection/strategy/v1.go:70` clona FinalState para
proyectar y su resultado se descarta cuando no hay Hub. Mantener actualización
de status compartido y proyectar sólo si hay destino elimina trabajo inútil
sin cambiar datos/cadencias de un consumidor activo. No borrar el contrato
Strategy ni confundir esta propuesta con desarrollar Planner live.

### S3 · Copias redundantes concretas

1. `drivers/lmu/batch_mapper.go:237` crea un slice propio de VehicleState;
   `:193` lo copia inmediatamente otra vez. Candidato: quitar sólo esa copia.
2. `core/session_coordinator.go:215` devuelve copia de facts;
   `engine/engine.go:89 → engine/commit.go:16` vuelve a copiar. Caller único
   comprobado. Candidato: una sola copia, preservando la frontera pública.
3. `telemetry_core_runtime.go:1099` clona FinalState para contar vehículos y
   resolver modos; `projection/overlayv2/cadence.go:504` vuelve a clonarlo para
   proyectar. Evaluar lectura interna no mutable (`Peek`) en el primero,
   auditando que modos no muta ni retiene referencias. No generalizar `Peek`
   a todos los consumidores ni eliminar clones defensivos arbitrariamente.

Tests necesarios: propiedad/aliasing, rollback tras rechazo y mismos valores
proyectados. Microbench de allocs apoya ahorro local, no sustituye CPU/RAM/FPS
en el producto. El clon de facts sólo asigna cuando existen facts; no venderlo
como gran ahorro por frame.

## Hipótesis para el bucle posterior

| Orden | Hipótesis y evidencia | Experimento mínimo; condición para conservar |
| --- | --- | --- |
| H1 | Detección dirty vuelve a seleccionar/ordenar Relative (`cadence_dirty.go:119-139`) antes del builder. Session/Spotter se construyen al detectar (`cadence.go:645-646`) | Perfilar coste; reutilizar trabajo sólo si reduce coste manteniendo igualdad de salida y calendario de actualización; no nueva caché genérica |
| H2 | Cadena de serialización/copias: runtime Marshal, Publisher `publisherPayload:537`, replay/pull, TS `cloneJSONInput:619`; firmas stringify por widget en `telemetry-rate-coordinator.ts:129,242` | Aislar cada coste, proponer un único recorte de ownership/comparación a la vez; conservar validación, límite 72 KiB, inmutabilidad, cambios de source/failure y dirty |

No hay justificación actual para fusionar los relojes de transporte, frescura
y pintado ni para bajar frecuencias. Un `sectionBuildMask` de un sólo frame
no sustituye automáticamente una firma si el consumidor pierde frames.

## Hallazgos secundarios y descartes

- **SimX** (`drivers/simx/batch_mapper.go:125-133`): valida de forma diferente
  dos filas Player=true. El generador incorporado sólo produce un player y
  LMU rechaza la ambigüedad. Riesgo bajo de harness/fuente diagnóstica, no
  defecto activo demostrado en LMU. No prioritario para rendimiento.
- **Relative genérico no Redline:** mantiene selección/hold TS mientras
  Redline usa `relativeSettled` Go. Es duplicación de política, no prueba de
  filas ausentes retenidas: `relative-view-model-v2.ts:342-348` las expulsa.
  No migrar genérico sin contrato de rango/clase/opciones; fuera de los cortes
  prioritarios Redline y sin atribuirle una regresión actual no reproducida.
- **Hub statusRevision:** el fallo visual alegado por B se descartó; ese Hub
  es Strategy opt-in, no Publisher Overlay V2. No tocar su contrato como fix
  del Overlay.
- **Calidad Fresh+Stale en gaps:** Missing está fijado expresamente por
  `gaps_test.go:27,127`; no sustituirlo por Stale como falsa simplificación.
- **Ledger de peor calidad de parrilla:** no modifica los Field canónicos en
  el mapper. No se demostró que una fila Invalid contamine todas las filas.
- **Allowlist del wiring guard:** excepción explícita a nuevos huérfanos,
  no prueba de que recording/Analysis estén cableados. El guard no es falso
  verde por cumplir su propio alcance. No añadir otro registry/test genérico.
- **DroppedFrames de status oversize y logs de suscripción:** observaciones
  menores, sin escenario operativo importante ni ahorro demostrado; no abrir
  cortes sólo por simetría o estilo.

## Cobertura real y límites de la auditoría

Se trazaron lectura SM/REST, parser y fusión, mapper e identidad, reducer,
coordinator, engine, derivaciones, proyección OverlayV2, publisher/pull,
stores/coordinador frontend, puertos Engineer y fronteras Strategy/recording.
Lecturas profundas en los caminos calientes/lifecycle y lecturas focales en
tests/contratos; no es una revisión línea a línea de todos los ficheros.

**Estado separado de consumidores:** no hay caller productivo de
`recording.NewCoordinator` ni `NewStrategyLiveRuntime` en este SHA (búsqueda
de `internal`/`cmd`, excluidos tests). Son infraestructura/contratos existentes,
no coste del camino live demostrado. Analysis tiene acceso histórico; no se
declara una grabación V2 live funcionando porque sus tests pasen. Conectarlos
no forma parte de una simplificación y requiere su microplan de producto.

No se auditó en profundidad SQLite/DuckDB histórico, sanitizador/captura
diagnóstica, todos los subtipos schema, cada builder/renderizador/CSS ni todas
las capacidades futuras. No se validaron LMU real, Wails/OBS, GPU, memoria de
larga duración ni comparación con HUD. No hay hallazgo de seguridad explotable
confirmado; esto no equivale a una certificación de seguridad.

## Checks y trazabilidad

- Main: `go test ./internal/telemetry/engine ./internal/telemetry/derive
  ./internal/telemetry/drivers/lmu -count=1 -timeout=60s`: PASS; tiempos Go
  0,039 / 0,113 / 1,671 s; wall del comando 7,55 s.
- Main: reproducción Node del body HTTP, exit 0; reproducción Fusion Go,
  exit 0 (1,80 s); resultados literales en D3/D4. La segunda usó un fichero
  diagnóstico temporal retirado; ninguna prueba fue una sesión de juego.
- Lector B: `go test ./internal/app/telemetrytransport/`: PASS 0,081 s;
  `go test ./internal/telemetry/recording/ ./internal/telemetry/projection/engineer/`:
  PASS 0,279 / 0,031 s. Un pipe `tail` inválido en PowerShell se repitió sin pipe.
- Lector D: guard `TestExportedSymbolsHaveProductionCaller` existente,
  ejecución verbose confirmada PASS (0,53 s), no patrón de test vacío.
- Lectores A/C: sólo lectura/Git, sin suites. Cuatro snapshots del mismo SHA
  y sin cambios de los workers. Sus informes/adendas están en las sesiones
  listadas arriba; main no adopta sus conclusiones sin contraste.
- No se repitieron frontend completo/build/lint ni Go global: no hubo cambios
  de producto; el cierre #894 conserva esos gates secuenciales previos del SHA.
  Su PASS no cubre los casos faltantes identificados aquí.

## Cola mínima propuesta

1. Corregir D3 (timeout body) y D4 (Damage stale), microcortes independientes.
2. Cerrar D1 (single-flight/cierre) y D2 (facts gap/resync) con tests adversariales.
3. Simplificar S1, S2, S3 en cortes separados, comprobando salida/ownership.
4. Sólo después comenzar experimentos equivalentes con H1/H2 u otra hipótesis
   que el perfilado justifique. Cinco consecutivos sin mejora o ocho horas
   acumuladas del bucle; esta auditoría no consume ese contador.

No iniciar un rewrite, nuevos subsistemas ni otra ronda completa de auditoría
para corregir un hallazgo local. Cada corte necesita un test que lo detecte,
diff mínimo y revisión independiente acotada. Los hallazgos se mantienen bajo
#987 hasta convertir cada corte aceptado en su issue de implementación.
