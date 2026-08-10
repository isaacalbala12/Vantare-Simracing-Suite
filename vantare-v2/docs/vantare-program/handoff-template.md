# Plantilla de handoff vivo

Cada proyecto mantiene un único handoff breve para continuidad técnica. Linear
posee issue, estado, dependencias, rama, base esperada y destino. Git/GitHub
demuestran el estado observado. Consulta `source-ownership.md`.

Objetivo orientativo: máximo 100–120 líneas. La cronología cerrada se enlaza o
archiva; no se antepone indefinidamente.

```markdown
# Handoff vivo — [Proyecto]

Última revisión técnica: [fecha]
Proyecto Linear: [enlace estable]
Issue activa: [enlace; no copiar estado/rama/base]

## Resultado y fronteras

[Qué entrega el proyecto y qué no le pertenece.]

## Autoridad técnica

- [Contrato/ADR por path completo]
- [Plan activo enlazado por la issue]

## Estado técnico actual

[Qué comportamiento existe y qué evidencia lo demuestra. Si se incluye un
snapshot Git, marcar `observed_at` y no presentarlo como autoridad futura.]

## Decisiones cerradas

- [Decisión estable + enlace al ADR/contrato]

## Riesgos y bloqueos

- [P0–P3, owner y condición de salida]

## Siguiente acción exacta

[Un solo corte, archivos/fronteras y checks esperados. La rama/base se consulta
en Linear.]

## Evidencia

- [Tests, builds, runtime, capturas o rendimiento con fecha/enlace]

## Historial

- [Enlaces al archivo, issues cerradas o PRs; no copiar la cronología aquí.]
```

El handoff se actualiza solo cuando cambia arquitectura, decisiones, evidencia,
riesgos o siguiente acción técnica. Un simple cambio de estado en Linear no
requiere duplicarlo aquí.
