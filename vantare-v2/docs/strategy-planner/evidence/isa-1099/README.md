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

## T11e3b — independencia de ahorro y filtros blandos

Consumo produce observaciones de combustible/tiempo propias de SavingCost tras
los mismos gates físicos; excluir Fuel o ritmo de sus agregados no las elimina.
El colector compartido selecciona la familia, sin otro lector ni resegmentación.
Curvas/ahorro conservan exclusión automática de tráfico salvo inclusión explícita
validada de esa familia. No se alteran umbrales del protocolo A/B. Versiones de
cómputo consumption-pace.v4 y derived-curves.v3; histórico no reescrito.
RED/GREEN de exclusión de ritmo/combustible que anulaba ahorro; controles por
familia, tráfico automático/ritmo/ahorro/ambos, cobertura inválida y señal ausente.
Analysis completo, global Go -p1 y vet de alcance PASS; cuatro paths lógica/test.
Sin frontend modificado ni Wails/precisión/visual >9/push/PR/CI remota/promoción.
Sigue T11e2b: la compatibilidad de ritmo legado también exige identidad exacta;
luego T11f API/inspección y contrato TS. No habilitar UI familiar antes.

## T11e2b — compatibilidad sin unión por número

La reparación de ritmo legado exige la misma identidad temporal y unicidad de
ambas colecciones que las curvas. No reconstruye límites ausentes; conserva
esos datos como no disponibles y no modifica el modelo persistido. RED/GREEN:
número repetido, intervalos ausentes/cambiados y duplicados de validez/consumo.
Se conserva el caso válido con intervalos de fixture explícitos. Tres paths;
helper común de identidad, sin otro criterio ni dependencia. Analysis completo,
global Go -p1 y vet de alcance PASS. Continúa T11f1 comandos nativos mixtos.
Sin frontend, Wails, precisión, visual >9, push/PR/CI remota/merge/promoción.

## T11f1 — comandos nativos mixtos

SaveCorrections/ResolveCorrectionCommand aceptan familyUses completo: nil legacy,
[] retirada explícita. Con escalares+familias se reanaliza la vista bajo la misma
autorización y bloqueo; el store verifica objetivos antes de escribir. Reusa
withCorrectionInput y la custodia existente. Pruebas nativas de save/replay/resolve,
payload alterado, guard legacy, restauración, proyección de revisión anterior,
target movido por escalar y revocación de permiso PASS. Global Go -p1 y vet de
alcance PASS; dos paths. Son pruebas con lector controlado, no DuckDB físico.
Sigue T11f2 inspección paginada original/efectivo/capacidades para Datos; después
contrato TS/controlador/UI. Sin Wails/precisión/visual >9/push/PR/CI/promoción.

## T11f2 — inspección de vueltas por revisión exacta

Consulta nativa autorizada, máximo 50 filas, base/snapshot/revisión exactos y
cabeza actual separada. Devuelve original, efectivo, objetivo temporal y capacidad
por familia. Inclusión exige integridad original y efectiva; ambigüedad y límites
cambiados no ofrecen edición. Límite de stint sólo si registrado, con causa y
calidad conservadas; no inventa inicio y rechaza empate ambiguo. Copias separadas,
incluida confianza del límite. Reanálisis sólo con escalares, sin calcular curvas
para inspeccionar. Pruebas de paginación, integridad, originales, revisión previa,
metadatos, permisos y objetivos ambiguos PASS. Global Go -p1 y vet de alcance PASS.
Cuatro nuevos paths. Frontend aún no consume la consulta; siguiente T11f3 contrato
mixto TS y T11f4 consulta TS. Sin Wails/precisión/visual >9/push/PR/CI/promoción.

## Gate frontend T11f3 — sincronización del test de guardado

Primer global: 441/442 archivos, 3488/3489 tests. Falló la aserción inmediata de
liberación del suspend guard después de aparecer guardado (Workflow.test.tsx:37).
Focal aislado pasó 2/2. La guarda se libera con useEffect, separado del commit
visible. Se conserva la aserción y se espera con waitFor, sin aumentar timeout ni
cambiar producto. Focal conjunto 63/63 PASS. Global se repetirá; el run anterior
permanece fallido. Contrato mixto TS todavía sin commit/cierre; tipos/lint/build
PASS. Sin Wails ni publicación. Un único path test en este commit separado.

## T11f3 — contrato mixto de interfaz

Snapshot v2 conserva familias completas; v1 escalar sigue válido. Validación de
precondiciones, resultado, presupuesto conjunto, solapes e identidad temporal con
nanosegundos (sin Date truncada). Save/Resolve mantienen [] explícito y rechazan
respuestas con otra selección o motivo familiar. Focales 61, tipos/lint/build PASS.
Primer global falló por sincronización del test de guardado: corrección separada
5db52e32. Repetición final 442 archivos/3489 tests PASS (511.30s), warnings heredados
de teardown happy-dom; no se oculta el primer run. Cuatro paths TS; controlador
familiar/UI pendientes. En paralelo sólo dos paths Go de inspección, T11f2b,
añaden elegibilidad automática/efectiva: focal/vet PASS, global Go en curso.
Sin Wails/precisión/visual >9/push/PR/CI remota/merge/promoción. Continúa T11f4.

## T11f2b — elegibilidad visible según el consumidor

La inspección separa automaticIncluded/effectiveIncluded de la mera bandera
LapFamilyUse. Reusa reglas de curvas/ahorro para reflejar tráfico y la inclusión
explícita por familia. Son reglas de uso, no presencia de señales ni garantía de
métrica calculable. Efectivo ausente si la identidad no es única en ambos modelos.
Pruebas focales, global Go -p1 y vet de alcance PASS. Dos paths Go independientes
del gate frontend. T11f3 quedó en 928e40b7 con global 3489 PASS; T11f4 consulta TS
está en trabajo (73 focales y tipos PASS, lint/build pendientes al registrar esto).
Sin Wails/precisión/visual >9/push/PR/CI remota/merge/promoción.

## T11f4 — consulta tipada de vueltas en frontend

Cliente añade únicamente InspectCorrectionLaps al conjunto cerrado. Valida
paginación (máximo 50), base/revisión exactas, identidades original/efectiva,
capacidades y reglas, y metadatos del límite registrado. Ausencia efectiva no se
convierte en false; preserva cero y calidad unknown. Sin adopción automática de
cabeza ni redondeo de identidad temporal. 73 focales, tipos/lint/build PASS.
Global frontend más reciente: T11f3, 442/3489 PASS; este corte aditivo se verifica
con sus focales y tipos de todo el frontend, sin anunciar otro global. Cuatro
paths; UI/controlador familiar todavía pendientes. Continúa T11g1 helpers de
conjunto completo y T11g2 controlador, luego montaje. Sin Wails/precisión/visual
>9/push/PR/CI remota/merge/promoción.

## T11g1 — propuestas completas y selección exacta

Helpers conservan decisiones familiares al editar escalares, permiten reemplazar
una familia o volver a automático y consultan vueltas de la revisión fijada.
Identidad temporal exacta, capacidades nativas y cuota conjunta 256 verificadas.
21 tests focales, typecheck, lint y build PASS (warning heredado de chunks).
Último global frontend: T11f3 442/3489 PASS; no repetido en este corte.
Continúa T11g2: estado mixto del controlador y restauración explícita de familias
históricas (incluido []), antes de habilitar edición familiar visible.
Sin Wails, precisión, revisión visual independiente, push, PR ni promoción.

## T11g2 — controlador de revisiones mixtas

Conserva familias y escalares al cargar, guardar, descartar, resolver o restaurar.
Restaurar un ancestro escalar envía [] explícito; las páginas quedan fijadas a la
revisión consultada y se invalidan al guardar. Cabeza nueva no se adopta.
24 focales, typecheck, lint y build PASS. Sin nuevo global (último T11f3 3489).
Continúa T11g3 montaje de vueltas y familias en Datos, muestras como vista avanzada.
Sin Wails/precisión/visual independiente/push/PR/CI remota/merge/promoción.

## T11g3 — Datos por vueltas y familia

Montaje productivo: fuente/revisión exacta, límites de stint observados (sin
inventar inicio), páginas de 25 vueltas y cinco familias. Distingue regla automática,
revisión guardada y propuesta; motivo obligatorio, cobertura dura no anulable,
formulario pendiente bloquea cambio de fuente/vista. Muestras en vista avanzada.
Mantiene A4/Orbit y tokens actuales; cotejada referencia pass-03-advanced, todavía
sin certificar paridad mediante captura poblada ni revisión independiente.
23 focales finales, tipos/build y lint finales PASS. Primer focal falló al clicar
vista avanzada durante carga; test ahora espera la fuente lista. Lint detectó nombre
useLabel interpretado como hook y export utilitario incompatible con HMR; ambos
corregidos sin excepciones. Global conjunto pendiente tras integrar Revisiones.
Roadmap actualizado en cuatro idiomas y JSON regenerado con origin/nightly vigente
(a9b8dd36 por integración ajena Redline); su ventana de entregas se desplaza como
salida del generador. No rebase ni integración de nuestro stack.
Cinco paths de lógica/test/CSS; traducciones y docs. Sin Wails/precisión/visual>9,
push/PR/CI remota/merge/promoción. Continúa T11g4 historial familiar.

## T11g4 — historial familiar y gate frontend conjunto

Revisiones muestra también familias, intervalo de vuelta, valores declarados y
motivo. Una revisión sólo familiar deja de aparecer como original sin correcciones.
Aclara que el uso declarado no sustituye reglas ni disponibilidad de señales.
Regresión RED documentada; 29 focales GREEN. Global 443 archivos/3515 tests PASS
(222.73s), lint/build PASS; warnings heredados happy-dom y chunks. Sin Wails todavía.
Dos paths UI/test más traducciones. T11h prepara únicamente dos paths de test Go
para ampliar el banco real opt-in, pendiente compilar/ejecutar y con staging separado.
Sin push/PR/CI remota/merge/promoción; base local no cambia por integración ajena.

## T11h — persistencia familiar sobre carreras reales

Banco opt-in ampliado en dos paths de test. Imola PASS 13.19s: vuelta 3;
Monza PASS 15.42s: vuelta 63. Selección desde inspector nativo, guardado familiar,
Resolve/replay exactos, proyección fijada, guard legacy, restauración [] y reapertura
de la revisión mixta anterior verificados. Otras familias permanecen iguales.
SHA256 originales antes/después: Imola 35438326ecddd6ab660ed3aad70b076a73e3290236c0292f30657594c38c1eb0;
Monza 08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538.
Reader/runtime y archivos reales; authorizer de licencia controlado explícito.
No son pruebas de precisión física ni Wails/login. Sin archivos reservados.
Go global -p1 y vet de alcance PASS; frontend conjunto T11g4 443/3515 PASS.
Continúa contraste Wails diagnóstico aislado del recorrido actual, aprovechando
configuración heredada ya presente (sólo comprobada presencia, no leída/imprimida).
No .env, credenciales copiadas, LMU, otras instancias ni promoción/publicación.

## T11i — contraste nativo no disponible (ERROR_INVALID_STATE sin causa determinada)

Tres lanzamientos de la build diagnóstica (PID13816 oculto, PID30236 oculto con
-profile absoluto, -http 127.0.0.1:39262, CDP 9491, -live=false, perfil/datos
propios; PID31800 visible del orquestador con mismos puertos/flags/directorios
y entorno con VANTARE_*) mueren en el mismo punto: backend OK (hub, HTTP
39262), WebView2 Environment creado, pero CreateCoreWebView2Controller falla
con 8007139F ERROR_INVALID_STATE y el proceso termina sin escuchar CDP. La
hipótesis de la ventana oculta NO quedó corroborada (el visible falló igual);
la instancia ajena #1072 no es control equivalente. Causa sin determinar, sin
atribuir a código de producto: cero cambios de código. Recorrido Imola +
capturas no ejecutados. Imola autorizado intacto (97513472 bytes, SHA256
...38c1eb0). Logs: bin/data/logs/vantare.log, C:/tmp/isa1099-t11i-std*.log,
C:/tmp/isa1099-t11i-visible-stderr.log. Sin push/PR/CI/promoción; LMU intacto.
