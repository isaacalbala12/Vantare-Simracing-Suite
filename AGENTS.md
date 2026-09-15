# Instrucciones de entrada para agentes

**Notion es el seguimiento principal obligatorio, también para issues existentes.**

1. Abrir el [hub de Vantare](https://app.notion.com/p/3fce51695c65834e80b381ec2d632192), localizar y leer la tarea y su proyecto.
   Buscar una issue importada por su URL/número GitHub real; no duplicarla ni
   confundir `VAN-N`, UUID Notion, número GitHub e ISA histórico.
2. Leer [las reglas activas](vantare-v2/AGENTS.md) y el
   [contrato Notion primero](vantare-v2/docs/vantare-program/notion-transition.md).
3. Leer el [expediente técnico](vantare-v2/docs/vantare-program/README.md),
   contratos y handoff técnico del proyecto antes de editar.
4. Actualizar y releer Notion al empezar, bloquear, entregar y verificar merge:
   Estado, Proyecto, agente, siguiente paso, dependencias, PR, checks y SHA/canal.
   Un resumen en el chat, un handoff Git o cerrar una issue GitHub no lo sustituye.
   Si no puedes leer/escribir Notion, conserva evidencia y comunica el bloqueo;
   no ejecutes trabajo dependiente ni declares el seguimiento completado.

GitHub aloja código, ramas, PR, CI y releases. Los validadores todavía necesitan
una referencia GitHub/ISA: conservarla como puente técnico enlazado desde Notion,
no como autoridad de prioridades o estado. No usar números VAN en ramas ISA.

## Chats y checkouts nuevos

El desarrollo parte de `origin/nightly` actualizado. `master` es la rama
predeterminada pública y puede contener instrucciones antiguas. Antes de continuar
un checkout o chat previo, obtener `origin/nightly` y leer su `AGENTS.md` y
`vantare-v2/AGENTS.md` (`git show origin/nightly:AGENTS.md`). Crear un worktree
propio desde esa base; no sobrescribir cambios ajenos ni desarrollar en el checkout
de integración. Publicar en nightly no actualiza por sí solo master, plantillas
de GitHub ni contextos ya cargados por otros agentes.

Estas reglas también cubren documentación y tooling fuera de `vantare-v2`.
`docs/proyecto`, `docs/engineer` y snapshots antiguos son referencia histórica.
Conservar las autorizaciones específicas de cada entrega y canal.
