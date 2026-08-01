# Matriz de paridad y alcance

Leyenda:

- **Beta**: entra en el gate de beta.
- **Después**: útil, pero no bloquea beta.
- **No**: fuera del producto o incompatible con sus contratos.
- «Referencia» indica concepto observado, no código/activo reutilizado.

| Dominio | Referencia externa | Estado Vantare actual | Alcance | Contrato Vantare |
|---|---|---|---|---|
| Spotter izquierda/derecha/clear | CrewChief, DRE | Algoritmo y fixtures legacy | Beta | P0, preempción real, audio pre-renderizado, frescura espacial |
| Three-wide y solape persistente | CrewChief | Parcial/no probado LMU | Beta | Estado determinista, hysteresis, cancelación por epoch |
| Pit exit/rejoin/tráfico rápido | DRE | No probado | Beta avanzado | Solo con rival/gap/velocidad frescos |
| Banderas y neutralización | CrewChief, DRE | Monitor legacy | Beta | Señal explícita; nunca inferir |
| Penalizaciones | CrewChief | Monitor legacy | Beta | Anunciar una vez, caducar por estado |
| Combustible a final | CrewChief, DRE | Legacy, datos incompletos | Beta | Ventana de consumo válida y capacidad conocida |
| Virtual Energy LMU | CrewChief, DRE | Sin contrato TC suficiente | Beta | Señal LMU explícita; no convertir unidades inventadas |
| Neumáticos/frenos/daños | CrewChief, DRE | Monitores legacy | Beta | Capability manifest por campo y replay oracle |
| Temperatura/clima/lluvia | CrewChief, DRE | Lluvia heurística insegura | Beta | Lluvia real o silencio; eliminar heurística |
| Rivales, gaps y clase | CrewChief, DRE | Parcial | Beta | Identidad estable, clase y datos no obsoletos |
| Cambio de piloto | CrewChief | No protegido de punta a punta | Beta | Nuevo epoch; cancelar estado, cola y pit pendientes |
| Momentos difíciles/ocupados | CrewChief, DRE | No contractual | Beta | Suprime Engineer, nunca Spotter/P0 |
| Personalidades | Contrato Vantare | Parcial/random pearls | Beta | Profesional/Cercano/Exigente + Custom declarativo; hechos inmutables |
| Cuatro idiomas | DRE como referencia | Traducciones parciales | Beta | EN/ES internacional/IT/PT-BR en intents, texto y audio crítico |
| PTT teclado/HID | CrewChief, DRE | Sin pipeline | Beta | Sin grabar, debounce, feedback y cancelación |
| Wake word localizada | CrewChief/DRE como referencia | Ausente | Beta endurecido | KWS+VAD+confirmación STT, FAR/FRR y PTT fallback |
| Comandos e intents | CrewChief, DRE | 14 frases EN huérfanas | Beta | Intents tipados, gramática propia, exacta y local |
| Pit prepare/explain/confirm/send/verify | CrewChief/DRE como referencia | Cliente REST huérfano | Beta | Transacción, nonce, TTL, idempotencia y readback |
| Estrategia propuesta/aceptada | CrewChief/DRE | Sin bridge seguro | Beta | Engineer propone; Planner cambia solo tras aceptación |
| Radio Crystal + subtítulos | DRE/overlays solo como referencia | Página sintética | Beta | Refleja audio iniciado, fuente y frescura reales |
| Historial/replay diagnóstico | DRE | Notificaciones parciales | Beta | Registro sanitizado, acotado, sin audio del micrófono |
| Device routing y hotplug | CrewChief/DRE | Player parcial | Beta | Dueño único, selección persistente y recuperación |
| Telemetría avanzada de coaching | CrewChief | Parcial | Después | No competir con mensajes de carrera |
| Alarmas personales | CrewChief | No relevante al núcleo | Después | Solo offline y explícitas |
| MQTT/broadcast/VR overlays | CrewChief | Ausente | No para beta | Fuera del núcleo Engineer & Spotter |
| Cloud STT/TTS | DRE | No | No | Contradice offline/no recording |
| Chat/LLM en decisión crítica | Otros productos | No | No | Prohibido para hechos, seguridad, pit y prioridad |

## Qué significa «paridad avanzada relevante»

No significa replicar el catálogo completo de un tercero. Significa cerrar las
familias que cambian seguridad o decisiones de carrera en LMU:

1. Spotter lateral, three-wide, rejoin/pit-exit y tráfico que alcanza.
2. Banderas, neutralización, penalizaciones y cambio de piloto.
3. Combustible/Virtual Energy, neumáticos, frenos, daños y motor.
4. Rivales, clase, gaps, stint y condiciones reales.
5. Supresión por carga del piloto sin bloquear peligro.
6. Pit y estrategia con confirmación y verificación.

Cada fila puede quedar `Unavailable` si Telemetry Core demuestra que LMU no
entrega el dato. Eso es un resultado válido y más seguro que una falsa paridad.

## Matriz mínima de aceptación por capacidad

| Estado | UI | Reglas | Audio | Diagnóstico |
|---|---|---|---|---|
| Available + fresh | Disponible | Evalúan | Permitido por policy | fuente, edad y versión |
| Available + stale | Degradado | Silencio/cancelación | No nuevo audio | causa y última edad |
| Unsupported | No disponible | No se registran | Nunca | capability ausente |
| Disconnected | Desconectado | Nuevo epoch/cancelar | Solo diagnóstico no-race | razón de conexión |
| Test scenario | Referencia, etiqueta visible | Harness aislado | Solo preview | `scenario=true` |

## Evidencia que falta

- Semántica y unidades reales de varias señales LMU.
- Replays propios de four-wide/three-wide, pit exit, swap y neutralización.
- Comportamiento del REST de pit y readback en las versiones LMU objetivo.
- Benchmarks de audio/STT/KWS en el equipo Windows objetivo.
- Revisión legal de cada modelo/voz distribuible.
- Pruebas humanas de traducción y pronunciación en los cuatro idiomas.
