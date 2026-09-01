# Handoff vivo — Telemetry Core

## Resultado

Un único núcleo live modular y neutral al simulador. El driver LMU posee Shared
Memory y REST local como fuentes complementarias. Overlay, Engineer, Strategy
y Analysis consumen proyecciones versionadas y nunca abren readers propios.

## Autoridad

- `docs/adr/0004-telemetry-core-modular-observation-architecture.md`.
- `docs/telemetry-core/README.md` y su evidencia.
- `docs/superpowers/plans/2026-07-19-telemetry-core-final-architecture-master.md`.
- Issue y microplan activos en GitHub.

## Estado real

- 2026-09-01, decisión operativa ISA-894/ISA-962: Delta queda fuera de S3 y
  ningún gate depende de completar o validar vueltas del jugador. Las nuevas
  comprobaciones duran cinco minutos, se ejecutan con el jugador en pista y
  siguen el orden S3 → S4 → S5 → S2. El colector falla cerrado fuera de cinco
  minutos y S3 selecciona un perfil Redline sin Delta. La evidencia histórica
  larga se conserva; esta reducción no autoriza Cut 2 ni promoción.

- 2026-09-01, ISA-958 en rama: `CachedProjector` publica `relativeSettled`
  como autoridad única para Endurance Redline. Mantiene una ventana ordenada
  de máximo 8+jugador+8 hasta que otra ventana permanezca estable 7 s; si los
  candidatos oscilan, no salta mientras todos los IDs aceptados sigan realmente
  observados, y rehidrata sus campos desde cada `FinalState`. Ausencia real,
  cambio de sesión/epoch/jugador o falta de jugador reinician inmediatamente.
  El store rechaza secuencias atrasadas dentro del mismo stream y valida ambos
  arrays con side/orden/ID/jugador canónicos. Classic/Minimal/Neo siguen usando
  `relative` inmediato. El adaptador Redline no admite estado de estabilidad
  frontend, evitando un segundo hold. `RelativeRowV2` mantiene posición, última
  vuelta y posición 3D de la misma fila; no cruza Standings. Focales Go y
  frontend, typecheck y diff-check verdes. El candidato integrado superó 441
  archivos/3.418 pruebas frontend, `go test ./...`, build y lint; la revisión
  adversarial de la autoridad aislada fue APPROVE. S3 Wails/LMU sigue pendiente.

- 2026-08-31, ISA-957 en rama: `StandingRowV2` incorpora la mejor vuelta
  canónica con calidad y el ViewModel de Standings separa por fase la métrica
  de mejor vuelta del gap de clasificación. Los goldens V2 y el contrato TS se
  regeneraron desde Go; sin promoción ni prueba Wails/LMU nueva.

- 2026-08-30, ISA-894/PR #955, S1 definitiva: ON y OFF usaron el mismo exe
  `d02054e3…`/dist `5b8e388c…`, Spa práctica y 14 coches. El parser corregido
  deja transporte/paridad en PASS: ON comparó 6.074 frames con cero mismatch
  exacto; OFF recibió cero V1 y mantuvo `shadow=null`; delivery fue 67,6/49,1
  ms p99 frente a 250 ms. El único FAIL común real es memoria: renderers
  +732/+310 MiB/h ON y +314/+308 OFF. Una fase OFF diagnóstica de 10 min con
  polling CDP periódico desactivado redujo la suma renderer post-warm-up de
  +467,4 a +116,7 MiB/h (75 % observado), pero dejó un PID en +134,9 MiB/h.
  Heap JS post-warm-up creció solo +1,7 MiB Hub y +3,8 MiB Overlay con nodos
  estables; no hay retaining paths porque la captura no incluyó snapshots.
  #956 separará PID/target, dominators y una lane `-tags production` sin CDP.
  El gesto fue cruce a pista y escapatoria por teclado, sin vuelta lanzada
  completa; puede requerir repetición estricta. Evidencia:
  `docs/telemetry-core/evidence/isa-894/s1-definitiva-20260830.md`; las tres
  crudas sanitizadas, checkpoints, CSV, resúmenes, SHA-256 y recálculo
  ejecutable están versionados bajo `s1-definitiva/`. Corte 2 sigue bloqueado;
  sin merge, promoción ni release.
- 2026-08-30, seguimiento ISA-894/PR #955 después de S1 ON completa (20 min):
  el segundo fallo `StrictMode` del colector era la enumeración de una lista
  vacía de screenshots finales; el parser y el script toleran listas/targets y
  propiedades CDP opcionales. Los mismatches fuera de `live` ya son
  `not-comparable` con razón de fase. En `live`, `standings.remainingText`
  conserva exactitud pero exige `session|standings` reconstruidas en el mismo
  cursor; el historial de controles pasa a `partial` porque V1/V2 no comparten
  timestamp por muestra, mientras los controles instantáneos siguen exactos.
  S1 observó pendientes de +825,8 y +311,5 MiB/h en renderer no asignados,
  +119,7 GPU, +23,8 Go y +15,0 browser: el gate de memoria sigue FAIL. No hay
  colección shadow ilimitada demostrada (pares/secuencias 64, historial 120,
  35 claves observadas), pero sí hasta 651.120 objetos V2 de historial creados
  sin valor de paridad. El shadow deja de retener/decodificar ese historial,
  limita métricas a 128 claves y publica tamaños retenidos; el colector añade
  heap JS/nodos/listeners por target CDP. La build antigua no asignó PID a
  target, así que no se atribuye toda la pendiente al shadow: hace falta nueva
  ON con esta instrumentación y el diferencial OFF. Evidencia:
  `docs/telemetry-core/evidence/isa-894/diagnostico-s1-on.md`. Vitest completo
  433/433 y 3.294/3.294, focal 98/98, banco Node 88/88, typecheck y lint pasan.
  No hay merge, promoción ni release; corte 2 sigue bloqueado.
- 2026-08-30, seguimiento ISA-894 tras la primera S1 ON real: el colector
  abortó a los 0,20 min porque el target Hub no publica
  `overlay_v2_transport`; el parser ahora normaliza todos los campos CDP
  opcionales antes de aplicar `StrictMode`, con regresión para Hub, overlay sin
  transporte y target vacío. Los 6 mismatches de los 2 frames previos al fallo
  (`speedKph`, `currentLapText`, `lastLapText`, dos cada uno) siguen siendo
  exactos y no se descuentan. El diagnóstico los atribuye al cursor de frame
  actualizado sobre secciones V2 cacheadas, a comparar `currentLap` aunque la
  columna shadow esté oculta y a los placeholders distintos para última vuelta
  ausente. El comparador ya publica/valida `sectionMask`, registra la caché como
  no comparable, omite la columna oculta y normaliza solo placeholders ausentes;
  valores exactos reales siguen fallando. La captura abortada no prueba
  divergencia de payload ni paridad; el corte 2 permanece bloqueado hasta
  repetir S1 ON completa con cero mismatch exacto real.
  Evidencia:
  `docs/telemetry-core/evidence/isa-894/diagnostico-s1-on-20260830.md`.
- 2026-08-30, ISA-894 corte 1 y guardarraíles corte 3 están rebasados sobre
  `origin/nightly@cd03518b` (#954, #942 y #948 incluidos). El schema persistido
  v6 conserva Automático de #948 y añade el interruptor V1 apagado. La app no construye ni publica V1
  por defecto; ajuste `overlayV1Emit=true` o
  `VANTARE_OVERLAY_V1_EMIT=1` lo reactivan tras reinicio. La revisión del PR
  #953 queda atendida: el shadow se crea al primer V1 y en OFF no registra el
  callback V2 (`shadow=null` en 3/3 preflights); el guard Go usa AST para
  resolver `Emit`/`EmitEvent`, constantes y asignaciones locales simples, y
  rechaza la polaridad negada de `overlayV1Emit`; el guard TS recorre cada
  `.ts/.tsx` de `frontend/src/overlay/**` con exclusiones estrechas y congela
  por fichero/conteo el inventario V1 que solo puede retirar el corte 2. El A/B
  final usó una build de diagnóstico con Supabase embebido desde el
  `frontend/.env.local` autorizado: un solo exe SHA-256 `83cfc4cb…a40722`, un
  solo dist `7e95fb08…9f12f`, Spa práctica, 18 coches, A1 y tres corridas
  alternadas de 180 s por estado, sin `-Forzar`. Las seis alcanzaron por CDP
  `license:changed=active`, cuenta autenticada, `configured=true` y
  `deviceOK=true`. OFF recibió 0 V1/16 V2 y `shadow=null`; ON recibió 21 V1/18
  V2 y conservó 48 mismatches diagnósticos. Apagar V1 bajó CPU Go 2,626 ->
  1,707 %, CPU del renderer no asignado 2,256 -> 1,189 % y su RAM 134,70 ->
  96,31 MiB. CPU Go/renderer fue repetible con ruido ≤5 %; RAM renderer tuvo
  8,34 % de ruido OFF y limita la precisión. RAM Go bajó 2,5 %, pequeña y
  repetible. Browser no mejoró y hubo 0/96.977 frames perdidos. El banco ahora
  falla cerrado ante una build `unconfigured` o una sesión no autenticada y
  publica manifiestos de licencia sanitizados. Una regresión adicional
  fija el banco a 180 s de pared: antes hacía 180 iteraciones y prolongaba CPU/RAM.
  El corte 2 sigue
  bloqueado por paridad no exacta y no se tocó. Se añadió el colector autónomo
  `scripts/bench/sesion-v1.ps1` para S1–S5: higiene, hashes, muestreo por PID,
  checkpoints CDP, p99/histograma, screenshots, transiciones humanas/automáticas,
  cierre limpio y veredicto JSON/Markdown. Declara ventanas esperadas, exige
  `pull` y `shadow=null` en cada observación OFF, valida cada ciclo S4 con avance
  V2 y empareja aperturas S5 por clave. Las sesiones las coordinarán Isaac y
  el orquestador tras fusionar corte 1. Issue `roadmap:not-required`: no se
  modifica roadmap. Se publican los seis CSV A/B sanitizados con SHA crudo y
  publicado. Go build/test, vet acotado, contrato, 433 ficheros/3.287 tests
  frontend, typecheck, lint y 38 tests del banco pasan. El digest local está
  bloqueado por estado externo: `origin/nightly@cd03518b` conserva
  `digest.lastCommit=9a9179aa`, anterior al merge #948. Esta rama no copia ni
  regenera ese roadmap. Evidencia en `docs/telemetry-core/evidence/isa-894/`.
  No hay merge, promoción ni release.

- 2026-08-30, ISA-893 parte de `origin/nightly@ca166b38` después
  de integrar #936. El store V2 conserva una sola suscripción imperativa al
  coordinador por generación; cada widget memoizado se suscribe a su sección
  y Studio ya no se suscribe directamente al store. Los 18 widgets
  telemétricos seleccionan ViewModels V2 puros en el `WidgetVisualHost`
  compartido; `engineer-radio` y `race-schedule` usan exclusivamente sus
  canales auxiliares. Surface, editor in-place e inspector resuelven layout y
  visibilidad con un contexto mínimo derivado de V2. Frame ausente, inválido,
  stale, source error y rollback diagnóstico son estados visibles sin fallback
  visual V1. El test de 60 frames conserva 2 renders de Standings en nivel 5 y
  60 en nivel 1. La suite completa (424 ficheros, 3.227 tests), typecheck,
  lint, build frontend, pruebas Go de telemetry/app, contrato generado,
  roadmap y `wails3 task build` pasaron antes de la review. Los hallazgos
  P1.1–P1.5 y P2 tienen commits independientes: diagnóstico antes del filtro,
  fallos ligados a revisión, Calendar productivo, rollback por generación,
  builders V2 de catálogo y diagnósticos productivos. La captura Wails/LMU
  histórica de `cbfb63b8` pintó 20/20, pero precedía esas correcciones. La
  segunda revalidación pasó sobre `68580bac`: build propia, CDP 9243,
  user-data separado, 246 frames V2 live y 20/20 frames montados. La sonda
  exigió el renderer productivo: 19/20 renderizaron; `engineer-radio` quedó
  correctamente oculto porque no hubo presentación de Engineer, sin inyectar
  ninguna. Hubo cero errores de renderer, diagnósticos de autoridad o frames
  sin renderer injustificados. Se cerró limpiamente el PID propio y LMU PID
  16792 permaneció intacto. JSON, PNG, hashes y los 20 códigos quedan
  en `docs/telemetry-core/evidence/isa-893/wails-runtime-pending.md`. Roadmap:
  `milestones:telemetry-live`. PR #941 sigue draft; sin merge, promoción ni
  release.

- 2026-08-28, rebase y revisión adversarial ISA-884: los siete commits del PR
  #888 quedaron lineales sobre `origin/nightly@c59a7d64`. La revisión encontró
  un P1 en `deriveVehicleGap`: la ausencia o invalidez del hecho de vueltas de
  clasificación anulaba también un progreso temporal válido. `c244b354` separa
  ambas derivaciones y añade regresiones para clasificación ausente y sesión
  completa sin `lap_progress_time`, que permanece `missing` y nunca cero. Go
  completo, frontend 421 archivos/3.192 tests, typecheck, build y diff-check
  pasan. `go vet` conserva solo tres avisos Win32 `unsafe.Pointer` idénticos a
  Nightly. El lint global conserva el error heredado de `_damage` no usado en
  `car-damage-numbers-view-model-v2.ts`, también idéntico a Nightly; por ello el
  PR permanece draft y no se marca ready. Sin merge, promoción ni release.

- 2026-08-28, ISA-896 renueva por efecto la generación V2 completa de Desktop
  y OBS, y la pareja coordinador/store derivado de Studio. El segundo setup de
  StrictMode crea objetos nuevos; cada cleanup detiene, desuscribe y dispone
  solo los recursos de su propia generación. Las regresiones con un frame V2
  real cubren repintado, ausencia de `invalid-contract:disposed` y una sola
  sesión pull/SSE activa tras el remount. La build propia
  `bin/vantare-isa896.exe`, abierta con CDP en `9240`, pintó cuatro
  `runtime-widget-frame`; tras `overlay:stop` y `overlay:start-active` creó una
  ventana WebView2 nueva y volvió a pintar cuatro, sin el error disposed. Esta
  prueba no afirma telemetría LMU live: LMU no se tocó y los widgets mostraron
  el perfil activo sin datos de sesión. Evidencia en
  `docs/telemetry-core/evidence/isa-896/lifecycle-remount.md`. La review
  independiente aprobó funcionalmente cinco ciclos Wails reales: sin fuga,
  generación vieja ni pérdida de eventos iniciales; dejó el rebase como único
  bloqueo operativo. La rama
  `vantareapp/isa-896-overlay-v2-remount-lifecycle` quedó rebasada de nuevo
  sobre la base viva `origin/nightly@4aa8ac7f`, con HEAD funcional
  `2cbe66da`. El mock Wails de
  Studio retira ahora cada callback y la regresión exige un listener activo por
  evento y un scheduler activo después del doble setup. PR #937 está ready con
  auto-merge activo y pendiente de sus gates; sin merge, promoción ni release
  en este corte.

- 2026-08-28, ISA-926 implementa la política de rendimiento F1 en la rama
  `vantareapp/isa-926-performance-policy-niveles`. Go resuelve niveles 1–5,
  `custom` y el fallback explícito de `auto`; la cadencia efectiva se aplica al
  `SectionScheduler` en el tick siguiente. OverlayFrame v2 publica
  `capabilities.performance`, su decoder TypeScript falla cerrado y el
  coordinador visual gobierna realmente `rafCap`, techos por widget y dirty/event;
  `event` queda exento del cap y el techo dirty se satisface una sola vez por
  secuencia/firma. Sobre las generaciones por efecto de #896, una única
  suscripción imperativa lleva el store V2 al coordinador; la superficie no
  recibe frames por props y cada widget memoizado se suscribe a su techo. La
  integración de 60 frames/1 s mide Standings 2 renders en nivel 5 y 60 en
  nivel 1; un layout nuevo repinta una vez de inmediato. `session` y `spotter`
  mantienen su cadencia base; D8 se demuestra por la
  ruta canónica de spotter. V2 no tiene señal canónica de bandera y la verifica
  #893. Frames antiguos sin política se
  normalizan a paridad; Ajustes antiguos y nuevos usan inicialmente nivel 1.
  `sourceHz` mide frames del driver en una ventana móvil de dos segundos,
  `reason` es un enum cerrado y niveles 3–5 mantienen efectos completos con el
  diagnóstico `variante no disponible`. Un smoke Wails propio en CDP 9242 pintó
  cuatro widgets antes y después de stop/start, sin `disposed`, y cerró PID y
  puerto propios. La rama está rebasada sobre `origin/nightly@f2e73d3a`; no hay
  banco físico LMU, merge ni promoción. PR existente #936 permanece en revisión. Evidencia:
  `docs/telemetry-core/evidence/isa-926-performance-policy.md`. Roadmap:
  `milestones:performance-policy`.

- 2026-08-28, ISA-891 completa el lifecycle de Overlay V2 y lleva Studio al
  mismo transporte dirigido que Desktop. `6bd72d37` publica y retiene un único
  status V2 aunque no haya frames ni consumidores; un consumidor tardío recibe
  el último estado sin activar el publisher de snapshots. El contrato generado
  cierra los ocho estados canónicos y las fronteras Go/TypeScript rechazan
  valores desconocidos. `f6269aaf` elimina de Studio las suscripciones globales
  de proyección y compone V1+V2 sobre una única sesión HTTP pull, con listeners
  registrados antes de iniciarla, lifecycle idempotente y estado V2 puro
  entregado al `WidgetVisualHost` compartido detrás de las flags existentes.
  Las regresiones cubren status sin frame, alta tardía, revisión monotónica,
  reinicio/rollback, StrictMode y consumidor con una sola petición pendiente.
  `274b632d` evita deliveries vacíos, aplica pacing 16/100/250 ms y reinicia el
  cursor V2 al abrir una nueva sesión Studio. La reproducción stale bajó del
  busy-poll de 1.744 requests/15 s al backoff acotado; una prueba real LMU
  Practice pintó 18 participantes y completó Mock -> Live sin errores de
  revisión, siempre con `maxInFlight=1`. En 30 s el browser WebView2 se mantuvo
  entre ~39,6 y 41,5 MiB; es evidencia corta, no el soak de retirada.
  La revisión de protocolo añadió `0966f44c`: una respuesta HTTP perdida se
  conserva como único delivery pendiente y se retransmite hasta su ack; después
  se entrega solo el último snapshot acumulado.
  La auditoría independiente Fable 5 (`claude-fable-5`, thread
  `556f9ac3-513c-4bd7-a194-6064baaa615d`) terminó `ACCEPT WITH FINDINGS`, sin
  P0/P1. `f652e67f` corrige los cuatro P2 reproducidos: rechaza generaciones
  retiradas con memoria fija por sender, serializa revisión y publicación V2,
  recupera JSON/excepción/timeout del pull y evita suscribir Studio a paints V2
  con flags vacías. No añade goroutines, channels, colas ni dependencias.
  Rama `vantareapp/isa-891-overlay-v2-studio-lifecycle`, creada sobre la base
  original `nightly@741d31bf`, sincronizada mediante `e0b6a18f` con
  `nightly@d9909aef` y resincronizada mediante `ad1397d8` con la vigente
  `origin/nightly@1c45cc82`. `9eb2535b` elimina una carrera del test Studio:
  espera la carga asíncrona observable del perfil en vez de asumir que el mount
  del canvas ya la completó. `go test ./...`,
  typecheck, build frontend, contrato generado, ESLint del diff, race detector
  del transporte, 23 tests de roadmap, 64 de comunicaciones, 26 de release
  notes y build Wails
  Windows están verdes sobre el HEAD sincronizado; la suite frontend final
  cubre 421 archivos y 3.184 tests. El lint global conserva una deuda ajena al diff en
  `car-damage-numbers-view-model-v2.ts`; el gate del diff pasa. La auditoría
  abrió ISA-896 para corregir Desktop+OBS+Studio bajo
  StrictMode/remount; el PR parcial #857 no está en Nightly. No retira V1 ni
  cambia la autoridad visual. El digest está regenerado contra la Nightly
  vigente. El HEAD revisado `df629d3a` está publicado en el PR draft #897 y el
  run remoto `33134533397` terminó verde: gate bloqueante Vantare 11m02s, ruta
  de promoción y GitGuardian. No hubo merge ni promoción.
  Una prueba adicional LMU Live de 14,5 minutos, con 10,24 minutos de Hub +
  Overlay, mantuvo el browser WebView2 56,9 -> 57,5 MiB y pendiente -0,142
  MiB/min, sin reproducir la fuga original. La suma de renderers sí creció
  193,9 -> 463,8 MiB (máximo 520,6; ~22,2 MiB/min), por lo que el siguiente
  trabajo queda separado en #912 para perfilar host Go y paints/retención de
  UI antes de optimizar. La primera lectura de código señala que el coordinador
  visual ignora hoy `updateHz`, copia las histories derivadas en cada snapshot
  y Desktop/OBS suscriben el árbol raíz al shadow V2 aun con features vacías;
  son hipótesis de profiling, no cambios aprobados ni causas cerradas.
  El tramo se detuvo por decisión del usuario y no cumple el gate de cinco
  sesiones de 20 minutos de ISA-894.

- 2026-08-28, ISA-912 arrancó desde `origin/nightly@73b86191` y la rama quedó
  rebasada sobre `origin/nightly@42f2e368` para atribuir y reducir el coste del
  host Go y del renderer sin cambiar la autoridad de
  telemetría ni la frontera `WidgetVisualHost`. La auditoría read-only de
  Opus 5 (`claude-opus-5`, thread
  `b995e4c1-d11c-474e-8f10-8771a0c63ea1`) y la revisión adversarial de Fable 5
  (`claude-fable-5`, thread `43c006ac-6b4a-495a-9583-93e9e8c5cc33`) quedaron
  reconciliadas contra el código. Hechos: Shared Memory 60 Hz y REST 4 Hz
  atraviesan el mismo fan-out; el shadow repite reducer/coordinator/derive por
  lote; Strategy se proyecta aunque su transporte no exista; Overlay v1 se
  proyecta, serializa y retiene sin comprobar consumidor; el pull vuelve a
  recorrer/copiar los payloads; Desktop y OBS suscriben su raíz al store v2
  con flags vacías; el coordinador visual ignora `updateHz`; histories y
  settings visuales se reconstruyen en cada paint. No está atribuido todavía
  el peso relativo de cada fase ni si los picos proceden de GC, JSON, commits
  React o paint. El primer borrador de Opus fue rechazado al revisar el diff:
  podía retornar de un segundo `stop` antes de terminar el flush, su test no
  enfrentaba timer y shutdown y el benchmark comparaba tamaños distintos. El
  commit corregido se integró como `87019bc0`: hook `runtime/pprof` a fichero,
  opt-in, máximo dos minutos, sin listener y `noop` bajo `production`, más un
  benchmark pull comparable `dual`/`v1-only`/`v2-only`. El orquestador verificó
  el cierre concurrente con `-race`, el guard de producción, el benchmark y
  `go test ./...`. El capturador CDP de renderer y este expediente quedan
  incluidos en la rama; su cleanup detiene la sonda rAF incluso si CDP falla a
  mitad de captura. No se cambió semántica, cadencia, V1/V2, shadow ni
  apariencia. Un segundo microcorte integrado como `c834cebe` añade retardo
  opt-in al perfil para separar startup y régimen caliente. La revisión del
  worker corrigió además contratos que aún nombraban dos variables, amplió el
  guard `production` a las tres y eliminó un test que afirmaba un vencimiento
  temporal que no ejecutaba. Los checks focales normal/production, `gofmt`,
  `vet` y `-race -count=3` pasaron de nuevo en el worktree canónico.
  La primera captura emparejada Wails/LMU de 30 s midió el host en 18,74 % de un
  core con Hub y 42,28 % con Overlay. `runtime.cgocall` quedó plano en 29,28 s
  frente a 29,32 s; los deltas Go identificables aparecieron en JSON y pull:
  `encoding/json.appendCompact` 1,30 s, `OverlayPullTransport.Pull` 0,70 s,
  `Hub.ReplaySnapshot` 0,66 s y `json.Marshal` 1,62 s con Overlay frente a
  0,54 s con Hub. Esas cifras se solapan y explican solo una fracción de los
  7,06 core·s externos de incremento; servidor HTTP/Wails, segunda ventana, GC
  y scheduler siguen sin atribuir. CDP observó 43,63 pulls/s, rAF p99 <=8,6 ms, cero frames >32
  ms y cero long tasks. Su tracing infló transitoriamente la memoria del
  renderer; una ventana posterior sin CDP la acotó en 143,6 -> 149,8 MiB y el
  árbol en 95,36 % de un core. No autoriza retirar V1 antes de #893/#894. La
  hipótesis de retener en el Hub el evento V1 ya codificado quedó rechazada
  antes de integrar: habría movido el marshal desde 43,63 pulls/s a
  aproximadamente 64 publicaciones/s, también con Hub solo, mientras el
  benchmark excluía la publicación del reloj. El segundo candidato mantuvo la
  codificación a demanda y eliminó solo la copia profunda previa al marshal. A
  44 coches redujo B/op un 24,0 % en V1-only y un 21,5 % en dual, pero la matriz
  Wails/LMU de tres repeticiones no superó el gate runtime. Las medianas fueron
  host 37,65 -> 37,98 % de un core, árbol 141,16 -> 141,63 %, renderer p95
  113,11 -> 118,93 % (+5,1 %) y máximo host 151,95 -> 166,15 % (+9,3 %).
  `TaskDuration` bajó solo 2,0 %, `ScriptDuration` quedó igual, rAF p99 permaneció
  en 8,5 ms y hubo cero frames >32 ms/long tasks. `ReplaySnapshot` bajó 9,7 %
  en pprof, aún bajo el 10 %. El gate vinculante lo deja NO-GO; se retiró todo
  el cambio productivo y sus tests. Los perfiles, traces y tres series a 100 ms
  por variante quedan inventariados por nombre, tamaño y SHA-256 en el
  expediente. La revisión adversarial final Fable 5 sobre `a163eafc` (thread
  `3d850815-4ef3-4af6-9257-1a28fb4212f2`) no encontró bloqueos de lifecycle,
  concurrencia, benchmark ni arquitectura. Sí detectó que la atribución textual
  excedía los segundos explicados, que el test del entorno podía convertir una
  regresión en `SKIP`, que el resumen CDP filtraba rutas absolutas y que CI no
  ejecuta los guards `production`/`-race`. Los tres primeros quedan corregidos
  en la rama; el hueco CI se separó como ISA-916. El capturador CDP dispone
  además del schema v2 con modos `trace`, `metrics` y `profile`; el resumen de
  CPU conserva basenames, rechaza perfiles ilegibles y el `.cpuprofile` crudo
  queda ignorado y fuera del repo. Su test Node focal pasa 3/3. La revisión
  independiente de PR terminó `REQUEST_CHANGES` por la base desactualizada y
  este estado operativo obsoleto, no por un defecto del hook. Ambos quedan
  corregidos: rama remota
  `vantareapp/isa-912-overlay-webview2-performance`, quinto rebase lineal sobre
  `origin/nightly@b2010ec3` tras avanzar Nightly y PR #927 listo para review;
  ISA-912 está en
  `state:in-review`. La punta validada previa a este cierre documental fue
  `c0d6f467`, antes del quinto rebase; el run remoto previo `33204677737` terminó
  verde, incluidos topología,
  contrato de roadmap, build frontend, suites Go/frontend, lint del alcance y
  build Wails de Windows. La anotación audit del contrato de roadmap
  descubrió que el primer digest conservaba el orden del JSON candidato
  intermedio; se regeneró desde el JSON protegido de esa base y el validador
  base/candidato quedó paritario. No hubo merge, promoción ni release.

- 2026-08-27, ISA-889 corrige el bloqueo permanente del Overlay despues de un
  reconnect LMU. El transporte acotado de ISA-879 puede entregar como primer
  snapshot visible de un epoch nuevo una secuencia mayor que 1; el store
  frontend exigia exactamente `sequence=1`, conservaba el cursor anterior y
  rechazaba despues todos los frames del nuevo epoch. `57c76109` acepta una
  proyeccion completa de un epoch estrictamente mayor como nueva base y deja
  `snapshot-resync` como diagnostico; regresiones de epoch, regresiones o
  duplicados contradictorios dentro del mismo epoch y desajustes de status
  siguen cerrados. Suite frontend completa (417 archivos, 3.143 tests), 26
  focales, typecheck, build, ESLint del diff y `git diff --check` verdes. Una
  build Wails aislada en 39263/9231 recibio LMU Live y pinto Practice, 18
  participantes, Relative, Standings y pedales. El reconnect nativo tambien
  queda acreditado sin reload: epoch 1 termino en secuencia 166.097 y, tras
  reiniciar LMU, la misma ventana acepto epoch 2 empezando en la primera
  observacion 2.290, avanzo a 4.203 en 30 s y continuo con Relative/Standings
  `ready`, 18 filas y el jugador en P10. Evidencia:
  `docs/telemetry-core/evidence/isa-889-overlay-epoch-resync.md`. Rama
  `vantareapp/isa-889-overlay-epoch-resync`; PR #890 integrado en `nightly` el
  2026-08-28 como `741d31bf`. El hito `telemetry-live` y su digest declaran la
  continuidad tras reconnect. El gate post-merge oficial `33125373076` y el
  digest `33125373082` terminaron en verde. ISA-889 está cerrada en estado
  Nightly; no existe promoción a testers, master ni release.

- 2026-08-27, ISA-884: Relative pasa a significar tráfico físico alrededor del
  jugador. El driver LMU admite `mTimeIntoLap` scoring `+464` como
  `standings.lap_progress_time`; `standings.relative-gaps@2` calcula en Go el
  arco temporal firmado más corto y conserva `relativeLapDelta` por separado.
  `BuildRelative` selecciona por topología circular de `LapDistance`, de modo
  que una fila física no desaparece si sus segundos están `missing`. V1 y V2
  consumen la misma derivación; la proyección orienta su signo por el lado
  físico y no anula los segundos por estado pit. El comparador shadow vuelve a
  comparar `gapText`, y el frontend no contiene lógica de simulador. SimX mapea su
  equivalente temporal exacto al mismo contrato; los drivers sin equivalente
  dejan la señal ausente. La fixture LMU 1.3/1.4 con cero uniforme
  contradictorio prueba fail-closed, mientras los tests admiten cero individual
  y valores negativos reales. Evidencia:
  `docs/telemetry-core/evidence/isa-884-relative-lap-progress-time.md`. Rama
  `vantareapp/isa-884-relative-time` rebasada sobre
  `origin/nightly@2672f211`, publicada en el PR draft #888. Para
  `9771592b`, el run remoto `33107781445` terminó completamente verde:
  promotion path, blocking gates y GitGuardian pasaron. Sin merge, promoción
  ni release. Gates locales: Go completo, telemetry, LMU x20, derive x20,
  frontend 3.144 tests, typecheck, lint focal y build verdes. La build combinada
  acredita LMU -> Go -> SSE -> Wails nativo: Relative 2+jugador+2 con los cuatro
  gaps presentes, incluidos rivales en pit; V1/V2 alineados en reconstrucción
  dan `mismatch: []`. El soak final de 142 s termina en 585,8 MiB totales y
  175,3 MiB para el WebView mayor, sin pendiente monotónica. #887 separa los
  falsos positivos del shadow al emparejar una sección V2 memoizada a 4 Hz con
  la cabecera global a 60 Hz.

- 2026-08-27, ISA-879 elimina los bridges Overlay v1/v2 globales y los
  sustituye por una sesion pull/ack `single-in-flight`, `latest-wins` y ligada
  al ciclo de vida de una ventana Overlay. `68ae7eae` introduce el limite,
  `e1069c7f` retira el bridge sin caller y `dee06f34` saca solicitud/cierre del
  bus global. La prueba LMU nativa descubrio una segunda frontera: aunque Hub
  recibia cero frames, `DispatchWailsEvent` aun materializaba ~62 KB v1 + ~9,6
  KB v2 por `ExecuteScript`; un renderer limpio crecio 538,3 -> 2.370,1 MiB en
  2 min. Descartar V2 no cambio la pendiente y descartar todos los eventos justo
  antes de listeners aun llevo el heap a 734,2 MiB; un GC completo lo redujo a
  7,2 MiB. Era presion de asignacion por convertir el JSON en JavaScript, no
  retencion React. `21af8511` devuelve el mismo `OverlayPullResponse` en el
  cuerpo HTTP y elimina todo evento/`ExecuteScript` de frames, manteniendo ack,
  latest-wins, una peticion pendiente y cierre nativo. En 10 min 01 s, browser
  quedo 50,4 -> 64,1 MiB (max 69,8), renderer Overlay 101,5 -> 109,4 MiB (max
  111,1) y Hub 61,1 -> 61,1 MiB. `Detener overlay` elimino target y renderer;
  LMU siguio abierto. El reader opt-in y Strategy observaron LMU `live` con
  jugador, pero la proyeccion Overlay permanecio `stale` por fast frame
  detenido/pausado: falta una repeticion breve sin pausa para acreditar esa
  fase exacta. Go serial completo, 415 archivos/3.139 tests frontend, 26
  focales, typecheck, build y ESLint del diff estan verdes. Rama
  `vantareapp/isa-879-wails-telemetry-bounded`; PR #883 fusionada en
  `origin/nightly@2672f211`. Run post-rebase `33101779769` completamente verde.
  Sin promoción a `testers`/`master` ni release.

- 2026-08-27, diagnostico inicial de ISA-879 sobre `origin/nightly@a02a1463` tras una
  reproduccion LMU/Wails real: con solo Hub visible, el proceso browser de
  WebView2 crecio de ~9,3 a 11,4 GB privados mientras el renderer React se
  mantuvo en ~197 MB. Overlay v1 cruzaba ~2,68 MiB/s y el shadow v2 ~0,56
  MiB/s. La auditoria confirma que `TelemetryCoreRuntime.Start` activa ambos
  bridges aunque no exista ventana Overlay y que `wailsEmitter` usa el
  `Event.Emit` global. Wails difunde cada frame a todas las ventanas y acaba en
  `ExecuteScript(..., nil)`, despues del ultimo limite `latest-wins`; incluso
  `WebviewWindow.EmitEvent` vuelve al bus global y solo rellena `Sender`. La
  decision minima de ISA-879 es sustituir exclusivamente el push Wails de
  Overlay por demanda/acuse dirigido: una respuesta agregada v1+v2, como
  maximo una entrega pendiente, reemplazo por el ultimo estado y publisher v2
  activo solo durante la sesion consumidora. Strategy, Engineer, OBS, el
  driver y las proyecciones no cambian. Tests sinteticos no acreditan el soak
  WebView2/LMU real.

- 2026-08-21, ISA-697 / Deuda #677 Tanda 2: `TelemetryEngine.Apply` pasa de 650190 B/op 344 allocs/op @104 a 168400 B/op 327 allocs/op (-74% bytes, -5% allocs) en rama `vantareapp/isa-697-apply-churn` sobre `origin/nightly@f10b817d` (5 commits: 1 benchmark + 4 perf). Cambios: `envelope.NewSnapshotOwned` + `Peek` para no clonar donde se lee sin mutar, `Commit` directo en reducer/coordinator/pipeline, y `validateObservedState` sin map (sort). Goldens y replay parity verdes; snapshot sigue value-semantic. Evidencia `docs/telemetry-core/evidence/isa-677-apply-churn.md`, fragmento `ISA-697.json`. Queda techo ~150KB/B/op sin COW en envelope y gaps 104 por frame.

- 2026-08-20, ISA-679: `CapabilityModesV2` deja de ser un hueco. Los modos se
  resuelven por tick con `capability.ResolveModes` (declaración del driver ×
  evidencia de la sesión) en la raíz de composición, y `BuildCapabilities` los
  republica sin importar `capability` ni ningún driver, respetando ADR 0004.
  LMU publica `spatial: ["xyz"]` con posición del mundo fresca y degrada a
  `lap-distance` y luego a `none`; SimX publica `lap-distance`, sin
  `personal-best`, con `gaps: estimated`. Goldens v2 regenerados solo en el
  bloque `modes`; centinelas byte-a-byte y de 64 KiB verdes; contrato TS sin
  cambios. Evidencia:
  `docs/telemetry-core/evidence/isa-679-capability-modes.md`.
  Pendiente: ningún widget consume todavía los modos, y la procedencia
  `official`/`estimated` de gaps sigue siendo declarativa por driver.

- ISA-678 cierra el follow-up de consumo de combustible que ISA-372 / F8 lote 2a
  dejó por escrito: `derive.FuelUsage` es ahora la autoridad única del consumo
  por vuelta (media de las últimas 3 vueltas válidas, reset por sesión y stint,
  `fuel.per-lap@1`), `fuel.perLap` queda poblado y `fuel.estimatedLaps` prefiere
  `floor(remaining / perLap)` publicando su base en el campo aditivo
  `fuel.basis`. `requiredFuel` sigue ausente con motivo. La media canónica
  **difiere a propósito** de la de Overlay v1 —otra ventana y otro criterio de
  validez—, así que el comparador de sombra la declara diferencia intencional en
  vez de compararla. Evidencia:
  `docs/telemetry-core/evidence/isa-678-fuel-perlap.md`. Rama
  `vantareapp/isa-678-fuel-perlap-canonico` sobre `nightly@e2d67180`, en PR; sin
  merge ni promoción.
- ISA-372/F10 está implementada localmente sobre `tc-integration@74e1a5a6` en
  `vantareapp/isa-372-tc-f10-capabilities-multisim`. La fusión se promovió a
  `internal/telemetry/fusion` (N slots, índice por señal, `ErrRuleMissing` en
  lugar de `panic`), `internal/telemetry/capability` declara
  Supported/Available/Modes con spatial longitudinal y lateral separadas, el
  manifiesto de Engineer se deriva del driver activo y el composition root dejó
  de estar instanciado sobre `lmu.Observation`. El driver sintético SimX prueba
  el contrato extremo a extremo: llega a Overlay v2 con standings, sesión e
  instrumentos poblados y con su degradación declarada, y el diff de la rama no
  contiene ningún archivo bajo `frontend/`. Queda un hueco conocido: el builder
  de Overlay v2 aún expande el canal de adquisición a capabilities de producto y
  pertenece al lote 2a de F8; el runtime ya le entrega también los ids
  declarados. Evidencia:
  `docs/telemetry-core/evidence/isa-372-f10-multisim.md`. Sin push, PR, merge ni
  promoción.

- ISA-372/F8 lote 2b está implementada localmente sobre
  `tc-integration@b17f6228` en `vantareapp/isa-372-tc-f8-builders-lote2b`, y
  cierra los builders del contrato v2: todas las secciones del frame quedan
  pobladas o declaradas con evidencia. `controls` es nueva y aditiva y sube a
  Go el historial de pedales que Overlay v1 acumulaba en el navegador, un
  acumulador por id de widget, de modo que dos widgets mirando la misma vuelta
  podían discrepar y un remount perdía la vuelta. La forma en el wire es
  compacta a propósito -tres arrays paralelos de enteros por mil más un solo
  `windowMs`, porque las muestras son una por tick canónico- y cuesta 1.515 B
  al máximo de 120 muestras sin escalar con la parrilla, porque es solo del
  jugador. `derive/pipeline.go` gana `CapturedAt` en `ControlSample` copiado
  del sobre igual que `SelfDeltaSample` ya hacía: es el mínimo para que la
  serie lleve su base de tiempo, no una derivación nueva. `builder_spotter.go`
  publica presencia lateral desde `WorldPosition` y `Orientation` canónicos con
  los mismos metros y las mismas puertas que `internal/engineer/spotter` a
  sensibilidad normal; no se reutiliza su código porque clasifica un frame rF2
  de producto y `internal/telemetry` no puede importar producto, pero dos tests
  anclan umbral a umbral y veredicto a veredicto contra su geometría para que
  no se separen en silencio. Divergencias declaradas para F13: sin puerta de
  Full Course Yellow porque el canónico no tiene fase de sesión, sensibilidad
  fija en normal y sin lista de zonas. `mode` es `xyz` solo cuando la
  clasificación pudo ejecutarse; si no, `none` con los lados en missing, porque
  "no hay nadie al lado" y "no se puede saber" son respuestas distintas. El
  spotter va sin paridad v1: no existe widget de spotter ni en v1 ni en v2,
  así que no se crea un ViewModel sin consumidor y la cobertura son tests del
  builder con casos sintéticos. `damage` se declara inexistente con
  evidencia: no hay señal de daño en `core.VehicleState` ni en `schema/**`, y
  Overlay Projection v1 tampoco la lleva -el adaptador la lista como
  `unsupported-by-projection`-; los widgets v1 la leen del camino Wails
  heredado y el único lector real de daño es el privado de Engineer
  (`DentSeverity`, `WheelDetachedCount`), nunca promovido al canónico. Queda
  ausente de `CapabilitiesV2` en vez de presente y vacía, con un tripwire que
  falla el día que aparezca en el canónico. Enganche para F10, en orden:
  dominio de daño canónico, mapeo del driver de LMU, capability en el
  descriptor y solo entonces builder. El comparador cubre `controls` con
  métrica `{feature,field,phase}` y gate solo en `phase=live`; la serie se
  compara por solapamiento desde la muestra más nueva y no por longitud, porque
  el acumulador del navegador y el historial canónico empiezan en momentos
  distintos. Presupuesto verde: sintético @104 sube de 34.650 B a 36.037 B por
  la ventana llena de 120 muestras, que es el peor caso real, y el golden real
  compacto @104 de 22.942 B a 23.116 B, un incremento constante en cualquier
  parrilla. Evidencia:
  `docs/telemetry-core/evidence/isa-372-f8-lote2b.md`. Sin push, PR, CI remoto,
  merge, promoción ni release.
- ISA-372/F11 está implementada localmente sobre `tc-integration@f7e2cc07` en
  `vantareapp/isa-372-tc-f11-cadencias`. La cadencia de Overlay v2 se regula por
  sección antes de proyectar y serializar: `SectionScheduler` puro con reloj
  inyectado, dirty-trigger y techo para el tier lento, y un `CachedProjector`
  que memoiza por sección manteniendo el frame completo. Los defaults son cero,
  o sea el comportamiento actual sin regulación, hasta medir en el binario real.
  El benchmark @104 baja de 480 a 76 construcciones por segundo simulado y de
  39.118 a 26.516 ns/op, con los mismos 78.829 B/s porque el contrato publica
  frame completo. El coordinador del frontend queda solo visual. Falta aplicar
  la línea de integración en `telemetry_core_runtime.go` y retirar la excepción
  del wiring guard. Evidencia:
  `docs/telemetry-core/evidence/isa-372-f11-cadencias.md`. Sin push, PR, CI
  remoto, merge, promoción ni release.
- ISA-372/F8 lote 2a está implementada localmente sobre
  `tc-integration@74e1a5a6` en `vantareapp/isa-372-tc-f8-builders-lote2a`. Tres
  features más del frame v2 quedan pobladas con su dominio subido a Go.
  `builder_delta.go` publica `requested`, `available[]`, la `reference`
  efectiva y la `authority`, sustituyendo el repliegue silencioso a
  `player.deltaSeconds` que `delta-view-model.ts` (:111-118) hacía sin decir
  qué referencia usaba; `PreferencesV2` gana `DeltaReference` normalizada.
  `builder_relative.go` sube la selección de la ventana de
  `relative-row-selection.ts` (:9-48): el orden canónico es descendente por gap
  relativo derivado, reproduce el orden de salida de v1 y queda acotado a 8+8
  más el ancla, de modo que el coste de la sección no crece con la parrilla;
  `RelativeRowV2` gana `classId` de forma aditiva y el validador del transporte
  lo acepta. `builder_fuel.go` publica depósito y capacidad canónicos y la
  proyección `ceil(remaining/lastLap)` con la peor calidad de sus dos entradas.
  Decisión explícita en fuel: `perLap` se declara ausente en lugar de derivarse
  aquí, porque su serie de consumo por vuelta solo existe hoy en el snapshot de
  TypeScript y reconstruirla en la proyección crearía una segunda autoridad
  sobre el consumo; la derivación pertenece a `derive/` y queda como follow-up.
  Los ViewModels v2 de `delta`, `relative` y `fuel-strategy` quedan en shadow
  detrás de features apagadas por defecto y ningún widget se conmuta. El
  comparador cubre las tres features con tolerancias explícitas por campo y
  filas de relative por identidad con orden significativo; el gate sigue
  leyendo solo `phase=live`. Presupuesto verde: sintético @104 = 34.650 B y
  golden real compacto @104 sube de 21.775 B a 22.942 B. Queda a vigilar en
  sesión real que v1 ordena relative por distancia de vuelta y v2 por gap
  derivado: bajo tráfico pueden divergir y hay que leer
  `{feature="relative",field="rows.order",phase="live"}` antes de conmutar.
  Evidencia: `docs/telemetry-core/evidence/isa-372-f8-lote2a.md`. Sin push, PR,
  CI remoto, merge, promoción ni release.
- ISA-372/F8 lote 1 está implementada localmente sobre `tc-integration@f7e2cc07`
  en `vantareapp/isa-372-tc-f8-builders-lote1`. El comparador shadow v2
  segmenta por fase y el gate lee sólo `phase=live`: los 317k mismatches de
  `gear` de la sesión #1 y los 213+213 de la sesión #2 eran retención v1 frente
  a ocultación v2 en fase stale, una diferencia de contrato intencional que
  ahora se cuenta como `declaredDifferences`. La fase `transition` cubre el
  caso en que el status v1 y el `source.state` v2 discrepan: con 54 coches de
  IA el driver oscila stale↔live y ambos productores cruzan el borde en
  instantes distintos, lo que producía los 153 mismatches de `display.status`.
  Los acumuladores y el histograma de parseo rotan por epoch/sesión y los
  percentiles describen sólo la ventana live. La ventana de emparejamiento sube
  de 8 a 64 con desalojo por secuencia más atrasada, lo que corrige el atasco
  de ~2 minutos medido. `builder_session.go` documenta la bandera ausente y
  `builder_standings.go` sube a Go el orden de la clasificación, incluido el
  fallback `index+1` que el widget aplicaba en silencio, y deriva
  `ClassPosition` de ese orden. Los ViewModels v2 de `standings` y
  `racing-flags` quedan en shadow detrás de features apagadas por defecto y
  ningún widget se conmuta. Presupuesto verde: sintético @104 = 34.650 B y
  golden real compacto @104 con 104 filas = 21.775 B. Quedan declarados
  ausentes bandera de sesión, dorsal, mejor vuelta por fila e intervalo al
  coche de delante; `relative`, `delta`, `fuel` y `spotter` siguen sin poblar.
  Evidencia: `docs/telemetry-core/evidence/isa-372-f8-lote1.md`. Sin push, PR,
  CI remoto, merge, promoción ni release.
- ISA-372/F7 está implementada localmente sobre `tc-integration@f65f485f` en
  `vantareapp/isa-372-tc-f7-aislamiento-consumidores`. Engineer usa un puerto
  asíncrono default-on: snapshots latest-wins cap 1 con timeout/recover y facts
  ordenados por un canal separado con cursor/resync. El test F0 de Engineer
  lento bajó de 92,9868 ms síncrono a 1,5167 ms tras F7.1 (0,5007 ms en una
  repetición focal final). Strategy conserva builder y consumidor in-process,
  pero su transporte público queda default-off con rollback explícito.
  Recording registra rango de gap y `Incomplete` al saturarse sin bloquear,
  aunque sigue desconectado hasta F12. Suite Go aplicable, build, contract-gen,
  wiring guard y diff-check pasan; vet conserva sólo tres `unsafe.Pointer`
  heredados. El resync automático del consumidor Engineer y la sesión LMU real
  quedan pendientes. Evidencia:
  `docs/telemetry-core/evidence/isa-372-f7-consumer-isolation.md`. Sin push, PR,
  CI remoto, merge, promoción ni release.
- ISA-372/F6 está implementada localmente sobre `tc-integration@bafe94d5` en
  `vantareapp/isa-372-tc-f6-overlay-frame-v2-slice`. OverlayFrame v2 fija el
  contrato compacto completo y puebla solo player/session/capabilities; el
  sintético completo de 104 vehículos mide 34.650 bytes. El runtime lo
  construye después del commit, publica v1 primero y aísla fallos v2. Publisher
  latest-wins, replay, store TS generado y Wails/SSE quedan cableados en
  shadow. `pedals-telemetry` compara valores mostrados por epoch/secuencia, con
  feature v2 default-off para el usuario. Node sintético midió CPU p99/op
  0,720 ms; no acredita WebView2. Evidencia, procedimiento y gate real pendiente:
  `docs/telemetry-core/evidence/isa-372-f6-overlay-v2-slice.md`. Sin push, PR,
  CI remoto, merge, promoción ni release.
- ISA-372/F3 está implementada localmente sobre `tc-integration@c52d6c1d` en
  `vantareapp/isa-372-tc-f3-engine-apply`. `TelemetryEngine.Apply` prepara y
  confirma reducer/coordinator/derive como una transacción, y el mapper no
  confirma su candidato hasta que esa aplicación completa acepta el batch.
  Identidad usa gracia de slot, LRU inactiva y `StintID`; el shadow Go es privado,
  muestreado y auto-disable. Métricas y regresiones cubren atomicidad,
  reintento, identidad y divergencias. Build, suite Go aplicable, replay por
  digest y diff-check pasan; vet conserva solo tres `unsafe.Pointer`
  heredados. Benchmark sintético @104 cumple p99 < 1 ms solo en ventanas de
  200; bajo ejecución adaptativa sostenida sube a 10,5–12,1 ms por GC, así que
  el objetivo sostenido sigue pendiente. Evidencia y límites:
  `docs/telemetry-core/evidence/isa-372-f3-engine-apply.md`. Sin push, PR, CI
  remoto, merge, promoción ni release; LMU/Wails/OBS y gate de estabilidad
  real pendientes.
- ISA-372/F2 está implementada localmente sobre
  `tc-integration@98c3e2f2` en la rama
  `vantareapp/isa-372-tc-f2-watchdog-stale`. Backend y store degradan a stale
  por edad con reloj inyectable, recuperan al volver frames, aceptan revisiones
  de status mayores no contiguas y conservan el último full sin inventar
  valores. Métricas, diagnóstico, rollback default-on y escenarios de
  reconnect/late join quedan cubiertos. Frontend 390/2.866, Go focal/global,
  builds, lint focal y Playwright de estados pasan con las deudas heredadas
  citadas en `docs/telemetry-core/evidence/isa-372-f2-watchdog.md`. Sin push,
  PR, CI remoto, merge, promoción ni release.
- ISA-372/F4 está implementada localmente sobre `isa-373@3e9c77ed` en la rama
  `vantareapp/isa-372-tc-f4-guard-wiring-y-borrado`, pendiente de promoción.
  El guard AST de wiring queda activo; `core.Fanout`, RFC 7396 Go/TS, seal
  SHA-256, transporte live de Analysis/facts y `telemetry-store.ts` quedaron
  retirados tras demostrar cero llamadores productivos. El contrato de resync
  y retención acotada de facts vive ahora en el puerto Engineer para F7. El
  benchmark mediano del Hub bajó de 44.718 a 38.502 ns/op. No hubo push, PR,
  merge, promoción ni release; Linear queda a cargo del orquestador.
- ISA-160 / TC-10A está integrada en
  `nightly@8880a8800e07e2af21fe5ff37a714578bf8fcd00`. ISA-161 / TC-10B se
  construyó originalmente desde esa base. Su primer rebase local fue sobre
  `origin/nightly@234794d`; la base y merge-base actuales son
  `origin/nightly@b6df494298578ff9a043bbd9b48a66eb1512010f`. Tiene Tasks 1-4
  implementadas y revisadas en el HEAD previo a documentación reescrito
  `fee981be42f7a3053c2673182939fb8898609510`. El único driver/pipeline LMU
  produce Overlay y Strategy desde el mismo `FinalState`, sin readers, REST o
  storage privados adicionales. `Hub()` sigue siendo Overlay y
  `StrategyHub()` posee un Hub Strategy separado.
- `StrategyLiveProjection v1` publica sesión (`sourceTimeSeconds`, end,
  remaining y maximum laps), progreso (lap, sector y distancia), pit y Fuel
  amount/capacity derivados atómicamente del mismo campo canónico. Presencia,
  procedencia y freshness se conservan; capabilities: `session`, `progress`,
  `pit` y `fuel`. Virtual Energy, tyres, weather y facts permanecen ausentes,
  sin fallback.
- Wails sirve status/projection namespaced y replay de status; SSE registra
  `GET /telemetry/strategy/projection` loopback-only. El transporte publica
  latest full y resync full, sin fabricar delta. Lifecycle, fail-stop y
  teardown cubren ambos hubs. Replay, compatibilidad old/new, soak simultáneo
  Overlay+Engineer+Strategy y benchmark están documentados en
  `docs/telemetry-core/evidence/isa-161-strategy-live-producer.md`. `-race` no
  fue ejecutable por `CGO_ENABLED=0` y ausencia de GCC.
- El gate LMU sanitizado pasa sobre el HEAD del primer rebase `879d5be`: proceso
  `Le Mans Ultimate` activo, probe opt-in read-only, build normalizada
  `1.4.0.0` supported, runtime `live`, `player-present=false` y fingerprint
  `LMU_Data/runtime:build=1.4.0.0;size=324820;evidence=active-grid-bijective;telemetry=not-required-no-player`.
  No persistió raw, IDs ni PII. Acredita adquisición/mapping/runtime y ausencia
  correcta de telemetría rápida sin jugador; no acredita un full Strategy con
  Fuel live en pista. Fixtures hash-pinned y replay siguen siendo la evidencia
  de Fuel; la validación con jugador/Fuel en pista no se ejecutó.
- Gates locales finales sobre el HEAD del primer rebase `879d5be`: Telemetry,
  app/server, frontend build,
  `go test ./...` y frontend 367 archivos/2.636 tests pasan. Los dos
  `AbortError` de teardown happy-dom conservan exit 0. Vet global termina con
  exit 1 solo por tres `unsafe.Pointer` heredados; `gofmt` global lista el
  `diagnostics_service.go` heredado de `origin/nightly`, fuera del diff
  ISA-161. Diff-check queda limpio. Esta es evidencia local del primer rebase,
  no CI remoto de aquel SHA.
- Estado de entrega: la rama ISA-161 está publicada y el PR draft
  [#212](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/212)
  está OPEN/CLEAN/MERGEABLE hacia `nightly@b6df494`. Para `19dddea`, el
  [run 31639192366](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31639192366)
  terminó COMPLETED/SUCCESS: promoción válida, frontend build, Go, frontend
  tests, visual advisory y lint advisory pasaron; GitGuardian también pasó.
  Cualquier amend posterior requiere checks del nuevo HEAD y el estado final se
  consulta en el PR. Linear sigue pendiente por reautenticación; no hubo
  integración, promoción ni release. ISA-152 / STR-17 conserva el bloqueo
  absoluto hasta promoción aceptada a `nightly`. El motor live Strategy no
  existe.
- ISA-311 corrige el flake del soak lógico sin modificar el runtime: el test
  sigue recorriendo Overlay, Engineer, recording coordinator y SQLite reales,
  pero usa un reloj lógico fijo y un adapter de writer test-only con deadline
  global de 30 s para que la latencia del disco compartido no se confunda con
  el presupuesto temporal por operación. El límite real de 500 ms y sus
  regresiones permanecen intactos. El reloj aislado reveló todavía 1/20 cierres
  por contexto; la solución completa pasa soak 20/20, regresiones temporales
  20/20, build frontend y `go test ./... -count=1` sobre
  `origin/nightly@ff286f4`. Los HEAD `6ac6f9e`, `756315d` y `0a1e750` pasaron
  sin rerun los runs `31416018600`, `31416779711` y `31435630710`. PR #200 se
  promovió por rebase a `nightly@54f267b`; Linear refleja ISA-311 en `Nightly`.
  `testers`, `master` y release permanecen fuera del alcance.
- Proyecto Linear: `Telemetry Core — Modular Runtime & LMU`.
- Stack técnico final aprobado: `170eaebbaa6744019ead96a2c78201b4da2fb9bb`.
- Promoción ISA-171 / TC-09G completada en
  `nightly@c5eb3c906bc0f93a747adac13f3efcc9f731f8b9`.
- La protección de `nightly` prohíbe merge commits. El commit lineal promovido
  conserva exactamente el árbol aprobado `e63c54fb4db2a848e296ca06d92d90fdbc2b3c96`
  y registra como procedencia el stack `170eaeb`; rollback mediante revert del
  commit `c5eb3c9`.
- La simulación encontró solo tres conflictos documentales de gobernanza; cero
  conflictos de código. `testers` y `master` están fuera del alcance.
- Gates de integración frescos: Go bloqueante completo, ISA-118 focal,
  frontend bloqueante 1.978/1.978, build, cutover/shadow Playwright, 7/7
  fuzzers, soak/lifecycle, replays, benchmark, auditoría de consumidores y dos
  sistemas visuales pasan. El canvas conserva la flake externa ISA-172 y no se
  modifica en este corte.
- PR #65: el primer CI bloqueó correctamente una equivalencia válida de rutas
  Windows 8.3/largas en `diagnostics`. La corrección mínima usa identidad real
  del directorio, conserva los guards contra reparse points y convierte los
  errores ignorados del test en fallos explícitos. El segundo CI confirma ese
  paquete verde y expone la misma comparación textual en la frontera del
  catálogo Wails; se aplica el mismo contrato de identidad y una regresión 8.3.
  El timeout del spy permanece en 2 s para no ocultar el fallo. Review
  independiente, CI del PR y gate post-promoción `30729804412`: PASS.
- El inventario detallado siguiente conserva la historia técnica de cada corte.
- Follow-up Strategy live: ISA-160 / TC-10A ya está en `nightly@8880a88` e
  ISA-161 / TC-10B produce/cablea `StrategyLiveProjection v1` en su rama de
  issue sin reabrir la adquisición LMU. La base y merge-base actuales son
  `origin/nightly@b6df494`; falta su entrega remota y promoción.
- TC-01–TC-03: cerrados.
- TC-04A ISA-35: cerrado.
- TC-04B ISA-36: cerrado.
- TC-04C ISA-37: implementado y presente en la base.
- TC-04D ISA-38: implementado, entregado y presente en la base.
- TC-05A ISA-39: cerrado técnicamente; correcciones del primer review
  aceptadas sin P0/P1/P2/P3.
- TC-05B ISA-40: cerrado técnicamente tras re-review `ACCEPT` sin
  P0/P1/P2/P3.
- TC-05C ISA-41 y TC-06A ISA-101: cerrados en la base aprobada de ISA-102.
- TC-06B ISA-102: implementación completa y tercera review `ACCEPT` sin
  P0/P1/P2/P3 conocidos. No hay wiring productivo.
- TC-06C ISA-103: dos reviews finales `ACCEPT`, P0/P1/P2/P3 = 0; los hallazgos
  iniciales y los tres casos límite posteriores quedaron corregidos y están
  cubiertos por regresiones repetidas.
  Replay permanece exclusivamente en tests/harness y migraciones productivas
  no tienen pasos mientras v1 sea el único schema real. El test heredado de
  cancelación REST dejó de usar el ticker productivo y pasa x100 de forma
  determinista; el runtime LMU no cambió.
- TC-06D ISA-104: implementación y gates D7 completos; preparada para entrega
  apilada sobre ISA-103.
  Catálogo metadata-only, inspector local, paquete sanitizado byte-exacto,
  eventos Wails correlacionados, cancelación acotada, UI responsive e
  internacionalizada, captura raw limitada y tap LMU sin wiring productivo.
  Reviews integradas backend y UI: `ACCEPT`, P0/P1/P2/P3 = 0.
- TC-07A ISA-105: implementación y re-review D6 completas; código final
  `f6b43b7`, `ACCEPT`, P0/P1/P2/P3 = 0. PR draft `#41`; Linear `In Review`.
- TC-07A.1 ISA-129: D0-D8 aceptados y publicados; D9 ha cerrado la evidencia
  real y está en gates/review final. Overlay v1
  conserva versión y claves base; añade
  campos opcionales de sesión, scoring, fuel, gaps y self-delta/history. Los
  dos goldens prueban old/old, old/new, new/old y new/new sin relajar el
  decoder. Adapter y comparator consumen solo señales demostradas; flags,
  equipo, número, compuesto, weather y daños siguen missing. Focal Go x20,
  Telemetry Core completo, frontend 297 archivos/2.020 tests, lint focal y
  build pasan. El harness D8 recorre una captura real LMU 1.4 de 38 vehículos
  por Driver/Fusion -> BatchMapper -> Reducer -> SessionCoordinator -> Derive
  -> Overlay v1, con una apertura/cierre y bytes idénticos en 20 ejecuciones.
  El trace real Delta de 1.846 muestras atraviesa la cadena canónica y el mismo
  golden exacto consumido por decoder/adapter TypeScript. Reorder, vacancy y
  generación, reset de sesión, cambio de jugador y freshness completo se
  prueban como transiciones controladas, no como evidencia real adicional. El
  cruce corrigió arrays vacíos `null` a `[]`. D9 añade una secuencia real
  sanitizada `InPit=false -> true -> false` dentro de la misma sesión —sin
  inferir garaje, box, pit lane o fase de parada— y un ciclo
  real connected -> disconnected -> reconnected sin payload desconectado. D5
  implementó el mapper canónico
  `Observation → Batch`: fixture real 44/44, identidad opaca por slot y
  generación, jugador/header coherentes cuando existe y limpieza segura al
  desaparecer, sesión/epoch literal según §2.4 y commit de estado únicamente
  tras aceptación del sink. El adapter real del `DriverManager` y el reloj
  duradero conservan continuidad y detectan resets entre reconexiones. Focal
  x20 y Telemetry Core pasan. Review D8 final `APPROVE`, P0/P1/P2/P3 = 0. D4B capturó y
  hash-pinned LMU 1.4
  real en menú y pista, ha probado los ocho solapes SHM/REST —incluido circuito
  antes de anonimizar— y ha habilitado únicamente `1.4.0.0` mediante file y
  product version coincidentes. Lector productivo opt-in `live` PASS. Sin
  derivaciones, wiring, PR, merge ni promoción todavía.
- TC-07B ISA-106: shadow Wails/SSE implementado sobre ISA-129. Legacy conserva
  autoridad de render; Studio/Desktop/OBS observan el contrato canónico sin
  dirty ni mutaciones visuales. Gates Go, frontend y Playwright verdes.
- TC-07C ISA-107: cutover implementado. Overlay Projection v1 es la única
  fuente alcanzable de Studio/Desktop/OBS; el runtime legacy dejó de arrancar.
  Código legacy inerte se elimina en TC-09, no durante el cutover.
- TC-08A ISA-108: auditoría 30/30 completa. La matriz vigente está en
  `docs/telemetry-core/engineer-capability-audit-isa-108.md`. No cambia
  comportamiento ni elimina funcionalidad. Confirma que sesión, grid, fuel,
  pit, laps y gaps son proyectables, mientras flags, engine, tyre, damage,
  conditions y driver swaps deben quedar deshabilitados sin capability.
- TC-08A.1 ISA-130: geometría implementada y verificada antes de ISA-109.
  World position, orientation y local velocity atraviesan el core con
  evidencia LMU real; los offsets y tests sintéticos legacy no se usan como
  autoridad. Suite global, repeticiones, fuzzing y benchmarks pasan; los dos
  avisos Win32 de vet son heredados.
- TC-08B ISA-109: proyección y entrada pura implementadas. El payload contiene
  sesión, parrilla completa, fuel, gaps y geometría con calidad explícita. Se
  reutiliza el contrato ENG-02/03 aprobado, incorporado como segundo padre de
  la rama; no se arrastran su UI ni sus assets de investigación. No hay wiring.
- TC-08C ISA-110: matriz ejecutable 21/21 y bridge replay fail-closed.
  Spotter normal, fuel, contador genérico de sanciones, laps, timings y
  entrada/salida de pit tienen escenarios de paridad. El resto permanece
  parcial o disabled; no hay wiring productivo.
- TC-08D ISA-111: runtime Engineer separado de toda fuente live/sintética;
  entrada canónica acotada por familia, todavía sin wiring LMU productivo.
- TC-08E ISA-112: cutover productivo implementado. El único runtime LMU
  publica estado, observación y hechos hacia Engineer; Engineer no abre un
  reader propio y sus errores quedan aislados de Overlay. La captura real de
  38 coches demuestra la cadena completa y ausencia de falsos Spotter ante
  tráfico lejano. ISA-113 detectó que el shell aún abre otro grafo legacy.
- TC-09A ISA-113: auditoría completada. El runtime canónico es único productor
  de Overlay/Engineer, pero `app.New(-live)` todavía abre una adquisición LMU
  y REST legacy para status/diagnostics/ops. ISA-114 debe migrarlos y retirarla.
- TC-09B ISA-114: implementación completa en revisión. El composition root ya
  no crea `app.App` ni un segundo reader/poller. Status, diagnostics y ops usan
  `TelemetryCoreRuntime`; solo el driver canónico contiene APIs de adquisición
  LMU. El backend legacy y sus CLIs quedan retirados.
- TC-09C ISA-115: implementación completa en revisión. Un único decoder/mapper
  Overlay y lifecycle compartido para Wails/SSE; eventos, adapters y selector
  shadow legacy retirados sin cambiar UI.
- TC-09D ISA-116: implementación y review completadas. Fuzzing de siete
  fronteras, métricas payload-free, benchmarks de la cadena y soak lógico de
  dos horas con 64 vehículos, seis consumidores, Engineer y SQLite pasan.
- TC-09E ISA-87: lifecycle productivo y harness Wails/SSE cerrados; shutdown
  ordenado, hotkeys Win32 corregidos y owners de recursos verificados.
- TC-09F ISA-117: gate técnico final cerrado. Auditoría, fuzz, replay, soak,
  lifecycle, frontend, Playwright, Crystal y evidencia LMU real pasan. Isaac
  aprobó el checklist humano y la issue quedó `Done`; su promoción controlada
  continúa exclusivamente mediante ISA-171.

Existe wiring productivo canónico para Overlay y Engineer. Gaps, delta, pit y
reconexión tienen inputs, algoritmo, fixtures reales y proyección demostrados.
No queda otro corte de implementación de Telemetry Core. La siguiente acción
es la validación integrada Nightly/Pro Plus y la recogida de feedback antes de
considerar cualquier paso a `testers`; `master` permanece fuera de alcance.
`go vet` conserva tres avisos heredados de `unsafe.Pointer` Win32; ISA-118 e
ISA-131/ISA-94 poseen la deuda externa.

## Decisiones

- Preferencia por señal, no autoridad global entre Shared Memory y REST.
- Cero es legítimo; missing/stale/invalid no se inventan.
- Raw en memoria; persistencia solo con consentimiento.
- LMU usa sus archivos históricos y no duplica recording por defecto.
- Reducer single-writer sin I/O; derivaciones lineales/versionadas/acotadas.
- Replays raw, canónicos e históricos son niveles distintos.
- Mocks/simulator solo en harness explícito.

## Evidencia y riesgos

- ISA-37: focal x20, Core, guard ADR, race, fuzz 10 s, benchmark, frontend
  build y suite global Go en verde.
- ISA-38: fan-out sin goroutines, snapshot latest-wins de capacidad uno, log de
  hechos compartido/acotado y resync explícito; tests de soak 20.000, lectores
  concurrentes y 1.000 cierres simultáneos. El cursor causal, teardown
  cancelado, métricas de dos lectores y agotamiento máximo tienen regresiones.
  Focal x20, Telemetry completo, race focal x5 con GCC UCRT64, vet focal, build
  frontend y suite global Go PASS tras la corrección; re-review ACCEPT.
- ISA-39: cuatro proyecciones v1 pequeñas, golden JSON, calidad/presencia
  explícitas, capabilities por producto y versiones canonical/projection/
  recording independientes. La frontera corregida y aprobada es
  `core -> derive -> projection`; Overlay publica `controls.history` sin
  duplicar el tipo derivado. Sin transporte o wiring. ENG-02 debe consumir el
  contrato `projection/engineer` y no duplicar envelope/versioning. Focal x20,
  Telemetry, guard ADR, vet, race x5 y frontend build PASS. Global conserva la
  contención Windows conocida de settings. Una pasada intermedia mostró una
  ejecución load-sensitive del teardown REST LMU; Telemetry final y el focal
  aislado x20 pasan, y ninguna ruta del driver está en el diff.
- ISA-39 review: los campos del jugador ausente ya no usan el zero-value de Go;
  serializan calidad `unknown/missing` explícita en Engineer, Strategy y
  Analysis. El guard de arquitectura rechaza imports entre subárboles de
  productos y conserva únicamente raíz común + árbol propio.
- ISA-40: hub local sin wiring global, full obligatorio, delta RFC 7396
  equivalente y opcional, resync full ante late join/reconnect/gap/consumer
  lento, status separado y coherente por `statusRevision`, facts con secuencia
  independiente y adapters Wails/SSE con JSON idéntico. Constructors tipados y
  sello privado impiden sustituir los `PayloadV1` por canonical/final/raw.
  Cada hub y envelope quedan aislados por `ProductID`; Wails y SSE comparten
  nombre namespaced y JSON. Epoch solo avanza, facts comprueba continuidad
  desde `after` y el delta se reseala. Límite duro de 256 KiB; SSE
  loopback-only. Focal x20, vet focal, race x5,
  Telemetry, guard ADR, frontend 1851/1851, build y suite global Go PASS.
  Benchmark full de 64 vehículos: 258–303 µs/op, ~128,7 KiB/op y
  1.964–1.965 allocs/op.
- ISA-41: decoder/store TypeScript compartido para cuatro productos, payloads
  opacos y versión v1. Status/snapshot coherentes, full de resync, delta
  continuo, facts con cursor independiente y teardown compartido. Harness
  explícito sin ruta productiva; golden Go consumidos por tests. Un fixture
  compartido fija rutas, eventos, estados y límites en Go y TypeScript. Focal
  36/36, frontend 1.887/1.887, build, lint focal, TC-05B Go x20 y proyecciones
  Go y suite global Go PASS. El primer review quedó corregido: reframe
  coherente tras cambio de status, extensiones seguras, cap duro de 256 KiB y
  attach/teardown transaccionales; pendiente re-review independiente.
- ISA-101: benchmark aislado con exactamente los mismos bytes sanitizados para
  framing, SQLite modernc y MCAP. Cinco repeticiones nominal/4×/ráfaga y una
  de 24 h lógica conservaron counts, cursor y SHA-256; queries de rango/cursor,
  crecimiento y tamaños quedaron en CSV. Throughput de cierre se separa de
  checkpoints/RPO.
- ISA-101 crash/recovery: kills deterministas cubren antes de append, antes de
  commit, después de commit/antes de manifest y después del replace. En el
  límite intermedio SQLite/framing recuperan DB `240` con watermark `200`;
  before-append conserva accepted `200`; opening/recording/recovering reinician
  incomplete sin mezclar `accessMode`. Accepted es volátil: no hay ACK durable
  por lote ni pérdida exacta inferible. MCAP no ofrece commit parcial y sigue
  `NO-GO` autoritativo; su recovery CLI upstream no quedó verificado localmente.
- ISA-101 packaging: probes CGO=0 PASS para framing, SQLite y MCAP; DuckDB
  bloqueado por build tags CGO y ausencia de `gcc`. Build base Wails CGO=0
  PASS. SQLite queda `GO` condicionado a TC-06B; MCAP candidato condicionado
  para intercambio/replay; DuckDB y
  framing propio `NO-GO` autoritativo.
- ISA-101 checks: tests del módulo x5 para framing/SQLite/MCAP y tags combinados,
  vet por candidato, builds CGO=0, Telemetry completo, suite Go global, frontend
  build, Wails Windows, invariantes de 48 filas/16 digests y `diff --check`
  PASS. Race no está disponible en este host CGO=0 sin `gcc`; frontend test no
  se repitió porque el corte no cambia frontend.
- ADR 0005 y `docs/telemetry-core/historical-storage-schema.md` fijan manifest
  atómico, observed/facts autoritativos, derived reconstruible, raw opt-in
  separado, chunks versionados/CRC, accepted volátil/watermark/committed,
  `RecordingPayloadV1`/`RecordingFactV1` allowlisted con golden y errores
  unknown tipados, integridad/modo de acceso separados, COW con switch solo por
  manifest, versiones futuras read-only y recovery sobre copia.
- ISA-102 materializa ese contrato: puertos neutrales, mapper real
  pseudonimizado, cola no bloqueante, SQLite modernc privado, manifest
  atómico, reader por rangos, recovery COW del bundle DB/WAL/SHM, límites de
  crecimiento y teardown. Crash boundaries, fallos, privacidad, benchmark y
  packaging CGO=0 están en
  `docs/telemetry-core/recording-sink-sqlite-isa-102.md`.
- La primera review de ISA-102 detectó siete inconsistencias confirmadas,
  corregidas sin ampliar alcance: deadlines reales en todas las operaciones,
  fallo terminal sobre Stop, batch v1 con snapshot obligatorio y tiempos
  mixtos, lease Windows cross-process, catálogo FactType único, cursores/reason
  cerrados y validación NaN/Inf/presence. Pendiente re-review independiente.
- La segunda review añadió tres correcciones: ledger RPO exacto para
  checkpoints parciales/epochs, contexto cooperativo hasta la escritura
  atómica del manifest y DSN URI seguro para caracteres reservados/Unicode.
  Casos nuevos x100 y paquete completo x10 pasan. La tercera review read-only
  del orquestador cerró `ACCEPT` sin P0/P1/P2/P3 conocidos. La repetición
  fresca dejó recording y Telemetry Core en verde. La suite Go global falló
  únicamente por la contención Windows heredada de ISA-118 bajo carga; su caso
  focal x20 pasó y la suite global serial posterior quedó completamente verde.
  Vet focal y build Wails Windows con CGO desactivado también pasan; no hay una
  regresión atribuible a TC-06B.
- Bench ISA-38 fechado: snapshot escalar 231,1–251,6 ns/op y hecho
  129,1–136,2 ns/op, ambos 0 B/op/0 allocs; snapshot con copia de 64 vehículos
  3,753–5,432 µs/op, 16.384 B/op y 1 alloc.
- ISA-104 backend: raíz histórica canónica en LocalAppData o data portable;
  toda la cadena rechaza symlinks/junctions/reparse. Prepare/List/Inspect
  comparten máximo dos operaciones, lifecycle de aplicación y cancelación
  correlacionada; cancel-before-request usa TTL 30 s y cap 64 sin goroutine.
  `ProfileService` entrega snapshots defensivos bajo sincronización.
- ISA-104 UI: solo current+ready abre Inspect; future/corrupt/current no
  disponible son metadata-only. El cliente recalcula SHA-256 y tamaño antes de
  preview/copy/download. Los estados no inspeccionados muestran `—` en lugar
  de zero-values desconocidos y el contraste local medido es 4,592:1. Vitest
  focal 64/64, suite frontend 1.923/1.923, build, lint focal y Playwright con
  seis capturas pasan; consola/overflow/procesos residuales en cero. Evidencia:
  `docs/telemetry-core/evidence/isa-104-inspector/`.
- ISA-104 hardening final: la raíz raw valida toda la cadena antes y después de
  crear y rechaza symlink/junction/reparse; Settings/Launcher entrega snapshots
  profundos, incluido `LastLaunchedAt`; el catálogo conserva top-K global
  determinista con más de 500 entradas. Tests junction Windows, focales
  repetidos y race pasan. Suite Go global serial final: PASS.
- **P3 heredado:** seis avisos `unsafe.Pointer` Win32 en vet global; los seis
  archivos son idénticos a la base ISA-105.
- **Deuda heredada reproducida:** ISA-118 conserva historial de flakiness por
  contención Windows de `app-settings.json.tmp`, pero la ejecución global final
  de ISA-129 queda PASS. El lint global conserva 32 errores y 2 warnings fuera
  del área focal; el único error heredado dentro de un archivo tocado se cerró.
- **P2 operativo cerrado:** ISA-121 creó y protegió Nightly/Testers. La
  promoción controlada se ejecuta mediante ISA-171.
- **Gates funcionales ISA-129 cerrados:** pit/outlap, disconnect/reconnect y las
  dos vueltas Delta proceden de evidencia real sanitizada; no hay sustitución
  sintética ni cutover.

## Issues

| Estado | Issues |
|---|---|
| Cerradas | ISA-23–37, incluyendo ISA-96/97/100 según Linear |
| En revisión | ISA-38 / TC-04D, implementación aceptada técnicamente |
| Cerrada técnicamente | ISA-39 / TC-05A, re-review `ACCEPT` |
| Cerrada técnicamente | ISA-40 / TC-05B, re-review `ACCEPT` |
| Cerradas en la base ISA-102 | ISA-41 / TC-05C e ISA-101 / TC-06A |
| Cerrada técnicamente | ISA-102 / TC-06B, tercera review `ACCEPT` |
| Cerrada técnicamente | ISA-103 / TC-06C, dos reviews finales `ACCEPT` |
| Cerrada técnicamente | ISA-104 / TC-06D, reviews integradas `ACCEPT` |
| En revisión | ISA-105 / TC-07A, PR draft `#41`, D6 `ACCEPT` |
| Cerrada técnicamente | ISA-129 / TC-07A.1; D0-D9 aceptados |
| En revisión | ISA-106 / TC-07B, ISA-107 / TC-07C e ISA-108 / TC-08A |
| Cerradas técnicamente | ISA-130 / TC-08A.1 e ISA-109 / TC-08B |
| Cerradas técnicamente | ISA-110 / TC-08C, ISA-111 / TC-08D e ISA-112 / TC-08E |
| Auditoría cerrada | ISA-113 / TC-09A, matriz proof-first sin borrados |
| En revisión | ISA-114 / TC-09B, backend duplicado retirado |
| En revisión | ISA-115 / TC-09C, frontend/transporte legacy retirado |
| Cerrada técnicamente | ISA-116 / TC-09D, hardening y soak `APPROVE` |
| Cerrada técnicamente | ISA-87 / TC-09E, Wails/SSE y teardown integrado |
| Aprobada | ISA-117 / TC-09F, gate final completo en `170eaeb` |
| Completada | ISA-171 / TC-09G, promoción controlada a `nightly@c5eb3c9` |
| Integrada en Nightly | ISA-160 / TC-10A en `nightly@8880a88` |
| PR draft / CI verde en corte publicado | ISA-161 / TC-10B, PR draft [#212](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/212) OPEN/CLEAN/MERGEABLE a `nightly@b6df494`; [run 31639192366](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31639192366) SUCCESS para `19dddea`; Linear pendiente, sin integración |

## Arquitectura objetivo (ISA-371 / ISA-372)

- ISA-372 / F5 genera el contrato TypeScript wire desde raíces Go explícitas
  de las cuatro proyecciones y telemetrytransport, sin generar el canonical.
  `contracts.ts` reexporta el resultado, los cuatro goldens quedan intactos y
  CI regenera/compara. El conteo histórico de 28 campos estaba obsoleto:
  Overlay Vehicle v1 tiene 30 y Go/TS ya coincidían. El espejo vive realmente
  en `overlay/projection/overlay-projection-v1.ts`, fuera del alcance editable
  F5; queda pendiente un corte que sustituya allí los aliases por imports del
  generado. Evidencia:
  `docs/telemetry-core/evidence/isa-372-f5-contract-gen.md`.
- ISA-372 / F1 implementa la política de fallo no terminal sobre
  `isa-373@3e9c77ed`: errores de producto, payload y consumidor descartan y
  cuentan el frame, publican `degraded` y no cierran adquisición; solo errores
  de programación llaman `failStop`. Overlay y Strategy quedan aislados entre
  sí, las cinco fronteras de consumidor recuperan panics y el status terminal
  se entrega antes de `ErrClosed`.
- `TelemetryFailurePolicyV2` queda on por defecto con rollback explícito a
  legacy. El límite sigue en 256 KiB: 104 vehículos todavía descartan Overlay
  v1 hasta F6, pero no matan el runtime. Métricas nuevas: frames descartados,
  fallos por producto, panics por boundary, fail-stops, percentiles de payload
  y transiciones de lifecycle. Evidencia:
  `docs/telemetry-core/evidence/isa-372-f1-failure-policy.md`.
- Los cuatro tests F0 de F1 están activos y la suite local pasa con las deudas
  citadas. La sesión LMU real de 60 minutos queda pendiente de Isaac. Estado:
  nueve commits locales, sin push, PR, CI remoto, merge, promoción ni release.
- ISA-373 / F0 deja la red de seguridad ejecutable sin modificar producción.
  Los tests rojos permanecen saltados con el defecto y la fase que los activa:
  techo de payload y grid 104 (D-08/D-02), commit mapper/reducer (D-01),
  publicación terminal, panic y consumidor lento (D-02 y riesgos 7/13), gracia
  de identidad, historial y firma stale (D-03 y riesgo 11), historial de 300
  vehículos (D-04), watchdog/orden del status terminal (D-06) y store frontend
  con edad/revisión no contigua (D-06/D-07).
- Sin `Skip`, los tests fallan por la causa prevista. La reutilización real de
  un slot por otro coche ya asigna una identidad nueva y se conserva como
  comportamiento correcto a migrar literalmente. El runtime no ofrece todavía
  inyección de driver ni reloj; F0 usa el sink real post-driver y documenta el
  reloj faltante sin añadir hooks de producción.
- Baseline versionada en
  `docs/telemetry-core/evidence/baseline-2026-08/`: mediana de proyección Overlay
  + JSON para 1/20/44/104 vehículos, con salida cruda. A 104 son 1.593.117 ns/op,
  1.160.221 B/op, 29 allocs/op y 277.119 payload bytes.
- Estado: diez commits locales sobre `origin/nightly@7a92241d`; sin push, PR,
  merge, promoción ni release. Linear queda a cargo del orquestador.

## Siguiente acción exacta

El orquestador debe revisar los commits F1 y los cuatro commits F5, integrar el
carril F2 sin sobrescribir sus archivos reservados y actualizar Linear cuando
las issues propias existan. Isaac debe ejecutar la sesión LMU real de 60
minutos y decidir si acepta la entrega aislada. No hacer push, PR, merge o
promoción desde este worker. F6 sigue siendo el dueño del payload compacto de
104 vehículos; F3 sigue siendo el dueño de la transacción única del engine.
El orquestador debe revisar los cinco commits F2, actualizar Linear cuando la
issue propia exista y decidir el siguiente corte de integración. Isaac debe
ejecutar la verificación LMU/Wails/OBS descrita en la evidencia. No hacer push,
PR, merge o promoción desde este worker. F6 sigue siendo el dueño del payload
compacto de 104 vehículos; F3 sigue siendo el dueño de la transacción única
del engine.

## Gate final

TC-09 exige Core, recording, Overlay y Engineer simultáneos; soak automatizado
de dos horas; sesión LMU real; reconexión; frecuencia/drops/latencia; teardown;
y evidencia para Isaac.

## Última actualización

2026-08-19, ISA-372/F5: contrato TypeScript wire generado localmente desde Go,
reexports en frontend, goldens compartidos y gate de regeneración local/CI.
Hallazgo documentado: Overlay Vehicle v1 tiene 30 campos y el espejo ya era
paritario. Sin cambios de red o canonical; sin push, PR, CI remoto, merge,
promoción ni release. Integración F2 pendiente del orquestador.
2026-08-19, ISA-372/F2: watchdog backend y frontend implementado con reloj
inyectable, stale/recovery, revisión no contigua, métricas, diagnóstico,
rollback y tests de reconnect/late join. Gates locales y Playwright de estados
pasan; runtime LMU/Wails/OBS real pendiente. Cinco commits locales, sin push,
PR, CI remoto, merge, promoción ni release.

2026-08-19, ISA-372/F1: política v2 no terminal implementada localmente sobre
`isa-373@3e9c77ed`, con rollback legacy, métricas, recover por consumidor,
status terminal entregable y cuatro tests F0 activados. Gates locales pasan
con las excepciones preexistentes documentadas; sesión LMU de 60 minutos
pendiente de Isaac. Sin push, PR, CI remoto, merge, promoción ni release.

2026-08-12, ISA-161: ISA-160 ya está integrada en `nightly@8880a88` e ISA-161
surgió originalmente de esa base. El primer rebase fue sobre `234794d`; la base
y merge-base actuales son `origin/nightly@b6df494`. Tasks 1-4 y sus reviews
locales están cerradas en el HEAD previo a documentación reescrito `fee981b`:
contrato Strategy v1 aditivo,
segundo Hub sobre el mismo `FinalState`, Wails/SSE locales y
replay/resync/soak/benchmark.
Fuel amount/capacity conserva atomicidad y quality; VE, tyres, weather y facts
siguen ausentes. Race no se ejecutó por falta de CGO/GCC. El opt-in LMU
read-only pasó sobre el HEAD del primer rebase `879d5be` con build `1.4.0.0`
supported, runtime live y
player ausente; acredita adquisición/mapping/runtime, no un full Strategy ni
Fuel live en pista. Telemetry, app/server, Go global, frontend build y
367 archivos/2.636 tests pasan; dos `AbortError` de teardown terminan con exit
0. Vet conserva solo tres `unsafe.Pointer` heredados y gofmt lista el
`diagnostics_service.go` heredado, fuera de ISA-161. La rama está publicada y
el PR draft #212 permanece OPEN/CLEAN/MERGEABLE a `nightly@b6df494`; el run
`31639192366` y GitGuardian pasaron para `19dddea`. Cualquier amend posterior
requiere checks de su nuevo HEAD y el estado final se consulta en el PR. Linear
continúa pendiente por reautenticación. No hubo merge, promoción ni release.
ISA-152 no está desbloqueada hasta la promoción aceptada de ISA-161 a
`nightly`.

2026-08-01, ISA-117: gate técnico final completado sobre ISA-87 `4233c9f`.
La auditoría demuestra un solo owner LMU y cero rutas legacy productivas. Go
global, siete fuzzers, replay, soak de dos horas, lifecycle x5, frontend
2.016/2.016, build, Playwright cutover/shadow, Crystal 21/21, fixtures LMU
reales x5 y lectura live LMU 1.4 pasan. Cero P0/P1/P2 atribuibles a Telemetry
Core. Deuda externa: ISA-118 e ISA-131/ISA-94; `-race` sin GCC y tres avisos
Win32 vet heredados. Documento, rollback y checklist:
`docs/telemetry-core/final-gate-isa-117.md`. Estado: `In Review`; sin merge ni
promoción.

2026-08-01, ISA-87: status y Overlay Projection v1 coinciden byte a byte entre
el transporte real de eventos Wails y SSE. El composition root posee un
shutdown único y ordenado; Engineer forma parte de él y los hotkeys terminan
su hilo Win32 mediante `PostThreadMessageW`. El harness integrado prueba
SQLite, puerto, suscriptores, goroutines, bridges y owners de handles. Documento:
`docs/telemetry-core/wails-lifecycle-teardown-isa-87.md`. Siguiente: ISA-117.

2026-08-01, ISA-116: siete fronteras pasan fuzzing; métricas runtime/transporte
sin payload; soak lógico exacto de dos horas con 64 vehículos, seis
consumidores, Engineer y SQLite sin rechazos ni crecimiento; benchmarks de
toda la cadena documentados. La validación del Hub conserva seguridad y reduce
el full de 64 vehículos desde 258–303 µs históricos a 47,2–50,5 µs. Go global,
frontend 2.016/2.016, build y Playwright cutover pasan. `-race` queda no
ejecutable por ausencia de GCC; vet conserva tres avisos Win32 heredados.
Documento: `docs/telemetry-core/hardening-isa-116.md`. Siguiente: ISA-87.

2026-08-01, ISA-115: `telemetry:update`, los adapters Wails/SSE antiguos,
`normalizeLegacyTelemetry`, el selector fail-open y el harness shadow runtime
quedan retirados. Studio/Desktop/OBS comparten Overlay Projection v1; el
decoder/mapper autoritativo vive en `overlay/projection` y el comparador
histórico queda no productivo hasta ISA-117. Source status usa un contrato y
eventos `telemetry-core:*` únicos. Documento:
`docs/telemetry-core/frontend-retirement-isa-115.md`. Siguiente: ISA-116.

2026-08-01, ISA-114: status, diagnostics y métricas leen el runtime canónico y
el segundo grafo LMU se retira completo. Solo
`internal/telemetry/drivers/lmu` utiliza APIs de memoria compartida. Engineer
conserva monitores, audio, comandos, Pit Manager y SSE; los readers
experimentales sin wiring se eliminan y las fixtures Extended restantes son
decoders puros sin I/O. Documento:
`docs/telemetry-core/backend-retirement-isa-114.md`. Siguiente: ISA-115.

2026-08-01, ISA-113: la matriz final demuestra que `app.New(true)` todavía
abre el reader y poller REST legacy, aunque ya no publique widgets. El status
visible, diagnostics y ops mantienen ese grafo alcanzable junto al driver
canónico. Se clasificaron backend, Engineer, frontend, transports, fixtures y
tooling con KEEP/MOVE/DELETE y orden de retirada. Cero borrados. Documento:
`docs/telemetry-core/consumer-retirement-matrix-isa-113.md`. Siguiente: ISA-114.

2026-08-01, ISA-112: la composición productiva inyecta `EngineerService` en
`TelemetryCoreRuntime`. Estado de fuente, observaciones y hechos siguen
contratos separados; live no conecta sin datos usables y stale/error/stop
desconectan. Los errores Engineer no interrumpen LMU ni Overlay. El fixture
real LMU 1.4 de 38 coches atraviesa ese runtime con una apertura de `LMU_Data`
y no produce falsos Spotter ante tráfico lejano. ISA-113 encontró otra apertura
legacy en el shell, fuera del runtime Engineer. El solape audible real queda en
el gate manual final. Documento:
`docs/telemetry-core/engineer-cutover-isa-112.md`. Siguiente: ISA-113.

2026-08-01, ISA-111: `EngineerService` ya no construye fuentes. Solo consume
snapshot/hechos canónicos; ejecuta seis familias aprobadas de forma aislada,
resetea por límites y reporta desconectado hasta evidencia real. Suite global
serial y build frontend pasan; race no está disponible con CGO desactivado.
Documento: `docs/telemetry-core/engineer-runtime-separation-isa-111.md`.
Siguiente: ISA-112.

2026-08-01, ISA-110: el replay enumera Spotter + 20 monitores y falla cerrado
para cualquier familia o señal no aprobada. Seis escenarios atraviesan la
proyección canónica y reproducen geometría/transiciones observables; el bridge
solo acepta fresh+supported y no está conectado a producción. Documento:
`docs/telemetry-core/engineer-replay-parity-isa-110.md`. Siguiente: ISA-111.

2026-08-01, ISA-130: posición mundo, velocidad local y orientación se admiten
por vehículo desde el único reader LMU hasta Reducer. La fixture real LMU 1.3
`959c5142…e5ff` demuestra 44/44 filas, matriz right-handed y el signo local
mediante un oráculo independiente. Cero permanece presente; NaN/Inf y matriz
degenerada quedan invalid por campo; la caducidad vuelve stale toda la
geometría. El sanitizador zero-rebuild conserva ya esos spans para una futura
captura 1.4. No se activa Spotter y las fixtures 1.4 anteriores a cero no se
presentan como prueba espacial. Siguiente corte: ISA-109.

Gates finales ISA-130: Telemetry Core x10, focal x20, suite Go global, build
frontend y dos fuzzers pasan. Parse de 44 vehículos: 49,3–53,7 µs/op;
sanitización diagnóstica: 164,5–201,2 µs/op. Vet focal conserva solo dos avisos
Win32 heredados de `unsafe.Pointer`. No hay wiring Spotter ni promoción.

2026-08-01, ISA-129 D9: el harness D8 y el trace Delta real se conservan sin
repetir las vueltas. Cuatro frames LMU 1.4 zero-rebuild cierran una secuencia
`InPit=false -> true -> false` dentro de la misma sesión, sin ampliar el
booleano a etiquetas de garaje/box/pit lane, y la reconexión después
de ausencia completa de proceso/mapping. Los hashes y sidecars se reproducen
x20; la desconexión no contiene payload y el reconnect abre una sesión/epoch
nueva sin aceptar un grid vacío. Los cuatro benchmarks, Telemetry Core,
frontend 297/2.020, build, lint focal y `diff --check` pasan. `-race` sigue no
disponible con CGO desactivado. Mi suite Go global final pasa; la review
independiente reprodujo el P3 Windows heredado ISA-118 de
`app-settings.json.tmp` en global, serial y focal. Está fuera del diff y no se
corrige en ISA-129. Lint global y seis warnings Win32 siguen fuera del área
focal y reproducidos en la base exacta. La review independiente final cerró
`APPROVE`, P0/P1/P2/P3 abiertos = 0, después de endurecer los JSON de evidencia,
forzar el tracking de los cuatro binarios y resolver el ledger sin duplicarlo.
Pendientes solo commit D9, push, PR draft, Linear y ledger global; no hay merge
ni promoción.

2026-07-31, ISA-129 D7 aceptado: contrato Overlay v1 aditivo con dos
goldens y matriz de compatibilidad completa. El decoder normaliza ausencias y
rechaza campos conocidos inválidos; el adapter conserva calidad y no inventa
datos. La matriz 18/18 queda en 2 exactos, 10 parciales, 5 no comparables y 1
externo. El cambio legítimo del payload actualizó el hash del replay canónico y
la expectativa del harness; las suites amplias pasan. Review final `APPROVE`,
P0/P1/P2/P3 = 0. Siguiente acción exacta: D8, sin wiring productivo, PR, merge
ni promoción en este punto.

2026-07-31, ISA-129 D6 aceptado: remaining, gaps relativos y self-delta se
derivan exclusivamente de observaciones canónicas demostradas. La sesión LMU
real queda preservada como fixture sanitizada de 1.846 muestras a 10 Hz, tres
wraps y dos vueltas comparables, con SHA-256
`d8f01beee1380d771e5e29de5dfa9e5de72517e1bf447bc14881ee44df7fe938`.
El test compara contra un oráculo independiente por distancia, fija 100 ms de
incertidumbre y exige una diferencia superior. Focales x20, dos fuzzers de
10 s, Telemetry Core, vet focal, benchmarks y `diff --check` PASS. Review final
`APPROVE`, P0/P1/P2/P3 = 0. Sin proyección Overlay, wiring productivo, PR,
merge ni promoción. Siguiente: D7.

2026-07-31, ISA-129 D5 aceptado: mapper síncrono fuera de cada driver, 44 identidades
estables en la fixture real, sesión/epoch/generaciones atómicos y campos
canónicos completos sin derivaciones. Focal x20, Telemetry Core y suite Go
global serial PASS. Review independiente final `APPROVE`, P0/P1/P2/P3 = 0.
`go test -race` no es ejecutable en este entorno porque Go informa
`-race requires cgo` y `CGO_ENABLED=0`; no se cambió el toolchain para ocultar
el gate. Sin wiring productivo, PR, merge ni promoción.

2026-07-31, ISA-129 D4B: cuatro evidencias LMU 1.4 reales y sanitizadas fijadas
por SHA-256. Pista: práctica, 38 vehículos y jugador; REST live correlacionado.
Los sentinels negativos finitos de lap distance y gaps son `missing`, nunca
cero. La revisión adversarial añadió correlación de circuito mediante digest
privado en memoria y recapturó el par final. Driver y CLI x20, Telemetry Core,
lector opt-in y auditoría de privacidad PASS. La suite Go global reprodujo solo
la contención Windows heredada de `app-settings.json.tmp`; el focal aislado
pasó al repetir y la suite global serial quedó verde. Siguiente: D5. Sin PR,
merge, wiring productivo ni promoción.
