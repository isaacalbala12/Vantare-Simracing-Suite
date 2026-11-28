# installer — Setup y Uninstall (#1591)

Paso 6 de #1840: `Vantare.exe` ejecuta Run, Apply, Confirm y Register en Rust;
Feed usa la oferta firmada en services y SetStartup llama a `shell::sync`.
La matriz QA ejerce esos caminos con raíces, HKCU y carpetas inyectadas.
Los apartados de campaña de los pasos 4–5 de abajo describen su estado histórico.

Dos binarios x64 independientes, `vantare-setup` y `vantare-uninstall`, publicados
como `VantareSetup.exe` y `Uninstall.exe`. GPUI usa el mismo commit fijado que la
aplicación. No se añade ninguna dependencia externa al lock.

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
Calcula el SHA-256 con .NET y el motor lo lanza sin `PSModulePath`: heredada de
PowerShell 7, Windows PowerShell 5.1 deja de encontrar funciones como
`Get-FileHash` y la limpieza quedaba a medias (#2824). No usar en este script
funciones de módulos; lo comprueba `packaging/matrix/cleanup-tests.ps1`.
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
usa tres u16 sin ceros iniciales para todos los consumidores Rust. Setup instala
solo el canal de su paquete (véase «Un producto por canal»); el lector común admite los cuatro canales cerrados hasta la
retirada de compatibilidad de los pasos 6–7. Un estado ilegible se rechaza sin
modificarlo. State conserva la lectura informativa de una retirada antigua parcial.
Uninstall usa el mismo decodificador, pero exige previous presente y referencias
SHA válidas antes de retirar miembros; no hay un tercer perfil de Installation.

Las mutaciones conservan el estado y los manifiestos leídos bajo los bloqueos y
pasan la proyección resultante a shell::sync; no los vuelven a abrir al activar o
resincronizar. La extracción autentica el SHA externo del ZIP en el mismo handle,
deriva los nombres de su manifiesto y mantiene límites y validación central de
duplicados. Así un recurso nuevo no requiere modificar el instalador (#1795).
Los archivos ajenos en bin/ se conservan al desinstalar. Los binarios de las
generaciones que ya no nombra `state.json` se retiran al confirmar un arranque
y al desinstalar (K3, #2740; véase «Generaciones sin referencia»). No se crea
otra lista ni marcador.

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

Registro HKCU `VantareNativeBeta`, menú Inicio Vantare, acceso «Vantare Simracing Suite» en beta
(nightly usa los suyos; véase «Un producto por canal»); QA conserva
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

Si Cleanup falla o se interrumpe y queda su marker, el Setup público reinstala
sin limpieza manual (#2829). Sin state ni registro, reconoce la raíz nativa,
valida schema/hash del marker y, si queda `Uninstall.exe`, lo retira solo si es
de su canal (`residue_owned`), ningún proceso vivo tiene esa imagen (PID +
`QueryFullProcessImageNameW`, ruta canónica, nunca por nombre) y se abre en
exclusiva con el hash del marker. Si sigue abierto, salida 2 con el PID que hay
que cerrar. Solo retira esos dos archivos; datos y grabaciones se adoptan por el
motor habitual. Con state o registro sigue bloqueando. El script, si aún corre,
vuelve a comprobar marker y state bajo `beta-session.lock` y no borra nada.
`packaging/matrix/cleanup-tests.ps1` cubre las guardas del script (marcador,
hash, instalación renovada, espera al padre, raíz enlazada y `PSModulePath`
heredado); los tests de `src/engine/host.rs` cubren las del motor y la
recuperación (proceso vivo, mismo nombre en otra carpeta, archivo en uso, canal
ajeno, sin marcador u otro hash), y
`setup_reinstalls_after_a_cleanup_that_never_finished_and_adopts_the_data` la
reinstalación completa, con y sin `Uninstall.exe`.

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
  -Channel beta -OutputDirectory D:/VantareServer/qa/build-a -TestInstaller
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
conserva SHA externo, miembros exactos, hashes/PE/sidecars, límites 256/384/768 MiB
(ZIP, miembro y total expandido; #2528, miembro subido en #2863; el tamaño del
directorio debe coincidir con el del manifiesto firmado antes de escribir; quién
aplica cada tope en `packaging/README.md`)
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

## Generación con Electron — #1995, P4 (ISA-2737)

El motor no distingue tecnologías: instala lo que enumera el manifiesto
autenticado del paquete. La generación nueva lleva el anfitrión Rust como
`bin/vantare-hub.exe` y el árbol cerrado `hub-ui/` junto a `bin`. No cambian
el manifiesto, `state.json`, el motor 2, la raíz ni los accesos.

El bloque final de `tests/installation_write.rs` lo prueba con las rutas reales
de `hub-ui` (recibo de P3) y bytes inertes, con HKCU y carpetas inyectados y el
`shell::sync` real. No arranca Electron, el anfitrión ni ventanas:

| Caso | Qué comprueba |
| --- | --- |
| Instalación nueva | Árbol `hub-ui` completo; menú e Inicio apuntan a `Vantare.exe` de la raíz |
| Relevo GPUI motor 2 → Electron | Datos copiados byte a byte; opciones y accesos conservados; la anterior es GPUI |
| Vuelta atrás tras el relevo | Vuelve a GPUI con sus datos; lo que escribió la nueva queda en su carpeta |
| Reparar | Sustituye un `hub-ui` dañado con la misma versión y conserva los datos |
| Versión antigua | Rechazada (código 3) sin tocar nada |
| Fallos durante el relevo | Disco lleno (inyectado), documento sin permiso de lectura y documento ocupado: la generación a medias se retira, la anterior sigue activa y se puede reintentar |
| Electron abierto | Setup, Reparar y Desinstalar se detienen (código 2) sin cerrar la aplicación |
| Accesos ajenos | Los de otra instalación ni se pisan ni se borran |
| Desinstalar | Retira todos los miembros propios y conserva `data` y lo ajeno; reinstalar recupera los datos |
| Motor 1 | No vuelve al lanzador antiguo; tras un arranque fallido pide Reparar y conserva los datos |

Límite conocido que este paso no cambia: el lector compartido rechaza una
generación con archivos no enumerados (Setup y Reparar se detienen; desinstalar
y volver a instalar conserva los datos).

## Generaciones sin referencia — #2740 (K3)

`state.json` solo nombra la generación activa y la anterior. Cada actualización
(A → B → C deja A), cada Reparar y cada arranque fallido con vuelta atrás dejan
una carpeta `generations/<id>` que ya nadie nombra. Con Electron son unos
320 MiB de binarios cada una.

Qué hace ahora el motor, en `operations::confirm` y en `operations::uninstall`:

- **Cuándo.** Solo después de confirmar un arranque correcto (cuando ya se ha
  borrado `boot-pending.json` y no hay vuelta atrás) y al desinstalar. Nunca al
  aplicar una actualización, al reparar ni al volver atrás.
- **Qué carpetas.** Las que están en `generations/`, tienen nombre de 32
  caracteres hexadecimales y no son ni la activa ni la anterior. Si
  `state.json` no deja claras esas dos referencias, no se retira nada.
- **Cómo se sabe que son nuestras.** `state.json` no guarda el SHA de una
  generación que ya no nombra, así que se comprueba por contenido: la carpeta
  debe tener un `manifest.json` válido de este producto y de este canal, y cada
  archivo se retira solo si su tamaño y su SHA-256 coinciden con lo que declara
  ese manifiesto.
- **Qué se conserva siempre.** La carpeta `data/` de la generación: no se abre,
  no se lista y no se borra. También la activa y la anterior, enteras.
- **Qué se conserva y se anota en el registro, con ruta y motivo:** una carpeta
  con otro nombre, una sin manifiesto válido o de otro canal, un archivo que no
  figura en el manifiesto, uno cuyo contenido ya no coincide, uno abierto por
  otro programa o sin permiso de lectura, y la generación entera si alguno de
  sus `.exe` está en uso. No se cierra ni se mata ningún proceso.
- **Orden.** `manifest.json` es lo último que se retira, y solo cuando no queda
  nada más fuera de `data/`. Si el barrido se corta a medias, el siguiente lo
  termina; no hay archivos temporales ni estados intermedios.
- **Fallos.** Nada de esto puede hacer fallar la confirmación ni la
  desinstalación: lo que no se puede retirar se queda y se anota.

Las generaciones sin referencia que ya existan en una instalación anterior se
retiran igual en su siguiente confirmación.

### Registro de la instalación (#2752)

Las notas del motor («se conserva X; motivo: Y» y lo retirado) se escriben en
`installer-log.txt`, en la raíz de la instalación. Antes, al confirmar un
arranque solo salían por la salida de errores del lanzador, que no tiene
consola: en uso real no quedaban en ningún sitio. Al desinstalar siguen yendo
además al registro del desinstalador.

- **Formato.** Texto UTF-8, una nota por línea, con fecha y hora UTC delante.
  Las rutas se escriben relativas a la instalación (`<raíz>\…`): no aparece
  nada del equipo fuera de ella. No es un formato que lea ningún programa.
- **Tope.** Cada fichero llega a 64 KiB como mucho (más una nota); al llenarse
  pasa a `installer-log.old.txt`, que sustituye al anterior. Nunca hay más de
  dos. Una nota no ocupa más de 1 024 caracteres.
- **Nunca hace fallar nada.** Si el registro no se puede escribir (ocupado, sin
  permiso, es una carpeta o un enlace) la nota se pierde y la operación sigue.
  Un enlace en su lugar no se sigue.
- **Si no hay nada que anotar, no se crea.** No lo borra la desinstalación: se
  queda junto a los datos del usuario y una reinstalación lo conserva.
- `installer-notices.txt` no sirve para esto: son las licencias de las fuentes
  y cada Setup lo sobrescribe.

Qué sigue sin hacerse:

- La carpeta `data/` de esas generaciones sigue en disco (segundo PR de #2740).
- Los binarios de la generación anterior no se tocan.
- Tras desinstalar, lo que no se pudo retirar se queda (por ejemplo, un `.exe`
  de una generación sin referencia que otro programa tenía abierto): con
  `state.json` borrado ya no hay otro barrido. Solo se retira si se vuelve a
  instalar y después se confirma una actualización; reinstalar, por sí solo,
  no confirma ningún arranque.
- La propiedad se prueba por contenido, y eso tiene un límite: una carpeta
  ajena con nombre de 32 caracteres hexadecimales que contenga un manifiesto
  copiado de este producto y archivos idénticos a los que declara pierde esos
  archivos. Es inocuo: son binarios reproducibles desde el paquete, y su
  `data/` y cualquier archivo distinto o no enumerado se conservan.

Tests en el último bloque de `tests/installation_write.rs`: A → B → C, Reparar
(sana y dañada), vuelta atrás, carpetas ajenas, manifiesto roto o de otro canal,
archivo alterado o no enumerado, archivo ocupado, permiso de lectura denegado,
imagen en uso, barrido cortado y desinstalación.

## Adoptar grabaciones — ADR 0111, T1, T2 y T3 (#2755, #2758, #2740)

[ADR 0111](../../docs/adr/0111-grabaciones-carpeta-unica-por-instalacion.md)
saca las grabaciones de Análisis de cada generación y las reúne en una sola
carpeta, `<raíz>/recordings/`. `operations::adopt_recordings` es la operación
que las trae desde `generations/<id>/data/hub/recordings/`. La llama la
**sesión** de la versión instalada en cada arranque, sobre su propia generación
y en modo «solo mover» (T2; ver «Al arrancar la sesión»). Confirm y Desinstalar
recogen desde todas las generaciones comparando huellas (T3; ver «Recoger en
Confirm y al desinstalar»).

Una grabación es un archivo `series-<época>-<pid>.duckdb`, el único nombre que
le da el grabador. Para cada una:

| Situación | Qué hace |
| --- | --- |
| En la carpeta única no existe ese nombre | La **mueve** con un renombrado dentro del mismo disco: es instantáneo, no copia nada y conserva contenido y fechas |
| Existe y es igual (mismo tamaño y mismo SHA-256) | **Borra la copia** de la generación. Solo con `Duplicates::RemoveIdentical` |
| Existe y es distinta | La conserva donde está y lo anota. Nunca escribe encima de la carpeta única |
| Existe y se pide `Duplicates::Keep` | La conserva sin comparar. Es el modo de la sesión, que solo mueve |

Se conserva en el origen, con su ruta y el motivo en las notas (y en el
[registro de la instalación](#registro-de-la-instalación-2752)), todo lo dudoso:

- un archivo que otro programa tiene abierto o que no se puede leer;
- una grabación con un `.wal` o un temporal al lado (`series-….duckdb.wal`,
  `series-….duckdb.creating-…`): está en curso o no se cerró bien. Tampoco se
  mueven esos acompañantes sueltos;
- una grabación cuyo nombre ya tiene un `.wal` o un temporal en la carpeta única;
- cualquier nombre que no sea el de una grabación, y las carpetas.
  `recording-status.json` (el estado del grabador) se deja sin anotar.

Cómo se anota lo que se conserva depende de quién llama:

- Con `Duplicates::RemoveIdentical` llamada directamente, una nota por archivo,
  con su ruta y su motivo, cada vez que se ejecuta.
- En todos los casos, las notas que recibe quien llama nombran las rutas desde
  la raíz (`<raíz>\…`), igual que el registro: nunca la ruta del equipo.
- En la recogida de Confirm y Desinstalar (T3), una nota por motivo y por
  generación, con los cinco primeros nombres, cada vez que se ejecuta.
- Con `Duplicates::Keep` (la sesión, en cada arranque), una nota por motivo con
  cuántos archivos son y los cinco primeros nombres. Esa nota no se vuelve a
  escribir en el registro mientras siga en él (`write_fs::log_once`): si no,
  lo que la sesión encuentra en cada arranque llenaría los 64 KiB y expulsaría
  las notas de Confirm y Desinstalar. Vuelve a escribirse cuando algo cambia o
  cuando el registro rota.

Garantías:

- **Nunca borra sin huella idéntica.** El único borrado de datos del usuario es
  el de la copia repetida. Se hace por el mismo manejador exclusivo con el que
  se calculó su huella, y mientras tanto nadie puede escribir la grabación que
  se queda.
- **Nadie más la tiene abierta, ni al comprobarla ni al moverla.** La grabación
  se abre en exclusiva y cambia de sitio a través de esa misma apertura, sin
  soltarla: desde la comprobación hasta el movimiento ningún otro programa puede
  abrirla. Con ella cogida se vuelve a mirar si ha aparecido un `.wal` o un
  temporal con su nombre, en el origen y en la carpeta única. El renombrado
  nunca sustituye un archivo y, entre discos distintos, falla en vez de copiar.
- **Un corte no deja nada a medias.** Cada archivo cambia de sitio en un solo
  paso: está entero en el origen o entero en la carpeta única. No hay archivos
  temporales, lista ni marcador; repetir la operación continúa donde se quedó y,
  si no queda nada, no cambia ni anota nada.
- **Nunca toca la generación anterior**: es la copia a la que se vuelve si la
  versión nueva falla. Si `state.json` no deja claras las dos referencias, no
  hace nada.
- **Solo toca dos carpetas**: la de grabaciones de la generación indicada (por
  su identificador de 32 hexadecimales) y `<raíz>/recordings/`, que crea al
  recibir la primera grabación y que hereda los permisos de la raíz.
- **No sigue enlaces.** Si la carpeta única es un enlace, una unión o un
  archivo, no trae nada (ver «`recordings` que no es una carpeta»). Cada
  grabación se abre como ella misma, nunca a través de un enlace.
- Trabaja bajo `.operation.lock`: dos adopciones a la vez no trabajan sobre la
  misma instalación. Si otra operación tiene el candado, falla con el código 2
  («ocupado») sin tocar nada, para que quien la llama pueda distinguirlo de un
  rechazo. Solo cuenta como ocupado que otro programa lo tenga abierto; no
  poder abrirlo por otro motivo (permisos) es un error normal. No cierra ni
  mata ningún proceso.

### Al arrancar la sesión (T2)

`installed::adopt_recordings`, en `runtime/src/bin/vantare/installed.rs`, la
ejecuta con el bloqueo de sesión cogido y antes de lanzar el núcleo y el Hub:
en ese momento ningún programa de Vantare las usa. Un antivirus o el indexador
de Windows sí pueden tener una abierta; lo que protege cada grabación es la
apertura en exclusiva, no este orden.

- **Si no hay nada que traer, no cuesta nada.** Antes de pedir el candado mira
  la carpeta de grabaciones de su generación: si no existe o solo tiene
  `recording-status.json`, termina sin pedir el candado ni recorrer la
  instalación. Es el caso de todos los arranques tras la primera migración.

- **Solo mueve.** No calcula huellas ni borra nada; un nombre que ya existe en
  la carpeta única se queda en la generación hasta T3.
- **Nunca bloquea el arranque.** Si falla o conserva algo, la sesión sigue. Lo
  que no se pudo traer se queda intacto donde estaba, se anota una vez en
  `installer-log.txt` y se reintenta en el siguiente arranque. Mientras tanto,
  esa grabación no aparece en Análisis.
- **Espera su turno, como máximo dos segundos.** El lanzador de la raíz renueva
  el registro de Windows bajo el mismo candado justo después de arrancar la
  sesión. Con «ocupado», la sesión reintenta cada 50 ms hasta 40 veces; después
  arranca igual. Un rechazo (cualquier otro error) no se espera.
- Riesgo conocido, no resuelto aquí: si la sesión cogiera el candado antes que
  el lanzador, sería la renovación del registro la que fallaría y Ajustes
  mostraría un aviso de registro hasta el siguiente arranque. El lanzador
  empieza antes y mover dura muy poco, pero no está medido con una sesión real.

Límites conocidos:

- **Una grabación que quedó sin cerrar (con `.wal`) no se adopta.** Se queda en
  su generación, no aparece en Análisis y viaja con `data/` en cada
  actualización. Mover la pareja no es un solo paso, y un `.wal` que llegara
  sin su grabación lo borraría la poda del núcleo a los diez minutos. Abrirla y
  cerrarla en su carpeta para que el `.wal` desaparezca, y adoptarla después,
  queda como seguimiento: es escribir en datos del usuario y necesita su propia
  revisión. Solo afecta a grabaciones sin cerrar anteriores a este cambio: las
  nuevas ya nacen en la carpeta única, con su `.wal` al lado. T3 debe tratar
  esas parejas como únicas.
- No se comprueba que el archivo sea una base DuckDB válida. Una copia a medias
  que dejara una actualización cortada tendría nombre de grabación.
- Se valida la forma de la generación (identificador y referencias de
  `state.json`), pero **no se autentica su manifiesto**. La sesión solo la llama
  para su propia generación, ya autenticada al arrancar; T3 debe llamarla solo
  con generaciones autenticadas.
- El registro rota sin candado propio: dos programas que escribieran a la vez
  sin `.operation.lock` podrían perder notas en la rotación. Hoy todos los que
  escriben lo hacen bajo ese candado, salvo la nota de la sesión cuando no
  consigue el candado.
- Si se juntan más de 256 grabaciones, el catálogo del Hub avisa del límite
  hasta que el núcleo pode en su siguiente arranque (ADR 0111 §7).

### `recordings` que no es una carpeta (T2b, #2777)

Regla de producto: **Vantare nunca deja de arrancar por culpa de la carpeta de
grabaciones.** Un usuario puede poner en `<raíz>\recordings` una unión a otro
disco (`mklink /J`), un enlace o, por error, un archivo.

- **El motor no la mira.** Al abrir la instalación (`write_fs::open_root`, que
  usan el lanzador y todas las operaciones) se recorre la raíz entera y se
  rechaza cualquier enlace, **salvo la entrada `recordings` del primer nivel**:
  ni se comprueba, ni se entra en ella, ni se sigue. Es la única excepción, por
  nombre exacto (como compara Windows, sin distinguir mayúsculas). Un enlace
  con otro nombre, o con ese nombre en cualquier otro sitio (dentro de
  `generations`, de una generación o de su `data/`), se rechaza como siempre.
- **Ninguna operación llega a ella por ruta.** Instalar, actualizar, Reparar,
  Confirm, la vuelta atrás, descartar un marcador viejo, Desinstalar, la
  retirada de generaciones sin referencia y el registro de Windows trabajan en
  `generations/`, `staging/` y una lista fija de archivos de la raíz. Los tests
  lo ejercitan con una unión a una carpeta con archivos, un enlace a un
  archivo, una unión rota y un archivo normal, y comprueban tras cada paso que
  lo que hay al otro lado sigue idéntico byte a byte y que la entrada no cambia.
- **La adopción no trae nada**: es la única operación que escribe ahí y
  rechaza una carpeta única que sea un enlace o no sea una carpeta. Dentro de
  una carpeta normal, un enlace con nombre de grabación no se lee ni se pisa.
- **La sesión desactiva la grabación**: no le pasa `--series-dir` al núcleo
  (sin él no graba en ningún sitio), no llama a la adopción y deja una línea,
  una sola vez, en `installer-log.txt`. El Hub arranca y Análisis explica por
  qué no hay grabaciones (ver el README del anfitrión).
- **El núcleo lo comprueba también**: si le llega una carpeta que no es una
  carpeta normal, no escribe, no poda y no lee nada en ella.
- **La poda no sigue enlaces**: como el motor ya no mira dentro de la carpeta
  única, un enlace puesto ahí (con nombre de grabación, como WAL de una
  grabación o dentro de un temporal) no se sigue ni se borra; la grabación se
  queda con él y la poda lo anota, sin la ruta.
- `packaging/installer-cleanup.ps1` solo comprueba las carpetas **por encima**
  de las rutas que toca (la raíz, su temporal y su petición), no el contenido
  de la raíz: no le afecta.

Vantare no sigue el enlace: no graba ni lee al otro lado. Llevar las
grabaciones a otro disco sería una función aparte (carpeta elegible).

Límite que no se puede quitar: **las versiones ya publicadas** rechazan el
enlace al arrancar. Si una versión con este cambio falla y se vuelve a una de
ellas, un usuario con la unión puesta no podrá abrir Vantare hasta que la quite
o llegue una versión corregida.

### Recoger en Confirm y al desinstalar (T3, #2740)

Tras un arranque confirmado (ya sin `boot-pending.json`) y al desinstalar
(antes de retirar nada y con `state.json` aún legible), el motor recoge las
grabaciones de las generaciones con `Duplicates::RemoveIdentical`:

- **Orden fijo:** primero la **activa**; después las generaciones sin
  referencia, de la más reciente a la más antigua según la fecha de creación de
  su carpeta. La primera copia íntegra de un nombre es la que llega a la
  carpeta única; las demás se comparan con ella.
- **Nunca** desde la **anterior** ni desde la generación que nombra
  `stagedGeneration` en `boot-pending.json` (una actualización sin confirmar,
  por ejemplo al desinstalar a mitad). Si ese archivo existe y no se puede leer
  o no nombra su generación, no se recoge nada. Una versión que falló, se
  revirtió y después quedó sin referencia **sí** se recoge (ADR 0111 §5).
- **Solo se mueve una grabación íntegra.** Se comprueban la marca `DUCK` y la
  suma de control de **todos** sus bloques: la cabecera, las dos cabeceras de
  base de datos y cada bloque que cuenta la más reciente (cada bloque de DuckDB
  empieza con la suma de control del resto). Una copia cortada, a ceros (lo que
  deja `CopyFileW` cortado por un apagón: el tamaño final con ceros detrás) o
  con un byte cambiado se queda donde está y se anota **con el motivo
  concreto** (cabecera cortada, sin marca, versión, suma de control de una
  cabecera o de un bloque, bloque en uso que falta, lista de libres rara).
- **Formato de DuckDB 1.5.5** (#2815), el que fija `storage`: versión de
  almacenamiento 64 en el byte 12 de la cabecera principal; otra versión no se
  lee y la grabación se queda. Al cerrar, DuckDB escribe la cabecera y **después**
  recorta del final los bloques libres, así que una grabación buena puede tener
  menos bloques de los que cuenta su cabecera. Entonces se lee la lista de
  bloques libres a la que apunta esa cabecera (en bruto, en sus bloques de
  metadatos ya comprobados, cada parte una sola vez y con tope) y solo se acepta
  si **todos** los bloques que faltan están libres. Cualquier cosa inesperada
  deja la grabación donde está. La lectura usa como mucho un bit por parte de
  metadatos y uno por bloque que falta: una cabecera que cuenta más bloques de
  los que el archivo podría listar se rechaza sin leer. La suma de control de
  DuckDB **no es una firma**: protege de la corrupción accidental (copias
  cortadas, ceros, bytes cambiados), no de un archivo falsificado a propósito
  con sus sumas recalculadas. Comprobado con grabaciones del grabador real
  (`tests/fixtures/grabaciones-reales.py`, bloques de 256 KiB) y con las de
  `hub-host/src/analysis/fixtures/`; un test falla si cambia la versión de
  DuckDB del `Cargo.lock`, para revalidar este lector.
  Coste: leer la grabación entera una vez, solo al moverla (medido en la PR).
  Un bloque libre dentro del archivo que DuckDB no hubiera escrito nunca haría
  que una grabación buena se quedara en su generación: nada se pierde.
- Una copia repetida se retira **solo** si tamaño y SHA-256 coinciden con la de
  la carpeta única (lo de T1). Un archivo con dos nombres (enlace duro) cuyo
  otro nombre ya está en la carpeta única no se puede comparar, porque no se
  puede abrir en exclusiva: se queda. Si su nombre no está en la carpeta única,
  se mueve como cualquier otra. En ningún caso se pierde nada.
- Las parejas con `.wal` y los `.wal` sueltos se quedan, como en T1 y T2.
- **Confirm nunca falla por esto** (un error ahí haría volver atrás) y compara
  como mucho `GATHER_BUDGET` (30 s): tiene el Hub abierto y los candados del
  lanzador. Lo que no cabe se queda intacto para la siguiente Confirm o para
  Desinstalar. En Desinstalar, el `checkpoint` de su pantalla puede cortarla;
  repetir continúa donde se quedó.
- Si `<raíz>\recordings` no es una carpeta normal (T2b), no se recoge nada y se
  anota una vez.
- **Frontera de producto (#2812):** la recogida solo trabaja dentro de la raíz
  que se confirma o se desinstala, con su propio `state.json`; cada raíz es de
  un solo canal (beta o nightly), así que nunca toca grabaciones de otro
  producto. Desinstalar en nombre de otro canal se rechaza antes de recoger
  nada, y una raíz sin estado (restos) no se recoge. La regla «una copia sin
  referencia es del canal que declara su generación» (#2817) es de la adopción
  de datos al reinstalar, no de esta recogida.
- La primera Confirm con T3 es la de la **siguiente** actualización tras
  recibirlo: Confirm la ejecuta el lanzador que ya estaba en marcha.

**Copia de datos forzada a disco.** `write_fs::copy_data` llama a
`write_fs::flush` (`FlushFileBuffers`) en cada archivo copiado antes de
recalcular las huellas que dan la copia por buena: tras un corte de luz, una
generación activada no puede tener una grabación a ceros con nombre real. Un
archivo de solo lectura se fuerza quitando y devolviendo el atributo. Que el
dato llegue de verdad al disco no se puede comprobar en un test sin cortar la
corriente.

Fuera de T3: retirar el resto del `data/` de las generaciones sin referencia
(T3b) y avisar en el Hub de lo conservado por contenido distinto (necesita
protocolo); hoy queda en el registro.

Tests en el último bloque de `tests/installation_write.rs` (el hueco entre
comprobar y mover, lo que aparece después de tomar la lista, el resumen del
registro y dos adopciones a la vez) y, para la sesión, en
`runtime/src/bin/vantare/installed_update_tests.rs` y `recording.rs`. La poda
sobre lo adoptado se comprueba en `runtime/src/service/series/prune_tests.rs`.

## Un producto por canal — #2812

Antes el motor solo aceptaba paquetes beta (`"beta"` fijo en cinco sitios), así
que un Setup nightly se abría pero no instalaba. Ahora cada canal instalable es
un **producto separado**, con sus propios nombres en Windows, y nunca toca los
de otro. La tabla cerrada está en `engine/product.rs`:

| Recurso | beta (como siempre) | nightly |
| --- | --- | --- |
| Registro HKCU (Aplicaciones instaladas) | `Uninstall\VantareNativeBeta` | `Uninstall\VantareNativeNightly` |
| Nombre visible | Vantare Simracing Suite | Vantare Simracing Suite (Nightly) |
| Raíz por defecto | `%LOCALAPPDATA%\Programs\Vantare` | `%LOCALAPPDATA%\Programs\Vantare Nightly` |
| Menú Inicio | `Vantare\Vantare Simracing Suite.lnk` y `Desinstalar.lnk` | `Vantare Nightly\Vantare Nightly.lnk` y `Desinstalar.lnk` |
| Escritorio / Inicio de Windows | `Vantare Simracing Suite.lnk` / `Vantare.lnk` | `Vantare Nightly.lnk` / `Vantare Nightly.lnk` |
| AppUserModelID del acceso | `Vantare.SimracingSuite` | `Vantare.SimracingSuite.Nightly` |
| Nombres heredados (raíz y accesos `Vantare Native Beta`, Run `VantareNative.Hub`) | Se migran como antes | No existen: nightly no los lee ni los borra |
| Instancia del lanzador (mutex, eventos y pipe del núcleo) | `native-beta` | `native-nightly` |
| Feed de actualización | Oferta firmada beta | Ninguno: se actualiza con su Setup |

testers y master no tienen producto: su Setup se niega a instalar antes de
crear nada («Canal sin producto de instalación»).

**De dónde sale el canal.** Del paquete, no de una constante:

- `build-installer.ps1` fija `VANTARE_BUILD_CHANNEL` a `-Channel` después de que
  `Test-BuildPackage` compruebe que el manifiesto del ZIP declara ese canal, y
  falla si el ConfigFile trae otro. Setup y Uninstall lo llevan compilado
  (`crate::CHANNEL`), igual que ya llevaban la versión y el SHA del paquete.
- Al instalar, `operations::Package::channel` se exige al manifiesto
  autenticado por SHA: si no coincide, se rechaza antes de copiar nada.
- Para una instalación que ya existe (Hub, lanzador, vuelta atrás) el canal
  sale de su `state.json`. `shell::sync_running` ata el contexto a ese canal.
- Una build sin canal (desarrollo, `cargo test`) no tiene producto: Setup y
  Uninstall se niegan y un `Context` sin producto no da ningún nombre. Nunca
  se cae a beta por defecto.

**Qué se rechaza sin tocar nada:** un paquete de otro canal que el del Setup;
instalar, reparar o actualizar sobre una raíz de otro canal; desinstalar una
raíz de otro canal (un `Uninstall.exe /D=` nightly apuntado a la raíz beta);
proyectar en Windows un estado de otro canal (se restaura el estado anterior).

**Convivencia.** Raíz, registro y accesos distintos; además cada acceso y el
registro se siguen comprobando por propiedad de la raíz. Los datos viven en la
generación de cada raíz. Los candados (`beta-session.lock`, `.operation.lock`)
conservan su nombre porque son de cada raíz y los usan versiones publicadas.
Con instancias separadas, un arranque nightly fallido ya no puede mandar la
parada al Vantare beta abierto. Si se abren los dos a la vez, cada uno lleva su
núcleo y sus overlays.

Sin cambios: `state.json` v1, manifiesto, generaciones, `installer-ui.json`,
catálogo de miembros retirados, códigos 0–5, protocolo y licencias (nightly
sigue siendo «smoke sin autoridad»; beta sigue exigiendo ConfigFile y registro
de licencias aprobado).

Tests en el último bloque de `tests/installation_write.rs`: nightly instala,
repara, actualiza y desinstala con sus nombres; beta y nightly en el mismo
usuario simulado sin cambiar ni un byte del otro (raíz, datos, accesos y
registro), en los dos sentidos; rechazos cruzados; testers/master; contexto sin
producto. Más los unitarios de `product.rs` y de la instancia del lanzador.

Qué no se puede comprobar aquí (P8, VM o PC): los accesos y el AppUserModelID
en un Windows limpio, desinstalar desde «Aplicaciones instaladas», abrir beta y
nightly a la vez con sesión real y SmartScreen. La raíz por defecto tampoco se
puede ejercitar con carpetas QA inyectadas (cae dentro de su LocalAppData).

**Datos conservados y restos de una desinstalación.** Desinstalar deja
`retained-data.json` junto a los datos. Nightly escribe en él
`"channel":"nightly"`; beta no escribe canal, así que su documento sigue siendo
idéntico y los Setup beta publicados lo leen igual (un documento sin canal es
de beta). Un producto nunca adopta, mueve ni borra los datos conservados de
otro: instalar nightly con `/D=` sobre una carpeta beta desinstalada se rechaza,
y al revés. Una copia de datos sin `retained-data.json` (en
`generations/<id>/data`) es del canal que declara el `manifest.json` que aún
conserve su generación (#2817): por ejemplo, una instalación nightly cortada
antes de escribir `state.json` la recupera el Setup nightly, y beta no la
adopta. Sin manifiesto es de beta, el único producto anterior a #2812. El
manifiesto se lee con el mismo lector cerrado del motor (tope de 64 KiB, campos
y canales cerrados): si no se puede leer, nadie adopta la copia y el usuario ve
«No se puede leer manifest.json de una copia de tus datos en esta carpeta…»,
sin culpar a otra instalación. Copias de dos dueños en la misma carpeta, o de un
canal sin instalador, tampoco se adoptan; todo se queda como estaba. Esta
adopción no compara la versión de la copia con la del Setup (issue aparte). Terminar una desinstalación a medias o
ejecutar la limpieza del desinstalador exige también que los restos sean del
mismo canal (`operations::residue_owned`). Si la sonda del Setup falla, la
carpeta que propone «Reintentar» es la de su producto, nunca la de beta.

**`retained-data.json` ilegible (#2817).** Si ese archivo está roto (JSON
inválido, esquema, generación o versión que no valen), no se sabe de quién son
los datos ni los restos de su lado. Se mantiene el fallo cerrado: el Setup de
cualquier producto, el desinstalador, la recuperación de una limpieza que no
terminó (#2829) y la limpieza programada se detienen sin tocar nada, y dejan
`Uninstall.exe` y su marcador donde estaban. Seguir con solo el marcador no
basta: el marcador guarda el hash del desinstalador, no su canal, y el Setup
siguiente se pararía igual al leer ese archivo. Lo que cambia es el mensaje,
el mismo en todos esos pasos: «No se puede leer retained-data.json, el archivo
que dice de quién son los datos guardados en esta carpeta. No se ha borrado
nada y tus datos siguen ahí. Instala en otra carpeta o escribe a soporte».

**Limitación conocida (#2817, F2 descartado).** Desinstalar nightly retira el
`manifest.json` de su generación y deja `retained-data.json`, que es lo que
dice que los datos son de nightly. Si además alguien borra a mano ese
`retained-data.json`, la copia de datos ya no declara canal y un Setup beta con
`/D=` en esa carpeta la adoptaría como suya (la copia, sin borrar nada en
nightly). No se arregla porque exigiría que nightly dejara un `manifest.json`
de más al desinstalar; el caso necesita borrar a mano un archivo de la
instalación.
