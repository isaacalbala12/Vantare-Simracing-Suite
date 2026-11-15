# Catálogo al lienzo: lógica previa al diseño

ADR 0109 PR 3, VANTA-138 / #1995. Depende del controlador de PR 2 (#2323).
Isaac ha detenido el montaje visual hasta tener la maqueta de Opus. Este corte
no activa un control nuevo ni cambia HTML, CSS o el aspecto del catálogo.

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

El futuro adaptador de puntero deberá capturar solo el puntero primario y llamar
a `cancel()` en Escape, pérdida de captura, cancelación y desmontaje. Deberá
enviar el resultado de `release` mediante `StudioProvider.execute` exactamente
una vez. La interacción actual de añadir con teclado/clic se conserva. No se
instalan listeners ni se cambia la seguridad modal antes de la maqueta.

El mock acepta `at` con la misma convención y límites del anfitrión. Un error de
añadido con posición activa la reconciliación de PR 2: lectura de `studio.get`,
sin reenviar el añadido ni dejar un reintento que duplique widgets. La lectura
actualiza la lista; no puede atribuir con certeza un nuevo ID al gesto perdido.

Pendiente de la maqueta: conectar los eventos al catálogo y al plano, silueta
visible, nombres/avisos accesibles y evidencia visual. No se presenta este corte
como la entrega visual completa de D025.
