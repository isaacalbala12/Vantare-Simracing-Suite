# Catálogo al lienzo: Vista Lienzo A

ADR 0109 PR 3, VANTA-138 / #1995. Depende del controlador de PR 2 (#2323).
El montaje utiliza la Vista Lienzo A aprobada: catálogo lateral sobre el plano,
sin modal centrado ni fondo inerte que impida soltar. Widget conserva el
catálogo modal anterior. Abrir el panel no reduce el tamaño del lienzo.

`catalogDropController()` es un controlador local de un solo gesto. `begin`
recuerda tipo y tamaño del lienzo; `preview` transforma coordenadas del viewport
usando el rectángulo real del plano, devuelve silueta y guías con el mismo
`geometry.snap` comprobado contra TODOS los vectores Rust; `release` consume el
gesto y devuelve como máximo una orden tipada `studio.add { kind, at,
baseRevision }`. El punto `at` es el origen superior izquierdo, no el centro.
Conserva fracciones y usa epsilon y umbral de imán generados desde Rust.

Se vuelven a comprobar permisos, límite, documento, operación pendiente y
resolución al soltar. Un cambio de revisión sin cambio de resolución usa la
última revisión; el anfitrión conserva la autoridad CAS. Un cambio de resolución
cancela. Soltar fuera (bordes derecho/inferior excluidos), superficie inválida o
no uniforme y cancelar producen cero órdenes. Las vistas no se modifican.

`catalog-inputs.ts` captura el puntero primario desde un agarre dedicado.
Cancela en Escape, pérdida de captura/foco, cambio de tamaño, desplazamiento,
pérdida de acceso y desmontaje. Un fallo de captura también cancela. El marco
del plano queda fijo durante el gesto. Silueta, imán y guías son locales.

El punto debe caer en el plano visible, no en el catálogo, los controles o una
zona recortada. Soltar fuera no añade ni deriva en un clic. `release` se envía
una sola vez con `StudioProvider.execute`. Añadir y el Intro del agarre siguen
añadiendo en un hueco libre sin arrastrar. El panel no atrapa el foco; Escape
cancela primero el gesto y luego puede cerrar el catálogo, sin salir de Lienzo.
También se puede soltar el primer widget en un lienzo vacío.

El mock acepta `at` con la misma convención y límites del anfitrión. Un error de
añadido con posición activa la reconciliación de PR 2: lectura de `studio.get`,
sin reenviar el añadido ni dejar un reintento que duplique widgets. La lectura
actualiza la lista; no puede atribuir con certeza un nuevo ID al gesto perdido.

El selector de monitor no cambia aquí. Se conectará al dato real que publique
E, sin inferir el monitor a partir de un preset personalizado.
