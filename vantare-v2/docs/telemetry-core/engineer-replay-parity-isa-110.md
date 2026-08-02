# ISA-110 / TC-08C — Paridad replay de Engineer y Spotter

Estado: implementado en rama aislada el 2026-08-01. No hay cutover,
promoción ni cambios en el runtime productivo.

## Objetivo y resultado

Este corte caracteriza la frontera entre `ObservationSnapshotV1` y los
monitores legacy antes de sustituir su entrada. El resultado es un gate
ejecutable para **Spotter + los 20 monitores**, acompañado de un bridge
exclusivo de replay que nunca abre Shared Memory o REST.

La conclusión no es que los 20 monitores estén listos. Se han aprobado seis
escenarios delimitados y se han dejado el resto parcial o deshabilitado de
forma explícita. Un valor ausente, stale, invalid, unsupported o perteneciente
a una capability degraded no atraviesa el bridge como si fuera un cero real.

## Contrato de seguridad

- `MonitorContracts()` enumera 21/21 familias, sin omisiones.
- `Evaluate()` solo autoriza escenarios con paridad demostrada y señales
  fresh de capabilities supported.
- `Adapter.FrameFor(family, snapshot)` exige una familia concreta. No existe
  un conversor general para alimentar los 20 monitores a la vez.
- Los IDs opacos se convierten en IDs locales deterministas solo dentro del
  replay. El mapping se conserva en un epoch y se reinicia al cambiar de epoch.
- El bridge no abre fuentes, no genera observaciones, no toma decisiones de
  mensajes y no forma parte del composition root.
- El `Frame` legacy sigue intacto. Se retirará únicamente tras cutover y
  evidencia de consumidores cero en TC-09.

## Matriz operativa

| Estado | Familias | Qué está probado |
|---|---|---|
| Aprobado y acotado | Spotter | left/right normal, identidad, debounce, `still there`, clear y anti-spam. Formation/FCY no están autorizados. |
| Aprobado y acotado | Fuel | umbrales absolutos y consumo por vuelta con litros/capacidad/lap fresh. Virtual Energy no se trata como fuel. |
| Aprobado y acotado | Penalties | subida/bajada del contador genérico. No se afirma el tipo de sanción. |
| Aprobado y acotado | Laps | transición de vuelta y timing básico. Mensajes dependientes de game phase permanecen fuera. |
| Aprobado y acotado | Timings | gaps canónicos comparables para jugador/coche adyacente. |
| Aprobado y acotado | Pitstops | entrada y salida. Limiter, box-now por distancia y ventana de pit permanecen fuera. |
| Parcial, no activable todavía | Opponents, Multiclass, Watched opponents, Position, Push, Race time, Session end, Pearls, Strategy | Las señales parciales existen, pero falta un escenario aprobado o una señal específica. `Evaluate` falla cerrado. |
| Deshabilitado | Engine, Tyre, Flags, Driver swaps, Damage, Conditions | No existen capabilities canónicas suficientes. El bridge no puede producir un frame para estas familias. |

## Paridad y regresiones

Las fixtures legacy existentes siguen siendo el baseline de comportamiento de
los monitores. Las pruebas nuevas alimentan esos mismos monitores y la misma
máquina Spotter con frames obtenidos exclusivamente desde
`ObservationSnapshotV1`, y comprueban los resultados observables:

- lado y geometría Spotter;
- estabilidad de identidad dentro del epoch y reset entre epochs;
- cooldown, repetición y clear sin spam;
- cruce de medio tanque y consumo por vuelta;
- transición del contador de sanciones;
- vuelta completada;
- entrada de pit;
- informe de gap.

Los tests de `audio.Queue` y `core.Runtime` ya caracterizan prioridad Spotter,
expiry y validity rules sobre el modelo legacy; este corte no los modifica ni
presenta el bridge como conexión productiva.

## Diferencias aceptadas y gaps

1. No hay `game phase`, flags o finish status canónicos: formación, FCY,
   banderas y resultado final no se adaptan.
2. No hay tyre/brake/engine/damage/weather reales: sus monitores permanecen
   silenciados, incluso si un cero legacy podría parecer válido.
3. No hay tipo de sanción: solo puede caracterizarse el contador genérico.
4. No hay track length: las reglas que lo necesitan no están aprobadas.
5. El fact `driver.changed` existe en contrato, pero no tiene productor real
   demostrado y no habilita Driver Swaps.
6. El bridge es una herramienta de migración, no una API de producto.

## Siguiente corte

ISA-111 / TC-08D puede cambiar el runtime Engineer para consumir la proyección
canónica y ejecutar únicamente familias autorizadas por gates. Debe mantener
el antiguo runtime disponible para comparación/shadow durante el corte, sin
abrir un segundo reader y sin activar ninguna familia parcial o disabled.

Rollback: revertir el commit de ISA-110. Como no hay wiring ni persistencia,
el rollback no requiere migración de datos.
