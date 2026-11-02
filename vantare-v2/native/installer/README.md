# installer — Setup y Uninstall (#1591)

Dos binarios x64 independientes, `vantare-setup` y `vantare-uninstall`, publicados
como `VantareSetup.exe` y `Uninstall.exe`. GPUI usa el mismo commit fijado que la
aplicación. No se añade ninguna dependencia externa al lock.

El Setup contiene el ZIP validado y Uninstall. El núcleo Rust verifica el
paquete y ejecuta install/update/repair/uninstall en el mismo proceso, conservando
state.json v1, locks, datos opacos y códigos0–5. Probe descubre raíz/registro y
opciones en Rust. No usa el driver PS para leer ni escribir la instalación.

Excepción transitoria autorizada: una llamada PS por FinalizeInstall,
FinalizeUninstall o Cleanup, solo para la finalización Windows actual. Conserva
transacción/guardas/propiedad de accesos/Run y rollback por bytes. Contrato JSON
máximo64KiB, progreso stdout/diagnóstico stderr/código de salida;
TODO(#1840 p5) sustituye las tres llamadas por shell::sync. El núcleo no envía
estado, ZIP ni datos a PowerShell. Feed y Register continúan heredados.
La finalización conserva la consulta de objetivo para accesos y la persistencia
de sus preferencias Windows hasta p5; Rust no usa su salida para leer estado.

## Lectura compartida — #1840, paso 3

`engine::Installation::read(root, profile)` es el único lector Rust de estado
y manifiesto para Setup y Ajustes del Hub. `State`, `Generation` y `Manifest`
reúnen los tipos; la versión instalada sale del manifiesto de la activa.
El lector no escribe instalación, registro, opciones ni datos. Desde p4,
Context::probe reúne descubrimiento HKCU, opciones y movimiento en Rust.
La propiedad de la raíz conserva la comparación Windows sin distinguir
mayúsculas, incluidos Unicode y separadores; no confunde raíces vecinas.
complete_probe/readContext se conservan solo como adaptador de contraste p3
y oráculo heredado del driver, no los invoca Setup.

| Perfil | Contrato conservado |
| --- | --- |
| Probe | SHA del manifiesto activo, data presente, inventario cerrado y sin archivos ajenos; no rehash de sus binarios. Anterior con hash/tamaño/PE/sidecar completos o aviso y anterior no restaurable, sin reescribir estado |
| Verified | Mismas reglas que Probe, añadiendo hash/tamaño/PE/sidecar de la activa antes de mutaciones; reparar conserva Probe para permitir sustituir una activa dañada |
| Hub | Informativo: schema/canal/referencias y manifiesto, sin autenticar bytes/inventario/data; anterior solo estructural. Estado cerrado 16 KiB, manifiesto 1 MiB; portátil sin state conserva soporte |
| Uninstall | Recuperación estructural aunque se hayan retirado binarios/manifiesto. La lectura estructural permite reanudar la retirada; Context usa el manifiesto cuando existe y deja la versión ausente si ya se retiró, sin DisplayVersion |
| Retire | Contrato estructural del escritor Uninstall-Beta: referencias active/previous y hashes sintácticos válidos, canal beta y previous presente; no exige integridad de binarios ya retirados |

Probe conserva el límite de 64 KiB del manifiesto y el estado sin límite previo;
no se endurecen esos contratos en este refactor. `validation` centraliza los
perfiles existentes: packaging 3–4 componentes/sufijo, Hub con tope de 100 bytes,
comparación Setup de tres u16 sin ceros iniciales. No son gramáticas equivalentes.
El lector común Probe acepta los cuatro canales cerrados, como Read-NativeState.
Setup conserva ExpectedChannel=beta en Context y en el adaptador `complete_probe`.
La clave previous
ausente se rechaza: con StrictMode el PS real no la trata como null. Los rechazos
de contrato disponen de invariantes tipadas para el contraste de la matriz.
Los adaptadores PS y sus reglas siguen hasta pasos 4–7; no se afirma 5→1 global.
El catálogo cerrado ahora pertenece a Rust (engine/members.rs). La matriz
contrasta los cuatro canales con el adaptador PS heredado hasta su retirada p7.
Build.rs ya no interpreta arrays ni funciones PowerShell para generar Rust.

`default-features=false` compila el lector sin GPUI, host, scripts embebidos ni
recursos/payload de Setup. `write-engine` habilita ZIP/operaciones sin GPUI; `transport` conecta Setup y la finalización Windows; `ui` lo incluye; las
features por defecto conservan Setup/Uninstall. Hub depende solo del lector.
sha2 0.10.9 ya fijada se adelanta con aprobación del orquestador; el lock cambia
solo las listas de dependencias de installer/Hub, sin paquetes/versiones/checksums.
zip6.0.0 y windows0.62 directos entran en p4, con aprobación; sin paquetes nuevos.

Fixtures y Nextest: `tests/installation_read.rs` con `fixtures/state-*.json`,
manifiesto 975 público versionado y RC; ausencia física, corrupción, schema futuro,
estado grande, anterior dañada y perfiles de versión. La matriz usa el ejemplo
**solo de tests** `probe-read-matrix` para completar el mismo contexto que Setup;
no se distribuye ni crea un puente de producto. Véase
[evidencia](../packaging/matrix/evidence-1840-p3.md).

El motor se carga con `-Library -Root` explícitos. Probe descubre una instalación;
las operaciones posteriores deben enviar raíz. La build pública omite identidad,
carpetas y prefijo QA del protocolo. `test-installer` exige las cuatro variables
`VANTARE_INSTALLER_QA_IDENTITY`, `VANTARE_INSTALLER_QA_SHORTCUT_FOLDER`,
`VANTARE_INSTALLER_QA_LEGACY_SHORTCUT_FOLDER` y `VANTARE_INSTALLER_QA_PREFIX`;
el builder las recibe mediante sus parámetros QaIdentity/QaShortcutFolder/
QaLegacyShortcutFolder/QaPrefix. El driver rechaza una petición TEST incompleta
o dirigida fuera del prefijo, a la identidad pública o a una instalación de usuario.

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

#1840/1d: el Hub y Setup comparten el enlace Startup. La Run antigua solo se
migra si su comando pertenece a esta raíz: sin preferencia se adopta true, con
preferencia se respeta. Register y el interruptor comparten .operation.lock.
GPUI persiste autostart en installer-ui.json; la compatibilidad antigua usa
startup-options.json en la raíz (schema1/autostart), siempre sin escribir data.
Desinstalar retira la Run válida después de retirar programa; si Windows niega
borrarla avisa y termina. Una Run ajena con el mismo nombre se conserva.

Si Cleanup se interrumpe después de retirar Uninstall.exe y queda su marker,
el Setup público puede reinstalar sin limpieza manual. Solo retira ese marker
si faltan EXE/state/registro, reconoce la raíz nativa y valida identidad
residual y schema/hash/tamaño de los metadatos. Un marker con EXE pendiente o
instalación renovada sigue bloqueando Setup; el helper antiguo conserva la
instalación renovada. Los datos conservados se adoptan por el motor habitual.
`packaging/installer-cleanup-recovery-tests.ps1` cubre handle real del marker,
interrupción sincronizada, reinstalación pública y estas guardas.

## Build y QA

Las generaciones instaladas declaran su inventario en `manifest.json`, ligado
por SHA-256 desde `state.json`. El lector exige rutas del universo cerrado del
motor y rechaza archivos no enumerados y reparse points, pero no exige la lista
de la versión entrante ni una lista histórica congelada. Así N sigue siendo
legible cuando N+1 añade recursos. Las rutas retiradas se declaran en el catálogo
cerrado `NativeRetiredMembers` (hoy vacío), para leer/restaurar generaciones
anteriores y retirar sus binarios al desinstalar; no entran en el ZIP nuevo.
ZIP/build/paquetes entrantes conservan la
validación estricta del inventario actual de 109 miembros. Hashes, sidecars,
canal y rutas siguen comprobándose. La importación de perfiles copia el inventario validado
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
  -Root D:/VantareServer/qa/build-context -Channel beta -Version 0.0.977 -OutputDirectory D:/VantareServer/qa/build-a
powershell -NoProfile -File packaging/build-installer.ps1 -Version 0.0.977 `
  -OutputDirectory D:/VantareServer/qa/build-a -TestInstaller `
  -QaIdentity VantareNativeQA1840 -QaShortcutFolder 'Vantare QA1840' `
  -QaLegacyShortcutFolder 'Vantare Legacy QA1840' -QaPrefix D:/VantareServer/qa/
```

El builder exige ZIP/version/bootstrap idénticos y construye primero Uninstall,
después Setup con `setup-payload`. Sin esa feature se puede comprobar/renderizar
la UI, pero instalar falla explícitamente por payload ausente.
Los EXE del builder enlazan CRT estático del toolchain: no requieren instalar
VC Redist para abrir Setup. La lista de imports se comprueba en la evidencia;
ICU/DirectWrite/D3D son componentes del Windows objetivo, no descargas de Setup.
`test-installer` exige raíz bajo el prefijo inyectado por el builder; protege la instalación
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

## Escritura Rust — #1840, paso 4

`operations` comparte instalación/actualización/reparación y retirada; `package`
conserva SHA externo, miembros exactos, hashes/PE/sidecars, límites128/256/512MiB
y rechazo de enlaces. Comprueba también las entradas crudas del directorio ZIP,
porque un índice por nombre podría ocultar duplicados. `write_fs` mantiene
NTFS/replace atómico, locks, guarda de imágenes vivas y copias verificadas con
carpetas vacías; no mata procesos. Cancelación solo antes del punto copy.

Las operaciones guardan state.json v1. Si finaliza mal shell, se restauran los
bytes previos y se retiran solo generaciones nuevas no referenciadas. El feed
PS conserva su propio consumidor hasta p6; no se retira todavía del producto.
Una desinstalación interrumpida conserva datos/marker y puede reanudarse.

Pruebas Rust en tests/installation_write.rs. El helper ignorado de subprocess
no es una omisión de cobertura: el test padre lo ejecuta antes/después del commit
y exige exit90 y estado íntegro. El ejemplo installer-write-matrix, solo QA,
inyecta HKCU/carpetas y usa el Session real; nunca se distribuye ni acepta rutas
fuera del guard. En una build TEST, VANTARE_INSTALLER_QA_CONTEXT apunta a ese
JSON explícito de contexto bajo QA; no cae a HKCU/carpetas reales.
El ejemplo exige las features `transport,test-installer` y las cuatro variables
QA del builder descritas arriba; uso en [la matriz](../packaging/matrix/README.md).
Solo `test-installer` embebe el guard; Setup/Uninstall de producto no lo incluyen
y rechazan un contexto aislado antes de preparar archivos.

El código de salida del finalizador decide el resultado: un warning con exit0
queda en el log y conserva la instalación. Las regresiones también comprueban
temporales retirados tras fallar replace, catálogo actual y retirado, duplicados
en el directorio ZIP crudo y rollback exacto de UI/Uninstall tras modificarlos.
MinAnimate admite los mismos valores String/DWord que PowerShell.

Paso4, campaña inicial: modelo c15223a27,652/652 Nextest Installer+Hub; escritor
b380a10d7,47/47 Installer y TEST8/8. Fmt/check y Clippy -D warnings PASS.
Matriz88/88 idéntica,45 rechazos y20 comprobaciones de frontera PASS;
Startup48 aserciones en184.232 s. Evidencia y límites en
[evidence-1840-p4.md](../packaging/matrix/evidence-1840-p4.md).
Revisión de #1866 sobre 0bffdad11: fmt/check, cuatro Clippy -D warnings,
Nextest52/52 Installer y49/49 TEST PASS; helper ejecutado por padre en ambas.
Matriz afectada48/48 idénticas y24 comprobaciones de frontera PASS;
Startup48 aserciones en256.082 s, dentro de480 s. Campaña completa previa88/88.
