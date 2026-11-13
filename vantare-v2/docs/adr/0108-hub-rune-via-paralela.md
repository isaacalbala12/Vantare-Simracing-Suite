# ADR 0108 — Hub en Rune como vía paralela a Electron

Fecha: 2026-11-13. Issue: [#2256](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/2256) (VANTA-143).
Enmienda [ADR 0107](0107-hub-electron-nucleo-y-overlays-rust.md); no lo sustituye.

## Estado

**Vía paralela decidida por Isaac el 2026-11-13.** Lo estructural de este
documento lo fija el orquestador por delegación de Isaac y queda aceptado al
fusionar su PR. No autoriza releases, promociones de canal ni cambios en el
instalador.

## Contexto

- ADR 0107 dejó Rune fuera hasta 2027 y el informe de arquitectura del 12-nov
  (`D:\VantareServer\evidence\rune-vs-gpui\INFORME-FABLE.md`) recomendó no mover
  el Hub de Electron. Isaac decide probarlo igualmente **en paralelo**, sin
  parar Electron. El coste se acepta: el trabajo del Hub se hace dos veces
  hasta que se elija uno.
- Decisiones de Isaac que este ADR no reabre: mismas pantallas, mismo orden y
  mismos diseños de referencia que Electron; mismo anfitrión `native/hub-host`
  y mismo protocolo, sin duplicar el núcleo; Rune fijado a una versión y cada
  subida es una tarea propia; ventanas y capturas en el Mac (o en el PC de juego
  si Rune falla en macOS) y el servidor solo compila y pasa tests sin ventanas;
  un worker para el marco base y dos por pantallas después; prioridad a partes
  iguales con Electron; los overlays los decide la medición de VANTA-141 (#2213).

## Decisión

### 1. Dónde vive y cómo se conecta

- **Carpeta `vantare-v2/hub-rune/`, hermana de `hub-web/`**, con su propia
  lista de versiones (`Cargo.toml` y `Cargo.lock` propios). Crate
  `vantare-hub-rune`, ejecutable `vantare-hub-ui-rune.exe`. **No entra en el
  conjunto de crates de `native/`** por tres motivos comprobados:
  - Rune obliga a sustituir cuatro bibliotecas por copias parcheadas suyas. Dos
    de ellas (`wgpu-hal` y `accesskit_windows`) ya las usan hoy los overlays a
    través de GPUI: dentro de `native/` el parche cambiaría también los overlays
    que se distribuyen.
  - Añadiría unos 185 paquetes a los 786 del producto y a sus comprobaciones.
  - La CI trata cualquier ruta nueva dentro de `native/` como producto nativo y
    lanza la comprobación completa (de 55 a 75 minutos) en cada PR.
- **Proceso aparte, lanzado por el anfitrión igual que Electron.** La cadena no
  cambia: supervisor → `vantare-hub.exe` (el anfitrión) → interfaz. El
  anfitrión crea un canal privado, pasa su nombre y una clave de un solo uso en
  `VANTARE_HUB_PIPE` y `VANTARE_HUB_TOKEN`, y la interfaz se conecta, se
  identifica (`authenticate`), saluda (`hello` con la versión del protocolo) y
  avisa cuando la ventana ya se ve (`ready`). El Hub Rune hace exactamente lo
  mismo que hoy hace `hub-web/src/main/host.ts`, y también borra esas dos
  variables en cuanto las lee.
- **El anfitrión no se toca.** Ya admite otra interfaz con
  `VANTARE_HUB_UI=<ruta absoluta>` en compilaciones de desarrollo o de QA
  (`qa-e2e`). En una compilación de distribución solo acepta el Electron
  instalado: por diseño, **el Hub Rune no se puede distribuir** hasta que Isaac
  elija. No se mete el Hub Rune dentro del proceso del anfitrión: habría que
  rehacer su arranque y se perdería el aislamiento que hoy se prueba (clave,
  comprobación del proceso hijo y cierre conjunto).
- El anfitrión de QA añade tres opciones pensadas para Chromium
  (`--remote-debugging-port`, `--remote-debugging-address`,
  `--force-device-scale-factor`). El Hub Rune ignora exactamente esas tres y
  rechaza cualquier otro argumento.
- **En el Mac no existe el anfitrión real** (es solo Windows). Allí el Hub Rune
  arranca con un «anfitrión de escena»: una pieza interna que contesta con los
  mismos archivos de ejemplo que usa Electron (`hub-web/fixtures/*.json` y el
  corpus generado del contrato). Solo existe en compilaciones de desarrollo,
  como el simulado de Electron. La conexión real se comprueba en Windows.

### 2. Rune como dependencia

- **Aprobada** por el orquestador, por delegación de Isaac, con la condición de
  licencia MIT o Apache. **Comprobado: Rune es MIT** (`LICENSE` y `Cargo.toml`
  en el commit fijado). No hay bloqueo. El primer PR adjunta la lista de
  licencias de todos los paquetes; si aparece alguna que no sea permisiva, el
  worker para y avisa al orquestador.
- **Versión fijada:** commit `d5338988a7c1b3377adb60853815b6d0843dae7c` de
  `https://github.com/anomalyco/rune`. Rune no publica versiones ni etiquetas
  (comprobado hoy). Es el mismo commit que usa VANTA-141, ya compilado para
  Windows y con tests pasados en el Mac. Los cuatro parches (`wgpu-hal`,
  `winit`, `parley_engine`, `accesskit_windows`) se toman del mismo commit.
  Siempre se compila con `--locked`.
- **Subir Rune** es una tarea `VANTA-N` propia, con un único PR que solo cambia
  el commit y lo que rompa, y con las capturas de todas las pantallas hechas
  repetidas antes y después. Si Hub y medición de overlays siguen vivos a la
  vez, suben juntos.
- **Compilador:** Rune pide Rust 1.99.1. `hub-rune` lleva su propio
  `rust-toolchain.toml` con 1.99.1, la misma versión a la que pasa el producto
  en #2248. No se acepta una subida de Rune que pida un compilador más nuevo
  que el del producto (1.100 falla hoy en Windows, #2252).
- **CI:** un flujo nuevo `hub-rune.yml` en `windows-latest`: formato, Clippy con
  `-D warnings` y tests sin ventana. Se dispara con cambios en `hub-rune/`, en
  el anfitrión y en los archivos compartidos del punto 3. **No es un check
  obligatorio**: si un cambio de Electron o del anfitrión lo rompe, no bloquea
  ese PR y lo arreglan los workers de Rune. `vantare-v2/hub-rune/` se añade a
  las zonas que no lanzan la comprobación nativa, igual que `hub-web/`.
- **Servidor:** se compila por la cola (`native/scripts/compilar.ps1 cargo …
  --manifest-path hub-rune/Cargo.toml`), cuatro tareas, destino en D: y sin
  símbolos de depuración (`debug = 0`). Prohibido ejecutar el binario y las
  opciones `--snap`, `--frames`, `--video` y `--tree` de Rune: crean un
  dispositivo gráfico aunque no abran ventana.

Riesgos que se aceptan:

| Riesgo | Qué significa | Qué hacemos |
|---|---|---|
| Sin versiones y cambios muy rápidos | Cada subida puede romper cosas | Commit fijado; subidas como tarea propia con capturas |
| No aceptan aportaciones | Un fallo suyo puede quedarse sin arreglar | Si nos bloquea, copia propia del repositorio, en una issue aparte |
| El commit podría desaparecer | Sin él no se puede compilar | Se crea un espejo propio el día que haga falta un parche nuestro o falle la descarga |
| Windows poco probado por ellos | Sus pruebas automáticas son de Mac | Nuestra CI de Windows y las pruebas en el PC de juego |
| Cuatro parches ajenos | Más piezas que vigilar en cada subida | Quedan aislados en `hub-rune/`; no tocan los overlays |
| Mucha memoria al compilar | El servidor tiene 16 GB | `debug = 0` y cola; si no basta, se compila en el Mac |

### 3. Qué se comparte con Electron

Una sola fuente por cosa. El Hub Rune **lee**, nunca copia a mano:

| Qué | Fuente única | Cómo la usa Rune |
|---|---|---|
| Contrato del protocolo | Tipos Rust de `native/hub-host` (`protocol`, `frame`) | Los usa directamente como biblioteca. Electron sigue con su TypeScript generado |
| Colores y temas | `hub-web/design/tokens.json` | Lo lee al compilar, como ya hace el anfitrión |
| Fuentes | `native/ui/assets/fonts/` | Las incluye por ruta |
| Iconos e ilustraciones | Los mismos archivos del repositorio que usa Electron | Por ruta, sin copias |
| Textos | Los archivos de `hub-web/src/renderer/i18n/` | Un guion de `hub-web` genera un catálogo JSON; un test falla si está desactualizado. Los textos con lógica (plurales) se generan como casos de prueba que Rune debe reproducir |
| Datos de ejemplo | `hub-web/fixtures/` | Los lee el anfitrión de escena |
| Diseños de referencia | Las mismas capturas y referencias que Electron | Misma comparación visual |

El Hub Rune depende solo de la biblioteca del anfitrión. No depende de
`runtime`, `ui`, `hub` ni GPUI; un test del árbol de dependencias lo comprueba.

### 4. Cómo decide Isaac entre los dos Hubs

**Requisitos.** El Hub que falle uno queda fuera:

1. Funciona en Windows 10 22H2 y Windows 11, a escala 100, 125 y 150 %.
2. Teclado español completo en los campos de texto (acentos y AltGr).
3. Todo se puede usar con teclado y los controles tienen nombre para lectores
   de pantalla.
4. Aspecto fiel a los diseños de referencia, visto por Isaac con capturas lado
   a lado.
5. Media hora de uso normal sin cierres ni bloqueos.

**Comparación**, en el PC de juego, con el método de la prueba A de VANTA-141
(10 arranques en frío y 10 en caliente, sumando todos los procesos de cada Hub):

- Para el usuario: tiempo hasta poder usar la ventana, memoria con Inicio
  abierto, CPU en reposo y tamaño instalado.
- Para producir: por pantalla, días de «En curso» a «Por testear», número de
  PRs y de rondas de revisión, defectos visuales encontrados, tiempo desde
  cambiar un texto hasta verlo y minutos de CI por PR.
- Dependencia: subidas de Rune hechas y lo que costó cada una.

**Cuándo:**

- **Corte 1**, al acabar el marco base de Rune (punto 5): solo los requisitos.
  Si alguno falla y no tiene arreglo a la vista, la vía se para.
- **Corte 2**, cuando Rune tenga marco, Inicio, Studio y Launcher: se mide todo
  y el orquestador entrega a Isaac una tabla con los dos Hubs.

**Regla propuesta para el corte 2:** se elige Rune solo si cumple los cinco
requisitos, usa como mucho la mitad de memoria que Electron sin arrancar más
lento, y cada pantalla le cuesta como mucho 1,5 veces lo que a Electron. En
cualquier otro caso, y en caso de empate, sigue Electron: va por delante y
tiene versiones publicadas. El Hub que no se elija se retira en una issue
propia; después del corte 2 no se mantienen dos.

### 5. Plan del primer worker (marco base)

Cinco PRs pequeños a `nightly`. Cada uno pasa formato, Clippy y tests sin
ventana en el servidor y en la CI, y adjunta capturas del Mac.

| PR | Contenido | Cómo se verifica |
|---|---|---|
| 1. Esqueleto | Carpeta `hub-rune/`, Rune y parches fijados, ventana vacía, flujo `hub-rune.yml`, zonas de CI actualizadas con sus tests, lista de licencias. Parte del esqueleto de #2222 | Compila para Windows; un test sin ventana; la ventana abre en el Mac; un PR que solo toque `hub-rune/` no lanza la comprobación nativa |
| 2. Sistema de diseño | Temas desde `tokens.json`, fuentes, y los componentes que pide el marco (superficie, texto, botón, elemento de menú) | Test: los 9 temas en claro y oscuro resuelven todos los colores usados; captura de muestrario en claro y oscuro |
| 3. Marco | Ventana, menú lateral contraído y expandido, cabecera y cambio entre secciones vacías, en el mismo orden que Electron; catálogo de textos generado | Test del árbol: mismas secciones y mismo orden; capturas contra la referencia del marco |
| 4. Conexión | Cliente del canal del anfitrión (identificación, saludo, listo, cierre) y anfitrión de escena | Tests con canal en memoria y con el corpus del contrato; en Windows, anfitrión real con `VANTARE_HUB_UI`: publica `hub-ready` y cierra con salida 0 al cortar la entrada |
| 5. Pantalla conectada | Estado del núcleo en el marco («Esperando simulador» / «LMU conectado») y Roadmap, que solo lee | Tests con el ejemplo de Roadmap; captura en el Mac; en Windows, datos reales del anfitrión y aviso correcto con el núcleo apagado |

A comprobar en el PR 1, porque aquí no se ha compilado nada: que la biblioteca
del anfitrión compila como dependencia desde otra carpeta y en macOS. Si no
compila en macOS, se corrige en el anfitrión solo con condiciones de
plataforma, sin cambiar su comportamiento. Si eso no bastara, el contrato se
separa en un crate propio en una issue aparte; no se copia a mano.

Al terminar el PR 5 se hace el corte 1 y entran los dos workers de pantallas,
empezando por Inicio (el material de #2241 sirve de partida).

## Consecuencias

- ADR 0107 sigue vigente: Electron continúa con la misma prioridad, el Hub
  GPUI sigue congelado y los overlays no cambian con este ADR.
- Durante la vía hay dos Hubs y el anfitrión sirve a los dos. Un cambio del
  protocolo lo hace quien lo necesita; el otro Hub se adapta en su propio PR.
- El instalador y las versiones para testers no cambian: solo Electron puede
  empaquetarse hasta el corte 2.
- `native/pruebas-rune` (VANTA-141) sigue siendo código de medición, separado
  de `hub-rune/`.
