# Microcortes beta y gates

La numeración es una propuesta de planificación. Cada microcorte empieza con un
test que falla, cambia el mínimo código y actualiza evidencia. Los cortes se
ejecutan autónomamente en ramas de issue y quedan revisados/apilados. La
promoción del conjunto a `nightly` requiere aprobación explícita de Isaac.

## Secuencia

| Corte | Objetivo | Test/gate de salida |
|---|---|---|
| ENG-02 | Contratos de `EngineerProjection`, capability y envelope | Table tests de cero presente, ausente, stale, unsupported y cambio de epoch |
| ENG-03 | Proyección desde Telemetry Core | Golden/replay por señal; no imports de driver LMU en Engineer |
| ENG-04 | Runner/oráculo de replays propios | Resultados deterministas, reloj virtual y snapshots versionados |
| ENG-05 | Policy + scheduler acotado | TTL, revalidación, dedupe, cooldown, coalescing y preempción P0 |
| ENG-06 | Spotter lateral/three-wide/rejoin | Geometría real LMU, hysteresis, swap/epoch y p95 P0 |
| ENG-07 | Eventos críticos | Banderas, penalizaciones, fuel/VE, neumáticos, frenos, daño, rival y clima real |
| ENG-08 | AudioOwner | Cero solapamiento, cancelación, hotplug, callback real y banco crítico |
| ENG-09 | PTT/HID | Debounce, lifecycle, feedback, cancelación y cero persistencia de audio |
| ENG-10 | STT/intents cuatro idiomas | Gramáticas propias, exactitud por intent, rechazados seguros y slots tipados |
| ENG-11 | Wake word endurecida | EN/ES/IT/PT-BR, FAR/FRR en cockpit, echo/radio y fallback PTT |
| ENG-12 | Pit read-only/capabilities | Detecta API/versiones/capacidades sin escribir y falla cerrado |
| ENG-13 | Pit transaccional | Confirmación, nonce, una escritura, readback, timeout/mismatch/session swap |
| ENG-14 | Bridge de estrategia | Propuesta no muta; aceptación y confirmación Pit quedan separadas |
| ENG-15 | Radio Crystal/UI/diagnóstico | Estado honesto, subtítulo en playback start, timeline acotada y accesibilidad |
| ENG-16 | Paridad avanzada relevante | Matriz beta completa o `Unavailable` justificado con evidencia |
| ENG-17 | Soak y beta gate | LMU real, reconexión, dispositivo, cuatro idiomas, no stale y aprobación manual |

## Gates transversales

### Datos

- Telemetry Core es la única fuente de verdad.
- Cada regla declara señales, frescura y comportamiento sin capacidad.
- Cero legítimo y ausencia están separados.
- Cambio de sesión/piloto/coche cancela estado previo.
- No hay unidades/rangos/offsets inventados.

### Seguridad y prioridad

- P0 interrumpe P1–P3 y no depende de TTS.
- No se inicia ningún mensaje caducado o inválido.
- Cola acotada sin goroutines no controladas.
- Pit nunca escribe sin confirmación y siempre verifica.
- Ningún LLM entra en decisión crítica.

### Voz e idiomas

- EN, ES internacional, IT y PT-BR cubren audio crítico, intents, subtítulos,
  errores y diagnósticos.
- Licencia y procedencia registradas por runtime/modelo/voz.
- El micrófono no se graba ni sale del equipo.
- PTT funciona aunque wake esté deshabilitada o degradada.

### Rendimiento

- p95 P0 decisión estable→callback de audio menor de 150 ms.
- Scheduler y reglas no bloquean en I/O o TTS.
- Sin solapamiento audible.
- Soak prolongado sin crecimiento no acotado, deadlocks ni fugas.

### UX y evidencia

- No hay estado conectado sintético.
- `Unavailable` es visible y accionable.
- Radio/subtítulo representan audio iniciado.
- Diagnóstico explica supresión, stale, falta de capacidad y fallos.
- HTML y fixtures sintéticos conservan etiqueta de referencia.

## Fixtures mínimos

1. coche izquierda→alongside→clear y oscilación en umbral;
2. three-wide y pérdida de un rival;
3. pit exit/rejoin con tráfico rápido;
4. bandera/penalización que expira antes del audio;
5. combustible cero legítimo y combustible ausente;
6. Virtual Energy disponible/no disponible y cambio de unidad/version;
7. lluvia real, señal stale y ninguna señal;
8. cambio de piloto/coche durante audio y durante confirmación Pit;
9. dispositivo desconectado durante P0;
10. flood de P2/P3 seguido de P0;
11. frase ambigua/ruido/echo en cuatro idiomas;
12. Pit readback correcto, mismatch, timeout, duplicate confirm y cambio de epoch.

## Checks por corte

- Go modificado: `gofmt`, tests focales y `go test ./...`.
- Frontend modificado: test focal, `pnpm --dir frontend test`,
  `pnpm --dir frontend lint` cuando aplique y
  `pnpm --dir frontend build`.
- Contratos compartidos: tests de ambos lados y búsqueda de consumidores
  legacy.
- Antes de commit: `git diff --check` y estado/path-limited.
- Antes de beta: replay suite, fault injection, soak, benchmark P0 y checklist
  manual por idioma/dispositivo.

## Stop conditions adicionales

Parar y volver a revisión si:

- una regla necesita leer LMU fuera de Telemetry Core;
- falta semántica/unidad de una señal;
- una voz/modelo no tiene licencia clara;
- Pit no ofrece readback fiable;
- wake no alcanza umbrales acordados;
- la preempción exige rediseñar el backend de audio;
- el cambio mezcla UI, telemetría, voz y pit en un solo corte;
- un test solo «hace pasar» la implementación sin comprobar un resultado
  observable.
