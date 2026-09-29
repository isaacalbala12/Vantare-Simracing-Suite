# ui — overlays GPUI

GPUI de Zed (rev `72d28c32`, la del prototipo de paridad ISA-1410) usado
directamente; el crate añade la integración Win32 (`overlay.rs`: transparencia,
click-through, sin foco, sin marco DWM, DPI), el texto Inter con `letter-spacing`
(`text.rs`) y los widgets Standings Eficiencia, radar y pedales.

```powershell
cd vantare-v2/native
cargo run -p vantare-ui --release --bin vantare-overlays -- 4   # 1, 4 o 22 ventanas
```

Sin IPC todavía, el binario se alimenta de `source::local_feed()` (carrera
sintética a 30 Hz). Para conectar el `Subscriber` de `ipc`, pasar su
`flume::Receiver<Arc<Snapshot>>` a `vantare_ui::run` en lugar de `local_feed()`.

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

### Ritmo de pintado

Cómo pinta GPUI en Windows (rev `72d28c32`, leído en `gpui_windows`):

- **Los fotogramas ya van a la frecuencia del monitor.** Aunque el renderer llama a
  `Present(0, 0)`, ningún dibujo nace de ahí: un hilo `VSyncProvider` espera a
  `DwmFlush` e invalida **todas** las ventanas en cada vsync, y cada ventana dibuja
  solo si está sucia. No hay ninguna vía de dibujo fuera de vsync (Windows no
  implementa `schedule_frame`), así que una ventana no puede presentar más veces
  que el refresco (aquí 120 Hz). Lo que sí escala es ese tope **por ventana**: con 22
  ventanas y todo sucio caben 22 × 120 presentaciones por segundo. Por eso no hace
  falta ningún reloj de fotograma propio ni parchear GPUI.
- **Sin cambios, cero fotogramas.** Una ventana sin nada sucio no dibuja ni presenta.
  Lo único que queda es el coste de GPUI de recibir un `WM_PAINT` por ventana en
  cada vsync (ver «quieta» abajo); no se puede quitar sin parchear GPUI.
- **Qué depende de este crate**: (1) el repintado por datos, ya limitado a cambios de
  ViewModel; (2) las animaciones de Standings. `Motion::wake` distingue ahora lo que
  se mueve de verdad (un fotograma por vsync) de un aviso ya quieto que solo
  caduca (un despertar puntual con un temporizador, sin fotogramas) y de nada (cero).
  Antes se pedía un fotograma por vsync durante los 1200 ms de vida de cada aviso,
  aunque tras 500 ms no cambiara nada.

**Fuentes de prueba** (`VANTARE_FUENTE`, por defecto `realista`; todas a 30 Hz):

| Valor | Qué cambia |
| --- | --- |
| `realista` | Como una carrera real: reloj cada segundo; gaps, vueltas y mejores vueltas de cada coche una vez por vuelta (escalonados); unos 4 adelantamientos por minuto entre los 10 primeros; un coche en boxes 20 s cada 5 minutos. Radar y pedales cambian siempre (telemetría del jugador). |
| `estres` | La anterior: todo cambia en cada instantánea. Sobrestima. |
| `quieta` | La escena `standings-44` con la secuencia avanzando: ningún ViewModel cambia. |

**Medición** (`measure.ps1`, build release con `paint-stats`, 10 s tras 6 s de
calentamiento, esta máquina a 120 Hz, una pasada; medias de las últimas 10 líneas).
«Antes» es el ritmo previo (un fotograma por vsync durante toda la vida de un aviso);
«después» es `Motion::wake`. Fotogramas = dibujos de ventana por segundo sumando
todas; `render` = `render` de Standings por segundo sumando todos.

| Fuente | Widgets | Modo | Fotogramas/s antes → después | `render` Standings antes → después | CPU % de un núcleo antes → después | GPU 3D del proceso antes → después |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| realista | 4 | `por-widget` | 68 → 68 | 7 → 7 | 4,8 → 4,2 | 0,2 → 0,3 |
| realista | 4 | `una` | 36 → 32 | 19 → 7 | 6,4 → 4,9 | 0,4 → 0,4 |
| realista | 22 | `por-widget` | 499 → 441 | 79 → 20 | 22,2 → 19,3 | 1,7 → 1,7 |
| realista | 22 | `una` | 37 → 33 | 80 → 28 | 20,2 → 19,2 | 1,5 → 1,5 |
| estrés | 4 | `por-widget` | 300 → 268 | 240 → 206 | 24,1 → 17,2 | 2,0 → 1,8 |
| estrés | 4 | `una` | 120 → 101 | 240 → 202 | 21,0 → 19,0 | 1,3 → 1,2 |
| estrés | 22 | `por-widget` | 1357 → 1187 | 934 → 767 | 86,3 → 75,2 | 8,3 → 7,5 |
| estrés | 22 | `una` | 117 → 103 | 935 → 814 | 97,4 → 70,6 | 5,2 → 4,7 |
| quieta | 4 | `por-widget` | 0 → 0 | 0 → 0 | 1,5 → 1,1 | 0 → 0 |
| quieta | 4 | `una` | 0 → 0 | 0 → 0 | 0,9 → 1,0 | 0 → 0 |
| quieta | 22 | `por-widget` | 0 → 0 | 0 → 0 | 6,7 → 5,6 | 0 → 0 |
| quieta | 22 | `una` | 0 → 0 | 0 → 0 | 2,2 → 2,9 | 0 → 0 |

Lectura:

- Con datos realistas 4 widgets cuestan ~4-5 % de un núcleo y 22 widgets ~19 %
  (antes de este cambio, 20-22 %), frente al 75-97 % de la fuente de estrés: la
  fuente anterior sobrestimaba unas 4 veces. Radar y pedales, que cambian con la
  telemetría, son ya casi todo el coste.
- `render` de Standings con 22 widgets baja de 79 a 20 por segundo (`por-widget`)
  y de 80 a 28 (`una`): son las animaciones. Ninguna ventana supera los 120
  fotogramas por segundo del monitor (con `estres` y 4 widgets, cada Standings
  ronda 100).
- Sin datos ni animación: 0 fotogramas en los cuatro casos. El 1-7 % de CPU que
  queda es la espera de `WM_PAINT` por ventana en cada vsync (más en `por-widget`:
  22 ventanas × 120 Hz); `una` la reduce a la de una ventana.
- `una` presenta ~13 veces menos fotogramas con 22 widgets (33 frente a 441 con
  la fuente realista) sin más CPU; la GPU del proceso es parecida porque cada
  ventana pequeña cuesta poco. El coste de DWM al componer cada modo no entra en
  estas cifras.
- Tope opcional: limitar las animaciones a 60 Hz en monitores de 120 Hz o más
  reduciría a la mitad los fotogramas de animación (de ~100 por Standings con
  `estres`), pero exige conocer el refresco (GPUI no lo expone; habría que leerlo
  de DWM) o un temporizador propio que en monitores de 60 Hz desincroniza con el
  vsync. No está implementado: ¿lo queréis?

### Posición exacta de las ventanas

GPUI deja el área cliente de una ventana 4 px por encima de lo pedido (en Y); las
ventanas de `por-widget` salían en y=16 en vez de 20 y la de `una` en y=−4 (sus
4 px inferiores sin cubrir). `overlay::apply` ya no lee la posición que dejó GPUI:
recibe la esquina pedida (px físicos) y la fija con `SetWindowPos`.
`check-windows.ps1` lo comprueba con `EnumWindows`/`GetWindowRect` en los dos modos
(4 widgets, 100 % de DPI, monitor principal): cada ventana debe coincidir con su
posición y tamaño exactos.

```powershell
cd vantare-v2/native; cargo build -p vantare-ui
.\ui\check-windows.ps1     # exit 0 = todo en su sitio
```
