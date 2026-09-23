# ISA-1332 — prueba de carrusel en Horizontal Standings

Isaac aprobó probar un movimiento continuo de derecha a izquierda **solo en la franja de pilotos**. El bloque de sesión/vuelta y el lateral de pista permanecen fijos. Esta prueba es opt-in; la presentación discreta ya integrada sigue siendo el valor por defecto.

## Implementación acotada

- El ajuste visual `driverCarousel: true` del registro Functional activa un rail CSS con dos pasadas idénticas de las filas que ya selecciona `rowCount`. La segunda pasada es decorativa, `aria-hidden` e `inert`, sin IDs de DOM ni identidad de fila para el motor FLIP.
- El viewport de pilotos recorta el rail. Ambas pasadas tienen el mismo ancho y el rail se traslada exactamente un ancho de pasada por ciclo lineal; no hay reloj React, mediciones periódicas ni cambios de telemetría para moverlo.
- El carrusel y el motor FLIP discreto se montan como presentaciones separadas, de forma que la limpieza WAAPI de la segunda no puede cancelar el rail CSS. `reduced`, `minimal` y `prefers-reduced-motion` muestran una sola pasada estática.
- Una escena específica de Workshop activa el ajuste usando el mismo renderer productivo, con vuelta 127 y datos estables. No añade controles ni cambia los perfiles guardados.

## Comprobación

Pruebas de manifest, render accesible, continuidad del nodo/animación ante cifras y orden, modos de movimiento y escena real de Workshop. Después, tipos, lint, build y ratchet de calidad. La revisión visual sigue siendo necesaria antes de decidir si este modo debe convertirse en opción permanente.
