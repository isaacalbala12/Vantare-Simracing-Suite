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

STR-00 y STR-01 quedaron aceptados. STR-01 rescata Product A solo como oráculo
histórico aislado; no conecta sus contratos al producto. STR-02 introduce el
primer contrato productivo versionado. STR-03 implementa el repositorio local
canónico de drafts y revisiones. STR-04 añade la fachada de comandos y el store
frontend transitorio. STR-05 añade el motor manual puro de carrera, Fuel,
Virtual Energy y pit, todavía sin UI final ni wiring productivo. La UI canónica
usa estrategias a la izquierda, stints al centro e inventario/entrada a la
derecha.

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
- Issue activa: ISA-140 / STR-05, implementación lista para review independiente
  sobre el commit aceptado de STR-04.

## Siguiente acción exacta

Revisar ISA-140 / STR-05. Si queda `ACCEPT`, continuar ISA-141 / STR-06 apilada
sobre este motor. No añadir inventario de neumáticos, UI final, telemetría,
solver o wiring transversal dentro de la revisión de STR-05.

## Última actualización

2026-08-02, ISA-140 / STR-05, Codex.
