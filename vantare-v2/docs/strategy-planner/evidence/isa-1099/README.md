# ISA-1099 — T11 uso por familia

## T11a — preparación pura de uso por familia

Base b70673d063e203ecb664c20e6074f7c964cdbbc4, rama
vantareapp/isa-1099-recorded-family-use, C:/tmp/vantare-isa1099/vantare-v2.
Objetivo por número/inicio/fin/base; familia existente, original y motivo,
rechazo de ambigüedad/cambio de interpretación. Colecciones separadas, timestamps
normalizados para identidad. Inclusión rechaza vueltas incompletas y cobertura
unknown/missing/invalid/unsupported; stale conserva su marca para el consumidor.
La prueba detectó que presenceWeight(unknown)>0 no sirve como gate de integridad;
se corrigió el nuevo validador sin cambiar pesos/criterios heredados. Focales y
vet Analysis PASS, build de base y global Go -p1 PASS. Instalada exclusivamente
la resolución congelada/offline existente, sin dependencias nuevas.
Dos paths lógicos/test. Todavía sin custodia, derivación ni UI de familias.
Evolución documentada en sdd/family-corrections-evolution.md. Siguiente T11b:
conjunto sin solapes y vista de usos, después custodia mixta existente.
Pendientes T11e: identidad completa en consumidores y tráfico como exclusión
blanda separada. #1096 queda congelada en b70673d0 con 3478 tests frontend PASS.
Sin Wails, banco real/heldout, precisión ni revisión visual >9 nuevos.
Sin push, PR, CI remota, merge, promoción o release.

## T11b — conjunto y vista efectiva

Conjunto canónico de hasta 256 decisiones, sin duplicados/solapes en una familia;
permite decisiones independientes de familias sobre una vuelta. La vista efectiva
vuelve a resolver número/inicio/fin tras reanálisis escalar y revalida integridad
antes de devolver el conjunto completo; no publica una parte ni reancla objetivos.
Copias separadas de vueltas, tiempos, etiquetas y usos. Repetir número de vuelta
no confunde el selector de esta operación. El digest temporal se valida una vez
por conjunto; no se rehace por cada solicitud. Incluso vacío exige base válida.
Focales (incluyendo RED/GREEN del conjunto vacío), vet Analysis y global Go -p1
PASS; frontend intacto, build base heredado de T11a. Tres paths lógica/test.
Siguiente T11c representación mixta/custodia compatible. Sin UI/derivados/custodia
familiar productivos aún. Sin Wails, precisión, push/PR/CI remota o promoción.

## T11c — representación mixta compatible

Snapshot con familias usa analysis.observation-snapshot.v2; scalar-only mantiene
wire/digest v1 (golden previo intacto). Se validan razón/base/target/preparado,
solapes y presupuesto conjunto. Decoder del mismo documento de custodia verifica
v1→v2→v1 sin reescribir IDs; command digest v2 incluye decisiones familiares.
Validación de representación almacenada no concede autoridad ni demuestra
cobertura: la aplicación vuelve a validar contra el modelo autorizado original.
Focales, global Go -p1 y vet app/Analysis/Strategy/cmd del alcance PASS.
Cinco paths declarados. Frontend intacto, sin build adicional ni banco físico.
Siguiente T11d: guardar/resolver mixtos bajo el lease existente, guard legacy
contra borrado de familias y revalidación de objetivos tras escalares antes de
persistir. Hasta ese corte no hay guardado mixto ni API/UI familiar habilitados.
Sin push/PR/CI remota, Wails, precisión, nota visual, merge o promoción.

## T11d — guardado y resolución mixtos

SaveObservations usa el mismo saveValidated/lease/backup. Paquete interno de
Analysis incluye muestras y validez original/efectiva; se comprueba la aplicación
completa a los objetivos efectivos antes de persistir. Una petición legacy que
omite familias no puede borrarlas; replay histórico exacto conserva prioridad.
ResolveObservationsCommand identifica todo el payload y comparte lease sin
escritura nueva (salvo recuperación existente). Conjunto explícitamente vacío
restaura sin borrar revisiones previas. Pruebas incluyen reinicio, motivo cambiado,
conjunto omitido, target cambiado, cancelación, lease y confirmación perdida en
backup/primary. Focales, global Go -p1 y vet de alcance PASS; dos paths lógica/test.
Todavía no API/UI familiar ni derivación mixta pública. Siguiente T11e1 vista y
derivación de snapshot mixto, T11e2 identidad temporal en consumidores y T11e3
inclusión explícita frente a exclusiones blandas. Sin cambiar umbrales físicos.
Sin Wails/precision/visual >9/push/PR/CI remota/merge/promoción.

## T11e1 — derivación de conjunto mixto

Vista valida escalares contra páginas originales y familias contra la validez
original; conserva el digest mixto completo. Derivación reanaliza las páginas
corregidas y aplica después las decisiones familiares con objetivos exactos y
puertas duras. No modifica originales ni acepta aplicación parcial. Compatibilidad
escalar v1 intacta. Pruebas de manipulación, cobertura ausente, copia separada,
versión desconocida y exclusión de ritmo sin cambiar otras familias PASS.
Global Go -p1 y vet app/Analysis/Strategy/cmd PASS; cinco paths lógica/test.
Sigue T11e2: identidad temporal completa en el consumidor de curvas, después
T11e3 inclusión explícita frente a tráfico. API/UI mixta aún no habilitadas.
Sin frontend modificado, Wails, banco real, precisión, nota visual, push/PR/CI
remota, merge o promoción. Logs locales isa1099-t11e1-go-all.log y -vet.log.

## T11e2 — identidad temporal en consumo y curvas

El resultado por vuelta transporta inicio/fin por valor. Curvas e índices de
stint usan número+instantes UTC; identidades ausentes, cambiadas o ambiguas no
contribuyen. Un duplicado tampoco aumenta la edad de las vueltas posteriores.
RED/GREEN de número repetido y duplicado que desplazaba edades; pruebas de
intervalo cambiado, legado sin tiempos y equivalencia de zona horaria. Versiones
de cómputo consumption-pace.v3 y derived-curves.v2; no reescritura del histórico.
Cuatro paths lógica/test, sin umbrales nuevos ni frontend modificado.
Global Go -p1 y vet de alcance finales PASS (logs isa1099-t11e2-final-*).
Siguiente T11e3a procedencia de decisión efectiva; luego filtros blandos y
separación de SavingCost, aún dependiente de ritmo/consumo. Sin API/UI familiar,
Wails, precisión, revisión visual, push/PR/CI remota, merge o promoción.

## T11e3a — procedencia de decisiones efectivas

LapFamilyUse efectivo recibe el ID de su corrección validada. Originales y
precondiciones no llevan esa marca; se rechaza usar una vista ya corregida como
original. Campo omitido en wire histórico y snapshots preparados: golden v1 y
custodia mixta conservan sus IDs. Pruebas de procedencia por familia, restauración
vacía y precondición corregida PASS. Cinco paths; frontend intacto.
Global Go -p1 y vet app/Analysis/Strategy/cmd PASS. Sigue T11e3b consumo/ritmo para ahorro independientes y filtros blandos; después T11e2b compatibilidad de ritmo antiguo también con identidad exacta. Sin API/UI familiar, Wails, precisión, nota visual ni push/PR/CI remota/merge/promoción.
