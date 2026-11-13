# Launcher compartido

Motor sin GPUI consumido por Hub y supervisor `vantare` mediante Cargo.
Conserva catálogo, documentos, discovery local, cadenas, políticas, compatibilidad de datos Wails ya guardados, procesos y disparadores. `files` conserva lectura acotada y guardado
atómico para los consumidores anteriores del Hub. La presentación y las
fixtures demo permanecen en `hub/src/launcher`.

Depende de serde/serde_json, IPC (escritor común) y services sin su feature HTTP, ya presentes:
conserva el hash y la ruta de confianza existentes. No depende de runtime
ni ui. Sus pruebas de comportamiento existentes se ejecutan en el crate
y en Hub; el lifecycle del supervisor verifica los procesos reales.

`Chain::start(document, profile, found, processes, selected, settings)` es el único
constructor. `selected: None` ejecuta todos los pasos; `Some(indices)` conserva
los índices originales al reintentar. En Windows las apps siempre usan
breakaway para sobrevivir al Job del Hub o del supervisor; las políticas de
cierre siguen actuando sólo sobre los handles propios.

`found` es una función que recibe las apps y devuelve el discovery en el worker.
El Hub entrega su foto con una función que la devuelve; el residente escanea
allí las fuentes locales sin bloquear su bucle. `run` y `run_pass` gestionan
la cancelación antes de lanzar el primer paso; el cierre recoge el worker.
El scan conserva sus límites existentes de archivos y registro.

`settings` identifica el documento compartido. Su lock de cadena es distinto del
lock de guardado y vive solo mientras vive el worker: evita dos cadenas entre
Hub/residente sin impedir editar perfiles. El SO lo libera si el dueño cae.
Los registros de procesos siguen siendo propios; no cambia la autoridad de cierre.

`Profile::missing_steps` comparte la comprobación de disponibilidad entre editor
y presentación. Cada sitio conserva su comprobación de perfil vacío y su mensaje.
Busy y detección en curso son estados de la UI.
La cadena mantiene su política por paso, incluido Continue ante una app ausente.

Fuera de Windows, `discovery::running_all`/`running` devuelven un error
`Unsupported` hasta implementar inspección real de procesos (#1542). Una
lista vacía afirmaría ausencia sin comprobarla y permitiría eludir Reuse/Restart.

El cierre normal de apps propias mata y recoge sus procesos. La API
`processes::Processes::request_close_profile` sólo solicita la terminación y
consulta el estado, sin `wait`: el supervisor la usa después de vencer P.
La espera de confirmación pertenece al cierre normal o al arnés de pruebas,
no al camino forzado. Sólo actúa mediante los handles de hijos registrados.

El Hub abre un Launcher dañado con el catálogo por defecto y aviso de su copia
`.invalid`, conservando bytes originales para el siguiente CAS. Una versión
futura se protege sin copia ni importación Wails y no se puede sobrescribir.
El residente también conserva los originales; sin perfiles válidos no hay nada
que lanzar. La importación Wails activa está retirada en #1869, paso 9.

## Primera apertura sin importación Wails — #1869, paso 9

load_production solo lee el documento nativo. Si falta, publica las plantillas
Creator y Pro con el escritor común/CAS. No busca configs junto al ejecutable,
en CWD o APPDATA ni abre app-settings.json; esto también se aplica a desarrollo.
Un documento nativo vacío se respeta. Uno dañado o protegido no se reinicializa
por esta ruta. Los archivos Wails no se leen, reescriben, mueven ni eliminan.

wails_import permanece como dato compatible dentro de launcher.json. El DTO
legacy::Import conserva source y launcher en el mismo formato anterior, incluidos
los valores archivados que el programa no interpreta. La procedencia de perfiles
ya importados sigue marcándolos como imported y sus duplicados conservan esa
procedencia; no se cambia el flujo de confianza o las políticas de ejecución.
Eliminar el campo rompería documentos existentes con deny_unknown_fields.
Retirar el importador no retira los perfiles ni la copia histórica guardada.

El constructor `Chain::start` recibe también `settings: &Path` y crea
`settings.with_extension("chain-lock")` antes de arrancar el worker. El handle
mantiene la exclusión durante toda la cadena. En Windows se abre sin compartir
con DELETE_ON_CLOSE: el SO elimina el archivo al cerrarse el handle, incluso
tras una caída del proceso. OPEN_REPARSE_POINT evita seguir un enlace al limpiar.
En Unix de desarrollo se conserva el archivo vacío para evitar la carrera entre
un archivo anterior abierto y otro recreado; el SO libera el lock al cerrar.
En ambos casos el archivo no guarda estado. El lock de guardado es distinto,
por lo que el perfil sigue editable durante la cadena.

## Resultado por ejecución (#2186)

`Chain::start_checked` clasifica inicio ocupado, inválido o E/S; `start` conserva
el texto legacy. El worker devuelve `ChainOutcome`; `finish` recoge un terminal
sin cancelar una cadena activa, y conserva ese mismo resultado en lecturas
posteriores. `shutdown` mantiene su contrato anterior de cancelación y join.
Completed requiere todos los pasos seleccionados correctos: Continue tras un
fallo no lo convierte en éxito. Se distinguen cancelación, rechazo de confianza,
decisión caducada, fallo de cleanup y panic sin analizar mensajes.

El residente publica un anillo de 32 eventos dentro de una extensión opcional
al Status v2, con instancia por arranque y secuencias decimales exactas. Leer no
consume. Extensión futura/dañada se descarta sin perder el Status legacy; si
su adición excede el marco legal anterior, se omite entera. No hay ACK,
persistencia ni agenda. Un hueco o un reinicio no demuestra éxito.

`snapshot::read_checked` lee bytes una vez con el lector tipado, verifica su
SHA-256 completo y devuelve Document/Profile por valor. Un error, versión
protegida, perfil ausente/vacío o revisión distinta rechaza sin recargar el Store,
reparar archivos ni volver al documento cacheado. El motor ejecuta esa instantánea.

### Respuestas comprobadas L53
Chain.answer conserva el canal legacy. Chain.answer_checked devuelve un error
tipado para pregunta caducada, acción no ofrecida, confianza que requiere editor
o estado no disponible. Una selección comprometida y la caducidad comparten el
estado de la pregunta pendiente; se consume la selección antes de declarar su
vencimiento. No interpreta mensajes de progreso. Los tests inyectan el reloj;
no arrancan aplicaciones reales para comprobar ese arbitraje.

### Control comprobado L54
`Chain::cancel_checked` arbitra la petición con el fin del worker bajo el mismo
bloqueo al comprometer la finalización en el pipeline, antes de salir del hilo:
una cancelación posterior se rechaza. El Drop solo cubre un panic previo.
Aceptar solo fija la cancelación;
el terminal conserva el resultado real y las políticas Leave/Started/Ask.
No se llama a shutdown ni se mata desde el anfitrión. Las preguntas de cierre
se responden mediante L53. Cancelar usa la revisión de la ejecución, aunque
launcher.json haya sido editado, protegido o borrado después.

El ensayo relee una sola instantánea validada al consumir y selecciona todos
los índices cuyo app_id != "lmu", con comparación exacta que distingue
mayúsculas y minúsculas, igual que GPUI. Conserva posiciones y pasos repetidos;
un perfil vacío o solo LMU devuelve NoSteps. No detecta juegos personalizados.
No incorpora aún resultados por paso ni reintentos (L55).

### Resultados por paso y reintento L55
El worker conserva una foto tipada y acotada de sus pasos, sin analizar mensajes.
Chain::step_results devuelve una copia; un bloqueo dañado o un final incompleto
no autoriza reintentos. Las transiciones no consumen eventos del anillo.
Los reintentos automáticos conservan el último resultado terminal de cada índice,
como retry_steps: iniciar otro pase no borra un fallo previo de un paso que no
llegue a ejecutarse de nuevo. Una pregunta tras fallar conserva el estado Failed.

El residente guarda solo la ejecución activa o la última terminada, con cuenta,
perfil, revisión, modo de origen y los índices originales privados. Retry Failed
selecciona solo Failed; Cancelled/NotRun no equivalen a fallo. Retry All significa
«Repetir los mismos pasos»: restaura esa selección original incluso después de
un Failed parcial. Un ensayo nunca recupera LMU por usar All; es una diferencia
intencionada respecto a All del GPUI, que recorre el perfil entero.

Se exige la última ejecución terminada, foto completa y terminal aún retenido;
reinicio, hueco, ejecución desconocida o información incompleta = UnknownRun.
Una nueva lectura debe conservar el SHA-256 de origen y la autoridad debe seguir
observando la misma cuenta con permiso de lanzamiento. Accepted inicia un run
nuevo; no reescribe el resultado anterior ni lo convierte en éxito.
