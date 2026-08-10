# Propiedad de fuentes operativas

Este contrato evita que el mismo estado se mantenga manualmente en varios
sitios. Cada campo tiene un propietario unico. Los enlaces y snapshots pueden
ayudar a continuar, pero nunca sustituyen a su propietario.

## Matriz de propiedad

| Informacion | Propietario | Regla |
|---|---|---|
| Issue, proyecto, alcance, dependencias, prioridad y estado esperado | Linear | Se consulta antes de editar y se actualiza cuando cambia el trabajo esperado. |
| Rama de issue, base esperada y destino de PR | Linear | Deben constar explicitamente en la issue; no se deducen del titulo ni de un handoff. |
| Raiz Git, worktree, rama real, HEAD, dirty state y ancestry | Git local | Se observan con comandos frescos antes de editar. |
| Push, PR, CI, merge, promocion, tag y release | GitHub y el remoto Git | Solo se afirman tras verificarlos; ausencia de evidencia significa `UNKNOWN`. |
| Comportamiento real, datos, capturas y rendimiento | Codigo y runtime | Tests, mocks o documentos no sustituyen evidencia de runtime cuando esta sea necesaria. |
| Decisiones tecnicas estables y alternativas rechazadas | ADR y contratos | Se enlazan por path completo. Linear puede enlazarlos, pero no reescribe su contenido. |
| Continuidad tecnica, riesgos, evidencia y recomendacion tecnica no autorizante | Handoff vivo del proyecto | Resume y enlaza; no replica el tracker ni elige la siguiente accion. |
| Siguiente accion autorizada y plan ejecutable | Linear | Solo la issue activa puede autorizar el siguiente corte y enlazar su plan. |
| Historial y contexto superado | `docs/archive/`, Git y Linear cerrado | Es consultable, pero nunca orden de ejecucion. |

## Estado esperado y estado observado

- **Esperado** procede de Linear: issue, rama, base y destino autorizados.
- **Observado** procede de Git/GitHub: checkout, SHA, cambios locales, PR, CI e
  integracion que existen realmente.
- Si no coinciden, se para antes de editar. No se corrige la discrepancia
  cambiando de rama, limpiando o reseteando trabajo ajeno.
- Si Linear no esta disponible, se puede investigar en modo solo lectura, pero
  no se inicia trabajo versionado ni se inventa una rama/base desde documentos
  historicos.
- Si el remoto no se ha consultado, su estado se informa como `UNKNOWN`.

## Sobre obligatorio de tarea

Antes de editar, el agente debe poder completar y verificar:

```text
Issue:
Proyecto:
Rama Linear:
Base esperada:
Worktree:
Destino PR:
```

Linear proporciona la issue, el proyecto, la rama esperada, la base esperada y
el destino del PR. Git demuestra el worktree, la rama real, el HEAD, el dirty
state y la compatibilidad de ancestry. Un prompt puede repetir el sobre para
comodidad, pero no cambia el propietario de cada campo.

## Reglas para documentos vivos

- `AGENTS.md` contiene reglas invariantes, no SHAs o estado temporal.
- `docs/README.md` enruta a las fuentes aplicables y no actua como tracker.
- Cada proyecto mantiene un unico handoff breve. El handoff enlaza la issue
  activa y la evidencia; no copia listas completas de issues ni entregas
  cerradas.
- Los planes activos se enlazan desde la issue de Linear. El handoff puede
  recomendar un plan como contexto tecnico, pero no lo vuelve ejecutable. Los
  planes cerrados permanecen como contexto, no como autoridad operativa.
- `docs/current-plan.md` esta retirado. Su archivo historico no se actualiza.
- Las referencias ADR usan el path completo mientras existan IDs numericos
  historicos repetidos.

## Actualizaciones al cerrar un corte

1. Linear recibe el estado esperado, dependencias y siguiente transicion.
2. El handoff cambia solo si hay nueva continuidad tecnica, riesgo, decision,
   evidencia o recomendacion tecnica. Linear conserva la siguiente accion.
3. Git/GitHub conservan commit, push, PR y CI observados.
4. El informe final enumera lo verificado y marca lo no comprobado como
   `UNKNOWN` o no ejecutado.

No se vuelve a crear un plan global manual que duplique estas superficies.
