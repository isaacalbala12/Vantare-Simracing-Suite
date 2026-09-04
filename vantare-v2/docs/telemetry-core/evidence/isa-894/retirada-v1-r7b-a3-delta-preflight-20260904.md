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

## Decisión aprobada por Isaac (2026-09-04)

1. **Objetivo de rendimiento representativo <= 64 KiB** (`65536 B`): frame V2
   @104 corregido (Standings 104, Relative/Settled 17/17) con strings
   representativos e historia A3.
2. **Límite duro de seguridad <= 72 KiB** (`73728 B`): sincronizado entre el
   Publisher Go de overlay-v2 y el validador frontend. El escenario legal de
   seguridad (strings de 32 caracteres + float adverso + A3, medido
   67.213–67.873 B) cabe bajo 72 KiB. No se afirma que toda string no
   acotada quepa: las strings del contrato siguen sin cota de longitud.
3. **Transporte general = 256 KiB** (`MaxPayloadBytes` del Hub): techo duro
   sin ampliar; ningún producto no relacionado cambia de límite.

Con esta decisión el bloqueo queda levantado y A3 procede con TDD RED→GREEN
en la misma rama. No se reduce ninguna garantía A3 (120 muestras, precisión,
calidad, frescura, información, funciones, cadencia).

## Acciones y límites

- Dos preflights temporales fueron creados y eliminados; no queda ningún
  artefacto ni cambio productivo.
- Gate base repetido por el orquestador: 64.208 B, PASS.
- Sin apps, LMU, navegador, `.env*`, dependencias, push, PR, merge, promoción
  o release.
- A3, B, C, D, E y F no se ejecutaron después del STOP.

