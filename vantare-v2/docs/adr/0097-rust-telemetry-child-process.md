# ADR 0097 — Telemetry Core live en un proceso hijo Rust

Fecha: 2026-09-27. Issue: [ISA-1403](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1403).

## Estado y autoridad

Diseño confirmado por Isaac en la conversación de ISA-1403 y recogido para
planificación. Revisión documental del orquestador completada; incorporadas sus
correcciones sobre autorización de crates y agrupación de cortes en issues.
**Implementación iniciada solo en el esqueleto inerte; paridad, rendimiento,
integración y publicación pendientes**.
La confirmación de diseño no acredita una mejora ni una promoción de canal.

Esta ADR enmienda la elección de lenguaje/ubicación de la autoridad de dominio
en [ADR 0004](0004-telemetry-core-modular-observation-architecture.md),
[ADR 0008](0008-telemetry-engine-commit-boundary-and-overlay-frame-v2.md) y la
fila «Go como autoridad de dominio» del
[maestro de Telemetría V2](../superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md).
Conserva sus garantías de producto, commit, calidad, tiempo, hechos y aislamiento.
No sustituye ADR de histórico/capabilities ni reabre Overlay V1.

## Contexto comprobado

La base `355e9cfee2fec3c27341fa96ec4e6a9297fab730` compone LMU, Core y productos
en Go desde `cmd/vantare/main.go` e `internal/app/telemetry_core_runtime.go`.
`TelemetryEngine.Apply` prepara reducer, coordinador y derive antes de hacer
visibles estado, cursores y hechos. Overlay V2 y Engineer tienen consumidores
live; Strategy se proyecta según wiring y su flag de transporte permanece OFF
por defecto. El recorder SQLite existente no está conectado a esa composición.

Isaac ha elegido mover el camino productivo completo de telemetría a Rust para
buscar una reducción sustancial de CPU manteniendo los contratos. El experimento
ISA-1379 solo estudió un tramo del mapper; no certifica el coste total ni sirve
para justificar por sí mismo la migración. Un control Go equivalente separará
los efectos del algoritmo, lenguaje y nueva frontera IPC.

## Decisión

1. Distribuir `vantare-telemetry.exe` como hijo Windows amd64 del host Go/Wails.
   Es parte de la app local, con la misma cuenta de usuario y lifecycle; no un
   servicio instalado ni un microservicio desplegable.
2. Rust será el único owner productivo de LMU SHM y REST, fusión, catálogo/estado
   canónico, identidad, derivaciones y proyecciones. Core conserva neutralidad de
   simulador y commit single-writer sin I/O. Parsers/Win32 separan bytes no
   confiables y recursos OS de los tipos de dominio.
3. Go mantiene Wails, servicios de producto, supervisión y entrega de las
   proyecciones. Engineer/Spotter decide producto en Go; Strategy y Analysis
   histórico mantienen su lógica y almacenamiento. La migración no duplica
   dominio en frontend ni crea otro renderer.
4. IPC local por named pipes con acceso restringido y protocolo versionado.
   Se comparan JSON y un candidato binario con paridad y coste de ambos extremos;
   la elección final se documenta con resultados. No usar layouts Rust como ABI.
5. La definición wire externa Go y su generador TypeScript siguen vigentes.
   Rust implementa proyecciones compatibles y pasa conformidad. Canonical,
   producto e IPC tienen versiones independientes; no se propaga el estado
   canónico entero a los productos para evitar diseñar su proyección.
6. Snapshots completos latest-wins, con colas limitadas por producto. Facts
   ordenados y retenidos con cursor/ACK; una laguna exige resync explícito con
   contexto nuevo. Bootstrap coherente relaciona snapshot, epoch y high-water
   mark. Los errores de consumidor no bloquean ni revierten el commit.
7. Go envía demanda y configuración efectiva con revisión/ACK. Rust conserva
   cadencias y proyecciones solo cuando hay destino. Go no recalcula valores
   canónicos; sí publica la pérdida de conexión del proceso y evita mostrar
   datos viejos como fuente live.
8. Handshake verifica versiones e instancia antes de adquirir LMU. Un lease
   compartido entre backends garantiza exclusión; desconectar un pipe no basta
   para declarar libre la fuente. Go controla shutdown, Job Object, timeouts,
   presupuesto de reinicios y estado desconectado al agotarlo.
9. Replay Rust es un harness de paridad. No portar SimX; un pequeño driver Rust
   solo de pruebas verifica que Core y proyecciones admiten una fuente diferente
   y capacidades parciales sin conocer LMU. No exponerlo en el binario productivo.
10. Analysis histórico y recording SQLite no conectado quedan fuera. Preservar
    contratos/lectores históricos mientras tengan consumidores; no añadir
    recording en Rust ni activar grabación como requisito escondido del port.

## Restricciones Windows y de datos

Crear el pipe con DACL explícita de la sesión de inicio de sesión, derechos
mínimos, rechazo remoto, nombre por ejecución y peer verificado. El descriptor
por defecto no proporciona el aislamiento requerido. Usar longitudes y buffers
acotados, I/O cancelable y mensajes parciales comprobados. [Seguridad de pipes](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights),
[CreateNamedPipe](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createnamedpipea).

El hijo se ejecuta sin consola visible desde ruta absoluta verificada y se
asocia a un Job Object que asegura su terminación si muere el host. Su entorno
explícito contiene solo `SystemRoot`, obtenido de Windows: el cliente HTTP
loopback de LMU lo necesita para funcionar dentro del Job Object. No hereda
secretos ni otros valores del entorno del host, ni handles innecesarios. El
heartbeat IPC puede incluir contadores acumulados de ticks SHM y reportes REST
para detectar trabajo perdido sin exponer payloads. La build/installer/portable/updater conservan
la pareja de binarios y sus hashes/versiones. [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

Fijar Rust y target `x86_64-pc-windows-msvc`, junto con herramientas Windows
compatibles y lockfile. **Q4=C autoriza explícitamente crates sin límite numérico
cuando faciliten este port**, sin nueva aprobación por crate dentro del alcance.
Registrar por cada una necesidad, alternativa, licencia, evaluación de seguridad,
impacto en tamaño y versión fijada. Si una dependencia cambia el alcance,
aplica el gate de alcance. No se elige un runtime async por defecto.
[Soporte Windows MSVC](https://doc.rust-lang.org/rustc/platform-support/windows-msvc.html),
[lockfiles Cargo](https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html).

Frescura y elapsed usan relojes monotónicos; tiempo de fuente y UTC conservan
funciones separadas. Los relojes privados Go/Rust no son valores de wire. El
benchmark entre procesos propone QPC de la misma máquina, con instancia y
frecuencia verificadas. [Relojes Windows](https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps).

## Gates de aceptación

- Paridad completa sobre capturas LMU reales sanitizadas: valores, calidad,
  presencia, unidades, identidad, tiempos, cursores, hechos y proyecciones.
  Pruebas de commit atómico, drivers neutrales, consumidores lentos, fallos de
  fuente/IPC, reinicio, cierre y boundedness.
- CPU de Rust **más IPC y recepción/entrega Go** al menos 50% menor que Go de
  algoritmo equivalente en un escenario temporal real de al menos 46 coches. Comparación
  obligatoria adicional con Go actual; misma máquina, frecuencias, consumidores
  y trabajo. p99 no peor y RSS agregado como máximo 110% de la base equivalente.
  Las fórmulas, corridas, ruido y evidencia se fijan en el plan.
- Corpus temporal real acreditado con al menos 46 coches. El fixture estático
  de 44 y el benchmark construido de 104 no sustituyen esa evidencia. Isaac
  retiró el requisito de dos tamaños separados el 2026-09-29; el límite de
  capacidad de 104 vehículos del protocolo sigue siendo un contrato técnico.
- Sesión física LMU/Wails/OBS funcional, build/CI Windows, packaging de la pareja
  y rollback verificado. Repetir los gates afectados sobre el binario final
  después de retirar Go; no heredar resultados de un candidato diferente.

## Transición y rollback

Go permanece normal durante los cortes de harness. La selección Rust para
validación se habilita solo en candidato aislado con paridad completa. La
selección temporal al arranque es exclusiva: sin shadow live con dos readers,
sin cambio automático a Go al fallar el hijo. Antes de volver a Go, confirmar
salida del hijo y lease libre; resetear contexto y dar un snapshot completo.

Retirar adquisición/Core/derive/builders Go por familias con consumidores cero
después de pasar gates y aceptar el candidato. Conservar DTO/adaptadores y
paquetes históricos que sigan vivos. El oráculo queda como referencia de prueba
fijada a SHA; el producto final no mantiene dos engines.

Tras la retirada, rollback mediante la pareja de binarios/build anterior
verificada y, si hubo integración autorizada, PR de revert al mismo canal.
Nightly requiere autorización específica de Isaac; aprobación de diseño o del
plan no concede promoción a Nightly, Testers, Master o release.

## Alternativas y consecuencias

- Optimizar solo Go conserva una frontera más simple y sigue siendo el control
  obligatorio. El usuario ha elegido el port completo condicionado a evidencia;
  un fallo del gate mantiene esa cuestión abierta, no convierte el control en
  una supuesta certificación de Rust.
- Una DLL con FFI no es la arquitectura seleccionada. El proceso hijo aporta
  una frontera de lifecycle/fallo, con coste adicional de IPC, RSS y packaging
  que debe caber en los gates.
- Un Core exclusivo de LMU contradice la decisión de neutralidad confirmada.
  El driver pequeño de prueba protege esa frontera sin portar SimX.
- Portar SQLite/histórico ampliaría el trabajo fuera del runtime live acordado.
  Se conservan para una issue futura y su propio contrato.

El principal riesgo es que el coste total no alcance el 50%, incluso con un
engine Rust más rápido. También aumentan las obligaciones de versiones,
recuperación, distribución y observabilidad. El plan coloca IPC, corpus y
medición al principio para detectar esos límites antes de retirar Go.

## Plan y siguiente acción

[Plan ejecutable ISA-1403](../superpowers/plans/2026-09-27-rust-telemetry-port.md)
define inventario, microcortes R01–R28, checks y dependencias. Los Rxx son un mapa
técnico agrupable en issues con objetivo coherente, diff revisable, archivos
previstos, pruebas y evidencia; no exigen una issue por fila ni un límite rígido
de archivos. Preparar R01–R03 es la siguiente acción; no
está implementado ninguno de esos cortes.
El [handoff vivo](../vantare-program/handoffs/telemetry-core.md) y la issue
coordinadora registran el estado real y la discrepancia de roadmap encontrada
en la base; esta ADR no afirma una actualización pública.
