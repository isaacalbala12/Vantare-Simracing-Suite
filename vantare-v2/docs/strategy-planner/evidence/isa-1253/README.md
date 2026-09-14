# ISA-1253 — auditoría de cierre T03

## Decisión

T03a–e queda cerrado localmente sobre el contrato actual. A12/A13 no quedan
aceptados: el plan parcial y la optimalidad demostrada después de la evaluación
final se definen y conectan en T15, donde existe el recorrido productivo capaz de
presentarlos y conservarlos.

## Matriz contrastada

| Caso | Estado | Evidencia |
|---|---|---|
| Factible sin optimalidad demostrada | Cubierto | `orbit_final_evaluation_test.go` reproduce el replay final; `StrategyAnalysisPanel.test.tsx` acredita el aviso visible. |
| Inviable | Cubierto | `orbit_calculation_test.go` conserva código y causa; el bridge mantiene el código tipado. |
| Cancelado | Cubierto | T03a distingue `context.Canceled`; la acción visible de cancelar pertenece a T15. |
| Timeout | Cubierto | T03a conserva el deadline como `calculation_timeout`. |
| Presupuesto agotado | Cubierto | Ruta normal y meteorológica distinguen candidatos e iteraciones agotados de inviabilidad. |
| Obsolescencia | Cubierto para la vista actual | La clave de entradas, cleanup, correlación y UUID descartan respuestas anteriores. La custodia tras reinicio pertenece a T14. |
| Carga pendiente | Cubierto | Con telemetría elegida no calcula ni anuncia éxito hasta resolver las entradas derivadas. |
| Óptimo demostrado final | T15 | La evaluación final publica hoy `not_proven`; no hereda una prueba anterior a sus ajustes. |
| Plan parcial integral | T15 | Las familias ausentes conservan causa, pero CalculateOrbit aún no produce un plan parcial. |

## Límite

La auditoría no autoriza enums, envelopes ni una máquina de estados. No modifica
código productivo ni afirma aceptación nativa, visual o empírica.
