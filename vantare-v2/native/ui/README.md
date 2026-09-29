# ui — overlays GPUI

GPUI de Zed (rev `72d28c32`, la del prototipo de paridad ISA-1410) usado
directamente; el crate añade la integración Win32 (`overlay.rs`: transparencia,
click-through, sin foco, sin marco DWM, DPI), el texto Inter con `letter-spacing`
(`text.rs`) y los widgets Standings Eficiencia, radar y pedales.

```powershell
cd vantare-v2/native
cargo run -p vantare-ui --release --bin vantare-overlays -- 4   # 1, 4 o 22 ventanas; datos del núcleo (pipe)
cargo run -p vantare-ui --release --bin vantare-overlays -- 4 --fuente local   # sin núcleo
```

El binario recibe los datos con `--fuente local|pipe[:<nombre>]`:

- `pipe` (por defecto): `source::pipe_feed` conecta un `ipc::Subscriber` al
  named pipe del núcleo (`vantare-core`; sin nombre, el mismo por defecto, con
  el SID del usuario), reconecta solo y reenvía la foto más reciente a
  `vantare_ui::run`. Los widgets no saben de dónde viene.
- `local`: `source::local_feed()`, carrera sintética a 30 Hz, sin núcleo.

Cada ventana proyecta la instantánea con el `ViewModel` de `domain` y solo
repinta cuando ese ViewModel cambia (Standings: solo lo que se dibuja; mientras
haya animación pide fotogramas).

## Paridad visual

`parity.ps1 -Parity <tools/native-ui/parity>` captura la escena `standings-44`
con la feature `parity-capture` (dos pasadas GDI negro/blanco) y la compara con
`reference/standings-44.png` con `diff.py`. Resultado en esta fase: 3,68 %
(6341 / 172536 px, umbral 8), igual que el prototipo; la diferencia es la
rasterización del texto de DirectWrite frente a Chrome. La referencia y
`diff.py` viven en la rama del ensayo ISA-1410, no en esta.

## Agrupación de ventanas (fase 0)

```powershell
vantare-overlays 4 --ventanas por-widget   # una ventana por widget (por defecto)
vantare-overlays 4 --ventanas una          # una ventana del tamaño del monitor por monitor
```

Los widgets, sus posiciones (globales, `origin_of` en `app.rs`) y la fuente de
datos son los mismos; solo cambia el agrupamiento. En `una` cada monitor con
widgets recibe una ventana transparente, click-through y sin foco del tamaño del
monitor (`apply` de `overlay.rs`, igual que en `por-widget`), con sus widgets
colocados en posición absoluta dentro. Los widgets (`Overlay`) no saben en qué
ventana están: pintan en coordenadas propias y `text::with_origin` los coloca.

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
  cambia los pedales, 30 Hz). Por segundo, sumando ventanas:

| Modo | fotogramas de ventana | `render` standings / radar / pedales | pintados standings / radar / pedales |
| --- | ---: | --- | --- |
| `por-widget` | 30 (solo la ventana de pedales) | 0 / 0 / 30 | 0 / 0 / 30 |
| `una`, vistas cacheadas | 30 | 0 / 0 / 30 | 0 / 0 / 30 |
| `una`, sin cachear (referencia) | 30 | 60 / 30 / 30 | 60 / 30 / 30 |

  Con la carrera sintética completa (todo cambia a la vez) los pintados son los
  mismos en ambos modos; lo que cambia es el número de fotogramas de ventana (ver
  abajo).

- **Medido en release** (`--release --features paint-stats`, 10 s tras 6 s de
  calentamiento, esta máquina, carrera sintética completa a 30 Hz; una sola
  pasada, sin DWM en el GPU): la CPU es la misma, la diferencia está en los
  fotogramas y en la GPU 3D del proceso.

| Widgets | Modo | CPU (% de un núcleo) | GPU 3D del proceso | fotogramas de ventana/s | RAM |
| ---: | --- | ---: | ---: | ---: | ---: |
| 4 | `por-widget` | 19,5 | 2,0 % | 300 | 124 MB |
| 4 | `una` | 20,5 | 1,3 % | 120 | 71 MB |
| 22 | `por-widget` | 89,1 | 8,1 % | 1345 | 87 MB |
| 22 | `una` | 89,3 | 5,4 % | 117 | 81 MB |

  `render` y pintados por widget son idénticos en los dos modos (Standings domina:
  ~120 pintados/s cada uno por sus animaciones). `por-widget` presenta cada ventana
  pequeña por separado (1345 presentaciones/s con 22); `una` presenta una sola
  ventana grande unas 120 veces/s. El coste de DWM al componer esas superficies no
  entra en la GPU del proceso y hay que medirlo aparte (`dwm.exe`).
