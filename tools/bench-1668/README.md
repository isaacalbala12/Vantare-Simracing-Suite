# VANTA-89 · Kit del PC de juego (#1668)

Entrega vigente: `C:/VantareServer/share/kit-bench/`. El 16-oct Isaac trasladó la
comparativa al PC de juego por falta de RAM del servidor. La espera del servidor
se detuvo; ya no hay runner de medición del servidor en este código.
El README que recibe Isaac tiene diez líneas (`README-KIT.txt`).

## Contenido y uso

`INICIAR.cmd` ejecuta `INICIAR.ps1` en Windows PowerShell 5.1 y solicita elevación
para ETW. No necesita Python en el PC de juego. Incluye Vantare Release, PresentMon
2.6.0 oficial con licencia, TinyPedal 2.51.0 ZIP oficial con licencia/fuente,
configuración propia y SHA-256 del paquete. RaceLab se instala desde su web oficial;
no se redistribuye su instalador ni se crean cuentas o pagos. Si es inaccesible,
se conservan sus tres posiciones como omitidas. No se afirma una comparativa completa.

El guion pregunta resolución y conjunto común: dos widgets (Standings/Relative),
o cuatro (también Delta/Pedals) solo si son gratuitos y funcionan en las tres.
Escala anclajes según resolución. Perfil TinyPedal aislado mediante APPDATA;
Vantare usa layout propio. Isaac debe configurar y comprobar RaceLab y confirmar
equivalencia y datos reales. La cuenta/plugin pueden impedir esa equivalencia.

Isaac inicia LMU: práctica Hypercar, sin bordes, Enable Plugins ON. Elige pista,
modo PISTA o BOXES y anota IA/clima/gráficos/VSync/límite FPS. Una vuelta prepara
Delta. Durante cada toma: misma cámara/ajustes, conducción constante sin incidentes
o boxes/cabina/ralentí según lo elegido; nunca mezclar ambos.

Orden fijado: Base/Vantare/RaceLab/TinyPedal; TinyPedal/RaceLab/Vantare/Base;
RaceLab/Base/TinyPedal/Vantare. Cada una: confirmación humana, 5 s de foco LMU,
30 s de calentamiento y 180 s de captura. Un pitido pide volver al guion y declarar
incidentes. Son 42 minutos más cambios/preparación para doce tomas; unos 32 minutos
para nueve si RaceLab no está disponible. La variación de tráfico/conducción debe
revisarse antes de atribuir diferencias pequeñas al producto.

Solo se cierran procesos lanzados por el kit y sus descendientes, comprobando PID
y creación. Si ya hay overlays abiertos, el guion pide que los cierre Isaac.
No lanza/cierra LMU. Ctrl+C o STOP detienen la prueba; conserva ZIP parcial.
No captura imágenes, lee variables de entorno privadas ni administra credenciales.

## Evidencia y análisis offline

El ZIP incluye campaña/hardware/condiciones, hashes y versiones de ejecutables,
layouts, contadores y frames crudos, doce estados de pasada (incluidas omisiones),
e incidentes. Solo el servidor necesita Python 3.11+ sin dependencias externas:

```powershell
./ANALIZAR.ps1 -Zip C:/ruta/resultados-FECHA.zip
```

`analyze_zip.py` valida rutas, duplicados, symlinks, extensiones, volumen y orden del
ZIP; recalcula desde CSV sin confiar en summaries externos. Extrae a carpeta nueva
por hash y escribe `C:/VantareServer/evidence/bench-1668/RESULTADOS.md`. Nunca rellena
faltantes con cero. La tabla distingue cobertura, cada toma y medias de tomas válidas;
los p1/p99 agregados son medias de percentiles por toma, no un percentil combinado.

PresentMon: cadena dominante por PID, CSV v1; descarta primer intervalo por comenzar
antes de capturar. FPS = 1000/media de msBetweenPresents; p1/p99 interpolados.
Incluye presents descartados, no acredita FPS visibles ni input→pantalla. Revisar
cadenas secundarias/PresentMode/dropped. CPU por tiempo de proceso normalizado a
todos los hilos lógicos; WS agregado puede duplicar páginas compartidas. CPU total
GetSystemTimes; RAM física total menos libre. Muestras de recursos ~1 s, con pequeño
desfase frente a ETW. Procesos protegidos/terminados pueden faltar. Guardas de builds,
foco, presencia y duración no certifican equivalencia/frescura ni estabilidad térmica.
El plugin RaceLab cargado en LMU permanece en la base; su CPU dentro del juego no
figura en el consumo de procesos RaceLab.

## Build y empaquetado

Fuente native de `origin/nightly@ed66924c29299d78cb78a0125ecb5e2ab83ef049`;
nightly ya contiene widgets reales, por eso no se usa el PR visual #1641 abierto.
Release optimizado de Cargo; `--version` indica 0.0.0 (development), que es el canal
compilado, no perfil debug/prueba. No distribuir públicamente este kit privado.
Build por cola, un solo build propio, MIN_GB=0, target propio y dos jobs:

```powershell
$env:VANTARE_CARGO_MIN_GB='0'
$env:VANTARE_CARGO_SLOTS='1'
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --manifest-path native/Cargo.toml --release --locked -p vantare-runtime -p vantare-ui --bin vantare --bin vantare-core --bin vantare-overlays --target-dir C:/VantareServer/targets/isa-1668 -j 2
```

`prepare.py` genera los perfiles iniciales desde nombres publicados TinyPedal;
`package.ps1` reúne binarios/hashes/licencias y scripts compatibles con PS 5.1.
Fuentes: [TinyPedal](https://github.com/TinyPedal/TinyPedal/releases/tag/v2.51.0),
[PresentMon](https://github.com/GameTechDev/PresentMon/releases/tag/v2.6.0),
[RaceLab](https://racelab.app/) y [plugin/configuración LMU](https://garage.racelab.app/docs/first-steps/lmu/).

Verificación: tres tests de cálculos/clasificación y tres del ZIP/report completo,
omisiones y rechazo de traversal; sintaxis PS 5.1 y 7; preflight PS 5.1; sampler dos
veces en una misma sesión PS 5.1 (detecta regresión Add-Type); tres binarios --version.
No se ejecutan las doce tomas en servidor ni se certifica runtime del PC de Isaac.
Sin cambios nativos: gates de producto omitidos; Release sí compilado.
