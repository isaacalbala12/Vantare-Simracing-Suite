# Comparación local del transporte Overlay

Este ejecutable de laboratorio abre una WebView Wails real y alterna WebSocket local y Wails JSONStream. Ambos caminos envían 120 mensajes con el mismo JSON y el mismo acuse desde JavaScript, en tamaños de 8 y 64 KiB. Cada trama se comprueba por secuencia y longitud. Se usa el mismo proceso Go y la misma ventana para reducir diferencias de entorno. No modifica el overlay productivo.

En macOS, generar un bundle con un identificador propio, firmarlo de forma ad hoc y ejecutar `Contents/MacOS/benchmark`. La salida es una línea JSON por serie. La prueba finaliza tras seis series. Para repetir, ejecutar tres veces. No usar el binario fuera de un bundle: Wails necesita la identidad de aplicación en macOS.

Las métricas `wall_ms` y `cpu_ms` miden, respectivamente, el tiempo de las 120 entregas y la CPU del proceso Go durante esa serie. La CPU de WebKit no está incluida. `go_heap_peak_mib` es una muestra máxima del heap Go, no la memoria total del sistema ni una comparación rigurosa de memoria. Los percentiles de `performance.now()` se redondean a milisegundos en esta WebView y no sirven para detectar diferencias submilisegundo.

Esto mide el coste de transporte de ráfagas con acuse. No incluye el publicador, `OverlayPullTransport`, los parches de secciones, React ni telemetría LMU real; tampoco mide reemplazo de snapshots o recuperación tras reconexión. Una decisión de migración requiere una prueba integrada y Windows/WebView2.
