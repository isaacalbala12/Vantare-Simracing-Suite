# Standings Eficiencia: movimiento intermedio

Aprobado por Isaac el 22/09/2026: «deberíamos de hacer la opción intermedia, esto no es un broadcast; me gusta tu idea». Continúa VAN-41 / puente GitHub #1221. Primera entrega propuesta y aceptada: posiciones, vueltas y boxes, con escenas aisladas y combinada. Batallas y entrada/salida de la ventana se revisarán después.

## Comportamiento

- Posiciones: FLIP continuo de cada fila, con retarget desde su posición visual. Acento verde/rojo y chip temporal +N/−N junto al piloto durante 1,2 s. Se comparan posiciones canónicas, de clase en Multiclass, nunca índices de una ventana. El primer cambio también anima.
- Vueltas: mejora personal válida = tiempo nuevo menor que el anterior del mismo piloto. Barrido contenido en la celda, sin transformar cifras. Una mejor vuelta de sesión tiene prioridad y acento morado. El distintivo del más rápido cambia por opacidad; su autoridad se obtiene de toda la clasificación configurada, antes del recorte de filas. Un piloto que entra en ventana no recibe una falsa celebración.
- Boxes: PIT aparece/desaparece en unos 200 ms y acompaña el desplazamiento vertical de la fila. Su contenedor conserva identidad entre estados; no se modifica el ancho de la tabla. El estado sigue visible aunque se reduzcan las animaciones.
- Prioridad: mejor vuelta de sesión, posiciones, mejora personal. Máximo tres filas con avisos temporales simultáneos; los estados PIT y récord siguen representando el dato.
- Movimiento reducido: modo reduced conserva desplazamiento; minimal presenta cambios inmediatos. Interrupciones, stale, cambio de sesión/época y desmontaje limpian avisos y efectos. Nada se infiere de nombres, orden parcial, valores ausentes o datos antiguos.

## Implementación y revisión

Renderer productivo StandingsFunctional y hook específico sobre el motor compartido. Sin dependencias nuevas ni motor alternativo. La VM V2 aporta valores numéricos de mejor vuelta y récord de la clasificación para no parsear texto ni confundir recorte con evento. Workshop comparte renderer y añade escenas de vuelta personal, récord y secuencia combinada; mantiene Normal/Multiclass y mocks por sesión.

Verificación: derivaciones puras, montaje/actualización/desmontaje, política de movimiento y primer FLIP; pruebas de proyección y harness, build/TypeScript, lint y ratchet. Isaac verifica el resultado visual en Workshop antes de marcar Standings terminado. Sin nueva promoción de canal.

Auto-revisión: alcance acotado, duraciones iniciales concretas, sin campos pendientes ni dependencia de señales que no produce V2. Datos de vuelta sin calidad fresh no originan nuevos eventos. La aceptación de esta dirección no declara terminada su revisión visual.
