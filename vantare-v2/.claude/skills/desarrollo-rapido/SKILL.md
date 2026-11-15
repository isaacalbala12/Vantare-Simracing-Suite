---
name: desarrollo-rapido
description: Cómo trabajar rápido en Vantare sin perder calidad (paralelismo, compilación, capturas, revisiones, contratos, diseño previo, medición y estimaciones). Úsala al planificar o estimar trabajo, al repartirlo entre workers, al empezar un encargo y siempre que algo esté esperando (cola, capturas, revisión).
---

# Desarrollo rápido en Vantare

Lo que ha hecho que el trabajo vaya rápido, y lo que lo ha frenado. Manda
`AGENTS.md` si algo choca. Cada regla nace de algo que pasó de verdad.

## 1. Repartir para ir en paralelo

- **Un PR por pieza independiente** (una pantalla, un widget, un arreglo).
  Varias piezas pequeñas se revisan y fusionan antes que una grande.
- **Contrato primero, luego las dos mitades a la vez.** Cuando una función
  necesita núcleo (Rust) e interfaz (web), un worker hace el contrato en el
  anfitrión con **vectores de prueba exportados**, y otro hace la interfaz
  contra esos mismos vectores. La interfaz no espera a que el núcleo esté
  fusionado para empezar: trabaja contra el PR y rebasea al final.
- **Nadie espera sin hacer nada.** Si un bloque está bloqueado por otro
  worker, el orquestador da otro bloque en el mismo mensaje (la «cola»).
- **Al terminar, el worker no se queda parado.** Sigue con lo siguiente de su
  cola; si no tiene nada, lo pide al orquestador en una línea en el mismo
  mensaje del PR final.
- **Reutilizar el mismo hilo para lo relacionado.** Un seguimiento de diseño va
  al mismo hilo de Opus que hizo el diseño; una enmienda de arquitectura, al
  mismo hilo de Fable. Ya tienen el contexto: sale antes y mejor.
- **Datos de ejemplo primero.** La interfaz se construye contra el anfitrión
  simulado (`hub-web/src/mock`) y los casos compartidos con el núcleo, así no
  espera nunca a que el núcleo esté terminado.
- **No duplicar trabajo.** Antes de mover o crear código compartido, mirar si
  otro worker ya lo está tocando (pasó con los ajustes de widget: `domain`
  frente a un crate nuevo).
- **Estimar por la velocidad real, no por volumen de código.** Referencia:
  todos los overlays pasaron a GPUI en menos de una semana. Contar con varios
  workers en paralelo al estimar.

## 2. Compilar sin esperar

- `comprobar.ps1 <crate>` en modo rápido (solo el crate tocado, ~2 min). La CI
  hace el resto. `-Full` y telemetría solo al tocar `runtime`, `domain`,
  `ipc`, `ui` o `storage`.
- La cola tiene **2 huecos** y pide RAM libre. Si está llena, **no termines el
  turno**: sigue escribiendo código y tests y deja la compilación encadenada.
- **Compila también en el Mac** cuando el servidor esté saturado (target
  propio, cuatro jobs; ver `native/README.md`).
- Si un fallo no tiene diagnóstico del compilador, repite con
  `VANTARE_SCCACHE=0` (sccache con incremental falló con `0xC0000005`).

## 3. Capturas sin pararlo todo

- `captura.lock` **reserva solo los dos huecos de compilación** (#2332): no
  hace falta pedir ventanas a mano ni parar a otros workers.
- Agrupa capturas: una sesión con todo lo terminado, no una por PR.
- Nada gráfico en el servidor salvo Electron con el lock. Overlays nativos y
  Rune: PC de juego o Mac, nunca delante de Isaac sin avisar.

## 4. Revisar y fusionar deprisa

- Cambio pequeño (CSS, textos, un caso de UI): **revisión del orquestador**.
  Contratos, núcleo, seguridad o PR grande: **revisión Sonnet** en paralelo
  con la CI, no después.
- Los detalles menores de una revisión van a un **PR pequeño posterior**; no
  bloquean la fusión si no hay fallo real.
- **Fusionar a diario.** Con varios workers en paralelo, un PR que espera días
  acumula choques; fusionando cada día son de una línea.
- Fusiona con `/c/VantareServer/ops/integrar-pr.sh` y **el head revisado**.
  Espera a que terminen todos los checks requeridos antes de lanzarlo.
- **PR apilados:** si el de abajo se fusiona por squash, el de arriba se
  rebasea con `git rebase --onto origin/nightly <head-viejo-de-abajo>`.
- **Versiones del protocolo:** se asignan en el orden de fusión, sin reservar
  números por adelantado.

## 5. Diseñar antes de construir

- Toda pantalla o cambio visual nuevo lleva **maqueta de Opus y OK de Isaac
  antes de programar** (lección: el lienzo de Studio se construyó dentro de la
  variante A sin maqueta y quedó diminuto).
- Mirar las capturas contra la referencia **antes** de fusionar.

## 6. Medir de forma justa y pronto

- **Prueba rápida antes que campaña larga:** 20–30 min dan la dirección;
  la campaña de horas solo para cerrar una fase.
- **Contar el trabajo antes de comparar consumo** (cuántas imágenes presenta
  cada motor y por qué). Sin eso, la comparación engaña (Rune presentó 70×
  más imágenes que GPUI).

## 7. Comunicación que no frena

- Los workers escriben al orquestador **solo** con PR final, bloqueo o P0/P1,
  siempre con número y head.
- Un bloqueo se escribe **con la pregunta concreta y la propuesta**, no solo
  el problema.
- Si una decisión es de producto o de diseño, se pregunta a Isaac **una vez,
  con opciones y recomendación**; lo técnico lo decide el orquestador.

## 8. Higiene que evita paradas

- Borrar los targets de ramas fusionadas y vigilar disco (C: ≥ 8 GB, D: ≥ 40 GB,
  Mac ≥ 10 GB). Nunca `du` masivo sobre D: (disco mecánico lento).
- Quitar worktrees limpios al fusionar (`git worktree remove`).
