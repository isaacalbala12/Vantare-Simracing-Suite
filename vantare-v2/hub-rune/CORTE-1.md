# Corte 1 · Hub Rune · VANTA-143 / #2256

Estado: **pendiente de aceptación**, no equivale a entregar ni elegir Rune.
El orquestador autorizó abrir los cinco PRs sin esperar al Mac, que duerme.
No se ejecutó el binario, una ventana ni una opción gráfica en el servidor.

| Requisito ADR 0108 §4 | Evidencia automática disponible | Pendiente para aceptar |
| --- | --- | --- |
| Windows 10 22H2 y 11, 100/125/150 % | Build del ejecutable y Clippy Windows PASS; test Runtime PASS a escalas 1/1,25/1,5, sin dispositivo | Ejecutar la ventana real en ambos Windows y las tres escalas; CI windows-latest no certifica esos sistemas |
| Teclado español, acentos y AltGr en campos | Catálogo compartido y casos Unicode de texto dinámico | Entrada física/IME/AltGr en un campo real; el marco no incorpora formularios y no se da este punto por probado |
| Todo por teclado y controles con nombre | Test Tab/Enter/Espacio PASS, controles enfocables con nombre y árbol AccessKit, sin gráfica | Recorrido completo real y lector de pantalla Windows/Mac; no basta el árbol simulado |
| Aspecto fiel aprobado por Isaac | Nueve temas claro/oscuro, fuentes/textos/iconos compartidos; fixtures de Electron | Capturas headless del Mac para cada paso y comparación lado a lado; ventana visible y visto bueno de Isaac |
| Media hora de uso normal sin bloqueos | Tests de protocolo, cierre, mensajes acotados, estados y Roadmap sin ventana | Sesión real continua de 30 minutos y registro de cierres/bloqueos; no se sustituye por tiempo virtual |

Clippy local final usa un solo slot, dos jobs, target persistente en D: y
`--locked`; los logs de revisión están en `D:/VantareServer/evidence/hub-rune/review-2/`.
Última suite local, antes de los retoques de tercera revisión: 29/29 tests Rust PASS (antes 17 iniciales y 22 tras la primera), cinco tests de licencias y 22 de rutas CI PASS.
La segunda revisión añadió escena silenciosa; la tercera amplía el cierre a 10 s, rechazo/envío fallido,
espera de lectura/envío por eventos, cancelación durante lectura y escritura y
Drop que cancela antes del join. Node admite sufijos y devuelve error legible si
la versión es desconocida.
Regresiones reproducidas y corregidas: escritura de pipe con lector lento,
claves repetidas de Roadmap y sección activa tras revocar acceso. Sin Node,
el catálogo falla con un mensaje de instalación claro, comprobado retirándolo del PATH.
La regresión de Enter (16 PASS / 1 FAIL antes del arreglo) queda conservada.
Se añadió activación de botón por Enter, sin repetición al mantener pulsado,
conservando Espacio; no se debilitó la prueba. CI remota y SHAs en PR 5 y #2256. Esta tabla no
convierte tests preparados o CI pendiente en resultados aprobados.

## Cola de comprobación cuando vuelva el Mac

1. Comprobar espacio libre y usar solo el target propio `~/target-isa-2256-hub-rune`.
2. Repetir formato, Clippy, tests sin dispositivo y build sobre el SHA entregado.
3. Escenas: muestrario claro/oscuro (PR 2), marco expandido/contraído y temas
   (PR 3), `core-offline`, `core-connected`, `roadmap-base`,
   `roadmap-published`, `roadmap-error` (PRs 4–5). Usar las referencias Electron
   existentes. Guardar cada comparación en `D:/VantareServer/evidence/hub-rune/<paso>/`.
4. Probar la ventana visible, teclado y lector cuando Isaac desbloquee; después
   30 minutos de uso normal. Probar también X: WindowClose → CloseRequested →
   CloseAnswer → salida; Rune oculta la ventana antes del callback y conserva
   el proceso para completar el protocolo, con un límite de 10 s si no hay respuesta. El smoke real Windows de hub-host sigue pendiente
   fuera del servidor con parada gráfica: `VANTARE_HUB_UI`, `hub-ready`, EOF y
   salida 0; comprobar también núcleo apagado y datos reales de QA sin cuentas.
5. Actualizar esta tabla con máquina, SO, escala, SHA, resultado y evidencia.
   Retirar únicamente el target Mac propio al cerrar la tanda.

Este worker no realiza merges ni promociones, ni modifica instalador/distribución o releases.


## Tercera revisión · cierre y E/S

El cierre usa 10 s: supera report-close (5 s) y el cierre forzado Live/ControlEof
(2 s). En el protocolo actual WindowClose solo emite CloseRequested; el veto es
CloseAnswer false de la interfaz, sin mensaje HostToUi de veto. Este marco de
solo lectura confirma el cierre. Ante Failure id 0 Busy/Rejected/Denied/Protected,
se desarma el plazo y AppHandle::open pide reabrir y enfocar. Rune puede reabrir
con keep_running, pero no impedir que X oculte antes la ventana: comprobación
visible de ocultado/reapertura/foco pendiente del Mac. No se afirma hecha.

CancelIoEx comprueba y registra errores distintos de ERROR_NOT_FOUND. El drenaje
espera como máximo 1 s, sin GetOverlappedResult con espera infinita. Si Windows
no confirma la finalización, se registra y aborta el proceso para conservar la
seguridad de buffers aún en uso. Un timeout de escritura para definitivamente
la conexión; lectura cancelada usa ConnectionAborted. Esta ruta excepcional y
el comportamiento de ventana siguen pendientes de comprobación física.

Se prepararon 32 tests sin ventana (tres nuevos y el plazo actualizado). No se
han ejecutado localmente estos retoques: cola cedida a E para L53/contratos v33
hasta su aviso. Formato y comprobaciones ligeras locales; Clippy/tests de los
nuevos heads se delegan a la CI. Los 29 PASS anteriores conservan su SHA/evidencia.
