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

## Segundo bloque aprobado: batallas y ventana (22/09/2026)

Tras valorar positivamente el primer bloque, Isaac pide expresamente: «deberíamos de hacer esas 2 ahora». Se ejecutan los dos pendientes con el mismo criterio de conducción y sobre la PR #1306. El orquestador conserva seguimiento/revisión y un worker implementa en worktree separado desde el candidato `88b27f63`; nightly continúa en `1101f735`.

- **Batalla:** un único acento discreto y estable para dos rivales próximos de la misma clase, priorizando al jugador. Solo en carrera, con distancia temporal numérica fresh, posiciones de clase consecutivas y sin boxes, doblados ni datos inválidos. La VM proporciona la autoridad sin parsear textos formateados. Umbral inicial 0,8 s; retirada al superar 1,2 s para evitar parpadeos cerca del límite. Entrada/salida del acento por opacidad, sin pulsos repetidos, nueva caja ni cambio de altura. Los avisos de récord/posición/mejora mantienen su prioridad visual.
- **Ventana:** los pilotos que aparecen se revelan brevemente y los que desaparecen se desvanecen en su posición previa mientras los supervivientes se recolocan mediante el FLIP existente. Duración inicial 180–220 ms. PIT acompaña a la misma identidad. La representación transitoria de salida queda fuera de la geometría, de la accesibilidad y de la detección de eventos; conserva solo la última apariencia real y se elimina al acabar. No anima la primera carga ni un cambio de fuente, sesión, clasificación o política de movimiento; tampoco presenta recortes como adelantamientos.
- **Ciclo de vida:** retarget desde el estado visual actual; cancelación al pasar a stale/disconnected/error, desmontar o reducir movimiento. Sin nodos, timers o animaciones huérfanos; movimientos deshabilitados actualizan el contenido directamente. Evitar clonar la tabla o provocar renders React en cada tick únicamente para animar.
- **Workshop:** una escena de acercamiento/batalla/separación y una de entrada/salida de ventana. La escena de ventana debe cambiar el conjunto realmente visible; probar Normal y Multiclass con la configuración correspondiente. Mantener la combinación existente y añadir una secuencia completa si ayuda a revisar ambos bloques.
- **Aceptación técnica:** casos de gaps frescos/inválidos, misma clase, continuidad, hysteresis, boxes, doblados, prioridad del jugador y viewport; entrada, retirada, reentrada durante fade, cambio de fuente/política y desmontaje; primer bloque protegido. Pruebas focales y suite completa, build/TypeScript, lint, ratchet, revisión externa y actualización de roadmap/handoff/Notion.

Decisión de implementación: extender el hook específico y la VM puros ya existentes. Usar un estado visual breve de salida sobre las filas productivas, sin renderer alternativo ni dependencias. El enfoque de opacidad y FLIP conserva legibilidad y geometría con el mínimo movimiento. La revisión propia confirma alcance completo, umbrales concretos y ausencia de cambios en el contrato Go o autoridad inferida de texto. La validación visual final y LMU real siguen pendientes; no se autoriza merge por esta petición.

## Revisión continua en el harness

Isaac pide incluir ambas animaciones entre las que puede ver en el harness. Además de sus escenas individuales, la secuencia combinada que tiene abierta reproduce batalla y ventana después de vueltas, posiciones y boxes. Conserva las posiciones ya alcanzadas y los tiempos de vuelta. Cuando el fotograma declara una ventana de revisión, Workshop aplica ese recorte también en V1, sin cambiar el estilo ni la clasificación elegidos. El reloj mantiene los fotogramas exactos al muestrear a 15/30 Hz; se protege el avance manual y el recorrido completo en Normal/Multiclase. Ajuste de demostración dentro del alcance aprobado, sin cambiar el motor ni el renderer productivo.
