# Handoff vivo — Strategy Planner

Última revisión técnica: 2026-08-11.
Estado operativo: consultar Linear y Git; este documento no elige issue, rama
ni siguiente acción.

## Resultado y fronteras

Strategy Planner es un único producto para crear, comparar, guardar, ejecutar
y adaptar planes con riesgos y alternativas visibles. Product A/B/C son fases
históricas. Telemetry Analysis posee el histórico y Telemetry Core las señales
live; Strategy consume sus proyecciones sin abrir readers ni stores ajenos.

## Autoridad técnica

- `docs/adr/0006-strategy-planner-unified-domain-and-ownership.md`.
- `docs/strategy-planner/README.md`.
- `docs/strategy-planner/str-00-audit.md` y `rescue-matrix.md` como evidencia.
- El plan exacto enlazado por Linear.

## Estado técnico actual

El dominio versionado, repositorio local de drafts/revisiones, fachada de
comandos, solver manual, Fuel/Virtual Energy, inventario físico de neumáticos y
workspace visual comparten un documento canónico. Stints, asignación por
drag/teclado, entrada rápida, tabla por vuelta, fuel-save y pérdida de boxes se
calculan de forma determinista.

Snapshot observado el 2026-08-10: una pila limpia de 11 commits de producto se
había reconstruido sobre Nightly y el PR draft #192 tenía gates verdes. Ese
snapshot no demuestra integración actual; verificar Git/GitHub antes de usarlo
como base. STR-15B depende de la base realmente integrada, no del handoff.

## Decisiones cerradas

- Un solo documento y ownership explícito; no productos A/B/C paralelos.
- Unidades, estados y errores se versionan y fallan cerrados.
- El repositorio usa commits optimistas, escritura atómica y rollback.
- El motor determinista es autoridad; IA futura solo explica o compara.
- La UI canónica mantiene planes a la izquierda, stints al centro e inventario
  y entrada a la derecha.
- Import/export nunca expone stores internos ni sustituye la persistencia.

## Riesgos y bloqueos

- **P1:** usar un stack histórico contaminado o asumir una promoción.
- **P1:** inventar señales live o leer Telemetry Core directamente.
- **P1:** asignar el mismo neumático físico a dos stints.
- **P2:** divergencia entre contrato Go, estado frontend e import/export.
- **P2:** atribuir causalidad a setup o recomendaciones sin evidencia.

## Recomendación técnica

Verificar primero qué commit de Strategy está realmente en el canal de destino.
Continuar el microcorte enlazado por Linear sobre esa base, preservando el
contrato unificado y añadiendo señales live solo mediante una proyección
versionada de Telemetry Core.

## Evidencia

- `docs/strategy-planner/str-02-canonicalization-memory-benchmark.md`.
- `docs/strategy-planner/str-03-repository.md`.
- `docs/strategy-planner/str-09-advanced-input.md`.
- `docs/vantare-program/research/strategy-planner/`.

## Historial

- [Cronología completa hasta 2026-08-10](../../archive/2026-08/handoffs/strategy-planner-through-2026-08-10.md).
