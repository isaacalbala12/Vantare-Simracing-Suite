# Handoff vivo — Overlay Studio, Launcher y Hub

Última revisión técnica: 2026-08-11.
Estado operativo: consultar Linear y Git; este documento no elige issue, rama
ni siguiente acción.

## Resultado y fronteras

Overlay Studio es el único editor de layout, contenido, comportamiento y
apariencia. El canvas solo gestiona interacción espacial; el inspector edita el
documento y `WidgetVisualHost` renderiza ViewModels puros para Studio, Desktop,
OBS y Workshop. Launcher abre herramientas y perfiles; Hub navega superficies
reales sin inventar estados.

## Autoridad técnica

- [ADR 0003](../../adr/0003-overlay-studio-v3-rebuild.md).
- [Overlay Studio](../../overlays-studio/README.md) y
  [contrato Workshop](../../overlays-studio/os-09-overlay-workshop-contract.md).
- [Guía de autoría Workshop](../../overlays-studio/overlay-workshop-authoring-guide.md).
- [Arquitectura Launcher](../../launcher-v3-architecture.md).
- El plan exacto enlazado por Linear.

## Estado técnico actual

Studio, Desktop, OBS y Workshop reutilizan el host y los renderers productivos.
Workshop solo existe en desarrollo, usa fixtures explícitas y consulta
reproducible; no exporta, copia ni compila otro formato. Los sistemas visuales
son Original y Crystal; los HTML siguen siendo contratos visuales y su fondo de
escenario no forma parte del widget.

Snapshot observado el 2026-08-10: Workshop, correcciones de Studio, gate visual
y tres widgets Redline estaban en Nightly; Pedals Redline seguía en PR draft.
Ese snapshot no demuestra el estado actual: comprobar rama, SHA, PR y CI.
Launcher requiere una auditoría fresca de integración antes de ampliarlo. Hub
no mantiene un roadmap paralelo.

## Decisiones cerradas

- Autoría directa: se edita TSX/CSS productivo y Workshop refleja ese código.
- TSX usa HMR; CSS atravesado por Tailwind puede recargar el documento, pero no
  requiere reiniciar Vite.
- Diseños oficiales son inmutables y duplicables; mocks y missing son visibles.
- Desktop puede compartir perfil con Studio; OBS puede ser independiente.
- No se crea renderer, DSL, scaffolder o registro paralelo.
- Drag/resize V3 usa preview DOM imperativa según su contrato específico.

## Riesgos y bloqueos

- **P1:** divergencia visual entre Studio, Desktop, OBS y Workshop.
- **P1:** incluir el fondo del showcase en capturas de paridad.
- **P1:** confundir recarga CSS con hot-update y debilitar el smoke.
- **P2:** baselines obsoletos que oculten regresiones.
- **P2:** ampliar Launcher sin demostrar qué commits están integrados.

## Recomendación técnica

Usar la issue vigente para congelar un corte pequeño. En cambios visuales,
probar el mismo renderer en Workshop y las superficies productivas, restaurar
bytes modificados por smokes y revisar capturas sin fondo de escenario.

## Evidencia

- [Plan de lanzamiento de Studio V1](../../overlays-studio/overlay-studio-v1-commercial-launch-plan.md).
- [Preview imperativa de drag](../../overlays-studio/canvas-drag-imperative-preview.md).
- [Runbook de beta](../../release-beta-operations-runbook.md).
- [Instrucciones para testers](../../tester-build-instructions.md).

## Historial

- [Cronología completa hasta 2026-08-10](../../archive/2026-08/handoffs/overlays-launcher-hub-through-2026-08-10.md).
