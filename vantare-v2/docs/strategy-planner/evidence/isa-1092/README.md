# T02 — matriz de transporte y cortes (ISA-1092)

Base6d4aa514, rama vantareapp/isa-1092-recorded-event-inputs,
C:/tmp/vantare-isa1092. El SDD está en ejecución autorizada; T01 mantiene
validación nativa pendiente. Esta matriz no declara las familias conectadas.

| Entrada | Documento / cliente actual | Adapter / solver | Corte necesario |
|---|---|---|---|
| Duración | durationMin -> durationMinutes | CalculateRace por tiempo + horizonte | Conservar; añadir carrera por vueltas en corte propio. |
| Fuel capacidad/consumo/reserva | tank + PlanningInputs | orbitScalarInput/Reserve -> SolverV2 | Conservar procedencia; comprobar inicial/capacidad distintos. |
| VE | proyección + overrides parciales | capacidad inferida/aplicabilidad pendiente | Modelar aplicabilidad y configuración explícitas, no cero por ausencia. |
| Min/max paradas y ventanas | Sin campo de reglas transportado | EventRules del solver ya soporta | Primer corte backend Rules opcional + validación/replay; persistencia/TS/UI después. |
| Pilotos/ritmos | Drivers y order; disponibilidad en documento | Optimiza promedio; perfiles sólo evaluación final | Conectar perfiles antes de optimizar; retirar estimaciones automáticas no autorizadas; no inventar consumo. |
| Disponibilidad | Ventanas en minutos de día | DriverLimits usa vueltas y segundos de conducción | No convertir minutos a vueltas con promedio; contrato temporal explícito y validación final. |
| Neumáticos/inventario | Documento tiene TyreInventory | No llega desde Orbit; solver lo admite con curvas por compuesto | Mapper con identidades/calidad; falta curva no permite declarar compuesto conocido. |
| Servicios | pitLoss único | Tránsito legacy + tasas sentinel; PitCostModel completo existe | Transportar desglose confirmado, no reinterpretar pit total como tránsito observado. |
| Formación | Sin entrada | cero marcado fallback | Campo/configuración y cobertura explícita. |
| Clima | escenarios/proyección | ruta Weather existente separada | Conservar capacidades, no nuevo forecast; restricciones compatibles. |
| Referencias | revisiones exactas #1084–1088 | productor autorizado | Preservar; configuración/persistencia no puede sustituir la revisión. |
| Final | accepted/variants previos parciales | final replay siempre not_proven | T03 aclara resultado y validez; no llamar óptimo por haber pasado solver. |

## Primer microcorte

Tres archivos de lógica/tests: application/types.go, orbit_calculation.go y
orbit_event_rules_test.go. Nuevo campo opcional event.rules reutiliza
solver.EventRules, sin duplicar sus validadores. La omisión conserva contrato
anterior. Reglas dadas se aplican al solve y al replay final: min/max paradas,
ventanas; driverLimits sin perfiles y compuestos sin soporte se rechazan por
contrato, no se ignoran. No se declara que UI/persistencia ya lo emitan.

RED por JSON con maxPitStops=0 en carrera que necesita repostar; minPitStops
exige parada adicional; ventana obligatoria y override que la viola; valor
negativo inválido. GREEN después del transporte, suites application/solver,
Go/vet y build antes de cierre. Siguientes cortes completan documento/cliente,
perfiles, recursos y UI sin alterar owners ni introducir dependencias.

## T02a — resultado focal

Cuatro casos JSON fallan antes por reglas ignoradas (RED) y pasan tras el campo
opcional y el transporte. La ventana [2,2] se cumple; override a primera parada
vuelta1 se rechaza por replay final. Errores tipados invalid/infeasible comprobados.
No duplicación del validador ni nueva ecuación. El adapter común cubre solve,
Weather y evaluación final. Campo omitido mantiene el comportamiento previo.
Frontend build PASS (aviso heredado de chunks); Go global/vet en curso.

Revisión: clave de reglas es por evento, no por fuente; referencias Analysis no
se modifican. No se promete UI conectada por aceptar JSON. Rollback del campo
es seguro para este corte sin persistencia nueva; persistencia posterior debe
fijar compatibilidad/versionado antes de guardar reglas en documentos.

## T02b — contrato persistente de reglas (2026-09-09)

T02a commit ad8774a5: Go completo -p 1, vet y frontend build PASS.
T02b añade reglas con evidencia al documento y versión 2.1.0. Los documentos
2.0.0 sin reglas siguen siendo válidos; reglas en 2.0.0 se rechazan. El solver
es dueño del validador estructural reutilizado por el documento; perfiles,
modelos y horizonte concreto se validan al calcular. Archivos originales intactos.

Pruebas de versión/serialización y evidencia, más 11 casos estructurales PASS.
La comparación JSON se corrigió para representar los números como float64;
la diferencia era del test y no pérdida del contenido. Go completo -p 1 PASS
(C:/tmp/isa1092-t02b-all.log), vet PASS (isa1092-t02b-vet.log), diff check PASS.
No cambia frontend: se conserva el build T02a. No prueba Wails nueva.

Pendiente inmediato T02c: promoción de versión al guardar mediante aplicación,
cliente TS y transporte desde evento. Este corte define el contrato; no declara
la interfaz conectada. No push, PR, CI remoto, merge ni release.

## T02c1 — comandos y reapertura

CreateEvent y EditEvent ascienden de 2.0.0 a 2.1.0 al añadir reglas; no ascienden
sin reglas ni degradan versión al retirarlas. Dos casos RED antes del cambio,
GREEN después, incluyendo reapertura del repositorio y comparación de evidencia.
Go completo -p1 PASS (isa1092-t02c1-all.log), vet PASS
(isa1092-t02c1-vet.log). El cliente TS se conecta en el siguiente corte.

## T02c2 — cliente tipado

Cliente admite schema2.0.0/2.1.0, exige versión nueva para reglas y valida su
estructura y evidencia. El tipo de cálculo admite event.rules. 48 tests focales,
420 archivos/3320 tests frontend PASS, typecheck PASS, lint PASS, build PASS.
Logs C:/tmp/isa1092-t02c2-{focused,tests,types,lint,build}.log. La suite imprime
AbortError de teardown happy-dom; termina exit0 sin tests fallidos. Aviso de
chunks grandes heredado. No nueva prueba Wails ni paridad visual.

Reglas de evento todavía no se envían desde la pantalla productiva; ese enlace
es T02c4. T02c3 cubre antes compatibilidad de backup/preview/rollback antiguo.
