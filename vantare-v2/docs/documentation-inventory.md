# Inventario de documentacion

Ultima actualizacion: 2026-06-19.

Este inventario clasifica la documentacion conocida dentro de `vantare-v2`.

## Documentos dentro del repo

| Documento | Estado | Accion recomendada |
|---|---|---|
| `README.md` | Util, pero parcialmente desactualizado respecto a Overlays Studio | Actualizar en una tarea separada despues de validar Fase A |
| `AGENTS.md` | Nuevo documento de control | Mantener como lectura obligatoria para agentes |
| `docs/README.md` | Nuevo indice de documentacion | Mantener actualizado cuando se anadan docs |
| `docs/current-plan.md` | Nuevo plan vivo | Actualizar despues de cada tarea relevante |
| `docs/architecture.md` | Nueva arquitectura resumida | Mantener simple; ampliar solo con decisiones reales |
| `docs/domain-model.md` | Nuevo glosario de dominio | Actualizar si cambian nombres o conceptos |
| `docs/testing-strategy.md` | Nueva estrategia de testing | Actualizar si cambian comandos |
| `docs/manual-verification.md` | Nueva guia manual | Actualizar con cada flujo importante |
| `docs/agent-workflow.md` | Nuevo workflow de agentes | Mantener alineado con el proceso real |
| `docs/operations.md` | Nueva guia de operaciones | Actualizar si cambia tooling |
| `docs/go-review-checklist.md` | Nueva checklist Go | Mantener como referencia para reviewers |
| `docs/adr/0001-close-lmu-pilot-ratings.md` | ADR existente util | Mantener |
| `docs/adr/0002-llm-first-stack.md` | Nuevo ADR | Mantener |
| `tools/README.md` | Util para herramientas LMU | Mantener |
| `testdata/README.md` | Util para fixtures LMU | Mantener |
| `frontend/README.md` | Plantilla/herencia de Vite, probablemente generica | Revisar y actualizar o archivar en tarea separada |

## Documentacion externa relacionada

Hay documentacion historica en `C:\Users\isaac\Desktop\Vantare-Overlays\docs` y planes en `docs/superpowers/plans` fuera de `vantare-v2`.

No se mueve en esta tarea porque:

- el usuario indico que trabajamos exclusivamente sobre `vantare-v2`,
- moverla mezclaria reorganizacion amplia con la capa de control,
- hay cambios abiertos de otros agentes,
- conviene hacerlo con un miniplan documental separado.

Accion recomendada futura:

1. Inventariar docs externos.
2. Decidir que se copia como referencia activa.
3. Archivar planes antiguos que ya no guien trabajo actual.
4. Actualizar enlaces desde `vantare-v2/docs/README.md`.

## Archivos no documentales detectados como cambios abiertos

Hay cambios abiertos en archivos de producto y build. Esta capa de control no los clasifica ni modifica.

Antes de cualquier tarea de feature o bugfix, un worker debe ejecutar:

```powershell
git status --short
```

Y separar claramente cambios preexistentes de cambios nuevos.

## Criterio para futuras acciones

- Mantener: documento actual y util.
- Actualizar: documento util pero desactualizado.
- Fusionar: documentos duplicados con informacion vigente.
- Archivar: historico util pero no debe guiar trabajo actual.
- Mover: solo con tarea documental separada y actualizando enlaces.
- Eliminar: solo con aprobacion explicita del usuario.
