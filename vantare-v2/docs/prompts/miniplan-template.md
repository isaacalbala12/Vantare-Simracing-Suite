# Prompt para crear miniplan

```markdown
Actua como orquestador tecnico senior.

Necesito un miniplan pequeno y verificable para:
[OBJETIVO]

Contexto:
- Repo: `vantare-v2`
- Lee `AGENTS.md`.
- Lee `docs/current-plan.md`.
- Lee docs relevantes.

El miniplan debe incluir:

## Diagnostico
Estado actual y problema a resolver.

## Objetivo
Una sola cosa concreta.

## Alcance
Archivos esperados, archivos prohibidos y fuera de alcance.

## Riesgos
Bugs, sobreingenieria, tests, dependencias, UX.

## Criterios de aceptacion
Formato humano:
- Dado que...
- Cuando...
- Entonces...

## Plan por tareas
Tareas pequenas que un worker pueda ejecutar.

## Tests y checks
Comandos concretos.

## Verificacion manual
Pasos para usuario no programador.

## Prompt worker
Prompt copy-paste.

## Prompt reviewer
Prompt copy-paste.
```
