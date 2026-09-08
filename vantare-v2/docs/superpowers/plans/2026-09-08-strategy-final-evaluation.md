# ISA-1041 — evaluación del plan definitivo

Isaac autorizó ejecutar el saneamiento completo tras #1038. Trabajo personal,
sin subagentes. Base documental `286f99e8`, código base `4ce96ded`, rama
`vantareapp/isa-1041-orbit-final-evaluation`, worktree `C:/tmp/vantare-isa1041`.

## Cortes

1. RED: convertir las reproducciones de combustible, reserva y coste en
   regresiones. Proteger los costes de ReplayDecisionV2 existentes.
2. Reutilizar el replay con carga inicial explícita para que una edición de
   combustible no se sustituya silenciosamente por la carga mínima calculada.
   El replay actual conserva su comportamiento para solver/backtest.
3. Construir la decisión final de Orbit con pilotos, vueltas y servicios
   efectivos. Rechazar recursos imposibles; calcular reserva con el último
   consumo efectivo y costes mediante replay, no mediante fórmulas de UI.
4. Distinguir en el contrato resultado factible de optimalidad demostrada
   después de modificar la decisión; mantener procedencia de los datos.
5. Go completo (assets frontend construidos antes), frontend si cambia contrato
   o presentación, diff personal, evidencia, handoff y roadmap/digest.

Archivos previstos: application/orbit_calculation.go, helper de evaluación
acotado y tests; solver/replay_v2.go y tests; types/client/presentación y tests
si requieren transportar estado. Sin dependencias nuevas ni motor alternativo.

No aborda todavía el reloj por tiempo (#1042), boxes (#1043), recuperación
(#819), deadline (#821), referencias (#445) o calibración (#1030). Estos cortes
siguen autorizados y se ejecutan secuencialmente en sus ramas. No hay permiso
de promoción o release. No declarar el gate terminado con solo este corte.
