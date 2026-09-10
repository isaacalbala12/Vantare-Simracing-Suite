# Handoff vivo — Strategy Planner

## Estado vigente — T12j1 aceptado; J2 cerrado por root

Isaac confirma que planes y documentación siguen a cargo del orquestador.
Muse Spark 1.3 Contributor vía OpenCode, xhigh, ejecuta sólo código/tests
asignados, sin subdelegación ni cambios de planes, docs o issue. Un ejecutor
por worktree; revisión personal de diff y evidencia antes de aceptar.
Rama `vantareapp/isa-1104-recorded-classification`, base exacta
`7f757135445439851180fc503da45f7eb9e557e7`; último código revisado
`f6fcc09dadec655d2bde0d87993e4c8d3ba5bc25`. A–G3 y Ha/Hb/Hc/Hc2/Hd/I/J1
aceptados localmente tras revisión personal y gates. J1 puro ocupa sus
cuatro paths declarados, +744/-16; revisión, focales, global/vet completos.
Root cierra J2 en el microplan: cinco paths de snapshot/decoder/identidad
y tests; primero vectores v3 previos al cambio. Sin store ni montaje nativo.

G3 ya conecta la biblioteca con el mismo editor Datos/Revisiones, también
sin combinación ni repositorio: apertura autorizada y referencia exacta,
inspección separada de selección, correcciones locales sin Project espurio,
pin del borrador por referencia completa y vuelta al asistente sin recrearlo.
Los formularios y comandos inciertos bloquean cambios de fuente/salida; las
pestañas conservan formularios. Auditor i18n Hd: EXIT0, paridad OK,
ausentes 0 y huérfanas 0; queda cerrado el estado intermedio de Hc.
Última suite global Hd: 444 archivos/3680 PASS, 224.02s EXIT0;
build 1086 módulos/1.56s EXIT0, typecheck/lint/auditor EXIT0.
Último Go global J1: 126 paquetes ok/cero FAIL EXIT0 y vet de alcance EXIT0.
I banco nativo real: Imola14.03s y Monza19.73s PASS/EXIT0, originales intactos.
Authorizer controlado; no prueba Wails/login, paridad visual ni precisión.

Ha ya consulta el original y comparte normalización; Hb aporta los doce textos
en cuatro idiomas; Hc conecta clasificación en Datos y Hc2 conserva la vista
al avanzar revisión. Hd ya muestra historial, con plan precisado por root en
`docs/strategy-planner/sdd/classification-corrections-t12.md`: Ha consulta del
original/normalización reutilizadas, Hb textos y Hc Datos A4 (aceptados);
Hc2 continuidad e historial Hd aceptados. Cada corte declara 2–4 paths. No generar correcciones
ficticias para comprobar disponibilidad ni duplicar validación en React.
I banco real opt-in aceptado. Root cerró resolución canónica
en §5/ADR0011 antes de su código, y declara J1 de cuatro paths. No aceptar
un hash de texto del cliente como catálogo autorizado. T13–T24 siguen en
la secuencia SDD; J2 ya está cerrado por root antes de asignarlo al ejecutor.

Sin cambio de alcance público ni entrega completa: `plan.md` intacto en
estos cortes internos; se actualizará con la entrega en el mismo PR.
Sin push, PR, CI remota, integración, promoción o release. No se reabre
app/LMU; gate Wails sigue pendiente por ERROR_INVALID_STATE de causa no
demostrada. Contraste real y paridad visual >9/10 siguen aparte.

Las entradas siguientes son evidencia histórica; el estado vigente es éste.

## T12j1 — preparación pura revisada y aceptada

Cuatro paths classification_corrections/identity y sus tests, sin tocar
snapshot/store/catalog/service/UI. Cuatro campos y referencia opcional
omitida para clientes anteriores; target nativo recibido, no autorización.
Root leyó todos los diffs y añadió exigencias: target ya recortado incluso
con campo original ausente, reutilizar el helper de disponibilidad,
preservar precedencia de base en constructor anterior, campo corregido
no verificable y límites de1024bytes multibyte/precondición RAW.
Corregidos; ninguna aserción anterior eliminada.

Focal canonical R1 0.029s y R2 0.068s EXIT0; clasificación R1 0.159s EXIT0.
R2 incorpora coberturas adicionales de test, sin nuevo cambio productivo;
gofmt/diff limpios. Logs frontend/.tmp/isa1104-t12j1-*.log leídos por root.
Son fixtures unitarios, no contraste autorizado contra catálogo ni UI.
Tras review sólo se corrigieron dos comentarios obsoletos. Global Go:
126 paquetes ok/cero FAIL/EXIT0; vet app, telemetryanalysis/..., strategy/...
y cmd/vantare: sin salida/EXIT0. Root contó el log global y leyó vet;
ningún log sobrescrito. Commit f6fcc09dadec655d2bde0d87993e4c8d3ba5bc25,
worker idle antes del commit. Sin banco, frontend, app/LMU o Wails repetidos.
Son reglas puras; aún no se consulta un catálogo ni se guarda identidad v4.

J2 queda definido por root en el microplan antes de asignación: snapshot v4
con target separado, compatibilidad byte a byte v1/v2/v3 y digest de comando
sin consulta de catálogo. La lectura usa el target persistido, no autoriza
fuentes. Primero fijar vectores v3 con producción J1 intacta. Cinco paths;
el store/callback y montaje se declaran en cortes posteriores.

## T12i — banco revisado y contrastado con dos fuentes reales

Commit `6c568769cb966e7230b1771fd64457a6118838c1`: sólo
integration_test.go (+2/-1) y nuevo classification_test.go (344 líneas),
bajo internal/app/strategy_recorded_real_*. Helper antes del familiar,
retorna handle reabierto y cabeza restaurada, sin nuevo reader/dato/fixture.
Root revisó todo el código y devolvió: restore debía ser v1; elegibilidad
de observed_strategy necesitaba el gate preliminar de vuelta completa,
no Included; lista íntegra de familias; clima proyectado recortado frente
a precondición RAW; referencia completa antes de omitir auditoría;
Load/Project históricos completos después de reabrir. Corregido.

Focal R3 real: app 0.178s EXIT0, Analysis 0.184s EXIT0; banco sin opt-in
SKIP explícito/0.045s EXIT0, que NO prueba el banco. gofmt/diff limpios.
Logs crudos frontend/.tmp/isa1104-t12i-{focal-app-r3,focal-analysis-r3,
focal-bank-r3,gofmt-r3}.log leídos por root.

El primer focal.log es resumen reconstruido, no log primario. Root comprobó
las ejecuciones originales en mensajes OpenCode msg_08d1f808c001H4FQ8uFVl5PEM2
y msg_08d1fcf9400150MYeDp9YucBir: app0.191s/Analysis0.172s EXIT0, banco SKIP.
R2 tuvo un fallo de invocación (TestClassification no reconocido) con EXIT0
inválido. Root leyó ese contenido inicial de 114 bytes; después el mismo
focal-app-r2.log fue sobrescrito con ejecuciones reales SKIP/app0.175s.
El error queda en la salida de herramienta del orquestador, NO conservado
en ese archivo como afirmó el ejecutor. No se reconstruye como log crudo.
R3 es la verificación válida del código actual. No RED de producto.

Tras review root asignó gates sin más cambios: global Go126 paquetes
ok/cero FAIL EXIT0, vet de alcance EXIT0. Imola PASS14.03s y Monza
PASS19.73s/EXIT0. Ambos abren98canales, prueban tres revisiones de
clasificación/historial exacto y después el helper familiar existente
(vueltas3 y63), y cierran con hash original idéntico. Logs global/vet/
imola/monza leídos íntegros o contados por root; detalle en
`evidence/isa-1104/README.md`. Worker idle antes de commit.
Originalhash/ausencia de señal y Wails son afirmaciones distintas.
Sin app/LMU, reserva, export, push/PR/CI remota o promoción. Siguiente J1.

## T12hd — historial revisado y gate completo

Commit `e583fe30925d7e8bd162fcc7a7f324509289e204`, dos paths
Revisions/tests, +146/-4. Original, confirmado y motivo
proceden únicamente del snapshot consultado; Ha sólo decide disponibilidad
y privacidad. Cuenta tres grupos, muestra procedencia manual y conserva
la distinción de etiqueta climática frente a señales físicas.

Root leyó el diff completo y exigió un v2 real además de v1, IDs únicos
de fixture y tres casos de privacidad con valores/motivo guardados presentes.
El ejecutor los corrigió sin más cambios productivos. Focal inicial
62 PASS/5.69s EXIT0; focal-r2 64 PASS/5.96s EXIT0. Typecheck/lint EXIT0,
lint-r2 del test EXIT0 y auditor --list-r2 EXIT0, paridad/ausentes/huérfanas
correctos. Typecheck excluye tests y no se repitió tras cambios sólo de test.
Sin RED de producto para esta nueva presentación. Logs bajo
`frontend/.tmp/isa1104-t12hd-*.log`, leídos personalmente; diff limpio.

Tras esa revisión root asignó sólo gates: suite completa 444 archivos/
3680 PASS, 224.02s EXIT0; build 1086 módulos/1.56s EXIT0. Logs
frontend-all/build leídos personalmente. Permanecen avisos ya registrados
de AbortError al cerrar happy-dom y chunks mayores de 500 kB; no se ocultan
ni se atribuyen a una corrección nueva. Worker idle antes del commit.
No Go nuevo ni banco, app/LMU, Wails o nota visual. Siguiente I, sólo los
dos paths de test declarados; primero diff/focal, luego global/vet y
bancos nombrados tras revisión personal. No abrir reserva ni exportar.

## T12hc2 — vista de Datos conservada al guardar

Commit `24e647505f892e92da379fcf9842f57140f6adba`, cuatro paths
Workflow/Data y tests, +90/-32. Sólo la vista elegida vive en Workflow y
pasa como props obligatorias; Data conserva sus formularios y revisionKey
mantiene su reinicio. Sin persistencia, estado duplicado ni inferencia del
snapshot. Host de tests mínimo con props tipadas y reenviadas completas.

Regresión previa real: 1 fallo/7 PASS, 4.76s EXIT1; después de Save confirmado
faltaba la fila de clasificación porque Data volvía a vueltas. Focal primero
57 PASS/5.99s; tras simplificar el host por revisión personal, focal-r2
57 PASS/5.73s EXIT0. Typecheck producto/lint y lint-r2 EXIT0; auditor --list
EXIT1 sólo manual pendiente de Hd, paridad OK/ausentes 0. Diff limpio.
Root leyó diffs/logs; ninguna aserción previa de Data cambió. El test nuevo
recorre entrada/inspección/edición/Save con DTOs válidos, valor confirmado y
sin Project/ejecución de comandos Strategy. No es prueba nativa.
Logs `frontend/.tmp/isa1104-t12hc2-{red,focal,focal-r2,typecheck,lint,lint-r2,audit-list}.log`
dentro de esta app. Worker idle antes de commit.

Siguiente Hd en dos paths, con guarda de privacidad por helper Ha y valores
del snapshot consultado, motivo/manual/clima. Después de revisión personal,
auditor sin huérfanas y suite/build completos. I ya precisado por root en
dos paths de test app, encadenamiento seguro de handles con banco familiar
y comparación física completa sobre Imola/Monza. §5 canónico aún pendiente.
No Go/banco/global frontend/build nuevos aquí; últimos G3a/G3f conservados.
Sin app/LMU, Wails ni entrega remota.

## T12hc — clasificación en Datos A4 y revisión personal

Commit `55d79e81b520e1df746e6d1bb12068791a1e4d7a`, cuatro paths
(Classification y test nuevos, Data y test), +481/-11. Tercera vista junto
a vueltas/muestras, original RAW/confirmado/propuesta separados, permiso
por campo con causa, formulario único, motivo/retirada explícitos y contador
de tres grupos; usa helpers y controlador existentes, sin CSS ni otro lector.

Root revisó los cuatro diffs y corrigió: lista inicialmente añadida debajo
de otras vistas; pruebas de retirada sin decisión guardada y contador sin
tres grupos; fixtures v3 vacíos/páginas discordantes; selectores de tests;
clima sin valor inicial; radios y outputs de tabla afectados por CSS de input.
Resultado: elección con select existente, celdas de texto, clima prellenado
y pruebas reales del hook para Save mixto y retirada confirmada. Parsers
validan las respuestas usadas; metadata original intacta, Project/Adopt 0.
La advertencia inicial de root sobre AnalysisSession compacto era demasiado
amplia: ese DTO sí es válido; no se añadieron campos nativos ajenos.

Baseline 38 PASS/4.50s EXIT0. Focal final R9: 56 PASS/5.58s EXIT0;
typecheck-r2/lint-r2 EXIT0. Auditor --list-r2 EXIT1: paridad OK, ausentes 0
y sólo `strategy.classification.manual` huérfana hasta Hd. Diff limpio.
R1 8 fallos/48 PASS, R2 3/54, R3 2/54, R4 1/55; R5 y R6 56 PASS;
R7 3/53, R8 1/55. Fallos de nuevos tests/fixtures y adaptación de controles
conservados, no RED previo de producto. Logs leídos en
`C:/tmp/vantare-isa1104/vantare-v2/frontend/.tmp/isa1104-t12hc-*.log`
(ubicación real, bajo frontend; sustituye la ubicación anunciada en Hb
sólo para estos logs). Regla *.log existente, sin cambios de configuración.

Worker idle antes de commit. No suite/build global nuevos: último G3f.
No Go/banco/Wails/app/LMU, sin certificación visual >9. Hc aislado no prueba
que la vista sobreviva a Save en Workflow: root detectó revisionKey,
declaró Hc2 de cuatro paths y exige regresión antes del cambio. Después Hd/I.

## T12hb — textos de clasificación antes de conectar consumidores

Commit `cda6e0040f35f6178dab0b53de7043cf22b5014c`, cuatro locales
ES/EN/IT/PT, +48/-0: doce claves nuevas por idioma, copia española decidida
por root y traducciones revisadas personalmente. No claves anteriores
modificadas ni cambios de comportamiento; no tests de espejo de texto.

Baseline auditor EXIT0/paridad OK/ausentes 0/huérfanas 0. Después del cambio,
auditor --list EXIT1 conocido: exactamente las doce claves nuevas aún sin
consumir. No se presenta como verde; Hc/Hd deben cerrarlo sin whitelist/usos
falsos. Typecheck y lint EXIT0, diff limpio. Root leyó diff completo y logs
`C:/tmp/isa1104-t12hb-{baseline,audit-list,typecheck,lint}.log`. Worker idle
antes de commit. Último global/build sigue siendo G3f; sin Go nuevo.

Siguiente Hc, cuatro paths de lista/detalle y Data con sus tests, conforme al
microplan. Logs nuevos en `.tmp/isa1104-t12hc-*.log` dentro de esta app; la
regla existente `*.log` ya los ignora. Se conserva toda evidencia anterior
en C:/tmp. No cambio de configuración/ignores. Hd cerrará historial y
gates completos. Sin app/LMU, banco, Wails ni acciones de entrega remota.

## T12ha — consulta del original reutilizada antes del montaje

Commit `e2d610cb10e73f4aa8d985fa80c4ecb362ead053`, cuatro paths de
contrato/helpers TS y tests, +137/-21. Extraídos el validador público del
original RAW y la consulta desde opened con las mismas guardas; parser y
constructor los reutilizan. Enum y normalización SessionType existentes
exportados como alias. Sin cambio de wire, versiones, Go, owner ni señales.

Revisión personal de los cuatro diffs sin hallazgos. Diez casos nuevos
cubren original/efectivo distintos, precondición raw, Unicode, campos parciales,
privacidad, duplicados, enum y ausencia de un nuevo límite/mutación. No se
modifican aserciones anteriores. Baseline previo: 123 PASS/881ms; el archivo
no registró EXIT y se conserva así. El worker declara exit 0 de la llamada
original; root no lo presenta como un EXIT leído del archivo.
Focal final: 133 PASS/944ms, EXIT0; typecheck producto/lint EXIT0 y diff limpio.
Logs `C:/tmp/isa1104-t12ha-{baseline,focal,typecheck,lint}.log` leídos por root.
Diagnóstico LSP preexistente de tuplas del test parametrizado fuera del diff;
typecheck producto no verifica esos tests. No ocultar esa diferencia.

Worker idle antes de commit. Siguiente Hb, doce claves en cuatro locales;
después Hc/Hd consumidores. Global frontend/build después de Hd; última
suite completa sigue siendo G3f. Sin banco/Wails/app/LMU ni entrega remota.

## T12g3f — biblioteca, inspección y vuelta al asistente conectadas

Commit `20b2aad0`, cuatro paths Workflow/Sessions y tests, +281/-14.
Inspeccionar sólo aparece con callback; el montaje navega únicamente si el
dueño acepta. Data/Revisions reciben todas las fuentes poseídas y referencias
reales del borrador. Volver está fuera de tablist y preserva teclado/foco,
borrador y handles; no dispara SaveDraft/Apply/Calculate. La biblioteca
bloquea Use si cualquier fuente es no proyectable y traduce errores nuevos.
Nombres parciales por candidato/unnamed; originales sensibles no se usan
para identificación. Causa dentro de la celda descriptiva conserva el grid.

Revisión personal corrigió: prueba que fabricaba initial/repository para
saltar la entrada real; DTOs incompletos y página distinta de la solicitada;
interacción bajo modal abierto; ausencia de comando realmente incierto;
nombres parciales antes de validar metadata; error técnico nuevo visible;
cuarto hijo en grid de tres columnas. Quedan cubiertos Inicio→Combinación→
Descubrir→inspeccionar sin combinación/repositorio, Save con Project 0,
historial exacto, borrador conservado, formulario crudo/dirty/uncertain,
Resolve sin segundo Save, Arrow/Home/End y error Load visible. La limpieza de
datos anteriores al fallar Load la prueba además el dueño G3c; no se atribuye
esa demostración a un test que empieza vacío.

Focal R1: 2 fallos/44 PASS, 5.70s; R2: 46 PASS, 5.17s; R3: 1 fallo/47 PASS,
5.44s; R4: 1 fallo/47 PASS, 5.57s; R5: 48 PASS, 5.46s; R6 final: 48 PASS,
5.45s. Fallos por consultas ambiguas de texto en tests, conservados; no son
RED de producto. Typecheck producto/lint/auditor --list exit 0 (paridad OK,
ausentes 0, huérfanas 0). Suite completa: 443 archivos/3644 PASS, 221.25s,
exit 0. Build: 1085 módulos/1.90s, exit 0. Diff limpio.
Logs `C:/tmp/isa1104-t12g3f-{focal,focal-r2,focal-r3,focal-r4,focal-r5,focal-r6,typecheck,lint,audit-list,frontend-all,build}.log`
leídos personalmente. Avisos AbortError de teardown y chunks>500 kB
conservados, ya registrados en cortes anteriores. Typecheck excluye tests;
casts de fixtures anteriores señalados por LSP no se modifican ni se presentan
como comprobados por ese gate. Los nuevos DTOs usados se validan por parsers.

Worker idle antes de commit; documentación/issue y siguiente plan por root.
Sin Go nuevo, banco real, Wails/app/LMU ni acciones externas de entrega.

## T12g3e2 — guardado de inspección sin error de preparación evitable

Commit `ce26fa8f`, dos paths hook/test, +70/-1. Cambio productivo limitado a
condicionar la proyección automática posterior a retainSaved: requiere ID de
combinación y ausencia de causa de no proyección. La publicación del guardado,
tres grupos, comando confirmado, Project explícito, Adopt y dueño no cambian.
Las fuentes proyectables conservan errores inesperados y revisión duradera.

RED previo real 3 fallos/25 PASS, 1.11s, exit 1: se llamaba a Project tras
guardar/confirmar una fuente no proyectable. Tests nuevos de Save v3 confirmado,
Resolve found tras respuesta perdida y marca con ID; contratos completos
validados, fuente original y adopción intactas. Focal hook + dueño G3c:
42 PASS/2.06s, typecheck producto/lint exit 0; diff limpio. Logs
C:/tmp/isa1104-t12g3e2-{red,focal,typecheck,lint}.log leídos personalmente.
No tests anteriores modificados ni fallos legítimos ocultos.

Worker idle antes del commit. Orquestador precisa G3f (botón fuera de tablist,
busy completo en biblioteca, formularios conservados entre tabs). Suite completa,
build y auditor i18n se cierran en G3f; tres claves aún pendientes de consumo.
Sin Go, banco real, Wails/app/LMU, push, PR, CI remota o promoción/release.

## T12g3e — selección real en Datos y Revisiones

Commit `7528f1b8`, cuatro paths UI/tests, +204/-9. selectedRevisions explícitas
por fuente/base; pin además por revisión/snapshot exactos. La revisión abierta
no marca uso en carrera; ReviewPinned carga una copia con la referencia del
borrador. Guardar/restaurar local permanece separado de preparar/adoptar, que
requiere fuente seleccionada y proyectable. Causas de ausencia de selección y
de metadata no utilizable visibles, también si la fuente marcada lleva ID.

Revisión personal retiró el OR antiguo que aún bloqueaba por revisión del handle
y exigió comprobar la referencia completa del plan. Fixture inicial Data
completado/validado sin cambiar IDs/valores; tests de referencias distintas,
fuente/base/snapshot, bloqueo con marca, selección explícita y guardado local.
RED R2 tras completar fixture: 1 fallo/8 PASS, 7.83s, causa ausente; R1 3.26s
con fixture UI previo preservado. Focal final 31 PASS/3.24s, typecheck producto
y lint exit 0; diff limpio. Logs C:/tmp/isa1104-t12g3e-{red,red-r2,focal,typecheck,lint,audit-list}.log
leídos personalmente. Lecturas iniciales del log fallaron por escapes de
comillas ajenos a PowerShell; no eran fallos de Strategy. RED guarda sufijo
literal con barras, además de la salida de test/ELIFECYCLE de exit 1.

Auditor exit 1, paridad OK/ausentes 0: sólo inspect, inspectionOnly y
backToWizard sin consumidores; se cierra en G3f, junto con suite completa/build.
No afirmar montaje funcional: Workflow aún no suministra selectedRevisions.
Worker idle antes del commit; sin banco real, Go nuevo, Wails/app/LMU, push,
PR, CI remota, integración, promoción o release. El orquestador añade G3e2 al
microplan para evitar un error de preparación después de un Save local válido.

## T12g3d — textos de inspección y selección

Commit `2ccc2973`, cuatro locales es/en/it/pt, +52/-32: cinco claves nuevas
y ocho textos actualizados por idioma, sin otro cambio. Copia española del
orquestador y traducciones revisadas personalmente: abrir/revisar no implica
sesión preparada o fijada para la carrera; causa de datos no verificables,
fuente no seleccionada y retorno al asistente.

Typecheck de producto y lint exit 0; diff limpio. Auditor i18n exit 1,
paridad OK y usadas ausentes 0, exclusivamente cinco huérfanas esperadas:
strategy.recorded.inspect, inspectionOnly, metadataUnavailable, notSelected,
backToWizard. El orquestador repitió con --list para verificar cada nombre.
Logs C:/tmp/isa1104-t12g3d-{audit,audit-list,typecheck,lint}.log leídos.
No es gate verde: pendiente consumirlas en G3e/G3f y cerrar auditor/global
frontend/build allí. No se introducen usos falsos, whitelist ni cambio del auditor.

Worker idle antes del commit. Nueva sesión Muse para E/F evita arrastrar el
contexto de los cortes previos; mismo modelo/proveedor/xhigh y un solo ejecutor.
Planes/documentación/issues/revisión/commits siguen en el orquestador. Sin
tests nuevos por copia, app/LMU, banco, Go, push, PR, CI remota o promoción.

## T12g3c — dueño de sesiones y acceso al editor

Commit `75de4086`, cuatro paths hooks/tests, +275/-0 (27 líneas productivas).
inspect resuelve el handle poseído y acepta la acción sólo si no hay operación,
ediciones/comando pendientes ni fallo de clear. Inicia el mismo Load después
de vaciar el editor; su error no deja datos de otra fuente. La exclusión usa
refs sincrónicas, no el busy del render anterior. Workflow abre el mismo editor
sin SaveDraft/Apply/Calculate y admite ausencia de combinación/repositorio.
Apply y adopción rechazan fuentes no proyectables, incluyendo fuente poseída
marcada ante una copia que pretenda habilitarla. Contrato de vista legacy intacto.

Revisión personal exigió pruebas que distinguieran cada bloqueo: dos fuentes
proyectables para comprobar Apply durante Load; una fuente ya poseída antes
de otra apertura; escritura real pendiente tras configurar borrador válido;
todo en el mismo act. Fixtures completos validados por parsers, proyección
con contrato válido y copia de revisión alterada que carga la poseída original.
Focal R2 23 PASS/1.89s, typecheck de producto y lint exit 0, diff limpio.
Primer focal 20/22, 1.98s, exit 1: expectativas nuevas erróneas (AbortSignal
esperado como undefined y escritura que no llegó a execute por borrador inválido).
Fallos preservados, no RED productivo; no hubo RED pre-cambio de esta API nueva.
Logs C:/tmp/isa1104-t12g3c-{focal,focal-r2,typecheck,lint}.log leídos personalmente.

Worker idle antes del commit. Sin global frontend/build hasta G3f según plan,
Go nuevo, banco real, Wails/app/LMU, push, PR, CI remota, promoción o release.
El orquestador fija textos y precisa G3e/G3f antes de asignar el montaje.
No se cierra T12 ni se afirma validación visual/nativa por estos tests.

## T12g3b — apertura exacta para inspección

Commit `b6107f9a`, cuatro paths apertura/propuestas y tests, +200/-4.
La causa explícita metadata_unavailable y baseDigest nativo válido permiten
Load de revisión inicial o esperada exacta, sin Project ni combinación del
borrador. Comprueba fuente/base/revisión/snapshot/digest; conserva un handle
poseído con causa de bloqueo. Errores/cancelación siguen cerrando el recurso.
Propuestas rechazan toda selección que contenga una fuente no proyectable.

Revisión personal corrigió un requisito innecesario de objeto combination:
la ruta legacy proyectada puede resolver su ID contra el catálogo. También
exigió cancelar después de Prepare antes de otra lectura. Regresiones de ambos
casos, referencia histórica con cabeza posterior, fuentes ajenas, contratos
inválidos, fallo de Load y cancelación tardía. RED 1 fallo/18 PASS, 874ms,
exit 1 por recorded_combination_unavailable. Focal final R2 36 PASS/721ms,
typecheck y lint exit 0; diff limpio. El primer focal (35/36) falló por una
expectativa errónea del nuevo test de digest; se conserva su log y no cuenta
como fallo de producto. Logs C:/tmp/isa1104-t12g3b-{red,focal,focal-r2,typecheck,lint}.log
leídos personalmente. Fixtures de contrato, sin datos reales.

Worker idle antes del commit. Global frontend/build tras G3f según plan;
sin Go nuevo, banco, Wails/app/LMU, push, PR, CI remota ni promoción/release.
El orquestador precisa ahora inspect del dueño y sus bloqueos en G3c; planes,
handoff e issue siguen bajo su responsabilidad. T12 permanece abierto.

## T12g3a — identidad nativa de inspección

Commit `cd2ab65b`, cuatro paths preparación Go/contrato TS y tests, +67/-1.
PrepareCorrections entrega SourceAnalysisRef.Digest como baseDigest dentro
de la autorización/lifecycle/bloqueo existentes, también con metadata parcial.
Mantiene revisión inicial, capacidades y combinación/causa. TS valida digest
si está presente y admite su ausencia en respuestas antiguas de la ruta
proyectada. Sin hash en frontend ni nuevo lector/catálogo/custodia.

RED wire real en variantes completa y parcial (exit 1, paquete 0.058s): valor
vacío frente al digest esperado. Tests verifican identidad exacta, diferencia
con revisión inicial y estabilidad de Prepare repetido. Go focal 0.052s,
TS focal 103 PASS/760ms, typecheck, lint y vet de alcance exit 0. Global
`go test -p 1 ./...` exit 0: 126 paquetes ok/cero FAIL. gofmt/diff limpios.
Logs C:/tmp/isa1104-t12g3a-{red,go-focal,ts-focal,typecheck,lint,vet,global}.log
leídos personalmente. Mapeo público de errores existente conservado.

Suite frontend completa/build se reservan a G3f según el microplan; último
conjunto completo es G2 (3575 PASS/build). Sin banco real ni Wails/app/LMU.
No push/PR/CI remota/integración/promoción/release. Worker idle antes del commit;
el orquestador mantiene planes, handoff e issue. G3a no cierra acceso al editor.

## T12g2 — controlador de correcciones y restauración

Commit `0873be52`, dos paths `use-recorded-corrections.ts/test`, +319/-12.
Clasificaciones en todas las transiciones de Editor; Save explícito con los
tres grupos. Restore toma todos los conjuntos del antepasado elegido y usa
la cabeza anunciada sólo como precondición: no hereda clasificaciones nuevas.
Cuota total antes de publicar estado, origen original, guardado incierto
congelado, Resolve/retry explícitos y revisión duradera aunque falle Project.

RED real 1 fallo/12 PASS (882ms): restaurar v1 ante cabeza v3 enviaba una
clasificación posterior. Entradas validadas por el parser. Revisión personal
exigió también respuestas guardadas coherentes (nueva revisión d con padre b),
cuota con los tres grupos y retry completo tras intentos bloqueados de edición,
retirada, descarte y carga. Pruebas de v1/v2/v3, original frente a valor efectivo,
Resolve found con cabeza avanzada, ausencia/conflicto y cancelación tardía.

Focal final R3 25 PASS/937ms, exit 0; typecheck producto y lint R2 exit 0.
Suite completa exit 0: 443 archivos/3575 PASS, 195.71s; build exit 0, 1085
módulos, 1.05s. Avisos AbortError de teardown y chunks >500 kB conservados,
también presentes en comprobaciones anteriores; sin atribuir causa nueva.
Logs C:/tmp/isa1104-t12g2-{red,focal,focal-r3,typecheck,lint-r2,frontend-all,build}.log.
Un intento focal R2 falló por un cierre sobrante en test:254, cero tests
ejecutados (19:42:14); el worker sobrescribió ese archivo al reintentar antes
de recibir la instrucción de conservarlo. El fallo se leyó en la salida de
herramienta, no queda un log separado: R2 actual es 25 PASS/1.16s. No cuenta
como RED productivo ni se oculta; R3 es la verificación final nueva.

No Go repetido, banco real ni Wails. Sin app/LMU, push, PR, CI remota,
integración, promoción o release. Commit del orquestador con worker idle;
sesión Muse anterior detenida, la siguiente usa contexto nuevo para G3.
T12 sigue abierto; G3 y montaje/banco no se sustituyen por estos fixtures.

## T12g1 — helpers de corrección completos

Commit `f5c01dda`, cuatro paths de contrato TS/helpers y sus tests, +201/-8.
Resolvedor de claves a SessionType/WeatherConditions con normalización nativa
existente, devuelve undefined para otra metadata sin ampliar el campo wire.
Corrección desde original exacto y válido de la sesión abierta; otra ausencia
no bloquea este campo. Sustituir/retirar valida conjuntos y bases; guardado
conserva por defecto clasificaciones del snapshot y permite retirar con [].
Cuota TOTAL 256 entre los tres grupos, no 256 por grupo; payload clonado.

Revisión personal corrigió el primer fixture RED (v3 con comando inicial vacío)
antes de aceptar evidencia: RED R2 usa revisión guardada validada por el parser,
1 fallo/12 PASS, 710ms, salida classifications undefined. El resolvedor ya se
había añadido sin uso, pero recordedCorrectionSave aún no se había cambiado;
no se revirtió producto para producir el RED. También se corrigió validar base
y duplicados sólo después de filtrar el campo sustituido; regresiones cubren
ahora esas entradas inválidas. Comentario nativo corregido de EqualFold a
ToLower(TrimSpace); ningún normalizador general ni hash en frontend.

Focal final: 2 módulos/114 PASS, 810ms, exit 0; typecheck real y lint frontend
exit 0. Logs leídos C:/tmp/isa1104-t12g1-{red,red-r2,focal,typecheck,lint}.log.
Diff limpio, worker idle antes de commit. Suite frontend completa/build se
reservan al cierre de G2 según el microplan: G1 aislado no entrega el editor.
Sin Go, banco real, app/LMU ni Wails. Sin push/PR/CI remota/integración/promoción.

## T12f — cliente de comandos de clasificación

Commit `38eb9949`, dos paths `analysis-client.ts/test`, +278/-11.
Petición con clasificaciones opcionales; omisión y retirada [] distintas,
familias explícitas requeridas al enviar clasificaciones, cuota conjunta antes
de recorrer elementos. Payload intacto y comparación de comando completo,
familias y clasificaciones en Save/Resolve. Replay con revisión anterior y
cabeza avanzada aceptado; sin adopción ni reintentos automáticos.

RED real conservado en `C:/tmp/isa1104-t12f-red.log`: 4 fallos/13 PASS,
exit 1; el cliente aceptaba motivo de clasificación discrepante y enviaba
peticiones inválidas. Un intento previo falló en transformación por sintaxis
del test y no cuenta como RED productivo. Revisión personal corrigió fixtures
de revisión/comando, contexto de base y cuota: el positivo 256 devuelve los
254 preparados escalares + familia + clasificación. Casos finales de replay,
cancelación tardía, conservación íntegra y tipos estrictos, sin casts en
fixtures válidos. No se amplió el cliente a comparar escalares en la respuesta.

Gates leídos: focal 18 PASS/828ms; suite frontend exit 0, 443 archivos/3553
PASS, 196.60s; typecheck real, lint frontend y build exit 0. Build 1085 módulos,
1.01s, aviso chunks >500 kB. Aviso AbortError de teardown conservado, presente
también en T11g4/T12e; no se atribuye causa nueva. Logs C:/tmp con prefijo
`isa1104-t12f-`: `focal.log`, `frontend-all.log`, `typecheck.log`, `lint.log`,
`build.log`. Diff limpio, worker idle antes del commit del orquestador.
No Go repetido (sólo consumidor TS), banco real, Wails ni app/LMU. Sin push,
PR, CI remota, integración, promoción ni release. T12 permanece abierto.

## T12e — contrato de clasificación en TypeScript

Commit `2cf7ab0e`, dos paths `analysis-contract.ts/test`, +325/-6. Tipos y
parsers de petición/preparación, snapshot v3, cuota total antes de recorrer,
revisión inicial sin decisiones, compatibilidad v1/v2 y comparación semántica
sin mutar entradas. Preserva originales y peticiones exactas; mismo espacio,
minúscula simple del enum, UTF-8, límite bruto de 1024 bytes y clima de 64
puntos Unicode que Go. El cliente valida forma/consistencia, no hashes ni
calidad viva/autorización que no figuran en el wire.

Revisión personal detectó validación semántica ausente en el parser de petición
y comparación que aceptaba duplicados; corregidas antes de aceptar. También
se corrigieron fixtures de precondición que cambiaban a la vez esperado y
original, base ajena sin autoridad externa, escapes Unicode mal representados,
bytes confundidos con longitud JS y target duplicado en el caso de cuota 257.
Casos directos del parser y positivos 256/1024 protegen los límites reales.
No hubo RED pre-cambio; es extensión del contrato con revisión intermedia.

Gates revisados: focal R4 93 PASS (833ms); suite frontend completa exit 0,
443 archivos/3545 tests PASS (250.75s); typecheck `tsc -b --noEmit`, lint
frontend completo y build `tsc -b && vite build` exit 0. Build: 1085 módulos,
1.59s, advertencia de chunks >500 kB conservada. Suite: aviso AbortError en
teardown presente también en el log T11g4 anterior; sin atribuir causa nueva.
Logs `C:/tmp/isa1104-t12e-focal-r4.log`, `isa1104-t12e-frontend-all.log`,
`isa1104-t12e-typecheck.log`, `isa1104-t12e-lint.log`, `isa1104-t12e-build.log`
(todos en C:/tmp). Intentos focal/R2 no arrancaron tests (invocación); R3
90 PASS antes de los casos finales. Se usa `pnpm --dir frontend run test`,
con `run` explícito para pasar opciones a Vitest. No Go repetido (sin Go
modificado), banco real ni Wails. Sin push/PR/CI remota/integración/promoción.
El orquestador mantiene los planes y la revisión; F usará sesión Muse limpia
para reducir contexto, con la sesión anterior detenida y un solo ejecutor.

## T12d1 — comandos y proyección nativa de clasificación

Commit `19f2c886`, dos paths `telemetry_analysis_correction_commands.go/test`,
+465/-18. Save/Resolve aceptan el conjunto completo; clasificaciones no nil
requieren familias explícitas, omitir no retira decisiones desconocidas. La
proyección nativa conserva la clasificación efectiva de Analysis y elimina la
reconstrucción de HistoricalLap. Mantiene las puertas de autorización y el
bloqueo por metadatos globalmente incompletos; un campo válido puede guardarse
aunque otro falte. Clima sólo cambia etiqueta, no métricas físicas.

RED productivo `TestProjectCorrectionUsesEffectiveClassification`: devolvía
race tras guardar qualify. GREEN tras corregir el consumo. Revisión personal
del diff completo reforzó reapertura de custodia tras avanzar cabeza y
proyección de ID antiguo con referencias exactas, guard T11 contra cabeza de
sólo clasificación, Save/Resolve repetidos después del avance, ausencia/error
explícitos en Resolve, rechazo atómico y autorización revocada. Agregación de
dos sesiones conserva tipo/clima y revisiones exactas. Ajustar la expectativa
de unknown_replacement en Resolve fue corregir un test, no otro bug de producto.

Gates: focal app PASS 4.202s; global `go test -p 1 ./...` exit 0, 126 paquetes
ok/cero FAIL; vet de alcance exit 0 (log vacío), gofmt/diff limpios. Logs leídos:
`C:/tmp/isa1104-t12d1-red.log` (exit 1), `C:/tmp/isa1104-t12d1-focal.log`,
`C:/tmp/isa1104-t12d1-global.log`, `C:/tmp/isa1104-t12d1-vet.log`.
Fixtures contractuales, sin frontend/banco real/Wails en D1. Commit del
orquestador tras worker idle; sin push, PR, CI remota, integración ni promoción.

## T12d2 — inspección de vueltas compatible con revisión mixta

Commit `5591602f`, dos paths (`corrections_inspection.go` y test), +275/-2.
Una línea productiva pasa de ApplyObservation a ApplyMixed; mantiene la misma
consulta, paginación, identidad temporal, original/efectivo, límites y cinco
capacidades físicas. RED real: `TestCorrectionLapInspectionAcceptsMixedClassification`
rechaza v3 por `observation snapshot integrity`; mismo caso GREEN tras el cambio.
Tests cubren sólo clasificación, tres grupos con efecto escalar +1s y exclusión
familiar, equivalencia con v2 salvo snapshotID, otro metadato ausente, cuota y
rechazos atómicos. Revisión personal corrigió capturas superficiales de input,
contaminación entre casos y una clonación del puntero de salida que invalidaba
la prueba de no-alias; se escribe directamente sobre el resultado antes de
comparar el input y snapshot serializados.

Gates: focales `telemetryanalysis/...` exit 0; global `go test -p 1 ./...` exit 0,
126 paquetes ok/cero FAIL; vet de alcance exit 0 (log vacío), gofmt/diff limpios.
Logs leídos: `C:/tmp/isa1104-t12d2-red.log` (exit 1),
`C:/tmp/isa1104-t12d2-focal.log`, `C:/tmp/isa1104-t12d2-global.log`,
`C:/tmp/isa1104-t12d2-vet.log`. Sin frontend, banco real ni Wails en este corte.
Sin push/PR/CI remota/integración/promoción. Se documenta en §4 del microplan
la limitación de rollback: un binario antiguo no debe abrir custodia con v3;
conservarla y usar perfil/CorrectionRoot aislado si se vuelve al binario anterior.

## T12c2 — clasificación efectiva en derivación y proyección

Commit `e8abf272`, cuatro paths `corrections_derivation.go/test` y
`corrections_projection.go/test`, +543/-6. `Classified` viaja junto a los
derivados de la revisión exacta. Metadatos activos se reclasifican en Analysis;
v1/v2 conservan identidad/tipo/clima del caller y todos refrescan disponibilidad
desde vueltas completas del análisis, sin reconstruir HistoricalLap. La etiqueta
climática no altera consumo, curvas ni paradas. No se añade DeriveObservedStrategy.

Revisión personal corrigió refresh ausente en legacy y reforzó pruebas: caller
canónico, combinación invariante, separación de rechazo en preparación/derivación,
proyección pública completa, reopen e historial antiguo con head avanzado, retiro,
comparaciones de inmutabilidad por JSON y efecto escalar +1s independiente del
efecto familiar. Gates: focales `telemetryanalysis/...` exit 0; global Go
`-p 1 ./...` exit 0, 126 paquetes ok/cero FAIL; vet de alcance exit 0, gofmt y
diff limpios. Logs `C:/tmp/isa1104-t12c2-focal.log`,
`C:/tmp/isa1104-t12c2-global.log`, `C:/tmp/isa1104-t12c2-vet.log` leídos por
el orquestador. Muse reportó tres fallos durante construcción de fixtures
(Combination, snapshot sin Base, GeneratedAt sin milisegundos); sólo quedaron
en salida de herramienta, sin log separado. No son reproducción de bug de producto.
Sin frontend/banco real/Wails; sin push/PR/CI remota/promoción. C2 no certifica
el recorrido nativo: D1 aún sobrescribe metadatos corregidos y D2 rechaza v3.

## T12c1 — vista efectiva mixta revisada y comprobada

Commit `1c70fb7c`, dos paths (`corrections_view.go` y test), +300/-5.
`ApplyMixedCorrectionSnapshot` reusa la aplicación escalar/familiar y T12a
contra originales, comprueba los tres grupos y devuelve metadatos separados
con procedencia. `session.Channels` es la única autoridad de canales. v1/v2
conservan comportamiento; sin clasificación activa no se añade Metadata a la
vista antigua. Sólo cambia Value; fuente/calidad/presencia/reloj intactos.
Revisión personal: eliminada duplicación familiar y separados los fixtures de
casos adversariales que inicialmente compartían slices. Campo parcial conserva
el metadato ausente incluso en la vista efectiva. Sin consumidores nuevos aún.

Gates: focal `telemetryanalysis/...` exit 0 (0.831/0.094/0.037s), global Go
`-p 1 ./...` exit 0, 126 paquetes ok/cero FAIL, vet de alcance exit 0;
gofmt y diff limpios. Logs `C:/tmp/isa1104-t12c1-focal.log`,
`C:/tmp/isa1104-t12c1-global.log`, `C:/tmp/isa1104-t12c1-vet.log`.
El orquestador leyó diff completo y logs antes de aceptar. Sin suite frontend
(sin TS), banco real ni Wails en C1. Sin push/PR/CI remota/promoción.

## T12b2 custodia v3 cerrada (ISA-1104, 4 paths, revisión final aceptada)

Rama `vantareapp/isa-1104-recorded-classification`, base `7f75713`. Mismo
decoder/store/lease/backup/Save/Resolve; sin store ni formato paralelo.
`ObservationCorrectionInput` suma sesión original + decisiones (nil = grupo
desconocido que nunca se borra en silencio; `[]` = retirada explícita).
Digest mixto v3 anidado sobre v2 con las tres decisiones completas; Save y
Resolve usan exactamente la misma función; v1/v2 (comando/revisión) exactos.
Guards independientes legacy/T11; replay exacto devuelve revisión antigua +
cabeza actual. Decoder cuenta 3 cuotas y recomputa preparación+snapshot+
digests; rechaza tamper incluso resealed (los digests son consistencia, no
autenticidad: una falsificación válida consistente no se promete detectar).
Cuota 256/256rev/8MiB; restore v3→v2→v1 conserva historia. Revisión intermedia
aplicada: reseal semántico real, retirada solo-clasificación a v2 exacto con
replay/Resolve post-avance, rechazo table-driven (original/quality/parser) y
legacy escalar contra head solo-clasificación.
Gates: focales PASS; `gofmt` + `git diff --check` limpios; `go vet` alcance
exit 0 (`C:/tmp/isa1104-t12b2-vet.log`); global `go test -p 1 ./...` exit 0,
126 ok, cero FAIL (`C:/tmp/isa1104-t12b2-global.log`; focal
`C:/tmp/isa1104-t12b2-focal.log`; GOCACHE `C:/tmp/isa1084-go-cache`; sin
suite frontend). `plan.md` intacto. Siguiente C se asignará aparte.

## T12b1 representación v3 (ISA-1104, 2 paths, revisión aceptada; B2 completado)

Rama `vantareapp/isa-1104-recorded-classification`, base `7f75713`. Mismo
`PreparedSampleCorrectionSnapshot` extendido con clasificación completa
`omitempty`; v3 `analysis.mixed-snapshot.v3` solo con clasificaciones
activas; sin clasificación, v1/v2 byte-idénticos (golden v1 existente + golden
v2 nuevo `55938408…e632`). Preparación viva de los tres grupos contra
sesión/base con T12a; helper almacenado separado de autorización/source/
quality (nunca eleva reconstrucción a evidencia). Vacío canónico en v3:
grupos ausentes nil (digest viva/almacenada idéntica, JSON roundtrip directo;
v1/v2 intactos; sin normalización especial en lectores futuros). Cuota total
256 conjunta y atómica: conjunto válido real 253 escalares únicos+1 familia+2
clasificaciones prepara completo; 257º válido individual rechazado por cuota.
Sin decoder/store/vista/servicio/TS en este corte (B2). Corrección de
lenguaje: el rechazo de T12a v1 fue hallazgo de revisión, no RED; RED
ejecutado real solo la sonda del golden v2 (luego verde). Sin cerrar T12 ni
gates nativos/empíricos.
Gates: focales PASS (v3 sola/mezclada/orden/digest/cuota/vacío/no-alias,
v1/v2/documento preexistentes intactos); `gofmt` limpio;
`go vet` alcance exit 0 (`C:/tmp/isa1104-t12b1-vet.log`); global
`go test -p 1 ./...` exit 0, 126 ok, cero FAIL
(`C:/tmp/isa1104-t12b1-global.log`, GOCACHE `C:/tmp/isa1084-go-cache`).
Evidencia T12a previa verificable: R1
`C:\Users\isaac\AppData\Local\Temp\opencode\isa1104-go-global.log` (exit 1,
125 ok, FAIL `TestRecordedImolaCalculationCompletes` 8.03s/64.959s) y R2
`C:\Users\isaac\AppData\Local\Temp\opencode\isa1104-go-global-r2.log`
(exit 0, 126 ok). `plan.md` intacto (sin cambio público). Siguiente B2 solo
tras revisión del orquestador.

## T12a v2 — preparación canónica corregida (ISA-1104, revisión intermedia)

Sesión `ses_f767b9355ffe8jiV60PxmdbsUv`, mismo modelo/variante, ejecutor único
sin subagentes. La revisión intermedia NO dio por válido T12a v1
(`ValidateClassificationCorrection` solo con `SessionID`): reescrito en los
mismos 2 paths como `PrepareClassificationCorrection[Set]` con base exacta
`SourceAnalysisRef` (digests, petición contra vigente, sesión contra base por
ID/parser/schema/fuente; `SourceChanged`/`InterpretationChanged`/`Precondition`/
`Value`/`Invalid`/`Target`/`OverlappingCorrections` reutilizados, sin familia
paralela), motivo con `correctionText(...,1024)`, clima en caracteres con
rechazo de controles y UTF-8, precondición exacta sin recortes, y salida
preparada reutilizable (`BaseID`/`CorrectionID`/petición/original/corregido).
Fixtures contractuales coherentes con tipos reales (fuente LMU, parser/schema/
base válidos como valores de contrato, no DuckDB físico; parcial solo sin
Weather con su causa aplicable); calidades stale/missing/invalid/unknown,
Present/Sensitive/Redacted, duplicados, inmutabilidad y atomicidad cubiertos.
Segunda lectura del orquestador: original preservado byte a byte (esperado
idéntico acepta, recortado rechaza; solo el corregido se normaliza), conjunto
valida base/sesión/cuota antes de preparar, reemplazo en bruto acotado y
UTF-8 inválido rechazado donde se almacena.
Microplan: T12a preciso y T12b dividido en B1 (representación+preparación) y
B2 (decoder+store+digests, el decoder requiere edición). B aún no autorizado
ni implementado. Focales PASS (10 tests); vet de alcance PASS; global Go `-p 1`
R1: 125 paquetes ok, 1 FAIL `TestRecordedImolaCalculationCompletes`
(deadline conocido de ISA-1089; PASS aislado en 4.77s; raíz no demostrada);
ningún Go existente modificado. Commit local separado sin push/PR/merge/
promoción. `plan.md` intacto.

## T12a gates segundo global (ISA-1104, corrección de conclusión)

Corrección aceptada: el PASS aislado solo mostraba intermitencia, no probaba
contención como causa. Evidencia registrada sin afirmación causal: global R1
(exit 1; 125 ok; FAIL `TestRecordedImolaCalculationCompletes` en
`internal/strategy/application`, 64.959s, `calculation_timeout`/deadline;
log `isa1104-go-global.log` temporal, no versionado) + aislado PASS por
separado (4.77s, `-count=1`). Verificado por diff que los 2 paths nuevos no
tienen consumidores productivos (solo se referencian entre sí) y ningún Go
existente fue modificado: el corte no toca solver, timeouts ni ese test.
Segundo global único R2 (GOCACHE `C:/tmp/isa1084-go-cache`, sin builds propios
concurrentes): exit 0, 126 paquetes ok, cero FAIL
(`isa1104-go-global-r2.log`). Se documentan ambas corridas; la raíz de la
intermitencia R1 sigue no demostrada. B pendiente de revisión del orquestador,
dentro del alcance ya autorizado por Isaac.

## T12 revisión del microplan (ISA-1104, corte A solo docs)

Sesión `ses_f767b9355ffe8jiV60PxmdbsUv`, modelo
`opencode-go/muse-spark-1.3-contributor` variante `xhigh`, ejecutor único;
orquestador externo revisa. Rama `vantareapp/isa-1104-recorded-classification`,
base `7f75713`. T11 NO cerrado: lógica/banco PASS, T11i visual/nativo pendiente
(WebView2 `ERROR_INVALID_STATE`, causa indeterminada incluso visible; sin más
UI ni LMU en este encargo). Microplan `classification-corrections-t12.md`
corregido según revisión: §5 distingue clasificar ESA fuente en preparación
(`telemetry_analysis_corrections.go:108-115`, test `:11-72`) del catálogo
nativo (`sessioncatalog.go:76-84,158-183`); el cliente puede adjuntar
referencia/ID canónico explícito y el servidor resuelve/valida contra la
fuente autorizada, nunca hashea texto arbitrario llamándolo canónico;
coche/circuito fuera de T12a. Precondiciones por campo (§2): corregir un campo
válido no exige los otros cinco ni éxito global parcial. Clima (§6/§7):
etiqueta opaca en `classification.go:80,125` + `projectionproducer.go:219,238`;
buckets físicos por vuelta vienen de consumo (`sessioncatalog.go:228-236`), sin
recompute prometido ni toque a #1030. Microcortes T12a–T12i de máx. 5 paths:
comandos Go, contrato/cliente/hook/UI TS por separado; el helper
`strategy-recorded-corrections.ts` no es contrato; banco real reusa
`internal/app`, sin lector paralelo en Analysis. Un path docs; sin código,
push, PR, merge ni promoción. Sigue T12a puro (2 paths Go declarados en #1104
antes de editar). `plan.md` intacto: token `milestones:strategy-recorded-editor`
declarado en la issue, cambio público ninguno en este corte.

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

## T11f2b — elegibilidad visible según el consumidor

La inspección separa automaticIncluded/effectiveIncluded de la mera bandera
LapFamilyUse. Reusa reglas de curvas/ahorro para reflejar tráfico y la inclusión
explícita por familia. Son reglas de uso, no presencia de señales ni garantía de
métrica calculable. Efectivo ausente si la identidad no es única en ambos modelos.
Pruebas focales, global Go -p1 y vet de alcance PASS. Dos paths Go independientes
del gate frontend. T11f3 quedó en 928e40b7 con global 3489 PASS; T11f4 consulta TS
está en trabajo (73 focales y tipos PASS, lint/build pendientes al registrar esto).
Sin Wails/precisión/visual >9/push/PR/CI remota/merge/promoción.

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

## Gate frontend T11f3 — sincronización del test de guardado

Primer global: 441/442 archivos, 3488/3489 tests. Falló la aserción inmediata de
liberación del suspend guard después de aparecer guardado (Workflow.test.tsx:37).
Focal aislado pasó 2/2. La guarda se libera con useEffect, separado del commit
visible. Se conserva la aserción y se espera con waitFor, sin aumentar timeout ni
cambiar producto. Focal conjunto 63/63 PASS. Global se repetirá; el run anterior
permanece fallido. Contrato mixto TS todavía sin commit/cierre; tipos/lint/build
PASS. Sin Wails ni publicación. Un único path test en este commit separado.

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

## T11e2b — compatibilidad sin unión por número

La reparación de ritmo legado exige la misma identidad temporal y unicidad de
ambas colecciones que las curvas. No reconstruye límites ausentes; conserva
esos datos como no disponibles y no modifica el modelo persistido. RED/GREEN:
número repetido, intervalos ausentes/cambiados y duplicados de validez/consumo.
Se conserva el caso válido con intervalos de fixture explícitos. Tres paths;
helper común de identidad, sin otro criterio ni dependencia. Analysis completo,
global Go -p1 y vet de alcance PASS. Continúa T11f1 comandos nativos mixtos.
Sin frontend, Wails, precisión, visual >9, push/PR/CI remota/merge/promoción.

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

## T11e3a — procedencia de decisiones efectivas

LapFamilyUse efectivo recibe el ID de su corrección validada. Originales y
precondiciones no llevan esa marca; se rechaza usar una vista ya corregida como
original. Campo omitido en wire histórico y snapshots preparados: golden v1 y
custodia mixta conservan sus IDs. Pruebas de procedencia por familia, restauración
vacía y precondición corregida PASS. Cinco paths; frontend intacto.
Global Go -p1 y vet app/Analysis/Strategy/cmd PASS. Sigue T11e3b consumo/ritmo para ahorro independientes y filtros blandos; después T11e2b compatibilidad de ritmo antiguo también con identidad exacta. Sin API/UI familiar, Wails, precisión, nota visual ni push/PR/CI remota/merge/promoción.

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

## Continuación activa T10 — ISA-1096 (2026-09-10)

Worktree C:/tmp/vantare-isa1096, rama vantareapp/isa-1096-recorded-corrections,
base bd9ed2c2ffa148ce4398265e2f83af80303739af. T08j final: 438 archivos/3433
tests, lint/build PASS. T10a helpers de revisión exacta/snapshot/comando estable:
T10a 7 focales y T10b 13 focales (helpers+hook), tipos/lint PASS. Controlador conserva guardado duradero y comando incierto. T10c resolución autorizada con lease/digest: focal Go, build, global Go -p1/vet PASS. T10d cliente de resolución: 43 focales/tipos/lint PASS. T10e controlador resuelve confirmación/ausencia sin perder propuesta: 16 focales/tipos/lint PASS. T10f owner compartido/guards/adopción por fuente: 27 focales/tipos/lint PASS. T10g Datos/pestañas montados: 16 focales, tipos/lint/build y global 441 archivos/3463 tests PASS. T10h–j capacidades nativas y solo lectura: Go global/vet del alcance y frontend focal/tipos/lint/build PASS. T10k historial visible: global frontend 442 archivos/3478 tests, lint/build PASS. Continúa T11 en #1099. No nuevo Wails, precisión ni paridad certificada.

## Continuación activa T08 — ISA-1095 (2026-09-10)

Worktree C:/tmp/vantare-isa1095-library, rama vantareapp/isa-1095-recorded-library,
base 56d2c23e858a2f8b6a141ea106fe2f2d98867db4. Ramas anteriores congeladas.
T05l final: 438 archivos/3422 tests frontend, lint/build PASS; conserva warnings
heredados de teardown/chunks. T08i: etiquetas locales saneadas, sin exportar
rutas ni nombres en dominio/procedencia. Go focal/global -p1/vet y build PASS.
T08j contrato TS y biblioteca de 25 filas/búsqueda/filtros: 43 focales, tipos/lint/build PASS; global en curso. Siguiente #1096 T10 datos/correcciones con servicios existentes.
Ruta nueva montada, pero cálculo avanzado, paridad >9, Wails y precisión real
continúan pendientes. Sin push, PR, CI remota, merge, promoción ni release.

## T05/T09 montaje y biblioteca — continuación ISA-1094 (2026-09-10)

Worktree activo C:/tmp/vantare-isa1094-route, rama vantareapp/isa-1094-recorded-route,
base d5fe69da211438b8f01c65fbb1af932b0195ab51 de #1095. Rama anterior #1094
conservada como corte histórico. T05i lista resúmenes nativos y abre payload
sólo por selección, con validación de identidad evento/plan/variante. 14 focales,
tipos/lint PASS; sigue entrada productiva y contexto A4. Sin ruta nueva montada aún.
T05j sustituye esa última anotación: OrbitShell monta StrategyRecordedPage,
con asistente/resumen/listado nativo y sin suscripción live del editor anterior.
Cinco focales, tipos/lint PASS; build inicial PASS, gate general posterior pendiente.
Captura harness sin errores/overflow; no paridad final ni Wails. Siguiente ajustar
título, selección y footer A4, después continuar datos/cálculo pendientes del SDD.
Roadmap describe entrega parcial y límites, cuatro idiomas/digest actualizado.
T05k: paridad parcial de título/check/footer/contexto/fondo. Corrige grid de
ancho cero al comprimir sidebar (captura RED, banco de geometría GREEN).
438 archivos/3420 tests, lint/build final PASS; evidencia isa-1094/route-pass-01.
Faltan pestañas y operaciones avanzadas/cálculo; no review >9 ni Wails. Dos
repeticiones visuales fallaron al guardar, otra pasó: causa aún no demostrada.
Siguiente gate visible de repositorio cargado (owner ya rechaza desconocido),
prueba retrasada; después datos/plan/revisiones y tareas nativas pendientes.
T05l resuelve el gate de apertura con RED/GREEN de carga retrasada: botón y
submit esperan versión conocida, preparación sigue editable, error con reintento.
10 focales/tipos/lint PASS; 3 recorridos harness posteriores completos/geométricos
sin pageerror. No atribuir causalidad a los fallos históricos sin evidencia.
Siguiente operaciones de datos y revisión; global posterior pendiente.
Gate #1095 T08h final: 436 archivos/3412 tests, lint/build PASS, con avisos
heredados de teardown/chunks. No Wails/paridad/empírico nuevo ni promoción.

## T08 bootstrap de combinación — ISA-1095 (2026-09-10)

Base f661d82638591bf547df835ab71458d3bbc76401; C:/tmp/vantare-isa1095,
rama vantareapp/isa-1095-recorded-source-combination. Continúa dependencias de
#1094/#1088 antes de conectar la ruta de cinco pasos. PrepareCorrections ahora
expone identidad del clasificador Go sobre la sesión ya leída; metadata ausente
no bloquea correcciones ni fabrica combinación. RED/GREEN, permisos/revisiones
previos y vet focal PASS; build frontend PASS. Go global/vet en curso.
Siguiente: contrato TS/apertura sin combinación previa, opciones de identidad
sin recuentos inventados y selección explícita dentro del recorrido A4.
Evidencia isa-1095/README.md. No banco real nuevo ni cambios de criterios físicos.
T08b contrato TS: RED8 de forma inválida; 35 focales/tipos/lint focal PASS.
Sigue apertura explícita que resuelva identidad cuando no hay selección previa.
Gate final T05h: 432 archivos/3384 tests frontend, lint/build PASS; sustituye
la anotación pendiente de la sección anterior. La ruta A4 completa sigue pendiente.
T08a Go global -p1 y vet general PASS. T08c apertura sin combinación previa:
RED3/GREEN45 focales, tipos/lint PASS; identidad nativa comprobada contra proyección,
rechazo/cierre si falta o contradice selección. Siguiente: opciones de identidad
independientes de estadísticas, propietario/bootstrap UI y recorrido integrado.
T08d permite identidades mínimas en el asistente/calendario, sin recuentos
inventados: 17 focales/tipos/lint PASS. Todavía no hay nueva ruta montada.
T08e apertura del owner sin combinación y aceptación explícita de propuestas:
13 focales/tipos/lint PASS; se rechazan identidades contradictorias, mezcla de
fuentes y calendario incompatible. Abrir no acepta ni avanza. Siguiente:
integración productiva conservando propietario de handles y guardado nativo.
T08f owner del recorrido une aceptación y persistencia; conserva handles al
pasar preparación/editor, sólo abre editor tras respuesta nativa y mantiene
cambios ante conflicto. Doble escritura/edición durante escritura bloqueadas.
11 focales/tipos/lint PASS. Sigue montaje visual/ruta, no aceptación Wails.
T08g resumen A4 TSX/CSS con valores reales del borrador, cálculo/validación
pendientes y copy en cuatro idiomas: 3 focales/tipos/lint PASS. Aún sin montar;
no certificado visual. Sigue composición asistente/resumen/biblioteca.
T08h compone recorrido con Drawer existente, confirmación de descarte y guard
de suspensión; sin versión nativa conocida no crea. Seis focales/tipos/lint
PASS; suite general/lint/build en curso en C:/tmp/isa1095-t08h-*.log. Siguiente
montaje de entrada productiva y reapertura/listado. Componentes siguen sin
sustituir entrada anterior; no Wails/paridad/cálculo completo certificados.

## T05 asistente registrado — ISA-1094 (2026-09-10)

Base e95d3bbb; C:/tmp/vantare-isa1094, rama vantareapp/isa-1094-recorded-wizard.
Estado actual: componentes A4 Inicio/Combinación/Reglas/Pilotos y orquestador
de cinco pasos implementados y probados, **todavía sin sustituir la ruta anterior**.
Borrador sin cantidades inventadas; calendario versionado; selección canónica,
referencias completas, validación de valores presentes y estimación de pilotos
con referencia/delta. Reglas avanzadas y conexión de campos nuevos al solver
siguen en T02/T06/T07. Detalle de cortes en evidencia/isa-1094/README.md.

Persistencia e0993a00: PlanDraft nativo create/save_revision/open y payload
strategy.recorded.draft.v1; no otro almacén. Edit nativo sólo valida en memoria,
no persiste. Guardar configuración conserva revisión y campos ausentes sin
activar un plan ni fabricar cálculo. Reapertura con repositorio Go real PASS.
Gates T05g2: 431 archivos/3381 tests frontend, tipos/lint/build, Go global -p1
y vet app/strategy/telemetryanalysis/cmd PASS. No benchmark físico ni Wails.

T05h extrae useRecordedSessions y vista reutilizable conservando la API anterior.
16 focales PASS, tipos/lint focal PASS; prueba de desmontar/remontar vista sin
cerrar handles y cierre al salir del propietario. Gate general posterior pendiente.
El propietario debe seguir montado y su padre estar identificado por evento/combinación.

Siguiente: bootstrap/descubrimiento T08 y conexión del asistente al editor.
El catálogo actual necesita sesiones ya autorizadas; descubrir archivos sólo
devuelve candidatos sin identidad de coche/circuito. Abrir un archivo explícito
debe permitir resolver esa identidad en Go antes de elegir combinación. Reusar
Analysis/StrategyRevisionCatalog; no importar todos los archivos ni abrir reserva.
También falta montar contexto/footer A4 y revisar visualmente la ruta completa.
Sin paridad final, aceptación Wails, push/PR/CI remoto, merge ni promoción.

## T04 A4 productivo — ISA-1093 (2026-09-09)

Base7446c0e6; worktree C:/tmp/vantare-isa1093, rama vantareapp/isa-1093-recorded-a4.
Marco React integrado, todavía recorrido anterior (transición, no A4 completo).
T04a: 51 focales y 421 archivos/3322 tests PASS; lint/build PASS. T04b Call RED/GREEN y tipos/lint focal PASS. T04c arte final/dimensiones en e2359a4f; suite general posterior en curso. Banco visual recuperado: Call explícitamente no disponible; frame-01.png sin errores. Arte final/dimensiones ya aplicados; recorrido, contexto y footer aún pendientes. Continúa T05 #1094 desde este stack.
Evidencia isa-1093/README.md. #1092 T02c4: 3321 tests frontend PASS.
Continuar T04/T05 según SDD sin pedir permiso por corte; T02 entradas, T03 estados,
Wails y calibración siguen pendientes. Sin cambio de autoridad ni promoción.

## SDD T02a — reglas recibidas por Orbit, ISA-1092 (2026-09-09)

Base6d4aa514; rama vantareapp/isa-1092-recorded-event-inputs,
C:/tmp/vantare-isa1092. Matriz de entradas en evidencia/isa-1092/README.md.
Primer corte backend: event.rules opcional reutiliza EventRules del solver,
aplicado en búsqueda, comparación Weather y replay final mediante el adapter
común. Tests RED/GREEN para min/max paradas, negativos, driverLimits sin perfil,
ventana obligatoria y override que la viola. Documento/TS/UI aún no emiten reglas.
T02a commit ad8774a5: Go global y vet PASS. T02b: contrato de reglas con evidencia y schema2.1.0 validado; Go global/vet PASS. T02c1: crear/editar promueve schema al añadir reglas; reapertura y Go global/vet PASS. T02c2: cliente TS validado; 420 archivos/3320 tests, tipos, lint y build PASS. T02c3 compatibilidad legacy RED/GREEN y Go global/vet PASS; T02c4 enlaza pantalla y captura reglas/evidencia en revisión; 14 focales, lint/build PASS, suite frontend global en curso. Continúa T04 #1093, sin cerrar entradas pendientes de #1092. Evidencia detallada en isa-1092/README.md; UI aún pendiente.

T01/ISA-1089: commit6d4aa514, build frontend, Go global -p1 y vet PASS.
Intento Wails diagnóstico PID18668 terminó sin abrir CDP: puerto39261 ocupado,
hotkeys en uso y fallo de controlador WebView. PID26412 de1072 preservado;
no se atribuye todo el fallo a una única causa no demostrada. No cerrar T01
runtime ni declarar benchmark físico. No se tocó LMU. Avanzar tareas independientes.


## Ejecución SDD reanudada — T00/T01, ISA-1089 (2026-09-09)

Isaac autoriza iniciar todo el SDD v1.0. Se levanta la pausa documental anterior;
continuidad entre tareas vigente, sin subagentes de código ni permiso por corte.
Base43d415f4; rama vantareapp/isa-1089-recorded-solver-timeout,
C:/tmp/vantare-isa1089. Timeout Imola reproducido con input Wails capturado,
perfil señala coste repetido de paradas/allocaciones. Caché acotada por búsqueda
reutiliza resultados de CalculatePitStop sin cambiar alternativas ni ecuaciones.
RED 8.02 s; primer GREEN5.88 s. Suites solver/application secuenciales PASS;
una ejecución concurrente volvió a agotar deadline: no se oculta contención.
Gates globales, repeticiones comparables y Wails pendientes. No se declara T01
cerrado ni óptimo físico. Después T02/T03 y porte A4 T04 según dependencias.


## SDD integral y pausa de implementación — ISA-1091 (2026-09-09)

Isaac solicita consolidar chat, roadmap y contratos para continuar después sin
pausas repetidas. [SDD v1.0](../../strategy-planner/sdd/README.md),
[ejecución T00–T24](../../strategy-planner/sdd/execution.md) y
[aceptación A01–A21](../../strategy-planner/sdd/acceptance.md) son la secuencia
vigente de este alcance; las notas posteriores conservan historia, no una cola
alternativa de pendientes. Base 0240bc7806570be17832aea6153300631f392170,
rama vantareapp/isa-1091-strategy-sdd, C:/tmp/vantare-isa1091.

Entrega sólo documental, implementación pausada por Isaac. Al reanudar: T00 y
T01 (#1089); avanzar dependencias y cortes automáticamente, sin permiso por
commit/test/issue. A4 sigue por portar; calibración empírica sigue sin cerrar.
Una decisión de umbrales se prepara agrupada con evidencia y no bloquea UI o
integridad independientes. Código sin subagentes; excepción visual ya autorizada.
No app/build/LMU en esta entrega. Sin promoción ni release.


## Discovery del corpus real — ISA-1090 (2026-09-09)

Base 7d504d780095b0d81044824d7d2182599e94ac89; rama
vantareapp/isa-1090-analysis-discovery-limit, C:/tmp/vantare-isa1090.
Reproducción Wails de #1088: límite de composición 128 impide descubrir carpeta
con >400 archivos; ErrCandidateLimit se presentaba como formato incompatible.
Servicio y composición admiten ahora 1024, mismo límite que importador existente;
el exceso produce error específico, sin truncamiento ni lectura de contenido.
Se mantienen cuatro sesiones abiertas y todos los presupuestos de lectura.
Regresión 400/1024/1025 RED/GREEN; full Go/vet, frontend 420 archivos/3308 tests,
build y lint PASS. Wails descubre 416 archivos; abre Imola, aplica referencia
exacta y cierra sesión. Persistencia y SHA originales comprobados. Evidencia
en docs/strategy-planner/evidence/isa-1090/README.md. Build diagnóstica, no
aceptación visual A4 ni validación de producción/licencia.
El timeout de cálculo real queda en #1089; no se cambia solver en este corte.

## UI y validación real — ISA-1088 (2026-09-09)

Rama vantareapp/isa-1088-recorded-session-ui, C:/tmp/vantare-isa1088,
base 7b0afab9. Panel Sesiones conectado con apertura/preparación/revisión exacta.
Banco real Imola/Monza y lectura de entradas por Strategy PASS; hashes intactos.
Wails abre; evento nuevo de Imola reproduce timeout (#1089). Acceso a Sesiones
ante fallo corregido con RED/GREEN. Búsqueda real bloqueada por límite 128,
frente a carpeta >400: siguiente corrección aislada. No se certifica recorrido
UI completo, A4 productivo completo ni precisión física. Detalle:
docs/strategy-planner/evidence/isa-1088/README.md. Runtime liberado para #1072.

## Consumidor conectado — ISA-1087 (2026-09-09)

Base 11676e9958d951fc1ed999055b4b38f0103590d0; rama
vantareapp/isa-1087-connect-revision-inputs; C:/tmp/vantare-isa1087.
GetEventPlanningInputs despacha referencias completas al productor autorizado;
valida proyección, combinación y referencias exactas antes de entregarlas.
Sin proveedor, fuente o revisión falla sin volver al catálogo observado.
Selecciones antiguas sin referencias conservan su vía. Consulta sin escritura,
ajustes conservados y respuesta tardía tras cancelación rechazada.
Main construye Strategy después de Analysis/licencia usando el adaptador.

Pruebas y límites: docs/strategy-planner/evidence/isa-1087/README.md.
Siguiente: enlazar la preparación y selección de revisiones desde UI productiva,
con reapertura explícita de fuentes. C7, operaciones restantes, calibración real
y aceptación visual/Wails siguen pendientes. LMU intacto. Sin promoción/release.

## Proyección conjunta autorizada — ISA-1086 (2026-09-09)

Base 40e95273; rama vantareapp/isa-1086-authorized-revision-producer;
worktree C:/tmp/vantare-isa1086. Adapter de catálogo reutiliza derivación escalar
y productor Analysis para referencias exactas de sesiones abiertas autorizadas.
Valida identidad/base/revisión/snapshot, combinación, cancelación y licencia;
rechaza fuentes cerradas/ambiguas y conserva límite existente de cuatro abiertas.
No devuelve parciales ni mezcla estadísticas agregadas. No es servicio Wails.

Isaac autoriza de nuevo PC/build/app; LMU intacto. Build frontend PASS.
App/Analysis completos, vet, Go global y diff check PASS. Detalle en
docs/strategy-planner/evidence/isa-1086/README.md.
Siguiente: conexión al consumidor Strategy y composición main; luego reapertura,
UI productiva y operaciones/calibración pendientes. Sin push/PR/CI remota,
merge, promoción o release. No se anuncia C7 completo ni precisión física.

## Cliente de selección exacta — ISA-1085 (2026-09-09)

Base ae6eb45f; rama vantareapp/isa-1085-selection-revision-client;
worktree C:/tmp/vantare-isa1085. Cliente de eventos valida/conserva referencias
exactas y concordancia con proyección. Helper existente mantiene referencias y,
al cambiar selección, retira proyección del evento y caché derivada tras ack,
conservando overrides. Misma selección mantiene datos; error conserva vista.
Sin cambios visuales. Cuatro TS/test, sin nueva dependencia ni Go.

RED de siete casos; GREEN focal 42 tests y typecheck PASS. Frontend global
418 archivos / 3294 tests, lint y diff check PASS.
Detalle: docs/strategy-planner/evidence/isa-1085/README.md. Sin app ni builds.
Siguiente: conectar productor autorizado de revisiones; sigue el rechazo
explícito de #1084. UI y operaciones restantes, calibración y Wails pendientes.
Sin push/PR/CI remota, merge, promoción ni release.

## Selección de revisiones — ISA-1084 (2026-09-09)

Base c1db89f9; rama vantareapp/isa-1084-plan-analysis-revision;
worktree C:/tmp/vantare-isa1084. SessionSelection conserva AnalysisRevisionRef
opcional, validada, incluida en la serialización. Selección fijada exige cobertura
completa de incluidas y coincidencia exacta de la proyección guardada. Excluidas
pueden conservar su referencia sin participar. Sin promoción de calidad ni I/O.

GetEventPlanningInputs rechaza la selección fijada mientras no se conecte su
productor autorizado: el catálogo antiguo no puede ignorar referencias. C7 no
está completo. Siguiente: contrato TS, productor de revisiones y UI; luego
operaciones restantes, calibración y aceptación real. Evidencia en
docs/strategy-planner/evidence/isa-1084/README.md.

Sin app/builds por instrucción de Isaac. Focales document/application PASS;
Vet y diff check PASS. Go global FAIL: dos paquetes sin frontend/dist y
flaky SQLite #708 (WAL deadline). Tres repeticiones aisladas PASS sin cambios.
No se fabrican assets para ocultarlo. Sin push/PR/CI remota, merge o promoción.

## Cliente nativo de Analysis — ISA-1082 (2026-09-09)

Base f68e2214; rama vantareapp/isa-1082-native-analysis-client;
worktree C:/tmp/vantare-isa1082. Cliente TS de discovery, apertura explícita,
páginas y preparar/guardar/cargar/proyectar correcciones. Reutiliza el parser
de proyección existente. Métodos Wails cerrados, cancelación nativa y descarte
tardío, sin reintentos automáticos. Conserva calidad/presencia y rechaza páginas
o revisiones de otra petición. Los digests se validan estructuralmente.

No se abre app ni se generan builds por instrucción actual de Isaac.
Frontend 418 archivos / 3281 tests, tipos, lint y diff check PASS. Evidencia:
docs/strategy-planner/evidence/isa-1082/README.md.
Faltan selección persistida, agregación, operaciones restantes y UI productiva;
la aceptación visual/Wails y precisión física siguen pendientes. Sin fuentes
reales, LMU, push/PR/CI remota, merge, promoción o release.

## Comandos escalares autorizados — ISA-1081 (2026-09-08)

Base 89bdb65e; rama vantareapp/isa-1081-authorized-correction-commands;
worktree C:/tmp/vantare-isa1081. Servicio TA-03E guarda, consulta y proyecta
revisión exacta manteniendo autorización/lifecycle, incluso antes de replay.
Raíz persistente Analysis configurada por main, separada de staging/originales.
Targets resueltos contra páginas requeridas, errores de custodia sanitizados.

Corregida con RED/GREEN una incoherencia de la conexión nueva: clasificación
inicial no conocía vueltas derivadas; ahora toma las vueltas completas de la
revisión recalculada y también retira elegibilidad cuando desaparecen.
App/Analysis completos, vet, build y Go global pasan.
No se publica UI ni se calcula una carrera real; fixtures controladas de contrato.
Siguiente: cliente nativo de fuentes/correcciones, selección de revisiones en
planes, operaciones restantes y UI productiva/paridad. Sin push/PR/CI remota,
promoción, release, lectura DuckDB real o LMU.

## Preparación autorizada — ISA-1080 (2026-09-08)

Base 40419038; rama vantareapp/isa-1080-authorized-correction-input;
worktree C:/tmp/vantare-isa1080. PrepareCorrections usa handle abierto, licencia
y parser/artefacto conservados por el servicio TA-03E. Analysis lee canales
requeridos con presupuestos explícitos y produce base/revisión vacía estable.
No usa el handle temporal como identidad de revisión. Lectura serializada;
sin truncado, nuevos criterios, inferencia de reloj ni caminos desde el cliente.
Error de lector retira/limpia; limpieza fallida sigue registrada para reintento.

RED/GREEN de Analysis y app; suites focales completas y vet pasan.
Build y Go global pasan. Fixtures registradas sanitizadas para paginación
y contratos controlados para permisos/lector; no banco DuckDB real ni Wails.
Siguiente: guardar/cargar/proyectar con autorización en servicio, lectura de
canales adicionales según objetivos, selección persistida y UI. No se declara
editor completo. Sin push/PR/CI remota, promoción, release o LMU.

## Unión de revisión durable y cliente — ISA-1079 (2026-09-08)

Base 4452fe4b; rama vantareapp/isa-1079-revision-binding;
worktree C:/tmp/vantare-isa1079. CorrectionStore.DeriveProjectionSession exige
ID exacto, carga esa revisión, recalcula su snapshot y emite referencia junto
a las familias. No sustituye revisión ausente por la cabeza. Prueba registrada
controlada: tras restaurar la base se puede recalcular la corrección anterior.
Cliente TS tipa/valida cobertura y digests; casos focales pasan (27 tests).

Build, Go global, vet, lint y typecheck pasan. Frontend inicial: 3261 pasan,
3 fallan (dos timeouts Pedals Redline y presupuesto OverlayFrame CPU 1,562 ms
frente a 1,5 ms), con Go/build concurrentes. Los 6 tests de esos dos archivos
pasan aislados; repetición completa con dos workers: 416 archivos y 3264 tests
pasan. No se cambian umbrales ni código Overlay. Happy-dom emite AbortError
durante teardown, con resultado final y código 0. Evidencia en isa-1079.

No conectado todavía a autorización vigente, comandos del editor ni planes.
La llamada a custodia sigue exigiendo que el servicio autorice fuente y páginas.
Sin dependencias, fuentes reales leídas, LMU, promoción ni release.

## Referencias de revisión en proyecciones — ISA-1078 (2026-09-08)

Base d458879f, rama vantareapp/isa-1078-projection-revisions,
worktree C:/tmp/vantare-isa1078. Contrato V2 aditivo con sourceRevisions:
sesión/base/revisión/snapshot. Validación de cobertura completa, digests y
rechazo de IDs cruzados. Productor conserva referencias sin alias; no cambia
familias ni payload legado sin referencias. Analysis, vet, build frontend y
suite Go global pasan. RED anterior por API ausente documentado.

Pendiente unir estos IDs a la revisión duradera y sus derivados en el servicio
autorizado, validar el consumidor TS y exigirlos al guardar planes registrados.
No es conexión del editor todavía. Continúan operaciones de uso por familia,
clasificación/límites, UI productiva, calibración y validación real Wails.
Sin nuevas dependencias, fuentes reales leídas, LMU, push/PR/CI remota,
promoción o release.

## Derivaciones escalares — ISA-1077 (2026-09-08)

Sobre 1980c3d4, rama vantareapp/isa-1077-corrected-derivation, worktree C:/tmp/vantare-isa1077.
DeriveCorrectedSession revalida base/parser/schema, aplica snapshot completo y
reutiliza validez, consumo/ritmo, curvas y boxes. Resultado separado del catálogo
observado, con Base/SnapshotID. No publica todavía una proyección corregida.
Prueba sobre fixture registrada sanitizada: cambio controlado de Lap Time se
refleja en la derivación; calidad invalidada sigue excluida aunque cambie el valor.
No es calibración de precisión. Analysis, vet, build frontend y go test ./... pasan.
Siguiente: referencia exacta de revisión en proyección/selección y servicio autorizado;
operaciones de uso por familia/clasificación/límites y UI todavía pendientes.


## Vista efectiva escalar C3 — ISA-1075 (2026-09-08)

Base 0892b9a9, rama vantareapp/isa-1075-correction-view, worktree C:/tmp/vantare-isa1075.
ApplySampleCorrectionSnapshot revalida el conjunto completo frente a canales y
páginas de la misma base autorizada; rechaza cobertura insuficiente/ambigua,
original cambiado e integridad de snapshot alterada. Copia páginas, valores y
punteros de timestamp. Conserva calidad, tiempos y procedencia de la corrección.
Tests Analysis/vet y build frontend pasan. Suite Go completa falla por la carrera conocida de Engineer/voiceinput #812; reproducida en 200 repeticiones y documentada sin tocar Engineer. No se declara gate global verde.
Todavía no conecta derivados, comandos o UI. Siguiente: revisión referenciada
por los derivados y aplicación de operaciones de selección por familia.
Sin dependencias, originales modificados, subagentes, promoción ni publicación.


## Custodia escalar C2 — ISA-1074 (2026-09-08)

Sobre 9b4df895, rama vantareapp/isa-1074-correction-custody, worktree C:/tmp/vantare-isa1074.
JSON privado por base, lease nativo, historial encadenado, expectedRevision,
commandId idempotente y restauración de snapshots sin reescribir revisiones.
Backup validado/cuarentena; ausencia de ID exacto es error, nunca sustitución.
Primer commit con confirmación perdida devuelve incertidumbre y admite reintento.
Límites: 256 correcciones, 256 revisiones, 8 MiB; son presupuestos de recursos.

Tests de custodia/Analysis y vet pasan; build frontend pasa; suite Go completa
pasa sobre el último código; compilación de Analysis para Linux también pasa. La custodia exige autorización vigente del servicio Analysis futuro;
los hashes no conceden permiso. No UI/bridge/vista efectiva conectados todavía.
Siguiente C3: aplicar correcciones a páginas autorizadas sin cambiar originales.
Sin nuevas dependencias, originales modificados, promoción ni publicación.


## Dirección visual aceptada e implementación — 2026-09-08

Isaac acepta 769775bd y autoriza desarrollar el plan con esa visión visual.
La aprobación cubre el asistente unificado de cinco pasos y el editor A4/Orbit.
Live/Monte Carlo siguen aplazados. Se implementa personalmente, conservando
el bucle adversarial visual al conectar pantallas; sin delegación de código.

Primer corte #1073 sobre 769775bd: snapshots escalares puros, canónicos y
atómicos en Analysis. Rama vantareapp/isa-1073-correction-snapshots; worktree
C:/tmp/vantare-isa1073. Tests focales y paquete Analysis pasan; build frontend
pasa; suite Go completa y vet de Analysis pasan. No existe aún custodia ni UI conectada.
Siguiente: custodia/revisiones bajo lease, vista efectiva y proyección, comandos
de Strategy, UI productiva, plan reproducible y validación con carreras reservadas.


## Combinación unificada — 2026-09-08

Isaac elimina la repetición Simulador/Evento/Combinación. El asistente tiene cinco
pasos: Inicio, Combinación, Reglas, Pilotos y Sesiones. Combinación reúne evento
personalizado o calendario Vantare, simulador, categoría/coche y circuito.
Calendario permanece sin conectar en la propuesta; no se inventan eventos.
Los enlaces antiguos de Simulador/Evento redirigen a Combinación. La galería
retira ambas pantallas y actualiza las capturas del asistente. Base 56ce59cd,
misma rama/worktree ISA-1063. Sin cambios productivos ni promoción.


## Recorrido completo listo para revisión humana — 2026-09-08

Isaac acepta el corte local 4c08b834 de stint y parada y pide extender el mismo
bucle a las doce pantallas restantes antes de implementar la integración productiva.
Asistente Inicio/Simulador/Evento/Combinación/Reglas/Pilotos/Sesiones y editor
Carrera/Datos/Plan/Cálculo/Revisiones. Se mantienen originales intactos, cálculo
y guardado desconectados. El prototipo usa metadatos del banco existente.

Cuatro revisiones independientes: mínimos 7,9 → 8,7 → 8,9 → 9,1/10.
Las doce pantallas superan >9 individualmente; Plan y Revisiones llegan a 9,2.
Stint/parada mantienen 9,2/9,1 sin regresiones materiales. Falta aceptación humana. La evidencia vive en `docs/strategy-planner/evidence/isa-1063-all-screens`.
Rama `vantareapp/isa-1063-orbit-prototype`, worktree `C:/tmp/vantare-isa1063-orbit`,
base 4c08b834. Sin merge, release ni conexión nueva de DuckDB.

## Bucle visual adversarial — ISA-1063 (2026-09-08)

Isaac rechaza la semejanza de 42c9dec8 y autoriza excepcionalmente un subagente
solo para revisión visual adversarial. El bucle exige nota estrictamente >9/10
antes de solicitar su revisión. Tres pasadas: parada/stint 8,0/8,4; 8,7/8,9;
**9,1/9,2**. Gate final = menor nota = **9,1/10**. Isaac aún debe aceptar.

Corte sobre 42c9dec8, misma rama/worktree. Cabecera, imagen decorativa, agrupaciones,
jerarquía, recursos, servicios, iconos y footer reconstruidos contra referencias
1672 × 941. Enlaces #pit/#stint para revisar las vistas; curvas sin valores y
cálculo deshabilitado. Sin backend ni originales tocados. Evidencia y límites:
`docs/strategy-planner/evidence/isa-1063-visual-loop/review-03.md`.

El gate cubre solo stint y parada a ese tamaño, no todas las pantallas ni el
producto conectado. El siguiente paso es revisión de Isaac de estas capturas y
recorrido; después continuar visual/conexión según el plan aprobado.

## Visual en código antes de conexión — ISA-1063 (2026-09-08)

Isaac considera plano el prototipo e53bb132 y excesivo el concepto rojo posterior.
Pide un punto medio y fija el orden: primero completar la parte visual en código,
después enlazar datos y motor. Se mantiene la dirección A4; no se considera
aceptado el acabado concreto de esta nueva iteración antes de que lo vea.

Corte local sobre e53bb132, misma rama y worktree: cabecera compacta, línea de
carrera con selección, iconos, métricas pendientes, tablas, restricciones,
servicios paralelos y evolución vacía. Rojo en selección e iconos; paneles neutros
con tinte leve. Cambian plan-preview.js y recorded-editor.css, sin dependencias.
Se conserva el asistente y la revisión de datos. No se conecta I/O ni solver.

Verificación personal en Chrome y evidencia en el README. Siguiente: revisión
visual del recorrido en código; después custodia/conexión en cortes por issue.
No reordenar los contratos internos ni saltar su validación por esta decisión.

## A4 aceptado y adaptado a Orbit — ISA-1063 (2026-09-08)

Isaac acepta A4 y las pantallas de edición, cálculo, resultado, stint y parada;
pide conservar el diseño con los colores actuales de Vantare y continuar.
Este corte sobre `799049e8`, rama `vantareapp/isa-1063-orbit-prototype`, añade
el garaje decorativo, la composición A4 y navegación documental Plan/Stint/Parada/
Cálculo/Revisiones. Reutiliza tokens, fuentes, iconos y shell Orbit productivos.
El editor comprime la columna contextual. Solo datos y reglas serán editables;
los segmentos los construye el solver. Valores pendientes y cálculo deshabilitado.

La dirección visual está aceptada; la integración productiva sigue pendiente.
No hay persistencia, ejecución del solver ni lectura nueva de DuckDB en este
prototipo. Siguiente corte: snapshots/solapes y custodia reversible con su issue;
después conectar el editor sin duplicar lectores ni motores.
Verificación y capturas en el README del prototipo. Sin push, PR, CI remota,
promoción, release ni modificaciones de fuentes LMU.

## Actualización ISA-1067 — base autorizada (2026-09-08)

Base `7f04dd93`, rama `vantareapp/isa-1067-correction-source`.
Analysis marca sesión/versión al derivar y produce la base exacta de corrección.
Los análisis legacy sin marca requieren reanálisis; no se versionan al leerlos.
Sin cambios de criterios, fuentes o UI. Evidencia en
`docs/strategy-planner/evidence/isa-1067/README.md`.
Siguiente: snapshots/solapes y custodia reversible; después conexión a Strategy.


## Actualización ISA-1066 — C1a (2026-09-08)

Isaac acepta #1063 como dirección visual inicial. Primer código de correcciones
sobre `b486050c`, rama `vantareapp/isa-1066-sample-corrections`: identidad de base
y preparación de un escalar con precondición/original intacto. No persistencia,
UI conectada, revisión guardada ni solver. Evidencia:
`docs/strategy-planner/evidence/isa-1066/README.md`.
Siguiente C1b/base autorizada y snapshots, después C2/custodia. Sin subagentes,
fuentes modificadas, promoción o publicación.


## Actualización ISA-1063: propuesta visual lista (2026-09-08)

Base `609a4390`, rama `vantareapp/isa-1063-strategy-prototype`.
Propuesta navegable en `docs/strategy-planner/prototypes/recorded-editor/index.html`.
Siete pasos y pantalla con resumen/revisión; prueba Chrome del recorrido y deshacer.
No implementa el editor productivo. Isaac debe revisar la composición concreta,
conforme al gate visual de #1028. El contrato #1033 sigue propuesto y la calidad
empírica no se declara validada. Sin datos originales modificados ni promoción.


## Actualización ISA-1030: relojes del banco (2026-09-08)

Corrección instrumental sobre `18f9dea4` en `vantareapp/isa-1030-clock-evidence`.
El contraste real Imola/Algarve reproduce un desfase de 119,48 s en el spike y
recupera el repostaje de Algarve. Producto conserva origen desconocido; no se
cambia su contrato por una inferencia experimental. Ver
`docs/strategy-planner/evidence/isa-1030/clock-correction.md`.
Siguiente: propuesta navegable dentro de Strategy para revisión de Isaac;
anotación/calibración y contrato productivo de relojes siguen pendientes.
Sin promoción, release ni intervención en LMU.


## Resultado

Un único producto que crea, compara, guarda, ejecuta y adapta planes para
minimizar tiempo total esperado y mostrar riesgos/alternativas. Product A/B/C
son fases históricas.

## Autoridad y lectura

- `docs/vantare-program/README.md` y `product-contract.md`.
- Este handoff y la issue de GitHub activa. Linear fue retirado el 2026-08-20;
  las referencias posteriores a Linear se conservan solo como historial.
- `docs/superpowers/specs/2026-07-13-strategy-planner-product-b-design.md` y
  `strategy-base.html` son referencias históricas que deben reauditarse.
- El próximo informe de rescate y plan unificado sustituirán los planes PB.

## Estado

Actualización ISA-1033 (2026-09-08, contrato propuesto de correcciones):

- Base `8a2d8ff4`, rama `vantareapp/isa-1033-observation-corrections`, solo docs.
- ADR 0010 y `docs/strategy-planner/corrections-contract-v1.md`: Analysis posee
  correcciones sobre contenido+interpretación exactos; Strategy selecciona una
  revisión. Snapshots reversibles, fuente intacta y conflictos explícitos.
- Microplan posterior en `docs/superpowers/plans/2026-09-08-analysis-corrections-contract-implementation.md`.
- Propuesta revisable, no persistencia/UI implementadas ni umbrales aprobados.
- Bloqueos de aceptación: #1030 (anotación/calibración/holdout), Wails, prototipo
  y F1–F5. Live sigue aplazado. No hubo promoción ni datos reales modificados.

Actualización ISA-1038 (2026-09-08, cierre local del saneamiento):

- Código `5a5feb44`, cierre documental en `vantareapp/isa-1038-review-closeout`.
- Revisión personal terminada; siete hallazgos conocidos tratados en cortes por
  issue, con regresiones. Go completo/build/typecheck/lint PASS; frontend final
  416 archivos / 3256 tests PASS. Sin subagentes.
- Informe consolidado: `docs/strategy-planner/evidence/isa-1038/closeout.md`.
- Preparar #1033 documental. Siguen anotación/calibración/holdout #1030, Wails,
  prototipo revisado y fases F1–F5. El editor completo no está implementado.
- Sin promoción, PR/CI remota, fuentes modificadas o intervención en LMU.

Actualización ISA-1042 (2026-09-08, alcance del comparador avanzado):

- Rama `vantareapp/isa-1042-weather-comparison-scope`, base `686b1c23`.
- Weather usa las vueltas evaluadas de la variante activa, sin cálculo duplicado
  con boxes cero. Contrato y aviso explícitos de distancia fija ES/EN/PT/IT.
- Evidencia: `docs/strategy-planner/evidence/isa-1042-weather-comparison-scope.md`.
- La optimización temporal multiescenario sigue pendiente, visible como límite;
  no afecta a la autoridad del plan principal ni inicia live.

Actualización ISA-445 (2026-09-08, referencias y confianza):

- Rama `vantareapp/isa-445-reference-boundary`, base `b1211c99`, ejecución personal.
- Composición sin fixture o claves TEST; caché TEST rechazada. Catálogo vacío
  hasta confianza/publicación aprobadas. Guarda referencias solo para combinación
  canónica elegida y busca la variante dentro de esa combinación.
- Evidencia: `docs/strategy-planner/evidence/isa-445-reference-boundary.md`.
- Publicación sigue pendiente. No certifica reglas/condiciones ausentes del payload.
- Próximo: cierre personal de revisión, contrato #1033; Wails/holdout pendientes.

Actualización ISA-821 (2026-09-08, deadline por candidato):

- Rama `vantareapp/isa-821-candidate-deadline`, base `b85fa5f4`, ejecución personal.
- Contexto padre y deadline de 29 minutos; cliente conserva 30. No guarda éxito
  tardío y espera terminación antes del siguiente lote. Causas visibles ES/EN/PT/IT.
- Evidencia y límites cooperativos: `docs/strategy-planner/evidence/isa-821-candidate-deadline.md`.
- Continúan #445, validación Wails y calibración/holdout #1030. Sin promoción.

Actualización ISA-819 (2026-09-08, reconciliación de generaciones):

- Rama `vantareapp/isa-819-catalog-reconciliation`, base `bb266977`. Ejecución personal.
- Catálogo autorizado como autoridad; pérdidas reintentables, sin duplicar
  importaciones conservadas ni modificar consentimiento al consultar estado.
- Totales coherentes entre tandas y sesiones fuera del discovery actual.
- Evidencia: `docs/strategy-planner/evidence/isa-819-catalog-reconciliation.md`.
- Wails sigue pendiente; próximos cortes #821/#445 y gate empírico #1030.
- Sin cambios de originales, LMU o promoción.

Actualización ISA-1043 (2026-09-08, calidad de vueltas con boxes):

- Rama `vantareapp/isa-1043-pit-lap-overlap`, base `1ac45d69`. Ejecución personal.
- Se añaden las transiciones de boxes dentro de vuelta a las etiquetas;
  ritmo excluido, FamilyPit/ObservedStrategy conservadas. Sin nuevos umbrales.
- RED/GREEN y paquete telemetryanalysis PASS sin modificar fixtures previas.
  Build/Go completo/digest PASS. Evidencia: `docs/strategy-planner/evidence/isa-1043-pit-overlap.md`.
- Continúan recuperación #819, deadline #821, referencias #445 y gate empírico
  #1030. Sin modificaciones de originales ni promoción.

Actualización ISA-1042 (2026-09-08, reloj normal de Orbit):

- Rama `vantareapp/isa-1042-timed-race-horizon`, base `b7991919`, ejecución
  personal. El horizonte se resuelve junto con paradas/recursos; replay
  comprueba inicio real de última vuelta y llegada. Ciclos no publican plan.
- Golden de cuatro horas: 136 vueltas, cuatro paradas, llegada 4:00:00.
- Evidencia: `docs/strategy-planner/evidence/isa-1042-timed-horizon.md`.
  Go completo/build/typecheck/lint PASS; frontend 415 archivos / 3241 tests PASS.
- El comparador avanzado Weather continúa a distancia fija; este corte no
  lo certifica para tiempo. Sigue fuera del editor inicial de un solo óptimo.
- Continúan #1043/#819/#821/#445, calibración/holdout #1030. Se solicitó a
  Isaac una carpeta con carreras completas nuevas para la validación reservada.

Actualización ISA-1041 (2026-09-08, primer corte de saneamiento validado localmente):

- Isaac autoriza continuar hasta terminar; ejecución personal sin subagentes.
- Rama `vantareapp/isa-1041-orbit-final-evaluation` desde `286f99e8`, worktree
  `C:/tmp/vantare-isa1041`. Microplan: `docs/superpowers/plans/2026-09-08-strategy-final-evaluation.md`.
- El plan definitivo se valida con carga explícita, recursos/reserva del
  solver y costes del replay. No se hereda optimalidad; aviso ES/EN/PT/IT.
- Evidencia: `docs/strategy-planner/evidence/isa-1041-final-evaluation.md`.
  Go completo/build/typecheck/lint PASS; frontend 415 archivos / 3241 tests PASS.
- Continúan #1042, #1043, #819, #821 y #445 en cortes separados. #1030 mantiene
  pendiente calibración/holdout. No se abre todavía el gate de nuevas secciones.
- Sin promoción, release, cambios de LMU o fuentes originales.

Actualización ISA-1038 (2026-09-08, revisión personal previa a nuevas secciones):

- Isaac exige Ponytail + code review y ejecución sin subagentes. Revisión sobre
  `4ce96ded` en `C:/tmp/vantare-isa1038`, sin fixes productivos.
- Veredicto NO-GO para nuevas secciones. Informe, cobertura, límites y seis
  reproducciones: `docs/strategy-planner/evidence/isa-1038/README.md`.
- #1041: recursos/reserva/coste del plan final; #1042: reloj y paradas;
  #1043: boxes dentro de vuelta. Reusar #819 para reconciliación, #821 para
  deadline y #445 para referencias de prueba/compatibilidad.
- 20 paquetes Go PASS; frontend Strategy 32 archivos / 273 tests PASS sobre
  mismo HEAD. Los probes reproducen defectos; no validan precisión real.
- Gate: corregir bloqueos en microcortes, revisar y revalidar antes de nuevas
  secciones. #1030 mantiene anotación/calibración/holdout pendientes.
- Sin Wails, datos originales, cambios de LMU, push, PR, CI remota ni promoción.

Actualización ISA-819 (2026-09-08, segundo corte local):

- Continuación autorizada desde `034cf537`, misma rama aislada de #819.
- Recuperación de cold-start preservando decisión, backup validado y cuarentena;
  causas explícitas desde composition root hasta cliente/banner ES/EN/PT/IT.
- Evidencia: `docs/strategy-planner/evidence/isa-819-cold-start-status.md`.
- Go completo, build, typecheck y lint PASS. Frontend completo: tres timeouts
  iniciales fuera del corte; repetición con dos workers 3240/3240 PASS.
- No cierra #819: falta reconciliar generaciones entre catálogo y progreso tras
  recuperación, y validar el resultado en Wails con perfil de prueba separado.
- Sin cambios de solver, datos reales, deadline #821 ni promoción.

Actualización ISA-819 (2026-09-08, primer corte local de recuperación):

- Isaac autorizó continuar los microplanes de #1030. Rama aislada
  `vantareapp/isa-819-authorized-store-recovery` desde `f29fe3d6`.
- Store autorizado con backup validado, cuarentena y errores tipados; test RED
  previo, paquete telemetryanalysis y `go test ./...` PASS. Build frontend PASS
  para assets Go.
- Evidencia: `docs/strategy-planner/evidence/isa-819-store-recovery.md`.
- #819 sigue abierta: cold-start y mensaje visible de indisponibilidad/
  recuperación aún pendientes. El banco empírico de #1030 no cambia de estado.
- Sin merge, promoción, release, intervención en LMU ni datos reales modificados.

Actualización ISA-1030 (2026-09-08, banco terminado, F0 empírico pendiente):

- Isaac aprobó plan maestro y auditoría v1; ejecución inline en worktree propio
  desde `b4de3035`, sin autorización de implementación o integración.
- Evidencia: `docs/strategy-planner/evidence/isa-1030/README.md` y `code-matrix.md`.
  Tests focales de validez/discovery y backtest PASS; inventario 367/367 sin fallos.
- Banco autorizado por Isaac; LMU abierto intacto, fuentes con WAL excluidas.
  Helper aprobado ISA-1011 verificado por hashes; originales no modificados.
- Cuatro muestras de preparación inspeccionadas y reidentificadas tras leer.
  Reserva congelada: cuatro Race de 1–4 vueltas; las 19 Race de más de cuatro
  vueltas ya se analizaron en el spike histórico. No hay holdout completo suficiente.
- Faltan semántica/relojes, anotación independiente y calibración defendible.
  No se aprobó umbral ni se declaró precisión, óptimo validado o F0 completo.
- Siguiente acción: revisar `evaluation-protocol.md` y `next-slices.md` del
  expediente. Reusar #819/#821/#803; #1033 propone contrato de correcciones.
  Antes del óptimo, llevar reglas/inventario/perfiles al adapter del solver.
- Trabajo local documental e instrumental; sin código productivo, push, PR,
  CI remota, merge, release o promoción. #1030 sigue abierta.

Actualización ISA-1028 (2026-09-08, diseño funcional acordado con Isaac):

- Nueva prioridad: asistente Manual/Automático y pantalla editable sobre archivos
  registrados; LMU/DuckDB primero, formatos ampliables. Originales intactos,
  correcciones reversibles, calidad por cálculo, Fuel/VE, resultados parciales y
  revisiones reproducibles. Toda la experiencia se presenta desde Strategy,
  conservando Analysis como autoridad interna de lectura y derivación.
- Spec escrita v1 aprobada por Isaac el 2026-09-08 sobre el commit `a009231a`:
  `docs/superpowers/specs/2026-09-08-strategy-recorded-editor-design.md`.
- Este rumbo reemplaza la siguiente acción histórica de ISA-694. Live y la
  investigación OSS/Monte Carlo se aplazan hasta completar y validar este corte.
- Corrección de estado histórico: #867 sí se integró en `nightly@a02a1463`;
  los párrafos anteriores a esta fecha que lo llaman candidato son históricos.
- Issue #1028 solo entrega documentación sobre `origin/nightly@d6d0992f`.
  No se ha implementado esta nueva experiencia ni ejecutado el gate Wails/corpus.
- Plan maestro: `docs/superpowers/plans/2026-09-08-strategy-recorded-editor-master.md`.
  Primer plan ejecutable: `docs/superpowers/plans/2026-09-08-strategy-recorded-editor-audit.md`,
  issue #1030. Ambos v1 aprobados; estado posterior de ejecución arriba.

Actualización ISA-861 (2026-08-27, corte final candidato sobre
`origin/nightly@b1d5b15b`):

- La rama de integración incorpora el acumulado ISA-694 completo sobre el
  Nightly actual junto con el reader y runtime productivos de Telemetry
  Analysis. Strategy conserva Go como única autoridad de cálculo, catálogo y
  proyección; Orbit presenta datos, procedencia y causas de ausencia.
- El corte incluye importación histórica/cold start, selección por calendario,
  inputs por clima, backtests, referencias firmadas, SolveV2, reserva y
  persistencia canónica. No habilita subida remota ni publica catálogos.
- TA03E/TA03F ya fue promovida mediante PR #866 a `nightly@b1d5b15b`. Este
  corte final de Analysis/Strategy mantiene push, PR, CI y merge pendientes.
  La prueba Wails/LMU real continúa siendo el gate posterior; `testers`,
  `master` y release quedan fuera.

Actualización ISA-833 / contrato de ritmo por clase (2026-08-25, implementada en rama de issue):

- `StrategyInputProjection v2` declara la familia aditiva `classPace`, con
  presencia, procedencia, confianza, motivo tipado y `byClassName` indexado por
  nombre de clase. Una familia válida exige procedencia `reference` y valores
  positivos; la futura base compartida será la única fuente autorizada.
- El productor actual la publica siempre `missing`, con
  `no_class_pace_source` y mapa vacío. No acepta un input de ritmo rival y no
  calcula ningún doblaje.
- Análisis lee esa causa tanto para las filas de clase como para la tabla. El
  fixture válido de dos clases demuestra que la UI transporta los escalares
  sin convertirlos en bloques, alcances, frecuencias ni vueltas.

Actualización ISA-832 / reserva obligatoria (2026-08-25, implementada en rama de issue):

- La decisión de producto vive en el adaptador Orbit como 0,8 vueltas con procedencia `product-decision:isa-832`. `PlanningInputReserveLaps` permite modificarla por evento y se proyecta a las reservas Fuel/VE existentes de `manual`.
- SolverV2 rechaza cualquier candidato que termine por debajo del margen. El resultado publica cumplimiento, margen efectivo, cantidades y recurso limitante; `reserve_not_met` llega a `Reasons` y al error de aplicación cuando ninguna parada puede hacerlo factible.
- La misma comprobación se ejecuta al reproducir decisiones, elegir ahorro, evaluar candidatos robustos y resolver cada escenario climático. Orbit publica el estado por plan y por escenario sin cálculo de dominio en TypeScript.
- El atajo sigue activo con reserva: la cota incluye el recurso final y el caso Fuel escalar puro tiene cierre exacto lineal; Fuel×VE conserva enumeración acotada. La paridad usa 300 casos mixtos más 100 de Fuel escalar contra el oráculo exhaustivo.
- La salida y la reproducción de cada candidato usan el mínimo Fuel/VE inicial que mantiene factibles todos los prefijos, servicios y la reserva terminal. Un depósito lleno sólo permanece cuando el consumo total supera una carga o cuando reduce un servicio decidido; capacidad nunca vuelve a ser el valor canónico por defecto.
- Gate `go test ./internal/strategy/... -count=1` y `go vet ./internal/strategy/...` verdes. `go vet ./internal/... ./cmd/...` sigue rojo por tres avisos `unsafe.Pointer` heredados en launcher/LMU; los ficheros señalados no cambian contra la base. Pendiente prueba Wails/LMU real de Isaac tras integrar. Sin PR, merge, promoción ni release.

Actualización ISA-831 / consumo por clima (2026-08-24, implementada en rama de issue):

- El contrato TypeScript de `StrategyInputProjection v2` ya conserva y valida
  `byClimateBucket` para Fuel y VE. Su omisión sigue siendo compatible con
  documentos v2 antiguos, pero el consumidor la trata como dato ausente.
- La ficha pide combustible con el mismo bucket de la fila que ya usaba el
  ritmo. Un bucket ausente conserva `missing`, muestra una causa traducida y
  nunca cae a `meanPerLap` ni al dato de otro clima. La función común aplica el
  mismo aislamiento a VE.
- Regresiones de unidad y wiring cubren valor propio, ausencia visible y el
  caso seco `3.538` sin lluvia. Pasan 253 tests focales, typecheck real y build;
  queda pendiente la verificación de Isaac en la app real.

Actualización ISA-830 / ficha y procedencia efectiva (2026-08-24, implementada en rama de issue):

- La ficha de cada piloto renderiza ritmo y consumo desde la misma vista
  efectiva que aporta presencia, procedencia y confianza. Con proyección Spa
  LMGT3 muestra `2:22.004` y `3.54 L/v`, no los manuales persistidos.
- Se corrigieron otros ocho puntos de presentación: seis chips junto a campos
  manuales editables y los dos resúmenes de depósito/boxes. Los campos de
  edición declaran ahora `manual`; los resúmenes, timeline de parada y
  combustible de salida consumen el valor efectivo.
- La regresión enlaza lo visible con los valores `142.004` y `3.538` presentes
  en `planningInputs` del comando `calculate_orbit`. Suite focal, typecheck
  real y build pasan; la prueba Wails/LMU real queda para Isaac tras integrar.

Actualización ISA-825 / cálculo acotado (2026-08-24, implementada en rama de issue):

- La reproducción con los dos modelos autorizados de Spa confirmó que la
  curva `missing` no se recorría. Fuel derivado (3,538 L/vuelta) y VE derivada
  (4,866 %/vuelta) multiplicaban la frontera y `insertNondominated/dominates`
  consumía CPU porque `P95Millis` solo se medía al terminar y las cotas
  declaradas no se aplicaban.
- El subespacio escalar sin beneficio posible por abrir otro stint usa la cota
  de tránsito solo para demostrar el mínimo de stints. Dentro de él enumera sin
  poda longitudes y cantidades discretizadas, con límite de 100.000 nodos y
  retorno a la búsqueda general si lo supera. La paridad aleatorizada de 300
  casos (semilla 825) encontró una divergencia previa en servicio paralelo:
  cargar Fuel adicional puede ser gratis cuando VE domina; ya queda cubierta.
- El evento real termina por este atajo exacto en un candidato, cero
  comparaciones de dominancia, un stint de 18 vueltas y cero paradas; no agota
  presupuesto ni devuelve un plan degradado. El golden largo conserva
  `11+32+32+32+32` y su desempate observable.
- La búsqueda general tiene límites efectivos de candidatos e iteraciones,
  admite `context.Context` y comprueba cancelación dentro de dominancia. Orbit
  comparte un deadline backend de ocho segundos entre variantes y clima; el
  bridge expone `calculation_timeout` antes del timeout de 10 s del cliente.
- `CombinedStintPaceCurve` y `SavingCost` ausentes o vacíos se excluyen con una
  asunción y causa explícitas. No se crean puntos, niveles ni medidas.
- Pendiente: integración y repetición manual del camino ELMS Sprint Trophy /
  Spa (WEC) / LMGT3 / Logitech G Challenge #2:LGC. Sin PR, merge, promoción o
  release.

Actualización ISA-827 / ritmo representativo (2026-08-24, implementada en rama de issue):

- Analysis publica `representativePaceByClimateBucket` en
  `StrategyInputProjection v2`; cada bucket lleva mediana, presencia,
  procedencia, confianza y una causa explícita cuando no es derivable. La
  lectura sigue aceptando documentos v2 anteriores sin el campo, pero todo
  productor nuevo emite los tres buckets.
- El plan y `SolveV2` resuelven `baseLapSeconds` desde el bucket de la variante
  (seco/eco=`dry`, mojado=`wet`) aunque `CombinedStintPaceCurve` esté ausente.
  La curva sigue gobernando solo el coste dentro del stint y un valor
  manual/corregido sigue ganando al derivado. Orbit muestra el chip Derivado
  con muestra/rango o el motivo real
  (`sin vueltas completas`, `sin tiempo fiable`, `sin clima estable` o `sin
  vueltas limpias`) sin aritmética TypeScript.
- Evidencia del defecto en el store real: Spa LMGT3, sesión `e124f80e...`,
  vueltas 2/4/6/7 con 141,55–142,25 s, etiqueta `traffic` e inclusión Fuel/Pace
  verdadera. Un veto posterior y exclusivo de Pace descartaba las cuatro. La
  corrección usa la decisión común de F3-a2; una reparación in-memory permite
  aprovechar modelos `consumption-pace.v1` solo con hechos ya persistidos y no
  modifica el store.
- Verificación real read-only: 336 modelos, 5 sesiones de la combinación, seco
  válido con N=4 y mediana 142,003814697266 s mientras la curva permanece
  missing/0 puntos; hash del fichero sin cambios. El barrido de los 45 buckets
  deja 19 Fuel/Pace válidos, 0 Fuel-válido/Pace-missing y conserva los 26 donde
  ambas familias ya eran no válidas. Analysis+Strategy, vet focal,
  68 tests frontend focales y build pasan. El gate global conserva deuda previa:
  tres avisos `unsafe.Pointer` en vet y una clave i18n huérfana
  `strategy.wizard.fill.autoTip` (2938/2939 tests Vitest verdes), ambas presentes
  en la base. Sin PR, integración, promoción ni release.

Actualización ISA-828 / pantalla Análisis (2026-08-24, implementada en rama de issue):

- Strategy Orbit incorpora una pestaña `Análisis` sin columna de datos
  manuales. Reutiliza `Surface`, `StatRow`/`StatTile`, `HorizontalTimeline`,
  `Chip`, `Note`, `Accordion` y `Button` para ordenar cifras paralelas, carrera,
  multiclase, paradas, tiempos y log de cálculo.
- La UI consume una ampliación aditiva del resultado Go: combustible inicial y
  final, reserva, tiempos, paradas y la decisión D6 exacta de SolverV2. Un modo
  llamado eco no basta para presentarlo como ahorro; `savingApplied` solo se
  activa con stints de ahorro realmente elegidos y su coste entra en el tiempo.
- La ausencia de plan D6, ritmo de las otras clases o desglose legado conserva
  la sección y explica la causa. Cada dato base del log declara procedencia
  derivada, manual o de referencia. La infografía descargable no forma parte de
  este cambio y no se ha empezado.
- Pasan 243 tests Strategy/Orbit, los typechecks solicitado y real, el build y
  el test Go focal. El preview en navegador queda bloqueado antes de Strategy
  por `overlay-frame-v2:invalid-contract:disposed` al ejecutar sin Wails; no se
  presenta como prueba de runtime real.

Actualización ISA-824 / entrada asistida (2026-08-24, implementada en rama de issue):

- La puerta `Automática con telemetría` consulta el catálogo real y solo se
  abre con combinaciones que tengan vueltas clasificadas por clima. Explica por
  separado cero sesiones importadas, catálogo no disponible y ausencia de una
  combinación utilizable; ya no existe el falso bloqueo de ADR 0005.
- El bloque inferior lista las carreras LMU por el bridge Calendar existente.
  La identidad de series declara en Go las diez correspondencias de sede y las
  cinco de clase; esas identidades viajan en el mismo payload y un calendario
  publicado no puede sustituirlas. Los valores no declarados se muestran por
  su nombre y conducen a la vía manual.
- El orden es carrera, clase cuando sea multiclase y coche. Si la sede y clase
  seleccionadas tienen varios trazados grabados, aparece antes una elección con
  sus recuentos reales; con uno solo se omite. El trazado nunca se infiere del
  sufijo del calendario. El coche desemboca en el selector F5-a existente, que
  persiste sesiones, refresca `StrategyInputProjection v2` y alimenta Orbit sin
  pedir números ni duplicar la proyección.
- Tests cubren carrera monoclase, multiclase, trazado ambiguo, falta de sesiones,
  catálogo caído e identidades desconocidas. En el corpus local, la identidad
  cubre 10/10 sedes y 5/5 clases; 7/10 sedes tienen sesiones coincidentes y
  5/11 series ofrecen coches con clima clasificado. Los gates pedidos,
  typecheck real, build y `go test ./...` pasan. El lint global conserva 35
  incidencias heredadas (32 errores y 3 warnings), anteriores al bloque nuevo.
  Sin PR, integración, promoción ni release.

Actualización ISA-815 / F5-e (2026-08-23, implementada en rama de issue):

- `LMUImporter` ya no convierte fallos de validez o clasificación en éxito: la
  omisión conserva el error real y nunca llega al store como importada.
- El store rechaza nuevas entradas sin validez o clasificación catalogable,
  pero al abrir mantiene los registros legados para que el catálogo pueda
  aislarlos. La consulta devuelve las combinaciones sanas y una lista separada
  de exclusiones con sesión y causa, sin inventar una combinación incompleta.
- Tests cubren análisis y clasificación, no persistencia, reporte de la omisión
  y reapertura con dos sesiones buenas más una legada defectuosa. La suite
  Analysis+Strategy y el `vet` focal pasan; build global y `vet ./cmd/...`
  quedan bloqueados por el `frontend/dist` ausente, y `vet ./internal/...`
  conserva tres avisos `unsafe.Pointer` previos y ajenos. Entrega local
  committeada; sin PR, integración, promoción ni release.

Actualización ISA-818 / F5-e (2026-08-23, implementada en rama de issue):

- Cancelar la app durante los cuatro imports activos ya no persiste esas
  sesiones como fallidas ni cierra el cold start; el lote queda pendiente y se
  reanuda en el siguiente arranque.
- Reintentar omitidas es ahora una operación explícita de la aplicación y del
  cliente TS. El banner solo la ofrece cuando hay omisiones, limpia sus fallos
  y vuelve a encolarlas antes de continuar la importación.
- Un fallo real sigue persistiendo su locator y motivo. Hay regresiones para
  cancelación/reanudación, reintento y fallo real. Strategy+Analysis, race,
  suite Go completa, 385 archivos/2924 tests frontend, typecheck y build pasan;
  vet focal pasa y el vet global conserva tres avisos `unsafe.Pointer`
  heredados en archivos Launcher/LMU sin cambios. Sin PR, integración,
  promoción ni release.

Actualización ISA-813 / F5-e (2026-08-23, implementada en rama de issue):

- Las familias de validez, consumo/ritmo, curvas y pit declaran sus canales y
  el importador lee su unión de 17, no los 98 disponibles. Validez declara
  además los cuatro relojes de 1 Hz que preservan el borde de cobertura. Un
  guard AST impide que una familia acceda a un canal sin declararlo.
- Las sesiones se importan con 1-4 helpers y 4 por defecto. La persistencia
  sigue ordenada y secuencial; omisiones, reintento y progreso de ISA-810 se
  conservan con errores y `panic` cubiertos por tests.
- En el corpus real, el baseline de #813 era 13m40s/337. La corrida final con
  el runtime firmado es 1m41,090s, 337/337 y cero omisiones; otra corrida con
  cuatro quedó en 2m20,668s. El pico final fue 950.247.424 bytes en Go más
  134.971.392 en cuatro helpers. Con tres fueron 2m52,766s y unos 82 MB menos
  en total: se eligieron cuatro por el margen.
- 65.536 filas por página no son compatibles con el helper firmado; se mantiene
  16.384. Analysis+Strategy pasan. El gate Go global solo falla por la ausencia
  previa de `frontend/dist` para los paquetes embed. Lista para review; sin PR,
  integración, promoción ni release.

Actualización ISA-810 / F5-e (2026-08-23, implementada en rama de issue):

- El banner permanece visible si falla la consulta de estado, explica el fallo
  y deja reintentar. Durante el descubrimiento en segundo plano declara que
  sigue buscando y no presenta cero sesiones como resultado provisional.
- La importación secuencial conserva progreso por sesión y usa un timeout
  específico de 30 minutos por archivo, independiente de los 10 segundos del
  resto de comandos Strategy.
- Error, fallo del store o `panic` de una sesión se registra con motivo y no
  aborta las siguientes. El estado local recuerda importadas y omitidas; el
  resumen permite reintentar explícitamente solo las omitidas.
- #809 sigue siendo la autoridad del defecto de validez: esta rama no toca
  `internal/telemetryanalysis/lapvalidity.go`; la recuperación defensiva vive
  en el servicio de arranque en frío. Strategy+app, 385 archivos/2923 tests
  frontend, typecheck, build y visual Orbit quedan verdes. Pendiente: push,
  review y prueba real del corpus de 337 sesiones. Sin PR o promoción.

Actualización ISA-796 / F5-e (2026-08-22, implementada en rama de issue):

- El consumidor único acepta el fixture firmado TEST sin abrir red por
  defecto. Firma inválida, época desconocida, rollback, vencimiento duro y
  schema incompatible degradan a caché todavía válida o a vacío con aviso;
  nunca generan referencia inventada.
- Orbit muestra perfiles y estrategias en `Referencia`, ambos con etiqueta
  `referencia` y `k>=3`. Al usarlos crea inputs o variantes del documento v2
  con procedencia `reference` visible.
- El banner de primer arranque descubre los DuckDB estables de la ruta LMU,
  importa uno por comando con progreso a un store autorizado que alimenta
  F5-a, o conserva el rechazo. No reaparece tras aceptar/rechazar.
- Hay copy en ES/EN/IT/PT y evidencia automática de degradación, procedencia,
  progreso, persistencia, discovery y UI. La captura dedicada demuestra la
  sección separada sin romper el gate de scroll de Orbit.
- Lista para review en la rama de issue; sin PR, integración, promoción,
  primera publicación ni release.

Actualización ISA-794 / F5-d (2026-08-22, implementada en rama de issue):

- La query `get_validated_examples` resuelve la combinación del evento y
  reproduce cada carrera autorizada con `internal/strategy/backtest`; Strategy
  no abre DuckDB ni duplica sus métricas.
- La salida neutral incluye error total y por stint, agregado y un resumen de
  `ObservedStrategy`. Los resultados se ordenan del más reciente al más
  antiguo y una combinación sin carreras conserva una lista vacía explícita.
- Orbit presenta fecha relativa, estrategia corrida, predicho, real y
  desviación en ES/EN/IT/PT. No presenta aprobado/suspenso mientras #702 siga
  fijando los umbrales definitivos y no usa datos simulados.
- Gates locales verdes: Strategy+app, 382 archivos/2916 tests frontend,
  typecheck, build y visual Orbit. La captura dedicada justifica la nueva
  evidencia predicho/real/desviación sin semáforo provisional. La entrega
  queda lista para review en la rama de issue; sin PR, integración, promoción
  ni release.

Actualización ISA-786 / F5-c (2026-08-22, implementada en rama de issue):

- El evento canónico guarda hasta 16 escenarios ponderados como
  `WeatherScenario v1`, cada uno con sus cinco nodos manuales de lluvia,
  cielo y temperaturas. Cambiar de combinación vuelve a vincular esos
  escenarios para no dejar un documento inválido.
- Orbit presenta el editor y el plan de cada escenario con la condición
  aplicada por vuelta. La recomendación robusta destaca minimax regret,
  regret máximo y pérdida esperada ponderada; `SolveWeatherScenarios` sigue
  siendo la única autoridad del cálculo.
- Sin escenarios se declara seco manual. La captura LMU permanece
  deshabilitada con copy honesto hasta su validación y no hay datos simulados;
  el overlay ingame sigue fuera de alcance.
- Evidencia final verde: `go test ./internal/strategy/... ./internal/app
  -count=1`, 382 archivos/2913 tests frontend, typecheck, build y
  `visual:orbit-strategy`. La captura nueva del panel justifica el vacío seco
  manual y la futura captura LMU deshabilitada, sin forecast simulado. Sin PR,
  integración, promoción ni release.

Actualización ISA-771 / F5-b2 (2026-08-22, lista para review):

- Los escalares del input F4 llevan valor, procedencia, confianza y rol. Un
  override de usuario gana a la familia derivada; sin override, la derivada
  válida gana al fallback manual/reference. El resultado expone la fuente
  efectiva y los tests cubren Fuel, vida, degradación, pit y ahorro.
- Orbit llama a `SolveV2` y mantiene el ViewModel existente. El golden de 139
  vueltas usa cinco stints `11+32+32+32+32`, cuatro paradas y 14.712 s.
- El gate numérico compara ambos repartos con `ReplayDecisionV2`: sus totales
  difieren solo 12,733 ps y empatan bajo tolerancia relativa `1e-12`. Ranking y
  dominancia usan el mismo orden: menos paradas, vueltas de parada, cantidades
  Fuel/VE e identidad JSON del plan. El golden sigue `11+32+32+32+32` porque,
  a cuatro paradas, la primera vuelta canónica es 11 frente a 28; Go y testdata
  frontend siguen idénticos. El test invierte tanto el ruido de acumulación
  como el orden de inserción y conserva ganador. Con peso real configurado, el
  contrafactual anterior conserva 484 s a favor del elegido.
- Se retiró el evento Wails productivo del solver v1. El código v1 queda para
  tests/paridad histórica, sin consumidores productivos externos.
- Gates locales verdes: solver x100, Strategy+app, frontend (381 archivos /
  2.907 tests), typecheck, build, visual Orbit y compilación de `cmd/vantare`.
- Sin PR, integración, promoción o release; falta review.

Actualización ISA-774 / F6-e (2026-08-22, lista para review):

- El runner PowerShell deja por fecha resumen, informe allowlisted, plantilla
  cerrada y log; después de la decisión de Isaac valida la selección y llama al
  builder sin firma. El dry-run sintético cubre el mismo camino local sin red.
- El LLM solo recibe Markdown de producción con `k>=3`, métricas agregadas y el
  ranking ya calculado. No recibe bundles, JSON técnico, digests, identidades,
  texto de terceros ni herramientas.
- Isaac marca perfiles y rangos visibles. La validación liga la decisión al
  digest exacto del resumen, resuelve los digests técnicos y produce el
  contrato `vantare.catalog.selection.v1` consumido por F6-f.
- Prompt y runbook conservan pendientes los gates del Worker, firma offline y
  primera publicación. Sin PR, integración, promoción ni release; falta review
  de #774.

Actualización ISA-766 / F6-a (2026-08-22, lista para review):

- El exportador construye `CurationBundle v1` desde
  `StrategyInputProjectionV2` y `ObservedStrategyV1`: allowlist cerrada,
  semana ISO, sin sesión, hora exacta, texto libre ni telemetría cruda. El
  sobre administrativo viaja separado del payload analítico.
- El consentimiento guarda versión y timestamp; el primer opt-in genera
  `uploadSecret` y `deleteSecret` distintos en el almacén protegido de Windows.
  La cola JSON atómica sobrevive al reinicio sin contener esos secretos.
- Pausar cancela el envío/reintento que aún no fue aceptado y deja esos items
  pausados; un recibo ya aceptado queda enviado en el historial. Reanudar no
  implica consentir de nuevo. Revocar y pedir borrado remoto son independientes.
- Ajustes > Privacidad muestra el bundle exacto, cola e historial y explica
  explícitamente que los datos son seudónimos, no anónimos. Cliente y pruebas
  hablan el protocolo F6-b solo contra `httptest`; la URL de producción y el
  token de admisión permanecen vacíos, así que no hay envío real por defecto.
- Gates de Strategy/app/cmd y frontend (2.904 tests, typecheck, build e i18n)
  verdes. El barrido Go global tuvo un único timeout no reproducible en SQLite;
  todos los paquetes tocados pasan. Sin PR, integración, promoción ni release;
  falta review de #766.

Actualización ISA-765 / F5-b (2026-08-22, bloqueada antes de review):

- La query de aplicación pide a Analysis una `StrategyInputProjection v2`
  sobre el conjunto exacto de sesiones incluidas por F5-a. Strategy consume el
  puerto público y no toma ownership de modelos históricos ni de DuckDB.
- `StrategyDocumentV2` conserva proyección y overrides juntos. Revertir borra
  solo el override y deja intacto el derivado.
- Orbit presenta nueve datos numéricos con chips Derivado/Manual/Referencia/
  Falta. El tooltip derivado incluye N y rango; Falta explica el motivo. El
  modo sin combinación sigue siendo manual puro y los cuatro idiomas están
  completos.
- Gates de lo implementado verdes: Go focal de Analysis/Strategy, suite frontend completa,
  typecheck, build y `visual:orbit-strategy`. La captura de procedencias queda
  en la evidencia de Orbit.
- Bloqueo de aceptación: Orbit sigue usando `solver.Solve` v1. En F4,
  `SolverInputV2` acepta la proyección con sus tres ejes, pero ritmo base,
  capacidades, pit, vida, Fuel/VE y degradación manuales son escalares sin
  procedencia, y una proyección válida gana al fallback. No existe una forma
  contractual de transportar un override por campo tal cual. Resolverlo exige
  ampliar F4 (y sus fuentes de resultado) o mutar/fabricar una proyección; no
  se hizo ninguna de las dos sin nueva decisión. #765 continúa in-progress,
  sin PR, integración, promoción ni release.

Actualización ISA-758 / F5-a (2026-08-22, lista para review):

- Analysis publica combinaciones y sesiones desde modelos históricos ya
  autorizados usando la clasificación/agrupación existente; Strategy solo
  adapta esa salida y nunca abre DuckDB. Sin fuente autorizada responde con un
  vacío honesto hasta que F5-e conecte la importación inicial.
- Orbit pregunta opcionalmente la combinación al crear o abrir un evento. Se
  puede saltar para seguir en manual puro; el panel Sesiones muestra el motivo
  de inclusión/exclusión y permite cambiarlo sin borrar datos.
- Combinación y toggles se persisten en el documento canónico v2 mediante una
  migración aditiva compatible. Binding, cliente estricto, cuatro idiomas y
  estados vacíos están cubiertos por pruebas, build y captura visual.
- Gates verdes: `go test ./internal/... ./cmd/vantare`, 2.898 pruebas frontend,
  typecheck, build y `visual:orbit-strategy`. Sin banner F5-e, dependencia,
  PR, integración, promoción ni release; falta review de #758.

Actualización ISA-757 / F6-c (2026-08-21, lista para review):

- El nuevo `cmd/vantare-curator` convierte los tres árboles de procedencia en
  un resumen compacto sin mezclar entornos. Valida fail-closed, registra cada
  rechazo con código estable y deduplica por digest del payload normalizado.
- Cada combinación agrega Fuel, Virtual Energy, pits y calidad; pace queda
  explícitamente ausente porque `CurationBundle v1` no lo transporta. Los
  clusters admiten paradas a ±1 vuelta con igual forma/compuestos.
- La cohorte cuenta credenciales administrativas estables distintas y exige
  `k=3`; combinación, perfil y estrategia bajo k quedan no publicables con
  motivo. Ningún hash o identificador administrativo sale en el resumen.
- El score usa `backtest.RunRace`, publica versión/hash F4-9 y declara la
  normalización necesaria por falta de ritmo. El golden end-to-end fija los
  bytes y cubre dedupe, clustering, separación y k.
- El gate de #757 sobre CLI+`internal`, vet focal, gofmt y diff-check pasa.
  Sin frontend, dependencia, Worker, PR, merge, promoción ni release; falta
  review del orquestador.

Actualización ISA-755 / F4-9 (2026-08-21, lista para review):

- El paquete nuevo `internal/strategy/backtest` separa los tres gates del spec:
  calibración de la estrategia corrida, factibilidad de la recomendada contra
  datos realizados y ranking por signo más regret interno cero.
- El solver expone replay determinista de una decisión fija y el contrato
  `ObservedStrategy v1` conserva tiempo observado por stint. El backtest no
  usa la carrera observada como verdad de un contrafactual.
- El holdout se corta por combinación+fecha, falla ante leakage o N bajo y
  devuelve resultados por carrera/agregados con intervalos. `<2 %` y paradas
  secas exactas siguen marcados provisionales hasta #702.
- Fixtures versionadas S026/S125/S266/S287 y el flujo
  derivadas→plan→replay→métricas pasan junto con Strategy+Analysis, vet, gofmt
  y diff-check. Sin frontend, dependencias, PR, merge, promoción ni release.
  F4 queda técnicamente completa en esta rama; falta review/aceptación.

Actualizacion ISA-753 / F4-8 (2026-08-21, lista para review):

- Cada candidato de `SolveV2` conserva esperado, caso malo coherente,
  factibilidad y riesgos duros Fuel/VE/neumatico. La poda considera tambien el
  estado pesimista para no perder una alternativa con margen.
- Rapida, equilibrada y conservadora salen de la misma busqueda y ranking; la
  rapida no limita el caso malo y las otras toleran como maximo 5/2 %. La rapida puede avisar de riesgo duro; las
  otras dos lo excluyen. Rangos estrechos convergen en el mismo plan.
- El presupuesto p95 ya es efectivo: limita niveles de servicio y degrada el
  paso por potencias de dos de forma determinista, visible y repetible. El
  resultado consolida consumo y rain chance con las sensibilidades previas.
- Casos de negocio Fuel y vida de neumatico verdes. Gates solver x100,
  Strategy+app, golden Orbit, vet, gofmt y diff-check pasan. El gate Go global
  solo falla setup de `frontend`/`cmd/vantare` por `frontend/dist` ausente; el
  resto pasa. Sin frontend, dependencias, PR, merge, promocion ni release.
  Siguiente: push y review del orquestador de #753.

Actualización ISA-752 / F4-7 (2026-08-21, lista para review):

- Los cinco nodos de `WeatherScenario v1` se convierten en timeline por vuelta
  mediante interpolación lineal. Los umbrales default 20/60 separan
  seco/húmedo/mojado y la salida expone sensibilidad wet a -5/+5 puntos.
- Cada vuelta selecciona `delta_clima`, consumo por bucket de Analysis o
  fallback manual/reference y parámetros/curva de compuesto. Los cruces dentro
  de un stint cambian de condición sin fabricar una frontera de stint.
- Compuestos dry/wet usan el inventario físico F4-5. Las reglas opcionales por
  bucket fuerzan una parada antes de una condición incompatible y conservan
  ventanas, servicio, edad e identidades.
- Se entrega óptimo por escenario y recomendación `minimax_regret`; la pérdida
  esperada ponderada desempata y ambas métricas se publican con replay por
  escenario. NODE_50 monta wets justo antes de la primera vuelta mojada y la
  robusta supera al plan seco cuando la lluvia se adelanta.
- Oráculo exhaustivo por escenario, caso seco degenerado, fail-closed y gates
  solver x100, Strategy+app, vet, gofmt y diff-check verdes. Sin frontend,
  dependencia, PR, merge, promoción ni release. Siguiente gate: review del
  orquestador de #752.

Actualización ISA-751 / F4-6 (2026-08-21, lista para review):

- `SolveV2` elige piloto por stint. Cada piloto usa `PilotProfile v1` o cifras
  manual/reference con procedencia; su ritmo y consumo participan en la
  autonomía, servicio, peso Fuel y tiempo total común de F4-1..5.
- Disponibilidad por vueltas y máximos de conducción continuo/total son duros
  y explicados. El continuo no se reinicia si el mismo piloto sigue tras el
  pit; sí al relevarlo. Min/max de vueltas también quedan ejecutados.
- El caso canónico usa al rápido en stints 3/3 alrededor de una ventana de 2
  vueltas del lento y prueba el coste frente al óptimo de ritmo puro. El
  oráculo amplía el espacio sin poda, conserva paridad y demuestra poda
  efectiva; la salida preserva procedencia y sensibilidad de ritmo por piloto.
- Gates verdes: solver x100, Strategy+app, golden Orbit, vet focal, gofmt y
  diff-check. Sin frontend, dependencia, PR, merge, promoción ni release.
  Siguiente gate: review del orquestador de #751.

Actualización ISA-750 / F4-5 (2026-08-21, lista para review):

- `SolveV2` elige compuesto y juego físico por stint contra el inventario
  canónico de `internal/strategy/tyres`. Los parámetros de curva/delta son
  exclusivamente manual/reference con procedencia mientras D19 no tenga
  mapping semántico real.
- Cambiar o conservar neumáticos forma parte del candidato: conservar mantiene
  identidades y edad y no paga servicio; cambiar exige otro juego compatible y
  usa el coste paralelo/secuencial de F4-1. Remontar un juego usado no restaura
  su vida.
- Ventanas obligatorias, min/max de paradas y compuestos requeridos son
  restricciones duras explicadas. El caso canónico demuestra cuándo gana el
  doble stint duro y cuándo compensa pagar blandos.
- El oráculo exhaustivo incorpora compuestos, juegos y ventanas en tamaños
  pequeños. La poda conserva estado físico/reglas, publica `prunedStates` y la
  sensibilidad expone el impacto de +0,20 s/vuelta por compuesto elegido.
- Gates verdes: solver+tyres x100, Strategy+app, golden Orbit, vet focal,
  gofmt y diff-check. El gate Go global pasa todos los paquetes compilables y
  solo falla el setup de `frontend`/`cmd/vantare` por `frontend/dist` ausente;
  tampoco hay `frontend/node_modules` para regenerarlo. Sin frontend,
  dependencias, PR, merge, promoción ni release. Pendiente: commit documental,
  push y review del orquestador de #750.

Actualización ISA-749 / F4-4 (2026-08-21, lista para review):

- `SolveV2` incorpora el nivel de ahorro Fuel/VE como decisión de cada stint;
  el consumo efectivo cambia autonomía, servicios y peso, y el coste de ritmo
  queda separado en la evaluación.
- Acepta una sola fuente manual/reference o la familia A/B válida de Analysis,
  conserva procedencia/confianza y publica un plan explícito por stint con
  totales y sensibilidad del 20 %.
- D6 prueba ambos lados de la decisión: ahorro barato elimina la parada corta
  y ahorro caro la conserva. El oráculo exhaustivo comparte la dimensión sin
  poda y cubre Fuel, VE, dos niveles y peso activo en carreras pequeñas.
- Gates verdes: solver x100, Strategy+app, Telemetry Analysis, golden Orbit,
  vet focal, gofmt y diff-check. El gate global pasa todo lo compilable y solo
  falla el setup de `frontend`/`cmd/vantare` por `frontend/dist` ausente; no hay
  `frontend/node_modules` para regenerarlo. Sin frontend, dependencias, PR,
  merge, promoción ni release. Pendiente: push y review del orquestador de
  #749.

Actualización ISA-747 / F4-3 (2026-08-21, lista para review):

- `SolveV2` suma por vuelta `litros al inicio * segundos/L` al ritmo base y a
  la curva de stint. El nivel parte de la capacidad, resta consumo tras cada
  vuelta y añade solo los repostajes elegidos por el candidato.
- El coeficiente acepta `manual` o `reference` con presencia, procedencia y
  confianza. Solo acepta `derived` desde la curva que Analysis materializa
  tras `identifiability=separable`; dos autoridades fallan cerradas. El
  resultado conserva la fuente, la declara en asunciones y expone coste y
  sensibilidad del 20 %.
- La poda exige el mismo fuel cuando el peso está activo y el oráculo exhaustivo
  usa el mismo término. El test de negocio cambia el óptimo de una parada
  llenando a dos repostajes splash.
- Gates verdes: solver x100, Strategy+app, Telemetry Analysis, golden Orbit,
  vet focal, gofmt y diff-check. Golden Orbit invariante; no se tocó frontend.
  Sin dependencia, PR, merge, promoción ni release. Pendiente: review del
  orquestador de #747.

Actualización ISA-746 / F4-2 (2026-08-21, lista para review):

- `SolveV2` usa la curva combinada `valid/combined_only` producida por Analysis
  como coste por edad de vuelta y conserva procedencia/confianza en el
  resultado. La pendiente manual sigue siendo el caso lineal y queda marcada
  como `manual`.
- Interpola linealmente entre puntos y extrapola el tail con la mayor pendiente
  entre el último tramo no negativo y rango/sqrt(N). La sensibilidad del 20 %
  perturba todos los puntos y el rango; el oráculo exhaustivo evalúa el mismo
  modelo por tramos.
- El caso canónico de cliff tardío cambia el óptimo desde cero paradas con la
  aproximación lineal a una parada en vuelta 4. Los costes acumulados mantienen
  O(1) por stint.
- Gates verdes: solver x100, Strategy+app, golden Orbit, vet focal, gofmt y
  diff-check. La suite Go global pasa todo lo compilable y solo falla el setup
  de `frontend`/`cmd/vantare` por `frontend/dist` ausente; tampoco existe
  `frontend/node_modules` para regenerarlo en este worktree. Sin frontend,
  dependencia, PR, merge, promoción ni release. Siguiente: push y review del
  orquestador de #746.

Actualización ISA-745 / F4-1 (2026-08-21, lista para review):

- `SolveV2` deja ejecutable el primer corte del vector F1.3: posiciones de pit
  arbitrarias y cantidades Fuel/VE discretizadas, con coste por tránsito,
  repostaje, recarga VE y neumáticos en modo paralelo/secuencial delegado al
  modelo `manual` existente.
- La poda por dominancia conserva el óptimo y se compara con enumeración total
  del mismo espacio pequeño. Hay ranking estable, desglose por parada, binding,
  min/max de paradas y candidatos inviables explicados. La discretización y
  los dos fallos corregidos del contrato compile-only están documentados en
  `f1-3-contrato-solver.md`.
- Gates locales: solver+manual x100, Strategy+app, golden Orbit, vet focal,
  gofmt y diff-check verdes. El golden permanece en 139 vueltas,
  28/28/28/28/27, cuatro paradas y 14.712 s; Orbit aún consume el solver v1
  escalar porque no dispone de inputs de servicios y no se inventaron.
- Commits de producto/prueba: `429649da`, `26a1db11`, `fa37dbe8` y
  `632903e0`. Sin cambio
  frontend, dependencia, PR, merge, promoción ni release. Siguiente: review
  del orquestador de #745; después F4-2, no antes.

Actualización ISA-735 / F2(e) (2026-08-21, lista para review):

- Orbit guarda el plan visible como revisión inmutable del lifecycle canónico
  y enseña su identidad; activación y exportación usan exactamente esa
  referencia. El `ActivePlan` mostrado procede del backend, mientras que
  seleccionar una tarjeta se etiqueta honestamente como selección local.
- Los fallos de guardado, activación y apertura muestran mensaje, código y
  campo tipados. Las respuestas obsoletas se descartan. Exportar una revisión
  concreta atraviesa application/packaging y su import/re-export es idéntico.
- El mock Wails persiste draft, revisiones y activación; una recreación del
  cliente/runtime demuestra que sobreviven a la recarga. Las caracterizaciones
  de los tres flujos silenciosos se invirtieron con pruebas de comportamiento.
- Gates: Go Strategy+app, frontend 377/2.896, typecheck, build, ESLint focal,
  diff-check y visual Orbit verdes. Se actualizaron 12 capturas porque la
  cabecera y las tarjetas muestran los nuevos verbos; no cambió CSS ni se
  añadieron dependencias.
- Commits `946c341e`, `b8f577c7`, `706039d7` y `de2f04fb`. Sin PR, merge,
  promoción o release. Siguiente acción: review del orquestador de #735;
  después F2(f).

Actualización ISA-734 / F2(d) (2026-08-21, lista para review):

- Orbit ya no calcula planes en TypeScript: la página pide todas las variantes
  a `strategy:application:calculate_orbit`, que compone el cálculo manual y el
  solver Go existentes. El frontend se limita a validar el wire y formar los
  ViewModels de presentación.
- El ciclo asíncrono muestra carga, oculta cifras antiguas, descarta respuestas
  obsoletas y expone el error tipado con código/campo y reintento. Referencias a
  pilotos inexistentes fallan como `calculation_invalid`, sin fallback.
- El golden compartido entre Go y el test de página demuestra 139 vueltas,
  cinco stints 28/28/28/28/27 y 4:05:12 desde el motor real. La caracterización
  de cálculo/piloto colgante queda invertida; persistencia, activación y export
  siguen en F2(e), y la eliminación de datos sintéticos en F2(f).
- Gates: Go Strategy+app, frontend 375/2.888, typecheck, build, diff-check y
  visual Orbit verdes. El harness visual espera el recálculo asíncrono; no hay
  cambios CSS ni capturas nuevas. Sin dependencia, PR, merge o promoción.
- Commits de producto/prueba: `bddccd4c`, `0ae806eb`, `d90c7f13` y
  `32ab7b69`. Siguiente acción: review del orquestador de #734; después F2(e).

Actualización ISA-732 / F2(c) (2026-08-21, lista para review):

- El motor Go importa las dos claves localStorage mediante un journal durable
  de dos commits: backup raw antes de parsear y publicación canónica después
  de confirmar el fingerprint. Los siete fixtures golden atraviesan el flujo
  completo; una property de 32 casos prueba `dos veces = una`, y el crash
  simulado entre commits se recupera sin duplicar.
- Las 28 filas de la matriz tienen política explícita y comprobada. Corruptos,
  colisiones, shapes parciales y referencias colgantes se conservan en
  cuarentena; defaults sintéticos llevan `legacy_synthetic_default` y nunca se
  materializa `startAt=now`. Documento detallado:
  `docs/strategy-planner/isa-732-migracion-localstorage.md`.
- Rollback restaura el snapshot canónico anterior y archiva el documento
  posterior. No toca el lifecycle v1. Orbit aporta diálogo accesible de
  preview/confirmación/resultado/rollback; tras éxito el store legacy queda
  read-only, pero la página sigue leyéndolo hasta F2(d).
- Gates: Go Strategy+app, frontend 375/2.899, typecheck, build y diff-check
  verdes. Sin dependencia nueva. El smoke visual browser no es evidencia
  Wails: la app completa fuera de Wails activó un error runtime preexistente y
  T3 Preview no devolvió snapshot. El localStorage real de Isaac se reserva al
  gate F2.
- Sin PR, merge, promoción ni release. Siguiente acción: review del
  orquestador de #732; después continúa F2(d), no antes.

Actualización ISA-730 / F2(b) (2026-08-21, lista para review):

- `internal/app.StrategyApplicationBridge` posee el binding Wails
  `strategy:application:*`; el composition root solo lo registra. La capa
  prueba encode/decode, correlación, sanitización y propagación de errores
  tipados, incluidos `event_*`, `driver_*` y `variant_*`.
- `strategy-orbit-bridge` es la fachada de Orbit sobre el cliente TS fino. La
  unión cubre las 23 operaciones de la API de aplicación existente y decodifica
  el documento v2 ampliado, listas, comparación, lifecycle y activaciones.
  Los errores llegan con código, campo y mensaje y las respuestas mal formadas
  se rechazan; no hay cálculo ni decisiones de dominio en TS.
- Cero cambios en `StrategyOrbitPage` y stores. Commits `31dd0709` y
  `9487fad8`. Go focal, vet, frontend 374/2.894, typecheck, build y ESLint focal
  verdes. Sin dependencia nueva.
- No hay smoke de aplicación Wails viva en F2(b): las pruebas demuestran las
  dos fronteras aisladas, no una sesión instalada. Siguiente acción: review del
  orquestador de #730; después continúa F2(c), no el cutover de UI F2(d-f).

Actualización ISA-729 / F2(a) (2026-08-21, lista para review):

- El repositorio canónico evoluciona a `strategy.repository.v2` y custodia un
  único `StrategyDocumentV2` junto al lifecycle v1 existente. La migración
  valida el hash v1 antes de conservar drafts, revisiones, activaciones y plan
  activo; el documento soporta eventos, pilotos/orden/disponibilidad,
  variantes, inventario y `legacy_synthetic_default`. `RawLegacy` usa
  bytes/base64 para conservar el backup exacto sin compactarlo.
- La fachada de aplicación y el bridge JSON ofrecen `create/edit/list` de
  eventos, pilotos y variantes, `delete_driver` y `compare_variants`, con
  generación optimista, validación estricta y errores tipados visibles.
- Política de borrado: sanea availability/órdenes y renumera; si una variante
  quedaría vacía, `driver_in_use` aborta toda la transacción. Property test de
  64 casos y regresión de lifecycle ampliado verdes.
- Entrega en commits convencionales pequeños. Gates Strategy y vet focal
  completos PASS. Sin frontend, Wails, solver, telemetría, PR, integración,
  promoción ni release.
- El `go test -count=1 ./...` adicional no fue gate verde: faltaba el artefacto
  ignorado `frontend/dist` para `go:embed` y falló el test temporal ajeno de
  SQLite recording; los paquetes Strategy pasaron dentro de esa misma corrida
  y la repetición focal aislada del test SQLite pasó.
- Siguiente acción: review del orquestador de #729; F2(b) solo después de
  aceptar esta API exacta.

Actualización ISA-694 (2026-08-21, auditoría en curso):

- Briefing autocontenido:
  `docs/strategy-planner/isa-694-current-state-and-rework-brief.md`.
- Base auditada: `origin/nightly@2ab9741d`. La rama es
  `vantareapp/isa-694-auditoria-rework-strategy-planner` y no modifica código
  de producto.
- El cálculo manual Go de Fuel y Virtual Energy y el solver determinista pasan
  100 repeticiones. El desgaste manual agrega valores introducidos; no es un
  modelo predictivo histórico.
- Telemetry Analysis puede descubrir, autorizar, copiar y leer DuckDB de forma
  normalizada, pero aún no produce `StrategyInputProjection v1`. ISA-159,
  ISA-145 e ISA-146 siguen en backlog; por tanto DuckDB no alimenta Strategy.
- Command Orbit conserva valor visual, pero usa persistencia y cálculo
  TypeScript paralelos. Activar, guardar y exportar no representan todavía el
  lifecycle canónico completo.
- El motor live existe, pero Nightly no resuelve aún la revisión activa a
  objetivos ejecutables. PR #280 permanece draft y requiere portado sobre la
  base actual.
- Veredicto: bloquear promoción a `testers`; planificar un cutover incremental
  que conserve Orbit y recupere una sola autoridad. No implementar hasta que
  Isaac apruebe el nivel objetivo manual, histórico y live.

Actualización ISA-309 / STR-N02 (2026-08-10):

- La pila acumulativa de Strategy posterior a STR-09 se reconstruyó sobre
  `origin/nightly@08fcfc1` en la rama oficial de ISA-309, sin los seis commits
  ajenos que contaminaban la rama histórica.
- Los 11 commits de producto incluyen saneamiento presentacional, dominio Go
  unificado de neumáticos, solver determinista, variantes, wiring del
  workspace, listado real de planes, paquetes import/export, plan activo
  auditable, reglas de evento versionadas y la regresión de loading/retry.
- Go Strategy, typecheck real, suite frontend completa, build y ESLint focal
  están verdes. `-race` sigue sin verificarse en este entorno Windows sin CGO;
  los bridges continúan sin prueba manual contra una aplicación Wails viva.
- PR draft #192 está abierto hacia `nightly`, mergeable y con todos los gates
  verdes tras un rerun único de un presupuesto temporal heredado de Telemetry
  Core. Strategy no fue la causa del primer fallo.
- Siguiente acción exacta: revisión de Isaac del PR #192. Solo su autorización
  posterior permite promoverlo a `nightly`; STR-15B (ISA-162) no comienza
  hasta que esa base esté realmente integrada.

Actualización ISA-152 / STR-17 (2026-08-14):

- ISA-161 fue aceptada por Isaac e integrada mediante squash del PR #212 en
  `nightly@b2e4067809d31152fdcf374875179e577d483c03`. El gate post-promoción
  31708164123 pasó completo. Linear refleja ISA-161 en `Nightly`.
- ISA-152 se implementó sobre una rama/worktree aislados desde ese squash. Los
  commits fueron `98104b0` (plan), `3f48045` (motor/read model),
  `091f8ba` (adaptador al Hub) y `bf9e9e5` (evidencia LMU). Reviews
  independientes de spec y calidad aprobaron los tres cortes sin findings
  abiertos.
- El motor efímero mantiene cursor, lifecycle, stint, Fuel, desviación solo
  contra objetivos exactos y próxima acción planificada. Duplicados,
  out-of-order, gaps, epochs, reconnect coalescido y backpressure están
  cubiertos. Missing, stale, invalid y unsupported permanecen explícitos.
- El adaptador consume una única suscripción del `StrategyHub()` existente,
  tolera la evolución aditiva de Strategy v1 y no crea goroutines, readers,
  endpoints ni almacenamiento. No está conectado al arranque: `ActivePlan`
  conserva una referencia de revisión, no los stints/objetivos normalizados, y
  STR-17 no autoriza inventar esa fuente.
- `TestStrategyLiveLMUOptIn` pasó con el pipeline productivo completo y un solo
  reader: source live, cursor `1/3`, vuelta completada `0` fresh, Fuel
  `98/115 L` fresh y desviación missing sin objetivo. El log es sanitizado; no
  contiene raw, track, fingerprint, IDs reales ni PII.
- Gates locales: focales x20, vet focal, frontend build, `go test ./...` y
  frontend `367/2636` pasan. `-race` no se ejecutó por CGO desactivado y falta
  de GCC. El HEAD de rama `c5f965f` pasó CI completo en 31720701167. Isaac
  autorizó la integración y el PR
  [#219](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/219)
  se integró por squash en
  `nightly@8de4f511972757476d96d6a525b69c8917f4ca56`; el gate post-promoción
  [31748815965](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31748815965)
  pasó completo. Linear refleja `Nightly`. No hubo promoción a
  `testers`/`master` ni release.
- Microplan vigente:
  `docs/superpowers/plans/2026-08-13-isa-152-str-17-live-execution-engine.md`.
  Evidencia detallada:
  `docs/strategy-planner/evidence/isa-152-strategy-live-engine.md`.

Actualización condicionada ISA-161 / TC-10B (2026-08-12; estado histórico):

- Telemetry Core ha implementado en la rama local de ISA-161 el productor
  `StrategyLiveProjection v1` sobre el único pipeline LMU canónico. Incluye
  sesión, progreso, pit y Fuel con calidad explícita; VE, tyres, weather y
  facts permanecen ausentes.
- ISA-161 se construyó originalmente desde ISA-160 en `nightly@8880a88`; su
  primer rebase local fue sobre `origin/nightly@234794d` y su base/merge-base
  actuales son `origin/nightly@b6df494`. La rama está publicada y el PR draft
  [#212](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/212)
  está OPEN/CLEAN/MERGEABLE hacia `nightly`. El
  [run 31639192366](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31639192366)
  pasó completo para `19dddea`, incluido GitGuardian. Cualquier amend posterior
  requiere checks de su nuevo HEAD; el estado final se consulta en el PR.
  Linear sigue pendiente por reautenticación.
- Esto no implementa el motor live Strategy ni desbloquea todavía ISA-152 /
  STR-17. La dependencia técnica solo será desbloqueable tras la promoción
  aceptada de ISA-161 a `nightly`; no hubo integración, promoción ni release
  de este corte.

STR-00 y STR-01 quedaron aceptados. STR-01 rescata Product A solo como oráculo
histórico aislado; no conecta sus contratos al producto. STR-02 introduce el
primer contrato productivo versionado. STR-03 implementa el repositorio local
canónico de drafts y revisiones. STR-04 añade la fachada de comandos y el store
frontend transitorio. STR-05 añade el motor manual puro de carrera, Fuel,
Virtual Energy y pit. STR-06 añade el inventario físico individual y sus reglas
de condición, estado y esquina persistente. STR-07 añade el shell visual y la
navegación real de la suite. STR-08 conecta el documento editable al repositorio
canónico, añade operaciones de stint y asignación física por DnD/teclado. La UI canónica usa
estrategias a la izquierda, stints al centro e inventario/entrada a la derecha.
STR-09 añade entrada rápida y tabla por vuelta con correcciones no destructivas,
Fuel/Virtual Energy separados, fuel-save determinista y pérdida de boxes por
cada parada real; las tarjetas consumen el resultado Go correlacionado.

Actualización ISA-134 / STR-00:

- Proyecto activo: `Strategy Planner — Race Strategy Suite`.
- Product A/B/C quedan como fases históricas de un único producto.
- Product A auditado: `codex/strategy-product-a@b9f1937`.
- Base aprobada: `ISA-117@170eaeb`.
- Divergencia: 371 commits de la base y 44 de Product A.
- Simulación: 94 paths = 87 auto-merged + 7 conflictos; 6.751 inserciones y 5
  eliminaciones.
- Veredicto: rescate selectivo; prohibido merge/cherry-pick por rango.
- Allowlist STR-01: un fixture exacto + 24 paths del dominio solo por port
  manual; los otros 69 paths están en denylist.
- Las 26 issues PB están `Canceled` como superseded, enlazadas al mapa y sin
  borrar historia. El backlog canónico son 24 cortes: ISA-136..157 más
  ISA-162/163.
- Productores: ISA-159 (Analysis histórico) e ISA-160/161 (Core live).
- STR-01: commit `f85fd31`, push y PR draft #60; sin promoción.
- STR-02: `ACCEPT`, commit `91c16c2`, push y PR draft #66 sobre `f85fd31`.
  Añade activación idempotente
  con historial exacto, decode execution estricto y corpus Go/TS de errores,
  máximo entero compartido `2^53-1`, regresión UTF-8 real y precedencia de
  versiones desconocidas equivalente en Go/TS. El encoder TS limita profundidad
  también al verificar valores ya construidos. La verificación productiva ya no
  materializa el hexadecimal del payload: calcula solo el digest; el hexadecimal
  diagnóstico usa un búfer acotado. La regresión de 1.000.000 de elementos
  canoniza `9.000.005` bytes y el benchmark reproducible está en
  `docs/strategy-planner/str-02-canonicalization-memory-benchmark.md`.
  Permanece sin merge ni promoción. Go focal x50, dos fuzzers, frontend
  completo 299/299 archivos y 2.034/2.034 tests,
  TypeScript, build, lint focal, vet focal y diff-check pasan. Go/vet global no
  se repitieron en la reanudación del 2 de agosto; su última evidencia conserva
  deuda Windows heredada fuera del diff.
- STR-03: implementación local sobre `ISA-137@91c16c2`. API
  `Snapshot`/`Commit(ChangeSet)`, generación optimista, lease cross-process,
  escritura atómica durable, backup/rollback, drafts recuperables, revisiones
  inmutables, límites y borrado sin tocar externos. La review queda corregida:
  solo corrupción/ausencia activa recovery; límites, I/O y versiones futuras
  no mutan el principal; drafts y revisiones atraviesan el gate `strategy.v1`;
  temporales huérfanos se limpian bajo lease sin seguir links/reparse points;
  y un fallo posterior al replace devuelve `ErrCommitUncertain` para reconciliar
  por generación. La segunda re-review queda corregida sin marker: el primer
  commit persiste su misma generación en el backup antes del principal, de modo
  que principal ausente nunca se confunde con gen0 después de inicializar. Los
  fallos antes/después del replace fijan la frontera ordinaria/incierta y un
  writer con versión 0 no puede consolidar pérdida. Migración v1 es no-op
  explícito porque no existe predecesor productivo. Evidencia:
  `docs/strategy-planner/str-03-repository.md`. Lista para review independiente,
  sin promoción. Focal x100, lease cross-process x50, Strategy, vet focal,
  race x10, compilación Linux,
  frontend build y suite Go global sin el único P3 Windows heredado pasan.
- STR-04: implementación sobre `ISA-138@8e151b8`. Protocolo
  `strategy.application.v1`, servicio/bridge estricto, commits idempotentes,
  rechazo optimista de versiones stale y store con dirty derivado, undo/redo
  acotado y observación live aislada. Cerrar el editor conserva plan activo y
  ejecución; duplicar puede capturar cambios locales sin modificar el origen.
  La corrección de review bloquea edit/undo/redo durante save/close, evita
  reemplazar dirty sin descarte, reintenta un save incierto con identidad
  exacta, endurece requeridos/semántica/límites JSON y añade cancel/dispose con
  limpieza ante respuestas tardías o fallos síncronos del transporte.
  Evidencia: `docs/strategy-planner/str-04-application-service.md`. Lista para
  segunda review independiente, sin wiring, merge ni promoción. Go focal x100,
  Strategy, Go global, vet focal, race x10, frontend 301/301 archivos y
  2.052/2.052 tests, 36/36 focales, TypeScript, build y lint focal pasan. Una primera corrida
  frontend bajo carga paralela mostró flakiness heredada del canvas; la corrida
  final aislada quedó completamente verde.
- STR-05: implementación sobre `ISA-139@f60f480`. El paquete puro
  `internal/strategy/manual` calcula carreras por vueltas/tiempo, recursos y
  pit sin wiring. Una carrera por tiempo completa la vuelta en curso mediante
  `ceil` estable y solo añade otra con regla explícita; pit loss sigue siendo
  input manual con procedencia y no crea un fixed-point oculto. Fuel/VE tienen
  resultados incompatibles, reservas explícitas, repostajes/recargas y
  fuel-save que cuenta el inicio real. Pit separa fijo/variable y cuantifica el
  solape Fuel/neumáticos; repair y penalty son opcionales y no se ocultan.
  Cada supuesto publica valor, unidad, procedencia y confianza. Evidencia:
  `docs/strategy-planner/str-05-manual-calculation.md`. Lista para review
  independiente, sin UI, solver, presets LMU, telemetría, persistencia, wiring,
  merge o promoción.
- Corrección STR-05 posterior a review: servicios Fuel/VE se asignan hasta
  cubrir la necesidad sin epsilon ni subasignación; un ruido positivo sobre un
  múltiplo crea conservadoramente otro servicio. Las fronteras de carrera se
  resuelven con aritmética decimal racional: `0.3/0.1` sigue exacto y una media
  vuelta cerca de `2^52` no se borra. Correcciones P1/P2 listas para re-review.
- STR-06: implementación sobre `ISA-140@2d0af85`. El paquete puro
  `internal/strategy/tyres` modela cada neumático físico con identidad,
  Soft/Medium/Hard/Wet, origen, condición con procedencia/confianza, estado,
  stints y esquina. Clasificación sin dato conserva 80–90 % y ausencia general
  40–70 %; ningún estimado se vuelve exacto. El primer uso liga la unidad a una
  esquina, mientras que un montaje aún no usado puede corregirse. La selección
  admite compuestos mixtos, excluye descartados y explica inventario
  insuficiente mediante error tipado. Evidencia:
  `docs/strategy-planner/str-06-tyre-inventory.md`. Lista para review
  independiente, sin UI, persistencia, telemetría, wiring, merge o promoción.
- STR-07: implementación sobre `ISA-141@52d2466`. Registra Strategy en el
  topbar y la access policy, añade galería, entrada, revisión, workspace,
  comparación y guardado honesto de sesión. El harness autocontenido recorre el
  flujo y captura wide/medium/compact con proporción `3/6/3`, overflow global
  cero, consola limpia y modal accesible con foco atrapado/restaurado. La suite
  serial base pasa `2059/2059`; la corrección final añade el cuarto stint para
  sumar 78 vueltas y métricas coherentes por estrategia, con focal `7/7`, build
  y lint focal PASS. Evidencia:
  `docs/strategy-planner/str-07-shell-visual.md`. Sin solver, live,
  persistencia, drag/drop, merge o promoción.
- STR-08: implementación sobre ISA-142 aceptada. Añade `strategy.editor.v1`,
  editor inmutable de stints, neumáticos individuales con esquina persistente,
  DnD y alternativa de teclado, undo/redo, guardado y recarga mediante STR-03/04.
  El bridge Wails sanitiza errores y conserva correlación; apertura lazy,
  reintento y StrictMode tienen regresión. Playwright recorre todas las acciones
  y recupera el documento tras reload con cero errores de navegador. Evidencia:
  `docs/strategy-planner/str-08-stint-editor.md`. Sin solver, telemetría, live,
  merge o promoción.
- STR-09: implementación sobre `ISA-144@53e8158`. Extiende el documento de
  STR-08 con `strategy.manual.v1`, promedios, correcciones dispersas por vuelta,
  unidades y rangos. El bridge Go calcula Fuel/VE, ahorro por vuelta/stint,
  ritmo, desgaste y boxes; cuatro stints equivalen a tres pérdidas por parada.
  La UI neutraliza resultados stale, restaura correcciones individualmente y
  no muestra impactos de ritmo inventados. Playwright valida edición,
  rechazo, guardado/recarga, responsive y navegador limpio. Evidencia:
  `docs/strategy-planner/str-09-manual-inputs.md`. Sin Analysis, solver, live,
  nueva persistencia, merge o promoción.

## Decisiones

- Modos manual, asistido y live.
- Fuentes históricas, recording, live, inputs y reglas.
- Neumáticos individuales con ID, compuesto, desgaste, condición, stints,
  posición, origen y estado.
- Un neumático usado queda ligado a FL/FR/RL/RR; se permiten combinaciones
  mixtas de Soft/Medium/Hard/Wet cuando las reglas del evento lo permitan.
- Clasificación puede dejar 80–90 %; sin datos se usa manual o rango 40–70 %.
- Fuel y Virtual Energy son recursos separados.
- Objetivo: menor tiempo total con incertidumbre; rápida, robusta y conservadora.
- Safety Car/FCY/lluvia/daños/penalizaciones forman parte del producto final.
- Galerías separan Vantare, Comunidad y Mis planes; privado por defecto.
- STR-03/ISA-138 posee en exclusiva repositorio, atomicidad, migraciones,
  drafts, revisiones y recovery. STR-15A/ISA-150 solo posee queries/UI de `Mis
  planes` y paquetes import/export a través de ese repositorio; no duplica
  persistencia.
- Correcciones no destructivas y tabla avanzada.
- Live explica cambio, impacto, propuesta y consecuencia.
- Engineer propone, piloto acepta, Strategy actualiza, Overlays leen.
- El LLM redacta voz/texto; no calcula la estrategia.
- Contrato inicial `strategy.v1`: draft mutable, revisión inmutable/hash,
  activación por referencia exacta, ejecución secuenciada y replan con
  aceptación explícita.
- Fuel y Virtual Energy son tipos incompatibles en Go y TypeScript.
- Go crea y firma lógicamente revisiones; TypeScript las valida contra un
  manifiesto y golden compartidos, sin segundo constructor divergente.
- `sha256:strategy-c14n-v1` fija un encoder binario común Go/TypeScript con
  orden de claves UTF-8, float64 big-endian, límites de recursos y corpus
  adversarial de bytes/hash. Hashes son minúsculos y timestamps son UTC
  RFC3339 canónicos con precisión máxima de milisegundos.
- Replans se decodifican estrictamente y se validan antes/después de aceptar o
  activar. Los estados de ejecución y propuestas aceptadas no conservan aliases
  mutables del input ni de snapshots anteriores.
- Repetir una propuesta ya aplicada devuelve el mismo snapshot activo sin una
  segunda activación, únicamente si candidata, base y revisión anterior
  concuerdan exactamente.
- `LapCount`, `epoch` y `sequence` comparten el máximo entero `2^53-1`; el
  decoder de execution rechaza shape anidado, duplicados, unknown fields,
  trailing data, timestamps y capabilities inválidos con el mismo
  `errorCode/errorField` en Go y TypeScript.
- La segunda corrección fija los 25 nombres del corpus execution, usa paths
  completos para revision/provenance/confidence y valida escalares antes del
  decode Go. Los límites canónicos viven también en el manifiesto compartido;
  strings ya no heredan por error el límite de elementos de un contenedor.
- Una versión explícita desconocida se rechaza antes de interpretar la shape v1;
  la ausencia del campo conserva `invalid_document`. El mismo corpus fija esa
  precedencia para revisión y replan en Go/TypeScript.
- El encoder TypeScript aplica límites de salida, elementos y profundidad por
  sí mismo; no depende de que el input haya atravesado antes el parser JSON.

## Riesgos

- **P1:** escenarios históricos no auditados usados como autoridad.
- **P1:** duplicar Core o el almacenamiento de Analysis.
- **P2:** Monte Carlo opaco o innecesario; determinista es la base.
- **P2:** preservar contratos débiles por evitar un refactor pre-lanzamiento.

## Evidencia e issues

- Auditoría: `docs/strategy-planner/str-00-audit.md`.
- Matriz: `docs/strategy-planner/rescue-matrix.md`.
- Mapa: `docs/strategy-planner/pb-to-str-map.md`.
- ADR: `docs/adr/0006-strategy-planner-unified-domain-and-ownership.md`.
- Plan: `docs/superpowers/plans/2026-08-01-strategy-planner-unified-master.md`.
- Ownership: `docs/strategy-planner/projection-ownership.md`.
- Product A exacto: Go focal/vet, 25 tests frontend y build pasan; el smoke
  Playwright histórico se bloquea y debe reemplazarse en STR-07.
- Caracterización STR-01:
  `docs/strategy-planner/str-01-product-a-characterization.md`.
- Paquete histórico: `internal/strategy/producta`; 25/25 paths de la allowlist,
  fixture exacto y 24 blobs Go iguales salvo el namespace.
- Guard de entrega: denylist 69/69, manifiesto versionado del delta y discovery
  de raíz compatible con `-trimpath`.
- Contrato STR-02: `docs/strategy-planner/str-02-contract.md`.
- Issue activa: ISA-144 / STR-09, implementación lista para review independiente
  sobre el commit aceptado de STR-08.

## Rework definitivo (ISA-694)

El producto entero se replanifica bajo ISA-694 mediante SDD. Documentos
canónicos del expediente, que prevalecen sobre las secciones históricas de
este handoff:

- Diagnóstico: `docs/strategy-planner/isa-694-current-state-and-rework-brief.md`.
- Spec (SPECIFY, aprobado por Isaac 2026-08-21):
  `docs/strategy-planner/isa-694-spec.md` — decisiones D1–D18, asunciones
  A1–A6, criterios de éxito del corte A+B.
- Plan técnico (PLAN, rev. 2 tras review adversarial Codex gpt-5.6-sol):
  `docs/strategy-planner/isa-694-plan.md` — fases F0–F7b.

Corte A+B (manual = caso degenerado de asistido; live queda para un corte C
posterior). Strategy permanece bloqueado para `testers` hasta el gate F7a.

## Siguiente acción exacta

Isaac revisa el plan maestro y el primer plan ejecutable de auditoría #1030.
La spec v1 ya está aprobada: no volver a pedir su aprobación. Tras aprobar el plan,
ejecutar solo la auditoría de código y corpus para fijar criterios de calidad y
evaluación; los cortes de implementación se concretan con esa evidencia. Live
continúa aplazado. La base de ejecución se fija según issue #1030, sin asumir
que la documentación local esté ya integrada en nightly.

## Última actualización

2026-09-08, ISA-1028: diseño del editor de telemetría registrada; entrega documental
aislada. Sin implementación, promoción ni release del nuevo alcance.

## ISA-1088 — conexión UI en curso (2026-09-09)

Base 7b0afab9, rama vantareapp/isa-1088-recorded-session-ui, worktree
C:/tmp/vantare-isa1088. Primer corte de dos TS/test: coordinación de apertura
explícita, preparación y proyección de revisión exacta. Retiene handle para
cálculo; ante error/cancelación libera el recurso, informa fallo de limpieza.
Ocho pruebas focales PASS; gates globales pendientes de completar la UI.
Siguiente corte: textos en los cuatro catálogos strategy-orbit; después panel,
su test y conexión en StrategyOrbitPage (máximo cinco paths por corte).
No cambios de arquitectura/dependencias ni promoción. Banco real pendiente.

ISA-1088 corte de textos: cuatro catálogos strategy-orbit incorporan estados,
apertura explícita, confirmación de reemplazo y cierre en ES/EN/PT/IT.
La conexión del panel y validación global siguen en curso.

ISA-1088 panel conectado al área Sesiones; mantiene sesiones abiertas entre
pestañas, prepara y aplica referencias exactas mediante comandos existentes.
Reemplazo explícito, cierre y errores visibles. 18 pruebas focales PASS
(coordinador/panel/wiring); typecheck previo PASS, build y gates pendientes.
Siguiente corte de banco: internal/app/strategy_recorded_real_integration_test.go,
activación explícita por variables ISA1088_REAL_SOURCE y ISA1088_RUNTIME_APP.
Usa servicio nativo y helper confiado con originales hash antes/después; autoría
licenciada controlada de test, no equivale a aceptación Wails/login real.

ISA-1088 verificación Wails (2026-09-09): build diagnóstica real abrió Hub.
El importador existente preparó solo Imola/Monza, sin abrir reserva de evaluación.
Evento nuevo selecciona Imola; solver alcanza 8 s (issue #1089). RED/GREEN
confirma que la pantalla de error ocultaba Sesiones; se mantiene el propietario
al nivel raíz entre carga/error/éxito. 20 pruebas focales PASS. La búsqueda
nativa encuentra además límite de composición 128 frente a carpeta >400;
produce mensaje incompatible. Debe corregirse en issue separada antes de
certificar recorrido UI completo. Runtime liberado para overlays #1072.

## T10h — capacidad de edición nativa

PrepareCorrections publica editableChannelIds, explícitamente vacío si no hay
señales preparadas con unidad válida. Se obtiene de páginas ya leídas, conserva
orden nativo y elimina duplicados; no amplía I/O ni infiere capacidad en React.
Contrato TS opcional por compatibilidad: ausencia no concede edición.
RED wire Go y validación TS reproducidos; GREEN 2 focales Go, 42 TS, tipos,
lint focal/build, global Go -p1 y vet del alcance PASS. Vet ampliado a todos
los subpaquetes de app falla en launcher/icon_windows.go:553 (unsafe.Pointer),
deuda heredada ya seguida en #950; archivo intacto. Logs C:/tmp/isa1096-t10h-*.
Review propia: autorización y lectura siguen en withCorrectionInput; la lista
no sustituye la validación de cada guardado. Siguiente transportar capacidad
a RecordedSession y bloquear edición sin permiso explícito, luego historial.
Sin Wails, banco DuckDB, nota visual, push/PR/CI remota o promoción nuevos.

## T10i — capacidad conservada por el propietario

RecordedSession conserva una copia de editableChannelIds. Respuestas antiguas
producen conjunto vacío; recordedSampleCorrection rechaza señales sin capacidad
explícita antes de construir el comando. RED/GREEN, 30 focales/tipos/lint PASS.
Cinco paths declarados. Siguiente T10j: aplicar el mismo límite en Datos y su
fixture UI; después historial. Build/global se agrupan tras ese montaje sin
atribuir aún aceptación general a este corte. No cambios nativos ni promoción.

## T10j — solo lectura visible

Datos conserva señales consultables sin capacidad de corrección y explica el
límite, con botón de muestra deshabilitado. RED/GREEN UI; se actualiza la fixture
del flujo para declarar capacidad explícita, conservando todos sus guards.
24 focales, tipos, lint/build PASS. Global frontend agrupado tras T10k.
Tres paths lógica/test más cuatro idiomas. Sigue historial visible declarado.
No cambios al original, Wails, precisión, nota visual ni promoción nuevos.

## T10k — historial visible de fuentes

Revisiones monta consulta exacta, navegación por padres/cabeza anunciada y retorno
a la referencia de carrera, snapshot con original/corregido/motivo, restauración
como nueva revisión y proyección/adopción explícitas. Configuración guardada se
distingue de resultado calculado; historial completo del plan sigue T14.
Formularios persisten entre pestañas. Cambiar fuente/revisión reinicia formularios
intactos; entradas pendientes bloquean esa navegación. Una razón ya entregada al
controlador no deja Datos bloqueado tras resolución ausente/conflicto.
Cinco paths lógica/test/CSS declarados, cuatro idiomas, roadmap/digest y capturas.
10 focales, tipos, lint/build y global 442 archivos/3478 tests PASS (394.60s).
Logs C:/tmp/isa1096-t10k-*. Capturas revisions-pass-01: navegador/fixture vacío,
no Wails ni telemetría real ni nota >9. Review propia: sin nuevo lector/store,
mutación del original o adopción silenciosa. Se mantiene recuperación entre
reinicios pendiente de T14. Subtítulo/todos los estados cargados van al gate T18.
Siguiente #1099 T11 usos por familia; issue creada y añadida a Project Vantare.
No push/PR/CI remota, merge, promoción o release.
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

## T11i — contraste nativo no disponible: ERROR_INVALID_STATE del controlador WebView2 en tres lanzamientos (causa sin determinar)

Cambio de ejecutor registrado: el usuario ordenó que el orquestador coordine y
Muse Spark 1.3 contributor ejecute vía MCP/opencode en xhigh; esta autorización
sustituye la prohibición anterior de delegación de código sólo para esta
relación. Sin subagentes ni cambio de modelo.

Build diagnóstica bin/vantare.exe de este worktree (sin tags production,
frontend con VITE_* heredadas en build, runtime duckdb-v1 confiado, datos
propios). Dos lanzamientos aislados muertos en el mismo punto: PID13816
(orquestador) y PID30236 (ejecutor, con -profile absoluto a
configs/example-racing.json, -http 127.0.0.1:39262 libre, CDP 9491 libre,
-live=false, LOCALAPPDATA y user-data-folder propios en bin/).

El backend arranca (hub, HTTP 39262 listening, telemetría detenida por
-live=false; 4 hotkeys en conflicto no fatal con la instancia ajena PID26412 de
#1072, preservada). WebView2 Environment se crea, pero
CreateCoreWebView2Controller falla con 8007139F ERROR_INVALID_STATE ("error
creating controller", stderr en C:/tmp/isa1099-t11i-std*.log) y el proceso
termina; CDP 9491 nunca escucha. Sin zombies msedgewebview2 propios; el primer
lanzamiento además chocó en 39261 contra la instancia ajena, ya aislado en el
segundo. Log completo en bin/data/logs/vantare.log (saneado: sin secretos).

Corrección de revisión: la hipótesis de la ventana oculta NO quedó corroborada.
El orquestador lanzó PID31800 visible, con mismos puertos/flags/directorios
aislados y entorno con VANTARE_*: falló en el mismo punto con idéntico 8007139F
(log C:/tmp/isa1099-t11i-visible-stderr.log). Demostrado: tres lanzamientos (dos
ocultos, uno visible) mueren en CreateCoreWebView2Controller con
ERROR_INVALID_STATE; backend (hub, HTTP) y Environment WebView2 correctos; CDP
nunca escucha. No demostrado: la causa. La instancia ajena visible no es control
equivalente (otro binario, perfil y configuración). Sin atribuir fallo al código
de producto ni a otra causa: cero paths de lógica/tests en este corte.
El recorrido con login/entitlement queda fuera de alcance.

Estado final T11i: recorrido Imola + capturas no ejecutados; el runtime
diagnóstico no abre ventana en este worktree hoy. Imola autorizado verificado
intacto antes del recorrido (97513472 bytes, SHA256
35438326ecddd6ab660ed3aad70b076a73e3290236c0292f30657594c38c1eb0). Sin
push/PR/CI remota/merge/promoción/release; LMU intacto; sin roadmap alterado
(no hay entrega que reflejar). Sigue T12 independiente del SDD.

## T12 — microplan de correcciones tipadas de clasificación (ISA-1104, solo docs)

Sesión ejecutora OpenCode ses_f76922768ffe0hHIty8SaEG2IE, provider
opencode-go, modelo muse-spark-1.3-contributor, variante xhigh. Autorización
reciente del usuario (orquestador coordina, Muse Spark ejecuta vía MCP/opencode;
sustituye la prohibición anterior de delegación solo para esta relación);
orquestador revisor. Estado de coordinación para continuidad, no configuración
global. Sin subdelegación.

Issue #1104 (hija de #1091 y #1033, continúa #1099; labels area:estrategia,
roadmap:required, state:in-progress; Project Vantare; token
milestones:strategy-recorded-editor). Rama
vantareapp/isa-1104-recorded-classification, raíz Git C:/tmp/vantare-isa1104,
módulo C:/tmp/vantare-isa1104/vantare-v2, base exacta
7f757135445439851180fc503da45f7eb9e557e7 (el primer checkout usó por error la
ruta .../vantare-v2 como raíz y ubicó el microplan en docs/ de raíz; corregido
con git worktree move a C:/tmp/vantare-isa1104 y reubicación del documento al
docs/ del módulo, sin sobrescribir nada). #1099 y checkout principal intactos.

Microplan en vantare-v2/docs/strategy-planner/sdd/classification-corrections-t12.md:
conjunto cerrado (SessionType enum, WeatherConditions etiqueta opaca, 4 campos
de CombinationIdentity con ID canónico lmu:sha256 del catálogo nativo vía
PrepareCorrections/SessionCatalog, nunca texto del cliente); precondición
original con puertas de HistoricalMetadata y bloqueo con causa, sin fallbacks;
motivo manual sin promocionar mediciones; cuota conjunta 256; snapshot v3 con
compatibilidad v1/v2 y guard legacy extendido; Save/Resolve idempotentes con
expectedRevision/commandId; cambio de combinación que deja obsoleto el plan sin
rebasear, adoptar ni recalcular silenciosamente; consumo en vista separada con
reloj/parser/permisos intactos; clima separado de señales físicas de
temperatura/humedad y de umbrales #1030. Microcortes T12a–T12e de máx. 5 paths
con paths concretos (rg --files), tests observables y gates. plan.md intacto
(sin cambio de rumbo/alcance; la entrega futura lo actualizará y regenerará el
JSON en su PR). Primer corte propuesto: T12a validación pura en
internal/telemetryanalysis/classification_corrections.go +
classification_corrections_test.go (2 paths). Sin implementación, dependencias,
push/PR/merge/promoción en este encargo.
