# Astra — plan experimental y primer lote

## 1. Executive decision

**Un cambio de producto califica y se entrega:** [ISA-979 / PR draft #980](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/980), contorno estático del mapa V2. Base final nightly, un archivo productivo, +26/-3 líneas. Constructor completo: **209,493 → 6,919 µs/op, −96,70%, n=10 por variante**, mismo Mac y fixture. No representa FPS ni CPU total. Se conservan posiciones, estados y cadencias. No se eligen tres cambios por cuota.

Los ahorros de bundle de rutas e idiomas están demostrados como experimentos de construcción; faltan gates funcionales o resolver PRs activos. Se rechazan pools, stores globales, memoización masiva, reescrituras y retirada de legacy bajo esta issue. Telemetry Core no se valora por instrucción del usuario.

## 2. Repository snapshot

BASE_NIGHTLY `659b2c57dc2c7fc75962cc3c8e425ed1289266ec`; NEXT_CANDIDATE `813b96c43028353a599903fb035268c354b58896`; INDEPENDENT_PENDING contiene un SHA por PR en snapshots.json. Checkout principal nightly intacto. La auditoría se midió sobre candidato, salvo filas explicitadas como BASE. La entrega documental se basa en nightly para cumplir el contrato de PR.

## 3. Current integration candidate

#977 contiene #969 y #970–976 por ancestry, 123 commits por encima de nightly, checks exactos verdes en el inventario. Es un candidato coherente R0–R6b, no un merge aprobado. Los PRs Clerk y lazy navigation no se incorporaron de forma artificial. El archivo productivo de ISA-979 era idéntico entre ambos snapshots: por eso el cambio puede entregarse aislado contra nightly y se repitieron allí sus pruebas.

## 4. PR topology

Inventario completo de 156 PRs: 9 incluidos en candidato, 139 independientes, 4 patch-equivalentes con nightly, 3 absorbidos por ancestry, 1 superseded explícito (#792 por #795). `pr-topology.csv` incluye base/head SHA, checks, reviews, diffs, issue, relación padre/hijo, estado de merge y equivalencias; `pr-primary.json` conserva paths y resultados Git completos. Los estados son del momento de colección, no pronóstico. Range-diff #792/#795 y patch-id estable complementan merge-base/cherry. No se cierran PRs antiguos por inferencia.

## 5. Measurement methodology

Clasificaciones y fixture en cada CSV. Lockfile congelado, toolchain fija, salidas fuera del árbol fuente, secuencial. Grafos capturados con plugin Vite y bytes recontados sobre disco final tras rewrite de preloads. Cierre transita manifiesto desde HTML más runtime seleccionado, incluyendo CSS y assets referenciados; no solo un chunk. Gzip nivel9, brotli11; renderedLength es atribución preminificada, no ahorro real.

Go: count10, benchmem, fixtures existentes; 100ms/serie en solver/Engineer y 100x para pull (ruido mayor), perfiles CPU/alloc para storage. No hay cambio Go que justifique fingir un BASE/HEAD. JS: warmup1000, 10×3000, checksum y tests semánticos. Chromium: React DEV, 44 coches sintéticos, tres widgets productivos, 3×180 rAF con 30 warm-up; no WebView2.

Presupuestos: no reducir frecuencias ni calidad; cero subscriptions tras dispose; no crecimiento entre10/50; una entrada de caché máxima; ahorro superior a ruido y justificado por frecuencia. No sumar etapas superpuestas ni trasladar cifras Mac a Windows.

## 6. What is already fast

Solver endurance ~2,6 µs/op; Engineer resolver ~35ns sin allocations; delivery/preemption ~10µs; Spotter→radio ~2,6µs. SettingsLoad ~18µs y ProfileLoadV4 ~60µs con fixtures calientes. **NO PERFORMANCE CHANGE RECOMMENDED** para esas rutas y cargas. No implica certificar audio físico, startup frío o todos los casos del solver.

## 7. Proven bottlenecks

`track-map-view-model-v2.ts::draw` reconstruía proyección y SVG para la misma pista cada frame. El CPU profile concentra muestras en `buildTrackOutlinePath` y su callback; esto explica la mejora específica sin culpar indiscriminadamente a React. El otro coste demostrado son bytes de features/idiomas cargados antes de necesitarlos; su efecto en TTI autenticado no está medido.

## 8. Bundle attribution

| Entry candidato | Min bytes | gzip | brotli | CSS |
|---|---:|---:|---:|---:|
| Hub/Home | 2.204.006 | 603.559 | 464.721 | 479.233 |
| Desktop | 1.239.626 | 344.925 | 250.243 | 330.651 |
| OBS | 1.152.609 | 321.360 | 229.354 | 329.630 |
| Studio | incluido en Hub | incluido | incluido | incluido |

Overlay → builtin registry → widgets/view models → i18n/geometry. Motion, Supabase y componentes Strategy están ausentes de Desktop/OBS. Idiomas aportan 530.771 renderedLength, pack144.498; estos números no se suman a min bytes. Cuatro fuentes emitidas, incluido CascadiaCode387.936bytes; Inter se deduplica por contenido. Disponibilidad no implica descarga. Sourcemaps desactivados. Assets y grafos completos están comprimidos en raw/.

## 9. Frontend runtime

El coordinador entrega frecuencias por widget: en la fixture nivel3 mapa20Hz, pedales40, standings5. La duración media de commits de mapa en experimento cache baja moderadamente (BASE2,23–2,84ms, HEAD2,01–2,30ms), tres muestras no bastan para claim de FPS. Los marcadores generan DOM cambiante en ambas variantes. No se añade store global, árbol fast/slow ni actualización imperativa distinta del renderer compartido.

Parse/evaluate del producto autenticado, primera apertura de rutas, prefetch por intención y tabs de Strategy permanecen UNKNOWN en este ejercicio. El build del prototipo no equivale a demostrar estos flujos; son gates enumerados, no mejoras entregadas.

## 10. Memory/lifecycle

En el harness auxiliar, 20 nodos y cero suscripciones después de10/50 ciclos. Listeners19→159 tras inicializar React root y159 tras50: plateau, no evidencia de fuga por ciclo. No extrapolar a Private Bytes. `lifecycle-resources.csv` distingue owner/cleanup/cobertura para Wails, SSE, stores, timers, observers, rAF, caché, audio, workers y CDP. Las suites cubren profile/connect/disconnect/StrictMode; todavía falta una prueba de ventana completa dentro del mismo proceso nativo y soak.

## 11. Runtime publication

Pull44: 25.105bytes, ~3,5–4,4µs/op,81.952B/op,7allocs. Pull104:58.333bytes,~8,3–10,7µs,196.768B/op,7allocs. Son partes del transporte, no end-to-end. Latest-wins/replay/ACK/dispose cubiertos por tests; una entrega pendiente acota cola por consumidor.

**Corrección posterior al informe ciego:** `Publisher.PublishSnapshot` serializa fuera de su mutex, pero `TelemetryCoreRuntime.publishOverlayV2` mantiene `runtime.mu` exterior durante marshal/publicación. No afirmar que todo el problema de sección crítica esté resuelto. PERF-009 exige perfil de contención y tests de orden revision/status; PERF-010 exige medir overlayPerformancePolicy y su invalidación. Son bordes candidatos a medir, sin modificar ni valorar Core.

## 12. Startup/storage

SettingsService.Load protege recovery/sidecar/main/backup con mutex; dos intentos de lectura normales y backup condicional. ProfileDocumentStore.LoadV4 mide parsing+migración+validación, ~60µs en fixture. Strategy MigrateRepositoryJSON verifica duplicados incluso en versión actual, ~10,5µs; no se salta integridad. Repository.Snapshot no toma lease de escritura, Commit conserva atomicidad/fsync. No paralelización ciega.

Once marcadores de startup y cold SQLite/TTI siguen UNKNOWN; el colector Windows no presenta duración total del escenario como startup. Los archivos desconocidos/telemetry recording en desarrollo no se califican como lentos a partir de fallos de tests macOS.

## 13. Strategy

Ruta `OrbitShell` → página/workflow → application client → Go service → solver/repository. Gran coste de entrada viene del import eager (260.639 renderedLength atribuidos), no del solver2,6µs. EXP02 separa página y cliente sin cambiar dominio. Mantener ADR0006 y autoridad Go; ningún rescate integral Product A, parsing en React ni refactor de paquetes por performance.

## 14. Engineer

Evento→monitor/evaluación por familia→messagepolicy/scheduler→radio/TTS→presentación. Microbenchmarks no incluyen sonido físico; los timers y generaciones se disponen según su owner. La coexistencia con legacy exige paridad por familia antes de retirar; no se confunde menos código con menor latencia. Race amplio PASS en candidato.

## 15. Legacy/migration constraints

ISA-894 conserva retirada R7 y sus contratos. CompositeApp, ObsOverlayApp y main son zonas de exclusión hasta liberar ownership. No retirar rollback/shadow ni canales bajo auditoría. Los diagnósticos históricos de setTelemetryKey/rAF por widget están superados en el candidato; no repetir sus soluciones. Informes health previos no conceden autoridad de merge. La reconciliación incluye discrepancias de snapshots, unidades y lock exterior.

## 16. Exact accepted changes

**PERF-001 — Reutilizar el último contorno estático V2**. P2, confianza alta en cálculo puro; snapshot de descubrimiento813b96c4, entrega nightly659b2c57. Archivo/símbolo: `frontend/src/overlay/widget-types/track-map/track-map-view-model-v2.ts::draw/getStaticOutline`. Ruta: frame→V2 view model→geometry projection→SVG→renderer. Modificación: clausura privada con una entrada invalidada por identidad y width/height/padding; marcadores por frame. Conceptos añadidos1 (caché derivada privada), eliminados0; trabajo estático repetido eliminado en hits. Sin otra autoridad o dependencia. Ownership por contexto JS del módulo; no conserva frames ni datos de usuario. Coste cold call igual; alternar pistas puede perder hits sin alterar correctness.

BASE209,493µs, HEAD6,919µs, resultado real −96,70% n10; esperado en producción únicamente reducción de ese cálculo; CPU/s a20Hz es PROJECTED~4ms. Test: todas las pistas/aliases, alternancia, viewport, fuente, contenido y markers; benchmark antes/después; suite final3299PASS, build/typecheck/lintPASS. Riesgo bajo, +26/-3 líneas productivas y +261bytes min en experimento de candidato. Dependencia: ninguna migración para el archivo idéntico; conflictos exactos0 de156. Archivo exclusivamente REACT-RUNTIME. WindowsCI requerido para integrar, físico solo para claims nativos. RevertPR980. TelemetryCore:NO. **IMPLEMENT NOW — WINDOWS CI REQUIRED**, entregado como draft con gates remotos observables. Commit productivo97e01958, HEAD330d3387.

Deletion test: no puede borrarse el contorno, sí el trabajo repetido. Inline test: helper privado pequeño evita abstracción genérica. Deep-module: interfaz un argumento geométrico; oculta proyección/cache. Frequency:20Hz representativos. Concept budget:una caché limitada. Ownership:solo asset estático y viewport; los datos vivos nunca se cachean.

## 17. Rejected optimizations

REJECT: pack TLA aislado (el await aún exige descarga), eliminar Motion sin paridad de salidas, auth ligera que omita licencia, pools/clones compartidos sin ownership medido, store React global, memo masiva, reducir Hz, eliminar fsync, consolidar Core o micro-paquetes por performance. Sus motivos y gates están en decision-register.csv. Mantenibilidad pura (main/bridges/árbol histórico) no entra al ranking de rendimiento.

## 18. Parallel lanes

No se usaron agentes ni edición paralela. El documento `parallel-lanes.md` define ownership exclusivo y transferencia ordenada, no orden de ejecución automática. Main/Composite/Obs continúan bloqueados por migración; los carriles futuros no adquieren esos archivos simultáneamente. Cambios que comparten archivo se hacen seriales en el mismo carril.

## 19. Windows validation

Entrada única `scripts/performance/windows/Invoke-VantarePerformanceValidation.ps1`. Reutiliza huella: SHA/hash, hardware/versiones, escenarios, warmup separado,5repeticiones, CSV/JSON sanitizado, PID/roles confirmados, cleanup y sin upload. **No ejecutado en este Mac**. Ver README para licencia/fixture/Go/Node/WebView2.

Capacidad actual: Hub visible/minimizado, overlay idle/carrera y control LMU. **No constituye un harness completo de todos los incógnitos**: once marcadores de startup están explícitamente UNKNOWN; OBS físico, soak30min, ciclos nativos10/50 y E2E por secuencia requieren ampliar instrumentación bajo gates del backlog. No se finge que cinco reinicios equivalen a esos ensayos. El backlog diferencia capturable ahora y sonda aún ausente.

## 20. First implementation batch

Un cambio implementado, issue979 antes de editar, rama propia, worktree propio cerrado limpio, draft980 contra nightly. Hubo un intento de base apilada rechazado por contrato local; se corrigió sin integrar candidato y se repitió validación final. Ningún otro cambio cumple simultáneamente beneficio, paridad, ausencia de conflicto y aislamiento. Estado de CI exacto en delivery-status.json; no anunciar aprobación de un check pendiente. Sin merge/promoción/release.

## 21. Subsequent PR order

1. Review de980 y CI exacto; integración solo con Isaac.
2. ISA-894 termina/libera archivos según su plan, sin mezcla con optimización.
3. Coordinar lazy rutas dentro de #801; medir primera visita/prefetch/KeepAlive antes de aceptar.
4. Locale activo: contrato de fallback/races/offline y namespaces → PR propio; luego edit branch si todavía ahorra sobre esa nueva base.
5. CSS por entry con cobertura visual, separado de idiomas.
6. Política/marshal: microbench y contención + revision/status antes de cambio, cuando su owner libere runtime.
7. Campaña Windows y sondas ausentes antes de publicar claims nativos.

## 22. Remaining unknowns

No certificadas: Windows runtime/FPS/GPU/Private Bytes, OBS real, cold startup/SQLite, lifecycle completo, TTS físico, parse/evaluate autenticado, primera visita de rutas, prefetch, namespaces y track-ID loaders funcionales, perfil de contención exterior y política. Los experimentos Mac ejecutados cierran hipótesis concretas; no se presenta exploración incompleta como cobertura exhaustiva. Esos puntos no justifican cambios especulativos ni impiden revisar el pequeño cálculo ya demostrado.

## 23. Evidence index

Informe ciego96539f54 inmutable; reconciliación posterior; environment/snapshots/PR topology; commands.jsonl/md; bundle CSV y attribution; runtime/Go/React CSV; lifecycle/experiments/change/decision registers; lanes; generated drift; Windows backlog; raw graphs/profile series/logs comprimidos; previous report hashes. `scripts/performance/README.md` explica reproducción. La referencia `vantareapp/isa-978-blind-freeze` conserva el commit original previo a leer informes; el archivo entregado tiene el mismo blob Git.

## Top 10 de hipótesis de rendimiento (no diez aprobaciones)

| Rank | Change | Evidence | BASE | Expected/Measured | Effort | Risk | Lane | Decision |
|---|---|---|---|---|---|---|---|---|
|1|Contorno V2 estático|CPU+bench+paridad|209,493µs|6,919µs medido|pequeño|bajo|REACT-RUNTIME|IMPLEMENT NOW/Windows CI|
|2|Rutas lazy literales|build manifiesto|603.559gzipHub|433.795medido|medio|medio|HUB-BUNDLE|WAIT #801|
|3|Locale activo|build manifiesto|344.925gzipDesktop|247.289medido|medio|medio|OVERLAY-BUNDLE|SMALL GATE|
|4|Editor por demanda|build manifiesto|344.925gzip|322.942medido|pequeño|medio|OVERLAY-BUNDLE|WAIT migración|
|5|CSS global por entry|bytes por cierre|330.651CSS|UNKNOWN reducción|medio|medio|HUB-BUNDLE|SMALL GATE visual|
|6|Política precalculada|código, coste desconocido|UNKNOWN|UNKNOWN|pequeño|medio|RUNTIME-PUBLISH|SMALL GATE benchmark|
|7|Marshal fuera lock exterior|sección crítica observada|UNKNOWNcontención|UNKNOWN|medio|medio|RUNTIME-PUBLISH|SMALL GATE ordering|
|8|Auth bootstrap separado|grafoHub|341.679premin|UNKNOWN|alto|alto|COMPOSITION|WAIT Clerk|
|9|Pack TLA|build+dependencia|pack obligatorio|76.358chunk obligatorio|pequeño|medio|REACT-RUNTIME|REJECT aislado|
|10|Motion→CSS|grafo+paridad no probada|211.714preminHub|UNKNOWN|medio|medio|HUB-BUNDLE|REJECT sin paridad|

### Maintainability enablers

Invocación Wails con cero servicios, sondas de startup ausentes y base de PR canónica merecen tooling verificable. No se les asigna ahorro de FPS, CPU o LOC ficticio. Extraer main o borrar árbol histórico necesita issue y contratos propios; ninguna implementación estructural se mezcla aquí.
