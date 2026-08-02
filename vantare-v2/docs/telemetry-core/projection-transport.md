# TC-05B — Transporte local de proyecciones

Fecha: 2026-07-29. Alcance: adapters/harness Go sin wiring productivo global.

## Contrato

`internal/app/telemetrytransport` transporta únicamente los `PayloadV1` de
Overlay, Engineer, Strategy y Analysis. Los constructors públicos son tipados
por producto; el helper genérico no es público. Un sello privado detecta si un
caller sustituye payload o metadata después de construir el envelope.

Cada `Hub` queda ligado a un `ProductID` cerrado (`overlay`, `engineer`,
`strategy` o `analysis`). El envelope snapshot publica ese producto junto con
`projectionVersion`, `epoch`, `sequence`, `kind` (`full` o `delta`),
`capturedAt` UTC, `statusRevision` y el payload local. Un hub rechaza envelopes
de otro producto. Rechaza además versión desconocida, cursor cero o discontinuo,
epoch regresivo, reinicio de epoch que no empiece en secuencia 1, tiempo no UTC,
JSON inválido, payload no objeto, campos reservados
`raw/source/clock/observed/derived/finalState/canonicalVersion` y tamaños sobre
el límite. El límite duro es 256 KiB y un harness solo puede reducirlo. No
serializa `derive.FinalState`, schema, core ni raw.

## Full, delta y resync

Cada publicación conserva siempre un full completo. Delta es opcional y usa
JSON Merge Patch RFC 7396. Antes de aceptarlo, el hub lo aplica al full anterior
y exige equivalencia JSON con el nuevo full.

- Late join y reconnect reciben status actual y full actual.
- Un consumidor continuo puede recibir delta.
- Si pierde secuencia, cambia epoch o queda lento, recibe el último full.
- Si delta se desactiva, todas las publicaciones siguen siendo correctas.
- Un delta inválido/no equivalente se descarta y el full sigue publicándose.
- El publisher nunca espera al consumidor: cada suscriptor conserva un único
  slot latest-wins.

## Status y hechos

Status usa un evento separado de bajo ritmo y específico del producto
(`telemetry:<producto>:status`). Snapshot
referencia su `statusRevision`. Si status avanza antes del siguiente snapshot,
el hub invalida el snapshot pendiente anterior: late join observa status nuevo
y espera el full de la misma revisión, nunca una pareja incoherente.

Los hechos usan `FactEnvelope` y `telemetry:<producto>:fact`, con
`factSequence` propio. Los adapters consumen una fuente pull-based ordenada:
no coalescen hechos, no infieren su cursor desde snapshots y verifican
continuidad exacta desde `after`. Gap, duplicado o regresión exigen resync.

## Wails y SSE

`ServeWails`/`ServeWailsFacts` y `SSEHandler`/`SSEFactsHandler` emiten nombres
inequívocos (`telemetry:<producto>:projection|status|fact`) y el mismo JSON.
Las rutas SSE son `/telemetry/<producto>/projection` y
`/telemetry/<producto>/facts`; una ruta de otro producto devuelve 404. Son
funciones bloqueantes, no crean goroutines y terminan por contexto/cierre. El
owner de composition decide su lifecycle.

SSE solo acepta requests loopback y no se registra aún en el servidor
productivo. Wails tampoco se conecta al runtime productivo. TC-05C añadirá
decoder/store TypeScript y harness compartido antes de migrar pantallas.

## Verificación

```powershell
go test ./internal/app/telemetrytransport -count=20
go test -race ./internal/app/telemetrytransport -count=5
go test ./internal/app/telemetrytransport -run '^$' -bench BenchmarkHubPublishSnapshot -benchmem -count=5
go test ./internal/telemetry/... -count=1
go test ./... -count=1
pnpm --dir frontend test
pnpm --dir frontend build
git diff --check
```

No corresponde Playwright: no hay UI, route productiva ni harness browser.

Rollback: eliminar el subpaquete y revertir estas notas. Al no existir wiring,
persistencia o migración de datos, no requiere conversión ni cleanup runtime.

## Overlay Projection v1 aditiva — ISA-129 D7

D7 conserva `projectionVersion=1` y todas las claves base. Añade únicamente
campos opcionales ya demostrados por el pipeline canónico:

- sesión: end, remaining y maximum laps;
- vehículos: piloto, clase, sector, distancia, tiempos de vuelta, penalties,
  gaps e inventario fuel amount/capacity;
- derivados: relative gap/lap delta y self-delta con referencia e historial.

Cada muestra pública de delta incluye su `capturedAt` canónico en milisegundos
UTC. `present` describe si el historial conserva muestras; `freshness` describe
el delta actual. Por ello `present=true` con `missing`, `stale` o `invalid` es
válido. El adapter puede conservar la traza ante `missing/stale`, pero quality
impide declararla comparable como fresca. Nunca recalcula timestamps usando el
frame exterior.

El decoder TypeScript exige siempre las claves base. Si una clave D7 no existe,
la normaliza a missing explícito; si existe con tipo, enum, presencia, calidad o
número inválido, rechaza todo el payload. Extensiones futuras desconocidas y
seguras se ignoran después de que el envelope haya pasado el límite de 256 KiB,
profundidad y valores JSON finitos.

La compatibilidad está ejecutada en cuatro direcciones con dos goldens:

| Productor | Consumidor | Resultado |
|---|---|---|
| v1 pre-D7 | v1 pre-D7 | superficie base sin cambios |
| v1 pre-D7 | v1 D7 | campos aditivos missing explícitos |
| v1 D7 | v1 pre-D7 | claves aditivas ignoradas |
| v1 D7 | v1 D7 | Go → JSON → transporte → decoder → adapter |

No se añadieron capabilities nuevas: su enum era obligatorio en el consumidor
antiguo y ampliarlo habría roto el cruce nuevo → antiguo. La disponibilidad se
expresa por `Field` y quality metadata. D7 tampoco añade wiring Wails/SSE ni
modifica renderizadores, ViewModels, CSS, canvas o runtime productivo.
