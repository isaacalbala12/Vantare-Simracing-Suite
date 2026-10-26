# installer — Setup y Uninstall (#1591)

Dos binarios x64 independientes, `vantare-setup` y `vantare-uninstall`, publicados
como `VantareSetup.exe` y `Uninstall.exe`. GPUI usa el mismo commit fijado que la
aplicación. No se añade ninguna dependencia externa al lock.

El Setup contiene el ZIP ya validado, uninstaller y scripts de packaging. Rust
los escribe en un temporal exclusivo y ejecuta el motor PS 5.1 x64 oculto;
`candidate.ps1` y `beta.ps1` conservan autoridad sobre generaciones, locks,
hashes, rollback y datos. Ambos scripts raíz se renuevan solo con Setup. El
payload público excluye ambos binarios del instalador y el admin privado.

La UI copia la ventana #E de `instalador-r3.html`: 720x460 lógicos, marca 240,
footer solo a la derecha, Inter/Rajdhani 700/Space Mono y seis pantallas. Las
únicas variaciones aprobadas son valores reales, tarjetas habilitadas según
versión y aviso de datos conservados en lugar de casilla. Recursos/fuentes y
su procedencia están en [assets](assets/README.md).

Ventana (#1778): ventana normal sin bordes y de tamaño fijo, con entrada propia
en la barra de tareas. La cabecera de 36 px y minimizar usan las zonas nativas
`WindowControlArea` del Hub; cerrar conserva la guarda de la transacción.
«Abrir Vantare» concede ASFW_ANY para la cadena interactiva del bootstrap y
cierra Setup con código 0 cuando Windows acepta el lanzamiento. Si falta el
bootstrap o falla crear el proceso, Setup conserva y muestra el error.
El bootstrap conserva la autoridad sobre errores posteriores y vida del Hub;
no se espera a su salida ni se modifica instalación, actualización o rollback.

Movimiento (#1728): pantallas 280 ms ease-out con desplazamiento de 14 px (hacia
atrás en «Volver»), segmento actual que se rellena, hover por muelle sin rebote
(~150 ms; pulsado instantáneo) e interruptores animados. La barra sigue al valor
real con un filtro exponencial y entre informes del motor avanza despacio hacia
el siguiente hito de `installer-driver.ps1` sin alcanzarlo ni retroceder
(`motion.rs`, con tests). Al terminar, la barra llega al 100 %, espera 350 ms y
entra la insignia de éxito. «Reducir movimiento» de Windows (`MinAnimate=0`)
deja todo estático. El sondeo posterior a instalar corre fuera del hilo de UI.

`/S` no inicializa GPUI. `/D=<ruta completa>` acepta espacios/Unicode; el
uninstaller adopta su directorio y acepta `_?=` legacy. Los códigos del motor
se conservan; 5 significa cancelación previa a la transacción. Tras iniciarla,
la UI espera su resultado y no mata el host ni los procesos de la app.

Registro HKCU `VantareNativeBeta`, menú Inicio Vantare, acceso «Vantare Simracing Suite»; QA conserva
`VantareNativeBetaQA1492` y carpetas QA1492. `installer-ui.json` persiste opciones
y valida la identidad/hash del uninstaller; Register conserva esa UI. Su
autoeliminación sucede en un helper temporal acotado que espera al proceso,
valida hash/raíz y conserva datos y cualquier instalación renovada.

Si Cleanup se interrumpe después de retirar Uninstall.exe y queda su marker,
el Setup público puede reinstalar sin limpieza manual. Solo retira ese marker
si faltan EXE/state/registro, reconoce la raíz nativa y valida identidad
residual y schema/hash/tamaño de los metadatos. Un marker con EXE pendiente o
instalación renovada sigue bloqueando Setup; el helper antiguo conserva la
instalación renovada. Los datos conservados se adoptan por el motor habitual.
`packaging/installer-cleanup-recovery-tests.ps1` cubre handle real del marker,
interrupción sincronizada, reinstalación pública y estas guardas.

## Build y QA

Las generaciones beta instaladas con el inventario histórico exacto de 91
miembros (0.0.975–0.0.979) se leen con compatibilidad explícita. El inventario
está congelado en candidate.ps1; no admite subconjuntos arbitrarios ni cambia al
añadir recursos futuros. ZIP/build/paquetes entrantes conservan la validación
estricta del inventario actual de 109 miembros. Hashes, sidecars, canal y rutas
siguen comprobándose. La importación de perfiles copia el inventario validado
de su generación, no el de un paquete nuevo.

`packaging/historical-inventory-tests.ps1` está incluido en build-inventory-tests
y, por esa vía, en el workflow requerido. Conserva el manifiesto público real
de 0.0.975 y su procedencia en [fixtures](../packaging/fixtures/README.md).
`-LegacyPackage <ZIP público>` repite upgrade/rollback/reinstalar/desinstalar
con todos los archivos reales antiguos y comprueba el digest antes de extraer.
Estas pruebas de motor no sustituyen las campañas del Setup recompilado RC3.

Desde native; envolver cada comando con `native/scripts/compilar.ps1` desde
`vantare-v2/`, como indica el README nativo:

```powershell
powershell -NoProfile -File packaging/candidate.ps1 -Operation Build `
  -Channel beta -Version 0.0.977 -OutputDirectory C:/tmp/ola2/1591-qa/build-a
powershell -NoProfile -File packaging/build-installer.ps1 -Version 0.0.977 `
  -OutputDirectory C:/tmp/ola2/1591-qa/build-a -TestInstaller
```

El builder exige ZIP/version/bootstrap idénticos y construye primero Uninstall,
después Setup con `setup-payload`. Sin esa feature se puede comprobar/renderizar
la UI, pero instalar falla explícitamente por payload ausente.
Los EXE del builder enlazan CRT estático del toolchain: no requieren instalar
VC Redist para abrir Setup. La lista de imports se comprueba en la evidencia;
ICU/DirectWrite/D3D son componentes del Windows objetivo, no descargas de Setup.
`test-installer` exige raíz bajo `C:/tmp/ola2/1591-qa/`; protege la instalación
real incluso con rutas/registro externos. `parity-capture` solo existe en builds
de QA; carga snapshot explícito y deshabilita acciones. Su script
`installer-visual.ps1` exige pantalla libre/mutex y no cambia DPI global.
Sin abrir ventanas en pantalla: `vantare-setup --capture-batch=<manifiesto>`
(misma feature) usa el HWND oculto fuera de los monitores de #1675. El manifiesto
`{snapshot, jobs:[{scene, output, snapshot?, frames?, interval_ms?, reduce_motion?}]}`
vive bajo `C:/tmp/ola2/1591-qa/`; `scene` es un estado fijo o un flujo
(`install-flow`, `remove-flow`, `options-flow`) con motor simulado y `frames` PNG.

Para Abrir Vantare en una build QA, el SID de ejecución debe diferir del SID de
origen incrustado por el builder. Las pruebas headless no arrancan supervisor
ni comparten IPC con Isaac. Live, Windows limpio y escalas físicas 125/150/200 %
deben acreditarse en una cuenta/VM de pruebas; no se deducen de estos fixtures.
No usar publisher ni semillas reales para QA. Authenticode no se implementa
en esta issue; firma Ed25519 del feed sigue obligatoria e inalterada.

## Limitación aceptada: rollback a una generación anterior al instalador GPUI

Si A usa el instalador anterior, se instala B con GPUI y B falla al arrancar,
el rollback restaura A. Su `Register` original puede sustituir el registro y
el acceso de desinstalación GPUI por la entrada PowerShell antigua. No se
reescribe la generación A; los datos siempre se conservan. P2-5 de la revisión
de #1600 queda aceptado por el orquestador con este alcance.

Un Setup B o posterior restaura su Uninstall.exe, el registro GPUI y los accesos
propios conservando las opciones. Esto funciona aunque encuentre la entrada
PowerShell y los metadatos del instalador anterior. Si se desinstala desde esa
entrada antigua, pueden quedar `installer-ui.json` y `installer-notices.txt`
huérfanos: una reinstalación B o posterior los reutiliza/renueva sin bloquearse
por la ausencia del EXE anterior y conserva los datos. Las actualizaciones por
feed de generaciones B o posteriores usan el Register que respeta GPUI.

`packaging/installer-legacy-register-tests.ps1` prueba A → B → rollback A →
reinstalar B, tanto directamente como después de desinstalar desde la entrada
antigua. Usa NSIS y candidate de la base pre-PR limpia `298abc33`, comprueba
registro/accesos/hash/preferencias y datos exactos, y ejecuta Register real de B.
La señal de readiness es una fixture; el arranque live requiere otro SID/VM.
