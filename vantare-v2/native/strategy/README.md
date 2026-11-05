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

## Application y Hub

La API de aplicación valida entradas manuales, exige una fuente abierta antes
de calcular y conserva la validación de revisiones exactas en documentos
importados. Se retiran Automático, Datos y las correcciones heredadas de Go:
no tenían productor nativo ni alimentaban al cálculo. El futuro contrato con
Análisis se sigue en #1980, dependiente de VANTA-133 / #1974.

`ManualEvent` conserva las entradas como texto hasta confirmarlas. Sus campos
tienen nombre; la lectura, creación, confirmación y preparación del cálculo
se validan en este crate. Una edición fallida deja el documento intacto, sin
rellenar números ausentes ni descartar dimensiones que el formulario no admite.

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
