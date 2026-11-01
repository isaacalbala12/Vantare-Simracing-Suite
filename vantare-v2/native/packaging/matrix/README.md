# Caracterización del motor de instalación · VANTA-127 / #1840

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
sin esperas añadidas para sincronizar. Nunca se llama a Run ni Start del producto.

## Reproducir y revisar cambios

Desde `vantare-v2/`, construir `matrix-verifier` con `compilar.ps1`, target propio
y jobs autorizados; descargar el ZIP del tag `native-beta-v0.0.975` del repositorio
de código (no Downloads). El arnés exige su SHA-256 público fijado antes de extraer.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File native/packaging/installation-matrix-tests.ps1 `
  -Root D:/VantareServer/qa/isa-1840/run-nuevo `
  -LegacyPackage D:/VantareServer/qa/isa-1840/vantare-native-amd64-package.zip `
  -TestVerifier D:/VantareServer/targets/isa-1840/debug/examples/matrix-verifier.exe
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
producto y no amplía paquetes entrantes. El único cambio esperado en las 88
instantáneas es el hash de beta.ps1 raíz (52 filas) por el cleanup actualizado;
los datos, códigos, estado, registro y enlaces quedan iguales.

Revisión de 1a: 54 comprobaciones. El catálogo retirado se valida antes de usarlo
en lectura o borrado: rutas relativas canónicas, sin data/, unidades/UNC/traversal,
ni duplicados del inventario o del propio catálogo. Un snapshot fijo del paquete
0.0.987 de la evidencia RC9 detecta rutas desaparecidas sin retirada explícita;
el test también simula esa omisión para demostrar el rechazo. Carpetas de programa
no vacías conservan los archivos ajenos y no impiden retirar state.json/finalizar.
La demostración del driver exige salida correcta, registro retirado y datos
intactos. data_unchanged se calcula de los índices realmente comparados.
