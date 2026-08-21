# Workflow de agentes

> **Nota (2026-08-20):** Linear fue retirado; donde este documento diga
> Linear, lease GitHub Issues (`ISA-N` = numero de issue de GitHub). El
> resto del flujo sigue vigente.

> Estado del checkout principal (2026-08-10): el worktree principal
> `C:\Users\isaac\Desktop\Vantare-Overlays` esta alineado con `origin/nightly`
> (rama `refactor` == `nightly@9c11d7f`). `refactor-b70a950-backup` y
> `chore/conservacion-untracked-2026-08-10` conservan la punta anterior y
> trabajo untracked con valor; su destino queda pendiente de decision humana.
> Trabajo nuevo: rama/worktree por issue de GitHub sobre `nightly`, no sobre
> `refactor`.

> Flujo vigente desde ISA-120/121. Antes de actuar, lee
> `docs/vantare-program/README.md`, `docs/vantare-program/execution-policy.md`,
> `docs/branch-channels.md`, `docs/roadmap/plan.md` y el handoff vivo del proyecto.

## Fuente operativa y aislamiento

- GitHub Issues contiene issues, milestones, dependencias, estado y rama; el
  tablero es el GitHub Project "Vantare" y el estado vive en las labels
  `state:*`.
- Una issue ejecutable con cambios equivale a una rama, un worktree y un
  contexto propios.
- Una investigación que solo modifica la issue no necesita rama; si genera
  docs en el repo, sí.
- Los hallazgos fuera de alcance crean issues; no se incorporan silenciosamente.
- Se confirma base, worktree y estado limpio antes de editar.
- La rama sigue exactamente la convención `vantareapp/isa-N-slug`, con el
  numero de la issue de GitHub.
- Commits pequeños y staging limitado a rutas; no `git add .`.
- El worker puede commit, push, PR draft e `In Review`, pero no promociona sin
  autorización.
- El checkout principal sigue `nightly` para ejecutar y validar el conjunto
  integrado. No se implementan issues directamente en ese checkout.
- `refactor` y `develop` se conservan como historia mientras tengan
  consumidores; no son bases nuevas ni se limpian para reutilizarlas.

## Promoción

```text
rama de issue
  -> aprobación inicial de Isaac
nightly
  -> feedback Pro Plus y correcciones
testers
  -> validación amplia
master, solo con aprobación final de Isaac
```

`nightly` y `testers` existen desde ISA-121. `develop` queda congelada como
referencia histórica y no recibe trabajo nuevo. La promoción usa una issue de
integración propia; terminar una feature no la promociona automáticamente.
Tests y review no sustituyen las aprobaciones.

## Rama automática del Testing Center (ISA-318)

La corrección automática usa únicamente
`vantareapp/tc-<12 hex minúsculas>-<slug seguro>[-revert]` como PR a `nightly`.
La ruta permanece inerte:

- la CLI actual no acepta JSON arbitrario y rechaza una rama `tc-*` sin una
  atestación confiable, por lo que no activa efectos;
- ISA-322 debe verificar criptográficamente la procedencia de la atestación v2
  antes de pasar sus claims cerrados al validador semántico; un marcador dentro
  del payload nunca demuestra esa verificación;
- `docs/branch-channels.md` fija el contenido exacto de los claims, sus checks
  y las comparaciones de frescura obligatorias;
- cada efecto se revoca con kill switch antes de ejecutarse;
- quedan excluidos workflows, schema, auth, billing, secretos, dependencias,
  datos, release y gasto;
- el bootstrap de workflows es humano e inerte hasta `master` y no configura
  credenciales, dispatch ni ruleset; no se habilitan rulesets ni auto-merge
  sin autorización expresa de Isaac.

Terminado en rama, integrado en un canal, promocionado y publicado son estados
distintos. Cada reporte debe identificar el ultimo estado demostrado con rama,
SHA, PR, CI y release cuando corresponda.

## Delegacion

- La profundidad predeterminada es uno: orquestador -> worker.
- Un worker no crea subagentes ni delega su trabajo salvo autorizacion expresa,
  acotada y documentada del orquestador.
- No se ejecutan agentes en paralelo sobre el mismo worktree o rama.
- No se delega trabajo trivial cuando hacerlo directamente reduce coste y
  riesgo.
- El orquestador revisa por si mismo el diff, los checks y el handoff. El
  resumen de un worker es evidencia a comprobar, no una aprobacion.

## Roles

## Orquestador

Define objetivo, alcance, riesgos, prompt para worker, prompt para reviewer y checklist para el usuario.

Puede implementar directamente cuando el usuario lo pida, la tarea sea pequena
o delegarla cueste mas que resolverla con seguridad. En trabajos amplios debe
preservar contexto para decisiones, prompts, reviews y verificacion.

Puede editar directamente:

- documentacion viva;
- planes;
- prompts;
- cambios de codigo triviales si crear un worker costaria mas contexto que resolverlo;
- fixes urgentes aprobados por el usuario.

No debe editar directamente:

- features completas;
- refactors;
- persistencia/schema;
- UI compleja;
- backend delicado;
- cambios que puedan ser ejecutados por un worker con miniplan claro.

## Worker

Ejecuta una tarea pequena.

Debe:

- leer docs relevantes,
- revisar git status,
- tocar solo archivos esperados,
- no crear subagentes por defecto,
- no redisenar,
- no anadir dependencias,
- crear/actualizar tests si cambia comportamiento,
- ejecutar checks,
- explicar verificacion manual.

## Reviewer

No edita codigo.

Debe buscar:

- bugs,
- cambios fuera de alcance,
- sobreingenieria,
- dependencias nuevas,
- tests debiles,
- contradicciones con docs,
- riesgo para usuario no programador.

## Flujo normal

1. Usuario debate con orquestador cuando hacen falta decisiones.
2. Orquestador consulta GitHub Issues, `docs/vantare-program/` y el handoff vivo.
3. `docs/roadmap/plan.md` define el alcance y el estado público. Los tableros y
   planes históricos solo se consultan como contexto; no eligen trabajo.
4. Orquestador crea o identifica el miniplan vigente.
5. Orquestador crea prompt worker.
6. Worker implementa.
7. Worker reporta evidencia.
8. Reviewer audita sin editar.
9. Orquestador recomienda aceptar, corregir, dividir o revertir.
10. Se hace commit pequeño cuando el contrato de la issue lo permite.
11. El orquestador actualiza el handoff vivo y la issue de GitHub después de
    cada worker o cambio material. Si cambia el alcance, el plan futuro o el
    estado público, actualiza `docs/roadmap/plan.md` en el mismo PR. El worker
    deja la issue en revisión (label `state:in-review`); no promociona por su cuenta.
12. Tras la aprobación inicial de Isaac, una issue de integración promueve la
    entrega a `nightly`.
13. Después del feedback y sus correcciones, otra promoción lleva el conjunto
    de `nightly` a `testers`.
14. Solo una aprobación final de Isaac permite `testers` a `master`.
15. Se actualizan el handoff y la issue de GitHub siempre que haya un cambio
    material. El roadmap se actualiza cuando cambia el alcance, el plan futuro,
    una fase, un área, un hito o una entrega pública. `docs/current-plan.md` y
    `docs/roadmap-execution-board.md` son históricos y no se actualizan como
    parte del flujo normal.

## Comunicación de cambios visibles

Si una issue cambia comportamiento que deben conocer o probar los testers, el worker añade un fragmento válido en `docs/changelog/fragments/ISA-N.json` siguiendo `docs/changelog/fragments/schema.json`. No edita mensajes acumulativos ni publica directamente en Discord.

El fragmento debe explicar en español claro el resultado, los detalles técnicos
útiles, la validación manual y las limitaciones conocidas. Los mensajes de
Nightly, Testers y Master se generan únicamente al alcanzar ese nivel
autorizado. Consulta `docs/discord-communications.md`.

## Documentos ejecutables y orquestables

Todo documento operativo debe permitir que otro modelo pueda continuar el trabajo.

Debe indicar:

- objetivo;
- fase/version;
- orden de ejecucion;
- dependencias;
- modelo recomendado si aplica;
- que leer antes de trabajar;
- que no tocar;
- checks esperados;
- verificacion manual;
- criterio de cierre.

Si un documento solo describe ideas y no permite ejecutar u orquestar, debe marcarse como conceptual o moverse fuera del flujo operativo.

## Tipos de tarea

Clasificar antes de ejecutar:

- documentacion,
- tooling,
- test,
- bugfix,
- refactor,
- feature,
- arquitectura,
- investigacion.

No mezclar tipos salvo necesidad clara.

## Definicion de terminado

Una tarea esta terminada solo si:

- objetivo cumplido,
- archivos tocados explicados,
- checks ejecutados o fallo explicado,
- tests actualizados si cambia comportamiento,
- verificacion manual clara,
- reviewer no encuentra criticos,
- `docs/roadmap/plan.md` actualizado si cambia el alcance, el plan futuro o el
  estado público; el handoff y la issue de GitHub reflejan siempre el estado
  técnico y operativo.

Esta definicion cierra el trabajo tecnico de la rama. No demuestra que el
cambio este en `nightly`, `testers`, `master` ni en una release. Esos estados
requieren sus promociones y evidencias propias.

## Riesgo por tarea

- Bajo: docs, tests aislados, cambios pequenos sin impacto externo.
- Medio: UI importante, logica de negocio, almacenamiento local.
- Alto: migraciones, concurrencia, datos de usuario, auth, dependencias, arquitectura.

Riesgo alto se divide en tareas mas pequenas.
