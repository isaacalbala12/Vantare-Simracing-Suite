# Workflow de agentes

> Flujo vigente desde ISA-120. Antes de actuar, lee
> `docs/vantare-program/README.md`, `execution-policy.md` y el handoff del
> proyecto. El flujo Nightly/Testers está aprobado como objetivo, pero hasta
> que una issue migre ramas y CI, las entregas permanecen apiladas en ramas de
> issue y no se promocionan.

## Fuente operativa y aislamiento

- Linear contiene proyectos, milestones, issues, dependencias, estado y rama.
- Una issue ejecutable con cambios equivale a una rama Linear, un worktree y un
  contexto propios.
- Una investigación que solo modifica Linear no necesita rama; si genera docs
  en el repo, sí.
- Los hallazgos fuera de alcance crean issues; no se incorporan silenciosamente.
- Se confirma base, worktree y estado limpio antes de editar.
- Se usa exactamente el nombre de rama generado por Linear.
- Commits pequeños y staging limitado a rutas; no `git add .`.
- El worker puede commit, push, PR draft e `In Review`, pero no promociona sin
  autorización.

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

La promoción usa una issue de integración propia. Antes de crear `nightly` y
`testers`, adaptar workflows y documentar rollback, ningún agente inventa esos
destinos: conserva el PR en draft o la rama publicada sin merge. Tests y review
no sustituyen las aprobaciones.

## Roles

## Orquestador

Define objetivo, alcance, riesgos, prompt para worker, prompt para reviewer y checklist para el usuario.

No implementa codigo salvo peticion explicita o necesidad estricta para desbloquear el trabajo.

En este proyecto, el orquestador principal debe evitar editar codigo por defecto para ahorrar contexto y mantener el hilo centrado en decisiones, prompts, reviews y verificacion. La implementacion normal se delega a workers.

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
2. Orquestador consulta Linear, `docs/vantare-program/` y el handoff vivo.
3. El tablero histórico solo se consulta como contexto; no elige trabajo.
4. Orquestador crea o identifica el miniplan vigente.
5. Orquestador crea prompt worker.
6. Worker implementa.
7. Worker reporta evidencia.
8. Reviewer audita sin editar.
9. Orquestador recomienda aceptar, corregir, dividir o revertir.
10. Se hace commit pequeño cuando el contrato de la issue lo permite.
11. Se actualiza el handoff, Linear y `docs/current-plan.md`.

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
- `current-plan.md` actualizado si cambia el estado.

## Riesgo por tarea

- Bajo: docs, tests aislados, cambios pequenos sin impacto externo.
- Medio: UI importante, logica de negocio, almacenamiento local.
- Alto: migraciones, concurrencia, datos de usuario, auth, dependencias, arquitectura.

Riesgo alto se divide en tareas mas pequenas.
