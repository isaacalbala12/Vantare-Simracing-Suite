# ISA-1044 — fechas locales y todas las salidas

C7 del plan #1027, independiente de C6. Rama vantareapp/isa-1044-calendar-local-days,
base dependiente C3 317ff133 sobre nightly d6d0992f. C2/C3 no se promocionan aquí.

Se sustituye el avance fijo de 24 horas por dayAnchor/setDate en las fechas civiles
de Día, Semana y Mes. La cantidad pedida al motor depende de la duración real de
la ventana y de los slots publicados, eliminando el ocho arbitrario y compartiendo
el cálculo con Timeline/Mes. El motor sigue aplicando la vigencia de C3.

En una hora repetida, agrupar y situar el timeline conserva el instante real;
las etiquetas añaden desplazamiento UTC para distinguirlo. El chip de Día conserva
el minuto e incluye ese desplazamiento solo en la hora ambigua. Sin CSS ni cambios
de estructura; el ajuste visual de textos en Wails sigue pendiente.

RED inicial: seis fallos con Madrid. GREEN: 12 pruebas en UTC y Madrid;
22 en Nueva York incluyendo vigencia; focal 124 PASS. Seed real: serie semanal
con doce slots en un día completo. Matriz civil controlada: días de 23/25 horas,
42 fechas únicas, medianoche, cambio de año y bisiesto, y horas repetidas.
Los tests de C3 ajustan dos entradas: una expiración UTC puede caer dentro de un
día local (se conservan solo sus salidas anteriores), y el día parcial se ancla
al inicio real de ese periodo, no al día UTC previo. No se relaja la vigencia.

Review d583c39c detectó un P2 para el retroceso de 30 minutos de Lord Howe:
regresión RED/GREEN añadida, 15 PASS en esa zona. La etiqueta usa la diferencia
real de offset; cuando una hora parcial empieza en :30, se localiza su transición
sin elegir la hora anterior ni inventar un :00. Focal final 126 PASS/1 omitido
(el caso específico de Lord Howe se ejecuta en su matriz propia).

Suite completa inicial: 3256 PASS / 2 FAIL, timeouts 20000 ms en Pedals y TrackMap
Endurance, superficies ajenas. Build/typecheck y lint finales, roadmap 23+21 PASS;
review independiente 411b5538 ACCEPT. No hay medición
CPU/GPU/RAM ni aceptación visual Wails. Los datos de prueba no certifican runtime.
Archivos: races-orbit-model, next-starts, RacesOrbitPage (chip), pruebas de fechas y
vigencia, informe/handoff/roadmap. Sin HUD/Studio, dependencia nueva, merge o release.

Verificar en build conjunta: navegar Día/Semana/Mes sobre cambio horario, comprobar
12 salidas donde estén publicadas y distinguir las dos horas repetidas al seleccionar
el detalle. Comparar antes/después conserva la distribución y las cinco vistas.
