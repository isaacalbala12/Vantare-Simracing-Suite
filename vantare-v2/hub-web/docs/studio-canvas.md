# Lienzo web de Studio — ADR 0109, PR 2

La vista Widget de la maqueta A sigue siendo la entrada. «Lienzo» abre el plano
del diseño y «Widget» vuelve al inspector habitual. La selección se comparte
con la tira lateral. Las imágenes son las ilustraciones existentes, no una
captura del overlay real (preview: PR 4 y 5 del ADR).

El lienzo y las posiciones proceden de `StudioView`. No se inventa una
resolución si falta `canvas`. Un widget fuera del plano conserva su posición:
el área desplazable lo incluye y lo identifica con un borde discontinuo.

Arrastrar mueve; los ocho tiradores redimensionan. Flechas mueven la selección;
Alt + flechas cambia su tamaño; en un tirador las flechas actúan sobre ese
borde. Mayús acelera y Escape cancela. Hay botones de desplazamiento y nueve
anclas como alternativa al arrastre. El zoom y Encajar son locales y no escriben.

Durante un gesto solo cambia un borrador. Soltar el puntero o la tecla envía
una orden `studio.geometry` con la revisión vigente. Solo hay una petición
en vuelo y una intención en espera; la última reemplaza la anterior. Si cambia
la geometría de partida, el lienzo, los derechos o el estado en pista, se
descarta el gesto. Un conflicto adopta `current`, muestra el aviso y solicita
una lectura; nunca reenvía la escritura automáticamente.

Un error de resultado incierto (incluido timeout) también solicita `studio.get`.
El proveedor mantiene un bloqueo de escrituras hasta una lectura correcta,
incluso al alternar Lienzo/Widget. Si falla la lectura, «Volver a cargar» solo
repite esa lectura; no se puede descartar el bloqueo ni repetir una mutación
pendiente. El borrador y la intención en cola se descartan. «Actualizado» solo
se anuncia si la vista recibida coincide con el objetivo mediante `sameBox`;
un conflicto explícito nunca se convierte en confirmación de guardado.

Mayús se toma al empezar el gesto y no cambia por las repeticiones del sistema.
Un fallo de `setPointerCapture` cancela sin escribir; una flecha que no puede
iniciar el gesto se propaga sin consumir. El teclado y los botones comparten
`geometry.nudge`; la repetición agrupa sus pasos manteniendo el mismo clamp.

**Redondeo:** se conservan las coordenadas fraccionarias del contrato v37.
El GPUI congelado redondea al terminar el empujón, pero el módulo canónico de
Rust `studio::geometry::nudge` conserva fracciones. No se introduce una regla
distinta solo en Electron: redondear también el dato requeriría acordarlo en
el módulo canónico y sus vectores. Solo se redondea la etiqueta visual.

## Igualdad con Rust

`tests/studio-geometry.test.ts` recorre **todos** los elementos de las ocho
familias de `studioGeometryCases` generado por Rust, incluidos los aspectos
extremos. Las coordenadas flotantes usan exclusivamente la tolerancia absoluta
exportada `studioGeometryLimits.epsilon` (1e-7 en v37), sin redondear los datos.
Los nulos, las claves y la estructura se comparan exactamente; también las
distancias enteras del teclado. Una familia nueva hace fallar el guard hasta
que tenga comprobación. El redondeo de la barra de coordenadas solo es visual.

## Verificación

- Vitest: vectores Rust, ciclo del gesto, cola, revisiones, conflicto, captura
  perdida, Escape, desmontaje, teclado, anclas y zoom sin escritura.
- `scripts/check-studio-canvas.ts`: puntero y teclado en Chromium real; se
  ejecuta desde `web-a11y.ts` en el job web existente.
- Escenas QA: `studio-canvas`, `studio-canvas-outside`,
  `studio-canvas-conflict`, `studio-canvas-readonly`. Solo núcleo simulado.
- Capturas: `visual-diff.ts --scene studio-canvas --capture-only`, con los
  procedimientos de `studio-focus-captures.md`, cerrojo global y sin Rust.

No se cambia el protocolo, el anfitrión, el instalador ni el núcleo. La
resolución manual y arrastrar desde el catálogo pertenecen a entregas posteriores.

### Origen del plano y pérdida de foco

Durante el gesto se conserva el desplazamiento (`shift`) del último plano en
reposo y se suspende el auto-scroll de selección. El borrador puede cruzar cero
sin mover su marco bajo el puntero. Al acabar/cancelar vuelve a calcularse el
origen y se recupera el desplazamiento de selección. La pérdida de foco de la
ventana cancela tanto puntero como teclado sin guardar el borrador.
