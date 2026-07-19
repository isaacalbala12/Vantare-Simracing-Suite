# Telemetry Core — Índice de ejecución Sol medium

## Uso

Este índice permite iniciar un chat por issue sin cargar todo el historial del proyecto. El worker lee únicamente las autoridades comunes, el microplan de su fase y la issue Linear.

## Lecturas comunes

1. `AGENTS.md`
2. `docs/current-plan.md`
3. `docs/agent-workflow.md`
4. `docs/adr/0004-telemetry-core-modular-observation-architecture.md`
5. `docs/superpowers/plans/2026-07-19-telemetry-core-final-architecture-master.md`
6. microplan indicado por Linear

## Prompt base

```text
Ejecuta exclusivamente la issue Linear asignada del proyecto “Telemetry Core — Modular Runtime & LMU”.
Modelo recomendado: GPT-5.6 Sol, razonamiento medium.

Verifica rama, worktree, SHA base y dirty state antes de editar. Usa exactamente gitBranchName de Linear y worktree propio. Lee AGENTS.md, current-plan, agent-workflow, ADR 0004, plan maestro y el microplan activo. No uses vantare-core.

Aplica TDD o characterization-first. Mantén el cambio pequeño, compilable y reversible. No adelantes la issue siguiente, no añadas dependencias y no rediseñes fuera del contrato. Core no puede importar productos, LMU concreto, Wails, SSE o DuckDB. No uses mock/simulator como fallback productivo.

Ejecuta los gates del microplan, review adversarial y git diff --check. Actualiza Linear con archivos, tests, checks omitidos, riesgos, decisiones, rollback y verificación manual. Commit y push están permitidos; merge a develop no. Detente al acabar la issue o al encontrar una stop condition.
```

## Orden operativo

- Solo una issue de la cadena principal puede estar `In Progress` salvo que Linear marque explícitamente un corte paralelo.
- Una issue pasa a `In Review` al cumplir sus gates técnicos; nunca a `Done` antes de la validación humana aplicable.
- El siguiente corte no se inicia hasta cerrar blockers y registrar la base exacta.
- Las fases TC-07 y TC-08 requieren pausas manuales reales con LMU.
- TC-09 no puede declarar código muerto sin búsqueda de consumidores y evidencia de build/tests.

## Mapa Linear

- TC-02: ISA-26–29.
- TC-03: ISA-30–34.
- TC-04: ISA-35–38.
- TC-05: ISA-39–41.
- TC-06: ISA-101–104.
- TC-07: ISA-105–107.
- TC-08: ISA-108–112.
- TC-09: ISA-113–116, ISA-87 y ISA-117.

## Entrega obligatoria

```markdown
## Resultado
- Issue y objetivo:
- Rama/worktree/base:
- Archivos creados/modificados/movidos:
- Tests/checks PASS:
- Checks no ejecutados y motivo:
- Riesgos/deuda:
- Decisiones arquitectónicas:
- Rollback:
- Verificación manual:
- Commit/push/PR:
- Merge realizado: no
- Gate Isaac: pendiente/aprobado
```
