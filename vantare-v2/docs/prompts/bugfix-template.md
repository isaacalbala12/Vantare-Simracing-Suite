# Prompt bugfix pequeno

```markdown
Actua como worker de bugfix pequeno en `vantare-v2`.

Bug:
[DESCRIBIR BUG OBSERVABLE]

Comportamiento esperado:
[DESCRIBIR RESULTADO CORRECTO]

Reproduccion:
[PASOS]

Antes de editar:
- Lee `AGENTS.md`.
- Lee `docs/current-plan.md`.
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
