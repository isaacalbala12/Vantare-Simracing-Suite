# installer — Setup y Uninstall (#1591)

Paso 6 de #1840: `Vantare.exe` ejecuta Run, Apply, Confirm y Register en Rust;
Feed usa la oferta firmada en services y SetStartup llama a `shell::sync`.
La matriz QA ejerce esos caminos con raíces, HKCU y carpetas inyectadas.
Los apartados de campaña de los pasos 4–5 de abajo describen su estado histórico.

Dos binarios x64 independientes, `vantare-setup` y `vantare-uninstall`, publicados
como `VantareSetup.exe` y `Uninstall.exe`. GPUI usa la misma versión publicada Kit/Pre del workspace (VANTA-139).
La migración de dependencias y sus medidas están en [GPUI-MIGRATION](../ui/GPUI-MIGRATION.md).

El Setup contiene el ZIP validado y Uninstall. El núcleo Rust verifica el
paquete y ejecuta install/update/repair/uninstall en el mismo proceso, conservando
state.json v1, locks, datos opacos y códigos0–5. Probe descubre raíz/registro y
opciones en Rust. No usa el driver PS para leer ni escribir la instalación.

Paso5 implementa shell::sync nativo para instalación/retirada, con propiedad de
accesos/Run y recuperación desde el estado lógico restaurado, sin copias de bytes.
Excepción permanente autorizada: installer-cleanup.ps1 espera al padre y valida
raíz, temporal, marcador y hash para retirar el Uninstall propio y su temporal.
No interpreta ni modifica estado, registro, accesos ni datos; powershell.exe vive
fuera del árbol. Tras esperar al padre, vuelve a comprobar state.json y marker/hash
bajo el bloqueo para rechazar una renovación concurrente.
El ensayo POSIX falló ACCESS_DENIED y queda manual, documentado en la evidencia p5.
Feed y Register continúan heredados hasta sus pasos previstos.

## Lectura compartida — #1840, paso 3

`engine::Installation::read(root)` es el único lector Rust de estado
y manifiesto para Setup y Ajustes del Hub. `State`, `Generation` y `Manifest`
reúnen los tipos; la versión instalada sale del manifiesto de la activa.
El lector no escribe instalación, registro, opciones ni datos. Desde p4,
Context::probe reúne descubrimiento HKCU, opciones y movimiento en Rust.
La propiedad de la raíz conserva la comparación Windows sin distinguir
mayúsculas, incluidos Unicode y separadores; no confunde raíces vecinas.
El paso 5b elimina complete_probe/readContext, el driver y el catálogo manual.

| Fase | Contrato vigente |
| --- | --- |
| read | Metadatos ligados por SHA, esquema/canal, rutas seguras y data presente, sin recalcular hashes de binarios |
| verify | Mismos metadatos más tamaño, SHA, PE x64 y sidecar de los binarios; una comprobación por generación única y operación |

La lectura acepta BOM, usan documentos de hasta 64 KiB y campos cerrados. La versión
usa tres u16 sin ceros iniciales para todos los consumidores Rust. Setup mantiene
su política beta; el lector común admite los cuatro canales cerrados hasta la
retirada de compatibilidad de los pasos 6–7. Un estado ilegible se rechaza sin
modificarlo. State conserva la lectura informativa de una retirada antigua parcial.
Uninstall usa el mismo decodificador, pero exige previous presente y referencias
SHA válidas antes de retirar miembros; no hay un tercer perfil de Installation.

Las mutaciones conservan el estado y los manifiestos leídos bajo los bloqueos y
pasan la proyección resultante a shell::sync; no los vuelven a abrir al activar o
resincronizar. La extracción autentica el SHA externo del ZIP en el mismo handle,
deriva los nombres de su manifiesto y mantiene límites y validación central de
duplicados. Así un recurso nuevo no requiere modificar el instalador (#1795).
Los archivos ajenos en bin/ se conservan al desinstalar. Los binarios de generaciones
huérfanas sin referencia SHA también se conservan, con ruta y motivo en el log;
K3 se evaluó en el paso 8 y quedó diferido: falta atribuirlos con SHA antes de
retirarlos. No se crea otra lista ni marcador.

Context mantiene HKCU y carpetas QA inyectados y el guard. Dentro de ese contexto
se usan los nombres del producto, sin identidad QA paralela. El validador Rust del
marcador de Cleanup es único; el script permanente vuelve a comprobarlo después
del padre, bajo el bloqueo, por ser una frontera de proceso diferente.

`default-features=false` compila solo lectura, sin GPUI ni scripts embebidos.
`write-engine` reúne operaciones, contexto y shell solo en Windows y sin GPUI; `ui` añade Setup.
Las features por defecto conservan Setup/Uninstall; Hub usa solo lectura.
sha2 0.10.9 ya fijada se adelanta con aprobación del orquestador; el lock cambia
solo las listas de dependencias de installer/Hub, sin paquetes/versiones/checksums.
zip6.0.0 y windows0.62 directos entran en p4, con aprobación; sin paquetes nuevos.

Fixtures y Nextest: `tests/installation_read.rs` con `fixtures/state-*.json`,
manifiesto 975 público versionado y RC; ausencia física, corrupción, schema futuro,
estado grande, anterior dañada y perfiles de versión. La matriz usa el ejemplo
**solo de tests** `probe-read-matrix` para completar el mismo contexto que Setup;
no se distribuye ni crea un puente de producto. Véase
[evidencia](../packaging/matrix/evidence-1840-p3.md).

Los adaptadores PowerShell conservados se cargan con `-Library -Root` explícitos.
El motor Rust descubre la instalación en Probe y exige raíz en las operaciones.
`test-installer` usa la identidad del producto dentro del contexto aislado;
El builder exige salida bajo el guard QA. El ejecutable TEST recibe únicamente
`VANTARE_INSTALLER_QA_CONTEXT`, un archivo JSON en QA con HKCU y carpetas inyectados.
La guarda SID del origen se conserva para impedir que un Hub TEST use la instalación
real. No se compilan nombres ni prefijos QA paralelos.

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
powershell -NoProfile -File packaging/build-candidate.ps1 `
  -Channel beta -Version 0.0.977 -OutputDirectory D:/VantareServer/qa/build-a
powershell -NoProfile -File packaging/build-installer.ps1 -Version 0.0.977 `
  -OutputDirectory D:/VantareServer/qa/build-a -TestInstaller
```

El builder exige ZIP/version/bootstrap idénticos y construye primero Uninstall,
después Setup con `setup-payload`. Sin esa feature se puede comprobar/renderizar
la UI, pero instalar falla explícitamente por payload ausente.
Los EXE del builder enlazan CRT estático del toolchain: no requieren instalar
VC Redist para abrir Setup. La lista de imports se comprueba en la evidencia;
ICU/DirectWrite/D3D son componentes del Windows objetivo, no descargas de Setup.
`test-installer` exige contexto HKCU/carpetas inyectado y raíces bajo el guard QA;
rechaza el uso del contexto real. `parity-capture` solo existe en builds
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

## Escritura Rust — #1840, pasos4–5

`operations` comparte instalación/actualización/reparación y retirada; `package`
conserva SHA externo, miembros exactos, hashes/PE/sidecars, límites128/256/512MiB
y rechazo de enlaces. Comprueba también las entradas crudas del directorio ZIP,
porque un índice por nombre podría ocultar duplicados. `write_fs` mantiene
NTFS/replace atómico, locks, guarda de imágenes vivas y copias verificadas con
carpetas vacías; no mata procesos. Cancelación solo antes del punto copy.

Las operaciones guardan state.json v1. Si falla shell::sync, restauran el estado
lógico y lo resincronizan; no guardan copias de registro, enlaces, UI o Uninstall
por bytes. Se retiran solo generaciones nuevas no referenciadas. El feed
PS conserva su propio consumidor hasta p6; no se retira todavía del producto.
Una desinstalación interrumpida conserva datos/marker y puede reanudarse.

Pruebas Rust en tests/installation_write.rs. El helper ignorado de subprocess
no es una omisión de cobertura: el test padre lo ejecuta antes/después del commit
y exige exit90 y estado íntegro. El ejemplo installer-write-matrix, solo QA,
inyecta HKCU/carpetas y usa el Session real; nunca se distribuye ni acepta rutas
fuera del guard. En una build TEST, VANTARE_INSTALLER_QA_CONTEXT apunta a ese
JSON explícito de contexto bajo QA; no cae a HKCU/carpetas reales.
El ejemplo exige las features `write-engine,test-installer` y el contexto aislado; ya no necesita las cuatro variables
QA del builder descritas arriba; uso en [la matriz](../packaging/matrix/README.md).
Solo `test-installer` embebe el guard; Setup/Uninstall de producto no lo incluyen
y rechazan un contexto aislado antes de preparar archivos.

El código de salida del finalizador decide el resultado: un warning con exit0
queda en el log y conserva la instalación. Las regresiones también comprueban
temporales retirados tras fallar replace, catálogo actual y retirado, duplicados
en el directorio ZIP crudo y recuperación de la proyección Windows tras un fallo.
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

Paso5 conserva destinos hasta6 y no migra Feed/Register/SetStartup. La matriz
comprueba sincronización repetida, AppID, enlace ajeno, exclusión y retirada del
temporal propio sin residuo; el ensayo de autoborrado POSIX sigue solo manual.
Fuente5f8507481: fmt/check y cinco Clippy -D warnings PASS; Nextest lectura20/20,
Installer58/58 y TEST55/55 PASS. Los JSON auxiliares corruptos se rechazan antes
de mutar, conservándolos; no se guardan sus bytes para deshacer. Campaña04:
88/88 idénticas al baseline; Startup48 en191.997s, frontera37 PASS. [Evidencia del paso5](../packaging/matrix/evidence-1840-p5.md).


`fixtures/manifest-full.json` es metadato capturado de la campaña propia
`D:/VantareServer/qa/isa-1840/matrix-p5a-review-cleanup-01/assets/v989/manifest.json`.
Solo suministra rutas de un paquete real a los fixtures Rust del feed heredado;
no se enlaza al producto ni autoriza sus miembros. Los tests recalculan los hashes
de sus PE inertes y añaden un recurso nuevo para probar que Rust ya no depende
de ese inventario. El producto solo usa el manifiesto del ZIP autenticado.


Poda adicional 5b: la referencia previous igual a active produce previous-corrupt;
no ofrece volver a la misma generación. Los valores REG_EXPAND_SZ se rechazan
expresamente antes de modificar la instalación, sin expandirlos. Cleanup programado
conserva también stdout en el log, con el código de salida como autoridad.
La matriz usa un temporal propio con GUID y mantiene la validación cerrada de su
nombre, raíz, contenido, marcador y hash. El lector sigue compilando para Linux;
la mutación y las entradas de Setup/Uninstall se compilan para Windows.

Los hashes de los binarios de cada generación se calculan una vez por mutación,
reutilizando estado y manifiestos. La copia de datos mantiene sus comprobaciones
antes/después para detectar cambios concurrentes: no se confunden con los antiguos
recálculos completos de la generación anterior. Probe de la UI es una petición
anterior y separada de la mutación. No se afirma unicidad global del motor mientras
Feed, Register y SetStartup sigan en PowerShell hasta los pasos6–7.
