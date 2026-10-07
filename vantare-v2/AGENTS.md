# AGENTS.md

Guia obligatoria para agentes que trabajen en este repo.

Hay dos líneas de producto. La aplicación nativa **Rust + GPUI** en `native/`
es la base de futuro y de la beta, por decisión aceptada en
[ADR 0099](docs/adr/0099-arquitectura-rust-nativa.md). Wails **Go + React**
(`internal/`, `cmd/`, `pkg/`, `frontend/`) es legado y sigue en producción
hasta el corte autorizado. Para la ruta nativa, lee `native/README.md`, los
README de los crates afectados y sus gates; las secciones Go y TypeScript /
React de este archivo siguen siendo obligatorias cuando se toca el legado.

## Contexto del usuario

- El usuario no revisa codigo complejo linea por linea.
- El usuario si sabe dirigir agentes, modelos, prompts, revisiones y verificaciones.
- El repo debe protegerse con cambios pequenos, tests, builds, documentacion viva y checklists claras.
- Explica los resultados en espanol sencillo: que cambio, que archivos tocaste, que checks pasaron y como puede verificarlo manualmente.

Regla central: implementar la solucion correcta mas sencilla, legible y segura.
Menos codigo es preferible cuando mantiene o mejora claridad, seguridad,
pruebas y rendimiento. Si la complejidad supera claramente al problema, revisa
y simplifica antes de ampliarla.

## Notion primero: obligatorio desde 2026-09-14

Abrir el [hub de Vantare](https://app.notion.com/p/3fce51695c65834e80b381ec2d632192) y leer la tarea y su proyecto
antes de ejecutar, incluidas las issues importadas. Leer el contrato completo
[docs/vantare-program/notion-transition.md](docs/vantare-program/notion-transition.md).
Actualizar y releer Notion al empezar, bloquear, entregar y verificar integración.
Una tarea no está entregada si su evidencia solo existe en GitHub o en el chat.

### Compatibilidad técnica temporal con GitHub

- GitHub conserva código, ramas, PR, CI, builds y releases. Su Project y labels
  de estado son referencias históricas, no la cola de ejecución.
- Los validadores actuales aún consultan una issue GitHub viva y usan ramas
  `vantareapp/isa-N-slug`. Reutilizar la issue existente; si CI requiere una nueva,
  crear primero la tarea Notion y enlazar la issue como puente técnico mínimo.
  Mantener en ella el contrato de roadmap que consume CI, coherente con Notion.
- Separar UUID/`VAN-N`, número GitHub e ISA histórico. GitHub #519 = ISA-233;
  no obtener la identidad del título ni reutilizar VAN como ISA.
- Linear fue retirado el 2026-08-20. No es una dependencia operativa.
- El corte técnico exclusivo sigue pendiente; esto no pospone Notion como
  autoridad de alcance, prioridades, dependencias y seguimiento.

## Fuentes de verdad y lectura obligatoria

Antes de interpretar o ejecutar una tarea:

1. Lee la tarea Notion y su proyecto; verifica acceso de lectura/escritura.
   Verifica raiz Git, rama, HEAD, worktree y `git status --short`; consulta
   las instrucciones de `origin/nightly` actualizado si el checkout es antiguo.
2. Lee este archivo y `docs/vantare-program/notion-transition.md`.
3. Lee `docs/agent-workflow.md` y `docs/branch-channels.md` si la tarea afecta
   Git, el tracker, CI, releases o estados.
4. Lee `docs/vantare-program/README.md`, sus contratos aplicables y el unico
   handoff vivo del proyecto.
5. Lee dependencias y aceptación en Notion, la referencia GitHub que consume CI
   y el plan, ADR o microplan vigente.
6. Lee el codigo y los tests que demuestran el comportamiento actual.

Las decisiones recientes del expediente canonico y la evidencia del runtime
prevalecen sobre planes historicos. La tarea Notion es la autoridad para alcance,
dependencias y estado; GitHub demuestra rama, PR, CI e integración; no sustituye los contratos de producto o
arquitectura. No uses la skill `vantare-core`: esta desactualizada.

Si un contrato pide `docs/roadmap/plan.md`, comprueba primero que existe en la
rama. Si falta, desde la raíz Git comprueba
`git cat-file -e origin/nightly:vantare-v2/docs/roadmap/plan.md` y, solo si
existe, léelo con `git show origin/nightly:vantare-v2/docs/roadmap/plan.md`.
En la base de #1483 tampoco existe en `origin/nightly` verificado; no inventes
una ruta ni recrees el plan. Registra la ausencia y la contradicción con el
contrato que exige actualizar alcance y entregas en el mismo PR para decisión
de Isaac: consultar otra rama no cumple ese requisito ni autoriza omitirlo.
El checkout contiene `docs/roadmap-maintenance.md`; no sustituye por sí solo
la regla del mismo PR ni autoriza publicar cambios.

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
  riesgos o siguiente accion. Notion contiene la continuidad operativa; Git
  conserva la evidencia técnica versionada con enlace a la tarea.
- Toda ejecución requiere tarea Notion antes de editar. Registrar Estado,
  Proyecto, Agente, alcance, dependencias y siguiente paso. Los hallazgos fuera
  de alcance van a Notion como pendientes; no se ejecutan sin alcance autorizado.
  Releer después de escribir y registrar bloqueos de acceso sin simular éxito.
- La delegacion tiene un solo nivel por defecto: el orquestador puede crear
  workers, pero un worker no puede crear subagentes ni delegar su tarea salvo
  autorizacion expresa y acotada del orquestador. No ejecutes dos agentes en
  paralelo sobre el mismo worktree o rama.
- No delegues una tarea trivial cuando ejecutarla directamente sea mas clara y
  barata. El orquestador sigue siendo responsable de revisar el diff, la
  evidencia y el handoff; el reporte del worker no basta por si solo.
- En el legado Wails, Overlay Studio V3 es un único editor de layout, contenido, comportamiento y apariencia. Mantén separadas sus capas internas: el canvas solo gestiona interacción espacial; el inspector edita el documento; los renderizadores visuales reciben ViewModels puros y nunca acceden a persistencia, permisos, Wails/SSE ni posición. Consulta ADR 0003 y el plan maestro V3.
- En el legado Wails, `WidgetVisualHost` es la frontera compartida de renderizado para Studio,
  Desktop, OBS y Workshop. En el flujo aprobado de autoria visual se edita el
  TSX/CSS productivo y Workshop debe reflejarlo mediante HMR: no crees un renderer duplicado, DSL,
  compilador HTML, scaffolder o registro generico salvo una decision nueva.
  Los HTML son contratos visuales; el fondo del escenario no forma parte del
  widget ni de sus capturas de paridad.
- Si tocas drag/resize del canvas V3 del legado Wails, lee primero `docs/overlays-studio/canvas-drag-imperative-preview.md` (preview DOM imperativa; no reintroducir posición transitoria vía React state).
- El alcance, las dependencias y el estado operativo viven en la tarea Notion.
  El roadmap público muestra varias vistas gráficas de una única publicación.
  Isaac indica los cambios a Codex por chat; Codex actualiza la publicación
  compartida en Supabase tras comprobar la versión vigente. La app solo lee.
  No hay editor en la app, archivo de contenido ni requisito de modificar el
  roadmap en cada PR.
- Cada tarea vive bajo su **Proyecto** y, si está comprometida para una versión,
  su **Hito** en Notion. Conservar labels/milestones GitHub solo cuando los
  consumidores técnicos actuales los necesitan. El hito agrupa las entregas de una
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

Dentro de una tarea Notion aprobada, los agentes pueden actualizar Notion y
las referencias técnicas necesarias, crear o actualizar
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
9. Actualiza y relee la tarea y continuidad del proyecto en Notion después de
   cada worker o cambio material; enlaza el handoff técnico versionado. Si Isaac
   pide cambiar el roadmap público, actualiza la publicación compartida según
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
- La base, rama o SHA no coincide con la tarea Notion y su referencia técnica.
- La accion requiere una autorizacion reservada a Isaac.

## Ruta nativa

La decisión vigente es ADR 0099 y su
[plan por fases](docs/superpowers/plans/2026-09-29-arquitectura-rust-nativa.md).
Mapa actual de `native/Cargo.toml` (los README por crate detallan contratos):

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

## Go

- Usa Go simple e idiomatico.
- Ejecuta `gofmt` en archivos Go modificados.
- Ejecuta `go test ./...` si tocaste Go o contratos compartidos.
- Maneja errores siempre; no uses `_` para ignorarlos salvo justificacion clara.
- Envuelve errores con contexto usando `%w` cuando propagas errores.
- No uses `panic` salvo casos muy justificados o tests.
- No uses `log.Fatal` fuera de `main`.
- Usa `context.Context` en I/O, red, DB, procesos largos o tareas cancelables.
- Evita interfaces prematuras; define interfaces en el consumidor cuando hagan falta.
- Evita paquetes `utils` genericos.
- No metas goroutines/channels sin razon clara.
- Toda goroutine debe tener cancelacion o camino de cierre.
- Preferir tests table-driven para logica.
- Usa `testdata/` para fixtures reales.

## TypeScript / React

- Mantener TypeScript estricto segun la configuracion existente.
- Ejecuta `pnpm --dir frontend test` si tocaste frontend.
- Ejecuta `pnpm --dir frontend build` antes de cerrar cambios frontend relevantes.
- Ejecuta `pnpm --dir frontend lint` si tocaste patrones que ESLint cubre.
- Ejecuta `pnpm --dir frontend typecheck` para comprobar tipos sin construir.

### Typecheck: usa `pnpm typecheck` o `pnpm build`, nunca `-p tsconfig.json`

`frontend/tsconfig.json` es solution-style: tiene `"files": []` y delega en
`references` (`tsconfig.app.json` y `tsconfig.node.json`). Por eso:

- **VALIDO:** `pnpm --dir frontend typecheck` (`tsc -b --noEmit`) o
  `pnpm --dir frontend build` (`tsc -b && vite build`). Ambos recorren los
  proyectos referenciados y comprueban los ficheros de verdad.
- **NO COMPRUEBA NADA:** `tsc --noEmit -p tsconfig.json`. Con `"files": []` no
  typechequea ni un solo fichero y sale con codigo 0 en vacio, aunque el
  codigo tenga errores de tipos. Ya provoco que un error de tipos real
  llegara a CI sin ser detectado. No lo uses como gate.

- No anadas librerias UI sin aprobacion.
- No dupliques estado si ya existe una fuente clara.
- Mantener logica de negocio fuera de componentes React cuando sea razonable.
- Componentes pequenos, con nombres claros.
- No mezcles UI con persistencia o logica core sin necesidad.
- No cambies configuracion de build salvo que la tarea lo pida.

## Testing

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
- Cambios de arquitectura fuera de la decisión Rust + GPUI aceptada en ADR 0099 y de sus fases autorizadas.
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

- URL/ID de la tarea Notion, proyecto, estado y última actualización verificada.
- Archivos creados/modificados/movidos.
- Tests o checks ejecutados y resultado.
- Checks no ejecutados y motivo.
- Riesgos restantes.
- Como verificar manualmente.
- Rama, base, HEAD, commit, push, PR, CI y nivel de promocion realmente alcanzado.
- Confirmacion de que no hubo merge, release o accion externa fuera del alcance.
