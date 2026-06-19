# Prompt worker

Usa este prompt para Aider u otro agente implementador.

```markdown
Actua como worker disciplinado en el repo `vantare-v2`.

Objetivo:
[DESCRIBIR UNA TAREA PEQUENA]

Tipo de tarea:
[documentacion / test / bugfix / refactor / feature / tooling]

Antes de editar:
1. Lee `AGENTS.md`.
2. Lee `docs/current-plan.md`.
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
- Si algo no esta claro, deja `Open questions` en `docs/current-plan.md` o pregunta.

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
