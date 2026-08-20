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
- **Changelog y versión.** `11-ajustes/orbit-ajustes-updates-*` pinta las
  novedades reales del changelog: cada entrada nueva mueve la captura entera.
- **Animación de entrada en vuelo.** El harness responsive cambia de sección y
  dispara: si la captura cae a mitad del fundido, el panel entero sale
  atenuado y desplazado un par de píxeles. Es la diferencia más ruidosa de
  todas (`01-shell/responsive/orbit-responsive-ajustes-*` puede irse a un
  tercio de la imagen) y no significa nada: la referencia buena es la captura
  con el panel ya asentado.

Cualquier otra diferencia sí merece mirarse: son las que delatan una regresión
de piel, como la selección de fila que se perdió al desduplicar CSS entre el kit
y la shell.
