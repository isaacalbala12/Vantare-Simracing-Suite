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

`/S` no inicializa GPUI. `/D=<ruta completa>` acepta espacios/Unicode; el
uninstaller adopta su directorio y acepta `_?=` legacy. Los códigos del motor
se conservan; 5 significa cancelación previa a la transacción. Tras iniciarla,
la UI espera su resultado y no mata el host ni los procesos de la app.

Registro HKCU `VantareNativeBeta`, menú Inicio Vantare; QA conserva
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
