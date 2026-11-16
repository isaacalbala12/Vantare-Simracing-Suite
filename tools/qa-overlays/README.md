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
