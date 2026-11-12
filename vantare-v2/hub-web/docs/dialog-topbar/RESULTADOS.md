# Diálogos y barra de ventana

40 pares antes/después reales a 1440×900, oscuro/claro, Windows. Mismos datos locales simulados y paleta Vantare. Base c1ee50e45. Las capturas son seriales con captura.lock; sin compilación Rust. Ninguna confirma un borrado, reset, compra o envío.

La diferencia exacta de píxeles es solo un recibo de cambio, no una medida de paridad con GPUI. Los cambios de sombreado y desplazamiento del popup son deliberados para liberar la barra.

| Escena               | Oscuro                                                                                               | Claro                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| launcher-remove      | bloqueados → activos; Δ 33.26 % (antes (evidencia no versionada), después (evidencia no versionada)) | bloqueados → activos; Δ 33.26 % (antes (evidencia no versionada), después (evidencia no versionada)) |
| launcher-duplicate   | bloqueados → activos; Δ 33.26 % (antes (evidencia no versionada), después (evidencia no versionada)) | bloqueados → activos; Δ 33.26 % (antes (evidencia no versionada), después (evidencia no versionada)) |
| launcher-discard     | bloqueados → activos; Δ 21.45 % (antes (evidencia no versionada), después (evidencia no versionada)) | bloqueados → activos; Δ 21.40 % (antes (evidencia no versionada), después (evidencia no versionada)) |
| app-remove           | bloqueados → activos; Δ 33.26 % (antes (evidencia no versionada), después (evidencia no versionada)) | bloqueados → activos; Δ 33.26 % (antes (evidencia no versionada), después (evidencia no versionada)) |
| studio-remove        | bloqueados → activos; Δ 20.29 % (antes (evidencia no versionada), después (evidencia no versionada)) | bloqueados → activos; Δ 20.24 % (antes (evidencia no versionada), después (evidencia no versionada)) |
| account-reset        | bloqueados → activos; Δ 21.45 % (antes (evidencia no versionada), después (evidencia no versionada)) | bloqueados → activos; Δ 21.45 % (antes (evidencia no versionada), después (evidencia no versionada)) |
| commands             | bloqueados → activos; Δ 11.33 % (antes (evidencia no versionada), después (evidencia no versionada)) | bloqueados → activos; Δ 11.32 % (antes (evidencia no versionada), después (evidencia no versionada)) |
| app-arguments        | bloqueados → activos; Δ 22.26 % (antes (evidencia no versionada), después (evidencia no versionada)) | bloqueados → activos; Δ 22.26 % (antes (evidencia no versionada), después (evidencia no versionada)) |
| profile-arguments    | bloqueados → activos; Δ 22.20 % (antes (evidencia no versionada), después (evidencia no versionada)) | bloqueados → activos; Δ 22.20 % (antes (evidencia no versionada), después (evidencia no versionada)) |
| report-discard       | bloqueados → activos; Δ 44.12 % (antes (evidencia no versionada), después (evidencia no versionada)) | bloqueados → activos; Δ 45.68 % (antes (evidencia no versionada), después (evidencia no versionada)) |
| report-close         | bloqueados → activos; Δ 44.15 % (antes (evidencia no versionada), después (evidencia no versionada)) | bloqueados → activos; Δ 45.70 % (antes (evidencia no versionada), después (evidencia no versionada)) |
| alert                | bloqueados → activos; Δ 21.03 % (antes (evidencia no versionada), después (evidencia no versionada)) | bloqueados → activos; Δ 21.03 % (antes (evidencia no versionada), después (evidencia no versionada)) |
| notifications        | activos → activos; Δ 0.00 % (antes (evidencia no versionada), después (evidencia no versionada))     | activos → activos; Δ 0.00 % (antes (evidencia no versionada), después (evidencia no versionada))     |
| privacidad-pendiente | activos → activos; Δ 0.00 % (antes (evidencia no versionada), después (evidencia no versionada))     | activos → activos; Δ 0.00 % (antes (evidencia no versionada), después (evidencia no versionada))     |
| privacidad-uso       | activos → activos; Δ 0.00 % (antes (evidencia no versionada), después (evidencia no versionada))     | activos → activos; Δ 0.00 % (antes (evidencia no versionada), después (evidencia no versionada))     |
| settings-select      | bloqueados → activos; Δ 0.39 % (antes (evidencia no versionada), después (evidencia no versionada))  | bloqueados → activos; Δ 0.39 % (antes (evidencia no versionada), después (evidencia no versionada))  |
| resident             | activos → activos; Δ 0.00 % (antes (evidencia no versionada), después (evidencia no versionada))     | activos → activos; Δ 0.00 % (antes (evidencia no versionada), después (evidencia no versionada))     |
| context-menu         | bloqueados → activos; Δ 8.05 % (antes (evidencia no versionada), después (evidencia no versionada))  | bloqueados → activos; Δ 8.01 % (antes (evidencia no versionada), después (evidencia no versionada))  |
| access               | activos → activos; Δ 0.00 % (antes (evidencia no versionada), después (evidencia no versionada))     | activos → activos; Δ 0.00 % (antes (evidencia no versionada), después (evidencia no versionada))     |
| onboarding           | activos → activos; Δ 0.00 % (antes (evidencia no versionada), después (evidencia no versionada))     | activos → activos; Δ 0.00 % (antes (evidencia no versionada), después (evidencia no versionada))     |

Todas las escenas comprueban elementFromPoint sobre los tres controles y la franja de arrastre, más foco de teclado en minimizar/maximizar/cerrar. Las 12 confirmaciones/diálogos de pantalla comprueban fondo inerte, 18 pasos de Tab y bloqueo de Ctrl L/S/K. Los que tienen origen comprueban Escape y retorno del foco. Menú contextual comprueba Shift F10, Escape y retorno al perfil. Las puertas no se cierran ni aceptan por Escape. No se pulsa cerrar para simular una confirmación peligrosa.

Los archivos after/*.checks.json solo se escriben después de pasar las aserciones; resultados.json incluye las rutas y SHA-256 de cada imagen. Las cinco escenas infrecuentes (argumentos de app/perfil, descarte/cierre de informe y AlertDialog compartido) usan el componente real con callbacks QA sin escritura; no dependen de selectores nativos ni de servicios reales. Acceso, privacidad y Onboarding son comprobaciones de sus controles propios, no migraciones de producto. Calendario no se toca.

## Revisión: únicos cambios de aspecto

Cuatro pares adicionales: buzón inerte y atenuado bajo Ctrl K, y toast fuera de la zona inerte y por encima del backdrop. Capturas Windows seriales con cerrojo; el resto de escenas conserva la evidencia anterior. Los hashes nuevos están en evidencia local no versionada

| Escena           | Tema  | Antes                           | Después                           |
| ---------------- | ----- | ------------------------------- | --------------------------------- |
| resident-covered | dark  | Antes (evidencia no versionada) | Después (evidencia no versionada) |
| resident-covered | light | Antes (evidencia no versionada) | Después (evidencia no versionada) |
| toast-covered    | dark  | Antes (evidencia no versionada) | Después (evidencia no versionada) |
| toast-covered    | light | Antes (evidencia no versionada) | Después (evidencia no versionada) |

El cierre del toast se pulsa realmente durante la confirmación. Ctrl K cierra la paleta superior; el buzón recupera su estado interactivo al cerrar. La escena del toast comprueba además clic derecho, Mayús F10 y ContextMenu con pulsaciones reales de Electron en Windows: todos cancelan su acción nativa.

Chromium local y el job web ejecutan checkDialogSafety: foco de diálogo primero, controles al final, fondo inerte frente a clics y Tab, Ctrl L sin launcher.favorite ni launcher.launch, escritura de @ con AltGr simulado y Escape anidado del Select. Recibo en evidencia local no versionada

Validación local: 1.140 pruebas aprobadas en el barrido completo y 28 de Studio que superaron una importación fría al repetirse una vez; la repetición dirigida terminó con 41/41. Sin ampliar plazos ni cambiar tests de Studio. Tipos de producto/scripts, lint y build QA pasan. La prueba de producción confirma que los tres marcadores de auditoría y sus módulos no se incluyen en el bundle.

## Segunda revisión

La posición del toast vuelve a la columna de contenido, a 20 px de su borde y sin invadir la barra derecha visible. Se hacen inertes main, carril derecho, navegación y controles del encabezado; el viewport conserva su posición y sus acciones. Diálogos y buzón comparten el contexto de apilado del Shell para que el toast quede sobre el backdrop; sin Shell se conserva el portal de body.

AltGr verificado en Electron Windows con distribución española 0000040A, mediante RightAlt+Digit2 en la cola de teclado nativa. El evento de @ fue isTrusted=true, AltGraph=true, ctrlKey=false, altKey=false, y escribió @. Se restaura la distribución previa y el foco de escritorio tras confirmar la liberación de modificadores. La tabla de modificadores exactos permite también ctrl+alt+@ y bloquea ctrl+alt+b aunque Chromium no informe AltGraph.

CI comprueba además control positivo de Ctrl L (una petición sin diálogo), lista no vacía de acciones de fondo, controles de ventana al final de Tab y foco inicial en el primer botón tras activar Eliminar con Enter. Las sondas se aíslan en una página desechable; al cerrarla desaparecen addInitScript y el hook de MessagePort. El test de producción incluye CSS y rechaza .v-dialog-audit-fixture.

PNG, recibos JSON, registro nativo y capturas comparativas son evidencia local no versionada; sus ubicaciones se entregan en el cuerpo del PR.
