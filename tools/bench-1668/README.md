# VANTA-89 · Medición #1668

Banco Windows local solicitado por Isaac. No lanza ni cierra LMU, no toca el
supervisor PID 16280, no captura imágenes y no abre interfaces de configuración.
Los overlays propios solo se arrancan durante las pasadas; procesos preexistentes
provocan parada, nunca se cierran como parte de la limpieza.

## Estado y límites

La evidencia viva está en `C:/VantareServer/evidence/bench-1668/RESULTADOS.md` y el
buzón en `C:/tmp/buzon/bench-1668.md`. No confundir instalación/preparación con una
comparación terminada. RaceLab requiere cuenta según su web oficial y un plugin
que exige cerrar LMU según su guía; ambas cosas impiden medirlo esta sesión sin
otra intervención. No se reemplaza por una ventana de login ni por datos sintéticos.

- [RaceLab oficial](https://racelab.app/)
- [Configuración oficial LMU](https://garage.racelab.app/docs/first-steps/lmu/)
- [TinyPedal 2.51.0](https://github.com/TinyPedal/TinyPedal/releases/tag/v2.51.0)
- [PresentMon 2.6.0](https://github.com/GameTechDev/PresentMon/releases/tag/v2.6.0)

## Preparación reproducible

Descargas oficiales en `C:/VantareServer/bench/`: TinyPedal ZIP, PresentMon CLI,
RaceLab installer. Los SHA-256 y firmas observadas se conservan en `downloads.json`
de evidencia; metadatos de releases oficiales en `bench/*-release.json`.
TinyPedal es portable. RaceLab se extrae como paquete Squirrel mediante 7-Zip,
sin ejecutar instalador ni escribir en la instalación de LMU; su ejecutable queda
en `bench/RaceLab/lib/net45/RacelabApps.exe`. No se ha validado su arranque.

`prepare.py` genera configuración propia aislada: cuatro widgets gratuitos de
Vantare (Standings/Relative/Delta/Pedals) y equivalentes TinyPedal, anclajes
aproximados a 1920×1080. Lee los nombres publicados de widgets de TinyPedal 2.51.0,
sin importar ni ejecutar su código Python. No modifica perfiles existentes del
usuario. El proceso TinyPedal recibe APPDATA propio; su ventana principal está
desactivada al arrancar y sus widgets se bloquean para no captar clics.

Vantare se construye desde native de `origin/nightly@ed66924c29299d78cb78a0125ecb5e2ab83ef049`.
Esa base ya contiene los widgets reales; #1641 es una dirección visual aún abierta.
Se evita mezclarla con el objeto de la medición. No usar perfil debug/prueba.
Desde `vantare-v2/`, **una sola compilación propia**, por la cola:

```powershell
$env:VANTARE_CARGO_MIN_GB='0'
$env:VANTARE_CARGO_SLOTS='1'
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --manifest-path native/Cargo.toml --release -p vantare-runtime -p vantare-ui --bin vantare --bin vantare-core --bin vantare-overlays --target-dir C:/VantareServer/targets/isa-1668 -j 2
```

No se cambia la configuración de máquina ni se cancela trabajo ajeno. El slot
único no garantiza que otros workers, configurados con dos slots, estén inactivos:
el banco espera por nombres de procesos y rechaza pasadas con builds detectados.

## Sesión y ejecución

Isaac debe iniciar práctica Hypercar, 1920×1080 sin bordes, Enable Plugins ON,
vista de cabina, en su box, motor al ralentí, sin pausa, sin menús ni Alt-Tab.
Mismos coche/pista/clima/tráfico/gráficos/VSync/límite FPS durante la campaña.
Hace falta comprobar que cuatro widgets muestran datos reales y posiciones
comparables; los perfiles escritos por sí solos no lo acreditan.

El runner oculto espera sesión REST y `READY.json` en evidencia. Solo después de
comprobar las condiciones, crear:

```json
{"condition":"boxes-cockpit-idle","resolution":"1920x1080","widgets_verified":true}
```

Ejecutar `run.ps1` con `Start-Process pwsh -WindowStyle Hidden`. Hay un mutex
de campaña para evitar duplicados. `STOP` en evidencia cancela las esperas y se
revisa entre pasadas; una captura activa termina antes de detener los procesos
propios. Al reiniciar debe retirarse deliberadamente READY/STOP anteriores.

Orden: Base/Vantare/RaceLab/TinyPedal; TinyPedal/RaceLab/Vantare/Base;
RaceLab/Base/TinyPedal/Vantare. Tres tomas de 180 s y calentamiento de 30 s por
escenario. RaceLab se omite expresamente por el bloqueo. Son unos 32 minutos
para las nueve pasadas posibles, más las esperas por carga/sesión; 42 minutos
para doce. No comparar esos resultados de boxes con FPS conduciendo.

## Datos, verificación y revisión obligatoria

`sample.ps1` recoge procesos/counters cada segundo; CPU normalizada sobre todos
los hilos lógicos, working set agregado y CPU/RAM física total. CSV numéricos con
cultura invariante. Registra foco y procesos de compilación. Procesos protegidos
o terminados durante lectura pueden faltar: revisar cobertura de los tres
procesos de Vantare y de TinyPedal. El primer delta de CPU se excluye.

PresentMon captura solo PID LMU y su propia sesión ETW. Se conserva todo el CSV;
`summarize.py` selecciona la cadena más frecuente y omite su primer intervalo,
que podría empezar antes de la captura. No agrega cadenas. Calcula FPS como
1000/media de intervalos, p1/p99 de frametime interpolados. No equivale a FPS
visibles ni a latencia input→pantalla; incluye presents descartados. Preservar
CSV para revisar dropped/PresentMode y cambios de swap chain. CPU/RAM y ETW
tienen un desfase pequeño al arrancar y no son muestras sincronizadas por frame.

La guarda automática rechaza builds, foco ajeno, juego ausente, duración menor
al 90% y overlay ausente. **No certifica** datos live, estabilidad de clima/IA,
igualdad de superficie/cadencia o que el coche siguiera en boxes: revisar estos
puntos con Isaac antes de aceptar la pasada. No reetiquetar una pasada inválida;
conservarla y repetir. `report.py` reconstruye RESULTADOS.md desde summaries de
la última campaña. Presenta cada pasada; N/D jamás significa cero consumo.

Validación: `python tools/bench-1668/test_summary.py`, parseo PowerShell y smoke
real de instrumento 5 s / sampler 3 s. Los smokes no son medidas comparativas.
Gates de producto Rust omitidos porque no se toca código nativo; Release es un
requisito de ejecución, no un gate de corrección de la app.
