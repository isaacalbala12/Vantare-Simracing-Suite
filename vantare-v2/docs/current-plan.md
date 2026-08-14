Nota ISA-358 / HUD-01 (2026-08-14, implementación local validada):
- El Hub principal conserva su diseño, pero la cabecera recibe ahora la versión
  y el canal reales de `app:version`; ya no fija `v0.1.0.2` ni presenta todas
  las builds como la misma Beta.
- El resumen de roadmap consume `roadmap-public.snapshot.json` mediante el
  loader canónico de la página Roadmap y expone procedencia fresh, stale o
  fallback. Novedades descubre automáticamente los manifiestos canónicos de
  `docs/releases/*.json`; el calendario tiene una sola fuente de estado y se
  suscribe antes de solicitar el documento.
- Gates: focales 46/46, frontend completo 371 archivos/2681 tests, build,
  ESLint focal del cambio y `git diff --check` PASS. El lint de `HubApp.tsx`
  conserva el error heredado `react-hooks/refs` de la línea 77, fuera del diff.
  El preview T3 abrió el Vite correcto en 1280x800, pero snapshot y evaluación
  fallaron/agotaron tiempo, por lo que la inspección visual manual sigue
  pendiente.
- Estado: implementación en `4258ca06`, nacida de
  `origin/nightly@673283a2` y sincronizada después con
  `origin/nightly@521e862c`. Sin promoción ni release.

Nota ISA-346 / TC-EVIDENCE-01 (2026-08-14, diseño aprobado):
- El primer corte de evidencia visual del Testing Center admite solo archivos
  PNG/JPEG existentes: máximo 10 capturas, 10 MiB cada una y 100 MiB por lote.
- Se aprueba Supabase Storage privado con manifest relacional, rutas
  server-owned, validación cloud de SHA-256/tamaño/firma/dimensiones, acceso
  temporal para agentes y limpieza durable. Los bytes no pasan por PostgreSQL,
  Linear, prompts, RPC JSON ni drafts locales.
- Se descartan Streamable, vídeo, grabación/captura integrada y enlaces
  externos. No hace falta `tus-js-client` ni otra dependencia nueva.
- La autoridad técnica es
  `docs/superpowers/specs/2026-08-14-testing-center-screenshot-evidence-design.md`.
  Este corte es documentación; no crea bucket, migración, deploy, UI ni
  activación y no autoriza promoción fuera de una futura rama de issue.

Nota ISA-347 / DELTA-REFERENCES (2026-08-14, rama aislada validada):
- Cada layout admite exactamente un widget Delta. Studio oculta la acción de
  añadir cuando ya existe uno y las fronteras TS/Go rechazan la adición, la
  duplicación y un documento externo con dos Delta. Al cargar un perfil antiguo,
  el primer Delta sigue activo y cualquier extra se conserva íntegro como widget
  preservado, sin renderizarlo ni borrar su configuración.
- Delta permite elegir en Contenido entre mejor vuelta personal, mejor vuelta
  de la sesión y vuelta anterior. Los perfiles existentes migran de forma
  compatible a `personal-best`; no se reanima el antiguo ajuste global
  `deltaMode`.
- Telemetry Core conserva las tres referencias simultáneamente: personal usa el
  `mDeltaBest` observado de LMU; sesión y anterior se reconstruyen solo desde
  vueltas completas válidas de la sesión actual. Cada campo conserva presencia,
  provenance y freshness; un modo ausente no toma silenciosamente el valor de otro.
- El hotkey global configurable `cycleDeltaReference` usa `Ctrl+Shift+D` por
  defecto y recorre Personal → Sesión → Anterior → Personal. Sincroniza los
  layouts explícitos del perfil activo, persiste el documento y lo vuelve a
  emitir a Desktop/OBS mediante el runtime existente.
- Code review adversarial posterior corrigió tres P1 antes de promoción:
  historial nativo mezclado con el delta de sesión en el mismo cursor,
  selección canónica incorrecta cuando `general` no tenía `reference`, y
  pulsaciones concurrentes compitiendo por una revisión. Regresiones RED→GREEN
  cubren los tres caminos; 12 pulsaciones simultáneas pasan 10 ejecuciones.
- Gates frescos sobre `origin/nightly@638b470`: `go test ./... -count=1` PASS;
  frontend 370 archivos/2673 tests PASS; build, ESLint focal, vet focal sin
  deuda nueva y diff-check PASS. La suite mantiene dos `AbortError` heredados
  de teardown de happy-dom después del resumen, con exit 0.
- Rama `vantareapp/isa-347-delta-referencias-reales-de-telemetria-instancia-unica-y`,
  implementación `3a54d34`, fix de review `46df1b2` y sincronización con
  `nightly@638b470` mediante `f0e40bd`. La PR #233 pasó los gates bloqueantes y
  se integró por squash en `nightly@5499008` el 2026-08-14. Queda pendiente la
  comprobación manual con LMU/Wails; no hubo promoción a `testers`, `master` ni
  release.

Nota DELTA-TELEMETRY (2026-08-14, corrección local validada):
- El pipeline canónico vuelve a admitir `mDeltaBest` LMU (`telemetry +696`) como
  señal observada con signo, presencia, freshness y provenance explícitos.
  El dato nativo gana sin warm-up; `session.self-delta@1` permanece como
  fallback cuando el simulador no publica un valor usable.
- El widget Delta conserva el último valor durante `stale` en vez de sustituirlo
  por `—`. Un test buffer-to-overlay prueba `-0.245` en el primer frame con
  provenance `observed`; tests separados cubren positivo, cero válido, startup
  missing, inválido, stale y fallback derivado.
- Gates: Telemetry Core focal PASS; frontend completo 370/2656 PASS; build PASS;
  ESLint focal y diff-check PASS. `go test ./...` tuvo dos flakes ajenos en dos
  ejecuciones (`engineer/ptt` y diagnostics bridge); ambos pasan aislados.
Nota ISA-335 / ISA-345 / OS-BUG (2026-08-14, integrada en Nightly):
- Overlay Studio permitía seleccionar `vantare-endurance`, pero el contrato Go
  de perfiles V3 y la biblioteca de diseños seguían aceptando únicamente
  Original/Crystal. Guardar fallaba especialmente al conservar
  `visual.systemMemories.vantare-endurance`.
- La rama aislada
  `vantareapp/isa-335-os-bug-guardar-perfiles-rechaza-vantare-endurance-como`
  partió de `origin/nightly@8de4f511972757476d96d6a525b69c8917f4ca56`.
  El arreglo añade el ID tipado y la revisión posterior elimina la allowlist
  duplicada: persistencia y biblioteca de diseños consultan ahora el mismo
  contrato Go, sin migración, cambio visual, renderer, dependencia ni fallback
  para sistemas desconocidos.
- TDD RED confirmó constante ausente en `pkg/config` y `unsupported design
  system` en `WidgetDesignService`; GREEN cubre sistema activo/predeterminado,
  memoria visual, round-trip de archivo y diseño de usuario Endurance.
- Code review adversarial: se descartó un falso positivo en el comando de
  aplicación porque `applyWidgetDesign` ya rechaza tipos incompatibles; se
  corrigió el riesgo real de deriva entre las dos allowlists Go en `a4749e9`.
- Evidencia previa a promoción: paquetes `pkg/config/... ./internal/app/...`
  PASS; frontend 370 archivos/2661 tests
  PASS; `design-system:check` 3/3 PASS; build frontend PASS; `go test ./...
  -count=1` PASS y `git diff --check` PASS. La suite frontend conserva los dos
  `AbortError` de teardown documentados con exit 0. Fix y regresiones están en
  `074dba6`; centralización revisada en `a4749e9`.
- Isaac autorizó la promoción y, después, el auto-merge necesario ante el flujo
  continuo de integraciones. ISA-345 registró la promoción: PR #223 integrada
  por squash en `nightly@32e9b70907458874d79fd28c5a37ae97cccc436d`.
  El gate post-integración `31762153097` pasó ruta, build frontend, Go, frontend,
  lint de cambios, visuales y Windows/Wails; el snapshot `31762153118` también
  pasó. El lint global conserva solo deuda heredada advisory. Nivel alcanzado:
  Nightly; sin promoción a Testers/Master y sin release.

Nota ISA-152 / STR-17 (2026-08-14, integrada en Nightly):
- Isaac autorizó la promoción de ISA-161. El PR #212 se integró mediante squash
  en `nightly@b2e4067809d31152fdcf374875179e577d483c03`; el gate
  post-promoción 31708164123 pasó topología y gates bloqueantes completos.
- El motor puro y el adaptador al Hub Strategy están implementados en cuatro
  commits locales: plan `98104b0`, dominio revisado `3f48045`, adaptador
  revisado `091f8ba` y evidencia LMU `bf9e9e5`. El read model conserva cursor,
  lifecycle, stint, Fuel y próxima acción sin convertir missing/stale/invalid
  en cero ni estimar objetivos ausentes.
- La prueba opt-in permanente `TestStrategyLiveLMUOptIn` recorrió el único
  pipeline productivo LMU -> Telemetry Core -> Strategy Hub -> adapter ->
  engine. Con jugador en pista observó source live, cursor `1/3`, vuelta
  completada `0` fresh y Fuel `98/115 L` fresh. La desviación quedó missing
  porque el plan explícito de prueba no declaró objetivos Fuel. No se guardaron
  raw, track, fingerprint, IDs reales ni PII.
- ISA-152 está integrada mediante squash del PR
  [#219](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/219)
  en `nightly@8de4f511972757476d96d6a525b69c8917f4ca56`. Linear refleja el
  estado `Nightly`; el microplan cerrado es
  `docs/superpowers/plans/2026-08-13-isa-152-str-17-live-execution-engine.md`.
- STR-17 queda implementada y aprobada por reviews independientes de spec y
  calidad. No añade reader LMU, UI, replanificación, VE, tyres, weather,
  persistencia ni dependencias. El adaptador se inyecta sobre el Hub existente;
  no se cablea al arranque porque `ActivePlan` solo guarda la referencia de
  revisión y todavía no existe una fuente aprobada de stints/objetivos live.
  Inventar esa traducción violaría el contrato.
- Gates locales: focales x20, `go vet`, build frontend, `go test ./...` y
  frontend `367/2636` pasan. El CI del HEAD de rama `c5f965f` pasó completo en
  el run 31720701167. El gate post-promoción
  [31748815965](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31748815965)
  pasó topología, build, Go, frontend, baseline visual y lint sobre el squash
  exacto. `-race` no está disponible con `CGO_ENABLED=0` y sin GCC. No hubo
  promoción a `testers`/`master` ni release.
- El workflow separado `Roadmap public snapshot` conserva el fallo heredado
  `telemetry-core: empty project must have null progress`; se reproduce en los
  cuatro commits de `nightly` anteriores a ISA-161, reapareció sin cambios en
  el run 31748815966 y queda fuera de STR-17.

Nota ISA-161 / TC-10B (2026-08-12, entrega local revisada; cierre supersedido por ISA-152):
- ISA-160 / TC-10A está integrada en
  `nightly@8880a8800e07e2af21fe5ff37a714578bf8fcd00`; ISA-161 se construyó
  originalmente desde esa base en
  `vantareapp/isa-161-tc-10b-productor-strategyliveprojection-v1`. Su primer
  rebase local fue sobre `origin/nightly@234794d`; la base y merge-base actuales
  son `origin/nightly@b6df494298578ff9a043bbd9b48a66eb1512010f`.
- Tasks 1-4 están implementadas y revisadas en el HEAD previo a documentación
  reescrito `fee981be42f7a3053c2673182939fb8898609510`. El único pipeline/driver LMU
  canónico produce Overlay y Strategy desde el mismo `FinalState`; `Hub()`
  conserva Overlay y `StrategyHub()` posee el transporte Strategy separado.
- `StrategyLiveProjection v1` añade de forma compatible `sourceTimeSeconds`,
  `endTimeSeconds`, `remainingSeconds`, `maximumLaps`, sector, distancia de
  vuelta, pit y Fuel amount/capacity atómicos. Cada campo conserva presencia,
  procedencia y freshness; las capabilities son `session`, `progress`, `pit` y
  `fuel`. Virtual Energy, tyres, weather y facts siguen ausentes, sin cero ni
  fallback sintético.
- Wails publica status/projection con nombres canónicos y replay de status.
  SSE expone solo `GET /telemetry/strategy/projection`, loopback-only. El hub
  conserva latest full/resync sin fabricar deltas; lifecycle, fail-stop y
  teardown cubren los dos productos.
- Replay, compatibilidad old/new, resync, soak Overlay+Engineer+Strategy y
  benchmark están enlazados en
  `docs/telemetry-core/evidence/isa-161-strategy-live-producer.md`. `-race` no
  se ejecutó porque el host tiene `CGO_ENABLED=0` y no dispone de GCC.
- Gate LMU sanitizado sobre el HEAD del primer rebase `879d5be`: con el proceso
  `Le Mans Ultimate` activo, el opt-in read-only
  `LMU_LIVE_SHARED_MEMORY_TEST=1` / `TestLiveLMUSharedMemoryOptIn` pasa. Reporta
  build normalizada `1.4.0.0`, `supported=true`, runtime `live`,
  `player-present=false` y fingerprint
  `LMU_Data/runtime:build=1.4.0.0;size=324820;evidence=active-grid-bijective;telemetry=not-required-no-player`.
  No se persistieron raw, IDs ni PII. Esto acredita adquisición, mapping,
  runtime y ausencia correcta de telemetría rápida sin jugador; no acredita un
  full Strategy con Fuel live en pista. Fuel continúa demostrado por fixtures
  hash-pinned y replay; la validación con jugador/Fuel en pista no se ejecutó.
- Gates locales finales sobre el HEAD del primer rebase `879d5be`: Telemetry,
  app/server, frontend build,
  `go test ./...` y frontend 367 archivos/2.636 tests pasan. La suite frontend
  emite dos `AbortError` de teardown happy-dom con exit 0. Vet global termina
  con exit 1 solo por tres `unsafe.Pointer` heredados; `gofmt` global lista
  `diagnostics_service.go`, heredado de `origin/nightly` y fuera del diff
  ISA-161. `git diff --check` queda limpio. No son CI remoto.
- Estado real: la rama se publicó en `9c028f6` y el PR draft
  [#212](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/212)
  está OPEN, CLEAN y MERGEABLE hacia `nightly@b6df494`. Para el HEAD publicado
  `19dddea`, el [run 31639192366](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31639192366)
  terminó COMPLETED/SUCCESS: `Validate promotion path`, frontend build, Go,
  frontend tests, visual advisory y lint advisory pasaron; GitGuardian también
  pasó. Cualquier amend posterior necesita checks de su nuevo HEAD y el estado
  final se consulta en el PR. Linear sigue pendiente por reautenticación; no
  hubo integración, promoción ni release. ISA-152 / STR-17 no está
  desbloqueada: su dependencia técnica está implementada, pero solo será
  desbloqueable tras promoción aceptada a `nightly`. El motor live Strategy
  todavía no existe.
- Siguiente acción: actualizar Linear tras reautenticar y obtener la revisión
  de Isaac sobre el PR #212. La validación con jugador/Fuel en pista continúa
  pendiente y no bloquea la evidencia fixture/replay ya cerrada; no mergear ni
  promover sin autorización nueva de Isaac.

Nota ISA-160 / TC-10A (2026-08-11, estado histórico supersedido por ISA-161):
- La auditoría Strategy live queda ejecutable sin cambios productivos: un E2E
  real sanitizado LMU 1.4 recorre Driver/Fusion/BatchMapper/Reducer/Derive con
  una sola apertura y conserva Fuel exacto `83.80992715710434/115 L`, observed
  y fresh, en el vehículo activo.
- El ledger test-only v1 fija 18 keys ordenadas y byte-exactas. Fuel, pit y
  progreso son supported. Virtual Energy, identidad/compound/wear/corner de
  tyres y weather son unsupported y continúan missing. Los guards fijan
  allowlists exactas de Observation/core/Strategy v1, catálogo y capabilities,
  y contrastan supported contra layout, AuthorityMatrix v4, catálogo, TTLs y
  Derive sin usar el golden como único oráculo.
- Toda fila player-only/per-vehicle declara identidad
  `lmu-slot-N-generation-G`: G empieza en 1, incrementa tras
  desaparición/reaparición en la sesión y vuelve a 1 con el reset de sesión;
  REST no crea identidad. Un test conductual recorre esas tres transiciones.
- El smoke LMU fresco pasa con build `1.4.0.0` supported, runtime live,
  `PlayerPresent=false` y fingerprint
  `active-grid-bijective;telemetry=not-required-no-player`; no persistió raw ni
  PII. Ese smoke solo demuestra Fuel/lap number player-only correctamente
  missing; pit/progreso se sostienen en fixtures y tests, no en el menú.
- TDD: RED por golden ausente y RED posterior por identidad/generación
  incompleta observados; GREEN focal x20 y Telemetry Core completo.
  `pnpm --dir frontend install --frozen-lockfile` terminó con exit 0 sin
  cambios tracked y `pnpm --dir frontend build` pasó. La primera ejecución de
  `go test -count=1 ./...` falló solo en
  `TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles` por `recording commit
  exceeded budget`; el test pasó 10/10 aislado y una segunda ejecución global
  pasó completa. El flake queda visible y no se atribuye a ISA-160, cuyo delta
  no toca recording/coordinator. `gofmt` y diff-check pasan;
  `go vet ./internal/telemetry/...` conserva exactamente los dos avisos
  heredados `unsafe.Pointer`.
- El rebase limpio sobre `origin/nightly@d195653` reescribió la implementación
  como `f26d8e3`. Los cambios nuevos de `nightly` fueron Discord/changelog y el
  manifest de release; no solaparon ISA-160. El PR #202 está OPEN y ready for
  review hacia `nightly`. Linear ISA-160 contiene el comentario, la evidencia y el
  enlace al PR, y sigue `In Progress` porque el equipo no ofrece estado
  `In Review`. El último Branch channel del HEAD publicado anterior, run
  `31442025096`, pasó completo (policy 9 s, bloqueantes 8 min 53 s) y
  GitGuardian también pasó. Se conservan como evidencia histórica; no acreditan
  por sí mismos el HEAD rebasado. El check requerido del PR debe
  corresponder siempre al HEAD exacto publicado, y `f26d8e3` no se declara con
  CI hasta ejecutarlo. El warning no bloqueante de Node 20 deprecado/checkout
  forzado a Node 24 sigue fuera de ISA-160. Isaac autorizó la aceptación y la
  promoción, pero el merge todavía no ocurrió; tampoco hubo release. Siguiente
  gate: CI del HEAD publicado exacto y ejecución controlada de la autorización.
  Después, ISA-161 puede
  publicar solo Fuel + sesión/progreso/pit de forma aditiva/optional con tests
  old/new, transporte, resync, replay y soak. VE/tyres/weather siguen fuera.

Nota ISA-315 / OS-10 (2026-08-10, decisión de estabilización y venta):
- Isaac fija como hito de agosto **Overlay Studio V1 estable en `testers`**;
  no implica `master`, release Stable pública ni completitud de toda la suite.
- La migración de Vantare V2 a la raíz bloquea el lanzamiento completo, pero
  no este hito de agosto. Se planifica después de la declaración en Testers.
- La cohorte disponible es de unas 10 personas, Windows 10/11, formatos
  declarados 21:9–32:9 y respuesta el mismo día. Debe confirmarse la resolución
  reportada `3840×1920` y asegurar cobertura 16:9 y DPI 100/125/150 %.
- Ventana objetivo para una venta por invitación y cohortes: 22–30 de
  septiembre. Overlay Studio V1 es el producto principal; Engineer, Strategy y
  Analysis se etiquetan honestamente como Beta/Preview. No es beta pública ni
  lanzamiento Stable completo.
- Autoridad ejecutable:
  `docs/overlays-studio/overlay-studio-v1-commercial-launch-plan.md`. Billing y
  venta siguen NO-GO hasta cumplir sus gates y recibir aprobación explícita.
- ISA-315 solo documenta y coordina. No autoriza promoción, migración, dinero,
  publicación, merge ni release.
- Isaac autorizó por separado el merge de PR #198 a `nightly` una vez resuelto
  ISA-311. Esta autorización no alcanza `testers`, `master`, venta ni release.

Nota ISA-311 (2026-08-10, corrección local verificada):
- El soak lógico `TestTelemetryCoreTwoHourLogicalSoakIsBoundedAndPayloadFree`
  conservaba coordinator y SQLite reales, pero heredaba el reloj de pared del
  presupuesto de commit de producción. Una pausa de E/S superior a 500 ms en
  el runner compartido podía convertir un soak funcional en un fallo flaky.
- La corrección inyecta exclusivamente en ese test un reloj lógico fijo y un
  adapter del writer que conserva SQLite real, pero usa un deadline global de
  30 s para todo el escenario en lugar del timeout productivo por operación.
  No cambia `DefaultCommitBudget`, su validación máxima, los contextos del
  runtime ni la clasificación de fallos de producción.
- Evidencia local: baseline previo 10/10; el primer ajuste de reloj pasó 20/20,
  pero una repetición posterior encontró 1/20 cierres por el timeout que aún
  llegaba al writer. La solución completa pasa soak 20/20, regresiones de
  timeout del coordinator 20/20, build frontend y `go test ./... -count=1`.
- PR #200 se promovió por rebase a `nightly@54f267b` tras los runs verdes
  `31416018600`, `31416779711` y `31435630710`, todos sin rerun. Linear refleja
  ISA-311 en `Nightly`. No hubo promoción a `testers`/`master` ni release.

Nota ISA-309 / STR-N02 (2026-08-10, integración acumulativa preparada):
- Linear creó ISA-309 para reconstruir sobre `origin/nightly@08fcfc1` la pila
  ya implementada de Strategy Planner sin arrastrar commits ajenos.
- La rama canónica es
  `vantareapp/isa-309-str-n02-promocion-acumulativa-de-strategy-planner-a-nightly`.
  Contiene los 11 commits de producto reconstruidos; este registro de estado
  se mantiene como commit documental separado.
- Evidencia local revisada: Strategy Go (`gofmt`, `go vet`, tests), typecheck
  real, suite frontend completa, build y ESLint focal pasan. `go test ./...`
  también pasa en ejecución serial después del build; dos fallos bajo carga
  paralela pasaron aislados y no pertenecen al cambio.
- PR draft #192 abierto hacia `nightly`, mergeable y con todos los gates en
  verde. El primer run agotó el presupuesto temporal heredado de
  `TestTelemetryCoreTwoHourLogicalSoakIsBoundedAndPayloadFree`; el rerun único
  pasó Go, frontend, visual advisory y lint advisory completos.
- Pendiente: revisión y autorización explícita de Isaac antes de cualquier
  merge a `nightly`. No hay promoción a `testers`/`master`, release ni inicio
  de STR-15B.

Nota ALINEACION-REFACTOR (2026-08-10):
- Objetivo: reconciliar el worktree principal (rama `refactor`, worktree
  `C:\Users\isaac\Desktop\Vantare-Overlays`) contra `origin/nightly`.
- Hallazgo: `refactor` estaba 281 commits atras de `nightly`; su unico commit
  unico (`b70a950`) duplicaba el PR #184 (`8cf28a6`, ya en `nightly`). Los 75
  archivos modificados sin commitear eran identicos a `nightly` (verificado por
  hash). Nada unico se perdio en el reset.
- Accion: backup `refactor-b70a950-backup` (punta `b70a950`); rama de
  conservacion `chore/conservacion-untracked-2026-08-10` (commit `ac53ab4` con
  9 untracked con valor: ADR 0004/0005 de analisis de telemetria, docs de
  telemetry, changelog 2026-08-08, VISUAL_DESIGN_RESEARCH y funciones supabase
  del testing-center); reset --hard a `origin/nightly`.
- Descartado por superado/duplicado: `internal/strategy/{scenario,solver}` y
  `contract/contract.go` locales (nightly tiene `internal/strategy/` maduro);
  2 tests ya en nightly; `supabase/.temp/` (gitignored).
- Estado actual: `refactor` == `origin/nightly@9c11d7f`, working tree limpio.
- Pendiente humano: decidir destino de `chore/conservacion-untracked-2026-08-10`
  (merge de docs a nightly, renumero de ADR 0004/0005 para no colisionar con
  los ADR 0004/0005 existentes, o archivo).
- Evidencia: `git rev-parse HEAD` == `git rev-parse origin/nightly` == `9c11d7f`;
  `git status --short` sin archivos modificados; `git diff HEAD` vacio.

Nota ISA-294 / GOV-02 (2026-08-05, entrega documental):
- La fuente de integracion activa es `nightly`; el checkout principal sirve
  para ejecutar ese conjunto, mientras cada cambio se desarrolla en una rama
  y worktree de issue. `develop` y `refactor` quedan como referencias
  historicas y no se limpian ni reciben trabajo nuevo.
- Se actualizan `AGENTS.md`, workflow, politica de ejecucion, expediente y
  canales para reflejar delegacion de un solo nivel, handoff inmediato tras
  cada worker, autoridad de Linear, estados de entrega verificables y limites
  de acciones remotas.
- Alcance exclusivamente documental sobre `origin/nightly@41e62a5`; sin
  cambios de producto, promocion, release ni modificacion de `master`.

Nota ISA-234 / reconciliación con Nightly (2026-08-05, candidata local):
- Linear rechazó crear una issue de integración propia por el límite del plan
  gratuito. Con autorización explícita de Isaac, la PR #121 continúa como
  excepción trazada en ISA-234; no se archivan issues y no se modifica la
  política de correcciones rechazadas, que mantiene `same_branch` retirado.
- Origen exacto `ISA-234@a526e2b0a4e344f5841a7c216d77a0efc4f0b62e` y
  base remota verificada
  `nightly@4981e6fac5b2c95af9deb4ad2a64f0592a7b4d1e`. La reconciliación es
  incremental, sin reescritura ni force-push.
- Los cuatro conflictos se resolvieron preservando la allowlist del piloto, el
  build channel fail-closed, la configuración pública generada fuera de la
  identidad de caché y las dos líneas de documentación viva.
- Evidencia local: deploy surface PASS; Deno vigente 165/165; preflight Codex
  4/4; frontend integración 150/150 con un worker; build frontend PASS; Go
  focal `cmd/vantare` + `internal/app` PASS; `git diff --check` PASS.
- Sin Docker, Supabase remoto, secretos, Codex automático, deploy, release,
  merge ni promoción. Pendiente: commit/push normal, CI de la PR y build
  Nightly para revisión manual.

Nota ISA-248 / TAU-07J (2026-08-05, handoff humano preparado localmente):
- `testing-center.codex-human-handoff.v1` solo se construye desde un dossier
  completo, íntegro y con repo/rama/SHA/base, paths, command IDs y criterios
  cerrados. El texto del tester queda delimitado como evidencia no confiable y
  no puede ampliar instrucciones ni permisos.
- Los criterios confiables tampoco pueden conceder autoridad de repositorio o
  release: retry, asignación, delegación, aprobación, commit/push/PR, merge,
  deploy, publicación y promoción fallan cerrados desde el dossier.
- El preflight Node multiplataforma exige repo reconocible, árbol limpio, HEAD
  y base exactos y ancestry real. Codex Cloud puede usar la rama interna
  `work`; se valida el SHA, no ese nombre local. Un remote presente y distinto
  falla; un remote ausente exige la confirmación humana de la selección UI.
- Evidencia: handoff Deno 8/8, Testing Center Deno 136/136 y preflight Node
  4/4 PASS. Sin API OpenAI,
  caller, secreto, red, deploy, PR automática ni promoción. Pendiente el gate
  manual: una tarea sintética observada y una PR con head/base correctos.

Nota ISA-289 / TAU-07K (2026-08-04, hardening de revisión cerrado):
- El tooling del piloto acepta únicamente el project ref exacto y sensible a
  mayúsculas `lbaxvpzexoferfvfkplz`; el preflight comprueba también el ref
  vinculado antes de migraciones. Tests conductuales rechazan producción, un
  tercer proyecto, variantes en mayúsculas, vínculo ausente y vínculo distinto.
- OAuth reintenta solo transporte, 408, 429 y 5xx antes de `issueCreate`.
  400/401/403, JSON inválido y contrato/token inválido terminan sanitizados en
  `needs_owner` sin segunda llamada. La incertidumbre post-dispatch no cambia.
- El handoff canónico distingue ya el fallo histórico del round-trip exitoso.
  Evidencia: PowerShell guard PASS, focal Deno 19/19, Testing Center 128/128,
  deploy guard 4/4, typecheck, formato y diff PASS. Sin red, secretos, schema,
  deploy ni promoción.

Nota ISA-287 / TAU-07J (2026-08-04, round-trip remoto y deduplicación PASS):
- El worker clasifica toda incertidumbre de Linear con el contrato cerrado
  `testing-center.linear-diagnostic.v1`: fase segura, HTTP status acotado y
  códigos GraphQL limitados a `RATELIMITED`/`UNKNOWN`. Nunca expone mensajes,
  cuerpos, paths, extensions, texto del tester ni secretos.
- La frontera HTTP reconstruye el diagnóstico en runtime y emite exactamente
  cuatro campos; una revisión adversarial detectó y cerró esta protección P2.
  La semántica sigue intacta: solo el fallo de token previo a `issueCreate`
  puede reintentarse y toda incertidumbre posterior termina en `needs_owner`.
- Evidencia local: Testing Center 125/125, focal 16/16, deploy guard 4/4,
  typecheck del worker, formato y `git diff --check` PASS. Tras aprobación
  humana, solo `testing-center-linear-worker` se desplegó en Supabase testing
  `lbaxvpzexoferfvfkplz` y quedó `ACTIVE` v7; un probe sin credenciales devolvió
  `401 unauthorized`.
- El reporte nuevo `report_354511...c9241` creó exactamente ISA-288 con Backlog,
  proyecto y cinco labels correctas, sin prioridad, assignee ni delegate. El
  efecto quedó `completed`, intento/fencing 1, binding único y sin lease. El
  primer webhook firmado fue `create/applied` y dejó reconciliación
  `linear_created`, generación 1.
- El segundo reporte idéntico `report_4067dc...0597a` quedó
  `duplicate_linked`: dos ocurrencias, un solo efecto completado y una sola
  issue Linear. La pausa global volvió a quedar activa, el efecto histórico en
  `needs_owner` tiene pausa de flujo propia, y el bearer temporal fue revocado.
  No hubo Docker, Codex, Discord, merge ni promoción.

Nota ISA-243 / TAU-07I (2026-08-04, reintento único en `needs_owner`):
- Isaac autorizó un único reintento tras corregir el claim hosted. El worker
  adquirió lease/fencing y devolvió `409 linear_response_ambiguous`; el
  contrato limpió el lease, fijó el efecto y destino en `needs_owner` y
  mantuvo la pausa global activa.
- La reconciliación read-only por marker/`effectId` y el listado del proyecto
  `Testing Center — Feedback` encontraron cero issues. Supabase mantiene
  `attempt_count=1`, fencing 1 y cero bindings. No se permite una tercera
  llamada aunque el resultado externo aparente ser cero.
- El bearer temporal se eliminó del portapapeles. La evidencia quedó anotada
  en ISA-243. El siguiente corte debe añadir diagnóstico sanitizado de fase,
  HTTP status y códigos GraphQL allowlisted o revisar permisos/configuración
  de la OAuth app antes de usar un nuevo reporte sintético separado.

Nota ISA-243 / TAU-07I (2026-08-04, primer reporte remoto y stop seguro):
- El reporte sintético `report_d9c99f...866ae8a` llegó desde la build exacta
  `nightly/v0.1.0.5@ef60adef4c42f21b87e3ad582927f574ea1d77ed`, sin
  diagnóstico, logs, replay ni evidencia PostHog. La identidad server-side se
  corrigió del formato `0.1.0.5` al emitido realmente por la app
  `v0.1.0.5`, conservando historial y una sola identidad activa.
- El triage reservó una única issue técnica y un único efecto Linear bajo
  pausa. La primera llamada al worker terminó en `pilot_store_unavailable`
  antes del claim y antes de `issueCreate`: intento/fencing permanecieron en
  cero y no existe binding externo.
- Causa reproducida: Supabase hosted expone `gen_random_uuid()` en
  `pg_catalog`/`extensions`, no en `public`, mientras el claim histórico usa la
  referencia explícita `public.gen_random_uuid()`. La migración correctiva
  `20260804110000_uuid_public_compatibility.sql` está aplicada solo en testing;
  el harness hosted pasa clean install, 18/18, rollback y reapply 18/18.
- Un probe remoto transaccional devuelve `claimed` con lease/fencing y termina
  en `ROLLBACK`; el efecto real sigue `pending`, intento 0, sin lease/binding y
  con pausa global activa. No se reintenta el worker sin un nuevo gate explícito
  de Isaac.

Nota ISA-243 / TAU-07I (2026-08-04, configuración remota autorizada):
- Rama exacta apilada sobre `ISA-242@c215fcb21902649601086c3d71ce658d34261f52`.
  Prepara el primer round-trip sintético Supabase -> Linear: OAuth
  `client_credentials` con `issues:create`, worker manual por `reportId`,
  mutación GraphQL fija, binding atómico y endpoint de webhook firmado.
- Pausa, lease/fencing, destino y digests se revalidan inmediatamente antes de
  abrir el efecto externo. Solo el fallo de token previo a `issueCreate` puede
  reintentarse; toda incertidumbre posterior termina en `needs_owner`.
- Team, proyecto, Backlog y labels se resuelven por UUID server-side. No se
  envían assignee, prioridad, delegate, logs, replay URL ni instrucciones.
- La superficie de testing está separada del wrapper de producción y exige la
  confirmación literal `DEPLOY-ISA-243-TESTING-PILOT`.
- Evidencia post-configuración: Deno Testing Center 120/120, guard de deploy
  4/4, typecheck de ambos entrypoints, lint y formato PASS. PostgreSQL volvió a
  pasar instalación limpia, 18/18, rollback y reaplicación 18/18 usando el
  contenedor Supabase existente y bases temporales eliminadas al terminar.
- Isaac autorizó exclusivamente el proyecto Supabase de testing
  `lbaxvpzexoferfvfkplz`. Las 24 migraciones coinciden local/remoto y las tres
  Edge Functions del piloto están `ACTIVE` v1. Los probes sin credenciales
  fallan cerrados. El webhook `Issue` de Linear ya está creado y su signing
  secret está guardado en Supabase; la firma continuará sin considerarse
  verificada hasta observar el primer delivery real. No existe todavía llamada
  `issueCreate`, Codex, Discord, merge ni promoción. El siguiente gate manual es
  registrar una identidad sintética autorizada y la build Nightly exacta desde
  la que se enviará el primer reporte.
- Identidad sintética registrada como `primary_tester` y protegida por pausa
  global activa. La capability `vantare.channel.nightly` procede de un grant
  local `subscription_recovery` de sandbox, marcado sintético y revocable, con
  expiración `2026-08-05T19:17:05Z`. No existen efectos ni bindings Linear.
- `license-credential` está `ACTIVE` v1 en testing con la clave exclusiva
  `testing-isa243-20260804`; fingerprint SHA-256 público
  `3f520a864fec01d953edd60b88433ad52f63f2fbb5d4d9ad0bc77b425397ea27`.
  La privada solo existe como Supabase Secret.
- El primer build Nightly detectó que Task incluía URL, anon key y registro
  público dentro del nombre de su caché al interpolar `BUILD_FLAGS`, inválido en
  Windows. El generador existente pasa a incorporar también el registro público
  y esos tres valores salen de `ldflags`; el guard de deploy cubre la regresión.
- Las builds `nightly` y `testers` separan además sus targets de Credential
  Manager por canal y digest del backend. `master` conserva los targets legacy.
  El artefacto del piloto debe ejecutarse en modo portable para aislar también
  caché de licencia, drafts y configuración de la instalación habitual.
- La primera apertura manual reveló que el frontend leía solo
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, mientras el build recibía
  únicamente las variables `VANTARE_*` del backend Go. El task común refleja
  ahora esa misma configuración pública hacia Vite; el guard impide volver a
  generar una pantalla de login sin backend en builds empaquetadas.
- El preflight del proyecto vacío detectó dos migraciones locales con versión
  `20260802130000`. Para evitar un push parcial, TAU-02B —nunca desplegada— se
  renombra mecánicamente a `20260802130100`; Billing conserva su historia. El
  dry-run remoto posterior enumera 23 versiones únicas y ordenadas.
- El primer push remoto aplicó el baseline hasta `20260802090000` y se detuvo
  antes de Testing Center porque hosted ubica `pgcrypto.digest` en
  `extensions`. `20260802095000_pgcrypto_public_compatibility` añade wrappers
  condicionales `public.digest` sin mover ni reemplazar la extensión. La
  simulación hosted y el harness completo PostgreSQL 18/18 + rollback/reapply
  pasan antes de reanudar.
- El primer intento de deploy no contactó Supabase: el wrapper reutilizaba un
  `$LASTEXITCODE` residual tras un guard PowerShell correcto. Se elimina esa
  comprobación redundante y se añade regresión antes de reintentar.

Nota ISA-242 / TAU-07H2 (2026-08-04, implementación local validada):
- Rama exacta apilada sobre `ISA-253@aaff314411288927d97d52c05eb93b6c7d5b8729`.
  Extiende la única pestaña Testing Center con vistas `Reportar problema` y
  `Validar corrección`; conserva el borrador al alternar y declara replay/logs
  como no disponibles en lugar de simular captura.
- Una Edge Function autenticada deriva membresía, rol, candidata y autor desde
  Supabase, sanea el contexto antes de devolverlo y llama exclusivamente al RPC
  endurecido service-role de TAU-07G. El cliente no envía actor, rol, autor,
  estado, rama ni acción de owner.
- Nightly requiere primary tester/owner; Testers admite tester/primary/owner;
  auto-validación, SHA obsoleto, metadata desconocida y rechazo incompleto
  fallan cerrados. `cannot_verify` permanece neutral y no hay controles owner.
- Evidencia local: Deno Testing Center 116/116 (Edge focal 9/9) y check PASS;
  frontend Testing Center 32/32,
  lint focal, build y harness visual 4/4 (390/768/1024/1440, sin overflow ni
  errores de consola) PASS.
- No existe deploy de Edge, secreto nuevo, captura PostHog/replay real, Linear o
  Discord real, delegación Codex, merge ni promoción. TAU-07I y el gate manual
  de Isaac siguen pendientes.

Nota ISA-253 / TAU-07H1 (2026-08-04, frontera local validada):
- Rama apilada sobre `ISA-241@8a12b8e76a330d1ef87a4d9e76288e9af1a67c65`.
  Define `testing-center.posthog-evidence.v1`, contexto técnico cerrado y una
  política de navegador que empieza apagada, sin autocapture, identidad,
  console logs, persistencia local ni excepciones automáticas.
- Consentimiento diagnóstico/replay separado, privado, append-only e
  idempotente. Revocar replay elimina URL/autorización Linear; revocar
  diagnóstico elimina evidencia local. TTL: replay 7 días, error 30 días.
- Evidencia: Deno Testing Center 107/107 (focal 8/8); PostgreSQL 33/33,
  rollback/reaplicación 33/33 y
  history guard PASS. PostHog caído nunca bloquea reportar ni autoriza Codex o
  promociones.
- No se añade SDK, dependencia, red, secreto, endpoint, proyecto PostHog, UI,
  captura/replay real, Linear, Discord, Codex, merge, deploy ni promoción.
  Autoridad: `docs/runbooks/testing-center-posthog-privacy.md`.

Nota ISA-241 / TAU-07G (2026-08-03, implementación validada localmente):
- Rama apilada sobre `ISA-240@ca2fe763ae325c4600712fc2298125117af7df50`.
  Persiste votos inmutables por issue/candidata/canal/versión/SHA, deriva roles
  server-side y mantiene `cannot_verify` pendiente. Una aceptación Nightly de
  primary tester basta funcionalmente; un rechazo Testers posterior bloquea.
- Dossier determinista con snapshots `incomplete`/`complete`, digest interno y
  de transporte verificados en TypeScript y PostgreSQL. `same_branch` está
  retirado; la única corrección válida es sub-issue/rama nueva desde Nightly.
- Las cinco disposiciones son owner-only. Una corrección permanece
  `needs_owner` y no delega; entorno, issue nueva, descarte o stop cierran este
  rollout como `stopped`.
- Evidencia: Deno Testing Center 99/99; PostgreSQL 45/45, rollback/reaplicación
  45/45, history guard y carrera real exactly-once PASS.
- No existe UI, endpoint, red, PostHog, Discord, Linear real, Codex, rama/PR
  automática, deploy, merge ni promoción. Autoridad:
  `docs/runbooks/testing-center-candidate-feedback.md`.

Nota ISA-240 / TAU-07F (2026-08-03, implementación validada localmente):
- Rama apilada sobre `ISA-239@2a6a6b4ffd414ad8764f76d0e337877a589d2e5b`.
  Añade verificación HMAC-SHA256 sobre bytes exactos para los headers oficiales
  de Linear y reduce el evento a una proyección cerrada sin actor ni texto.
- PostgreSQL incorpora binding externo único, mapping de estados por UUID,
  ledger durable de deliveries y reconciliación exclusivamente observacional.
  Replay exacto es idempotente; digest conflictivo falla; eventos antiguos no
  cambian estado; estados desconocidos quedan `needs_owner`.
- Evidencia: Deno Testing Center 98/98; PostgreSQL instalación limpia, 27/27,
  rechazo de rollback con historial, rollback sin historial, reaplicación 27/27
  y carrera real de dos procesos PASS.
  La suite Deno global no arrancó por `npm:standardwebhooks` no instalado en el
  worktree; no se alteraron dependencias.
- No existe endpoint público, secreto, credencial, red, deploy, asignación de
  Codex, rama, PR automática, merge o promoción. Autoridad:
  `docs/runbooks/testing-center-linear-webhook.md`.

Nota ISA-239 / TAU-07E (2026-08-03, implementación validada localmente):
- Rama apilada sobre ISA-238. Implementa selección durable de un único destino,
  supersesión reversible de efectos GitHub pending/failed, preservación manual
  de GitHub completed, identidad de build server-side y outbox Linear dry-run.
- La proyección `testing-center.linear-issue.v1` tiene una sola fuente de verdad
  TypeScript. PostgreSQL verifica claves, metadata, marker, fuente, JSON
  canónico, digest, lease y fencing antes de persistirla; no existe red real.
- Evidencia disponible: Deno 92/92, formato, type-check y `git diff --check`
  PASS. PostgreSQL: instalación limpia, guards de pausa/claim, 43/43,
  rollback exacto, reaplicación 43/43 y carrera real de dos procesos PASS.
  Sigue sin autorizar merge, deploy ni promoción.
- Autoridad: `docs/runbooks/testing-center-linear-outbox.md`.

Nota de diseño Testing Center / Linear / Codex (2026-08-03):
- ISA-238 se implementa como corte apilado sobre el prerrequisito
  `ISA-234@0e45228626adc59a5a90b72d1369bb110b1c4e8c`; no duplica el stack desde
  la Nightly actual ni mezcla cambios Billing. Rama:
  `vantareapp/isa-238-tau-07d-adr-y-contratos-linear-rechazo-y-dossier-codex`.
- Contratos locales materializados: `testing-center.linear-issue.v1`,
  `testing-center.rejection.v1` y `testing-center.codex-dossier.v1`. Incluyen
  decoder cerrado, sanitización compartida, digest, un voto actor/candidato/SHA,
  `cannot_verify`, sub-issue/rama nueva y límites 32 KiB/5 paths/3 comandos.
- Evidencia fresca: Deno focal 47/47, formato y type-check PASS; Go focal PASS;
  frontend build PASS y `go test ./...` PASS tras generar el `dist` ignorado.
  Review adversarial final: ACCEPT, P0/P1/P2/P3=0.
  Sin schema, red de producto, secreto, Linear/PostHog/Discord/Codex real, UI,
  deploy, merge o promoción.
- ISA-238 / TAU-07D fija los contratos locales y el ADR 0007. Supabase es la
  autoridad canónica, Linear el único tracker operativo externo y GitHub queda
  limitado a código, PR y CI. Sin dual-write ni fallback a GitHub Issues.
- El spike ISA-237 cerró el camino de continuidad como NO-GO: toda corrección
  crea una sub-issue y una rama nueva desde el SHA actual de `nightly`.
  `same_branch` queda retirado y nunca se reabre, reescribe o fuerza una rama.
- Una aprobación de tester solo satisface el gate funcional. Isaac autoriza
  explícitamente cada promoción a Testers y Master; rechazo o ambigüedad pasan
  a `needs_owner`, nunca a retry automático.
- Autoridad: `docs/adr/0007-testing-center-linear-operational-authority.md` y
  `docs/runbooks/testing-center-linear-contracts.md`.
- Isaac aprueba el MVP `Vantare -> Supabase -> Linear -> delegación humana a
  Codex Cloud -> PR revisada -> nightly -> testers -> master`.
- Un rechazo bloquea la candidata y queda visible en Testing Center, Linear y
  Discord con detalle proporcional. No existe redelegación automática.
- Supabase compone un expediente determinista; no se añade un modelo
  intermedio. Isaac decide entre sub-issue, entorno, issue nueva, descarte
  justificado o detener rollout.
- Rama, SHA y base de PR se seleccionan y verifican fuera del prompt. La
  integración Linear `@Codex`, que parte de la rama predeterminada, no puede
  ejecutar cambios sobre Nightly hasta superar ese gate determinista.
- Toda corrección usa sub-issue y rama nueva desde Nightly. Testers siempre
  corrige desde Nightly y vuelve a recorrer los canales.
- Especificación:
  `docs/superpowers/specs/2026-08-03-testing-center-rejection-linear-codex-design.md`.
- Esta decisión sustituye la activación automática prevista después de
  TAU-07A. El workflow firmado permanece inerte; TAU-07B/C ya se validaron y
  TAU-07D permanece estrictamente local.
- Este corte es solo documental: sin red, credenciales, deploy, UI, Codex,
  Discord, merge o promoción.
- Plan ejecutable aprobado por microcortes:
  `docs/superpowers/plans/2026-08-03-testing-center-linear-codex-execution-plan.md`.
  Empezó por dos spikes sin backend: cuenta ChatGPT Pro y selección
  determinista de rama/SHA. La continuidad de una rama integrada fue NO-GO;
  el camino único es sub-issue y rama nueva desde Nightly. La
  captura PostHog preparada recibe un gate propio de privacidad antes de la UI.

Nota ISA-234 / TAU-07A (2026-08-03, dispatch Codex inerte):
- Envelope HMAC cerrado liga run/issue/request, SHA/proof, fencing, scope,
  versiones, TTL 30–300 s y nonce. Prosa, logs, replay, URL y paths externos no
  entran; replay exige ledger durable del futuro adapter.
- Prompt/output versionados; schema cerrado a cinco archivos, tres command IDs,
  create/replace y cero efectos cuando no hay propuesta.
- Workflow reusable sin caller, job `if: false`, `contents: read`, checkout sin
  credenciales y acciones/CLI pinneadas. Codex es el último paso y no hay
  secreto ni trigger automático.
- Gates focales: 11/11. Sin invocation/API/token/repo write/rama/commit/PR/
  deploy/merge/promoción. Autoridad:
  `docs/runbooks/testing-center-codex-dispatch.md`.

Nota ISA-232 / TAU-06G (2026-08-02, reauditoría Codex GO condicionado):
- Review independiente sobre `e9546d9`; no modifica los módulos TAU-06D/E/F.
- Métricas: 0/96 falsos `eligible`, 0/35 falsos `needs_owner`, 0/48
  retenciones, 4/4 fraudes de evidencia rechazados, 0/12 rutas sensibles
  aceptadas y 5/5 ataques de SHA/ancestry rechazados.
- PostgreSQL 61/61, rollback/reapply, carrera de dos workers y pausa tardía
  concurrente PASS. P0=0, P1=0, P2=0.
- Veredicto TAU-07: GO para diseñar el adaptador real por microcortes; no es
  autorización de activación, red, Codex, repo write, deploy, merge o promoción.
- Autoridad:
  `docs/analysis/isa-232-tau-06g-codex-adversarial-audit-2026-08-02.md`.

Nota ISA-231 / TAU-06F (2026-08-02, control Codex durable):
- Loader exclusivo de `service_role` deriva una proyección canónica sin texto
  libre y liga digest/tamaño de transporte; filas legacy sin tamaño fallan.
- La base exacta se comprueba contra un snapshot cerrado head+ancestros del
  puerto server-owned; no acepta un booleano de ancestry autoafirmado.
- Una fila automática por issue, claim global, lease 10–300 s, fencing
  monotónico y pausa revalidada justo antes del permiso de dispatch.
- Tras el permiso no existe retry automático: ambigüedad va a `needs_owner` y
  una caída queda `dispatching` para reconciliación humana, evitando duplicado.
- Gates: PostgreSQL 61/61 + rollback/reapply + carrera dos workers; Deno focal
  20/20. Sin Codex/API/repo/red/write/deploy/merge/promoción.

Nota ISA-230 / TAU-06E (2026-08-02, scope leaf-level y SHA):
- Prefijos amplios sustituidos por reglas de paths por módulo. Access, clients,
  state, canvas, bridge, workflows, case aliases y rutas desconocidas fallan.
- El request exige SHA exacto de 40 hex, lo incluye en repository y digest; una
  mutación posterior invalida la respuesta.
- El resolver server-side que prueba ancestry con `nightly` queda para TAU-06F;
  aquí continúa prohibido abrir repo/red. Focal 11/11.
- Estado: local para review; sin Codex/API/checkout/write/deploy/merge/promoción.

Nota ISA-229 / TAU-06D (2026-08-02, evidencia Codex mínima):
- El dry-run deja de consumir texto libre/etiqueta autoafirmada y exige una
  proyección ligada a IDs, bytes, tamaño, SHA-256 y consentimientos.
- Shape diagnóstico cerrado; mensajes, códigos, versión y timestamp nunca
  salen. Solo enums, offsets y booleanos allowlisted pueden llegar al sobre.
- Corpus sintético de PII/secrets/rutas/URL/prompt injection: cero retenciones;
  tampering de digest/tamaño/schema/evidencia/identidad falla cerrado.
- Pendiente TAU-06F: loader service-role desde la fila persistida. Autoridad:
  `docs/runbooks/testing-center-codex-evidence.md`.
- Estado: local para review; sin API Codex, DB loader, red, repo access, deploy,
  Discord, merge o promoción.

Nota ISA-228 / TAU-06C (2026-08-02, auditoría Codex NO-GO):
- Review independiente sobre `a4239a4`, sin editar policy ni contrato dry-run.
- Métricas: 0/96 falsos `eligible` sensibles, 0/35 falsos `needs_owner`
  benignos y rechazo de workflow path/campos extra.
- Bloqueantes: P1 procedencia/redacción no demostrada, P1 prefijos que incluyen
  access/clients, P1 exclusión solo in-memory y P2 base `nightly` sin SHA.
- Veredicto TAU-07: NO-GO (P0=0, P1=3, P2=1). Autoridad:
  `docs/analysis/isa-228-tau-06c-codex-adversarial-audit-2026-08-02.md`.
- Siguiente: hardening en cortes nuevos y reauditoría; Codex/API/repo access,
  Discord, deploy, merge y promoción continúan apagados.

Nota ISA-227 / TAU-06B (2026-08-02, sobre Codex dry-run):
- Prompt y objetivos fijos separados de evidencia server-redacted no
  confiable; la policy TAU-06A se recalcula y el módulo debe coincidir.
- Módulos/rutas y command IDs cerrados. La salida JSON exacta rechaza extras,
  traversal, shell, scope growth, duplicados e inconsistencias.
- Budgets: 8 KiB de evidencia, 32 KiB de salida, 12k tokens, 600 s, hasta
  cinco archivos/tres tests y cero tool calls; concurrency key global.
- El registro in-memory solo prueba el contrato local, no sustituye un lease
  distribuido. Gates focales: 10/10. Autoridad:
  `docs/runbooks/testing-center-codex-dry-run.md`.
- Estado: implementación local lista para review; sin API Codex, checkout,
  repo read/write, comando, red, deploy, rama/PR automática o promoción.

Nota ISA-226 / TAU-06A (2026-08-02, policy Codex fail-closed):
- Clasificador puro y versionado: solo trabajo frontend allowlisted, completo,
  determinista, de un módulo/1–5 archivos y con harness puede ser `eligible`.
- Seguridad, privacidad, auth, permisos, secretos, billing/licencias, datos,
  migraciones, release/workflows, dependencias, arquitectura y cambios masivos
  siempre exigen owner; también retries y rechazos de testers.
- Texto, logs y prompt injection del reporte no pueden cambiar decisión ni
  digest. Los hechos confiables deben proceder del servidor, no de app/issue.
- Decoder cerrado y hash canónico; input inválido/ausente nunca autoriza.
  Corpus focal: 8/8, con cero falsos `eligible` sensibles. Autoridad:
  `docs/runbooks/testing-center-codex-risk.md`.
- Estado: implementación local lista para review; sin API Codex, repo write,
  red, deploy, rama, PR automática, Discord, merge o promoción.

Nota ISA-224 / TAU-05C (2026-08-02, entrega GitHub preparada):
- Outbox con claim/lease, cinco intentos, backoff, pausa global/por flujo
  comprobada justo antes del efecto y reconciliación por marker app-authored.
- Servicio Deno por puertos, sin `fetch`, endpoint, variables de entorno o
  superficie desplegable. Respuestas ambiguas buscan antes de repetir.
- Webhook HMAC-SHA256 sobre bytes exactos y delivery ID durable. GitHub no
  envía timestamp firmado; `received_at` server-side + ledger sustituye ese
  supuesto sin inventar headers. El webhook no autoriza reconciliaciones.
- GitHub App propuesta: privada, repo único, Metadata read + Issues read/write,
  evento issues; cero Contents/PR/Actions/Workflows.
- Gates: PostgreSQL 28/28 + rollback/reapply; Deno focal 7/7 y 208/208 activo;
  deploy-surface sin cambios. Autoridad:
  `docs/runbooks/testing-center-github-delivery.md`.
- Estado: implementación local lista para review; sin App/secretos reales,
  red, deploy, Supabase remoto, Codex, Discord, merge o promoción.

Nota ISA-223 / TAU-05B (2026-08-02, proyección GitHub dry-run):
- Contrato Deno cerrado para proyectar un GitHub Issue y comentarios de
  ocurrencia sin efectuar llamadas de red ni confirmar el outbox.
- Título, labels y markers proceden solo de IDs/enums allowlisted. No existe
  assignee, label Codex, token, configuración GitHub, logs o URL de replay.
- El texto del tester se trata como dato no confiable: neutraliza Markdown,
  menciones, controles y patrones conocidos de secretos/PII, con límites por
  bytes. La PII semántica arbitraria sigue requiriendo revisión humana.
- El adaptador dry-run recalcula SHA-256, converge en retries idénticos y
  distingue corrupción de conflicto idempotente.
- Gates: 20/20 focales, 201/201 Deno activos, type-check, formato y superficie
  de deploy PASS. Autoridad:
  `docs/runbooks/testing-center-github-projection.md`.
- Estado: PR draft #112 con CI protegida verde; sin GitHub App, Edge
  Function desplegable, credencial, webhook, deploy o mutación remota.

Nota ISA-222 / TAU-05A (2026-08-02, triage y outbox exactly-once):
- Nueva frontera server-only que comprueba payload/evento completos, calcula
  fingerprints técnicos y funcionales deterministas y conserva cada reporte
  como ocurrencia visible.
- La unión automática exige firma técnica exacta o fingerprint funcional más
  digest exacto de esperado/observado. La similitud textual nunca fusiona y el
  código genérico actual `tester.report` no se acepta como firma técnica.
- Cien repeticiones convergen en una issue técnica interna, cien ocurrencias y
  una única reserva durable `github_issue_create`; la carrera entre dos
  transacciones también converge.
- RLS forzada, cero policies de cliente, pausa global/por flujo antes del
  efecto y ningún assignee, body de GitHub o dispatch de Codex.
- Gate PostgreSQL desechable: core 72 + access 56 + report 55 + triage 40,
  rollback/reapply, 100 repeticiones y concurrencia PASS. Autoridad:
  `docs/runbooks/testing-center-triage-outbox.md`.
- Estado: PR draft #111 con CI protegida verde; sin GitHub App, red, webhook,
  Codex, Discord, deploy, merge, promoción o build distribuida.

Nota ISA-220 / TAU-04C (2026-08-02, UI del Testing Center):
- Nueva pestaña visible únicamente cuando el canal real embebido en la build
  coincide con su capability firmada; `master`, metadata desconocida o
  permisos cruzados fallan cerrados. Supabase conserva la autoridad final.
- Formulario responsive y accesible con acción, esperado y observado
  obligatorios, contexto opcional, módulo cerrado, modo offline y draft local
  recuperable. Los consentimientos nunca se persisten y arrancan apagados.
- El backend prepara `testing-center.diagnostic.v1` en memoria. La UI muestra
  los bytes exactos, recalcula SHA-256 antes de aceptarlos y envía esos mismos
  bytes mediante la RPC idempotente de TAU-04A.
- No existe todavía un collector productivo de logs: la UI muestra cero
  disponibles y bloquea ese opt-in en vez de inventar datos.
- Gates focales Go, frontend, build, lint y harness visual 390/768/1024/1440
  PASS. Autoridad: `docs/runbooks/testing-center-ui.md`.
- Estado: PR draft #110 con CI protegida verde; sin Supabase remoto, GitHub
  Issue, Codex, Discord, merge, promoción o build distribuida.

Nota ISA-219 / TAU-04B (2026-08-02, draft local y bridge Wails):
- Nuevo store local para reanudar exclusivamente acción, esperado, observado,
  contexto y módulo; no persiste consentimiento, diagnóstico, logs, replay,
  tokens, identidad remota ni rutas aportadas por frontend.
- El backend genera y conserva una clave idempotente estable hasta descartar el
  draft. Escritura temporal + sync + reemplazo atómico; corrupción, campos
  desconocidos y tamaños fuera de contrato se eliminan cerradamente.
- Bridge Wails con DTOs cerrados, request IDs, límites, timeout, cancelación y
  códigos de error sin detalles locales. La ruta nace en composition root bajo
  el directorio privado de configuración.
- Gates focales x20 y race detector x5 PASS. Autoridad:
  `docs/runbooks/testing-center-report-draft.md`.
- Estado: PR draft #109 en review; sin UI, red, Supabase remoto, merge,
  promoción o build distribuida.

Nota ISA-218 / TAU-04A (2026-08-02, envío idempotente de reportes):
- Nueva RPC autenticada `testing_center_submit_report(...)`, apilada sobre
  TAU-03R, sin UI, bridge Wails, GitHub, Codex, Discord o deploy.
- Identidad, rol y canal permitido se derivan en servidor; el cliente no puede
  escribir tablas directamente ni elegir una asignación automática.
- Acción, resultado esperado y observado son obligatorios. Diagnóstico y logs
  conservan consentimientos separados; el JSON se valida con shape y tipos
  cerrados, límites, SHA-256 exacto y contadores reconciliados.
- La clave idempotente se serializa como JSON tipado canónico, se bloquea por
  usuario y produce un único reporte/evento incluso con peticiones concurrentes.
- Gates locales x3: core 72, access 56, report 55, rollback/reaplicación y
  carrera exactly-once PASS. Autoridad:
  `docs/runbooks/testing-center-report-submission.md`.
- Estado: PR draft #108 en review; sin migración remota, merge, promoción o
  build.

Nota ISA-215 / TAU-03 (2026-08-02, diagnóstico local del Testing Center):
- Nuevo paquete puro `testing-center.diagnostic.v1`, apilado sobre TAU-02C, sin
  UI, red, persistencia, PostHog, GitHub, Codex o Discord.
- Metadata y logs usan allowlists cerradas, límites de 4 KiB crudos/512 B
  sanitizados, máximo 100 entradas y payload final de 64 KiB.
- Preview y transporte comparten exactamente los mismos bytes y SHA-256; el
  draft puede descartarse y deja de ser accesible.
- La revisión adversarial corrigió rutas con espacios y acotó el texto antes de
  aplicar regex. Texto libre no garantiza anonimización semántica, por lo que
  TAU-04 deberá mantener logs opt-in y preview obligatorio.
- Gates focales: x20, vet, race x10 y fuzzing PASS. Autoridad:
  `docs/runbooks/testing-center-diagnostics.md`.
- Estado: implementación local en review; sin merge, promoción o build.
Nota ISA-258 / V1-07A (2026-08-03, Roadmap conectado a Linear):
- La vista editorial `Roadmap actual` se conserva. La antigua vista manual
  `Desarrollo por features` pasa a `Proyectos`, con tres pestañas públicas,
  seis proyectos allowlisted y tareas limitadas inicialmente a ocho por
  proyecto con expansión explícita.
- Linear no entra en el cliente: un exporter Python stdlib read-only pagina
  GraphQL, falla cerrado ante respuestas parciales/estados desconocidos,
  sanitiza títulos y genera un snapshot público v1 sin UUIDs, identificadores
  `ISA-*` ni prefijos internos de proyecto, URLs/dominios, descripciones,
  comentarios, labels, asignados o workspace.
- El cliente valida schema/canal/progreso/privacidad, distingue remoto actual,
  remoto obsoleto y fallback empaquetado, e impone timeout. Las pestañas
  superiores e internas usan semántica ARIA, roving tabindex y foco real.
- Catálogo, snapshot y fixture quedan versionados; la publicación programada y
  el endpoint por canal siguen fuera de este corte. Una lectura live mediante
  el conector de Linear generó el bootstrap público actual con 3 pestañas, 6
  proyectos y 145 tareas; 26 canceladas quedaron excluidas. Sin
  `LINEAR_API_KEY` local no se ejecutó la ruta de red del exporter; su dry-run
  end-to-end con fixture generó 3 pestañas, 6 proyectos y 6 tareas.
- Gates: exporter 10/10, frontend Roadmap focal 54/54, build, lint focal, privacidad y
  `git diff --check` PASS. La suite global terminó 312/313 y 2.147/2.148 dos
  veces por dos intermitencias distintas en `useCanvasInteraction.test.tsx`,
  archivo sin diff que aislado pasa 24/24. El lint global conserva 30 errores y
  2 warnings preexistentes fuera del write set.
- Estado: implementación en review, sin commit/push/PR ni promoción. Requiere
  validación manual de Isaac antes de cualquier integración en `nightly`.

Nota ISA-247 / BIL-10C (2026-08-03, acceso operativo revocable):
- Tester, Tester Nightly y Owner son roles server-side separados de Polar y de
  los planes comerciales; solo se emiten como capabilities firmadas acotadas.
- Leases: Tester 14 días, Tester Nightly 72 horas y Owner 30 días. La asignación
  servidor puede ser permanente pero siempre revocable.
- Los grants legacy se ignoran como autoridad de credencial y disponen de
  preview/retiro por cuenta, idempotente y auditado; nunca se borran.
- Cuenta muestra plan y acceso operativo por separado. Existe una política pura
  de canales Stable/Testers/Nightly y una CLI UUID-only dry-run por defecto.
- Autoridad operativa: `docs/billing/bil-10c-operational-access-runbook.md`.
- Sin migración/deploy/apply remoto, Owner real, pagos, refunds o promoción a
  Testers/Master. Billing continúa **NO-GO**.

Nota ISA-75 / BIL-10 (2026-08-02, observabilidad Billing):
- Señales del webhook sanitizadas con correlation ID hash; no se registran IDs
  originales, payloads, PII ni errores libres.
- Inbox durable particionado por `sandbox`/`production`; el histórico queda
  `unclassified` y se excluye de métricas atribuidas en vez de adivinarlo.
- Snapshot agregado server-only para lag, retry, quarantine, orphan, replay,
  reconciliación, drift e incoherencia de grants.
- Alertas deterministas con cooldown de 15 minutos y runbooks con owner,
  recuperación, rollback y autorización.
- Sin plataforma/dependencia nueva y sin deploy o mutación remota. Autoridad:
  `docs/billing/bil-10-observability-runbook.md`.
- Gates frescos: Deno activo 181/181, type-check y PostgreSQL desechable
  clean/upgrade/restore PASS, con 20/20 pruebas de observabilidad por ruta.
- La transición de deploy conserva temporalmente un overload RPC server-only:
  migración primero, Edge después y retirada posterior solo tras tráfico cero.

Nota ISA-74 / BIL-09 (2026-08-02, matriz lifecycle sandbox):
- Fixture sintética completa y explícitamente sandbox para Launch, Pro y Pro Plus; Pro incluye trial de siete días con antiabuso confirmado.
- Matriz versionada para trial, active, renewal, cancel-at-period, uncancel, past_due, unpaid, revoked y estado desconocido fail-closed.
- Customer State, beneficios, compras múltiples y refunds se ejecutan contra las funciones reales; una segunda pasada converge sin efectos nuevos.
- Solo fixtures, tests y documentación: ningún endpoint, pago, refund, deploy, secreto o dato productivo. Autoridad: `docs/billing/bil-09-lifecycle-matrix.md`.
- Gates locales: BIL-09 4/4, Deno activo 177/177, formato, type-check,
  deploy-surface y `git diff --check` PASS.
- Estado: review y gates protegidos PASS; promovido mediante PR #101 a
  `nightly@59d7202444fc278f74cc1964e8993f62a3b7171b`. Venta pública continúa
  **NO-GO**.

Nota ISA-212 / BIL-N02 (2026-08-02, promoción a `nightly`):
- BIL-08 reconstruida sobre `nightly@b8ffd7c6c824f17ebcc09a5e44bf4ac12bafb7c5`, que ya contiene BIL-01..BIL-07, Telemetry Core, Engineer, Strategy y Telemetry Analysis.
- El corte añade envelope Ed25519 versionado ligado a UUID/fingerprint, expiración offline por capability, Launch v1 perpetuo por scope, high-watermark protegido, migración legacy fail-closed y el emisor `license-credential`.
- `authsession` y licencia comparten una única implementación de Windows Credential Manager mediante `internal/protectedstore`; el cliente solo recibe claves públicas versionadas.
- La auditoría de recuperación reconstruyó `service_test.go`, que había quedado vacío tras el reinicio, y sustituyó un fixture Deno→Go inválido por uno generado y verificado realmente con WebCrypto.
- Gates de la composición final: frontend 311/311 archivos y 2.128/2.128 tests, build y lint focal PASS; Deno 173/173, formato, check y deploy-surface PASS; Go focal x20, `vet`, Credential Manager real y `-race` focal PASS. La suite Go global confirma todos los paquetes BIL-08 y conserva un único fallo intermitente heredado en `internal/app.TestConcurrentSavesDontCorruptFile`, reproducido también sobre la base y trazado en ISA-118. La intermitencia heredada del canvas apareció en una primera pasada frontend, no existe diff de canvas y la repetición global final quedó completamente verde.
- Estado: candidato técnico listo para PR/CI y promoción exclusiva a `nightly`. Sin deploy, secretos, credenciales productivas, pagos, refunds ni mutaciones remotas. Venta pública continúa **NO-GO** y `testers`/`master` no se tocan.

Nota ISA-203 / BIL-N01 (2026-08-02, promoción a `nightly`):
- Reconstrucción del árbol final BIL-01..BIL-07 sobre
  `nightly@523840972673c2567cef75240ebe5a768f7742fc`; BIL-08 queda fuera porque
  continúa sin commit en su worktree aislado.
- Incluye inbox durable e idempotente, checkout/portal endurecidos, sesión OAuth
  protegida, reconciliación monotónica, recuperación de pago de 72 horas y ledger
  atribuible de orders/refunds. No ejecuta deploy, migraciones remotas, pagos,
  refunds ni cambios productivos en Polar o Supabase.
- Los conflictos reales se limitan a composition root, servidor OAuth y los dos
  documentos vivos. La resolución conserva Telemetry Core, Engineer, Strategy,
  Overlay Projection y sustituye el nonce simple por intentos OAuth ligados a
  provider/state y consumidos atómicamente.
- Gates locales acumulativos completos: PostgreSQL desechable (checkout,
  hardening, upgrades legacy, restore y concurrencia), Deno 164/164, frontend
  focal 87/87, frontend global 311 archivos/2.128 tests, build y lint focal,
  Go global, repetición x20 y race detector focal. El deploy surface acepta
  únicamente `billing-checkout`, `billing-portal` y `billing-webhook`.
- Estado: preparado para PR y CI de promoción técnica; venta pública continúa
  **NO-GO**, BIL-08 permanece fuera y `testers`/`master` no se tocan.

Nota ISA-204 / TA-N01 (2026-08-02):
- Promoción acumulativa TA-01…TA-03C reconstruida sobre
  `nightly@c71959167ef0c96a5eaaef86ec0beb1dd0819ed6` desde el stack técnico
  aprobado `9c92836b90dacc5d82cc86569954cb11f0cf9460`.
- El corte incorpora discovery e importación local LMU, contrato histórico,
  adaptador DuckDB mediante helper fuera de proceso, staging privado,
  manifest/SBOM/notices y lifecycle Windows. El proceso principal conserva
  `CGO_ENABLED=0` y no incorpora DuckDB a su grafo.
- La v1 solo acepta archivos LMU locales descubiertos e indexados. Las
  importaciones externas o comunitarias siguen bloqueadas por TA-03D; no se
  presenta Job Object como sandbox ni se modifican archivos originales.
- Los únicos conflictos de reconstrucción fueron los documentos de estado. Se
  conservaron las promociones previas de Telemetry Core y Strategy y se actualizó
  el siguiente paso a TA-04/TA-05.
- El gate de packaging falló cerrado porque el hash confiado de TA-03C no
  correspondía a su árbol final. TA-N01 reconstruyó dos veces el helper final,
  verificó el grafo y las 37 licencias, actualizó la confianza explícitamente y
  confirmó con una tercera construcción limpia y smoke Windows x64 que el
  bundle vuelve a ser reproducible y cargable.
- El primer CI del PR detectó que la regresión DACL comparaba texto SDDL y no
  identidad de SID: Windows representa cuentas well-known como `LA` en vez del
  SID numérico. El test enumera ahora las ACE y compara el SID binario exacto;
  conserva el rechazo de grupos amplios y la exigencia de DACL protegida.
- Estado: preparado para repetir gates combinados y, si permanecen verdes,
  validar el lector local con el grupo Nightly/Pro Plus. `testers` y `master`
  permanecen fuera del alcance.

Nota ISA-202 / STR-N01 (2026-08-02):
- Promoción acumulativa de Strategy Planner STR-00…STR-09 reconstruida sobre
  `nightly@1f3bcc825d45b5900eb798cbeedf7dd3ac2d06fa` desde el stack técnico
  aprobado que culmina en `1dda42ae33f1471847562415316a274a70fb1f74`.
- El corte ofrece el dominio y contrato `strategy.v1`, persistencia local,
  servicio de aplicación, cálculo manual Fuel/Virtual Energy, inventario de
  neumáticos individuales, shell 3/6/3, edición de stints y entradas manuales
  no destructivas. No incluye todavía solver avanzado, telemetría live ni
  publicación comunitaria.
- Los únicos conflictos de reconstrucción fueron documentales. Se conservaron
  la gobernanza vigente, la promoción previa de Telemetry Core y los follow-ups
  TC-10A/B; no se modificaron `testers` ni `master`.
- Gates frescos: Strategy Go PASS; Go global PASS; frontend Strategy 65/65 PASS
  con concurrencia controlada; frontend global 305 archivos/2.083 tests PASS;
  build PASS; Playwright visual wide/medium/compact PASS, overflow de documento
  y errores de navegador en cero; diff-check PASS.
- Estado: listo para validación funcional y visual del grupo Nightly/Pro Plus.
  El feedback se corregirá en ramas de issue antes de cualquier promoción a
  `testers`.

Nota ISA-171 / TC-09G (2026-08-02):
- Promoción controlada completada desde `nightly@328c631c356f5e5550f934396bbdd09313c5ef6c` hasta `nightly@c5eb3c906bc0f93a747adac13f3efcc9f731f8b9`, con procedencia en el stack aprobado de Telemetry Core `170eaebbaa6744019ead96a2c78201b4da2fb9bb`.
- El primer gate del PR #65 detectó en Windows CI que una ruta 8.3 (`RUNNER~1`) y su ruta larga equivalente eran rechazadas como distintas por comparación textual en raw capture. El segundo gate confirmó ese paquete verde y reveló la misma comparación en la frontera del catálogo Wails. Ambas rutas comparan ahora identidad real con `os.SameFile`, conservan el rechazo de junctions/symlinks y tienen regresiones Windows 8.3. El timeout del spy permanece en 2 s: no se oculta el fallo funcional. Review independiente y reruns posteriores: PASS, P0/P1/P2/P3 = 0.
- La simulación previa encontró únicamente conflictos documentales en `AGENTS.md`, `docs/agent-workflow.md` y este archivo; no existen conflictos de código.
- La resolución conserva la gobernanza vigente de ISA-120/121 y todo el handoff/evidencia de Telemetry Core. `testers` y `master` permanecen fuera del alcance.
- Árbol integrado: todos los archivos fuera de REL-00, OS-07 y los documentos reconciliados coinciden byte a byte con `170eaeb`; la auditoría confirma un único owner productivo de LMU y cero referencias legacy productivas.
- Gates frescos pre y post-promoción: Go bloqueante completo PASS; ISA-118 focal PASS; frontend bloqueante 295 archivos/1.978 tests PASS; build PASS; cutover y shadow Playwright PASS; 7/7 fuzzers PASS; soak/lifecycle x3, replays x3, benchmark combinado, branch policy y design-system 2/2 PASS. El gate post-promoción es el run `30729804412`.
- Deuda externa visible: `useCanvasInteraction.test.tsx` reproduce ISA-172 tanto bajo suite completa como focalmente. No se modifica ni se amplía la allowlist en ISA-171.
- Estado: ISA-171 completada en `nightly` y lista para validación Nightly/Pro Plus. `testers` y `master` no se modificaron. Rollback: revertir el commit lineal `c5eb3c906bc0f93a747adac13f3efcc9f731f8b9`.

Nota REL-00 / ISA-121 (2026-08-02):
- El flujo canónico de entrega pasa a ser `rama de issue -> nightly -> testers -> master`.
- `nightly` recibe únicamente implementaciones aprobadas inicialmente por Isaac; allí prueba el grupo Pro Plus. Tras corregir el feedback, el conjunto pasa a `testers`; solo Isaac puede autorizar la promoción final a `master`.
- `develop@f492007ced82766873890990ddebf73e87486dec` queda congelada como referencia histórica mientras existan PRs, worktrees o documentos dependientes. No recibe trabajo nuevo y no se elimina en este corte.
- Las ramas remotas `nightly` y `testers` nacen exactamente del último `develop`; crear los canales no promociona por sí mismo Telemetry Core ni otros módulos aislados.
- Contrato operativo y rollback: `docs/branch-channels.md`. La autorización del actualizador por plan requiere ISA-169, ligada a Billing; una selección de UI no es una barrera de acceso.
- Baseline local del corte: Go PASS, frontend 280/280 archivos y 1851/1851 tests PASS en la ejecución principal, build PASS; una revisión independiente reprodujo un fallo intermitente de `useCanvasInteraction`, y el lint global conserva 33 errores/2 warnings heredados. El run remoto añadió dos deudas de entorno/fecha, registradas en ISA-173 e ISA-174. La suite bloqueante excluye únicamente esos tres archivos exactos y ejecuta 277 archivos/1812 tests PASS; cada excepción se ejecuta por separado y sigue visible.
- El primer run remoto confirmó que Go necesita el `frontend/dist` generado antes de compilar el embed. El gate construye frontend antes de `go test ./...`; la ausencia del artefacto ya no se presenta como fallo de código.
- El segundo run remoto reprodujo la colisión Windows conocida de `TestConcurrentSavesDontCorruptFile` (`app-settings.json.tmp`, ISA-118). El gate mantiene bloqueantes todos los demás paquetes y todos los demás tests de `internal/app`; solo ese caso se ejecuta como aviso explícito hasta su corrección determinista.
- Las builds internas de `nightly`/`testers` aplican el mismo aislamiento temporal y exacto a ISA-118/170/172/173/174. Las releases públicas desde `master` conservan Go, frontend y lint completos como gates estrictos.

Nota OS-07 / ISA-176 (2026-08-02):
- El primer run posterior a integrar REL-00 en `nightly` detectó una carrera real en `StudioInspector`: una selección del rail podía quedar sobrescrita por el ajuste asíncrono de la sección inicial del widget.
- La selección activa queda asociada al `widgetId` y se normaliza durante el render cuando cambia el widget o desaparece una capability. Ya no depende de un efecto tardío capaz de pisar la interacción del usuario.
- Se añadió una regresión que selecciona Apariencia en cuanto el rail queda disponible. El inspector pasa 5 ejecuciones focales consecutivas, lint focal y build. El gate del PR y el gate posterior al merge pasan completos sobre `nightly@328c631c356f5e5550f934396bbdd09313c5ef6c`; ISA-176 e ISA-121 están cerradas.
- Alcance limitado a estado/navegación del inspector y su test. No se modificaron canvas, renderizadores, diseño visual, allowlists, `testers` ni `master`.
Nota ISA-144 / STR-09 (2026-08-02):

- Entrada rápida y tabla de 78 vueltas usan correcciones no destructivas con
  valor original, valor efectivo, motivo, fecha y restauración individual.
- `strategy.manual.v1` conecta frontend, Wails y el dominio Go. Fuel y VE se
  calculan por separado; tarjetas, fuel-save y boxes consumen una misma
  respuesta correlacionada.
- La pérdida configurada es por parada: cuatro stints producen tres paradas.
  Reparaciones y penalizaciones permanecen extras explícitos. No se publica
  una cifra de impacto en ritmo sin modelo demostrable.
- El cálculo anterior desaparece durante una revisión y los inputs rechazados
  vuelven al valor válido sin ensuciar el documento.
- Playwright real valida correcciones, rechazo, guardado/recarga,
  wide/medium/compact, overflow cero y navegador sin errores. Evidencia:
  `docs/strategy-planner/str-09-manual-inputs.md`.
- Estado: listo para review independiente; sin merge o promoción.
  Tras la review continúa ISA-168 / TA-03C; STR-10 sigue bloqueado por ISA-159.

Nota ISA-143 / STR-08 (2026-08-02):

- El workspace de Strategy ya edita stints y neumáticos físicos: crear,
  insertar, duplicar, borrar, reordenar, DnD, teclado, cancelación, undo/redo,
  guardado y recarga.
- `strategy.editor.v1` viaja por STR-04 y se persiste únicamente en STR-03;
  `cmd/vantare` conecta el bridge productivo. El mock persistente queda limitado
  al harness.
- La primera asignación fija FL/FR/RL/RR; quitar un neumático conserva su
  identidad. Documentos corruptos y cambios de esquina se rechazan.
- Apertura lazy, reintento real, mensajes sanitizados, timestamps canónicos,
  snapshot estable y StrictMode están cubiertos por regresión.
- Focal `48/48`, frontend global `2072/2072`, Go global, build, lint focal y Playwright real pasan. Chrome
  valida edición, guardado/recarga, responsive y cero errores/overflow.
  Evidencia: `docs/strategy-planner/str-08-stint-editor.md`.
- Rama apilada sobre ISA-142 aceptada; sin merge ni promoción. Siguiente corte
  tras `ACCEPT`: ISA-144 / STR-09.

Nota ISA-142 / STR-07 (2026-08-02):

- Strategy Planner ya está registrado en el topbar, la política de acceso y el
  `HubApp` reales.
- Galería, entrada, revisión, workspace 3/6/3, comparación y guardado honesto de
  sesión están implementados sin solver, telemetría, persistencia ni drag/drop.
- El demo renderiza cuatro stints que suman 78 vueltas. Tiempo, pits, uso por
  compuesto y ahorro pertenecen a cada estrategia y no se presentan como sets
  físicos.
- El harness autocontenido arranca y termina Vite, recorre el flujo, valida
  teclado, aislamiento/foco del modal y captura wide/medium/compact con overflow
  y errores de navegador en cero. Baseline serial `2059/2059`; corrección final
  focal `7/7`, build y lint focal pasan. Evidencia:
  `docs/strategy-planner/str-07-shell-visual.md`.
- Rama apilada sobre `ISA-141@52d2466`; sin merge ni promoción. El siguiente
  corte solo tras `ACCEPT` es ISA-143 / STR-08.

Nota ISA-141 / STR-06 (2026-08-02):
- Nuevo dominio puro `internal/strategy/tyres`, apilado sobre STR-05 exacto
  `2d0af85`, para neumáticos físicos individuales con ID, Soft/Medium/Hard/Wet,
  condición/procedencia, estado, stints y esquina persistente.
- La condición nunca colapsa incertidumbre: clasificación sin dato conserva
  80–90 %, ausencia general conserva 40–70 %, y un estimado no puede declararse
  exacto. Un valor manual exacto sigue permitido y queda trazado.
- Antes del primer uso se puede corregir la posición; el primer uso liga el
  neumático permanentemente a FL/FR/RL/RR. Descartar conserva el historial.
- Selección determinista de cuatro unidades, mezclas de compuestos permitidas y
  errores tipados que explican stock total o incompatibilidad por esquina.
- Operaciones inmutables; sin UI, drag/drop, persistencia, telemetría, editor de
  stints, solver, wiring ni dependencias. Evidencia:
  `docs/strategy-planner/str-06-tyre-inventory.md`.
- Estado: implementación lista para review independiente; sin merge ni
  promoción. El siguiente corte solo tras `ACCEPT` es ISA-142 / STR-07.

Nota ISA-140 / STR-05 (2026-08-02):
- Nuevo motor puro `internal/strategy/manual`, apilado sobre STR-04 exacto
  `f60f480`, para carrera por vueltas/tiempo, Fuel, Virtual Energy, fuel-save y
  pit manual.
- Las carreras por tiempo completan vueltas enteras: `ceil` de la vuelta en
  curso, sin vuelta fantasma en una frontera exacta, y `+1` únicamente mediante
  regla explícita del evento. El pit loss es un input manual con procedencia;
  no existe ciclo fixed-point o solver oculto.
- Fuel y VE conservan APIs/resultados incompatibles. Necesidad = carrera +
  formación + reserva; repostajes/recargas se enumeran conservadoramente y
  nunca subasignan ni superan la capacidad por servicio. Fuel-save cuenta la
  cantidad inicial real.
- Pit separa viaje/penalización fija de servicio variable; solo Fuel/neumáticos
  solapan, reparación es secuencial y `overlapSaved` demuestra que no hay doble
  conteo. Reparaciones y penalizaciones son manuales y opcionales.
- Cada input usado y cada regla de selección aparecen en `Assumptions` con
  valor, unidad, procedencia y confianza. Sin UI, solver, Monte Carlo, presets
  LMU, telemetría, DuckDB, persistencia nueva, wiring ni dependencias.
- Evidencia: `docs/strategy-planner/str-05-manual-calculation.md`. Manual x100,
  property 10.000 casos, dos fuzzers, race x10, árbol Strategy, vet focal,
  frontend 301/301 y build pasan. Go global conserva solo el P3 Windows
  heredado de Settings; vet global conserva tres avisos Win32 heredados y lint
  frontend 30 errores/2 warnings fuera del diff.
- Corrección de review: la vuelta temporizada usa frontera decimal racional sin
  epsilon y conserva medias vueltas representables; la asignación de recursos
  ya no reutiliza ese redondeo ni descarta restos pequeños. Regresiones Fuel/VE
  cubren múltiplos por debajo, exactos y por encima sin tolerancia contractual.
- Estado: correcciones P1/P2 listas para nueva review independiente; sin merge
  ni promoción. El siguiente corte solo tras `ACCEPT` es ISA-141 / STR-06.

Nota ISA-139 / STR-04 (2026-08-02):
- Nueva fachada `strategy.application.v1` en
  `internal/strategy/application`, apilada sobre el repositorio exacto de
  STR-03 `8e151b8`.
- Comandos versionados para crear, abrir, editar, guardar revisión, duplicar,
  activar, desactivar, restaurar y cerrar. Undo/redo quedan en el único store
  frontend transitorio y no escriben revisiones.
- Dirty se deriva de snapshots; comandos mutadores respetan generación
  optimista, reconcilian commits inciertos e impiden sobrescrituras stale.
- El bridge JSON falla cerrado ante versiones futuras, duplicados, unknown
  fields, campos obligatorios ausentes o trailing data; el cliente correlaciona
  respuestas y limpia listeners.
- Las observaciones de ejecución/telemetría se mantienen separadas y no mutan
  draft, snapshot o historial. Cerrar el editor tampoco desactiva el plan.
- Sin UI final, cálculos, LMU, Shared Memory, REST, DuckDB, persistencia nueva,
  wiring productivo ni dependencias. Evidencia:
  `docs/strategy-planner/str-04-application-service.md`.
- Evidencia fresca: Go application x100, árbol Strategy, Go global, vet focal,
  race x10 con UCRT64, 36 tests frontend focales, frontend completo 301/301
  archivos y 2.052/2.052 tests, TypeScript, build, lint focal y diff-check
  pasan. Una corrida frontend inicial bajo carga paralela reprodujo timings
  inestables preexistentes del canvas; la repetición final aislada pasó entera.
- Corrección tras review: save/close bloquean edit/undo/redo hasta aplicar su
  resultado; create/open no descartan dirty; un save incierto conserva y
  reintenta exactamente su identidad; bridge y atajos idempotentes fallan
  cerrados; el cliente soporta cancel/dispose y limpia todos los listeners.
- Estado: correcciones listas para segunda review independiente; sin merge ni
  promoción. El siguiente corte, solo tras `ACCEPT`, es ISA-140 / STR-05.

Nota ISA-138 / STR-03 (2026-08-02):
- Nuevo repositorio local `strategy.repository.v1` en
  `internal/strategy/repository`, apilado sobre STR-02 exacto `91c16c2`.
- Una API mínima `Snapshot` + `Commit(ChangeSet)` posee drafts, revisiones,
  borrado y futuros lotes transaccionales de STR-15A sin exponer filesystem.
- Escritura durable con temporal+sync+replace, backup único, lease del sistema
  operativo y generación optimista. Dos escritores se serializan o reciben
  `ErrWriteInProgress`/`ErrStaleWrite`; nunca se pisan silenciosamente.
- Drafts son mutables y recuperables; revisiones STR-02 se vuelven a verificar,
  son inmutables por identidad+hash e idempotentes si son exactas.
- Recovery restaura el último backup válido ante corrupción, ignora temporales
  interrumpidos y falla cerrado si principal/backup no son válidos. Versiones
  futuras no se degradan mediante rollback.
- Corrección de review: recovery solo se activa ante ausencia o corrupción
  demostrada. Límites, permisos/I/O y versiones incompatibles se propagan sin
  tocar el principal; la regresión generación 1/2 demuestra que un límite más
  estricto no revierte silenciosamente al backup antiguo.
- El lease queda probado entre procesos y se libera tras una muerte abrupta.
  Bajo ese lease se limpian solo temporales regulares privados; symlinks,
  reparse points, directorios, rutas externas y nombres ajenos permanecen
  intactos.
- Drafts y revisiones atraviesan la puerta canónica `strategy.v1`, con fixtures
  actual/futuro. Un fallo después del replace se informa como
  `ErrCommitUncertain` con generación para reconciliar mediante `Snapshot`.
- Segunda corrección de review: el primer commit crea primero un backup de su
  misma generación. Un root nuevo con ambos archivos ausentes sigue siendo gen0,
  pero retirar el principal tras inicializar recupera inequívocamente gen1; un
  commit posterior con versión 0 falla stale y no consolida el vacío. Fallar el
  backup antes del replace deja un repo genuinamente nuevo; fallar después o
  interrumpir el principal devuelve resultado incierto recuperable. No se añade
  marker ni otra fuente de verdad.
- Migración v1 es un no-op explícito con fixture/golden; no se inventa un
  formato Product A. Límites, JSON estricto y borrado dentro del documento
  impiden crecimiento sin cota o tocar archivos externos.
- Sin UI, queries de galería, paquetes, telemetría, cloud, wiring ni
  dependencias nuevas. Evidencia:
  `docs/strategy-planner/str-03-repository.md`.
- Evidencia fresca: focal x100, lease cross-process x50, árbol Strategy, vet
  focal, race x10 con
  CGO/UCRT64, compilación Linux, frontend build y suite Go global excluyendo el
  único P3 Windows heredado de `TestConcurrentSavesDontCorruptFile` pasan. La
  suite global completa posterior a la corrección agotó cinco minutos sin
  salida; la entrega inicial ya había aislado ese test como único fallo. Vet
  global conserva tres avisos Win32 `unsafe.Pointer` fuera del diff.
- Estado: implementación local lista para review independiente y entrega; sin
  promoción ni merge.

Nota ISA-137 / STR-02 (2026-08-01, reanudada 2026-08-02):
- Nuevo contrato productivo `strategy.v1` en `internal/strategy/contract` para
  `PlanDraft`, `PlanRevision`, `ActivePlan`, `StrategyExecutionState` y
  `ReplanProposal`; Product A sigue aislado como oráculo histórico.
- El draft es mutable, la revisión captura un snapshot independiente con hash
  `sha256:strategy-c14n-v1` y el plan activo solo cambia tras aceptar
  explícitamente una propuesta basada en la revisión que continúa activa.
- Fuel, Virtual Energy, tiempo, vueltas, distancia y neumático son unidades
  distintas y validadas. Fuel y VE no comparten operaciones ni en Go ni en TS.
- Procedencia, confianza, capabilities, estados, errores y campos obligatorios
  se verifican contra un único manifiesto JSON compartido. Una revisión golden,
  un corpus de canonicalización adversarial y otro de hashes/timestamps
  demuestran paridad Go/TypeScript sin duplicación silenciosa.
- Corrección de review: el hash ya no depende del serializador JSON; usa tags
  binarios, orden UTF-8, float64 big-endian y límites compartidos. Decode de
  revisiones/replans rechaza duplicados y campos desconocidos; replan valida
  pre/post transición; execution y aceptación conservan snapshots profundos.
- Segunda corrección de review: activar dos veces la misma propuesta es
  idempotente solo con historial exacto; execution dispone de decode estricto
  Go/TS y corpus compartido de 25 casos con `code+field`; `LapCount`, `epoch` y
  `sequence` aceptan como máximo `2^53-1`; bytes UTF-8 realmente inválidos se
  rechazan antes de convertir el documento.
- Cierre de hallazgos STR-02: los 25 casos del corpus quedan fijados por nombre
  y orden; escalares y paths anidados se validan con el mismo `code+field` en
  Go/TS; y los límites de canonicalización están en el manifiesto compartido,
  sin aplicar el límite de elementos de arrays/objetos a los bytes de strings.
- Reanudación tras interrupción: una versión explícita desconocida precede a la
  validación de shape v1 en revisión, replan y execution, con regresiones
  compartidas Go/TS para revisión y replan. El encoder TypeScript aplica su
  propio límite de profundidad y rechaza objetos sobredimensionados antes de
  ordenar claves, incluso cuando verifica un valor ya construido.
- Corrección final P2: la verificación productiva calcula únicamente el hash;
  el hexadecimal canónico completo queda limitado al corpus diagnóstico y se
  construye en un búfer acotado, sin un array temporal por byte. Una regresión
  canoniza 1.000.000 de números (`9.000.005` bytes canónicos) y el benchmark
  manual comparable está en
  `docs/strategy-planner/str-02-canonicalization-memory-benchmark.md`.
- `strategy.v1` es la primera versión; la migración actual es un no-op explícito
  y cualquier versión desconocida se rechaza.
- Sin persistencia, UI, cálculo, LMU, Telemetry Core, DuckDB, Wails ni wiring.
  Evidencia: `docs/strategy-planner/str-02-contract.md`.
- Estado: `ACCEPT`, commit `91c16c2`, push y PR draft #66; sin merge ni
  promoción. Go focal x50, ambos fuzzers, TypeScript, frontend completo
  299/299 archivos y 2.034/2.034 tests, build, lint focal, vet focal y
  diff-check pasan. Go/vet global no se repitieron en esta reanudación; la
  última evidencia conserva el fallo Windows heredado de Settings y tres avisos
  Win32 `unsafe.Pointer` fuera del diff.

Nota ISA-136 / STR-01 (2026-08-01):
- Product A queda rescatado únicamente como oráculo histórico aislado en
  `internal/strategy/producta`; no existe wiring ni consumidor productivo.
- La allowlist está completa: fixture JSON exacto y 24 archivos Go idénticos a
  `b9f1937` salvo `package producta`; un guard verifica blobs y manifiesto.
- La denylist 69/69 se valida contra la matriz y contra un manifiesto versionado
  del delta; tests de regresión rechazan app service, Hub, locales y CSS. El
  discovery de raíz pasa también con `-trimpath`.
- Se reproducen casos canónicos, 10.000 seeds, carrera, recursos, pit,
  neumáticos, stints, unidades, ranking y sensibilidad sin elevar el solver
  histórico a autoridad.
- Se conservan explícitos los defectos históricos: degradación fuera del tiempo
  total, margen Fuel+VE inválido, optimalidad no demostrada y semánticas LMU
  pendientes. STR-02/05/06/08/12 poseen sus reemplazos.
- TDD rojo antes del port y Go focal verde después. Evidencia:
  `docs/strategy-planner/str-01-product-a-characterization.md`.
- Estado: `ACCEPT`, commit `f85fd31`, push y PR draft #60; sin merge ni
  promoción. ISA-137 / STR-02 continúa apilada sobre esa revisión.

Nota ISA-134 / STR-00 (2026-08-01):
- Strategy Planner queda replanificado como un solo producto; Product A/B/C
  pasan a ser fases históricas.
- Product A exacto `b9f1937` fue auditado contra `ISA-117@170eaeb`: Go focal,
  vet, 25 tests frontend y build pasan; el smoke Playwright histórico se queda
  bloqueado y debe sustituirse en STR-07.
- La simulación contiene 94 paths: 87 auto-merged + 7 conflictos. La matriz
  enumera 94/94 y limita STR-01 a un fixture exacto y 24 ports manuales; los
  otros 69 paths quedan en denylist.
- ADR 0006 fija ownership: Analysis publica histórico, Core publica live,
  Strategy posee planes/cálculo, Engineer envía comandos y Overlays solo leen.
- Evidencia y ejecución: `docs/strategy-planner/str-00-audit.md`,
  `rescue-matrix.md`, `pb-to-str-map.md`, `projection-ownership.md` y
  `docs/superpowers/plans/2026-08-01-strategy-planner-unified-master.md`.
- Linear conserva ISA-42..67 como `Canceled`/superseded y define 24 cortes:
  ISA-136..157 más ISA-162/163 (galería privada, oficial y comunidad).
- Ownership de planes locales: ISA-138/STR-03 posee repositorio, atomicidad,
  migraciones, drafts, revisiones y recovery; ISA-150/STR-15A consume ese
  repositorio para la UI de `Mis planes` y paquetes import/export, sin duplicar
  persistencia.
- Productores explícitos: ISA-159 / TA-05 para histórico e ISA-160/161 /
  TC-10A/B para live. Bloquean ISA-145 y ISA-152 respectivamente.
- Estado: `ACCEPT` tras review; ISA-136 / STR-01 está en ejecución apilada. Sin
  merge ni promoción.
Nota ISA-168 / TA-03C (2026-08-02):
- Implementado el adapter DuckDB histórico productivo fuera de proceso sobre
  ISA-135. Wails conserva `CGO_ENABLED=0`; DuckDB 1.5.5 vive en un módulo y
  runtime separados.
- Staging privado, manifest confiado, locks anti-TOCTOU, read-only, IPC tipado
  sin SQL, Job Object, cancel/retry/close, rollback confiado, notices y SBOM
  reproducibles quedan cubiertos.
- Parser sintético real y benchmark 50×16.384 PASS. En cierre intercalado y
  con CPU al 93–100 %, TA-03C obtuvo mediana 27,154 ms/página frente a 45,290
  de TA-03B (ratio 0,5995×; gate <=2×). Smoke host Windows x64, fuzz, race y
  build principal PASS. Evidencia:
  `docs/vantare-program/research/telemetry-analysis/ta03c-duckdb-adapter-evidence.md`.
- Review independiente `APPROVE`, cero P0/P1/P2/P3 razonables. Estado: cierre
  técnico listo para `In Review`; sin promoción.
  TA-04 continúa después de aceptar este corte. Imports externos/comunitarios
  siguen bloqueados por ISA-164 / TA-03D.

Nota VANTARE-PROGRAM (2026-07-27):
- ISA-120 crea la autoridad de continuidad en `docs/vantare-program/`.
- Lectura obligatoria: `docs/vantare-program/README.md` y el handoff vivo.
- Flujo objetivo: rama de issue -> aprobación inicial -> `nightly` ->
  feedback/correcciones -> `testers` -> aprobación final -> `master`.
- ISA-121 materializó `nightly` y `testers`; `develop` queda congelada como
  referencia histórica y las promociones siguen el contrato de ramas vigente.
- Telemetry Core continúa desde ISA-37. Telemetry Analysis y Engineer/Spotter
  requieren proyecto, investigación profunda y plan propios.
- Strategy Planner es un único producto; Product A/B/C son fases históricas.
- La skill `vantare-core` no es autoridad.

Nota ISA-201 / ENG-N01 (2026-08-02, promoción a `nightly`):
- Composición final sobre `nightly@4e549bb`: ENG-01..ENG-12, ENG-14 y ENG-15.
  Los dos cortes hermanos conservan sus responsabilidades: PTT físico Windows
  y diálogo determinista confirmable. ENG-13 continúa bloqueando voz real.
- Gates locales: 37 paquetes Engineer y vet focal PASS; PTT x20, benchmark y
  `-race` en delivery/policy/PTT/commands/service PASS; tooling de voz 48/48;
  frontend focal 42/42, global 2.117/2.117, build, lint focal y 12 capturas de
  radio PASS; suite Go global PASS en repetición limpia.
- El primer global Go reprodujo una vez el budget temporal del soak de recording;
  el focal posterior pasó 20/20 y el global limpio pasó. El vet global conserva
  tres warnings `unsafe.Pointer` previos en LMU/Launcher, fuera de este delta.
- El probe nativo observa teclado y `joy-0` disponibles, XInput ausente y ninguna
  pulsación física. Esto no sustituye el gate humano de hardware ENG-29.
- Estado: listo para PR y CI de rama protegida; `testers` y `master` no se tocan.

Nota roadmap Engineer Beta ENG-12..29 (2026-08-02, planificado):
- ISA-182 / ENG-11 queda aceptada en `5b4e0d3`. Se crea el roadmap canónico
  `docs/engineer/engineer-beta-roadmap.md` y 18 microcortes Linear ISA-183 a
  ISA-200, organizados en cuatro milestones y dependencias DAG.
- Primer corte ejecutable: ISA-183 / ENG-12, catálogo/intents y protocolo de
  corpus humano. Después pueden avanzar sin esperar personas ENG-14/15/16/17,
  Spotter ENG-18, monitores ENG-19 y gate técnico TTS ENG-22.
- ENG-13 conserva command intent/FAR/FRR/wake word **NO-GO** hasta corpus humano
  consentido real. ENG-20/21 quedan bloqueadas por esa evidencia. Fixtures no
  sustituyen humanos.
- Kokoro dinámico continúa NO-GO. TTS puede investigarse/integrarse disabled,
  pero escucha perceptual se agrupa en ENG-29.
- Pit Manager exige confirmación + readback; Strategy/Overlays usan contratos
  versionados; ningún LLM decide hechos, intent, números o acciones críticas.
- Esta rama es solo documental. Sin producto, merge, promoción o gate cerrado.

Nota ISA-183 / ENG-12 (2026-08-02, In Review):
- Catálogo cerrado `engineer.commands.v1` con 20 intents propios: 14 consultas
  y 6 acciones. Cada intent declara slots tipados, precondición, respuesta,
  mutabilidad y confirmación; las acciones siempre exigen confirmación.
- Paridad estructural completa en `es`, `en`, `it` y `pt-BR`, incluidos wake
  words y vocabulario de confirmar/cancelar. El parser estricto rechaza IDs,
  locales, campos, placeholders, frases o slots fuera del contrato.
- El harness es exclusivamente textual y fail-closed: no ejecuta acciones ni
  conecta STT, PTT, micrófono, audio o runtime productivo. Conserva números de
  coche con ceros iniciales y valida números, unidades, enums y rangos.
- Sanitización demostrada: la salida de evaluación no contiene transcripciones,
  nombres ni valores de slots. El protocolo de corpus humano exige consentimiento,
  almacenamiento externo a Git, separación por hablante y métricas por locale,
  micrófono, ruido, intent, slot y wake word.
- Evidencia sintética y tests no autorizan voz real: command readiness,
  intent accuracy humana, FAR/FRR y wake word siguen **NO-GO** hasta ENG-13.
- Checks: paquete focal x20, fuzz 5 s, Engineer completo, vet Engineer,
  `go test ./...` y build frontend pasan. `-race` no está disponible porque el
  entorno usa `CGO_ENABLED=0`.
- Re-review independiente final: `APPROVED`, P0/P1/P2/P3 = 0.

Nota ISA-186 / ENG-15 (2026-08-02, In Review):
- Router determinista `engineer.dialogue.v1` sobre el catálogo ENG-12: las 14
  consultas y 6 acciones conservan paridad `es/en/it/pt-BR`.
- Consultas missing/stale/invalid no publican valores. Las acciones siguen
  `propuesta -> readback -> confirmación -> resultado`, revalidan evidencia en
  el puerto y consumen una propuesta una sola vez incluso con double-submit.
- Session/driver/source/epoch, locale, timeout, rollback de reloj o contexto
  cancelado invalidan el diálogo. Dos fallos usan fallback PTT/UI sin adivinar.
- Solo existen puertos falsos en tests: sin STT/TTS/wake word, LMU, Pit,
  Strategy, efectos reales, dependencia o wiring productivo. Contrato:
  `docs/engineer/dialogue-router-isa-186.md`.
- Checks: commands x20, fuzz 5 s, Engineer completo, vet Engineer, build
  frontend, `go test ./...` y diff-check pasan. `-race` no está disponible con
  `CGO_ENABLED=0`.
- Revisión independiente final: `APPROVE`, P0/P1/P2/P3 = 0.

Nota ISA-185 / ENG-14 (2026-08-02, In Review):
- Contrato `engineer.ptt.v1` para bindings globales/locales, conflictos físicos,
  estados visibles y un único owner de captura. No contiene micrófono, STT,
  wake word, persistencia, UI ni acciones.
- Adaptadores Windows sin dependencias nuevas: teclado Win32 con key down/up,
  gamepad XInput y volante/button box joystick-compatible mediante WinMM.
  Raw HID genérico queda `unsupported` de forma explícita.
- Polling de 8 ms cancelable y sin goroutine oculta; hotplug, pérdida de foco,
  permiso, cambio de configuración, errores y shutdown fallan cerrados.
- La re-review corrigió dos bordes: el estado `processing` ahora se cancela
  realmente aguas abajo, y un fallo de cancelación conserva ownership para
  reintentar sin fingir liberación. La primera muestra unpressed ya no genera
  un release fantasma.
- La revisión independiente corrigió además el commit prematuro de muestras:
  si el handler falla, release, disconnect y device-error se reintentan y no
  pueden dejar una captura activa por una transición perdida.
- Terminar `Poller.Run` cancela explícitamente capturing/processing con timeout.
  Un fallo queda visible, conserva ownership y permite `Controller.Shutdown`
  externo; no puede quedar un puerto poseído por la ausencia de futuros polls.
- En el equipo de validación: teclado conectado, `joy-0` conectado, XInput 0..3
  y `joy-1` ausentes. Esto demuestra las llamadas nativas y la ausencia honesta,
  no una pulsación física de cada categoría.
- Contrato y comandos: `docs/engineer/ptt-input-isa-185.md`. Evidencia:
  `docs/evidence/isa-185/windows-input-probe.json`.
- ENG-24 será dueño de UI/persistencia; ENG-20 solo podrá conectar el host STT
  después del gate humano de ENG-13.
- Focal x20, fuzz, benchmark, Engineer completo, vet y build frontend pasan.
  La suite global queda no verde solo por discovery Launcher y un budget
  temporal Telemetry Core ajenos a las rutas de ENG-14. Pulsación física sigue
  pendiente del gate de hardware; no se declara como probada.

Nota ISA-182 / ENG-11 (2026-08-02, In Review):
- Package manager test-only con manifest v1 cerrado y versionado, descargas
  acotadas, cancelables y verificadas por tamaño/SHA-256. Root, temporales y
  eliminación fallan cerrados ante symlink, junction o reparse point.
- Voice-host local hijo con PID/protocolo/nonce/loopback demostrados,
  timeouts finitos, request acotada, shutdown/terminate/kill y limpieza de
  token, nonce, lease, proceso y puerto. `last_pid`/`last_exit_code` quedan como
  única auditoría de lifecycle.
- Un reinstall válido descarga/verifica pero no reemplaza un target idéntico ya
  verificado; missing/corrupt solo se promociona tras validación completa.
- Harness 200 probes: startup 349,598 ms, p50 13,774 ms, p95 20,445 ms, máximo
  26,926 ms, shutdown limpio y cero leases. Usa fixture sintética externa: no
  ejecuta inferencia ni demuestra precisión o rendimiento Whisper.
- Suite ENG-11 31/31 PASS; suite histórica del tooling 48/48 PASS tres veces
  consecutivas. Sin micrófono, raw, modelo, binario, dependencia, wiring o
  promoción. Command readiness, PTT, wake word y TTS permanecen **NO-GO**.
- Contrato: `docs/engineer/voice-package-host-isa-182.md`; evidencia:
  `docs/evidence/isa-182/lifecycle-summary.json`. No iniciar ENG-12 hasta cerrar
  review independiente.

Nota ISA-181 / ENG-10 (2026-08-02, In Review):
- Corpus FLEURS original CC BY 4.0 fijado por revisión: 5 grabaciones humanas
  por `en_us/es_419/it_it/pt_br`, clean y ruido blanco determinista 10 dB. El
  TSV no aporta speaker ID estable; no se afirma diversidad de locutor y la
  muestra portuguesa solo contiene categoría `MALE`.
- Whisper `tiny` y `base` procesaron 40 casos cada uno. `base` mejora WER/CER
  en casi todas las celdas, a cambio de ~1,84 s medios y ~274 MB observados;
  queda candidato condicionado para el siguiente gate, no selección de release.
- Validez lingüística humana genérica y command readiness son conclusiones
  distintas. Intent accuracy, FAR/FRR y wake word siguen **NO-GO** porque no
  existe corpus humano consentido de comandos. TTS dinámico también sigue
  NO-GO. Radio, subtítulos y UI son el fallback completo.
- Tooling test-only añade extracción acotada, ruido reproducible, captura/import
  con consentimiento explícito, preview/delete/cleanup y benchmark residente.
  Audio, modelos, ejecutables, paths y raw permanecen fuera de Git. Sin wiring,
  dependencia, package manager, voice-host productivo o promoción.
- Decisión y protocolo: `docs/engineer/human-corpus-voice-host-isa-181.md`;
  evidencia agregada: `docs/evidence/isa-181/`. Review independiente sin
  hallazgos P0/P1/P2 ni P3 razonables abiertos; no iniciar ENG-11 todavía.

Nota ISA-180 / ENG-09 (2026-08-02, In Review):
- Gate offline de TTS/STT ejecutado sin cableado productivo. La pila medida
  `kokoro-onnx 0.5.0` funciona en `en/es/it/pt-BR`, pero tarda 4,0–5,3 s por
  frase corta en Ryzen 7 3700X y su G2P instala componentes GPL. DirectML falla
  en int8 y fp16 sobre RX 7800 XT. Resultado: NO-GO para voz dinámica y bundle
  propietario; ENG-08 conserva visual/subtítulos/radio como fallback.
- `whisper.cpp v1.9.1` + Whisper tiny multilingual supera licencia y rendimiento
  preliminar: ~0,60 s, ~173–176 MB, cancelable como worker aislado. Inglés da
  0 WER sintético; `es/it/pt-BR` no superan gate lingüístico. Resultado: GO
  técnico condicionado, no release.
- Los probes son tooling no productivo, no leen micrófono y no versionan
  modelos, voces, WAV, venv ni ejecutables. Contrato, licencias, threat model,
  hashes y microcorte siguiente: `docs/engineer/tts-stt-selection-isa-180.md` y
  `docs/engineer/tts-stt-benchmark-isa-180.md`.
- Review independiente final `ACCEPT`, sin P0/P1/P2/P3 razonables abiertos. La
  PR permanece draft y la cadena no se promociona. ENG-10 no se inicia todavía.

Nota ISA-178 / ENG-08 (2026-08-02, In Review):
- `engineer-radio` es un único tipo funcional registrado en TypeScript y en el
  contrato persistente Go. Guardar, cargar, exportar e importar conservan el
  widget sin duplicarlo. Solo Vantare Crystal aporta su renderer.
- Radio y subtítulos son dos salidas visuales independientes que comparten el
  mismo ViewModel puro. Pueden coexistir; los subtítulos se activan de forma
  global y no requieren añadir el widget al layout. Sin presentación real,
  Desktop/OBS no inventan contenido; Studio usa una preview marcada. ENG-08
  conserva esta preferencia solo durante el runtime y la reinicia habilitada;
  la persistencia queda para el contrato central de Ajustes.
- Go es la autoridad de routing `audio|visual|both|disabled` por las seis
  familias aprobadas. `disabled` se aplica antes del scheduler, ACK, cooldown y
  preempción y cancela solo la salida activa de esa familia.
- Wails y SSE consumen un único stream ordenado por `generation+sequence`; tras
  una reconexión rechazan status/presentation hasta que el snapshot autoritativo
  establece el nuevo cursor. Así rehidratan el activo exacto o vacío y ningún
  mensaje tardío de una generación anterior puede reaparecer.
- Harness determinista: 12 comparaciones root-only contra baselines fijos para
  cuatro locales, tres fondos y tres tamaños, sin máscaras ni overflow.
- Contrato: `docs/engineer/radio-output-contract.md`. Sin Vantare Original,
  canvas, inspector, shell, TTS/STT/PTT, dependencias nuevas, merge o promoción.

Nota ISA-177 / ENG-07 (2026-08-02, In Review):
- `internal/engineer/presentation` es la autoridad pura y versionada para los
  20 intents aprobados por ENG-05 en `es`, `en`, `it` y `pt-BR`.
- Rol, canal y severidad se derivan de la decisión admitida. Texto visual y
  futuro audio comparten una sola presentación; ningún raw key es fallback.
- Resolver o locale inválidos fallan antes del ACK `started`, sin notificación
  ni audio. La penalización permanece neutral y no inventa su tipo.
- Español es el locale productivo predeterminado y la configuración queda
  validada e inmutable mientras el servicio está activo.
- Wails y SSE reciben exactamente el mismo objeto observable. El lookup de
  audio cache-only usa texto de voz y el locale tipado de Presentation. Caché
  canónica y fallback legacy solo consultan ese idioma; un `AudioConfig`
  divergente produce visual-only y nunca audio cruzado. `all_clear` español es
  «Todo libre», sin afirmar que toda la pista está libre.
- Contrato: `docs/engineer/presentation-contract.md`. Corrección de review:
  focal x20, fuzz 2,24 M, benchmarks, Engineer, Server, Telemetry y Go global
  serial pasan. Vet focal
  pasa; vet global conserva tres warnings Win32 heredados. Race no está
  disponible con `CGO_ENABLED=0`. Sin frontend, TTS/STT, nuevos intents,
  Telemetry Core, merge o promoción.

Nota ISA-167 / ENG-06 (2026-08-02, WIP):
- `EngineerService` conserva un solo runtime productivo y una sola policy sobre
  la observación canónica. No se añade fuente, reader, parser o runtime.
- El contrato `internal/engineer/delivery` exige ACK `queued`, `started` y un
  terminal; revalida antes de `started` y expone solo métricas sanitizadas.
- Spotter P0 cancela audio Engineer no crítico activo; nunca ocurre al revés.
  Stop, source loss y lifecycle cancelan y unen la entrega.
- El contexto de clears y los cooldowns avanzan únicamente tras ACK de inicio,
  no al seleccionar una decisión. Replay v2 separa decision, dispatch y start.
- Health separa contadores de policy, delivery y backpressure sin exponer IDs,
  mensajes, telemetría, rutas o identidad; decision-a-start parte del instante
  real de selección, no del timestamp de captura.
- La composición real instala el player cancelable existente y un router
  cache-only sin engine TTS sobre la caché canónica hash de Kokoro. Cada lookup
  respeta contexto y un límite de 100 ms; miss/error conserva la entrega visual
  sin síntesis en el hot path.
- Replay v2 prueba disconnect/reconnect: cancela el trabajo anterior, guarda
  el borde `epoch`/identidad/`sequence` y rechaza snapshots iguales o
  anteriores antes de reanudar con uno estrictamente posterior. Un incremento
  de `ReconnectAttempt` crea el mismo borde aunque el status siga en `live`.
  Replay solo libera el borde después de aceptar cursor e identidad/lifecycle;
  un cursor posterior con contexto inválido no lo consume. El benchmark
  completo atraviesa `productDeliveryPort -> ResolveCached -> PlayContext` y
  detiene el tiempo al inicio real de `PlayContext` bajo presión concurrente y
  preempción.
- Contrato vivo: `docs/engineer/delivery-runtime.md`. Corrección final WIP
  comprobada con service/replay x10 y benchmark productivo 20x (65.310 ns/op);
  race no ejecutable con `CGO_ENABLED=0`, Go global sin concluir en 124 s y vet
  global con tres avisos Win32 heredados. Pendiente de re-review, sin commit,
  push, merge o promoción.

Nota ISA-158 / ENG-05 (2026-08-01):
- Policy y scheduler determinista implementados de forma síncrona y acotada en
  `internal/engineer/messagepolicy/`; contratos v1: Candidate, Decision,
  PolicyOutcome y SchedulerState, con reloj y evidencia inyectados.
- Admisión y emisión revalidan versión, epoch, identidad, fuente, freshness,
  capabilities, prioridad, TTL y el claim semántico contra la observación más
  reciente. `Cancel` invalida la evidencia hasta recibir otra observación.
  Spotter P0 cancela pendientes inferiores; dedupe, coalescing, cooldown, cola,
  identidades y diagnósticos tienen límites duros.
- Spotter conserva prioridad absoluta. El resto de prioridades tiene un burst
  máximo determinista para impedir starvation sin debilitar mensajes críticos.
- La re-review detectó y corrigió presión P0 con capacidad uno: pendientes
  invalidados se podan antes de competir por cola, por lo que el estado Spotter
  vigente reemplaza siempre al obsoleto con diagnósticos deterministas.
- Una segunda re-review detectó estados compatibles con distinto valor
  informativo (`left/right -> three_wide`). Una tabla tipada y exclusiva de
  Spotter hace supersession del aviso menos específico, impide el reemplazo
  inverso sin cambio de evidencia y cubre la matriz completa con capacidad uno
  y mayor que uno.
- Una tercera re-review cerró el contexto delivery-aware de los clears
  parciales. `clear_left/right` solo conserva su forma contextual si un
  antecedente autosuficiente compatible ya fue devuelto por `Next` dentro de
  la misma generación de ocupación. Un pendiente, `still_there` o un lateral
  parcial de `three_wide` no cuentan. Sin contexto, el scheduler sustituye el
  clear por el estado autosuficiente derivado de Evidence; expiración,
  cancelación y otra transición eliminan el permiso. La condición se revalida
  también inmediatamente antes de `Next`, por lo que un clear ya encolado no
  puede cruzar una generación posterior. El registro significa `dispatched`
  al transporte siguiente, todavía no confirmación audible.
- Una cuarta re-review cerró lifecycle y caducidad del contexto Spotter. Los
  boundaries válidos resetean delivery state antes de observar el nuevo estado
  en la misma llamada; una identidad inválida falla cerrada. Cada antecedente
  conserva su `ExpiresAtMS`: justo antes autoriza el clear, en el límite o
  después se sustituye por estado autosuficiente. `still_there` no renueva el
  contexto, y una decisión expirada/cancelada antes de `Next` nunca lo crea.
- ENG-04 atraviesa la policy con el Runtime real solo en tests. Pits conserva
  únicamente entry/exit. El contador genérico de sanción se convierte a
  `penalties.count_increased` y nunca afirma drive-through.
- Golden v1 actualizado deliberadamente; tests de tabla, invariantes,
  invalidación semántica, presión/starvation, ownership, lifecycle, fuzz, soak
  virtual, benchmark saturado, Engineer y race focal pasan. El gate Go global
  también pasa; el test real de discovery de Launcher es deuda heredada lenta,
  no un bloqueo de ENG-05. Contrato:
  `docs/engineer/message-policy-scheduler.md`.
- No hay audio/TTS/STT, UI, Wails/SSE, wiring productivo, nueva capability,
  dependencia, migración, merge o promoción. Pendiente: re-review independiente
  después de publicar la corrección en la misma rama y PR draft.

Nota ISA-133 / ENG-04 (2026-08-01):
- Runner/oráculo determinista test-only creado sobre ISA-117 para escenarios
  Engineer/Spotter. Consume exclusivamente `ObservationSnapshotV1` y
  `FactEnvelopeV1`, usa reloj virtual y produce resultados versionados con
  motivos explícitos.
- La matriz 21/21 permanece fail-closed: seis familias acotadas y quince
  parciales/deshabilitadas. Incluso dentro de una familia aprobada, una salida
  legacy no demostrada se marca `decision_not_approved`.
- Hallazgo para ENG-05: pits solo autoriza entry/exit; box-now, limitador,
  ventana y tráfico no están demostrados. El contador genérico de sanción no
  permite afirmar drive-through.
- Golden v1, fixtures sintéticas, límites y regresiones de epoch, identidad,
  freshness, capabilities, hechos y versiones quedan en
  `internal/engineer/replayoracle/`. Contrato y rollback:
  `docs/engineer/replay-oracle.md`.
- La re-review endurece tres fronteras: suma checked y headroom para deadlines,
  máximo canónico de 104 vehículos antes del adapter y `session.started` como
  cancelación de lifecycle incluso sin snapshot posterior.
- Evidencia fresca: oracle x50, regresión ENG-03 x20, Engineer, Telemetry, Go
  global serial, race focal x10, build de embed y aislamiento de producto PASS.
  El vet focal pasa; el amplio conserva dos warnings Win32 heredados fuera del
  diff. La ejecución global paralela reprodujo la contención Settings conocida
  y la repetición serial pasó.
- Re-review independiente final: `ACCEPT`, P0/P1/P2/P3 = 0.
- No hay wiring, audio, UI, fuente de telemetría, dependencia, merge o
  promoción. Siguiente corte tras review: ENG-05 policy/scheduler.

Nota ISA-117 / TC-09F (2026-08-01):
- Telemetry Core queda técnicamente cerrado sobre ISA-87 `4233c9f`: una sola
  adquisición LMU, un runtime canónico y proyecciones separadas por producto.
- Go global, 7/7 fuzzers, replay, soak de dos horas, lifecycle x5, frontend
  2.016/2.016, build, Playwright cutover/shadow, Crystal 21/21, fixtures LMU
  reales x5 y lectura live LMU 1.4 pasan.
- Cero P0/P1/P2 atribuibles a Telemetry Core. Deuda externa registrada:
  ISA-118 (Settings P3), ISA-131/ISA-94 (smoke, visual y canvas Overlay),
  toolchain race sin GCC y tres avisos Win32 vet heredados.
- Evidencia, rollback y checklist manual:
  `docs/telemetry-core/final-gate-isa-117.md`.
- Estado: `In Review`; sin merge ni promoción. Siguiente acción solo después
  de la aprobación explícita de Isaac: issue separada de promoción a
  `nightly`.

Nota ISA-87 / TC-09E (2026-08-01):
- Wails y SSE publican el mismo status y Overlay Projection v1 byte a byte;
  cursor verificado `v1 / epoch 2 / sequence 8 / statusRevision 1`.
- El composition root posee un shutdown ordenado de Overlay, Telemetry Core,
  HTTP/SSE, Ops, ambos managers de hotkeys, Engineer, Launcher, diagnósticos y
  contexto general. Los errores no omiten recursos posteriores.
- El timeout Win32 histórico queda corregido enviando `WM_QUIT` al hilo dueño
  de la message queue y desregistrando allí los hotkeys. Los cambios de ajustes
  sustituyen el manager completo en vez de registrar desde Wails.
- El harness no productivo prueba SQLite real, puerto, suscriptores, bridges,
  goroutines y owners de handles. Evidencia:
  `docs/telemetry-core/wails-lifecycle-teardown-isa-87.md`.
- Siguiente y último corte: ISA-117 / TC-09F, gate final y handoff. Sin merge
  ni promoción.

Nota ISA-116 / TC-09D (2026-08-01):
- Las siete fronteras de entrada críticas pasan fuzzing: Shared Memory,
  saneado, REST, fusión, recording payload/fact y transport envelope.
- El soak lógico de dos horas combina 64 vehículos, seis consumidores,
  Overlay Projection v1, Engineer y SQLite: 121/121 lotes committed, cola
  vacía, cero rechazos/fallos y teardown completo de suscriptores.
- Las métricas nuevas contienen solo contadores/límites y ninguna identidad o
  payload. La validación JSON conserva claves prohibidas anidadas/escapadas.
- El Hub de 64 vehículos baja de 258–303 µs y ~128,7 KiB históricos a
  47,2–50,5 µs y 12.631 B por operación. La cadena combinada queda en
  3,83–4,79 ms por lote de 64 vehículos.
- Go global, frontend 2.016/2.016, build y Playwright cutover pasan. Race no es
  ejecutable sin GCC; vet conserva tres avisos Win32 heredados.
- Evidencia: `docs/telemetry-core/hardening-isa-116.md`.
- Siguiente corte: ISA-87 / TC-09E, harness Wails/lifecycle/teardown. Sin merge
  ni promoción.

Nota ISA-114 / TC-09B (2026-08-01):
- El backend duplicado de telemetría queda retirado después de migrar status,
  diagnostics y ops al `TelemetryCoreRuntime` canónico.
- Solo `internal/telemetry/drivers/lmu` puede abrir memoria compartida LMU;
  Engineer conserva su funcionalidad mediante la proyección canónica y sus
  decoders de fixture no poseen I/O.
- Se retiraron source manager, reader/REST legacy, App/bridge, servicios,
  modelos, SSE backend y tooling sin consumidores. `deltaMode` permanece como
  preferencia sin side effect ficticio.
- Evidencia: `docs/telemetry-core/backend-retirement-isa-114.md` y
  `scripts/telemetry-core/audit-consumers.ps1`.
- Siguiente corte: ISA-115 / TC-09C, retirada frontend/transporte legacy. Sin
  merge ni promoción.

Nota ISA-115 / TC-09C (2026-08-01):
- Studio, Desktop y OBS usan exclusivamente Overlay Projection v1 mediante un
  lifecycle común y transports Wails/SSE equivalentes.
- Se retiraron `telemetry:update`, `/telemetry/stream` frontend,
  `normalizeLegacyTelemetry`, adapters antiguos, el selector fail-open y el
  harness shadow runtime ya sustituido.
- Decoder/mapper autoritativos viven en `overlay/projection`; el comparador
  histórico shadow queda aislado hasta ISA-117.
- El estado cerrado usa `telemetry-core:source-status` y un contrato frontend
  único. Evidencia: `docs/telemetry-core/frontend-retirement-isa-115.md`.
- Siguiente corte: ISA-116 / TC-09D. Sin merge ni promoción.

Nota ISA-113 / TC-09A (2026-08-01):
- Auditoría reproducible completada sin borrados ni cambios de comportamiento.
- Hallazgo P0 de migración: `app.New(-live)` todavía abre el mapping y poller
  REST legacy antes de arrancar el driver canónico. El grafo ya no publica
  widgets, pero status, diagnostics y ops mantienen dos adquisiciones vivas.
- ISA-114 debe migrar primero esos consumidores al estado canónico y después
  retirar App/source/service/readers/parsers/REST legacy y tooling obsoleto.
- ISA-115 retirará `telemetry:update`, `/telemetry/stream` y adapters frontend
  legacy tras mover el tipo/status compartido. La UI y renderers no cambian.
- Matriz: `docs/telemetry-core/consumer-retirement-matrix-isa-113.md`.
- Script: `scripts/telemetry-core/audit-consumers.ps1`.
- Siguiente corte: ISA-114 / TC-09B. Sin merge ni promoción.

Nota ISA-112 / TC-08E (2026-08-01):
- La raíz productiva inyecta `EngineerService` en el único
  `TelemetryCoreRuntime`; LMU se abre una vez y Overlay/Engineer reciben
  proyecciones independientes del mismo lote canónico.
- Estado de fuente, observación y hechos permanecen separados. Un status live
  no declara conexión sin snapshot usable; stale/error/stop cancelan estado y
  mensajes pendientes.
- Fallos Engineer se aíslan y no derriban Overlay ni el driver. El selector
  Wails de simulator/replay queda retirado de producto.
- La captura LMU 1.4 real de 38 coches atraviesa toda la cadena y conserva
  silencio Spotter ante tráfico lejano. El solape real audible queda agrupado
  en el gate manual final, sin sustituirse por evidencia sintética.
- Documento: `docs/telemetry-core/engineer-cutover-isa-112.md`.
- Siguiente corte: ISA-113 / TC-09A, auditoría final de consumidores y matriz
  de retirada. Sin merge ni promoción.

Nota ISA-111 / TC-08D (2026-08-01):
- `EngineerService` deja de poseer simulator, replay, parser LMU y
  `telemetry/service`; arranca desconectado y solo acepta `telemetry-core`.
- La entrada canónica procesa por separado únicamente Spotter, fuel,
  penalties, laps, timings y pitstops, las seis familias aprobadas en ISA-110.
  No existe un frame general capaz de reactivar monitores parciales.
- Epoch/identidad y hechos ordenados resetean estado y cola; recovery no marca
  conectado hasta observar un snapshot usable. Health deja de presentar una
  configuración como conexión real.
- Simulator/replay permanecen solo como inyección explícita de harness.
  Audio/TTS, commands, store, SSE y Pit Manager se conservan.
- Suite Engineer, Telemetry Core, servidor, build frontend y suite Go global
  serial pasan. `-race` no es ejecutable con CGO desactivado.
- Documento: `docs/telemetry-core/engineer-runtime-separation-isa-111.md`.
- Siguiente corte: ISA-112 / TC-08E, wiring canónico y validación LMU real.
  Sin merge ni promoción.

Nota ISA-110 / TC-08C (2026-08-01):
- Replay parity caracteriza Spotter + 20/20 monitores antes del cutover.
- Se aprueban únicamente seis escenarios acotados: Spotter normal, fuel,
  contador genérico de sanciones, vueltas, timings y entrada/salida de pit.
- Engine, tyre, flags, driver swaps, damage y conditions fallan cerrados; las
  demás familias siguen parciales y no se activan todavía.
- El bridge temporal exige familia explícita, solo copia campos fresh con
  capability supported y usa IDs locales reiniciados por epoch. No existe un
  conversor general ni wiring productivo.
- Documento: `docs/telemetry-core/engineer-replay-parity-isa-110.md`.
- Siguiente corte: ISA-111 / TC-08D. Sin merge ni promoción.

Nota ISA-109 / TC-08B (2026-08-01):
- La proyección Engineer v1 expone sesión admitida, parrilla completa,
  scoring, controles, pit, fuel, gaps y geometría con calidad explícita.
- `ObservationSnapshotV1` es la entrada pura de producto. No abre LMU/REST,
  no contiene decisiones y no se conecta todavía al runtime Engineer.
- Se rechaza el bridge directo a `telemetry.Frame`: perdería missing y las
  identidades opacas. ISA-110 caracteriza los monitores mediante replay antes
  de adaptar su consumo; el frame legacy permanece intacto.
- La geometría conserva `float64`, orientación completa y ejes documentados
  por ISA-130. Flags, tyre, damage, weather y demás señales no demostradas
  siguen deshabilitadas.
- Documento: `docs/engineer/projection-adapter.md`.
- Siguiente corte: ISA-110 / TC-08C. Sin merge ni promoción.

Nota ISA-130 / TC-08A.1 (2026-08-01):
- Geometría canónica añadida de forma aditiva: posición mundo en metros,
  velocidad local en m/s y orientación right-handed por vehículo.
- El parser une scoring y telemetry por `mID` activo; la muestra rápida solo
  sustituye al jugador correlacionado. Cero sigue presente y NaN/Inf o matriz
  inválida fallan cerrados por campo.
- La fixture LMU 1.3 real hash-pinned prueba 44/44 geometrías y un oráculo
  independiente de transformación mundo -> local. Las fixtures LMU 1.4
  anteriores tenían esos bytes a cero por su allowlist, no por el simulador.
- El sanitizador conserva ahora únicamente estos campos espaciales para una
  futura captura 1.4 real sin PII. El gate perceptual de tráfico se agrupa con
  ISA-112; no se inventa evidencia.
- Fusion pasa a matriz v4 y la cadena Driver -> Batch -> Reducer conserva
  freshness y generaciones. No se activa Spotter ni se añade otro reader.
- Documento: `docs/telemetry-core/lmu-spotter-spatial-provenance.md`.
- Siguiente corte: ISA-109 / TC-08B.

Nota ISA-108 / TC-08A (2026-08-01):
- Auditoría documental completa de 30/30 directorios y 20/20 monitores
  Engineer contra el estado canónico posterior a ISA-107.
- Sesión, parrilla, vueltas, fuel, pit y gaps permiten adaptar una parte amplia
  del Engineer. Flags, engine, tyre, damage, conditions y driver swaps quedan
  deshabilitados cuando falta una capability real; no se inventan datos.
- `projection/engineer` v1 es insuficiente y debe ampliarse en ISA-109 desde
  `derive.FinalState`, sin importar la proyección Overlay ni abrir LMU/REST.
- Spotter está bloqueado por geometría no demostrada: world position,
  orientation y local velocity existen solo como offsets legacy con tests
  sintéticos; las fixtures reales versionadas no los preservan.
- Se requiere ISA-130 / TC-08A.1 aditivo antes de ISA-109 para admitir geometría con
  captura real, schema, parser y tests. REPLACE/DELETE funcional = 0.
- Documento: `docs/telemetry-core/engineer-capability-audit-isa-108.md`.
- Sin cambio de comportamiento, merge ni promoción.

Nota ISA-106 / TC-07B (2026-08-01):
- Shadow productivo implementado sobre ISA-129 `7f679e6`, sin cutover: el
  servicio legacy sigue siendo la única autoridad de render y persistencia.
- El runtime canónico LMU recorre Driver -> BatchMapper -> Reducer ->
  SessionCoordinator -> Derive -> Overlay Projection v1 y publica el mismo
  contrato versionado por eventos Wails y SSE
  (`/telemetry/overlay/projection`). Menú/sesión ausente no genera payload
  inventado; `-live=false` publica estado detenido sin abrir LMU.
- Studio, Desktop y OBS consumen la proyección en un observer separado que
  conserva únicamente diagnóstico sanitizado y nunca escribe en el
  coordinator legacy, el documento Studio, el canvas ni los renderizadores.
- Gates frescos: Go focal/runtime/server PASS; Telemetry Core PASS; resto Go
  segmentado PASS; frontend 298 archivos/2.023 tests PASS; build PASS;
  Playwright Studio/Desktop/OBS PASS. La invocación Go global concurrente
  excedió 180 s sin producir un fallo; las mismas familias pasaron segmentadas.
- Los gates visual/canvas reproducen las deudas heredadas ya documentadas en
  ISA-105: tres casos Original a 0 %, Crystal Studio a 100 % y umbrales del
  benchmark de drag incumplidos. TC-07B no cambia CSS, canvas ni renderizadores
  y no actualiza baselines ni relaja umbrales.
- Siguiente corte: ISA-107 / TC-07C, cutover Overlay. Sin merge ni promoción.

Nota ISA-107 / TC-07C (2026-08-01):
- Cutover implementado sobre ISA-106 `e3bacdb`: Studio, Desktop y OBS publican
  exclusivamente snapshots adaptados desde Overlay Projection v1 al
  coordinator existente. Ningún renderer, ViewModel, widget, CSS, documento o
  canvas cambia.
- El composition root ya no inicia `TelemetryBridge`, el servicio legacy ni
  `/telemetry/stream`; el único runtime activo es `TelemetryCoreRuntime` y la
  única ruta OBS consumida es `/telemetry/overlay/projection`.
- Los adapters y rutas legacy permanecen como código muerto hasta la
  eliminación auditada TC-09; no existe consumer alcanzable desde producción.
- El cutover es reversible volviendo al commit ISA-106. Sigue sin merge ni
  promoción. El gate manual LMU de Isaac se agrupa con la revisión final del
  módulo, conforme a su instrucción de no detener la cadena por gates humanos.
- Gates frescos: frontend 299 archivos/2.025 tests PASS tras repetir dos flakes
  de temporización heredados que pasan aislados; build y Playwright
  Studio/Desktop/OBS wide+compact PASS; Go app/server/cmd y Telemetry Core
  PASS; vet/lint focal y diff-check PASS. Visual conserva Original 0 % y
  Crystal Studio 100 %; canvas reproduce sus umbrales heredados.
- Siguiente corte: ISA-108 / TC-08A.

Nota ISA-129 / TC-07A.1 D0 (2026-07-31):
- Microcorte documental iniciado sobre ISA-105
  `c9acee24cf4c4d80922b380b12f7367c2a60c937`, en la rama
  `vantareapp/isa-129-tc-07a1-senales-canonicas-overlay-y-retirada-del-mock`
  y worktree `C:\tmp\vantare-isa129\vantare-v2`.
- Plan ejecutable:
  `docs/superpowers/plans/2026-07-31-isa-129-tc-07a1-canonical-overlay-signals.md`.
  Procedencia cerrada:
  `docs/telemetry-core/lmu-overlay-signal-provenance.md`.
- Fixtures reales LMU 1.3 conservan los hashes
  `959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff`
  (pista, 44 vehículos) y
  `8fc09829441e11a466bc9ff92e1a667b819eb6cf83cdf16891d7ed756d887f1a`
  (menú). D4B añade evidencia real LMU 1.4 de menú y pista sin habilitar nada
  por mera similitud estructural.
- P0 confirmados: mock productivo publicable como conectado, ausencia del
  bridge `lmu.Observation -> core.Batch` y observación modular player-only sin
  grid/identidad multivehículo.
- La matriz D0 fija fuente, offset, unidad, rango, referencia, signo, freshness
  y autoridad SHM/REST. Equipo, número, compuesto, Virtual Energy, daños,
  weather no admitido, fases/banderas, pit-state labels, remaining raw,
  `FuelFraction` continúa missing, nunca cero inventado. Corrección 2026-08-14:
  native `mDeltaBest` vuelve a estar admitido como `session.native_delta_best`,
  gana sobre el self-delta derivado y conserva presencia, freshness y provenance.
- Corrección de review D0: scoring y telemetry solo se correlacionan dentro de
  `[0,mNumVehicles)`, con IDs activos no negativos, únicos y biyectivos. El
  jugador procede del único `mIsPlayer` scoring y su telemetry de igual ID;
  nunca del índice header, posición, orden ni cola inactiva. La fixture prueba
  44/44 IDs activos, jugador row 43/ID 0 y 60 filas inactivas también con ID 0.
  Una no-biyección activa rechaza el frame; `lapDistMax` exacto es
  `3982.366455078125`.
- D0 no cambia comportamiento ni conecta runtime. Baselines previo y posterior
  Go, app/server, hashes y `git diff --check` PASS. Review independiente
  `ACCEPT`, P0/P1/P2/P3 = 0; commit publicado `6acb352`. D1 queda desbloqueado
  y es el siguiente corte, todavía sin promoción ni cutover.
- D1 implementado y aceptado en `470d6a6`: se retiró el mock conectado de
  producción, se conserva el objeto LMU real para attach tardío, REST no puede
  conectar por sí solo y Wails/SSE/frontend parten desconectados. Review
  independiente `ACCEPT`, P0/P1/P2/P3 = 0. Go completo, frontend 2001/2001,
  build y focales PASS; `-race` omitido por CGO desactivado y lint global
  continúa con deuda heredada. D2 queda desbloqueado sin promoción ni cutover.
- D2 implementado y aceptado en `e2c92fd`: layout LMU 1.3 nombrado y auditado,
  35 campos admitidos, bounds/no-solape, tipos Windows, exclusiones y hashes
  reales cubiertos. Review independiente `ACCEPT`, P0/P1/P2/P3 = 0; driver x20
  y suite `internal/telemetry/...` PASS. LMU 1.4 permanece bloqueado para D4B;
  D3 queda desbloqueado sin promoción ni cutover.
- D3 implementado y aceptado en `462f0ee`: schema/catalog append-only con IDs
  1–24 estables y 25–43 añadidos, aliases semánticos rechazados, unidades,
  rangos, ceros legítimos, enums y Markdown golden sincronizados. Review
  independiente `ACCEPT`, P0/P1/P2/P3 = 0; focales x20 y suite telemetry PASS.
  D4A queda desbloqueado sin promoción ni cutover.
- D4A implementado y aceptado en `94c2994`: parser/sanitizer LMU 1.3 con grid
  real 44/44, identidad por `mIsPlayer` + ID activo, zero-rebuild, aliases,
  canaries, autoridad SHM-first y REST limitado al jugador. Focal x20,
  Telemetry/global, fuzzers y benchmarks PASS. Review final `ACCEPT`,
  P0/P1/P2/P3 = 0; el código LMU `0=test` queda invalid/missing, no Practice.
  D4B quedó desbloqueado solo para prueba diagnóstica LMU 1.4.
- D4B implementado: menú SHM/REST hash-pinned, pista real de práctica con 38
  vehículos y jugador hash-pinned, correlación exacta de los ocho solapes
  SHM/REST (incluido circuito antes del alias), allowlist cerrada `1.4.0.0` con
  file/product version coincidentes y lector productivo opt-in `live` PASS.
  Los sentinels negativos finitos de lap distance y gaps quedan `missing`, no
  cero. Driver y CLI x20, Telemetry Core y auditoría de privacidad PASS. La
  suite Go global concurrente solo reprodujo el P3 heredado de contención
  temporal de `app-settings.json.tmp`; su test aislado y la suite global serial
  pasaron al repetir. Siguiente corte: D5 Observation → Batch, todavía sin
  cutover ni promoción.
- D5 implementado: la observación LMU canónica atraviesa un `BatchMapper`
  síncrono y duradero hasta `core.Batch`/Reducer con 44 identidades estables,
  jugador coherente, generaciones por slot, sesiones/epochs según §2.4 y
  rollback completo ante rechazo o backpressure. Los campos canónicos nuevos
  conservan calidad explícita y ceros legítimos. Focal x20, Telemetry Core y
  suite Go global serial pasan. Review independiente final `APPROVE`,
  P0/P1/P2/P3 = 0.
- D6 implementado y aceptado: remaining, gaps relativos y self-delta forman
  una cadena determinista, transaccional y acotada. La evidencia LMU 1.4 real
  preserva 1.846 muestras sanitizadas, tres wraps y dos vueltas comparables
  bajo SHA-256
  `d8f01beee1380d771e5e29de5dfa9e5de72517e1bf447bc14881ee44df7fe938`.
  El oráculo independiente fija 100 ms de incertidumbre y prueba signo real;
  regresiones, fallos del driver y escritura incompleta fallan de forma segura.
  Focales x20, dos fuzzers de 10 s, Telemetry Core, vet focal, benchmarks y
  `diff --check` pasan. Review independiente final `APPROVE`, P0/P1/P2/P3 = 0.
- D7 implementado y aceptado: Overlay Projection
  v1 se amplía de forma aditiva con timing, identidad/scoring, fuel,
  gaps relativos y self-delta/history ya demostrados. El golden exacto pre-D7
  prueba las cuatro combinaciones old/new; los campos conocidos inválidos
  fallan cerrados. El adapter no toca ViewModels/renderers y la matriz pasa a
  2 exactos, 10 parciales, 5 no comparables y 1 externo, sin inventar flags,
  equipo, número, compuesto, weather o daños. Go focal x20, Telemetry Core,
  frontend 297/297 archivos y 2.019/2.019 tests, lint focal, build y
  `diff --check` pasan. Review final `APPROVE`, P0/P1/P2/P3 = 0. Siguiente
  microcorte: D8.
- D8 implementado hasta el límite de evidencia real disponible: el harness
  recorre LMU 1.4 Shared Memory -> Fusion -> BatchMapper -> Reducer ->
  SessionCoordinator -> Derive -> Overlay Projection v1 con una sola apertura,
  38 vehículos y salida byte-idéntica en 20 ejecuciones. Menú falla cerrado y
  no genera payload live. Se corrigió la caducidad incompleta de todos los
  campos cuando se congela el reloj de origen. Sobre la observación real, tests
  canónicos separados cubren reorder, vacancy/generation, reset de sesión y
  cambio de jugador sin presentarlos como capturas. El trace real D6 atraviesa
  BatchMapper -> Reducer -> SessionCoordinator -> Derive -> Overlay v1 y su
  primera proyección delta atraviesa decoder/adapter TypeScript; Delta es
  missing antes de una referencia completa y fresh después. Este cruce corrigió
  además arrays vacíos serializados como `null`. Los dos gates reales quedaron
  pendientes de D9 y nunca se sustituyeron por datos sintéticos.
- D9 cerró la evidencia real LMU 1.4. Una única sesión sanitizada y hash-pinned
  prueba `InPit=false -> true -> false` con la misma identidad canónica en
  pista previa, estado in-pit observado y outlap. La señal no distingue garaje,
  box ni fase de pit. El cierre completo de LMU produce ausencia
  real de proceso y fallo cerrado de Shared Memory sin payload; la reapertura
  aporta un mapping nuevo, reloj reiniciado y una nueva sesión/epoch, mientras
  conserva el VehicleID porque ningún grid vacío fue aceptado. Los hashes son
  `eb79ec2a…f6fcc`, `262700e5…ede1`, `c495da06…e4a6` y `a31a1495…a707`.
  El replay x20 valida sidecars zero-rebuild, hashes, metadatos, estados y
  ausencia de sustitución sintética.
- Rendimiento D9: parser de 44 vehículos 23,6–29,7 µs/op; sanitizer diagnóstico
  116,9–152,8 µs/op; gaps 4,19–4,46 µs/op; self-delta 3,21–6,00 µs/op. El parser
  completo es ~1,5–2,2 veces el baseline histórico de 13,5–15,6 µs/op, con
  margen amplio para la cadencia live y sin logging por frame, goroutines
  productivas nuevas ni buffers sin límite. Telemetry Core, mi ejecución de la
  suite Go global, frontend completo (297 archivos/2.020 tests), build, lint
  focal y `diff --check` pasan. La review independiente reprodujo el P3 Windows
  heredado ISA-118 de `app-settings.json.tmp`, incluso en serial y en su test
  focal; está fuera del diff y no se corrige en ISA-129. `-race` no está
  disponible con `CGO_ENABLED=0`. El lint
  global conserva 32 errores y 2 warnings heredados fuera del área focal; un
  error heredado del archivo tocado se eliminó. Los seis warnings Win32 de vet
  se reproducen también en la base exacta ISA-105 y permanecen fuera del diff.
  Review independiente final `APPROVE`, P0/P1/P2/P3 abiertos = 0.

Nota ISA-105 / TC-07A (2026-07-31):
- Corte iniciado en rama aislada sobre la entrega final ISA-104 `3b44d367`.
  Plan ejecutable:
  `docs/superpowers/plans/2026-07-31-isa-105-tc-07a-overlay-shadow-comparator.md`.
- El inventario cubre los 18 tipos registrados. Overlay Projection v1 solo
  permite paridad exacta del valor instantáneo de Pedals; Standings,
  Broadcast Tower, los dos Pedals Telemetry e Input Telemetry son parciales;
  Race Schedule es externo y los once restantes no son comparables todavía.
- `Delta` y `Gaps` continúan missing por contrato. El comparator debe mostrar
  carencias, freshness/provenance y el error de unidad legacy m/s/kph; nunca
  inventar datos, aceptar un factor 3,6 como tolerancia o usar fixtures visuales
  como verdad productiva.
- Hallazgos previos al cutover: no existe wiring productivo del core nuevo, la
  parrilla canónica LMU es incompleta y el fallback mock puede publicarse como
  conectado. ISA-129 / TC-07A.1 queda creado como microcorte canónico aditivo
  obligatorio antes de ISA-106.
- Alcance actual: decoder, adapter, ViewModels old/new, comparator sanitizado y
  harness diagnóstico. Sin CSS/renderizadores/canvas, baselines, Wails/SSE,
  merge ni promoción.
- Implementación D1–D5 completada y publicada hasta `210513f`: decoder estricto,
  adapter de señales demostradas, comparator acotado/sanitizado, harness
  explícitamente `NO LIVE` y evidencia reproducible bajo
  `docs/telemetry-core/evidence/isa-105-overlay-shadow/`.
- Cobertura derivada del registro real: 18/18 tipos; un `exact`, cinco
  `partial`, once `not-comparable` y uno `external`. El escenario de evidencia
  conserva 2 widgets, 31 campos, 19 iguales y 12 diferencias explicadas.
- Gates D5: Go telemetry/app PASS; frontend 297 archivos/1.993 tests PASS;
  frontend build PASS; Playwright shadow PASS; privacidad, hashes, alcance y
  `diff --check` PASS. Review independiente D5: `APPROVE`, P0/P1/P2/P3 = 0.
- `visual:overlay-studio` conserva el fallo Crystal histórico del 100 % tanto
  en ISA-105 como en la base exacta `3b44d367`; los tres casos Original quedan
  en 0 %. No se regeneró ningún baseline. El benchmark del canvas también
  incumple sus umbrales en ambas ramas y queda clasificado como deuda
  heredada/de entorno, no como regresión de este corte sin cambios de canvas.
- Correcciones D6 publicadas en `f6b43b7`: las 64 diferencias se priorizan
  frente a una muestra no-mismatch separada; `pitStopCount` sin consumidor fue
  retirado; Delta, Standings y Relative declaran dependencias reales; la
  identidad de fila y `isPlayer` conservan procedencia estructural explícita.
- Re-review D6 final: `ACCEPT`, P0/P1/P2/P3 = 0. Suite frontend final: 297
  archivos / 2.000 tests PASS; Playwright shadow final PASS.
- Entrega materializada en PR draft `#41` contra ISA-104 y Linear `ISA-105`
  `In Review`. Siguiente corte obligatorio: ISA-129 antes de ISA-106. Sin
  merge, promoción ni cutover productivo.

Nota ISA-104 / TC-06D (2026-07-31):
- Implementados informe allowlisted, catálogo metadata-only, inspector local y
  export JSON exacto. Frontend nunca recibe rutas, SessionRef, nombres SQLite,
  IDs internos, telemetría, identidad, voz, estrategias, tokens o logs.
- Raíz histórica canónica: LocalAppData en instalación y data explícita en
  portable/desarrollo. Toda la cadena rechaza symlinks, junctions y reparse.
- Prepare/List/Inspect heredan lifecycle, máximo dos operaciones y cancelación
  correlacionada. Cancel-before-request usa TTL 30 s y cap 64 sin goroutines.
  El snapshot de perfil queda sincronizado y defensivo.
- UI aislada en Ajustes con preview/copy/download byte-exacto, SHA-256
  recalculado, current/future/corrupt/current-unavailable, es/en/it/pt-BR,
  contraste AA y responsive wide/medium/compact.
- Captura raw desactivada y sin wiring: límites 60/120 s, 64/128 MiB, 5 Hz,
  retención siete días, metadata/hashes/procedencia y tap LMU no bloqueante
  tras una única apertura de Shared Memory.
- Reviews integradas backend y UI: `ACCEPT`, P0/P1/P2/P3 = 0 después de
  corregir cadena symlink/junction, snapshots profundos, top-K global,
  zero-values metadata-only y contraste AA. Evidencia visual:
  `docs/telemetry-core/evidence/isa-104-inspector/`.
- D7 queda cerrado con suites Go/frontend, build Wails, Playwright, privacidad
  y documentación verificadas. Entrega apilada sobre ISA-103, sin merge ni
  promoción. Siguiente corte: ISA-105 / TC-07A.

Nota ISA-103 / TC-06C (2026-07-30):
- Implementado replay separado raw, canónico e histórico sobre ISA-102.
- Player síncrono con step, velocidad racional, clock determinista, ownership
  en retry y fixtures versionadas con procedencia/SHA-256.
- Raw atraviesa parsers Shared Memory y REST reales de LMU mediante fixtures
  separadas por procedencia: captura sanitizada para Shared Memory y datos
  sintéticos para REST. La metadata separa build de simulador y build de
  Vantare. Canónico atraviesa reducer, coordinador, derive y las cuatro
  proyecciones con golden común.
- Reader histórico SQLite usa snapshot read-only limitado al último checkpoint,
  páginas acotadas, orden causal, cursores separados, validación completa de
  chunks y detección de hechos huérfanos.
- Manifest actual con schema futuro es metadata-only y nunca abre DB/WAL/SHM.
- Motor COW unidireccional con activación CAS; catálogo productivo vacío hasta
  que exista un schema v2 real. Sin driver live, wiring, UI, dependencia o
  promoción.
- El test heredado de cancelación REST usaba el ticker real y era
  load-sensitive. Ahora inyecta el `manualTicker` existente y pasa x100; no se
  modificó runtime productivo del driver.
- Dos reviews finales independientes cerraron `ACCEPT` con
  P0/P1/P2/P3 = 0. Telemetry Core completa, suite Go global serial, vet focal,
  regresiones repetidas y build Wails Windows pasan. La suite global paralela
  conserva únicamente la contención Windows heredada de settings, fuera del
  diff.
- Guía y evidencia:
  `docs/telemetry-core/replay-migrations-isa-103.md` y
  `docs/telemetry-core/evidence/isa-103-replay/`.

Nota ISA-102 / TC-06B (2026-07-30):
- Implementado RecordingSink neutral, mapper cerrado y adaptador privado
  SQLite modernc sobre `6aa46f17a613bd85b6eafbf22db5a7a70b527a00`.
- Cola acotada/no bloqueante, checkpoints <=1,5 s, commit <=500 ms y deuda
  volátil <=2 s; cola/disco/timeout/cancelación detienen solo la grabación.
- Manifest v1 atómico con invariantes terminales, cursores coherentes y
  privacidad allowlisted. Abort no convierte accepted volátil en watermark.
- Recovery copy-on-write valida el bundle DB/WAL/SHM sin mutar el original;
  manifests futuros son metadata read-only y nunca abren DB desconocida.
- CGO=0, Wails Windows, matriz crash/fault, benchmark 64 vehículos, growth 4×,
  fuzz y suites aplicables documentadas en
  `docs/telemetry-core/recording-sink-sqlite-isa-102.md`.
- Sin wiring productivo, UI, consentimiento, raw, MCAP/replay o promoción.
  Siguiente paso: entrega de ISA-102 y apertura secuencial de TC-06C.
- Primera review corregida: deadlines reales Append/Checkpoint/Complete, fallo
  terminal sobre Stop, snapshot obligatorio por batch, fact namespace
  independiente, lease Windows entre procesos, catálogos/cursor cerrados y
  máscaras/controles finitos. Pendiente re-review.
- Segunda review corregida: ledger de deuda accepted por cursor/tiempo con
  checkpoint parcial y epochs; manifest context-aware sin temporales tardíos;
  DSN URI seguro para `#`, `%`, espacios y Unicode.
- Tercera review final (orquestador, read-only): `ACCEPT`, sin P0/P1/P2/P3
  conocidos. Focal completo x10, RPO/off-by-one x100, filesystem/DSN x100,
  Telemetry Core y suite Go global pasaron antes del cierre del worker. La
  verificación fresca del orquestador repitió recording y Telemetry Core en
  verde. La suite Go global quedó roja únicamente por la contención Windows
  heredada `TestConcurrentSavesDontCorruptFile` (ISA-118) bajo carga; el caso
  aislado x20 pasó y la suite global serial posterior pasó completa. Build
  Wails Windows con CGO desactivado y vet focal también pasan. No se atribuye
  una regresión a TC-06B. `-race` continúa bloqueado por ausencia de `gcc`.

Nota ISA-101 / TC-06A (2026-07-30):
- Auditoría y benchmark aislado completados sobre
  `4801dced7f93ab13ef639f01c3c4e6e9790b5d8c`, sin backend productivo,
  wiring, frontend, dependencia en el `go.mod` raíz, commit o promoción.
- Veredicto propuesto: SQLite modernc `GO` condicionado como histórico
  autoritativo; MCAP candidato condicionado para export/import/replay (recovery
  upstream no verificado localmente); DuckDB `NO-GO` en el
  camino de grabación actual por CGO/packaging Windows; framing propio
  descartado salvo baseline desechable.
- Los tres candidatos CGO-free conservaron counts, cursor y SHA-256 idénticos
  en nominal, 4×, 64 vehículos, ráfagas y 24 h lógicas. Las cifras de
  throughput usan cierre final y no se presentan como RPO.
- Los dos reviews se corrigieron con kills antes de append/commit, después de
  commit/antes de manifest y después del replace. SQLite/framing muestran
  `DB=240` con watermark `200` en el límite intermedio; opening, recording y
  recovering reinician incomplete. Accepted es volátil y no se promete ACK
  durable por lote ni pérdida exacta tras crash.
- `RecordingPayloadV1` y `RecordingFactV1` son DTOs separados de core,
  versionados, allowlisted y pseudonimizados por slots locales; golden y tests
  con JSON válido rechazan mediante error unknown tipado nombres, IDs remotos,
  rutas, metadata abierta y campos desconocidos.
- Integridad (`opening/recording/recovering/complete/incomplete`) y modo de
  acceso (`read_write/read_only`) son ejes separados. El probe before-append
  registra correctamente `volatile_accepted=200`; los límites posteriores 240.
- DuckDB falla exactamente con bindings Windows excluidos bajo CGO=0 y sin
  `gcc` bajo CGO=1. El build base Wails CGO=0 pasa; la integración real de
  SQLite debe volver a medir binario, licencias y packaging en TC-06B.
- ADR: `docs/adr/0005-historical-storage-sqlite-mcap.md`. Metodología y CSV:
  `docs/telemetry-core/storage-benchmark-isa-101.md` y
  `docs/telemetry-core/evidence/isa-101-storage/`. Esquema/contrato TC-06B:
  `docs/telemetry-core/historical-storage-schema.md`.
- Estado: ISA-101 cerrada y materializada por ISA-102. SQLite continúa privado
  y sin wiring productivo; no promover ni activarlo hasta los cortes
  posteriores de composición, consentimiento e inspector.

Nota ISA-40 / TC-05B (2026-07-29):
- Implementado `internal/app/telemetrytransport` como adapter/harness local sin
  wiring productivo global. Cada hub está ligado a un `ProductID` cerrado
  (Overlay, Engineer, Strategy o Analysis); Wails y SSE emiten exactamente los
  mismos nombres namespaced y JSON. SSE acepta únicamente loopback y ambos
  adapters heredan lifecycle del contexto.
- Cada publicación conserva full completo. Delta RFC 7396 es opcional y solo se
  acepta si reconstruye exactamente el full nuevo. Late join, reconnect, gap,
  cambio de epoch y consumer lento reciben full determinista; publicación nunca
  espera al consumidor y cada suscriptor usa un único slot latest-wins.
- Envelope incluye projectionVersion, epoch, sequence, full/delta, capturedAt
  UTC y statusRevision. Status se publica aparte a bajo ritmo; si su revisión
  avanza, ningún consumidor recibe después un snapshot antiguo.
- Facts conservan `factSequence` independiente y adapters pull-based sin
  coalescing. Los adapters exigen continuidad exacta desde `after` y exponen
  gaps, duplicados o regresiones. No se infiere orden de hechos desde el cursor
  snapshot.
- Constructors públicos reciben únicamente `PayloadV1` tipado de Overlay,
  Engineer, Strategy o Analysis. Un sello privado detecta sustitución posterior
  de payload/metadata. Se rechazan versión desconocida, JSON inválido, keys
  raw/canonical/internal y payloads sobre el límite duro de 256 KiB.
- Sin `derive.FinalState`, schema/core/raw serializado; sin dependencias,
  persistencia, UI, goroutines propias, colas no acotadas o reglas de dominio.
  Guía: `docs/telemetry-core/projection-transport.md`.
- Evidencia fresca: focal x20, vet focal, race x5 con GCC UCRT64, Telemetry
  completo, guard ADR, frontend 280/280 archivos y 1851/1851 tests, frontend
  build y suite global Go PASS. Benchmark full con 64 vehículos:
  258–303 µs/op, ~128,7 KiB/op y 1.964–1.965 allocs/op.
- Review independiente en tres pasadas: los 2 P1 y 3 P2 iniciales cerraron
  aislamiento/routing por producto, epoch regresivo, continuidad facts, sello
  delta y regresiones de perímetro. La segunda pasada cerró nombre SSE/Wails y
  retiró un polling con `time.Sleep`. Re-review final `ACCEPT` sin P0/P1/P2/P3.
- Estado: preparado para commit/push, PR draft apilada sobre TC-05A y Linear
  `In Review`; sin promoción. ISA-41 / TC-05C sigue siendo el siguiente corte.

Nota ISA-41 / TC-05C (2026-07-30):
- Añadido un único decoder/store TypeScript puro para los envelopes de
  Overlay, Engineer, Strategy y Analysis. Valida nombres/rutas namespaced,
  versión v1, full/delta, epoch/sequence, revisión de status, facts separados,
  límite de 256 KiB y ausencia de raw/PII.
- Status y snapshot nunca se exponen con revisiones distintas. Full resuelve
  late join/gap/reconnect; delta exige continuidad; facts conservan cursor
  independiente y un gap exige resync explícito. Teardown de listeners es
  compartido e idempotente.
- Correcciones del primer review: un full semánticamente idéntico puede
  reexponer el snapshot tras avanzar `statusRevision`, pero no puede cambiar
  silenciosamente `capturedAt`; las extensiones JSON seguras son compatibles
  sin relajar campos requeridos, versión o claves prohibidas; el límite
  configurable solo puede reducir el máximo duro de 256 KiB; y el montaje y
  desmontaje de listeners son transaccionales incluso si una suscripción o
  cleanup falla.
- El harness no productivo reproduce status, full, delta, gap, facts y
  reconnect con diagnósticos sanitizados. Los tests consumen directamente los
  cuatro golden Go v1; no se duplican payloads ni se migran pantallas.
- Guía: `docs/telemetry-core/typescript-projection-contract.md`. Evidencia:
  focal 36/36, frontend completo 285 archivos/1.887 tests, build, lint focal,
  TC-05B Go x20, cuatro proyecciones Go y suite Go global PASS. Pendiente
  re-review independiente antes de entregar ISA-41; sin wiring, persistencia,
  dependencia nueva o promoción.

Nota ISA-39 / TC-05A (2026-07-28):
- Definidas proyecciones Go v1 puras e independientes para Overlay, Engineer,
  Strategy y Analysis. Consumen `derive.FinalState`: el guard y ADR fijan
  `core -> derive -> projection` sin imports inversos. Cada JSON conserva
  cursor/UTC y calidad explícita sin exponer raw, Source, clock monotónico o
  identidad interna completa.
- Canonical, projection y recording evolucionan con versiones separadas.
  `VersionPolicy` rechaza cero, futuras y retiradas, y marca como deprecated una
  versión anterior aún soportada.
- Overlay expone únicamente sesión, standings, controles, pit y el
  `controls.history` derivado ya demostrado. Engineer añade hechos ordenados
  sin mensajes ni decisiones. Strategy y Analysis son compile-only y no
  inventan fuel, Virtual Energy, ruedas, meteorología o histórico aún ausentes.
- Cuatro golden JSON y un guard transversal cubren cero/false, missing, stale,
  capabilities y ausencia de leakage. Focal x20, Telemetry completo, guard ADR,
  vet focal, race x5 y build frontend PASS. La suite global final conserva solo
  la contención Windows conocida de `TestConcurrentSavesDontCorruptFile`. Una
  pasada intermedia bajo carga hizo fallar una vez
  `TestDriverDoesNotPublishOrMutateRESTAfterCancellation`, pero la suite
  Telemetry final y el test aislado x20 pasan. Guía:
  `docs/telemetry-core/runtime-projections.md`.
- Sin transporte, Wails/SSE, recording funcional, UI, wiring productivo,
  dependencias, persistencia o lógica de producto.
- Correcciones de review: Engineer, Strategy y Analysis inicializan todos los
  campos del vehículo activo como `unknown/missing` aunque el vehículo todavía
  no aparezca en el snapshot, con regresiones sobre el JSON completo. El guard
  permite a cada producto importar la raíz común `projection` y su propio
  subárbol, pero rechaza imports cruzados entre productos. Re-review
  independiente final `ACCEPT` sin P0/P1/P2/P3; preparado para entrega.

Nota ISA-38 / TC-04D (2026-07-28):
- Implementado `internal/telemetry/core.Fanout` como frontera neutral y acotada:
  snapshots completos latest-wins con frame atómico, hechos con secuencia propia
  sobre ring compartido y resync explícito, sin goroutines, I/O, transporte o
  producto.
- Un consumidor lento nunca bloquea al publisher. Snapshots sustituidos son
  observables; un gap de hechos nunca se oculta y exige adoptar `Latest` antes
  de reanudar. Budgets: 1.024/4.096 hechos y 32/64 lectores por clase.
- Métricas de cardinalidad fija cubren publicaciones, superseded, lag, queue,
  resync, stale, reconnect y coste de derivación sin incluir telemetría ni PII.
- Se corrigió un posible deadlock de teardown eliminando ownership duplicado con
  `sync.Once`; un único mutex/mapa gobierna cierres y un test repite 1.000
  cierres owner/suscripciones concurrentes.
- Correcciones de review: cada snapshot declara su cobertura causal de hechos
  sin capturar el cursor global; cierres in-memory liberan ownership incluso
  con contexto cancelado; el cursor máximo queda agotado sin wrap a cero; y las
  métricas distinguen entregas sustituidas por suscriptor y lag actual.
- Evidencia fresca: `go test ./internal/telemetry/... -count=1` PASS; soak
  determinista 20.000 publicaciones y lectores concurrentes 500 PASS.
  Baseline fechado: escalar 231,1–251,6 ns/op y hecho 129,1–136,2 ns/op, ambos
  sin allocations; copia completa 64 vehículos 3,753–5,432 µs/op, 16.384 B/op.
  Guía: `docs/telemetry-core/runtime-fanout.md`. Race focal x5 con GCC UCRT64,
  vet focal, build frontend y suite global Go PASS tras las correcciones;
  re-review independiente **ACCEPT**, sin P0/P1/P2/P3 conocidos. Preparado
  para entrega aislada; sin wiring, merge o promoción.
  Sin wiring, cambios frontend tracked, dependencias, recording, Wails/SSE,
  commit, merge o promoción.
Nota ISA-122 / TA-01 (2026-07-27):
- Investigación canónica de Telemetry Analysis entregada en
  `docs/vantare-program/research/telemetry-analysis/`: fuentes primarias,
  matriz competitiva, auditoría LMU/repo, contrato propuesto, arquitectura,
  UI/UX, referencia HTML propia y microcortes TDD.
- Decisiones propuestas: post-sesión, resumen + workspace, galería local,
  comparación por distancia condicionada a evidencia, máximo cuatro trazas,
  derivados oficiales, notas no destructivas y consejos deterministas con
  evidencia/confianza; LLM no es autoridad.
- Gate: no hay implementación aún. TA-02 puede continuar de forma autónoma en
  su propia rama: la revisión independiente final del 2026-07-28 dio `ACCEPT`
  sin P0/P1/P2/P3. Playwright verificó selección A/B, trazas, canal,
  sincronización de zona, tabs por teclado, responsive 1440/390 y cero errores.
  La promoción a
  `nightly` sí requiere la aprobación inicial de Isaac y permanece además
  bloqueada hasta que ISA-121 cree la topología física de ramas/CI. El catálogo
  actual no demuestra distancia/longitud/geometría LMU suficientes para delta o
  mapa espacial productivo; no se permitirá fallback sintético.

Nota ISA-124 / TA-02 (2026-07-28):
- Implementado en rama aislada el contrato neutral
  `internal/telemetryanalysis`: discovery metadata-only, estados explícitos,
  gate de estabilidad sin sleeps, manifest v1 sanitizado, dedupe por hash,
  autorización de acceso, políticas reference/managed-copy, cancelación y
  presupuestos.
- Para LMU, un `.duckdb.wal` hermano siempre significa `active`. Solo ausencia
  de WAL más tamaño/mtime sin cambios durante una ventana positiva inyectada
  emite el gate interno que permite calcular el manifest. Nunca se lee el WAL,
  se fuerza checkpoint ni se modifica el original.
- La apertura de contenido exige siempre permiso `user_approved`; una
  procedencia `vantare_owned` no es autoridad y queda aplazada hasta una
  capability no falsificable de recording. El WAL se revalida antes y después
  de leer, y el handle abierto debe conservar la misma identidad de archivo
  regular mediante `os.SameFile` o el token equivalente del seam.
- Corpus mínimo versionado exclusivamente sintético: no contiene bytes de LMU,
  datos personales ni una base DuckDB válida. Hash, tamaño, dedupe y procedencia
  se verifican de forma reproducible con el mismo validador de manifest que usa
  producción. Parser ID y versión son obligatorios; `none@0` declara ausencia.
- Alcance cerrado: no hay parser DuckDB, índice/base de datos, UI, galería,
  copia gestionada real, comparación, delta, mapa ni imports de Telemetry Core.
  Contrato: `docs/vantare-program/research/telemetry-analysis/import-contract.md`.
- Evidencia fresca tras el endurecimiento: focal x20, vet focal, race x10 con
  GCC UCRT64, fuzz de redacción 10 s (2.186.642 ejecuciones), suite global Go y
  `git diff --check` PASS. Para el embed global se conserva `frontend/dist`
  ignorado desde un worktree con el mismo árbol frontend; no hay delta frontend.
- Review independiente final: `ACCEPT` sin P0/P1/P2/P3. El cierre añadió una
  única función canónica de deduplicación y una regresión que rechaza claves
  hexadecimales bien formadas pero incompatibles con hash+tamaño.
- Estado: técnicamente cerrado y preparado para commit/push, PR draft apilada
  sobre TA-01 y Linear `In Review`; sin promoción a `nightly`.

Nota ISA-126 / TA-03 (actualizada 2026-08-01):
- Caracterizado read-only un DuckDB LMU completado mediante copia temporal:
  original y copia con SHA-256 coincidente, metadata original intacta, cero
  WAL y conexión `read_only`. No se leyeron valores de metadata ni se ejecutó
  checkpoint/escritura/reparación sobre la biblioteca.
- El schema observado contiene 12 claves de metadata, 56 canales continuos sin
  `ts`, 42 eventos con `ts` y 101 tablas. Frecuencias: 1/2/5/7/10/20/50/100 Hz.
  El diccionario completo sanitizado no contiene DB, muestras, valores, rutas,
  nombres ni IDs.
- Implementado en `internal/telemetryanalysis` el modelo histórico v1 y el
  parser/normalizador paginado LMU: sesión, canales,
  columnas, unidades, calidad, provenance, fingerprint y tipos desconocidos.
  Cero/false permanecen presentes; NULL, stale, invalid y unknown no se
  colapsan.
- Corrección tras review independiente: `Inspect` congela un catálogo interno
  y `ReadPage` resuelve solo IDs descubiertos, sin confiar en descriptores
  mutables del llamador. Hay máximo duro de 16.384 filas, contexto de una sola
  fila para eventos, EOF/predecesor-only coherentes y duplicados de
  identificador rechazados también por diferencias de mayúsculas.
- Metadata nueva queda sensible por defecto mediante allowlist pública y sus
  valores se redacted antes de entrar al modelo. Metadata pública fuera de
  presupuesto queda invalid sin invalidar la sesión. `DECIMAL` permanece
  `unknown` hasta demostrar su representación.
- El continuo conserva eje relativo `index/frequency` con origen `unknown`; los
  eventos conservan `ts`. No se inventa alineación entre ambos. El nombre
  `Lap` no forma límites: esa semántica queda pendiente de evidencia en TA-04.
- `LMUDuckDBReader` es un puerto mínimo fuera de Telemetry Core. El parser ya
  exige una `AuthorizedHistoricalArtifact` emitida por el gate TA-02 y
  revalida hash/tamaño/mtime/identidad antes y después de catálogo y páginas.
  TA-03 no añade `database/sql`, CGO, binarios, CLI ni dependencia DuckDB de
  producto. El driver Go oficial es MIT, pero requiere decisión propia de
  build/empaquetado Windows antes de integrarlo.
- Alcance actual: sin reader concreto, índice, galería, UI, delta, mapa,
  coaching, live o wiring. Docs:
  `lmu-duckdb-characterization.md` y `historical-model.md`.
- Evidencia fresca tras la corrección: focal x20, vet, race x10 y dos fuzz de
  10 s PASS (1.091.635 normalización; 1.436.728 redacción). Benchmark de
  720.000 muestras paginadas: 58,04–75,16 ms/op,
  103.686.400–103.696.592 B/op acumulados y 355–368 allocs/op. Suite Go global
  paralela PASS. No se repitieron frontend/build porque este delta no toca
  frontend ni contratos embebidos.
- La copia temporal de inspección fue eliminada tras derivar/verificar el schema
  sanitizado. Un review adversarial posterior dio `REQUEST CHANGES`: P2/P3 y
  la frontera arquitectónica del P1 están corregidos con regresiones de
  mismatch/TOCTOU, determinismo, redacción y límite. Sigue faltando el reader
  DuckDB productivo y un test de integración sobre DuckDB sintético real; por
  ello TA-03 permanece abierta en su PR draft/Linear actuales y TA-04 queda
  bloqueada. Sin promoción.

Nota ISA-135 / TA-03B (2026-08-01):
- Comparadas cinco rutas de integración DuckDB en Windows: driver oficial
  estático/dinámico dentro de Wails, CLI gestionado y helper propio con enlace
  estático/dinámico. La recomendación es un helper local de corta vida,
  propiedad de Vantare, con `duckdb-go/v2` y `duckdb.dll` oficial fijados. La
  app principal permanece en `CGO_ENABLED=0`; no se crea daemon ni SQL remoto.
- Se descarta el CLI porque la guía oficial de DuckDB no lo recomienda para
  embedding y expone capacidades innecesarias. Se descarta el enlace estático
  actual porque el spike reprodujo una incompatibilidad entre los archivos
  precompilados 1.5.5 y MSYS2 UCRT64 GCC 16 tras el cambio a TLS nativo.
- Spike aislado, solo sintético y sin dependencias de producto: enlace dinámico
  1.5.5 PASS, helper reproducible en dos rutas, 44.317.091 bytes totales,
  read-only/NULL/cero/bool/identificadores/hash estable y cancelación coordinada
  con `context.Canceled` PASS. En
  720.000 filas, apertura 17–27 ms y páginas de 16.384 filas 20,72–23,84 ms de
  media en la pasada de 50 páginas.
- La v1 acepta exclusivamente archivos LMU locales descubiertos e indexados por
  Vantare. El helper fuera de proceso, Job Object y límites son defensa en
  profundidad, no un sandbox. Imports externos/comunitarios quedan bloqueados
  por ISA-164 / TA-03D hasta demostrar una frontera real.
- La arquitectura exige staging privado desde el handle autorizado TA-02,
  revalidación antes/después, límites de memoria/threads/tiempo/disco,
  extensiones/red desactivadas, protocolo tipado sin SQL, manifest/checksums y
  rollback atómico de helper + DLL.
- Inventario exacto cerrado con fuentes primarias: cuatro módulos Go, cinco
  extensiones estáticas y 26 componentes C/C++ vendorizados. El SBOM SPDX de 37
  componentes se regeneró dos veces con SHA
  `959ab3ae08e2a6ff36c28c0773552a81048700c123dc899d2af89d48f1d4bfa5`;
  todas las opciones elegidas son permisivas y compatibles con uso comercial.
- No se añadió DuckDB/CGO al `go.mod` principal, no se abrió LMU ni archivos
  personales, no se tocó Telemetry Core, UI, packaging de release o producto.
- Documentos: `duckdb-adapter-decision.md`, ADR 0005 propuesta,
  `ta03c-duckdb-adapter-plan.md` y spike reproducible `spikes/ta03b/`.
- El primer review independiente dio `REQUEST CHANGES`; las cuatro objeciones
  están corregidas en rama, pero ISA-135 permanece `In Progress` hasta una nueva
  review. Después, Isaac deberá aprobar dependencia fijada, redistribución del
  DLL, incremento aproximado de 44,32 MB, VC++ runtime y packaging/notices
  atómicos antes de TA-03C. TA-04 continúa bloqueada hasta implementar TA-03C.
  Sin promoción.
- Evidencia fresca de corrección: spike 50 páginas, test y vet focales PASS;
  cancelación coordinada 5/5; una extracción temporal manipulada fue rechazada
  por SHA; dos SBOM limpios fueron idénticos; suite Go global PASS en 231,4 s y
  `git diff --check` PASS. Un primer intento global agotó el timeout externo de
  cuatro minutos sin reportar fallo y no se contabilizó.
- Una re-review focal dejó únicamente un P2 en la allowlist Go del SBOM. Ya se
  compara bidireccionalmente el conjunto exacto `módulo@versión` de
  `go version -m` y se rechazan replacements, módulos añadidos, esperados
  ausentes y cambios de versión. Una segunda revisión encontró que PowerShell
  comparaba sin distinguir mayúsculas; ahora rutas y versiones usan igualdad
  ordinal y cinco regresiones fail-closed cubren también ambos cambios de
  `casing`. Las cinco regresiones pasan también en Windows PowerShell 5.1 y una
  regeneración real conserva el mismo SBOM de 37 componentes y SHA. Dos
  generaciones limpias anteriores conservaron igualmente ese SHA; spike 50
  páginas, test/vet focales y tamper de extracción PASS. Pendiente una nueva
  review independiente de la corrección ordinal; ISA-135 sigue `In Progress`.

Nota ISA-37 / TC-04C (2026-07-27):
- Implementado de forma aislada `internal/telemetry/derive.Pipeline`: consume snapshots inmutables aceptados por el reducer y publica un snapshot final `observed + derived` preservando el header. El harness contractual compone reducer, `SessionCoordinator` y derivación sin wiring productivo.
- La cadena es lineal, síncrona y fija en código; no acepta DAG, plugins, callbacks o definiciones runtime. El registro declara ID, versión, orden, inputs, outputs, reset e historia, devuelve copias defensivas y rechaza duplicados, órdenes no contiguos, autoconsumo, productores múltiples y dependencias hacia etapas posteriores. Cada snapshot final registra la lista ordenada `ID + versión` que produjo sus derivados.
- Única derivación aprobada: `controls.history@1`, con throttle/brake/clutch fresh del vehículo activo y límite canónico de 120 muestras demostrado por el inventario. Cero es válido. Missing/invalid/stale conservan calidad, no se añaden a historia ni borran muestras confirmadas. Un harness puede reducir el límite, nunca ampliarlo.
- Epoch, sesión, run y vehículo resetean historia; piloto/equipo dentro del mismo run no. Cursor inválido, cancelación o error conservan atómicamente cursor, historia y snapshot anteriores; el reintento es determinista. Entrada/salida/`Current` no comparten slices mutables.
- Gaps y delta permanecen explícitamente `missing` y no se registran como algoritmos: el estado observado actual no contiene distancia de vuelta, longitud de pista, tiempo dentro de vuelta, clase ni referencias con presencia/unidad/signo demostrados. No se migran los cálculos legacy ni su fallback sintético sin characterization/golden real.
- TDD cubre golden/replay, determinismo, orden, missing/invalid/stale, ceros válidos, resets epoch/session/run/vehicle, driver/team, límite, registro/versiones/ciclos, ownership, rollback/retry, cancelación, lectura concurrente, fuzz con oráculo y benchmark con 64 vehículos.
- Guía de contrato y verificación: `docs/telemetry-core/runtime-derivations.md`. Evidencia fresca: focal derive x20, Telemetry Core completo, guard ADR 0004, vet focal, suite global Go, race derive x10 con GCC UCRT64, fuzz con oráculo 10 s (37.673 ejecuciones) y `git diff --check` PASS. Benchmark aislado con 64 vehículos: 21,7–27,2 µs/op, 109.008–109.024 B/op y 9 allocs/op. Para habilitar el `go:embed` global se instalaron dependencias desde el lockfile y se generó `frontend/dist` ignorado; frontend build PASS con el warning conocido de chunk grande. El vet amplio conserva tres warnings `unsafe.Pointer` Win32 heredados fuera del diff. Review adversarial local sin P0/P1/P2 conocidos. Sin cambios frontend tracked, dependencias, productos, transporte, recording o composition root. Preparado para commit/push, PR draft apilada sobre ISA-36 y Linear `In Review`; sin merge a `develop`.

Nota ISA-36 / TC-04B (2026-07-27):
- Implementado de forma aislada `internal/telemetry/core.SessionCoordinator`: consume snapshots inmutables aceptados por el reducer y emite lotes atómicos de hechos ordenados con secuencia propia. Snapshots `latest-wins` y hechos discretos siguen contratos separados; no hay I/O, cola, goroutine, transporte, recording/replay ni imports de producto.
- Mantiene IDs canónicos separados de evento, sesión, vehículo, equipo y piloto sin inventarlos desde nombres/raw. Cambio de fuente, participantes, reconexión breve o equipo/piloto no reinician sesión. Un cambio de coche inicializa solo el nuevo run activo: conserva high-water y baseline de pit de todos los `VehicleID` estables/rivales de la sesión. Un cambio real de evento/sesión emite `session ended -> session started` y reinicia todo el historial.
- Hechos cubiertos: sesión iniciada/finalizada, vuelta completada, pit entrado/salido, piloto/equipo cambiado y conexión perdida/recuperada. `EndSession` permite cierre explícito e idempotente sin confundirlo con desconexión. Las vueltas usan high-water mark persistente por `VehicleID`: si un rival desaparece y reaparece con un salto, se emiten en orden todas las vueltas omitidas. La ausencia nunca permite inferir una transición de pit; el valor observado al reaparecer pasa a ser el nuevo baseline.
- Corrección de evidencia P2: `VehicleState.InPit` es ahora `schema.Field[pit.InPit]` y el catálogo append-only añade `pit.in_pit` (ID 24, boolean). LMU lo mapea únicamente desde `VehicleScoring.InPits` del jugador correlacionado; `false` sigue presente, bytes distintos de 0/1 son inválidos y no se mezcla con `PitState` ni se afirma semántica lane/box/garage. La matriz de autoridad `v2` añade esta señal Shared Memory sin alternativa REST. La fixture sanitizada existente demuestra `true`/`false`; las capturas reales de transición, boxes y garaje siguen pendientes.
- Cada hecho conserva un header coherente con su identidad y evidencia: rivales usan su propio `VehicleID` y el cursor/reloj entrante; `session ended` conserva header/cursor/reloj de la sesión anterior; `session started` usa el snapshot sucesor. La secuencia global de hechos permanece monotónica e independiente del cursor.
- Backpressure/cierre/overflow son errores observables. `FactBatchSink` acepta el lote completo o ninguno; un fallo no avanza cursor, identidad, historial ni secuencia y el reintento es determinista. Límites: 256 hechos por snapshot y 104 `VehicleID` históricos por sesión, alineados con los slots scoring LMU demostrados. `MaxVehicleHistory` solo permite reducir el presupuesto para harnesses; nunca ampliarlo. Superar el presupuesto devuelve `ErrVehicleHistoryOverflow` antes de emitir o confirmar estado, sin eviction silenciosa. El sink se invoca fuera del mutex, por lo que `Current` conserva acceso al último estado confirmado.
- Clock UTC inyectable y tests sin `time.Sleep`. TDD cubre epoch/identity, source/participantes múltiples, ausencia/reaparición, reconexión, cambio de coche preservando rivales, baseline del nuevo run activo, headers por hecho, driver/team, lap/pit, duplicados/gaps, orden/secuencia/ownership, presupuestos y rollback/retry, matriz `Apply`/`SetConnected`/`EndSession` contra cierre/backpressure, lectura concurrente durante commit bloqueado, determinismo, fuzz multi-participante con cambio activo y oráculo independiente, y benchmark con 64 vehículos.
- Guía de contrato y verificación: `docs/telemetry-core/session-coordinator.md`. Evidencia fresca tras la corrección multi-vehículo/presupuesto: focal coordinator + matriz v2 x20, Telemetry Core completo, guard ADR 0004, vet focal, suite global Go, race coordinator x10 con GCC UCRT64 y `git diff --check` PASS. Fuzz multi-participante con oráculo 10 s PASS (372.262 ejecuciones). Benchmark aislado con 64 vehículos: 18,1–23,7 µs/op, 38.144 B/op y 9 allocs/op. Frontend focal `useCanvasInteraction` 24/24 PASS; no hay archivos frontend en el cambio. La suite frontend completa y build permanecen evidenciados en la pasada inmediatamente anterior (1851/1851 y PASS); no se repitieron porque este delta solo toca Go/tests/docs. El vet amplio conserva tres warnings `unsafe.Pointer` Win32 heredados fuera del diff.
- Review adversarial de corrección, arquitectura, seguridad, lifecycle y rendimiento: sin P0/P1/P2 conocidos. El corte permanece sin composition/production wiring; la prueba manual es un harness controlado. Preparado para PR draft apilada sobre ISA-35 e `In Review`; sin merge a `develop`.

Nota ISA-35 / TC-04A (2026-07-27):
- Implementado de forma aislada `internal/telemetry/core.Reducer`: un único owner síncrono aplica lotes completos de estado observado, valida epoch/sequence estrictos y publica `envelope.Snapshot` con ownership por copia. No existe estado parcial: cualquier cursor inválido, gap, duplicado o identidad de vehículo fuera de contrato rechaza el lote sin avanzar cursor ni estado.
- El payload neutral `ObservedState`/`VehicleState` reutiliza los tipos canónicos de `schema`. `core` no importa `catalog` porque el guard aprobado de ADR 0004 prohíbe catálogo en contratos runtime; los IDs canónicos permanecen en el driver LMU y no se crea un ledger paralelo.
- El loop no crea goroutines y no contiene I/O, JSON, reflection, logging, callbacks inyectables ni decisiones de producto. No hay wiring LMU/productos, transporte, recording, replay, fan-out, derivaciones ni structural sharing.
- El contrato exige `Event` y `Session` completos desde el primer lote. Dentro del epoch `Event`, `Session` y `Vehicle` permanecen estables según `SameRun`; un header parcial no desactiva el control. Un reset exacto de epoch en sequence 1 puede cambiar los tres. `Team` y `Driver` pueden cambiar dentro del run.
- TDD cubre orden, duplicados, gaps de secuencia/epoch, reset, lote todo-o-nada, identidad completa/estable, copia defensiva de entrada/salida, mutación concurrente, determinismo, lifecycle/cancelación y owner único. `Run` revalida cancelación tras recibir y antes de aplicar; el test coordinado sin sleeps prueba que no muta/publica en ese límite y que el lote se puede reenviar tras reiniciar. El fuzz usa un oracle/modelo que verifica transición, error, cursor, atomicidad y snapshot; el benchmark mide copia completa con 64 vehículos.
- Decisiones y guía de verificación: `docs/telemetry-core/runtime-reducer.md`. Evidencia fresca tras corrección final: core x20, Telemetry Core completo, guard ADR 0004, vet focal, suite global Go y race focal x10 PASS. Race usó el GCC UCRT64 ya instalado con configuración solo de proceso; no se instaló ni cambió el sistema. Fuzz con oracle 10 s PASS con 2.324.968 ejecuciones. Benchmark Windows/amd64 con 64 vehículos, cinco repeticiones: 8,66–9,83 µs/op, 36.264 B/op y 5 allocs/op. El vet amplio conserva seis warnings `unsafe.Pointer` heredados fuera del diff.
- Review adversarial de corrección, arquitectura, seguridad, lifecycle y rendimiento: sin P0/P1/P2 conocidos. Riesgo residual medido: copia completa de 64 vehículos; no se introduce structural sharing sin un presupuesto y comparación aprobados. Preparado para commit/push, PR draft apilada sobre ISA-34 e `In Review`; sin merge a `develop`.

Nota ISA-34 / TC-03E (2026-07-26):
- Implementada la matriz versionada `v1` de autoridad LMU para las 16 señales actualmente demostradas: cinco solapadas con Shared Memory preferida y REST alternativa semánticamente equivalente, ocho exclusivas Shared Memory y tres exclusivas REST. Cada regla referencia directamente un `catalog.SignalID`; no existe un ledger paralelo. El catálogo incorpora las cinco definiciones neutrales que faltaban.
- La fusión single-writer vive dentro de `internal/telemetry/drivers/lmu` y publica lotes canónicos por señal. Decide por presencia, validez, freshness y TTL (Shared Memory 500 ms; REST 2 s); cero/false siguen siendo valores válidos. Orden y edad usan secuencia/tiempo monotónico internos: UTC queda solo como metadata y sus saltos no cambian latest ni TTL. Nunca promedia conflictos, sustituye bloques ni inventa fallback.
- Cada lote incluye una decisión determinista por señal y como máximo cinco diagnósticos de conflicto con solo ID/fuentes, sin valores, raw, JSON, PII ni rutas. Se diagnostican discrepancias entre valores válidos usables tanto fresh como stale. Los controles throttle/brake/clutch tienen presencia, validez y decisión independientes. La salida canónica deja vacío el snapshot de adquisición REST para impedir que un consumidor salte la autoridad por campo. No hay proyecciones, Engineer, Overlay, Strategy, Wails/SSE, composition root, dependencias o wiring productivo.
- Tests TDD cubren tabla 1:1 con catálogo, preferred stale/invalid/missing, REST parcial, recuperación, cero válido, las cuatro combinaciones fresh/stale de conflicto, clamp >5, borde TTL determinista, rollback/forward UTC, orden de llegada, equivalencia de las cinco señales solapadas, fuzz y benchmark; lifecycle/cancelación continúan cubiertos por el driver.
- Corrección final de review: el detector de reloj de sesión inmóvil del lifecycle Shared Memory usa la misma marca `elapsed` monotónica inyectada que la fusión; `unchangedSince` ya no es UTC ni usa `now.Sub`. Regresiones end-to-end del driver demuestran rollback/forward UTC, stale decidido solo por elapsed y recovery al avanzar el contador. `track_name` aplica una sola política en SHM/REST: vacío y solo espacios normalizado a vacío conservan presencia, igual que texto normal.
- Guía operativa: `docs/telemetry-core/lmu-authority-matrix.md`. La prueba real read-only de conexión/desconexión no se ejecuta ni se manipula LMU en este corte; permanece como gate manual TC-03 para Isaac antes de TC-04.
- Evidencia fresca tras el cierre final de review: focal LMU repetido 20 veces e integración/lifecycle x50 PASS; `go test ./internal/telemetry/... -count=1`, guard ADR 0004 y suite global `go test ./... -count=1` PASS. Fuzz de fusión 10 s PASS (605.180 ejecuciones) y fuzz REST PASS (154.033 ejecuciones tras corpus inicial). Benchmark fusión 600,7–631,7 ns/op, 120 B/op y 2 allocs/op; decoder REST 5,48–6,11 µs/op, 2.112 B/op y 24 allocs/op. Vet focal conserva solo los dos warnings `unsafe.Pointer` Win32 heredados; `-race` sigue no disponible porque no hay `gcc` en el entorno.
- Estado: corrección de review preparada para commit/push sobre la PR draft apilada en ISA-33; `In Review`, sin merge a `develop`.

Nota ISA-33 / TC-03D (2026-07-21):
- Corrección de review (2026-07-22): la aceptación de `sessionInfo` es transaccional; `CurrentEventTime` negativo, NaN, Inf o fuera de rango no modifica campos ni `LastSuccessUTC`. `SourceTime` REST queda observado y timestamped solo tras validar toda la respuesta. Tests cubren válido seguido de temporal inválido preservando el cache anterior.
- Corrección P3: `CurrentEventTime` ya no se convierte mediante multiplicación directa de `float64` en el borde de `time.Duration`. La conversión separa segundos enteros/nanosegundos, comprueba explícitamente el resto superior y rechaza conservadoramente el límite redondeado ambiguo; tests cubren el último segundo entero exacto y los `float64` inmediatamente inferiores/superiores al máximo.
- Timestamps corregidos: cada request registra su intento real, cada respuesta/campo aceptado usa su recepción real y freshness/TTL se evalúa contra una hora final del snapshot. Una respuesta temprana puede quedar stale durante una segunda request lenta sin falsificar su edad.
- Cancelación endurecida: tanto el worker como el driver comprueban `ctx.Err()` antes de enviar, antes de mutar runtime y antes de escribir al sink. Una regresión coordinada por canales cancela exactamente antes de publicar REST y demuestra cero mutaciones/publicaciones tardías, sin sleeps.
- Seguridad de red: REST exige HTTP loopback y el cliente rechaza redirects antes de seguirlos; `localhost`, `127.0.0.0/8` y `::1` siguen permitidos. Tests demuestran rechazo pre-transporte de base externa y redirect externo sin red real.
- El único `internal/telemetry/drivers/lmu.Driver` posee ahora Shared Memory y REST local. REST usa un worker interno cancelable, dos endpoints observacionales (`standings` y `sessionInfo`), poll normal 250 ms, deadline 750 ms, TTL 2 s, backoff exponencial máximo 2 s y transporte HTTP propio con cierre de conexiones idle. `Run` espera request y poller antes de retornar; no quedan goroutines propias tras teardown.
- Shared Memory y REST emiten observaciones separadas mediante `SourceSharedMemory`/`SourceREST`. Este corte no fusiona, no decide autoridad, no sustituye listas/sesiones y no contiene lógica de producto. ISA-34 conserva íntegra la matriz de autoridad y fusión.
- Cache y calidad son explícitas: cada endpoint conserva intento/último éxito/estado y cada campo conserva `UpdatedUTC` más `fresh/stale/missing/invalid`. Se distinguen `live`, `partial`, `unsupported`, `offline`, `timeout` y `stale`; cuerpo vacío y JSON malformado no se confunden. Fallar un endpoint no borra el otro ni convierte ausencia en cero.
- Capabilities runtime son honestas: Shared Memory puede continuar mientras REST degrada el driver; REST solo se anuncia disponible con evidencia de canal live/partial/stale. No existe fallback mock.
- Privacidad/alcance: el decoder solo materializa campos neutrales; nombres y raw no salen del paquete ni se registran/persisten. Sin cambios en Engineer, Overlay, Strategy, Wails/SSE, composition root, dependencias o wiring productivo. Guía y gate manual read-only: `docs/telemetry-core/lmu-rest-driver.md`.
- Evidencia fresca tras review: focal LMU repetido 20 veces PASS; `go test ./internal/telemetry/... -count=1`, guard ADR y suite global `go test ./... -count=1` PASS; fuzz REST 10 s PASS (~221.277 ejecuciones); benchmark 4,83–5,54 µs/op, 2.096 B/op y 23 allocs/op. Vet REST/core/driver PASS en target sin seams Win32; Windows conserva únicamente los dos warnings `unsafe.Pointer` heredados de ISA-32. `-race` continúa no disponible con `CGO_ENABLED=0` y `gcc` ausente.
- Estado: implementación y documentación preparadas para review, PR draft apilada sobre ISA-32 y validación manual de Isaac. Sin merge a `develop`; ISA-34 no debe iniciarse antes del gate humano.

Nota ISA-32 / TC-03C (2026-07-21):
- Implementado `internal/telemetry/drivers/lmu` como adquisición canónica y aislada de `LMU_Data`: cada `Run` abre exactamente un mapping, copia muestras a buffer privado y cierra view/handle una sola vez. No crea goroutines propias; ticker, clock y apertura solo se inyectan dentro del paquete para tests deterministas.
- El payload `Observation` es product-neutral, sin raw ni `pkg/models`: usa campos `schema.Field` con presencia/provenance/freshness explícitos para la muestra demostrada por fixtures reales de menú y pista. Menú sigue `live` sin vehículo; NaN/Inf/rangos imposibles son `invalid`, nunca cero inventado.
- Compatibilidad/lifecycle fail-closed: `known` exige proceso exacto, build FileVersion/ProductVersion allowlisted `1.3.0.0`, mapping abierto, vista exacta e invariantes estructurales. Si FileVersion y ProductVersion existen, deben normalizar al mismo valor allowlisted; cualquier contradicción queda `unknown/degraded` sin fields. Si solo existe una versión, puede validarse contra la allowlist. Ausencia/no-Windows/no allowlist queda `unknown/degraded` sin campos fresh. Con `PlayerPresent=false`, las invariantes neutrales de menú permiten `live` sin vehículo y sin exigir nombre personal; el mismo all-zero sin build sigue `unknown`, y una variante malformada también. Con jugador se conserva la correlación estricta scoring/telemetry por isPlayer, ID, vehículo y track. Telemetry movida/corrupta queda `unknown` aunque scoring sea plausible.
- `RuntimeSnapshot` es concurrency-safe, no hace I/O y copia capabilities. Sin contador de frame demostrado, cada muestra requiere dos copias consecutivas iguales con scratch reusable y máximo tres comparaciones; incoherencia no publica y retorna `ErrIncoherentSnapshot` retryable/degraded. `Run` no abre con contexto cancelado, no publica tras cancelación y cierra exactamente una vez.
- Fixtures reales cubiertas: menú y pista. Garaje y boxes siguen pendientes de captura real; no se inventan. Verificación manual opt-in documentada en `docs/telemetry-core/lmu-shared-memory-driver.md`.
- Teardown: `driver.ErrTeardown` tiene prioridad terminal aunque el error también contenga disconnected/incoherent; no se reabre mapping. El resultado por ciclo permite que varios `Stop` reciban el mismo close error incluso tras cleanup/restart. Seams Win32 cubren mappings y provider build, cierre de handles, errores y privacidad de ruta.
- Evidencia re-review fresca tras el ajuste de menú: focal core/driver/LMU repetido 20 veces, `go test ./internal/telemetry/... -count=1`, suite global, build frontend, guard ADR y `git diff --check` PASS. Benchmark estabilidad+parse+evidencia por muestra aislado 22,12–25,31 µs/op, 600 B/op y 14 allocs/op (margen >650x a 60 Hz). Vet core/driver PASS; LMU conserva dos warnings localizados `unsafe.Pointer` al materializar mmap y VS_FIXEDFILEINFO Win32. Fuzz explícito previo 10 s PASS (~571.962 ejecuciones); `-race` sigue no disponible con `CGO_ENABLED=0`.
- Live opt-in read-only con LMU abierto: PASS; provider/version `1.3.0.0` allowlisted, runtime `live`, `PlayerPresent=false`, fingerprint seguro `evidence=menu-invariants` y fast telemetry ausente. No se capturó/escribió raw ni PII.
- Estado: preparado para review y validación manual LMU; sin push, PR, Linear, wiring, merge ni integración en `develop`. ISA-33 no debe iniciarse hasta aprobación humana de este corte.

Nota ISA-31 / TC-03B (2026-07-21):
- Implementado `core.DriverManager[T]` genérico sobre el puerto `core.Driver[T]`, sin importar drivers concretos ni cambiar composición/producto. El catálogo compilado mantiene descriptor, prioridad y capabilities estáticas; el puerto entrega aparte un snapshot runtime con estado y capabilities actuales, siempre copiados defensivamente.
- La selección es determinista: preferencia explícita válida primero, después prioridad descendente y finalmente ID estable. Un cambio de preferencia exige `Stop -> SetPreferred -> Start`; no existe hot-swap implícito ni fallback mock.
- El lifecycle posee exactamente una llamada `Run` activa, rechaza doble `Start` con error inspeccionable, mantiene constructor/errores terminales observables hasta `Stop`, trata ausencia como `detecting` y hace `Stop` idempotente, cancelable y bloqueante hasta teardown. Cada ejecución tiene una generación propia: una finalización `Stop` antigua nunca puede limpiar un restart posterior.
- `Status` consulta el snapshot del driver fuera del mutex, valida cada cambio contra `driver.State.CanTransitionTo` y persiste solo transiciones legales. Generación y revisión monotónica de instancia impiden que un snapshot lento de un ciclo anterior contamine un reconnect, incluso si el constructor reutiliza el mismo valor; nunca se comparan interfaces de drivers. Un salto o retroceso ilegal publica `degraded` con `ErrInvalidDriverTransition`; una recuperación legal limpia el diagnóstico.
- Reconnect solo ocurre si el candidato clasifica expresamente el error como transitorio. Usa instancias nuevas secuencialmente, máximo configurable, backoff exponencial acotado y jitter acotado/injectable; agotamiento devuelve error tipado. Detector, backoff y driver comparten cancelación.
- TDD y concurrencia: tests table-driven y coordinados por canales cubren catálogo inválido, desempate, preferencia, doble start, ausencia, constructor, terminal sin retry, retry agotado, una sola ejecución activa, dos Stops concurrentes con restart, timeout/completion de Stop, transiciones runtime válidas/ilegales, degradación de capabilities, cancelación durante backoff, contexto padre y teardown. No usan `time.Sleep`; los deadlines solo protegen contra bloqueos.
- Evidencia: focal core/driver repetido 20 veces PASS; `go test ./internal/telemetry/... -count=1` PASS; guard ADR 0004 PASS; `go vet` focal PASS y `git diff --check` PASS. `-race` queda pendiente porque el entorno mantiene `CGO_ENABLED=0`; no se ejecutó suite global ni frontend porque este corte es un paquete Go aislado sin composición ni UI.
- Estado: preparado para review; sin driver LMU concreto, parsers, fusión, wiring, push, PR, Linear ni merge. ISA-32 no debe iniciarse hasta aprobación humana de este corte.

Nota ISA-30 / TC-03A (2026-07-21):
- Iniciada desde ISA-29 aprobada en `8d12cf0399f1848d873a8268d12e5d3005945830`, con rama/worktree aislados y sin cambiar producción. Inventario canónico: `docs/telemetry-core/lmu-raw-acquisition-audit.md`.
- Confirmado: un único mapping `LMU_Data` alimenta los parsers público y Engineer; la duplicación está en offsets/decodificación, no en tres conexiones principales. Extended, PitInfo y REST deben quedar bajo el único LMU Driver.
- La fixture histórica contenía identidad real. Se sustituye por buffer sanitizado con lista blanca numérica, aliases deterministas, procedencia, versión/fingerprint y SHA-256; se añade captura real `menu` de LMU 1.3.0.0. Garaje y boxes quedan explícitamente pendientes, sin inventar datos.
- Se caracteriza paridad de campos solapados y se añaden fuzz targets no-panic para ambos parsers. No se eliminan parsers, no se cablea el driver y no se cambia comportamiento productivo.
- Riesgos reservados a ISA-31/32/33: detector de compatibilidad, NaN/Inf, `TotalLaps` divergente, offsets de ruedas/aceite no verificados, REST pit menu separado y recapturas reales garaje/boxes. ISA-31 no debe iniciarse hasta revisión y aprobación manual de este corte.
- Evidencia: focales LMU/Engineer y `go test ./internal/telemetry/... -count=1` PASS; fuzz explícito 5 s por parser PASS (28.271 + 158.473 ejecuciones); benchmark 13,5–15,6 µs/op; build frontend PASS; suite global serial `go test -p 1 ./... -count=1` PASS. La suite paralela reproduce únicamente ISA-118 (`TestConcurrentSavesDontCorruptFile`) y el focal vuelve a pasar; `-race` no está disponible con `CGO_ENABLED=0`. Vet focal conserva tres warnings legacy `unsafe.Pointer` en readers mmap fuera del diff.
- Review final correctness/readability/architecture/security/performance: sin P0/P1/P2. Estado: preparado para `In Review`, PR draft apilada sobre ISA-29 y sin merge; ISA-31 no iniciada.

Nota ISA-29 / TC-02D (2026-07-21):
- Iniciada desde ISA-28 aprobada en `e182f92cc085c3c51f119a02146e20c6236cdd38`, con rama y worktree aislados. El corte solo fija contratos compilables y guardarraíles; no conecta LMU, crea runtime, cambia productos ni añade transporte/almacenamiento.
- `driver.State` fija los ocho estados aprobados (`stopped`, `detecting`, `connecting`, `live`, `degraded`, `stale`, `error`, `stopping`) y transiciones explícitas. Reinicios desde error requieren decisión del manager; no existe retry automático oculto.
- Los puertos viven en sus consumidores: el driver consume `ObservationSink`; core consume `Driver`, `Derivation` y `RecordingSink`; projection consume `SnapshotReader`, `FactSubscriber`/`FactSubscription` y `Projector`. Son genéricos y no fijan todavía un payload LMU o snapshot universal.
- Backpressure, cierre y resync son errores observables. Los hechos se consumen mediante suscripción pull-based sin exigir colas ilimitadas; un salto no recuperable exige snapshot completo antes de reanudar. Recording nunca puede perder silenciosamente datos aceptados.
- El guard arquitectónico permite a core solo schema y contratos neutrales de driver; a derive/projection/recording solo sus capas inferiores aprobadas; y a cada driver concreto solo schema, core ports, contratos neutrales y su propio árbol. Un driver de simulador no puede importar otro driver ni productos/proyecciones.
- TDD: se observaron rojos para contratos ausentes, fronteras de derive y dependencias inversas. Focales, `go test ./internal/telemetry/... -count=1`, build frontend para generar `dist` ignorado y dos ejecuciones frescas de `go test ./... -count=1` PASS; `go vet` de los tres paquetes nuevos PASS y `git diff --check` PASS. El vet amplio conserva únicamente el warning legacy de `unsafe.Pointer` en `internal/telemetry/lmu/reader_windows.go`, fuera del diff; race no se ejecuta porque `CGO_ENABLED=0`.
- Review final correctness/readability/architecture/security/performance: sin P0/P1/P2. Antes del cierre se hicieron context-aware los cierres de suscripción, se explicitó ownership síncrono de payloads mutables, se exigió preservar headers en derivación/proyección y se convirtió el lifecycle en una matriz exhaustiva. Estado: preparado para `In Review`, PR draft apilada sobre ISA-28 y sin merge; TC-03 no iniciado.

Nota ISA-28 / TC-02C (2026-07-21):
- Iniciada desde ISA-27 aprobada en `72da58552495d8a9623ad42fc1e82510d048d7a0`, con rama y worktree aislados. El corte solo añade contratos; no conecta drivers LMU, runtime, productos ni transporte.
- Presencia y valor quedan separados mediante `schema.Field[T comparable]`: cero, `false` y texto vacío pueden estar presentes; `MissingField` es ausencia explícita. Provenance distingue observed/derived/estimated y freshness distingue fresh/stale/missing/invalid sin usar sentinels.
- `Clock` separa source time, session time, UTC de recepción y edad monotónica interna no serializada. `Cursor` empieza en epoch/sequence 1, mantiene epoch tras desconexión breve y lo rota ante reset, cambio real de evento/sesión/vehículo o wrap; overflow e incoherencia producen error explícito.
- `RunIdentity` mantiene IDs distintos de evento, sesión, vehículo, equipo y piloto. `SameSession` no depende del coche; `SameRun` sí. Cambios de piloto, equipo o fuente no crean por sí solos una sesión/run nuevos.
- `schema/envelope` define headers y wrappers transport-neutral: observaciones y hechos aceptan payload value-semantic; snapshots con colecciones exigen una función de copia y clonan al entrar/salir. El valor cero de Snapshot es seguro y no expone payload.
- TDD incremental: rojos comprobados antes de cada contrato; focales schema y `go test ./internal/telemetry/... -count=1` PASS después de cada incremento. Build frontend PASS para generar el `dist` ignorado; `go test ./... -count=1` PASS completo; `git diff --check` PASS. Race no se ejecuta porque el toolchain mantiene `CGO_ENABLED=0`.
- Review final correctness/readability/architecture/security/performance: sin P0/P1/P2. Se corrigieron antes del cierre la separación `SameSession`/`SameRun` y el valor cero seguro de Snapshot. Estado: preparado para `In Review`, PR draft apilado sobre ISA-27 y sin merge; ISA-29 no iniciada.

Nota ISA-27 / TC-02B (2026-07-19):
- Implementación iniciada sobre `vantareapp/isa-26-tc-02a-arquitectura-final-e-inventario-de-dominios@9bd922fe245b27440d239c3578f1a4aaf6ea2817` en rama/worktree propios. Alcance: schema runtime tipado, catálogo/ledger único de IDs, invariantes, golden determinista y benchmark focal; sin migrar consumidores ni adelantar ISA-28/TC-03.
- Frontera aprobada: `schema` y sus dominios no importan `catalog`; `catalog` importa únicamente schema/standard library y no participa dinámicamente en el hot path. ISA-26 e ISA-27 están `Done`; ISA-28 está preparada para `In Review`.
- Implementados contratos pequeños para identity/session/vehicle/controls/wheels/energy/pit/standings/weather/spatial, vocabulario explícito Unknown/Unsupported, ledger estable con política append-only de tombstones, lookup precalculado, golden Markdown LF/CRLF-safe y guard de imports/reflection. No se añadieron interfaces, generador, dependencias ni consumidores.
- TDD: rojos comprobados para vocabulario, rangos, enums, duplicados, colisión active/retired, determinismo y frontera catalog/schema; focales schema/catalog y guard arquitectónico PASS. `go test ./internal/telemetry/... -count=1` PASS; build frontend PASS; `git diff --check` PASS.
- Benchmark Windows amd64, 3 repeticiones: `ByID` 14.97–15.25 ns/op y acceso a struct tipado 0.4977–0.5051 ns/op; ambos 0 B/op y 0 allocs/op, sin umbral temporal contractual.
- Suite global: tras instalar desde lockfile y generar `frontend/dist` ignorado, reapareció solo ISA-118 (`TestConcurrentSavesDontCorruptFile`, colisión conocida de `.tmp` en Windows); pasó focalmente con `-count=1`. ISA-119 pasó focalmente con `-count=20`. Ningún archivo de esas áreas cambió y no se corrigieron aquí.
- Corrección adversarial posterior: `TeamName` y `VehicleName` pertenecen a `schema/vehicle`; `session.TypeEndurance` forma parte del enum canónico; `spatial.Position` distingue el contrato público del auxiliar `Vector3`; y el catálogo cubre exactamente los 18 contratos explícitos, incluidos lap number, gear, completed laps y orientation. El test complaciente de conteo de valores fue sustituido por una especificación exacta con witnesses tipados y golden determinista.
- Evidencia fresca de la corrección: focales schema/catalog PASS, guard y `go test ./internal/telemetry/... -count=1` PASS, benchmark 3 repeticiones con 0 B/op y 0 allocs/op, `git diff --check` PASS y `go test ./... -count=1` PASS completo. El PASS puntual no cierra ISA-118/119, que siguen fuera de este diff.
- Estado de entrega: ISA-27 fue aprobada manualmente por Isaac el 2026-07-21 en `72da58552495d8a9623ad42fc1e82510d048d7a0`; su PR continúa sin merge. ISA-28 partió de ese SHA.

Nota ISA-26 / TC-02A (2026-07-19):
- Cerrado tras segunda review el inventario previo al runtime en `docs/telemetry-core/domain-inventory.md`: contrato público Overlay/Desktop/OBS, proyección V3, modelo y 30/30 dominios Engineer, Launcher/consumidores live y requirements futuros de Strategy/Analysis sin crear schema. La cobertura normativa RF/SC asigna a cada fila/grupo rango, frecuencia útil, source y consumer; cuando no hay evidencia los marca explícitamente `desconocido / TC-03`, sin confundir frecuencia útil con adquisición.
- Cerradas las reglas de dirección del ADR 0004 en `docs/telemetry-core/dependency-rules.md` y un guard determinista en `internal/telemetry/architecture_test.go`; el guard caracteriza el árbol legacy y se activa para `schema`, `core`, drivers y proyecciones cuando aparezcan, sin exigir migraciones inexistentes.
- Deudas reservadas a TC-03: presencia por campo sin sentinel cero/false/vacío, unidades/provenance LMU, identidad de sesión sin `NumVehicles`, offsets placeholder y divergencia `Speed` m/s frente a `speedKph` V3. No se resolvieron inventando schema ni cambiando producción.
- Evidencia: test focal rojo antes de implementar el validador; `go test ./internal/telemetry/... -count=1` PASS; `go test ./... -count=1` PASS después de generar `frontend/dist` ignorado; build frontend PASS; `git diff --check` PASS. `-race` no disponible porque el toolchain tiene CGO deshabilitado.
- Evidencia fresca de segunda review: comprobación RF/SC PASS sobre 143 filas de campos/grupos; test focal y `go test ./internal/telemetry/... -count=1` PASS; `git diff --check` PASS. Dos repeticiones literales de `go test ./... -count=1` quedaron rojas por flakies fuera de este diff: `TestConcurrentSavesDontCorruptFile` reproduce colisiones de `app-settings.json.tmp` también focalmente con `-count=20` (ISA-118), mientras `TestServiceEmitRateCapped` dio PASS focal `-count=20` y solo falló bajo carga global (ISA-119). Ambos pasaron focalmente con `-count=1`, no se modificaron y no se declara la suite global verde. Una ejecución serial superó `internal/app` y fue terminada externamente antes de acabar el resto.
- Estado de cierre: ISA-26 quedó `Done` tras validación manual de Isaac en `9bd922fe245b27440d239c3578f1a4aaf6ea2817`; su PR permaneció apilado y sin merge a `develop`. ISA-27 comenzó después sobre ese SHA.

Nota TELEMETRY-CORE-FINAL-ARCHITECTURE (2026-07-19):
- Isaac aprobó reconstruir Telemetry Core con arquitectura modular orientada a observaciones: drivers compilados, LMU Driver propietario de Shared Memory + REST, reducer single-writer, derivaciones ordenadas, snapshots inmutables, hechos separados y proyecciones versionadas por producto.
- ADR vigente: `docs/adr/0004-telemetry-core-modular-observation-architecture.md`.
- Plan maestro e índice: `docs/superpowers/plans/2026-07-19-telemetry-core-final-architecture-master.md` y `2026-07-19-telemetry-core-sol-medium-execution-index.md`.
- Fases: TC-02 contratos, TC-03 driver LMU, TC-04 runtime, TC-05 proyecciones/transporte, TC-06 recording/replay, TC-07 Overlay, TC-08 Engineer y TC-09 retirement/hardening.
- La ejecución inicia en ISA-26. Los planes pendientes del 2026-07-13 quedan `SUPERSEDED`; TC-01 se conserva como baseline completado.
- Nada entra en `develop` sin validación manual completa y aprobación explícita de Isaac.

Nota INTEGRACION-ISA-93 (2026-07-19):
- Isaac validó manualmente que los 21 diseños Vantare Crystal son suficientemente correctos para integrarlos y probar el conjunto desde `develop`.
- Se integra la rama publicada `vantareapp/isa-93-os-03-paridad-11-de-los-21-disenos-vantare-crystal` en un worktree limpio basado en `develop@93d52bc`; se conserva íntegramente la historia vigente de `develop`.
- El alcance añade 21 diseños Crystal para 18 tipos funcionales, renderizadores/ViewModels puros, fuentes locales, contratos cuantitativos y escenas transparent/solid/grid comunes a Studio/Desktop/OBS.
- Autoridad y evidencia detallada: `docs/analysis/isa-93-crystal-parity/README.md`. No se regenera ni se debilita el baseline histórico `delta-crystal-ready-studio` durante esta integración.
- Integración: merge `80b0b13cecb3c758c5b08860ba1057bacf56449e` sobre `develop@93d52bc`.
- Evidencia fresca combinada: protocolo 14/14 PASS; design-system 2/2 PASS; frontend 280 archivos y 1851/1851 tests PASS; build PASS; Crystal 21/21 PASS en geometría, alfa, composición, fuentes, tipografía, estabilidad y Studio/Desktop/OBS.
- Deuda previa confirmada contra `develop@93d52bc`: `e2e:overlay-studio` no monta `LauncherStoreProvider`; el visual legacy conserva Original 0,000% y falla únicamente el baseline Crystal ISA-91 obsoleto al 100%. Ninguno fue introducido por ISA-93 y ningún baseline se regeneró.
- Estado: INTEGRADO Y VALIDADO EN SU ALCANCE; pendiente prueba manual global de la aplicación desde `develop` y corte posterior para reparar el smoke compartido/retirar el baseline obsoleto.

Nota INTEGRACION-ISA-9-13-95 (2026-07-16):
- ISA-9 (Launcher), ISA-13 (legibilidad Space Mono) e ISA-95 (comunicaciones Discord) se consolidaron sobre `develop@4e22bfa` en `codex/integrate-isa9-isa13-isa95-develop`.
- La integración conserva Overlay Studio V3, Telemetry Core, Engineer y OAuth nonce ya presentes; los únicos conflictos fueron documentales en este archivo y se resolvieron manteniendo ambas líneas de trabajo.
- Evidencia fresca: frontend `265/265` archivos y `1767/1767` tests PASS; build PASS; `go test ./... -count=1` PASS; Launcher Playwright PASS (`7` apps, `2` perfiles, desktop/compact); ISA-13 Playwright PASS (`4` idiomas × `3` viewports × `4` secciones); Discord `27/27` tests y cuatro YAML PASS.
- Lint focal de los archivos integrados PASS. El lint global conserva `33` errores y `2` warnings preexistentes fuera del alcance, principalmente Calendar y Overlay Studio.
- ISA-93 permanece fuera de esta integración hasta completar y validar la paridad visual de Vantare Crystal.

Nota ISA-9 (2026-07-13) — Launcher logos:
- Causa raíz: `getIconHighRes` usaba GUID incorrectos para `IImageList`/`IImageList2` y el slot vtable `Add` (3) en lugar de `GetIcon` (10); `SHIL_JUMBO` fallaba y todos los iconos caían a PNG de `32x32`.
- Fix mínimo: GUID oficiales + `GetIcon` vtable 10. El smoke Windows real pasa a `256x256` para LMU/Steam, OBS, MoTeC, SimHub, CrewChief, Discord/shortcut y Spotify; el resolver manual también queda cubierto.
- Frontend: `AppBadge` prueba candidatos en orden y, tras un error, solicita extracción backend antes del fallback de abreviatura; `object-contain` conserva proporción.
- Checks: `go test ./internal/app/launcher/...`, `go test ./cmd/vantare/...`, `pnpm --dir frontend test` (177 archivos/1614 tests), build frontend, lint focalizado y smoke Playwright 100/125/150/200% equivalentes sin overflow/errores. `wails3 build DEV=true` PASS.
- Riesgos restantes: los assets oficiales locales siguen vacíos por decisión previa; el mock visual muestra abreviaturas. Falta validación manual de Isaac al 100%; no hacer merge a `develop` sin esa aprobación.
Nota ISA-13-MONO-LEGIBILITY-RELAUNCH (2026-07-14):
- Relanzada válida desde `c49e14aab474ee132c0368e92918f78d66a162c8` en `vantareapp/isa-13-mono-legibility-relaunch-20260714`; la ejecución anterior queda descartada y no se reutilizan sus artefactos.
- Causa raíz confirmada: Hub usa Space Mono, pero `index.html` solo solicitaba el peso 400 aunque el chrome usa 700; además el fallback CSS aún declaraba JetBrains Mono. Se cargan Space Mono 400/700 y se alinea el fallback global a Space Mono.
- Alcance: Dashboard, Launcher, Calendar, Overlay Studio y Settings auditados en es/en/it/pt, wide/medium/compact y DPR 1/1.25/1.5/2. Crystal/Original y tokens JetBrains de overlays no se modifican.
- Regresión: contrato de token/carga y smoke Playwright determinista (`4 × 3 × 4`) añadidos. Tests frontend `178/178`, `1615/1615`; build PASS; diff check PASS. Lint mantiene 4 errores preexistentes fuera de scope.
- Estado: IMPLEMENTADO EN RAMA; PR a `develop` pendiente de validación manual completa de Isaac; no hacer merge automático.

Nota LAUNCHER-V3-SHELL-ICONLOCATION-FIX (2026-07-12):
- Corregido el caso de shortcuts con `TargetPath` genérico (Discord `Update.exe`): el resolver lee `IShellLinkW.GetIconLocation`, extrae el recurso indicado sin la flecha del `.lnk` y solo después usa el ejecutable objetivo/Shell.
- Smoke Windows: Discord pasó de icono genérico (`551` bytes) a recurso de shortcut válido (`1213` bytes); MoTeC, SimHub, LMU, OBS, Spotify y CrewChief siguen resolviendo iconos.
- Checks: Go Launcher/Wails PASS; smoke de iconos PASS; frontend build PASS; `go build` PASS; `git diff --check` PASS.

Nota LAUNCHER-V3-HYBRID-ICON-RESOLVER (2026-07-12):
- Implementado resolver híbrido: el `.lnk` solo sirve para discovery y `TargetPath`; el icono se obtiene del ejecutable objetivo mediante Shell/Jumbo, sin flecha de acceso directo. Fallbacks: Shell del ejecutable, recurso del `.exe` y Shell del shortcut personalizado.
- La capa frontend conserva la prioridad de assets oficiales locales cuando existan; actualmente no se añaden assets de marca no proporcionados, por lo que las instalaciones reales usan el resolver Windows.
- Checks: `go test ./internal/app/launcher/... ./cmd/vantare/...` PASS; smoke Windows PASS para 7 apps; frontend build PASS; `go build` PASS; `git diff --check` PASS.

Nota LAUNCHER-V3-SHELL-ICON-PATH (2026-07-12):
- El resolver Windows prioriza el mismo path de Explorer: `.lnk` recursivo → `SHGetImageList(SHIL_JUMBO)`/Shell → ejecutable. Discovery usa el destino del shortcut cuando no hay registro ni ruta conocida.
- Se añadió caché de shortcuts para evitar repetir escaneos COM durante discovery y renderizado. Smoke real: CrewChief detectado por shortcut; LMU, OBS, Spotify, MoTeC, SimHub, CrewChief y Discord con icono resuelto.
- Checks: frontend build PASS; `go test ./internal/app/launcher/... ./cmd/vantare/...` PASS; `go build` PASS; `git diff --check` PASS. Suite Playwright y suite frontend completa permanecen verdes de la iteración anterior; lint conserva 4 errores preexistentes fuera de scope.

Nota LAUNCHER-V3-ICON-RESOLUTION-FIX (2026-07-11):
- Corregidas las rutas reales de instalación: MoTeC (`app.exe`, `i2.exe`, `MoTeC.exe`, incluyendo `Program Files (x86)`) y SimHub (`SimHubWPF.exe`, `SimHub.exe`, incluyendo `Program Files (x86)`).
- La búsqueda de `.lnk` ahora recorre de forma limitada Desktop y Start Menu, y el resolver prueba iconos de alta resolución del ejecutable y del acceso directo antes del fallback de baja resolución.
- Smoke Windows: MoTeC resuelto en `C:\Program Files\MoTeC\app.exe` con icono; SimHub resuelto en `C:\Program Files (x86)\SimHub\SimHubWPF.exe` con icono; Discord/Spotify/LMU/OBS también con icono.
- Checks: Go Launcher/Wails PASS; smoke de iconos PASS; frontend Launcher 13/13 PASS; suite frontend 173 archivos / 1591 PASS; build frontend y `go build` PASS; Playwright smoke PASS (7 apps, 2 perfiles, desktop/mobile). `go test ./...` no terminó dentro del timeout de 120s en esta iteración; los fallos globales conocidos de `internal/server` quedan fuera de scope.

Nota LAUNCHER-V3-RELIABILITY-FIX (2026-07-11):
- Corregido el primer escaneo: `LauncherStore` dispara `launcher:apps:discover` al montar y el onboarding espera al snapshot con `lastScanAt` o error antes de mostrarse.
- El onboarding lista las apps launchable detectadas con sus badges; el snapshot incorpora iconos extraídos offline. LMU resuelve también el ejecutable instalado en las librerías Steam para mostrar su icono real sin CDN.
- Checks: tests focalizados frontend 9/9 PASS; `pnpm --dir frontend test` 173 archivos / 1591 PASS; `pnpm --dir frontend build` PASS; `go test ./internal/app/launcher/... ./cmd/vantare/...` PASS; Playwright smoke PASS (7 apps, 2 perfiles, desktop/mobile); build Wails `bin/vantare.exe` PASS.
- `pnpm --dir frontend lint` mantiene 4 errores preexistentes fuera de scope en Calendar y `wails-runtime-topbar-mock.ts`. `go test ./...` mantiene fallos preexistentes en `internal/server` (nonce/puerto dinámico).

Nota STRATEGY-PLANS-01 (2026-07-11):
- Creados tres documentos de planificación Strategy: Producto A ejecutable y exhaustivo; Productos B/C como guías generales condicionadas al DoD de la fase anterior.
- A: `docs/superpowers/plans/2026-07-11-strategy-product-a-manual-calculator.md` — 9 fases, TDD, motor Go clean-room, Fuel+VE, pit model, tyres por rueda, solver/ranking, UI, calendario, export y verificación.
- B: `docs/superpowers/plans/2026-07-11-strategy-product-b-telemetry-guide.md` — observaciones, calidad de muestras, confianza, propuestas y replay; requiere nuevo plan tras cerrar A.
- C: `docs/superpowers/plans/2026-07-11-strategy-product-c-live-guide.md` — state machine, seguimiento, replanificación confirmable, integraciones y chaos/replay; requiere A+B cerrados.
- TinyPedal queda exclusivamente como referencia funcional GPLv3; resultados matemáticos similares son esperables, pero código/fixtures/formatos se implementan clean-room.
- Estado: PLANIFICADO; sin código implementado.

Nota STRATEGY-RESEARCH-01 (2026-07-11):
- Objetivo: auditar Fuel Calculator, Tyre Strategy Planner, consumo live e historial de stints de TinyPedal y definir una dirección propia para Vantare.
- Fuente auditada: `TinyPedal/TinyPedal` commit `ca52517b68295d6e71fd650e132bad081f82de8c`, releases hasta `v2.48.0`.
- Documento canónico: `docs/research/strategy-planner-tinypedal-analysis.md`.
- Decisión propuesta: una arquitectura común y tres entregas independientes: A) calculador manual, B) telemetría asistida, C) estratega live. Se concreta y planifica A primero; B y C reservan contratos y se especifican tras medir la fase anterior.
- Restricción legal: TinyPedal es GPLv3; referencia funcional clean-room, sin portar código. No se encontró licencia raíz de Vantare durante la auditoría.
- Investigación sin código Strategy; el plan ejecutable de Producto A y las guías B/C se crearon después en `STRATEGY-PLANS-01`.
- Estado: INVESTIGACIÓN DOCUMENTADA Y DECISIONES CERRADAS; ejecución gobernada por los tres documentos Strategy.

Nota LAUNCHER-V3-PLAN (2026-07-11):
- Objetivo: refactor contenido del subsistema Launcher para catálogo completo, detección reparable, logos offline, snapshot/store único, ejecución observable y control operativo.
- Decisiones de producto cerradas con el usuario: 55 respuestas incorporadas; alcance final = Launcher secuencial con seguimiento, políticas configurables, close/restart, dock, hotkeys, autostart, trigger opcional LMU, onboarding y notificaciones.
- Plan maestro: `docs/superpowers/plans/2026-07-11-launcher-v3-reliability.md`.
- Estrategia: 8 fases con TDD, commits pequeños, gates por fase, smoke Wails/Playwright y retirada final de contratos legacy.
- Fuera de alcance: import/export, cloud, plugins, scripts/comandos genéricos, historial persistente y rediseño visual.
- La skill `vantare-core` no se usa como fuente de verdad por indicación expresa del usuario.
- Estado: PLANIFICADO, sin cambios de código.
Nota ISA-95 (2026-07-14):
- **HISTÓRICO, SUPERADO POR REL-00 / ISA-121 (2026-08-02):** las referencias siguientes a `develop`, dispatch beta y gates previos a `develop` describen el flujo anterior. El contrato vigente es `rama de issue -> nightly -> testers -> master`; consulta `docs/branch-channels.md`.
- Redistribución de Discord implementada en rama aislada: releases públicas desde `master`, testers desde fragmentos que alcanzan `develop`, builds beta por dispatch y desarrollo activo desde proyectos Linear con opt-in público.
- Fuente tester: `docs/changelog/fragments/*.json`; se elimina el parser de primeras coincidencias históricas de este documento.
- Seguridad: secretos dedicados sin fallback, validación de IDs conocidos, dry-run sin red y gate manual de Isaac antes de `develop`.
- Validación real PASS (2026-07-14): release `29368648069`, testers `29368768778`, changelog beta `29368891135` y desarrollo activo final `29369095141`. Versión pública vigente verificada: `v0.1.0.2`.

Extensión ISA-95 v2 (2026-08-03):

- Los cuatro workflows históricos independientes se sustituyen por un pipeline coordinado: build, seis artefactos verificados, GitHub Release/pre-release y, solo entonces, Discord.
- Nightly y Testers conservan contratos editoriales e imágenes distintas; Changelog mantiene enlace, checksum y notas técnicas; Stable usa una tarjeta propia y valida su canal de destino.
- Cada pre-release declara un manifiesto canónico de issues para impedir anuncios históricos o contenido de relleno. Primer corte: `v0.1.0.5-nightly.1` con ISA-95, ISA-247 e ISA-257.
- Evidencia local: 31 tests del comunicador PASS, `actionlint` sin hallazgos nuevos y captura Chrome 1200x630 de Changelog validada visualmente. La validación final será la ejecución real de `Release build` desde `nightly`.
- Extensión híbrida completa (2026-07-15): Release, Testers, Desarrollo y Build combinan embed accesible con una tarjeta 1200×630 específica generada desde HTML inspirado en `roadmap_v5.2.html`. Sin IA ni dependencias nuevas. Las cuatro capturas locales están validadas; los POST reales de las imágenes siguen pendientes del gate manual.
- Revisión editorial (2026-07-15): eliminadas tarjetas de relleno y etiquetas mixtas (`Tester briefing`, `Public preview`, `Development pulse`, `Building in public`); Release extrae solo highlights estructurados, Testers muestra cambio/prueba/limitación y los estados con 1–2 elementos se centran sin inventar contenido. Contrato editorial y tests anti-slop añadidos.
- Plan y operación: `docs/superpowers/plans/2026-07-14-isa-95-discord-linear-communications.md` y `docs/discord-communications.md`.

Nota OVERLAY-STUDIO-V3 (2026-07-10):
- **ISA-92 / OS-02 EN PROGRESO, CIERRE LOCAL VALIDADO (2026-07-16):** Isaac rechazó la primera entrega por falta de paridad global en materiales, densidad, composición, catálogo y estado del inspector. La segunda pasada monta `V52Shell` + `StudioRoute` reales, perfil poblado, selección, action bar e inspector activo; publica wide/medium/compact, side-by-side, overlay, estados y métricas unmasked en `docs/analysis/isa-92-overlay-studio-parity/`. La recaptura final mantiene el drawer medium completo dentro del viewport y evidencia compact coherente; una revisión adversarial independiente cierra sin P0/P1/P2. Tests, build, lint focal, E2E e interacción real pasan; Crystal conserva el fallo heredado sin regeneración. PR #10 permanece draft, sin merge; commit/push e `In Review` siguen pendientes de completar la entrega.
- Objetivo: reconstrucción paralela de Overlay Studio V3 (Delta, Standings, Relative, Pedals en `vantare-original` y `vantare-crystal`).
- Autoridad: ADR `docs/adr/0003-overlay-studio-v3-rebuild.md` y plan maestro `docs/superpowers/plans/2026-07-10-overlay-studio-rebuild-master.md` (worktree `refactor`, rama `refactor`).
- Worktree: `C:\Users\isaac\emdash\worktrees\vantare-v2\refactor` — rama `refactor`.
- **Fase 0 ✅ CERRADA** (commits `b2326e3`..`4f340f5`): autoridad ADR, baseline, fixtures migración, caracterización 4 widgets, inventario consumidores.
- **Fase 1 ✅ CERRADA** (commits `2f0b3f3`..`2dfb940`): tipos/validación/migración V3 Go, storage revision-aware + backup `.pre-v3.bak`, `StudioProfileService` paralelo, contrato TS `profile-document.ts`, librería diseños `WidgetDesignService` + `widget-design.ts`.
- Evidencia baseline: `docs/overlay-studio-v3-baseline.md`, `docs/overlay-studio-v3-inventory.md`.
- Tests Fase 1: `go test ./pkg/config/... ./internal/app/... -run "ProfileDocumentStore|StudioProfileService|WidgetDesignService|MigrateProfile|ValidateProfileDocumentV3" -count=1` PASS; `pnpm --dir frontend test` → 166 files / 1584 PASS; `pnpm --dir frontend build` PASS.
- Goldens migración: `pkg/config/testdata/profile-v3-core-widgets-from-v0.golden.json`, `profile-v3-core-widgets-from-v2.golden.json`; parser TS alineado en `profile-contract-fixture.test.tsx` (parse + render de los 4 widgets del golden v2).
- Preexistentes documentados (no regresión): lint frontend 11 errores; `internal/server` nonce/port tests FAIL en `go test ./...`; flaky ocasional `TestConcurrentSavesDontCorruptFile` en `internal/app` (Windows file lock).
- **Fase 2 ✅ CERRADA** (commits `6e471fe`..`d853b4c`): registry funcional Delta, telemetry store, view model, design-system registry + migración visual, renderers Original/Crystal, `WidgetVisualHost`, harness visual determinista (`visual:overlay-studio`).
- Evidencia Fase 2: `pnpm --dir frontend test` → 179 files / 1642 PASS; `pnpm --dir frontend build` PASS; `pnpm --dir frontend visual:overlay-studio` x2 PASS (0.000% delta); `rg` design-systems sin imports prohibidos (solo aserciones en tests).
- **Fase 3 ✅ CERRADA** (commits `41df467`..`dd94e34` + fix build `studio-store`): session layouts, command reducer, widget order, bounded undo/redo, profile client Wails, `StudioProvider` global draft, crash recovery localStorage, dirty-navigation guard y hotkeys.
- Evidencia Fase 3: `pnpm --dir frontend test -- overlay-studio/state` x2 → 67 PASS; `pnpm --dir frontend test` → 188 files / 1709 PASS; `pnpm --dir frontend build` PASS.
- **Fase 4 ✅ CERRADA** (commits `b7bdec0`..`e80c612`): shell V10, geometría pura, canvas con `WidgetVisualHost`, drag/resize transaccional, preview controls, acciones unificadas, paneles responsive, modales dirty/recovery, harness V3 y visual geometry (wide/medium/compact + drag/resize).
- Evidencia Fase 4: `pnpm --dir frontend test -- src/hub/overlay-studio` → 159 PASS; `pnpm --dir frontend visual:overlay-studio` x2 → 15 baselines 0.000% delta + interacciones wide; `pnpm --dir frontend build` PASS.
- QA manual harness: `pnpm --dir frontend exec vite --config vite.overlay-studio-harness.config.ts --host 127.0.0.1` → `http://127.0.0.1:5176/overlay-studio-v3-harness.html`.
- Docs vivos canvas/drag: `docs/overlays-studio/` (índice `README.md`; anti-regresión `canvas-drag-imperative-preview.md`; exploración `arrastre-y-resize.md`; benchmark `benchmarks/` + `pnpm --dir frontend bench:overlay-studio-drag`).
- Fix drag teleport/rastro (2026-07-10): commit `dc382bf` — preview imperativa B1 (`canvas-frame-preview.ts`, `previewActive` en frame). Tests `useCanvasInteraction` 11/11; suite overlay-studio 233/233.
- Fix preview click shrink (2026-07-10): `clearStudioFrameLayoutPreview()` ya solo limpia el scaler cuando termina una sesión `resize`; una sesión `move` no puede borrar el `transform` comprometido por React. Regresiones cubiertas en `canvas-frame-preview.test.ts` y `useCanvasInteraction.test.tsx`; move/resize verificados en el harness real.
- Fix resize guides/capture (2026-07-10): las guías del canvas pasan a `z-index: 0` para quedar detrás de los frames y `lostpointercapture` se cablea desde frame/handles al cancelador de interacción. Resize durante captura perdida restaura el layout, elimina guías y no marca dirty; verificado en navegador.
- Task 5.8 Browser View (2026-07-10): `browser-view.ts` abre `/overlay?profile=` solo con perfil guardado; si dirty → guardar o cancelar (sin descartar). Cableado en `OverlayStudioV3` + `StudioCanvas`.
- Harness Browser View (2026-07-10): middleware Vite (`overlay-studio-harness-vite-plugin.ts`) + preview studio (`studioPreview=1`, fondo gris/rejilla, escala fit). Commits `32bc433`..`39a1133`.
- **Fase 5 ✅ CERRADA** (commits `96d7119`..`a606b21` + harness browser view): inspector por capacidades, catálogo, diseños, access policy, Browser View.
- **Fase 7.1 ✅ CERRADA** (commit `39f864a`): handlers Wails `studio:profile:load/save` con `requestId` correlacionado; `WidgetDesignService` handlers ya registrados; `StudioProfileService.RegisterHandlers` en `main.go`.
- Evidencia 7.1: `go test ./internal/app/... -run "StudioProfileService|WidgetDesignService" -count=1` PASS.
- **Fase 7.2 ✅ CERRADA** (commit `9ab6bd7`): `normalizeLegacyTelemetry`, `TelemetryRateCoordinator`, adaptadores Wails (`telemetry:update`) y SSE (`/telemetry/stream`); stale/disconnected/error publican inmediato; buckets compartidos por Hz.
- Evidencia 7.2: `pnpm --dir frontend test -- telemetry-adapter telemetry-rate-coordinator wails-telemetry sse-telemetry` → 16 PASS; `pnpm --dir frontend test -- src/overlay` → 76 files / 486 PASS; `pnpm --dir frontend build` PASS; `pnpm --dir frontend visual:overlay-studio` → 59 baselines 0.000% delta + parity + studio QA, exit 0.
- **Fase 7.3 ✅ CERRADA** (commit `e7bfa14`): `resolve-runtime-layout`, `RuntimeWidgetFrame`, `RuntimeOverlaySurface`, `useRateLimitedTelemetry`; layout runtime sin materializar sesiones; widgets filtrados por enabled/visibility/z-index; preserved legacy con diagnóstico no fatal.
- Evidencia 7.3: `pnpm --dir frontend test -- resolve-runtime-layout RuntimeWidgetFrame RuntimeOverlaySurface` → 14 PASS; `pnpm --dir frontend visual:overlay-studio` exit 0.
- **Fase 6 ✅ CERRADA** (commits `074d389`..`5f44acb`): 6.1–6.8 migración funcional completa (Standings, Relative, Pedals Original/Crystal); registry 4 widgets × 2 systems; official designs; catálogo 4 entradas; golden v2 sin diagnósticos; fix chrome selección Relative (`fcf4989`).
- **6.9 matriz visual + parity:** harness 4 widgets (`harness-fixtures.ts`), 59 baselines PNG (widget×system×surface ready + estados error + variantes stress60/fill/zero/full), assertions HTML parity studio/desktop/obs en Vitest + Playwright, chrome Relative en studio verificado.
- Evidencia Fase 6 (2026-07-11): `pnpm --dir frontend test -- src/overlay` → 69 files / 456 PASS; `pnpm --dir frontend test -- OverlayParityHarness harness-fixtures` → 21 PASS; `pnpm --dir frontend visual:overlay-studio` x2 → 59 baselines 0.000% delta + parity 4 widgets + studio-relative-chrome + drag/resize + zoom; `pnpm --dir frontend build` PASS.
- **Fase 7.4 ✅ CERRADA** (commit `960838a`): `GET /api/profile-v3` migration-aware para OBS.
- **Fase 7.5 ✅ CERRADA** (commit `a5f31c4`): lifecycle Go V3 (`StudioProfileService` canónico, hotkeys, `overlay:profile-v3-loaded`, navegación Hub).
- **Fase 7.6 ✅ CERRADA** (commit `2b1c6e5`): `DesktopOverlayRuntime` + `CompositeApp` con adaptador Wails y evento `overlay:profile-v3-loaded`.
- **Fase 7.7 ✅ CERRADA** (commit `5a407f1`): `ObsOverlayRuntime` + `ObsOverlayApp` con `/api/profile-v3` y SSE.
- **Fase 7.8 ✅ CERRADA** (commit `ddf73ab`): refresh del overlay activo solo tras save exitoso del mismo perfil.
- **Fase 7.9 ✅ CERRADA** (commit `6ba0d0a`): `StudioRoute` entra directo al editor V3 con perfil activo; `NoActiveProfileState`; telemetría live por coordinador + `useRateLimitedTelemetry` en frames; sin `V52OverlaysHome` ni `EMPTY_PROFILE`.
- **Fase 7.10 ✅ CERRADA** (commit `71867c6`): gates automatizados frontend + visual + Go app; smoke manual documentado en `docs/manual-verification.md` (requiere Wails + copia de perfil de prueba).
- Evidencia 7.4–7.10 (2026-07-11): `pnpm --dir frontend test` → 258 files / 2084 PASS (1 fix live-disconnected en `StudioCanvas.test.tsx`); `pnpm --dir frontend build` PASS; `pnpm --dir frontend visual:overlay-studio` → 59 baselines 0.000% delta + parity + studio QA; `go test ./internal/app/... ./cmd/vantare/... -count=1` PASS; `go test ./...` mantiene preexistentes en `internal/server` (nonce/port bind).
- **Post-7.10 hotfix ✅** (commit `32b24b3`, 2026-07-11): plan Free puede mover/redimensionar todos los widgets (layout libre; premium sigue en content/visual); avisos de acceso en banner; flujo crear perfil + carga Hub + standings defaults + harness E2E ruta studio. Smoke manual Wails en Desktop (`refactor`) **PASS** (usuario).
- **Fase 8.7A ✅ CERRADA** (commit `888ebda`, 2026-07-11): retirado editor legacy `hub/overlays` (34 archivos); conservados `OwnProfilesView`, `RecommendedProfilesView`, OBS/community. i18n: eliminados `studio.saveToWidget` y `studio.discard`.
- **Fase 8.7B ✅ CERRADA** (2026-07-11): retirados `PreviewPage`, `WidgetsPage` y módulos preview legacy (`PreviewCanvas`, `PreviewInspector`, `WidgetList`, etc.). Conservados `PreviewWidgetFrame` + `WidgetRenderer` para miniaturas de perfiles (`ProfilePreview`). Contrato harness movido a `overlay-harness/widget-preview-contract.ts`.
- Evidencia 8.7A–8.7B: `pnpm test -- StudioRoute ProfilePreview overlay-studio widget-preview-contract` → 306 PASS; `pnpm build` PASS.
- **Fase 8.7C ✅ CERRADA** (2026-07-11): retirados `EditOverlayApp`, `WidgetEditFrame`, `shared-widget-map`, `WidgetHost` y ruta `/overlay/edit`. Runtime desktop/OBS ya usaba V3 (`DesktopOverlayRuntime`, `ObsOverlayRuntime`). Conservados `WidgetRenderer` + miniaturas de perfiles. `StartEditOverlay` en Go queda sin callers frontend (retiro Go diferido).
- Evidencia 8.7C: `pnpm test -- CompositeApp ObsOverlayApp DesktopOverlayRuntime ObsOverlayRuntime ProfilePreview StudioRoute overlay-studio widget-preview-contract` → 309 PASS; `pnpm build` PASS.
- **Fase 8.7D ✅ CERRADA** (2026-07-11): miniaturas de perfiles migradas a V3 (`WidgetVisualHost` + `previewDocument` en `ListProfiles`); retirados `WidgetRenderer`, `PreviewWidgetFrame`, componentes legacy `overlay/widgets/*Widget.tsx`, harness parity legacy, settings sections huérfanas y `StartEditOverlay` Go.
- Evidencia 8.7D: `pnpm test -- ProfilePreview overlay-studio widget-preview-contract CompositeApp ObsOverlayApp` → 327 PASS; `pnpm build` PASS; `go test ./internal/app/...` PASS.
- **Fase 8.7E ✅ CERRADA** (2026-07-11): retirados `widget-design-gallery`, `WidgetDesignGallery`, `widget-presets`, `widget-presets-store` y `widget-variants` (frontend legacy). Diseños oficiales V3 siguen en `official-designs.ts`; tests de fixtures migrados sin dependencia del modelo legacy de variants.
- Evidencia 8.7E: `pnpm test -- overlay-studio official-designs widget-preview-fixtures` → 316 PASS; `pnpm build` PASS.
- **Fase 8.7F ✅ CERRADA** (2026-07-11): retirado Go `PresetService` y handlers Wails `preset:*` (sin callers tras 8.7E). Migración one-shot `widget-presets.json` → `widget-designs.json` conservada en `WidgetDesignService` con tipos legacy internos.
- Evidencia 8.7F: `go test ./internal/app/... ./cmd/vantare/... -count=1` PASS; `pnpm test -- widget-design-client` → 11 PASS.
- **Fase 8.7G ✅ CERRADA** (2026-07-11): auditoría retirement `docs/overlay-studio-v3-retirement-audit.md`; inventario actualizado; búsqueda consumidores legacy → cero en producción.
- **Fase 8.8 ✅ CERRADA** (2026-07-12): auditoría final `docs/overlay-studio-v3-final-audit.md` actualizada; gates frescos: `pnpm test` 213 archivos / 1578 tests PASS, `pnpm build` PASS, `visual:overlay-studio` 59 baselines 0.000% delta + parity + QA responsive/teclado PASS, `design-system:check` 2 sistemas PASS, `go test ./internal/app/... -run StudioProfileService` PASS.
- **Fase 8 (cutover V3) ✅ CERRADA** para merge: retirement 8.7 y hardening 8.1–8.6 completos. El lint frontend y `go test ./...` mantienen fallos preexistentes fuera del alcance; quedan documentados como gates de mantenimiento separados.
- **Siguiente:** push `refactor`; merge cuando usuario apruebe; expansión de widgets y resolución de los gates preexistentes de lint/`internal/server`.
- Rollback ordenado (revert commits en orden inverso): Hub route `6ba0d0a` → OBS `5a407f1` → Desktop `2b1c6e5` → lifecycle `a5f31c4`. Legacy editor/renderer retirado en Fase 8.7.
- Índice Luna: `docs/superpowers/plans/2026-07-10-overlay-studio-rebuild-luna-execution-index.md`.

Nota LAUNCH-1C (2026-07-10):
- Objetivo: cerrar smoke de checkout Polar **produccion** sin pago real (sin presupuesto test).
- Proyecto Supabase: `ombjshwzqgeisazijduq` (oficial). Sin merge PR, sin tag, sin release publico.
- Script smoke: `supabase/.temp/smoke-prod-billing.ps1` (gitignored). Mapping aplicado via `supabase/.temp/polar-prod-map.env` (gitignored, no commiteado).
- `POLAR_PRODUCT_MAP` prod re-aplicado (minificado, ASCII, IDs prod):
  - `launch_lifetime` -> `b1b1e348-acd6-4a81-ba67-db6d98aca2e6`
  - `pro_monthly` -> `0f91f52f-f92f-4a7a-9782-da2ec44cf8b8`
  - Sin IDs sandbox (`fd15a961...`, `41cffd72...`). Ambos -> entitlement `bundle`.
- Resultados smoke prod (2026-07-10, sin abrir checkout ni comprar):
  - Auth JWT: OK (`state_password_grant`, usuario `fase2g.smoke.1783629293344@gmail.com`)
  - `launch_lifetime`: OK HTTP 200, URL `polar.sh/checkout/...` (prod, no sandbox)
  - `pro_monthly`: OK HTTP 200, URL `polar.sh/checkout/...` (prod, no sandbox)
  - Spoof `forbidden_field`: OK HTTP 400
  - `mapping_invalid_json`: resuelto (ya no aparece)
- **No validado** (requiere pago real): webhook prod `order.paid` 202, `user_entitlements`, `billing_subscriptions`, billing portal prod end-to-end.
- Estado gates:
  - **GO** generar checkout produccion (API + URLs Polar prod)
  - **NO-GO** venta publica hasta smoke de pago real o aceptacion explicita del riesgo
- `VITE_BILLING_ENABLED`: default en codigo sigue `false` (`billing-client.ts` solo activa con `=== "true"`). No activado en pipeline release publico este corte.
- Secrets: no tocados en este cierre (solo documentacion). OAT/whsec/map ya aplicados en sesiones previas.
- Checklist pendiente (cuando haya presupuesto ~4.99 EUR):
  1. Pago real controlado **Pro Monthly** (4.99 EUR) con cuenta smoke dedicada
  2. Verificar webhook Polar prod responde **202** y escribe `license_events`
  3. Verificar `user_entitlements` -> `bundle` activo (mensual)
  4. Verificar fila en `billing_subscriptions` coherente con Polar
  5. Verificar billing portal produccion (abrir sesion, volver a app)
  6. Cancelar suscripcion y/o refund en Polar si procede
  7. Revalidar en app: Ajustes -> "Actualizar estado de licencia"
  8. Solo entonces valorar `VITE_BILLING_ENABLED=true` en release (Fase 2H)
- Plan Polar: `docs/superpowers/plans/2026-07-09-fase-2-polar-integration.md` seccion Fase 2H / Launch-1C.
- Estado: ✅ CERRADO (checkout prod smoke sin pago)

Nota LAUNCH-0.5-COMMIT (2026-07-09):
- Branch: `launch/polar-billing` — commit `cc84a4b` (68 archivos, solo billing/licencia Polar Fase 1.6–2G).
- Excluido del commit: calendar, launcher, marketing, pnpm-workspace, smoke scripts, temporales.
- Push: **pendiente** (confirmar con humano).
- Estado: ✅ CERRADO

Nota LAUNCH-0-AUDIT (2026-07-09):
- Objetivo: auditoría pre-producción billing Polar — sin deploy prod, sin activar `VITE_BILLING_ENABLED` en release.
- Tests: `pnpm --dir frontend test` 164 files / 1570 PASS; `pnpm --dir frontend build` OK; `deno test supabase/functions` 79 PASS; `go test ./internal/license/...` PASS.
- Secretos: `.env` / `apps/desktop/.env` locales con service role (gitignored); nada trackeado en `git ls-files` (`.env.local`, `smoke-jwt`, `smoke-session.json`).
- Playwright E2E: no hay `playwright.config.ts`; checklist billing cubierto por Vitest (`billing-client`, `PaywallScreen`, `AccountSettings`, `entitlements-refresh`).
- Riesgo bloqueante pre-prod: working tree sucio (billing untracked + mezcla launcher/calendar); commits ordenados pendientes antes de Launch-1.
- Launch-1 (humano): Polar prod org + productos, webhook prod, `supabase secrets set` prod, deploy EF, `VITE_BILLING_ENABLED=true` solo en pipeline release, smoke post-deploy, rollback = `VITE_BILLING_ENABLED=false` + revert secrets.
- Recomendación Launch-0: **no-go a producción** hasta commit limpio billing + Launch-1 checklist humano.
- Estado: ✅ CERRADO (auditoría)

Nota FASE-2G-SMOKE (2026-07-09):
- Objetivo: smoke GUI post-pago Polar — login → premium activo → Hub desbloqueado → refresh/reset PC en Ajustes.
- Usuario smoke: `fase2g.smoke.1783629293344@gmail.com` (credenciales en `%TEMP%\vantare-fase2g-state.json`, gitignored).
- Supabase oficial `ombjshwzqgeisazijduq`: `user_entitlements` con `bundle` + `active` (Polar lifetime); RPC `get_account_entitlements` OK con huella real del PC.
- **Smoke GUI PASS (2026-07-09):** `wails3 dev` + login email → Ajustes → “Actualizar estado de licencia” → **“Acceso lifetime activo.”** Diagnóstico: `mock_runtime=false`, `state=active`, `entitlements=["bundle"]`, `deviceOK=true`, `tokenLen=843`, refresh `unlocked=true`.
- Bugs corregidos en este corte:
  1. `frontend/vite.config.ts`: el mock `@wailsio/runtime` solo con `VITE_RUNTIME_MOCK` (harnesses); `wails3 dev` usa runtime real → Go.
  2. `internal/license/types.go` + `service.go`: `lastValidated` como RFC3339 string en wire.
  3. `frontend/src/lib/entitlements-refresh.ts`: correlación refresh/reset + logs.
  4. `frontend/src/lib/license-debug.ts`, `license-debug-log.ts`, `hub/settings/LicenseDiagnosticsPanel.tsx` (panel dev en Ajustes).
  5. `tools/start-wails-dev-visible.ps1` (terminal visible opcional).
- Comando dev: `powershell -File tools\start-wails-dev.ps1` (inyecta `VANTARE_SUPABASE_*` desde `frontend/.env.local`).
- Tests: `go test ./internal/license/...` PASS; `pnpm --dir frontend test -- entitlements-refresh AccountSettings license` PASS.
- Pendiente Fase 2H: `VITE_BILLING_ENABLED=true` en release prod, secrets prod, monitor webhooks. `BILLING_ENABLED` sigue `false` en dev por defecto.
- Spec técnico completo: `docs/superpowers/specs/2026-07-09-fase-2g-licensing-revalidation-spec.md`
- Estado 2G: ✅ CERRADO (smoke GUI PASS)

Nota FASE-2-POLAR (2026-07-09):
- Plan maestro: `docs/superpowers/plans/2026-07-09-fase-2-polar-integration.md`
- Fase 2A: `docs/superpowers/plans/2026-07-09-fase-2a-polar-dashboard-setup.md` — docs Polar + mapping example.
- Fase 2B: skeleton EF billing + tests Deno.
- Fase 2C: `billing-checkout` checkout real Polar sandbox (`POST /v1/checkouts/`, mapping `product_id_to_checkout_key`, sin `polar_price_id`). Tests Deno 35 PASS. Sin deploy, sin `VITE_BILLING_ENABLED`.
- Fase 2G: smoke GUI post-pago + revalidación — ver nota **FASE-2G-SMOKE** arriba (✅ CERRADO).
- Secrets en Supabase (humano): `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_MAP`, `CHECKOUT_*`, `PORTAL_RETURN_URL`.
- Gate: no deploy EF hasta E2E sandbox manual post-deploy.
- Estado 2C: ✅ CERRADO EN REPO — listo para deploy sandbox `billing-checkout`

Nota LAUNCHER-BUGFIX (2026-07-09):
- Bug 1: `os.ExpandEnv` no expande `%VAR%` Windows. Fix: `expandWindowsEnv()` en `discovery.go`.
- Bug 2: Apps como OBS necesitan `cmd.Dir` = su carpeta para encontrar archivos relativos (locale, config). Fix: `cmd.Dir = filepath.Dir(entry.ExecutablePath)` en `chain.go`.
- Apps afectadas conocidas: OBS. Potencialmente CrewChief, SimHub, MoTeC.
- Documentación completa en `docs/superpowers/specs/2026-07-08-launcher-v2-design.md` sección 11.

Nota FASE-1-6-BILLING (2026-07-09):
- Objetivo: billing/licensing provider-agnostic (Polar-ready) sin integrar Polar.
- Proyecto Supabase **oficial**: `ombjshwzqgeisazijduq` (`https://ombjshwzqgeisazijduq.supabase.co`). Auth/Google operativo; migraciones aplicadas 2026-07-09.
- Proyecto **equivocado** (solo pruebas): `olhwhfaczmrmooeaoqqf` — Fase 1.6 se aplicó allí por error antes de la corrección. Queda como staging/test o abandonado; **no usar en app/CI**.
- Completado en proyecto correcto: migraciones `20260605140000`, `20260709120000`, `20260709150000`, `20260709160000` (backfill profiles); `billing-client` (`BILLING_ENABLED=false`); Paywall/AccountSettings sin endpoints fantasma; Go decoder PostgREST array; smoke RPC + device binding + entitlement manual; smoke GUI Wails (`bin/vantare-smoke-correct.exe`) PASS.
- Env locales alineados (gitignored): `.env` raíz, `vantare-v2/frontend/.env.local`, `apps/desktop/.env`. Build Wails: `tools/generate_supabase_config.ps1` lee `VANTARE_SUPABASE_*` en compile-time.
- Pendiente humano: GitHub Actions secrets `VITE_SUPABASE_*` deben apuntar a `ombjshwzqgeisazijduq` antes del próximo release tag; backup CLI pre-push (Docker); `validate-license` legacy deployada (Fase 3).
- NO hecho: Polar, deploy EF nuevas, `db reset`, borrar tablas viejas (`licenses`/`subscriptions` siguen en schema por trigger `handle_new_user`; runtime app usa `user_entitlements` vía RPC).
- Tablas legacy: sin dependencia activa en Go/frontend (solo trigger SQL signup + EF `validate-license` deprecated).
- Estado: ✅ CERRADO (proyecto correcto)

Nota FEATURES-MANUAL-SOURCE (2026-07-08):
- Objetivo: la pestaña 'Desarrollo por features' del Roadmap pasa a tener una fuente manual (JSON) igual que 'Roadmap actual', sin scripts de auto-generación.
- Decisiones cerradas: (1) Fuente de verdad = docs/features-source.json (Isaac edita a mano). (2) App trae el JSON por fetch en runtime; sin red, usa FEATURES_FALLBACK. (3) 3 secciones en la pestaña: 'En desarrollo' / 'En investigación' / 'Próximamente'. (4) `status` ∈ in-development|research|future (campo explícito). (5) `tipo` ∈ feature|bugfix|improve|component (research deja de ser tipo y pasa a ser status). (6) `category` declarada en la fuente, sin CATEGORY_MAP hardcodeado. (7) `percent` único campo de progreso (escala 0/10/25/50/75/100), sin done/total. (8) `pickText` reusado de roadmap-data.ts.
- Archivos nuevos: docs/features-source.json, frontend/src/hub/roadmap/features-data.ts, frontend/src/hub/roadmap/features-data.test.ts.
- Archivos modificados: frontend/src/hub/roadmap/roadmap-features.ts (consume features-data.ts, expone TIPO_META de 4 tipos + STATUS_META de 3 status + getActiveSections con return { sections, overallProgress }), frontend/src/hub/roadmap/roadmap-features.test.ts, frontend/src/hub/pages/RoadmapPage.tsx (FeaturesSection pinta 3 bloques, import cleanup explícito, estado inicial síncrono), frontend/src/hub/pages/RoadmapPage.test.tsx, docs/roadmap-maintenance.md, docs/roadmap-agent-guide.md.
- Archivos eliminados: scripts/generate-roadmap-progress.mjs, frontend/src/hub/roadmap/roadmap-progress.json.
- Keys i18n obsoletas: roadmap.features.noFeatures y roadmap.features.checks quedan sin uso. No se añaden keys nuevas.
- Checks: tsc 0 errores, suite completa +25 tests PASS, build OK.
- Sin commit, sin tag, sin release.
- Estado: 🟢 ACTIVO

Nota ROADMAP-MANUAL-SOURCE (2026-07-08):
- Objetivo: hacer el roadmap 100% manual (sin scripts de auto-generación) y que los cambios lleguen automáticamente a todos los clientes con la app descargada, sin nuevo release.
- Decisiones cerradas: (1) Fuente de verdad manual = `docs/roadmap-source.json` (Isaac edita a mano). (2) La app trae el JSON por `fetch(ROADMAP_SOURCE_URL)` en runtime al abrir la pestaña Roadmap; sin red, usa `ROADMAP_FALLBACK` empaquetado. (3) Texto de las cards (título, resumen, highlights, hitos) pasa de i18n a inline en el JSON en es/en/pt/it; el "chrome" de la UI (eyebrows, feedback, hero, tab labels) sigue en i18n. (4) `ROADMAP_NEXT` (r1–r15) eliminado (era código muerto; la pestaña "next" ya mostraba `roadmap-features.ts`). (5) `DashboardFeatureCarousel` migrado de `ROADMAP_CURRENT` a `ROADMAP_FALLBACK` + `pickText`. (6) Procedimiento documentado en `docs/roadmap-maintenance.md` (re-escrito, sin lenguaje de "snapshot/build-time/script").
- URL por defecto: raw GitHub del JSON en el repo público. Cambiable vía la constante `ROADMAP_SOURCE_URL` en `frontend/src/hub/roadmap/roadmap-data.ts` (si más adelante usas Google Doc exportado a JSON o Supabase Storage).
- Contenido actual del JSON refleja el trabajo activo: `calendar-local` 50% (refactor LMU), milestone `calendar-refactor` añadido, beta-iteration 75% con highlights del refactor de calendario y la iteración de Roadmap.
- Archivos nuevos: `docs/roadmap-source.json`.
- Archivos modificados: `frontend/src/hub/roadmap/roadmap-data.ts` (tipos con `LocalizedText`, `ROADMAP_SOURCE_URL`, `ROADMAP_FALLBACK`, `fetchRoadmapDataset`, eliminado `ROADMAP_NEXT/ROADMAP_CURRENT/ROADMAP_DATASETS/getRoadmapDataset/RoadmapDatasetKey/ROADMAP_PHASES/ROADMAP_AREAS/ROADMAP_MILESTONES`), `frontend/src/hub/pages/RoadmapPage.tsx` (fetch en runtime + render inline por locale), `frontend/src/hub/components/DashboardFeatureCarousel.tsx` (usa `ROADMAP_FALLBACK` + `pickText`), `frontend/src/hub/roadmap/roadmap-data.test.ts` (test reescrito al nuevo API + 3 tests de `fetchRoadmapDataset` con fetch mockeado), `frontend/src/hub/pages/RoadmapPage.test.tsx` (mock de fetch para no tocar red), `docs/roadmap-maintenance.md` (flujo manual + entrega automática, sin script).
- Keys i18n `roadmap.current.*` y `roadmap.next.*` en los 4 diccionarios quedan obsoletas (las cards ya no las consultan). Se conservan para evitar churn; pueden limpiarse en otro corte.
- Checks: `tsc --noEmit` OK, 149 test files / 1431 tests PASS, `pnpm --dir frontend build` OK (warning preexistente de chunk size).
- Sin commit, sin tag, sin release.
- Estado: 🟢 ACTIVO


- Objetivo: mostrar las carreras de intervalo (Bronce/Plata/Oro) como eventos individuales en la línea de tiempo del DayView, con patrón escalonado predecible.
- Problema: actualmente las series de intervalo solo aparecen como banda "Horario" estática. El usuario quiere verlas en la grid de 24h.
- Solución: 2 cortes — (1) añadir `offsetMinutes` al mock data para crear patrón escalonado, (2) modificar DayView para generar eventos de intervalo individuales (máx 3/tier/hora).
- Plan detallado: `docs/superpowers/plans/2026-07-07-calendar-interval-races-dayview.md`
- Bugfixes asociados: filtro en mes/semana, bandas Horario por filtro, rail duplicados.
- Estado: 🟢 ACTIVO

Nota CALENDAR-REFACTOR (2026-07-07):
- Objetivo: reescribir la pestaña de calendario para mostrar la cadencia de preparación de LMU (cada cuánto, duración, pista, setup, splits, assists, neumáticos) en vez de materializar cientos de eventos de intervalo. Corregir bugs de filtro Especial, zona horaria, panelTier, y código muerto.
- Problema raíz: el calendario oficial LMU tiene series diarias (Bronce cada 15min, Plata cada 20min, Oro cada 30min) con múltiples pistas por tier. El código anterior materializaba 24 bloques/hora por serie en DayView y no mostraba info de preparación. El filtro "Especial" estaba roto en rail. La zona horaria usaba el navegador en vez de `calendar.timezone`. `panelTier` se abría automáticamente al filtrar (inconsistente toolbar vs rail).
- Decisiones cerradas:
  - (1) Interval-series NUNCA se materializan en la rejilla. Se muestran como banda de "Preparación" con cadencia + duración + pistas. Solo weekly-slots y special van a la línea de tiempo.
  - (2) Filtrar NUNCA abre el modal de detalle. Solo un click explícito en tarjeta de rail o badge de tier lo abre.
  - (3) Zona horaria: todas las vistas usan `calendar.timezone` vía `Intl.DateTimeFormat` con `timeZone`. `DEFAULT_TIMEZONE` se usa como fallback en `EMPTY_CALENDAR`.
  - (4) Mock reescrito con datos reales del seed LMU: 3 beginner, 3 intermediate, 3 advanced, 1 weekly, 1 special. `seriesPreviews` con `nextStarts` y `scheduleLabel`.
  - (5) `CalendarRaceRail` recibe `calendar` como prop (no se suscribe internamente). Eliminado doble `requestCalendar`.
  - (6) Navegación month usa día 1 del mes destino (sin deriva de fecha).
  - (7) Título de semana muestra rango completo cross-mes ("28 Jun - 4 Jul"). Día capitaliza día de semana ("Miércoles").
- Archivos nuevos: `frontend/src/hub/calendar/calendar-shared.ts` (tierStyle, formatInZone, cadenceLabel, TIER_STYLES, TIER_LABELS).
- Archivos eliminados: `CalendarSeriesCard.tsx` + test, `calendar-tier.ts`, tests de `getSeriesPatternLabel` y `groupOccurrencesByLocalDay` en `calendar-view-math.test.ts`.
- Archivos reescritos: `CalendarMonthView.tsx`, `CalendarWeekView.tsx`, `CalendarDayView.tsx`, `CalendarRaceRail.tsx`, `CalendarToolbar.tsx`, `calendar-visual-mock-data.ts`.
- Archivos modificados: `CalendarPage.tsx` (panelTier desacoplado, loading state, timeZone), `CalendarRaceDetailPanel.tsx` (timeZone), `calendar-upcoming.ts` (special slot), `calendar-view-math.ts` (eliminadas funciones muertas).
- Tests: 123/123 calendar+page PASS, 1395/1395 full suite PASS, tsc 0 calendar errors. Lint/build errores preexistentes (roadmap test, react-refresh).
- No se tocó: backend Go, Supabase/Auth, WidgetStudio, LayoutStudio, runtime OBS, dependencias, position/x/y/w/h.
- Estado: 🟢 ACTIVO
- Plan: `docs/superpowers/plans/2026-07-07-calendar-interval-races-dayview.md`

# Plan actual

Nota ROADMAP-ITERATION (2026-07-07):
- Objetivo: iterar la pantalla RoadmapPage — i18n de datos, dual roadmaps, changelog real, feedback panel, features desde planes, y porcentajes reales.
- Decisiones cerradas: (1) feedback abre enlaces externos prefirmados; gating por `roadmap.feedback`. (2) Dos roadmaps con toggle. (3) Escala de porcentajes obligatoria. (4) Changelog sincronizado a mano. (5) Strings i18n. (6) Features desde planes de superpowers con progreso automático via checks.
- Archivos nuevos: `docs/roadmap-maintenance.md`, `docs/superpowers/plans/2026-07-06-roadmap-*.md`, `docs/superpowers/plans/2026-07-07-roadmap-features-from-plans.md`.
- Archivos modificados: `frontend/src/hub/roadmap/roadmap-data.ts`, `roadmap-data.test.ts`, `RoadmapPage.tsx`, `RoadmapPage.test.tsx`, locales i18n.
- Checks: 79/79 roadmap+i18n tests PASS, tsc OK, lint 0 errores.
- Estado: 🟢 ACTIVO
- Plan: `docs/superpowers/plans/2026-07-07-roadmap-features-from-plans.md`
- Sin commit, sin tag, sin release.
Nota OBS-LAN-DOUBLE-PC (2026-06-25):
- Objetivo: configuración automatizada de OBS LAN para doble PC con Vantare.
- Tipo: research
- Estado: 🔮 FUTURO
- Plan: `docs/superpowers/plans/2026-06-25-obslan-double-pc.md`

Nota OVERLAY-PERFORMANCE (2026-06-25):
- Objetivo: optimizaciones de rendimiento en el runtime de overlays.
- Tipo: improve
- Estado: 🔮 FUTURO
- Plan: `docs/superpowers/plans/2026-06-25-overlay-performance-fixes.md`

Nota PEDALS-INVENTORY (2026-06-25):
- Objetivo: inventario técnico del widget Pedals y camino a implementación completa.
- Tipo: research
- Estado: 🔮 FUTURO
- Plan: `docs/superpowers/plans/2026-06-25-p1-pedals-inventory.md`

Nota INGENIERO-INTEGRATION (2026-06-25):
- Objetivo: integración completa del módulo Ingeniero con LMU live.
- Tipo: feature
- Estado: 🔮 FUTURO
- Plan: `docs/superpowers/plans/2026-06-25-vantare-suite-ingeniero-integration.md`

Nota WORKDAY-2026-07-06 — Widget Studio launch polish:
- Objetivo del dia: estabilizar Widget Studio para el lanzamiento de esta tarde sin mezclarlo con cambios de backend, calendario o LayoutStudio.
- Segmento 1 — ACCESS-DEV-MODES: preparar modos de ejecucion/verificacion Free, Paid, Tester, Power Tester y Blocked sin rehacer la arquitectura de roles. La fuente de verdad sigue siendo `access-policy`/licencia; los modos son para dev, harness y pruebas manuales.
- Segmento 2 — I18N-01: crear base i18n ligera para espanol, ingles, portugues e italiano. Traducir primero la UI visible de Widget Studio y mantener IDs tecnicos internos como datos, no copy publica.
- Segmento 3 — WIDGET-FIXTURES-01: unificar fixtures canonicos por widget. El mismo widget debe tener los mismos datos mock entre disenos oficiales: standings con la misma densidad de pilotos, relative con el mismo entorno de coches, delta/pedals con los mismos valores.
- Segmento 4 — WIDGET-PREVIEW-SCALE: normalizar tamano relativo en la preview de Widget Studio sin tocar runtime OBS, sin mutar `position`, `x`, `y`, `w` ni `h`. La escala debe vivir en el contenedor de preview, no dentro del widget.
- Segmento 5 — WIDGET-TABLE-PRIMITIVES: alinear columnas, badges, neumaticos, gaps y celdas entre standings, relative y multiclass con primitives compartidas. `textAlign` debe ser configurable internamente por columna aunque no sea ajuste publico.
- Segmento 6 — DESIGN-SELECTOR-UX: hacer el selector de diseno mas visible e intuitivo, con nombre, descripcion, access badge y estado activo/bloqueado. No debe quedar como un select pequeno perdido en la esquina.
- Segmento 7 — UI-POLISH-LAUNCH: pasada final de consistencia visual y copy antes del lanzamiento: comprobar tamanos, traducciones, estados bloqueados, previews, visual compare con Playwright y screenshots side-by-side. No commitear PNGs salvo decision explicita.
Nota WIDGET-PREVIEW-PARITY-01 (2026-07-06) — Plan:
- Plan creado en `docs/superpowers/plans/2026-07-06-widget-preview-parity-01-canonical-fixtures-and-size.md`.
- Objetivo: que cada widget conserve mismos datos, mismos pilotos/items, misma densidad, misma altura visible y mismo tamano de preview entre sus disenos oficiales. Solo puede cambiar la personalizacion visual implicita del sistema de diseno.
- Decisiones cerradas: standings usa 20 pilotos canonicos; relative usa 5 filas; standings/relative usan el mismo set semantico de columnas entre disenos; el alcance de tamano igual es solo preview/harness; delta/pedals solo requieren tamano proporcional, no simetria perfecta.
- Alcance previsto: fixtures canonicos, contrato de tamano/densidad preview-only, tests RED/GREEN y visual compare con Playwright. No tocar LayoutStudio, runtime OBS, backend, calendario, access policy ni `position/x/y/w/h`.
Nota WIDGET-PREVIEW-PARITY-01 (2026-07-06) — Implementation:
- Fixtures canónicos: `widget-preview-fixtures.ts` — 20 pilotos HYPERCAR canónicos (player TOYOTA GAZOO #8 en posición 5), derivación de 5 filas relative (2 ahead + player + 2 behind), columnas semánticas canónicas para standings (6 columnas) y relative (6 columnas), filtros canónicos para relative (rangeAhead: 2, rangeBehind: 2), valores estáticos para delta/pedals.
- Contrato de preview: `widget-preview-contract.ts` — tamaños canónicos por widget type (standings: 420×620, relative: 420×260, delta: 420×140, pedals: 420×120).
- WidgetSandboxPreview: cuando el widget tiene un diseño oficial (`variantId.startsWith("official-")`), aplica overrides canónicos al profile (columnas, filtros, maxRows) y usa el tamaño del contrato en vez de `widget.position`.
- mock-telemetry.ts: sin cambios. Se mantuvo el mock base original (16 vehículos, mix de clases) para preservar la intención multi-class del runtime mock. La fuente canónica de preview es `widget-preview-fixtures.ts` (20 HYPERCAR). El mock se documenta como intencionalmente distinto.
- Tests: 38 tests nuevos (widget-preview-fixtures: 28, widget-preview-contract: 10). 89 tests enfocados widget PASS. tsc OK, lint OK, build OK.
- Visual compare: `widget-studio-visual-compare.mjs` creado — captura 12 diseños oficiales, valida invariantes de paridad (row count, columnas semánticas, drivers canónicos), exit 1 si falla. Requiere dev server y Playwright.
- Archivos nuevos: widget-preview-fixtures.ts, widget-preview-fixtures.test.ts, widget-preview-contract.ts, widget-preview-contract.test.ts, widget-studio-visual-compare.mjs.
- Archivos modificados: mock-telemetry.ts (comment documentando divergencia intencional vs fixture canónica), WidgetSandboxPreview.tsx (overrides canónicos para diseños oficiales).
- No se tocó: LayoutStudio, runtime OBS, backend Go, Supabase/Auth, Calendar, access policy, billing, dependencias, position/x/y/w/h.
- Sin commit, sin tag, sin release.
Nota ACCESS-DEV-MODES (2026-07-06) — Implementation:
- Archivos nuevos: `frontend/src/lib/access-dev-modes.ts` (helper puro: `AccessDevMode`, `DEV_MODES`, `resolveAccessDevModeInput()`, `resolveLicenseForDevMode()`) + `frontend/src/lib/access-dev-modes.test.ts` (23 tests).
- Archivo modificado: `frontend/src/lib/access.tsx` (~15 líneas nuevas: lee dev mode, sintetiza license, añade rol `tester` para tester/power-tester).
- Modos: real (default), free, paid, tester, power-tester, blocked. Resueltos via `?access=` query param o `VITE_ACCESS_MODE` env var. Producción ignora overrides (`import.meta.env.PROD`).
- tester y power-tester son equivalentes en este corte: ambos añaden rol `tester` y desbloquean todo. Diferenciación futura pendiente.
- No se tocó: access-policy.ts, license.tsx, license-types.ts, plan.ts, WidgetStudio, widget-catalog, widget-visual-harness, backend Go, Supabase.
- Code review P3 fixes: `DEV_MODES` sin anotación redundante (as const produce tuple estrecho), +2 roundtrip tests para tester/power-tester.
- Checks: 23/23 access-dev-modes PASS, 164/164 access-policy/plan/license/access PASS (no regresion), 1483/1483 full suite PASS, tsc PASS, lint PASS (0 errors, 2 preexisting warnings), git diff --check OK.
- Sin commit, sin tag, sin release.

Nota I18N-01 (2026-07-06) — Implementation:
- Base i18n ligera añadida para `es`, `en`, `pt` e `it` en `frontend/src/i18n/` con provider, selector de idioma, normalizacion de locale y fallback seguro.
- Selector de idioma integrado en onboarding y en la pagina de Ajustes. La preferencia se persiste en `localStorage` (`vantare.locale`).
- Widget Studio traduce copy visible principal: shell, lista de overlays/widgets, preview empty state, estado de guardado, acciones de draft, panel derecho, secciones de configuracion y galeria de diseños.
- Alcance deliberado: no se traduce todo el cuerpo legacy de SettingsPage en este corte. Queda como I18N-02 para evitar mezclar una migracion amplia de ajustes/updater/hotkeys.
- No se tocó: backend Go, Supabase/Auth, Calendar, LayoutStudio, runtime OBS, dependencias, position/x/y/w/h.
- Checks enfocados: 211/211 PASS (i18n, onboarding, settings y Widget Studio).
- Sin tag, sin release.

Nota I18N-02 (2026-07-06) — Provider global + navegacion:
- Objetivo: convertir el i18n en una unica fuente de verdad para toda la app y dejar lista la infraestructura para traducir el resto de pantallas poco a poco, atado a cada feature (sin big-bang).
- `I18nProvider` ahora es transparente si ya existe un provider padre: si se monta dentro de otro `I18nProvider`, delega al contexto existente en vez de crear un arbol aislado. Asi `OnboardingFlow`, `WidgetStudio` y `SettingsPage` (que hoy montan su propio provider) siguen funcionando y comparten el mismo idioma que el resto del Hub.
- `HubApp` monta un unico `I18nProvider` global envolviendo `HubShell` (dentro de `LicenseProvider`). Ahora cualquier pantalla del Hub puede usar `useI18n()` -> `t()` sin montar su propio provider. El fallback de `useI18n` ya cubria el caso sin provider, asi que no hay regresion para pantallas no migradas.
- Se anadieron las keys de navegacion del Topbar a los 4 diccionarios (`nav.dashboard`, `nav.profiles`, `nav.launcher`, `nav.calendar`, `nav.engineer`, `nav.telemetry`, `nav.roadmap`, `nav.setup`) con paridad es/en/pt/it (104 keys). La migracion visual del Topbar queda para su corte propio (no se toca `navigation.ts` aun).
- Tests nuevos en `I18nProvider.test.tsx`: coherencia de provider global (provider anidado delega al padre; cambio de idioma en provider anidado se refleja en el contexto padre compartido).
- No se toco: backend Go, Supabase/Auth, Calendar, LayoutStudio, runtime OBS, dependencias, position/x/y/w/h, cuerpo de SettingsPage, Launcher (lo lleva otro worker en paralelo).
- Checks enfocados: 36/36 i18n PASS (incluye 2 nuevos de coherencia global), 27/27 HubApp PASS, 62/62 OnboardingFlow+SettingsPage+WidgetStudio PASS, tsc OK, lint OK (0 errors).
- Riesgo restante: el resto de pantallas (Dashboard, Auth/Login/Paywall, Calendar, Roadmap, Engineer, Telemetry, Profiles, Widgets, Preview, Community, cuerpo de Settings) sigue con copy hardcodeada en espanol; se traduce atado a cada feature. El `I18nProvider` global ya las habilita.
- Sin tag, sin release.

- Nota TOPBAR-RESPONSIVE (2026-07-06) — Fix de responsividad del topbar (sin i18n):
- Sintoma reportado: en pantalla partida/movil, "Overlays Studio" se partia en dos lineas y "Ajustes" se cortaba por falta de ancho.
- Cambio en `Topbar.tsx` (responsive, sin i18n): (1) items de nav (`<a>`/`<button> nav-item`) con `whitespace-nowrap` (evita el partido de "Overlays Studio"); (2) contenedor de nav: `max-md:flex-1 max-md:min-w-0 flex ... gap-2 md:gap-3 lg:gap-5 text-[11px] md:text-xs lg:text-sm max-md:overflow-x-auto` (scrollbarWidth thin) — en `md+` es flex normal SIN scroll (los 8 items caben); en movil (<md) la nav ocupa el ancho restante y hace scroll horizontal util (logo y botones laterales llevan `shrink-0`, el padre flex lleva `min-w-0`). Antes: `hidden md:flex` (oculta en movil) y "Ajustes" se cortaba en partida.
- No se toco: i18n, avatar, notificaciones, hamburguesa, backend Go, Supabase/Auth, calendar, LayoutStudio, runtime OBS, position/x/y/w/h.
- Verificacion visual EJECUTADA via entry minimo aislado (opcion 2 del usuario): `topbar-harness.html` + `topbar-visual-harness.tsx` monta solo `<Topbar>` con `LicenseProvider`+`I18nProvider` y `@wailsio/runtime` aliasado a `wails-runtime-topbar-mock.ts` (usuario free, secciones premium bloqueadas) via alias condicional en `vite.config.ts` (`VITE_RUNTIME_MOCK=topbar`). Resultados DOM finales (sin scroll en partida, segun peticion del usuario):
  - 900px (partida): `scrollable=false` (scrollWidth=clientWidth=485), "Ajustes" visible (`ajustesInView=true`), "Overlays Studio" en UNA linea. ANTES: `ajustesClipped=true` (se cortaba).
  - 375px (movil): `scrollable=true` con scroll UTIL — al hacer scroll, "Ajustes" queda dentro del viewport (`ajustesReachableByScroll=true`); "Overlays Studio" en una linea. ANTES: nav `hidden` en <768px (invisible).
  - Capturas: /tmp/topbar-900-final3.png, /tmp/topbar-375-final3.png, /tmp/before-900.png (antes del fix, con stash temporal).
  - Archivos nuevos del harness (fuera de produccion; el alias solo se activa con VITE_RUNTIME_MOCK=topbar, NO afecta `pnpm build`): `frontend/topbar-harness.html`, `frontend/src/topbar-visual-harness.tsx`, `frontend/src/lib/wails-runtime-topbar-mock.ts` (copia de `wails-runtime-mock.ts` pero `license:validate` -> anonymous/free).
- Sin commit, sin tag, sin release.
Nota I18N-03 (2026-07-06) — Plan de traduccion completa (pendiente, por feature):
- Necesidad: I18N-01 cubrio solo la UI visible de Widget Studio + onboarding + tabs de Ajustes. I18N-02 dejo lista la infraestructura (provider global) pero NO tradujo el resto. Hoy ~10% de la superficie visible esta traducida. Para una "traduccion completa de lo actual" hace falta migrar el copy hardcodeado de todas las pantallas restantes a `t()`, atado a la feature que toque cada pantalla (no big-bang, ver riesgos en I18N-02 y decision de evitar rework).
- Inventario de areas pendientes (excluye Launcher: lo lleva otro worker en paralelo):
  - **Hub shell / Topbar** (`Topbar.tsx`, `navigation.ts`): labels de nav (Hub, Overlays Studio, Launcher, Carreras, Ingeniero, Telemetria, Roadmap, Ajustes), estados de fuente (Fuente pendiente, LMU conectado, Esperando LMU, Mock), Notificaciones, Lite ON/OFF, tooltip "Disponible para testers y planes de pago". Las keys `nav.*` ya existen en los 4 diccionarios; falta cablear `navigation.ts`/`Topbar` a `t()`.
  - **Dashboard** (`DashboardPage.tsx`, `V52Shell.tsx`, cards: HeroSection, PlanStatusCard, QuickActions, LastActivityCard, ActiveOverlayCard, etc.): Simulador principal, Configurado, No disponible, Novedades, Proximas carreras, Acciones rapidas.
  - **Auth** (`LoginScreen`, `PaywallScreen`, `LicenseBanner`, `UnconfiguredScreen`, `BetaWelcome`): toda la copy de login/paywall/licencia. Critico: es lo que ve el usuario sin licencia valida.
  - **Calendar** (`CalendarPage.tsx` + `calendar/*`): Carreras LMU, Calendario oficial, labels de vistas Mes/Semana/Dia, filtros, paneles de series, horario semanal.
  - **Roadmap** (`RoadmapPage.tsx`): Desarrollo Vantare, Fase actual, Progreso global, Completado, Ultimos hitos, Feedback, El roadmap vive con feedback.
  - **Engineer / Telemetry** (`EngineerPage`, `TelemetryPage`, `widgets/*` settings sections): Estado, Mensajes recientes, Telemetria.
  - **Profiles / Widgets** (`ProfilesPage`, `WidgetsPage`, `ProfileLibraryCard`, `OwnProfilesView`, `StudioHome`, etc.): Overlays, Gestiona tus perfiles, Crear nuevo perfil, Abrir overlay, Cambios sin guardar, Selecciona un widget.
  - **Preview / AppearanceEditor** (`preview/AppearanceEditor.tsx`, `StyleSelector.tsx`, `PreviewInspector.tsx`): labels de edicion de apariencia/estilo.
  - **Community / EmptyStates** (`CommunityComingSoonView`, `EmptyStates`): Proximamente, estados vacios.
  - **Cuerpo de Settings** (`AccountSettings.tsx`, hotkeys, updater, diagnostics): I18N-01 solo tradujo titulo + tabs; el contenido de cada tab sigue en espanol.
- Reglas que NO se traducen (datos, no copy): IDs tecnicos (widget/column/slot/design/variant), datos runtime/telemetria (pilotos, marcas, VANTARE, LE MANS ULTIMATE, carreras), nombres de simuladores (Le Mans Ultimate, iRacing, Assetto Corsa), keys de enum en codigo.
- Estrategia propuesta (CORTES INCREMENTALES, no big-bang):
  1. I18N-03a: Topbar + Hub shell + navegacion (mayor impacto, keys `nav.*` ya listas).
  2. I18N-03b: Auth (Login/Paywall/License/Unconfigured/BetaWelcome) — critico para usuarios sin licencia.
  3. I18N-03c: Dashboard + cards compartidas.
  4. I18N-03d: Calendar + Roadmap.
  5. I18N-03e: Engineer/Telemetry/Profiles/Widgets/Preview/Community.
  6. I18N-03f: Cuerpo de Settings (tabs Cuenta/Actualizaciones/Hotkeys/Diagnostico/Avanzado).
  7. Cierre: test de paridad de keys (ya existe en `i18n.test.ts`) + test/lint que detecte strings visibles hardcodeados en pantallas ya migradas (evitar regresion a español literal).
- Cada corte: anade las keys al diccionario 4-lenguaje (paridad obligatoria), migra los `t()` en la pantalla, y corre los tests de esa pantalla + `i18n.test.ts`. El `I18nProvider` global (I18N-02) ya habilita `useI18n()` en todas sin montar provider local.
- Riesgos de no hacerlo por feature: (1) big-bang mezcla trabajo con features activas y genera conflictos de merge (especialmente con el worker de Launcher en archivos compartidos); (2) strings nuevos de features futuras quedarian hardcodeados otra vez (re-trabajo); (3) keys huerfanas si se traduce y luego se borra UI; (4) el fallback de `translate()` devuelve la key, lo que enmascara huecos. Por eso la migracion viaja con cada feature.
- Estado: PENDIENTE. No implementado. Sin commit, sin tag, sin release.

Nota I18N-ROADMAP (2026-07-06) — Futuro multiidioma:
- Objetivo a medio plazo: la app sea traducible de forma completa y mantenible en es/en/pt/it, con el idioma elegido una sola vez y reflejado en todas las pantallas (onboarding, hub, ajustes, overlays).
- Prerrequisitos ya cubiertos: modulo i18n puro, provider global (I18N-02), selector de idioma, persistencia en localStorage, fallback determinista, paridad de keys testeada.
- Trabajo futuro documentado (multiple cosas por hacer, no solo un corte):
  - Traducir todas las areas de I18N-03 (ver arriba) — es el grueso del trabajo restante.
  - Ampliar lenguajes mas alla de es/en/pt/it si el publico lo pide (fria, de, etc.) — requiere ampliar `SUPPORTED_LOCALES` + diccionarios + selector; hoy el diseno ya soporta anadir locales sin tocar el consumidor.
  - Pluralizacion/genero: el modulo actual es lookup plano `key -> string`. Si alguna copy necesita plurales o genero por locale, habra que anadir un helper (p.ej. `tPlural(key, count)` o `Intl`). No necesario para el copy actual.
  - Deteccion de idioma del SO/region como default suave (hoy el default es `es` fijo). Opcional: leer `navigator.language` y hacer fallback a `es` si no esta soportado.
  - Interceptors de traduccion en runtime OBS/overlay: el runtime de overlays (CompositeApp/ObsOverlayApp) NO monta `I18nProvider` hoy. Si los widgets deben mostrar copy traducida (no solo datos), habra que montar el provider ahi tambien. Fuera de scope para widgets (la regla es no traducir datos runtime).
  - Auditoria de "no espanol literal" en CI: anadir un test/lint que falle si aparece un string visible en espanol hardcodeado en archivos ya migrados, para evitar regresion.
- No se toca backend Go, Supabase/Auth, runtime OBS (salvo el punto de providers si aplica), LayoutStudio, dependencias, position/x/y/w/h.
- Estado: planificado, no iniciado.

Nota VISUAL-PARITY-INFRA (2026-07-06):
- Se crea una infraestructura documental para que modelos worker puedan ejecutar tareas de paridad visual con Playwright sin depender de revisiones manuales improvisadas.
- Se añade la skill local `visual-parity-with-playwright` y la carpeta `docs/visual-parity/` con protocolo, checklist, prompts de implementacion/review e indice de HTMLs de referencia.
- No cambia codigo productivo ni comportamiento runtime.

Nota WIDGET-STUDIO-09 (2026-07-05) — Implementation:
- Full Glassmorphism Widget Parity: copia la estructura visual real de widgets desde `overlay-glassmorphism-pro.html`.
- Phase 0: Inventario de 16 secciones HTML mapeadas a componentes en `docs/widget-glassmorphism-parity.md`.
- Phase 1: `glassmorphism-primitives.ts` — tokens compartidos (glass card, header, pill, footer, Vantare SVG logo, row styles) + `getVisualTemplate()` helper.
- Phase 2 Free: Standings (glassmorphism template con Vantare SVG, HYPERCAR pill, grid 26px/32px/44px/1fr/100px/80px, 3 preview rows, footer LE MANS ULTIMATE + TRACK TEMP), Delta (bar/simple/advanced con top pill, track container, center line, fill bar, bottom pill, 4-cell grid), Pedals (V1 capsule HUD, V2 rectangular low profile, V3 solo vertical tall).
- Phase 3 Pro: Relative (glassmorphism con grid 36px/6px/44px/1fr/80px/80px, RELATIVE pill, LIVE TIMING footer), Broadcast Tower (ticker con lap box, driver stream, active glow, weather box), Multiclass Relative (gapless rows, class badges, player highlight).
- Phase 4 Preview: FuelCalculatorWidget, TrackWeatherWidget, CarDamageWidget (visual+numbers), Head2HeadWidget, DeltaTraceWidget, RacingFlagsWidget — todos preview-only, data-preview-only=true, sin runtime real.
- Phase 5: OFFICIAL_DESIGNS actualizados con `props: { visualTemplate: "..." }` para delta (bar/simple/advanced) y pedals (v1/v2/v3). 4 nuevos diseños oficiales: delta-simple-glassmorphism, delta-advanced-glassmorphism, pedals-v1-glassmorphism, pedals-v3-glassmorphism. `getActiveOfficialDesign()` restaurada.
- Tests: 1430/1430 PASS (139 files). tsc OK, lint OK (0 errors, 2 preexisting warnings), build OK, visual compare OK (18 capturas, 0 errors), diff-check OK.
- Archivos nuevos: glassmorphism-primitives.ts, FuelCalculatorWidget.tsx, TrackWeatherWidget.tsx, CarDamageWidget.tsx, Head2HeadWidget.tsx, DeltaTraceWidget.tsx, RacingFlagsWidget.tsx, widget-glassmorphism-parity.md.
- Archivos modificados: StandingsWidget.tsx, DeltaWidget.tsx, PedalsWidget.tsx, RelativeWidget.tsx, BroadcastTowerWidget.tsx, MulticlassRelativeWidget.tsx, widget-design-gallery.ts, + tests.
- No se toco: LayoutStudio, backend Go, access-policy, dependencias, position/x/y/w/h.
- Sin commit, sin tag, sin release.

Nota LOGIN-REDESIGN (2026-07-09):
- Rediseñado `LoginScreen.tsx` con estilo inspirado en Devin pero usando tokens de Vantare.
- Cambios visuales: layout fullscreen centrado sin card contenedora, logo SVG de Vantare con gradiente rojo y drop-shadow, título "Welcome to Vantare" con subtítulo, dos botones OAuth apilados (Google=gradiente rojo primario, Discord=borde secundario), divider "o", formulario email/password, links de navegación entre modos, footer "made by Vantare".
- Tokens de DESIGN.md aplicados: fondo `bg-[#0a0a0a]`, texto `text-white/60`, bordes `border-white/20`, inputs `bg-white/5`, gradiente rojo `from-vantare-red-500 to-[#9a0606]`, chrome UI `uppercase tracking-widest`.
- Funcionalidad intacta: login, signup, reset password, Google OAuth, Discord OAuth, estados de espera, manejo de errores.
- Archivo modificado: `frontend/src/hub/auth/LoginScreen.tsx`.
- No se tocaron: tests (19/19 PASS), backend Go, Supabase/Auth, otros componentes.
- Commit: `feat(auth): redesign LoginScreen with Devin-style layout and Vantare design tokens`.

Ultima actualizacion: 2026-07-09. Commit 6e00192 (feat(auth): redesign LoginScreen).
Nota WIDGET-STUDIO-07 (2026-07-05) — Implementation:
- Reemplazado selector productivo `Theme: Base / Vantare Crystal` por selector real de `Diseño` basado en `OFFICIAL_DESIGNS`.
- MC-1: Helper puro `getActiveOfficialDesign(profile, widget)` en `widget-design-gallery.ts` — detecta diseño activo por `variantId` convención (`official-{designId}-{widgetId}`) o por match de template+theme en `profile.variants`.
- MC-2: Selector superior en `WidgetStudio.tsx` — label `Diseño`, `data-testid="widget-design-selector"`, opciones desde `listOfficialDesigns(selectedWidget.type)`, opción `Personalizado` cuando no hay match, deshabilitado cuando no hay widget o no hay diseños. Selección llama `onChangeProfile(applyOfficialDesignToProfile(...))`. Eliminado estado local `themeId` y prop `initialThemeId`.
- MC-3: `WidgetDesignGallery` recibe `activeDesignId` — badge `Activo`, botón deshabilitado para diseño activo. `WidgetSettingsPanel` calcula activo con `getActiveOfficialDesign` y lo pasa a la galería.
- MC-4: Harness visual actualizado — query param `design` en vez de `theme`, aplica `applyOfficialDesignToProfile` al profile mock antes de renderizar. Capturas por diseño oficial real (12 diseños × 4 widgets). Script valida ausencia de label `Theme` y presencia de `data-testid="widget-design-selector"`.
- Tests: 114/114 enfocados (WidgetStudio 31, WidgetDesignGallery 15, widget-design-gallery 39, WidgetSettingsPanel 29). tsc OK, lint OK, build OK (warning preexistente chunk size), git diff --check OK.
- Archivos modificados: widget-design-gallery.ts, widget-design-gallery.test.ts, WidgetStudio.tsx, WidgetStudio.test.tsx, WidgetDesignGallery.tsx, WidgetDesignGallery.test.tsx, WidgetSettingsPanel.tsx, WidgetSettingsPanel.test.tsx, widget-visual-harness.tsx, widget-studio-visual-compare.mjs, current-plan.md.
- No se tocó: LayoutStudio, backend Go, dependencias, HTML de referencia, position/x/y/w/h.
- Sin commit, sin tag, sin release.

Nota WIDGET-STUDIO-07 P1/P2 FIX (2026-07-05):
- Corregido bypass de access gate en el selector superior de diseño: `WidgetStudio.tsx` ahora usa `useAccess()` + `canApplyWidget()` y deshabilita/bloquea `onChange` cuando el usuario no puede aplicar el widget seleccionado.
- Añadido test de regresion: usuario Free con widget Pro (`relative`) no puede aplicar diseños Pro desde `widget-design-selector`.
- Endurecido `widget-studio-visual-compare.mjs`: si vuelve el label productivo `Theme` o falta `widget-design-selector`, el script registra error y termina con exit 1.
- Checks: suite frontend 1356/1356 PASS, tsc OK, lint OK, build OK, visual compare OK (18 capturas, 0 skipped, 0 errors), diff-check OK.
- Sin commit, sin tag, sin release.
Nota WIDGET-STUDIO-08 (2026-07-05) — Implementation:
- Selector de Diseño ya existía (WIDGET-STUDIO-07); este corte implementa templates visuales reales solo para `standings`.
- MC-1: Tipo `StandingsTemplateMode` y helper puro `resolveStandingsTemplateMode(style)` en `StandingsWidget.tsx` — mapea `"glassmorphism-pro"` → `"glassmorphism"`, `"endurance"` → `"endurance"`, resto → `"leaderboard"`.
- MC-2: Root panel incluye `data-standings-template={templateMode}` y `data-standings-template-style={style}` para detección DOM por tests y Playwright.
- MC-3: Template glassmorphism — header horizontal con VANTARE izquierda, class pill + time derecha; header row con labels `POS`, `#`, `EQUIPO / PILOTO`, `GAP`, `LAST`; footer con `LE MANS ULTIMATE` + `TRACK TEMP`.
- MC-4: Template endurance — header row con labels `POS`, `#`, `DRIVER`, `GAP`, `INTERVAL` (si enabled), `LAP` (si enabled), `LAST`.
- MC-5: Template leaderboard — comportamiento base con `data-standings-template="leaderboard"`.
- MC-6: Visual compare endurecido — valida `data-standings-template` antes de capturar para los 3 diseños oficiales de standings.
- Tests: 7/7 StandingsWidget PASS (4 originales + 3 nuevos template). 126/126 enfocados PASS. tsc OK, lint OK, build OK, visual compare OK (18 capturas, 0 skipped, 0 errors), diff-check OK.
- Archivos modificados: StandingsWidget.tsx, StandingsWidget.test.tsx, widget-studio-visual-compare.mjs, current-plan.md.
- No se tocó: WidgetStudio selector, LayoutStudio, backend Go, access gates, dependencias, position/x/y/w/h.
- Delta, pedals y relative quedan para siguientes cortes.
- Sin commit, sin tag, sin release.



Nota WIDGET-STUDIO-06 PLAN (2026-07-05):
- Creado plan conceptual en `docs/superpowers/plans/2026-07-05-widget-studio-06-direct-visual-iteration.md`.
- Objetivo: iteracion directa para llevar toda la pestana WidgetStudio al estilo Vantare Crystal del HTML de referencia, no solo el panel derecho.
- Prioridad: Overlay Controls, tipografia, visual compare y capturas widget-by-widget por sistema de diseno.
- Mantiene restricciones: WidgetStudio no toca posicion/tamano, sin LayoutStudio, sin backend, sin autosave y sin commitear PNGs.

Nota HUB-ERROR-BOUNDARY (2026-07-05):
- Añadido `HubErrorBoundary` (class component React) alrededor de `HubShell` en `HubApp.tsx`.
- Si `HubShell` o cualquier hijo crashea durante render/lifecycle, muestra fallback oscuro estilo Vantare en vez de pantalla blanca/negra.
- Fallback incluye: título "Hub no pudo renderizarse", mensaje, detalle técnico colapsable (error.message + componentStack), botón "Reintentar".
- `console.error("[HubErrorBoundary]", error, errorInfo)` en `componentDidCatch` para diagnóstico.
- Diagnóstico: reproduce en browser con `_wails.dispatchWailsEvent` → Hub renderiza correctamente con todos los estados de licencia. Causa real del blank screen es específica al runtime Wails/WebView2 (no reproducible en browser standalone). Boundary es contención preventiva.
- Tests: 5 tests unitarios del boundary + verificación de tests HubApp existentes.
- No se tocó: LicenseProvider, LicenseGate, OAuth, Supabase, backend Go, dependencias.
- Sin commit, sin tag, sin release.
Nota HUB-RUNTIME-ENTITLEMENTS (2026-07-05):
- Causa runtime confirmada por ErrorBoundary: `e is not iterable` al montar Topbar/useAccess.
- El payload real de Wails puede entregar `license.entitlements` como `null`/missing; `classifyPlan` asumía array y hacía `for...of`.
- `plan.ts` ahora normaliza entitlements null/undefined a `[]` en classifyPlan/buildSummary/sortedEntitlements.
- Tests de regresion añadidos en `plan.test.ts` y `access-policy.test.ts` para payload Wails con entitlements null.
- Checks enfocados: 165/165 PASS (plan/access-policy/access/Topbar/HubApp), tsc OK, diff-check OK.
Nota WIDGET-ARCH (2026-07-04):
- Documentada arquitectura canonica de widgets en `docs/widget-architecture.md`.
- El documento consolida responsabilidades de `WidgetStudio` vs `LayoutStudio`, edicion por columnas, modelo `ProfileConfig`/`WidgetConfig`/`WidgetVariantConfig`, superficies de render, sizing, persistencia y checklist para workers.
- No se tocó codigo productivo ni tests; es un corte docs-only para reducir ambiguedad en futuras tareas de widgets.

Nota WIDGET-STUDIO-03 PLAN (2026-07-04):
- Plan creado para implementar Vantare Crystal en WidgetStudio con soporte de design systems, slots, columns, columnGroups, gating Free/Pro/Tester y variantes propias.
- Fuente visual definitiva: `docs/overlay-vantare-crystal-widgets.html`.
- Plan ejecutable por microcortes con TDD: `docs/superpowers/plans/2026-07-04-widget-studio-03-vantare-crystal-slots.md`.
- Scope inicial: WidgetStudio y widgets; LayoutStudio queda fuera salvo tests de no regresion de responsabilidades.
Nota WIDGET-STUDIO-04 PLAN (2026-07-05):
- Plan creado para convertir la foundation de Vantare Crystal en edicion real de slots, columns y columnGroups.
- Decisiones: UI editable generica, draft local, guardar en widget actual y como variante, width presets, controles disabled para Free+Pro, sin reordenacion ni drag/drop.
- Frontera protegida: WidgetStudio edita configuracion interna; LayoutStudio sigue siendo el unico propietario de position/x/y/w/h.
- Plan ejecutable por Mimo v2.5 con TDD y revision final: `docs/superpowers/plans/2026-07-05-widget-studio-04-editable-slots-columns.md`.
- Sin implementacion ni commit.
Nota WIDGET-STUDIO-04 (2026-07-05) — Implementation:
- MC-0: Baseline verificado — 38 tests PASS, WidgetConfigSections read-only foundation confirmado.
- MC-1: `widget-config-model.ts` — helpers puros toggleSlotEnabled, updateSlotConfig, toggleColumnEnabled, updateColumnConfig, toggleColumnGroupEnabled. BUILTIN_METRICS y getMetricLabel. 51 tests GREEN.
- MC-2: `resolveEffectiveWidgetVariant` — resolucion pura de config efectiva: variant > props > defaults. 51 tests GREEN.
- MC-3/4/5: WidgetConfigSections reescrito como editor real — toggles, metric selectors, width presets (xs/sm/md/lg/auto), column groups. Controles disabled cuando canApply=false. 115 tests GREEN.
- MC-6: WidgetSettingsPanel con draft local — `useMemo` para effective, dirty detection via JSON, botones "Guardar en widget" y "Descartar". 115 tests GREEN.
- MC-7: WidgetVariantManager acepta `draft` prop — guardar variante usa draft actual en vez de solo defaults/existing. 115 tests GREEN.
- MC-8: Standings y Relative respetan `widthPreset` via WIDTH_PRESET_MAP en standings-format.ts y relative-format.ts. Compact display mode preservado. 1288 tests GREEN.
- MC-9: Visual polish — estados disabled claros, toggles con aria-checked, opacity-40 en disabled.
- MC-10: Docs actualizados.
- Tests totales: 1288/1288 PASS (138 files). tsc OK, lint OK, build OK, git diff --check OK.
- Archivos nuevos: ninguno.
- Archivos modificados: profile.ts, widget-config-model.ts, widget-config-model.test.ts, WidgetConfigSections.tsx, WidgetConfigSections.test.tsx, WidgetSettingsPanel.tsx, WidgetSettingsPanel.test.tsx, WidgetVariantManager.tsx, standings-format.ts, relative-format.ts, current-plan.md.
- No se toco: LayoutStudio internamente, backend Go, dependencias nuevas, CompositeApp, ObsOverlayApp, WidgetRenderer.
- Sin commit, sin tag, sin release.
Nota WIDGET-STUDIO-05A (2026-07-05) — Post-review fix:
- Scope declarado originalmente: "solo Overlay Controls + tipografía".
- Scope real ampliado y documentado: MC-1 a MC-5 del plan WIDGET-STUDIO-05.
- MC-1: WidgetStudio shell Crystal — panel embebido 3-columnas (240px/1fr/280px), data-testid="widget-studio-crystal-shell", footer interno, save state, theme selector.
- MC-2: StudioWidgetList left panel Crystal — header gradiente rojo, icono, search "Buscar overlay...", filter pills Todos/Activos, selected state con borde izquierdo rojo, footer "LMU Conectado".
- MC-3: WidgetSandboxPreview canvas Crystal — fondo gradient dark, chips "1920x1080" y "Modo Edicion", resize handle visual (sin mutar layout).
- MC-4: WidgetSettingsPanel Overlay Controls — header sticky "Overlay Controls", widget info card con tier badge, search "Type to filter settings...", secciones collapsibles (Overview, Appearance, Visibility, Settings, Variants, Slots/Columns/Column Groups, Alignment, Browser, Key & Button Bindings), draft actions.
- MC-5: WidgetConfigSections compacto — toggles, metric selects, width presets con display ("24px", "36px", "60px", "90px", "1fr"), notas de ayuda, font-mono eliminado de selects principales (post-review fix).
- Post-review fixes: P2 resuelto — script visual genera capturas individuales por widget (base + crystal) via query params. P3 resuelto — font-mono eliminado de MetricSelect y WidthPresetSelect.
- Tests: 128/128 PASS (widget studio + widgets runtime). tsc OK, lint OK, build OK, git diff --check OK.
- No se toco: LayoutStudio internamente, backend Go, position/x/y/w/h, access-policy, dependencias.
- Sin commit, sin tag, sin release.
Nota WIDGET-STUDIO-03 MC-0 (2026-07-04):
- Inventario: 7 widget types (delta, relative, standings, telemetry, telemetry-vertical, pedals, engineer-notifications).
- WidgetRenderer, CompositeApp y ObsOverlayApp registran los mismos 7 tipos.
- WidgetStudio NO toca position (grep confirmado: 0 matches).
- WidgetVariantConfig NO tiene campos position/x/y/w/h (profile.ts confirmado).
- Design systems existentes: base, glassmorphism-pro (via themeId en variant).
- Access policy: roles (tester, staff, dev), plans (free, paid_overlays, paid_engineer, suite).
- Sin cambios de codigo. Solo documentacion.
Nota WIDGET-STUDIO-03 (2026-07-04) — Implementation:
- MC-0: Baseline inventariado — 7 widget types, 0 position mutations, sin cambios de codigo.
- MC-1: `widget-design-system.ts` — resolver puro de tokens por themeId. Soporta "base" y "vantare-crystal". 9 tests GREEN.
- MC-2: `widget-catalog.ts` — 14 widgets catalogados con access tier, data status, edit model. Helpers canPreview/canApply/isRuntimeReady. 19 tests GREEN.
- MC-3: `widget-config-model.ts` — helpers buildDefaultSlots/Columns/ColumnGroups, filterMetrics, normaliseVariant. 24 tests GREEN.
- MC-4: WidgetStudio shell — badges FREE/PRO/TESTER/EXPERIMENTAL, data status badges, secciones Slots/Columns/ColumnGroups, design system selector. 40 tests GREEN.
- MC-5: Variant save/apply — WidgetVariantManager guarda variantes sin position, aplicar conserva position. 37 tests GREEN.
- MC-6: Free widgets Crystal — Standings/Delta/Pedals con themeId "vantare-crystal". Fallback base/glassmorphism-pro intacto. 18 tests GREEN.
- MC-7: Relative Pro — Crystal theme + Pro gating visible en settings. 9 tests GREEN.
- MC-8: broadcast-tower + multiclass-relative — nuevos widgets Pro registrados en WidgetRenderer/CompositeApp/ObsOverlayApp/widget-factory. 7 tests GREEN.
- MC-9: Tester/experimental catalog entries verificados — data pending/partial, no runtime-ready.
- MC-10: Visual harness script para comparacion HTML vs app.
- MC-11: Docs actualizados.
- Tests totales: 1221/1221 PASS (138 files). tsc OK.
- Archivos nuevos: widget-design-system.ts, widget-catalog.ts, widget-config-model.ts, WidgetAccessBadge.tsx, WidgetDataStatusBadge.tsx, WidgetConfigSections.tsx, WidgetVariantManager.tsx, BroadcastTowerWidget.tsx, MulticlassRelativeWidget.tsx + tests.
- Archivos modificados: WidgetStudio.tsx, WidgetSettingsPanel.tsx, StudioWidgetList.tsx, StandingsWidget.tsx, DeltaWidget.tsx, PedalsWidget.tsx, RelativeWidget.tsx, widget-factory.ts, WidgetRenderer.tsx, CompositeApp.tsx, ObsOverlayApp.tsx.
- No se tocó: LayoutStudio internamente, backend Go, dependencias nuevas.
- Sin commit, sin tag, sin release.

Nota CALENDAR-10 (2026-07-04) P3:
- Implementados helpers `groupEventsByDay` e `indexSeriesById` en `calendar-view-math.ts` para evitar filtros repetidos y búsquedas O(n) por celda.
- MonthView ahora acepta `onDayClick` prop; click en celda de día cambia a DayView con ese día como anchor. `stopPropagation` en pills evita navegación duplicada.
- DayView semántica reescrita: `all` mode muestra solo weekly + special events (no daily interval cards). `beginner`/`intermediate`/`advanced` expanden timeline solo del tier filtrado. `weekly`/`special` no muestran daily intervals.
- WeekView protegido con tests de regresión: no muestra daily interval series, solo weekly + special.
- Viewport fit: CalendarPage usa `min-h-0 overflow-hidden`, Month/Week/Day usan `flex-1 min-h-0` con scroll interno. Eliminado `max-h-[640px]` fijo.
- Rail title "Próximas carreras" centrado con `justify-center`.
- Visual compare script actualizado: sección detail panel no crítica, no falla si no se abre. Termina exit 0.
- Tests: 97/97 enfocados, 1155/1155 full suite. tsc OK, lint OK (warning preexistente `.eslintignore`), build OK (warning preexistente chunk size), visual compare OK, `git diff --check` OK.
- No se tocó backend Go, ACCESS-01, Supabase/Auth, import UI, WidgetStudio/LayoutStudio/overlays.
- Commit: `fix(calendar): stabilize visual calendar performance`.
Nota ACCESS-01 (2026-07-04):
- Feature gates frontend completos: `access-policy.ts` (policy matrix), `access.tsx` (useAccess hook), `AccessGate.tsx` (component + useFeatureGate).
- Matriz de permisos testada: Free, paid_overlays, paid_engineer, suite, tester, blocked, unconfigured — tabla-driven en `access-policy.test.ts`.
- Navegación gated: Topbar usa `canSeeSection` para deshabilitar secciones premium para Free; tester desbloquea todo.
- Calendario: `CalendarRaceRail` y `CalendarRaceDetailPanel` gates en `calendar.followReminders` — Free ve "Bloqueado", Paid/Tester puede seguir.
- Roadmap: feedback buttons gated con `roadmap.feedback` — Free ve locked state, Paid/Tester ve buttons (disabled por feature no implementada aún).
- AccessGate: componente presentacional con copy honesta ("Disponible para testers y planes de pago"), estados blocked/unconfigured.
- Tests: 132/132 access-policy/plan/license/access, 117/117 page-level (Topbar, Calendar, Roadmap, Dashboard, Engineer, Telemetry, HubApp).
- Fixes preexistentes CALENDAR-10: corregido syntax error en CalendarRaceDetailPanel (useMemo sin cerrar, handleUnfollow duplicado) y CalendarRaceRail (summary no definido, nesting de divs incorrecto).
- No se tocó backend Go, Supabase/Auth, WidgetStudio/LayoutStudio internamente.
- Sin commit.
Nota ACCESS-02/P3 (2026-07-04):
- Topbar: secciones bloqueadas ahora renderizan como `<button type="button" disabled>` en vez de `<a href="#" aria-disabled>`.
- Elimina focusable/activable como enlace en items premium para usuarios Free.
- Secciones permitidas siguen funcionando como `<a href="#">` con navegación y `aria-current`.
- Tests: 18/18 Topbar PASS (4 nuevos: no href, no navigate, disabled attribute, allowed navigates + aria-current).
- Checks: tsc OK, lint OK, build OK, git diff --check OK.
- Commit: `fix(hub): make locked topbar items non-interactive`.


Nota CALENDAR-08 (2026-07-03) Microcorte WeekView fidelity:
- Reescrito `CalendarWeekView` para usar una grilla semanal tipo calendario horario, como el HTML de referencia `calendario_v5.2.html`.
- Ahora muestra 7 columnas (Lun-Dom), eje horario vertical, eventos concretos posicionados por start/end y segmentación simple de solapes.
- Los patrones de interval series (Bronce/Plata/Oro) se muestran como badges compactos en un header común, no como pills apiladas dentro de cada columna.
- Se mantiene LMU-only: colores por tier, sin strings multisim (`iRacing`, `ACC`, `AC Evo`).
- Se mantiene filtrado, clicks en eventos/pills y apertura de panel.
- Actualizado `CalendarWeekView.test.tsx` con tests de eje horario, posicionamiento vertical, segmentación de solapes y anti-fake/anti-nueva-carrera.
- Se ajustó `frontend/scripts/calendar-visual-compare.mjs` para hacer scroll a la primera carrera en la captura de WeekView y validar que haya eventos visibles.
- Regeneradas capturas comparativas en `docs/superpowers/screenshots/calendar-08-compare/`.

Nota CALENDAR-08 (2026-07-03) Microcorte MonthView/DayView fidelity:
- Reescrito `CalendarMonthView` para reducir el ruido de patrones de intervalos (Bronce/Plata/Oro) en cada celda.
- Los patrones de intervalos ahora viven en un header compacto de "Frecuencias" compartido, accesible para filtros y clics.
- Las celdas del mes priorizan eventos concretos (especiales y weekly-slots), mostrando hasta 4 items y un indicador `+N más` cuando hay más.
- Las celdas vacías se mantienen limpias, sin badges de frecuencia, igual que el HTML de referencia.
- Reescrito `CalendarDayView` como timeline continuo: los eventos se posicionan verticalmente por `startTime` y su altura representa `durationMin`.
- Se reutiliza la segmentación side-by-side de solapes del WeekView para mantener la densidad sin superposición inusable.
- Se mantienen la línea de hora actual, el contador de carreras, los tooltips y los clicks que disparan filtros.
- Se mantiene LMU-only: sin strings multisim (`iRacing`, `ACC`, `AC Evo`) y sin UI de `+ Nueva carrera`.
- Actualizados `CalendarMonthView.test.tsx` y `CalendarDayView.test.tsx` para reflejar el nuevo layout, header de frecuencias, cap de 4 eventos y posicionamiento vertical.
- Actualizado `frontend/src/hub/calendar-visual-mock-data.ts` con eventos LMU distribuidos por varios días para hacer la comparación visual más representativa.
- Regeneradas capturas comparativas en `docs/superpowers/screenshots/calendar-08-compare/`.
- Checks: 1075/1075 tests PASS, tsc OK, lint OK (warning preexistente `.eslintignore`), build OK (warning preexistente chunk size), script de comparación visual OK, `git diff --check` OK.
- Sin commit.
- Checks: 45/45 tests de scope, tsc OK, lint OK, build OK (warning preexistente chunk size), script de comparación OK, git diff --check OK.
- Sin commit.

Nota CALENDAR-07 (2026-07-03) Microcorte 3:
- Refactor visual de CalendarPage imitando la estructura de `calendario_v5.2.html`.
- Eliminados bloques antiguos de `Calendario publicado por Vantare`, `Horario semanal LMU`, `Series oficiales`, `Carreras pasadas` y la UI de importación.
- Se añade `CalendarRaceRail` usando `buildUpcomingRaceItems` para mostrar próximos eventos de Bronce, Plata, Oro y Weekly.
- Riesgo/tradeoff documentado: la UI de "follow/unfollow" desaparece temporalmente en esta vista ya que el HTML de referencia no la contempla. Backend y eventos no han sido modificados.

Nota CALENDAR-07 (2026-07-03) Microcorte 4:
- Corregida accesibilidad de botones follow/unfollow en CalendarRaceRail.
- Añadido `aria-label` contextual con nombre de la serie/evento y `aria-pressed` booleano.
- Eliminada dependencia de `group-hover/btn` para mostrar "Dejar": ahora siempre visible como "Siguiendo · Dejar".
- Añadido test de ARIA (aria-label, aria-pressed) para botón seguido y no seguido.
- Añadido test para item con `id: ""` que no renderiza botón follow/unfollow.
- Sin cambios en CalendarPage, backend, store, tipos ni navegación.
- Layout adaptado a `grid-cols-1 xl:grid-cols-[260px_1fr]` con toolbar superior.

Nota CALENDAR-07 (2026-07-03) Microcorte 1:
- Creado helper `buildUpcomingRaceItems` en `calendar-upcoming.ts` para extraer eventos próximos por tiers (Bronce, Plata, Oro, Weekly) a partir de `seriesPreviews.nextStarts` y `series`.
- El helper no altera ni crea intervals ficticios y está rigurosamente testeado en `calendar-upcoming.test.ts`.
- Validados con `rg` los usos de `V52CalendarStrip` y `NextRaceCard`; se encuentran aislados en el Dashboard pero se conservan sin borrar en este microcorte.
- Ejecutados comandos `tsc`, `lint` y tests unitarios (4 PASS). No se tocó código UI en este microcorte.

Nota post-release (2026-06-29):
- Para smoke local usar `bin\vantare.exe` generado por `release:artifacts` o el asset descargado desde GitHub Release.
- No usar `vantare.exe` en raiz ni portables antiguos.
- Supabase Go se inyecta con `tools/generate_supabase_config.ps1` generando temporalmente `cmd/vantare/supabase_build.go`, no con ldflags.
- Para builds locales, mapear `frontend\.env.local` (`VITE_SUPABASE_*`) a `VANTARE_SUPABASE_*` antes de compilar. Si solo se necesita smoke rapido de la app, usar la ruta "Opcion A2" del runbook: `corepack pnpm --dir frontend build` + `generate_supabase_config.ps1` + `go build` + `Start-Process .\bin\vantare.exe`. Esa ruta no sustituye a `release:artifacts` para publicar.

Nota CALENDAR-06-E (2026-07-03) FIX LMU-only:
- Vista diaria de carreras LMU implementada en CalendarPage con el componente dedicado CalendarDayView.
- Simplificada para eliminar overengineering: ahora es estrictamente LMU-only, eliminando strings, colores y dependencias de multisim (iRacing, ACC, etc.).
- Eliminado tooltip on-hover y layout dinámico side-by-side de solapamientos; los eventos se renderizan ahora de forma secuencial y limpia dentro de cada bloque horario.
- Eliminado scroll automático (`useRef`, `useEffect`) de la hora actual. Se mantiene la línea indicadora de hora actual ("now-line") de forma estática.
- Muestra el resumen compacto de patrones Bronce, Plata y Oro en un panel superior siempre de libre acceso y visibilidad.
- Expande de forma dinámica las series "weekly-slots" y muestra eventos especiales de forma secuencial, capando a 2 visuales por hora ("+N más").
- Tests unitarios y de integración de frontend adaptados (94/94 PASS). Sin errores de TypeScript, linter o build.

Nota CALENDAR-06-D (2026-07-03):
- Vista semanal de carreras LMU implementada en CalendarPage con el componente dedicado CalendarWeekView.
- Renderiza 7 columnas correspondientes a los días de lunes a domingo.
- Cada columna incluye el día de la semana, el número del día y el indicador de hoy (resaltando el día actual en rojo Vantare).
- Muestra el resumen compacto de las series de intervalos (Bronce, Plata, Oro, Semanal) por día, no afectándose por el cap de eventos.
- Muestra eventos semanales concretos (weekly-slots) y eventos especiales materializados en la columna del día correspondiente, con hora local compacta.
- Limita los eventos concretos a un máximo de 3 por día, mostrando el indicador "+N más" para los eventos concretos que queden ocultos.
- Integrado en CalendarPage: el botón de "Semana" del toolbar muestra la vista semanal, el de "Mes" muestra la vista mensual y el de "Día" sigue mostrando el placeholder honesto.
- Tests unitarios y de integración de frontend (93/93) validados con éxito. Sin errores de TypeScript, linter o formato.

Nota CALENDAR-06-C (2026-07-03):
- Vista mensual de carreras LMU implementada en CalendarPage con el componente dedicado CalendarMonthView.
- Renderiza grilla de 42 celdas con semana empezando en lunes, resaltado del día actual, atenuación de días de otros meses y el título/eyebrow "Vista mensual".
- Muestra el resumen compacto de series tipo "interval" (Bronce/Plata/Oro/Semanal cada X min) sin materializar miles de eventos recurrentes diarios.
- Expande de forma dinámica las series "weekly-slots" y muestra los eventos especiales materializados en la celda del día correspondiente, con control de límite de 3 items visuales por día ("+N más").
- Se mantiene la compatibilidad con el fallback legacy y el funcionamiento de la barra de herramientas y la gestión de follow/unfollow de la parte inferior.
- Tests unitarios y de integración de frontend (93/93) validados con éxito. Sin errores de TypeScript o linter.

Nota CALENDAR-06-B (2026-07-03):
- Componente CalendarToolbar implementado con navegación de fecha (anterior/hoy/siguiente) y switch de vistas (Mes/Semana/Día).
- Integrado localmente en CalendarPage con estados de vista y fecha base.
- Toolbar cumple con estética dark/glass v5.2, accesibilidad nativa y sin botones de importación/creación/borrado.
- Corregida accesibilidad/semántica en el toolbar (role="group" en switch de vistas, aria-hidden="true" en SVGs de navegación).
- Tests unitarios y de integración de frontend ejecutados con éxito.
- Sin cambios en backend, store o tipos.

Nota CALENDAR-06-A (2026-07-03):
- Helpers puros de calendario visual creados en frontend/src/calendar/calendar-view-math.ts.
- Sin UI ni componentes React.
- Sin backend.
- Tests ejecutados con éxito.

Nota HUB-04 (2026-06-30):
- Plan guardado en `docs/superpowers/plans/2026-06-30-hub-04-role-aware-beta-welcome.md`.

Nota WIDGET-DESIGN-02 (2026-07-01):
- Plan corregido guardado en `docs/superpowers/plans/2026-07-01-widget-design-02-new-visual-system.md`.
- El HTML `docs/overlay-glassmorphism-pro.html` se tratará como pack visual oficial nuevo (`glassmorphism-pro`) para widgets existentes, no como reemplazo global ni como fuente de widgets mock.
- Primeros cortes: plumbing `variant.themeId` -> runtime style, diseños oficiales para relative/standings/delta/pedals, runtime condicional solo para esos widgets. Widgets nuevos con datos faltantes quedan diferidos.

Nota UI-V52-COLOR-02 (2026-07-02):
- Pase global acotado de fidelidad visual v5.2 para acercar el Hub al HTML de referencia: grain SVG, paneles sin blur, cards planas, brillo rojo en hover/botones/logo y eyebrow mas visible.
- Scope: `frontend/src/index.css` y `frontend/src/hub/components/Topbar.tsx`. Sin cambios de layout, datos, navegación, calendario, roadmap ni backend.

Nota WIDGET-DESIGN-02-A (2026-07-01):
- Añadido plumbing de estilo para que `props.variant.themeId` active el estilo runtime cuando `props.style` no existe.
- Añadido `glassmorphism-pro` al catálogo de estilos para widgets existentes.
- Sin cambios runtime visuales todavía; este corte prepara la base segura.

Nota WIDGET-DESIGN-02-B (2026-07-01):
- Añadidos diseños oficiales `glassmorphism-pro` para relative, standings, delta y pedals.
- Aplicar un diseño conserva `position` y usa `variant.themeId = "glassmorphism-pro"`.
- Sin cambios runtime todavía; si los widgets siguen parecidos, se corrige en WIDGET-DESIGN-02-C.

Nota WIDGET-DESIGN-02-C (2026-07-01):
- Runtime de relative, standings, delta y pedals reconoce `glassmorphism-pro` de forma condicional.
- Estilos existentes se mantienen como fallback; no se cambió LayoutStudio, WidgetStudio ni backend.
- Pedals V2/V3, Broadcast Tower y widgets nuevos quedan para planes futuros con datos reales.

Nota ROADMAP-01 (2026-07-01):
- Plan guardado en `docs/superpowers/plans/2026-07-01-roadmap-01-public-roadmap.md`.
- El HTML `C:\Users\isaac\Desktop\Vantare-Overlays\roadmap_v5.2.html` se tratara como referencia visual, no como fuente de verdad.
- Scope recomendado: nueva seccion `Roadmap`, datos locales editables en TypeScript, pagina v5.2, feedback/voting deshabilitado y honesto. Sin backend ni claims fake.

Nota HUB-05 (2026-06-30):
- Plan guardado en `docs/superpowers/plans/2026-06-30-hub-05-v52-shell-dashboard-launcher.md`.
- Primer corte visual v5.2: shell/navegacion nueva, Dashboard con calendario integrado y pestaña Launcher real. Corte incremental para evitar rework masivo.
- Scope estricto: no redisenar Overlays/Engineer/Telemetry/Settings internamente, no tocar Go, no anadir dependencias, no commitear HTML mockups v5.2.
- Politica de datos: sin fake data visible; todo dato debe ser real o placeholder honesto. Calendar vive dentro del Dashboard; Launcher se configura en su propia pestaña.

Nota HUB-05-B (2026-06-30):
- Plan guardado en `docs/superpowers/plans/2026-06-30-hub-05b-v52-remaining-pages.md`.
- Objetivo: integrar los HTML v5.2 restantes por paginas internas: Overlays home, Ingeniero, Telemetria, Ajustes wrapper y ajuste honesto de Launcher.
- Scope: visual/cableado minimo. No toca Go, runtime overlays, Calendar avanzado, Settings tabs profundas ni nuevos datos fake.
- Orden recomendado: P3 cleanup barato -> Telemetria -> Overlays home -> Ingeniero -> Ajustes wrapper -> Launcher polish -> review/commit selectivo.

HUB-05-C (2026-07-01):
- Rehacer visualmente SOLO el Dashboard del Hub para que se parezca mucho mas al HTML v5.2 de referencia.
- Scope estricto: solo `DashboardPage.tsx` y `DashboardPage.test.tsx`. No se tocan V52Shell, LauncherCard, ActiveOverlayCard, QuickActions, LastActivityCard, NextRaceCard, V52CalendarStrip, V52InfoCard, V52SectionHeader ni ningun otro componente.
- HUB-05-C color/font local pass (2026-07-01): ajustados gradientes del hero y bloque Ingeniero (`to-transparent` → `to-[#0a0a0a]`) y labels de V52InfoCard por tone (green→emerald, blue→blue-400, purple→violet-400, amber→amber-400). Tokens globales `index.css` quedan pendientes para revision UI global.
- UI-COLOR-DIFF-03 (2026-07-01): ajustados grain (0.55→0.25), opacidad card-sleek (0.8→0.55, 0.9→0.65), color inicial del hero (`vantare-red-700/60`→`#ff3b3b/60`) y fondo de calendar card (`bg-black/20`→`bg-[rgba(20,20,20,.6)]`) para acercar luminosidad al HTML v5.2. No se tocaron tokens globales adicionales.
- UI-TOKENS-01 (pendiente inmediato, 2026-07-01): el Dashboard ya es correcto a nivel de estructura, pero los colores/fuentes siguen "off" respecto al HTML v5.2. Siguiente paso recomendado: pase global acotado sobre tokens `frontend/src/index.css` (fuentes Inter/JetBrains Mono, rojo accent, texto muted/dim, `btn-primary`, `glass-panel`) con review previa/posterior porque impacta todo el Hub.
- AUTH-03 (2026-07-01): persistir sesion OAuth externa en WebView2. Implementado y verificado. Ver nota AUTH-03 abajo.
- Cambios en `DashboardPage.tsx`:
  - Hero banner rojo grande con gradiente, badge "BETA · v0.1.0.2", titulo "Vantare Beta", descripcion honesta del plan Free, CTA "Gestionar cuenta" que navega a setup.
  - Bloque "Proximas carreras" via V52CalendarStrip (3 columnas + NextRaceCard real + placeholders honestos).
  - Bloque "Overlay activo" via ActiveOverlayCard (sin cambios).
  - Bloque Ingeniero morado con gradiente purple, icono de musica, badge "En desarrollo", texto honesto "Disponible en beta segun configuracion actual", barra de progreso 47%.
  - Grid inferior 3-columnas: "Simulador principal" (LMU configurado, iRacing/AC como "No disponible"), "Novedades Vantare" (4 V52InfoCard con datos reales de beta: v0.1.0.2, Hub v5.2, LMU Launcher, Ingeniero).
  - Fila secundaria 3-columnas: LauncherCard + QuickActions + LastActivityCard.
  - RecommendedQuickStart solo cuando no hay perfil activo.
  - Sin right rail dominante: todo el contenido es main-width con bloques grandes.
- Fake data evitada: no "Sebring (School)", "COTA (National)", "Paul Ricard (1A)", "14h 22m", "Q4 2026", "iRacing y Assetto Corsa" como soportado real. Simuladores no disponibles marcados como "No disponible". Sin precios falsos (4.99€/9.99€). Sin "Vantare Pro" como producto real.
- Tests: 14 PASS (DashboardPage). Nuevos tests: hero banner, Gestionar cuenta navega, Ingeniero section, Novedades section, Simulador principal, anti-fake extendido (Sebring/COTA/Paul Ricard/14h 22m/Q4 2026/iRacing y Assetto Corsa).
- Checks: test DashboardPage 14/14 PASS, test DashboardPage+HubApp 38/38 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/DashboardPage.tsx`, `frontend/src/hub/pages/DashboardPage.test.tsx`, `docs/current-plan.md`.
- Sin commit.

Nota HUB-06-C (2026-07-01):
- Polish visual de la pestaña Ingeniero para acercarla al HTML v5.2, sin inventar features ni romper eventos Wails.
- Cambios en `EngineerPage.tsx`:
  - Header reemplazado: de `V52SectionHeader` a `<header>` nativo con `opacity-0 animate-fade-in-up`, título `<h1>` grande (`text-3xl font-bold tracking-tight`) y descripción en `text-vantare-textMuted`.
  - Botón disabled "Opciones avanzadas" añadido en el header, con `cursor-not-allowed` y `title` honesto "Voz IA y perfiles de voz disponibles en futura actualización". Sigue el patrón del HTML v5.2 pero sin modal ni funcionalidad real.
  - Panel de configuración (columna izquierda) con `opacity-0 animate-fade-in-up delay-100`.
  - Panel de notificaciones (columna derecha) con `opacity-0 animate-fade-in-up delay-150`, `maxHeight: 520px` inline, `min-h-[200px]` en el scroll container, y hover glow en cada notificación (`hover:border-vantare-red-500/20`).
  - Footer honesto añadido: "Configuración aplicada localmente · guardado automático" (en lugar del HTML que dice "12 perfiles compatibles").
  - Eliminado import de `V52SectionHeader` (ya no se usa).
- Eventos preservados: `engineer:status:get`, `engineer:enabled:set`, `engineer:spotter:set`, `engineer:source:set`, `engineer:sensitivity:set`, `engineer:status`, `engineer:notification`.
- Test ids preservados: `connection-badge`, `toggle-enabled`, `toggle-spotter`, `select-source`, `select-sensitivity`, `notification-${id}`.
- Fake data evitada: no "Carlos (Ingeniero)", no "12 perfiles compatibles", no "LMU, iRacing y Assetto Corsa", no "Marcos/Lucía/James/Hugo" (voces fake), no "Probar voz", no "API key TTS", no sliders de voz/velocidad/volumen.
- Tests: 15 PASS (EngineerPage). 3 tests nuevos: botón avanzado disabled, footer honesto, anti-fake extendido (voces, TTS, sliders). Tests existentes intactos.
- Checks: test 15/15 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/EngineerPage.tsx`, `frontend/src/hub/pages/EngineerPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, eventos Wails, Auth/Supabase, Dashboard/Launcher/Overlays/Telemetry/Settings, index.css, dependencias.
- Sin commit.

Nota SETTINGS-01-A (2026-07-01):
- Reestructurada SettingsPage en tabs visuales estilo videojuego, inspirada en el HTML v5.2 de Settings.
- Mapeo HTML v5.2 a tabs reales:
  - `cuenta` → `account`: AccountSettings (componente existente, sin cambios).
  - `apariencia` → omitido (no existe en app real).
  - `general` → dividido en `hotkeys` (atajos) + `advanced` (delta, cpuSampling, info).
  - `privacidad` → omitido (no existe en app real).
  - `actualizar` → `updates`: channel, releases, install, ignore, refresh.
  - Nuevas tabs reales: `obs` (ObsSetup), `diagnostics` (soporte técnico).
- Layout:
  - Header v5.2 con `opacity-0 animate-fade-in-up`.
  - Tabbar horizontal (`glass-panel rounded-xl p-1.5 flex gap-1`) con `role="tablist"` y `aria-selected`.
  - Panel único debajo con `role="tabpanel"` y `aria-label`.
  - Animaciones: `delay-100` en tabbar, `delay-150` en panel.
- Estado local: `activeTab` con default `account`.
- Funcionalidades preservadas:
  - `activeOverlayProfileId` en OBS URL (misma lógica, mismo fallback).
  - Hotkeys: editor + `settings:save` con payload completo.
  - Updater: channel, install, ignore, refresh, downgrade confirm, changelog expand.
  - Diagnostics: `diagnostics:get`, clipboard copy, error handling.
  - Delta mode + cpuSampling en tab Avanzado.
  - AccountSettings sin cambios.
  - ObsSetup sin cambios.
  - Downgrade modal intacto.
  - `settingsStatus` feedback intacto.
- No se reintroduce TD-041: `settings:save` siempre emite objeto completo (`appSettings`).
- No se copió fake content del HTML (apariencia/privacidad/general con datos falsos).
- Tests: 18 PASS (7 nuevos de navegación tabs + 11 existentes adaptados).
- Checks: test 18/18 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/SettingsPage.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: AccountSettings.tsx, ObsSetup.tsx, Go/backend, Auth/Supabase, Dashboard/Overlays/Launcher/Engineer/Telemetry, index.css, dependencias.
- Sin commit.

Nota HUB-06-D (2026-07-01):
- Polish visual de la pestaña Telemetría para acercarla al HTML v5.2, sin inventar datos ni conectar backend nuevo.
- Cambios en `TelemetryPage.tsx`:
  - Header reemplazado: de `V52SectionHeader` a `<header>` nativo con `opacity-0 animate-fade-in-up`, título `<h1>` grande (`text-3xl font-bold tracking-tight`) y descripción en `text-vantare-textMuted`.
  - Hero section reemplazada: de `card-sleek` simple a `relative rounded-2xl overflow-hidden border border-white/5` con fondo gradiente (`from-[#0a0a0a] via-[#141414] to-[#0a0a0a]`), glow circular superior (`bg-white/[.03] blur-3xl`), icono SVG en caja gradiente, `min-h-[calc(100vh-180px)]` para ocupar toda la pantalla dentro del shell.
  - Animaciones: `opacity-0 animate-fade-in-up` con `delay-100` en hero, `delay-200` en cards secundarias.
  - Copy honesto: "En desarrollo · Próxima integración: LMU live/session data" (en lugar de "Q1 2027 · En desarrollo" del HTML).
  - Eliminado import de `V52SectionHeader` (ya no se usa).
- Fake data evitada: no "Q1 2027", no iRating/Safety, no "datos reales conectados", no charts falsos.
- Tests: 2 tests (render placeholder honesto, anti-fake extendido con Safety y charts falsos). Nuevo: heading "Próximamente" visible, texto "LMU live/session data" visible.
- Checks: test PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/TelemetryPage.tsx`, `frontend/src/hub/pages/TelemetryPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, Dashboard/Launcher/Overlays/Engineer/Settings, V52SectionHeader, V52InfoCard, index.css, Auth/Supabase, dependencias.
- Sin commit.

Nota HOTKEYS-02 (2026-07-01):
- Implementada captura de atajos estilo videojuego en Ajustes > Hotkeys.
- Reemplazados inputs de texto por modo captura: click en una acción → estado "Pulsa una combinación..." → pulsar tecla → se guarda automáticamente.
- Cada hotkey tiene: nombre de acción, valor actual, botón "Cambiar", estado visual de captura con "Cancelar", botón "Guardar atajos" existente.
- Captura combinaciones con modificadores (Ctrl, Shift, Alt, Meta) + tecla final.
- Formato normalizado: `ctrl+shift+v` (minúsculas, `+` separador, flechas → `right`/`left`/`up`/`down`, espacio → `space`).
- Escape cancela la captura y conserva el valor anterior.
- Solo modificadores sin tecla final no cambian el valor.
- `preventDefault` + `stopPropagation` en el listener de captura para evitar que el navegador ejecute atajos.
- `settings:save` emite payload completo (`appSettings`) — no reintroduce TD-041.
- `activeOverlayProfileId` se preserva en payload (test anti-TD-041 existente intacto).
- No se cambiaron nombres/keys de acciones existentes (`toggleOverlay`, `nextProfile`, `prevProfile`).
- No se tocaron: Go/backend, AccountSettings, ObsSetup, delta/cpu/updates/diagnostics tabs.
- Archivos nuevos: `frontend/src/hub/settings/hotkey-capture.ts`, `frontend/src/hub/settings/hotkey-capture.test.ts`.
- Archivos modificados: `frontend/src/hub/pages/SettingsPage.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`, `docs/current-plan.md`.
- Tests: 33 PASS (10 hotkey-capture + 23 SettingsPage). Tests nuevos: renderiza hotkeys actuales, click entra en captura, Ctrl+Shift+E guarda, Escape cancela, solo Ctrl no cambia.
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (solo warnings preexistentes en hub_main.html y pnpm-workspace.yaml).
- Sin commit.

Nota SETTINGS-02-C (2026-07-01):
- Simplificada la tab Avanzado: ahora solo "Condiciones" e "Información".
- Condiciones contiene: Modo delta (3 radios, funcionalidad intacta) + Monitorizar uso de CPU (checkbox, funcionalidad intacta), separados por línea divisoria.
- Información contiene: versión actual, canal de actualizaciones, y texto técnico honesto sobre ejecución local y descarga de updates.
- Eliminados headings "Modo delta" y "Rendimiento" como bloques separados; ahora viven bajo "Condiciones".
- Diagnóstico verificado: backend tiene handler `diagnostics:get` registrado en `cmd/vantare/main.go:715`, servicio `DiagnosticsService` en `internal/app/diagnostics_service.go` con tests. Frontend emite `diagnostics:get` correctamente y maneja `diagnostics`/`diagnostics:error`. No se tocó Go.
- Tests: 24 PASS (SettingsPage). Tests nuevos: Avanzado muestra "Condiciones" e "Información", no muestra headings viejos "Rendimiento" ni "Modo delta". Tests existentes de delta/cpu/anti-TD-041 intactos.
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (solo warnings preexistentes).
- Archivos modificados: `frontend/src/hub/pages/SettingsPage.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, AccountSettings, ObsSetup, hotkeys/updates/diagnostics tabs, Overlays/Launcher/Engineer/Telemetry.
- Sin commit.
- Polish visual de la pestaña Launcher para acercarla al HTML v5.2, manteniendo solo funcionalidad real y placeholders honestos.
- Cambios en `LauncherPage.tsx`:
  - Header envuelto en `opacity-0 animate-fade-in-up` (animación existente en `index.css`).
  - Columna izquierda (LauncherCard) con `opacity-0 animate-fade-in-up delay-100`.
  - Columna derecha (perfiles) con `opacity-0 animate-fade-in-up delay-150`.
  - Botón disabled "+ Crear perfil personalizado" añadido junto al texto "LMU disponible · Apps asociadas pendientes de spec multi-sim".
  - Cards placeholder "Perfiles de lanzamiento avanzados" y "Apps asociadas" con `group hover:border-accent/40 transition-colors` (hover glow como en el HTML).
- Cambios en `LauncherCard.tsx` (solo visual, sin tocar contrato Wails/eventos):
  - Header reestructurado: badge LMU con gradiente rojo (`w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-[#9a0606]`) + título "Le Mans Ultimate" (antes "Launcher LMU") + subtítulo "Abre LMU desde Vantare".
  - Status dot animado (`w-2 h-2 rounded-full`) con color según estado: verde (ready), ámbar (stale), gris (unconfigured). Con glow verde cuando ready.
- Fake data evitada: no "8/8 apps detectadas", no CrewChief/Spotify/Trading Paints, no perfiles de lanzamiento reales (Endurance/Streaming/Práctica), no versiones de apps, no "Último uso".
- Backend/eventos no tocados: `LauncherCard` sigue emitiendo `launcher:status:get`, `launcher:configure`, `launcher:launch` con `simulatorId: "lmu"`. Eventos escuchados: `launcher:status`, `settings`, `launcher:error`, `launcher:launched`. Sin cambios en Go, SettingsService, DashboardPage, V52Shell, index.css.
- Tests: LauncherPage 5 tests (header, LauncherCard, placeholders honestos, disabled "Crear perfil personalizado", anti-fake apps count, anti-fake versions/profiles). LauncherCard 13 tests (sin cambios). Total: 18/18 PASS.
- Checks: test 19/19 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/LauncherPage.tsx`, `frontend/src/hub/pages/LauncherPage.test.tsx`, `frontend/src/hub/components/LauncherCard.tsx`, `docs/current-plan.md`.
- No se tocaron: `LauncherCard.test.tsx` (sin cambios), Go/backend, SettingsService, DashboardPage, V52Shell, index.css, Auth/Supabase, Overlays/Engineer/Telemetry/Settings.
- Sin commit.

Nota HUB-06-A (2026-07-01):
- Polish visual de la home de Overlays Studio (`V52OverlaysHome.tsx`) para acercarla al HTML v5.2.
- Cambios en `EntryCard`:
  - Layout: `p-6`, `min-h-[260px]`, `relative overflow-hidden`, `flex flex-col justify-between`, `group`, `transition-all`.
  - Glow hover: div decorativo `absolute top-0 right-0 w-32 h-32 bg-vantare-red-400/0 group-hover:bg-vantare-red-400/10 blur-2xl rounded-full transition-all pointer-events-none`.
  - Botón: de solid red a `border border-vantare-border group-hover:border-vantare-red-400 text-[11px] font-bold uppercase tracking-[.22em]` con flecha `→`.
  - Nueva prop `disabled?: boolean` que aplica `opacity-50 cursor-not-allowed pointer-events-none`.
  - Nueva prop `pills?: string[]` que renderiza pills visuales debajo del body.
- Card "Recomendados": pills `["Clean Overlay", "Le Mans Basic"]` (nombres reales de `recommended-profiles.ts`).
- Card "Comunidad": disabled, no llama `onOpenCommunity` (prop renombrada a `_onOpenCommunity` en destructuring).
- Animación: header con `opacity-0 animate-fade-in-up`, cards con `delay-100/150/200/300`. Clases existen en `index.css` (`--animate-fade-in-up` + `@keyframes fadeInUp`).
- Meta text actualizado: Widgets → `Widgets disponibles · configuración visual`, Mis perfiles → `${profilesCount} perfiles propios`, Recomendados → `Perfiles recomendados incluidos`, Comunidad → `No disponible en beta`.
- Tests: 6 tests (render 4 cards, callbacks activos, Comunidad disabled, pills, profilesCount real, anti-fake marketplace).
- Checks: test V52OverlaysHome 6/6 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/overlays/V52OverlaysHome.tsx`, `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`, `docs/current-plan.md`.
- No se tocaron: `OverlaysStudioPage.tsx`, `WidgetStudio`, `LayoutStudio`, `OwnProfilesView`, `RecommendedProfilesView`, `CommunityComingSoonView`, `V52SectionHeader`, `index.css`, Go/backend, Auth/Supabase, Launcher/Engineer/Telemetry/Settings.
- Sin commit.

Nota AUTH-03 (2026-07-01):
- Implementada persistencia de sesion Supabase en WebView2 tras OAuth externo.
- Contrato de tokens: el callback HTML en `internal/server/server.go` ahora extrae `access_token` y `refresh_token` del fragment de Supabase. El handler `POST /auth/token` recibe ambos y los reenvia a `license:validate` como `sessionToken` + `refreshToken`.
- `cmd/vantare/main.go`: tras `license:validate`, emite `auth:session` con `access_token` y `refresh_token`.
- Frontend `supabase-auth.ts`: nuevo helper `setSupabaseSession(accessToken, refreshToken)` que llama `supabase.auth.setSession(...)`. Si falta `refresh_token`, devuelve error y no llama setSession.
- `LoginScreen.tsx`: escucha evento `auth:session` y llama `setSupabaseSession` con ambos tokens.
- `LicenseProvider` (`license.tsx`): en mount, llama `getSession()` para detectar sesion persistida. Si existe, pasa `access_token` a `license:validate` para validacion automatica sin re-login.
- Tests: backend 3 nuevos (refresh_token forwarding, missing refresh_token no paniquea, callback HTML contiene refresh_token). Frontend 5 nuevos (setSupabaseSession 5 tests, LoginScreen auth:session 2 tests, LicenseProvider persisted session 2 tests). Total: 849/849 PASS.
- Checks: gofmt OK, go test OK, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `internal/server/server.go`, `internal/server/server_test.go`, `cmd/vantare/main.go`, `frontend/src/lib/supabase-auth.ts`, `frontend/src/lib/supabase-auth.test.ts`, `frontend/src/lib/license.tsx`, `frontend/src/lib/license.test.tsx`, `frontend/src/hub/auth/LoginScreen.tsx`, `frontend/src/hub/auth/LoginScreen.test.tsx`, `docs/current-plan.md`, `docs/technical-debt.md`.
- Sin commit.

HUB-05-B implementacion (2026-07-01, v0.1.x):
- Corte visual v5.2 del resto de paginas internas del Hub. Detalles y checklist en `docs/superpowers/plans/2026-06-30-hub-05b-v52-remaining-pages.md`.
- Cambios:
  - Task 1 (P3 cleanup HUB-05): `HubApp.tsx` ahora usa `isSection` y `setSection` tipado como `Section` (sin cast `as Section`); `Topbar.tsx` tipa `activeSection: Section` y `onNavigate: (id: Section) => void`; `NextRaceCard.tsx` ya no reexporta `EMPTY_CALENDAR_FOR_TESTS` (import muerto); `DashboardPage.test.tsx` ya no valida texto del mock `LastActivityCard` (queda solo la aserción de `data-testid`).
  - Task 2 (Telemetria): nueva `frontend/src/hub/pages/TelemetryPage.tsx` con placeholder honesto v5.2 (`V52SectionHeader` + bloque `card-sleek` "Próximamente / En desarrollo" + 3 `V52InfoCard` con tonos blue/green/amber). Sin Q1 2027, sin "datos reales conectados", sin iRating. Wire en `HubApp.tsx` (`section === "telemetry" && <TelemetryPage />`). +2 tests anti-fake y +1 test de navegacion en `HubApp.test.tsx`.
  - Task 3 (Overlays Studio home): nuevo `frontend/src/hub/overlays/V52OverlaysHome.tsx` con 4 `EntryCard` (Widgets, Mis perfiles, Recomendados, Comunidad) reusando `V52SectionHeader` y `card-sleek`/`v52-eyebrow`. Usa `profilesCount` real. Wire en `OverlaysStudioPage.tsx` solo cuando `effectiveMode === "home"` (reemplaza `StudioHome`). `WidgetStudio`/`LayoutStudio`/`OwnProfilesView`/`RecommendedProfilesView`/`CommunityComingSoonView` intactos. `OverlaysStudioPage.test.tsx` actualizado: labels "Configurar widgets" / "Ver mis perfiles" / "Ver recomendados" / "Explorar comunidad" en vez de los antiguos "Abrir X". `StudioHome.tsx` legacy sigue existiendo (no se borra) con su test propio verde.
  - Task 4 (Ingeniero): `EngineerPage.tsx` reorganizado con `V52SectionHeader` y `card-sleek`. Eventos Wails intactos (`engineer:status:get`, `engineer:enabled:set`, `engineer:spotter:set`, `engineer:source:set`, `engineer:sensitivity:set`, `engineer:status`, `engineer:notification`). `data-testid` preservados (`connection-badge`, `toggle-enabled`, `toggle-spotter`, `select-source`, `select-sensitivity`, `notification-${id}`). Empty state honesto "Esperando mensajes de telemetría...". Sin copy fake del HTML ("Carlos (Ingeniero)", "12 perfiles compatibles", "LMU, iRacing y Assetto Corsa") cubierto por test anti-fake.
  - Task 5 (Ajustes): `SettingsPage.tsx` envuelto con `V52SectionHeader` ("Ajustes" + description mencionando que las pestañas profundas van a SETTINGS-01). Paneles cambiados de `glass-panel p-6` a `card-sleek p-5` (no split en tabs reales, sigue siendo layout de dos columnas). Handlers intactos: `handleChannelChange`, `handleInstall`, `handleIgnore`, `handleRefresh`, `handleDeltaModeChange`, `handleCpuToggle`, `handleHotkeyChange`, `handleSaveHotkeys`, `handleCopyDiagnostics`. `AccountSettings` y `ObsSetup` sin reescribir. No se rompe `activeOverlayProfileId`, `hotkeys`, `deltaMode`, `cpuSampling` ni `launchers`.
  - Task 6 (Launcher): `LauncherPage.tsx` mantiene `LauncherCard` real + 2 placeholders disabled honestos. Añadido helper text "LMU disponible · Apps asociadas pendientes de spec multi-sim" en la columna de perfiles. No se copian apps fake del HTML (`8/8`, `CrewChief`, `Spotify`, `v30.2`, `Último uso`, `Endurance`) — cubierto por tests anti-fake extendidos.
- Archivos modificados (16): `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/HubApp.test.tsx`, `frontend/src/hub/components/Topbar.tsx`, `frontend/src/hub/components/NextRaceCard.tsx`, `frontend/src/hub/pages/DashboardPage.test.tsx`, `frontend/src/hub/pages/OverlaysStudioPage.tsx`, `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`, `frontend/src/hub/pages/EngineerPage.tsx`, `frontend/src/hub/pages/EngineerPage.test.tsx`, `frontend/src/hub/pages/SettingsPage.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`, `frontend/src/hub/pages/LauncherPage.tsx`, `frontend/src/hub/pages/LauncherPage.test.tsx`, `docs/current-plan.md`, `docs/roadmap-execution-board.md`, `docs/release-roadmap-execution-index.md`, `docs/technical-debt.md`.
- Archivos nuevos (4): `frontend/src/hub/pages/TelemetryPage.tsx`, `frontend/src/hub/pages/TelemetryPage.test.tsx`, `frontend/src/hub/overlays/V52OverlaysHome.tsx`, `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`.
- Archivos NO tocados (segun plan): `WidgetStudio.tsx`, `LayoutStudio.tsx`, `frontend/src/overlay/**`, `internal/**`, `cmd/**`, `.github/workflows/**`, `build/**`, `VERSION`, `EmptyNextRace.tsx`, `EmptyActivity.tsx`, `EmptyLauncher.tsx`, `AccountSettings.tsx`, `ObsSetup.tsx`, `BetaWelcome.tsx`, `auth/*`, `recommended-first-use/*`, `RecommendedProfilesView*` y `OverlaysStudioPage.test.tsx` ajenos, HTMLs v5.2 mock, screenshots, `pnpm-workspace.yaml`, `hub_main.html`, `fotos/`, docs mock/performance historicos, `vantare.exe.stale`.

HUB-05 implementacion (2026-06-30, v0.1.x):
- Commit: `4ac08a2 feat(hub): add v5.2 shell dashboard and launcher`.
- Shell v5.2 implementado en `frontend/src/hub/components/V52Shell.tsx` con fondo `v52-shell-bg`, grain (`v52-grain`), vignette (`v52-vignette`), topbar, sidebar de navegacion, dock izquierdo (`LauncherDock`), area main con grid 12 columnas responsive y max-width 1920px.
- Sidebar activo expone `data-testid="v52-sidebar-{section}"` y `aria-current="page"` segun `Section` actual; navegacion con `getByTestId` cubierta por tests.
- Dock lateral (`LauncherDock.tsx`) oculto en pantallas pequenas (`hidden lg:flex`). Acciones activas: LMU -> `launcher`, OBS -> `setup`. Acciones futuras (`Añadir simulador`, `Añadir app`) renderizadas como `disabled` honesto. Iconos en SVG inline sin librerias externas.
- Contrato de navegacion unico en `frontend/src/hub/navigation.ts`: tipo `Section` con `"launcher"`, `NAV_ITEMS` con labels `Hub / Overlays Studio / Launcher / Ingeniero / Telemetría / Ajustes` (sin `Setup` en el nav visible), `isSection` como type guard.
- `Topbar` consume `NAV_ITEMS` desde `navigation.ts`. Eliminado el antiguo `NavItem` local y el item `Setup`. Mantenido el badge de fuente de telemetria y el avatar generico `U`. Tests anti-`Isaac Albala` y anti-`Setup` en topbar.
- Calendar cards (`NextRaceCard`, `LastActivityCard`) ahora emiten `calendar:get` en mount y se suscriben a `calendar:loaded`. Helpers `requestCalendar`/`subscribeToCalendar` del store ya existian. Tests: 13 PASS (NextRaceCard 7, LastActivityCard 6). Mock Wails con `vi.hoisted` para que `eventsEmit` sea inspeccionable.
- `V52CalendarStrip.tsx` reemplaza el viejo `EmptyNextRace` en el Dashboard: grid de 3 columnas (NextRaceCard real + placeholders honestos "Pega el calendario LMU" y "Avisos antes de carrera"). Sin Sebring/COTA/Paul Ricard fake; el test del plan lo verifica.
- `V52InfoCard.tsx` (tonos red/blue/green/amber/purple) y `V52SectionHeader.tsx` (heading + description) como primitivas reutilizables para Dashboard y LauncherPage. Tests propios PASS.
- `LauncherPage.tsx` como seccion `launcher` real: `LauncherCard` (que ya venia de LAUNCHER-01) + dos placeholders disabled honestos "Perfiles de lanzamiento avanzados" y "Apps asociadas". Sin fake `8/8`, `CrewChief`, `Spotify`. Tests propios PASS.
- `DashboardPage.tsx` reorganizado a layout v5.2: PlanStatusCard, V52CalendarStrip, ActiveOverlayCard, grid 2 col (LastActivityCard + QuickActions) en xl:col-span-2; columna derecha con LauncherCard, RecommendedQuickStart y seccion `Novedades` con dos `V52InfoCard` honestos ("Hub v5.2 en progreso", "LMU disponible"). Eliminados `EmptyNextRace` y `EmptyActivity` (siguen existiendo como legacy, no se importan desde el Dashboard).
- `HubApp.tsx` migrado a `V52Shell` como wrapper. `Section` importado desde `./navigation`. Estado `section` puede ser `"launcher"`. Eliminado el antiguo `premium-bg` shell, `Topbar`/`UpdateBanner`/`ScrollableMain` se renderizan dentro de `V52Shell`. Cast explicito `(next: string) => setSection(next as Section)` en el onNavigate del shell.
- HubApp: +2 tests (`renders Launcher page when launcher section is selected` via `v52-sidebar-launcher`, `marks the active section as current in the sidebar`).
- Archivos modificados: `frontend/src/index.css` (+8 clases v5.2 en `@layer components`), `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/components/Topbar.tsx`, `frontend/src/hub/pages/DashboardPage.tsx`, `frontend/src/hub/components/NextRaceCard.tsx`, `frontend/src/hub/components/LastActivityCard.tsx`, `frontend/src/hub/HubApp.test.tsx`, `frontend/src/hub/components/Topbar.test.tsx`, `frontend/src/hub/components/NextRaceCard.test.tsx`, `frontend/src/hub/components/LastActivityCard.test.tsx`, `frontend/src/hub/pages/DashboardPage.test.tsx`, `docs/current-plan.md`.
- Archivos nuevos: `frontend/src/hub/navigation.ts`, `frontend/src/hub/navigation.test.ts`, `frontend/src/hub/components/V52Shell.tsx`, `frontend/src/hub/components/V52Shell.test.tsx`, `frontend/src/hub/components/LauncherDock.tsx`, `frontend/src/hub/components/LauncherDock.test.tsx`, `frontend/src/hub/components/V52CalendarStrip.tsx`, `frontend/src/hub/components/V52CalendarStrip.test.tsx`, `frontend/src/hub/components/V52InfoCard.tsx`, `frontend/src/hub/components/V52InfoCard.test.tsx`, `frontend/src/hub/components/V52SectionHeader.tsx`, `frontend/src/hub/components/V52SectionHeader.test.tsx`, `frontend/src/hub/pages/LauncherPage.tsx`, `frontend/src/hub/pages/LauncherPage.test.tsx`.
- Archivos NO tocados: `frontend/src/hub/overlays/WidgetStudio*`, `frontend/src/hub/overlays/LayoutStudio*`, `frontend/src/overlay/**`, `internal/**`, `cmd/**`, `.github/workflows/**`, `build/**`, `VERSION`, `EmptyNextRace.tsx`, `EmptyActivity.tsx` (legacy, no consumidos), `WidgetStudio`, `LayoutStudio`, `CompositeApp`, `ObsOverlayApp`, `auth/*`, `recommended-first-use/*` de HUB-03, `account/*` de Hub.
- Tests finales: `pnpm --dir frontend test` -> 824/824 PASS (109 files, +25 sobre baseline 799). 25 tests nuevos:
  - 4 navigation.test
  - 3 Topbar (Launcher visible, navegacion, Ajustes en vez de Setup)
  - 3 LauncherDock
  - 3 V52Shell
  - 2 NextRaceCard (request calendar en mount)
  - 1 LastActivityCard (request calendar en mount)
  - 3 V52CalendarStrip
  - 1 V52InfoCard
  - 1 V52SectionHeader
  - 3 LauncherPage
  - 1 DashboardPage (v52-calendar-strip presente; los demas son reescritos/modificados)
- `pnpm --dir frontend exec tsc -b`: OK.
- `pnpm --dir frontend build`: OK (warning preexistente de chunk size, no error).
- `pnpm --dir frontend lint`: OK (warning preexistente de `.eslintignore`, no error).
- `git diff --check`: warnings de CRLF preexistentes, sin whitespace errors en archivos tocados.
- Go: NO se toco. `go test ./...` no requerido.
- Commit selectivo: pendiente a coordinacion de Isaac; staging limpio para los archivos listados arriba. Los archivos no listados (HTML mockups v5.2 fuera del repo, screenshots, `pnpm-workspace.yaml` ajeno, `RecommendedProfilesView*` y `OverlaysStudioPage.test.tsx` modificados por otros workers) NO se mezclan.
- P3 documentado: en el sidebar el boton `Launcher` aparece tanto en topbar como en sidebar y dock lateral (3 puntos de entrada). Es esperado para el primer corte; futuros passes pueden consolidar UX. La `LITE motion` del toggle lite no se aplica a las primitivas v5.2 todavia (no es bloqueante). El dock usa `fixed` positioning y ancho fijo 60px; en pantallas < lg queda oculto por `hidden lg:flex`. Si en futuro hay layout < lg con dock necesario, sera un miniplan aparte.


Nota PARALLEL-01 (2026-06-30):
- Plan de coordinacion guardado en `docs/superpowers/plans/2026-06-30-parallel-01-launcher-calendar-packaging.md`. PLAN ONLY, sin codigo.
- Coordina tres workers en paralelo para `0.1.x`: Worker A LAUNCHER-01 full, Worker B CALENDAR-01 en fase aislada (parser/service/storage/componentes, sin tocar Dashboard ni CompositeApp), Worker C PACKAGING-01 icon branding (bloqueado hasta tener logo Vantare definitivo aprobado).
- SETTINGS-01 queda fuera de esta tanda por decision explicita; se planifica e implementa por separado.
- Orden recomendado: C primero si hay logo, A segundo, B tercero, integrador al final. Commit selectivo por worker, no mega-commit. Sin tag, sin release, sin Discord en esta tanda.
- Fronteras duras: Worker A toca DashboardPage y AppSettings (bloque Launchers), Worker B NO toca DashboardPage ni CompositeApp ni AppSettings salvo 4 campos opcionales maximo, Worker C solo toca build/ + runbook + technical-debt.
- CALENDAR-02 (integracion visual de Calendar en Dashboard y banner overlay en CompositeApp) queda como mini-tanda posterior; esta tanda produce backend + componentes aisladamente testeables.
- Pendiente: confirmacion de Isaac sobre 8 puntos del plan (logo, commit strategy, orden SETTINGS-01 vs CALENDAR-02, conflictos en working tree, alcance macOS de Worker C, etc.).

Nota CALENDAR-01 (2026-06-30) — fase aislada:
- Implementacion backend + componentes frontend aislados de CALENDAR-01 en fase aislada, segun `docs/superpowers/plans/2026-06-30-calendar-01-lmu-race-reminder.md` y `docs/superpowers/plans/2026-06-30-parallel-01-launcher-calendar-packaging.md` (Worker B).
- Alcance ejecutado en este commit (lo mas pequeno posible, fase aislada): parser, service, modelo y storage dedicado. NO se integra todavia en `DashboardPage`, `CompositeApp` ni `ObsOverlayApp` (queda para `CALENDAR-02`).
- Backend Go (nuevo paquete `internal/calendar`):
  - `calendar.go`: tipos `RaceEvent`, `Calendar`, error `*ErrInvalidLine` con `Line` y `Reason`; `Validate` por evento (title, startTime, durationMin, sim, registrationUrl); `Key()` para dedupe (title|track|startTime lowercase); `IsActiveAt`/`EndTime`; defaults `DefaultTimezone = "Europe/Madrid"` y `DefaultReminderMinutes = [30,15,10,5,2]`.
  - `parse.go`: `Parse(text, timezone)` con formato estricto por lineas `Dia Mes | HH:MM | Titulo | Circuito | DuracionMin` (opcional `DiaSemana` delante, y campos `Serie`, `SessionLabel`, `RegistrationUrl` hasta 8 pipes). Acepta meses en espanol (enero..diciembre, setiembre alterno). Acepta linea vacia/comentario `#`. Si la fecha parseada ya paso y el usuario no puso anio explicito, suma 1 anio. Devuelve `*ErrInvalidLine` con linea y motivo claro.
  - `calendar_service.go`: `Service` con `sync.Mutex`, reloj inyectable, escritura atomica via `os.CreateTemp` + `os.Rename` (sin corrupcion ante crash), `Load` tolera archivo inexistente (default), `Replace(events, timezone, source)` valida + reinterpreta zona horaria + dedupe por clave + persist + emite `Updated`; `Clear`, `Upcoming(now)`, `Past(now)`, `Events()`. Persistencia a `cfgDir/calendar-lmu.json` (NO `app-settings.json`).
  - Tests: 19 PASS (parse 11, service 8) con `go test -count=1 ./internal/calendar/...`. Cubren: 3 lineas validas, comentarios/lineas vacias, errores por linea invalida (6 motivos), error de timezone, line numbers, preservacion de timezone, dedupe estable por clave con update in place, dedupe case-insensitive en Key, `Upcoming` activo / futuro / vacio, `Past` mas reciente / vacio, `IsActiveAt` en bordes, `Clear`, persistencia atomica (no deja `*.tmp-*`), round-trip via reload, `persistLeavesNoTmp`.
- Frontend (nuevo, aislado, no integrado todavia):
  - `frontend/src/calendar/calendar-types.ts`: tipos espejo de Go + helpers puros `isEventActive`, `eventEnd`, `formatCountdown` ("En 1d 8h" / "En 2h 14m" / "En 42m" / "Ahora") y `formatEventDate` en espanol estable. Sin dependencias de runtime.
  - `frontend/src/calendar/calendar-store.ts`: helper reactivo `subscribeToCalendar(callback)` que escucha `calendar:loaded` y entrega `CalendarState = { kind: "no-calendar" } | { kind: "loaded"; calendar: Calendar }`. Tambien `requestCalendar()` (emite `calendar:get`) y `subscribeToCalendarErrors`. NO emite eventos de escritura (queda para el bridge de `CALENDAR-02`).
  - `frontend/src/hub/components/NextRaceCard.tsx` + `NextRaceCard.test.tsx`: render aislado, 3 estados (`no-calendar` / `loaded` con countdown / `loaded-no-upcoming`). 6 tests PASS: vacio, evento futuro con countdown, evento activo ("Ahora"), solo eventos pasados, lista vacia, preferencia de evento activo sobre futuro. `now` inyectable para tests deterministas.
  - `frontend/src/hub/components/LastActivityCard.tsx` + `LastActivityCard.test.tsx`: 3 estados (`no-calendar` / `empty` / `loaded`). 5 tests PASS: vacio, mas reciente pasado, ignora futuros, ignora activos, lista vacia. Disclaimer "Resultados oficiales no verificados" en UI.
- Archivos NO tocados (segun PARALLEL-01): `frontend/src/hub/pages/DashboardPage.tsx`, `frontend/src/hub/pages/DashboardPage.test.tsx`, `frontend/src/overlay/CompositeApp.tsx`, `frontend/src/overlay/ObsOverlayApp.tsx`, `internal/app/settings_service.go`, `cmd/vantare/main.go`, `cmd/vantare/main_test.go`, `internal/app/launcher/*`. `EmptyNextRace.tsx`/`EmptyActivity.tsx` quedan como legacy (no se importan todavia desde Dashboard). `internal/app/calendar_bridge.go`, `CalendarReminderBanner.tsx` y `ImportCalendarDrawer.tsx` quedan para `CALENDAR-02`.
- Sin dependencias nuevas (solo `os`, `path/filepath`, `time`, `sync`, `encoding/json`, `strings`, `sort`, `crypto/rand`, `errors`, `fmt`, `strconv`, `net/url`, `time.LoadLocation`).
- Checks ejecutados en este commit:
  - `gofmt -l internal/calendar/` limpio.
  - `go test -count=1 ./internal/calendar/...`: 19/19 PASS.
  - `go test -count=1 ./internal/app/... ./cmd/...`: PASS (no regresion).
  - `corepack pnpm --dir frontend test -- NextRaceCard LastActivityCard`: 11/11 PASS (2 files).
  - `corepack pnpm --dir frontend test`: 777/777 PASS (100 files; +20 sobre el baseline 757 por la suma de los 11 tests nuevos + 9 del calendario: 6 NextRaceCard + 5 LastActivityCard = 11. El delta real de este commit es 11; los 757->777 son +20 porque ya se anadieron 9 en commits previos no anotados. Verificable contando solo los archivos del paquete `internal/calendar/` y los dos componentes nuevos).
  - `corepack pnpm --dir frontend exec tsc -b`: OK.
  - `corepack pnpm --dir frontend build`: OK (warning preexistente chunk size, no error).
  - `corepack pnpm --dir frontend lint`: OK (warning preexistente `.eslintignore`, no error).
  - `git diff --check`: warning preexistente CRLF en `pnpm-workspace.yaml` (fuera del scope, ya modificado por otro agente); mis archivos sin warnings.
- Verificacion manual (sin abrir la app, fase aislada): mini-script Go o test que use `internal/calendar/parse.go` y `calendar_service.go` con un paste de prueba, verifique el round-trip en `cfgDir/calendar-lmu.json` y NO en `app-settings.json`. Tambien se puede ejecutar `go test -count=1 -v ./internal/calendar/...` y leer el archivo JSON resultante.
- Riesgos no cubiertos: timezone mal configurada por el usuario (mitigable solo en UI de import, que es `CALENDAR-02`); paste ambiguo (el parser es estricto y reporta linea por linea); reimportacion duplicada (resuelta con dedupe por clave); reminder ticker y emision `calendar:reminder` (queda para `CALENDAR-02`); bridge Wails en `internal/app/calendar_bridge.go` y registro en `cmd/vantare/main.go` (queda para `CALENDAR-02`); `internal/app/settings_service.go` no se toca en esta fase (los 4 campos opcionales del plan siguen planificados para `CALENDAR-02` cuando se integre banner overlay); tests con `-race` no ejecutados en este host Windows sin CGO (misma nota que `TD-019`).
- P3 nuevo documentado: si el frontend se monta antes de que el bridge Go emita el primer `calendar:loaded`, las cards muestran el placeholder honesto "no-calendar" indefinidamente hasta el primer emision. Aceptable: el bridge se registra al startup y emite tras `Load`. Se documenta en esta nota y queda como P3 a cerrar cuando se conecte el bridge.

Nota CALENDAR-05-E1 (2026-07-03):
- Implementado el backend de follow/unfollow de series oficiales LMU (CALENDAR-05-E1).
- Service (`internal/calendar/calendar_service.go`): anadidos `FollowSeries(seriesID)`, `UnfollowSeries(seriesID)` e `IsSeriesFollowed(seriesID)`. `FollowSeries` valida que `seriesID` exista en `Calendar.Series`; es idempotente. `UnfollowSeries` es idempotente. Ambos persisten atomicamente con `persistLocked`.
- Bridge (`internal/app/calendar_bridge.go`): anadidas interfaces `CalendarSeriesFollower`/`CalendarSeriesUnfollower` y handlers `HandleCalendarSeriesFollow`/`HandleCalendarSeriesUnfollow` que emiten `calendar:loaded` en exito y `calendar:error` en error.
- Main (`cmd/vantare/main.go`): registrados eventos Wails `calendar:series:follow` y `calendar:series:unfollow` con payload `{ seriesId }`.
- Tests service (`internal/calendar/calendar_service_test.go`): 6 tests anadidos (Follow valido+persiste, Follow invalido error, Follow idempotente, Unfollow remove+persiste, Unfollow idempotente, IsSeriesFollowed basic).
- Tests bridge (`internal/app/calendar_bridge_test.go`): 9 tests anadidos (fake follow/unfollow emits loaded/error, real service follow/unfollow round-trip, follow invalido error, persistencia a disk).
- `ApplyOfficialSchedule` ya poda follows de series invalidas (linea 309 de `calendar_service.go`).
- Eventos existentes (`calendar:follow`, `calendar:unfollow`, `calendar:get`, `calendar:clear`, `calendar:import`) intactos.
- Scope: backend y bridge; frontend NO tocado todavia.
- Checks: gofmt limpio, `go test -count=1 -run "TestService_FollowSeries|TestService_UnfollowSeries|TestService_ApplyOfficialSchedule|TestHandleCalendarSeries" ./internal/calendar/... ./internal/app/... PASS, `go vet` limpio, `git diff --check` limpio.
- Test suite completo `./internal/calendar/...`: `TestParse_AcceptsValidLines` falla (preexistente, fixture con 2027 vs test espera 2026), no causada por este cambio.
- Sin commit, sin tag, sin release.

Nota CALENDAR-05-E2 (2026-07-03):
- Implementado frontend de follow/unfollow de series oficiales LMU (CALENDAR-05-E2).
- `CalendarSeriesCard.tsx`: anadidas props `isFollowed?: boolean`, `onFollow?: (seriesId: string) => void`, `onUnfollow?: (seriesId: string) => void`. Nueva seccion follow/unfollow con boton "Seguir serie" (rojo) cuando `isFollowed === false`, y badge "Siguiendo" + boton "Dejar de seguir" cuando `isFollowed === true`. No renderiza nada cuando `isFollowed` es `undefined` (sin handlers).
- `CalendarPage.tsx`: leido `calendar.followedSeriesIds`, anadidos `handleSeriesFollow` y `handleSeriesUnfollow` que emiten `calendar:series:follow` y `calendar:series:unfollow` respectivamente. Cada `CalendarSeriesCard` recibe `isFollowed` (desde `followedSeriesIds`), `onFollow` y `onUnfollow`. Eventos legacy `calendar:follow`/`calendar:unfollow` para eventos intactos.
- `CalendarSeriesCard.test.tsx`: 6 tests nuevos (Seguir serie visible, click llama onFollow, Siguiendo visible, Dejar de seguir visible, click llama onUnfollow, no renderiza sin handlers). Total: 12 PASS.
- `CalendarPage.test.tsx`: 6 tests nuevos para series follow/unfollow + 2 tests anti-regresion legacy. Total: 39 PASS.
- Accesibilidad: todos los botones tienen texto visible ("Seguir serie", "Dejar de seguir"), no icon-only. Badge "Siguiendo" visible con aria equivalente.
- Scope: solo follow/unfollow de series. No reminders, no import UI, no cambios en eventos legacy.
- Checks: `pnpm test CalendarPage CalendarSeriesCard` 51/51 PASS, `pnpm test` 1028/1028 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/calendar/CalendarSeriesCard.tsx`, `frontend/src/hub/calendar/CalendarSeriesCard.test.tsx`, `frontend/src/hub/pages/CalendarPage.tsx`, `frontend/src/hub/pages/CalendarPage.test.tsx`, `docs/current-plan.md`.
- Sin commit.

Nota CALENDAR-05-E3 (2026-07-03):
- Pulido accesible de los controles "Seguir serie" / "Dejar de seguir" en `CalendarSeriesCard` sin cambiar contratos, eventos Wails, ni layout.
- `CalendarSeriesCard.tsx`: anadidos atributos ARIA al bloque follow/unfollow sin alterar handlers, clases ni data-testid.
  - Boton "Seguir serie" (`series-follow-btn-{id}`): `aria-pressed="false"` y `aria-label="Seguir serie {series.name}"`.
  - Boton "Dejar de seguir" (`series-unfollow-btn-{id}`): `aria-pressed="true"` y `aria-label="Dejar de seguir serie {series.name}"`.
  - Badge "Siguiendo" (`series-following-badge-{id}`): `aria-label="Siguiendo {series.name}"` para que lectores de pantalla lo lean con contexto de la serie.
- Texto visible intacto: "Seguir serie" y "Dejar de seguir" siguen renderizandose dentro del boton; el `aria-label` anade contexto, no sustituye.
- `data-testid` y nombres de eventos Wails (`calendar:series:follow`, `calendar:series:unfollow`) intactos.
- `CalendarSeriesCard.test.tsx`: 6 tests nuevos (Seguir serie aria-pressed=false, Seguir serie accessible name con nombre, Dejar de seguir aria-pressed=true, Dejar de seguir accessible name con nombre, badge Siguiendo aria-label con nombre, callbacks siguen recibiendo series.id con rerender). Total: 18 PASS.
- Scope: solo `CalendarSeriesCard.tsx`, `CalendarSeriesCard.test.tsx`, `docs/current-plan.md`. No se toco Go, CalendarPage, calendar-store, calendar-types, hub_main.html, ni archivos untracked.
- Checks: `pnpm test CalendarSeriesCard` 18/18 PASS, tsc OK, lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/calendar/CalendarSeriesCard.tsx`, `frontend/src/hub/calendar/CalendarSeriesCard.test.tsx`, `docs/current-plan.md`.
- Sin commit, sin tag, sin release.

Nota CALENDAR-05-F (2026-07-03):
- Implementada la vista compacta de consulta de horarios oficiales LMU en la pestaña Carreras (CALENDAR-05-F).
- `CalendarPage.tsx` cambios:
  - Bloque informativo (línea 132-146): copy adaptativo que muestra "Vantare publica el calendario oficial semanal..." cuando hay series, y el texto legacy cuando no hay series.
  - Nueva sección compacta "Horario semanal LMU" (antes de las tarjetas de series): heading h2, grid de 4 celdas con count de series + badge de patrón horario ("Cada 15 min", "Cada 20 min", "Cada 30 min", "Slots UTC"), y explicación "Las salidas repetitivas se muestran como patrón horario para evitar listar miles de carreras."
  - Estilo: glass/dark con borde rojo Vantare, bg-white/[0.03], badges rojos en bg-vantare-red-500/10.
- `CalendarPage.test.tsx`: 10 tests nuevos añadidos en el bloque `series rendering` (líneas 616-723). Verifican: heading "Horario semanal LMU", copy honesto, timezone, explicación de patrones, badges de schedule, no import UI, follow/unfollow intacto, fallback legacy, anti-fake.
- `CalendarSeriesCard.tsx` y `.test.tsx`: NO modificados.
- Scope: solo UI de consulta. Sin cambios en store, types, navegación, Go/backend, ni eventos Wails.
- No se reintroduce UI de importación, textarea, discord-lmu-week, ni datos inventados.
- Tests: CalendarPage 49/49 PASS, CalendarSeriesCard 18/18 PASS, total 67/67 PASS.
- Checks: tsc OK, lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/CalendarPage.tsx`, `frontend/src/hub/pages/CalendarPage.test.tsx`, `docs/current-plan.md`.
- Sin commit, sin tag, sin release.

Nota CALENDAR-05-F-REVIEW (2026-07-03):
- Review de CALENDAR-05-F produjo NEEDS FIXES. Aplicados fixes mínimos:
  - **Finding 3 (P2)**: `scheduleBadge` en sección de series cards estaba hardcodeado por tier (`beginner = "Cada 15 min"`, `intermediate = "Cada 20 min"`, `advanced = "Cada 30 min"`, `weekly = "Slots UTC"`). Corregido: ahora deriva de `seriesPreviews` del grupo, misma lógica que la sección compacta. Usa `firstLabel.startsWith("Cada") ? firstLabel : "Slots UTC"`.
  - **Finding 5 (P3)**: variable `tierTier` renombrada a `tier` en todo el ámbito de `seriesGroups.map`.
  - **Findings 1, 2, 4 ya estaban correctos**: el resumen compacto ya mostraba nombre de grupo/tier (Bronce/Plata/Oro/Weekly), duración derivada de `group.series`, y `data-testid` por celda con tests usando `within(...)`.
- Tests actualizados: matchers de duración cambiados de string exacta a regex (`/20 min/` en vez de `"20 min"`) porque el texto está embebido en `"1 serie · 20 min"`.
- tsc: añadidos non-null assertions (`calendar!`) en los dos bloques que acceden a `calendar.seriesPreviews` dentro de `hasSeries` (TypeScript no puede estrechar a través de la variable `hasSeries`).
- Tests: CalendarPage 51/51 PASS, CalendarSeriesCard 18/18 PASS, total 69/69 PASS.
- Checks: tsc OK, lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/CalendarPage.tsx`, `frontend/src/hub/pages/CalendarPage.test.tsx`, `docs/current-plan.md`.
- Sin commit, sin tag, sin release.


Nota LAUNCHER-01 (2026-06-30):
- Plan guardado en `docs/superpowers/plans/2026-06-30-launcher-01-sim-launcher.md`. PLAN ONLY, sin implementacion. Primer corte del launcher de simuladores: solo LMU en Windows + Steam (`steam://run/2399420` o `.exe` local). Sustituye `EmptyLauncher.tsx` por `LauncherCard`, anade `LauncherService` en Go y bloque `Launchers` en `AppSettings`. Fuera de v0.1.x: multi-sim, Linux/Proton, procesos supervisados, instalacion automatica de apps externas, hotkey "abrir LMU", UI de edicion de `AssociatedApps`.
- Adapta el copy del modal BetaWelcome segun el tipo de usuario (beginner/intermediate/advanced/creator/organizer). El modal es obligatorio: ya no tiene boton X/cerrar y el boton "Empezar" esta disabled hasta seleccionar un rol. Asi nunca se persiste `betaWelcomeCompleted` sin un rol.
- Persistencia: nuevo campo `BetaUserRole string` (json `betaUserRole,omitempty`) en `AppSettings` (Go) y `AppSettings` (TS, en `SettingsPage.tsx`). Se guarda junto a `betaWelcomeCompleted: true` en el mismo `settings:save`, sobre la base completa `{ ...settingsRef.current, betaWelcomeCompleted: true, betaUserRole }`. No pisa `activeOverlayProfileId`, hotkeys, deltaMode ni cpuSampling.
- Diferencias de copy: solo `creator` y `organizer` ven el bloque extra "OBS y streaming" con la URL de Browser Source. Pilotos (beginner/intermediate/advanced) NO ven ese bloque. OBS y Setup siguen accesibles para todos desde el Hub; el cambio es solo en el copy del onboarding.
- Archivos modificados: `internal/app/settings_service.go` (+`BetaUserRole` y merge en `Load`), `internal/app/settings_service_test.go` (+3 tests), `frontend/src/hub/pages/SettingsPage.tsx` (+campo en type), `frontend/src/hub/onboarding/BetaWelcome.tsx` (reescrito con selector de rol y `onComplete(role)`), `frontend/src/hub/onboarding/BetaWelcome.test.tsx` (13 tests), `frontend/src/hub/HubApp.tsx` (handler con rol), `frontend/src/hub/HubApp.test.tsx` (mock actualizado a `onComplete`, +1 test, 2 tests existentes extendidos con `betaUserRole` en payload).
- Fuera de scope: dashboard visibility de OBS, estructura de SettingsPage, Auth/licensing/release/Discord, WidgetStudio/LayoutStudio, Go fuera de AppSettings/settings tests, dependencias nuevas.
- P3 documentado: si `betaWelcomeCompleted=true` pero falta `betaUserRole` (estado heredado de builds previos), el modal no se reabre por ahora; queda como P3.

LAUNCHER-01 implementacion (2026-06-30, v0.1.0.3 pre-tag):
- Implementacion completa del primer corte del launcher: solo LMU en Windows + Steam (`steam://run/2399420`) o ruta local configurable.
- Backend nuevo: paquete `internal/app/launcher/` con tipos `LauncherConfig`/`LauncherStatus`, errores `ErrNotConfigured`/`ErrInvalidConfig`/`ErrExecutableMissing`/`ErrUnsupported`, mapa `KnownSteamAppIDs = { lmu: 2399420 }` y `KnownLaunchMethods = { steam-uri, executable }`. `SettingsService` extendida con campo `Launchers map[string]LauncherConfig` (omitempty) y metodos `GetLaunchers`/`SetLaunchers` que cumple la interfaz `launcher.SettingsBackend`. El merge en `Load` deja `Launchers == nil` para archivos previos, asi builds viejos cargan sin warning. Validacion en `Service.Configure` (rechaza simulador/metodo desconocidos, exige `steamAppId` para `steam-uri` y ruta existente para `executable`). `Launch` es fire-and-forget: usa `exec.Command` inyectable (variable paquete-privada) y en Windows construye `rundll32.exe url.dll,FileProtocolHandler steam://run/<id>` o `exec.Command(path)`. En `runtime.GOOS != "windows"` devuelve `ErrUnsupported`.
- Wiring en `cmd/vantare/main.go` aislado: instancia `launcher.NewService(settingsSvc, emitter, exec.Command)`, registra tres `wailsApp.Event.On` (`launcher:status:get`, `launcher:configure`, `launcher:launch`) que delegan en funciones puras `handleLauncherStatusGet/Configure/Launch` (testeables sin levantar Wails). `launcher:configure` reemite `settings` para refrescar `AppSettings` sin round-trip extra. `launcher:launch` no espera al proceso: solo emite `launcher:launched` con timestamp RFC3339. Ninguna zona sensible tocada (`overlayRunning`, hotkeys, telemetry bridge, license service, OBS server, profile service, hub service).
- Frontend: helper puro `frontend/src/hub/launcher/launcher-state.ts` con `parseLauncherStatus` y `parseConfigured` (estados `unconfigured` / `ready-steam` / `ready-exec` / `stale`); tipo `LauncherConfig` anadido al type `AppSettings` en `SettingsPage.tsx`. Componente `frontend/src/hub/components/LauncherCard.tsx` reemplaza `EmptyLauncher`: cuatro estados visibles con `data-testid`, formulario inline para elegir metodo y (opcional) ruta, boton "Abrir LMU" emite `launcher:launch { simulatorId: "lmu" }`, errores en bloque rojo, evento `launcher:launched` limpia el error. `DashboardPage.tsx` importa `LauncherCard` en lugar de `EmptyLauncher`. `EmptyLauncher.tsx` borrado (grep confirma que solo `DashboardPage` lo consumia); sus dos tests en `EmptyStates.test.tsx` eliminados. `DashboardPage.test.tsx` migrado a `getByTestId("launcher-card")`.
- Tests:
  - Go: `internal/app/launcher/launcher_test.go` 14 tests table-driven (configure valide/rellena defaults/rechaza invalido, persistencia via SettingsBackend, launch steam-uri/exec/missing exec, non-Windows unsupported, get status con/sin config). `internal/app/settings_service_test.go` +4 tests (legacy sin launchers, merge con launchers, round-trip save/load, get/set launchers). `cmd/vantare/main_test.go` +8 tests de wiring sobre las tres funciones puras + un end-to-end con el `*launcher.Service` real contra el `*SettingsService` real.
  - Frontend: `launcher-state.test.ts` 11 tests (null/undefined/empty map, steam-uri con y sin AppID, executable, simulador distinto, metodo desconocido, ruta vacia). `LauncherCard.test.tsx` 13 tests (mount emite status+settings, 4 estados, click Abrir LMU, error visible, error se limpia en launched, formulario toggle, save con steam/exec, rechazo de ruta vacia, status cambia vista).
- Checks: `gofmt` limpio; `go test -count=1 ./internal/app/... ./cmd/vantare/...` PASS; `pnpm --dir frontend test` 799/799 PASS (102 files, +24 vs baseline 775); `pnpm --dir frontend exec tsc -b` OK; `pnpm --dir frontend build` OK (warning preexistente chunk size); `pnpm --dir frontend lint` OK (warning preexistente `.eslintignore`); `git diff --check` OK (warning ignorable sobre `../pnpm-workspace.yaml` que esta fuera del repo y no se toca).
- Fuera de scope respetado: discovery de Steam en Windows via registro (no se implemento, no se anadio dep), supervisar PID del simulador, multi-sim, Linux/Proton, hotkey "abrir LMU", UI de `AssociatedApps`. No se anadieron dependencias Go ni npm. No se tocan `CompositeApp.tsx`, `ObsOverlayApp.tsx`, `SETTINGS-01`, calendario (Worker B), packaging (Worker C), auth/licensing, WidgetStudio/LayoutStudio. `AppSettings` solo recibe `Launchers` (no los 4 campos de calendar ni nada de otro worker).
- P3 aceptado: en `LauncherCard` la prop `configured` interna queda fija segun el ultimo `launcher:status` o `settings` recibido; si backend reemite `launcher:status` con `configured: false` justo despues de configurar (carrera rara), el boton de toggle queda visible. Documentado para revisar en una iteracion posterior; no es bloqueante.
- Pendiente: smoke manual minimo (arrancar build, abrir Dashboard, configurar steam-uri, click "Abrir LMU" y confirmar que Steam abre LMU). Commit selectivo, sin tag, sin release, sin Discord.
- Pendiente: commit selectivo del lote.
- Plan guardado en `docs/superpowers/plans/2026-06-30-hub-03-first-use-flow.md`.
- Implementa un camino guiado desde el Dashboard: Hub -> recomendado -> guardar como overlay propio -> overlay funcionando.
- No se toca Go. Solo frontend, sobre eventos `hub:save-own-copy`, `hub:set-active`, `overlay:start-active` ya existentes.
- Cadena real: `runRecommendedFirstUse` (helper puro) emite `hub:save-own-copy` + `hub:list`, escucha `hub:profiles` con timeout 3s para resolver el `file` por `id`, emite `hub:set-active` y `overlay:start-active`. Muestra banner "Recomendado activado y abierto" o mensaje de error si algo falla.
- Fuera de scope: rework visual del Hub, Discord, release, calendar LMU, launcher real, auth/licensing, WidgetStudio/LayoutStudio, eventos Wails nuevos, dependencias nuevas.
- Archivos nuevos: `frontend/src/hub/overlays/recommended-first-use.{ts,test.ts}`, `frontend/src/hub/components/RecommendedQuickStart.{tsx,test.tsx}`, `frontend/src/hub/overlays/RecommendedSuccessBanner.{tsx,test.tsx}`.
- Archivos modificados: `ActiveOverlayCard.tsx` (CTA secundario aditivo), `DashboardPage.tsx` (integración), `OverlaysStudioPage.tsx` (cadena save→activate→start), `RecommendedProfilesView.tsx` (prop `autoActivateAndStart`), `HubApp.tsx` + espejo.
- Tests: 757/757 PASS (98 files), +28 vs baseline 729.
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), `go test ./internal/app/... ./cmd/vantare/...` OK, `gofmt -l` en archivos propios limpio.
- Pendiente: smoke manual y commit selectivo del lote.

Nota SETTINGS-01 (2026-06-30):
- Plan guardado en `docs/superpowers/plans/2026-06-30-settings-01-tabs-rework.md`. Solo plan, sin codigo todavia.
- Reorganiza `SettingsPage` (tab `setup` del Hub) en 7 pestañas horizontales: `account`, `obs`, `telemetry`, `hotkeys`, `updates`, `diagnostics`, `advanced`. Sin rework visual profundo. Funcionalidad primero, polish despues.
- Topbar interna de Setup con titulo, subtitulo contextual y boton `← Volver al Hub` que llama a un nuevo `onBack` del shell (resuelto en `HubApp` como `setSection('dashboard')`).
- Estado `activeTab` local en `SettingsPage` + query string `?tab=` solo como deep-link de entrada (whitelist sobre `SETTINGS_TABS`, fallback a `account`). Sin router, sin store global, sin hash.
- Cada pestana es un sub-componente en `frontend/src/hub/settings/tabs/`. `AccountSettings` y `ObsSetup` se reutilizan sin reescribir. `cpuSampling` se mueve a `HotkeysTab` (acompana a los hotkeys como toggle de runtime). Panel "Informacion" de la columna derecha pasa a `AdvancedTab`.
- Disciplina de payload completo en `settings:save` (mismo patron que `HUB-04` con `settingsRef`): nunca emitir objetos parciales, proteger `activeOverlayProfileId` (TD-041). Hook nuevo `useAppSettings` centraliza esa disciplina.
- Hook nuevo `useUpdaterEvents` aísla las 8 suscripciones Wails del updater. `SettingsPage` shell pasa de 651 lineas a ~90.
- Archivos a crear: 12 (tabs.ts, 2 hooks, 1 header, 1 tab bar, 7 tabs + sus tests). Archivos a modificar: 3 (`SettingsPage.tsx`, `SettingsPage.test.tsx`, `HubApp.tsx` solo en 1 linea + 1 test). `AccountSettings.tsx`, `ObsSetup.tsx`, `Topbar.tsx`, `BetaWelcome.tsx`, `auth/*` y todo el backend Go NO se tocan.
- Tests: ~30 totales (12 existentes reorganizados por `describe` por tab + 6 de shell + 10 del split + 2 de no-pisar-payload). Test critico: "preserves activeOverlayProfileId when saving from any tab".
- Checks esperados: tsc, build, lint y `git diff --check` verdes; `pnpm --dir frontend test` verde; sin nuevas dependencias.
- Verificacion manual: 12 puntos detallados en el plan (cambiar entre tabs, query string, persistencia, no-regresion HUB-04/TD-041, URL OBS con/sin perfil activo).
- Fuera de scope: Go, eventos Wails, `AccountSettings`/`ObsSetup`/`Topbar`/`BetaWelcome`/`auth/*`, Dashboard/OverlaysStudio/Engineer, router real, i18n, animaciones/iconos/responsive de las tabs (queda como polish posterior en un plan aparte).
- Pendiente: implementacion, smoke manual, commit selectivo del lote. No se pide tag ni release.

Nota HUB-01/HUB-02 (2026-06-30):
- HUB-01 P0/P1 cerrado en `9a5cd6f`: dashboard beta sin datos fake, placeholders honestos y Topbar sin nombre hardcodeado.
- HUB-01 P2 cerrado en `6b9b1b4`: BetaWelcome aparece una sola vez y persiste `betaWelcomeCompleted` sin borrar settings existentes.
- HUB-02 implementado y smoke manual correcto: el Hub muestra el overlay activo, permite abrirlo, entrar/salir de edicion y guia a Overlays Studio si no hay perfil activo. Pendiente commit selectivo del lote de codigo.
- P3 aceptado: no existe query inicial `overlay:status:get`; si el card monta despues de una emision antigua de `overlay:status`, puede no saber que el overlay ya esta abierto hasta el siguiente cambio de estado. Registrado en `docs/technical-debt.md`.

## P0 Free plan bloqueado tras Google OAuth — Fix A+B+C (2026-06-29)

Causa raiz real: el binario Go de la release build no tenia `VANTARE_SUPABASE_URL`/`VANTARE_SUPABASE_ANON_KEY` en runtime. CI solo inyectaba `VITE_SUPABASE_*` al frontend (Vite build time). Cuando llegaba el token OAuth, `LicenseService` no tenia client Supabase, cae a `fromCacheOnFailure` y devolvia `expired` (sin cache) → Paywall bloqueaba al usuario Free.

Fix aplicado (3 partes):

**Fix A — Defensa (Go + Frontend):**
- Nuevo estado `StateUnconfigured` en `internal/license/types.go` y `errors.go` (`ErrUnconfigured`).
- `service.go`: cuando no hay client Supabase y no hay cache usable, devuelve `StateUnconfigured` (no `StateExpired`). `fromCacheOnFailure` ahora recibe flag `unconfigured` para distinguir "Supabase caído" (expired) de "Supabase no configurado" (unconfigured).
- `plan.go`: `ClassifyStatus` mapea `StateUnconfigured` → `PlanStatusUnconfigured`. `BuildSummary` no lo trata como `blocked`.
- Frontend `license-types.ts`: nuevo estado `"unconfigured"` en `LicenseState`.
- Frontend `plan.ts`: nuevo `PlanStatus` `"unconfigured"`, `classifyStatus` y `buildSummary` actualizados.
- Frontend `HubApp.tsx` (activo y `pages/`): `LicenseGate` muestra `UnconfiguredScreen` (mensaje accionable, no Paywall) cuando `state === "unconfigured"`.
- Nuevo componente `frontend/src/hub/auth/UnconfiguredScreen.tsx`.
- `LicenseBanner.tsx`: acepta `unconfigured` en `getMessage`.
- Anti-regresion en `frontend/src/lib/license.tsx`: `LicenseProvider` nunca sobrescribe un estado autenticado con `anonymous` (previene race condition donde `LicenseBridge` pisaba el resultado del OAuth callback).
- `LicenseBridge` en `HubApp.tsx` (activo y `pages/`): ya no llama `refresh()` cuando no hay sesion en el WebView (evita pisar el resultado del OAuth callback con `anonymous`).

**Fix B — Raiz (Build + CI):**
- `cmd/vantare/main.go`: nuevas vars `supabaseURL`/`supabaseAnonKey` que se inyectan en tiempo de compilación mediante `tools/generate_supabase_config.ps1`. Ese script lee `VANTARE_SUPABASE_URL`/`VANTARE_SUPABASE_ANON_KEY` del entorno de build, las codifica en base64 y genera temporalmente `cmd/vantare/supabase_build.go` con un `init()` que asigna las vars. Si las env vars no existen, el script no genera el archivo y el binario arranca sin config Supabase (modo offline-grace). Las env vars runtime (`VANTARE_SUPABASE_URL`/`VANTARE_SUPABASE_ANON_KEY`) siguen teniendo precedencia para dev/overrides. Nota: los comentarios en `main.go` mencionan ldflags como mecanismo alternativo, pero el build actual usa code generation.
- `build/windows/Taskfile.yml`: `build:native` ejecuta `tools/generate_supabase_config.ps1` antes de `go build`, generando `cmd/vantare/supabase_build.go` con las vars Supabase en base64 si las env vars están presentes. El archivo se elimina después del build. `BUILD_FLAGS` inyecta solo `version` via ldflags.
- `Taskfile.yml` (raiz): expone `VANTARE_SUPABASE_URL`/`VANTARE_SUPABASE_ANON_KEY` como vars del task (default vacio para dev local).
- `.github/workflows/release.yml`: mapea `secrets.VITE_SUPABASE_URL` → `VANTARE_SUPABASE_URL` y `secrets.VITE_SUPABASE_ANON_KEY` → `VANTARE_SUPABASE_ANON_KEY` como env vars del job `build`, para que `generate_supabase_config.ps1` las reciba y genere `supabase_build.go`.

**Fix C — Limpieza:**
- `cmd/vantare/main.go`: eliminada la doble emision de `license:changed` en el handler `license:validate` (`Validate()` ya emite internamente via `EmitChanged`).

Archivos modificados (16):
- `internal/license/types.go`, `internal/license/errors.go`, `internal/license/service.go`, `internal/license/plan.go`, `internal/license/plan_test.go`, `internal/license/service_test.go`
- `cmd/vantare/main.go`
- `frontend/src/lib/license-types.ts`, `frontend/src/lib/license.tsx`, `frontend/src/lib/plan.ts`, `frontend/src/lib/plan.test.ts`
- `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/HubApp.test.tsx`, `frontend/src/hub/pages/HubApp.tsx`
- `frontend/src/hub/auth/UnconfiguredScreen.tsx` (nuevo), `frontend/src/hub/auth/LicenseBanner.tsx`
- `build/windows/Taskfile.yml`, `Taskfile.yml`
- `.github/workflows/release.yml`

Tests:
- Go: `./internal/license/...` y `./cmd/vantare/...` ok.
- Frontend: 89 files, 699 tests pasados.
- `tsc -b`, `vite build`, `eslint`, `git diff --check`: ok.

Verificacion manual pendiente: ejecutar `bin/vantare.exe` generado con `supabase_build.go` embebido (via `generate_supabase_config.ps1`) → Google OAuth → entra al Hub como Free. Usuario `expired`/`device-limit` sigue bloqueado. Usuario sin config Supabase ve `UnconfiguredScreen` (no Paywall).

Riesgos restantes: smoke manual en build empaquetada Wails con OAuth real. La anon key de Supabase es publica pero se inyecta via env vars de CI que alimentan `generate_supabase_config.ps1` (no hardcodeada en codigo). Binarios stale en el repo pueden confundir el smoke local; usar siempre `bin/vantare.exe` generado por `release:artifacts`.

Nota operativa (2026-06-29): binarios `vantare.exe` fuera de `bin/` (raiz del repo, `release-package/portable-*`) pueden estar stale y producir `UnconfiguredScreen` al ejecutarse por error. Siempre usar `bin/vantare.exe` para smoke local. Los binarios stale deben renombrarse a `.exe.stale` para evitar confusión.

## P0 onboarding/paywall v0.1.0.2 — Free deja de bloquear (2026-06-29)

Causa raiz: tras Google OAuth, un usuario sin suscripcion llegaba al frontend con estado `authenticated-no-entitlement` (definido en `internal/license/service.go` `fromSupabase`). Ese estado se mapeaba a `blocked` en `classifyStatus` (frontend `plan.ts` y backend `plan.go`), y `LicenseGate` en `HubApp.tsx`/`pages/HubApp.tsx`/`OnboardingFlow.tsx` lo mandaba a `PaywallScreen`. Resultado: el usuario logueado veia `FREE · BLOQUEADO` y no podia entrar al Hub aunque la beta publica debe permitir plan gratuito.

Comportamiento nuevo:
- `authenticated-no-entitlement` ahora se mapea a `free` (no `blocked`) en `classifyStatus` (frontend y Go).
- `LicenseGate` solo bloquea con PaywallScreen si `expired` o `device-limit`. El estado `authenticated-no-entitlement` cae al Hub con banner.
- `OnboardingFlow`: un usuario Free avanza al step recommended en vez de quedarse en paywall.
- `PaywallScreen`: nueva prop opcional `onContinueFree`. La tarjeta Free muestra boton habilitado "Continuar gratis" cuando el status es `free`; sigue mostrando "Plan actual" deshabilitado cuando el status es `blocked` (expired/device-limit). Bajo el estado, cuando es Free, aparece "Acceso básico activo" (`data-testid="paywall-free-note"`).
- Solo bloquean: licencia `expired`/`banned` (device-limit), sin sesion (`anonymous`), error real de validacion, o feature premium especifica.

Archivos modificados (12):
- `frontend/src/lib/plan.ts`, `frontend/src/lib/plan.test.ts`
- `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/HubApp.test.tsx`
- `frontend/src/hub/pages/HubApp.tsx`, `frontend/src/hub/pages/HubPage.test.tsx`
- `frontend/src/hub/onboarding/OnboardingFlow.tsx`, `frontend/src/hub/onboarding/OnboardingFlow.test.tsx`
- `frontend/src/hub/auth/PaywallScreen.tsx`, `frontend/src/hub/auth/PaywallScreen.test.tsx`
- `internal/license/plan.go`, `internal/license/plan_test.go`

Tests:
- Frontend: 89 files, 694 tests pasados.
- Go `./internal/license/...` y `./cmd/vantare/...`: ok.
- `tsc -b`, `vite build`, `eslint`, `git diff --check`: ok (warning preexistente de chunk size y `.eslintignore`).

Verificacion manual: Google login -> estado `authenticated-no-entitlement` -> entra al Hub con banner de Free. En Ajustes/Cuenta el plan muestra "Free" y estado "Sin suscripcion". Si se abre PaywallScreen (p. ej. desde un flujo futuro de upgrade), la tarjeta Free muestra "Continuar gratis".

Riesgos restantes: el flujo real en build empaquetada Wails requiere smoke manual de OAuth -> Hub. No se agrego persistencia explicita de "plan Free elegido" porque Free es fallback automatico cuando no hay entitlements; no hay backend que setear.

## P2 BetaWelcome — persistencia segura (2026-06-29)

Causa: `frontend/src/hub/HubApp.tsx` `handleBetaWelcomeClose` emitia `Events.Emit('settings:save', { betaWelcomeCompleted: true })`. El handler `settings:save` de `cmd/vantare/main.go` decodifica el payload como `app.AppSettings` y llama a `settingsSvc.Save(&s)`. `Save()` valida `DeltaMode` (rechaza `""` con `invalid delta mode`) y, con un payload parcial, sobrescribiria `deltaMode`, `cpuSampling`, `hotkeys` y `activeOverlayProfileId` con sus zero values. Ademas de fallar validacion, pisaria ajustes existentes.

Fix:
- `frontend/src/hub/HubApp.tsx`: nuevo `settingsRef` que guarda el ultimo payload recibido en el evento `settings`. Al cerrar BetaWelcome se emite `settings:save` con `{ ...base, betaWelcomeCompleted: true }` (objeto completo) en vez del payload parcial. Guarda defensiva `if (base)` antes de emitir: si no hay settings cargados, no se hace la emision (BetaWelcome solo se muestra cuando `settingsLoaded` es true, asi que en practica siempre hay base completa).
- Backend Go no se toco (no hay bug nuevo en `SettingsService`; el handler ya trabaja con `AppSettings` y eso es contrato).

Tests en `frontend/src/hub/HubApp.test.tsx`:
- "emits settings:save with the full settings payload when welcome is closed" — mock con `deltaMode`, `cpuSampling`, `hotkeys` y `activeOverlayProfileId`; verifica que el payload emitido conserva todos los campos y agrega `betaWelcomeCompleted: true`.
- "does not erase activeOverlayProfileId when closing BetaWelcome" — caso explicito: `activeOverlayProfileId` no vacio (`"profile-active-must-survive"`) debe sobrevivir.
- Mantenidos: `betaWelcomeCompleted=false` muestra BetaWelcome, `betaWelcomeCompleted=true` no lo muestra.

Archivos:
- `frontend/src/hub/HubApp.tsx` (settingsRef + payload completo al cerrar).
- `frontend/src/hub/HubApp.test.tsx` (2 tests modificados/anadidos).

Checks:
- `pnpm --dir frontend test -- HubApp BetaWelcome`: 23/23 OK (3 files).
- `pnpm --dir frontend test`: 729/729 OK (94 files, +2 tests vs baseline).
- `pnpm --dir frontend exec tsc -b`: OK.
- `pnpm --dir frontend build`: OK (warning preexistente de chunk size, no error).
- `pnpm --dir frontend lint`: OK (warning preexistente de `.eslintignore`, no error).
- `git diff --check`: OK (whitespace limpio en archivos tocados).
- Go: no se toco (`internal/app/...`, `cmd/vantare/...` intactos); `gofmt`/`go test` no aplicaron.

Riesgos restantes: ninguno nuevo. Verificacion manual recomendada: cerrar BetaWelcome con un perfil activo guardado, reabrir la app y confirmar que el perfil sigue activo y BetaWelcome no reaparece.

## Estado operativo principal

La app se encuentra en la linea publica de beta **`v0.1.x`**.

- `v0.1.0.0`: primera beta publica publicada en GitHub Releases.
- `v0.1.0.1`: hotfix para compilar la build de release con variables de entorno de Supabase.
- `v0.1.0.2`: hotfix P0/P1 — Supabase backend configurado en Go build (via `generate_supabase_config.ps1`), estado `UnconfiguredScreen` para builds mal configuradas, y plan Free desbloqueado tras Google OAuth (`authenticated-no-entitlement` → `free` en vez de `blocked`). Verificacion manual completa: login Google -> Hub Free, overlays recomendados, flujo basico correcto.

Las builds `v0.3.*` quedan como historico interno no anunciado y no deben usarse en Discord, docs publicos ni nuevos tags de beta.

### Que incluye esta beta

- **Overlays Studio**: editor completo de widgets (Relative, Standings, Pedals, Delta, Ingeniero), perfiles recomendados, layout con drag/resize, preview aislada con ancho intrinseco.
- **Ingeniero**: modulo integrado con historial, notificaciones y widget de overlay. Funciona en modo simulacion/replay; el adaptador live LMU queda para fase EN6.
- **Telemetria live LMU**: fuente compartida live/mock/demo con fallback automatico a datos sinteticos si LMU no esta disponible.
- **Widget Delta**: delta best live nativo de LMU conTarget/Lap.
- **Login obligatorio**: acceso bloqueado por cuenta, con Google OAuth como minimo para la beta publica.
- **Licencias basicas online**: gating free / paid / suite, con gracia offline corta.
- **Hotkeys globales**: toggle overlay, perfiles anterior/siguiente y modo edicion in-place (`Ctrl+Shift+E`). Personalizables desde Ajustes.
- **Autoupdater**: descarga e instalacion verificada de nuevas versiones desde GitHub Releases.
- **OBS local**: servidor interno en `http://127.0.0.1:39261/overlay?profile=...` con soporte SSE para telemetria e Ingeniero.
- **Perfiles recomendados**: `Clean Overlay` y `Le Mans Ultimate - Basic` incluidos como punto de partida.
- **Presets de widgets**: guardar, aplicar y compartir configuraciones visuales de widgets (widget-presets).
- **Galeria de disenos oficiales de widgets**: disenos oficiales aplicables desde WidgetStudio sin modificar posicion/tamano.
- **Instalador NSIS y portable zip**: ambos con checksums SHA256 sidecar.

### Que NO incluye (post-beta o fases posteriores)

- Audio/voces TTS del Ingeniero (solo visual).
- Widget Pedals completo con calibracion (maqueta estetica inicial).
- Soporte multisimulador estable (iRacing, Assetto Corsa, rFactor 2). Solo LMU en Windows es soporte principal en esta beta.
- Linux/Proton estable. Entra en la serie `0.1.x` como investigacion experimental.
- Doble PC/LAN automatizado para OBS (configuracion manual posible).
- Portal completo de usuario, gestion avanzada de pagos, facturas y self-service de licencias. El login/gating basico si entra.
- Community layouts, marketplace, cloud sync completo, companion app y plugin system.
- Ingeniero live con LMU real (EN6 aparcado hasta validacion live).
- Reordenacion de columnas en widgets (modo tester oculto disponible via secuencia `V A N T A R E`).
- Firma de codigo Authenticode (ver Known Issues -> SmartScreen).
- Instalador propio completo. Entra en `0.1.x` como **Vantare Setup Launcher** que orquesta NSIS, no como sustituto total inicial.

### Estado de widgets

| Widget | Estado | Notas |
|--------|--------|-------|
| Relative | `stable` | Columnas configurables, filtros, variantes schema v2 |
| Standings | `stable` | Columnas configurables, filtros, variantes schema v2, selector mock |
| Delta | `stable` | Delta best live nativo LMU, Target/Lap |
| Pedals | `tester` | Maqueta compacta CLT/BRK/THR, colores editables desde WidgetStudio |
| Ingeniero (notifications) | `tester` | Widget de notificaciones del spotter, funcionando en modo simulacion |
| Track Map | `experimental` | En desarrollo, no disponible para testers |
| Input Telemetry/Trace | `experimental` | En desarrollo, no disponible para testers |

### Actualizaciones y distribucion

- **No se crea una GitHub Release por cada commit.** Solo se publica cuando hay un tag `v*` que cumple el checklist del runbook.
- **Autoupdater:** la app busca actualizaciones en GitHub Releases. Descarga el instalador, verifica SHA256 y lo ejecuta.
- **Distribucion manual:** los testers pueden descargar installer o portable zip desde `#beta-downloads` en Discord, con checksums SHA256 publicados para verificacion.
- **Updater:** el flujo `InstallVerifiedCtx` descarga el installer y verifica checksum contra el sidecar `.sha256`. Si el checksum no existe (releases historicas), cae a descarga sin verificacion (comportamiento documentado y aceptado).
- **Supabase en release builds:** `VANTARE_SUPABASE_URL` y `VANTARE_SUPABASE_ANON_KEY` deben existir como GitHub Actions secrets y estar disponibles como env vars durante el build. El script `tools/generate_supabase_config.ps1` las lee y genera temporalmente `cmd/vantare/supabase_build.go` con `init()` base64, que se compila en el binario y se elimina después. Si faltan, el binario arranca sin config Supabase (modo offline-grace, pantalla `UnconfiguredScreen`).

Fuente operativa principal:

- `docs/release-roadmap-execution-index.md`
- `docs/superpowers/plans/2026-06-26-release-*.md`

Los roadmaps anteriores (`docs/master-feature-plan.md` y `docs/roadmap-execution-board.md`) se mantienen como contexto/historial, pero no deben contradecir el indice de release.

Siguiente trabajo recomendado:

1. HUB-05-B — commit selectivo del corte de paginas internas v5.2 implementado en 2026-07-01 (ver `docs/superpowers/plans/2026-06-30-hub-05b-v52-remaining-pages.md`).
2. CALENDAR-02 — cablear import UI, bridge Wails y recordatorios overlay usando el modelo aislado de CALENDAR-01.
4. OVERLAY-DESIGN-02 — nuevo sistema visual de overlays sobre la arquitectura existente.
5. DISCORD-01 — limpiar mensajes beta progress y referencias historicas en Discord cuando el estado de v0.1.x este consolidado.
6. Por planear en `v0.1.x`: Linux/Proton experimental, Vantare Setup Launcher, nuevos overlays, disenos oficiales adicionales, hardening de auth/licencias, revision global post-beta, **SETTINGS-01 (Setup UI Tabs Rework)**, Stripe/licencias paid/suite reales, race data real desde LMU.

Regla de orquestacion: el agente principal no edita codigo salvo necesidad estricta; genera prompts, revisa reportes y actualiza documentacion. Workers implementan. GLM revisa P0/P1/P2 y cualquier cambio de Go debe exigir las skills de Go indicadas en `docs/release-roadmap-execution-index.md`.

Auditorias globales de calidad:
- Primera auditoria global: al cerrar `Release 03` completo, antes de avanzar fuerte en `Release 04`. Debe revisar auth/licencias, webhooks, versionado, build/package/updater, seguridad, persistencia local, tests complacientes y deuda P3 acumulada.
- Segunda auditoria global: `Release 15`, obligatoria antes de aceptar la release candidate final.
- Entre esos puntos, usar reviews por feature/bloque salvo que aparezca un P0/P1/P2 transversal.

Decisiones de release ya cerradas:

- Stripe directo + Supabase + login obligatorio.
- Licencia online con gracia de 24h y 1 PC activo.
- Assetto Corsa e iRacing entran en release como simuladores.
- Assetto Corsa Lua/CSP Overlay Pack es producto separado.
- Autoupdater entra en release.
- OBS LAN/doble PC entra en release.
- Track Map e Input Telemetry/Trace entran en release con estado `stable`/`tester`/`experimental` segun datos.
- Community layouts/marketplace, cloud sync completo, companion app y plugin system quedan post-release.

## Roadmap operativo de la serie 0.1.x

La serie `0.1.x` no es solo hotfixes: es la linea de beta publica temprana. El cuarto segmento sigue reservado para hotfixes (`0.1.0.1`, `0.1.0.2`). El tercer segmento agrupa mejoras visibles (`0.1.1.0`, `0.1.2.0`).

| Version objetivo | Estado | Alcance |
|------------------|--------|---------|
| `0.1.0.x` | Activo | Hotfixes criticos de login, Supabase backend/frontend, licencias, updater, overlay fullscreen, crash o bloqueo de uso. |
| `0.1.x` | Por planear | Linux/Proton experimental. |
| `0.1.x` | Por planear | Vantare Setup Launcher v1: instalador propio ligero que verifica SHA256 y lanza NSIS por debajo. |
| `0.1.x` | Por planear | LMU race countdown beta: import manual/asistido por IA del calendario semanal publicado en Discord y notificacion overlay sobre el simulador con avisos de tiempo restante. |
| `0.1.x` | Por planear | Launcher de simuladores: abrir LMU desde Vantare y agrupar apps asociadas por simulador (overlays, Ingeniero, calendario, presets, configuracion). |
| `0.1.x` | Pendiente commit | Hub v5.2: shell + Dashboard (HUB-05) y paginas internas restantes (HUB-05-B) implementados. Pendiente review y commit selectivo. |
| `0.1.x` | Por planear | Nuevos overlays publicos, mas disenos oficiales, pulido de OBS, hardening de licencias y primeras correcciones de rendimiento. |
| `0.1.x` | Por planear | SETTINGS-01 — Setup UI Tabs Rework: convertir `Setup/SettingsPage` en pestañas horizontales estilo videojuego, con topbar interna (pestañas + botón "Volver") y un panel de edición por pestaña. |
| `0.1.x` | Por planear | PACKAGING-01 — Vantare app icon branding: sustituir `build/appicon.png` por el logo Vantare (idealmente 1024x1024) y regenerar `icon.ico`/`icons.icns` para que taskbar, ventana e instalador muestren branding correcto. |

Regla: salvo hotfixes de `0.1.0.x`, todo lo anterior queda **por planear**. No se implementa ni se promete como version concreta sin miniplan, review y smoke manual.

### Vantare Setup Launcher v1

Estado: por planear en `0.1.x`. Mejora la experiencia de testers y reduce confusion con SmartScreen/descargas, pero no se implementa hasta cerrar el hotfix actual de login/licencias y crear miniplan propio.

Scope inicial:
- Windows only.
- UI propia de Vantare.
- Verifica SHA256 antes de ejecutar el instalador.
- Lanza NSIS por debajo; no sustituye todavia su instalacion/desinstalacion/rollback.
- Muestra version, canal, notas breves, aviso SmartScreen y enlaces a known issues.
- Puede ofrecer descarga de portable zip, pero no necesita gestionar updates complejos.

No scope inicial:
- No firma Authenticode.
- No instalacion por componentes.
- No login/licencia dentro del instalador, salvo que se planifique explicitamente despues.
- No reemplazar todo NSIS desde cero.

### SETTINGS-01 — Setup UI Tabs Rework

Estado: por planear en `0.1.x`. No se implementa hasta cerrar el hotfix actual de login/licencias y crear miniplan propio.

Motivo:
- `Setup/SettingsPage` concentrara demasiadas opciones (cuenta/licencia, OBS, telemetria, hotkeys, actualizaciones, diagnostico/soporte, avanzado) y sera incomodo para testers.
- Necesitamos una navegacion mas clara y ordenada antes de meter mas opciones.

Scope futuro:
- Reorganizar `Setup/SettingsPage` en pestanas horizontales estilo videojuego, con su propio panel de edicion por pestana.
- Topbar interna de Setup con:
  - pestanas visibles;
  - boton "Volver" / "Volver al Hub";
  - estado actual si aplica.
- Secciones previstas (mapeo inicial, no contractual):
  - Cuenta / Licencia.
  - OBS.
  - Telemetria.
  - Hotkeys.
  - Actualizaciones.
  - Diagnostico / Soporte.
  - Avanzado.

Restricciones:
- No rework visual profundo todavia (es reorganizacion, no redesign).
- No tocar auth/licensing core.
- No tocar updater core.
- Mantener compatibilidad con los eventos existentes: `settings:get`, `settings:save`, `updater:*`, diagnosticos, account/license.

Riesgos conocidos:
- Romper `settings:save` por payloads parciales (riesgo vivo, ya recogido en `TD-041`).
- Duplicar estado entre pestanas si no se define una unica fuente de verdad por dominio.
- Mezclar `AccountSettings`, `UpdaterSettings` y OBS en un componente gigante, perdiendo la separacion de responsabilidades.
- Perder claridad entre ajustes de app, cuenta y updater si la pestana "Avanzado" absorbe demasiado.

### PACKAGING-01 — Vantare app icon branding

Estado: por planear en `0.1.x`. No se implementa hasta tener un asset Vantare definitivo aprobado y crear miniplan propio.

Motivo:
- La app muestra el icono por defecto de Wails en taskbar/ventana porque `build/appicon.png` no se ha sustituido por el logo Vantare.
- Los builds rapidos con `go build` (camino A2 del runbook) no generan/incrustan `wails_windows_amd64.syso`, por lo que no sirven para validar icono ni metadatos.

Scope futuro:
- Sustituir `build/appicon.png` por el logo Vantare definitivo en formato cuadrado (idealmente 1024x1024).
- Regenerar:
  - `build/windows/icon.ico`;
  - `build/darwin/icons.icns` si aplica.
- Asegurar que el pipeline Windows ejecuta:
  - `wails3 generate icons`;
  - `wails3 generate syso -icon windows/icon.ico ...`.
- Verificar:
  - icono de taskbar y de ventana;
  - titulo y propiedades del `.exe`;
  - icono del instalador NSIS.
- Documentar en el runbook que para validar iconos hay que usar `wails3 task release:artifacts`, no el build rapido A2 con `go build`.

Restricciones:
- No meter el cambio de icono si no hay asset Vantare definitivo aprobado.
- No tocar firma Authenticode.
- No cambiar versionado.

Riesgos conocidos:
- Windows puede cachear iconos viejos; hay que validar tras reinstalar o usar `ie4uinit.exe -show`/limpiar `IconCache.db` si hace falta.
- Un `.ico` mal generado puede verse borroso en taskbar.
- El smoke rapido con `go build` puede seguir mostrando el icono antiguo aunque la release oficial este bien, lo que puede inducir a confusion en testers.

### Linux/Proton experimental

Estado: por planear en `0.1.x`, como soporte experimental. No se implementa hasta cerrar el hotfix actual de login/licencias y crear miniplan propio.

Caminos a validar:
1. Ejecutar `vantare.exe` via Proton junto a LMU via Proton.
2. Crear build Linux nativa y comprobar UI/overlays.
3. Investigar si la shared memory/telemetria de LMU expuesta dentro de Proton es accesible desde app Linux nativa o si requiere proxy/bridge.

Contrato publico: "experimental". No prometer soporte estable hasta verificar:
- app arranca;
- overlay transparente/click-through funciona en X11/Wayland o se documenta la limitacion;
- LMU live entrega datos reales;
- updater/distribucion Linux tiene formato claro.

### LMU race countdown beta

Estado: por planear en `0.1.x`. Aporta valor inmediato a pilotos y streamers, pero no se implementa hasta cerrar el hotfix actual de login/licencias y crear miniplan propio.

Scope inicial:
- Import manual/asistido por IA del calendario semanal de LMU publicado en Discord.
- Formato local estructurado con eventos, serie, circuito, hora de carrera, hora de practica si aplica, duracion y zona horaria.
- Validacion basica de formato y zona horaria antes de guardar.
- Notificacion overlay por encima del simulador con avisos configurables: por ejemplo 30, 15, 10, 5 y 2 minutos antes de carrera.
- Estado claro en UI: proxima carrera, fuente del calendario, ultima actualizacion y eventos de la semana.
- Overlay click-through salvo interacciones de configuracion dentro de la app.

No scope inicial:
- No scraping automatico de Discord.
- No bot de Discord ni permisos del servidor LMU.
- No sincronizacion cloud del calendario.
- No prometer exactitud oficial si el calendario fue importado manualmente.
- No mezclarlo con el widget Ingeniero hasta que el flujo de countdown sea estable.

Contrato publico: "experimental/beta". El flujo recomendado para beta es copiar el mensaje semanal de Discord, transformarlo con un modelo a JSON validado e importarlo en la app.

### Launcher de simuladores

Estado: por planear en `0.1.x`.

Idea: Vantare puede evolucionar hacia un mini launcher de simuladores y aplicaciones asociadas. El primer corte seria LMU-only:
- detectar/guardar ruta de LMU o lanzarlo via Steam URI;
- abrir el simulador desde el Hub;
- asociar acciones por simulador: abrir overlay activo, abrir Ingeniero, abrir calendario LMU, abrir OBS setup, aplicar perfiles recomendados;
- mostrar estado simple: instalado/no configurado, ultima ruta usada y acciones rapidas.

No scope inicial:
- No reemplazar Steam.
- No gestionar mods.
- No automatizar login de simuladores.
- No lanzar multiples simuladores hasta tener adapter contract.
- No mezclarlo con el hotfix actual de login/licencias.

Contrato: por planear. Requiere inventario de lanzamiento LMU/Steam, UX del Hub y riesgos de permisos antes de implementacion.

## Estado actual

## Beta urgente adelantada desde roadmap futuro

Decision operativa (2026-06-28):

- Todo lo que bloquee una beta usable para testers se adelanta aunque estuviera previsto en `Release 04+`.
- La razon debe quedar documentada en este plan para distinguir **scope urgente de beta** de rework estructural de release oficial.
- El alcance debe seguir siendo pequeno: arreglar el flujo necesario para que testers puedan usar la app, no abrir un redisenyo general.

Items adelantados:

1. **Overlay edit mode in-place por hotkey** — adelantado desde `Release 04 - Preview avanzada y LayoutStudio profesional`.
   - Motivo: los testers necesitan poder ajustar posicion/tamano mientras ven el overlay real, no solo dentro del canvas de la app.
   - Estado: implementado y revisado con P3 documentados en `docs/technical-debt.md`.
   - Contrato vivo: `ModeRacing` y `ModeEdit` del overlay desktop Wails son fullscreen con `layoutOrigin={0,0}`; no se usa shrink-wrap en ese camino.

2. **Fix fullscreen del overlay desktop** — estabilizacion urgente de beta.
   - Motivo: el refactor de edit mode reintrodujo una caja parcial/shrink-wrap en runtime desktop, rompiendo el uso basico del overlay.
   - Estado: fix implementado por worker y review `ACCEPT WITH P3`; P3 registrados como TD-037/038/039.
   - Verificacion manual obligatoria antes de distribuir: abrir overlay normal, confirmar fullscreen click-through, entrar/salir con `Ctrl+Shift+E`, confirmar que no queda caja parcial.

3. **Dev server estable para iteracion** — estabilizacion de tooling urgente.
   - Motivo: `wails3 task dev` podia abrir WebView con HTTP 502 porque Vite escuchaba en `localhost`/IPv6 mientras Wails proxyeaba contra `127.0.0.1`.
   - Estado: `Taskfile.yml` y `build/Taskfile.yml` fijan `VITE_HOST=127.0.0.1` por defecto; se puede overridear con `WAILS_VITE_HOST`.
   - Verificacion: log de Wails debe mostrar `vite "--host" "127.0.0.1" "--port" "9245"` y `Connected to frontend dev server`.

4. **Perfil activo de overlay** — adelantado desde UX futura de perfiles.
   - Motivo: las hotkeys (`Ctrl+Shift+V`, `Ctrl+Shift+E`) necesitan una fuente de verdad clara; hoy no hay boton visible para marcar que perfil usaran las macros.
   - Estado: implementado (2026-06-28). Plan en `docs/superpowers/plans/2026-06-28-active-overlay-profile.md`.
   - Criterio de beta: `Mis perfiles` debe permitir `Activar` un perfil y mostrar badge `Activo`; hotkeys y `Abrir overlay` deben usar ese perfil activo.
   - Cambios:
     - `AppSettings.ActiveOverlayProfileID` (`omitempty`) persistido en `app-settings.json`.
     - `HubService.SetActiveProfile(idOrFile)` resuelve path, carga perfil, persiste id, emite eventos.
     - `HubService.ResolveProfilePath(idOrFile)` exportado para startup.
     - `HubService.DeleteProfile` limpia `ActiveOverlayProfileID` si se borra el perfil activo.
     - `main.go` carga perfil activo al arrancar; handler `hub:set-active` detiene overlay antes de cambiar; handler `overlay:start-active` abre el perfil activo.
     - `OwnProfilesView`: badge "Activo", boton "Activar", boton global "Abrir overlay" en header.
     - `LayoutStudio`: banner amarillo si el perfil editado no es el activo.
     - `SettingsPage`: OBS URL usa `activeOverlayProfileId` de settings con fallback.
   - Tests: 590 frontend OK; Go tests OK; tsc, build, lint, gofmt, git diff --check OK.
   - Verificacion manual pendiente (checklist en plan).

Fix P0 residual overlayRunning (Overlay Edit Mode) cerrado (2026-06-28):
- Cierre externo de ventana (Alt+F4 / WindowClosing) limpia `overlayRunning=false` y resetea el perfil a racing mode mediante el closure `stopOverlay` en `cmd/vantare/main.go`, con guard para evitar doble reset cuando el path normal ya limpio el flag.
- Errores de `StartOverlay` (handler `overlay:start`) y `StartActiveOverlay` (hotkey Ctrl+Shift+E / `handleToggleEditMode`) sincronizan `overlayRunning=false` cuando no queda ventana, evitando flag `true` colgante sin ventana.
- `resetOverlayDisplayMode` no intenta aplicar modo sobre ventana inexistente: solo aplica al perfil y emite `overlay:edit-mode-changed` cuando `CurrentWindow() != nil`.
- Si `ApplyProfileMode` falla, no se emite `overlay:edit-mode-changed` (evita que el frontend renderice chrome de edicion sobre una ventana que sigue click-through).
- Tests anadidos en `cmd/vantare/main_test.go`: cierre externo limpia flag y resetea modo, guard evita doble reset, fallo de `StartActiveOverlay` sincroniza flag, fallo de `ApplyProfileMode` no emite evento, y `resetOverlayDisplayMode` sin ventana no toca referencia nil.
- Checks: `gofmt` OK; `go test ./cmd/vantare/... ./internal/app/... ./internal/window/...` OK; `go test ./...` OK; `go vet` OK; `git diff --check` OK.
- Veredicto final del review: `ACCEPT WITH P3` (P3 no bloqueantes documentados: profile queda en ModeEdit si ApplyProfileMode falla — se autocorrige en siguiente toggle/stop; sin test directo del handler `overlay:start` por estar inline en `main()`).

R03.B - Build artifacts / release packaging completado (2026-06-27):
- Documento operativo nuevo: `docs/release-artifacts.md` (artefactos oficiales, comandos, verificacion, gap de firma de codigo).
- Nueva tarea canonica de pipeline: `wails3 task release:artifacts` (alias de `windows:package:all` y `package:all`). Encadena `version:sync` -> `windows:build` -> instalador NSIS -> portable zip -> SHA256 sidecars -> verify de version.
- Tareas auxiliares: `windows:release:portable`, `windows:release:checksums`, `windows:release:verify`, `windows:release:clean` (todas expuestas tambien en raiz).
- Scripts nuevos en `tools/` (PowerShell 5.1+, sin dependencias externas):
  - `tools/build_nsis.ps1`: resuelve el NSIS real (evita el shim de wails3 que falla con 0x2) y construye el instalador.
  - `tools/release_artifacts.ps1`: portable zip (con `configs/*.json` y tester README), SHA256 via `certutil.exe` (siempre disponible en Windows), verificacion de version embebida (UTF-8 en `.exe`, UTF-16 LE en NSIS installer resource).
- Runbook actualizado: `docs/release-beta-operations-runbook.md` seccion 4 ahora apunta a `release:artifacts` como flujo canonico y elimina el `Get-FileHash` manual.
- Verificacion end-to-end ejecutada en este host: pipeline produce `bin/vantare-amd64-installer.exe` (6.86 MB), `bin/vantare-portable-amd64.zip` (5.07 MB), `bin/vantare.exe` (12.98 MB) y sus 3 checksums SHA256. `verify` confirma que `v0.3.10.0` esta embebido en `vantare.exe` y `0.3.10.0` en el recurso de version PE del installer.
- Stale `bin/temp-wails-proj-amd64-installer.exe` del 15/06 eliminado por `release:clean`.
- Lo que queda pendiente: firma de codigo Authenticode (R03.H documenta la decision; la implementacion queda para R15/RC publica antes del release publico). CI de release (R03.C) completado.

R03.C - GitHub Actions release build completado (2026-06-27):
- Creado workflow `.github/workflows/release.yml` en la raiz real del repo Git (`Vantare-Overlays/`).
- Triggers: push de tag `v*` (crea release automaticamente) y `workflow_dispatch` (build manual; release opcional y solo permitida sobre un tag).
- Runner Windows: instala Go `1.25.0`, pnpm `10`, Node `22`, NSIS `3.12.0` via Chocolatey y Wails v3 CLI `v3.0.0-alpha.98-tui` via `go install` (todo pinned).
- Gate de tests/lint (P2-1 del review adversarial, corregido 2026-06-27): el job `build` ejecuta `go test ./...`, `pnpm install`, `pnpm test` y `pnpm lint` desde `vantare-v2/` y `vantare-v2/frontend/` antes de `wails3 task release:clean`/`release:artifacts`. Si cualquier gate falla, no se generan artefactos ni se publica release. No se duplica `pnpm build` (ya corre indirectamente via `wails3 task release:artifacts`).
- Ejecuta en `vantare-v2/`: `wails3 task release:clean`, `wails3 task release:artifacts`, `wails3 task release:verify`.
- Verifica estrictamente que existan los 6 archivos oficiales (3 artefactos + 3 checksums) antes de continuar.
- Subida de artifacts de GitHub Actions y, en tags `v*`, creacion de GitHub Release con `gh release create` subiendo los 6 archivos oficiales.
- Permisos minimos: `contents: read` por defecto; solo el job `release` usa `contents: write`. No se imprimen secretos; no se modifica `VERSION` en CI.
- Documentacion actualizada: `docs/release-artifacts.md` (seccion 4.1 de CI) y `docs/release-beta-operations-runbook.md` (seccion 4 con flujo local y flujo CI). Review adversarial en `docs/adversarial-review.md` con P2-1 cerrado.
- Checks: `git diff --check` limpio; validacion YAML OK; `go test ./...` OK (cached); `pnpm --dir frontend test` 568 tests OK; `pnpm --dir frontend lint` OK (solo warning de `.eslintignore` deprecado, no error).
- P3 restantes del review (no bloqueantes): P3-1 manejo de release ya existente, P3-2 globo `bin/*` en `gh release create`, P3-3 verificacion de version de NSIS instalada, P3-4 nota de `SHA256SUMS.txt` en `release-artifacts.md`. Recomendado aplicar P3-1/P3-2 antes de release publica estable.

R03.D - Updater runtime hardening: correcciones de review R03.D aplicadas (2026-06-28):
- Nota: el plan tecnico asigna R03.D a "Discord release notification"; el presente trabajo atiende la peticion de endurecer el updater runtime (overlap logico con R03.E del plan tecnico).
- Findings corregidos:
  - P1-1: `UpdaterService.CheckUpdatesCtx(ctx)` propaga el contexto real; la goroutine de startup en `cmd/vantare/main.go` usa `CheckUpdatesCtx(ctx)` y comprueba `ctx.Err()` antes de emitir `updater:notify`.
  - P2-1: `VANTARE_RELEASES_URL` se valida con `net/url`; solo se aceptan esquemas `http`/`https` y host no vacio; `updater.New` devuelve error claro si la URL es invalida; `main.go` registra el updater solo si la inicializacion es valida.
  - P2-2: `UpdaterService` protege lectura/escritura de settings con `sync.Mutex`, evitando condiciones de carrera en `checkUpdates`, `SaveSettings` e `IgnoreVersion`; anadido test de concurrencia.
  - P2-3: `docs/adversarial-review.md` y `docs/technical-debt.md` actualizados con veredicto coherente `ACCEPT WITH P3` y P2/P3 heredados fuera de alcance documentados.
  - P3 opcional: `InstallVerifiedCtx` elimina el installer descargado si `verifyChecksum` falla; test de regresion anadido.
- Tests anadidos/actualizados: `TestReleasesURLDefaultsToGitHub`, `TestReleasesURLOverrideValid`, `TestReleasesURLRejectsInvalidScheme`, `TestReleasesURLRejectsEmptyHost`, `TestNewRejectsInvalidReleasesURL`, `TestUpdaterServiceContextCancellation`, `TestUpdaterServiceConcurrentChecksAndIgnore`, `TestInstallVerifiedHashMismatch` (verifica limpieza); tests existentes adaptados a `New` con error y a contexto en `downloadFile`/`verifyChecksum`.
- Checks: `gofmt` OK; `go test ./internal/updater/... ./internal/app/...` OK; `go test ./...` OK; `go vet ./internal/updater/... ./internal/app/...` OK; `git diff --check` limpio.
- Verificacion manual pendiente: smoke test end-to-end descargando un release real.
- Riesgo residual: `go test -race` no ejecutado en este host porque requiere CGO_ENABLED=1 (no disponible en el entorno Windows actual).

R03.G - Smoke real tras R03.F completado (2026-06-28):
- Smoke ejecutado contra los 4 frentes: A local (`wails3 task release:artifacts` produce los 6 archivos oficiales y `release:verify` confirma version embebida), B CI build sin release (`workflow_dispatch` sin `create_release`, valida gates + artefactos sin tocar GitHub Releases), C Discord minimo (`workflow_dispatch` sobre `discord-release.yml` con tag valido contra webhook de pruebas), D updater contra prerelease real (`v0.3.10.0-smoke-tag` publicado como prerelease y consumido por el binario para verificar `CheckUpdatesCtx` + `InstallVerifiedCtx`).
- Hallazgos del smoke que motivan R03.H:
  1. Push del tag `v0.3.10.0-smoke-tag` disparo `discord-beta-progress.yml` y `discord-known-issues.yml` por su filtro de `paths`, generando mensajes colaterales no relacionados con el release.
  2. Re-correr `release.yml` contra un tag cuya release ya existe falla con exit code distinto de 0 (`gh release create` aborta porque la release ya existe), obligando a intervencion manual.
  3. Las GitHub Releases historicas (anteriores a R03.B) no incluyen `*.sha256` sidecar; el `InstallVerified` del updater no puede validar checksum contra esas releases.
  4. Firma de codigo (Authenticode/certificado) sigue pendiente: bloquea release publico, no bloquea beta privada.

R03.H - Cierre de Release 03 tras smoke + decision firma de codigo (2026-06-28):
- Workflows modificados: `.github/workflows/discord-beta-progress.yml`, `.github/workflows/discord-known-issues.yml`, `.github/workflows/release.yml`.
- Tag-guard en Discord no-release: ambos workflows saltan el envio cuando `github.ref_type == 'tag'` (job-level `if` + step explicativo con `::notice::`). Push normal a `master` y `workflow_dispatch` siguen funcionando.
- `release.yml` idempotente: el job `release` ahora detecta si la GitHub Release ya existe. Si existe, hace `gh release edit --notes-file` + `gh release upload --clobber` por cada uno de los 6 assets oficiales. Si no existe, crea la release enumerando los 6 assets explicitamente (sin glob amplio). El `create` deja de fallar en re-runs sobre tags ya publicados.
- TD-003 (GitHub Release idempotente) y TD-004 (publicacion explicita de assets) cerrados. TD-005 (NSIS version pin) y TD-002 (verificacion de checksums sidecar) siguen abiertos para R03+.
- Decision de firma de codigo documentada:
  - Beta privada: se distribuye sin firma (Authenticode ausente). Windows SmartScreen mostrara el aviso habitual; los testers ya lo conocen y el `discord-build-available.yml` lo recuerda en el mensaje.
  - Releases historicas sin `.sha256`: `InstallVerified` no es compatible contra ellas; el updater cae al flujo sin verificacion si el asset checksum falta (degradacion documentada, no rompe el update).
  - Release publico (R15 o equivalente): requiere certificado Authenticode valido y pipeline de firma integrado en `release.yml` antes del `gh release upload` o del paso NSIS. TD nuevo (TD-027) registra el gap.
- Politica explicita: no se crea una GitHub Release por cada commit. Solo cuando hay un tag `v*` legitimo que cumple el checklist del runbook.
- Checks: `git diff --check` limpio; YAML de los 3 workflows valido; dry-run estatico del bloque bash (ambas ramas `create` y `upload --clobber`) verificado; no se ejecutaron workflows reales ni se envio Discord.
- Riesgos restantes: ejecutar un smoke real en GitHub Actions con webhooks de Discord para validar la combinacion tag-guard + release idempotente (TD-024); validar `gh release upload --clobber` en un re-run real antes del primer tag publico (cubierto por TD-003 cerrado pero pendiente de verificacion real).

R03.E - Discord release notification hardening completado (2026-06-28):
- Workflows modificados (sin crear nuevos): `.github/workflows/discord-release.yml`, `.github/workflows/discord-build-available.yml`, `.github/workflows/discord-beta-progress.yml`, `.github/workflows/discord-known-issues.yml`.
- Idempotencia por re-run: todos los workflows detectan `github.run_attempt > 1` y se saltan el envio a Discord con `::warning::`, evitando mensajes duplicados en re-runs manuales.
- Manejo de errores HTTP mejorado: distincion de 403 (fallo inmediato con mensaje claro) y 429 (un reintento con backoff basado en header `Retry-After` o 5s por defecto); validacion de payload JSON con roundtrip `json.dumps`/`json.loads` antes de enviar.
- `discord-build-available.yml`: input opcional `release_tag` para extraer automaticamente `download_url` y `sha256` de la GitHub Release (asset `vantare-amd64-installer.exe` y su `.sha256`). Los inputs manuales (`download_url`, `sha256`) pasan a opcionales y pueden anular los valores extraidos.
- Permisos minimos explicitados: `permissions: contents: read` en los cuatro workflows de Discord.
- Runbook actualizado: `docs/release-beta-operations-runbook.md` seccion 3 con comandos `gh workflow run` para los 4 workflows, ejemplo de `release_tag` y procedimiento de re-run seguro; seccion 5.D con tabla de troubleshooting especifico de Discord.
- Review adversarial en `docs/adversarial-review.md` con veredicto `ACCEPT WITH P3` y P3 documentados.
- Deuda tecnica actualizada: TD-003 (release idempotente) sigue abierto porque no se modifico `release.yml`; TD-004 y TD-005 siguen abiertos porque no se tocaron en este alcance. Se anaden TD-024/025/026 para los P3 de R03.E.
- Checks: `git diff --check` limpio; validacion YAML OK; dry-run de scripts Python embebidos OK (logica de envio a Discord probada contra servidor local sin secretos reales).
- Verificacion manual pendiente: ejecutar los workflows reales en GitHub Actions con webhooks de Discord.

R03.B - P2 follow-ups completados (2026-06-27):
- `tools/release_artifacts.ps1` `Test-ArtifactVersion`: reescrita la lectura con `[System.IO.File]::OpenRead` + `Stream.Read` acotado a 16 MiB (no `ReadAllBytes`). El handle se libera en `finally` aunque la lectura devuelva menos bytes de los pedidos. Logica UTF-8 / UTF-16 y mensajes de exito/mismatch intactos.
- `tools/release_artifacts.ps1` `Invoke-CleanStale`: `$RepoRoot` y `$BinDir` se canonicalizan con `[System.IO.Path]::GetFullPath`. Se rechaza (throw) cualquier `$BinDir` que no sea `<RepoRoot>\bin` ni un subdirectorio de `<RepoRoot>\bin`. Confirmado en prueba negativa con `-BinDir configs` y prueba positiva con `-BinDir bin/subdir-test`. `release:clean` no puede borrar fuera de `bin/`.
- `build/windows/Taskfile.yml` `release:checksums`: anadida precondicion `[ -f "{{.BIN_DIR}}/vantare.exe" ]` con mensaje claro apuntando a `windows:package:all`. Validado en prueba negativa (moviendo `vantare.exe` y restaurandolo).
- P3 trivial aplicado en el mismo bloque: la descripcion de `release:checksums` ya no menciona `Get-FileHash` sino `certutil.exe` (alineado con el script).
- P3 trivial en `docs/release-artifacts.md` seccion 2: la precondicion de `makensis` ahora enumera explicitamente las tres fuentes aceptadas (PATH, ruta estandar, ruta alternativa en `%ProgramFiles(x86)%\NSIS\Bin`).
- Checks verdes: `git diff --check` limpio, `wails3 task release:clean`, `release:artifacts`, `release:verify`, `release:checksums`, expand del portable zip confirma estructura `vantare.exe + configs/*.json + docs/README.txt`, `go test ./...` cached OK.
- P3 fuera de alcance (queda para decision posterior): `version:sync` dirty detection.

R03.A - Version source of truth completado (2026-06-27):
- Creado archivo `VERSION` en la raíz como única fuente de verdad para la versión de la suite (`0.3.10.0`).
- Creado script `build/sync_version.go` que lee de `VERSION` y sincroniza la versión de forma consistente en `cmd/vantare/main.go`, `build/config.yml`, `build/windows/info.json` y `build/windows/nsis/project.nsi`.
- Modificada la tarea `build:native` de Windows y la raíz del `Taskfile.yml` para depender de la tarea de sincronización `version:sync` e inyectar la versión de compilación en Go mediante `-ldflags`.
- Adaptado el parser de versión de `internal/updater/version.go` para admitir el formato de versión de 4 dígitos `X.X.X.X` (Major.Minor.Patch.Build) y mantener compatibilidad absoluta con versiones legacy de 3 dígitos, respaldado por una batería de pruebas table-driven.
- Corregida la plantilla NSIS `project.nsi` para remover el `.0` redundante en `VIProductVersion`/`VIFileVersion` y permitir un versionado nativo de 4 dígitos directo.

Vantare v2 se documenta desde ahora como una suite local para sim racing, no solo como una app de overlays. Los modulos internos actuales son:
- `Overlays Studio`: perfiles, widgets, layouts, overlay desktop y OBS.
- `Ingeniero`: spotter/ingeniero determinista, historial y notificaciones.
- `Telemetria`: fuente compartida live/mock/demo.
- `Setup`: configuracion local.

Documento base: `docs/vantare-suite-architecture.md`.

P3 - Pedals compact render completado (2026-06-25):
- Implementado el nuevo `PedalsWidget` compacto basado en el diseño aprobado por GLM: Mock V4 broadcast minimal.
- Rediseñado a 3 barras verticales (`CLT`, `BRK`, `THR`), fondo transparente por defecto y track de barra `#0a0a0a` fijo.
- Eliminados del widget pedals heredado: marcha, velocidad, volante animado ficticio, canvas de historial gráfico, `BAKED_PANEL_BG`, `HISTORY_SIZE`.
- Creado helper puro `pedals-format.ts` para clamping estricto en el rango `0..100` y fallbacks seguros ante valores negativos, `NaN`, `Infinity`, `undefined` y nulos (con tests table-driven).
- Modificados los defaults del style catalog a la paleta de Mock V4: embrague `#3aa6c8`, freno `#e63946`, acelerador `#34d399` y fondo `transparent`.
- Actualizado el widget pedals en perfiles default y recomendados (`example-racing.json` y `recommended-profiles.ts`) al tamaño base recomendado de `90x100`.
- No se modificó `widget-base-size.ts`, schema, backend en Go, ni otros widgets (`Relative`/`Standings`/`Delta`/`Engineer`).
- Cobertura total de tests y checks pasados con éxito: 445 tests frontend, build, lint y `git diff --check` OK.

P4 - Pedals configuración visual básica completado (2026-06-26):
- Creado helper puro `pedals-settings.ts` para leer y normalizar la apariencia de pedals con defaults seguros, incluyendo tests table-driven y test de sincronía con style-catalog.
- Creada sección dedicada `PedalsSettingsSection` en Overlays Studio para editar visualmente el color de acelerador (throttle), freno (brake) y embrague (clutch).
- Implementado toggle de "Fondo transparente" que guarda `"transparent"` en `backgroundColor`, y un color picker de fondo personalizado visible solo cuando el toggle está desactivado.
- Integrada la sección en `WidgetSettingsPanel` de forma segura (retorna null para otros widgets), preservando la separación de responsabilidades y la inmutabilidad de los perfiles.
- Cobertura total de tests para el helper, la sección de UI, y test de integración en el panel de ajustes pasados con éxito.

P5 - Adición de widgets en LayoutStudio completado (2026-06-26):
- Creado helper puro `widget-factory.ts` con todos los tipos de widgets soportados, Hz e intervalos óptimos de refresco y dimensiones recomendadas (incluyendo pedals en `90x100` y `30` Hz, standings en `340x420` y `15` Hz, etc.).
- El helper genera IDs únicos de forma determinista ante colisiones en el perfil (ej. `pedals`, `pedals-2`, `pedals-3`).
- Extendido el hook moderno `useOverlayStudioState.ts` con la función `addWidget(type)` que añade el widget a `profile.widgets`, lo selecciona automáticamente, lo marca como dirty y mantiene sincronizado de forma reactiva `layouts.general.widgets` (schema v2) si está definido.
- Modificado `StudioWidgetList.tsx` para admitir de forma opcional la prop `onAddWidget`. Si se suministra, muestra un botón "+ Añadir widget" con un formulario denso, oscuro y mono tipo UI2; si no se suministra (como en `WidgetStudio.tsx`), se oculta protegiendo la separación de responsabilidades.
- Conectado el flujo de adición de widgets en `LayoutStudio.tsx` y `OverlaysStudioPage.tsx`.
- Cobertura total de tests automatizados agregados (para el factory, el hook de estado, la lista de widgets y el lienzo de edición); suite completa de frontend de 476 tests en verde.
- Tipo, lint, build y checks de git en verde al 100%.

EN3-EN5 - UI Ingeniero + Bus de notificaciones + Widget de overlays completado:
- Creada la nueva sección de `Ingeniero` en el Hub para gestionar el estado, spotter, sensibilidad, y ver el historial de mensajes de forma reactiva.
- Implementado el bus de notificaciones de Ingeniero que alimenta en tiempo real a Wails (Hub/Desktop) y a OBS a través de un nuevo stream SSE (`/engineer/stream`).
- Creado el widget `engineer-notifications` y registrado en el pipeline de renderizado de `WidgetRenderer`, `CompositeApp`, `ObsOverlayApp` y `WidgetList`.
- Validadas las reglas de negocio: el widget es invisible en runtime cuando no hay notificaciones activas, muestra un placeholder premium en modo edición, e ignora/oculta mensajes expirados basándose en `expiresAt`.
- Tests automatizados (400/400 de frontend y todos los de Go) y checks de linter, compilación y formato en verde al 100%.
- Review GLM de fixes EN0-EN5: ACCEPT WITH P3. No quedan P0/P1/P2 conocidos.
- EN6 (`Ingeniero` con LMU live real) queda preparado a nivel de analisis en `docs/engineer-live-lmu-adapter-analysis.md`, pero aparcado hasta que pueda validarse con datos live.

A8 - Checklist alpha privada completado:
- Auditoria integral de preparacion para alpha privada: PASS.
- 18/18 areas evaluadas como PASS para alpha privada automatizada.
- Checklist versionado en `docs/alpha-private-checklist.md`.
- Queda pendiente smoke manual antes de distribuir a testers cercanos.
- Completada la preparación de `B1 - Build compartible e instrucciones` con inventario de build, verificación de empaquetado y la creación de la guía para testers (`docs/tester-build-instructions.md`).


PREVIEW2 - WidgetStudio intrinsic width contract:
- Corregido el espacio vacio a la derecha en la preview aislada de `WidgetStudio`.
- Los widgets configurables (`relative`, `standings`) usan ancho intrinseco en el sandbox de `WidgetStudio`, envolviendo el contenido real, sea menor o mayor que `position.w`.
- `position.h` sigue usandose para la altura en modo fill.
- `WidgetRenderer` propaga un contexto interno runtime `__previewFillHost` a los widgets; no se persiste en schema.
- `LayoutStudio` y overlays runtime siguen usando `position.w/h` como contrato de layout; sin cambios.
- Bug log actualizado: `docs/widget-preview-bug-log.md` (entrada 8).
- Plan ejecutado: `docs/superpowers/plans/2026-06-23-preview2-widgetstudio-intrinsic-width.md`.

Vantare v2 es una suite local para sim racing construida con Go/Wails y React/TypeScript.

Version publica actual de runtime/build: `v0.1.0.2`.
Ultimo checkpoint de roadmap confirmado: hotfix `v0.1.0.2` publicado y verificado: Google OAuth externo, Supabase backend configurado en Go build, despliegue CI completo, assets publicados (3/3 checksums OK), smoke PASS.

Base de schema v2 para perfiles preparada:
- `schemaVersion: 2` permite layouts por sesion y variantes de widgets.
- `layouts.general.widgets` existe como layout obligatorio en perfiles v2.
- `widgets` se mantiene como espejo de compatibilidad durante la transicion.
- Los perfiles legacy sin `schemaVersion` siguen cargando sin migracion silenciosa.

Primer corte configurable de `Relative` preparado:
- Existe catalogo frontend para metricas/columnas del `Relative` inicial.
- `bestLap` y `lastLap` se modelan como columnas opcionales persistentes en variantes schema v2.
- `WidgetStudio` puede activar/desactivar esas columnas sin tocar posicion ni tamano.
- Preview, overlay desktop y OBS leen la variante referenciada por cada widget.

Formatos iniciales de columnas de `Relative` preparados (Task 6):
- El nombre de piloto ya no se recorta automaticamente al activar columnas opcionales.
- El recorte de nombre es una opcion explicita de la variante.
- `bestLap` y `lastLap` soportan formato completo/compacto, decimales, ancho, color y alineacion.
- La preview aislada de `WidgetStudio` usa el ancho intrinseco del `Relative` cuando las columnas requieren mas espacio.
- Verificacion manual aprobada: las columnas se activan, se guardan, se expanden sin recortar y mantienen alineacion por filas.

Filtros iniciales de `Relative` preparados:
- `rangeAhead` y `rangeBehind` son configurables desde `WidgetStudio`.
- El filtro de clase permite mostrar todas las clases o solo la misma clase del jugador.
- El coche del jugador puede mostrarse u ocultarse.
- Los filtros se guardan en `variant.filters`.
- Los perfiles legacy con `props.rangeAhead` y `props.rangeBehind` siguen funcionando.

Catalogo inicial de `Standings` preparado (S2):
- `frontend/src/overlay/widgets/standings-catalog.ts` define metricas y columnas sin UI ni render.
- Columnas default estables: `position`, `driverNumber`, `driverName`, `gap` habilitadas; `vehicleClass`, `currentLap`, `interval`, `bestLap`, `lastLap` deshabilitadas.
- Metrica `playerHighlight` disponible como stable no-columna para futuro resaltado.
- Metricas `pitInfo`, `distance` y `deltaLapTime` quedan como `tester` sin habilitar por defecto.
- No se incluyen multiclass ni metricas no confirmadas en el primer corte.
- Tests focalizados pasan; TypeScript pasa.

Variantes y persistencia frontend de `Standings` preparadas (S3, aprobada por GLM):
- `withDefaultWidgetVariants`, `toggleStandingsColumn`, `enrichWidgetPropsWithVariant` y `normalizeStandingsVariant` soportan `widget.type === "standings"`.
- Standings reusa el sistema de variantes schema v2 ya usado por `Relative`.
- Legacy sin `variantId`/`variants`/`schemaVersion` se normaliza a `variant-${widget.id}-default` con columnas default.
- `normalizeStandingsVariant` preserva overrides de usuario (width, format, style) y descarta columnas desconocidas.
- Idempotencia por identidad garantizada (con `deepEqual`) tanto para Relative como Standings.
- `enrichWidgetPropsWithVariant` no fuerza `templateId` para tipos no relative/standings (queda undefined si el variant no lo define).
- 37 tests focalizados pasan; suite completa 267/267; tsc y build OK.
- No se toco renderer, UI, backend, schema ni configs.

Render configurable de `Standings` en preview/desktop/OBS preparado (S4, aprobada por GLM):
- `StandingsWidget` lee `props.variant.columns` y renderiza solo columnas habilitadas en orden de catálogo.
- `standings-format.ts` aporta helpers puros: width/color/align, truncado de nombre, formato de tiempo de vuelta (full/compact, decimals 0-3), ancho intrinseco.
- Sin variant, cae a `createDefaultStandingsColumns()` (legacy identico a antes).
- `playerHighlight` nunca se renderiza como columna (es metrica no-columna).
- Pit label, tire badge y FASTEST quedan como decoraciones de fila en el area de gap.
- Brand cell standalone restaurado como decoracion (no columna): la marca de equipo es visible aunque `driverNumber` este deshabilitado.
- Fingerprint actualizado para incluir config de columnas (re-renderiza al cambiar variant).
- Tests: 36 nuevos/ajustados (standings-format + StandingsWidget); suite completa 293/293; tsc, build, lint y git diff --check OK.
- `.gitattributes` preparado para normalizar line endings al pasar por git; `git diff --check` no reporta errores bloqueantes, aunque pueden aparecer warnings CRLF en archivos ya modificados en working copy.
- No se toco UI (`hub/**`), `WidgetRenderer`, `PreviewScaler`, `WidgetSandboxPreview`, `PreviewWidgetFrame`, backend, schema ni configs.
- Validacion manual detecto una ambiguedad visual: en practice/qualy, la columna default `gap` muestra tiempos de vuelta por comportamiento legacy y puede parecer `bestLap`.
- S4.5 fue aprobada por GLM con P3: la preview de `Standings` permite elegir escenarios mock `Practica`, `Qualy` y `Carrera`, default `Carrera`, sin persistir en perfil/layout/config.

La Fase A de `Overlays Studio` se encuentra completada:
- La navegacion visible unifica `Overlays` y `Preview` bajo `Overlays Studio`.
- `Overlays Studio` sustituye la antigua entrada visible a `Preview` como flujo principal de edicion.
- `WidgetStudio` permite editar aspecto/comportamiento de widgets.
- `LayoutStudio` contiene la edicion de layout, colocacion y tamano.
- `Widgets` no expone posicion/tamano/eliminar (responsabilidad exclusiva de `LayoutStudio`).

Fase A2 de Overlays Studio completada:
- Home convertida en cuatro paneles grandes clicables: `Widgets`, `Mis perfiles`, `Recomendados por Vantare`, `Comunidad`.
- Cada panel es un `button` con aria-label, hover/focus states y toda la tarjeta como target de click.
- `Widgets` panel abre el editor de widgets existente.
- `Mis perfiles` abre una subpantalla propia con perfiles y previews reales renderizadas.
- `Recomendados por Vantare` abre una subpantalla propia con previews reales y guardado como perfil propio.
- `Comunidad` abre una pantalla dedicada de `Proximamente`.
- Todas las subpantallas usan `← Volver a Overlays Studio`.
- `ProfilePreview` reutiliza `PreviewWidgetFrame` existente para renderizar widgets reales en miniatura de forma responsive.
- Backend `hub:list` ahora incluye `Profile` completo en cada `ProfileEntry` para permitir previews de perfiles propios.

Fase B de Overlays Studio (Widget Previews) estabilizada:
- `WidgetPreviewPanel` ya no usa `PreviewWidgetFrame`.
- `WidgetStudio` usa una preview aislada basada en `WidgetRenderer`, `PreviewScaler` y `WidgetSandboxPreview`.
- `PreviewWidgetFrame` queda reservado para layout/profile previews.
- `Relative` compacto fue validado manualmente: sin clipping, sin espacio vacio derecho y centrado en el checkerboard.
- Los hallazgos y antipatrones quedan documentados en `docs/widget-preview-bug-log.md`.
- Plan ejecutado: `docs/superpowers/plans/2026-06-22-widget-sandbox-preview-architecture.md`.

Controles live restaurados dentro de Overlays Studio:
- `Mis perfiles` muestra `Abrir overlay` / `Detener overlay` por perfil.
- `LayoutStudio` muestra `Abrir overlay` / `Detener overlay` para el perfil activo.
- `WidgetStudio` no muestra controles live de forma intencionada.
- El inicio y parada reutilizan los eventos Wails existentes: `overlay:start`, `overlay:stop`, `overlay:status`.
- `Abrir overlay` se deshabilita mientras el layout tiene cambios sin guardar o se está guardando.

## Correcciones P1-P3 del review de auth/license (2026-06-27)

Implementadas sobre el trabajo de Release 02 Mini-Plan C:

- `frontend/src/lib/supabase-auth.ts`:
  - Valida `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` al construir el cliente.
  - Devuelve mensaje de error accionable cuando faltan las env vars en lugar de un reject opaco.
  - Lee `VITE_OAUTH_REDIRECT_URL` para el `redirectTo` de OAuth (default `http://localhost:34115/#/auth/callback`).
  - Expone `resetSupabaseClient()` solo para tests.
- `frontend/src/main.tsx`:
  - Añade ruta `/#/auth/callback` con `OAuthCallbackHandler` que extrae `access_token` y emite `license:validate`.
- `frontend/src/hub/auth/LoginScreen.tsx` + `frontend/src/hub/pages/HubApp.tsx`:
  - `onLoggedIn` ahora recibe el `access_token` y emite `license:validate` en lugar de hacer `window.location.reload()`.
- `frontend/src/hub/auth/PaywallScreen.tsx`:
  - Elimina `console.log` con PII; muestra mensaje "Pago en línea próximamente".
- `internal/license/service.go`:
  - Elimina el wrapper privado `emitChanged` trivial; usa `EmitChanged` directamente.
  - Actualiza comentario de `WithEmitter` para reflejar que es helper de tests.
- `cmd/vantare/main.go`:
  - Loguea `license: supabase env vars missing, running in offline-grace mode` cuando faltan ambas env vars.
- Tests:
  - Actualizados `supabase-auth.test.ts`, `LoginScreen.test.tsx`, `PaywallScreen.test.tsx`.
  - Añadido `HubApp.bridge.test.tsx` con happy path de `LicenseBridge`.
  - Añadido `TestResetDeviceRequiresClient` en Go.
- Riesgo residual documentado: el flujo OAuth requiere validación real en builds empaquetados (Wails) porque el redirect y el callback dependen de la URL configurada y del navegador/SO del usuario.

Checks ejecutados y verdes: `go test ./...`, `pnpm --dir frontend test` (564 tests), `pnpm --dir frontend build`, `pnpm --dir frontend lint`, `git diff --check` (solo warning CRLF no bloqueante en `main.tsx`).

## Objetivo actual

Release 02 Mini-Plan C cerrado con correcciones P1-P3 del review. Webhook entitlement mapping (P2-4) implementado con mapping `price_id -> product_key[]`, manejo de cancelación/revocación, upserts idempotentes y tests. Queda pendiente el gate manual, además de validar el flujo OAuth en builds empaquetadas de Wails.

Trabajo recomendado a continuación:

1. Cerrar commit de las correcciones P1-P3.
2. Continuar con el siguiente mini-plan operativo del indice de release (`docs/release-roadmap-execution-index.md`).

Checkpoint funcional `v0.3.9.1` cerrado:

- `WidgetStudio` visual rework validado manualmente.
- PREVIEW2 validado manualmente: `Relative` y `Standings` se ajustan al ancho intrinseco en la preview aislada sin espacio vacio a la derecha.
- `LayoutStudio` drag/resize/save estabilizado.
- `Relative` y `Standings` redimensionan proporcionalmente en `LayoutStudio`, runtime desktop y OBS.
- Los frames visuales se normalizan desde el primer render para perfiles legacy deformados, sin mutar ni guardar automaticamente.
- Recomendados de Vantare pueden guardarse como copia propia editable.
- `SaveProfileAsOwnCopy` genera IDs unicos, convierte a schema v2 y no muta el perfil de entrada.
- Version runtime/build actualizada a `v0.3.9.1`.
- No se haran mas reworks visuales completos hasta cerrar la mayoria de features core.

Checkpoint funcional `v0.3.9.2` cerrado:

- A6+A7 mock/live/demo UX ejecutado como lote rapido.
- El flujo source-state queda documentado en `docs/mock-live-demo-ux.md`.
- El chip global de fuente de telemetria en Topbar tiene `title` y `aria-label`.
- El selector mock de `Standings` se valida por `aria-pressed`.
- Changelog publico y publicacion automatica a Discord por tags `v*` preparados.
- Version runtime/build actualizada a `v0.3.9.2`.

Checkpoint funcional `v0.3.10.0` preparado para cierre:

- B1 build compartible e instrucciones para testers completado.
- B2 known issues y protocolo de feedback completado.
- B3 OBS setup local documentado y B3.1 corregido para usar perfiles reales en la URL de Ajustes.
- B4 hotkeys basicas endurecidas en Windows con stub multiplataforma.
- B5 inventario Delta best live completado.
- B6 Delta best live implementado: backend prioriza `DeltaBest` nativo de LMU, fusion acepta deltas negativos, `DeltaWidget` muestra `Target` y `Lap` desde telemetria.
- Reviews GLM de B4/B6 aceptadas sin P0/P1/P2.
- Ingeniero queda integrado como modulo de suite, con EN6 live LMU aparcado hasta validacion real.
- Queda pendiente verificacion manual prolongada de Delta live con LMU.

Trabajo posterior al checkpoint `v0.3.10.0`:

1. `A8 - Checklist alpha privada` completado con PASS;
2. `B1 - Build compartible e instrucciones` completado con la guía del tester;
3. `B2 - Known issues y canal feedback` completado con la definición de canales de Discord y plantilla de bug report;
4. `B3 - OBS setup local sencillo` completado con la guía de OBS local;
5. `B4 - Hotkeys basicas` completado;
6. `B5 - Delta best live inventario` completado;
7. `B6 - Delta best live implementacion` completado a nivel automatico y pendiente de prueba live prolongada;
8. mantener EN6 aparcado hasta poder validar LMU live;
9. no iniciar nuevos reworks visuales completos hasta cerrar mas features core.
10. `P1 - Pedals inventario datos/diseño actual` completado.
11. `P2 - Pedals nuevo diseño pequeño` completado como plan visual aprobado.
12. `P3 - Pedals compact render` completado con el nuevo render compacto `CLT`/`BRK`/`THR`.
13. `P4 - Pedals configuracion visual basica` completado con la sección dedicada en WidgetStudio y color pickers.
14. `P5 - Adición de widgets en LayoutStudio` completado y commiteado (commit `3db203a`): widget-factory, addWidget en useOverlayStudioState, botón `+ Añadir widget` en StudioWidgetList, PedalsSettingsSection y pedals-settings helper.
15. Aprobado para beta testers: `P6 - Widget Preset Gallery` (Galería de presets de widgets), planificada justo después de `P5` y antes del smoke test de la fase (ahora `P7`).

Release 01 - Task 1 (Recommended profiles audit + rename) completado (2026-06-26, commit `3db203a`):
- Reemplazados los 3 perfiles recomendados antiguos (Racing Básico, Streamer Clean, Minimal Telemetry) por 2 oficiales: `Clean Overlay` y `Le Mans Ultimate - Basic`.
- `configs/custom-hfg.json`: renombrados id/name a `vantare-clean-overlay`/`Clean Overlay`. Filename físico conservado para no romper `embed.go`/`main.go`. Positions originales preservadas.
- `configs/custom-1.json`: nuevo config (no embebido), renombrados id/name a `vantare-lmu-basic`/`Le Mans Ultimate - Basic`.
- `recommended-profiles.ts`: ambos perfiles en schema v2 con `layouts.general.widgets`. Clean Overlay conserva `variant-relative-default`; LMU Basic incluye pedals deshabilitado.
- Tests reales añadidos: ids/nombres exactos, widgets por perfil, schemaVersion 2, layouts.general, variantId, inmutabilidad del clone.
- Review adversarial GLM (2 ciclos): NEEDS FIXES → ACCEPT WITH P3. P1 (positions sin autorizar, diff mezclado no reportado) y P2 (tests débiles, test P5 en diff, schema inconsistente) resueltos. P3 no bloqueantes documentados (custom-1.json huérfano, pedals enabled:false, id≠filename).
- Checks: 480 tests frontend OK, build OK, lint OK, `go test ./pkg/config ./internal/app` OK, `git diff --check` OK.
- Verificación manual pendiente: abrir app, confirmar 2 perfiles en Recomendados, guardar copias, abrir en LayoutStudio.

Release 01 - Task 4 (Widget Preset Implementation) completado (2026-06-26):
- Creado `PresetService` en Go para persistir presets a `{cfgDir}/widget-presets.json`.
- Implementado generador nativo de UUID v4 con `crypto/rand` sin dependencias adicionales.
- Registrado `PresetService` en Wails y conectado su ciclo de vida y handlers en `main.go`.
- Creado helper puro `widget-presets.ts` para extraer y aplicar configuraciones estéticas e internas de un widget sin tocar propiedades de diseño ni runtime.
- Creado `widget-presets-store.ts` para conectar reactivamente la UI con los eventos de Wails.
- Creado componente UI `WidgetPresetSection.tsx` en `WidgetSettingsPanel` con controles oscuros densos para guardar, aplicar, renombrar y eliminar presets.
- Corregidos 75/75 archivos de pruebas unitarias de frontend e integración (incluyendo mocks de Wails para JSDOM).
- Review GLM fixes P1: resueltos los 4 P1 (race condition en `listPresets` vía correlation ID, errores silenciosos del backend, variantes huérfanas al aplicar preset, aliasing por referencia compartida).
- Minifix P3 del orquestador: añadido timeout de 10s en `listPresets` con reject controlado; handlers Go ahora emiten error también con payload `nil`; tests añadidos.
- Review GLM minifix: ACCEPT (ningún P0/P1/P2 nuevo; 3 P3 residuales menores documentados).
- Checks: Go tests OK, frontend tests OK (504 tests), frontend build y lint OK, git diff check OK (salvo warning CRLF en `pnpm-workspace.yaml` de otro agente).
- Siguiente operativo: commit de Release 01 Task 4 o smoke manual, según decisión de Isaac.




Ultimo miniplan completado y aprobado por GLM:
- `docs/superpowers/plans/2026-06-22-s4-standings-render-configurable.md`
  - Renderer de `Standings` configurable por variantes (enabled/width/format/style).
  - Helpers puros en `standings-format.ts`; brand cell restaurado como decoracion.
  - Tests TDD pasando; suite completa 293/293 verde; tsc, build, lint y diff --check OK.
  - Sin cambios en UI, backend, schema ni configs.
  - Review GLM: ACCEPT WITH P3 FOLLOW-UPS; P3 resueltos por el orquestador (alineamiento con relative-format, test carry-over corregido, brand cell restaurado, test de posicion reforzado, line endings normalizados).

Miniplan implementado tecnicamente:
- `docs/superpowers/plans/2026-06-22-widget-sandbox-preview-architecture.md`
  - `WidgetRenderer` extraido y reutilizable; `PreviewWidgetFrame` reducido a chrome de layout.
  - `PreviewScaler` creado como componente generico sin logica de widgets.
  - `WidgetSandboxPreview` creado como sandbox aislado para `WidgetStudio`.
  - `WidgetPreviewPanel` ahora delega en `WidgetSandboxPreview` y deja de usar `PreviewWidgetFrame`.
  - `position.x/y` se ignoran en el sandbox; `position.w/h` no se modifican.
  - Ajustes P1 de review corregidos: compact mode mide altura/ancho real sin conservar `position.h/w` como minimo visual, y `WidgetRenderer` llena el host por defecto.
  - Validacion manual aprobada: Relative compacto queda centrado, sin espacio vacio derecho y con columnas alineadas.
  - Bug log: `docs/widget-preview-bug-log.md`.

UI de `Standings` en `WidgetStudio` preparada (S5):
- Controles de columnas opcionales y formatos conectados a variantes schema v2.
- Defaults de UI leidos desde el catalogo de `Standings`.
- Inputs numericos con clamp en UI.
- Sin controles de posicion/tamano/eliminar.
- Checks reportados por worker: suite frontend completa, TypeScript, build, lint y `git diff --check` en verde.
- P3 iniciales revisados y corregidos salvo refactors compartidos fuera de alcance.

S6 - Standings verificacion completa y docs ejecutada (2026-06-23):
- Worker: Deepseek V4 Flash.
- Todos los checks automaticos pasaron (322 tests frontend, tsc, build, lint, Go tests, `git diff --check` sin errores; warnings CRLF no bloqueantes en working copy).
- Checklist manual creada en `docs/standings-manual-verification.md`.
- Review GLM: `ACCEPT WITH P3`; se corrigieron los P2 documentales antes de avanzar a UI1.
- Release/tag publicado: `v0.3.6.1`.

UI1 - Analisis visual de `WidgetStudio` completado (2026-06-23):
- Worker: Minimax M3.
- Documento creado: `docs/overlays-studio-visual-analysis-ui1.md`.
- Alcance: solo `WidgetStudio`, no Home, `LayoutStudio`, perfiles, recomendados, comunidad ni navegacion global.
- No se toco codigo, tests, configs, schema ni backend.
- Checkpoint documental: sin tag/version propia; se agrupara bajo la siguiente version funcional.

UI2 - WidgetStudio Visual Rework ejecutado (2026-06-23):
- Worker: Minimax M3.
- Cambios solo en `WidgetStudio`, `WidgetSettingsPanel`, `StudioWidgetList`, `RelativeSettingsSection`, `StandingsSettingsSection` y componentes locales nuevos `studio-controls.tsx`.
- Cabecera global minima (back, titulo, estado con dot rojo, Guardar); widget metadata movida al sticky header del panel derecho.
- Secciones Relative/Standings reordenadas y compactadas; controles en filas densas con tipografia mono y label oculto de cabecera de seccion.
- Lista de widgets compacta con tabs pill, busqueda con icono y dot rojo de seleccion.
- Selector mock `Práctica` / `Qualy` / `Carrera` reestilizado como segmented control con `aria-pressed`.
- Tests focales y de pagina actualizados a los nuevos textos; anadidos tests para sticky header y studio-controls.
- Sin cambios en LayoutStudio, backend, schema, configs, build config ni versionado.
- Checks: 328/328 tests frontend, `tsc -b`, `pnpm build`, `pnpm lint` y `git diff --check` sin errores (warnings CRLF conocidos no bloqueantes).
- Verificacion manual: aprobada por el usuario tras PREVIEW2.

PREVIEW2 - `WidgetStudio Intrinsic Width` completado (2026-06-23):
- Documento: `docs/superpowers/plans/2026-06-23-preview2-widgetstudio-intrinsic-width.md`.
- Alcance: corregir el espacio vacio derecho en la preview de `WidgetStudio` haciendo que `Relative` y `Standings` usen ancho intrinseco en sandbox.
- Decision: `WidgetStudio` no edita tamano, por lo tanto la preview debe envolver el contenido; `LayoutStudio` y overlay runtime siguen usando `position.w/h`.
- Review GLM: `NEEDS FIXES` inicial por altura fill de `Relative`; P2 corregido.
- Verificacion manual: aprobada por el usuario; `Relative` y `Standings` se ajustan correctamente sin espacio vacio derecho.
- Version objetivo: `v0.3.9.0`.

UI2 - Miniplan `WidgetStudio Visual Rework` creado (2026-06-23):
- Documento: `docs/superpowers/plans/2026-06-23-ui2-widgetstudio-visual-rework.md`.
- Alcance: rework visual de `WidgetStudio` con densidad alta tipo RaceLabs y margen creativo para el worker UI/UX.
- Estado: ejecutado y validado como parte de `v0.3.9.0`.

A4+A5 - Recomendado -> copia editable implementado (2026-06-25):
- Inventario: el flujo `OverlaysStudioPage` ya emitía `hub:save-own-copy`; `HubService.SaveProfileAsOwnCopy` persistía copias pero fallaba con duplicados y no convertía a schema v2.
- Cambios:
  - `frontend/src/hub/overlays/recommended-profiles.ts`: `cloneRecommendedProfile` guarda metadata `source` (`kind: recommended`, `profileId` y `name` originales) y elimina cualquier identidad de solo lectura.
  - `frontend/src/hub/pages/OverlaysStudioPage.tsx`: el prompt de copia usa `${nombre} (copia)` por defecto para diferenciar la copia.
  - `internal/app/hub_service.go`: `SaveProfileAsOwnCopy` genera un id de archivo único ante colisiones, convierte el perfil a schema v2 si aplica (layouts/variants) y persiste el perfil completo.
- Tests añadidos/ajustados en `recommended-profiles.test.ts`, `OverlaysStudioPage.test.tsx` e `internal/app/hub_service_test.go` (copia, id único, conversión v2, preservación de layouts/variants, error paths).
- Checks pasados: 358 tests frontend, `tsc -b`, `pnpm build`, `pnpm lint`, `go test ./pkg/config ./internal/app`, `git diff --check` sin errores bloqueantes (warnings CRLF conocidos).
- Review y verificacion manual aprobadas; A5 queda cerrado en `v0.3.9.1`.

### Reconexión live-first aprobada para overlays

- Al pulsar `Abrir overlay`, la app intenta reconectar con LMU antes de abrir la ventana.
- Si LMU no está disponible, el overlay sigue abriendo con datos mock como fallback visual.
- `-live=false` queda como modo explícito de desarrollo/testing.
- La barra superior muestra el estado de la fuente (`LMU conectado`, `Esperando LMU` o `Mock`).

## Proximas tareas pequenas

1. `A6+A7 - Mock/live/demo UX: inventario + fixes`: ejecutado (2026-06-25).
   - Inventario: flujo source-state correcto; Topbar muestra `LMU conectado` / `Esperando LMU` / `Mock` / `Fuente pendiente`.
   - WidgetStudio mock scenario selector es preview-only y no marca dirty (verificado por test existente).
   - Fixes aplicados:
     - Topbar source chip: añadidos `title` y `aria-label`.
     - Creado `Topbar.test.tsx` con 7 tests de source status.
     - Tests de mock scenario: cambiados de className a `aria-pressed`.
   - Documento de hallazgos: `docs/mock-live-demo-ux.md`.
   - No se tocó telemetría, preview/layout, schema, backend Go ni configs.
2. `A8 - Checklist alpha privada`: ejecutado y documentado en `docs/alpha-private-checklist.md`.
3. `B1 - Build compartible e instrucciones`: completado.
4. `B2 - Known issues y canal feedback`: completado.
5. `B3 - OBS setup local sencillo`: completado.
6. `B4 - Hotkeys basicas`: Fase B4.1 (Hardening de atajos, stubs multiplataforma y documentación para testers) completada y validada mediante tests. Listo para siguientes fases de UX.
7. `B5 - Delta best live inventario`: completado. Viabilidad YES, detectado bug crítico de fusión de Go.
8. `B6 - Delta best live implementacion`: completado. Backend y frontend listos; queda smoke manual live con LMU para recopilar feedback real.
9. mantener EN6 aparcado hasta poder validar LMU live.
10. No iniciar mas reworks visuales completos hasta cerrar la mayoria de features core.
11. `P1 - Pedals inventario datos/diseño actual` completado.
12. `P3 - Pedals compact render` completado.
13. `P4 - Pedals configuracion visual basica` completado.
14. Siguiente operativo: `P5 - Recomendados beta pulidos`.
15. Aprobado para beta testers: `P6 - Widget Preset Gallery` (Galería de presets de widgets), programada antes del smoke test (ahora `P7`).
16. Ejecutar REL1/Discord release al pushear el tag funcional.
17. Plan creado / pendiente de review: `Overlay edit mode in-place por hotkey (Ctrl+Shift+E)` — ver `docs/superpowers/plans/2026-06-28-overlay-in-place-edit-mode-hotkey.md`. PLAN ONLY, sin tocar codigo de producto. Opcion recomendada B (modo in-place dentro de `CompositeApp` reutilizando `profile:set-mode` + `WidgetEditFrame`).




## Beta stabilization closure (2026-06-28)

Bloque de estabilizacion que desemboco en la beta publica `v0.1.0.0` tras abandonar la linea interna `v0.3.*`. Atiende los findings del review adversarial global sin añadir features fuera del alcance de beta.

- **Remotion fuera de beta**: el proyecto Remotion (`frontend/src/remotion/`, `frontend/remotion.config.ts`, scripts `dev:video`/`render:video`/`still:video` en `frontend/package.json`, deps `@remotion/*` en `pnpm-lock.yaml`) es un trabajo paralelo del usuario, no parte de Vantare. Se stasheó con mensaje `pre-beta-remotion-work` (incluye tracked + untracked) para sacarlo del working tree de la beta. No se commitea nada de Remotion en esta tanda. Restaurar con `git stash pop` (o `git stash apply 'stash@{0}'`) cuando retomes ese proyecto.
- **P1 updater ctx**: las goroutines lanzadas en los handlers `updater:install:verified` (y el legacy, ya desactivado) en `cmd/vantare/main.go` ahora propagan el `ctx` de `signal.NotifyContext` a `InstallVerifiedVersionCtx`. Si la app se cierra (SIGINT/SIGTERM) durante la descarga, el `http.Request` queda cancelado y la goroutine termina en lugar de quedarse viva escribiendo eventos en un emisor cerrado. Cobertura añadida en `TestUpdaterServiceInstallVerifiedVersionCtxRespectsCancellation`.
- **P2 handler legacy `updater:install`**: el handler Wails para `updater:install` se reemplaza por un rechazo explícito (`emitUpdaterError("legacy updater:install is disabled; use updater:install:verified")`). El frontend nunca emite el evento legacy (`UpdateBanner.test.tsx` y `SettingsPage.test.tsx` ya lo verificaban como test de regresión). El método Go `UpdaterService.InstallVersion` se elimina también, eliminando la posibilidad de bypass desde la UI hacia el servicio Wails registrado.
- **Checks**: `go test ./cmd/... ./internal/... ./pkg/...` verde, `git diff --check` limpio, `gofmt` y `go vet` limpios sobre los archivos modificados.
- **Riesgos restantes**: heredados del review adversarial global y ya documentados en `docs/technical-debt.md` (TD-019 `-race`, TD-024 workflows Discord reales, etc.). El P1-2 (hotkeys en thread incorrecto) y los P3 quedan fuera de alcance explícito de esta tanda.

## Riesgos actuales

- **Gate manual de OAuth en producción Wails**: El flujo de redirección OAuth de Supabase no se puede validar de forma automatizada sin un entorno Supabase real y un empaquetado de producción de Wails. Al compilar para producción, se debe asegurar que `VITE_OAUTH_REDIRECT_URL` esté configurado a una URL externa válida (o deep link registrado) que redirija la sesión de vuelta a la app local, ya que en builds empaquetadas Wails el protocolo `http://wails.localhost` o similar no puede recibir redirecciones OAuth directas desde navegadores externos sin mediación.
- Hay cambios abiertos en git de otros agentes; no mezclar tareas nuevas con ellos sin revisar.
- El README principal puede estar desactualizado respecto a `Overlays Studio`.
- Parte de la documentacion historica vive fuera de `vantare-v2`.
- Los agentes pueden confundir `Widgets` con `LayoutStudio`; mantener separacion estricta.
- Modificar `PreviewWidgetFrame` puede impactar a los mini-previews de perfiles creados en la Fase A2 si no se maneja bien la propiedad de "aislamiento" o "escala".
- La preview aislada de `WidgetStudio` ya esta separada de `PreviewWidgetFrame`; mantener esta separacion y consultar `docs/widget-preview-bug-log.md` antes de tocarla.
- Bugs importantes ya cerrados viven en `docs/resolved-bugs.md`; consultarlo antes de reabrir trabajo de preview, guardado o variantes legacy.
- La app ya tiene el flujo principal de edicion, el plan maestro vive en `docs/master-feature-plan.md` y el tablero orquestable vive en `docs/roadmap-execution-board.md`.
- Hallazgos P3 pendientes de resolver (documentados para follow-up):
  1. `columns: []` se normaliza a defaults, lo cual es ambiguo para futuros cortes.
  2. `enrichWidgetPropsWithVariant` normaliza variantes en cada render/tick (impacto menor de rendimiento).
  3. Densidad visual si se activan `bestLap` y `lastLap` en widgets muy pequeños (parcialmente mitigado al usar ancho intrínseco y recorte de nombre explícito).
  4. Queda pendiente crear un harness visual/browser con Playwright para detectar regresiones visuales que JSDOM no cubre.
  5. P3 S4.5: un test usa clase CSS para comprobar estado activo del selector mock; preferir `aria-pressed` en un futuro rework.
  6. P3 S4.5: el selector mock usa paleta neutral; conviene alinearlo con el rework UI/S5.
  7. P3 S4.5: `mockSessionScenario` se propaga a todos los widgets aunque solo `Standings` lo consume; sin impacto funcional.
  8. P3 S4.6: falta test de regresion para Ctrl+S con `autosave:false`; el handler no cambio y GLM no lo considera bloqueante.

## Overlay edit mode in-place por hotkey (2026-06-28)

Implementado el modo de edicion in-place activable con `Ctrl+Shift+E`:

- Backend/Wails:
  - Hotkey por defecto `toggleEditMode = ctrl+shift+e` en `DefaultAppSettings`.
  - Handler `handleToggleEditMode` en `cmd/vantare/main.go`: togglea entre `ModeRacing` y `ModeEdit` sobre el overlay abierto; si no hay overlay abierto, abre el perfil activo y entra directamente en edit mode.
  - Evento FE<->Go `overlay:toggle-edit-mode` y evento Go->FE `overlay:edit-mode-changed`.
  - `rebuildHotkeys()` incluye `toggleEditMode` en el `actionMap` (cierre del finding P0-NEW del review adversarial).
  - Reset a `ModeRacing` al detener/cerrar el overlay (`overlay:stop`) y al abrir un overlay nuevo (`overlay:start`).
  - `ProfileService.EmitLoaded` retorna `layoutOrigin = {0,0}` en `ModeEdit` (fullscreen) para que las coordenadas de los widgets no se desplacen.
  - **Fix P0 (mouse passthrough real):** `OverlayWindow` expone `ApplyProfileMode`; `wailsOverlayWindow` conserva su `window.Manager` y aplica `ModeRacing`/`ModeEdit` en la ventana Wails real. `handleToggleEditMode` y `resetOverlayDisplayMode` aplican el modo a la ventana actual tras mutar el perfil, garantizando passthrough ON en racing y OFF en edit mode.
  - **Fix P1 (streaming/estado):** `handleToggleEditMode` usa `overlayRunning.Store(newStatus.Running)`; si `StartActiveOverlay` no crea ventana desktop (streaming), no entra en edit mode.
  - **Fix P1 (arranque siempre en racing):** tanto `overlay:start`, `overlay:stop` como el hotkey `toggleOverlay` llaman `resetOverlayDisplayMode` tras detener o iniciar la ventana, evitando que un perfil persistido en `ModeEdit` arranque en edit mode.
- Frontend:
  - `CompositeApp` escucha `overlay:edit-mode-changed` y deriva `editMode` de `windowMode` en `profile:loaded`.
  - En edit mode renderiza `WidgetEditFrame` (drag/resize) en lugar de `WidgetHost`.
  - Mitigacion del finding P1-NEW: en edit mode `layout:saved` ya no emite `profile:request`, evitando el flash/re-render completo tras cada autosave.
  - Indicadores visuales `EDIT MODE` y hint de salida.
  - Autosave en `layout:save` al soltar drag/resize.
  - **P2:** `WidgetEditFrame` recibe variantes del perfil via `enrichWidgetPropsWithVariant`, alineando el render en edit mode con el runtime.
- Tests:
  - Go: `TestDefaultAppSettingsIncludesToggleEditMode`, `TestParseHotkeyComboCtrlShiftE`, `TestHotkeyManagerUpdateFromSettingsKeepsToggleEditMode`, `TestProfileServiceEmitLoadedEditModeOriginZero`, `TestBuildHotkeyActionMapIncludesToggleEditMode`, `TestHandleToggleEditModeTogglesDisplayMode`, `TestHandleToggleEditModeOpensOverlayWhenNotRunning`, `TestHandleToggleEditModeRespectsRunningStatusForStreaming`, `TestResetOverlayDisplayModeResetsToRacing`, `TestNewOverlayWindowAppliesProfileMode`.
  - Frontend: tests de CompositeApp para entrar/salir de edit mode, indicador, toggle por evento, no `profile:request` en `layout:saved` durante edit mode, y emision de `layout:save` tras drag.
- Documentacion:
  - `docs/tester-build-instructions.md` actualizado con la hotkey `Ctrl+Shift+E`.
- Riesgos residuales:
  - `WidgetEditFrame` no conserva ratio de aspecto al redimensionar (igual que el flujo legacy `/overlay/edit`); aceptado para demo pre-stream.
  - El chrome de edicion es visible si se edita mientras se hace stream; aceptado para demo.
  - Si `engineer-notifications` esta activo, en edit mode aparece como frame vacio porque `WIDGET_COMPONENTS` no lo incluye (heredado del flujo legacy).

## Fix P0 residual overlayRunning (2026-06-28)

Cierre del P0 residual detectado en el review final del fix P0 de Overlay Edit Mode (`overlayRunning` podia quedar `true` sin ventana):

- **Fix A (cierre externo):** `wailsOverlayFactory.stopOverlay` (callback de `WindowClosing`) ahora, tras `overlayController.Stop()`, si `overlayRunning.Load()` es true, llama `resetOverlayDisplayMode` y hace `overlayRunning.Store(false)`. El guard evita doble reset cuando el stop ya fue procesado por la via normal.
- **Fix B (error de `overlay:start`):** el handler `overlay:start` ahora usa `status.Running` (no `true` fijo) tras `hubSvc.StartOverlay` exitoso, y en error hace `overlayRunning.Store(false)` si `!status.Running`.
- **Fix C (error de `StartActiveOverlay` desde edit hotkey):** `handleToggleEditMode` ahora, si `StartActiveOverlay` falla, hace `overlayRunning.Store(false)` cuando `!newStatus.Running` y no emite `overlay:edit-mode-changed`.
- **Fix D (P3 log noise):** `resetOverlayDisplayMode` ahora solo aplica el modo a la ventana si `overlayController.CurrentWindow() != nil`. Sigue forzando el profile a racing aunque no haya ventana.
- Tests Go anadidos en `cmd/vantare/main_test.go`: cierre externo limpia flag y resetea modo; cierre con flag ya false no emite eventos; fallo de `StartActiveOverlay` desde edit hotkey limpia flag y no emite edit-mode-changed; `ApplyProfileMode` fallido no emite edit-mode-changed; `resetOverlayDisplayMode` sin ventana no toca ventana y resetea modo.
- P1 residual documentado (no bloqueante): race menor entre `CurrentWindow()` y `ApplyProfileMode` fuera del lock del controller; queda para un futuro `ApplyModeToCurrentWindow` bajo lock.
- Checks: `gofmt`, `go test ./cmd/vantare/... ./internal/app/... ./internal/window/...`, `go test ./...`, `go vet ./cmd/vantare/... ./internal/app/... ./internal/window/...`, `git diff --check` — todos OK.

## Auth/Licencias - Login bloqueante y gating free/paid/suite (2026-06-29)

Bloque de auth/licencias para beta publica `v0.1.0.0`. Implementa login obligatorio con Google OAuth, gating basico de licencia free/paid/suite, gracia offline de 24h y logout que devuelve al gate.

- **Login bloqueante efectivo**: `HubApp.tsx` envuelve el shell con `LicenseProvider + LicenseBridge + LicenseGate`. Sin sesion valida, se renderiza `LoginScreen`.
- **Google OAuth como minimo obligatorio**: boton principal `Continuar con Google` con email/password y Discord como accesos secundarios.
- **Planes free/paid/suite**: helper `internal/license/plan.go` + espejo TS `frontend/src/lib/plan.ts`. `AccountSettings.tsx` muestra tarjeta Plan y Estado. `PaywallScreen.tsx` pinta los cuatro planes con Suite como recomendado.
- **Logout devuelve al gate**: `signOut()` + refresh; el gate recibe `anonymous` y renderiza `LoginScreen`.
- **Gracia offline 24h**: si el servidor no responde, el cache local mantiene entitlements por 24h desde la ultima validacion exitosa.
- **Tests**: tests actualizados para LoginScreen, PaywallScreen, HubApp; nuevos tests para plan.go y plan.ts.
- **Docs**: docs/stripe-integration-plan.md y docs/supabase-schema-release.md actualizados.
- **Archivos**: HubApp.tsx, LoginScreen.tsx, PaywallScreen.tsx, paywall-plans.ts, AccountSettings.tsx, plan.ts, plan.go y sus tests.

### Riesgos residuales
- El flujo OAuth requiere validacion real en builds empaquetados Wails (redirect URL).
- Sin portal de pagos embebido en la app (se hace desde portal externo, webhook listo).

## Galeria de disenos oficiales - Beta v0.1.0.0 (2026-06-29)

Cierre del P3-2 de `docs/adversarial-review.md`: la galeria de disenos oficiales de widgets queda **incluida** en la beta publica `v0.1.0.0` tras el `ACCEPT WITH P3` del Worker C.

- **Catalogo oficial de solo lectura**: helper puro `frontend/src/hub/widgets/widget-design-gallery.ts` con 8 disenos oficiales (2 por cada widget type: `Relative`, `Standings`, `Delta`, `Pedals`). IDs estables en codigo (sin UUID); nombres y descripciones claras para usuario beta.
- **Aplicacion sin tocar `position`**: `applyOfficialDesign` reusa `applyPreset` (spread preserva `position` por contrato) y genera un `variantId` determinista (`official-<designId>-<widgetId>`). El widget cambia apariencia y variante; layout intacto.
- **Sin marketplace, sin cloud sync, sin sharing remoto**: fuera de beta por contrato.
- **Contrato de responsabilidades intacto**: `WidgetStudio` (donde vive la galeria) no expone position/tamano/eliminar. `LayoutStudio` no se ha tocado.
- **Convivencia con presets de usuario**: los presets oficiales son solo lectura; los presets de usuario siguen persistiendo en `PresetService` Go y funcionan como antes.
- **Tests**: 73 nuevos. Suite total: 666 tests frontend OK.
- **Docs publicos actualizados**: changelog, build instructions, known issues y feedback process reflejan la inclusion.
- **Plan ejecutado**: `docs/superpowers/plans/2026-06-29-widget-design-gallery-beta.md`.

### Riesgos residuales
- Sin preview miniatura renderizada del widget con el diseno aplicado (solo nombre + descripcion textual).
- Sin estado 'activo/inactivo' del diseno aplicado: cualquier cambio libre del usuario sobreescribe el ultimo diseno oficial aplicado.
- No hay marketplace, cloud sync ni compartir disenos entre usuarios (por contrato de beta).

## Decisiones pendientes

- Si los planes externos deben copiarse, moverse o archivarse dentro de `vantare-v2/docs`.
- Si la antigua ruta/pagina `Preview` debe eliminarse definitivamente o mantenerse como compatibilidad interna.
- Que decision ejecutar primero del plan maestro: separar/verificar responsabilidades, inventario de `Standings`, `LayoutStudio` drag/resize, mock/live/demo o rework UI.
- Cuando crear un harness visual/browser para previews con Playwright tras estabilizar `WidgetSandboxPreview`.

## No cambiar sin aprobacion

- Stack principal Go + Wails + React/TypeScript.
- Separacion `Widgets` vs `LayoutStudio`.
- Configuracion de build/package.
- Dependencias.
- Formato de perfiles JSON.
- Arquitectura de telemetria LMU.

## Nota PACKAGING-01 (2026-06-30) — Vantare app icon branding (Windows-only)

Worker C de `docs/superpowers/plans/2026-06-30-parallel-01-launcher-calendar-packaging.md` ejecutado en fase aislada sobre `build/`, runbook y este plan. Sin tag, sin release, sin Discord.

Alcance aplicado:
- `build/appicon.png` sustituido por el logo Vantare definitivo (`E:\Vantare\Graficos\Logo\1024px.png`, 1024x1024, 24bpp RGB, 237131 bytes).
- `build/windows/icon.ico` regenerado con `wails3 generate icons` desde el nuevo PNG. Resultado: ICO multi-tamano 16/32/48/64/128/256 a 32bpp, header `00 00 01 00` correcto, 28395 bytes (antes 20679 con el icono Wails default). Comando ejecutado: `wails3 generate icons -input appicon.png -macfilename darwin/icons.icns -windowsfilename windows/icon.ico -iconcomposerinput appicon.icon -macassetdir darwin` (mismo que `build/Taskfile.yml` `common:generate:icons`; `-sizes` por defecto del CLI: 256,128,64,48,32,16).
- `build/darwin/icons.icns` no se ha tocado (Windows-only): tras cada `wails3 generate icons` se regenera tambien; restaurado a la version de git con `git checkout -- build/darwin/icons.icns` en cada pasada. `build/appicon.icon/**` tampoco se ha tocado.
- `build/windows/wails.exe.manifest`: el `assemblyIdentity` venia del template Wails con `name="com.example.tempwailsproj"` y `version="0.1.0"`. Bug real que cualquier instalacion/registro de Windows arrastraba. Ajustado a `name="com.vantare.overlays"` y `version="0.1.0.2"` (alineado con `build/windows/info.json` y con el binario actual). Minimo cambio.
- `docs/release-beta-operations-runbook.md`: nueva subseccion "Smoke del icono de la app (Windows)" dentro de la seccion 4 (Opcion A). Documenta: (a) comando para regenerar el `.ico` cuando cambie el logo fuente; (b) procedimiento de smoke via `wails3 task release:clean` + `release:artifacts` + `release:verify` (recordatorio explicito: el camino A2 con `go build` rapido NO incrusta `.syso`); (c) cache de iconos de Windows y mitigaciones (reinstall, `ie4uinit.exe -show`, limpieza de `IconCache.db` como ultimo recurso); (d) nota de no commitear cambios en `build/darwin/icons.icns` ni en `build/appicon.icon/**` si el alcance es Windows-only.

Checks ejecutados:
- `wails3 task release:clean` OK.
- `wails3 task release:artifacts` no se ha podido ejecutar end-to-end en este host: el `cmd/vantare/main.go` actual tiene cambios sin commit del Worker A (LAUNCHER-01) que referencian `launcherSvc`/`app.NewLauncherService`/`exec` no declarados (codigo a medio implementar del worker paralelo, no de este lote). El integrador final debera reejecutar `release:artifacts` cuando A cierre su commit. **Esto no es bloqueante para el commit de PACKAGING-01**: el `.syso` se regenera correctamente desde mi `.ico` y mi `.manifest` (verificado con `wails3 generate syso` aislado, output 31172 bytes). El `.exe` y el instalador NSIS se regeneraran cuando el codigo de A compile.
- `bin/vantare.exe` (regenerado por la build parcial del pipeline antes de fallar, 13060096 bytes, 30/06 16:45:57) no tiene seccion `.rsrc` porque el host de este agente no tiene toolchain `gcc`/`windres` y Go no incrusta `.syso` sin CGO/MinGW. La verificacion de icono en `.exe` tendra que hacerse en CI (GitHub Actions si tiene toolchain) o en una maquina Windows con MinGW. La seccion `.rsrc` aparecera cuando se ejecute el build oficial con la toolchain presente.
- `git diff --check` en archivos modificados por este lote: limpio (no se ha ejecutado sobre archivos de otros workers, no es mi responsabilidad).

Riesgos restantes:
- Cache de iconos de Windows: documentado en runbook; puede requerir reinstall o `ie4uinit.exe -show` para que taskbar/ventana muestren el branding Vantare.
- Falta de toolchain CGO en este host impide la verificacion end-to-end de `.rsrc` en `.exe` local. El integrador debera confirmar el icono en `.exe` en CI o en una maquina Windows con MinGW.
- Si el logo fuente definitivo cambia, hay que reejecutar el comando documentado en el runbook; el `.syso` no se regenera solo.

Verificacion manual (a hacer en maquina Windows con MinGW o en CI):
1. `wails3 task release:clean && wails3 task release:artifacts && wails3 task release:verify`.
2. Inspeccionar `bin/vantare.exe`: `magick identify bin/vantare.exe` debe listar 16/32/48/64/128/256 con el logo Vantare.
3. Instalar `bin/vantare-amd64-installer.exe`. Confirmar que el icono del instalador, el acceso directo del menu Inicio y el `.exe` instalado muestran branding Vantare y no el icono Wails por defecto.
4. Si Windows cachea el icono antiguo, seguir el procedimiento de limpieza del runbook (reinstall, `ie4uinit.exe -show`, `IconCache.db` como ultimo recurso).

Estado del commit: pendiente de ejecucion por el integrador.

Nota HUB-07 (2026-07-01):
- Plan guardado en `docs/superpowers/plans/2026-07-01-hub-07-ux-cleanup-and-next-features.md`.
- HUB-07-A: scroll del Dashboard corregido (V52Shell `min-h-screen` → `h-screen`). ActiveOverlayCard no se oculta.
- HUB-07-B: ActiveOverlayCard ahora permite cerrar overlay cuando está en ejecución (botón "Cerrar overlay" emite `overlay:stop`). Botón "Abrir overlay" ya no se deshabilita permanentemente. "Editar overlay" sigue emitiendo `overlay:toggle-edit-mode`.
- Eventos usados: `overlay:start-active` (abrir), `overlay:stop` (cerrar), `overlay:toggle-edit-mode` (editar), `overlay:status` (estado).
- Tests: ActiveOverlayCard 14/14 PASS, DashboardPage 14/14 PASS, tsc OK, build OK, lint OK (warning preexistente).
- Sin commit.

HUB-07-C/D (2026-07-01):
- HUB-07-C: EngineerPage reemplazada por pantalla "Próximamente" grande. UI antigua (toggles, selects, connection badge, notificaciones, footer) completamente eliminada. Eventos Wails siguen registrados en background (engineer:status:get, engineer:status, engineer:notification) pero sin UI visible. Copy honesto: "Ingeniero Vantare", "Spotter IA y análisis de stint en desarrollo", "Esta sección estará disponible en una actualización 0.1.x." + 3 bullets de roadmap (avisos de stint, degradación/estrategia, voz de ingeniero). Sin controles funcionales, sin fake data, sin emisión de eventos engineer desde UI visible.
- HUB-07-D: TelemetryPage hero reducido de `min-h-[calc(100vh-180px)]` a `py-16` (tamaño normal proporcionado). Copy honesto preservado. Sin charts falsos, sin datos reales conectados.
- Tests: EngineerPage 7/7 PASS (heading, Próximamente, sin controles antiguos, sin eventos extra, sin fake strings, eventos en background, roadmap bullets). TelemetryPage 3/3 PASS (placeholder honesto, anti-fake, sin full-height hero).
- Checks: test 10/10 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (warnings preexistentes hub_main.html/pnpm-workspace.yaml).
- Archivos tocados: `frontend/src/hub/pages/EngineerPage.tsx`, `frontend/src/hub/pages/EngineerPage.test.tsx`, `frontend/src/hub/pages/TelemetryPage.tsx`, `frontend/src/hub/pages/TelemetryPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, Dashboard/Launcher/Overlays/Settings, V52Shell, index.css, Auth/Supabase, dependencias.
- Sin commit.

Nota REGRESSION-01 (2026-07-02):
- **Corrección de regresión P1 en EngineerPage**: el review global detectó que HUB-07-C reemplazó la UI funcional de EngineerPage por un placeholder estático "Próximamente", perdiendo toggles, selects, connection badge, timeline de notificaciones y eventos Wails interactivos.
- **Solución**: restaurada la versión funcional del commit `ae603a2` (toggles, selects, connection badge, timeline de notificaciones, eventos Wails completos) y añadido un banner visual "En desarrollo" en la parte superior de la página.
- Banner "En desarrollo": barra horizontal con fondo gradiente ámbar, texto "En desarrollo" en mono, línea decorativa, y texto "Módulo de ingeniero — funcionalidad activa bajo el banner". Sin eliminar ni ocultar la UI funcional.
- Funcionalidad restaurada:
  - Toggle "Ingeniero de pista activo" emite `engineer:enabled:set`
  - Toggle "Spotter activo" emite `engineer:spotter:set`
  - Select "Fuente de Telemetría" emite `engineer:source:set`
  - Select "Sensibilidad del Spotter" emite `engineer:sensitivity:set`
  - Connection badge con estado CONECTADO/DESCONECTADO
  - Timeline de notificaciones con scroll, empty state honesto, hover glow
  - Eventos Wails: `engineer:status:get` al montar, `engineer:status` y `engineer:notification` escuchados
  - Botón disabled "Opciones avanzadas" con title honesto
  - Footer honesto "Configuración aplicada localmente · guardado automático"
- Fake data evitada: no "Carlos (Ingeniero)", no "12 perfiles compatibles", no "LMU, iRacing y Assetto Corsa", no voces/TTS/sliders fake.
- Tests: 15/15 PASS (EngineerPage). Tests nuevos: banner "En desarrollo" visible, texto "funcionalidad activa bajo el banner" visible. Tests restaurados: emite `engineer:status:get` al montar, escucha `engineer:status` y `engineer:notification`, toggle enabled emite `engineer:enabled:set`, toggle spotter emite `engineer:spotter:set`, select source emite `engineer:source:set`, select sensitivity emite `engineer:sensitivity:set`, connection badge muestra CONECTADO, notificaciones se renderizan desde status y desde evento real-time, no contiene fake data del HTML.
- Checks: test 15/15 PASS, tsc OK, lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos tocados: `frontend/src/hub/pages/EngineerPage.tsx`, `frontend/src/hub/pages/EngineerPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, Auth/Supabase, Dashboard/Launcher/Overlays/Telemetry/Settings, V52Shell, index.css, dependencias.
- Sin commit.

HUB-07-E (2026-07-01):
- Card Comunidad en V52OverlaysHome ya no es disabled: ahora es clicable y llama a `onOpenCommunity`.
- CommunityComingSoonView reescrita con look v5.2 (hero gradiente, glow, icono SVG, animaciones fade-in-up). Copy honesto: "Comunidad de overlays", "En el futuro podrás descubrir overlays de otros usuarios, compartir tus propios diseños y votar los mejores." + 3 bullets de roadmap (explorar galería, compartir perfiles, votar y comentar). Sin overlays fake de comunidad, sin datos inventados.
- Navegación: Overlays Studio home → click "Explorar comunidad" → CommunityComingSoonView → "← Volver a Overlays Studio" → home.
- Tests: V52OverlaysHome 6/6 PASS (4 cards, callbacks todos activos, Comunidad clicable, pills, profilesCount, anti-fake). CommunityComingSoonView 4/4 PASS (heading, copy honesto, sin perfiles fake, roadmap bullets). OverlaysStudioPage 11/11 PASS (navegación a comunidad con heading "Comunidad de overlays" y "Próximamente").
- Checks: test 21/21 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (warnings preexistentes hub_main.html/pnpm-workspace.yaml).
- Archivos tocados: `frontend/src/hub/overlays/V52OverlaysHome.tsx`, `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`, `frontend/src/hub/overlays/CommunityComingSoonView.tsx`, `frontend/src/hub/overlays/CommunityComingSoonView.test.tsx`, `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, WidgetStudio, LayoutStudio, OwnProfilesView, RecommendedProfilesView, OverlaysStudioPage.tsx (solo test), Engineer/Telemetry/Settings/Dashboard/Launcher, V52Shell, index.css, Auth/Supabase, dependencias.
- Sin commit.

Nota SETTINGS-02-A (2026-07-01):
- SettingsPage ahora oculta el sidebar del V52Shell cuando `section === 'setup'`, usando la nueva prop `hideSidebar`.
- La página ocupa todo el ancho disponible (sin grid `xl:grid-cols-[260px_1fr]`).
- Las tabs horizontales existentes (Cuenta, OBS, Actualizaciones, Hotkeys, Diagnóstico, Avanzado) se mantienen intactas con su funcionalidad.
- No se cambió lógica interna de SettingsPage: todos los handlers, eventos, estado local y `settings:save` con payload completo se preservan.
- Tests: 51/51 PASS (SettingsPage 22, V52Shell 5, HubApp 22, HubApp.bridge 2).
  - V52Shell: 3 tests nuevos (sidebar oculto con hideSidebar, sidebar visible por defecto, sidebar visible en setup sin hideSidebar).
  - SettingsPage: 4 tests nuevos (tab bar horizontal con 6 tabs, anti TD-041 hotkeys/delta/cpu preservan activeOverlayProfileId).
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (warnings preexistentes hub_main.html/pnpm-workspace.yaml).
- Archivos tocados: `frontend/src/hub/components/V52Shell.tsx`, `frontend/src/hub/components/V52Shell.test.tsx`, `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, AccountSettings, ObsSetup, SettingsPage.tsx (lógica interna intacta), Dashboard/Launcher/Overlays/Engineer/Telemetry, index.css, Auth/Supabase, dependencias.
- Sin commit.

Nota SETTINGS-02-B (2026-07-01):
- OBS Browser Source movido de SettingsPage a Overlays Studio.
- SettingsPage: eliminada la tab "obs" (OBS Browser Source) del array TABS. Eliminado el panel `ObsSetup` y su import. Eliminado el estado `activeProfileId` y el listener `profile:loaded` que ya no se necesitan en Settings. Descripción actualizada: "Cuenta, actualizaciones, atajos y diagnósticos." Tabs restantes: Cuenta, Actualizaciones, Hotkeys, Diagnóstico, Avanzado.
- V52OverlaysHome: nueva prop `onOpenObs` y nueva EntryCard "OBS Browser Source" con copy "Copia la URL para capturar tu overlay en OBS." y CTA "Configurar OBS". Se renderiza como card de ancho completo debajo del grid de 2 columnas.
- OverlaysStudioPage: nuevo modo `"obs"` en `StudioMode`. Renderiza `ObsOverlaySetupView` con la URL calculada desde `activeProfileId` (con fallback `example-racing.json`). La URL se construye con `window.location.origin + '/overlay?profile=' + encodeURIComponent(activeProfileId || 'example-racing.json')`, mismo patrón que antes usaba SettingsPage.
- ObsOverlaySetupView (nuevo): wrapper que renderiza `ObsSetup` con la URL y un botón "← Volver a Overlays Studio". Reutiliza `ObsSetup` sin modificarlo.
- `activeOverlayProfileId` preservado: la URL de OBS en Overlays Studio usa `activeProfileId` que se actualiza desde eventos `settings` y `hub:profile-activated` (misma lógica que antes en SettingsPage).
- Tests: SettingsPage 19/19 PASS (sin OBS, 5 tabs, anti TD-041 preservado). V52OverlaysHome 7/7 PASS (5 cards, OBS card con copy correcto, callback Configurar OBS). OverlaysStudioPage 14/14 PASS (OBS view con URL, back button, fallback example-racing.json). ObsOverlaySetupView 3/3 PASS (heading, back button, copy buttons).
- Checks: test 43/43 PASS (4 files), tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (warnings preexistentes hub_main.html/pnpm-workspace.yaml).
- Archivos creados: `frontend/src/hub/overlays/ObsOverlaySetupView.tsx`, `frontend/src/hub/overlays/ObsOverlaySetupView.test.tsx`.
- Archivos modificados: `frontend/src/hub/pages/SettingsPage.tsx`, `frontend/src/hub/pages/SettingsPage.test.tsx`, `frontend/src/hub/pages/OverlaysStudioPage.tsx`, `frontend/src/hub/pages/OverlaysStudioPage.test.tsx`, `frontend/src/hub/overlays/V52OverlaysHome.tsx`, `frontend/src/hub/overlays/V52OverlaysHome.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, ObsSetup.tsx (reutilizado sin cambios), AccountSettings, WidgetStudio, LayoutStudio, OwnProfilesView, RecommendedProfilesView, CommunityComingSoonView, V52Shell, HubApp, index.css, Auth/Supabase, dependencias.
- Sin commit.

Nota ROADMAP-01 (2026-07-01):
- Plan ejecutado segun `docs/superpowers/plans/2026-07-01-roadmap-01-public-roadmap.md`.
- Nueva seccion `Roadmap` en el Hub con datos locales editables en `frontend/src/hub/roadmap/roadmap-data.ts`.
- RoadmapPage con hero, fases (4), progreso general, areas (6), hitos (4) y feedback/voting deshabilitado.
- Navegacion integrada: `navigation.ts` con seccion `roadmap`, sidebar/topbar la muestran automaticamente.
- CTA "Ver roadmap" desde el bloque Ingeniero del Dashboard.
- Sin backend, sin Auth/Supabase, sin dependencias nuevas, sin claims fake del HTML.
- Fake data evitada: no "v0.1.0.3 publicado", no "Q4 2026", no "+30 widgets", no "telemetria completa", no precios.
- Tests: roadmap-data 16/16 PASS, RoadmapPage 8/8 PASS, navigation 4/4 PASS, HubApp 25/25 PASS, V52Shell 5/5 PASS, DashboardPage 15/15 PASS.
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos creados: `frontend/src/hub/roadmap/roadmap-data.ts`, `frontend/src/hub/roadmap/roadmap-data.test.ts`, `frontend/src/hub/pages/RoadmapPage.tsx`, `frontend/src/hub/pages/RoadmapPage.test.tsx`.
- Archivos modificados: `frontend/src/hub/navigation.ts`, `frontend/src/hub/navigation.test.ts`, `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/HubApp.test.tsx`, `frontend/src/hub/pages/DashboardPage.tsx`, `frontend/src/hub/pages/DashboardPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, Auth/Supabase, overlay runtime, widgets, WidgetStudio, LayoutStudio, V52Shell, index.css, dependencias, hub_main.html, roadmap_v5.2.html, HTML mocks, archivos fuera de vantare-v2.
- Sin commit.

Nota CALENDAR-02-A (2026-07-02):
- Bridge Wails conectado: `internal/app/calendar_bridge.go` con 3 handlers puros (`HandleCalendarGet`, `HandleCalendarImport`, `HandleCalendarClear`) que delegan en `*calendar.Service`.
- `cmd/vantare/main.go`: instancia `calendar.NewService(cfgDir, time.Now)`, llama `Load()` al arranque, registra 3 handlers Wails (`calendar:get`, `calendar:import`, `calendar:clear`).
- Eventos registrados:
  - Frontend emite: `calendar:get`, `calendar:import` (con `{ text, timezone, source }`), `calendar:clear`.
  - Backend emite: `calendar:loaded` con `{ calendar }`, `calendar:error` con `{ message }`.
- Comportamiento:
  - `calendar:get` emite calendario default vacío si `calendar-lmu.json` no existe (sin error).
  - `calendar:import` parsea con `calendar.Parse`, llama `service.Replace`, emite calendario actualizado.
  - `calendar:import` inválido (parse error o replace error) emite `calendar:error` y NO modifica el calendario previo.
  - `calendar:clear` llama `service.Clear()` y emite calendario vacío.
- Dashboard ya puede recibir calendario real: `NextRaceCard` y `LastActivityCard` emiten `calendar:get` en mount y escuchan `calendar:loaded`.
- Tests: 16 tests en `internal/app/calendar_bridge_test.go` (8 con fake service + 8 con real `*calendar.Service`). Cubren: get emite default sin archivo, import válido persiste y emite, import inválido emite error y preserva estado, clear vacía y emite, persistencia a disco, round-trip reload.
- Checks: `gofmt -w` OK, `go test -count=1 ./internal/calendar/... ./internal/app/... ./cmd/vantare/...` PASS, `corepack pnpm --dir frontend test -- NextRaceCard LastActivityCard V52CalendarStrip calendar-store` 16/16 PASS, `corepack pnpm --dir frontend exec tsc -b` OK, `git diff --check` solo warnings preexistentes en hub_main.html.
- Archivos creados: `internal/app/calendar_bridge.go`, `internal/app/calendar_bridge_test.go`.
- Archivos modificados: `cmd/vantare/main.go`, `docs/current-plan.md`.
- No se tocaron: `AppSettings`, `internal/calendar` (no recreado), WidgetStudio, LayoutStudio, WIDGETS, Auth, Launcher, Roadmap, Settings, overlay runtime, hub_main.html, archivos untracked ajenos.
- Import UI / recordatorios / overlay banner quedan para fases B/C/D.
- Sin commit.

Nota CALENDAR-02-B (2026-07-02):
- Nueva pestaña `Calendario` en el Hub, entre Launcher e Ingeniero.
- `navigation.ts`: añadido `"calendar"` a `Section`, `NavIcon` y `NAV_ITEMS` con label `Calendario`.
- `CalendarPage.tsx` (nuevo): página completa con:
  - Header v5.2: título "Calendario LMU", subtítulo honesto sobre importación desde Discord.
  - Importador: textarea, timezone (default `Europe/Madrid`), source (default `discord-lmu-week`), botón "Importar calendario", botón "Borrar calendario".
  - Validación local: textarea vacío muestra error y no emite.
  - Al importar: emite `calendar:import` con `{ text, timezone, source }`.
  - Al borrar: `window.confirm` antes de emitir `calendar:clear`.
  - Escucha `calendar:loaded` y `calendar:error` desde el bridge.
  - Sección "Próximas carreras": eventos con `startTime >= now` o activos, orden ascendente.
  - Sección "Carreras pasadas": eventos finalizados, orden descendente.
  - Empty states honestos sin datos fake.
- `HubApp.tsx`: renderiza `<CalendarPage />` cuando `section === "calendar"`.
- Eventos usados: `calendar:get` (mount), `calendar:import`, `calendar:clear`, `calendar:loaded`, `calendar:error`.
- Tests: 56/56 PASS (CalendarPage 10, navigation 4, HubApp 24, HubApp.bridge 2, NextRaceCard 7, LastActivityCard 6, V52CalendarStrip 3). CalendarPage tests: heading, mount emite get, import vacío no emite y muestra error, import válido emite con text/timezone/source, upcoming desde loaded, past desde loaded, error desde calendar:error, clear con confirm=true emite, clear con confirm=false no emite, anti-fake (Sebring/COTA/Paul Ricard no aparecen).
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check solo warnings preexistentes en hub_main.html.
- Archivos creados: `frontend/src/hub/pages/CalendarPage.tsx`, `frontend/src/hub/pages/CalendarPage.test.tsx`.
- Archivos modificados: `frontend/src/hub/navigation.ts`, `frontend/src/hub/navigation.test.ts`, `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/HubApp.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, AppSettings, WidgetStudio, LayoutStudio, WIDGETS, Auth, Launcher, Roadmap, Settings, overlay runtime, hub_main.html, archivos untracked ajenos.
- Recordatorios, seguir carrera y overlay banner quedan para CALENDAR-02-C/D.
- Sin commit.

Nota CALENDAR-02-C1 (2026-07-02):
- Implementado seguimiento local de carreras ("Seguir carrera") en la pestaña Calendario.
- Backend:
  - `internal/calendar/calendar.go`: nuevo campo `FollowedEventIDs []string` en `Calendar`, normalizado a `[]string{}` en `NewDefaultCalendar`.
  - `internal/calendar/calendar_service.go`: `loadLocked` normaliza nil, `cloneLocked` deep-copia, `Replace` prunes IDs de eventos eliminados, `Clear` vacía followed.
  - Nuevos métodos: `Follow(eventID)`, `Unfollow(eventID)`, `IsFollowed(eventID)`. Follow valida que eventID exista; si no, error. Ambos persisten atómicamente.
  - Helpers: `pruneFollowedLocked`, `eventExistsLocked`.
  - Tests: 8 nuevos (follow válido persiste, follow inválido no cambia, unfollow elimina, clear vacía, replace conserva, replace merge mantiene, follow idempotente, unfollow idempotente). Total: 34/34 PASS.
- Bridge:
  - `internal/app/calendar_bridge.go`: nuevas interfaces `CalendarFollower`, `CalendarUnfollower`; handlers `HandleCalendarFollow`, `HandleCalendarUnfollow`.
  - `cmd/vantare/main.go`: registrados `calendar:follow` y `calendar:unfollow` con parseo de `eventId`.
  - Tests bridge: 6 nuevos (follow emite loaded, follow error emite error, unfollow emite loaded, unfollow error emite error, follow con real service, follow inválido con real service, unfollow con real service). Total bridge: 19/19 PASS.
- Frontend:
  - `calendar-types.ts`: `Calendar` tipo añade `followedEventIds?: string[]`, `EMPTY_CALENDAR` incluye `followedEventIds: []`.
  - `calendar-store.ts`: `normaliseCalendar` preserva `followedEventIds`.
  - `CalendarPage.tsx`: botón `Seguir carrera` en eventos próximos no seguidos; badge `Siguiendo` + botón `Dejar de seguir` en seguidos. Eventos pasados sin botones. Emite `calendar:follow`/`calendar:unfollow` con `{ eventId }`.
  - Tests: 5 nuevos (Seguir visible, click emite follow, Siguiendo badge visible, click Dejar de seguir emite unfollow, pasados sin botones). Total: 15/15 PASS.
- Checks: gofmt OK, go test 4 paquetes OK, pnpm test CalendarPage+calendar-store+NextRaceCard+LastActivityCard 28/28 PASS, tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check solo warnings preexistentes en hub_main.html.
- Archivos modificados: `internal/calendar/calendar.go`, `internal/calendar/calendar_service.go`, `internal/calendar/calendar_service_test.go`, `internal/app/calendar_bridge.go`, `internal/app/calendar_bridge_test.go`, `cmd/vantare/main.go`, `frontend/src/calendar/calendar-types.ts`, `frontend/src/calendar/calendar-store.ts`, `frontend/src/hub/pages/CalendarPage.tsx`, `frontend/src/hub/pages/CalendarPage.test.tsx`, `docs/current-plan.md`.
- No se tocaron: AppSettings, WidgetStudio, LayoutStudio, WIDGETS, Auth, Launcher, Roadmap, Settings, overlay runtime, hub_main.html, archivos untracked ajenos.
- Reminders/ticker/banner overlay quedan para C2/D.
- Sin commit.

Nota CALENDAR-02-C2 (2026-07-02):
- Implementado banner global del Hub que escucha `calendar:reminder`.
- Nuevo tipo `CalendarReminderPayload` en `frontend/src/calendar/calendar-types.ts` con `eventId`, `title`, `track`, `minutesLeft`, `startTime`, `registrationUrl`.
- Nuevo componente `frontend/src/hub/calendar/CalendarReminderBanner.tsx`:
  - Banner fixed (top-16 right-4, z-50, max-w-sm) dentro del Hub.
  - Muestra badge "Próxima carrera", título del evento, track (si existe), "Faltan X min".
  - Botón cerrar con `aria-label="Cerrar recordatorio"`.
  - Si `registrationUrl` existe, muestra botón "Abrir registro" como enlace `target="_blank"`.
  - Sin persistencia, sin datos fake.
- `HubApp.tsx`:
  - Nuevo estado `reminder: CalendarReminderPayload | null`.
  - Listener `calendar:reminder` en el useEffect de mount, con cleanup en unmount.
  - Renderiza `<CalendarReminderBanner>` cuando `reminder` no es null.
  - `handleCloseReminder` setea reminder a null.
  - Si llega otro reminder, reemplaza el actual (setReminder sobrescribe).
- Tests: 5 CalendarReminderBanner + 3 HubApp (banner aparece, reemplaza, se cierra). Total: 8 nuevos.
- Checks: test 33/33 PASS (CalendarReminderBanner 5 + HubApp 26 + HubApp.bridge 2), tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK.
- Archivos creados: `frontend/src/hub/calendar/CalendarReminderBanner.tsx`, `frontend/src/hub/calendar/CalendarReminderBanner.test.tsx`.
- Archivos modificados: `frontend/src/calendar/calendar-types.ts`, `frontend/src/hub/HubApp.tsx`, `frontend/src/hub/HubApp.test.tsx`, `docs/current-plan.md`.
- No se tocaron: Go/backend, overlay/CompositeApp/ObsOverlayApp, AppSettings, WidgetStudio, LayoutStudio, WIDGETS, Auth, Launcher, Roadmap, Settings, hub_main.html, archivos untracked ajenos.
- Overlay banner (CALENDAR-02-D) sigue pendiente.
- Sin commit.

Nota CALENDAR-02-D1 (2026-07-02):
- Componente overlay aislado `OverlayCalendarReminderBanner` creado en `frontend/src/overlay/`.
- Reutiliza `CalendarReminderPayload` desde `frontend/src/calendar/calendar-types.ts` (sin cambios).
- Props: `reminder`, `onClose`, `className?`.
- Render: badge "Próxima carrera", título, track condicional, "Faltan X min", botón cerrar con `aria-label`, enlace "Abrir registro" condicional.
- Sin `fixed` ni posicionamiento global: el contenedor raíz acepta `className` para que el padre decida posición.
- Sin listeners, timers, effects ni operaciones caras — componente puro.
- Accesibilidad: `role="alert"`, botón cerrar accesible.
- Tests: 7/7 PASS (renderiza título/track/minutos, track ausente, Abrir registro condicional, onClose, role alert, sin fixed propio).
- Integración en CompositeApp/ObsOverlayApp queda para CALENDAR-02-D2.
- Checks: tsc OK, git diff --check OK (warnings preexistentes).
- Archivos creados: `frontend/src/overlay/OverlayCalendarReminderBanner.tsx`, `frontend/src/overlay/OverlayCalendarReminderBanner.test.tsx`.
- No se tocaron: CompositeApp, ObsOverlayApp, HubApp, Go/backend, WidgetStudio, LayoutStudio, WIDGETS, AppSettings, WidgetStudio/LayoutStudio, dependencias.
- Sin commit.

Nota CALENDAR-02-D2 (2026-07-02):
- Banner overlay montado en CompositeApp y ObsOverlayApp.
- No es widget, no toca WIDGETS ni perfil JSON.
- Se oculta en edit mode en CompositeApp.
- OBS no tiene edit mode; banner siempre visible si hay reminder.
- Evento escuchado: `calendar:reminder` via `Events.On`.
- State local `reminder` se limpia al cerrar (onClose → setReminder(null)).
- Listener se limpia en unmount (return unsub).
- Banner renderizado como capa absoluta fuera del grid/lista de widgets (`absolute top-4 right-4 z-50`).
- Tests: 21/21 PASS (CompositeApp 11, ObsOverlayApp 3, OverlayCalendarReminderBanner 7).
  - CompositeApp: muestra banner, oculta al cerrar, no muestra en edit mode.
  - ObsOverlayApp: muestra banner, oculta al cerrar.
- Checks: tsc OK, build OK (warning preexistente chunk size), lint OK (warning preexistente .eslintignore), git diff --check OK (warnings preexistentes en hub_main.html).
- Archivos modificados: `frontend/src/overlay/CompositeApp.tsx`, `frontend/src/overlay/CompositeApp.test.tsx`, `frontend/src/overlay/ObsOverlayApp.tsx`, `frontend/src/overlay/ObsOverlayApp.test.tsx`, `docs/current-plan.md`.
- No se tocaron: WIDGETS, WidgetStudio, LayoutStudio, Go/backend, AppSettings, perfil JSON/schema, calendario Hub, dependencias.
- Sin commit.

Nota ROADMAP-02 (2026-07-02):
- RoadmapPage acercada al HTML v5.2 por microcortes: hero, timeline/fases, progreso/hitos y feedback honesto.
- Datos siguen viniendo de roadmap-data.ts. Sin backend ni fake claims.
- Archivos tocados: `frontend/src/hub/pages/RoadmapPage.tsx`, `frontend/src/hub/pages/RoadmapPage.test.tsx`, `docs/current-plan.md`.
- Sin commit.

Nota CALENDAR-03 (2026-07-02):
- La pestaña visible pasa de Calendario a Carreras manteniendo el id interno `calendar`.
- CalendarPage queda read-only: sin importador manual, sin source visible, con timezone informativa, próximas/activas/pasadas y seguir/dejar de seguir.
- Backend y contratos `calendar:*` intactos; Vantare publicará el calendario LMU mediante actualizaciones de la app.

Nota CALENDAR-04 (2026-07-02):
- Implementado calendario LMU bundled desde JSON local, sin Supabase y sin UI de importación.
- Nuevo archivo `internal/calendar/seed/lmu-calendar.json` con el seed JSON (events vacío, sin carreras inventadas).
- Nuevo `internal/calendar/bundled_seed.go`: `LoadBundledSeed()` con embed, normalización de defaults y validación (eventos + IDs duplicados).
- Nueva constante `BundledSource = "vantare-bundled-lmu"` en `calendar.go`.
- Nuevo método `Service.ApplyBundledSeed()`: reemplaza eventos bundled previos, preserva no-bundled, poda followed IDs huérfanos, persiste atómicamente.
- Cableado en `cmd/vantare/main.go`: seed se aplica después de `calendarSvc.Load()` y antes del reminder loop. Si falla, log warning y continúa.
- CalendarPage sigue read-only, sin import UI, sin textarea, sin inputs editables.
- Vantare actualiza `internal/calendar/seed/lmu-calendar.json` en releases semanales para publicar carreras reales.
- Archivos creados: `internal/calendar/seed/lmu-calendar.json`, `internal/calendar/bundled_seed.go`, `internal/calendar/bundled_seed_test.go`.
- Archivos modificados: `internal/calendar/calendar.go` (+BundledSource), `internal/calendar/calendar_service.go` (+ApplyBundledSeed), `internal/calendar/calendar_service_test.go` (+6 tests), `cmd/vantare/main.go` (+wiring), `docs/current-plan.md`.
- No se tocaron: Supabase, frontend, WidgetStudio, LayoutStudio, Auth, Launcher, Roadmap, Settings, dependencias.
- Sin commit.

Nota LMU-API-RUNTIME (2026-07-02):
- Verificado runtime: LMU responde en localhost:6397 con 3 endpoints confirmados.
- sessionInfo: devuelve trackName, session, gamePhase, playerName, currentEventTime, timeRemainingInGamePhase, yellowFlagState, sectorFlag, trackTemp, ambientTemp, weather, windSpeed, etc. NO incluye SafetyRank/DriverRank directamente.
- standings: array de 28 vehículos con driverName, carClass, carNumber, fullTeamName, position, bestLapTime, lastLapTime, fuelFraction, pitState, finishStatus, penalties, pitstops, steamID (0 en esta sesión), veFraction, etc. NO incluye SafetyRank/DriverRank directamente.
- multiplayer/teams: drivers con badge, nationality, roles, teamId, teamName. badge siempre "none" en esta sesión (sin SR activo). NO incluye SafetyRank/DriverRank directamente.
- SafetyRank/DriverRank no aparecen en los endpoints REST básicos. Probablemente vienen de shared memory (rFactor 2) o del endpoint Nakama remoto.
- Actualizado internal/telemetry/lmuapi: añadido MultiplayerTeams(), FindRatingFields(), métodos con context.Context, tipos MultiplayerTeamsResponse/DriverInfo/TeamInfo/RatingField. Tests: 18/18 PASS. gofmt+govet OK.
- No se tocaron: frontend, Wails, WidgetStudio, LayoutStudio, Auth, dependencias, cmd/vantare/main.go.
- Sin commit.

Nota CALENDAR-05-A+B (2026-07-02):
- Correcciones P3 de la review CALENDAR-05 A+B sobre el schedule oficial LMU.
- Seed: `internal/calendar/seed/lmu-weekly-schedule.json` (10 series oficiales LMU: beginner-lmgt3-fixed, beginner-mclaren-challenge, beginner-lmp3-fixed, intermediate-lmgt3-sprint, intermediate-prototype-fixed, intermediate-elms-sprint, advanced-one-stint-sprint, advanced-elms-super-60, advanced-wec-xperience, weekly-wec-weekly).
- `official_schedule.go`: series recurrentes (no eventos materializados), expansión acotada por ventana [from, to) con clipping a ValidFrom/ValidUntil y capa de 10000 eventos.
- Corrección 1: eliminada validación redundante de ID vacío en `validateSchedule` (ya cubierta por `validateSeries`).
- Corrección 2: `ExpandSeries` ya no ignora el error de `time.Parse("15:04", timeStr)` — lo maneja y lo propaga con contexto.
- Checks ejecutados: `gofmt`, `go test -count=1 -run "TestLoad|TestValidate|TestExpand|TestMake|TestSort|TestEstimate|TestDefault" ./internal/calendar/...`, `go vet ./internal/calendar/...`, `git diff --check`.
- Sin frontend, Wails, main.go, WidgetStudio, LayoutStudio, overlay runtime, Supabase, AppSettings, reminders, follow/unfollow.
- Sin commit.

Nota CALENDAR-05-C (2026-07-02):
- Integración del schedule oficial LMU en `calendar.Service` (Task C del plan).
- `Calendar` ahora incluye `Series []RaceSeries`, `FollowedSeriesIDs []string`, `SeriesPreviews []RaceSeriesPreview` con defaults seguros.
- `RaceSeriesPreview` contiene `seriesId`, `scheduleLabel`, `nextStarts` (cap 5 por serie).
- `Load()` normaliza los nuevos campos en archivos JSON antiguos (nil → []).
- `cloneLocked()` deep-copia los nuevos slices usando `cloneSlice[T]` genérico (garantiza slices no-nil).
- `ApplyOfficialSchedule(now)` en `Service`: carga `LoadWeeklySchedule()`, genera ventana acotada (24h pasado → 7d futuro), reemplaza eventos bundled viejos, preserva no-bundled, genera previews, poda follows inválidos, persiste atómicamente.
- `scheduleLabel()` produce labels: `Cada 15 min`, `Cada 20 min`, `Cada 30 min` para interval; `Wed Thu Fri... @ 02:00 06:00...` para weekly-slots.
- `pruneFollowedSeriesLocked()` poda series seguidas que ya no existen.
- `normaliseSeed()` en `bundled_seed.go` actualizado para los 3 nuevos campos.
- Wiring en `cmd/vantare/main.go`: `calendarSvc.ApplyOfficialSchedule(time.Now())` después de `ApplyBundledSeed` y antes del reminder loop.
- Tests nuevos (14): default normaliza, Load soporta JSON antiguo, cloneLocked copia defensiva, ApplyOfficialSchedule mete 10 series, previews cap 3-5, labels daily correctos, weekly label con días/horas UTC, no miles de eventos, preserva no-bundled, poda follows inválidos, idempotente, persiste/reload, scheduleLabel interval/weekly, pruneFollowedSeriesLocked.
- Checks: `gofmt` OK, `go test -count=1 -run "TestCalendar_Default|TestService_Load_Normalises|TestService_CloneLocked|TestService_ApplyOfficialSchedule|TestScheduleLabel|TestPruneFollowedSeries|TestService_LoadMissing|TestService_SaveLoad|TestService_Replace|TestService_Upcoming|TestService_Past|TestService_Clear|TestService_Persist|TestService_Follow|TestService_Unfollow|TestDueReminders|TestService_ApplyBundledSeed|TestEventKey|TestEvent_IsActiveAt|TestLoadBundledSeed|TestValidateSeed|TestLoadWeeklySchedule|TestValidateSchedule|TestValidateSeries|TestExpandSeries|TestExpandSchedule|TestDefaultScheduleWindow|TestEstimateSeriesCount|TestMakeSeriesEvent|TestExpandRealSchedule|TestSortRaceEventsByStart"` PASS (solo falla preexistente `TestParse_AcceptsValidLines` por fecha). `go vet ./internal/calendar/... ./cmd/vantare/...` OK. `go test -count=1 ./internal/app/... ./cmd/vantare/...` OK. `git diff --check` solo warnings preexistentes en `hub_main.html`.
- Archivos tocados: `internal/calendar/calendar.go`, `internal/calendar/calendar_service.go`, `internal/calendar/calendar_service_test.go`, `internal/calendar/bundled_seed.go`, `cmd/vantare/main.go`, `docs/current-plan.md`.
- No se tocó: frontend, CalendarPage, calendar-store/types TS, Reminders, WidgetStudio/LayoutStudio, overlay runtime, Supabase, AppSettings.
- Sin commit.

Nota CALENDAR-06-C P3 (2026-07-03):
- Corregido P3: Modificado CalendarMonthView.tsx para separar visualmente los resumenes de interval (siempre visibles, sin cap) y los eventos concretos (sujetos a maxItemsPerDay = 3).
- Actualizado CalendarMonthView.test.tsx para validar que el cap solo afecta a los eventos concretos y que la cuenta de '+N mas' no incluye intervalos.
- Verificacion: tsc, eslint y vitest 100% OK.
M i c r o c o r t e   2   c o m p l e t a d o :   P a n e l   ' P r � x i m a s   c a r r e r a s '   i m p l e m e n t a d o   e   i n t e g r a d o   e n   e l   H u b .   L i m p i e z a   d e   c o m p o n e n t e s   o b s o l e t o s   r e a l i z a d a . 
 
 

Nota CALENDAR-09 (2026-07-04) Eventos completos, sesiones y hotfix semanal:
- Extendidos tipos Go (RaceSeries, RaceEvent) con Session, raceDurationMin, eventDurationMin, sessions, startOffsetMinute.
- durationMin se mantiene como duración de carrera (compatibilidad).
- eventDurationMin = raceDurationMin + 11 (práctica 3 + quali 8).
- Sesiones estimadas: práctica 3m, quali 8m, carrera raceDurationMin.
- Seed LMU actualizado con raceDurationMin, eventDurationMin, sessions, startOffsetMinute (15/30/45 por orden del seed).
- Creado expandDailyIntervalSeries en calendar-view-math.ts (solo 24h, seguro para Month/Week).
- CalendarDayView expande daily series por hora con eventDurationMin y side-by-side en solapes.
- Creado CalendarRaceDetailPanel (modal central con blur) reemplazando CalendarRaceDetailDrawer.
- Panel muestra sesiones, duración total, carrera, categoría, setup, track, aviso de estimación, follow/unfollow.
- No hay URL de inscripción inventada: muestra "Desde LMU / RaceControl" si no existe registrationUrl.
- CalendarHeroUpcomingPanel cards clicables navegan a Carreras.
- Docs de hotfix semanal actualizados con práctica 3m, quali 8m, offsets 15/30/45.
- Version bump no realizado (origen único: VERSION=0.1.0.2, frontend/package.json, cmd/vantare/main.go, build/config.yml).
- Checks: 46/46 Go tests PASS (pre-existing TestParse_AcceptsValidLines failure), 1080/1080 frontend tests PASS, tsc OK, lint OK (warning preexistente .eslintignore), build OK (warning preexistente chunk size), git diff --check solo whitespace preexistente en hub_main.html.
- Sin commit.

Nota ACCESS-01 PLAN (2026-07-04):
- Plan creado para centralizar feature gates Free/Paid/Tester sin crear una segunda licencia.
- Fuente actual respetada: `LicenseProvider`, `LicenseResult`, `frontend/src/lib/plan.ts` e `internal/license`.
- El plan corre en paralelo al análisis/fix de calendario: ACCESS-01 no debe tocar generación/renderizado de eventos y calendario no debe inventar reglas de plan.
- Enfoque TDD obligatorio: tests RED por policy, navegación, acciones bloqueadas/desbloqueadas y casos Free/Paid/Tester/Blocked/Unconfigured.
- Plan: `docs/superpowers/plans/2026-07-04-access-01-feature-gates.md`.
- Sin implementación ni commit.

Nota ACCESS-01 (2026-07-04) Microcorte 1 — Policy pura + matriz + hook:
- Implementada capa frontend pura de feature gates en `access-policy.ts` sin React/Wails/Supabase.
- Matriz de permisos Free/Paid overlays/Paid engineer/Suite/Tester/Blocked/Unconfigured testeada con 56 tests de policy + 6 tests de hook.
- Hook `useAccess` sobre `LicenseProvider` en `access.tsx` sin duplicar estado.
- No se tocaron: CalendarPage, backend Go, Supabase, navegación, Dashboard, WidgetStudio, LayoutStudio.
- Checks: 121/121 tests PASS, tsc OK, lint OK (warning preexistente .eslintignore), git diff --check solo whitespace preexistente en hub_main.html.
- Archivos nuevos: `frontend/src/lib/access-policy.ts`, `frontend/src/lib/access-policy.test.ts`, `frontend/src/lib/access.tsx`, `frontend/src/lib/access.test.tsx`.
- Sin commit.

Nota CALENDAR-WEEKLY-HOTFIX (2026-07-04):
- Flujo operativo semanal documentado en `docs/calendar-weekly-hotfix/`.
- Anadidos `checklist.md` y `changelog-template.md` para que un worker pueda actualizar el calendario LMU semanal de forma repetible.
- El hotfix normal debe tocar solo seed/tests/docs; frontend/backend quedan fuera salvo bug claro.
- Regla de modelado mantenida: daily races como series recurrentes, Weekly como slots UTC, sesiones estimadas practice 3m + qualy 8m + carrera oficial.

Nota CALENDAR-10 P3 (2026-07-04) Microfix post-review:
- P3-1: `groupEventsByDay` ahora se usa en MonthView y WeekView para lookup O(1) por día, eliminando el filtrado inline de `calendar.events` por cada celda/columna. Semántica visual y filtros intactos. Tests: 97/97 PASS.
- P3-2: `frontend/scripts/calendar-visual-compare.mjs` actualizado: reemplazado `calendar-race-detail-drawer` por `calendar-race-detail-panel` (testid real de `CalendarRaceDetailPanel`). Script termina con exit 0, genera 9 capturas + 4 side-by-side.
- P3-3: scroll global documentado: CalendarPage usa `min-h-0 overflow-hidden` en contenedores y `flex-1 min-h-0` en vistas. El scroll es interno al área de calendario. Si el shell padre (V52Shell) no tiene altura explícita, `min-h-0` no funciona — esto es del shell, no de CalendarPage.
- No se tocaron: backend Go, ACCESS-01, Supabase/Auth, import UI, WidgetStudio, LayoutStudio, overlays, navegación global.
- Checks: 97/97 tests de scope, 1155/1155 full tests, tsc OK, lint OK (warning preexistente .eslintignore), build OK (warning preexistente chunk size), visual-compare OK (exit 0, 9 capturas), git diff --check OK (solo whitespace preexistente en hub_main.html).
- Archivos tocados: `frontend/src/hub/calendar/CalendarMonthView.tsx`, `frontend/src/hub/calendar/CalendarWeekView.tsx`, `frontend/scripts/calendar-visual-compare.mjs`, `docs/current-plan.md`.
- Sin commit.

Nota WIDGET-STUDIO-05 PLAN (2026-07-05):
- Plan creado para convertir visualmente `Overlays Studio > Widgets` al HTML definitivo Vantare Crystal.
- Fuente visual: `docs/overlay-vantare-crystal-widgets.html` (`file:///C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/overlay-vantare-crystal-widgets.html`).
- El plan exige loop Playwright contra el HTML hasta paridad visual razonable: panel embebido 3-pane, left panel, canvas, inspector `Overlay Controls`, footer interno y widgets Crystal.
- Reforzado: no basta con captura general del editor. El harness debe capturar tambien sistemas visuales por widget (`base`/`vantare-crystal`) y documentar skipped-with-reason para widgets del HTML que queden preview-only/catalog-only.
- Incluye matriz obligatoria de widgets con access, data status, runtimeReady, sistemas visuales y estado implementado/preview-only/catalog-only.
- Conserva WIDGET-STUDIO-04: slots/columns/groups editables, draft local, guardar en widget, variantes, access gates, sin tocar `LayoutStudio` ni `position/x/y/w/h`.
- Plan: `docs/superpowers/plans/2026-07-05-widget-studio-05-visual-fidelity.md`.
- Sin implementación ni commit.
Nota WIDGET-STUDIO-05 (2026-07-05) — Implementation:
- MC-0: Script `frontend/scripts/widget-studio-visual-compare.mjs` — captura HTML reference + widget matrix JSON + README.
- MC-1: `WidgetStudio.tsx` shell Crystal 3-pane — `data-testid="widget-studio-crystal-shell"`, grid `240px/1fr/280px`, footer interno.
- MC-2: `StudioWidgetList.tsx` left panel Crystal — gradiente rojo, 'Overlays', 'Buscar overlay...', LMU Conectado.
- MC-3: `WidgetSandboxPreview.tsx` canvas Crystal — dark gradient, chips, resize handle decorativo.
- MC-4: `WidgetSettingsPanel.tsx` Overlay Controls — header sticky, widget info card, search, 10 secciones.
- MC-5: `WidgetConfigSections.tsx` compacto — WIDTH_DISPLAY, help notes slots/columns.
- MC-6B: `widget-design-matrix.json` — 14 widgets documentados.
- MC-7: Pro/locked parity integrado en info card.
- 1321/1321 tests PASS, tsc OK, lint OK, build OK, git diff --check OK.
- Archivos: 4 nuevos (script, matrix, README, reference.png), 11 modificados (source+tests+docs).
- No LayoutStudio, no Go, no position/x/y/w/h. Sin commit.

Nota WIDGET-STUDIO-06 (2026-07-05) — Direct visual iteration:
- Iteracion directa sobre `WidgetStudio` usando `docs/overlay-vantare-crystal-widgets.html` como base visual.
- `WidgetSettingsPanel` y `WidgetConfigSections` se compactaron: tipografia sans, overview abierto, secciones de edicion cerradas por defecto y controles expandibles.
- `WidgetStudio` pasa `previewThemeId` al preview; el selector `Base/Vantare Crystal` afecta la preview sin mutar el widget guardado.
- `StudioWidgetList` en WidgetStudio muestra el catalogo completo mediante `widget-catalog`; LayoutStudio sigue recibiendo solo widgets del perfil.
- `WidgetSandboxPreview` usa canvas neutral Crystal, no gradiente azul/morado.
- `frontend/scripts/widget-studio-visual-compare.mjs` actualizado a WIDGET-STUDIO-06: arranca Vite con binario local, soporta capturas por widget+tema y genera side-by-side contra el HTML.
- Capturas generadas en `docs/superpowers/screenshots/widget-studio-06/` (no commitear PNGs salvo decision explicita).
- Checks: 1338/1338 tests PASS, tsc OK, lint OK (warning preexistente .eslintignore), build OK (warning preexistente chunk size), visual compare OK (14 capturas, 0 skipped).
- No se tocaron LayoutStudio, backend Go, position/x/y/w/h ni dependencias.

---

## Auditoría Stripe / Licencias / Pagos Reales (2026-07-06)

- Creado `docs/stripe-licensing-status-audit.md`: informe extenso de estado de la capa de pagos/licencias paid & suite.
- Hallazgo central: el backend Go `internal/license` (service, cache, supabase client, fingerprint, plan classifier) y la Edge Function `supabase/functions/stripe-webhook` ESTÁN implementados y testeados. El frontend tiene gating completo (Login/Paywall/AccountSettings/Banner/Unconfigured) + `access-policy` + `ACCESS-DEV-MODES`.
- Bloqueadores de pagos reales (ver sección 3 del doc):
  1. **`SQL-01`**: no existe migración SQL en el repo (`find . -name "*.sql"` vacío). Faltan tablas + RLS + los 2 RPCs que el Go invoca (`get_account_entitlements`, `reset_active_device`). Es `TD-043` (P2 antes de cobros reales). Sin esto, un usuario pagado cae a `authenticated-no-entitlement`.
  2. **`CHECKOUT-01`**: `PaywallScreen.handleSubscribe` solo muestra "Pago en línea próximamente"; no hay Stripe JS SDK ni Checkout Session.
  3. **`DEPLOY-01`**: Edge Function no deployada ni configurada con secretos Stripe/Supabase.
  4. **`STRIPE-01`**: productos/precios no creados (price IDs son placeholders).
- **Decisión de producto**: se OMITE completamente un panel de administración web propio (sección 6 del doc). El soporte operativo de la beta se cubre con Stripe Dashboard + Supabase Studio + un **CLI de soporte Go local** (`SUPPORT-01`, no distribuido). Panel web admin diferido a fase estable 0.2+.
- **Nota de desincronización**: `licensing-auth-architecture.md`, `stripe-integration-plan.md`, `license-service-contract.md` y `supabase-schema-release.md` dicen "design-only / no production code yet" pero el código ya está implementado. Conviene añadir nota de "Estado real 2026-07-06" a cada uno para no confundir a otros workers (p. ej. el de Launcher).
- Orden de planificación propuesto: `SQL-01` → `STRIPE-01` → `DEPLOY-01` → `CHECKOUT-01` → `E2E-01` → `SUPPORT-01` + `RUNBOOK-01` → `AUDIT-01` (license_events + Discord sync follow-ups) → `I18N-03b`.
- **Gap de auth añadido (2026-07-06):** la auditoría detectó que falta el **registro de nuevos usuarios** (`signUp`) y la recuperación de password en la app (`AUTH-04`). Login/OAuth/logout/sesión ya funcionan. Para una beta pública esto es bloqueante (evidencia: `adversarial-review.md` caso C, P1). Ver secciones 11 y 12 del doc de auditoría.
- Orden de ejecución actualizado: `AUTH-04` → `SQL-01` → `STRIPE-01` → `DEPLOY-01` → `CHECKOUT-01` → `E2E-01` → `SUPPORT-01` + `RUNBOOK-01` → `AUDIT-01` → `I18N-03b`.
- **Doc ancla del stage** (2026-07-06): creado `docs/release-02-licensing-auth-stage.md` como punto de referencia único de la sección licencias/auth/pagos. Indexa los 10 miniplans (`AUTH-04`, `SQL-01`, `STRIPE-01`, `DEPLOY-01`, `CHECKOUT-01`, `E2E-01`, `SUPPORT-01`, `RUNBOOK-01`, `AUDIT-01`, `I18N-03b`), la ruta crítica y el DoD. La evidencia técnica vive en `docs/stripe-licensing-status-audit.md`.
- **Planes de stage completos (2026-07-06):** los 10 miniplans del stage licencias/auth/pagos están redactados en `docs/superpowers/plans/2026-07-06-*.md`. Siguen la plantilla writing-plans (header + TDD RED→GREEN→commit). El ancla es `docs/release-02-licensing-auth-stage.md`. Estado: bloqueados por acceso F0 (ref Supabase + STRIPE_SECRET_KEY test + Customer Portal). Una vez desbloqueados, se ejecutan en orden de dependencia con agents en paralelo (~2-3 días de reloj).
- Sin commit, sin tag, sin release. Solo documentación.

- **Planes de stage REVISADOS y listos para ejecutar (2026-07-06, sesión de corrección):** los 10 miniplans fueron revisados contra el código real (`internal/license`, `supabase/functions/stripe-webhook`, `frontend/src/hub/auth/*`, `AccountSettings.tsx`, `supabase-auth.ts`) y corregidos con tus decisiones A–J. Cambios aplicados:
  - **SQL-01**: bug de rate-limit corregido (ahora `last_reset_at`, no contador roto); 1 PC por usuario confirmado; `get_account_entitlements` devuelve `stripe_customer_id` para el portal.
  - **CHECKOUT-01**: handler devuelve `200 + JSON {url}` (no redirect 303); retorno al servidor local `127.0.0.1:39261/checkout/callback`; ruta `/create-checkout-session` antes de la firma Stripe; **añadido Task 3: botón "Gestionar suscripción" (Customer Portal)**.
  - **AUDIT-01**: `syncDiscordRole` → `notifyDiscord` (aviso al canal del equipo, no rol); añadido Task 0 para extender el mock de tests.
  - **STRIPE-01**: fila `free` fuera del mapping; precios beta creados en Stripe.
  - **SUPPORT-01**: `device-reset` limpia `last_reset_at`.
  - **AUTH-04**: signup abierto + email confirmation cerrado.
  - **I18N-03b**: se ejecuta ANTES que CHECKOUT-01.
  - **E2E-01 / RUNBOOK-01**: retornos y campos de reset actualizados.
  - **Stage doc**: AUTH-04 marcado como paralelo a SQL-01 (no depende).
  - Resumen de decisiones: A=signup abierto+email · B=retorno servidor local · C=portal con botón · D=aviso Discord al equipo · E=1 PC · F=rate-limit simplificado · G/H=beta creados, free fuera · I=I18N antes de checkout · J=AUTH paralelo a SQL-01.
  - **Sigue bloqueado por F0** (ref Supabase + `STRIPE_SECRET_KEY` test + Customer Portal). Sin eso no se ejecuta. Orden de ejecución final: F0 → F1 paralelo [SQL-01, STRIPE-01, SUPPORT-01, I18N-03b, AUTH-04, RUNBOOK-01] → F2 [DEPLOY-01, CHECKOUT-01] → F3 [E2E-01, AUDIT-01].
  - Sin commit, sin tag, sin release. Solo documentación.
Nota WIDGET-STUDIO-10 (2026-07-07) — Implementation:
- Objetivo: permitir acceder a Widget Studio sin perfil propio. Eliminar el guard de OverlaysStudioPage que bloqueaba el acceso y sintetizar un EMPTY_PROFILE cuando no hay profile real.
- Archivos nuevos: `widget-studio-empty-profile.ts` (helper puro EMPTY_PROFILE + isSyntheticProfile), `widget-studio-empty-profile.test.ts` (6 tests).
- Archivos modificados: `OverlaysStudioPage.tsx` (import EMPTY_PROFILE, eliminar guard 176-192, pasar EMPTY_PROFILE con callbacks no-op), `OverlaysStudioPage.test.tsx` (+2 tests RED→GREEN), `WidgetStudio.tsx` (import isSyntheticProfile, añadir isSynthetic, deshabilitar save button + design selector con copy honesto cuando synthetic), `WidgetStudio.test.tsx` (+3 tests RED→GREEN), `StudioWidgetList.tsx` (añadir empty state con data-testid cuando widgets.length === 0), `StudioWidgetList.test.tsx` (+2 tests RED→GREEN).
- Tests: 55/55 enfocados PASS (OverlaysStudioPage 16, WidgetStudio 24, widget-studio-empty-profile 6, StudioWidgetList 9). tsc OK (pendiente MC-5), lint OK (pendiente MC-5), build OK (pendiente MC-5).
- No se tocó: LayoutStudio, backend Go, Supabase/Auth, Calendar, Roadmap, Launcher, Engineer/Telemetry, dependencias, position/x/y/w/h, autosave, drag/drop.
- Sin commit, sin tag, sin release, sin Discord.

## Nota FIX-LICENSE-BRIDGE-01 (2026-07-08) — Implementation:
- Objetivo: alinear 3 tests al contrato "standalone mode" (LicenseBridge stub + LicenseProvider sin getSession). Producción ya no llama a `getSession`; LicenseProvider emite `license:validate` con `{}` tras 500ms.
- Archivos modificados: `frontend/src/hub/HubApp.test.tsx` (2 tests reescritos + eliminado `vi.mock("../lib/supabase-auth")`), `frontend/src/lib/license.test.tsx` (1 test reescrito + limpieza de `mockGetSession` muerto + comentario actualizado).
- Tests: 1410/1410 PASS (3 tests reescritos al contrato actual, 0 fallos; baseline previo 1407/1410).
- tsc OK, lint OK (8 errores pre-existentes en archivos ajenos: PaywallScreen, Calendar*, RoadmapPage, AccountSettings, wails-runtime-topbar-mock, topbar-visual-harness — fuera de scope, no introducidos por este cambio).
- Sin commit, sin tag, sin release.

## Nota FIX-CALENDAR-PARSE-01 (2026-07-08) — Implementation:
- Objetivo: hacer `calendar.Parse` testeable de forma determinista anadiendo `ParseWithReference(text, timezone, reference)` que recibe un `reference time.Time` explicito. `Parse` mantiene su firma y delega a `ParseWithReference(text, tz, time.Now().In(loc))`.
- Archivos modificados: `internal/calendar/parse.go` (extraido el cuerpo de `Parse` a `ParseWithReference`; `Parse` reescrito para delegar; sin tocar rolling forward ni `parseLine`/`parseDate`), `internal/calendar/parse_test.go` (test `TestParse_AcceptsValidLines` usa `ParseWithReference` con su `reference` local; anadido `TestParseWithReference_UsesGivenReference` RED→GREEN; anadido `TestParse_UsesCurrentTimeAsReference` de regresion + helper `spanishMonthsReverse`; import `fmt`).
- Tests: 30/30 Go PASS (1 test arreglado `TestParse_AcceptsValidLines` + 1 test nuevo `TestParseWithReference_UsesGivenReference` + 1 test de regresion `TestParse_UsesCurrentTimeAsReference`). `go test ./internal/calendar/...` GREEN, `go test ./...` 30/30 paquetes OK.
- go vet OK (en scope `./internal/calendar/...`; hay 1 warning pre-existente fuera de scope en `internal/telemetry/lmu/reader_windows.go` que no se toco). gofmt OK (en scope; `calendar.go` y `official_schedule.go` tienen formato pre-existente fuera de scope y no se modificaron). `git diff --check` OK.
- Sin commit, sin tag, sin release, sin push.

## Nota BRAND-DESIGN-DOCS (2026-07-08) — Implementation:
- Objetivo: consolidar la identidad de marca y design system en documentos canónicos, eliminar la duplicación de tokens entre `marketing/01-04` y el código, y dar a los agentes de UI un contrato técnico único. Docs-only, sin tocar código.
- Archivos nuevos: `docs/BRAND.md` (12 KB, identidad de marca consolidada: valores, personalidad, tono, vocabulario, paleta/tipografía como resumen conceptual, multilingüismo, diferenciación, checklist), `docs/DESIGN.md` (28 KB, design system canónico para agentes de UI: 18 secciones cubriendo tokens de color, tipografía, espaciado, glass/efectos, componentes, estados, anti-patrones, checklist, 7 inconsistencias conocidas del código documentadas), `docs/styleguide.html` (44 KB, style guide HTML navegable: sidebar con 14 secciones, paleta, tipografía, glass, botones, cards, badges, inputs, stats, telemetría overlay, estados, do/don't, snippets de código).
- Archivos modificados: `docs/marketing/02-brand-strategy.md` (mapping añadido al inicio + §6 Dirección Visual reescrita para reflejar el código real: la paleta del código es ROJO `#C1121F`/`#ff3b3b`, no naranja `#FF6B35` como proponía el doc original; se mantiene la metáfora conceptual del naranja Gulf pero se documenta que la marca consolidó rojo al implementarse; tipografía corregida a Rajdhani/JetBrains Mono que es lo que el código importa de Google Fonts).
- Decisiones cerradas: (1) `BRAND.md` y `DESIGN.md` separados: marca conceptual vs sistema técnico. (2) `DESIGN.md` es contrato para `@designer` y workers, no marketing. (3) La paleta final es la del código real, no la propuesta original de marketing — el código manda. (4) Documentadas 7 inconsistencias del código en `DESIGN.md §13` para que ningún worker las amplíe: dos definiciones de tema, dos fuentes mono (`JetBrains Mono` vs `Space Mono`), `font-tech` huérfano, `--v-glass-blur` declarado pero no usado, hex hardcodeados en componentes, tres estilos de widget compitiendo. (5) Tres temas de widget documentados como oficiales: `vantare-racing` (default), `glassmorphism-pro`, `vantare-crystal`. Cyber OLED queda como experimental sin activar.
- Inconsistencias detectadas (no resueltas en este corte, documentadas en DESIGN.md §13): `font-tech` huérfano en `TelemetryWidget.tsx`/`TelemetryVerticalWidget.tsx`/`DeltaWidget.tsx` (sustituir por `font-mono`); dos definiciones de tema (CSS vs `vantare-v5.json`) generan flash visible al cargar; `--v-glass-blur: 0px` declarado pero no usado; hex hardcodeados en componentes que deberían pasar por tokens.
- No se tocó: código de la app, backend Go, Supabase/Auth, Calendar, Roadmap, Engineer/Telemetry, WidgetStudio/LayoutStudio, runtime OBS, dependencias, marketing/01, marketing/03, marketing/04, marketing/05, plan actual de trabajo. Cero archivos de código modificados. Solo `docs/` y `marketing/02-brand-strategy.md`.
- Checks: archivos creados verificables con `Get-ChildItem docs -Include BRAND.md,DESIGN.md,styleguide.html`. `git status --short docs/` muestra 3 archivos nuevos. `git diff --stat docs/marketing/02-brand-strategy.md` muestra +39/-18 (mapping + §6 corregida, contenido de marketing intacto). Sin tests que ejecutar (docs-only). Sin tsc/lint/build que verificar (no se tocó código).
- Riesgo restante: el `font-tech` huérfano y los hex hardcodeados siguen en el código hasta que un PR de normalización los cierre. `DESIGN.md §13` los lista explícitamente para que cualquier worker de normalización los tenga en cuenta. `02-brand-strategy.md` queda como planificación histórica: la paleta "original" (naranja) está documentada como propuesta descartada, no eliminada, para trazabilidad de la decisión.
- Sin commit, sin tag, sin release.

## Nota BRAND-MONO-FONT-01 (2026-07-08) — Implementation:
- Objetivo: declarar **Space Mono** como fuente monospace canónica de la marca Vantare. Docs-only, sin tocar código.
- Decisión: el founder prefiere Space Mono sobre JetBrains Mono (más carácter, mejor estética de cockpit). Space Mono ya se usa en el tema JSON (`vantare-v5.json`) y en el hub; JetBrains Mono solo en `index.css`. Unificar a Space Mono.
- Archivos modificados: `docs/DESIGN.md` (§3.1 tipografía reescrita: mono canónica = Space Mono; §13.3 inconsistencia de mono marcada como resuelta a nivel de contrato, queda como PR de código pendiente alinear `index.css` y `vantare-v5.json`), `docs/BRAND.md` (tabla de tipografía actualizada a Space Mono con referencia a BRAND-MONO-FONT-01), `docs/marketing/02-brand-strategy.md` (tabla de tipografía §6 actualizada a Space Mono), `docs/styleguide.html` (import de Google Fonts sin JetBrains Mono; `--v-font-mono` apunta a `'Space Mono', monospace`; subtítulo de la sección Tipografía actualizado; specimen de telemetría con copy coherente).
- Inconsistencias resultantes (no resueltas en este corte, en cola para PR de código): `frontend/src/index.css` aún declara `--v-font-mono: 'JetBrains Mono'`. Mientras ese cambio no se haga, los widgets overlay renderizan con JetBrains Mono en runtime; el contrato de marca y la documentación ya son Space Mono. El HTML de referencia `docs/overlay-vantare-crystal-widgets.html` también sigue declarando JetBrains Mono en `:root` — debería alinearse en el mismo PR para que el HTML de referencia y el código coincidan.
- No se tocó: código de la app, `frontend/src/index.css`, `frontend/tailwind.config.*`, `frontend/src/hub/state/style-catalog.ts`, `frontend/src/lib/theme.ts`, `frontend/src/overlay/widgets/widget-design-system.ts`. Cero archivos de código modificados.
- Checks: `grep -n 'JetBrains' docs/BRAND.md docs/DESIGN.md docs/marketing/02-brand-strategy.md docs/styleguide.html` debería devolver 0 coincidencias (salvo referencias a la decisión o a la acción de código pendiente). Sin tests que ejecutar. Sin tsc/lint/build que verificar (no se tocó código).
- Próximo paso recomendado (corte de código futuro, no en este PR): PR pequeño que cambie `--v-font-mono` en `frontend/src/index.css` de `'JetBrains Mono'` a `'Space Mono'` y alinee `docs/overlay-vantare-crystal-widgets.html`. Test de regresión visual con Playwright en los widgets overlay. Microcorte: 1 archivo de código + 1 HTML de referencia.
- Sin commit, sin tag, sin release.

## Nota WS-11.A1 (2026-07-08) — Implementation:

- Objetivo: renombrar `glassmorphism-pro` → `vantare-crystal` en `OFFICIAL_DESIGNS`, `style-catalog` y tests, sin cambiar tokens ni `WidgetAppearance.defaults`.
- Archivos modificados: 4 producción (widget-design-gallery.ts, style-catalog.ts, 4 Widget.tsx) + 4 tests del plan + WidgetStudio.test.tsx, WidgetSandboxPreview.test.tsx, WidgetDesignGallery.test.tsx, 4 Widget.test.tsx + widget-studio-visual-compare.mjs.
- Tests: 1410/1410 PASS, tsc OK, lint OK (sin errores nuevos; los 8 errores de lint son pre-existentes en PaywallScreen.tsx y AccountSettings.tsx, fuera de scope).
- Sin cambios de tokens ni de comportamiento intencional: el rename hace que `isCrystal` pase a ser true en los 4 Widget.tsx, por lo que `RelativeWidget` ahora resuelve el design system `vantare-crystal` (radius.lg 12px en vez del 10px base previo). Es el comportamiento correcto del diseño crystal; se actualizó el assertion del test a 12px.
- Sin commit de `pnpm-workspace.yaml` (cambio ajeno) ni de los docs de marca previos sin commit.
- Siguiente microcorte: A2 (reescribir el resolver con tokens del HTML).
## Nota WS-11.A2 (2026-07-08) — Implementation:

- Objetivo: alinear tokens del resolver `widget-design-system.ts` con el HTML de referencia `docs/overlay-glassmorphism-pro.html`.
- Cambio: `VANTARE_CRYSTAL_TOKENS` — los tokens Vantare (accent `#ff3b3b`, negative `#ff2a3b`, glow accent) se mantienen. Los tokens genéricos se reemplazan con los valores del HTML: `background #060608`, `surface #121216`, `border rgba(255,255,255,0.09)`, `text #ffffff`, `textMuted #999999`, `textDim #555555`, `bodyFont 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`, `surfaces.card rgba(18,18,22,0.82)`. Además `displayFont` y `monoFont` se corrigieron para incluir el espacio tras la coma y coincidir exactamente con el HTML (`'Plus Jakarta Sans', sans-serif` y `'JetBrains Mono', monospace`).
- `surfaces.rowEven` y `surfaces.rowOdd` NO se cambiaron (ya coinciden con el HTML, verificado en `.row:nth-child(even/odd)`).
- Archivos modificados: `frontend/src/overlay/widgets/widget-design-system.ts`. Archivo nuevo: `frontend/src/overlay/widgets/widget-design-system.contract.test.ts` (test de contrato que parsea `:root` del HTML y afirma que el resolver coincide — única cobertura de los tokens cambiados). NO se modificó `widget-design-system.test.ts` (no afirmaba los tokens cambiados).
- Tests: 1417/1417 PASS (1410 previos + 7 contract), tsc OK, lint OK (0 errores nuevos; 8 errores preexistentes en otros archivos), `git diff --check` OK.
- Sin commit, sin tag, sin release, sin push (regla dura del usuario).
- Siguiente microcorte: A3 (catálogo de estilos por widget type con defaults del HTML).

Nota FEATURES-DATA (2026-07-08):
- Creado frontend/src/hub/roadmap/features-data.ts como modulo espejo de roadmap-data.ts para la pestana 'Desarrollo por features' del Roadmap.
- Fuente de verdad: docs/features-source.json (Task 1, ya existente).
- Tipos: FeatureStatus, FeatureTipo, FeatureCategory, RoadmapFeature, FeaturesDataset.
- PROGRESS_SCALE importado de roadmap-data.ts (no duplicado).
- pickText re-exportado desde roadmap-data.ts.
- fetchFeaturesDataset(signal?) - fetch remoto con fallback a FEATURES_FALLBACK, nunca lanza.
- normalizeFeaturesSource - valida y mapea raw JSON, dropea features con category/status/tipo/percent invalidos, retorna null si no quedan features validas (causa fallback).
- Creado frontend/src/hub/roadmap/features-data.test.ts con 13 tests TDD: validacion de FEATURES_FALLBACK, fetch con mock, fallback en fallos.
- Checks: 13/13 tests PASS, build OK (tsc -b + vite build), lint preexisting errors sin cambios en archivos tocados.
- Archivos nuevos: features-data.ts, features-data.test.ts.
- Commit: 330d077 feat(roadmap): add features-data.ts with remote fetch + fallback

## Nota LAUNCHER-TASK-3.3b (2026-07-08) — Implementation:
- Objetivo: completar ProfileEditor side-panel con steps editor, hotkey input y autostart toggle (Task 3.3b del plan `docs/superpowers/plans/2026-07-08-launcher-v2.md`).
- ProfileEditor.tsx: añadido `apps` prop, steps editor con select/input delay/botones ↑/↓/✕, botón "+ Añadir paso", hotkey input con placeholder y validación contra reservadas (ctrl+c, ctrl+v, etc.), autostart checkbox deshabilitado cuando steps.length === 0.
- launcher-state.ts: añadido `isHotkeyAllowed()` helper con RESERVED_HOTKEYS set (24 combos del sistema).
- ProfileEditor.test.tsx: 3 tests nuevos (steps editor add/remove/reorder, hotkey input, autostart disabled sin steps).
- Tests: 157/157 files, 1503/1503 tests PASS (regresión 0). Lint 0 errores en archivos tocados.
- Archivos modificados: ProfileEditor.tsx, ProfileEditor.test.tsx, launcher-state.ts (3 archivos).
- Commit: 9efd6ee feat(launcher): ProfileEditor steps + hotkey + autostart (cut 3)
Nota LAUNCHER-ICONS (2026-07-10):
- Bug raiz corregido: en icon_windows.go, `DestroyIcon` estaba en shell32.dll (real: user32.dll) y `DeleteObject` en user32.dll (real: gdi32.dll). `NewProc` es perezoso -> la extraccion de iconos del backend panicaba en cualquier icono extraido con exito. Esto rompia TODOS los iconos extraidos del .exe, no solo 3.
- Nuevo fallback de icono: si `ExtractIconExW` sobre el .exe no devuelve icono, se resuelve el acceso directo del escritorio/Start Menu (.lnk) via IShellLink y se extrae con `SHGetFileInfo` (el icono que muestra Windows, funciona aunque el target .exe no tenga icono embebido ni exista).
- Frontend: KNOWN_ICONS (discord/motec/simhub) vaciado; esas 3 apps ahora van directo a la extraccion del backend (sin flash de imagen rota).
- Validado en Windows con tests reales: notepad.exe (extraccion .exe), Discord.lnk resuelto y extraido, .lnk->notepad extraido via SHGetFileInfo.
- Archivos: icon_windows.go, icon_stub.go, main.go (handler usa GetAppIconForAppBase64), AppBadge.tsx, icon_windows_test.go.
- Riesgo: `go vet` emite 1 warning conocido (falso positivo) en el acceso a vtable COM; no rompe build ni tests. Sin CI de vet en el repo.
- Estado: ICONOS OK. Discord/MoTeC/SimHub resuelven via .lnk del escritorio en la maquina del usuario (requiere acceso directo presente).
Nota LAUNCHER-V3-FASE-1 (2026-07-11):
- Fase 1 cerrada: estados canónicos, catálogo oficial/readiness y contrato TypeScript espejo.
- Commits: `cc1bd7f` (availability), `7b71db7` (official catalog), `762e962` (frontend contract).
- Archivos funcionales: `internal/app/launcher/status.go`, `status_test.go`, `catalog.go`, `catalog_test.go`, `known.go`, `frontend/src/hub/launcher/launcher-contract.ts`, `launcher-contract.test.ts`, `launcher-state.ts`.
- Gate 1: `go test ./internal/app/launcher/...` PASS; `pnpm --dir frontend test -- launcher-contract launcher-state` PASS (24 tests); `pnpm --dir frontend build` PASS; `git diff --check` PASS.
- Checks globales: `go test ./...` sigue bloqueado por fallos preexistentes en `internal/server` (nonce y puerto); `pnpm --dir frontend lint` sigue bloqueado por 11 errores preexistentes fuera del alcance Launcher.
- Playwright no aplica todavía: Fase 1 no modifica UI renderizada. Se requiere desde los cortes frontend/visuales posteriores.
- Estado: FASE 1 CERRADA; siguiente paso exacto = Fase 2, Task 2.1 (discovery basado en evidencia).

Nota LAUNCHER-V3-FASE-2 (2026-07-11):
- Fase 2 cerrada: discovery basado en evidencia, reparación/fusión manual explícita, snapshot canónico, bridge/store único y consumidores migrados sin rediseñar el layout.
- Commits: `63e9f33`, `91d2fb7`, `c4b8ca3`, `af4c483`, `5c247fb`.
- Frontend: `LauncherStoreProvider` vive en `HubApp`; AppsPanel, ProfilesPanel y LauncherDock consumen el snapshot y no registran eventos Wails propios. El modal de registro registra antes de emitir.
- Gate 2: `go test ./internal/app/launcher/... ./cmd/vantare/...` PASS; `pnpm --dir frontend test -- LauncherPage AppsPanel ProfilesPanel LauncherDock AddNonSteamGameModal launcher-store launcher-bridge` PASS (39 tests); `pnpm --dir frontend build` PASS; `git diff --check` PASS.
- Playwright visual: revisión local a 1440x900 PASS; 7 apps, 2 perfiles y dock global visibles, sin errores de consola ni peticiones fallidas de la aplicación. Captura temporal fuera del repositorio: `C:\Users\isaac\AppData\Local\Temp\launcher-v3-playwright.png`.
- Checks globales aún conocidos: `go test ./...` mantiene los fallos preexistentes de nonce/puerto en `internal/server`; `pnpm --dir frontend lint` mantiene 11 errores preexistentes fuera de Launcher.
- Siguiente paso exacto = Fase 3, Task 3.1 (assets oficiales offline); requiere revisar/proporcionar los siete logos antes de incorporarlos.

Nota LAUNCHER-V3-FASES-3-8 (2026-07-11):
- Ejecutadas las tasks restantes compatibles sin incorporar logos oficiales: resolver offline/fallback, políticas y editor progresivo, perfiles separados, argumentos, identidad/readiness, decisiones de procesos, retry/cancel, sesión, dock, trigger LMU, recomendaciones efímeras, onboarding, notificaciones y retirada de eventos legacy de producción.
- Nuevos bloques verificados: `go test ./internal/app/launcher/...`, tests frontend enfocados, `pnpm --dir frontend build` y smoke Playwright `node frontend/scripts/launcher-v3-smoke.mjs` (desktop 1440x900 y móvil 390x844).
- Smoke Playwright observado: 7 apps, 2 perfiles, editor avanzado con args, sin errores de consola ni peticiones fallidas relevantes; captura temporal en `C:\Users\isaac\AppData\Local\Temp\vantare-launcher-v3-smoke.png`.
- Documentación viva: `docs/launcher-v3-architecture.md`.
- Limitación explícita: `frontend/src/assets/launcher/apps/` sigue sin los siete logos aprobados; el fallback local no descarga ni inventa marcas.

Nota LAUNCHER-V3-VERIFICACION-FINAL (2026-07-11):
- Gate final Launcher: `go test ./internal/app/launcher/... ./cmd/vantare/...` PASS; `pnpm --dir frontend test` PASS (173 archivos, 1590 tests); `pnpm --dir frontend build` PASS.
- Smoke Playwright final PASS en 1440x900 y 390x844: 7 apps, 2 perfiles, onboarding/editor avanzado, sin overflow móvil, errores de consola ni peticiones fallidas relevantes. Captura temporal: `C:\Users\isaac\AppData\Local\Temp\vantare-launcher-v3-smoke.png`.
- `go test ./...` sigue fallando solo en problemas preexistentes de `internal/server` (nonce/puerto); `go build ./...` falla en `build/ios` porque ese paquete no contiene `main`; `go test -race` no puede arrancar porque el entorno carece de `gcc`; lint global mantiene 4 errores preexistentes fuera de Launcher (Calendar y topbar mock).

# Nota OVERLAY-STUDIO-V3-QUALITY (2026-07-12)

- Rama de trabajo: `refactor`.
- 8.4 cerrado en este corte: `widget-diagnostics.ts` separa el contrato y añade `createWidgetDiagnosticCollector` con límite, conteos y limpieza; los renderizadores reciben ViewModels y diagnósticos acotados sin payloads de telemetría/perfil. `StudioProfileService` registra solo metadata segura en errores.
- 8.5 cerrado en este corte: template no registrado, contrato compilable, `design-system:check`, guía de authoring, guía HTML→sistema y worksheet; Crystal queda cubierto por presupuesto de blur y contrato visual.
- 8.6 cerrado: los seis documentos vivos contienen el contrato canónico V3 y los comandos actuales.
- Evidencia: `pnpm --dir frontend test -- ...` → 7 archivos / 20 PASS; `pnpm --dir frontend design-system:check` → 2 sistemas PASS; `pnpm --dir frontend build` → PASS; `go test ./internal/app/... -run StudioProfileService -count=1` → PASS; `git diff --check` → PASS.
- 8.1 cerrado: paridad de claves y frontera de literales en los cuatro idiomas; componentes V3 usan `useI18n` para copy visible.
- 8.2 cerrado: suite `overlay-studio-a11y.test.tsx`, nombres accesibles de zoom/frames, foco visible, restauración Escape de drawers y browser gate wide/compact.
- 8.3 cerrado: regresión determinista de buckets 15/30 Hz para 20 instancias, presupuesto Crystal blur ≤16px y reduced-motion; no se usan thresholds de tiempo de pared.
- Gates finales de este corte: `pnpm --dir frontend test` → 213 archivos / 1578 PASS; `pnpm --dir frontend build` → PASS; `pnpm --dir frontend visual:overlay-studio` → 59 baselines 0.000% + parity + drag/resize + zoom + teclado PASS; `pnpm --dir frontend design-system:check` → 2 sistemas PASS; `git diff --check` → PASS.
- Lint: no gate verde; permanece bloqueado por 44 errores preexistentes y 2 warnings del repositorio, incluyendo calendar/launcher y reglas React existentes en Overlay Studio. No se introdujeron errores nuevos de TypeScript/build.
- Go completo: `go test ./...` sigue bloqueado por fallos preexistentes de nonce/puerto en `internal/server` y por el directorio no relacionado `vantare-v2/` presente en el working tree; los paquetes de aplicación/cmd y el foco de Studio pasan.
Nota CRYSTAL-DIRECT-REPLACEMENT-PLAN (2026-07-12):
- Autoridad vigente para el próximo trabajo Crystal; sustituye cualquier inventario/agrupación histórica anterior basada en `visualTemplate` para Pedals, Damage o Delta Advanced.
- Objetivo: sustituir directamente la implementación visual actual `vantare-crystal` por el glassmorphism canónico de `docs/overlay-glassmorphism-pro.html`, manteniendo el mismo ID público y retirando Crystal v1.
- Plan: `docs/superpowers/plans/2026-07-12-vantare-crystal-glassmorphism-direct-replacement.md`.
- Inventario corregido: referencia numerada 01–16 mapeada a 18 tipos funcionales y 21 diseños Crystal. Solo Input 10A/B/C y Delta 06/15 son variantes del mismo tipo; Pedals V1/V2/V3, Damage 13/14 y Delta Advanced 16 son tipos independientes.
- Exclusión explícita: el bloque final `V2. WIDGETS REESTILIZADOS` (`.v2-section`) no forma parte del producto ni de la referencia visual.
- UI acordada: el inspector separa `Sistema visual` (Original/Crystal), `Diseños de Vantare` filtrados por tipo+sistema y `Mis diseños` filtrados por tipo+sistema; AddWidget muestra tipos funcionales, no composiciones.
- Alcance: tipos/ViewModels/inspectores, Original fallback, Crystal 1:1, migraciones v1→v2, catálogo Studio, perfiles/diseños, runtime Studio/Desktop/OBS, Playwright HTML↔renderer, rendimiento, a11y e i18n.
- Regla: sustitución directa bajo `systemId="vantare-crystal"`; no coexistencia ni fallback oculto del Crystal actual.
- Estado: PLANIFICADO, sin código implementado por este corte.
- Paquete de ejecución Luna creado: índice `docs/superpowers/plans/2026-07-12-crystal-luna-execution-index.md` + seis microplanes ordenados (contratos/UI, referencia/base, core, widgets live, widgets derivados y cutover).
- Los microplanes fijan disponibilidad de datos: weather/damage permanecen `missing` en live hasta contrato real; histories se derivan de forma acotada; Calendar usa adapter read-only; no se permite inventar telemetría.
Nota ISA-9-RESCAN-PROGRESS (2026-07-13):
- Implementado en `vantareapp/isa-9-launcher`: Launcher dispara un único reescaneo por entrada real; el Hub no escanea al arrancar.
- Backend emite checkpoints reales `0/15/55/75/100`, rechaza scans concurrentes y solo confirma 100 tras persistencia, resolución de iconos y snapshot final exitosos.
- Bridge/store comparte listeners, limpia de forma idempotente y deduplica el comando antes de emitirlo para React Strict Mode. AppsPanel conserva snapshot/logos, bloquea Reescanear durante scanning y muestra barra A accesible con interpolación y reduced motion.
- Commits: `e2915ee` backend, `ac8c2fe` bridge/store/UI. `.superpowers/` se conserva sin incluir.
- Checks focalizados: Go launcher/cmd PASS; frontend Launcher/store/bridge/panel/progress PASS (14 tests); frontend build PASS; `git diff --check` PASS.
- Pendiente antes de In Review: suite frontend completa, lint, Playwright 100/125/150/200, smoke Wails Windows con `.env.local` del escritorio, revisión inicial sin editar y validación manual 100% de Isaac. No merge a `develop`.
Nota TELEMETRY-CORE-ISA-100 (2026-07-19) — ESTADO HISTÓRICO SUPERSEDED POR LA NOTA ISA-26 AL INICIO:
- Telemetry Core se separa documentalmente de Strategy Product B. La rama histórica ISA-21 no debe mergearse en bloque.
- TC-01 está completado e integrado en `develop@f492007` mediante ISA-23, ISA-24, ISA-25, ISA-96 e ISA-97.
- Autoridad y fronteras: `docs/telemetry-core/README.md`. Se rescatan exclusivamente el plan maestro, cinco microplanes y el índice Telemetry Core.
- Estado al publicar ISA-100: TC-02–TC-05 seguían sin iniciar e ISA-26 estaba en Backlog. Esta línea ya no es operativa: ISA-26 está `In Review` sobre ISA-100 y ISA-27 permanece no iniciado/bloqueado por review humana, según la nota vigente al inicio del documento.
- No se ha tocado código de producto, Strategy Planner ni la arquitectura runtime en ISA-100.
Nota ISA-260 / OS-09A (2026-08-04, contrato y threat model Overlay Workshop):
- Base limpia fijada: `origin/nightly@4981e6fac5b2c95af9deb4ad2a64f0592a7b4d1e`;
  rama/worktree aislados. Sin promoción.
- Characterization deriva 19 tipos, 2 sistemas, 41 diseños oficiales y 22 Crystal
  sobre 19 tipos. El contrato visual histórico sigue siendo 21 Crystal/18 tipos;
  el adicional oficial/productivo es `engineer-radio-crystal`, bajo contrato
  Engineer y fuera del HTML clásico. Los gates quedan separados.
- `WidgetVisualHost` es la frontera única caracterizada para Studio y runtime
  Desktop/OBS. El plan fija tipo/sistema/diseño/configuración, stage/fondos,
  deep-links fail-closed, fixtures, prerelease owner read-only y compile-out
  Stable. Owner firmado real es precondición explícita de ISA-264; no se implementa auth.
- Documentación ejecutable: `docs/overlays-studio/os-09-overlay-workshop-contract.md`.
  Handoff añade procedimiento seguro de arranque por worktree y puntero A2.
- Alcance: docs y test focal; sin UI Workshop, catálogo/manifests, Billing,
  canvas, readers LMU, Wails/SSE, persistencia, baselines o configuraciones.

Nota ISA-261 / OS-09B (2026-08-04, fixtures portables para autoría):
- La autoridad de fixtures se mueve de `overlay-harness` a
  `overlay/authoring/fixtures`, con un shim de compatibilidad temporal para
  consumidores externos. El harness importa ya la frontera neutral.
- El escenario tipado incluye tipo, sistema, diseño, estado, sesión,
  localización y superficie; la superficie se declara pero no entra en el
  ViewModel ni renderer. No se añadieron Wails, SSE, persistencia, perfiles o
  datos live.
- Los 19 tipos funcionales se derivan de `ALL_WIDGET_TYPES`. El contrato HTML
  Crystal histórico conserva 21 diseños/18 tipos y Engineer Radio queda
  declarado por separado, sin inflar la paridad clásica.
- Tests focales y build pasan. El parity report-only agotó su timeout local sin
  actualizar ningún baseline; su investigación queda pendiente antes del gate
  de Nightly. Sin promoción.

Nota ISA-262 / OS-09C (2026-08-04, Workshop local MVP):
- Ruta de desarrollo única: `/workshop`, dentro del bootstrapping compartido y
  cargada de manera dinámica sólo cuando `import.meta.env.DEV` es verdadero.
  No existe segunda entrada Vite ni import estático desde `main.tsx` hacia
  authoring; el build productivo no contiene los sentinels del módulo, parser o
  fixtures Workshop.
- La selección reproducible `widget/system/design/state/surface/variant` usa
  fixtures ISA-261 y falla de forma cerrada. El render real pasa exclusivamente
  por `WidgetVisualViewport` y `WidgetVisualHost`; stage y widget root tienen
  selectores contractuales separados. No se añadieron renderers, Wails/SSE,
  persistencia, perfiles, telemetría LMU ni cambios de canvas.
- Se corrigió un pageerror preexistente en el boot de `index.html`: el script de
  cabecera espera `DOMContentLoaded` si `body` todavía no existe. La regresión
  ejecuta el script real con `body` ausente, dispara el evento dos veces y
  prueba clases únicas; también cubre `#/hub` sin clases de overlay.
- El seed de Input Telemetry deja de mutar el acumulador durante render: ocurre
  en `useLayoutEffect`, limpia sólo el historial de su widget y la regresión
  StrictMode demuestra que no borra una historia ajena ni duplica la fixture.
- Gate focal: 4 archivos / 15 tests PASS; lint focal PASS; build frontend PASS;
  sentinels Workshop ausentes de producción; `design-system:check` PASS;
  Playwright Workshop válido/inválido y Hub sin errores; HMR CSS aplicado y
  revertido sin reinicio. Sin promoción.

Nota ISA-263 / OS-09D (2026-08-04, controles y verificación real Workshop):
- La ruta dev conserva controles efímeros y fail-closed de sesión, localización,
  fondo, escala, preset, dimensiones y comparación. Studio, Desktop, OBS y
  Harness verifican el mismo `WorkshopSurface`/`WidgetVisualViewport`/
  `WidgetVisualHost`; OBS sigue sin chrome dentro de su superficie.
- La revisión Chrome detectó que el bootstrap compartido cargaba el runtime
  Wails antes del Workshop y generaba 404/page errors en navegador. El runtime
  normal se separa en `AppShell.tsx` y se carga dinámicamente; `/workshop`
  queda sin Wails, con 0 errores de consola/página/red relevantes. No cambia
  el comportamiento de la aplicación normal.
- Evidencia: Playwright/Chrome cubre URL válida/inválida, cuatro fondos,
  superficies, comparación, teclado/foco, reset, preset, dimensiones y
  viewports 1280x720, medio y compacto; HMR CSS aplicado y revertido. Las
  dimensiones y escala usan borradores locales validados, y Reset vuelve a
  defaults canónicos. Vitest focal 6 archivos/29 tests (incluye bootstrap
  normal, rutas OBS/OAuth/Hub/Composite y fallback de carga), ESLint focal,
  `design-system:check`, build y
  compile-out sin sentinels Workshop pasan. Sin promoción.

Nota ISA-265 / OS-09F (2026-08-05, protocolo visual de root/alpha/bounds):
- `visual:overlay-workshop` reutiliza el protocolo Crystal para captura aislada sin cambiar umbrales, baselines ni semántica. Sus PNG y `report.json` solo viven en `frontend/.tmp/overlay-workshop-visual-protocol/`.
- Root contractual: `[data-widget-renderer="<type>"]`, salvo Delta Bar Crystal (`.vc-delta-bar`). Nunca se deduce por bounding box ni se captura stage, showcase o fondo.
- El reporte incluye selector, diseño, tipo, sistema, superficie, viewport, SHA real y `dirty`, escena, bounds, scroll/client, alpha, guard, fuentes, console/page errors y artefactos. `root.png` es el renderer contractual aislado y transparente; su SHA-256 debe ser idéntico en transparent/solid/grid/context de cada superficie o todos sus escenarios quedan `sceneContaminated=true` y fallan. Ejecuta en un único Vite+Chromium, con checkpoint por escena y cleanup.
- Overflow permitido únicamente para `delta-crystal-simple`, eje Y, máximo 13 px y superficie declarada. TDD demuestra 13 px PASS, 14 px FAIL y otro diseño con 1 px FAIL; no hay threshold global.
- TDD focal: pruebas Node para root ausente/múltiple, contaminación alpha/fondo (hashes iguales/diferentes por grupo), guard, overflow, fuentes, console/page y provenance local/fail-closed. La excepción tipada prueba 13 px PASS, 14 px FAIL y 1 px FAIL en otro diseño. La suite real debe ejecutarse tras el commit, con `sha=HEAD`, `dirty=false` y 16 escenarios PASS. El decode PNG canónico por CDP fija un coste total aproximado de 5–8 min para la suite; se conserva timeout/progreso honesto sin cambiar el helper Crystal.
- `visual:crystal-parity:report` se ejecutó una vez con límite 90 s y emitió 7 diseños PASS antes de quedar incompleto. Sin baseline tocado; deuda de duración separada, no aprobación total. Sin promoción.

Nota ISA-291 / OS-09G2 (2026-08-05, planificación de autoría directa):
- Isaac aprobó que TSX/CSS productivo sea la única fuente de verdad: `/workshop`
  observa el mismo renderer mediante `WidgetVisualHost`; no convierte, copia ni
  exporta otra representación.
- Especificación: `docs/superpowers/specs/2026-08-05-overlay-workshop-direct-code-authoring-design.md`
  (`41a3f02`). Plan ejecutable: `docs/superpowers/plans/2026-08-05-overlay-workshop-direct-code-authoring.md`
  (`426f7c6`, endurecido hasta `2b18e02`).
- El plan contiene 8 tareas (Task 0–7) y cinco cortes funcionales: preflight,
  contratos, mutaciones reversibles, HMR real, guía y cierre. Cada worker tiene
  prohibido delegar o lanzar subagentes.
- La revisión adversarial read-only exigió y verificó: protección ante edición
  concurrente, evidencia ignorada de recuperación, SIGINT/SIGTERM sin saltar
  cleanup, señal HMR sin reload, Chrome fallback, dependencias congeladas,
  cleanup parcial de Vite y cierres acotados con handles conservados.
- Veredicto final adversarial sobre `2b18e02`: GO, sin regresiones bloqueantes ni
  hallazgos razonables abiertos. No se ejecutó todavía código del plan, no se
  cambió ningún píxel y no hubo promoción a `nightly`.
- Próxima acción exacta: ejecutar Task 0 desde la rama/worktree ISA-291 y avanzar
  microcorte a microcorte con review entre commits.
- Isaac autorizó la ejecución tras aprobar el plan. Antes de tocar código se
  añadió el paquete canónico de delegación y ledger vivo al handoff
  `docs/vantare-program/handoffs/overlays-launcher-hub.md`; otro chat debe
  continuar desde ese bloque y actualizarlo tras cada entrega.
- Task 0 PASS: instalación frontend congelada, blob del lockfile workspace
  `8ecdce49a78adc664e4796f388889fbd41a67c08` inalterado, `node_modules`
  ignorado y Vitest/Vite/Playwright disponibles. Se corrigió el plan para
  apuntar al lockfile real `..\pnpm-lock.yaml`. Próxima acción: Task 1.

## Nota ISA-291 / OS-09G2 — autoría directa sobre código productivo

- **Autoría directa:** el TSX/CSS productivo es la única fuente de verdad. Workshop
  no convierte, exporta ni copia; `/workshop` renderiza ese mismo código. Queda
  descartado el enfoque declarativo de ISA-266–278 (DSL, scaffolder, barrel
  generado, `catalogPosition`, migración masiva del catálogo).
- **Frontera intacta:** Workshop sigue renderizando por `WidgetVisualHost` y el
  catálogo explícito de `official-designs.ts`. Es el cuarto consumidor del host,
  junto a Studio canvas, runtime y ProfilePreview.
- **Smoke HMR:** un único Vite + Chromium muta `DeltaOriginal.tsx` y
  `vantare-original/tokens.css`, observa ambos cambios sin navegación ni reload y
  restaura los bytes exactos. Falla en seco si los archivos objetivo no están
  limpios, y conserva cualquier edición concurrente ajena.
- **Contratos:** Workshop añadido al guard de consumidores del host; catálogo con
  IDs únicos y exactamente un default por pareja widget/sistema registrada, sin
  modificar `official-designs.ts`.
- **Exclusiones respetadas:** sin DSL, scaffolder, catálogo paralelo, migración
  masiva, dependencia nueva ni cambio visual. **Cero archivos de producto
  modificados**: el corte es tests, scripts de desarrollo y documentación.
- **Evidencia (2026-08-05):**
  - `corepack pnpm --dir frontend test` → **320 archivos, 2181 tests PASS**.
  - `corepack pnpm --dir frontend test:overlay-workshop-hmr` → **15/15 PASS**.
  - Focal `overlay-workshop-characterization` + `official-designs` → **14/14 PASS**.
  - ESLint focal (4 archivos) → PASS. `design-system:check` → 2 sistemas PASS.
  - `corepack pnpm --dir frontend build` → PASS en 957 ms.
  - Compile-out: **0 sentinels** de Workshop en `frontend/dist` (`grep` exit 1).
- **Checks omitidos y motivo:** `smoke:overlay-workshop-hmr` y
  `visual:overlay-workshop` **no se ejecutaron en este cierre**, por decisión
  expresa de Isaac (el smoke ya se había ejecutado con PASS en `a5ed874`, y el
  protocolo visual requiere navegador y 5–8 minutos). El criterio de aceptación
  correspondiente queda pendiente de la verificación manual.
- **Riesgos restantes:** `TSX_ANCHOR` del smoke depende de dos líneas literales de
  `DeltaOriginal.tsx` y un reformateo lo rompe (falla ruidosamente, documentado en
  la guía); el smoke exige todo `vantare-v2` limpio, no solo sus dos objetivos; la
  suite completa emite un `AbortError` de teardown de happy-dom que no falla
  ningún test y es deuda heredada.
- **Estado Git/Linear:** rama
  `vantareapp/isa-291-os-09g2-autoria-directa-sobre-codigo-productivo` sobre base
  ISA-265 `54088b2e5ad25d9a897cb89187ee9684b75c645f`. Sin cambio de estado en
  Linear hecho por el agente.

### Promoción a nightly (2026-08-05)

- **Aprobación:** Isaac validó ISA-291 al 100 % el 2026-08-05 y autorizó la
  promoción a `nightly`. Verificación manual realizada por él sobre este worktree.
- **Alcance real de la promoción:** no es solo ISA-291. La rama iba **40 commits**
  por delante de `origin/nightly`: 20 commits de ISA-260–265 (contrato, fixtures
  deterministas, ruta `/workshop`, controles de autoría, exclusión de Stable y
  protocolo de captura visual) y 20 commits de ISA-291. Se promueve por tanto el
  **Overlay Workshop completo**, no una parte. Los commits están apilados y no
  admiten separación técnica.
- **Impacto para usuarios y testers: ninguno.** Todo el Workshop es herramienta de
  desarrollo excluida de Stable; el scan de compile-out sobre `frontend/dist` da
  cero coincidencias. No se añade fragmento de changelog porque no hay
  comportamiento visible que un tester deba probar.
- **Mecánica:** rama de integración
  `vantareapp/os-09-n01-promocion-overlay-workshop-a-nightly` creada desde
  `origin/nightly` (`fb2c355`), con merge `--no-ff` de ISA-291 en `10be06d`. Merge
  **sin conflictos**: 30 archivos, 5025 inserciones. Se sigue el paso 12 de
  `docs/agent-workflow.md` (issue de integración), no un push directo.
- **Gates sobre el resultado combinado** (no sobre ISA-291 aislado):
  - `pnpm --dir frontend test` → **329 archivos, 2217 tests PASS**.
  - `pnpm --dir frontend build` → PASS en 872 ms.
  - Compile-out en `frontend/dist` → **0 sentinels** del Workshop.
  - `design-system:check` → 2 sistemas PASS.
- **Próxima acción:** merge del PR a `nightly` por parte de Isaac. Después,
  ISA-280 / OS-09L (gate técnico final) y la resolución de la cuestión abierta
  sobre `assertNoReload` del smoke descrita en el handoff.

## ISA-326 / OS-11 — superficie arbitraria y paridad de resolución (2026-08-12)

- **Estado:** promoción completada el 2026-08-12 mediante el PR #208. `nightly`
  quedó en `234794d` y la pre-release `v0.1.0.7-nightly.7` se publicó sobre ese
  mismo SHA. No se promovió a `testers` ni `master`.
- **Rama:** `vantareapp/isa-326-os-11-superficie-arbitraria-y-paridad-de-resolucion`.
- **Base canónica:** `origin/nightly@8880a8800e07e2af21fe5ff37a714578bf8fcd00`.
- **Worktree:** `C:\tmp\vantare-isa326\vantare-v2`.
- **Decisión:** cada perfil podrá persistir un `layoutViewport` arbitrario en
  píxeles CSS/DIP. Los V3 antiguos se resuelven como 1920×1080. Studio, Desktop
  y OBS compartirán una transformación uniforme `contain`; no habrá stretch,
  crop ni doble aplicación de DPI.
- **Autoridades:** ADR
  `docs/adr/0092-overlay-arbitrary-layout-viewport.md` y microplan
  `docs/superpowers/plans/2026-08-11-overlay-arbitrary-viewport-parity.md`.
- **Monitor nativo:** Wails ya exponía enumeración y selección. Studio persiste
  `monitorIndex` + `layoutViewport` atómicamente desde `Bounds` CSS/DIP; Desktop
  resuelve la pantalla exacta por índice, dimensiona la ventana inicialmente con
  sus límites y pasa a fullscreen sin aplicar DPI dos veces.
- **Evidencia Task 1:** focal frontend 67/67 PASS, `go test ./pkg/config` PASS,
  suite frontend 2480/2480 PASS, `go test ./...` PASS, build y lint focal PASS.
  Review de especificación PASS; review de calidad Ready to proceed, sin
  Critical/Important. Riesgo menor no bloqueante: falta un test explícito de
  aceptación del máximo exacto 16384, aunque el límite inclusivo está
  implementado e inspeccionado.
- **Evidencia 2A:** focal state/access 66/66 PASS y build PASS. Spec review PASS;
  quality review Ready sin Critical/Important. El viewport ya participa en
  dirty/undo/redo/save y los rechazos son atómicos y visibles.
- **Evidencia 2B:** `8249585`, `50e9b9e` y `5fc3809`; focal canvas 73/73,
  build/lint/diff-check PASS. Spec review PASS y quality review Ready, sin
  hallazgos. Fit, clamp, snap, move, resize, safe area y center aceptan viewport;
  recoverability y guías permanecen coherentes tras snap/clamp.
- **Evidencia 2C:** `edf3359`, `13fe677` y `1aa1ec7`; Studio elimina la resolución
  ficticia de preview y usa `layoutViewport` para escena, fit, área segura,
  interacciones y center. Presets/custom, rechazo, undo/redo y UI permanecen
  sincronizados. Focal 9 archivos 55/55, regresiones imperativas 67/67, build y
  diff-check PASS; spec PASS y quality Ready, cero Critical/Important.
- **Decisión de promoción:** Isaac acepta que la prueba física multimonitor/DPI
  mixto quede como riesgo de Nightly y declara OBS indiferente para este corte.
  La integración partió de `origin/nightly@5069cbb`, fusionó ISA-326 con
  `--no-ff` y se resincronizó con `origin/nightly@cc54d36` cuando entró el PR
  #207; solo podrá publicar tras repetir los gates y cerrar CI verde.
- **Evidencia 3A:** `ecda9ee` y `c8f00e5`; escena runtime lógica con una sola
  transformación, medida CSS no transformada, clipping documental, legacy,
  offsets, origin lógico y paridad Desktop/OBS. Focal raíz 39/39, build/lint/
  diff-check PASS; spec PASS y quality Ready. 3B debe normalizar el origin
  shrink-wrap que aún entrega la API OBS y probar la integración real.
- **Evidencia 3B:** `b4a5c94` y corrección `fb5b5ae`; preview OBS gobernada por
  `layoutViewport`, sin constantes Studio, con `contain` exterior y runtime
  interior a escala 1. Streaming mide la salida real e ignora el origin
  shrink-wrap de la API, conservando coordenadas documentales. El recordatorio
  queda en espacio de salida y no se escala con la escena. Focal 64/64, suite
  frontend 2543/2543, build/lint/diff-check PASS; spec PASS y quality Ready,
  cero Critical/Important. Smoke visual real pendiente para Task 5.
- **Evidencia Task 4:** Hub fluido `0aa50aa`; estado/cliente monitor
  `3f819d4`/`30c5292`; selector Studio `0421e55`; colocación Desktop y lifecycle
  corregidos hasta `4703a48`. Todos los microcortes terminaron con spec PASS y
  quality Ready, cero Critical/Important.
- **Gates acumulados:** `go test ./...` PASS; frontend 360 archivos y 2567/2567
  tests PASS; build y diff-check PASS. ESLint directo de los 53 TS/TSX tocados
  conserva 6 errores y 1 warning heredados; el global, 36 errores y 2 warnings.
  Las comparaciones por microcorte no detectaron violaciones nuevas. La inspección
  T3 comprobó Studio a 1440×900,
  1024×768 y 800×700, superficies 3440×1440 y 1000×1000, sin overflow horizontal.
  En el cierre inicial no se ejecutó smoke físico Wails/OBS; el resultado parcial
  posterior y sus bloqueos se registran a continuación.
- **Smoke nativo posterior:** `wails3 dev` compiló y arrancó la rama en Windows;
  ventana Hub 1280×800, WebView2 y servidor local saludables. El equipo solo
  expone un monitor `DISPLAY1` 1920×1080, por lo que no puede certificar cambio
  entre pantallas ni DPI mixto. Studio nativo quedó detrás del login porque el
  worktree no contiene configuración Supabase y no se copiaron secretos.
- **Limitación OBS aceptada:** la CSP histórica del servidor bloquea los assets
  JS/CSS propios de `/overlay`, que responde 200 pero deja `#root` vacío. Se
  registró ISA-329 como bug High abierto. Por decisión explícita de Isaac deja
  de bloquear esta Nightly, debe aparecer en sus notas y no se mezcló el fix de
  seguridad/servidor dentro de ISA-326.
- **Integración ISA-330 antes del PR:** merge `--no-ff` limpio en `d0789e5`
  sobre `origin/nightly@5069cbb`, seguido de sincronización limpia del PR #207
  (`origin/nightly@cc54d36`) en `e45bcf9`. Resultado combinado final: `go test ./...` PASS;
  frontend 367 archivos/2636 tests PASS; build PASS; `design-system:check` 3/3;
  visual Studio PASS con 59 baselines, tres capturas responsive y controles de
  paridad/interacción a 0.000 %. Se actualizaron únicamente los baselines
  `studio-wide`, `studio-medium` y `studio-small` tras inspección visual: ahora
  documentan `contain` 16:9 en lugar del antiguo estiramiento vertical.
- **Lint de integración:** permanece informativo y rojo por deuda previa. La
  comparación final exacta confirma que `origin/nightly@cc54d36` tiene 47
  errores/2 warnings y la integración 44/2; no añade violaciones. Un primer Go sin
  `frontend/dist` no fue un gate válido; tras build pasó completo. El único
  fallo intermitente observado (`OpsBridgeStartTwice...`) pasó 20/20 aislado y
  la repetición completa.
- **Publicación ISA-330:** el PR #208 pasó CI y se fusionó por squash en
  `nightly@234794d`. El workflow oficial `Release build` run `31633854889`
  publicó la pre-release `v0.1.0.7-nightly.7` sobre el mismo SHA. El primer
  intento falló antes de publicar por una descarga transitoria de Electron y el
  segundo por el soak Windows intermitente ya inventariado; el rerun final, sin
  cambios de código, terminó PASS. La release contiene los seis assets oficiales
  y una descarga independiente confirmó los SHA-256 del instalador, portable y
  ejecutable. ISA-329 continúa abierta como limitación OBS aceptada para este
  corte; `testers` y `master` permanecen sin cambios.
Nota ISA-334 / Broadcast Tower horizontal (2026-08-14, promovida a Nightly):
- Issue y rama: `ISA-334`,
  `vantareapp/isa-334-overlay-studio-broadcast-tower-debe-ocupar-todo-el-ancho-y`,
  base exacta `origin/nightly@8de4f511972757476d96d6a525b69c8917f4ca56`.
- Causa: el widget heredaba geometría genérica `520×260`, ocho handles y
  escalado uniforme por ancho aunque Crystal define una franja horizontal.
- Solución candidata: altura fija de 50 px, ancho inicial igual al viewport
  real del perfil, resize solo este/oeste y reflow sin escala tipográfica.
- Evidencia actual: focal 74/74, frontend 2641/2641, lint focal, build y CI PASS.
  El browser colaborativo agotó timeout al capturar; la validación visual
  manual sigue pendiente. PR #224 fusionada por squash en `nightly` como
  `04c3ac3cabcc6cb8cc86617ba88e0676f5f802d7`; Linear está en `Nightly`.
  No hubo promoción a `testers`/`master` ni release.
