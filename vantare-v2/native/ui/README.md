# ui — overlays GPUI

GPUI de Zed (rev `72d28c32`, la del prototipo de paridad ISA-1410) usado
directamente; el crate añade la integración Win32 (`overlay.rs`: transparencia,
click-through, sin foco, sin marco DWM, DPI), el texto Inter con `letter-spacing`
(`text.rs`) y los widgets Standings Eficiencia, radar y pedales.

```powershell
cd vantare-v2/native
cargo run -p vantare-ui --release --bin vantare-overlays -- 4   # 1, 4 o 22 widgets; datos del núcleo (pipe)
cargo run -p vantare-ui --release --bin vantare-overlays -- 4 --fuente local   # sin núcleo
```

El binario recibe los datos con `--fuente local|pipe[:<nombre>]`:

- `pipe` (por defecto): `source::pipe_feed` conecta un `ipc::Subscriber` al
  named pipe del núcleo (`vantare-core`; sin nombre, el mismo por defecto, con
  el SID del usuario), reconecta solo y reenvía la foto más reciente a
  `vantare_ui::run`. Los widgets no saben de dónde viene.
- `local`: `source::local_feed()`, carrera sintética a 30 Hz, sin núcleo.

Cada widget proyecta la instantánea con el `ViewModel` de `domain` y solo
repinta cuando ese ViewModel cambia (Standings: solo lo que se dibuja; mientras
haya animación pide fotogramas).

## Paridad visual

`parity.ps1 -Parity <tools/native-ui/parity>` captura la escena `standings-44`
con la feature `parity-capture` (dos pasadas GDI negro/blanco) y la compara con
`reference/standings-44.png` con `diff.py`. Resultado en esta fase: 3,68 %
(6341 / 172536 px, umbral 8), igual que el prototipo; la diferencia es la
rasterización del texto de DirectWrite frente a Chrome. La referencia y
`diff.py` viven en la rama del ensayo ISA-1410, no en esta.

## Una ventana por monitor

El producto abre **una** ventana transparente, click-through y sin foco del
tamaño de cada monitor que tenga widgets (`apply` de `overlay.rs`), con todos sus
widgets colocados dentro en posición absoluta (`Screen` en `app.rs`). Los widgets
(`Overlay`) no saben en qué ventana están: pintan en coordenadas propias y
`text::with_origin` los coloca. La ventana no cambia de tamaño; el alto de
Standings, que depende de las filas visibles, lo gobierna el propio widget.

Antes de decidirlo se midió también una ventana por widget (ya retirada): con la
misma CPU presentaba ~13 veces más fotogramas con 22 widgets (441 frente a 33 por
segundo con la fuente realista), y la GPU 3D del proceso era parecida. El coste de
DWM al componer cada modo no se midió.

### Repintado en la ventana grande

Leído en GPUI rev `72d28c32` y comprobado con la feature `paint-stats`
(`cargo run -p vantare-ui --features paint-stats ...` imprime cada segundo
fotogramas de ventana, `render` de cada widget y pintados reales):

- **CPU, depende de si la vista está cacheada.** Un `notify()` de cualquier vista
  marca la ventana como sucia y GPUI genera un fotograma nuevo (`Window::draw`).
  Una vista hija normal (`.child(entity)`) se renderiza, maqueta y pinta entera en
  **cada** fotograma de la ventana aunque no haya cambiado. Con
  `Entity::cached(estilo)` (lo que usa `Screen`) solo se vuelven a renderizar las
  vistas notificadas; del resto GPUI copia las primitivas del fotograma anterior
  (`reuse_prepaint`/`reuse_paint`), sin ejecutar código de la vista. Esa copia sigue
  costando O(primitivas). Una vista cacheada se coloca y dimensiona por estilo, no
  por contenido (por eso `Screen` lee `wanted_size()` del widget cada fotograma).
- **GPU, siempre la escena entera.** El renderer de Windows
  (`DirectXRenderer::draw`) limpia el render target, dibuja todos los lotes de
  primitivas de la escena y hace `Present(0, 0)`: no hay rectángulos sucios ni
  daño parcial. Cada fotograma cuesta lo que la ventana completa (tamaño del
  monitor) y DWM recompone toda la superficie, cambie un widget o todos.
- **Medido** (build dev, 4 widgets: 2 Standings, radar y pedales; la fuente solo
  cambia los pedales, 30 Hz). Por segundo:

| Vistas | fotogramas de ventana | `render` standings / radar / pedales | pintados standings / radar / pedales |
| --- | ---: | --- | --- |
| cacheadas (`Screen`) | 30 | 0 / 0 / 30 | 0 / 0 / 30 |
| sin cachear (referencia) | 30 | 60 / 30 / 30 | 60 / 30 / 30 |

### Ritmo de pintado

Cómo pinta GPUI en Windows (rev `72d28c32`, leído en `gpui_windows`):

- **Los fotogramas ya van a la frecuencia del monitor.** Aunque el renderer llama a
  `Present(0, 0)`, ningún dibujo nace de ahí: un hilo `VSyncProvider` espera a
  `DwmFlush` e invalida **todas** las ventanas en cada vsync, y cada ventana dibuja
  solo si está sucia. No hay ninguna vía de dibujo fuera de vsync (Windows no
  implementa `schedule_frame`), así que una ventana no puede presentar más veces
  que el refresco (aquí 120 Hz). Por eso no hace falta ningún reloj de fotograma
  propio ni parchear GPUI.
- **Sin cambios, cero fotogramas.** Una ventana sin nada sucio no dibuja ni presenta.
  Lo único que queda es el coste de GPUI de recibir un `WM_PAINT` por ventana en
  cada vsync (ver «quieta» abajo); no se puede quitar sin parchear GPUI.
- **Qué depende de este crate**: (1) el repintado por datos, ya limitado a cambios de
  ViewModel; (2) las animaciones de Standings. `Motion::wake` distingue lo que se
  mueve de verdad (un fotograma por vsync) de un aviso ya quieto que solo caduca
  (un despertar puntual con un temporizador, sin fotogramas) y de nada (cero).
  Antes se pedía un fotograma por vsync durante los 1200 ms de vida de cada aviso,
  aunque tras 500 ms no cambiara nada.

**Fuentes de prueba** (`--fuente local` con `VANTARE_FUENTE`, por defecto
`realista`; todas a 30 Hz):

| Valor | Qué cambia |
| --- | --- |
| `realista` | Como una carrera real: reloj cada segundo; gaps, vueltas y mejores vueltas de cada coche una vez por vuelta (escalonados); unos 4 adelantamientos por minuto entre los 10 primeros; un coche en boxes 20 s cada 5 minutos. Radar y pedales cambian siempre (telemetría del jugador). |
| `estres` | Todo cambia en cada instantánea. Sobrestima. |
| `quieta` | La escena `standings-44` con la secuencia avanzando: ningún ViewModel cambia. |

**Medición** (`measure.ps1`, build release con `paint-stats`, 10 s tras 6 s de
calentamiento, esta máquina a 120 Hz, una pasada; medias de las últimas 10 líneas).
«Antes» es el ritmo previo (un fotograma por vsync durante toda la vida de un aviso);
«después» es `Motion::wake`. Fotogramas = dibujos de ventana por segundo;
`render` = `render` de Standings por segundo sumando todos.

| Fuente | Widgets | Fotogramas/s antes → después | `render` Standings antes → después | CPU % de un núcleo antes → después | GPU 3D del proceso antes → después |
| --- | ---: | ---: | ---: | ---: | ---: |
| realista | 4 | 36 → 32 | 19 → 7 | 6,4 → 4,9 | 0,4 → 0,4 |
| realista | 22 | 37 → 33 | 80 → 28 | 20,2 → 19,2 | 1,5 → 1,5 |
| estrés | 4 | 120 → 101 | 240 → 202 | 21,0 → 19,0 | 1,3 → 1,2 |
| estrés | 22 | 117 → 103 | 935 → 814 | 97,4 → 70,6 | 5,2 → 4,7 |
| quieta | 4 | 0 → 0 | 0 → 0 | 0,9 → 1,0 | 0 → 0 |
| quieta | 22 | 0 → 0 | 0 → 0 | 2,2 → 2,9 | 0 → 0 |

Lectura:

- Con datos realistas 4 widgets cuestan ~5 % de un núcleo y 22 widgets ~19 %,
  frente al 70-97 % de la fuente de estrés (que sobrestimaba unas 4 veces). Radar
  y pedales, que cambian con la telemetría, son ya casi todo el coste.
- `render` de Standings con 22 widgets baja de 80 a 28 por segundo: son las
  animaciones. La ventana no supera los 120 fotogramas por segundo del monitor.
- Sin datos ni animación: 0 fotogramas. El 1-3 % de CPU que queda es la espera de
  `WM_PAINT` en cada vsync.
- Tope opcional: limitar las animaciones a 60 Hz en monitores de 120 Hz o más
  reduciría a la mitad los fotogramas de animación, pero exige conocer el refresco
  (GPUI no lo expone; habría que leerlo de DWM) o un temporizador propio que en
  monitores de 60 Hz desincroniza con el vsync. No está implementado.

### Posición exacta de la ventana

GPUI deja el área cliente de una ventana 4 px por encima de lo pedido (en Y), y la
ventana del monitor salía en y=−4 con sus 4 px inferiores sin cubrir.
`overlay::apply` ya no lee la posición que dejó GPUI: recibe la esquina pedida (px
físicos) y la fija con `SetWindowPos`. `check-windows.ps1` lo comprueba con
`EnumWindows`/`GetWindowRect` (4 widgets, 100 % de DPI, monitor principal): debe
haber una sola ventana del tamaño del monitor y en su esquina.

```powershell
cd vantare-v2/native; cargo build -p vantare-ui
.\ui\check-windows.ps1     # exit 0 = todo en su sitio
```

### Varios monitores

Se crea una ventana del tamaño de cada monitor **que tenga widgets** (los que
tienen la esquina dentro; `app::partition`, con test para monitores con
coordenadas negativas y vacíos) y ninguna para los demás. Las posiciones de la
cuadrícula (`origin_of`) son globales y caen en el monitor principal; para probar
varios monitores, `VANTARE_DESPLAZAMIENTO=x,y` (px) desplaza toda la cuadrícula:

```powershell
# Monitor principal de 1920 px y otro a su derecha: con este desplazamiento los
# widgets de la 4.ª columna (x = 2030) caen en el segundo monitor; el resto, en el principal.
$env:VANTARE_DESPLAZAMIENTO = '600,0'
vantare-overlays 22 --fuente local          # esperado: 2 ventanas, una por monitor
```

Comprobar con `EnumWindows` (o a ojo) que hay una ventana transparente por monitor
con widgets. No he podido probarlo con dos monitores físicos (esta máquina solo
tiene uno); el reparto está cubierto por un test unitario.

## Workshop (desarrollo)

`vantare-workshop` abre la misma ventana por monitor con uno o varios widgets
alimentados por **una escena fija**, sin núcleo. `workshop.ps1` la mantiene al
día mientras editas: al guardar un fichero de `ui/src` (o `ui/fixtures`) recompila
en incremental y reabre el binario con los mismos argumentos, es decir, la misma
escena, los mismos widgets y la misma posición.

```powershell
cd vantare-v2/native
.\ui\workshop.ps1                                     # standings + radar + pedales, escena LMU por defecto
.\ui\workshop.ps1 -WorkshopArgs '--widgets','standings','--pos','100,80'
.\ui\workshop.ps1 -WorkshopArgs '--escena','C:\otra.json'
cargo run -p vantare-ui --bin vantare-workshop -- --widgets radar   # sin script, una vez
```

Argumentos: `--widgets standings,radar,pedals` (en una fila), `--pos x,y` (esquina
de la fila, px de pantalla, por defecto 20,20) y `--escena <archivo>`.

**Escena.** Por defecto, `fixtures/lmu47.snapshot.json`: una foto **real** de LMU
(47 coches, posiciones, radar y pedales frescos) sacada del corpus
`testdata/rust-port/lmu47-high-rate-60s.tar.gz` a través del adaptador de replay
del núcleo. Va embebida en el binario (`include_str!`); `--escena` lee otra del
disco. Para regenerarla o crear otra:

```powershell
# 1. el núcleo reproduce el corpus (o una captura tuya) por un pipe
cargo run -p vantare-runtime --bin vantare-core -- --replay ../testdata/rust-port/lmu47-high-rate-60s.tar.gz --pipe fixture
# 2. se guarda la primera foto con todo fresco que llegue por ese pipe
cargo run -p vantare-ui --bin vantare-workshop -- --guardar ui/fixtures/lmu47.snapshot.json --pipe fixture
```

El formato es el DTO del cable (`ipc::snapshot_to_json` / `snapshot_from_json`,
JSON versionado); `ui` no depende de `runtime`, así que el replay corre en el
proceso del núcleo.

**Script.** `workshop.ps1` compila una copia del `.exe` (Windows no deja
sobrescribir un binario en marcha): la versión nueva se ve antes de cerrar la vieja,
sin parpadeo. Si no compila, imprime los errores y deja abierta la última versión
buena. Sin dependencias nuevas (sondeo de `LastWriteTime` cada 150 ms con
debounce). Por defecto fija `CARGO_PROFILE_DEV_DEBUG=0` (enlaza más rápido; es un
perfil aparte, así que la primera vez recompila las dependencias, unos minutos).
No vigila `ui/assets` (fuentes, logo).

**Tiempo de ciclo guardar → ver** (esta máquina, incremental, `-j 4`; se guarda un
cambio de una constante de color en `pedals.rs`, `radar.rs` y `standings/view.rs`;
«visible» = la ventana nueva existe y tiene tamaño; tres o cuatro ciclos por fila):

| Configuración | guardar → compilado | guardar → ventana visible |
| --- | ---: | ---: |
| perfil dev con depuración (cargo por defecto) | 5,4–6,4 s | 6,0–7,1 s |
| **`workshop.ps1` (sin depuración)** | 4,0–4,3 s | 4,6–4,9 s |
| además `rust-lld` (`RUSTFLAGS=-Clinker-flavor=lld-link -Clinker=rust-lld`) | 3,7–4,1 s | 4,2–4,7 s |

`rust-lld` se probó y no se incluye: gana ~0,5 s pero cambia los `RUSTFLAGS` de
todo el árbol. Tras un error de compilación y su arreglo el ciclo sigue igual
(3,9 s → 4,6 s). Casi todo el tiempo es compilar y enlazar `vantare-ui` con GPUI
(el enlazado de los binarios domina), no la reapertura de la ventana (~0,6 s).
