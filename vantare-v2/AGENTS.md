# AGENTS.md

Guia obligatoria para agentes que trabajen en este repo.

La aplicación es **Rust + GPUI** en `native/`, conforme a
[ADR 0099](docs/adr/0099-arquitectura-rust-nativa.md). #1533 retira el código de
la app Wails/React de este checkout; esto no publica un corte ni una release.
Lee `native/README.md`, los README de los crates afectados y sus gates.
Los corpus y referencias se conservan en `native/retirement`; los oráculos
Go históricos se reproducen opcionalmente desde `tools/frozen-go`.

## Criterio de trabajo

Isaac dirige y verifica agentes; explica en español sencillo qué cambió,
la evidencia y cómo comprobarlo. Implementa la solución correcta más sencilla,
legible y segura; simplifica si la complejidad supera al problema.

## Issues

GitHub Issues y el Project Vantare son la autoridad operativa (#1503).
`ISA-N` es el número GitHub para issues nuevas; los IDs migrados conservan
su título e identificadores históricos. Usar `vantareapp/isa-N-slug`.
Las instrucciones de Notion en otros documentos son históricas.

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

Los roles, criterios de elección y encargos viven en
[la skill de orquestación](.claude/skills/orquestacion/SKILL.md).
Leerla antes de planificar o delegar; respetar el modelo autorizado en el encargo.

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

## Stop conditions

Para y pide revisión si la base/rama/SHA no coincide con la issue, hay cambios
ajenos en conflicto, se exceden las rutas previstas, falta una dependencia
aprobada, hay que cambiar arquitectura, no se entiende un fallo o no se sabe
verificar, los documentos vigentes se contradicen o la acción está reservada a Isaac.

## Ruta nativa

La decisión vigente es ADR 0099 y su [plan por fases](docs/superpowers/plans/2026-09-29-arquitectura-rust-nativa.md).
El mapa de crates y la topología viven en [native/README.md](native/README.md).

`domain` y `ui` no dependen de `runtime`, tampoco transitivamente; conserva el
test de arquitectura descrito en `native/README.md`. Usa Rust concreto,
funciones puras y `Result`, y GPUI directamente conforme a ADR 0099.

Desde `native/`, `cargo fmt --all -- --check`; gates check, clippy
(`-D warnings`), test (Nextest) y lifecycle, por la cola del repo.
La configuración exacta, DuckDB de desarrollo/distribución, targets propios,
plataformas, caché y limpieza están en [native/README.md](native/README.md).
Una entrega documental puede omitir compilación si el brief lo autoriza;
registra los checks omitidos y el motivo.

## Código retirado

No hay gates Go ni pnpm de la app nativa. Los oráculos son referencia histórica
inerte: no reintroducir Wails/React. Validar sus huellas con
`python native/retirement/verify.py`. Los otros proyectos del monorepo
conservan sus instrucciones propias.

## Compilación Rust (`native/`)

Desde `vantare-v2/`, compilar siempre mediante
`pwsh -NoProfile -File native/scripts/compilar.ps1 <comando> [args...]`,
con target propio y `-j 2`. La cola limita slots y RAM; usa sccache si está
instalado. Si falla sin diagnóstico del compilador, repetir con
`VANTARE_SCCACHE=0` y conservar el fallo en la evidencia (#1465).
No compartir targets ni copiar su caché a carpetas de evidencia.

## Testing

- Si tocas código/fixtures de runtime, domain, ipc o testdata, pasa también telemetría (#1498).
- Todo cambio de comportamiento necesita test o explicacion de por que no.
- Bugs corregidos necesitan test de regresion cuando sea viable.
- Antes de refactorizar comportamiento existente, crea o identifica tests que lo protejan.
- No escribas tests complacientes que solo prueban detalles internos del cambio.
- Usa reloj inyectado o sincronización explícita; las esperas temporizadas en tests necesitan justificación.
- No compares strings de error si puedes usar errores tipados o comportamiento observable.

## Dependencias y patrones prohibidos

Preferir la biblioteca estándar de Rust y herramientas instaladas. Una nueva
dependencia necesita aprobación y justificación: necesidad, alternativa
existente, riesgo y solución más simple.

Prohibidos: grandes rewrites, microservicios prematuros, arquitectura fuera
de fases autorizadas de ADR 0099, abstracciones enormes, interfaces de una
implementación sin justificación, factories/providers/managers innecesarios,
estado global mutable, tareas/hilos sin cancelación y cierre, canales para
trabajo secuencial sin justificación, mocks innecesarios, secretos hardcodeados,
limpieza sin alcance y renderizadores/pipelines que dupliquen la fuente de verdad.

## Evidencia final obligatoria

Revisa el diff completo. Informa issue/URL, proyecto, estado y última actualización verificada;
archivos y checks con resultados/omisiones; riesgos y verificación manual;
rama, base, HEAD, commits, push, PR, CI y canal realmente alcanzado.
Confirma si hubo merge, release o acción externa y su autorización.
