# P2 del repaso funcional A y C · contraste con nightly

VANTA-138 / #1995. Base comprobada: `5919e64e0` (13-11-2026).
Los informes originales A.md y C-launcher.md son lecturas históricas; esta tabla
contrasta sus hallazgos con el código actual. No certifica hardware ni servicios
reales. Los IDs L pertenecen a C-launcher.md.

| ID                                      | Estado en la base                                       | Evidencia actual / resolución                                                                                                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A06 / L64, lanzar desde el raíl         | Resuelto                                                | #2194 (`464cddc6a`): Shell llama a useLauncherLaunch con ID y revisión; LauncherRequest comparte el bloqueo de envío.                                                                                                                                                                              |
| A08 / L64, lista fuera de Launcher      | Resuelto                                                | #2194: Shell conserva listen/subscribe launcher al cambiar de pantalla y publica en la misma caché. Client.subscribe cuenta propietarios y solo envía subscribe al pasar 0→1 y unsubscribe al pasar 1→0: montar/desmontar Launcher no duplica la suscripción de transporte ni desconecta el marco. |
| A16, campana                            | Resuelto                                                | #2200 (`2761b4edb`): NotificationPopover registra useWindowDialogSurface; usa el aislamiento, foco y bloqueo comunes. Conserva los controles de ventana.                                                                                                                                           |
| A17 / A18, paleta y perfiles            | Resuelto                                                | #2180 (`06333adb2`): CommandPalette, profileCommands, revisión capturada y comprobación actual antes de enviar. Sin destinos huérfanos.                                                                                                                                                            |
| A21 / L62, atajos                       | Resuelto                                                | #2205 (`b0ec2f9c1`): Shell usa hubShortcut/hubBindings; modificadores exactos, AltGraph y repetición solo para zoom.                                                                                                                                                                               |
| A24, techo de zoom                      | Resuelto                                                | #2205: window-zoom.ts usa niveles generados y 1280×720 lógicos; resize y ZoomControl respetan ese techo.                                                                                                                                                                                           |
| A33, guardar informe al cerrar          | Resuelto                                                | #2212 (`131b723d2`) y #2234 (`ae8d4248c`): ReportsState registra setReportClosePreparation; report-close limita draft.save a 5000 ms y ofrece recuperación ante error. Los tests report-close-client y reports-state cubren cancelación y cambios de sesión.                                       |
| A37, arranque minimizado                | Resuelto                                                | #2196 (`d5e35acb8`): minimizar antes de showInactive; #2237 (`dfeb9b059`) retiene la segunda instancia anterior a ready-to-show. main-startup.test.ts protege el orden.                                                                                                                            |
| A41, zoom en diálogo                    | Resuelto; decisión accesible conservada                 | #2205: dialogShortcut deja pasar solo acciones de zoom; Shell las procesa también desde campos y Select. Mantener el zoom disponible, con techo de ventana y guardas de Ajustes, es la opción accesible. No se vuelve a bloquear.                                                                  |
| L01, inicialización tras Busy/Io        | Resuelto                                                | #2231 (`b3445f7a3`): Reader restablece opened si initialize_missing falla. Tests de Busy/Io y de no recrear el documento eliminado tras abrirlo.                                                                                                                                                   |
| L22 / L44, argumentos de paso/app       | Diferencia deliberada de seguridad                      | No se añaden campos libres al renderer: se conservan opacos y se confirman las pérdidas al sustituir. La decisión expresa de no exponer argumentos sigue vigente; accesibilidad no justifica ampliar esa autoridad.                                                                                |
| L29, opciones durante una cadena        | Cierre en este PR                                       | Mantener la guarda Busy del anfitrión. Los valores pasan a solo lectura enfocable, con motivo visible y aria-describedby; al terminar la cadena recuperan la edición. No presentar botones aparentemente editables que el anfitrión rechazará.                                                     |
| L53, responder decisiones               | Abierto: necesita contrato y coordinación del residente | El módulo launcher_resident solo admite get. El IPC answer-v2 lleva decision/action, sin instancia ni generación de cuenta en la orden: no basta con añadir botones o releer el estado antes de enviar. Hace falta rechazo autoritativo de decisiones de otra instancia/cuenta.                    |
| L54, cancelar cadena / probar sin juego | Abierto: capacidad no disponible                        | El wire Hub no tiene esas órdenes. Action::Cancel contesta una pregunta; no es una orden general para cancelar una cadena o lanzar una prueba. Requiere contrato y residente.                                                                                                                      |
| L55, reintentar fallidos/todos          | Abierto: capacidad no disponible                        | Hay terminales tipados de ejecución, pero no órdenes de reintento ni progreso por paso en el contrato Hub. No deducir éxito ni reconstruir una cadena desde el renderer.                                                                                                                           |
| L56, borrar con procesos propios vivos  | Abierto: falta dato autoritativo                        | ResidentView no proyecta propiedad viva por perfil. running=false no demuestra que las aplicaciones terminaran. Hace falta proyección del dueño de procesos antes de replicar has_profile de GPUI.                                                                                                 |

## Decisiones y alcance del primer cierre

L29 conserva la política existente que impide escribir opciones mientras ejecuta
una cadena (`native/hub-host/src/launcher/actions.rs`, edit/option). Se corrige
la barrera de lectura: los controles permanecen enfocables, anuncian solo lectura
y el mismo motivo visible. No envían cambios por ratón ni teclado. Al terminar
running, se recupera la edición con la revisión vigente. El bloqueo por documento
protegido y la serialización de peticiones permanecen intactos.

A41 ya aplica el criterio de accesibilidad solicitado: se permite zoom también
con un diálogo y un Select anidado, manteniendo foco y límites. No necesita otro
PR ni una nueva decisión.

L53–L56 no son cuatro ajustes de presentación. Cerrarlos de verdad requiere
ampliar contratos del Hub/IPC y, para las órdenes o la propiedad viva, el
residente. No se modifica runtime ni supervisor en este lote. Se informa al
orquestador del límite antes de tocar esas rutas. No se habilitan controles que
prometan acciones ausentes ni se relajan comprobaciones de identidad.

## Verificación de L29

Pruebas con valores reales de la fixture: Tab alcanza los cinco Select y el
Switch durante running; readOnly y aria-describedby señalan el motivo visible;
ratón/teclado no emiten onOption; al terminar se puede guardar otra vez. Se
comprueba también que un guardado pendiente conserva el foco y que el documento
protegido sigue bloqueado. Capturas Windows con captura.lock cuando se cierre el PR.

Handoff en el cuerpo del PR, sin editar los archivos compartidos.
