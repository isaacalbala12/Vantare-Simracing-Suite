# ADR 0098 — Telemetría live y distribución de productos en Rust

Fecha: 2026-09-29. Issue: [ISA-1403](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1403).

## Estado

Dirección de producto confirmada por Isaac el 2026-09-29; implementación y
validación pendientes. Sustituye la frontera de entrega y el gate de CPU de
[ADR 0097](0097-rust-telemetry-child-process.md). Conserva de esa ADR la
semántica de LMU, Core, calidad, tiempo, facts, exclusión de readers y seguridad
del proceso hijo. Ninguna medición existente acredita una mejora del sistema
completo ni autoriza retirar la ruta Go actual.

## Contexto

El candidato actual ejecuta adquisición, estado y proyecciones en Rust, pero
Go decodifica los mensajes, decide parte de la entrega y publica Overlay,
Engineer y Strategy. La comparación del parser aislado fue favorable a Rust;
las ventanas del candidato integrado Rust+Go han consumido más CPU que Go en
trabajo no equivalente. Un replay de la captura física de 47 coches sobre la
misma fuente aislada produjo 3902 productos por consumidor y 7,15625 s CPU en la ruta Go
parcial, frente a 3872 productos y 16,34375 s CPU agregada en el candidato
Rust+Go. Son diagnósticos con distintas fronteras y salidas, no un ratio de
aceptación. Sirven para impedir la afirmación de que el ahorro ya está probado.

Isaac quiere comprobar una ruta live cuyo trabajo de telemetría, incluida la
distribución de productos, esté en Rust; optimizarla por rondas medidas y
retirar el trabajo live de Go. Wails y los servicios de producto ajenos a la
telemetría permanecen en Go. Engineer/Spotter y Strategy conservan sus reglas
de producto, voz, editor, almacenamiento y análisis histórico en Go.

## Decisión

1. Rust posee LMU Shared Memory/REST, fusión, identidad, estado canónico,
   derivaciones, proyecciones, cadencias, demanda, colas, bootstrap, retención
   y ACK/resync de facts, salud de fuente y selección de los destinatarios live.
2. Los destinos son Overlay de Studio/Desktop/OBS, la entrada de Engineer y la
   entrada live de Strategy. Rust produce los contratos externos versionados.
   Go no reconstruye valores, calidad, cursores ni política de entrega.
3. El host Wails y los servicios de producto Go pueden conservar adaptadores
   mínimos de frontera para exponer bytes ya decididos por Rust o invocar una
   entrada de producto. Esos adaptadores no son un segundo publisher, cola,
   scheduler, oráculo de frescura ni motor de telemetría. Cada uno se inventaría
   y prueba antes de llamar completa a la retirada de Go live.
4. El proceso Rust mantiene un solo owner LMU. El protocolo local seguirá
   autenticando al hijo y acotando memoria, tiempos y colas. La implementación
   del transporte directo a cada superficie se decidirá con pruebas de
   seguridad, lifecycle y compatibilidad de Studio/Desktop/OBS, sin abrir una
   segunda lectura LMU ni crear un renderer alternativo.
5. La referencia Go queda en un SHA y corpus de prueba auditados durante la
   transición. El binario final no incluye dos motores live ni selección
   `go|rust`. Los paquetes Go históricos, recording SQLite y servicios de
   producto con consumidores reales no se eliminan por nombre de directorio.
6. El objetivo de rendimiento se mide sobre la ruta final Rust, sin ocultar el
   coste del host imprescindible. El umbral anterior de CPU total `R/G1 <=
   0,50` deja de ser puerta de retirada: medía una arquitectura híbrida que
   Isaac ya no quiere. Se publican CPU, p99, RSS, trabajo y salidas equivalentes
   frente a Go actual y control equivalente. Una mejora solo se afirma si el
   banco pareado la demuestra; una regresión exige perfil, iteración y revisión
   explícita, nunca ajuste silencioso del corpus o de los consumidores.

## Fronteras que deben quedar demostradas

- Rust publica Overlay con el contrato V2, el límite de payload y la semántica
  de pull/late join de cada ventana. Studio, Desktop y OBS muestran el mismo
  estado de fuente y no un frame fresh retenido tras desconexión.
- Engineer recibe observaciones, status, facts y límites de resync en orden.
  Su lógica de radio y Spotter sigue siendo un consumidor de producto Go.
- Strategy recibe la proyección live solo bajo demanda explícita; el análisis
  histórico, el planificador y su persistencia Go no se portan en esta issue.
- Crash, cierre, suspensión, REST fallido, cambio de sesión y consumidores
  lentos conservan epoch, bootstrap y cierre verificables. El último fact
  aceptado no desaparece silenciosamente tras reinicio.
- Packaging, instalación, portable, actualización y rollback distribuyen una
  pareja host/helper compatible, sin toolchain Rust en el PC del usuario.

## Verificación y retirada

El [plan de ejecución](../superpowers/plans/2026-09-29-rust-live-telemetry-end-to-end.md)
fija los cortes y el banco. La retirada de cada ruta Go exige callers live cero,
pruebas de paridad y un binario final comprobado con LMU/Wails/OBS. El gate de
CPU se informa con crudos y sin promesa previa de ahorro. La promoción a
`nightly`, `testers` o `master` y una release mantienen sus autorizaciones
separadas.
