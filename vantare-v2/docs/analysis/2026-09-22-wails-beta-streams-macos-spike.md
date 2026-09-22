# Wails v3 beta y Streams: prueba macOS (2026-09-22)

Tarea: [VAN-734](https://app.notion.com/p/3e3e51695c6581b78f38d9060575e31c). Base: `origin/nightly@1e9932c4d8ca3d53a58d093449cfb840f7108e8f`. Rama local: `spike/wails-beta-streams-mac`. Sin PR, merge ni release.

## Alcance

Se fijaron `github.com/wailsapp/wails/v3` y `@wailsio/runtime` en `3.0.0-beta.24`. El transporte productivo de Overlay y el HTTP/SSE de OBS no se cambiaron. El spike usa `app.HandleStream` y `JSONStream` en una aplicación Wails mínima, separada del producto.

La base actual de nightly usa un socket WebSocket local para Overlay por defecto (`overlay_socket.go`). Streams podría eliminar ese listener, pero eso requiere otro corte con pruebas de identidad de ventana, acuse, cierre, memoria y LMU real. El spike no acredita esa sustitución.

## Resultado real en macOS arm64

- `pnpm --dir frontend typecheck`: pasa.
- `pnpm --dir frontend build`: pasa.
- `pnpm --dir frontend test` con Node 22.23.2: 461 archivos, 3706 pruebas pasan y 2 omitidas. Con el Node 26 alpha del PATH local falla por `localStorage` no disponible; no se atribuye a Wails.
- `go build -tags production ./cmd/vantare`: pasa después de añadir stubs no Windows para la integración del launcher. Se generó un binario Mach-O arm64 de 36 MiB.
- Se creó localmente `bin/vantare-beta24.app` con el identificador `com.vantare.simracing.betatest` y firma ad hoc. La app arrancó con `-live=false`, abrió el Hub, respondió `GET /health` con 200 y sirvió `/overlay?profile=example-racing.json` con 200. El cierre por SIGINT fue limpio. Ejecutar el binario sin bundle fallaba porque el servicio de notificaciones exige identificador de aplicación.
- Spike nativo: 120 tramas de 65.536 bytes cruzaron Go → WebView; JavaScript verificó orden y longitud y envió un acuse por Stream antes de cada siguiente trama. Resultado: PASS, sin puerto TCP del spike.
- `go test ./cmd/vantare -run TestOverlaySocketPreservesACKAndWindowRevocation`: pasa. `go test ./internal/app/telemetrytransport`: pasa.
- `go test ./...`: no queda verde en este Mac. Dos pruebas de `internal/app` fallan también en el checkout base de nightly por ausencia del directorio `telemetry/sessions` y falta del evento de diagnóstico. La suite completa quedó además detenida en `internal/app/launcher` y se interrumpió tras más de dos minutos. No se infiere regresión de la beta a partir de ese resultado.

## Conclusión y siguiente prueba

La beta compila y arranca Vantare en macOS, y Streams funciona de extremo a extremo con acuse explícito. No hay medición comparativa de memoria, latencia o carga frente al socket actual. La decisión de reemplazar el transporte Overlay requiere un experimento separado sobre el mismo protocolo y una prueba Windows con LMU y WebView2 reales. No se publica esta build a testers.

## Comparación del transporte (2026-09-22)

Se añadió un laboratorio reproducible en `tools/wails-transport-benchmark`. En la misma WebView Wails v3.0.0-beta.24 y el mismo proceso Go, se alternaron WebSocket local y JSONStream. Cada serie entregó 120 mensajes JSON de 8 o 64 KiB, uno por acuse, verificando orden y tamaño. Hubo tres ejecuciones del proceso; la tabla muestra la mediana de las series (dos series de 8 KiB y una de 64 KiB por ejecución):

| Carga | Transporte | Tiempo para 120 tramas | CPU del proceso Go |
| --- | --- | ---: | ---: |
| 8 KiB | WebSocket | 39,5 ms | 11,2 ms |
| 8 KiB | Streams | 54,2 ms | 70,1 ms |
| 64 KiB | WebSocket | 47,3 ms | 16,0 ms |
| 64 KiB | Streams | 67,7 ms | 83,0 ms |

En esta ráfaga el socket fue aproximadamente 1,4 veces más rápido y Streams consumió entre 5 y 6 veces más CPU de Go. Las series completas variaron, especialmente al competir con otras tareas del Mac: para 8 KiB, el socket tardó 24,4–65,3 ms y Streams 42,7–149,2 ms; para 64 KiB, 44,3–90,7 ms y 61,7–113,7 ms respectivamente. No se detectó desorden ni pérdida en ninguna serie.

Se intentó una cadencia artificial de 60 Hz. WebKit ralentizó los temporizadores de la ventana durante la ejecución y algunas series de 120 mensajes duraron 14 segundos; se descartan sus tiempos para la comparación. La prueba útil es de ráfagas, no una simulación validada a 60 Hz.

La CPU medida corresponde solo al proceso Go, no al proceso WebKit. Las muestras de heap Go y los percentiles de JavaScript no permiten una conclusión de memoria o latencia submilisegundo. El laboratorio reproduce el intercambio con acuse, pero no ejecuta `OverlayPullTransport`, el publicador, los parches, React ni LMU. Por tanto, **el transporte Streams no muestra una mejora de rendimiento en macOS; el pipeline completo todavía no ha sido comparado**. Mantener el WebSocket actual y reservar la prueba integrada con telemetría real para Windows antes de proponer un cambio.
