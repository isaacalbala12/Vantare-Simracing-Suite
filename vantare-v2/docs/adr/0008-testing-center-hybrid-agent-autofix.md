# ADR 0008: automatización híbrida y fail-closed del Testing Center

- Estado: aceptado para planificación; ejecución remota y promociones apagadas.
- Fecha: 2026-08-12.
- Issue: ISA-317 / CCAF-02.
- Sustituye: la ruta de ejecución `Supabase -> Linear -> Codex Cloud` de ADR
  0007 y de los planes TAU-07D/J. Conserva sus contratos de privacidad,
  saneamiento, deduplicación, SHA exacto y auditoría.

## Contexto

El Testing Center ya permite que testers autorizados envíen incidencias y
evidencia saneada. Supabase contiene reportes, incidencias técnicas,
fingerprints, outboxes, leases, fencing, candidatas y auditoría. También existe
un workflow Codex expresamente inerte y un circuito operativo opcional hacia
Linear. La ejecución vigente, sin embargo, todavía exige intervención humana y
no resuelve una incidencia cuando el PC de Isaac está apagado.

El spike ISA-316 no demostró una ejecución fiable de Codex Cloud iniciada desde
Linear. Ese NO-GO invalida Linear como dependencia técnica de ejecución, no su
utilidad como tablero humano. El objetivo nuevo es ejecutar en infraestructura
cloud usando la suscripción Claude Max de Isaac para Claude Code y una API
separada para OpenCode con DeepSeek V4 Flash.

La automatización toca una rama compartida de pruebas y por ello no puede
descansar en la opinión de un modelo. Los modelos proponen; contratos, gates,
CI, reglas de rama y la máquina de estados autorizan o detienen.

## Decisión

Se adopta este circuito canónico:

```text
tester -> Supabase -> DeepSeek triage -> eligibility gate
       -> Claude RED -> RED gate -> Claude GREEN -> diff gate
       -> Opus review -> CI/merge_group -> nightly
       -> smoke post-merge -> tag Nightly -> callback Supabase
                                  |
                                  `- fallo: sin tag + PR de revert
```

Linear no forma parte de la ruta crítica. Puede recibir una proyección
sanitizada, idempotente y asíncrona para seguimiento humano; un fallo de Linear
no crea, cancela, repite ni autoriza una ejecución.

La primera versión activable será estrecha: una incidencia, una generación de
ejecución, una rama, una PR y cero reintentos de agente. Un resultado ambiguo,
timeout o fallo de gate termina en `needs_owner`. Los reintentos técnicos
anteriores al dispatch pueden repetirse con la misma clave idempotente; nunca
crean una segunda ejecución.

## Autoridades y fronteras

| Sistema | Autoridad | No puede autorizar |
| --- | --- | --- |
| Testing Center | intención del tester y consentimiento | código, scope, modelo o promoción |
| Supabase | trabajo, estado, dossier, idempotencia, leases y callback | afirmar que GitHub ejecutó o pasó CI sin evidencia |
| OpenCode + DeepSeek | clasificación, duplicados y propuesta de aceptación | escritura Git, elegibilidad, merge, tag o retry |
| Claude Code implementador | test RED y arreglo GREEN dentro del scope | ampliar scope, aprobar su diff, mergear o publicar |
| Claude Code reviewer | revisión independiente y veredicto estructurado | modificar archivos o sustituir gates |
| GitHub | rama, commits, PR, checks, merge queue, tag y release | alterar el estado canónico sin callback verificado |
| Linear | espejo operativo opcional | disparar o bloquear la ruta crítica |

El texto de tester, adjuntos, logs, títulos, comentarios, commits y salida de
modelos son datos no confiables. Solo los campos server-owned del dossier
pueden convertirse en parámetros de workflow.

## Identidad e idempotencia

La unidad canónica es `technical_issue_id`. En v2 cada incidencia admite una
única `execution_generation=1`; reintentos de modelo, rebase o segunda PR están
fuera del contrato automático.

```text
job_key = sha256(
  technical_issue_id + report_digest + nightly_base_sha + policy_version
)
```

Invariantes:

- `job_key` es único y no se reutiliza con otro digest o SHA.
- una generación reserva como máximo un dispatch por fase (`triage` y `fix`),
  una rama y una PR;
- todo claim usa lease y fencing token; una respuesta con token vencido se
  descarta;
- una respuesta externa ambigua no se redespacha;
- si cambia el SHA de `nightly` antes del dispatch, el job termina
  `needs_owner`; v2 no rebasa ni crea otra generación automáticamente;
- callbacks repetidos convergen por `delivery_id + job_key + head_sha`;
- ningún estado terminal vuelve a uno ejecutable.

## Dossier y aceptación estructurada

Supabase entrega al triage solo evidencia saneada. DeepSeek V4 Flash, ejecutado
por OpenCode en modo read-only, devuelve JSON cerrado con:

- `classification`: `bug`, `duplicate`, `needs_info` o `ineligible`;
- `duplicateOf` y razones comprobables;
- reproducción normalizada, observado y esperado;
- criterios de aceptación observables;
- test de regresión propuesto y comando permitido;
- paths candidatos, paths prohibidos y riesgo;
- incertidumbres, sin convertirlas en hechos.

Supabase valida la forma, vuelve a sanear los textos y compone el dossier
final. El modelo no puede elegir repo, base, rama, permisos, comandos, límite
de archivos ni política.

## Gate determinista de elegibilidad

La ejecución automática solo es elegible cuando todas las condiciones son
verdaderas:

1. incidencia clasificada como bug y no duplicada;
2. reproducción y aceptación completas;
3. base igual al `origin/nightly` observado al reservar el trabajo;
4. scope explícito de máximo cinco archivos productivos y sus tests;
5. comando focal perteneciente a una allowlist versionada;
6. cambio pequeño y reversible, sin dependencia nueva;
7. cero migraciones, auth, billing, secretos, permisos, workflows, releases,
   gobernanza, borrados de datos o arquitectura;
8. cero solapamiento con otro lease o PR activo sobre los mismos paths;
9. test RED viable y determinista;
10. gates CI aplicables disponibles como bloqueantes.

Cada condición es un campo server-owned obligatorio de la policy: familia
allowlisted, riesgo `low`, base exacta, disponibilidad de gates y booleanos
negativos para auth, billing, secretos, permisos, workflows, releases,
gobernanza, arquitectura, borrado, dependencia y migración. Un campo ausente
o no demostrable rechaza la elegibilidad.

Una incidencia visual solo es elegible si existe un harness determinista y su
check aplicable es bloqueante. Capturas subjetivas o un visual advisory
producen `needs_owner`.

## Ejecución TDD

La implementación se divide en dos sesiones Claude Code independientes sobre
la misma rama aislada:

1. **RED:** solo puede modificar tests allowlisted. Debe añadir una regresión
   observable y commitearla con `Testing-Center-Phase: red`.
2. **RED gate:** ejecuta el comando focal en ese commit. Debe fallar por la
   aserción esperada, no por compilación, infraestructura o test roto.
3. **GREEN:** parte del commit RED, puede modificar únicamente los paths
   productivos allowlisted y escribe el arreglo mínimo.
4. **GREEN gate:** el focal y las suites derivadas del diff pasan.
5. **REFACTOR:** por defecto es un no-op. Si resulta imprescindible, usa un
   commit separado `Testing-Center-Phase: refactor`, no cambia tests ni
   comportamiento y repite todos los gates.

La suscripción Claude Max se autentica en CI mediante un token generado por
`claude setup-token`, guardado como secret y entregado al input
`claude_code_oauth_token` de la acción oficial. El implementador usa el modelo
fijado por política; la selección inicial propuesta es `claude-sonnet-5`.

DeepSeek no se anida como MCP dentro de Claude en la primera versión. Su
análisis es un artefacto separado, digestado y no autoritativo. Esto mantiene
credenciales, límites, fallos y atribución independientes.

## Gate determinista del diff

Antes de abrir la PR como lista para review, el gate rechaza:

- paths fuera del dossier, más de cinco archivos productivos o un presupuesto
  de líneas superior al definido por la policy;
- cambios en `.github/`, dependencias, lockfiles, migraciones, rollbacks,
  secretos, binarios, generated code o documentación de gobierno;
- borrados, renames, submódulos, permisos ejecutables nuevos o symlinks;
- tests omitidos, debilitados, saltados o modificados después de RED;
- ausencia del commit RED o RED que no falla con la firma prevista;
- base/HEAD/ancestry distintos, merge commits del agente o force-push;
- salida que contenga tokens, rutas locales o evidencia privada.

El gate produce un manifiesto digestado de commits, archivos, comandos y
resultados. La salida del agente nunca se traduce directamente en permisos.

## Review independiente

Una sesión nueva de Claude Code, sin historial de implementación y con
`contents: read` y `pull-requests: read`, revisa el diff exacto usando
`claude-opus-5` y esfuerzo `high`. Devuelve JSON cerrado como artefacto/check
del workflow con cumplimiento de aceptación, riesgos, alcance, calidad del
test y severidades P0-P3; no publica una aprobación formal de GitHub.

Solo `approve` con P0/P1/P2 igual a cero habilita CI. El reviewer no edita,
empuja, aprueba en nombre de un humano ni puede neutralizar un gate. Cualquier
salida inválida o falta de independencia termina en `needs_owner`.

## CI, merge queue y canales

Los checks bloqueantes para una PR elegible incluyen:

- política de rama y manifiesto del job;
- `go test ./...`;
- `pnpm --dir vantare-v2/frontend test`;
- `pnpm --dir vantare-v2/frontend build`;
- lint estricto de archivos cambiados;
- build Windows/Wails real;
- harness visual bloqueante cuando el scope lo exige;
- test RED reproducido sobre el commit RED y GREEN sobre el HEAD.

El lint global y los visuales advisory actuales no satisfacen este contrato.
Hasta convertir el check aplicable en bloqueante, esos scopes son ineligibles.

GitHub Merge Queue debe ejecutar los mismos required checks en
`merge_group`. La cola se configura con grupos de una PR para serializar
Nightly. Una policy posterior debe admitir ramas automáticas derivadas del
`technical_issue_id` y reconocer Supabase como expediente de ejecución; hasta
entonces se conservan `vantareapp/isa-*` y el auto-merge permanece apagado.

La única promoción automatizable es `rama automática -> nightly`. `testers` y
`master` continúan requiriendo el flujo y las aprobaciones vigentes.

Los eventos `repository_dispatch` y `workflow_run` solo son operativos cuando
el workflow existe en la rama predeterminada. Por ello la infraestructura se
promueve primero, todavía inerte y con kill switch activo, por el circuito
humano `issue -> nightly -> testers -> master`. Esto no promueve a Master las
correcciones de testers: sus ramas continúan apuntando exclusivamente a
`nightly`.

## Smoke, tag y rollback

Un merge a `nightly` no crea el tag inmediatamente. Antes de entrar en Merge
Queue, Supabase reserva de forma atómica el siguiente identificador
del contrato de build existente `vX.Y.Z.R-nightly.N`; reservar el nombre no crea ni
empuja un tag. Un commit determinista de metadata añade a la PR el manifest y
fragmento exigidos por el pipeline existente. El fragmento usa un ID público
`TC-<12 HEX>` derivado de `technical_issue_id`; el schema conserva también
`ISA-N`, por lo que Linear no es necesario para publicar. Antes de encolar se
repiten diff gate, review y CI sobre ese HEAD final y se verifican los
prerrequisitos de release y las rutas Discord Nightly. Después del merge:

1. se verifica que el SHA mergeado contiene exactamente la PR esperada;
2. se ejecutan smoke tests post-merge sobre ese SHA;
3. se comprueba que la reserva sigue ligada al mismo `job_key` y SHA;
4. se llama `release.yml` como workflow reutilizable con el manifest y
   fragmento ya integrados;
5. se comprueban prerelease, seis artefactos, checksums y SHA;
6. Supabase recibe el estado final y enlaces saneados.

Si el smoke falla, no se crea tag ni release. El lock serial impide encolar el
siguiente job hasta cerrar el incidente; se crea una rama y PR automática de
revert contra `nightly`, se ejecutan todos los gates y se notifica a Supabase.
Nunca se hace push directo, force-push, borrado o movimiento de tags.

## Máquina de estados v2

Los nombres definitivos se materializarán en una migración aditiva. El contrato
conceptual es:

```text
technical_issue.reported -> agent_job.triage_queued -> triaged
  -> duplicate | needs_info | ineligible
  -> eligible -> red_running -> red_verified
  -> green_running -> diff_verified -> review_approved
  -> ci_running -> merge_queued -> merged_nightly
  -> smoke_running -> nightly_tagged -> completed

cualquier estado ejecutable -> needs_owner | stopped
merged_nightly + smoke_failed -> revert_pr_open -> reverted | needs_owner
```

`completed` exige callback verificado del tag y release Nightly. `merged_nightly`
no equivale a tag, candidata distribuida, Testers, Master ni release estable.

## Rollout y kill switches

La activación requiere issues y evidencia separadas:

1. **observe:** triage y gates sobre reportes sintéticos, sin Git write;
2. **draft:** RED/GREEN y PR draft, merge manual;
3. **pilot:** una única familia de bugs y una PR real, aprobación manual para
   entrar en cola;
4. **automatic:** merge queue a Nightly bajo preautorización estrecha;
5. **expanded:** nuevas familias solo tras métricas y review explícita.

Kill switches global, por repositorio, por familia y por job se comprueban
antes de cada efecto externo. Revocar un secret, pausar Supabase o deshabilitar
el workflow deja el sistema seguro y recuperable.

## Observabilidad y retención

Cada transición registra `job_key`, generación, policy version, actor técnico,
base/head SHA, run IDs, PR, check suite, review digest, tag y timestamps. Las
métricas mínimas son elegibilidad, duplicados, tiempo por fase, fallos por gate,
coste/uso por proveedor, reverts y falsos positivos confirmados.

Logs y artefactos se sanean antes de persistir. Nunca contienen prompts con
evidencia cruda, secrets, tokens OAuth/API, URLs privadas de replay o identidad
pública del tester. Se conservan las ventanas de privacidad de ADR 0007 hasta
que una issue específica las cambie.

## Consecuencias

- La automatización funciona con el PC local apagado porque se ejecuta en
  GitHub-hosted runners y servicios cloud.
- La suscripción Claude Max puede alimentar Claude Code sin OpenAI Platform;
  DeepSeek sigue siendo consumo API separado.
- Linear deja de ser un punto único de fallo, pero sigue disponible como espejo.
- Dos sesiones Claude para RED/GREEN y una tercera para review aumentan coste a
  cambio de evidencia TDD e independencia reales.
- La automatización completa no puede activarse con los gates actuales: hacen
  falta policy v2, `merge_group`, lint/visuales aplicables bloqueantes, smoke y
  callback.
- El diseño histórico se conserva para comprender contratos y decisiones; no
  debe ejecutarse como ruta Linear/Codex Cloud.

## Referencias externas verificadas el 2026-08-12

- [Claude Code: autenticación para CI con `claude setup-token`](https://code.claude.com/docs/en/team).
- [Claude Code Action: input OAuth alternativo](https://github.com/anthropics/claude-code-action/blob/main/action.yml).
- [Claude Opus 5 y esfuerzo](https://platform.claude.com/docs/en/about-claude/models/overview).
- [OpenCode en GitHub Actions](https://opencode.ai/docs/github/).
- [OpenCode: proveedor DeepSeek](https://opencode.ai/docs/providers/).
- [DeepSeek V4 Flash](https://api-docs.deepseek.com/quick_start/pricing/).
- [GitHub Merge Queue y evento `merge_group`](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue).

Estas interfaces externas deben volver a verificarse y fijarse por SHA/version
en la issue que las active.
