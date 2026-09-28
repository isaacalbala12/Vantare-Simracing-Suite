# ISA-1403 — Framing IPC v1 inicial

Estado: framing Go/Rust y un harness Windows de hijo Rust conectado a named pipe. El harness solo realiza Handshake → Stop; no adquiere LMU ni se integra en Wails. La versión `1` identifica el framing local, no el esquema canónico ni las versiones de Overlay/Engineer/Strategy. La elección de codec para payload permanece abierta al benchmark JSON/binario de R06/R21.

## Framing implementado

Una trama es `length:u32 LE | version:u16 LE | kind:u16 LE | payload[length]`. La longitud cuenta solo el payload. El encabezado tiene 8 bytes; Rust y Go rechazan longitud mayor de **8 MiB** antes de reservar memoria, versión distinta de `1`, tipo desconocido, EOF dentro de encabezado/payload y bytes sobrantes en el decoder de una trama completa. Sus lectores/escritores soportan I/O parcial; todavía no establecen plazo ni cancelación de pipe. El decoder de buffer exige exactamente una trama; el lector de stream consume una trama y deja las siguientes para llamadas posteriores. Los dos lados prueban los mismos bytes wire fijos para los nueve tipos.

| Tipo | ID | Uso previsto |
| --- | ---: | --- |
| Handshake | 1 | Harness: nonce de instancia de 16 bytes, longitud de versión `u8` (1–64) y versión UTF-8 exacta del paquete Rust. Las capabilities productivas aún no están definidas. |
| Configuration | 2 | Demanda, configuración y revisión; payload por definir |
| ConfigurationAck | 3 | Aplicación de revisión; payload por definir |
| Snapshot | 4 | Prototipo Overlay V2 JSON: sobre `{"product":"overlay-v2","update":UpdateV2}`; Engineer/Strategy y codec final pendientes |
| Fact | 5 | Hecho ordenado y cursor; payload por definir |
| FactAck | 6 | Confirmación tras retener; payload por definir |
| ResyncRequired | 7 | Laguna irrecuperable y bootstrap; payload por definir |
| Status | 8 | Estado de fuente y salud de proceso; payload por definir |
| Stop | 9 | Cierre solicitado; payload por definir |

El límite de 8 MiB es un techo defensivo inicial para un solo mensaje, no una medición ni autorización para emitir frames de ese tamaño. R06 medirá el máximo real de cada producto con 104 coches y fijará límites por tipo antes de conectar el pipe. Ningún payload externo se acepta aún en el runtime productivo. El protocolo falla cerrado si la versión o el tipo no coinciden.

## Snapshot Overlay V2 inicial (2026-09-28)

El payload JSON de `KindSnapshot` lleva exactamente `product` y `update`.
`product` es `overlay-v2`; `update` es el contrato `UpdateV2` completo, cuyo
`frame.contract` y `frame.algorithm` valen `2`. Rust exige las secciones
Overlay presentes y comprueba estado de fuente y máscara antes de emitir;
el framing aplica el límite de 8 MiB. Go decodifica el sobre y el update
sin campos desconocidos, exige un único JSON, el producto, versión, estado
y máscara conocidos. Este payload es un prototipo de R06, no el codec final
R21 ni una ruta productiva.

`rust/telemetry/testdata/overlay-snapshot-frame-rust-v1.bin` son 24 353 bytes
producidos por el encoder Rust desde el oráculo real estático de 44 y
decodificados por Go como el mismo `UpdateV2`; SHA-256
`15d1328fb1f8a5774ea8986f234a222b8bc25f8b9ea42a257c3adb1389dcb82f`.
La captura sigue siendo un instante, sin 104 ni temporalidad SHM+REST.

## Harness Windows actual

Go genera 16 bytes aleatorios por instancia y reserva `\\.\pipe\vantare-telemetry-<32 hex>` con una DACL protegida para el SID de la sesión de inicio, `PIPE_REJECT_REMOTE_CLIENTS`, primera instancia exclusiva y un solo servidor. Crea el hijo suspendido con entorno vacío y sin handles heredados, lo asocia a un Job Object con `KILL_ON_JOB_CLOSE`, y después lo reanuda. La aceptación del pipe tiene un máximo de 2 s y compara el PID real del cliente con el proceso lanzado. El cierre del job mata al hijo si continúa activo. El harness Rust abre ese pipe, envía el handshake con nonce y versión, espera un `Stop` vacío y sale. Go verifica la versión esperada `0.1.0` en el test conjunto, sin convertir el nombre o nonce en una credencial.

Estas garantías están probadas en el harness, no conectadas todavía al runtime productivo: faltan plazos de lectura/escritura y su cancelación bajo carga, colas/snapshots/facts, reinicios, configuración, bootstrap y supervisión desde Wails. `TestRustChildPipeHandshakeAndStop` requiere `VANTARE_TELEMETRY_RUST_TEST_HELPER` apuntando al binario `cargo build --release --locked --target x86_64-pc-windows-msvc`; una ejecución con `Skip` no acredita este gate.

## Límites de diseño para completar antes de R05/R19

| Recurso | Límite inicial | Evidencia/estado |
| --- | ---: | --- |
| Longitud wire de una trama | 8 MiB | Implementado y probado en Rust y Go en el borde exacto. Falta máximo real con 104 coches. |
| Snapshot pendiente | 1 por producto | Diseño del plan; aún no hay writer/cola. |
| Facts pendientes | 64 | Referencia al valor por defecto de `EngineerFactQueueCapacity`; la retención y ACK del IPC aún no están implementados. |
| Callback Engineer | 250 ms | Valor por defecto Go actual, no un timeout IPC ya implementado. |
| Adquisición LMU SHM | 60 Hz nominal | Valor Go actual, no una frecuencia lograda en Rust. |
| Watchdog de fuente | 1 s | Valor Go actual; heartbeat de proceso tendrá reloj separado. |
| Aceptación de pipe | 2 s | Implementado y probado con deadline en Windows. |
| Cierre de hijo | 2 s | Implementado con Job Object y probado en Windows; falta matriz completa de fallos. |

Profundidad de control, heartbeat, deadline de escritura bajo carga, retención de facts, presupuesto de reinicios y cierre del runtime productivo requieren tests adicionales y quedan **sin fijar** en este corte. Los 2 s de cierre del harness no certifican el cierre del pipeline live. R04/R05 no se marcan completos hasta que la tabla productiva sea numérica y esté protegida por pruebas de frontera. No se activa una ruta productiva con esa tabla incompleta.

## Dependencias

El esqueleto usa solo la biblioteca estándar de Rust; el framing Go usa solo su biblioteca estándar. `Cargo.lock` fija el paquete local; no se incorporó ninguna crate externa. Rust se fija en `1.95.0` para el target `x86_64-pc-windows-msvc`; `cargo test --locked` y `go test ./internal/app/telemetryprocess` comprueban framing, versión, límites, bytes wire e I/O parcial.
