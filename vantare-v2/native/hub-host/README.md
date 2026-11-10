# Anfitrión del Hub web — ADR 0107 / VANTA-138

Proceso Rust que no compila ni enlaza GPUI y conserva la identidad `vantare-hub.exe` ante el núcleo.
Cargo produce `vantare-hub-host.exe` para evitar colisionar con el Hub congelado;
la preparación de QA lo copia como `bin/vantare-hub.exe`. Todavía no sustituye al
Hub distribuido. No cambia el núcleo, sus servicios ni sus derechos.

Electron se instala en `hub-ui/vantare-hub-ui.exe`, junto a `bin` dentro de la
generación. Solo en debug o con `qa-e2e` se admite `VANTARE_HUB_UI` con una ruta
absoluta de QA; `dev` usa el Electron local de `hub-web`. Release sin ese feature
exige la interfaz incluida en la generación instalada. El renderer no recibe
rutas, credenciales ni acceso directo al sistema de archivos.

## Puente y ciclo de vida

El experimento de stdio en Windows y la alternativa están conservados en
`D:/VantareServer/evidence/hub-web/stdio-probe`. Se usa el plan B: pipe privado,
nombre aleatorio, ACL del usuario actual, rechazo de clientes remotos, primer
servidor exclusivo y comprobación de PID e imagen del hijo. La autenticación
usa un valor aleatorio de un solo arranque que Electron elimina del entorno
antes de crear el renderer. No se registra el valor.

El formato es JSON precedido por longitud u32 little endian, máximo 1 MiB.
Cada pantalla aporta su contrato en `src/protocol/modules/<id>/`.
`build.rs` descubre los módulos y ensambla enums, modelos, estado y tabla de
despacho sin índices versionados. El exportador usa `ts-rs = 12.0.1` y escribe
un TypeScript y un corpus por módulo; los tests comparan esos archivos con Rust
(y rechazan módulos sobrantes), comprueban la cobertura del wire y un único
handler por solicitud. Los dos extremos validan los mensajes. Instrucciones y
firmas en [screen-contracts.md](../../hub-web/docs/screen-contracts.md).
El núcleo simulado comparte el contrato y solo se activa explícitamente en una
interfaz sin empaquetar o en la copia QA. `hello` y `ready` pertenecen al proceso
principal: el renderer solo puede enviar solicitudes, suscripciones y respuestas
de cierre. El corpus generado de todas las variantes se valida también en Vitest.
Las listas de métodos, temas, paletas, zoom y rangos proceden de Rust.
`ts-rs` solo se compila en tests o con el feature `bindings`.

El hijo nace dentro de un Job Object con `KILL_ON_JOB_CLOSE`, mediante el atributo
Win32 de creación de proceso. Si el supervisor termina al anfitrión, Windows
termina también Electron y sus descendientes. Una salida incluso correcta antes
de autenticar el pipe es un error de arranque, no un cierre limpio.

El anfitrión abre las fotos con demanda vacía, los derechos con `Feed` y los
servicios del supervisor con `Probe`. Con demanda vacía el pipe de fotos solo
entrega latidos: Live se lee de `Policy.live` en el Feed autenticado, calculado
por el núcleo con el predicado oficial de dominio. Una desconexión retira la conexión y los
derechos de la vista; no concede permisos por ausencia de datos. Las operaciones
no idempotentes no se reenvían automáticamente. `--control-stdin` conserva el
cierre por EOF. Electron confirma el cierre cuando terminan las solicitudes
pendientes; un error de guardado solo puede cancelar el cierre por ventana. Live descarta
la intención pendiente y permite cerrar. En EOF el
anfitrión aplica un límite de dos segundos para un renderer bloqueado. Una
entrada en Live cierra el Hub. `hub-ready` solo se publica tras mostrar la ventana.

## Comprobaciones locales

Desde `vantare-v2`, usando los slots persistentes en D: del README nativo:

```powershell
$env:VANTARE_TARGET_ROOT='D:/VantareServer/targets'
$env:VANTARE_HUB_QA_ROOT='D:/VantareServer/qa/hub-host-check'
pwsh -NoProfile -File native/scripts/comprobar.ps1 hub-host
pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File native/hub-host/check.ps1 -ArtifactDirectory "$env:VANTARE_HUB_QA_ROOT/tools"
```

Para regenerar tipos, sustituir el script final por `regenerate-and-check.ps1`.
Este actualiza los bindings y luego ejecuta las mismas comprobaciones.
La copia del ejecutable se hace dentro de la reserva: no se consume un binario
del slot después de liberarlo, porque otro checkout puede limpiarlo.
Para los smokes fijar `VANTARE_HUB_HOST_BINARY` a esa copia en QA,
`VANTARE_HUB_QA_ROOT` a una carpeta local absoluta reservada a estas pruebas y,
para el smoke con núcleo, `VANTARE_HUB_CORE_BIN_DIR` a sus binarios QA.
`VANTARE_HUB_EVIDENCE` permite elegir la salida; por defecto queda en
`hub-web/test-results`. Ningún smoke presupone una unidad o checkout concreto.
`check.ps1` usa `qa-e2e` para la automatización local: activa CDP de Chromium
solo en loopback. **Ese feature no se habilita en distribución.** No abre el
inspector de Node ni cambia los fuses cerrados.

Desde `hub-web`, tras compilar y empaquetar la interfaz con
`VANTARE_HUB_QA_BUILD=1` (copia separada `release/package-qa`):

```powershell
node --experimental-strip-types scripts/smoke-host.ts
node --experimental-strip-types scripts/smoke-core.ts
```

El primer smoke crea una generación nueva bajo `VANTARE_HUB_QA_ROOT`, verifica
el arranque sin núcleo, aislamiento, señal de listo y cierre por EOF. El segundo
requiere `vantare` y `vantare-core` compilados con el feature existente `qa-e2e`;
crea su propia raíz bajo `qa/licencias-e2e`, una captura local y endpoints HTTP
loopback que responden sin cuentas. No usa servicios reales. Su overlay auxiliar
solo conserva abierto stdin; la admisión se comprueba contra supervisor y núcleo
reales. Los resultados y capturas se escriben en la carpeta de evidencia elegida.

Windows 10 22H2 sigue pendiente de una máquina o VM de Isaac: ejecutar ambos
smokes, comprobar el foco y cierre nativo, cambiar escala al 125/150 % y guardar
las capturas junto con versión de Windows, SHA y resultados. No afirmar soporte
probado en Windows 10 a partir de la ejecución del servidor.


Ajustes I copia el almacén y las formas persistidas del Hub congelado, sin alterar
sus archivos. Exporta `SettingsView` y parches tipados mediante ts-rs. El descarte
recarga el documento actual; no guarda la intención que perdió un conflicto.
Para el movimiento ya presente en layout se usa un adaptador JSON mínimo propio,
con CAS. Solo interpreta versión, instancias y `reducedMotion`; conserva los otros
valores JSON sin normalizar sus bytes. Los documentos desconocidos o malformados
quedan protegidos. No depende de `vantare-ui`; un test comprueba el árbol Cargo
con todos los features y rechaza GPUI. Ctrl L reutiliza el documento y el buzón del residente del
Launcher y exige derechos frescos; el renderer no recibe rutas ni ejecutables.
El inicio con Windows llama al motor del instalador existente. En una build
`qa-e2e`, el motor solo admite contexto de registro/shell aislado explícito.


## Evidencia del endurecimiento

Los tests normales del crate incluyen pipes Win32 reales: token y PID erróneos,
trama de 1 MiB + 1, EOF, hijo que sale antes de conectar y cierre del supervisor.
Otro test termina al propietario del Job Object y comprueba la terminación del
hijo y su descendiente. Usan señales del kernel y procesos auxiliares, sin sleeps.
El caso ignorado `peer_process` es exclusivamente el ejecutable auxiliar que esos
tests invocan; no es una comprobación pendiente. Release prueba además que una
ruta de desarrollo no se admite. Estos tests entran en el job nativo existente.

En el servidor, `comprobar.ps1 hub-host`, cuatro jobs y slots en D:, pasó de
439,9 s (20 tests, base c18f78724 con GPUI) a 180,4 s (34 tests, sin GPUI).
Es una observación con las cachés del servidor, no una comparación controlada de
compilación en frío. Logs y medidas: `evidence/hub-web/endurecer-before-*` y
`endurecer-after-*` en la carpeta externa de evidencia del servidor.

**Condición de empaquetado de #1995:** todos los archivos de `hub-ui/**`, incluidos
Electron, DLL, recursos y `app.asar`, deben estar cubiertos por tamaño y SHA-256
en el manifiesto de integridad, igual que `bin/`. No integrar en el instalador
hasta completar esa cobertura y mantener en verde los tests de pipes reales.
Este cambio no integra ni publica el instalador.


El adaptador conserva los bytes de los valores JSON opacos, incluida su precisión,
pero al guardar ordena las claves superiores y compacta ese objeto. No conserva
la presentación original del objeto superior. Los documentos protegidos no se
reescriben.

El test de arquitectura cubre la construcción aislada `-p vantare-hub-host`, con
todos sus features. Cargo unifica features de dependencias compartidas cuando se
construye `--workspace`: otros binarios activan `installer/ui`, y esa compilación
conjunta puede volver a compilar GPUI también en la instancia compartida del
instalador. No se promete aislamiento de features en `--workspace`; para producir
el anfitrión sin GPUI hay que compilarlo por separado con `-p vantare-hub-host`.
No se han modificado el instalador ni la topología de los overlays.


Review #2015: un layout ausente solo se observa; el anfitrión nunca lo crea ni
lo inicializa. El núcleo conserva la siembra de starter_layout y el criterio
layout_preexisted del onboarding. Rendimiento/ocultar esperan al documento;
reducedMotion mantiene exclusivamente su fallback en los ajustes del Hub.
La cadencia y la validación del adaptador se comparan con el código productivo de
UI en un test unitario de UI, que depende del host solo en dev-dependencies.

Los tests de privacidad con CAS y bloqueo real son Windows: usan las garantías
Win32 del adaptador de ficheros y del consent lock. El corpus de privacidad y la
validación de proyecciones se comprueban también en Vitest, sin esa restricción.
La corrupción después de un permiso afirmativo borra la proyección anterior y
muestra valores denegados/protegidos sin reescribir el documento dañado.
