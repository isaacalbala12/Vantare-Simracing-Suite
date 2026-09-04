# ISA-894 · R7b/A3 — preflight Delta V2 bloqueado por presupuesto de wire

Fecha: 2026-09-04  
Rama: `vantareapp/isa-894-retirada-v1-r7b`  
Base/HEAD medido: `9847c5446bb6eaccb05e85efa9acb493027e46cb`

## Veredicto

`BLOCKED` antes de producción. No se añadieron tests RED ni código A3. El
árbol quedó limpio después de retirar los dos artefactos temporales de medida.

La forma aprobada sigue siendo lossless y cache-safe:

```text
DeltaHistoryV2 {
  q
  capturedAtMS[120]
  seconds[120]
}
```

No se permite resolver el bloqueo reduciendo las 120 muestras, precisión,
calidad, frescura, información, funcionalidad o cadencia, ni mediante
sentinels o datos inventados.

## Inventario de consumidores

- La autoridad es `derive.SelfDelta.History []DeltaSample`, limitada por
  `MaxSelfDeltaHistory = 120`.
- El único consumidor visual de la historia es Delta Trace. Usa únicamente
  `{capturedAt, deltaSeconds}`.
- No existen consumidores wire de `DeltaSample.SourceTime` o
  `DeltaSample.LapDistance`; los homónimos encontrados pertenecen a filas de
  Standings/Relative u otros dominios.
- El V2 actual de Delta Trace todavía acumula un singleton en navegador desde
  `frame.generatedAt` y usa `Date.now()` como fallback. A3 debe retirarlo solo
  después de disponer de historia canónica V2.

## Primera medida: fixture histórico

El gate existente `syntheticFullFrame(104)` serializa 104 filas Relative y
ninguna `RelativeSettled`. Eso no es alcanzable en producción: `BuildRelative`
y el settler están acotados a 8 delante + player + 8 detrás, por lo que ambos
arrays tienen como máximo 17 filas.

Sobre el fixture histórico:

| Escenario | Bytes | Margen/exceso frente a 65.536 |
|---|---:|---:|
| Base histórica 104/104/nil | 64.208 | +1.328 |
| Base + A3 realista | 67.561 | -2.025 |
| Base + A3 float peor medido | 68.221 | -2.685 |

Ese STOP era un falso positivo respecto a la cardinalidad de Relative, pero
descubrió que el gate necesitaba representar la producción real.

## Segunda medida: fixture alcanzable en producción

El preflight temporal corrigió la cardinalidad a Standings 104, Relative 17 y
RelativeSettled 17, pobló `bestLap` fresh y conservó los campos reales. Todas
las cifras siguientes proceden de `json.Marshal`; no son estimaciones.

| Escenario | Base | + A3 realista | + A3 float peor | Margen peor |
|---|---:|---:|---:|---:|
| Strings actuales | 52.796 | 56.149 | 56.809 | +8.727 |
| Strings de 20 caracteres | 58.892 | 62.245 | 62.905 | +2.631 |
| Strings de 32 caracteres | 63.860 | 67.213 | 67.873 | -2.337 |

El coste A3 medido es +3.353 B con valores realistas y +4.013 B en la variante
float más larga ensayada.

## Motivo del bloqueo real

Los IDs, nombres de piloto y clases son strings libres sin cota de longitud en
el contrato actual. A3 introduce una región nueva de rechazo: el escenario de
32 caracteres cabe hoy sin historia (63.860 B), pero el mismo frame sería
rechazado con A3 (67.213–67.873 B). No es correcto declarar A3 seguro usando
solo nombres representativos.

Corregir el fixture 104/104 a 104/17/17 es una reparación fiel del test, no una
debilitación, siempre que se añadan también aserciones de los topes
productivos. Sin embargo, esa corrección no elimina la regresión de la cola de
strings.

## Decisión pendiente

Antes de A3 hay que aprobar una de estas familias de cambio:

1. elevar de forma explícita el presupuesto Publisher con un nuevo gate que
   demuestre que ningún frame antes válido pasa a ser rechazado por el coste
   máximo A3; o
2. recuperar al menos el coste A3 mediante una codificación lossless del wire,
   lo que reabre contratos ya aprobados y exige ADR/revisión propia.

No se recomienda un segundo transporte, compresión ad hoc, formato binario o
truncado: aumentan complejidad o pierden garantías.

## Acciones y límites

- Dos preflights temporales fueron creados y eliminados; no queda ningún
  artefacto ni cambio productivo.
- Gate base repetido por el orquestador: 64.208 B, PASS.
- Sin apps, LMU, navegador, `.env*`, dependencias, push, PR, merge, promoción
  o release.
- A3, B, C, D, E y F no se ejecutaron después del STOP.

