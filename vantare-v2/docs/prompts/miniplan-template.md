# Prompt para crear miniplan

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

Actua como orquestador tecnico senior.

Necesito un miniplan pequeno y verificable para:
[OBJETIVO]

Contexto:
- Repo: `vantare-v2`
- Lee `AGENTS.md`.
- Lee la tarea Notion y el handoff vivo.
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
