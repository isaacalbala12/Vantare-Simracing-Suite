# VANTA-130 · Propuesta concreta para pasos 8 + 7 y continuación 9

Estado: PROPUESTA, pendiente de aprobación del orquestador. No hay código nuevo.
Base verificada: origin/nightly 7e92e1a9e52d57db17263234ec62efc5774794cb.
Paso 6 #1890 integrado por el orquestador como
b68a34311024ad56beac101a7e4e93e96e3fde8a; cinco checks SUCCESS verificados.
Rama vantareapp/isa-1869-paso8-compatibilidad; worktree
D:/VantareServer/worktrees/isa-1869-paso8. Issue #1869, Plane VANTA-130.

## 1. Condición que no puede resolver un parser nuevo

Los lectores actuales exigen layout.version == 1 y deny_unknown_fields tanto
en Layout como en preferencias e instancias. Por ello, ni subir la versión a 2
ni relajar el parser nuevo permite a un binario anterior abrir el nuevo archivo.
Tampoco una copia .bak cambia qué archivo intenta leer ese binario.

ADR 0103 garantiza rollback de binarios Y datos por generación; ese contrato no
cubre binarios lanzados manualmente sobre la misma raíz externa. No se deduce
que una ruta sea segura por su nombre, una variable de entorno o su ubicación.
No se modificará installer, packaging, runtime ni installation.rs para imponerlo.

Recomendación: dos cortes, con activación posterior explícita. 8A prepara lectores
compatibles sin emitir formatos nuevos. 8B activa 7 y los formatos nuevos SOLO
cuando el orquestador certifique una versión mínima compatible para lectores y
escritores que puedan compartir esa raíz. Una raíz con rollback a binarios
anteriores mantiene formato v1 y espejo. No habrá flag que salte esta condición
ni detección automática de «seguro» por ruta. No se promete la retirada completa
del espejo en la entrega 8A.

Decisión solicitada: aprobar esta secuencia y fijar la condición de activación
8B. Si se necesita 7 inmediatamente, hace falta aceptar y demostrar primero que
ningún binario viejo puede recibir los datos nuevos (por ejemplo, rollback con
su copia anterior por generación). Sin esa evidencia no se emiten campos nuevos.

## 2. Formatos y política compatible

Layout v1 sigue siendo el formato escrito por 8A; no recibe reducedMotion.
El lector puente de 8A entiende v1 y el futuro v2. El escritor conserva la
versión leída; no promueve v1 al guardar posición, formato o rendimiento.
No se escriben claves nuevas en v1 durante la preparación.

Ejemplo de cabecera v2: `{"version":2,"instances":[],"reducedMotion":true,"extensions":{}}`.
Layout v2 mantiene los campos actuales y añade reducedMotion: Option<bool> al
nivel del DTO persistido de UI. Ausente significa pendiente de importar; false
y true significan decisión ya importada, nunca reimpuesta desde Apariencia.
No se cambia domain::format::Preferences ni se le añade serde o E/S.

La compatibilidad aditiva futura usa un objeto extensions en el nivel raíz,
con nombres de extensión estables. Los lectores puente conservan las entradas
que no conocen al editar y guardar (no basta con ignorarlas). Los campos actuales,
Settings y sus tipos mantienen validación. Un cambio de significado, un nuevo
tipo de widget o una nueva clave dentro de un objeto cerrado exige una nueva
versión de documento o de contenido que el lector compruebe antes de decodificar.
No se promete compatibilidad para claves arbitrarias dentro de todos los widgets.

Versión futura: error tipado Unsupported, solo lectura, original intacto, sin
.invalid ni guardado por defecto; overlays conserva el último válido. JSON roto:
copia durable .invalid por el escritor común antes de permitir reparación.
Versión conocida con extensions desconocidas: lectura y roundtrip sin pérdida.
Se mantienen límites actuales, CAS, backups y rechazo de archivos de entorno.

Las fixtures históricas representan revisiones de esquema publicadas, aunque
compartan version:1. Cada una lleva SHA de procedencia; una fixture sintética
se etiqueta como sintética, nunca como release. Se congela además el lector
estricto anterior para demostrar su rechazo del nuevo formato y justificar el
límite de rollback. Una prueba de un lector nuevo no demuestra compatibilidad
con el binario antiguo.

## 3. Paso 7: importación y autoridad después de activar 8B

migrate_layout_v1 es pura: recibe layout v1 y el valor de movimiento importable,
y devuelve v2. Antes de publicar, el llamador conserva el original por el
escritor común con CAS y backup. Un conflicto relee al ganador; nunca sobrescribe
una decisión explícita de otro proceso. Una lectura ordinaria no reescribe v1.

El Hub obtiene el valor legado del Store, que ya migró appearance.json. El layout
v2 pasa a ser la única autoridad de movimiento para Hub y overlays; los cambios
del control se guardan por el editor del layout y se aplican solo tras éxito.
Guardar tema/contraste no vuelve a imponer el valor antiguo del Store. El DTO de
Apariencia acepta el campo legado solo para importar; los ajustes de formato del
dominio permanecen puros.

El host nuevo aplica MotionPolicy desde cada layout válido aceptado, dentro de
su recarga actual. Se elimina el sondeo periódico de VANTARE_APPEARANCE_FILE.
Se retira el escritor del espejo cuando 8B sea seguro; los archivos antiguos se
conservan, sin borrarlos. La migración inicial sigue conservando sus originales.

Hay otra condición explícita: un overlay puede abrirse sin haber arrancado el
Hub. Para no convertir un reducedMotion:true legado en false, v1 necesita una
importación de compatibilidad de una sola vez antes de publicar v2. Se propone
conservar SOLO esa lectura de migración para v1 (aprovechando la ruta explícita
existente), sin polling ni autoridad posterior. Si se exige retirar también ese
importador, habrá que garantizar antes que todos los layouts fueron migrados;
no basta con suponer que siempre se abre el Hub primero. Esto requiere decisión
junto con la activación, no una nueva dependencia de runtime.

## 4. Normalización de avisos: conservar intención y regla estructural

session_alerts::synchronize(layout, previous) hace dos trabajos distintos.
La propagación de una edición hecha en la miniatura necesita previous; una
función de normalización de un solo documento no puede adivinar esa intención.
Se conserva una función pura pequeña que aplica esa edición al padre en Editor.
La reparación estructural pasa a UI/Layout::normalized: quitar huérfanas,
crear una mini si falta y copiar contenido/visibilidad/sesión/opacidad/off_track
del padre, manteniendo posiciones y geometrías independientes existentes.
No se introduce dependencia UI -> Hub. Se caracterizan colisión de ID,
duplicados y eliminación antes de cambiar sus reglas; no se inventa una nueva
política de duplicados en esta retirada. La normalización debe ser idempotente
y llegar a documentos externos, inicialización y guardado además de Studio.

## 5. P2/P3 de #1890 incluidos en la secuencia

- P2, origen v1 protegido: proteger solo General, Apariencia o Zoom. El estado
  debe persistir entre reinicios; un simple bool en memoria y publicar defaults
  perdería el origen pendiente. Se propone que el lector puente entienda un
  Store v3 con las tres secciones y migrationPending (lista acotada de secciones).
  8A solo prepara lectura; 8B publica v3 con las secciones legibles y defaults
  temporales para las pendientes. Solo esa sección queda de solo lectura. Al
  resolver el origen, se importa su sección y se retira su marca en UN guardado
  CAS del mismo documento. Fallar mantiene marca, original y otras secciones.
  Los tres originales no se reescriben ni se eliminan. Store v2 actual seguirá
  leyéndose. No se añade metadata a version:2: #1890 la rechazaría y archivaría.
- Aviso de migración: renderizar desde Store, separado del estado transitorio
  de la página; navegar no lo borra. Limpiar store.warning tras un guardado que
  resuelva el problema; no limpiar avisos de secciones aún protegidas ni del
  espejo aún fallido. La tarjeta Diagnóstico debe distinguir carga protegida,
  recuperación y fallo de espejo; no quedarse en «Error local» tras reparar.
- Espejo: durante 8A, incluir su error en el Diagnóstico local preparado usando
  el mecanismo existente y su sanitización. eprintln por sí solo no cuenta.
  Mantener v2 correcto aunque falle el espejo. Después de retirarlo en 8B ya
  no se generan nuevos fallos de espejo; no ocultar los avisos anteriores.
- Zoom v2 inválido: decodificarlo por separado como valor, usar 100 y avisar;
  conservar General/Apariencia y los bytes originales. Copiar los bytes de
  recuperación antes del primer guardado reparador, sin archivar/reiniciar todo
  el documento ni perder el CAS. Cubrir fuera de rango, negativo, string y null.
- CAS v2: al primer conflicto releer el documento para actualizar bytes y
  secciones visibles, conservar el borrador que falló y mostrar el conflicto.
  No hacer una segunda escritura automática. El usuario puede reintentar sin
  reiniciar; el reintento parte del documento actual y de la intención pendiente,
  sin reponer una copia obsoleta de las otras secciones. Error de recarga o
  versión futura conserva el borrador y protege el destino.

Los P3 que no cambian el formato pueden salir en un PR pequeño propio antes de
activar 8B. El P2 no se resuelve con un marcador que el lector #1890 no conoce.
No se crean almacenes alternativos ni escrituras v1 de respaldo para eludirlo.

## 6. Pruebas antes del cambio y gates

Primero caracterización del parser estricto y corpus v1, de sincronización de
avisos desde padre/mini y del comportamiento actual de los cinco P2/P3. Se
conserva evidencia RED de cada bug y el SHA anterior a producción.

Matriz de aceptación: leer cada fixture publicada; futuro protegido sin .invalid;
extensions desconocidas sobreviven a mover/guardar; v1 no se promueve en 8A;
normalización idempotente de layout externo y undo/redo; campo de movimiento
ausente importa, false/true explícitos no se reimponen; overlay iniciado solo;
reloj/sin esperas para recarga cuando proceda; rollback a lector puente y rechazo
documentado del lector estricto anterior. Verificar startup sin escritura.

Store: cada una de las tres fuentes protegida de forma aislada, guardar las otras
dos, reiniciar y comprobar que sigue protegida solo esa; resolverla e importar
sin perder cambios. Navegar y reparar avisos, espejo en Diagnóstico, zoom roto
sin perder tema/General y conflicto -> recarga -> reintento con dos Stores.

Una tanda por corte mediante compilar.ps1, target propio, tres raíces QA
(ROOT/LOCALAPPDATA/APPDATA), fmt write + check, check, Clippy -D warnings,
Nextest de crates tocados y lifecycle; telemetría si se toca IPC/domain/runtime.
Ceder la cola entre cortes. Sin datos reales, instalación ni pruebas que escriban
sin override. Medir producción, tests y docs separados. No tocar baselines,
protocolos live, dependencias ni licencias. Las reservas de layout, motion_policy
y host deben volver a coordinarse vía orquestador antes del primer cambio allí.

## 7. Paso 9 independiente, después del diseño / corte anterior

Nueva rama/worktree desde nightly actualizado, PR propio. Retirar la importación
activa de installer-analytics-consent.json y el argumento import de sus reintentos;
conservar el worker de limpieza de diagnósticos deshabilitados si sigue teniendo
trabajo real. No cambiar consentimientos guardados ni volver a adoptar privacidad.

Retirar la búsqueda/lectura automática de perfiles Wails y su módulo ejecutable.
Conservar wails_import como dato legado opaco compatible y los perfiles ya
importados; no borrar la propiedad ni el JSON original de usuarios. La derivación
histórica de profile.imported debe quedar caracterizada antes de retirarla o
migrarse sin pérdida. La ausencia de Launcher crea el catálogo nativo sin buscar
Wails, también en desarrollo. No tocar archivos Wails ni installer/packaging.
La búsqueda de «sin escritor» se limita a producto activo; fixtures e históricos
pueden mencionar el nombre y no se borran para hacer pasar un test textual.

Paso 10 excluido (#1840); #1870/#1871/#1872/#1888 siguen sin implementar.

## Entrega de esta propuesta

Solo documentación, pendiente de decisión de formato/rollback. No se ejecuta
compilación ni se ocupa la cola porque no cambia código ni fixtures. No hay PR
de implementación, merge, release o promoción del worker. Issue y handoff se
actualizan con #1890 integrado, base nueva y los dos puntos de decisión: versión
mínima para 8B e importador de una sola vez para layouts v1 sin Hub previo.
