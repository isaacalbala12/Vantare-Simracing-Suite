# Handoff vivo — Strategy Planner

## Resultado

Un único producto que crea, compara, guarda, ejecuta y adapta planes para
minimizar tiempo total esperado y mostrar riesgos/alternativas. Product A/B/C
son fases históricas.

## Autoridad y lectura

- `docs/vantare-program/README.md` y `product-contract.md`.
- Este handoff y `Strategy Planner — Race Strategy Suite` en Linear.
- `docs/superpowers/specs/2026-07-13-strategy-planner-product-b-design.md` y
  `strategy-base.html` son referencias históricas que deben reauditarse.
- El próximo informe de rescate y plan unificado sustituirán los planes PB.

## Estado

Actualización ISA-309 / STR-N02 (2026-08-10):

- La pila acumulativa de Strategy posterior a STR-09 se reconstruyó sobre
  `origin/nightly@08fcfc1` en la rama oficial de ISA-309, sin los seis commits
  ajenos que contaminaban la rama histórica.
- Los 11 commits de producto incluyen saneamiento presentacional, dominio Go
  unificado de neumáticos, solver determinista, variantes, wiring del
  workspace, listado real de planes, paquetes import/export, plan activo
  auditable, reglas de evento versionadas y la regresión de loading/retry.
- Go Strategy, typecheck real, suite frontend completa, build y ESLint focal
  están verdes. `-race` sigue sin verificarse en este entorno Windows sin CGO;
  los bridges continúan sin prueba manual contra una aplicación Wails viva.
- PR draft #192 está abierto hacia `nightly`, mergeable y con todos los gates
  verdes tras un rerun único de un presupuesto temporal heredado de Telemetry
  Core. Strategy no fue la causa del primer fallo.
- Siguiente acción exacta: revisión de Isaac del PR #192. Solo su autorización
  posterior permite promoverlo a `nightly`; STR-15B (ISA-162) no comienza
  hasta que esa base esté realmente integrada.

Actualización ISA-152 / STR-17 (2026-08-13):

- ISA-161 fue aceptada por Isaac e integrada mediante squash del PR #212 en
  `nightly@b2e4067809d31152fdcf374875179e577d483c03`. El gate post-promoción
  31708164123 pasó completo. Linear refleja ISA-161 en `Nightly`.
- ISA-152 está implementada localmente sobre una rama/worktree aislados desde
  ese squash. Los commits son `98104b0` (plan), `3f48045` (motor/read model),
  `091f8ba` (adaptador al Hub) y `bf9e9e5` (evidencia LMU). Reviews
  independientes de spec y calidad aprobaron los tres cortes sin findings
  abiertos.
- El motor efímero mantiene cursor, lifecycle, stint, Fuel, desviación solo
  contra objetivos exactos y próxima acción planificada. Duplicados,
  out-of-order, gaps, epochs, reconnect coalescido y backpressure están
  cubiertos. Missing, stale, invalid y unsupported permanecen explícitos.
- El adaptador consume una única suscripción del `StrategyHub()` existente,
  tolera la evolución aditiva de Strategy v1 y no crea goroutines, readers,
  endpoints ni almacenamiento. No está conectado al arranque: `ActivePlan`
  conserva una referencia de revisión, no los stints/objetivos normalizados, y
  STR-17 no autoriza inventar esa fuente.
- `TestStrategyLiveLMUOptIn` pasó con el pipeline productivo completo y un solo
  reader: source live, cursor `1/3`, vuelta completada `0` fresh, Fuel
  `98/115 L` fresh y desviación missing sin objetivo. El log es sanitizado; no
  contiene raw, track, fingerprint, IDs reales ni PII.
- Gates locales: focales x20, vet focal, frontend build, `go test ./...` y
  frontend `367/2636` pasan. `-race` no se ejecutó por CGO desactivado y falta
  de GCC. La rama sigue local y limpia: sin push, PR, CI, merge, promoción o
  release; Linear permanece `In Progress` hasta publicar.
- Microplan vigente:
  `docs/superpowers/plans/2026-08-13-isa-152-str-17-live-execution-engine.md`.
  Evidencia detallada:
  `docs/strategy-planner/evidence/isa-152-strategy-live-engine.md`.

Actualización condicionada ISA-161 / TC-10B (2026-08-12; estado histórico):

- Telemetry Core ha implementado en la rama local de ISA-161 el productor
  `StrategyLiveProjection v1` sobre el único pipeline LMU canónico. Incluye
  sesión, progreso, pit y Fuel con calidad explícita; VE, tyres, weather y
  facts permanecen ausentes.
- ISA-161 se construyó originalmente desde ISA-160 en `nightly@8880a88`; su
  primer rebase local fue sobre `origin/nightly@234794d` y su base/merge-base
  actuales son `origin/nightly@b6df494`. La rama está publicada y el PR draft
  [#212](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/212)
  está OPEN/CLEAN/MERGEABLE hacia `nightly`. El
  [run 31639192366](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31639192366)
  pasó completo para `19dddea`, incluido GitGuardian. Cualquier amend posterior
  requiere checks de su nuevo HEAD; el estado final se consulta en el PR.
  Linear sigue pendiente por reautenticación.
- Esto no implementa el motor live Strategy ni desbloquea todavía ISA-152 /
  STR-17. La dependencia técnica solo será desbloqueable tras la promoción
  aceptada de ISA-161 a `nightly`; no hubo integración, promoción ni release
  de este corte.

STR-00 y STR-01 quedaron aceptados. STR-01 rescata Product A solo como oráculo
histórico aislado; no conecta sus contratos al producto. STR-02 introduce el
primer contrato productivo versionado. STR-03 implementa el repositorio local
canónico de drafts y revisiones. STR-04 añade la fachada de comandos y el store
frontend transitorio. STR-05 añade el motor manual puro de carrera, Fuel,
Virtual Energy y pit. STR-06 añade el inventario físico individual y sus reglas
de condición, estado y esquina persistente. STR-07 añade el shell visual y la
navegación real de la suite. STR-08 conecta el documento editable al repositorio
canónico, añade operaciones de stint y asignación física por DnD/teclado. La UI canónica usa
estrategias a la izquierda, stints al centro e inventario/entrada a la derecha.
STR-09 añade entrada rápida y tabla por vuelta con correcciones no destructivas,
Fuel/Virtual Energy separados, fuel-save determinista y pérdida de boxes por
cada parada real; las tarjetas consumen el resultado Go correlacionado.

Actualización ISA-134 / STR-00:

- Proyecto activo: `Strategy Planner — Race Strategy Suite`.
- Product A/B/C quedan como fases históricas de un único producto.
- Product A auditado: `codex/strategy-product-a@b9f1937`.
- Base aprobada: `ISA-117@170eaeb`.
- Divergencia: 371 commits de la base y 44 de Product A.
- Simulación: 94 paths = 87 auto-merged + 7 conflictos; 6.751 inserciones y 5
  eliminaciones.
- Veredicto: rescate selectivo; prohibido merge/cherry-pick por rango.
- Allowlist STR-01: un fixture exacto + 24 paths del dominio solo por port
  manual; los otros 69 paths están en denylist.
- Las 26 issues PB están `Canceled` como superseded, enlazadas al mapa y sin
  borrar historia. El backlog canónico son 24 cortes: ISA-136..157 más
  ISA-162/163.
- Productores: ISA-159 (Analysis histórico) e ISA-160/161 (Core live).
- STR-01: commit `f85fd31`, push y PR draft #60; sin promoción.
- STR-02: `ACCEPT`, commit `91c16c2`, push y PR draft #66 sobre `f85fd31`.
  Añade activación idempotente
  con historial exacto, decode execution estricto y corpus Go/TS de errores,
  máximo entero compartido `2^53-1`, regresión UTF-8 real y precedencia de
  versiones desconocidas equivalente en Go/TS. El encoder TS limita profundidad
  también al verificar valores ya construidos. La verificación productiva ya no
  materializa el hexadecimal del payload: calcula solo el digest; el hexadecimal
  diagnóstico usa un búfer acotado. La regresión de 1.000.000 de elementos
  canoniza `9.000.005` bytes y el benchmark reproducible está en
  `docs/strategy-planner/str-02-canonicalization-memory-benchmark.md`.
  Permanece sin merge ni promoción. Go focal x50, dos fuzzers, frontend
  completo 299/299 archivos y 2.034/2.034 tests,
  TypeScript, build, lint focal, vet focal y diff-check pasan. Go/vet global no
  se repitieron en la reanudación del 2 de agosto; su última evidencia conserva
  deuda Windows heredada fuera del diff.
- STR-03: implementación local sobre `ISA-137@91c16c2`. API
  `Snapshot`/`Commit(ChangeSet)`, generación optimista, lease cross-process,
  escritura atómica durable, backup/rollback, drafts recuperables, revisiones
  inmutables, límites y borrado sin tocar externos. La review queda corregida:
  solo corrupción/ausencia activa recovery; límites, I/O y versiones futuras
  no mutan el principal; drafts y revisiones atraviesan el gate `strategy.v1`;
  temporales huérfanos se limpian bajo lease sin seguir links/reparse points;
  y un fallo posterior al replace devuelve `ErrCommitUncertain` para reconciliar
  por generación. La segunda re-review queda corregida sin marker: el primer
  commit persiste su misma generación en el backup antes del principal, de modo
  que principal ausente nunca se confunde con gen0 después de inicializar. Los
  fallos antes/después del replace fijan la frontera ordinaria/incierta y un
  writer con versión 0 no puede consolidar pérdida. Migración v1 es no-op
  explícito porque no existe predecesor productivo. Evidencia:
  `docs/strategy-planner/str-03-repository.md`. Lista para review independiente,
  sin promoción. Focal x100, lease cross-process x50, Strategy, vet focal,
  race x10, compilación Linux,
  frontend build y suite Go global sin el único P3 Windows heredado pasan.
- STR-04: implementación sobre `ISA-138@8e151b8`. Protocolo
  `strategy.application.v1`, servicio/bridge estricto, commits idempotentes,
  rechazo optimista de versiones stale y store con dirty derivado, undo/redo
  acotado y observación live aislada. Cerrar el editor conserva plan activo y
  ejecución; duplicar puede capturar cambios locales sin modificar el origen.
  La corrección de review bloquea edit/undo/redo durante save/close, evita
  reemplazar dirty sin descarte, reintenta un save incierto con identidad
  exacta, endurece requeridos/semántica/límites JSON y añade cancel/dispose con
  limpieza ante respuestas tardías o fallos síncronos del transporte.
  Evidencia: `docs/strategy-planner/str-04-application-service.md`. Lista para
  segunda review independiente, sin wiring, merge ni promoción. Go focal x100,
  Strategy, Go global, vet focal, race x10, frontend 301/301 archivos y
  2.052/2.052 tests, 36/36 focales, TypeScript, build y lint focal pasan. Una primera corrida
  frontend bajo carga paralela mostró flakiness heredada del canvas; la corrida
  final aislada quedó completamente verde.
- STR-05: implementación sobre `ISA-139@f60f480`. El paquete puro
  `internal/strategy/manual` calcula carreras por vueltas/tiempo, recursos y
  pit sin wiring. Una carrera por tiempo completa la vuelta en curso mediante
  `ceil` estable y solo añade otra con regla explícita; pit loss sigue siendo
  input manual con procedencia y no crea un fixed-point oculto. Fuel/VE tienen
  resultados incompatibles, reservas explícitas, repostajes/recargas y
  fuel-save que cuenta el inicio real. Pit separa fijo/variable y cuantifica el
  solape Fuel/neumáticos; repair y penalty son opcionales y no se ocultan.
  Cada supuesto publica valor, unidad, procedencia y confianza. Evidencia:
  `docs/strategy-planner/str-05-manual-calculation.md`. Lista para review
  independiente, sin UI, solver, presets LMU, telemetría, persistencia, wiring,
  merge o promoción.
- Corrección STR-05 posterior a review: servicios Fuel/VE se asignan hasta
  cubrir la necesidad sin epsilon ni subasignación; un ruido positivo sobre un
  múltiplo crea conservadoramente otro servicio. Las fronteras de carrera se
  resuelven con aritmética decimal racional: `0.3/0.1` sigue exacto y una media
  vuelta cerca de `2^52` no se borra. Correcciones P1/P2 listas para re-review.
- STR-06: implementación sobre `ISA-140@2d0af85`. El paquete puro
  `internal/strategy/tyres` modela cada neumático físico con identidad,
  Soft/Medium/Hard/Wet, origen, condición con procedencia/confianza, estado,
  stints y esquina. Clasificación sin dato conserva 80–90 % y ausencia general
  40–70 %; ningún estimado se vuelve exacto. El primer uso liga la unidad a una
  esquina, mientras que un montaje aún no usado puede corregirse. La selección
  admite compuestos mixtos, excluye descartados y explica inventario
  insuficiente mediante error tipado. Evidencia:
  `docs/strategy-planner/str-06-tyre-inventory.md`. Lista para review
  independiente, sin UI, persistencia, telemetría, wiring, merge o promoción.
- STR-07: implementación sobre `ISA-141@52d2466`. Registra Strategy en el
  topbar y la access policy, añade galería, entrada, revisión, workspace,
  comparación y guardado honesto de sesión. El harness autocontenido recorre el
  flujo y captura wide/medium/compact con proporción `3/6/3`, overflow global
  cero, consola limpia y modal accesible con foco atrapado/restaurado. La suite
  serial base pasa `2059/2059`; la corrección final añade el cuarto stint para
  sumar 78 vueltas y métricas coherentes por estrategia, con focal `7/7`, build
  y lint focal PASS. Evidencia:
  `docs/strategy-planner/str-07-shell-visual.md`. Sin solver, live,
  persistencia, drag/drop, merge o promoción.
- STR-08: implementación sobre ISA-142 aceptada. Añade `strategy.editor.v1`,
  editor inmutable de stints, neumáticos individuales con esquina persistente,
  DnD y alternativa de teclado, undo/redo, guardado y recarga mediante STR-03/04.
  El bridge Wails sanitiza errores y conserva correlación; apertura lazy,
  reintento y StrictMode tienen regresión. Playwright recorre todas las acciones
  y recupera el documento tras reload con cero errores de navegador. Evidencia:
  `docs/strategy-planner/str-08-stint-editor.md`. Sin solver, telemetría, live,
  merge o promoción.
- STR-09: implementación sobre `ISA-144@53e8158`. Extiende el documento de
  STR-08 con `strategy.manual.v1`, promedios, correcciones dispersas por vuelta,
  unidades y rangos. El bridge Go calcula Fuel/VE, ahorro por vuelta/stint,
  ritmo, desgaste y boxes; cuatro stints equivalen a tres pérdidas por parada.
  La UI neutraliza resultados stale, restaura correcciones individualmente y
  no muestra impactos de ritmo inventados. Playwright valida edición,
  rechazo, guardado/recarga, responsive y navegador limpio. Evidencia:
  `docs/strategy-planner/str-09-manual-inputs.md`. Sin Analysis, solver, live,
  nueva persistencia, merge o promoción.

## Decisiones

- Modos manual, asistido y live.
- Fuentes históricas, recording, live, inputs y reglas.
- Neumáticos individuales con ID, compuesto, desgaste, condición, stints,
  posición, origen y estado.
- Un neumático usado queda ligado a FL/FR/RL/RR; se permiten combinaciones
  mixtas de Soft/Medium/Hard/Wet cuando las reglas del evento lo permitan.
- Clasificación puede dejar 80–90 %; sin datos se usa manual o rango 40–70 %.
- Fuel y Virtual Energy son recursos separados.
- Objetivo: menor tiempo total con incertidumbre; rápida, robusta y conservadora.
- Safety Car/FCY/lluvia/daños/penalizaciones forman parte del producto final.
- Galerías separan Vantare, Comunidad y Mis planes; privado por defecto.
- STR-03/ISA-138 posee en exclusiva repositorio, atomicidad, migraciones,
  drafts, revisiones y recovery. STR-15A/ISA-150 solo posee queries/UI de `Mis
  planes` y paquetes import/export a través de ese repositorio; no duplica
  persistencia.
- Correcciones no destructivas y tabla avanzada.
- Live explica cambio, impacto, propuesta y consecuencia.
- Engineer propone, piloto acepta, Strategy actualiza, Overlays leen.
- El LLM redacta voz/texto; no calcula la estrategia.
- Contrato inicial `strategy.v1`: draft mutable, revisión inmutable/hash,
  activación por referencia exacta, ejecución secuenciada y replan con
  aceptación explícita.
- Fuel y Virtual Energy son tipos incompatibles en Go y TypeScript.
- Go crea y firma lógicamente revisiones; TypeScript las valida contra un
  manifiesto y golden compartidos, sin segundo constructor divergente.
- `sha256:strategy-c14n-v1` fija un encoder binario común Go/TypeScript con
  orden de claves UTF-8, float64 big-endian, límites de recursos y corpus
  adversarial de bytes/hash. Hashes son minúsculos y timestamps son UTC
  RFC3339 canónicos con precisión máxima de milisegundos.
- Replans se decodifican estrictamente y se validan antes/después de aceptar o
  activar. Los estados de ejecución y propuestas aceptadas no conservan aliases
  mutables del input ni de snapshots anteriores.
- Repetir una propuesta ya aplicada devuelve el mismo snapshot activo sin una
  segunda activación, únicamente si candidata, base y revisión anterior
  concuerdan exactamente.
- `LapCount`, `epoch` y `sequence` comparten el máximo entero `2^53-1`; el
  decoder de execution rechaza shape anidado, duplicados, unknown fields,
  trailing data, timestamps y capabilities inválidos con el mismo
  `errorCode/errorField` en Go y TypeScript.
- La segunda corrección fija los 25 nombres del corpus execution, usa paths
  completos para revision/provenance/confidence y valida escalares antes del
  decode Go. Los límites canónicos viven también en el manifiesto compartido;
  strings ya no heredan por error el límite de elementos de un contenedor.
- Una versión explícita desconocida se rechaza antes de interpretar la shape v1;
  la ausencia del campo conserva `invalid_document`. El mismo corpus fija esa
  precedencia para revisión y replan en Go/TypeScript.
- El encoder TypeScript aplica límites de salida, elementos y profundidad por
  sí mismo; no depende de que el input haya atravesado antes el parser JSON.

## Riesgos

- **P1:** escenarios históricos no auditados usados como autoridad.
- **P1:** duplicar Core o el almacenamiento de Analysis.
- **P2:** Monte Carlo opaco o innecesario; determinista es la base.
- **P2:** preservar contratos débiles por evitar un refactor pre-lanzamiento.

## Evidencia e issues

- Auditoría: `docs/strategy-planner/str-00-audit.md`.
- Matriz: `docs/strategy-planner/rescue-matrix.md`.
- Mapa: `docs/strategy-planner/pb-to-str-map.md`.
- ADR: `docs/adr/0006-strategy-planner-unified-domain-and-ownership.md`.
- Plan: `docs/superpowers/plans/2026-08-01-strategy-planner-unified-master.md`.
- Ownership: `docs/strategy-planner/projection-ownership.md`.
- Product A exacto: Go focal/vet, 25 tests frontend y build pasan; el smoke
  Playwright histórico se bloquea y debe reemplazarse en STR-07.
- Caracterización STR-01:
  `docs/strategy-planner/str-01-product-a-characterization.md`.
- Paquete histórico: `internal/strategy/producta`; 25/25 paths de la allowlist,
  fixture exacto y 24 blobs Go iguales salvo el namespace.
- Guard de entrega: denylist 69/69, manifiesto versionado del delta y discovery
  de raíz compatible con `-trimpath`.
- Contrato STR-02: `docs/strategy-planner/str-02-contract.md`.
- Issue activa: ISA-144 / STR-09, implementación lista para review independiente
  sobre el commit aceptado de STR-08.

## Siguiente acción exacta

Publicar la rama ISA-152, abrir PR draft hacia `nightly`, esperar CI y reflejar
el SHA/PR reales en Linear. No promover ni mergear sin autorización de Isaac.
El wiring de arranque requiere una issue/decisión que entregue una fuente
normalizada de stints y objetivos desde la revisión activa; no inventarla en
STR-17. STR-18 continúa separado.

## Última actualización

2026-08-13, ISA-152 / STR-17, Codex.
