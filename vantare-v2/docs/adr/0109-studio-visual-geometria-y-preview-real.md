# ADR 0109 — Studio visual en los Hubs nuevos: geometría en el anfitrión y preview del widget real

Fecha: 2026-11-14. Issue: [#1995](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1995) (VANTA-138).
Enmendaría el punto 4 de [ADR 0107](0107-hub-electron-nucleo-y-overlays-rust.md) si Isaac lo acepta. Se apoya en [ADR 0099](0099-arquitectura-rust-nativa.md) y [ADR 0108](0108-hub-rune-via-paralela.md).

## Estado

**Propuesta (borrador).** No autoriza código, dependencias, releases ni cambios
de canal. Solo documentación: no se ha compilado ni ejecutado nada. Queda
aceptada cuando Isaac resuelva la decisión abierta del final y se fusione su PR.

## Palabras que se usan aquí

- **Anfitrión**: `native/hub-host`, el proceso Rust con el que hablan el Hub de
  Electron y el Hub de Rune por un canal privado. Es el dueño de los documentos.
- **Diseño**: el archivo `layout.json`, con la lista de widgets, su posición,
  su tamaño y sus ajustes.
- **Revisión**: la huella (hash) del contenido del diseño. Una escritura solo
  entra si parte de la revisión actual; si no, el anfitrión responde «conflicto».
- **Pintor**: el código que dibuja un widget. Hoy hay uno solo: `native/ui`
  (GPUI), el mismo que usa `vantare-overlays.exe` en pista.
- **Lienzo**: el plano a escala del monitor donde se colocan los widgets.

## Contexto

La auditoría `D:\VantareServer\evidence\hub-web\paridad-restante\TABLA.md`
deja cinco huecos visuales frente al Hub GPUI congelado: D015 (preview viva en
Inicio), D023 (lienzo), D024 (preview del widget real, escenas y ejemplos),
D025 (arrastrar desde el catálogo) y D092 (preview de widgets en Onboarding).

Hechos comprobados en `origin/nightly` (`a129a89ca`):

1. **El anfitrión no puede dibujar widgets.** No depende de `vantare-ui` ni de
   GPUI y un test de su árbol de dependencias lo vigila. Hoy conoce solo el
   tamaño por defecto de cada tipo (`hub-host/data/widget-defaults.json`).
2. **El Hub GPUI pinta el widget real porque comparte proceso con el pintor**
   (`Overlay::configured` dentro de `studio/canvas.rs`). Electron y Rune no
   pueden: son otros procesos y otras tecnologías.
3. **GPUI en Windows no deja leer lo que pinta.** La única captura que existe
   (`native/ui/src/capture.rs`, función `parity-capture`, fuera del producto)
   crea una ventana oculta fuera de los monitores, la copia con `PrintWindow`
   dos veces (fondo negro y blanco) y calcula la transparencia.
4. **El anfitrión ya guarda el diseño con todo lo necesario**: revisión por
   huella, escritura con `baseRevision`, error `StudioConflict { current }`,
   deshacer y rehacer (50 pasos) y hueco libre al añadir
   (`settings/layout/studio.rs`). Lo único que falta es la geometría: el
   contrato la excluye a propósito («Geometry is intentionally absent»).
5. **La geometría y el imán ya son funciones puras** en código congelado o de
   `ui`: `ui/src/geometry.rs` (redimensionar con proporción) y
   `hub/src/studio/add_widget.rs` (`snap`, hueco libre) y `canvas.rs`
   (empujón con teclado, zoom, encajar, anclas).
6. **El Hub se cierra al entrar en pista** (ADR 0099) y el anfitrión rechaza
   editar en Live. Una preview «en vivo» dentro del Hub solo se ve con el
   simulador en menús o repetición.
7. **El servidor no puede abrir ventanas ni dispositivos gráficos.** Todo lo
   que se pruebe allí y en la CI tiene que funcionar sin ventana.
8. **El protocolo del anfitrión va por la versión 36** y ningún PR abierto
   reserva la 37 (comprobado hoy). El canal lleva JSON con un tope de 1 MiB por
   mensaje.
9. **ADR 0107, punto 4, y la decisión D6 de `DISENO.md` dicen que posición y
   tamaño se editan sobre los overlays, no en el Hub.** El lienzo de D023 va en
   sentido contrario. Ver «Decisión abierta».

Regla que manda (`AGENTS.md`): prohibido un segundo pintor o una segunda
cadena que duplique la fuente de verdad.

## Decisión 1 — Cómo ven los Hubs el widget real

### Opciones

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| A. Repintar el widget en web (React/SVG) y en Rune | Cada Hub dibuja su copia | Rápido de ver, sin procesos | **Es un segundo y un tercer pintor.** Prohibido. Se desvían del real con cada cambio |
| B. Textura compartida de la GPU | El pintor comparte su imagen en memoria de vídeo y el Hub la muestra | Fluido, casi sin CPU | GPUI no expone su imagen: exige parchear `vendor/gpui_windows`. La API de Electron para importarla es experimental (sin verificar en 45.2.3). Rune necesita otra vía distinta. No se puede probar sin GPU |
| C. Ventana nativa del pintor encima del Hub | El proceso de overlays abre una ventana sin bordes pegada al hueco del Hub | Es el widget real, vivo y a 60 Hz, sin copiar píxeles | Tapa menús, diálogos y avisos del Hub; hay que seguir cada movimiento, escala y recorte de la ventana; marcos, guías y tiradores quedarían por debajo. Malo para un lienzo con muchos widgets. Solo Windows |
| D. Fotos PNG del pintor real por el canal | Un proceso del pintor dibuja el widget y devuelve una imagen; el Hub la coloca como una imagen más | Un solo pintor; arrastrar es mover una imagen (sin retraso); mismo código para Electron y Rune; se prueba sin ventana con un pintor falso; no toca la seguridad del canal | No es fluido: cada cambio de ajustes tarda lo que tarde una captura (**sin medir**). Sin animación |
| E. D para todo + flujo lento (≤10 imágenes/s) para «En vivo» | Igual que D, repitiendo la foto | Reutiliza D | Coste de CPU por codificar PNG (**sin medir**) |

### Recomendación: D ahora; «En vivo» se decide midiendo entre E y C

1. **Un solo pintor, en un proceso aparte.** `vantare-overlays.exe` gana un
   modo «preview» que usa el mismo camino de pintado que en pista
   (`Overlay::configured` → `ingest` → `frame`) y la captura que ya existe. No
   es un ejecutable nuevo ni un pintor nuevo. Si VANTA-141 cambia el pintor de
   los overlays, cambia también este modo y el contrato no se toca.
2. **Lo lanza el anfitrión, bajo demanda**, igual que lanza la interfaz:
   dentro de su Job Object (muere con él), canal privado con nombre aleatorio,
   permisos solo del usuario, clave de un solo arranque y comprobación del
   proceso hijo. Se cierra tras un rato sin uso y nunca arranca en Live.
3. **El Hub no manda ajustes libres al pintor.** Pide por referencia cerrada:
   una instancia del diseño, un tipo del catálogo o una muestra del Onboarding;
   y unos datos: ejemplo, escena con nombre o, más adelante, en vivo. El
   anfitrión resuelve los ajustes desde su documento. Así el pintor solo recibe
   datos escritos por el anfitrión.
4. **La imagen viaja dentro del canal que ya existe**, en un mensaje JSON
   (PNG en base64), con tamaño máximo cerrado y escalas cerradas (1, 1,5, 2 y
   3). No hay rutas de archivo, ni esquema nuevo en Electron, ni puertos. Si no
   cabe, el anfitrión responde «demasiado grande» y el Hub pide una escala
   menor. La CSP de Electron ya admite imágenes `blob:`.
5. **Cada imagen lleva una clave** (huella de tipo, ajustes, preferencias,
   datos, escala y versión del pintor). El anfitrión y el Hub guardan en
   memoria las últimas, con tope. Cambiar la opacidad o mover un widget no
   repinta nada.
6. **El mismo proceso mide el tamaño real** de un widget con sus ajustes (hoy
   el anfitrión solo sabe el tamaño por defecto). Medir no necesita ventana.
7. **Si el pintor no está o falla**, el Hub muestra la ilustración actual con
   su rótulo «ilustración». Nunca una imitación sin rotular.
8. **Mac y pruebas**: el anfitrión simulado de Electron y el «anfitrión de
   escena» de Rune devuelven PNG de ejemplo guardados en `hub-web/fixtures/`.
9. **«En vivo» queda fuera de la primera entrega.** Se mide en el PC de juego:
   tiempo por foto, CPU y memoria. Si E cumple (objetivo: cambio de ajuste
   visible en menos de 200 ms y menos del 5 % de un núcleo a 10 imágenes/s),
   se hace E. Si no, se estudia C solo para la vista de un widget, nunca para
   el lienzo. B queda descartada salvo que el pintor cambie.

Cómo quedan los requisitos: latencia nula al arrastrar (la imagen ya está en
el Hub); GPU solo mientras se pinta una foto; funciona solo en Windows, que es
donde existe el anfitrión real; el canal no gana superficie nueva; y todo lo
que no son píxeles se prueba sin ventana.

## Decisión 2 — Dónde vive la geometría y cómo se escribe

**El anfitrión es la única fuente de verdad.** Los Hubs no guardan posiciones:
muestran la última vista del anfitrión más, como mucho, un borrador del gesto
en curso.

### Lo que publica el anfitrión

- `StudioView` añade el lienzo: ancho, alto y si es el del monitor o uno
  elegido. El anfitrión calcula el monitor (Win32); los Hubs no.
- `OverlayInstance` añade `x`, `y` (relativos al lienzo, en las mismas
  unidades que los overlays), si el tamaño es explícito o automático y si la
  proporción está bloqueada. Un widget puede caer fuera del lienzo: se marca,
  no se oculta.

### Las órdenes

Todas llevan `baseRevision`. Cada una es **una escritura y un paso de
deshacer**.

| Orden | Para qué |
|---|---|
| `studio.geometry { id, change: move { x, y } }` | Soltar un arrastre o un empujón de teclado |
| `… change: resize { x, y, width, height }` | Soltar un tirador (el origen cambia al tirar de la izquierda o de arriba) |
| `… change: anchor { column, row }` | Las nueve anclas; la posición la calcula el anfitrión |
| `… change: autoSize` / `aspectLocked(bool)` | Volver al tamaño natural; bloquear proporción |
| `studio.canvas { resolution }` | Elegir resolución del lienzo o «seguir al monitor» |
| `studio.add { kind, at? }` | `at` es nuevo y opcional: punto elegido al soltar desde el catálogo. Sin él, primer hueco libre, como hoy |

El anfitrión valida y recorta siempre (límites de tamaño ya definidos,
coordenadas finitas, proporción). El Hub nunca es quien decide si un valor
vale.

### El gesto: local primero, una sola escritura al final

1. Al empezar, el Hub recuerda la geometría de partida de esa instancia.
2. Mientras se mueve, solo cambia un **borrador local**. No se envía nada.
   El imán, las guías, el redimensionado con proporción y el ritmo del empujón
   se calculan en el Hub para que respondan en el acto.
3. `Esc` borra el borrador. No hay escritura ni paso de deshacer.
4. Al soltar se envía **una** orden con la última revisión conocida.
5. Con la respuesta, el Hub adopta la vista del anfitrión y borra el borrador.
6. Solo una escritura de geometría en vuelo. Si el usuario hace otro gesto
   mientras tanto, se guarda uno en espera (el último gana).

### Conflictos

- **Llega una vista nueva durante el gesto** (otro proceso escribió): si esa
  instancia sigue existiendo con la misma geometría de partida, el gesto sigue
  y al soltar usa la revisión nueva. Si cambió o desapareció, el gesto se
  cancela y se avisa.
- **El anfitrión responde `StudioConflict`**: el Hub adopta `current`, borra el
  borrador y avisa («El diseño ha cambiado; revisa la posición»). **No se
  reenvía solo**, como el resto de escrituras del anfitrión.
- **Live o sin derechos**: `Denied`, igual que hoy.

### Una sola regla de imán para los dos Hubs

Las funciones puras (imán, redimensionar, empujón, encajar, anclas, hueco
libre) se escriben **una vez en el anfitrión**, en un módulo sin dependencias,
tomando como oráculo los tests del Hub congelado (que no se toca).

- Rune las usa directamente como biblioteca.
- Electron las reescribe en TypeScript (unas 150 líneas) y **un test falla si
  no da el mismo resultado** que una lista de casos generada desde Rust, igual
  que ya se hace con los tipos y el corpus del contrato.
- Descartado compilar Rust a WebAssembly: cadena de herramientas nueva para
  muy poco código.

## Decisión 3 — Plan por PRs

Versiones nuevas del protocolo, todas aditivas (no se quita ni se renombra
nada): **37** geometría, **38** preview fija, **39** preview en vivo (solo si
la medición la aprueba). Quien fusione antes toma el número; el resto se
renumera.

| PR | Dueño | Qué entra | Protocolo | Cómo se verifica |
|---|---|---|---|---|
| 0. Este ADR | Diseño | Documento y decisión de Isaac | — | Revisión del orquestador |
| 1. Geometría en el anfitrión | Rust (núcleo) | Vista con lienzo y posiciones; órdenes `studio.geometry`, `studio.canvas`, `at` en `studio.add`; módulo puro de gestos; lista de casos exportada; monitor por Win32 (función ya existente de `windows-sys`, sin paquete nuevo) | 37 | Tests sin ventana: revisión y conflicto, un paso de deshacer por orden, recortes, bytes desconocidos del diseño intactos, corpus y tipos generados al día. `comprobar.ps1 hub-host` |
| 2. Lienzo en Electron | Web | Plano a escala con las ilustraciones actuales: arrastrar, tiradores, anclas, empujón, zoom, encajar, `Esc`; borrador local y avisos de conflicto | — | Vitest: casos de Rust, máquina de estados del gesto, teclado y nombres accesibles; Playwright con anfitrión simulado; capturas comparadas a ojo con la referencia antes de fusionar |
| 3. Catálogo al lienzo | Web | Arrastrar tarjeta con silueta, imán, guías y colocación con `at` (D025) | — | Igual que PR 2; test de «soltar fuera no añade» |
| 4. Preview fija | Rust (overlays + núcleo) | Modo preview de `vantare-overlays`; orden `preview.render` (instancia, tipo o muestra; ejemplo o escena); medida del tamaño real; caché con tope; arranque, cierre y fallos del proceso | 38 | Sin ventana: claves, caché, límites, y ciclo de vida con un pintor falso (no arranca, tarda, muere). **En el PC de juego**: la foto coincide píxel a píxel con la captura del overlay en la misma escena; tiempo por foto, CPU y memoria anotados |
| 5. Preview en las pantallas | Web | Vista de un widget, lienzo, Inicio y Onboarding usan la foto real, con la ilustración como respaldo; selector de ejemplos y escenas activo (D015, D024, D092) | — | Vitest y Playwright con PNG de ejemplo; capturas en el PC de juego con el anfitrión real |
| 6. En vivo (condicional) | Rust + Web | Solo si la medición del PR 4 cumple: flujo lento por suscripción. Si no, estudio de la ventana nativa en un ADR corto | 39 | Medición en el PC de juego antes y después; sin ventana, el flujo con pintor falso |
| R. Rune | Rune | Adapta cada versión en su propio PR (ADR 0108): PR 1 → lienzo; PR 4 → preview | — | Su CI (`hub-rune.yml`) y capturas en el Mac con el anfitrión de escena |

Orden y dependencias: 1 → 2 → 3 en una línea; 4 → 5 → 6 en otra. Las dos
líneas pueden ir en paralelo; solo se cruzan en el PR 5 (el lienzo cambia la
ilustración por la foto). Duplicar widget (D111) y los controles de más
widgets (D106) quedan fuera.

## Descartado

- Pintar widgets en web o en Rune (opción A): segundo pintor.
- Pintar en el anfitrión con un rasterizador por software: segundo pintor y
  dependencia nueva.
- Guardar las fotos en disco y servirlas con un esquema propio de Electron:
  rutas y permisos nuevos sin necesidad; Rune necesitaría otra vía.
- Enviar cada movimiento del arrastre al anfitrión: una escritura de disco y un
  paso de deshacer por píxel.
- Tocar el Hub GPUI congelado para extraer sus funciones: se portan con sus
  tests como referencia.

## Riesgos

| Riesgo | Qué hacemos |
|---|---|
| La captura actual es lenta o inestable (dos pasadas de `PrintWindow`) | Se mide en el PR 4 antes de construir pantallas encima; respaldo: ilustración |
| El modo preview mete código de captura en el ejecutable de producto | Solo se activa con su modo; el camino de pista no cambia y se comprueba con la medición habitual |
| El servidor no puede ver píxeles | Los píxeles se verifican en el PC de juego; el servidor y la CI, todo lo demás |
| Dos reglas de imán (Rust y TypeScript) | Lista de casos única generada desde Rust; el test de Electron falla si difiere |
| Fotos grandes en un canal de 1 MiB | Escalas y tamaño cerrados; error tipado y escala menor |
| Cambia el pintor de overlays (VANTA-141) | El contrato pide «imagen de esta referencia»; no nombra GPUI |

## Decisión abierta para Isaac

**¿Se edita posición y tamaño también en el Hub?** ADR 0107 (punto 4) y D6
dicen que no: se edita sobre los overlays, en modo edición. Este ADR propone
que **sí, además**, por dos motivos: el modo edición sobre overlays aún no
existe, y un plano en el Hub sirve sin tener el simulador abierto. No se
estorban: los dos escriben el mismo `layout.json` con la misma regla de
revisión.

- Si Isaac dice **sí**: se enmienda el punto 4 de ADR 0107 y se hacen los PR 1
  a 3.
- Si dice **no**: los PR 1 a 3 no se hacen, D023 y D025 se cierran como
  «decisión de producto, no falta» y solo queda la línea de la preview
  (PR 4 a 6), que no depende de esto.
