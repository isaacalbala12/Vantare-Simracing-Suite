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

## Kit Eficiencia (ISA-1427)

`vantare_ui::efficiency` reúne solo primitivas con dos consumidores actuales:

| API | Consumidores |
| --- | --- |
| `tokens::{INK, MUTED, PANEL, LOSS, RADIUS}` (de `vantare-functional/tokens.css`) | Standings y pedales; radar también usa `INK` |
| `text` (Inter, tracking y números tabulares) | Standings, radar y pedales (origen y fuentes registrados por el host) |
| `col`, `rect`, `paint_rect` | Standings y radar; pedales también usa `col` y `rect` |
| `paint_panel`, `paint_frame` | Standings y pedales |

El texto conserva Inter estática (pesos 400/500/600/650/700/800), kerning,
cifras tabulares y tracking en em convertido a px. Los rectángulos se ajustan
a píxel **después** de sumar el origen del widget. GPUI se usa directamente;
no hay un renderer alternativo ni dependencias nuevas.

Cabecera, fila, celda, pie, cola de sombra precalculada del rail y `Motion`
(FLIP, avisos, PIT, vueltas y batalla) siguen en `standings/`: solo los usa ese
widget. No se extraen hasta que haya un segundo consumidor real. Los pedales
conservan fondo al 90 % y Standings al 87 % con su degradado y sombra propios;
radar conserva el lienzo transparente. Este refactor no amplía sus diseños.

Cada widget proyecta la instantánea con el `ViewModel` de `domain` y solo
repinta cuando ese ViewModel cambia (Standings: solo lo que se dibuja; mientras
haya animación pide fotogramas).

## Paridad visual

`parity.ps1 -Parity <tools/native-ui/parity>` captura la escena `standings-44`
con la feature `parity-capture` (dos pasadas GDI negro/blanco) y la compara con
`reference/standings-44.png` con `diff.py`. Resultado en esta fase: 3,68 %
(6341 / 172536 px, umbral 8), igual que el prototipo; la diferencia es la
rasterización del texto de DirectWrite frente a Chrome. La referencia histórica
vive en la rama del ensayo ISA-1410; `ui/diff.py` conserva una copia de su
comparador (Pillow y numpy ya instalados, sin instalar dependencias).
El refactor del kit ISA-1427 reproduce 6341 / 172536 px (3,6752 %) y su captura
es idéntica a la anterior: 0 px distintos con umbral 0, sin máscaras.

## Portar un widget

1. Crear el ViewModel y la proyección pura en `native/domain/src/<widget>.rs`
   (nombre Rust, p. ej. `fuel_strategy`) y exportarlos desde `domain/src/lib.rs`.
   El widget recibe `Snapshot` y preferencias; no contiene reglas por simulador.
2. Crear `native/ui/src/<widget>/mod.rs`, reutilizando `efficiency` y el renderer
   productivo. Copiar el contrato concreto de `radar.rs` o `pedals.rs`: struct
   `pub(crate) Widget` con estos métodos `pub(crate)` (sin trait):

   | Método | Devuelve / responsabilidad |
   | --- | --- |
   | `new(prefs: Preferences)` | `Self`, estado inicial sin datos |
   | `size(&self)` | `(f32, f32)`, rectángulo completo con sombras/rail |
   | `ingest(&mut self, snapshot: &Snapshot, prefs: Preferences)` | `bool`, cambia solo si el dibujo cambió |
   | `frame(&mut self, prefs: Preferences)` | `(crate::app::Paint, crate::app::Wake)`, escena propia clonada en la closure de pintado |
   | `animating(&self)` con `#[cfg(feature = "parity-capture")]` | `bool`, hasta terminar movimientos **y** avisos temporales |

   `Paint` es `Box<dyn Fn(&mut gpui::Window, &mut gpui::App)>`; para un widget
   quieto devolver `Wake::Idle` y `animating = false`. Con animaciones usar
   `Wake::Frame` / `Wake::At(Duration)` y acotar su final. El host coloca el
   origen, registra Inter, programa repintados y pinta el fondo de captura.
3. Añadir **una línea** al bloque `widgets!` al final de `ui/src/registry.rs`:
   `FuelStrategy => fuel_strategy: "fuel-strategy",`. No editar `app.rs`,
   `lib.rs`, los binarios ni los contadores. El nombre CLI debe coincidir con
   `reference/<nombre>.png`; el módulo Rust usa guiones bajos.
4. Crear `ui/fixtures/<nombre>.snapshot.json` en el DTO vigente de
   `ipc::snapshot_from_json` (ahora `version: 3`); partir de una de las escenas
   versionadas. Reproducir **los datos de ese widget** de
   `tools/widget-reference/scene.tsx`: Workshop `default/race/track/ready`.
   `ui/reference/<nombre>.geometry.json` conserva su `runtime.overlayV2Frame`,
   layout, configuración y texto congelados. Traducir identidad, unidades SI,
   calidad y capacidades a `Snapshot`: `fresh` con valor → `{"reliable": valor}`;
   sin valor → `"unavailable"`, nunca cero inventado. Anotar cualquier señal
   sin representación y coordinar su extensión con el propietario de domain/IPC.
   Estas escenas son demostraciones reconstruidas, **no** capturas LMU reales.
5. Medir desde `native/`, con escritorio visible, sin ventanas encima y DPI
   al 100 % (la captura rechaza otro DPI y rectángulos mayores que el monitor):

   ```powershell
   .\ui\compare.ps1 -Widget fuel-strategy -MaxPercent 4
   ```

   Captura siempre con `compare.ps1`: compila y captura bajo un mutex global
   (`Global\VantareParityCapture`), así varios workers en paralelo no solapan
   sus ventanas. No lances la captura del Workshop a mano.
   `compare.ps1` usa por defecto la escena y `ui/reference/<nombre>.png`, imprime
   porcentaje (umbral por canal 8, RGBA premultiplicado, sin máscaras) y guarda
   candidato/diff en `%TEMP%\vantare-parity\<nombre>`. Falla si falta un fichero,
   cambia el tamaño o supera el límite. Acepta `-Scene`, `-Reference`, `-Diff`,
   `-Out`, `-Threshold` y `-MaxPercent`; no genera ni modifica referencias.
   La captura solo está compilada con `parity-capture`; no conecta al núcleo.
6. Formatear el módulo con `rustfmt --edition 2024 ui/src/<widget>/mod.rs`
   (rustfmt no descubre los módulos declarados dentro de una macro). Antes del
   commit: `cargo fmt --check`,
   `cargo clippy --workspace --all-targets -j 4 -- -D warnings` y
   `cargo test --workspace -j 4`; además verificar captura y comparación de su
   widget. Informar el porcentaje real y cualquier límite al orquestador.

**Regresión histórica de Standings (474 × 364).** No confundir con la referencia
de fase 2 (`reference/standings.png`, 440 × 664, 20 filas y otros datos). Para
reproducir 3,6752 % con el Workshop genérico:

```powershell
.\ui\compare.ps1 -Widget standings -Scene ui/fixtures/standings-44.snapshot.json -Reference C:\tmp\vantare-parity-wails\vantare-v2\tools\native-ui\parity\reference\standings-44.png
```

También sigue funcionando `vantare-overlays --parity-capture <png>`. Las escenas
`standings`, `radar` y `pedals` reconstruyen los canales que domain representa
del runtime congelado. El radar aún deriva el solapamiento (a 4 m exactos difiere
del booleano del demo) y no representa `lapped`; estos límites del porte visual
existente no se resuelven en esta infraestructura. La configuración/altura de
Standings de fase 2 tampoco se porta aquí.

Seguimiento de este lote: [GitHub #1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427),
base `c0cd37e7`, rama `vantareapp/isa-1427-f2-infra`. Notion no disponible según
el encargo de Isaac del 2026-09-29; queda pendiente su reconciliación por el
orquestador. Este worker solo entrega commits locales, sin push/PR/promoción.

Validación de infraestructura (2026-09-29): Workshop `standings-44` =
6341/172536 px (3,6752 %) contra Wails y 0 px contra la captura de la ruta antigua
con umbral 0. Capturas de fase 2: radar 220 × 220, 8,2665 %; pedales 120 × 160,
8,5104 % (ambos superan el límite de 4 % y el script sale con 1). Standings de
fase 2 detecta tamaño distinto (474 × 364 frente a 440 × 664, salida 2).
Son límites pendientes de los portes, no gates de paridad aprobados.

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
