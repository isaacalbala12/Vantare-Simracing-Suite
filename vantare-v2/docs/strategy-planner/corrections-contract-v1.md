# Contrato propuesto v1 — correcciones de observaciones

Estado: contrato global propuesto en #1033. C1a implementa solo identidad y preparación escalar en #1066; custodia/revisiones/otras operaciones siguen pendientes. Base del contrato `8a2d8ff4`.
Owner: Telemetry Analysis. Superficie de edición: Strategy.
[Decisión de custodia](../adr/0010-analysis-observation-corrections.md).

## Cuatro conceptos distintos

| Concepto | Autoridad | Efecto |
|---|---|---|
| Observación | Fuente autorizada + parser | Valor, presencia/calidad, unidad y tiempo originales inmutables. |
| Corrección | Analysis | Cambio explícito con motivo en una revisión de esa base de análisis. |
| Selección del plan | Strategy | Sesiones, revisiones y familias elegidas para ese plan. No cambia la sesión. |
| Incertidumbre | Derivación/solver | Cobertura, muestra, límites y procedencia. Una corrección no la convierte en certeza. |

## Base y revisión

`SourceAnalysisRef` propuesto contiene:

- `sessionId`, `contentSha256` y `sizeBytes` del artefacto autorizado;
- `parserId`, `parserVersion`, `schemaFingerprint` del modelo normalizado;
- `analysisVersion` y `segmentationDigest` de la interpretación base.

Los dos últimos campos formalizan una revisión que el modelo actual aún no
publica completa. El productor deberá emitirla: no se fabrican en React. El
locator opaco sirve para localizar la autorización, nunca como identidad de
contenido ni como permiso. Otros formatos deberán emitir la misma información
a través de sus adapters; v1 solo exige LMU/DuckDB.

Una `CorrectionRevision` contiene `contractVersion`, referencia de base,
`revisionId`, `parentRevisionId`, `commandId`, `createdAt`, `localAuthorId`, motivo
de revisión y lista completa de correcciones activas. `revisionId` es un digest
producido en Go de la representación versionada; sirve para identidad/integridad,
no para otorgar autorización. Los timestamps/ID locales no afirman identidad civil.
La representación canónica y límites son parte del primer microcorte, con vectores
reproducibles; JS no produce hashes ni envía rutas arbitrarias de almacenamiento.

Sin correcciones existe una revisión base explícita y estable ligada a esa fuente
y análisis. Un plan siempre referencia una revisión concreta, incluida esa base;
“usar la última” no es una revisión reproducible.

## Objetivos y operaciones

Cada corrección tiene ID, `target`, operación, motivo y precondición del original.
El selector incorpora el digest de segmentación base. No se aplican selectores
sobre una segmentación modificada previamente por el orden de un array.

| Ámbito | Selector mínimo |
|---|---|
| Sesión | Referencia de base exacta. |
| Stint | Límites inicial/final y causa originales de `TemporalSegmentsV1`, identificados sin ambigüedad en la base. |
| Vuelta | Número más límites originales y referencia de base; el número solo no identifica una vuelta. |
| Tramo | Intervalo `[inicio, fin)` en un eje demostrado, con muestras/canales que lo anclan. |
| Valor concreto | Canal, columna e índice de muestra canónica de la base; tipo, unidad, presencia y valor esperado. |

Los índices no son números de página. Si una frecuencia/origen temporal no permite
alinear un tramo con una vuelta, se rechaza ese selector como `unresolved_target`;
no se interpola ni se supone una frecuencia. Un límite incierto permanece incierto
hasta que exista evidencia o una corrección explícita válida del límite.

Operaciones cerradas:

1. `set_family_use`: incluir/excluir el objetivo para familias enumeradas existentes.
   El valor previo se toma de `LapFamilyUse`; no se introduce una familia genérica
   paralela llamada `pace`. Ritmo usa la familia vigente `combined_stint_pace_curve`
   y se invalidan sus derivados dependientes.
2. `set_classification`: corregir un campo de clasificación permitido y compatible
   con su tipo; conservar original, corregido y motivo. No cambia hash, autorización,
   origen temporal ni parser. Cambios de coche/circuito requieren identidad canónica
   explícita y dejan obsoleta la selección de combinación del plan afectado.
3. `set_stint_boundary`: reemplazar un límite y su causa con anclaje verificable;
   mantener orden temporal, cobertura y ausencia de solapes imposibles.
4. `set_sample_value`: sustituir un escalar concreto con tipo/unidad compatibles,
   finito cuando sea numérico. Conservar original y marca corregida; no crear muestras
   ausentes, cambiar unidades a ciegas ni editar series mediante fórmulas masivas.

Una inclusión manual no elimina fallos duros de integridad. Si una familia carece
de señales/relojes/unidades necesarios, permanece no calculable y explica la causa.
Corregir no equivale a declarar una medición física verificada.

Dos correcciones activas que afecten al mismo campo/familia y objetivos solapados
se rechazan como `overlapping_corrections`. Para sustituir una decisión previa, el
usuario crea una revisión cuyo snapshot retira la anterior y añade la nueva.
No hay precedencia implícita por tamaño del ámbito, orden de envío o fecha.

## Guardar, deshacer y conflictos

- Guardar exige autorización de lectura vigente, base exacta, `expectedRevision`,
  `commandId`, motivo no vacío y objetivos originales verificables.
- Analysis valida todo el snapshot antes de persistir; operación atómica y sin
  resultado parcial publicado. La escritura devuelve la revisión duradera efectiva.
- Bajo lease exclusivo: comprobar primero un reintento idempotente ya registrado;
  mismo commandId/payload devuelve la misma revisión, distinto payload da conflicto.
  Después comparar cabeza con expectedRevision y validar antes de escribir.
  La respuesta distingue revisión guardada y cabeza actual: un reintento de un
  comando antiguo no afirma que su revisión siga siendo la más reciente.
- Deshacer crea una revisión nueva que reproduce el conjunto activo anterior.
  El historial conserva la corrección retirada; no se modifica el original ni una
  revisión que un plan ya referenció. Rehacer es otra revisión con precondición.
- Un borrador de Strategy que adopta una revisión nueva queda desactualizado hasta
  recalcular. Un plan aceptado sigue apuntando a la revisión anterior.
- Si falla el guardado del plan tras persistir la corrección, la revisión se conserva.
  Reintentar el plan utiliza ese ID; no crea otra corrección ni exige rollback de fuente.

## Derivación y proyección

Analysis aplica correcciones sobre una vista de las páginas/segmentación base;
el catálogo observado y los archivos permanecen intactos. Se recalculan únicamente
familias afectadas y dependientes mediante las funciones existentes. La clave de
cualquier derivado incluye fuente, parser/análisis, revisión de corrección y versión
de criterio. No se reutiliza un derivado anterior como si estuviera recalculado.

La proyección distingue `observed`, `corrected`, `derived` y `estimated`. El vínculo
con revisión debe viajar estructurado; un texto `sourceId` no sustituye el conjunto
reproducible de entradas. Toda familia declara cobertura, muestra y razones; los
resultados parciales no se rellenan con cero o referencias externas automáticas.

Fuel y energía virtual siguen separados. La estimación de ritmo entre pilotos
pertenece a la configuración del plan, no a la corrección de la sesión de otro piloto.
Los criterios numéricos y tamaños mínimos se resuelven en #1030, no en este contrato.

## Cambio, pérdida y recuperación

| Estado | Comportamiento |
|---|---|
| Hash/tamaño distintos | `source_changed`; nueva base, sin aplicar correcciones anteriores. Proponer revisión manual de migración, nunca automática. |
| Parser/schema/análisis distintos | `interpretation_changed`; no reutilizar índices/límites ni derivados sin revalidación explícita. |
| Original movido, contenido idéntico | Relocalizar mediante autorización y verificación de contenido; conservar revisión. |
| Original ausente, copia verificada disponible | Recalcular desde esa copia bajo la misma identidad y autorización. |
| Original y copia ausentes | Consultar resultado guardado; `source_missing` al pedir recomputación. |
| Objetivo ambiguo/precondición distinta | `unresolved_target` o `original_mismatch`; ninguna escritura parcial. |
| Cabeza concurrente distinta | `revision_conflict`; conservar borrador y devolver cabeza actual para revisar. |
| Archivo de correcciones corrupto | Backup validado, cuarentena y aviso de recuperación; si falta la revisión solicitada, `revision_unavailable`. |
| Escritura incierta o cuota superada | No anunciar éxito ni truncar historial; reabrir/reintentar con commandId o liberar espacio mediante acción explícita. |

## Ejemplos contractuales

Son ejemplos simbólicos de operaciones, no telemetría real ni resultados medidos.

### Excluir una vuelta de ritmo conservando Fuel/VE

La fuente A tiene hash H, parser P, segmentación S y revisión base R0. La vuelta
12 está identificada por sus dos límites originales en S. Se guarda R1, padre R0,
con `set_family_use(included=false)` para `combined_stint_pace_curve` y motivo
“incidente revisado en esta vuelta”. No cambia `fuel_consumption` ni
`virtual_energy_consumption`: conservarán su uso anterior si sus señales son válidas.

Ritmo y dependientes se recalculan sin esa vuelta; Fuel/VE usan sus propias reglas
sobre las observaciones intactas. No se afirma que cualquier incidente permita
conservar todos los consumos: el requisito es independencia por familia.

### Deshacer

Con cabeza R1, el comando deshacer espera R1 y crea R2 con el conjunto activo de
R0. R1 sigue disponible para un plan ya aceptado; el borrador que adopte R2 deberá
recalcular. Otro comando que aún espere R0 recibe conflicto, sin borrar R1/R2.

### Fuente cambiada

El mismo locator pasa de contenido H a H2. Reimportar genera otra base; R1 no se
aplica a H2 aunque coincidan nombre y número de vuelta. Un plan que usa H/R1 sigue
consultable; solo se recalcula si H continúa disponible y verificable.

### Valor o límite corregido

Se selecciona un escalar exacto del canal C, columna K, índice I de H/P, con su
valor original leído. La propuesta sustituye ese escalar y aporta motivo; una
precondición distinta rechaza el comando. Mover un límite de stint usa anclajes
verificables de S y genera una nueva segmentación derivada de la revisión; no
renumera silenciosamente los selectores de otras correcciones activas.

## Aceptación de la futura implementación

Tests observables: identidad/autorización, fuente/interpretación cambiada,
selectores ambiguos, solapes, independencia Fuel/VE/ritmo, deshacer/rehacer,
conflictos entre escritores, reintento idempotente, corrupción/backup, cancelación,
originales intactos y revisión de plan inmutable. Corpus y filtros requieren su
aceptación empírica independiente; tests contractuales no la sustituyen.

## Corte C1a implementado — #1066

Tipos/validación puros en `internal/telemetryanalysis/corrections.go` y tests vecinos.
El resultado es `PreparedSampleCorrection`, nunca una revisión guardada. Calidad
original preservada; la corrección no concede autorización ni elimina un fallo duro.
Límites y vector canónico en `evidence/isa-1066/README.md`. El resto del contrato
mantiene su alcance propuesto y requiere cortes separados antes de conectarse.
