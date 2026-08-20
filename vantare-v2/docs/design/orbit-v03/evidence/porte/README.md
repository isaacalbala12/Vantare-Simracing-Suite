# Baselines visuales del porte · Command Orbit v0.3

Cada subcarpeta de `evidence/porte/` es la **baseline** de un harness visual: la
captura que ese harness produce cuando la UI está sana. No son adornos de
documentación, son el patrón contra el que se mira a ojo cada cambio de piel.

| Carpeta | Harness | Script |
| --- | --- | --- |
| `00-fundamentos` | tokens y fundamentos | `pnpm visual:orbit-foundations` |
| `01-shell` | shell (rail, columna, topbar) | `pnpm visual:orbit-shell` |
| `01-shell/responsive` | 19 escenarios de tamaño | `pnpm visual:orbit-responsive` |
| `02-kit` | kit de componentes | `pnpm visual:orbit-kit` |
| `03-inicio` | Inicio | `pnpm visual:orbit-home` |
| `04-studio` | Overlay Studio y Perfiles | `pnpm visual:orbit-studio` |
| `05-launcher` | Launcher | `pnpm visual:orbit-launcher` |
| `06-carreras` | Carreras | `pnpm visual:orbit-races` |
| `07-estrategia` | Estrategia | `pnpm visual:orbit-strategy` |
| `08-ingeniero` | Ingeniero de pista | `pnpm visual:orbit-engineer` |
| `09-telemetria` | Telemetría | `pnpm visual:orbit-telemetry` |
| `10-roadmap` | Roadmap | `pnpm visual:orbit-roadmap` |
| `11-ajustes` | Ajustes | `pnpm visual:orbit-settings` |
| `12-testing-center` | Testing Center | `pnpm visual:orbit-testing` |

`wiring-audit.md` es otra cosa: la auditoría control a control del porte.

## Cómo regenerar

Desde `vantare-v2/frontend`, con el árbol limpio:

```
pnpm visual:orbit-foundations && pnpm visual:orbit-shell && pnpm visual:orbit-kit \
  && pnpm visual:orbit-home && pnpm visual:orbit-studio && pnpm visual:orbit-launcher \
  && pnpm visual:orbit-races && pnpm visual:orbit-strategy && pnpm visual:orbit-engineer \
  && pnpm visual:orbit-telemetry && pnpm visual:orbit-roadmap && pnpm visual:orbit-settings \
  && pnpm visual:orbit-testing && pnpm visual:orbit-responsive
```

Cada script levanta su propio Vite en un puerto fijo, monta el harness real en
Chromium headless a `deviceScaleFactor: 1`, comprueba su contrato (medidas,
ausencia de scroll, consola limpia, `title` nativo prohibido…) y **solo entonces**
escribe la captura. Un harness que falla no deja baseline a medias.

Se regeneran **todas** a la vez o ninguna: mezclar capturas de dos pasadas
distintas convierte la carpeta en una comparación imposible de leer.

## La baseline está fijada en la máquina de desarrollo

Estas capturas se generan en la máquina de desarrollo (Windows, Chromium de
Playwright), no en CI. Comparar píxel a píxel contra una pasada hecha en otra
máquina no dice nada útil: lo que se compara es **esta** carpeta contra la
siguiente pasada en **la misma** máquina.

## Diferencias benignas conocidas

Al regenerar aparecen diferencias que no son regresiones. Antes de investigar un
diff, descarta estas:

- **Métrica de Inter frente a la fuente de reserva.** Si Inter no está instalada
  o aún no ha resuelto, el texto cae a la pila de reserva del sistema: cambia el
  ancho de cada línea y con él casi cada píxel de texto de la captura. Los
  harnesses esperan a `document.fonts.ready`, pero eso garantiza *una* fuente
  resuelta, no *la misma* fuente en dos máquinas.
- **Contenido dependiente del reloj.** Carreras, Estrategia, Roadmap y el
  Testing Center pintan fechas, cuentas atrás y ventanas relativas a «ahora»:
  cambian solas entre dos pasadas separadas en el tiempo. Los harnesses fijan
  `timeZone: Europe/Madrid`, que quita el salto de huso pero no el del reloj.
  Resueltos el fundido de entrada y los toasts (ver abajo), este es **el único
  ruido que queda**: dos pasadas seguidas de los 13 harnesses dejan 103 capturas
  con un **0,043 %** global, y las pocas que se mueven lo hacen aquí. La peor
  (**1,07 %**, `12-testing-center/orbit-testing-stable-1920x1080`) no es un
  fallo: la lista de próximas salidas avanzó una entrada porque una carrera
  arrancó entre las dos pasadas.
- **Changelog y versión.** `11-ajustes/orbit-ajustes-updates-*` pinta las
  novedades reales del changelog: cada entrada nueva mueve la captura entera.
- ~~**Animación de entrada en vuelo.**~~ **Resuelto (ISA-380).** El harness
  responsive cambiaba de sección y disparaba a mitad del fundido: el panel
  entero salía atenuado y desplazado un par de píxeles, y
  `01-shell/responsive/orbit-responsive-ajustes-1920x1080` llegaba a **30,1 %**
  de píxeles distintos entre dos pasadas idénticas. Todos los harnesses Orbit
  abren ahora la página con `scripts/lib/orbit-still.mjs`: `reducedMotion:
  'reduce'` (el mismo interruptor que el ajuste «reducir animaciones»), una
  hoja inyectada antes del arranque que anula animaciones y transiciones, y un
  `settle()` —fuentes resueltas, animaciones rematadas, dos frames— delante de
  cada captura. Medido con dos pasadas seguidas de `visual:orbit-responsive` y
  `visual:orbit-shell`: **0,000 %** en las 23 capturas. Si vuelve a aparecer
  ruido de este tipo, es que un harness nuevo se saltó el helper.
- ~~**Toasts a medio camino.**~~ **Resuelto (ISA-380).** Los toasts se cierran
  solos por temporizador, así que cuántos había en pantalla dependía de lo que
  hubiera tardado el harness en llegar hasta la captura: en Estrategia dos
  pasadas seguidas pillaban tres, uno o ninguno (**2,8 %** en
  `07-estrategia/orbit-estrategia-evento-propio-1920x1080`), y encima tapaban la
  fila de stints que la captura venía a auditar. `hideToasts()` los oculta con
  CSS antes de capturar en todos los harnesses menos dos: el del kit, que audita
  la pila de toasts, y el del Testing Center, que comprueba su texto. Se ocultan
  con CSS y no quitando los nodos a propósito: son nodos de React y arrancarlos
  por debajo rompe la reconciliación.

Cualquier otra diferencia sí merece mirarse: son las que delatan una regresión
de piel, como la selección de fila que se perdió al desduplicar CSS entre el kit
y la shell.
