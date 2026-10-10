# AGENTS.md

Guia obligatoria para agentes que trabajen en este repo.

La aplicación es **Rust + GPUI** en `native/`, conforme a
[ADR 0099](docs/adr/0099-arquitectura-rust-nativa.md). #1533 retira el código de
la app Wails/React de este checkout; esto no publica un corte ni una release.
Lee `native/README.md`, los README de los crates afectados y sus gates.
Los corpus y referencias se conservan en `native/retirement`; los oráculos
Go históricos se reproducen opcionalmente desde `tools/frozen-go`.

## Contexto del usuario

- El usuario no revisa codigo complejo linea por linea.
- El usuario si sabe dirigir agentes, modelos, prompts, revisiones y verificaciones.
- El repo debe protegerse con cambios pequenos, tests, builds, documentacion viva y checklists claras.
- Explica los resultados en espanol sencillo: que cambio, que archivos tocaste, que checks pasaron y como puede verificarlo manualmente.

Regla central: implementar la solucion correcta mas sencilla, legible y segura.
Menos codigo es preferible cuando mantiene o mejora claridad, seguridad,
pruebas y rendimiento. Si la complejidad supera claramente al problema, revisa
y simplifica antes de ampliarla.

## Issues

- El tracker es **GitHub Issues de este mismo repositorio**. Linear fue
  retirado el 2026-08-20 y no queda ninguna dependencia operativa suya.
- Los identificadores `ISA-N` corresponden al numero de issue de GitHub: una
  issue nueva ya nace con su ISA-N. Los `ISA-N` migrados desde Linear
  conservan su titulo `ISA-N · ...` y las labels `state:*` y `migrated:linear`.
- Las ramas siguen la convencion `vantareapp/isa-N-slug`.
- El tablero es el GitHub Project **Vantare**.

Las instrucciones antiguas de seguimiento en Notion en otros documentos
son históricas: estas reglas y #1503 fijan GitHub como autoridad operativa.

## Fuentes de verdad y lectura obligatoria

Antes de interpretar o ejecutar una tarea:

1. Verifica raiz Git, rama, HEAD, worktree y `git status --short`.
2. Lee este archivo y `docs/roadmap-maintenance.md`.
3. Lee `docs/agent-workflow.md` y `docs/branch-channels.md` si la tarea afecta
   Git, el tracker, CI, releases o estados.
4. Lee `docs/vantare-program/README.md`, sus contratos aplicables y el unico
   handoff vivo del proyecto.
5. Lee la issue de GitHub, sus dependencias y el plan, ADR o microplan vigente.
6. Lee el codigo y los tests que demuestran el comportamiento actual.

Las decisiones recientes del expediente canonico y la evidencia del runtime
prevalecen sobre planes historicos. La issue de GitHub es la autoridad para alcance,
dependencias, rama y estado; no sustituye los contratos de producto o
arquitectura. No uses la skill `vantare-core`: esta desactualizada.

## Reglas generales

- El flujo canónico es `rama de issue -> nightly -> testers -> master`.
  Isaac revisa y acepta primero la entrega aislada; `nightly` recibe esa
  implementacion para pruebas Pro Plus/Owner; `testers` recibe el conjunto
  corregido; solo Isaac puede autorizar la promocion final a `master`.
- El checkout principal de ejecucion e integracion debe seguir `nightly`, pero
  nunca se desarrolla directamente sobre el. Cada issue usa rama y worktree
  aislados. `develop` y `refactor` son referencias historicas, no canales
  actuales de integracion; preserva sus cambios locales y no los limpies.
- Ninguna rama de issue puede saltarse un canal o integrarse directamente en
  `testers` o `master`.
- Terminado, integrado, promocionado y publicado son estados distintos. Nunca
  afirmes uno sin verificar la rama/SHA remota, PR, CI y release aplicables.
- Cada proyecto mantiene un unico handoff vivo. Actualizalo despues de cada
  worker, decision o cambio material de estado, arquitectura, evidencia,
  riesgos o siguiente accion; refleja el mismo estado real en la issue de GitHub.
- Todo trabajo nuevo debe estar cubierto por una issue de GitHub antes de
  editar. Los hallazgos fuera de alcance se documentan como issues y no se
  incorporan silenciosamente.
- La delegacion tiene un solo nivel por defecto: el orquestador puede crear
  workers, pero un worker no puede crear subagentes ni delegar su tarea salvo
  autorizacion expresa y acotada del orquestador. No ejecutes dos agentes en
  paralelo sobre el mismo worktree o rama.
- No delegues una tarea trivial cuando ejecutarla directamente sea mas clara y
  barata. El orquestador sigue siendo responsable de revisar el diff, la
  evidencia y el handoff; el reporte del worker no basta por si solo.
- El alcance, las dependencias y el estado operativo viven en la issue de GitHub.
  El roadmap público es una publicación compartida en Supabase; Isaac indica
  los cambios a Codex por chat y la app solo lee. Consulta
  `docs/roadmap-maintenance.md`. No hay editor en la app ni requisito de
  modificar el roadmap en cada PR. `docs/roadmap/plan.md` y
  `.github/scripts/roadmap_digest.py` fueron retirados de nightly; no se recrean.
- Cada issue vive bajo su **proyecto** (label `area:*`, columna del GitHub
  Project **Vantare**) y, si esta comprometida para una version, bajo su
  **milestone** de GitHub. El milestone agrupa las features que justifican una
  promocion de canal: cuando se cierra al 100%, ese corte es **candidato** a
  subir de nightly a testers, y de testers a master tras su validacion. La
  promocion la dispara una persona, nunca el cierre automatico del milestone.
- No hagas features, refactors o limpieza general si no están en el alcance.
- No redisenes arquitectura de forma oportunista. Un cambio arquitectónico solo
  se ejecuta dentro de una issue/plan aprobados, con ADR cuando corresponda,
  evidencia y review.
- No anadas dependencias sin justificarlo y sin aprobacion.
- No mezcles documentacion, feature, bugfix y refactor en un mismo cambio salvo que sea imprescindible.
- No toques archivos no relacionados.
- No borres documentacion util. Si algo parece obsoleto, marcalo o pregunta.
- No ocultes errores de tests, build o lint.
- No debilites tests para hacer pasar el build.
- Si hay cambios sin commit antes de empezar, identificalos y no los mezcles con tu tarea.
- No leas, imprimas, copies ni versionees secretos o archivos `.env*`. Trabaja
  solo con nombres de variables y procedimientos sanitizados.

## Orquestación y roles de modelos

Cada modelo tiene un rol. Detalle, criterios de elección, modo ahorro y
plantilla de encargo en la skill
[`.claude/skills/orquestacion/SKILL.md`](.claude/skills/orquestacion/SKILL.md);
léela antes de planificar o delegar.

- **Advisors: Fable 5.1 (razonamiento medio) y GPT 6 Astra (max).** Solo si es
  estrictamente necesario o para fijar la dirección al inicio de un plan.
- **Orquestador y optimizador: Opus 5.5 (medio).** Planifica, reparte, optimiza,
  hace el diseño visual nuevo y revisa todo lo que entregan los workers.
- **Ejecutor principal: Sonnet 5.5 (medio).** Código a gran escala y réplicas o
  paridad de diseños existentes; no diseño visual nuevo.
- **Worker barato: DeepSeek V4.1 Flash** (DeepSeek Harness / opencode-go) **y
  Muse Spark 1.3** (free y, al agotarse, contributor), **ambos en max.** Tareas
  repetitivas o sencillas, y más carga cuando quede menos del 50 % de la cuota
  de uso del plan.

## Preautorización inerte de la rama automática (ISA-318)

- La corrección automática del Testing Center usa exclusivamente
  `vantareapp/tc-<12 hex minúsculas>-<slug seguro>[-revert]` y solo como PR a
  `nightly`; nunca a `testers`/`master` ni push directo.
- La ruta automática permanece inerte: la CLI actual rechaza toda rama
  `tc-*` porque no acepta JSON arbitrario. ISA-322 debe verificar
  criptográficamente la atestación v2 y pasar sus claims cerrados al validador
  semántico; texto del payload que afirme estar verificado no concede autoridad.
  `docs/branch-channels.md` fija el conjunto exacto de claims y checks.
- Todo efecto es revocable con kill switch antes de cada paso. Quedan
  excluidos de la preautorización: workflows, schema, auth, billing, secretos,
  dependencias, datos, release y gasto.
- El bootstrap de workflows permanece humano e inerte hasta `master` y no
  configura credenciales, dispatch ni ruleset. No se habilita ninguna ruleset
  ni auto-merge sin autorización expresa de Isaac.

## Autoridad y acciones externas

Dentro de una issue aprobada, los agentes pueden crear o actualizar issues,
ramas, worktrees, commits, pushes, PRs draft, CI, documentacion y reviews.

Requieren autorizacion explicita de Isaac:

- promocionar a `nightly` y promocionar de `testers` a `master`;
- publicar una release o anuncio comercial publico;
- realizar pagos, refunds o acciones con gasto;
- exponer o rotar secretos;
- borrar masivamente datos de forma irreversible;
- eliminar cuentas o datos reales de usuarios.

## Flujo esperado

1. Revisa `git status --short`.
2. Lee los docs relevantes.
3. Declara objetivo, alcance y archivos esperados.
4. Haz un cambio pequeno.
5. Anade o actualiza tests si cambia comportamiento.
6. Ejecuta los checks aplicables.
7. Resume evidencia y verificacion manual.
8. Revisa el diff completo y la evidencia; no confies solo en el resumen de un worker.
9. Actualiza el handoff y la issue de GitHub después de cada worker o cambio
   material. Si Isaac pide cambiar el roadmap público, sigue
   `docs/roadmap-maintenance.md`.

## Stop conditions

Para y pide revision si:

- Necesitas tocar muchos mas archivos de los previstos.
- Necesitas una dependencia nueva.
- Necesitas cambiar arquitectura.
- Los tests fallan por una causa que no entiendes.
- Encuentras cambios previos que chocan con tu tarea.
- No sabes como verificar el resultado.
- Hay contradicciones entre documentos.
- La base, rama o SHA no coincide con la issue.
- La accion requiere una autorizacion reservada a Isaac.

## Ruta nativa

La decisión vigente es ADR 0099 y su
[plan por fases](docs/superpowers/plans/2026-09-29-arquitectura-rust-nativa.md).
Mapa actual de `native/Cargo.toml` (los README por crate detallan contratos):

- `launcher` / `profiling` / `build-support`: motor y archivos locales / contadores por proceso / icono Win32.
- `domain`: modelo neutral, derivaciones, ViewModels y formato; puro, sin I/O ni GPUI.
- `runtime`: adaptadores privados, núcleo, flujos y supervisor de procesos.
- `ipc`: DTO versionados y transporte autenticado entre procesos.
- `ui` / `hub`: widgets, overlays y Workshop GPUI / aplicación Hub y Studio GPUI.
- `engineer` / `storage`: eventos y voz bajo demanda / propietario único de series DuckDB.
- `services`: cuenta, licencia y llamadas remotas bajo demanda, sin UI.
- `strategy` / `admin`: documento y cálculo Strategy / miniapp privada del owner, fuera del instalador público.

`domain` y `ui` no dependen de `runtime`, tampoco transitivamente; conserva el
test de arquitectura descrito en `native/README.md`. Usa Rust concreto,
funciones puras y `Result`, y GPUI directamente conforme a ADR 0099.

Desde `native/`, formato: `cargo fmt --all -- --check`. Para iterar:
`./gates.ps1 check`; antes de entregar cambios Rust:
`./gates.ps1 clippy`, `./gates.ps1 test` y `./gates.ps1 lifecycle`.
Según `native/gates.ps1`, ejecutan check/Clippy del workspace y todos los
targets (Clippy con `-D warnings`), Nextest del workspace y el test lifecycle
por separado, con `--locked --offline -j 2`. Requieren DuckDB oficial instalado
mediante `./setup-duckdb.ps1`; conservan los defaults ajenos a storage y usan
el target propio `target/gates`. No compartas targets entre worktrees.
Esta variante de desarrollo no sustituye el build de distribución con DuckDB
bundled; para compilación, plataformas y empaquetado lee `native/README.md`.
Una entrega solo documental puede omitir compilación si su brief lo autoriza;
registra los checks omitidos y el motivo.

## Código retirado

No hay gates Go ni pnpm de la app nativa. Los archivos de oráculos Go son
referencia histórica inerte, no otra aplicación; no reintroducir Wails/React.
Validar las fuentes y fixtures conservadas con `python native/retirement/verify.py`.
Los otros proyectos del monorepo conservan sus instrucciones propias.

## Compilacion Rust (`native/`)

Cada worktree compila el workspace entero en su propio `target/` (~8 GB).
Con varios workers en paralelo el disco se llena y los corta (ISA-1494).

- Compila siempre a traves de la cola:
  `pwsh -File native/scripts/compilar.ps1 <comando> [args...]`
  (p. ej. `... compilar.ps1 cargo nextest run --workspace`). La cola limita
  las compilaciones simultaneas (`VANTARE_CARGO_SLOTS`, 4 por defecto) y
  espera si hay menos RAM libre que `VANTARE_CARGO_MIN_GB` (5 por defecto).
- La cola activa `sccache` (`RUSTC_WRAPPER`) si esta instalado: las
  dependencias ya compiladas en otro worktree se reutilizan. Ahorra tiempo,
  no disco: cada `target/` sigue guardando su copia. Instalalo una vez con
  `scoop install sccache`. Si una compilacion falla sin diagnostico del
  compilador, repitela con `$env:VANTARE_SCCACHE='0'` y anota el caso en la
  evidencia; no lo trates como fallo del codigo.
- Al entregar el trabajo de un worktree, o si lleva dias sin usarse, borra su
  `native/target/`; es cache y se regenera. Para podar sin borrarlo todo:
  `cargo sweep --time 3` (artefactos sin usar en 3 dias).
- Si la maquina tiene un segundo disco, deja alli los artefactos grandes que no
  son cache (instaladores, builds de prueba, capturas pesadas). No guardes
  copias de `target/` en carpetas de evidencia.

## Testing

- Si tocas runtime, domain, ipc o testdata, pasa también el gate telemetria (#1498).

- Todo cambio de comportamiento necesita test o explicacion de por que no.
- Bugs corregidos necesitan test de regresion cuando sea viable.
- Antes de refactorizar comportamiento existente, crea o identifica tests que lo protejan.
- No escribas tests complacientes que solo prueban detalles internos del cambio.
- No uses `time.Sleep` en tests salvo justificacion.
- No compares strings de error si puedes usar errores tipados o comportamiento observable.

## Dependencias

- Preferir standard library en Go.
- Preferir herramientas ya instaladas en frontend.
- Si propones una dependencia, explica:
  - por que hace falta,
  - por que lo existente no basta,
  - riesgo que introduce,
  - alternativa mas simple.

## Patrones prohibidos

- Grandes rewrites.
- Microservicios prematuros.
- Cambios de arquitectura fuera de ADR 0099 y sus fases autorizadas.
- Abstracciones enormes.
- Interfaces con una sola implementacion sin justificacion.
- Factories/providers/managers innecesarios.
- Estado global mutable.
- Goroutines sin cancelacion.
- Channels para trabajo secuencial.
- Mocks innecesarios.
- Secretos hardcodeados.
- "Mejoras generales" sin alcance.
- Renderizadores alternativos o pipelines paralelos que dupliquen una fuente de verdad.

## Evidencia final obligatoria

Al terminar, informa:

- URL/número de la issue GitHub, proyecto, estado y última actualización verificada.
- Archivos creados/modificados/movidos.
- Tests o checks ejecutados y resultado.
- Checks no ejecutados y motivo.
- Riesgos restantes.
- Como verificar manualmente.
- Rama, base, HEAD, commit, push, PR, CI y nivel de promocion realmente alcanzado.
- Confirmacion de que no hubo merge, release o accion externa fuera del alcance.
