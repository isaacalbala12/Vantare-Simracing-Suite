# Telemetry Core Sol Medium Execution Index Implementation Plan — SUPERSEDED

> **Sustituido el 2026-07-19** por `2026-07-19-telemetry-core-sol-medium-execution-index.md`. No lanzar issues pendientes desde este índice histórico.

> **Estado reconciliado (ISA-100):** TC-01 está completado. La ejecución está pausada antes de ISA-26; TC-02 no es ejecutable hasta la planificación conjunta con Isaac. Este índice no debe usarse para lanzar automáticamente el siguiente corte.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que Sol medium ejecute Telemetry Core en cortes pequeños, verificables y reversibles.

**Architecture:** Cinco microplanes secuenciales; cada microplan contiene varias issues, pero cada issue termina en commit, evidencia, review y pausa humana. Ningún worker continúa al siguiente microplan por iniciativa propia.

**Tech Stack:** Go, Wails, React/TypeScript, SSE, Vitest, Playwright, PowerShell.

---

## Prompt base obligatorio para cada chat

```text
Ejecuta únicamente la issue Linear asignada del proyecto Telemetry Core — LMU Live Unification.
Modelo: gpt-5.6-sol, razonamiento medium.
Lee AGENTS.md, docs/current-plan.md, docs/agent-workflow.md, la especificación canónica, el plan maestro y el microplan indicado.
Usa exactamente gitBranchName de Linear y un worktree propio.
No uses vantare-core. No cambies arquitectura fuera del microplan. No añadas dependencias.
TDD: test rojo, implementación mínima, test verde, refactor acotado.
Haz commits pequeños con git add por rutas explícitas.
Ejecuta los gates indicados y realiza code review antes de entregar.
Actualiza Linear con causa/decisiones, archivos, comandos, resultados, riesgos y pasos manuales.
Puedes push/PR a la rama base declarada; no puedes hacer merge.
Nada entra en develop hasta validación manual completa y aprobación explícita de Isaac.
Para si se cumple cualquier stop condition.
```

## Secuencia

1. TC-01 Baseline e integración — **completado**.
2. Gate de baseline — **completado** con ISA-23/24/25/96/97.
3. Pausa actual: reconciliación y planificación conjunta de ISA-26.
4. TC-02 Core canónico — pendiente de aprobación.
5. Pausa: review de contratos y pruebas de fusión.
6. TC-03 Overlay shadow/cutover.
7. Pausa: Isaac prueba Studio, Desktop y OBS.
8. TC-04 Engineer preservación/cutover.
9. Pausa: Isaac prueba Engineer real y audio/avisos.
10. TC-05 Retirement/hardening.
11. Pausa final y PR sin merge.

## Regla de base y ramas

- Cada issue usa exactamente su `gitBranchName` de Linear y un worktree propio.
- La base se fija en Linear al iniciar el corte. Por defecto es el `develop` más reciente que ya contenga todos los prerequisitos aprobados e integrados.
- No se apilan cortes sobre ramas sin validación manual salvo que Linear lo declare expresamente y documente el riesgo.
- Cada PR apunta a la base declarada y permanece sin merge hasta la aprobación explícita de Isaac.
- No rebase/force-push una rama que otro microcorte esté usando.

## Entrega mínima por issue

```markdown
## Resultado
- Objetivo:
- Commit(s):
- Archivos:
- Tests:
- Playwright/manual:
- Riesgos:
- Decisiones:
- Rollback:
- Estado del gate humano: pendiente
- Merge realizado: no
```

## Prohibiciones

- No merge masivo sin simulación y matriz.
- No reescribir monitores del Engineer para “simplificar”.
- No conservar shims después de su issue de retirada.
- No usar mock como fallback de producción.
- No cambiar renderizadores/estilos de widgets durante la migración.
- No publicar payloads raw o rutas completas en logs.
