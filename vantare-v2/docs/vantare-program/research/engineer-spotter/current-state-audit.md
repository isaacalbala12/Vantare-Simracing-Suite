# Auditoría del estado actual

Base: `67e263392b2192ee11f2ef4ccb161331dda3c735`
Alcance: lectura de código y tests; no se ejecutó LMU ni audio real.

## Veredicto

**REWRITE de la composición y del scheduler, con migración caracterizada de la
lógica útil.** La implementación actual no cumple los contratos de honestidad,
fuente única, frescura, preempción, Pit seguro ni cuatro idiomas.

## Hallazgos por severidad

### P0 — el producto presenta datos sintéticos como conexión real

- `internal/engineer/service/engineer_service.go:146-159` crea el servicio con
  `enabled=true`, `connected=true` y `source="simulator"`.
- `frontend/src/hub/pages/EngineerPage.tsx:4-9` repite el mismo estado inicial.
- `cmd/vantare/main.go:829-835` arranca el servicio, pero no inyecta
  `SetBufferProvider`, `SetAudioPlayer`, `SetAudioResolver` ni `SetAudioRouter`.
- `internal/engineer/service/engineer_service.go:613-620` considera saludable
  cualquier servicio habilitado con una fuente no vacía, aunque no exista
  conexión real ni dato fresco.

Impacto: UI, health y notificaciones pueden parecer vivas sin LMU. Es contrario
al contrato «dato ausente = no disponible» y bloquea cualquier beta honesta.

### P0 — Spotter no tiene prioridad absoluta en audio

- `internal/engineer/audio/queue.go:14-48` mantiene una slice sin capacidad
  máxima, la ordena completa y solo elimina expirados al extraer.
- `internal/engineer/audio/message.go:3-58` solo modela prioridad normal/spotter;
  no lleva requisitos de señal, estado esperado, política de interrupción ni
  clave de cooldown/dedupe.
- `internal/engineer/service/engineer_service.go:529-568` usa un bloqueo global
  de 2,5 s, reproduce en goroutines y no puede cancelar el audio activo. Un
  mensaje anterior puede impedir un peligro nuevo.
- La notificación visual se publica antes de confirmar que el audio empezó
  (`engineer_service.go:500-527`).

Impacto: no hay garantía de preempción, de orden audible, de ausencia de
solapamiento ni del objetivo p95 menor de 150 ms.

### P0 — Pit Manager no es una transacción segura

`internal/engineer/pitmanager/` contiene un cliente REST y tipos, pero no un
estado preparar/confirmar/verificar, idempotencia, nonce, vinculación a sesión,
lectura posterior ni tratamiento explícito de capacidad/frescura. El modo
dry-run puede terminar sin error y no distingue «simulado» de «aplicado». No se
encontró consumidor de producto.

Impacto: una escritura no puede demostrarse aplicada al coche/sesión correctos.
Debe permanecer deshabilitada hasta ENG-13.

### P1 — dos rutas de telemetría y ceros ambiguos

- No existe `internal/telemetry/projection/engineer`.
- El catálogo de Telemetry Core observado expone 24 señales, varias con
  unidad/rango aún desconocidos. No cubre todavía todas las dependencias del
  Engineer legacy.
- `internal/engineer/telemetry/model.go` define un frame amplio con valores
  escalares implícitos. Un cero legítimo, una ausencia y un dato viejo no se
  distinguen de forma sistemática.
- El servicio legacy conserva parser/lectores LMU y adaptadores propios. Esa
  lectura paralela puede divergir de Telemetry Core.

Impacto: reglas aparentemente correctas pueden razonar con valores ausentes,
viejos o interpretados dos veces.

### P1 — heurística de lluvia inventa un hecho

`internal/engineer/conditions/monitor.go:85-95` infiere lluvia cuando la
temperatura de pista cae respecto a ambiente. Los tests
`internal/engineer/conditions/monitor_test.go:85-138` protegen esa aproximación.
LMU ya ofrece intensidad de lluvia en otros contratos del repo.

Impacto: falso aviso meteorológico. Debe eliminarse y fallar en silencio si la
señal real no está disponible.

### P1 — voz, comandos y TTS no forman una ruta de producto

- `internal/engineer/commands/catalog.go` contiene 14 frases inglesas con
  matching simple y acciones no conectadas; no cubre idiomas ni confirmación.
- El reproductor Windows y el paquete Kokoro/TTS existen como piezas, pero no
  están conectados por `main`.
- No se encontró un ciclo PTT/wake/STT→intent→policy→respuesta.
- El estado TTS reportado por el servicio no prueba disponibilidad real.

Impacto: la superficie da la impresión de una capacidad que no existe de punta
a punta.

### P1 — tests protegen el simulador, no el contrato final

Los tests del servicio crean el default sintético y varios tests SSE/servicio
usan esperas temporales. Prueban métodos y transporte parcial, pero no:

- frescura y presencia por señal;
- preempción audible;
- ausencia de solapamiento;
- cancelación al cambiar sesión/coche/piloto;
- reconexión y hotplug de audio;
- pit confirmado y verificado;
- latencia p95 decisión estable→audio iniciado;
- cuatro idiomas en ruido de cockpit.

## Inventario de disposición

### KEEP

- Replays JSONL, fixtures y helpers deterministas, como material de
  caracterización.
- Conceptos de notificación/ViewModel y claves de traducción, solo como
  inventario de comportamiento.
- Contratos de driver y core ya centralizados en Telemetry Core.

### HARDEN

- Geometría/estado de Spotter, tras validar orientación, posición, velocidad y
  lateralidad con sesiones LMU reales.
- Algoritmos de eventos uno por uno: cada monitor necesita manifest de señales,
  presencia/frescura, replay oracle y política de silencio.
- Concepto de cola/audio, sustituyendo internamente su scheduler y lifecycle.
- SSE/Wails, historial y diagnóstico, con backpressure acotada y estado honesto.
- Reproductor Windows: dueño único, cancelación, hotplug y callbacks de inicio y
  fin reales.

### REWRITE

- `EngineerService` y la composición de runtime.
- Envelope, policy, scheduler, supresión, dedupe, cooldown y preempción.
- Entrada tipada desde `EngineerProjection`.
- Commands/intents localizados y exactos.
- Pit Manager como transacción confirmada.
- Integración TTS/STT/wake/PTT.
- Página Engineer y Radio Crystal guiados por capacidades reales.
- Dispatcher monolítico y mapa de eventos legacy.

### DELETE, solo después del cutover

- Simulador/replay como fuente seleccionable de producto o fallback implícito;
  conservarlos únicamente en harness explícitos.
- Parser, readers y adaptadores LMU paralelos del Engineer cuando
  `EngineerProjection` tenga paridad, tests y cero consumidores legacy.
- Frame implícito y servicio de telemetría legacy tras la migración.
- Inferencia temperatura→lluvia.
- Mensajes aleatorios de `pearls` en la ruta crítica beta.
- Prototipos de commands/Pit sin consumidor, después de que sus reemplazos
  tipados estén protegidos.

«DELETE» no autoriza borrado inmediato. Cada eliminación exige búsqueda de
consumidores, caracterización, cutover y checks focales.

## Dependencias reales de Telemetry Core

Engineer necesita, como mínimo, capacidad y frescura explícitas para:

- identidad de sesión, run/epoch, piloto y coche;
- estado de sesión, vuelta válida, bandera y neutralización;
- tiempo de fuente y monotonicidad;
- posición/orientación/velocidad de jugador y rivales;
- clase, orden, gaps y estado de boxes de rivales;
- combustible, capacidad, consumo y Virtual Energy;
- neumáticos, frenos, daños, motor y temperaturas;
- pit state, opciones soportadas y lectura posterior;
- clima/lluvia real;
- cambio de piloto y control efectivo del coche.

Hasta que una capacidad exista, la regla correspondiente queda `Unavailable`,
no se rellena con cero ni se deriva con heurísticas.
