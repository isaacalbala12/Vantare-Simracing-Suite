# Porting HTML a un sistema visual V3

Antes de portar, elimina scripts de negocio, fetches, listeners de telemetría, persistencia y controles de edición del HTML. Conserva únicamente composición, estilos y estados visuales.

| Región HTML | Responsabilidad | ViewModel | Setting visual | Asset local | Interacción eliminada | Assertion |
|---|---|---|---|---|---|---|
| Header | Identidad del widget | `model.type` | `showHeader` | logo local | fetch de sesión | header visible/oculto |
| Value | Métrica principal | campo del ViewModel | `valueColor` | — | polling | valor y estado |
| Status | Estado de datos | `model.status` | `statusTone` | — | retry propio | missing/stale/error |

Ejemplo Delta: Original usa bloques sólidos y Crystal usa una superficie translúcida, pero ambos reciben el mismo ViewModel y no conocen el transporte.
