# Strategy nativo — ISA-1427 / referencia #1393

El crate `vantare-strategy` pertenece al workspace `native/` y Hub lo importa
como dependencia. Contiene documentos, preparación manual, importación de
borradores, edición y cálculo sin runtime ni GPUI.
El cálculo con presupuesto numérico tiene un orden determinista; un deadline
real puede interrumpirlo en distintos puntos según la carga del equipo.

## Documento

Lee documentos `strategy.v2` con esquema `2.0.0` y `2.1.0`. Los documentos
nuevos usan `2.1.0`, que permite reglas de evento con evidencia, ventanas de
parada, límites de piloto y compuestos permitidos por clima. La lectura de ambas versiones conserva los bytes originales; no se convierte
el esquema al abrirlo. `2.0.0` no admite el campo `rules`.

`2.2.0` (E5a, VANTA-138) añade `acceptedPlan` a cada estrategia: el plan aceptado
con la copia de las entradas del cálculo. El documento solo sube a `2.2.0` al
aceptar el primer plan y nunca baja; un lector anterior lo trata como versión más
nueva y lo protege. Este crate solo acepta la versión y conserva los bytes
(`Document::remove` quita la clave sin reescribir el resto); la validación del
plan aceptado la hace el host (`hub-host`).

**Compatibilidad hacia delante del plan guardado.** El host lee `acceptedPlan` con
`deny_unknown_fields` y con todos los campos obligatorios, y las paradas
(`StrategyPit`) forman parte de él. Por tanto E5f–E5h **no pueden añadir campos
obligatorios** a lo guardado sin romper los archivos 2.2.0 ya escritos. Regla
decidida: todo campo nuevo del plan guardado se añade con `#[serde(default)]` (los
archivos antiguos siguen abriendo) y **no se sube a 2.3.0**. A cambio, un Hub de E5a
que lea un archivo escrito por uno posterior lo abrirá protegido por el campo
desconocido, que es lo que haría con una versión más nueva y es aceptable en
nightly. Una subida a 2.3.0 solo se justifica si hace falta que un lector anterior
lo rechace por versión, o si un campo nuevo no puede tener valor por defecto. Cada
campo nuevo debe además entrar en el validador de `hub-web` (`exact(...)` de la
parada) en el mismo cambio del contrato.

Las ediciones validan el documento completo antes de guardar y conservan los
bytes de campos no editados. Las seis entradas de
`testdata/oracle/document-rules.json` se generaron contra Go en
`bd28ed40dd7d2079de7bcfeb9ee9f9d06950cd52`.

## Solver

El solver cubre Fuel, VE, formación, reservas, servicio de paradas, ventanas
obligatorias y degradación. La búsqueda extendida incorpora proyecciones de
Analysis, curvas de ritmo, inventario físico y compuestos, perfiles y límites
de piloto, clima y escenarios, ahorro y peso del combustible, y carreras por
duración. Valida las combinaciones admitidas; no convierte dimensiones
incompatibles en escalares ni inventa evidencia para datos ausentes.

`solve_v2_cancellable` devuelve el modelo `strategy.solver.v2`, coste y
certificado de optimalidad. `proven` y `no_solution` se refieren al ámbito y
la discretización efectiva del certificado. Al vencer presupuesto o deadline
devuelve el mejor plan completo encontrado con `not_proven`, si existe;
una cancelación o un input inválido falla sin publicar resultado. Los helpers de compatibilidad escalar solo se compilan en los tests del
oráculo; no forman parte de la API de producción. `solve_v2` se conserva por
los benchmarks y tests de #1458. Las APIs de escenarios se conservan: el
solver extendido queda fuera de este recorrido.
La búsqueda extendida conserva motivos y prueba explícitos cuando no puede
certificar optimalidad; no se promete un óptimo para todo input aceptado.

Los fixtures escalares y extendidos de `testdata/oracle/` proceden de Go en
`bd28ed40dd7d2079de7bcfeb9ee9f9d06950cd52`. `manifest.json` y
`solver-manifest.json`, verificados por `tests/oracle_hashes.rs`, fijan entradas,
resultados y hashes de fuentes. Los tests comparan decisiones, evaluación,
recursos, replay y los campos de certificado cubiertos por cada fixture.
Esto demuestra paridad del corpus congelado, no de todos los inputs posibles
ni del wire completo en cada caso.

### Cantidades fijadas por parada (#2690)

`solve_v2_fixed`, `solve_greedy_fallback_fixed` y
`recalculate_edited_plan_fixed` reciben una lista `&[FixedStop]`: la posición es
el número de parada (0 = primera) y cada entrada puede fijar combustible,
energía o nada. Lo fijado es una restricción: en esa parada solo se prueba esa
cantidad, y un plan solo vale si tiene todas las paradas fijadas. Una lista
vacía o con todo en automático es el mismo cálculo que sin lista; lo vigilan
las huellas de `tests/unfixed_fingerprints.rs`, que no se regeneran salvo
cambio de resultado intencionado y revisado.

- Una cantidad fijada tiene que ser múltiplo del paso efectivo de la rejilla
  (`manual_service_grid`), con la tolerancia de la unidad interna del cálculo
  (una millonésima): `check_fixed_stops` lo comprueba con la misma regla que la
  búsqueda.
- Errores de entrada: una cantidad que el cálculo no acepta falla con
  `invalid_input: fixedStops[n].fuelLiters …` (o `.vePercent`), como el resto
  de validaciones del solver. Fijar una parada que no existe en el calendario
  editado falla con `fixed_stop_outside_edited_schedule`, sin prefijo, como los
  demás errores de `recalculate_edited_plan` (`invalid_edited_stint_schedule`,
  `edited_stop_count_conflicts_with_event_rules`…).
- `certificate.fixed_stops` cuenta las paradas con algo fijado y no sale en el
  JSON cuando es 0. Con un valor mayor, `proven` significa «el plan más rápido
  entre los que respetan lo fijado» y `no_solution`, «ninguno lo respeta», en la
  rejilla efectiva. La búsqueda solo certifica si recorrió entero el espacio
  restringido: el atajo de una sola decisión, el atajo certificado de una parada
  y la semilla de carreras por tiempo se apagan con algo fijado, y la poda
  extendida solo compara estados con las mismas paradas hechas y, mientras
  queden paradas fijadas por delante, con los mismos niveles. Con
  incertidumbre de consumo (riesgo) y algo fijado, el alcance es
  `validated_discrete_input`, no el de planes viables en el caso adverso.
- El respaldo lleva por recurso el nivel mínimo y máximo alcanzable y hace que
  las paradas automáticas compensen a una fijada que carga poco. Con el
  calendario fijo de «Ajustar paradas» es exacto. Si no hay plan por culpa de
  lo fijado se niega con `GreedyRefusal::FixedAmountUnreachable { stop }`: la
  primera parada fijada con la que deja de haberlo. `FixedRecalculation`
  lo publica como `unreachable_stop`, también cuando la búsqueda demuestra que
  no hay plan. Con pasos finos (búsqueda extendida) no se señala parada.
- «Cabe» se mide con el depósito lleno en la salida, que es como simula la
  búsqueda; el plan publicado informa después de la salida mínima (#2692).
- Los neumáticos no se fijan: el modelo reinicia el desgaste en cada tramo
  aunque no se cambien ruedas (#2691).

### Límites de lo que se puede fijar (#2692, #2709)

`application::fixed_stop_bounds(input, edited, fixed)` devuelve, para cada
parada del calendario editado y por recurso (`StopBounds`):

- `arrival`: los niveles con los que se puede llegar a la parada;
- `service`: el mínimo y el máximo de la rejilla que se puede fijar en ella para
  que ese recurso tenga plan, con lo fijado en las demás paradas (no depende de
  lo fijado en la propia parada). `None`: ninguna cantidad vale;
- `problem`: qué le pasa a la cantidad fijada hoy si queda fuera
  (`BelowMin { fail_lap }`, `AboveMax`, `NoRange`). `fail_lap` es la primera
  vuelta que no se completa aun cargando lo máximo en las paradas automáticas;
  `None`, cuando se llega a meta sin la reserva.

Usa el modelo de `recalculate_edited_plan_fixed` (salida con el depósito lleno,
misma rejilla y tolerancia, mismas comprobaciones de entrada y mismos textos de
error) y los niveles alcanzables del respaldo. Con el calendario fijo,
combustible y energía no dependen uno del otro, así que los límites son por
recurso: los de combustible no ven un problema de energía, de ruedas o de
reglas. Hay plan exactamente cuando el calendario lo tiene sin fijar nada y
ninguna cantidad fijada lleva `problem`; `tests/fixed_bounds.rs` lo comprueba
cantidad a cantidad contra el recálculo. Con pasos finos (búsqueda extendida)
devuelve `Ok(None)`. No hay límites con calendario libre: dependerían del
calendario que eligiera la búsqueda.

El `replay` añade `ReplayResult.failure` cuando el motivo es
`resource_exhausted`: tramo, primera vuelta de carrera que no se puede completar
y recurso (combustible, energía o ruedas). No forma parte del JSON del replay.

## Application y Hub

La API de aplicación valida entradas manuales, exige una fuente abierta antes
de calcular y conserva la validación de revisiones exactas en documentos
importados. Se retiran Automático, Datos y las correcciones heredadas de Go:
no tenían productor nativo ni alimentaban al cálculo. El futuro contrato con
Análisis se sigue en #1980, dependiente de VANTA-133 / #1974.

`ManualEvent` conserva las entradas como texto hasta confirmarlas. Sus campos
tienen nombre; la lectura, creación, confirmación y preparación del cálculo
se validan en este crate. Una edición fallida deja el documento intacto, sin
rellenar números ausentes. Se conservan los rechazos del formulario anterior.

Los documentos con proyección siguen abriéndose y guardándose sin modificar
sus bytes; el cálculo manual conserva su rechazo explícito. La validación
completa 2.0/2.1 permanece. `recalculate_edited_plan` valida y reproduce
stints/paradas editados.

`import_last_draft` lee el último borrador del repositorio heredado v1/v2 tras
verificar su hash completo. No crea directorios, migra, escribe ni borra ese
fichero. La lectura se acota a 64 MiB+1 y rechaza entradas superiores a 64 MiB;
el documento importado no puede superar 12 MiB. Solo se consulta si no existe
`strategy-v2.json`: el Hub valida el documento nativo y crea ese fichero con
el guardado común observado. Los borradores antiguos `strategy.v1` no se
convierten a `strategy.v2`.
Si ya existe el documento principal, prevalece incluso sobre un borrador
heredado más reciente: ese borrador no se importa y el repositorio queda intacto.

Hub utiliza un único fichero para guardar. Si está dañado, la apertura común
conserva una copia durable antes de permitir su recuperación; el guardado sigue
comprobando los bytes observados. Las versiones no compatibles y los fallos al
archivar quedan protegidos. Ya no hay pestaña Revisiones ni «Guardar borrador».

Hub usa el camino manual y presenta resultados probados, parciales o sin solución.
Este crate no proporciona adquisición de Analysis, catálogos firmados ni su
transporte, y no certifica por sí solo la integración visual/operativa de Hub.
La UI v5 Go completa queda fuera de este corte.

El anfitrión del Hub deja fijar a mano el combustible y la energía de cada
parada del calendario editado (`strategy.setStopService` y
`strategy.clearStopServices`, #2709). Lo fijado vive en la sesión, no en el
documento: solo llega a él dentro de un plan aceptado, como `pinned` por parada.
El anfitrión no copia ninguna regla del cálculo: valida cada cantidad con
`check_fixed_stops`, enseña los límites de `fixed_stop_bounds` y recalcula con
`recalculate_edited_plan_fixed`, que le dice la parada culpable cuando no hay
plan. Un cálculo nuevo es libre y descarta lo fijado.

## Verificación

Desde `native/strategy`:

```powershell
cargo fmt -p vantare-strategy --check
cargo clippy --workspace --all-targets -j 4 -- -D warnings
cargo test -p vantare-strategy -j 4
```

Desde `native`:

```powershell
cargo fmt -p vantare-strategy --check
cargo clippy --workspace --all-targets -j 4 -- -D warnings
cargo test --workspace -j 4
```

Los goldens son fixtures de contratos Go, no telemetría real ni evidencia de
rendimiento o paridad visual/operativa en Windows.
