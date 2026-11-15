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
borde. Mayús acelera y Escape cancela. Hay nueve
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
iniciar el gesto se propaga sin consumir. El teclado usa
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
entrada libre de resolución no se ofrece; arrastrar desde el catálogo pertenece
a la entrega posterior.

### Origen del plano y pérdida de foco

Durante el gesto se conserva el desplazamiento (`shift`) del último plano en
reposo y se suspende el auto-scroll de selección. El borrador puede cruzar cero
sin mover su marco bajo el puntero. Al acabar/cancelar vuelve a calcularse el
origen y se recupera el desplazamiento de selección. La pérdida de foco de la
ventana cancela tanto puntero como teclado sin guardar el borrador.

## Diseño aprobado: Vista Lienzo A (15-11-2026)

El selector Widget | Lienzo vive en FocusHeader. En Lienzo se sustituye el
escenario y se ocultan los pasos, conservando su montaje/estado. La cabecera
se compacta y el plano recibe todo el alto restante. La única barra inferior
contiene posición, Anclar, proporción, tamaño automático, estado, zoom,
Encajar y Listo. Esc cancela el gesto y nunca cambia la vista. Al salir con
Listo se devuelve el foco a Widget; al entrar, al widget seleccionado.
Los tiradores siguen siendo operables programáticamente y con Alt + flechas,
pero no añaden ocho paradas al recorrido secuencial.

La resolución se elige en presets fijos con tarjetas como Rendimiento; no hay
entrada libre. `studio.canvas` usa CAS. Tu monitor envía `{kind:monitor}`;
solo un preset envía `{kind:custom,width,height}`. Con source=monitor se muestra
su resolución detectada. Si el documento ya arrancó personalizado, el contrato
no publica por separado el monitor: la opción sigue permitiendo volver a él,
pero no se inventa su tamaño antes de la respuesta. Una resolución detectada
en esta sesión se conserva para la etiqueta al elegir luego un preset.

La miniatura y el enlace de la tira abren la misma vista. La lista y el plano
comparten selección; ocultos permanecen visibles en gris al 35 %, y fuera de
lienzo se mantiene la posición real. No se añade otro pintor ni preview real.

Corrección visual de Isaac: el monitor encaja contra toda la superficie medida,
sin descuentos de padding ni marco rayado o sombra exterior. El espacio que
sobra por la proporción es neutro. La nota flota sobre el tablero; ayuda y
resolución están en la barra inferior. Al entrar en Lienzo se contrae la
navegación principal y al salir se restaura su estado anterior; abrirla a mano
durante la edición se respeta. La lista de widgets se puede contraer a miniaturas
y recuerda esa elección durante la sesión. Ninguno de estos cambios escribe al
anfitrión. Chromium comprueba el encaje mínimo del 60 % y 52 % con la navegación
contraída, respectivamente a 1440×900 y 1280×800, con la lista abierta.
