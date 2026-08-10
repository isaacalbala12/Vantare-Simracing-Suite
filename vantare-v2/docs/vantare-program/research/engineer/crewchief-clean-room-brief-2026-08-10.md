# Engineer LMU — brief clean-room de producto e ingeniería

Fecha: 2026-08-10. Autoridad: contrato Vantare, roadmap ENG-12..29, handoff
vivo y Linear ISA-187..200. Baseline técnico:
`nightly@7e39104a7e876b4c396a41403023ba6030b88a08`.

Este documento es la única salida de la investigación competitiva destinada a
implementadores. No contiene constantes, algoritmos, frases, gramáticas,
audios, UI, nombres internos ni estructura de CrewChief. Los valores de Vantare
se derivan de requisitos propios, replays/capturas LMU y pruebas humanas.

El expediente ISA-313 conserva por separado un dossier de evidencia para
análisis, trazabilidad y revisión de producto/licencias. Los implementadores no
lo usan como especificación ni como fuente de constantes.

## Objetivo y alcance

Engineer sustituye a CrewChief para el alcance LMU declarado, sin convivencia
ni paridad exacta. La Beta cubre Spotter, monitores, audio, salida visual,
consultas, PTT/wake condicionados, Pit Manager seguro, configuración y
diagnóstico. Español e inglés son los idiomas de primera entrega. Italiano y
portugués brasileño permanecen en el gate final. Cambio de piloto es la única
familia de monitor expresamente excluida. Always-on es post-Beta.

Kokoro es la dirección TTS elegida, no un GO técnico. Si su gate falla, el
producto sigue siendo honesto y útil mediante audio propio pre-generado/cacheado
y salida visual.

## Vocabulario de decisión

| Término | Significado en este brief |
|---|---|
| **KEEP** | Conservar una capacidad Vantare ya demostrada. |
| **ADAPT** | Conservar el contrato o principio, cambiando implementación/comportamiento con evidencia propia. |
| **BUILD** | Crear o cablear capacidad que no existe productivamente. |
| **DEFER** | Mover a una fase posterior explícita, sin simularla. |
| **REJECT** | No incluir en esta Beta o no adoptar nunca el patrón riesgoso indicado. |
| **gated** | Prevista, pero `disabled/unavailable` hasta aprobar evidencia propia; no autoriza simulación ni fallback factual. |

Fases: **V1** primera vertical; **BC** núcleo Beta; **BT** Beta tardía;
**PB** post-Beta; **OUT** fuera de esta Beta.

## Baseline que se conserva

- Una sola entrada canónica de telemetría y cancelación por source/lifecycle.
- Policy/scheduler compartidos, deduplicación y Spotter preemptivo.
- Presentación localizada común para audio, Hub, subtítulos, Desktop y OBS.
- Ruta productiva cache-only con fallback visual; salida audible y packs
  distribuibles todavía no demostrados.
- Catálogo determinista de 14 consultas y seis acciones confirmables.
- PTT y router como contratos/harnesses; aún no son wiring de producto.

Evidencia interna: [entrada productiva](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/7e39104a7e876b4c396a41403023ba6030b88a08/vantare-v2/internal/engineer/service/engineer_service.go#L602-L735),
[audio cache-only](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/7e39104a7e876b4c396a41403023ba6030b88a08/vantare-v2/internal/engineer/audio/router.go#L55-L191),
[catálogo](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/7e39104a7e876b4c396a41403023ba6030b88a08/vantare-v2/internal/engineer/commands/catalog.go#L21-L27) y
[límite del harness](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/7e39104a7e876b4c396a41403023ba6030b88a08/vantare-v2/internal/engineer/commands/harness.go#L40-L42).

## Ledger de sustitución

| Flujo/capacidad | Decisión | Fase / issue | Criterio y fallback |
|---|---|---|---|
| Arranque y descubrimiento LMU | **KEEP/ADAPT** | BC / ISA-189,190 | Handshake de versión/capabilities, freshness y `connected/degraded/stale`; unknown nunca vale cero. |
| Izquierda/derecha, permanencia y libre | **ADAPT** | V1 / ISA-189 | Estado explícito, histéresis, revalidación y cancelación; oráculo propio LMU. |
| Three-wide y liberación parcial | **BUILD** | V1 / ISA-189 | Distinguir carriles de coches en fila; sin falsos libres. |
| Alcance Hypercar–LMGT3 | **BUILD** | V1 / ISA-189 | Corpus de cierre extremo; medir falsos positivos/negativos y latencia. |
| Rejoin del jugador | **BUILD gated** | BC / ISA-189 | Solo habla con posición, trayectoria y tráfico fiables; si falta algo, silencio + visual de no disponible. |
| Tráfico multiclase y lapping | **BUILD** | BC / ISA-189,190 | Clase, vuelta relativa, orden físico y tendencia independientes; no ordenar ceder sin certeza. |
| Oval/stock-car | **REJECT** | OUT | No aplica a LMU; no impide un producto multisim futuro. |
| Amarilla local/sectorial, azul y FCY | **BUILD** | BC / ISA-190 | Distinguir estado oficial, fase y expiración. |
| Safety-car/formación/orden | **BUILD gated** | BC / ISA-190 | Solo con orden oficial demostrable; no inferir instrucciones. |
| Coche lento/detenido o incidente delante | **BUILD gated** | BC / ISA-190 | Aviso espacial genérico si hay evidencia; causante/nombre se omiten sin certeza. |
| Off-track, límites y vuelta inválida | **BUILD** | BC / ISA-190 | Son conceptos separados; invalidez solo si la fuente la declara. |
| Sesión, grid, salida y final | **BUILD/ADAPT** | BC / ISA-190 | Máquina de estados LMU; provisional/terminado separados y revalidados. |
| Posición global, de clase y orden físico | **BUILD** | BC / ISA-190 | Tres tipos incompatibles; nunca usar uno como sustituto de otro. |
| Vueltas, sectores, gaps y ritmo | **KEEP/ADAPT** | BC / ISA-190 | Hechos separados de evaluación; muestra mínima y suppression observable. |
| Fuel | **ADAPT** | BC / ISA-190 | Consumo/autonomía con unidades y reserva Vantare; sin cálculo sobre datos stale. |
| Virtual Energy | **BUILD** | BC / ISA-190 | Recurso LMU separado de fuel y batería; monitor audible/visual propio. |
| Neumáticos, presión y frenos | **BUILD gated** | BC / ISA-190 | Valor, fuente y diagnóstico separados; thresholds versionados por coche/compuesto. |
| Pinchazo, rueda y daño | **BUILD gated** | BC / ISA-190 | Comunicar solo subsistemas demostrados; el resto `unsupported`. |
| Impacto/rollover y estado del piloto | **BUILD gated** | BC / ISA-190 | No diagnosticar daño no presente; interacción de seguridad no muta el juego. |
| Penalizaciones | **ADAPT** | BC / ISA-190 | Contador/estado oficial primero; tipo, causa y plazo solo con fuente estable. |
| Pit lane, limitador y velocidad | **BUILD/ADAPT** | BC / ISA-190 | Entry/exit, limitador, límite y exceso son señales distintas. |
| Aproximación y cajón | **BUILD gated** | BC / ISA-190 | Solo con geometría de box fiable; no inventar distancia/servicio. |
| Ventana/parada obligatoria | **BUILD gated** | BC / ISA-190 | Estado oficial y deadline; separado de recomendación estratégica. |
| Clima actual y tendencia | **BUILD** | BC / ISA-190 | Lluvia/temperaturas observadas; forecast queda BT si existe fuente autorizada. |
| Rival observado/compañero | **BUILD** | BC / ISA-190 | Identidad estable, rebind/cancelación por epoch y privacidad de nombres. |
| Tiempo y avisos de stint | **BUILD** | BC / ISA-190 | Productores LMU demostrados; independiente del cambio de piloto. |
| Cambio de piloto | **REJECT** | OUT | Excluido de esta Beta; no se simula ni se ofrece acción. |
| Personalidad/frecuencia | **BUILD** | BC / ISA-188 | Perfil declarativo original que no altera hechos, prioridad ni lifecycle. |
| Dispositivo de salida/test/hotplug | **BUILD** | V1 / ISA-187 | Endpoint estable, fallback explícito, prueba audible, coherencia `presentation locale → channel → cache key` en ES/EN y recuperación sin tumbar monitores. |
| Cola y preempción | **KEEP/ADAPT** | V1 / ISA-187,189 | Spotter domina Engineer; aging sin starvation; fallo de un item no vacía la cola. |
| Ducking | **BUILD** | V1 / ISA-187 | Captura/restauración exactas por locución, incluso en cancelación/error/shutdown. |
| Hub, subtítulos, radio y OBS | **KEEP/ADAPT** | V1 / ISA-187,189 | Mismo presentation/event ID, expiración común y fallback visual siempre disponible. |
| Historial/repetición | **ADAPT** | BC / ISA-186,191 | Repetir nunca reejecuta; reconsulta hechos o marca respuesta histórica. |
| Controlador/readers PTT teclado/XInput/joystick | **KEEP** | BC / ISA-185 | Contrato ya integrado; hot-unplug sin afectar telemetría/audio. |
| Raw HID genérico | **BUILD gated** | BC / ISA-195 | Backend y binding quedan disabled hasta dispositivo real, descriptor permitido, hotplug y roundtrip demostrados. |
| Bridge PTT → STT | **BUILD wiring** | BC / ISA-191 | Default de voz; timeout/cancelación y ningún acoplamiento a monitores. |
| UI/bindings/persistencia PTT | **BUILD** | BC / ISA-195 | Rebinding y estado real del dispositivo; ningún claim de persistencia antes del roundtrip. |
| STT ES/EN | **BUILD condicionado** | BC / ISA-191 | Host aislado/offline, corpus humano, intent/slot accuracy y timeout/cancelación. |
| Wake word ES/EN | **BUILD condicionado** | BC / ISA-192 | FAR/FRR humano, consentimiento, privacidad/CPU visibles y fallback PTT. |
| Always-on | **DEFER** | PB | No necesario para sustitución Beta y amplía riesgo de privacidad. |
| Kokoro dinámico ES/EN | **BUILD solo con GO** | BC / ISA-193,194 | G2P/licencias, packaging, deadline, carga conjunta y escucha; si NO-GO, cache+visual. |
| Packs/modelos offline | **BUILD** | BC / ISA-194 | Contenido first-party; runtime/modelos de terceros solo con licencia y procedencia aprobadas. Manifest firmado, hashes, staging, activación atómica y rollback. |
| Configuración/persistencia | **BUILD** | BC / ISA-195; ISA-314 primero | Esquema migrable y roundtrip; locale, unidades, volumen, devices, PTT, voz, frecuencia, salidas y permisos. |
| Pit request/abort | **KEEP contrato / BUILD puerto** | BT / ISA-196 | Propuesta, readback de intención, confirmación/cancelación, envío, lectura final y resultado. |
| Pit set fuel/change tyres | **KEEP contrato / BUILD puerto** | BT / ISA-196 | Unidades/límites de coche, idempotencia, TTL y fallo cerrado. |
| Strategy accept/reject | **KEEP contrato / BUILD integración** | BT / ISA-197 | Plan ID/version y estado final; ninguna acción desde texto/STT directamente. |
| Pit VE/presiones en UI/preview | **BUILD gated** | BT / ISA-196 | Solo si el contrato Pit y readback LMU las demuestran; no autoriza voz. |
| Pit VE/presiones por voz | **DEFER** | PB | Requiere cambio explícito de catálogo, corpus e issue. |
| Pit reparaciones/servir penalización | **DEFER** | PB | Solo con estado verificable y reconciliación segura. |
| Macros/dictado libre para acciones | **REJECT** | OUT | No pueden saltar intent, capability, confirmación o readback. |
| Strategy/Overlays predictivos | **BUILD** | BT / ISA-197 | Empieza tras audio, Spotter, monitores, control y Pit; incertidumbre visible. |
| Diagnóstico y ledger E2E | **BUILD** | BT / ISA-198 | Emitido/suprimido/expirado/cancelado, audio/cache/device/STT/Pit y causa sanitizada. |
| Soak LMU y gate Beta | **BUILD** | BT / ISA-199,200 | Carrera larga, segunda sesión, reconnect, crash, hotplug, lluvia, FCY, pit, VE y multiclase. |

## Catálogo de voz autorizado

El catálogo v1 ya aprobado se conserva; esta lista son categorías propias, no
frases ni gramáticas de terceros.

Consultas: fuel, Virtual Energy, posición, vuelta, gap, neumáticos, daño,
tiempo de carrera, rival por dorsal, rival por nombre, estrategia, estado de
pit, estado del coche y penalizaciones.

Acciones confirmables: solicitar pit, cancelar pit, fijar fuel, cambiar
neumáticos, aceptar estrategia y rechazar estrategia.

Cada turno termina exactamente en uno de estos estados observables:
`understood`, `ambiguous`, `unavailable`, `stale`, `proposed`, `cancelled`,
`applied`, `rejected`, `indeterminate` o `failed`. Una acción parcialmente
aplicada o con readback inconcluso termina `indeterminate`, expone el diff final,
exige reconciliación/manual recovery y prohíbe reintento automático. Confirmar no puede saltarse TTL, lifecycle,
capability, unidad, límite ni readback. Un segundo reconocimiento idéntico no
cuenta como confirmación.

## Superficies visuales y configuración

Cada mensaje conserva un único ID, locale, rol, prioridad, source/lifecycle,
creación y expiración para Hub, subtítulos, Desktop y OBS. Historial no puede
resucitar una alerta espacial; un overlay predictivo declara incertidumbre.
Overlays ajenos a Engineer no forman parte de esta sustitución.

El centro de control cubre: idioma, unidades, volumen, dispositivo de salida,
micrófono, test de audio, PTT/bindings, consentimiento wake, sensibilidad del
Spotter, frecuencia/silencio, categorías audio/visual, estado de modelos
offline, permisos Pit y persistencia real. Antes de ISA-195, todo ajuste en
memoria se etiqueta “esta sesión”.

Micrófono y transcripciones son memory-only y no se graban por defecto. Ningún
LLM decide hechos, números, intents, slots o acciones críticas.

## Gates medibles mínimos

Los umbrales y autoridades de aprobación viven en los contratos de cada issue y
en la tabla de gates de `docs/engineer/engineer-beta-roadmap.md`; este brief no
los redefine.

- Spotter: replay/oráculo LMU, falsos positivos/negativos, p95 decisión→audio,
  multiclase Hypercar–LMGT3 y ninguna alerta stale después de lifecycle.
- Audio: red desconectada, cache hit/miss, modelo ausente/corrupto, hotplug,
  fallback al default, ducking restaurado y carga conjunta LMU+OBS.
- ES/EN: números, decimales, unidades, nombres/pronunciación y revisión humana.
- STT: intent/slot accuracy, negativos/near-miss, ruido real y cancelación.
- Wake: FAR/FRR por locale/hardware/ruido, consentimiento y coste de CPU.
- Pit: capability/version, propuesta legible, confirmación independiente,
  idempotencia, readback equivalente, rechazo/timeout y cambio de sesión/coche.
- Beta: Win10/11, instalación/actualización offline, segunda sesión, reconnect,
  crash, carrera larga, lluvia, FCY, pit y VE. ISA-200 añade paridad estructural
  y gate humano de italiano/portugués brasileño sin retrasar la primera etapa ES/EN.

Si falta evidencia, el estado es `unavailable`, `NO-GO` o `INCONCLUSIVE`; nunca
se simula éxito ni se rellena con datos sintéticos en producto.

## Orden de ejecución

1. ISA-314 corrige la promesa falsa de persistencia.
2. ISA-187 + ISA-189 + ENG-08 entregan la primera vertical audio/Spotter/visual.
3. ISA-190 habilita monitores uno por uno, todo salvo cambio de piloto.
4. ISA-193 y los gates humanos de voz avanzan en paralelo sin bypass.
5. ISA-195 y ISA-196 cierran control persistente y Pit transaccional.
6. ISA-197/198 completan integraciones/diagnóstico.
7. ISA-199/200 ejecutan soak, packaging y decisión Beta.
