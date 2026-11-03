# Caracterización del motor de instalación · VANTA-127 / #1840

Vigencia 5b: el producto no incluye ni ejecuta installer-driver.ps1. El lector
actual usa read/verify, sin perfiles, y `probe-invariants.ps1` conserva los 45
rechazos por motivo. Los snapshots históricos permanecen como diagnóstico;
la campaña exige resultados, datos intactos y enlaces estado/manifiesto coherentes.
Las descripciones de paridad de los pasos anteriores son historia.

El driver de `matrix/legacy/` es el oráculo exacto de e8637bb68, SHA-256
b102e9226eef7bd1e12005ec362c44677aaccefad01229929390facc6030e7f3.
Solo los arneses históricos lo copian a una raíz QA; no se distribuye. El
catálogo histórico conserva contexto HKCU/carpetas inyectado. Las invocaciones
CI de los dos arneses antiguos del driver se sustituyen por los gates nativos y
la matriz actual, con la correspondencia de invariantes en evidence-1840-p5b.md.
Sus aserciones originales siguen en Git, sin cambios; no usar sus entrypoints
sueltos contra el árbol actual ni ejecutarlos en el servidor. Los scripts
candidate/beta conservan sus bytes y sus consumidores siguen probados por
registration-boot y startup-tests.

El seguimiento 5a añade `cleanup-tests.ps1` al gate con o sin `-WriteEngine`: diez
comprobaciones de rechazo, espera de un padre propio y renovación bajo bloqueo.
La regresión nativa del ACK fuerza delete-pending con error5 real y exige la
confirmación del kernel; no amplía plazos. Evidencia en `evidence-1840-p5.md`.
El baseline con WriteEngine actualiza solo `retained-no-marker-cleanup` de exit1
a0: retirada ya hecha sin marcador, con SHA e índice de datos idénticos. Se
contrasta Cleanup en las ocho raíces; el normalizador permanece intacto.

Paso 3 añade `-ReadProbe <probe-read-matrix.exe>`: compara en cada raíz los ocho
campos públicos del Probe heredado con el contexto completado por Rust, también
en modo Uninstall. Las ocho capturas Probe conservan el baseline; no se regraba
ni normaliza una diferencia nueva. CI construye ese ejemplo de tests, que nunca
viaja en el producto. Compara además el catálogo Rust/PS en los cuatro canales.
La ejecución sin ReadProbe conserva la caracterización heredada para contraste.
El ensayo adicional Unicode prueba entrada UTF-8; su limitación con URI escapada
consta en evidence-1840-p3.md. La campaña completa usa raíz ASCII, sin cambiar
baseline ni normalizaciones. El helper finito de PS5 drena stdout/stderr y tiene 30 s.
Los campos raíz/datos deben conservarse exactamente y el hijo queda recogido.

Cada Probe con estado añade nueve fallos aislados (esquema, referencia, SHA,
inventario, manifiesto, previous ausente, canal no beta, JSON y manifiesto ausente).
probe-parity.ps1 exige rechazo de ambos lectores por la misma invariante:
variantes tipadas Rust y ErrorRecord IDs del PS, sin comparar mensajes formateados.
Un error no clasificado falla. La raíz nightly también debe ser aceptada por el
lector común y rechazada por la política beta de Setup. Cada fallo restaura los
bytes originales de state/manifiesto antes de obtener la captura del baseline.

Paso 1d añade startup-tests: comando del Hub y driver de Setup/Uninstall,
Run propia/ajena con el mismo nombre, migración Run→opción/Startup con preferencia
ON/OFF o sin ella y bootstrap raíz congelado. Dos barreras deterministas prueban
Register antes/después de adquirir .operation.lock y el interruptor concurrente.
Un Uninstall fallido conserva Run; un fallo al borrarla avisa sin abortar.
Se verifican bytes de opciones/enlace, datos y carpetas vacías, y recuperación
sin registro con marker ligado por hash. Registro/carpetas/entornos se inyectan;
no hay Setup/Uninstall EXE ni ventana física de producto. Las reparaciones de la
fixture se confirman con Confirm real y un proceso inerte antes de repetirlas.
También se fuerza una creación de Startup que retorna sin enlace, una colisión
con enlace ajeno y una reparación cuyo enlace se ha borrado. Run se restaura ante
la migración fallida, y preferencias legacy corruptas, mal tipadas o mayores de
1024B no rompen Probe/Setup. El test de biblioteca crea un GetNewClosure real bajo
PS5 y SetStartup sin argumento sigue fallando antes de escribir.
El baseline conserva hashes crudos LF y añade el fichero vacío .operation.lock
creado por Register en 26 capturas preparadas; los demás cambios son hashes de
candidate/beta en 240 copias, sin cambios de estado/datos/registro/accesos.

Paso 1c añade registration-boot-tests: Register falla, Register bloqueado hasta
el plazo real de 30 segundos, fallo del registro durante Confirm y entorno
WINDIR ausente. En los cuatro
casos la app de prueba sigue abierta, el supervisor confirma, no hay rollback,
el aviso se conserva en registration-status.json y los datos quedan idénticos.
Además Run-BetaHub real ejecuta el primer Stage con ZIP/feed TEST: fallo rápido y
fallo liberado después de ready. Ambos conservan aviso y ready/mensaje separados;
el PID del Register bloqueado deja de existir tras su plazo.
`-BootProbe` es obligatorio: CI construye el ejemplo boot-confirmation-matrix del
Hub y el arnés lo copia a una generación sintética. Usa el módulo de confirmación
de producto; reemplaza solo el comando Register por un fallo/barrera controlados.
No sustituye una prueba interactiva de la ventana real. Las observaciones se
guardan por caso y registro/carpetas se aíslan por caso dentro de la raíz QA.

Paso 1b añade `library-mode-tests.ps1` y `driver-context-tests.ps1` al mismo gate.
Demuestran carga sin raíz rechazada sin escribir, modo biblioteca explícito,
variables del llamador intactas, rechazo de contexto TEST incompleto/ajeno y
registro/Startup únicamente con identidad y carpetas inyectadas. También prueban
que una raíz explícita no se sustituye por descubrimiento legado, mientras Probe
sin raíz conserva ese descubrimiento. Todo el registro se remapea a una clave
única de pruebas; los procesos reciben TEMP/TMP y LOCALAPPDATA de QA.

`history-safety-tests.ps1` añade 14 rechazos sin escritura en los puntos de
entrada de inventario/histórico. El workflow usa `run-historical-tests.ps1` para
la ejecución válida con contexto completo y copia QA. El
[incidente de perímetro descartado](evidence-1840-1b.md) queda documentado.

Paso 0 de §4.5 del diseño del instalador. Se ejecuta en el gate Windows requerido,
con PowerShell 5.1, sin cambios en los scripts del producto. Ocho fixtures (los
siete grupos del diseño, separando la desinstalada con y sin marcador) por once
operaciones: 88 filas independientes. Una operación rechazada también es una
observación; el baseline fija tanto su código como sus efectos.

Las raíces son limpia; 975 del ZIP público real; 975 con anterior 974 incompleta;
RC con opciones; pendiente de actualización; pendiente de confirmación; datos
conservados con limpieza GPUI pendiente; datos conservados sin marcador. No se
ejecutan los binarios antiguos ni Setup/Hub. El estado NSIS se reconstruye con
los archivos exactos del ZIP 975, referencias v1 y registro/accesos de prueba;
no acredita una instalación interactiva NSIS ni un arranque de esa versión.

Cada fila guarda una instantánea con todos los archivos de la instalación,
sus hashes, JSON de estado, valores y tipos del registro y destinos/argumentos/
iconos de los enlaces COM reales. Comprueba además que cada archivo de datos
preexistente sigue presente con exactamente el mismo hash. El baseline versionado
contiene el digest de cada instantánea; CI conserva las instantáneas y logs como
artefacto para inspeccionar cualquier diferencia.

Se normalizan solamente raíz QA, identificadores nuevos, PID de readiness,
SHA de los manifiestos y bytes identificados exactamente como fixtures de origen.
Los archivos .ps1 siempre conservan su SHA real, aunque coincidan con la fixture:
candidate raíz, por generación y copia de desinstalación quedan visibles, además
de beta. Se normaliza la identidad en metadatos JSON de fixtures, pero sus bytes
de código se comparan explícitamente. snapshot-tests.py cambia a la vez fixture
y script instalado y exige hashes diferentes (12 checks); no basta mutar solo
la copia instalada, que la normalización anterior ya detectaba.
Los hashes de datos y de archivos ajenos a esas fixtures se conservan. Los enlaces
se observan mediante COM porque sus bytes internos incluyen metadatos de Windows.
El verificador es un **ejemplo exclusivo de tests** con semilla TEST pública fija;
comprueba Ed25519 de verdad. Nunca se empaqueta ni altera la clave productiva.
La 975 conserva su verificador original: rechaza la oferta firmada con TEST;
las RC inertes usan el verificador TEST para Check y Apply.

## Aislamiento

`-Root` no tiene valor por defecto: su ausencia falla antes de escribir. Solo
admite descendientes de `D:/VantareServer/qa/`, o del TEMP de CI cuando `CI=true`.
Rechaza puntos de reanálisis en todos los ancestros y repite la guarda después
de importar y antes de operar. No ejecutarlo con datos ni carpetas de usuario.
`guard-tests.ps1 -Root <QA nueva>` prueba cinco rutas ajenas, junction y ancestro,
raíz válida y llamada sin raíz sin escrituras; también corre en CI.

Cada hijo remapea su PSDrive HKCU a una clave única bajo
`Software/VantareInstallerMatrix/<uuid>/<fila>` **antes** de cargar el producto.
Programs, Desktop y Startup se resuelven dentro de la carpeta de la fila. Se
fijan TEMP/TMP antes de crear cada hijo (incluidos los temporales de Add-Type),
y LOCALAPPDATA apunta a una carpeta de la fila para impedir la adopción de otra
instalación heredada. Probe debe devolver exactamente la raíz solicitada. Se
inyecta una guarda de rutas en Assert-NativePath, conservando su validación
original; solo permite la fila y los assets QA. El driver se copia a un temporal
QA: solo se sustituye su línea de carga por carga con raíz explícita y los
resolvers de prueba. Sus operaciones y transacciones no se reimplementan.

No se modifican las rutas del perfil de Windows, variables persistentes,
registro de producto ni carpetas reales de Inicio. Estas guardas y la revisión
de los destinos acotan este arnés; no son un sandbox general para scripts
arbitrarios. No ejecutar código no revisado con esta identidad de Windows.
La limpieza de registro solo retira el UUID creado por esta ejecución; las
carpetas QA se conservan como evidencia.

Confirm usa PID y salida de un proceso real inerte. Timeout usa presupuesto cero
y un hijo propio esperando stdin: el motor ejerce su cierre/plazo real de 3 s,
sin esperas añadidas para sincronizar. Las 88 filas no llaman a Run ni Start; el hook de 1c sí ejecuta Run-BetaHub y
Start-BetaHub reales con Hub/runtime inertes y guardas QA.

## Bytes del checkout y CI

La matriz exige LF en los tres scripts actuales (candidate, beta y driver), como
marca `.gitattributes`. Rechaza CRLF antes de cargar producto o crear su raíz.
No convierte bytes al comparar: snapshot conserva el SHA real de los scripts,
incluido un cambio de finales de línea. Guard tests cubre LF, los tres rechazos
y la entrada completa sin escrituras; snapshot tests demuestra LF/CRLF distintos.
Los scripts congelados del ZIP histórico conservan sus bytes originales.

El fallo CI de #1850/run41330660086 fue un baseline creado desde una copia local
CRLF de beta.ps1, mientras Git/CI usan LF. El snapshot de clean-install solo difiere
en ese SHA; la corrección conserva todas las demás observaciones y criterios.
Normalizar el archivo de trabajo a la política del repo, no el snapshot.

## Reproducir y revisar cambios

Desde `vantare-v2/`, construir `matrix-verifier`, `probe-read-matrix` y `boot-confirmation-matrix` con `compilar.ps1`, target propio
y jobs autorizados; descargar el ZIP del tag `native-beta-v0.0.975` del repositorio
de código (no Downloads). El arnés exige su SHA-256 público fijado antes de extraer.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File native/packaging/installation-matrix-tests.ps1 `
  -Root D:/VantareServer/qa/isa-1840/run-nuevo `
  -LegacyPackage D:/VantareServer/qa/isa-1840/vantare-native-amd64-package.zip `
  -TestVerifier D:/VantareServer/targets/isa-1840/debug/examples/matrix-verifier.exe `
  -BootProbe D:/VantareServer/targets/isa-1840/debug/examples/boot-confirmation-matrix.exe `
  -ReadProbe D:/VantareServer/targets/isa-1840-p3/debug/examples/probe-read-matrix.exe
```

`-Record` escribe un candidato **solo en QA**, nunca sobrescribe el baseline.
Revisar cada código/diferencia, repetir contra otra raíz y solo después copiar
el candidato a `baseline.json` mediante un cambio revisable. Los pasos 1a–1d
añaden su demostración y explican las diferencias intencionales. La matriz no
sustituye la QA física en otra cuenta/VM ni las pruebas de firma del servicio.

Paso 1a: el mismo gate ejecuta `inventory-growth-tests.ps1`. Simula inventarios
109→110→109 (retirada explícita de una ruta conocida), actualización y rollback;
conserva datos y carpetas vacías de tres generaciones al desinstalar. Los
rechazos exigen su causa esperada. El catálogo de rutas retiradas está vacío en
producto y no amplía paquetes entrantes. En 1a el cambio de las 88 instantáneas
era el hash de beta.ps1 raíz (52 filas) por el cleanup actualizado. Desde 1b
también se fijan los bytes de candidate y su copia de desinstalación; los datos,
códigos, estado, registro y enlaces quedan iguales.

Revisión de 1a: 54 comprobaciones. El catálogo retirado se valida antes de usarlo
en lectura o borrado: rutas relativas canónicas, sin data/, unidades/UNC/traversal,
ni duplicados del inventario o del propio catálogo. Un snapshot fijo del paquete
0.0.987 de la evidencia RC9 detecta rutas desaparecidas sin retirada explícita;
el test también simula esa omisión para demostrar el rechazo. Carpetas de programa
no vacías conservan los archivos ajenos y no impiden retirar state.json/finalizar.
La demostración del driver exige salida correcta, registro retirado y datos
intactos. data_unchanged se calcula de los índices realmente comparados.

Paso 4: `-WriteEngine` recibe el ejemplo QA `installer-write-matrix.exe`,
compilado con `--no-default-features --features write-engine,test-installer`. Usa las operaciones
Rust de producto con contexto explícito de registro y carpetas. Conserva las
88 instantáneas y el contraste del lector; Feed/Register siguen heredados.
`writer-boundary-tests.ps1` fuerza fallos de la finalización Windows, comprueba
la restauración por bytes, la retirada reanudable y las guardas de Cleanup.
No se distribuye el ejemplo ni se modifica el baseline para aceptar diferencias.


Desde el paso 5b, el criterio es conservar invariantes, no los bytes del snapshot
PowerShell. Los snapshots históricos se guardan como evidencia; se mantienen los
resultados de las operaciones y la conservación de todas las data/. Los 45 casos
negativos (9 motivos en 5 raíces instaladas) prueban los errores tipados de Rust,
sin driver ni comparación de mensajes localizados. La falta de inventario fijo se
prueba con un recurso nuevo; rutas inseguras, duplicados, SHA, esquema, vínculo,
referencias y manifiesto ausente siguen siendo rechazos. El antiguo caso de nombre
fuera del catálogo se sustituye por una ruta que escapa de la generación.

Además se comprueban: estado activo ligado al manifiesto tras éxito; retirada del
estado al desinstalar; accesos/registro propios e idempotentes; preservación de
objetos ajenos; restauración lógica y sincronización tras fallo; cortes reales;
cancelación; procesos poseídos; bloqueo y renovación de Cleanup; guard e inyección
HKCU/carpetas. Los binarios huérfanos sin referencia SHA se conservan con diagnóstico
explícito, pendiente de la política del paso 8. Ninguna data/ se borra.
