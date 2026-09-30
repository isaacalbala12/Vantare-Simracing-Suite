# ISA-1030 — corrección del reloj del banco

Fecha: 2026-09-08. Base `18f9dea4`; rama `vantareapp/isa-1030-clock-evidence`.
Autorización: Isaac pidió corregir el contraste y continuar el desarrollo. Sin subagentes.

## Fallo reproducido y alcance

El spike usaba último Current LapTime menos duración continua como origen. El último cambio de un evento no es el final de una grabación. En Algarve el desfase incorrecto era 9985,14 s frente a 10104,62 s por cruces: 119,48 s. El banco consultaba combustible posterior a la parada y anunciaba cero repostaje.

La corrección afecta al instrumento Python, no al reader ni al producto. El producto ya conserva `TimeOriginUnknown` y `resource_clock_unaligned` en `internal/telemetryanalysis/historical.go` y `pitobserved.go`; esta evidencia no justifica declarar un origen compartido de todos los canales.

## Cambio

El spike contrasta cruces Lap Dist con cambios Lap y conserva método, pares, desplazamiento ordinal y residuo. Solo un encaje único dentro de la resolución de un sample permite derivación exploratoria. Falta de datos, deriva o ambigüedad no implican offset cero: no se derivan recursos/stints entre relojes. El límite de dos cruces en los extremos y tres pares es un límite conservador de este instrumento, no un umbral de producto aprobado.

Las visitas ya iniciadas y las abiertas no forman tasas de paradas completas. Señales truncadas por el presupuesto de lectura no se usan como cobertura completa; ausencia de cobertura devuelve desconocido, no cero.

## Verificación

- RED: función ausente en cuatro tests; después dos regresiones fallaron por aceptar visita parcial y cobertura incompleta.
- GREEN: seis tests unittest, sin dependencias. Casos matemáticos identificados como tales; no se presentan como corpus real.
- Reejecución del instrumento sobre copias privadas, runtime manifest SHA-256 `700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869`, cuatro archivos verificados por tamaño/hash.
- Imola: 38 cruces, offset 25,44 s, residuo máximo 0,04 s; parada completa 54,12 s y 25,715403 L positivos.
- Algarve: 70 cruces, offset 10104,62 s, residuo máximo 0,04 s; parada completa 75 s y 74,725469 L positivos. Visitas parciales excluidas de tasas completas.
- Reserva congelada intacta; fuentes originales intactas. Salidas privadas separadas de las históricas.

## Revisión personal Ponytail + code review

La corrección se aplica en el instrumento compartido, sin segundo reader, dependencia ni cambio de seguridad. Fallo cerrado ante ajuste ambiguo o presupuesto de lectura. No se transporta automáticamente una inferencia experimental a `TimeOriginSourceTimestamp`. Los datos históricos derivados con el offset anterior quedan invalidados como prueba de precisión, pero se conservan para trazabilidad.

No ejecutar Go/frontend por un cambio exclusivo Python/documental; no hay aceptación Wails, filtros calibrados ni prueba de óptimo. Quedan identidad real de vueltas, observaciones inválidas/desconocidas, anotación independiente y contrato productivo de alineación. El banco aún no es autoridad de calidad de cada vuelta.

Reproducción: `python -m unittest discover -s docs/strategy-planner/evidence/isa-694-spike -p test_clock_alignment.py`; `audit_corpus.py inspect` con nueva salida privada, split congelado, runtime verificado y sesiones de preparación S125-35438326/S266-6b912640. No abrir reserva.
