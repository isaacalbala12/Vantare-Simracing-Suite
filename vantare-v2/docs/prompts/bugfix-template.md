# Prompt bugfix pequeno

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

Actua como worker de bugfix pequeno en `vantare-v2`.

Bug:
[DESCRIBIR BUG OBSERVABLE]

Comportamiento esperado:
[DESCRIBIR RESULTADO CORRECTO]

Reproduccion:
[PASOS]

Antes de editar:
- Lee `AGENTS.md`.
- Lee la tarea Notion y el handoff vivo.
- Revisa `git status --short`.
- Localiza el test mas cercano.

Alcance:
- Arreglar solo este bug.
- Anadir test de regresion si es viable.
- No hacer refactors generales.
- No cambiar UI/arquitectura fuera del bug.
- No anadir dependencias.

Metodo:
1. Escribe o actualiza un test que falle por el bug.
2. Ejecuta el test focalizado y confirma fallo.
3. Implementa el arreglo minimo.
4. Ejecuta test focalizado.
5. Ejecuta checks relacionados.

Respuesta final:
- Causa probable en lenguaje simple.
- Archivos tocados.
- Test de regresion anadido o motivo si no se pudo.
- Checks ejecutados.
- Como verificar manualmente.
```
