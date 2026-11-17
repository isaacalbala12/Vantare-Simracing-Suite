# Medición de overlays · #2365 / VANTA-144

Herramientas del operador, sin cambios de motor, licencia, transporte ni producto.
No iniciar nada en el PC de juego hasta tener permiso con hora de Isaac.

## Inventario CPU

`qa_inventario <captura.bin|corpus.tar.gz|sesion.lmu.gz> [build-LMU]`
usa `runtime::adapter::open_replay`, `Core` y las 17 proyecciones existentes de
`domain`, con el reloj inyectado del evento. No interpreta memoria cruda ni
inicializa UI/ventanas/GPU. Un `.bin` necesita su build LMU explícita.
La presencia de datos no certifica una transición: candidato de vuelta rápida
no implica récord nuevo; entrada de sesión no implica aviso mostrado. Sin agenda
ni geometría externas no se certifican calendario ni Mapa. Los JSON resultantes
son evidencia local, no fixtures nuevas ni datos para publicar en el repositorio.

Ejemplo de `vantare-runtime` dentro del workspace nativo; usa `serde_json` ya existente, sin Cargo.toml ni lockfile nuevos.
Compilar desde `vantare-v2`, por la cola:

```powershell
if(Test-Path D:\VantareServer\qa\captura.lock){throw 'Esperar captura.lock'}
$env:RUSTUP_TOOLCHAIN='1.99.1'
$env:VANTARE_SIN_GRAFICOS='1'
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --manifest-path native/Cargo.toml --release -p vantare-runtime --example qa_inventario -j 2
```

El ejecutable queda en release/examples/qa_inventario.exe del slot. Los targets los asigna la cola en D:. No ejecutar cargo directamente ni crear
targets por rama. La ejecución del analizador ya compilado es solo CPU.

## OBSERVAR: adjuntar al PID del host real

Importar `OBSERVAR.ps1` es inerte. No lanza hosts ni el juego, no cambia sus
datos/ajustes, no cierra procesos ajenos y no necesita ningún flag nuevo del host.
Usa `native/pruebas-rune/muestreador/MUESTREAR.ps1 -ProcessOnly`: CPU/memoria de la
familia y PresentMon oficial 2.6.0. Conserva su guard de servidor y su limpieza ETW.
`ProcessOnly` no abre PDH/GPU térmica; el modo anterior del kit sigue disponible.
La corrección PDH de la pasada del 16/11 está en el mismo sampler, no en una copia.

El operador usa un layout QA explícito con un widget del registro y verifica
su estado, derechos y datos. GPUI y Rune usan el núcleo real y la sesión Owner
legítima del PC; nunca se copian credenciales ni se altera identidad. En
`4625463bc` Rune ya figura en `Consumers.readers` (#2345).

V1 autorizada: corpus original a velocidad 1, 60 s brutos y tramo QPC 5–55
(50 s), sin reinicio, extensión ni ralentización. El operador anota el QPC
de lanzamiento del núcleo en `ReplayStartQpc`, prepara el host antes y adjunta
el sampler a tiempo. Si los CSV no cubren ambos extremos se invalida la ronda;
no se recorta a un tramo más corto ni se sustituye por Waiting. Guardar también
el hash de grabación y layout con la evidencia. El estado es declarado por el
operador: OBSERVAR no demuestra por sí mismo que el widget recibió datos.

Ejemplo para el operador en la próxima cita autorizada, no para Isaac:

```powershell
. ./tools/qa-overlays/OBSERVAR.ps1
Invoke-VantarePidObservation -RootProcessId $pidHost -Motor rune -Widget relative `
  -State replay -ReplayStartQpc $qpcInicioTramo -PresentMon $presentMon `
  -OutputDirectory $carpetaNueva
```

Para Waiting, núcleo real sin simulador y host ya estable, usar `-State waiting`
sin `ReplayStartQpc`: el tramo es 5–55 respecto a la captura. No abrir LMU.
La salida incluye identidad PID/inicio/SHA antes y después; CPU ms/s y % de un
núcleo, privada/WS mediana y máximo MiB, Presents y Presents/s. No suma DWM/core/
sampler. Los hijos que no cubren toda la ventana invalidan esta v1 conservadora.

`Get-VantareObservationOrder` genera GPUI/Rune para el primer widget y Rune/GPUI
para el siguiente, tanto replay como Waiting. Recibe los 17 Kind del plan; no
incluye Standings/Delta futuros por suposición. El operador aplica ese orden y
mantiene la misma grabación, settings, frecuencia y tramo para ambos motores.

## Validación sin gráficos

`pwsh -NoProfile -File tools/qa-overlays/PROBAR_OBSERVAR.ps1`
prueba orden, guard, identidad falsa, CSV, recorte, errores y no-events válido.
`PROBAR_PDH.ps1` usa callbacks falsos: no construye `Counters` ni llama PDH.
No se ejecuta PresentMon, un host, un pintor, ETW o una API de GPU en el servidor.
Las pruebas no acreditan consumo ni paridad real: eso queda para la cita.

Opcional en cita 1, si Isaac lo decide: unos 10 min con el grabador LMU existente
para conseguir una grabación más larga/variada con multiclase, banderas y boxes.
No modifica ni bloquea la medición actual. Capturas visuales: fixtures y ruta de B.

## Precisiones de la revisión de medición

Cada ronda arranca el host en frío: cerrarlo y volverlo a abrir por el camino
real para cada widget/motor/estado. El orden A/B alterna ese coste y evita
heredar cachés/historia de una ronda anterior. No iniciar el siguiente mientras
el anterior siga vivo; el prefijo del replay reconstruye la misma historia.

Inventario: `frames_5_55s_desde_primer_evento` cuenta fotos entre 5 y 55 s
desde el primer evento grabado. NO es una ventana de medición de procesos.
El operador registra QPC de arranque del núcleo, QPC del primer evento y su
desfase en segundos, además de t0 y QPC de inicio efectivo del tramo que pasa
como ReplayStartQpc. No asumir desfase cero ni equiparar ambos orígenes.
Waiting rechaza ReplayStartQpc y se ancla a CAPTURA-LISTA.

PresentMon reutiliza agregar.presentmon(count_only=True): valida PID/cadena,
CPUStartQPC y MsCPUBusy y cuenta envíos en la ventana; acepta cero Presents
con CSV válido. No interpreta TimeInQPC como CPUStartQPC ni estima pantalla.
La cabecera de fixtures/presentmon-2.6-header.csv se copió, sin filas privadas,
de evidence/rune-vs-gpui/rapida-20261115/resultados/09-gpui_fast/muestreo/presentmon.csv.
El parser completo del kit conserva su comportamiento y sus columnas requeridas.

## Kit autónomo de la tanda (17-nov)

Fuentes de binarios congeladas en fb2e2e520be96b59066e2a69c3899cf9842a0752
(19 tipos; cinco con Vantare/Eficiencia, incluido Standings Eficiencia E6 y sRGB #2496).
El worktree de compilación permanece limpio; estos scripts tienen SHA propio.
No editar el handoff vivo: estado/evidencia van en el cuerpo del PR.

`preparar_tanda.py` exige el SHA y los hashes de binarios.json, copia PresentMon
2.6.0 con su digest oficial fijado, corpus LMU47 con hash, locks y fuentes de
fixtures exactas. Conserva fotos/orden/sequence/epoch; no interpreta memoria
LMU ni genera datos. Produce prefijos de todas las escenas cortas y los cortes
1/3/10/121/197/final de las historias largas. Escala de paridad base 1, misma
configuración Vantare/Eficiencia; tamaño natural de cada motor, sin reescalar.
Los tamaños del plan se rotulan como orientativos; el resultado guarda los
IHDR reales y el diff rechaza dimensiones diferentes.

Una sola entrada: TANDA.ps1, cuyo modo por defecto SOLO valida. La ejecución
se hace desde el servidor, con una ventana UTC expresamente autorizada:

```powershell
pwsh -NoProfile -File <kit>/TANDA.ps1 -Modo Servidor -Kit <kit> `
  -NoAntesUtc <ISO-UTC-autorizada> -LimiteUtc <ISO-UTC-fin-autorizada>
```

No ejecutarlo para preparar el kit. No hay cita implícita ni reinicio automático.
El servidor verifica que Machine contiene VANTARE_LICENSE_PUBLIC_KEYS sin
imprimirlo; el núcleo debe llevarlo compilado. No se copia la variable al PC,
no se extraen claves de otros sitios y no hay identidad/licencia sintéticas.
Después de configurar Machine hay que reconstruir el núcleo y regenerar hashes.
La ausencia de esa configuración impide lanzar/apagar el PC, pero permite el
ensayo gráfico deshabilitado, que queda rotulado como NO listo para derechos.

El coordinador copia a una carpeta QA nueva y registra una tarea /IT con el
usuario ya conectado, sin contraseña. El trabajador exige sesión única esperada,
token elevado, GPU física, diez minutos de inactividad y ningún juego/Vantare
ajeno abierto. Nunca cierra procesos de Isaac. Crear ventanas/capturar no está
autorizado hasta la cita; el modo Trabajador se rechaza en el servidor incluso
si alguien olvida VANTARE_SIN_GRAFICOS. Una sesión bloqueada puede impedir la
captura GDI de GPUI: se conserva el error, no se publica una aprobación falsa.

Por ronda: host nuevo, núcleo real, pipe nuevo, mismo corpus sin extensión ni
ralentización, 5 s descartados y 50 centrales; Waiting sin simulador también.
El QPC procede del PRIMER span observe real del núcleo, mediante su feature
paint-stats existente. La traza del núcleo se guarda en memoria y se vuelca al
cerrar fuera de la ventana; nunca se infiere el reloj de la llegada de stderr.
Se valida frecuencia, fin y ausencia de overflow. Una captura tardía se invalida,
no desplaza el tramo. La instrumentación solo del núcleo es idéntica en ambos
brazos y se excluye de la familia CPU/memoria del overlay; tiene coste de memoria
propio y no acredita latencia de presentación ni una campaña A/A completa.

Se empaqueta además vantare-services.exe de la MISMA base exclusivamente para
LicenseStatus/Read local antes/después de cada ronda: política vigente Pro o
Founders, nunca renovación/login ni transferencia de credenciales. El nonce de
ese enlace efímero vive solo en memoria y no se registra. Unconfigured,
NoCredential, caducidad o versión incompatible invalidan la ronda. Esto impide
medir en silencio una capa vacía por derechos. Core/Services usan la sesión Owner
legítima del PC; el ensayo de denegación usa un almacén QA vacío aislado.

Capturas: todas usan fotos explícitas; NO_DEMO no tiene fallback. GPUI recibe
exactamente el mismo prefijo que Rune. Para el modo asentado, el TSV entrega
fotos con empates t=0 en el mismo orden y motion=false. No acredita fases de
animaciones. GPUI no ofrece wall-ms: Avisos conserva esa limitación explícita.
PNG original con alfa, pareja GPUI|Rune a tamaño real, diff de píxeles <5 % con
umbral por canal 8 y revisión de texto separada PENDIENTE. Completar la ejecución
no aprueba la paridad ni el texto automáticamente.

Al cerrar, solo termina procesos propios. Se conserva cada código/token Rune
0/2/3/4/5/6 y cada error. GPU ausente, sesión/actividad inesperada, derechos o
CSV inválidos abortan sin apagado. PresentMon temporizado termina su sesión ETW.
La evidencia se copia al servidor en destino nuevo, se verifica el archivo y
cada hash y SOLO ENTONCES se autoriza una segunda tarea interactiva a comprobar
otra vez la sesión/inactividad y ejecutar shutdown /s /t 60. Copia fallida o
actividad final dejan el PC encendido. Las tareas temporales propias se retiran.

Ensayo permitido en el servidor, sin dispositivo gráfico:

```powershell
pwsh -NoProfile -File <kit>/TANDA.ps1 -Modo Ensayo -Kit <kit> -Salida <salida-nueva>
```

Fija VANTARE_SIN_GRAFICOS=1, valida rutas/hashes/TSV, ejecuta SOLO el guard Rune
(6 GRAPHICS_DISABLED), el controlador con procesos/transporte/apagado falsos y
las regresiones CSV. No ejecuta GPUI, PresentMon ni captura real, SSH o shutdown.
PROBAR_DERECHOS.ps1 verifica IPC Core/Services real pero solo CPU y QA vacío:
debe DENEGAR, sin fabricar acceso. VERIFICAR_DLLS.ps1 lee imports con dumpbin,
sin ejecutar binarios. Todo resultado de ensayo va en logs externos al repo.

### Ciclo de vida Rune (#2522), solo en la cita autorizada

El producto se mantiene en fb2e2e520, anterior a M1/M2. Se transporta también
vantare.exe y se usa --overlays-bin, sin recongelar producto. Por excepción
expresa de la raíz, el launcher auxiliar se reutiliza del run oficial
44006217558, SHA 8358fdae1 (descendiente de fb2e2e520), perfil debug de CI;
sus hashes y los del archivo original constan en builds. No entra en las
mediciones CPU/memoria. El arnés CI fija con env! una ruta D:/a/... del runner
que no existe en la carpeta QA: se transporta su adaptación portátil solo de pruebas validada por CI; no se
crean rutas/junctions fuera de C:/VantareQA.
Los cuatro tests ignorados de #2522 se precompilan aparte desde su fuente
registrada en lifecycle-binarios.json; no se ejecuta Cargo en el PC. Se invoca
lifecycle-rune-tests.exe --ignored --test-threads=1 --nocapture, con las rutas
VANTARE_RUNE_OVERLAYS_EXE y VANTARE_LIFECYCLE_HARNESS y el launcher congelado
mediante VANTARE_LIFECYCLE_LAUNCHER_EXE. Solo cambian en el arnés la ubicación
del launcher y la retención optativa del directorio QA para evidencia.

Comprueba EOF, reinicio después de caída, salida cero e instancia única. Estos
tests usan el núcleo sintético original de lifecycle, separado por completo de
las mediciones con el replay LMU y de la identidad legítima de Isaac. TEMP/TMP
se sitúan dentro de la evidencia; se conservan logs y se cierran hijos propios.
El ensayo del servidor solo enumera los tests de libtest (--list --ignored),
nunca ejecuta los cuatro ignorados ni el arnés con su parser propio.

El muestreador se prepara en su modo RootInfoFile existente ANTES de arrancar
el replay: CAPTURA-LISTA confirma ETW y las clases de contadores ya preparadas.
Se entrega atómicamente la identidad del host recién creado. ETW dura 65 s,
pero solo se analizan [5,55) desde el primer observe real del núcleo. La ronda
falsa PROBAR_RONDA comprueba este orden, la identidad y el cierre por denegación;
no se desplaza la ventana si el host llega demasiado tarde.

La matriz se obtiene de los campos REALES de settings: Vantare/Eficiencia para
Relative, Standings, Fuel, Pedales y Delta; los otros catorce son funcionales
sin designSystem. No se etiquetan dos veces como Looks diferentes. Se conservan
los 13 escenarios nombrados del catálogo y todos los respaldos/variantes del
plan: orientación, tamaños, pausa, miniavisos y ausencia de datos. Neo/Neutro y
brandVisible se explicitan donde existen. Se generarán 223 parejas visuales y
96 rondas de rendimiento; duración orientativa 2 h 45 min más copia/verificación.
La paridad DPI 125/150 queda fuera: GPUI capture exige 96 DPI; no se cambia DPI.

Los auxiliares se han reutilizado de CI para no consumir RAM del servidor:
launcher y libtest del run 44006217558 (8358fdae1); arnés portátil del run
44012118423, merge 704fac60688752d588279db52f6bf6f1adb8359c de #2525
(fuente de tests idéntica a 5d61507ba). El diff de domain/ipc/session/restart
respecto a fb2e2e520 está vacío. Los tres son debug y quedan fuera de CPU/memoria.
La cola local pendiente se canceló sin hijos Rust; no se interrumpió compilación.
El PATH solo del hijo lifecycle incluye bin/ para encontrar el CRT empaquetado,
y se restaura en finally; no se cambia ninguna variable Machine/User.

Los layouts QA fijan performance.widgets.qa=15, opción existente común de
producto. Banderas conserva la excepción de seguridad del producto: 0 (por
cambio, sin limitar). Se registra el Hz efectivo en cada caso; no se modifica
el perfil ni layout de Isaac. Las parejas incluyen superposición al 50 % y
cajas alfa: un PNG transparente se revisa como ocultación esperada, no como
aprobación de contenido por un diff cero.

En Waiting el muestreador se inicia DESPUÉS del host, modo directo de 60 s:
CAPTURA-LISTA vuelve a ser su origen y conserva cinco segundos completos de
calentamiento del host. Nunca se pasa ReplayStartQpc en Waiting. PROBAR_RONDA
ejecuta y comprueba ambas órdenes con procesos falsos y el rechazo de derechos.

Tras configurar Machine, reconstruir SOLO el núcleo por la cola, conservando
los otros binarios y auxiliares con sus hashes (salida siempre nueva):

```powershell
pwsh -NoProfile -File tools/qa-overlays/COMPILAR_TANDA.ps1 -SoloNucleo `
  -Source D:/VantareServer/worktrees/isa-2365-tanda-fb2e2e520 `
  -BaseArtifacts D:/VantareServer/evidence/overlays-rune/kit-tanda-fb2e2e520 `
  -Output D:/VantareServer/evidence/overlays-rune/kit-tanda-fb2e2e520/licenciado-UTC
```

Sin Machine aborta ANTES de entrar en cola/crear salida; probado con el token
BLOCKED_LICENSE_CONFIG. Después hay que repetir dumpbin, preparar_tanda y
TANDA -Modo Ensayo contra la nueva carpeta de binarios; no editar el manifiesto
para cambiar production_rights_configured a mano.

Capturas y lifecycle aíslan VANTARE_NATIVE_DATA_ROOT, LOCALAPPDATA y APPDATA
en carpetas QA nuevas de la evidencia. Se restauran antes del rendimiento,
que usa exclusivamente la autoridad Owner legítima del núcleo. Las bases de
Relative/Standings/Fuel/Delta fijan contentVersion=1 para medir el producto
actual y no activar por omisión el Eficiencia heredado; los escenarios del
catálogo conservan sus ajustes y sus omisiones originales documentadas.
