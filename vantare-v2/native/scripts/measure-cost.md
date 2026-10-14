# Medición #1461: coste de journal/Series y validación

Solo diagnóstico, no optimización ni configuración de producto. El servicio
lee `VANTARE_MEASUREMENT_MODE` una vez al arrancar. Sin variable (o `normal`)
conserva el comportamiento productivo. Rechaza valores desconocidos y cualquier
modo de medición con `--recording`; imprime el modo en stderr.

| Valor | Trabajo omitido |
| --- | --- |
| `no-flows` | `Journal::observe` y `Series::observe` |
| `no-validation` | HashSet de identidad duplicada y `sanitize` del núcleo |
| `no-both` | Los dos anteriores |

No elimina el tipo `Quality`, la traducción/admisión del adaptador, la vigilancia
de frescura, derivaciones solicitadas, retención durante pausa, derechos ni IPC.
El host de eventos permanece, aunque el journal omitido no recibe hechos.
Por tanto, el delta mide esas llamadas concretas, no todo el coste de `Quality`
ni el de una implementación Go equivalente. No conectar Engineer/recording al
banco: los brazos de ablación no producen flujos completos ni saneamiento.

## Atribución por fases (notas del orquestador,13:41)

La adaptación de `40dd738a` añade QPC y ciclos del hilo en fases acotadas.
Runtime/UI compilan el diagnóstico con `paint-stats`; además, **todo** registro
requiere `VANTARE_PROFILE_PHASES=1`, leído una vez. IPC y el backend Windows
reutilizan ese fichero sin dependencias hacia UI y quedan inertes por defecto.
`-PhaseOnly` activa solo esa pasada; los cuatro brazos siempre fijan el flag a0.
No hace falta elevar ni instalar WPT. No sustituye un perfilador de muestreo.

Fases: SHM, REST red+cache, traducción, validación, derivaciones, journal,
Series, DTO, serialización, escritura IPC, decode, recepción (incluye espera),
proyección/ingesta, diff delVM, plan de Standings, render/canvas, DirectWrite,
envío de primitivas GPU y llamada DXGI Present. Los ciclos son del hilo que
ejecuta cada fase; QPC es tiempo transcurrido, no CPU. Render/Project/Feed/Poll
son inclusivos: **no sumar** fases anidadas ni interpretar esperas como CPU.
El plan de Standings no es todo el layout interno de GPUI. TextLayout mide
DirectWrite cuando no sirve la caché superior. GPU submit/Present son CPU del
driver/API, no tiempo de GPU ni presentación física.

El backend tiene contadores propios, informa como máximo cada segundo desde
Present; IPC informa desde write/decode. Screen render y pintados por widget
van en el logUI y Present cuenta llamadas reales a laAPI. Los endpoints QPC
del JSON permiten recortar los intervalos; los bloques reportados al final
cruzan su frontera como máximo~1s. Conservar también la pasada sin diagnóstico
para cuantificar su perturbación. No declarar top15funciones por muestreo a
partir de estos contadores: publicar fases y límites explícitos.

Desde `native/`, construir un único Release con símbolos para todos los brazos:

```powershell
$env:RUSTC_WRAPPER = (Get-Command sccache).Source
$env:CARGO_INCREMENTAL = '0'
. ./packaging/build-config.ps1
$previous = Import-NativeBuildConfig C:/tmp/beta/build-config/beta-dev-clerk.env
try {
  cargo build --release -j 2 -p vantare-runtime -p vantare-ui --bin vantare-core --bin vantare-overlays --features vantare-runtime/paint-stats,vantare-ui/paint-stats --config 'profile.release.debug="line-tables-only"'
} finally { Restore-NativeBuildConfig $previous }
$env:VANTARE_BETA_ROOT = 'C:/tmp/vantare-beta-isaac'
$env:VANTARE_NATIVE_DATA_ROOT = 'C:/tmp/vantare-beta-isaac/data'
./scripts/measure-cost.ps1 -Core ./target/release/vantare-core.exe -UI ./target/release/vantare-overlays.exe -SHA (git rev-parse HEAD) -Layout C:/tmp/1466-evidence/live-split250/layout.json -ReviewWarmup
./scripts/measure-cost.ps1 -Core ./target/release/vantare-core.exe -UI ./target/release/vantare-overlays.exe -SHA (git rev-parse HEAD) -Layout C:/tmp/1466-evidence/live-split250/layout.json -ProfileOnly -Samply C:/tmp/1461m-evidence/samply/samply.exe -Out C:/tmp/1461m-evidence/profile
./scripts/measure-cost.ps1 -Core ./target/release/vantare-core.exe -UI ./target/release/vantare-overlays.exe -SHA (git rev-parse HEAD) -Layout C:/tmp/1466-evidence/live-split250/layout.json -PhaseOnly -Out C:/tmp/1461m-evidence/phases
```

El script adapta el protocolo #1466: LMU en primer plano, REST `inRealtime=true`,
movimiento por el probe real, sin cargo/rustc, mismo Standings de20filas/clase
del jugador/250ms,5s de calentamiento y90s por PID. Tres rondas de cuatro brazos;
la segunda invierte el orden. Reserva `medicion-1466` y mutex visual por ronda,
relee/hash de notas antes de cada toma y aborta si cambian o aparece contención.
No lanza ni para la beta: el orquestador debe dejar libres otros consumidores
para evitar otra suscripción/carga activa y restaurarlos después si los detuvo.
`-ReviewWarmup` guarda `<brazo>-ready.png` antes de medir y espera60s a que el
operador lo mire con `view_image` y cree `<brazo>-ready-approved.txt`. Así un
aviso de login no se cuenta como Standings. Parar la beta mediante su launcher
`--parar --instancia native-beta` y restaurarla con el script oficial
`C:/tmp/beta/arranque-native-beta.ps1 -tag 1461m`, sin matar procesos ajenos.

Conserva GetProcessTimes, QueryProcessCycleTime crudo, CSV, endpoints antes del
preflight final, hashes, logs y dos capturas separadas2s DURANTE cada pasada.
Revisar las24capturas con `view_image`: reloj/gaps/vueltas deben cambiar y
Standings estar visible. `complete.txt` solo certifica ejecución, no revisión
visual. Un aborto deja `INCOMPLETE.txt`; repetir la campaña completa en otra
carpeta. No reutilizar resultados parciales. No convertir ciclos en tiempo de
CPU sin calibración: frecuencia dinámica y resolución15,625ms de CPUTime.

WPR registra90s aparte (ETW necesita permisos de administrador); Samply convierte
la traza filtrada por los dosPID y conserva ETL/JSON/símbolos. Así no requiere
xperf, que `samply record` necesita en Windows. Nunca sumar porcentajes inclusivos. El top15
debe distinguir coste exclusivo y muestras sin símbolos. No mide GPU/DWM,
latencia de presentación, OBS, DPI ni presupuestos finales de producto.
