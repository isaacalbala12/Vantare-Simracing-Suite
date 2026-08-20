# ISA-372 / F11 — cadencias y regulación antes de proyectar

Fecha: 2026-08-20.

Rama: `vantareapp/isa-372-tc-f11-cadencias`.

Base: `tc-integration@f7e2cc07f252e0259d2aaf0117c7864ae5c43f7e`.

## Resultado

La cadencia de Overlay v2 se decide en Go **antes** de construir cada sección
del frame, y por tanto antes de serializarlo. Regular después sólo habría
ahorrado transporte; regular antes ahorra también el trabajo de construcción.

El frame publicado sigue siendo **completo**. Una sección que el scheduler no
programa reutiliza el valor memoizado de su última construcción: es memoización
por sección, nunca un parche. El contrato wire v2 no cambia y
`telemetry-contract-gen -check` queda verde.

Los defaults son cero, es decir, **el comportamiento actual sin regulación
alguna**. Bajarlos requiere medición en el binario real (Wails + OBS), que es el
criterio de F11 en el plan y sigue pendiente.

## Diseño del scheduler

`SectionCadence{Fast, Mid, Slow, DirtyCeiling}`. Cada duración es el
espaciado **mínimo** entre reconstrucciones; cero significa "en cada tick".

| Tier | Secciones | Nota |
| --- | --- | --- |
| Fast | `player`, `delta` | `controls` vive dentro de `player`; el contrato no tiene campo propio. |
| Mid | `relative`, `spotter` | |
| Slow | `session`, `standings`, `fuel`, `capabilities` | `gaps` vive dentro de `standings`. |

`SectionScheduler` es puro y determinista: no tiene reloj propio, ni timers, ni
goroutines; el llamante inyecta `now`. Con las mismas entradas produce siempre
el mismo plan (`TestSchedulerIsDeterministic`). Una sección se reconstruye
cuando:

1. nunca se construyó — el primer frame siempre es completo;
2. el intervalo de su tier es cero (defaults, sin regulación);
3. es fast o mid y su intervalo transcurrió;
4. es slow, su intervalo transcurrió y o no hay techo configurado o la sección
   está sucia — **dirty-trigger**;
5. es slow y transcurrió `DirtyCeiling` — **techo**: nada permanece obsoleto
   más tiempo del configurado aunque no cambie nada.

Un reloj que retrocede se trata como discontinuidad y fuerza reconstrucción.

La suciedad se observa sin invocar a ningún builder (preguntarle a un builder
anularía la regulación): identidad de sesión y epoch, número de vehículos,
firma de posiciones, frescuras de gaps/delta/posición mundial, combustible del
player, campos de sesión y estado/capacidades de la fuente. Una discontinuidad
de flujo (sesión o epoch nuevos) ensucia todas las secciones.

`CachedProjector` es un sustituto directo de `ProjectV2`: aplica el plan, llama
sólo a los builders programados y compone el frame completo. La cabecera
(contrato, epoch, secuencia, sesión, `generatedAt`, unidades) y `SourceStatus`
**nunca** se regulan: saltarlas publicaría un cursor obsoleto.

## Identidad byte a byte con los defaults

`TestCachedProjectorMatchesProjectV2ByteForByte` proyecta 5 ticks con 1, 20, 44
y 104 coches por los dos caminos y compara el JSON resultante. Los payloads son
idénticos y `FullRebuilds == Ticks`, es decir, con los defaults no se salta
trabajo. Ese mismo test es el disparador que fallará si F8 puebla un builder en
`ProjectV2` sin enseñárselo a `DefaultSectionBuilders`.

## Benchmark de cadencias

`BenchmarkOverlayV2ByCadence`, frame completo de 104 coches, cada iteración es
un tick a 60 Hz que se proyecta y se serializa. Windows, AMD Ryzen 7 3700X,
`-benchtime 6000x -count=3` (mediana de tres):

| Cadencia | ns/op | builds/s | marshals/s | B/s | B/op | allocs/op |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Plana (defaults) | 39.118 | 480 | 60 | 78.829 | 82.066 | 37 |
| Regulada 20 Hz fast / 10 Hz mid / 4 Hz slow | 26.516 | 76 | 60 | 78.829 | 74.345 | 27 |

Lectura honesta de estos números:

- Las invocaciones de builder caen un 84 % (480 → 76 por segundo simulado) y el
  coste por tick un ~31 %, con 10 asignaciones menos por tick.
- **Los bytes por segundo no cambian**: 78.829 B/s en ambos casos. Es el
  resultado esperado, no un fallo de la medición. El contrato v2 publica frame
  completo, así que regular la construcción no reduce el payload; reduce CPU y
  asignaciones. Bajar B/s exigiría un contrato incremental, que ADR 0008 no
  aprueba.
- El ahorro medido es un suelo, no un techo: `standings`, `relative`, `delta`,
  `fuel` y `spotter` siguen siendo secciones vacías hasta F8. Cuando esos
  builders tengan trabajo real, el mismo scheduler evitará mucho más.

## Métricas

- `CachedProjectorMetrics.SectionPublishes{section}` — construcciones cuyo valor
  llegó fresco al frame publicado.
- `CachedProjectorMetrics.DirtySkips{section}` — ticks en que la sección
  reutilizó su valor memoizado.
- `PublisherMetrics.BytesPerSecond` — ventana móvil (1 s por defecto, reloj
  inyectable) sobre los bytes aceptados; `SnapshotBytes` es el acumulado. Sólo
  cuenta snapshots: el status se publica por cambio, no por cadencia, y un frame
  rechazado por tamaño no suma bytes.

El conteo por sección vive en el projector y no en el Publisher porque el
Publisher no conoce secciones: recibe un payload ya serializado.

## Facts

`TestCadenceDoesNotDelayFacts` verifica que `cadence.go` no importa nada de
Engineer, facts, transporte ni política de mensajes, y que incluso con la
cadencia estrangulada al máximo cada tick sigue publicando un frame completo con
su propia revisión. Los facts de Engineer viajan por el canal ordenado de F7 y
no atraviesan el scheduler.

## Frontend

`telemetry-rate-coordinator.ts` pierde los buckets por Hz y sus `setInterval`:
la responsabilidad de frecuencia muere en el backend. Queda un único bucle de
repintado (rAF inyectable) compartido por todos los suscriptores, que notifica
como mucho una vez por frame y sólo si llegó algo nuevo. `subscribe(hz, ...)` y
`getSnapshot(hz)` aceptan el argumento por compatibilidad de código y lo
ignoran, así que ningún consumidor cambia. También desaparece el caso especial
por estado (`stale`/`disconnected`/`error`): el coordinador ya no decide qué
snapshot merece pintar.

## Cómo activar la regulación

Hoy no hay flag de usuario porque los defaults son "sin regulación". El
orquestador conecta el camino con una línea en `telemetry_core_runtime.go`
(archivo del carril A, fuera del alcance de este worker):

```go
overlayV2Project: overlayv2.NewCachedProjector(overlayv2.DefaultSectionCadence()).Project,
```

Esa forma exige adaptar la firma, porque `Project` recibe además `now`. La
integración mínima real es sustituir el campo `overlayV2Project` por el
projector y pasarle `runtime.now()` en la llamada de `publishOverlayV2`:

```go
// en newTelemetryCoreRuntime: runtime.overlayV2Projector = overlayv2.NewCachedProjector(overlayv2.DefaultSectionCadence())
update, err := runtime.overlayV2Projector.Project(final, overlayv2.SourceContextV2{...}, overlayv2.DefaultPreferencesV2(), revision, runtime.now())
```

Con esa integración debe retirarse la entrada de `cadence.go` en
`wiringGuardAllowed` (`internal/telemetry/wiring_guard_test.go`), que hoy existe
sólo porque el código está deliberadamente desconectado.

## Gates locales

- `go build ./...` — sólo falla `frontend/embed.go` por `dist` ausente, que es
  previo a este trabajo y no depende de Go.
- `go vet ./tools/... ./internal/telemetry/... ./internal/app/...` — sólo los
  tres `unsafe.Pointer` heredados.
- `go test ./tools/... ./internal/telemetry/... ./internal/app/... -count=1` —
  verde salvo el panic previo de `internal/app/launcher`
  `TestDiscoverIconsSmoke` ("assignment to entry in nil map"), ajeno a F11.
- `go run ./tools/telemetry-contract-gen -check` — sin diff.
- `pnpm --dir frontend test` — 396 archivos, 2890 tests, todos verdes.
- `pnpm exec tsc --noEmit` y `git diff --check` — limpios.

## Pendientes

- Medir bytes/s y CPU en el binario real (Wails + OBS) antes de bajar los
  defaults. Sin esa medición la regulación queda inerte por diseño.
- Aplicar la línea de integración en `telemetry_core_runtime.go` y retirar la
  excepción del wiring guard.
- Revisar la señal de suciedad de `standings` y `relative` cuando F8 pueble esas
  secciones: la firma actual observa posiciones y frescuras, no contenido.
