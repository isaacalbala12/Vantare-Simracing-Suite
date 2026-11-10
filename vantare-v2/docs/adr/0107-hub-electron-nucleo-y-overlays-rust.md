# ADR 0107 — Hub en Electron; núcleo y overlays en Rust

Fecha: 2026-11-10. Issue: [#1993](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1993).
Sustituye la parte de interfaz del Hub de [ADR 0099](0099-arquitectura-rust-nativa.md).

## Estado

**Aceptada por Isaac el 2026-11-10.** No autoriza releases ni promociones de
canal. Los testers no reciben versiones nuevas hasta nueva orden de Isaac.

## Contexto

- Las compilaciones de Rust + GPUI frenan todo el desarrollo. El workspace tiene
  unas 210.000 líneas y 771 paquetes; el crate `hub` son unas 73.000 líneas en
  un solo bloque; cada rama ocupa de 7 a 10 GB de `target` y la CI tarda de 55
  a 75 minutos por PR en un servidor de 4 núcleos.
- La versión Go + Wails + React se retiró por el consumo de los **overlays** en
  carrera (555 MiB y 1,14 núcleos frente a 107 MiB y 0,12 núcleos con GPUI y
  cuatro widgets). El consumo del Hub no fue el motivo. Mover también el Hub a
  Rust + GPUI fue más allá de lo que el problema pedía.
- El Hub no está abierto mientras se corre: solo los overlays.
- El objetivo del producto ha cambiado. El Hub es la interfaz principal fuera
  del juego y va a crecer (overlays, análisis de telemetría y más). Los
  overlays pasan a ser interactivos: una interfaz encima del simulador desde la
  que se controla la estrategia en carrera, el lanzamiento de perfiles, los
  ajustes y la posición de los propios overlays, sobre todo con botones del
  volante y teclas, y también con ratón.
- Importan a la par la velocidad de desarrollo y el consumo en carrera. Todo el
  código lo escriben agentes.
- Opciones valoradas el 2026-11-10 (informes en
  `D:\VantareServer\evidence\compilacion\opciones\` y el análisis «Vantare:
  alternativas a GPUI» de Isaac con Opus, 6-7 de noviembre): seguir todo en
  GPUI partiendo el Hub en crates; Tauri; WebView2 propio controlado desde
  Rust; Electrobun; Flutter; Qt/QML; Avalonia; Slint; React Native para Windows;
  cambiar de lenguaje por completo.

## Decisión

1. **Núcleo en Rust, sin depender de ninguna tecnología visual.** Telemetría,
   dominio, IPC, ingeniero, licencias, servicios y solver siguen en `native/`.
   El núcleo publica estado y contratos; cada interfaz los consume.
2. **Hub en Electron, lo más optimizado posible.** React + TypeScript, con Bun
   como gestor. Tiene que funcionar en Windows 10 y Windows 11.
   - Es un **rediseño**, no un port. Empieza con el mismo diseño visual que el
     Hub actual (colores, tipografías, disposición y pantallas) y desde ahí se
     deriva. Los tests de comportamiento y las capturas de paridad del Hub GPUI
     dejan de ser criterio de aceptación; las capturas sirven solo como
     referencia visual de partida.
   - Entran todas las pantallas actuales: Strategy, Studio, Launcher, Ajustes,
     Testing Center, Telemetría, Calendario, Workshop, Roadmap, cuenta y
     onboarding.
   - El Hub habla con el núcleo por el canal IPC que ya existe y lo sigue
     arrancando el supervisor.
   - El sistema de diseño es propio: sale de los tokens y temas de Vantare. No
     se adopta el aspecto de ninguna librería de componentes.
3. **Overlays nativos en Rust.** Base actual: GPUI. Se migra a `gpui-kit` con
   `gpui-pre` (GPUI desde crates.io, sin dependencia git de Zed) y se prueba
   `gpui-fast`, midiendo antes y después. Los componentes interactivos salen de
   `gpui-base` y `gpui-component` con aspecto propio. No se cambia de
   renderizador sin medición.
   - Un compositor propio (wgpu + DirectComposition) solo se plantea si la
     medición demuestra que GPUI no basta. El criterio es el impacto real en el
     simulador (FPS y p99, CPU, GPU, VRAM, RAM, latencia, estabilidad y captura
     en OBS), no una cifra suelta de CPU.
   - Rune queda fuera por ahora: prelanzamiento, sin versiones publicadas y sin
     overlays probados en Windows. Se revisa en el primer trimestre de 2027.
   - **G-Sync / FreeSync es un requisito desde ya**: ningún cambio de overlays
     se acepta sin comprobar que no rompe la frecuencia variable del juego en
     ventana sin bordes, o sin ofrecer un modo que la respete.
4. **Edición de overlays.** La posición y el tamaño se editan sobre los propios
   overlays, en un modo edición. El Studio del Hub muestra cada overlay por
   separado y sirve para elegir cuáles forman parte del perfil seleccionado.
5. **Hub GPUI actual: congelado.** No recibe trabajo nuevo. Se retira cuando el
   Hub de Electron cubra lo mismo. No se parte en crates.
6. **Gestión** (`native/admin`) no se toca en esta decisión.
7. **Compilación y CI** se optimizan solo para lo que queda en Rust (#1993).

## Descartado y por qué

- **Tauri:** descartado por Isaac por mala experiencia previa.
- **WebView2 propio y Electrobun:** dependen del navegador del sistema o son
  jóvenes; Isaac elige Electron por madurez y por dar el mismo resultado en
  todos los equipos.
- **Flutter, Qt/QML, Avalonia, Slint, React Native para Windows:** viables sin
  navegador, pero con menos techo visual o menos ecosistema que la web para el
  Hub, y añaden otro lenguaje.
- **Web para overlays:** medido y descartado por consumo.
- **Cambiar de lenguaje por completo:** de 4 a 7 meses y riesgo alto sin
  beneficio para el núcleo.
- **Seguir con el Hub en GPUI partido en crates:** reduce el tiempo de
  compilación pero no da iteración inmediata ni componentes hechos.

## Consecuencias

- Hay dos tecnologías de interfaz. Se comparte el núcleo, el contrato de datos
  y los tokens de diseño; las pantallas del Hub y las de los overlays son
  interfaces distintas y no se duplican entre sí.
- El instalador tiene que empaquetar y actualizar el Hub de Electron.
- El Hub consume más memoria que hoy mientras está abierto. Se acepta porque no
  está abierto en carrera.
- El contrato IPC entre el núcleo y el Hub pasa a ser una frontera entre
  lenguajes: los tipos de TypeScript se generan desde Rust o desde un esquema
  común, nunca se escriben a mano en los dos lados.
- Hace falta verificación visual por capturas reales en Windows, tanto del Hub
  como de los overlays, para que los agentes comprueben el resultado.
- ADR 0099 sigue vigente para el núcleo, los flujos y los overlays. Su regla de
  «UI GPUI» deja de aplicarse al Hub.

## Cómo se revisa esta decisión

No se reabre por preferencia. Se reabre solo con una medición que demuestre que
un requisito de arriba no se cumple: consumo en carrera, compatibilidad con
Windows 10, frecuencia variable o velocidad de iteración del Hub.
