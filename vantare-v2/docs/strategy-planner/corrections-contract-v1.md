# Contrato propuesto v1 — correcciones de observaciones

> **Estado y secuencia actuales (ISA-1091):** consultar el [SDD integral](sdd/README.md).
> La mecánica escalar y la conexión de revisiones ya tienen implementación local;
> las marcas originales de propuesta y siguientes pasos se conservan como historia.
> El SDD distingue las operaciones pendientes y evita reabrir aprobaciones satisfechas.


Estado: contrato global propuesto en #1033, con ejecución posterior autorizada por Isaac. La mecánica escalar, custodia, vista efectiva y recálculo están implementados localmente; #1078 añade referencias estructuradas de proyección. El servicio autorizado y su cliente nativo están implementados localmente; operaciones restantes, vinculación a planes y UI siguen pendientes. Las secciones finales detallan los cortes ejecutados sobre la base documental `8a2d8ff4`.
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

Los dos últimos campos formalizan la interpretación base. El productor de
#1067 los deriva del modelo autorizado; no se fabrican en React. El
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
3. `set_stint_boundary` y `remove_stint_boundary`: mover un límite existente a
   un final de vuelta acreditado o retirarlo de la vista efectiva; mantener orden,
   cobertura y ausencia de solapes imposibles. Ambas comparten validación y nunca
   crean límites nuevos. El [contrato T13](sdd/stint-boundary-corrections-t13.md)
   fija la representación y compatibilidad.
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

## Productor de base C1b — #1067

`CorrectionSourceFromModel` obtiene la referencia de un modelo autorizado y de
`LapValidityAnalysis` marcado por su productor real con sesión/versión. La lectura
de resultados antiguos no completa esa marca: se requiere reanálisis. El digest
usa `TemporalSegmentsV1` validado y dominio `analysis.correction-segmentation.v1`.
No implica almacenamiento de correcciones ni cambio de calidad/relojes.

## Snapshot escalar C1c — #1073

PrepareSampleCorrectionSnapshot valida cada escalar con C1a contra una base
común suministrada por Analysis. Rechaza duplicados de canal/columna/índice,
no publica resultados parciales y ordena por canal, columna e índice numérico.
El conjunto vacío es explícito y está ligado a la base. SnapshotID usa dominio
analysis.sample-snapshot.v1 y JSON de Base+Corrections ordenadas; no es revisión
persistida, comando ni autorización. Máximo256correcciones por snapshot, presupuesto
de recursos independiente de umbrales físicos. No retiene colecciones de entrada.
Las restantes operaciones y custodia siguen pendientes.

## Custodia escalar C2 — #1074

CorrectionStore persiste snapshots escalares bajo corrections/<baseDigest>.json,
con lease nativo por base, cabeza e historial en un documento. Load por ID exacto
no sustituye revisiones perdidas; ID vacío pide expresamente la cabeza actual.
Save compara expectedRevision y registra commandId/payload; reintentos antiguos
informan revisión original y cabeza actual. Restaurar un snapshot crea revisión
nueva. Máximo256revisiones y8MiB/documento, sin truncado automático.
La representación almacenada se revalida con hashes y estructura; esto no sustituye
la autorización de fuente que debe comprobar el servicio antes de cada operación.
Fallos ambiguos durante escritura devuelven ErrCorrectionCommitUncertain.
No hay bridge ni aplicación a derivados todavía. Las operaciones no escalares
siguen pendientes y no se aceptan en este formato de custodia v1.

## Vista efectiva escalar C3 — #1075

ApplySampleCorrectionSnapshot consume canales/páginas ya autorizados de una base
exacta. Todas las correcciones deben encontrar un objetivo único con original
coincidente; falta de cobertura no produce aplicación parcial. Devuelve páginas
sin alias, Base, SnapshotID y correcciones validadas. Calidad y relojes originales
se conservan. No lee archivos, no concede autorización ni actualiza derivados.
El lector llamante debe suministrar las páginas necesarias para el conjunto;
los índices no se reinterpretan como posiciones de página.

## Derivación escalar — #1077

DeriveCorrectedSession aplica la vista efectiva y vuelve a ejecutar las funciones
vigentes de validez, consumo/ritmo, curvas y boxes. Comprueba sesión/parser/schema
respecto a la base. No introduce umbrales ni cambia el catálogo observado.
CorrectedSessionDerivations conserva Base y SnapshotID; el adaptador futuro debe
vincularlos a la revisión duradera antes de publicar/guardar un plan.
No ofrece selección por familia ni otras operaciones del contrato todavía.

## Referencias de proyección — #1078

Extensión aditiva de StrategyInputProjectionV2: `sourceRevisions` contiene
`sessionId`, `baseDigest`, `revisionId` y `snapshotId`. Los tres digests son
SHA-256 hexadecimal minúsculo; la base incorpora contenido e interpretación.
Ausencia mantiene el contrato legado. Si se suministran referencias, deben
cubrir exactamente todas las sesiones, sin duplicados, IDs cruzados ni mezcla
parcial. El productor conserva copias de los identificadores recibidos.

Esta validación comprueba estructura y cobertura; no demuestra autorización ni
correspondencia con los derivados. Analysis debe vincular la revisión duradera
real antes de publicar; ese servicio y el consumidor TS siguen pendientes.
El editor registrado deberá exigir referencias completas para guardar planes;
no puede interpretar la ausencia legada como una revisión actual.

## Unión con revisión guardada — #1079

CorrectionStore.DeriveProjectionSession exige revisionId explícito, carga la
revisión exacta y deriva directamente su snapshot. Devuelve las familias y
AnalysisRevisionRef juntos; no permite atribuir una revisión a derivados
recibidos por separado. La revisión base explícita también se admite.
Ausencia o ID perdido devuelve error, aunque exista una cabeza más reciente.
Comprueba cancelación antes y después del recálculo. No autoriza fuentes:
el servicio llamante debe validar la fuente vigente y aportar páginas originales.

El cliente TS ahora conserva y valida sourceRevisions: cobertura completa,
digests minúsculos y pertenencia única. La ausencia legada se conserva; un array
vacío o referencia inválida se rechaza. Aún faltan comandos de servicio,
selección persistida de revisiones, operaciones restantes y UI productiva.

## Preparación en el servicio autorizado — #1080

TelemetryAnalysisService.PrepareCorrections recibe únicamente el ID opaco de
una sesión abierta con consentimiento. Comprueba licencia y lifecycle, conserva
el artefacto autorizado original y usa el parser existente para inspección y
lectura paginada. Analysis produce SourceAnalysisRef desde la validez original;
el servicio devuelve esa base y su revisión vacía estable, nunca páginas ni paths.

ReadCorrectionInput tiene una frontera de parser independiente del formato.
Lee la unión de canales requeridos por las familias; no inventa relojes ni
canales ausentes. Rechaza páginas desordenadas y supera límites con error, sin
devolver una derivación truncada. El backend serializa estas preparaciones y
fija presupuestos de 1.000.000 muestras, 1.000.000 valores y 16 MiB de texto
contabilizado (nombres de columnas y escalares). Son límites de recursos;
no son umbrales físicos ni mediciones de consumo real de RAM.

Un error de lector retira la sesión y conserva su limpieza pendiente si falla;
la cuota o falta de datos de vuelta conserva el lector para inspección.
Cancelación y revocación de licencia no entregan una preparación utilizable.
Guardar/cargar/proyectar desde el servicio, ampliar canales por objetivos de
corrección, selección de planes y UI siguen pendientes.

## Comandos autorizados — #1081

SaveCorrections, LoadCorrection y ProjectCorrection reutilizan la preparación
autorizada manteniendo lifecycle y bloqueo de sesión durante el comando.
También los reintentos verifican licencia, lector y base antes de consultar
idempotencia. El backend resuelve originales en las páginas requeridas por las
familias; objetivos fuera de ese conjunto se rechazan, sin lecturas arbitrarias.

La composición nativa configura una raíz persistente `data/telemetry-analysis`
hermana de `data/strategy`; la custodia usa su subcarpeta `corrections` y nunca
staging o el directorio LMU. Sin raíz válida no se guarda silenciosamente en otro
lugar. Conflicto, cambio de base, revisión perdida, commit incierto y error de
custodia tienen mensajes públicos sanitizados, sin paths internos.

ProjectCorrection requiere ID explícito y produce una proyección de una sesión.
La clasificación de elegibilidad se vuelve a obtener desde las vueltas completas
recalculadas, no de los metadatos iniciales del catálogo. Perder tiempos utilizables
no deja familias anunciadas como utilizables. Esto no introduce filtros físicos.
LoadCorrection permite ID vacío solo para consultar la cabeza; esa consulta no
convierte "última" en selección reproducible. UI, selección persistida de varias
sesiones/revisiones y operaciones restantes siguen pendientes.

## Cliente nativo — #1082

El cliente TypeScript usa los nueve métodos públicos de TelemetryAnalysisService
por su nombre Wails completo, contrastado con el registro Go y el runtime
instalado. Valida las respuestas antes de entregarlas a consumidores: escalares,
presencia/calidad, paginación, base, revisiones y referencias de proyección.
El cero omitido por JSON Go conserva su significado según el tipo; ausencia
sigue siendo ausencia. No se promociona calidad al corregir un valor.

La apertura recibe consentimiento explícito. La cancelación se propaga al
runtime y también descarta respuestas tardías. No hay reintento automático ni
conversión de errores en listas vacías. Cancelar guardar no implica rollback:
el consumidor debe conservar el commandId para recuperar un resultado incierto.
Proyectar exige revisión exacta; cargar sin ID consulta explícitamente la cabeza.
La validación de digests en TS es estructural, no sustituye la custodia Go.

La UI productiva, selección persistida y agregación de varias sesiones siguen
pendientes. Por instrucción de Isaac del 2026-09-09, no se abre la app ni se
generan builds en este corte. La aceptación visual y Wails continúa pendiente.

## Selección fijada en documento — #1084

SessionSelection puede conservar una AnalysisRevisionRef completa (sesión,
baseDigest, revisionId y snapshotId). Es identidad, no autorización. Documentos
anteriores sin referencias mantienen su representación; si una sesión incluida
fija revisión, todas las incluidas deben fijarla. Una sesión excluida puede
conservar su revisión sin participar. Toda referencia presente se valida.

Una proyección guardada en PlanningInputs debe coincidir exactamente con las
referencias incluidas, además de la combinación y sesiones ya comprobadas.
No se cambia la selección consultando la cabeza de Analysis. Serializar y
restaurar el documento conserva las referencias.

GetEventPlanningInputs rechaza explícitamente una selección fijada mientras
su proveedor sea el catálogo sin revisiones: no ignora el pin ni publica datos
originales como si fueran los corregidos. Conectar el productor autorizado,
el contrato TS y la UI corresponde a cortes posteriores. No se declara C7
completo ni recomputación operativa. Se conserva la restricción sin app/builds.

## Selección en el cliente e invalidación — #1085

El cliente de eventos conserva el mismo campo revision y valida identidad,
cobertura incluida y concordancia de referencias/combinación con la proyección.
Reutiliza el validador de referencias; no calcula hashes ni interpreta archivos.
El helper existente de selección usa ese tipo sin descartar la referencia al
consultar o persistir sesiones.

Al cambiar combinación, inclusión o referencia, la edición del evento retira
su proyección anterior y conserva overrides. Tras confirmar el guardado elimina
las entradas derivadas y su estado en la caché de ese evento. Una selección
idéntica mantiene sus derivados; un guardado fallido deja la vista anterior
intacta. No elimina revisiones Analysis ni modifica planes aceptados.

Este corte no conecta el productor de revisiones ni añade pantallas. El rechazo
de recomputación fijada del corte #1084 permanece explícito. Sin app/builds.

## Proyección conjunta autorizada — #1086

StrategyRevisionCatalog conserva el catálogo observado y ofrece proyección de
referencias exactas desde sesiones abiertas de TelemetryAnalysisService. El
adapter no es un servicio Wails ni una autorización de lectura. Resuelve handles
propios por identidad inmutable del artefacto, rechaza fuentes duplicadas/ausentes
y revalida base, revisión y snapshot mediante el mismo camino escalar autorizado.
Combina derivaciones con ProduceStrategyInputProjectionV2, nunca estadísticas
ya agregadas. Revalida cancelación/licencia antes de entregar y no devuelve
resultados parciales ante errores.

Rige el presupuesto existente de cuatro sesiones abiertas; no trunca una
selección superior. Fuente cerrada requiere reapertura explícita. No se añade
aún reapertura automática o persistencia de autorizaciones. La conexión al
consumidor Strategy y main es el corte siguiente. La prueba cambia la cabeza
guardada y confirma que la referencia anterior continúa siendo la utilizada.

Isaac vuelve a autorizar PC/build/app el 2026-09-09; se levanta la restricción
anterior para las comprobaciones. LMU permanece intacto.

## Consumo de referencias fijadas — #1087

GetEventPlanningInputs usa el productor autorizado para selecciones con
referencias completas. Comprueba el contrato de proyección, combinación y
cada referencia exacta; no sustituye por cabeza actual ni catálogo observado.
Ausencia del proveedor y errores de fuente/revisión se propagan sin resultado
parcial. Una respuesta posterior a cancelación también se rechaza. La consulta
conserva ajustes y no escribe al repositorio. Documentos sin referencias siguen
la vía anterior. Main conecta el adaptador después de construir Analysis y su
frontera de licencia. No cambia autorización ni reapertura de archivos.

## Sesiones registradas desde Orbit — #1088

El panel productivo de Sesiones usa el cliente nativo para descubrimiento y
apertura explícita, preparación y proyección de la revisión base. Si la fuente
ya tiene referencia guardada, reabre esa revisión exacta, no la cabeza actual.
La confirmación sustituye las sesiones incluidas y persiste las referencias;
una respuesta de consulta nunca crea por sí sola una selección.

El panel mantiene handles entre pestañas del editor. Salir de ese editor/evento
libera las sesiones; volver a calcular después exige reapertura explícita.
Cancelar Open conserva la respuesta para poder liberar el recurso adquirido;
no se pierde el handle descartando simplemente una promesa tardía. No hay
reintentos automáticos ni error de limpieza oculto. El máximo sigue siendo
cuatro sesiones. Los ajustes manuales existentes se conservan.

Este panel usa el kit productivo Orbit; no es todavía el porte completo de las
pantallas A4 aprobadas. El banco opt-in usa DuckDB reales con lector nativo,
licencia controlada de test y originales verificados por hash: no certifica
login real Wails, exactitud física ni optimalidad de una carrera.

## Validación pura de límites de stint — #1212

`PrepareStintBoundaryCorrectionSet` prepara `set_stint_boundary` y
`remove_stint_boundary` contra una base original exacta. Sólo acepta finales de
vuelta `lap_event` posteriores a la fila inicial y con cobertura acreditada.
Ordena el conjunto de forma canónica y lo rechaza entero ante targets ambiguos,
duplicados, colisiones o inversiones. No excluye una vuelta por estar invalidada
si su intervalo temporal es real; conserva stints de una vuelta y fronteras
terminales originales.

La implementación reutiliza errores, cuota y geometría de cobertura existentes,
devuelve copias separadas y no persiste, aplica, recalcula ni autoriza datos.
## Custodia de límites de stint — #1214

`analysis.mixed-snapshot.v5` conserva límites junto a valores, familias,
clasificación e identidad canónica. Sin límites activos se mantienen exactos
los bytes y digests v1-v4. El store usa la misma identidad de comando para Save
y Resolve, impide que un llamador que desconoce el grupo lo borre, permite su
retirada mediante un conjunto vacío explícito y conserva las revisiones v5 al
restaurar una representación anterior. Reapertura y replay verifican la forma
persistida sin atribuirle autoridad sobre la fuente ni reconstruir telemetría
ausente.

Vista efectiva, derivados, servicio y UI continúan en T13d-e según el
[contrato T13](sdd/stint-boundary-corrections-t13.md).
