# TA-04A — evidencia espacial LMU sanitizada

Estado: evidencia cerrada con `GO` para límite de vuelta, progreso/longitud y
ancla temporal; `NO-GO` para geometría y anchura. No se creó superficie visual.

## Custodia y alcance

Isaac autorizó primero una observación puntual y después amplió el consentimiento
a los `.duckdb` históricos finalizados/estables necesarios. Las lecturas se
hicieron una por vez sobre copias privadas mediante las APIs productivas de
autorización, staging, runtime confiado, reader TA-03C y parser canónico. La
búsqueda se detuvo en la primera candidata con suficientes vueltas.

- ausencia de WAL y ventana de estabilidad: PASS;
- archivo regular, ACL privada y copia con hash idéntico: PASS;
- original sin cambios antes y después: PASS;
- copia, hard link auxiliar y directorios temporales eliminados: PASS.

No se conservaron rutas, nombres, identificadores, timestamps, coordenadas,
valores, muestras, metadata, frames ni bases DuckDB. La herramienta temporal,
staging y copias se eliminaron y Git quedó limpio.

## Primera observación: evidencia insuficiente

`decreases` cuenta transiciones descendentes entre valores finitos;
`changes` cuenta transiciones cuyo valor cambió. No se registran los valores.

| Canal | Filas | Finitas | NULL | Decreases | Changes | Timestamp decreases |
|---|---:|---:|---:|---:|---:|---:|
| `Lap` | 1 | 1 | 0 | 0 | 0 | 0 |
| `Lap Dist` | 195 | 195 | 0 | 57 | 193 | no aplica |
| `Total Dist` | 195 | 195 | 0 | 57 | 193 | no aplica |
| `GPS Time` | 1.947 | 1.947 | 0 | 0 | 1.946 | no aplica |
| `GPS Latitude` | 195 | 195 | 0 | 66 | 66 | no aplica |
| `GPS Longitude` | 195 | 195 | 0 | 133 | 181 | no aplica |
| `Path Lateral` | 195 | 195 | 0 | 82 | 193 | no aplica |
| `Track Edge` | 195 | 195 | 0 | 9 | 17 | no aplica |

Esta grabación solo contenía un evento `Lap`; produjo `NO-GO` provisional para
las cinco familias. Los conteos caracterizan únicamente ese artefacto y no se
usaron como regla general del formato LMU.

## Segunda observación: grabación multivuelta

Un dry-run metadata-only priorizó 20 candidatas; 19 quedaron `ready` tras una
ventana real de estabilidad. La primera candidata evaluada mediante la pila
productiva fue suficiente y detuvo la búsqueda.

| Canal/evidencia | Agregado sanitizado |
|---|---|
| `Lap` | 71 filas finitas, 70 cambios; valor y `ts` monotónicos |
| `Lap Dist` | 68.550 filas a 10 Hz, sin NULL/invalid; 70 resets y 71 segmentos |
| Segmentos completos | 69 monotónicos; longitud min/mediana/max 4.621,67 / 4.627,25 / 4.633,41 m; variación relativa 0,00254 |
| `Total Dist` | 68.550 filas a 10 Hz, sin NULL/invalid ni descensos; recorrido acumulado 324.472,156 m |
| `GPS Time` | 685.492 filas a 100 Hz, sin NULL/invalid ni descensos; pendiente 1, intercepto clasificado `nonzero`; residual p95 0,0000053 s y máximo 0,0124943 s |
| `Lap` ↔ `GPS Time` | 71 coincidencias; residual p95/máximo 0,0025 s |
| Snapshot inicial | 1 evento en el inicio de cobertura; no se considera frontera demostrada |
| `Lap` ↔ reset de `Lap Dist` | 70 eventos alineados 1:1 con 70 resets; residual OLS p95 0,0924975 s y máximo 0,0925025 s |
| `GPS Latitude` / `GPS Longitude` | 68.550 filas a 10 Hz cada uno, sin NULL/invalid, rango geográfico válido y alineación por índice con `Lap Dist` |
| Cierre espacial inferido | cobertura 1,0, cero outliers; cierre min/mediana/max 1,45 / 8,35 / 93,77 m con proyección equirectangular local |
| `Path Lateral` | 68.550 filas a 10 Hz, sin NULL/invalid; cobertura 1,0; min/mediana/max -12,9376 / -0,867309 / 11,2362 m |
| `Track Edge` | 68.550 filas a 10 Hz, sin NULL/invalid; cobertura 1,0; min/mediana/max -14,425 / -6,761 / 30 m |

La proyección espacial es una inferencia diagnóstica, no una demostración del
datum de las coordenadas. Los rangos laterales tampoco demuestran por sí solos
una fórmula de anchura.

## Decisión por familia

| Familia | Decisión | Motivo |
|---|---|---|
| Límite de vuelta | `GO` | Un snapshot inicial no autoritativo y 70 eventos monotónicos se relacionan 1:1 con 70 resets, formando 71 segmentos; residual observado máximo 0,0925025 s. |
| Progreso y longitud | `GO` | 69 segmentos completos son monotónicos y sus longitudes compatibles tienen variación relativa 0,00254. |
| Ancla temporal | `GO` | `GPS Time` demuestra paso de 0,01 s y relación estable con los 71 eventos; esa ancla relaciona eventos y continuas de 10 Hz. |
| Geometría | `NO-GO` | Hay cobertura, alineación y cierres plausibles, pero el datum GPS no está demostrado; la proyección local sigue siendo inferencia. |
| Anchura | `NO-GO` | Hay cobertura completa, pero no existe una fórmula semántica demostrada para convertir `Path Lateral`/`Track Edge` en anchura por tramo. |

## Consecuencia contractual

TA-04A implementa un contrato Go puro y versionado para límites de vuelta,
progreso, longitud y ancla temporal. El envelope v1 de frontera es 0,113 s:
0,1 s de cuantización causal de `Lap Dist` a 10 Hz más 0,0124943 s de error
máximo demostrado del ancla y 0,0005057 s de margen numérico. El máximo
0,0925025 s es evidencia observada, no el límite contractual.

El contrato exige OLS con pendiente temporal fija, cobertura completa, snapshot
inicial, evento por reset, al menos dos vueltas completas y longitudes
compatibles. Geometría y anchura siguen como capacidades independientes
`unknown`/`incompatible`: no se publican cero, coordenadas proyectadas ni ancho
estimado.

TA-04B continúa bloqueada porque su captura técnica visual requiere geometría
demostrada. Comparación y delta por distancia tampoco se implementan en este
corte; TA-04A solo entrega la base pura no visual. Resolver geometría exige una
fuente autoritativa para el datum o un contrato explícito que no dependa de
inferirlo por rango/cierre. Resolver anchura exige documentar y validar la
semántica de ambos canales.
