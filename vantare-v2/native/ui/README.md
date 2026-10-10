# ui — overlays GPUI

Los ejemplos Cargo muestran el comando interior: ejecutarlo siempre por la
cola de `AGENTS.md` (en esta ola, `C:/tmp/fase2/compilar.ps1`; normalmente,
`native/scripts/compilar.ps1`). Usar target aislado y `-j 2`.

GPUI de Zed (rev `72d28c32`, la del prototipo de paridad ISA-1410) usado
directamente; el crate añade la integración Win32 (`overlay.rs`: transparencia,
click-through, sin foco, sin marco DWM, DPI), el texto Inter con `letter-spacing`
(`text.rs`) y los 18 widgets del registro (Standings, Relative, Delta, Fuel, radar,
pedales, mapas, flags y otros). Hub vive en el crate `hub`, no en `ui`.

```powershell
cd vantare-v2/native
cargo run -p vantare-ui --release --bin vantare-overlays -- 4   # 1, 4 o 22 widgets; datos del núcleo (pipe)
cargo run -p vantare-ui --release --bin vantare-overlays -- 4 --fuente local   # sin núcleo
```

El binario recibe los datos con `--fuente local|pipe[:<nombre>]`:

- `pipe` (por defecto): `source::pipe_feed_observed` conecta un `ipc::Subscriber` al
  named pipe del núcleo (`vantare-core`; sin nombre, el mismo por defecto, con
  el SID del usuario), reconecta solo y reenvía la foto más reciente a
  `vantare_ui::run_with_connection` (layout usa `layout_feed`). El host
  muestra una sola vez el aviso de incompatibilidad, estable entre reintentos;
  los widgets reciben datos degradados y no conocen el transporte.
- `local`: `source::local_feed()`, carrera sintética a 30 Hz, sin núcleo.

## Kit Eficiencia (ISA-1427)

`vantare_ui::efficiency` reúne las primitivas visuales compartidas que consumen los 18 renderers del registro. Conserva Inter estática, kerning, cifras tabulares y tracking en em convertido a px; los rectángulos se ajustan a píxel después de sumar el origen del widget. GPUI se usa directamente, sin renderer alternativo ni dependencias nuevas.

Los elementos propios de Standings siguen en `standings/`. Pedales conserva su fondo al 90 % y Standings al 87 % con su degradado y sombra; radar conserva el lienzo transparente. Este refactor no amplía sus diseños.

## Kit Vantare y Looks (#1497)

`src/vantare/{style,paint,motion,columns}.rs` y `styles/vantare.json` contienen
el kit compartido Vantare. Standings, Relative, Delta y Fuel ofrecen
`DesignSystem` Eficiencia/Vantare. Workshop recarga el estilo sin otro renderer.
El seam de una proyección y un estado por widget con N Looks está **en curso,
#1531**; esta base todavía mantiene dos vías. No duplicar proyecciones al portar.
`registry.rs` aún adapta manualmente `frame_with_motion(prefs, reduced)` y la
cadencia de widgets con movimiento; justificar cambios en ese seam, no extenderlo
silenciosamente. La política de movimiento la decide el host.

## Preview de Studio (ISA-1430)

`Overlay::set_preview_scale` acepta un factor finito y positivo. Studio aplica
el mismo factor a las posiciones del documento, los marcos y el renderer;
`wanted_size` sigue devolviendo el tamaño lógico. El kit transforma quads,
rutas, máscaras, imágenes, SVG, sombras y texto alrededor del origen del widget,
sin cambiar el DPI de GPUI ni crear otro renderer. Las ventanas de overlay y
OBS conservan el factor 1 y su camino de pintado. Al añadir una primitiva nueva,
comprobar también su transformación en `efficiency/preview.rs`.

## Paridad visual

La regresión histórica de Standings (escena `standings-44`, 474 × 364) se retiró
al fijar la referencia de fase 2; su resultado era este: `parity.ps1` capturaba la escena `standings-44`
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
2. Crear `native/ui/src/<widget>/mod.rs`, reutilizando el kit elegido (`efficiency`/`vantare`) y el renderer
   productivo. Copiar el contrato concreto de `radar.rs` o `pedals.rs`: struct
   `pub(crate) Widget` con estos métodos `pub(crate)` (sin trait):

   | Método | Devuelve / responsabilidad |
   | --- | --- |
   | `new(settings: &Settings, prefs: Preferences)` | `Self`, estado inicial sin datos |
   | `size(&self)` | `(f32, f32)`, rectángulo completo con sombras/rail |
   | `ingest(&mut self, snapshot: &Snapshot, prefs: Preferences)` | `bool`, cambia solo si el dibujo cambió |
   | `frame(&mut self, prefs: Preferences)` (o seam actual `frame_with_motion`) | `(crate::app::Paint, crate::app::Wake)`, escena propia clonada en la closure de pintado |
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
   `ipc::snapshot_from_json` (DTO v9, `version: 9`); partir de una de las escenas
   versionadas. Reproducir **los datos de ese widget** de
   `tools/widget-reference/scene.tsx`: Workshop `default/race/track/ready`.
   `ui/reference/<nombre>.geometry.json` conserva su `runtime.overlayV2Frame`,
   layout, configuración y texto congelados. Traducir identidad, unidades SI,
   calidad y capacidades a `Snapshot`: `fresh` con valor → `{"reliable": valor}`;
   sin valor → `"unavailable"`, nunca cero inventado. Anotar cualquier señal
   sin representación y coordinar su extensión con el propietario de domain/IPC.
   Estas escenas son demostraciones reconstruidas, **no** capturas LMU reales.
   Para animaciones, `.scene.json` añade `label`, `frameMs` (50–60000),
   `watchFor` y `frames: [{caption, snapshot}]`; cada snapshot usa DTO v9.
   El cargador guardado permite v7/v8/v9; el pipe live nunca migra fixtures.
   Preferencias y geometría viven en el documento de layout, fuera del ViewModel.
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
   commit: fmt, Clippy -D warnings, Nextest y lifecycle por la cola de
   `../AGENTS.md`; añadir telemetria al tocar domain/IPC/runtime/testdata.
   Además verificar captura y comparación de su
   widget. Informar el porcentaje real y cualquier límite al orquestador.

**Standings de fase 2 (#1427).** El modo predeterminado reproduce Signature:
440 × 664, capacidad de 20 filas, clase del jugador, posiciones globales,
última vuelta y sin rail PIT. La escena `fixtures/standings.snapshot.json`
conserva los 20 coches de `reference/standings.geometry.json`; el filtro muestra
los siete Hypercar, dejando libre la altura reservada por el documento Wails.
Los gaps usan las señales de clase existentes, incluidos los guiones cuando
faltan datos y la diferencia de una vuelta. El pie conserva Sebring y ≈79.

```powershell
# Desde native/:
$cargoExe = (Get-Command cargo.exe).Source
# Limitar también el -j 4 interno del comparador compartido.
function cargo {
    $limited = @($args)
    for ($i = 0; $i -lt $limited.Count - 1; $i++) {
        if ($limited[$i] -eq '-j') { $limited[$i + 1] = '2' }
    }
    & $cargoExe @limited
}
.\ui\compare.ps1 -Widget standings -MaxPercent 4
```

Signature de fase 2 es la única configuración de Standings (ver `Settings::config`).
No se toca ningún `model.rs`, el kit Eficiencia, IPC, runtime ni otros widgets.
No se añaden dependencias ni señales al modelo común.

Validación de Standings (2026-09-30): fase 2 = 10705/292160 px (3,6641 %),
histórica = 6341/172536 px (3,6752 %); ambas PASS con umbral por canal 8 y
límite 4 %, sin máscaras. Capturas en `C:/tmp/vw2-standings2-evidence/`,
subdirectorios `phase2` y `legacy`, con hashes en `parity.json`. Gates PASS:
`cargo fmt --check`, `cargo clippy --workspace --all-targets -j 2 -- -D warnings`
y `cargo test --workspace -j 2` (400 pruebas del harness, 0 fallos, 4 omitidas
porque requieren LMU/ACC live; también pasan las pruebas de procesos). Salida
de tests en `C:/tmp/vw2-standings2-evidence/tests.log`. El primer build usó
artefactos de domain obsoletos; tras recompilarlo pasó la captura sin tocar otros módulos.
El comparador compartido invoca Cargo con `-j 4`; para respetar el límite del
encargo se ejecuta con un wrapper local de `cargo` que sustituye ese argumento
por `-j 2`, sin cambiar el script compartido. Las capturas se serializan mediante
su mutex global. Los PNG y logs quedan fuera del árbol de código.

Límites: preferencias de presentación por proceso, aún sin editor de configuración
nativo por instancia; `Vm::from_domain` conserva el cálculo histórico de posiciones
de clase por orden y la lectura de números desde texto para las animaciones.
La paridad de estas fotos no demuestra telemetría live, OBS, DPI mixto ni estados
en movimiento. Estos aspectos requieren la revisión y pruebas del orquestador.
Notion no está disponible según el encargo: reconciliación pendiente por el
orquestador. Entrega local en `vantareapp/isa-1427-w-standings2`, base `13dc3b22`,
sin push, PR, CI remoto, integración ni promoción.

Registro de infraestructura previo (2026-09-29): las escenas
`standings`, `radar` y `pedals` reconstruyen los canales que domain representa
del runtime congelado. El radar aún deriva el solapamiento (a 4 m exactos difiere
del booleano del demo) y no representa `lapped`; estos límites del porte visual
existente no se resuelven en esta infraestructura. El tamaño de Standings de
fase 2 se corrige en la entrega anterior del 2026-09-30; los valores de este
registro corresponden a la base de infraestructura.

Seguimiento de este lote: [GitHub #1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427),
base `c0cd37e7`, rama `vantareapp/isa-1427-f2-infra`. Notion no disponible según
el encargo de Isaac del 2026-09-29; queda pendiente su reconciliación por el
orquestador. Este worker solo entrega commits locales, sin push/PR/promoción.

Validación de infraestructura (2026-09-29): Workshop `standings-44` =
6341/172536 px (3,6752 %) contra Wails y 0 px contra la captura de la ruta antigua
con umbral 0. Capturas de fase 2: radar 220 × 220, 8,2665 %; pedales 120 × 160,
8,5104 % (ambos superan el límite de 4 % y el script sale con 1). Standings de
fase 2 detecta tamaño distinto (474 × 364 frente a 440 × 664, salida 2).
Eran límites pendientes de los portes, no gates de paridad aprobados en esa base.

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

```powershell
cd vantare-v2/native
.\ui\dev.ps1 -Widget pedals -Escena ui/fixtures/pedals.snapshot.json
# Solo JSON, sin recompilar Rust:
cargo run -p vantare-ui --bin vantare-workshop -j 2 -- --dev --widget radar
```

`--dev` abre una ventana GPUI interactiva sobre el `Overlay` productivo: los
botones recorren `Kind::ALL` (registro `widgets!`) y `fixtures/*.snapshot.json`;
una escena externa indicada por CLI también entra en la lista. El estado vive
en el DTO JSON, incluidas calidad y capacidades; no hay generador paralelo.
Tab/Shift+Tab cambia el foco, Enter/Espacio activa el botón.
Guardar la escena recarga cada 50 ms; un JSON inválido muestra el error y
mantiene la última foto válida. La escena inicial debe ser válida. Sin `--escena`
se usa la del widget si existe, o `lmu47`. `--captura` conserva su ruta y geometría;
no admite combinarse con `--dev`.

`dev.ps1` (PowerShell 7) vigila **domain/src y ui/src**, compila con `-j 2` y
relanza una copia del binario conservando las selecciones hechas en la ventana.
Errores de compilación o arranque mantienen la ventana anterior; Ctrl+C termina
la sesión. Detecta guardados durante la compilación, borrados y renombrados.
No modifica perfiles ni flags Cargo. Imprime guardar → compilado y → ventana
visible; visibilidad de ventana no demuestra presentación de un píxel. No
vigila assets/Cargo.toml ni descubre escenas nuevas hasta relanzar. Este flujo
es para desarrollo; no demuestra telemetría real ni paridad de los portes.

**Medición de este worker (2026-09-30, #1427):** guardar → píxel de Standings
20,18 / 30,92 / 30,84 s (mediana 30,84 s), caché caliente, dev con depuración,
`-j 2` y otros workers compilando. Cambio temporal Es/En de `Preferences` en
`workshop.rs`, sin editar el widget: se observó el píxel (177,175) de su cabecera
en el escritorio compuesto, con la ventana de prueba visible bajo el mutex de
capturas. Es latencia observada con sondeo de 10 ms, no presupuesto reproducible.
Evidencia local en `%TEMP%\vantare-workshop-dev-evidence`: `bench3.py`,
`pixel-times.txt`, `dev.log`, `qa.py`, `qa.log` y PNG.
Propuesta sin aplicar: medir `debug=0` en una tanda aislada con el mismo cambio y
`-j 2`; el histórico inferior muestra ahorro, pero no cuantifica este equipo
bajo la carga actual. No se cambió ningún perfil, flag ni dependencia.
Gates finales: fmt/clippy/workspace tests PASS (`-j 2`, cuatro pruebas live
omitidas); CLI con `parity-capture` 4/4 y pedales 755/19200 px (3,9323 %).

### Workshop en vivo (#1467)

1. Mac: desde `native/`, ejecuta `bash ui/workshop-en-vivo.sh`.
2. Windows: desde `native/`, ejecuta `./ui/workshop-en-vivo.ps1`.
3. Edita `ui/styles/standings.json`: colores, tamaños, espaciados, radios, sombras o fuentes.
4. Guarda: lo ves al momento en Standings, sin recompilar ni reiniciar Workshop.
5. Para volver al diseño original, restaura el JSON con Git y guarda.

`fonts.family: null` conserva Inter registrada (pesos 400/500/600/650/700/750/800).
Una familia instalada, por ejemplo `"Segoe UI"`, se selecciona por nombre.
El archivo es completo y tipado: errores de nombre, campos ausentes o valores
fuera de rango aparecen en Workshop; conserva el último estilo válido hasta
la siguiente escritura válida. `VANTARE_WORKSHOP_STYLES` permite otro directorio
con `standings.json` (también al ejecutar una copia del binario).

Producto y capturas de paridad usan los valores compilados al construir desde
ese mismo JSON; nunca leen el fichero de estilo en disco. Las otras familias
siguen con sus valores actuales. Cambios de estructura Rust siguen necesitando
compilar mediante `dev.ps1`; este cambio solo recarga valores visuales.

**Verificación Windows (2026-10-05).** Capturas compiladas del renderer:
0/292160 px distintos frente a `a464e9fc` (umbral 0); Wails 2,5133 % (umbral 8),
igual que la base. Guardar → píxel del escritorio: 10/10 tandas <200 ms,
mediana 53,79 ms, máximo 62,36 ms; `GetPixel`, sondeo de 2 ms, perfil `prueba`,
mismo PID y binario durante todos los guardados. Escena fija de Workshop,
sin medir CPU/RAM ni telemetría LMU. Capturas limpias y JSON inválido revisados:
el último estilo válido se conserva. Evidencia fuera del repo en
`C:/tmp/1467-evidence/`. Por SSH, los logs «ventana abierta» y «estilo aplicado»
permiten comprobar el arranque y las recargas; no certifican píxeles en el Mac.

**Verificación Mac (2026-10-05, Darwin arm64).** El script compiló en 3,09 s
(incremental; primer build 7m12s), abrió la ventana GPUI y aceptó tres cargas
de estilo en el mismo proceso sobre `ae6ccb70`. Guardar → log: 110,50 ms;
JSON original restaurado al terminar. La revisión visual en su pantalla queda
para Isaac. Build PASS con aviso heredado por `LiveScreens::toggle` sin uso;
los gates completos se ejecutaron en Windows.

### Workshop con recarga en el Mac (#1497)

Desde `native/`: `bash ui/workshop-dev.sh --widget standings --escena ui/fixtures/standings-vantare-carrera.scene.json`.
Estilos y escenas se recargan dentro del proceso. Al guardar Rust en `ui/src` o
`domain/src` recompila con `-j 2` y sustituye la ventana: la nueva se abre antes
de cerrar la vieja y recupera escena, fase y ajustes guardados; si no compila,
sigue la anterior. Workshop se abre ocupando el monitor principal sin
robar el foco; con Stage Manager queda en la tira hasta elegirlo. Si estaba a la
vista, la recarga lo mantiene a la vista y devuelve el foco a la app activa.
`VANTARE_WORKSHOP_ACTIVATE=1` lo trae al frente (capturas de evidencia).

## Standings Vantare (#1497)

Sistema de diseño principal (`designSystem: "vantare"`, por defecto); Eficiencia
sigue disponible con `"eficiencia"`. Contrato visual: catálogo
`vantare-widgets-r10b.html`. En modo estándar muestra la clase del jugador (o la del líder sin
jugador) o, con `classificationMode`/`classScope`, todas las clases o
multiclase con franjas. Usa `columns` y `rowCount` de Settings: columnas
elegibles (±, dorsal, coche, compuesto, paradas/BOX, sectores, última, mejor,
intervalo, gap) en el orden del catálogo y ancho calculado desde las activas.
`vantare_template` da las plantillas compacto 340, estándar 520 (el del
Studio) y ampliado 900. Estilos Neo y Neutro (fondos en gris, sin subtono rojo) y cuatro acentos.
Marca Vantare (#1504) en la cabecera de Standings y Relative solo si el host
envía `brandVisible: true` (lo decide la licencia); sin decisión no se pinta.
El Workshop la activa por defecto y tiene el interruptor «Marca».
Valores visuales y duraciones de animación en `styles/vantare.json`, el estilo
único del sistema (compilado en producto, en vivo en Workshop). El kit común
vive en `ui/src/vantare/`: estilo, primitivas de pintado, movimiento y edición
del orden de columnas; cada widget conserva su ViewModel y su layout. Animaciones: deslizamiento al
cambiar de posición, fundido de filas nuevas y destellos al ganar o perder
puestos, vuelta rápida de clase y entrada en boxes; sin cambios, `Wake::Idle`.
Escenas: `standings-vantare.scene.json` (estados del catálogo) y
`standings-vantare-carrera.scene.json` (secuencia animada). Son datos de
demostración del catálogo, no telemetría real; las señales que el modelo no
publica (salida de boxes, vuelta de la vuelta rápida, zona lenta) no se pintan.
La captura de paridad de Windows sigue usando Eficiencia.

## Relative Vantare (#1497)

Mismo sistema y kit que Standings, sistema por defecto (`designSystem`); Eficiencia
sigue disponible. Proyección pura en `domain::relative_vantare`: la ventana en
pista de Relative con gap firmado como el catálogo (delante negativo), nivel del
piloto, Safety Rating, tendencia del gap por vuelta y si conviene, tira de ±10 s,
aviso de tráfico de una clase más rápida a menos de 6 s y estimación de salida
de boxes (`Player::pit_loss_s`). Columnas en `columns` (posición en clase,
dorsal, piloto, vueltas de diferencia, nivel, SR, tendencia y gap; el punto de
clase es fijo, el coche y la tira de pista son complementos), con
`relative::vantare_template` (compacto ±2 280, estándar ±3 420, ampliado ±4 600),
arrastre y ◀ ▶ en Workshop. Animaciones: filas que se deslizan, destello verde al
adelantar y rojo al ser adelantado, pulso del tráfico rápido y puntos de la tira
en movimiento. Escenas `relative-vantare.scene.json` y
`relative-vantare-carrera.scene.json` con los datos del catálogo (no telemetría).
La tendencia la deriva el núcleo al cruzar meta mientras LMU no la publique;
LMU no ofrece nivel ni SR en local (ADR-0001) y la pérdida en boxes espera a su
REST: en pista real salen «—» u omitidos.

## Fuel y stint Vantare (#1497)

Mismo sistema y kit, sistema por defecto (`designSystem`); Eficiencia sigue
disponible. Proyección pura en `domain::fuel_vantare`: combustible y, si la
fuente la publica, energía virtual (`Fuel::energy`, `energy_per_lap`); el recurso
que se acaba antes decide las vueltas que quedan y la vuelta de parada (por
debajo de 1.5 vueltas, «esta vuelta»; si llega a meta, «sobran»). Además: ventana
de parada sobre el total de vueltas, litros y paradas para terminar, ahorro en
FCY (`Fuel::lap_projection_l`), repostaje en curso (`Player::pit_service`) y stint
(`Player::stint`). Tamaños en `size`: compacto 230, estándar 300 (el del Studio) y
ampliado 460 con medidores, mosaico, gráfica de consumo y ventana. Avisos de
combustible bajo (franja y borde que late), boxes, FCY, amarilla y última vuelta.
Las barras se deslizan al cambiar de vuelta. Escenas `fuel-vantare.scene.json` y
`fuel-vantare-carrera.scene.json` con los datos del catálogo (no telemetría). Mientras
LMU no los lea el adaptador (debería darlos), el núcleo deriva el stint (desde
la salida de boxes o el inicio de la sesión), el consumo previsto de la vuelta y
los litros cargados en la parada. La energía virtual y el objetivo del
repostaje esperan a leerse de la REST de LMU: hasta entonces se omiten.

## Delta Vantare (#1497)

Mismo sistema y kit, sistema por defecto (`designSystem`); Eficiencia sigue
disponible. Proyección pura en `domain::delta_vantare`: el delta lo resuelve el
núcleo para cada referencia (`reference`: mejor vuelta `delta_best_s`, vuelta
óptima `Player::delta_optimal_s` y líder de la clase `Player::delta_leader_s`);
no se reconstruye en la proyección. Añade el tiempo de la referencia, la vuelta
predicha (la nativa con la mejor vuelta), los estados en pausa (boxes, vuelta de
salida, FCY), vuelta invalidada (`Player::lap_invalid`), sin referencia, y los
sectores de la vuelta en curso (morado mejor de la sesión, verde mejor propio,
amarillo más lento; el sector en curso se rellena). Formatos en `size`: píldora
(la del Studio), barra 380 y ampliado 520 con selector de referencia y sectores.
La barra de ±1 s se desliza hacia el valor nuevo y la vuelta récord personal
destella en morado. Escenas `delta-vantare.scene.json` y
`delta-vantare-carrera.scene.json` con los datos del catálogo (no telemetría).
LMU publica los mejores sectores (S1 y S2 de la sesión, S3 de la mejor vuelta),
los sectores de la vuelta en curso y si la vuelta cuenta (`mCountLapFlag`); con
ellos el núcleo deriva los deltas frente a óptima y líder escalando la
referencia de la mejor vuelta propia (exactos en meta, `Estimated`).

### Harness anterior y mediciones históricas

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

## Panel del Workshop (#1467, ronda 2)

El Workshop GPUI usa un panel lateral de 248 px y un escenario centrado,
con selección de widget, idioma es/en, sesión, Settings del widget, módulos,
nombre, pie, fuente, ubicación, fondo, escala, dimensiones y comparación.
Las superficies comparten el renderer productivo; no simulan transportes OBS
o Desktop. Las escenas con varias fases tienen anterior/siguiente, pausa,
bucle y deslizador; cambiar de fase reconstruye el estado desde el principio.
Guardar `styles/standings.json` sigue recargando el estilo en el mismo proceso.

`fixtures/*.scene.json` son 43 demostraciones exportadas del Workshop React,
no telemetría real. `workshop-sources.json` registra procedencia y límites.
El exportador React se retiró en #1533. Las escenas y su procedencia siguen
congeladas; el Workshop nativo usa estos documentos. La herramienta Python de
importación conserva su utilidad para JSON archivado, sin un frontend levantado.

Se conservan señales ausentes como ausentes. Los contratos nativos no tienen
equivalente para `dents`, ciertos históricos React o los estilos V1/Foco;
la importación no afirma paridad completa de esos estados. La selección
widget/archivo se conserva con el script en vivo; los controles del panel
se restablecen al reiniciar el binario. La comparación visual de la ronda
queda en `C:/tmp/1467b-evidence/`.

## Layout nativo (#1427 → #1430)

Sin un número de campaña, `vantare-overlays` vigila `%LOCALAPPDATA%\Vantare\native\layout.json`; `--layout <ruta>` permite probar `ui/fixtures/layout.json` (con `--fuente local` solo para QA sintética). Sondeo cada 500 ms, último JSON válido ante errores; ID, posición global, visibilidad, opacidad y `settings.kind` en kebab-case, resto camelCase. Las instancias ocultas conservan el HWND del monitor; eliminar todas las instancias tampoco termina el proceso. El orden del vector es el orden de pintado. Sin escala ni importación V4.

`layout::Document::{open,save,poll}` limita la lectura a 1 MiB, normaliza entradas y compara bytes del último documento leído. `save` usa bloqueo cooperativo liberado al cerrar el fichero, temporal local con `write_all`/`sync_all`, copia `.bak` y `rename` sin borrar antes. Un conflicto requiere releer. `LiveScreens` conserva cada widget por ID mientras sus Settings sigan iguales, al moverlo, cambiar opacidad, ocultarlo o cambiar de monitor. Oculto conserva estado sin ingerir fotos; al volver visible recibe la última foto solo si su demanda está cubierta. Las preferencias reproyectan esa foto sin recrear la entidad; nuevos IDs o cambios de tipo/Settings crean otra. Borrar libera la entidad y su temporizador. Las ventanas se reutilizan por monitor ocupado.

Los Settings de todos los widgets están junto a su renderer; el registro genera `Settings::{kind,default_for,normalized}`. Las variantes implementadas incluyen Delta capsule, transparencia de pedales, carrusel, volante específico, color de banderas, target behind y Standings broadcast, marca y métricas del pie. El host solo avisa de las claves legacy `headerFirst/headerSecond`, que persiste pero no usa en la cabecera; los límites de cada Settings se presentan en el inspector del Hub mediante `UNSUPPORTED`. Evidencia de paridad y QA: [layout-evidence.md](layout-evidence.md).

## #1562 · Ocultar fuera de pista

`Layout.hideOffTrack` (false) y `Instance.offTrack` (inherit/always_visible/hide)
controlan LiveScreens. Los valores por defecto se omiten al guardar; documentos
v1 anteriores siguen legibles. Un binario anterior puede rechazar un documento
con los nuevos campos activados: conservar su copia .bak.
El host aplica la situación central incluso antes de la cadencia del widget,
sin borrar entidades ni cerrar ventanas. Studio/Workshop nunca la activan;
la demanda y la licencia no cambian. Ver [contrato](../runtime/README.md).
