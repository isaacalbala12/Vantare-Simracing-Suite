# Astra — valoración ciega congelada

Fecha de cierre: 2026-09-04 22:26 UTC. Issue #978. Este documento se congela en un commit anterior a la lectura de auditorías previas. No se corregirán retroactivamente sus conclusiones: los nuevos datos se publican en la reconciliación y el plan. Un único auditor, ejecución secuencial, sin subagentes. **Telemetry Core queda excluido de valoración por instrucción expresa de Isaac**; se miden consumidores, transporte y servicios periféricos, sin evaluar su semántica en desarrollo.

## Decisión independiente

La primera mejora que merece pasar a un gate pequeño es dejar de reconstruir el contorno estático de la pista en cada frame V2. El perfil señala exactamente `frontend/src/overlay/widget-types/track-map/track-map-view-model-v2.ts::draw` → `createTrackProjection` → `buildTrackOutlinePath`. El microbenchmark del constructor completo, con 44 coches y Circuit de la Sarthe (1.363 puntos), baja de una mediana de aproximadamente 209 µs a 6 µs con una caché limitada a una sola geometría/viewport. Diez repeticiones por variante no se solapan. Los marcadores continúan calculándose con cada frame. No es una afirmación de FPS, latencia Windows ni consumo total.

El primer lote solo debe aceptar esta mejora si confirma igualdad de resultados, cambio de pista, viewport, contenido, estados de conexión, posiciones y ausencia de conflicto de archivo. La caché será privada, exclusivamente derivada, acotada y sin autoridad sobre telemetría. No se creará un store ni una política global. El coste previsto evitado a 20 Hz es **PROJECTED ~4 ms de CPU por segundo por mapa**, no un ahorro medido del proceso completo. Antes de pasar el gate: IMPLEMENT AFTER SMALL GATE.

No se justifica optimizar el solver de Strategy, la selección de presentaciones de Engineer, ni introducir pools en transporte. El volumen inicial del frontend sí es material, pero los cambios grandes de rutas, idiomas y auth no califican automáticamente para un primer lote seguro.

## Snapshot real, sin equiparar PR abierto con entrega

| Snapshot | SHA | Base/inclusión | Motivo |
|---|---|---|---|
| BASE_NIGHTLY | `659b2c57dc2c7fc75962cc3c8e425ed1289266ec` | origin/nightly remoto verificado | Comparación de drift, no supuesto tip más avanzado |
| NEXT_CANDIDATE | `813b96c43028353a599903fb035268c354b58896` | 123 commits sobre BASE; #969 y cadena #970–977 | Ancestry local verificado; #977 contiene integración Endurance y retirada V1 R0–R6b; checks de HEAD exitosos; no aprobación de integración inferida |
| INDEPENDENT_PENDING | un SHA por PR en `pr-topology.csv` | 139 independientes; otros 4 patch-equivalentes, 3 absorbidos por ancestry y 1 superseded explícito | No se incorporan silenciosamente |

Inventario inicial: 156 PRs abiertos, antes de crear la issue propia. #977 no se eligió por número. Los checks exitosos son Validate promotion path, Validate Vantare blocking gates y GitGuardian sobre ese SHA; no certifican LMU físico. `git cherry` y merge-base distinguen equivalencia y ancestry. La API de detalle de un PR limita archivos/commits; la lista completa de archivos y la ascendencia se obtienen de Git local. PR #801 ocupa navegación lazy/prefetch; #783 lifecycle/calendario; #795 sustituye explícitamente #792; #913/#886/#880 trabajan auth Clerk; #237/#242/#244 afectan geometría antigua. Ningún PR inventariado modifica el archivo V2 candidato al pequeño cambio de contorno. La retirada V1 permanece bajo ISA-894: no se acelera ni se elimina rollback por esta auditoría.

## Método y presupuestos de decisión

Mac Apple M5 arm64, 16 GB, macOS 26.6.2; Go 1.25.0, Node 22.23.2, pnpm 9.1.0, Wails alpha.98, React 19.2.7, Vite 8.0.16 y TS 6.0.3. Lockfile congelado. Builds de medición production con envDir vacío: no se leen `.env*`. No se instalan dependencias nuevas.

Presupuestos antes de cambiar producto: conservar frecuencias de política, contratos y resultados; cero suscripciones tras dispose; no crecimiento entre 10 y 50 ciclos; caché limitada a una entrada; ninguna descarga de feature inactiva sin justificar su import; para claims nativos exigir BASE/HEAD repetidos Windows. La materialidad se decide con variación, frecuencia y coste conceptual, no un porcentaje universal. No se prescribe un objetivo ficticio de RAM/FPS donde no existe baseline local.

- MEASURED-MAC-CANONICAL: bytes finales emitidos, grafo, tests, tipos y drift.
- MEASURED-MAC-RELATIVE: microbenchmarks Go/JS en este Mac. No equivalen a Windows.
- MEASURED-MAC-AUXILIARY: Chromium/React de desarrollo con fixtures sintéticas y renderer productivo.
- WINDOWS-RUNTIME-BLOCKED: WebView2, Wails/LMU/OBS reales, Private Bytes, GPU y lifecycle nativo.
- UNKNOWN: ninguna cifra cuando falta una sonda o escenario funcional.

Los bytes se calculan sobre manifiesto final, siguiendo imports estáticos desde HTML y runtime seleccionado; contar solo `overlay-main.tsx` o un chunk da una cifra incompleta. Se corrigió el recolector antes de congelar: Vite cambia preloads tras generateBundle y HTML tiene imports propios. Una repetición del candidato confirmó los tamaños. Las atribuciones renderedLength son previas a minificación y no se suman a bytes finales. Los tiempos del recolector incluyen compresión y no representan build productivo.

## Bundle de producto

| Entry | BASE min bytes | CANDIDATE min bytes | CANDIDATE gzip | CSS bytes |
|---|---:|---:|---:|---:|
| Hub | 2.209.218 | 2.204.006 | 603.559 | 479.233 |
| Overlay Desktop | 1.269.071 | 1.239.626 | 344.925 | 330.651 |
| OBS | 1.182.554 | 1.152.609 | 321.360 | 329.630 |
| Studio | incluido en Hub | incluido en Hub | incluido en Hub | incluido en Hub |

Studio es una ruta del Hub, no un tercer HTML. Raw, brotli, módulos y chunks constan en CSV. Sourcemaps de producción desactivados. Los harnesses no son entradas del producto.

Rutas causales: `overlay.html` → `overlay-main.tsx` → builtin registry/widget catalog → view models → track geometry pack e i18n; el entry selecciona CompositeApp u ObsOverlayApp. `i18n.ts` importa es/en/pt/it; LANGUAGE_OPTIONS traduce etiquetas en evaluación de módulo. Las definiciones registradas arrastran renderers/estilos incluso si un perfil no usa cada widget. El pack de geometría aporta 144.498 bytes renderedLength y los catálogos i18n 530.771 en ese cierre. **Motion, Supabase y componentes Strategy aportan cero módulos al cierre Overlay/OBS actual.** Las traducciones de Strategy no son la página Strategy.

Hub: `main.tsx` → AppShell → HubApp → OrbitShell → todas las rutas. Strategy aporta 260.639 renderedLength; Supabase 341.679; Motion 211.714 (las categorías Motion/Motion DOM se solapan, no sumarlas). `AuthSessionBridge` restaura sesión y refresco mediante cliente Supabase con estado en memoria; Go/credential manager conserva autoridad de sesión y licencia. No se debilita restauración, offline/grace ni permisos.

CSS compartido: 274.727 bytes de estilos globales/tokens y 53.558 de widgets, además de CSS propio por runtime. Mover JS de idiomas no reduce ese CSS. No se ha demostrado coste de selectores o paint por esos bytes; no se acepta purgar reglas sin cobertura visual. Inter tiene dos referencias de fuente resueltas al mismo asset: no equivale a dos descargas. Assets/font-face disponibles no equivalen a bytes transferidos: el navegador decide según uso.

## Experimentos aislados, sin editar producto

Los transforms Vite se aplican en memoria, guardan before/after y escriben dist fuera del worktree; cada ejecución empieza de fuentes canónicas intactas. Build demuestra frontera del bundler, no paridad funcional.

| EXP | Prueba y resultado | Decisión |
|---|---|---|
| 01 | Cierre por manifiesto + separación edit: Desktop 1.239.626 → 1.155.870 min; gzip 344.925 → 322.942 | IMPLEMENT AFTER SMALL GATE; CompositeApp zona activa de migración; comprobar entrada/salida edit, fallback y errores |
| 02 | Imports lazy literales en OrbitShell, conservando KeepAlive: Hub 2.204.006 → 1.553.851 min; gzip 603.559 → 433.795 | WAIT FOR ACTIVE MIGRATION #801; prefetch/primera visita/estado retenido no certificados por build |
| 03 | Locale activo ES por demanda: Desktop 866.540 min / 247.289 gzip; cuatro chunks independientes | IMPLEMENT AFTER SMALL GATE; prototipo no preserva aún races/errores y fallback al cambiar idioma; namespaces no implementados |
| 04 | Pack estático presente; experimento import dinámico con await produce chunk de 76.358 min / 31.583 gzip | NO MATERIAL BENEFIT en carga completa: el await sigue exigiendo pack antes de usar renderer. Carga por track ID exige frontera async pendiente; no afirmar ahorro de runtime |
| 05 | Motion ausente de Overlay/OBS; consumidores reales en Hub | REJECT retirada general; no se ha demostrado equivalencia de animaciones ni materialidad del reemplazo |
| 06 | Supabase ausente de Overlay/OBS, necesario en bootstrap autenticado Hub; migración Clerk activa | WAIT FOR ACTIVE MIGRATION; REJECT quitar validaciones para ahorrar bytes |
| 07 | CSS medido por entry, assets deduplicados por destino | IMPLEMENT AFTER SMALL GATE solo para separar hoja global; sin cobertura visual no purgar |
| 08 | Constructor V2 perfilado; caché de contorno 209 → 6 µs; React fixture real 3 widgets | IMPLEMENT AFTER SMALL GATE para caché; REJECT store global/memo masiva |
| 09 | mount/unmount/remount 10 y 50 ciclos del consumidor; cero subscriptions y 20 nodos tras GC en ambos | NO PERFORMANCE CHANGE RECOMMENDED para ese lifecycle; native windows sigue bloqueado |
| 10 | Pull V2 44/104 coches; latest-wins y serialización ya fuera del lock | NO PERFORMANCE CHANGE RECOMMENDED; no pools ni ownership compartido |
| 11 | Solver endurance ~2,6 µs; gate de versión de repositorio ~10,5 µs | NO PERFORMANCE CHANGE RECOMMENDED dominio; bundle se trata en EXP02 |
| 12 | Resolver Engineer ~35 ns sin alloc; delivery/preemption ~10 µs; Spotter→radio ~2,6 µs | NO PERFORMANCE CHANGE RECOMMENDED; TTS/audio físico UNKNOWN |
| 13 | SettingsLoad ~18 µs, ProfileLoadV4 ~60 µs, diez repeticiones, fsync conservado | NO PERFORMANCE CHANGE RECOMMENDED para fixtures calientes; startup frío/SQLite no inferidos |
| 14 | Contratos, tidy, digest y versión sin drift; Wails bindings sale 0 con 0 servicios por invocación en raíz sin main Go | REJECT considerar ese binding gate validación suficiente; requiere corregir invocación en issue independiente |

## Runtime y recursos

El harness usa RuntimeWidgetFrame y coordinador reales, track-map/pedals/standings, 44 coches sintéticos, política V2 nivel 3 (mapa 20 Hz, pedales 40, standings 5, cap 40). Tres bloques de 180 rAF con 30 de warm-up en Chromium headless; el calendario observado del navegador es aproximadamente 120 Hz. No se ejecuta LMU ni auth de producto.

El mapa obtiene 27–28 commits por bloque en BASE, medias 2,23–2,84 ms; caché 28–29, 2,01–2,30 ms. Esto es evidencia auxiliar con pocas repeticiones y React DEV, no una promesa de frame time. Pedales ~50 commits y standings ~8 respetan distintas frecuencias: no todos reciben cada frame. Las mutaciones DOM son semejantes porque las posiciones siguen cambiando. Perfil CPU del constructor: buildTrackOutlinePath y su callback dominan; no se culpa a reconciliación React sin separar el derivado puro.

Tras diez y cincuenta ciclos: subscriptions=0, nodos=20; listeners pasan de 19 iniciales a 159 tras primera creación de root y permanecen en 159. Es delegación React sobre root reutilizado, no crecimiento proporcional a ciclos. El ensayo no demuestra cierre de ventanas nativas ni todos los providers de CompositeApp. Las suites existentes sí cubren teardown/StrictMode, cambios de perfil y conectividad de runtime; una prueba unitaria no sustituye ciclo nativo WebView2.

Ownership: CompositeApp crea sesión pull/listeners por montaje y la dispone en cleanup; ObsOverlayApp posee conexión SSE y auxiliares; RuntimeOverlaySurface posee ResizeObserver/fallback resize y lo desconecta; el coordinador posee suscripciones por widget/rAF y las elimina; harness posee MutationObserver/CDP/browser y los cierra en finally. Recursos de audio/worker/backend necesitan su propio owner y no se imputan a una ventana por nombre. Inventario completo y límites de cobertura acompañan el plan.

## Go, IPC y almacenamiento

Pull 44 coches: payload 25.105 bytes, ~3,5–4,4 µs/op, 81.952 B/op, 7 allocs. Pull 104: 58.333 bytes, ~8,3–10,7 µs, 196.768 B/op, 7 allocs. Son 100 iteraciones × 10, sensibles a ruido; no representan generación completa ni E2E. No sumar a HubPublishSnapshot o a benchmarks superpuestos. A 20 entregas/s de 44 coches, 502.100 bytes/s es PROJECTED; consumo depende de política/ACK y consumidores. p50/p95/p99 E2E y drops reales UNKNOWN.

Publisher serializa antes de tomar mutex; mantiene último payload y una entrega pendiente por consumidor. Las pruebas de replay, ACK y cierre protegen este comportamiento. No se modifica Core, WriteBatch ni proyección canónica para fabricar un ahorro.

SettingsService.Load: mutex durante Load; sidecar `.failed` primero, archivo principal después, backup solo ante corrupción. El benchmark usa defaults serializados en temp privado, no preferencias del usuario. ProfileDocumentStore.LoadV4 usa fixture de tres widgets; parsing+migración+validación están incluidos. MigrateRepositoryJSON verifica duplicados incluso en versión actual: sus ~10,5 µs no justifican saltarse integridad. Repository.Snapshot lee sin lease exclusivo; Commit conserva write+fsync+replace+sync de directorio. No se paraleliza startup ni se elimina fsync por especulación.

Ruta de startup: cmd/vantare/main.go → settings/profile → construcción de servicios Strategy/Engineer → aplicación Wails → WebView → JS → React/Hub. Ruta profile: store/atomic disk → ProfileService → binding/event → estado de UI → view model. Strategy: ruta React → application client → servicio Go → solver/repository → resultado. Engineer: evento → evaluación por familia → scheduler/messagepolicy → radio/TTS → presentación visual. Startup proceso/servicios/WebView/React/interactividad/primer dato/cierre no tienen marcadores completos Windows en esta sesión: UNKNOWN y harness obligatorio, no cifras Mac extrapoladas.

## Gates reales y límites

Frontend: 441 archivos, 3.426 tests PASS (warnings AbortError de teardown happy-dom conservados), typecheck PASS, build productivo PASS ~5,27 s incluyendo tsc. Race focal amplio Go PASS: transporte, Strategy, Engineer, Spotter y radio. Benchmarks portables PASS.

`go test -p 1 ./...` **FAIL en el candidato sin cambios productivos**: launcher referencia FlushIconDiskCache no definido en macOS; dos expectativas de catálogo/diagnóstico; test de ruta absoluta Windows; tests de recording SQLite y permisos. No se arreglan bajo el alcance de rendimiento ni se presenta suite verde. Recording vinculado a Core se registra solo como estado del gate, no como valoración de Core. El generador bindings en raíz entrega 0 servicios: éxito vacío, no prueba de contrato. El candidato tiene CI remoto verde pero eso no borra fallos locales de plataforma.

Incógnitas explícitas: cold start y TTI Wails, parse/evaluate de producto autenticado, primera visita de cada ruta, coste real de selectores CSS/paint, totalidad de lifecycle de ventana, audio/TTS real, OBS transparente/GPU, IPC E2E, SQLite frío y perfiles grandes. Los prototipos de namespaces/track-ID/prefetch no son implementaciones validadas. Se mantienen gates concretos y no se convierten en IMPLEMENT NOW por consenso previo.

La evidencia reproducible, registros y plan se entregan junto a este documento; su creación posterior no cambia estas conclusiones. No hay merge, promoción ni release autorizados.
