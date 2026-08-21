# Documentacion de Vantare v2

Este indice ayuda a agentes y reviewers a saber que leer antes de tocar el repo.

## Lectura rapida

- `../AGENTS.md`: reglas obligatorias para cualquier agente.
- `roadmap/plan.md`: fuente publica de fases, areas, hitos y entregas del roadmap.
- `master-feature-plan.md`: mapa de producto y contexto historico.
- `current-plan.md`: registro historico de ejecucion; no es fuente de planificacion.
- `roadmap-execution-board.md`: tablero historico; no es fuente operativa actual.
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
- `resolved-bugs.md`: indice de bugs importantes ya solucionados y reglas para no reabrirlos.
- `alpha-beta-roadmap.md`: resumen historico de estrategia alpha/beta.
- `agent-workflow.md`: flujo orquestador -> worker -> reviewer.
- `operations.md`: comandos basicos del repo.
- `go-review-checklist.md`: checklist para revisar Go.

## Para workers

Antes de programar, leer siempre:

1. `../AGENTS.md`
2. `roadmap/plan.md`
3. Documento especifico de la tarea
4. Tests relacionados

Si la tarea afecta arquitectura, leer tambien `architecture.md`.
Si cambia comportamiento, leer `testing-strategy.md` y `manual-verification.md`.

## Para reviewers

Leer:

1. `../AGENTS.md`
2. `roadmap/plan.md`
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

La planificacion publica actual vive en `roadmap/plan.md` y sus datos generados en `roadmap/roadmap.json`. El estado operativo de una issue vive en GitHub Issues y la continuidad tecnica en el handoff vivo correspondiente. `master-feature-plan.md`, `current-plan.md` y `roadmap-execution-board.md` se conservan como mapa o contexto historico; `release-roadmap-execution-index.md` mantiene la ejecucion especifica del release.
