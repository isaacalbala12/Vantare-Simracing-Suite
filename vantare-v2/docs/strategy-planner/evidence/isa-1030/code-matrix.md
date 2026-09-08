# ISA-1030 — Matriz estática del código

Base de producto `d6d0992f`; documentación apilada hasta `b4de3035`.
Rutas relativas a `vantare-v2/`. Las conclusiones de esta matriz son estáticas
salvo los tests ejecutados expresamente. No son etiquetas de verdad del corpus.

| Requisito | Código / test | Estado y consecuencia |
|---|---|---|
| Identidad simulador/coche/circuito | `internal/telemetryanalysis/classification.go:56`, `:92` | Identidad contiene SimID, track/layout, car y class. Productor acepta LMU. Base reutilizable; categoría monocar requiere resolución de producto sin mezclar multicoche. |
| Selección no destructiva de sesiones | `internal/telemetryanalysis/sessioncatalog.go:91` | Selección exacta por IDs y combinación; conserva las sesiones excluidas. Reutilizar. |
| Uso por familia | `internal/telemetryanalysis/lapvalidity.go:629` | Ya existe `FamilyUse`; Fuel/VE y ritmo/desgaste tienen exclusiones distintas. No rehacer el concepto. |
| Vuelta invalidada utilizable | `lapvalidity.go:27`, `:42`, `:196` | No hay etiqueta dedicada a invalidación deportiva en la lista actual; impacto se clasifica como incident_offtrack. Falta demostrar canal/semántica y conservar la distinción invalidación/incidente. Ausencia de etiqueta no prueba limpieza. |
| Incidente con evidencia | `lapvalidity.go:458` | Lee evento LastImpactMagnitude mediante `firstBoolean` y marca toda la vuelta. No detecta por sí mismo trompo sin impacto ni cuantifica qué tramo es afectado. Debe contrastarse tipo real del canal y anotarse incertidumbre. |
| Entrada/salida/pit | `lapvalidity.go:442` | Observa estado In Pits al final de cada vuelta y transición respecto al final anterior. Necesita contrastar intervalos dentro de la vuelta, no solo muestras en extremos. |
| Tráfico | `lapvalidity.go:470`, `consumptionpace.go:196`, `lapvalidity_test.go:130` | Gap absoluto entre 0.05 y 2 s etiqueta tráfico; la etiqueta nunca excluye por sí sola. Test exige que no se excluya. No hay evidencia de pérdida efectiva ni objetivo de ritmo libre frente a ritmo con tráfico. |
| Ritmo atípico | `lapvalidity.go:497` | Al menos 5 tiempos; mediana y umbral max(3 MAD, 5% mediana). Aplica valor absoluto y no condiciona por temperatura, edad de neumático o Fuel. Es detector estadístico, no prueba de incidente. |
| Conservación de vueltas lentas válidas | `lapvalidity.go:651`, `:682` | Pace outlier excluye ritmo/tyres/saving. Riesgo de recortar degradación real o cambios de condiciones; medir falsos descartes antes de ajustar. Fuel/VE no se excluyen solo por ese outlier. |
| Tramos sanos de vuelta afectada | `consumptionpace.go:141`, `:178`, `lapvalidity.go:664` | Deriva consumos por vuelta completa y excluye in/out/pit/impacto; no existe aquí selección sub-vuelta para esas familias. Gap para el alcance aprobado, no permiso para sumar fragmentos sin normalización. |
| Clima comparable | `consumptionpace.go:154` | Exige bucket de wetness igual al principio/final. No demuestra que no cambiara dentro ni corrige por temperatura. Valores ausentes interrumpen esa derivación. |
| Temperatura y neumático | `derivedcurves.go:42`, `:94` | Entradas de curva: Fuel, mezcla, desgaste y compuesto; muestras no tienen temperatura. No hay normalización observable por temperatura en esa curva. |
| Separar Fuel y edad | `derivedcurves.go:16`, `:47` | Gate explícito: 3 stints, 15 muestras, 3 edades cruzadas, span 10 L, corr <=0.80 y residual >=0.25. Son reglas existentes, no validadas de nuevo por F0. Preservar combined_only cuando no hay identificabilidad. |
| Compuesto físico | `derivedcurves.go:38`, `:492` | Mapping semántico de códigos raw declarado unsupported; no asumir Soft/Medium/Hard por índice. |
| Canales necesarios | `internal/telemetryanalysis/required_channels.go:8` | Unión declarada por cuatro familias; guard de requisitos existente. Ampliar una familia exige ampliar su declaración y comprobar impacto. |
| Correcciones versionadas | `strategyprojection/provenance.go:17`, `authorized_store.go:25` | Vocabulario corrected existe, pero no se encontró comando/repositorio de corrección de observaciones en Analysis. No confundir overrides de inputs de Strategy con corregir lecturas. |
| Fuentes cambiadas/corruptas | `authorized_store.go:45`, `cmd/vantare/main.go:1567` | Store corrupto falla; composition root crea catálogo vacío. #819 continúa relevante. |
| Cancelar importación | `internal/strategy/coldstart/service.go:128`, `:182`, `internal/app/strategy_application_bridge.go:69` | ImportNext usa contexto del bridge y espera workers; timeout UI no se convierte aquí en deadline por candidato. #821 continúa relevante. |
| Runtime ausente | `cmd/vantare/main.go:1574` | Error del importador solo warning; falta causa visible diferenciada. #803 debe separar empaquetado ya mejorado y diagnóstico restante. |
| Solver único | `internal/strategy/application/orbit_calculation.go:287` | Usa SolveV2Context; deadline de cálculo 8 s en :22. Reutilizar y evaluar gaps concretos, no reconstruir el motor. |
| Reglas reales extremo a extremo | `orbit_calculation.go:448`, `solver/solver_v2.go:238`, `:253` | El constructor Orbit no rellena EventRules, TyreInventory ni DriverProfiles que el motor admite. Usa pit legacy all-in, servicio paralelo y formación 0. La capacidad del motor no prueba que el recorrido actual respete esas reglas. |
| Pilotos en la optimización | `orbit_calculation.go:243`, `:254` | Promedia ritmo/consumo de la lista antes del solver. Para el nuevo corte hay que llevar perfiles y restricciones de conducción al motor, conservando la estimación explícita de piloto sin datos. |
| Datos insuficientes | `orbit_calculation.go:49`, `:56` | Cálculo agregado exige drivers/variants y puede fallar globalmente. Hace falta un contrato de resultados parciales que no invente entradas para satisfacerlo. |
| Evaluación sin fuga | `internal/strategy/backtest/holdout.go:9`, `backtest_test.go:201`, `:232` | Hay cortes temporales, rechazo de duplicados y pruebas de contaminación de la carrera objetivo; reutilizar. |
| Umbrales de backtest | `internal/strategy/backtest/types.go:26` | Error relativo 2% marcado provisional. Ranking lo elige caller. No es validación empírica ni umbral aprobado para F0. |
| Asistente nuevo | `frontend/src/hub/strategy-orbit/StrategyOrbitPage.tsx:303` | El wizard actual usa fill/team/start. Requiere el recorrido aprobado de combinación/evento/reglas/fuentes, conservando calendario y catálogo reutilizables. No se ha hecho auditoría visual Wails. |
| Selección frente a edición | `frontend/src/hub/strategy-orbit/strategy-session-selection.ts:134` | Envía inclusión por sesión; no equivale al nuevo editor de stint/vuelta/tramo con correcciones reversibles. |
| Revisiones reproducibles | `StrategyOrbitPage.tsx:794`, `:995` | Hay revisión/hash y ciclo guardado. Falta demostrar que fija correcciones y todas las versiones de cálculo del diseño nuevo, todavía inexistentes. Reutilizar persistencia tras revisar su contrato. |
| Biblioteca opcional y formatos futuros | Spec v1 #1028, sección de fuentes | LMU es el productor actual. La copia persistente opcional y nuevos formatos siguen planeados; el staging técnico del banco no entrega esas funciones. |

Prioridad: fiabilidad de fuentes (#819/#821/#803), semántica/calibración (#1030)
y reglas completas antes del óptimo son bloqueantes de aceptación; el contrato
de correcciones (#1033) y la nueva UI son alcance pendiente. Analysis posee las
primeras derivaciones/correcciones; Strategy posee reglas, selección, UX y cálculo.
Originales intactos y live aplazado son límites preservados, no features entregadas.

## Evidencia y límites de los tests

Los tests focales de validez/discovery y el paquete backtest pasan. Dos fixtures
sanitizados (`lap-validity-s045-v1.json` y `lap-validity-s266-v1.json`) comprueban
conteos del spike y reglas actuales. No prueban tasas de error frente a anotación
independiente del corpus ni separan toda vuelta invalidada de un incidente.

## Primeros cortes sugeridos, aún sin implementación

1. Reusar #819/#821/#803 para fiabilidad y diagnóstico verificando su scope actual.
2. Contrato de observación/corrección y uso por familia, después de demostrar las
   señales disponibles y normalización temporal del corpus.
3. Resultados parciales como contrato de producto, sin debilitar SolveV2 para
   aceptar inputs necesarios ausentes.

Los pesos o umbrales de selección no se deciden en esta matriz estática.
