# Documentacion de Vantare v2

Este indice ayuda a agentes y reviewers a saber que leer antes de tocar el repo.

## Lectura rapida

- `../AGENTS.md`: reglas obligatorias para cualquier agente.
- `current-plan.md`: estado actual, alcance vivo y proximas tareas.
- `architecture.md`: separacion entre Go, TypeScript, dominio, adaptadores y UI.
- `domain-model.md`: nombres canonicos del producto.
- `testing-strategy.md`: comandos y reglas de testing.
- `manual-verification.md`: pasos manuales para validar sin leer codigo.
- `agent-workflow.md`: flujo orquestador -> worker -> reviewer.
- `operations.md`: comandos basicos del repo.
- `go-review-checklist.md`: checklist para revisar Go.

## Para workers

Antes de programar, leer siempre:

1. `../AGENTS.md`
2. `current-plan.md`
3. Documento especifico de la tarea
4. Tests relacionados

Si la tarea afecta arquitectura, leer tambien `architecture.md`.
Si cambia comportamiento, leer `testing-strategy.md` y `manual-verification.md`.

## Para reviewers

Leer:

1. `../AGENTS.md`
2. `current-plan.md`
3. `agent-workflow.md`
4. Diff del worker
5. Tests y comandos ejecutados por el worker

## Decisiones

Las decisiones tecnicas estables viven en `adr/`.

- `adr/0001-close-lmu-pilot-ratings.md`: cierre de ratings LMU.
- `adr/0002-llm-first-stack.md`: decision de stack optimizado para desarrollo asistido por agentes.

## Prompts reutilizables

Plantillas en `prompts/`:

- `worker-template.md`
- `reviewer-template.md`
- `bugfix-template.md`
- `miniplan-template.md`

## Documentacion externa relacionada

El proyecto historicamente tiene planes y documentacion fuera de `vantare-v2`, en la carpeta superior `C:\Users\isaac\Desktop\Vantare-Overlays\docs`. Esta capa de control trabaja dentro de `vantare-v2` y no mueve esos archivos automaticamente.
