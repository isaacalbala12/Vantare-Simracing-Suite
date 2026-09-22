# Timings: corpus independiente T0b

[VAN-745](https://app.notion.com/p/3e3e51695c65815a882dceaf13cde9e6) / #1316.
141 escenarios semánticos en 15 ficheros. Se escribieron desde la fuente
CrewChief fijada y las decisiones aceptadas por Isaac, sin ejecutar el monitor
Vantare para obtener resultados esperados. No son capturas LMU ni una ejecución
del binario CrewChief. No contienen código, textos de radio ni assets copiados.

## Contrato y alcance

`manifest.json` fija CrewChief `4c3865e09a347d4c806c0bc0cd66aae335fbc610`,
el ledger T0a `166ff3c5b040cb9c4b0b143675af2642043da848` y su SHA-256,
23 archivos fuente con hashes, anclas inclusivas por línea, los 36 ajustes
predeterminados, perfil sintético, decisiones y hashes de cada fichero de casos.
La referencia T0a es inmutable: este corte no depende de tener su PR fusionada
ni copia sus commits pendientes. [Ledger fijado](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/166ff3c5b040cb9c4b0b143675af2642043da848/vantare-v2/docs/analysis/engineer/timings/ledger.json).

Cada caso tiene ID, anclas, entrada semántica, pasos, sorteos registrados,
`source_expected` y `accepted_expected`. `basis` distingue:

- `source`: comportamiento fuente conservado.
- `accepted_evolution`: decisión A1–A9 aceptada después del snapshot del ledger.
- `contract_adaptation`: representación propia de epoch, unknown o prioridad
  P2/P3; no se atribuyen esos tipos a CrewChief.

`input` y `facts` son objetos semánticos específicos de cada regla, no un schema
genérico de telemetría ni snapshots que el producto pueda consumir directamente.
El test valida su envoltura y consistencia común; **no valida el algoritmo que
produce los facts ni todos los nombres/tipos internos de esos objetos**. La
exactitud del expected se revisa contra las anclas; los siguientes cortes
añadirán sus adaptadores y comparaciones de comportamiento reales.

Las entradas aíslan una rama: por ejemplo, `TIM-STATE` evalúa el clasificador,
`TIM-END` sólo el predicado de final, y `TIM-SELECT` arbitra candidatos ya
construidos. Omitir campos ajenos a esa rama no simula que estén missing.
La ausencia relevante se escribe `null` con calidad/nota explícita. Cada caso
hereda el perfil salvo overrides de entrada; no hereda datos de otro caso.
`all_other_automatic_gates: valid` es una precondición sintética, nunca una
declaración de que esas señales estén presentes en LMU.

Unidades: sufijos `_s` en segundos, `_ms` en milisegundos, `_m` en metros,
`_mps` en metros/segundo; posiciones de clasificación desde 1. `latest_first`
es historial más reciente primero, `chronological` primero más antiguo.
El signo temporal relativo se explicita y no se deduce del orden físico.

## Tiempo, azar y consumo

Los pasos usan el `VirtualClock` existente, origen local cero, sin sleeps.
Los escenarios de umbral pueden fijar `now_ms` directamente en su entrada:
son evaluaciones de un predicado, no simulaciones del transcurso completo.
Los sorteos inyectados registran propósito, mínimo, máximo exclusivo y valor.
La cinta rechaza llamadas adicionales, rangos distintos o azar de texto;
no usa PRNG global. La secuencia completa sustituye una semilla dependiente
de un algoritmo/plataforma. Los lectores de cifras no simulan variantes de texto.

`resolve` y `started` son momentos diferentes. El objetivo aceptado nunca
consume por resolver, expirar o cancelar; para declarar `consumed:true` debe
existir un paso `started`. Los casos de lifecycle distinguen expected fuente
del objetivo. El test de integridad no ejecuta la cola ni mide primer sonido.

## Comprobación

Desde `vantare-v2`:

```sh
go test ./internal/engineer/replayoracle -run Timings -count=1
```

Comprueba 15 reglas, A1–A9 cubiertas, configuración exacta, hashes/conteos,
IDs únicos, anclas, referencias, clasificación de diferencias, reloj, rangos
aleatorios, consumo/cancelación y mutaciones negativas. No usa `Runner.Run`,
`timings.Monitor` ni los goldens históricos v1/v2/radio como oráculo.
Un PASS sólo significa integridad/autoconsistencia del corpus; los seis gates
de ejecución/paridad/voz/acústica/LMU permanecen `NOT_RUN`.

Las ediciones de expected requieren volver a leer su fuente y decisión; después
se actualizan deliberadamente `case_count` y SHA-256 del fichero en el manifest.
No hay modo «update golden» desde producto. El hash detecta cambios accidentales,
no sustituye revisión humana ni certifica una fuente remota por sí solo.

La [matriz de señales](../../../../../docs/analysis/engineer/timings/data-matrix.md)
enumera los bloqueos LMU que heredan los casos de cada regla y la entrada de T1.
Este corpus es el punto de partida revisado; no afirma cobertura exhaustiva de
todas las combinaciones ni cierra T1–T8.
