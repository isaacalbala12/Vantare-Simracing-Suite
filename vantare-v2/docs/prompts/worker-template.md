# Prompt worker

Usa este prompt para Aider u otro agente implementador.

```markdown
Abre primero el hub Notion: https://app.notion.com/p/3fce51695c65834e80b381ec2d632192
Tarea Notion obligatoria: [URL REAL Y VAN]; Proyecto: [URL REAL].
Lee tarea, proyecto, dependencias y aceptación, después AGENTS de origin/nightly
actualizado y docs/vantare-program/notion-transition.md.
Referencia GitHub/ISA para los gates actuales: [URL/ID SEPARADOS DEL VAN].
Actualiza y relee Notion al empezar, bloquear, entregar y verificar integración:
Estado, Agente, Proyecto, siguiente paso, PR, checks, riesgos y SHA/canal.
El chat y GitHub no sustituyen esta escritura. Si falla Notion, conserva evidencia
y comunica el bloqueo; no ejecutes trabajo dependiente ni declares seguimiento cerrado.
No confundir integración con publicación ni ampliar el alcance autorizado.

Actua como worker disciplinado en el repo `vantare-v2`.

Objetivo:
[DESCRIBIR UNA TAREA PEQUENA]

Tipo de tarea:
[documentacion / test / bugfix / refactor / feature / tooling]

Antes de editar:
1. Lee `AGENTS.md`.
2. Lee la tarea Notion y el handoff vivo.
3. Lee los docs especificos de esta tarea:
   - [LISTA]
4. Ejecuta o informa:
   - `git status --short`
   - rama actual

Alcance:
- Puedes tocar:
  - [ARCHIVOS/CARPETAS]
- No debes tocar:
  - [ARCHIVOS/CARPETAS]
- Fuera de alcance:
  - features no pedidas
  - refactors generales
  - dependencias nuevas
  - cambios de arquitectura

Reglas:
- Haz el cambio seguro mas pequeno posible.
- No anadas dependencias.
- No redisenes arquitectura.
- No limpies codigo no relacionado.
- Si necesitas tocar mas archivos de los previstos, para y explica.
- Si cambias comportamiento, anade o actualiza tests.
- Si algo no esta claro, deja `Open questions` en la tarea autoritativa o en el handoff vivo, o pregunta.

Checks esperados:
- [COMANDOS CONCRETOS]

Respuesta final obligatoria:
- Archivos creados/modificados/movidos.
- Que cambio en lenguaje simple.
- Tests/checks ejecutados y resultado.
- Checks no ejecutados y motivo.
- Como verificar manualmente.
- Riesgos o dudas restantes.
```
