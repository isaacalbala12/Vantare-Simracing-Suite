# ISA-760 Wails Redline baseline v1

Baseline aislado del renderer productivo `StandingsEndurance` dentro de una
ventana Wails/WebView2 real 1920x1080. No cambia producto, no integra Qt y no
demuestra presentación DWM.

## Resultado

Tres repeticiones seriales por escenario, 15 ejecuciones y 2499 snapshots. La
cardinalidad DOM coincidió con el ViewModel en todos los snapshots.

| Escenario | commit p50/p95/max ms | layout p50/p95/max ms | gate layout |
| --- | ---: | ---: | --- |
| overtake | 1.00 / 1.90 / 14.30 | 1.20 / 2.90 / 26.50 | `INVALID` por max |
| full | 0.90 / 1.70 / 14.20 | 1.00 / 2.20 / 25.70 | `INVALID` por max |
| enter | 0.90 / 1.80 / 9.70 | 1.00 / 2.00 / 19.50 | `INVALID` por max |
| retirement | 0.90 / 2.00 / 10.80 | 0.90 / 2.10 / 21.40 | `INVALID` por max |
| stress104 | 2.50 / 5.10 / 20.30 | 2.70 / 7.20 / 44.00 | `INVALID` por max |

Todos los p95 de commit+layout forzado cumplen 8 ms y ningún máximo supera el
umbral hitch de 50 ms. El gate completo conserva el máximo 16.67 ms usado por
ISA-738 y por eso permanece `INVALID` en los cinco escenarios; no se relaja.

El siguiente rAF tuvo p95 16.5--16.6 ms, pero rAF no equivale a presentación
real ni a `frameSwapped`: esa capa sigue `UNRESOLVED`.

## Comparación Qt

Sobre los mismos replay SHA-256, Wails obtuvo p95 y máximos direccionalmente
menores que el `modelApply` Qt de ISA-738 en los cinco escenarios. La
comparación es `DEGRADED`: React commit/layout forzado y QML model apply no
comparten una frontera idéntica. No se usa para declarar que Wails sea más
rápido ni para decidir una migración.

CPU y RAM del árbol Wails/WebView2 se midieron, pero no existe una captura Qt
con el mismo sampler. La comparación de recursos queda `UNRESOLVED`.

## Custodia

- Commit medido: `066d3f1403682c2da0f7516d6cb2787ac66643cb`.
- Raw local: `C:\tmp\isa760-wails-final-066d3f14`.
- Manifest SHA-256:
  `4ac1d0ddeb5f6fd092d9ade0c8f626767b6dd92f82fb906ffd2c8cf53c999f0d`.
- Summary SHA-256:
  `c89f4b41059d041eed9ca9a0c5f6addcbf55e2f50c3d52029177bf53351d4f53`.
- EXE SHA-256:
  `2a5195090ab6c402d391cc0f449470e33d669148c0140db0f2ff228751541e7a`.
- Replay canonical SHA-256:
  `9e7f791ab831762909ac832f4f7d0c19e5d012558cd0d2bc0a5505cd6f637059`.
- Replay stress104 SHA-256:
  `4b084cfb72078d837e1f2bb489a8d82d597d412c78c40180cd75c61b0ccbb60a`.

El agregador independiente aceptó el runset y rechazó una copia cuya primera
traza fue manipulada sin actualizar su hash.

Conclusión: **Wails continúa como runtime principal por decisión de producto y
arquitectura, no porque este corte pruebe superioridad completa frente a Qt**.
Qt sigue siendo un experimento aislado y no hay base para otra reescritura.
