# ISA-1403 — Framing IPC v1 inicial

Estado: framing implementado en Rust y conformidad wire del receptor Go bajo `internal/app/telemetryprocess/`. No hay named pipe, supervisor Go ni adquisición LMU conectados. La versión `1` identifica el framing local, no el esquema canónico ni las versiones de Overlay/Engineer/Strategy. La elección de codec para payload permanece abierta al benchmark JSON/binario de R06/R21.

## Framing implementado

Una trama es `length:u32 LE | version:u16 LE | kind:u16 LE | payload[length]`. La longitud cuenta solo el payload. El encabezado tiene 8 bytes; Rust y Go rechazan longitud mayor de **8 MiB** antes de reservar memoria, versión distinta de `1`, tipo desconocido, EOF dentro de encabezado/payload y bytes sobrantes en el decoder de una trama completa. Sus lectores/escritores soportan I/O parcial; todavía no establecen plazo ni cancelación de pipe. El decoder de buffer exige exactamente una trama; el lector de stream consume una trama y deja las siguientes para llamadas posteriores. Los dos lados prueban los mismos bytes wire fijos para los nueve tipos.

| Tipo | ID | Uso previsto |
| --- | ---: | --- |
| Handshake | 1 | Versión, identidad de instancia, binario y capacidades; payload por definir |
| Configuration | 2 | Demanda, configuración y revisión; payload por definir |
| ConfigurationAck | 3 | Aplicación de revisión; payload por definir |
| Snapshot | 4 | Estado completo por producto; payload por definir |
| Fact | 5 | Hecho ordenado y cursor; payload por definir |
| FactAck | 6 | Confirmación tras retener; payload por definir |
| ResyncRequired | 7 | Laguna irrecuperable y bootstrap; payload por definir |
| Status | 8 | Estado de fuente y salud de proceso; payload por definir |
| Stop | 9 | Cierre solicitado; payload por definir |

El límite de 8 MiB es un techo defensivo inicial para un solo mensaje, no una medición ni autorización para emitir frames de ese tamaño. R06 medirá el máximo real de cada producto con 104 coches y fijará límites por tipo antes de conectar el pipe. Ningún payload externo se acepta aún. El protocolo falla cerrado si la versión o el tipo no coinciden.

## Límites de diseño para completar antes de R05/R19

| Recurso | Límite inicial | Evidencia/estado |
| --- | ---: | --- |
| Longitud wire de una trama | 8 MiB | Implementado y probado en Rust y Go en el borde exacto. Falta máximo real con 104 coches. |
| Snapshot pendiente | 1 por producto | Diseño del plan; aún no hay writer/cola. |
| Facts pendientes | 64 | Referencia al valor por defecto de `EngineerFactQueueCapacity`; la retención y ACK del IPC aún no están implementados. |
| Callback Engineer | 250 ms | Valor por defecto Go actual, no un timeout IPC ya implementado. |
| Adquisición LMU SHM | 60 Hz nominal | Valor Go actual, no una frecuencia lograda en Rust. |
| Watchdog de fuente | 1 s | Valor Go actual; heartbeat de proceso tendrá reloj separado. |

Profundidad de control, heartbeat, deadline de escritura, retención de facts, presupuesto de reinicios y cierre requieren tests del pipe/lifecycle y quedan **sin fijar** en este corte. R04/R05 no se marcan completos hasta que la tabla sea numérica y esté protegida por pruebas de frontera. No se activa una ruta productiva con esa tabla incompleta.

## Dependencias

El esqueleto usa solo la biblioteca estándar de Rust; el framing Go usa solo su biblioteca estándar. `Cargo.lock` fija el paquete local; no se incorporó ninguna crate externa. Rust se fija en `1.95.0` para el target `x86_64-pc-windows-msvc`; `cargo test --locked` y `go test ./internal/app/telemetryprocess` comprueban framing, versión, límites, bytes wire e I/O parcial.
