# Documentacion de Vantare v2

Este indice ayuda a agentes y reviewers a saber que leer antes de tocar el repo.

## Lectura rapida

- `../AGENTS.md`: reglas obligatorias para cualquier agente.
- `current-plan.md`: estado actual, alcance vivo y proximas tareas.
- `master-feature-plan.md`: plan maestro de features y orden de desarrollo.
- `roadmap-execution-board.md`: tablero ejecutable/orquestable de minifases y workers.
- `versioning-and-release-gates.md`: versionado `X.X.X.X` y gates de salida por fase.
- `feature-architecture-map.md`: limites de arquitectura por feature.
- `product-decisions.md`: decisiones cerradas y pendientes.
- `release-checklists.md`: checklists de alpha, beta, pago y release.
- `superpowers/plans/`: planes detallados ya aprobados para Overlays Studio.
- `architecture.md`: separacion entre Go, TypeScript, dominio, adaptadores y UI.
- `domain-model.md`: nombres canonicos del producto.
- `testing-strategy.md`: comandos y reglas de testing.
- `manual-verification.md`: pasos manuales para validar sin leer codigo.
- `widget-preview-bug-log.md`: bugs, causas raiz y reglas para no romper la preview aislada de WidgetStudio.
- `alpha-beta-roadmap.md`: resumen de estrategia alpha/beta; la fuente operativa es `master-feature-plan.md`.
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

## Estado de roadmap

La documentacion viva actual deja constancia de que Fase A, Fase A2, Fase B de preview/widgets y la restauracion de controles live estan implementadas. La estabilizacion de la preview aislada queda documentada en `widget-preview-bug-log.md`. El plan maestro operativo vive en `master-feature-plan.md`; `alpha-beta-roadmap.md` queda como resumen de estrategia.
