# T13 — correcciones de límites de stint registrados

Estado: contrato T13a cerrado localmente en #1211. Implementación pendiente.
Depende de la segmentación temporal corregida por #1208 y de la evidencia T19a
de #1030.

## Decisión mínima

Analysis admite dos operaciones explícitas sobre un límite que ya existe en la
segmentación original:

- `set_stint_boundary`: mueve el límite a otro final de vuelta acreditado y
  fija explícitamente su causa;
- `remove_stint_boundary`: retira el límite de la vista efectiva; si existen
  stints a ambos lados, los fusiona.

Las dos operaciones comparten un tipo, un constructor y un validador de conjunto.
No crean límites nuevos, no editan el DuckDB y no introducen otro segmentador.
Retirar la corrección en una revisión posterior restaura el límite original.

## Representación

```text
StintBoundaryCorrection {
  operation: set_stint_boundary | remove_stint_boundary
  base: SourceAnalysisRef
  target: { stintNumber, timestamp, cause }
  expected: StintBoundary original completo
  replacement?: { anchor: { lapNumber, timestamp }, cause }
  reason: texto no vacío
}
```

`replacement` es obligatorio para `set` y debe faltar para `remove`. Un `set`
que conserve ancla y causa se rechaza como operación inerte. El target
se resuelve siempre contra `TemporalSegmentsV1.StintBoundaries` de la base
original. La tupla literal y `expected` deben coincidir con un único límite. No
se usa el ordinal del array como identidad ni se encadenan selectores contra el
resultado de otra corrección.

La causa elegida no pasa a ser un hecho observado. El límite efectivo lleva
procedencia `corrected`; el original completo y su incertidumbre permanecen en
`expected`. Los rangos de una causa original no prueban una causa nueva. El
motivo de usuario explica la decisión, no prueba un incidente; T13d cerrará la
confianza que debe publicar la vista efectiva.

## Anclas y cobertura

En v1, un reemplazo sólo acepta un `LapBoundary` único de la misma base con
`source=lap_event`. Aunque #1208 alinea resets mediante `GPS Time`, este corte no
acepta `lap_dist_reset`, `reconciled`, muestras continuas ni timestamps libres.
Es una restricción deliberada para que cada edición apunte a evidencia directa
del evento `Lap`.

La primera fila `Lap` representa el estado al comenzar la grabación y no es un
ancla elegible. El ancla debe corresponder a una transición posterior y al final
de una vuelta registrada; `source=lap_event` por sí solo no basta.

El timestamp del ancla debe estar dentro de un segmento de cobertura usando
intervalo cerrado (`segment.start <= anchor <= segment.end`). Los gaps son
intervalos abiertos entre segmentos (`gap.start < anchor < gap.end`): sus
extremos pueden coincidir con un evento acreditado y no se rechazan por sí solos.
La pertenencia se decide sobre el reloj de eventos ya alineado; no se infiere por
posición de muestra.

`remove` no necesita ancla nueva. Requiere la misma base y el target original
único.

## Validación atómica del conjunto

El conjunto completo se valida sin depender del orden recibido:

1. misma base exacta para todas las operaciones;
2. máximo compartido de 256 operaciones entre escalares, usos por familia,
   clasificaciones y límites;
3. un solo comando activo por target original;
4. reemplazos en finales de vuelta distintos, estrictamente ordenados y sin
   colisionar con límites originales que permanecen activos;
5. el conjunto no introduce empates ni intervalos interiores sin vueltas. Un
   límite terminal observado que permanezca intacto no exige inventar vueltas
   posteriores; un reemplazo no puede crear un stint vacío dentro de la ventana
   registrada y un stint de una vuelta sí es válido;
6. la segmentación efectiva satisface el contrato temporal;
7. la entrada original y los arrays entregados por el llamador permanecen
   intactos.

La UI advertirá que modificar límites no modifica las visitas a boxes. Una
discrepancia no invalida por sí sola la corrección y T13 no intenta reconciliar
boxes de nuevo.

Errores observables reutilizan los tipos existentes cuando expresan lo mismo:
`ErrCorrectionTarget` para target/ancla no resoluble,
`ErrCorrectionPrecondition` para original distinto,
`ErrOverlappingCorrections` para target duplicado y `ErrCorrectionValue` para
operación, causa, reloj, cobertura u orden inválidos. T13b no añade una taxonomía
paralela; la capa de aplicación traduce estos errores al vocabulario público ya
existente.

## Original, digest y compatibilidad

`SourceAnalysisRef.SegmentationDigest` identifica la interpretación original y
no cambia al aplicar una corrección. La vista efectiva y su snapshot/revisión sí
tienen identidad nueva. Los selectores activos siguen resolviéndose contra la
base original.

T13b sólo añade tipos y validación pura; no modifica snapshots v1-v4 ni hashes.
T13c añade el grupo de límites a una representación v5. Si no hay operaciones de
límites, el constructor delega a la ruta anterior y conserva exactamente la
representación y los digests v1-v4. No se migran targets entre bases o versiones
de análisis. Load, replay y restore de revisiones antiguas siguen funcionando.

Un snapshot v5 conserva juntos escalares, usos por familia, clasificaciones,
identidad canónica y límites. Igual que los grupos actuales, `nil` significa que
el llamador desconoce el grupo y no puede borrarlo silenciosamente; un conjunto
vacío explícito lo retira. Save y Resolve comparten el mismo digest de comando.

## Derivación y frontera con Strategy

T13 modifica la segmentación observada usada por Analysis. Al aplicar una
revisión, recalcula asignación de stint y los derivados que dependan de ella,
incluidas curvas y estrategia observada; las vueltas y sus límites no cambian.
No basta con devolver un array de fronteras parcheado.

T16 pertenece al plan de carrera: fija o arrastra un límite de un plan propuesto
y crea un constraint para recalcular el solver. No corrige la telemetría ni crea
una revisión de Analysis. Ambas superficies pueden mostrar stints, pero sus
comandos, autoridad e historial son distintos.

## Cortes de implementación

### T13b — tipos y validación pura

Hasta cuatro paths nuevos:

- `internal/telemetryanalysis/stint_corrections.go`
- `internal/telemetryanalysis/stint_corrections_test.go`
- `internal/telemetryanalysis/stint_correction_set.go`
- `internal/telemetryanalysis/stint_correction_set_test.go`

RED mínimo: mover válido; eliminar y fusionar; target obsoleto o ambiguo; primera
fila `Lap` o ancla sin `lap_event`; ancla fuera de cobertura; dos operaciones
sobre el mismo target; colisión entre reemplazos; frontera terminal intacta;
resultado independiente del orden; original intacto.

### T13c — snapshot y custodia

Extender el snapshot mixto, digest de comando y store existentes. Probar bytes
v1-v4 exactos sin límites, snapshot v5 mixto, cuota global, replay, Resolve,
Restore, grupo desconocido y commit incierto. No cambiar la versión del documento
de custodia si su envoltorio puede seguir leyendo snapshots versionados.

### T13d — vista y derivados

Aplicar el conjunto validado a una copia de la segmentación y ejecutar las
derivaciones existentes una sola vez. Probar que mover sólo cambia dependientes,
eliminar fusiona, restaurar reproduce la revisión anterior y la fuente permanece
intacta.

Los targets se validan contra la base original. Si rederivar otras correcciones
altera o elimina la identidad del límite seleccionado, el conjunto mixto se
rechaza atómicamente con el error existente de precondición u objetivo. No se
traslada la corrección por ordinal ni por proximidad temporal.

### T13e — servicio, cliente y UI avanzada

Exponer las dos operaciones mediante el servicio autorizado y el cliente nativo.
La UI selecciona un límite original, ofrece finales de vuelta permitidos y causa,
explica rechazos y exige motivo. Guardar y adoptar la revisión siguen siendo
acciones separadas. La prueba visual final pertenece a T18 y Wails a T22.

## Rollback

El rollback funcional es una revisión nueva con el conjunto anterior. El rollback
de cada corte es revertir su commit acotado. Ninguna ruta reescribe fuentes,
revisiones previas o planes ya aceptados.
