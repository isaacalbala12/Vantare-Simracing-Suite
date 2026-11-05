# Launcher del Hub

El Hub presenta perfiles y aplicaciones; [`vantare-launcher`](../../../launcher/README.md) contiene el documento,
discovery, políticas, cadenas y propiedad de procesos. El supervisor conserva
atajos y cadenas residentes cuando se cierra la ventana del Hub.

## Documento y compatibilidad

`launcher.json` conserva la versión 1, sus campos antiguos y el límite de 5 MiB.
La lectura común `Document::from_bytes` valida estructura y versión y restaura
la procedencia de perfiles desde `wails_import`, sin consultar archivos Wails.
Una versión futura queda protegida; un archivo dañado se conserva con su aviso
y copia `.invalid`. El escritor común usa bytes observados, lock del SO y
reemplazo atómico; la memoria solo se confirma después del disco.

Si falta el documento, la ruta productiva crea las plantillas Creator y Pro.
Un documento explícitamente vacío se respeta. No se busca `app-settings.json`
en CWD, AppData ni junto al ejecutable. El archivo Wails guardado y los datos
históricos se toleran y conservan para rollback.

Los lectores usan `effective_policy`. Editor y desplegables escriben mediante
`set_policy`; los controles rápidos mantienen sus escrituras parciales antiguas.
Las 18 capturas de los escritores reales protegen los bytes anteriores, incluidos
perfiles sin editar, espejos inconsistentes, campos históricos y archivo Wails.
No se normaliza al leer ni se restaura una representación al guardar.

## Lanzamiento, cancelación y cierre

Una cadena ejecuta los pasos en orden y conserva sus índices al reintentar.
Discovery distingue encontrada, instalada y lanzable. Editor y presentación
comparten `Profile::missing_steps` y conservan sus mensajes de perfil vacío.
La cadena aplica la política por paso: Continue puede avanzar aunque falte una app.

El único constructor recibe el documento, perfil, función de discovery, registro
de procesos, selección de pasos y ruta del documento para su exclusión. La foto del Hub se reutiliza; el residente
escanea dentro del worker sin bloquear su bucle. El scan conserva sus límites.
La cancelación interrumpe esperas, sondeo y reintentos antes de lanzar otro paso;
el cierre recoge el worker. Un import cancelado conserva el mensaje de revisión.

En Windows, todos los lanzamientos usan breakaway y CREATE_NO_WINDOW. Las apps
pueden sobrevivir al Job de Vantare; este flag también oculta apps de consola.
Las políticas de cancelación y salida siguen actuando solo sobre hijos propios.
Un PID, nombre o ruta observada no concede autoridad para matar o reiniciar.
Reuse no convierte un proceso ajeno en propio; Restart necesita un handle propio.

Los ejecutables se lanzan directamente con argumentos JSON separados. La salida
inicial se observa durante 3 s; Steam espera hasta 120 s al proceso real del juego.
El éxito del dispatcher no demuestra que el juego esté abierto.

## Residente y decisiones

Las decisiones distinguen origen Chain, Resident y Exit y conservan su ID.
Escape responde según el origen y no reabre una decisión residente ya contestada.
Una respuesta antigua no puede cancelar la decisión siguiente. Terminar la cadena
del Hub conserva la decisión residente y el mismo drawer.

El trigger LMU se siembra con la primera observación. Si LMU ya estaba abierto
al arrancar el Hub, no lanza el perfil: es el comportamiento intencionado de P5.
El siguiente flanco cerrado-abierto sí puede lanzarlo.

El [protocolo local](../../../ipc/README.md#buzón-del-launcher) usa acciones tipadas con identificadores estables; las etiquetas
son para la interfaz. El estado incluye running y caduca a los 3 s. Hub y residente
rechazan cadenas concurrentes sobre el mismo documento. Conservan sus registros
de procesos propios: el rework de un solo dueño está aplazado.

## Presentación y límites

El Launcher ofrece Perfiles, Aplicaciones y el editor. El progreso de la cadena
y los reintentos siguen disponibles. Se retiran la pestaña Historial y «Últimas
veces», porque los contadores persistidos carecen de escritor. Sus campos siguen
en el documento; no se borran datos ni se cambia el formato guardado.

La detección consulta rutas explícitas, registro, Steam y accesos directos sin
abrir aplicaciones. Las pruebas de procesos, buzones y archivos usan raíces QA.
Fuera de Windows, la inspección de procesos sigue siendo Unsupported (#1542).
No se afirma que un proceso esté ausente sin poder comprobarlo.

El arranque de perfiles con Windows conserva su contrato anterior hasta el paso 8
coordinado con R1/R2. La decisión D1 sobre --background aún no está implementada.

## Verificación

Los tests de Launcher cubren procesos propios, decisiones, confianza, cancelación,
políticas y lectura compatible. Hub prueba escritores reales, drawers y mensajes;
Runtime prueba el residente y el Job con un hijo directo sin breakaway como control.
IPC protege el vocabulario y la frescura del buzón. Los gates de los crates tocados
incluyen fmt, check, Clippy, Nextest y, al tocar Runtime/IPC, telemetría y lifecycle.
Se ejecutan por `native/scripts/compilar.ps1` con targets propios en D: y QA aislada.

El historial técnico anterior está en el [README previo](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ad94ff022e001b3bca98ca502edf80162503ab6a/vantare-v2/native/hub/src/launcher/README.md).
El diseño aprobado y el estado real de cada paso se enlazan en [#1978](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1978).
