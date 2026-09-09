# ISA-1095 — combinación desde archivo seleccionado

Base f661d82638591bf547df835ab71458d3bbc76401; rama
vantareapp/isa-1095-recorded-source-combination; SDD T08, #1094/#1088.

## T08a — identidad en preparación Analysis

PrepareCorrections devuelve la CombinationIdentity del clasificador Go existente
sobre input.Session ya leído bajo autorización/lock. No nuevo lector, nueva
consulta ni importación de todo el directorio. Si no identifica, conserva la
preparación y devuelve combinationUnavailableReason=metadata_unavailable.
La identidad no certifica calidad, cobertura ni estrategia calculable.

RED: respuesta sin identidad ni motivo. GREEN: identidad igual al clasificador
canónico con metadata completa, ausencia explícita sin bloquear correcciones;
también pasan pruebas previas de permisos y revisiones. Fixture de lector
controlado, no banco DuckDB real. Logs C:/tmp/isa1095-t08a-{red,green}.log.
Build frontend, Go global -p1 y vet app/strategy/telemetryanalysis/cmd PASS. Dos paths Go.
Sigue contrato TS y apertura explícita sin combinación preseleccionada.

T05 #1094 tiene componentes/borrador/persistencia/owner, todavía sin reemplazar
la ruta anterior. Bootstrap y navegación deben conectarse antes de afirmar A4
productivo completo. Sin push/PR/merge/promoción ni intervención en LMU.

## T08b — contrato TS de identidad preparada

AnalysisPreparation admite combinación opcional o motivo metadata_unavailable,
sin aceptar ambos. Valida todos los campos de identidad; versiones anteriores
sin metadata siguen siendo compatibles. RED 8 casos malformados antes del
parser; GREEN 35 focales incluyendo cliente y apertura anterior. Tipos y lint
focal PASS. Logs C:/tmp/isa1095-t08b-*.log. Sigue abrir sin combinación previa.

Gate heredado T05h confirmado: 432 archivos/3384 tests frontend, lint/build PASS.

## T08c — apertura de primera fuente

openRecordedSession permite no conocer la combinación antes de abrir. Exige
identidad de PrepareCorrections, la compara con la proyección y devuelve esa
metadata junto a referencia y handle. Si el usuario ya eligió combinación,
una preparación de otra combinación se rechaza antes de proyectar. Sin identidad
se cierra el handle y se informa recorded_combination_unavailable. Se mantiene
el comportamiento de revisiones exactas, base explícita y compensación de fallos.
RED3/GREEN45 focales, tipos y lint focal PASS. Logs C:/tmp/isa1095-t08c-*.log.
Todavía sin biblioteca integrada; siguiente separar opciones de identidad de
recuentos del catálogo para ofrecer una fuente sin inventar estadísticas.

## T08d — opciones de identidad sin estadísticas inventadas

RecordedCombination es la identidad seleccionable; el asistente y filtro de
calendario aceptan esa forma mínima además del catálogo completo existente.
No se rellenan sessionCount, raceCount ni clima para una fuente preparada.
17 tests focales, tipos y lint focal PASS (C:/tmp/isa1095-t08d-*.log).
Cinco paths de lógica/test. Sigue aceptación explícita de la propuesta y owner
capaz de descubrir/abrir antes de conocer la combinación.

## T08e — aceptación explícita de fuentes preparadas

El owner admite apertura sin combinación previa. Las propuestas unen sólo
identidades verificadas del catálogo, borrador y archivos preparados; rechazan
metadata contradictoria, mezcla de combinaciones y conflictos con calendario.
La acción Usar conserva referencias completas y paso actual; abrir no acepta
ni navega automáticamente. 13 tests focales, tipos y lint focal PASS
(C:/tmp/isa1095-t08e-*.log). Cuatro paths de lógica/test. Sigue integrar el
propietario estable con asistente, editor y persistencia nativa.
