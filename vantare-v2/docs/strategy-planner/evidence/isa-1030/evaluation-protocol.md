# ISA-1030 — Protocolo de evaluación propuesto v1

Estado: separación congelada; cobertura y verdad independiente insuficientes.
No se han ejecutado solver/backtests sobre las cuatro candidatas reservadas.
No se han aprobado umbrales nuevos ni medido tasas de falsos descartes.

## Observación, anotación y decisión

Para cada caso conservar hash de fuente, revisión, intervalo en reloj declarado,
canales utilizados, condición y familia (ritmo, Fuel, VE, desgaste, pit).
Anotar por separado: observado, interpretación, incertidumbre y utilizable/no
utilizable/desconocido. No adoptar la clasificación del filtro que se evalúa.

| Caso | Evidencia disponible | Pendiente para etiqueta defendible |
|---|---|---|
| Pit | Transiciones In Pits en 4/4 muestras | Mapear al reloj/vuelta y separar entrada, servicio, salida |
| Wetness/temperatura | Cambios medidos, práctica húmeda incluida | Comparabilidad y efecto con Fuel/edad controlados |
| Impacto | Eventos booleanos, sin magnitud | Semántica y duración afectada; replay/anotación independiente |
| Invalidada sana | Sin canal de nombre explícito encontrado | Observación/replay y semántica de invalidación |
| Trompo sin impacto | No acreditado | Fuente o anotación independiente; no deducirlo de lentitud |
| Vuelta lenta sana/degradación | Desgaste y tiempo disponibles | Distinguir tráfico, clima, Fuel e incidente antes de clasificar |
| Consumo/VE | Canales presentes, VE cero en dos LMP2 | Aplicabilidad por categoría y deltas con reloj validado |

Cuando los datos no resuelvan un caso, conservar desconocido. Isaac puede
adjudicar con contexto o replay; el acuerdo se documenta separado de la salida
del detector. No hay suficientes casos adjudicados en este banco para fijar
muestra mínima ni umbral numérico. El 2% del backtest actual sigue provisional.

## Métricas que deben quedar separadas

- Contaminación: casos dañados aceptados / casos aceptados adjudicados, por familia.
- Descarte útil: casos sanos rechazados / casos sanos adjudicados, por familia.
- Cobertura: observaciones utilizables / observaciones elegibles, con desconocidos
  y exclusiones reportados aparte. Conservar duración y número de vueltas.
- Fuel y VE: error firmado y absoluto por vuelta/stint, L y puntos porcentuales
  respectivamente; relativo solo con denominador válido y no nulo.
- Ritmo: error en segundos por vuelta y stint, condicionado por clima, neumático,
  Fuel y conductor. No esconder sesgo con una media de condiciones mezcladas.
- Pit: error en segundos de tránsito/servicio y total; paralelismo de tareas
  acorde a reglas. Un pit observado no demuestra el coste contrafactual completo.
- Plan: factibilidad de recursos, ventanas, inventario y conducción; error del
  tiempo bajo un escenario declarado y ranking sobre alternativas comparables.
  Una carrera observada no revela qué habría sucedido con todas las estrategias.

Reportar intervalos de incertidumbre agrupando por sesión/carrera; vueltas del
mismo stint no son réplicas independientes. Escoger tamaño de muestra después
de medir variabilidad de preparación y acordar error tolerable de producto.
Los límites actuales del código son baselines a medir, no objetivos aprobados.

## Orden para cerrar el gate

1. Validar semántica/relojes y obtener anotaciones independientes de preparación.
2. Medir filtros actuales y candidatos sobre esos casos; conservar pérdidas de
   cobertura por condición y familia, incluso cuando empeora la media.
3. Proponer umbrales y muestra mínima a Isaac con incertidumbre. Congelar
   versiones, selección y criterios antes de abrir nuevos resultados reservados.
4. Incorporar carreras completas nuevas, deduplicadas por hash, después de su
   histórico de entrenamiento y sin consultas de resultados durante calibración.
5. Ejecutar una evaluación final; si se ajusta el modelo después, retirar ese
   conjunto de la siguiente evaluación independiente y obtener nueva reserva.

Se puede continuar fiabilidad de fuentes y diseño de correcciones sin aprobar
precisión. No se puede declarar óptimo validado, cero incidentes o F0 completo.
Tests matemáticos de un solver prueban un modelo bajo sus supuestos; replay/corpus
prueban ajuste empírico; Wails/LMU prueba integración. Son gates diferentes.
