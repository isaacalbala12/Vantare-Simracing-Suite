# ISA-1030 — Corpus real y observaciones

Auditoría del 2026-09-08. Base documental `b4de3035`, producto `d6d0992f`.
El manifiesto y las observaciones anexos no contienen rutas de originales,
identidades de pilotos ni muestras crudas. El mapa privado permanece fuera de Git.

## Inventario y custodia

| Resultado | Cantidad |
|---|---:|
| DuckDB descubiertos | 414 |
| Omitidos por WAL | 47 |
| Omitidos por modificación reciente | 0 |
| Estables inventariados correctamente | 367 / 367 |
| Fallos de inventario | 0 |
| Duplicados de contenido SHA-256 | 0 |
| Cambiados durante reidentificación | 0 |
| Combinaciones exactas de metadata | 59 |
| Practice / Qualify / Race | 296 / 26 / 45 |

El inventario completo tardó 266.596 s de pared; **no es un benchmark del
importador de la app**. No ejecutó análisis de vueltas. Los helpers leyeron copias
técnicas temporales, retiradas tras leer; no abrieron originales con SQL.
Los cuatro originales muestreados conservan al final el SHA-256 congelado.
LMU permaneció abierto y no fue controlado por el banco.

Las 59 combinaciones son claves exactas de simulador, pista, layout, clase y
CarName: algunos nombres identifican equipos/liveries. No equivalen a 59 modelos
físicos distintos. Normalizar sin autoridad podría mezclar coches incompatibles.

Fuel, Virtual Energy, desgaste, compuestos, mezcla, wetness y temperatura ambiente
y de pista están presentes en 367/367 catálogos. Esto demuestra presencia, no
utilidad, variabilidad, alineación temporal ni aplicabilidad a cada categoría.

## Separación antes del análisis

`split-manifest.json`, versión `isa1030.split.v1`, congela hashes completos,
combinaciones y cortes temporales. Su SHA-256 es
`1fbda6081dbbe9bc895418c9bbe715d998604d8c14bba46b4d6347d412ba8811`.

- Preparación: 363 fuentes. Inspeccionadas analíticamente en este banco: 4.
- Candidatas a evaluación: 4, de cuatro combinaciones. No se leyeron sus series.
- Embargo adicional: 0. Preparación precede al cutoff en cada grupo reservado.
- De las 45 Race, 19 con más de cuatro vueltas ya figuraban en los análisis
  históricos de ISA-694. Son aprovechables para desarrollo y regresión.
- De las otras 26, 22 declaran cero vueltas; las cuatro restantes declaran
  1, 1, 2 y 4 vueltas. Metadata Race no acredita carrera completa.

| Candidata reservada | Vueltas declaradas | Uso actual |
|---|---:|---|
| S055-bfa2026d | 4 | Reserva sin abrir, finalización no verificada |
| S256-ea514684 | 2 | Reserva sin abrir, finalización no verificada |
| S120-7763be19 | 1 | Reserva sin abrir, finalización no verificada |
| S238-d582bd6b | 1 | Reserva sin abrir, finalización no verificada |

La exclusión histórica comprueba el spike versionado, no demuestra ausencia de
cualquier uso anterior fuera de ese expediente. **No hay un conjunto suficiente
acreditado de carreras completas independientes para validar el óptimo.**

## Cuatro observaciones de preparación

Los rangos proceden de las muestras acotadas del instrumento histórico (hasta
6144 muestras por canal continuo; desgaste reúne cuatro ruedas). No son extremos
garantizados de toda la carrera. `training-observations.json` conserva denominadores.

| Sesión | Caso | Pista °C observada | VE % observada | Evidencia y límite |
|---|---|---:|---:|---|
| S125-35438326 | Imola, LMP2 | 40.33–43.00 | 0–0 | In Pits cambia 0→1→0; Finish Status cambia 0→1. Este último necesita mapping semántico antes de acreditar finalización. |
| S266-6b912640 | Algarve, LMP2 | 29.79–32.80 | 0–0 | Eventos y canales continuos tienen relojes distintos; el offset estimado del spike no es evidencia suficiente de alineación. |
| S026-08a1e626 | Monza, Hypercar | 40.01–42.34 | 0.51–100 | Recursos y desgaste variables; LastImpactMagnitude solo muestra false, lo que no prueba ausencia de trompos o tráfico. |
| S040-3ebe91db | Práctica con llovizna | 20.34–21.00 | 65.35–100 | Minimum Path Wetness cambia 12.5→5.0; LastImpactMagnitude cambia false→true y no vuelve a false en el registro. |

Cada catálogo muestreado tiene 98 canales. No se encontró nombre explícito con
`valid` o `spin` en ninguno de los cuatro. Esto no excluye que otra señal permita
derivarlos, ni autoriza a asignar semántica a números de flags sin documentación.
LastImpactMagnitude contiene booleanos en estas muestras: no permite medir
magnitud de impacto a partir de su nombre. Una transición tampoco etiqueta por
sí sola toda la duración posterior como incidente.

## Límites que cambian el siguiente trabajo

1. Diferenciar presencia, aplicabilidad y dato utilizable: cero VE en LMP2 no
   debe transformarse automáticamente en autonomía infinita ni dato faltante.
2. Resolver tiempo antes de asociar Fuel/VE/temperatura a vueltas. El spike estima
   offset por extremos en `spike_f0_1.py:718`; no usar sus deltas como verdad.
   Esto es una limitación del instrumento, no una reproducción de fallo productivo.
3. Separar observación de etiqueta causal. Hay señales de pit y cambios de clima;
   falta anotación independiente de invalidación, trompo y vueltas lentas sanas.
4. Reutilizar carreras largas para desarrollar; incorporar carreras nuevas,
   completas y reservadas antes de evaluar precisión. No fabricar una prueba
   independiente repartiendo vueltas de una misma carrera entre ambos conjuntos.
