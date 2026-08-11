# Plantilla de handoff vivo

Cada proyecto mantiene un único handoff breve para continuidad técnica. Linear
posee issue, estado, dependencias, rama, base esperada y destino. Git/GitHub
demuestran el estado observado. Consulta `source-ownership.md`.

Objetivo: 100–120 líneas; límite bloqueante: 150. La cronología cerrada se
archiva y el handoff vivo deja un único enlace al snapshot. No se copian
matrices de issues, ramas activas, bases, SHAs ni ledgers de ejecución.

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

## Recomendación técnica

[Una recomendación concreta para continuidad, con fronteras y checks. No
autoriza ejecución: la issue de Linear posee la siguiente acción y enlaza el
plan ejecutable.]

## Evidencia

- [Tests, builds, runtime, capturas o rendimiento con fecha/enlace]

## Historial

- [Un enlace al snapshot archivado; no copiar la cronología aquí.]
```

El handoff se actualiza solo cuando cambia arquitectura, decisiones, evidencia,
riesgos o recomendación técnica. Un cambio de estado o siguiente acción en
Linear no requiere duplicarlo aquí.
