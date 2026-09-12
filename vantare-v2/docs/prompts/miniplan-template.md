# Prompt para crear miniplan

```markdown
Lee primero docs/vantare-program/notion-transition.md y confirma su estado.
Tarea autoritativa: [URL REAL]; ID Notion/GitHub/historico: [SEPARADOS].
En PREPARACIÓN solo ejecutar el lote vigente o preparación técnica trazada;
lo nuevo se captura pendiente en Notion. No confundir integración con publicación.

Actua como orquestador tecnico senior.

Necesito un miniplan pequeno y verificable para:
[OBJETIVO]

Contexto:
- Repo: `vantare-v2`
- Lee `AGENTS.md`.
- Lee `docs/roadmap/plan.md`.
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
