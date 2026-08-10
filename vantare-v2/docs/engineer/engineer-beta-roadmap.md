# Engineer — roadmap general por fases

## Estado y autoridad

- Fecha: 2026-08-11; reformulado por ISA-313 / ENG-R01.
- Base de planificación: la rama nightly remota vigente al iniciar cada fase.
- Proyecto Linear: Engineer & Spotter — LMU Race Companion.
- Este documento fija el orden general, las dependencias y el contrato de
  prueba. No es un microplan de implementación.
- El handoff vivo conserva el estado demostrado y Linear decide issues,
  relaciones, rama y estado operativo.
- El brief clean-room de 2026-08-10 define las capacidades autorizadas. El
  dossier competitivo es evidencia analítica y no se entrega a implementadores.

## Regla de planificación

El roadmap permanece deliberadamente general. Cada fase describe un resultado
de producto y no anticipa archivos, componentes, algoritmos, herramientas,
reparto entre agentes ni tareas técnicas.

Al entrar en una fase se crea o actualiza su microplan con el estado real de ese
momento. Ese microplan sí concreta alcance, subfases definitivas, contratos,
riesgos, trabajo, tests y verificación. Una decisión tomada en ese replanning no
convierte automáticamente en obsoletas las fases posteriores: se revisan cuando
les llegue su turno.

Las subfases enumeradas aquí son probables. Pueden combinarse, dividirse,
reordenarse o descartarse cuando la evidencia lo justifique.

## Resultado de producto

Engineer acompaña al piloto en directo y sustituye funcionalmente a CrewChief
sin copiarlo. Spotter se limita a seguridad, proximidad y tráfico inmediato.
Ambos consumen exclusivamente Telemetry Core, funcionan offline, callan ante
datos missing/stale y nunca inventan un hecho.

La primera Beta:

- comienza con español e inglés;
- cubre todas las familias planificadas salvo cambio de piloto;
- combina audio, radio, subtítulos y overlays coherentes;
- mantiene PTT como entrada segura;
- incorpora voz solo donde supere sus gates;
- permite acciones únicamente con confirmación y resultado verificable;
- conserva diagnóstico y evidencia suficientes para explicar cada decisión.

Italiano y portugués brasileño permanecen en el contrato posterior. Cambio de
piloto, escucha always-on y otros simuladores no bloquean la primera Beta.

## Límites no negociables

1. Telemetry Core es la única fuente; Engineer no crea otro reader LMU.
2. Código propio decide hechos, intención, slots, prioridad y acciones.
3. Ningún LLM decide hechos o acciones críticas.
4. No se copian código, frases, gramáticas, audios, UI, assets ni constantes de
   CrewChief o DRE.
5. Spotter puede interrumpir cualquier mensaje menos prioritario.
6. Micrófono y transcripciones son memory-only por defecto; cero recording.
7. Una acción mutable exige propuesta, repetición, confirmación, ejecución y
   resultado. Nunca se presenta “enviado” como “aplicado”.
8. Una capability no demostrada queda unavailable o disabled.
9. Fixtures y replays no sustituyen percepción humana, hardware real ni LMU
   real cuando el gate los exige.
10. Kokoro es la dirección TTS, no un GO técnico ni legal anticipado.
11. El flujo sigue siendo rama de issue -> aprobación de Isaac -> nightly
    -> feedback -> testers -> aprobación final -> master.

## Ciclo común de cada fase

### 1. Entrada y replanning

Antes de implementar:

- verificar nightly, estado de Linear, handoff y evidencia disponible;
- definir el resultado observable y los límites de la fase;
- confirmar dependencias y gates humanos, legales, de hardware o producto;
- convertir las subfases probables en un microplan ejecutable;
- definir desde el inicio la validación manual y la prueba acumulativa que
  deberá poder ejecutar una IA;
- detenerse para revisión si hace falta cambiar arquitectura, añadir una
  dependencia o ampliar materialmente el alcance.

### 2. Ejecución incremental

La fase se desarrolla en cortes pequeños. Cada corte mantiene el producto
compilable, probado y honesto. Los hallazgos externos se registran aparte y no
se incorporan silenciosamente.

### 3. Prueba de cierre

Una fase no se considera probada hasta completar las dos mitades:

1. **Validación manual reproducible.** Una persona sigue un guion breve sobre
   la aplicación real y, cuando corresponda, LMU, hardware, audio o voz reales.
   Registra entorno, resultado y limitaciones.
2. **Prueba acumulativa ejecutable por IA.** La fase crea o amplía una única
   ruta de aceptación que una IA pueda descubrir, ejecutar y evaluar sin leer
   código complejo. Debe recorrer el flujo completo alcanzado hasta esa fase,
   producir un resultado inequívoco y fallar de forma visible.

La prueba para IA puede combinar tests, replays, automatización de interfaz,
fixtures autorizadas y comprobaciones de contratos. Cuando una propiedad solo
pueda juzgarla una persona —por ejemplo pronunciación, falsas activaciones o
ergonomía física— la IA dirige el protocolo y valida que la evidencia humana
requerida exista; no suplanta ese juicio.

### 4. Cierre y transición

Al terminar:

- revisar conjuntamente evidencia manual y automática;
- actualizar handoff, Linear y documentos vivos;
- registrar capacidades que siguen disabled o inconclusas;
- obtener la aprobación aplicable;
- replanificar la siguiente fase desde el nuevo estado real.

## Secuencia general

~~~text
Base ya integrada
  |
  v
Fase 1 — Spotter observable
  |
  v
Fase 2 — Engineer de carrera
  |
  v
Fase 3 — Control e interacción
  |
  v
Fase 4 — Acciones LMU seguras
  |
  v
Fase 6 — Strategy y overlays avanzados
  |
  v
Fase 7 — Beta ES/EN integrada
  |
  v
Fase 8 — Expansión posterior

Fase 5 — Voz offline condicionada
  comienza como línea de evidencia en paralelo
  y solo converge antes de Fase 7 si supera sus gates.
~~~

## Punto de partida ya disponible

Nightly contiene los contratos, proyección, runtime, policy, scheduler,
presentación multilingüe, radio/subtítulos, package host test-only, catálogo de
comandos, diálogo determinista y readers PTT existentes. También existe una
ruta de audio cache-only, pero no se ha demostrado todavía una experiencia
audible distribuible de extremo a extremo.

Esta base se conserva; no se vuelve a implementar durante las fases siguientes.

## Fase 1 — Spotter observable

**Propósito:** entregar la primera vertical perceptible: un mismo hecho de
seguridad aparece correctamente en audio y en las superficies visuales.

**Subfases probables:**

- disponibilidad y honestidad de la salida de audio;
- comportamiento Spotter LMU y multiclase;
- prioridad, interrupción, silencio y fallback;
- coherencia entre radio, subtítulos, Desktop y OBS.

**Resultado observable:** el piloto recibe avisos oportunos y coherentes, y el
sistema calla o usa el fallback visual cuando no puede demostrar el audio o la
geometría.

**Prueba de cierre:**

- manual: escenarios representativos de tráfico, clears, multiclase,
  preempción, pérdida de fuente y recuperación;
- IA: ampliación de la aceptación acumulativa con escenarios deterministas,
  estados de lifecycle y paridad observable entre decisión y salidas.

## Fase 2 — Engineer de carrera

**Propósito:** ampliar desde la seguridad inmediata hacia el acompañamiento de
carrera previsto para la Beta.

**Subfases probables:**

- sesión, posición, rivales, ritmo y multiclase;
- fuel, Virtual Energy, neumáticos y daños demostrables;
- banderas, penalizaciones, pits y stint;
- frecuencia, relevancia, consultas y motivación.

**Resultado observable:** Engineer informa únicamente de hechos útiles y
frescos en todas las familias Beta planificadas salvo cambio de piloto.

**Prueba de cierre:**

- manual: una sesión LMU real que recorra las familias disponibles y replays
  complementarios para missing/stale o estados impracticables;
- IA: matriz acumulativa de familias, calidad, lifecycle, deduplicación,
  prioridad y salidas, con resultado machine-readable.

## Fase 3 — Control e interacción

**Propósito:** permitir que el usuario configure y controle Engineer de forma
comprensible, persistente y segura.

**Subfases probables:**

- centro de control, permisos y estados disabled;
- persistencia y recuperación de ajustes;
- dispositivos de entrada, PTT y hot-plug;
- personalidades, frecuencia y preferencias de presentación.

**Resultado observable:** las preferencias sobreviven al ciclo de vida
esperado, el usuario entiende qué está disponible y PTT funciona sin abrir el
micrófono fuera de su intención.

**Prueba de cierre:**

- manual: configurar, reiniciar, desconectar/reconectar dispositivos y
  comprobar permisos, PTT y fallback;
- IA: flujo acumulativo de interfaz y persistencia, lifecycle de dispositivos,
  permisos fail-closed y ausencia de efectos no confirmados.

## Fase 4 — Acciones LMU seguras

**Propósito:** pasar de informar a proponer y ejecutar cambios controlados sin
perder trazabilidad ni seguridad.

**Subfases probables:**

- preparación, explicación y cancelación de acciones;
- Pit Manager transaccional con readback;
- resultados applied, rejected, indeterminate y failed.

**Resultado observable:** ninguna acción cambia el simulador sin confirmación;
el estado final se demuestra o se declara inconcluso.

**Prueba de cierre:**

- manual: pruebas controladas con LMU real de confirmación, cancelación,
  aplicación, readback y fallo parcial;
- IA: aceptación acumulativa de la máquina de estados, fault injection,
  idempotencia, versiones y resultados, sin escrituras reales fuera de un
  protocolo manual autorizado.

## Fase 5 — Voz offline condicionada

**Propósito:** hacer viable una interacción de voz local sin bloquear Spotter ni
convertir una preferencia tecnológica en una capacidad ficticia.

Esta fase puede investigar en paralelo desde el inicio. Solo se integra en la
Beta cuando sus gates aplicables hayan pasado.

**Subfases probables:**

- viabilidad técnica, legal y perceptual de Kokoro;
- contenido y packs propios autorizados;
- STT para el catálogo cerrado y PTT;
- wake word por locale, privacidad y recuperación.

**Resultado observable:** voz ES/EN offline, cancelable y suficientemente
comprensible donde exista evidencia; en cualquier otro caso, PTT y las salidas
textual, visual o cache-only permanecen como fallback honesto.

**Prueba de cierre:**

- manual: escucha, pronunciación, números/unidades, reconocimiento, ruido,
  falsos positivos/negativos y dispositivos reales;
- IA: lifecycle completo del host, cancelación, recursos, catálogo, privacidad,
  gates por locale y validación de que la evidencia humana requerida está
  completa y separada correctamente.

## Fase 6 — Strategy y overlays avanzados

**Propósito:** conectar Engineer con la planificación y las superficies
avanzadas después de demostrar Spotter, monitores, control y acciones LMU.

**Subfases probables:**

- propuestas y aceptación explícita de Strategy;
- contratos y estados versionados;
- representación visual del plan y sus cambios;
- recuperación ante versiones obsoletas o integraciones no disponibles.

**Resultado observable:** Engineer puede proponer y reflejar una estrategia sin
aplicarla silenciosamente ni duplicar autoridades de Strategy u Overlays.

**Prueba de cierre:**

- manual: proponer, aceptar, rechazar, invalidar y visualizar cambios de plan
  durante un escenario controlado;
- IA: aceptación acumulativa de versiones, confirmaciones, estados finales,
  fallos de integración y paridad entre propuesta y superficies visuales.

## Fase 7 — Beta ES/EN integrada

**Propósito:** demostrar que el conjunto funciona como compañero de carrera
seguro y observable durante sesiones completas.

**Subfases probables:**

- diagnóstico, replays y explicación de decisiones;
- sesiones largas, carga, reconexión y recuperación;
- packaging, instalación, actualización y rollback;
- validación coordinada en Windows 10/11 y LMU real;
- correcciones derivadas de testers.

**Resultado observable:** una Beta ES/EN instalable y utilizable que puede
sustituir CrewChief dentro de su alcance declarado, sin presentar como listas
las capacidades que siguen condicionadas.

**Prueba de cierre:**

- manual: recorrido completo desde instalación y configuración hasta una
  sesión LMU prolongada, recuperación y revisión de diagnóstico;
- IA: ejecución de la aceptación acumulativa completa, incluyendo producto,
  interfaz, replays, soak, packaging y rollback, con informe único y trazable.

## Fase 8 — Expansión posterior

**Propósito:** ampliar cobertura después de estabilizar la primera Beta, sin
reabrir sus fundamentos.

**Subfases probables:**

- italiano y portugués brasileño;
- cambio de piloto y endurance ampliado;
- escucha always-on si la evidencia lo permite;
- nuevas familias relevantes;
- otros simuladores mediante el contrato canónico.

Cada ampliación vuelve a seguir el ciclo de entrada, replanning y prueba. No se
activa por herencia: idioma, simulador y capability requieren evidencia propia.

**Prueba de cierre:**

- manual: recorrido real focal de cada idioma, capability o simulador añadido,
  además de regresión de la Beta ya estable;
- IA: ampliación de la misma aceptación acumulativa con la nueva matriz y
  ejecución completa de todo el alcance anterior.

## Gates transversales

| Gate | Evidencia mínima | Efecto si falta |
|---|---|---|
| Datos y capabilities | Fuente, calidad y semántica demostrables | Familia unavailable |
| Audio y contenido | Salida, dispositivos, assets y licencias válidos | Fallback visual |
| Voz humana | Corpus consentido, intent/slot, FAR/FRR y escucha por locale | STT/wake/TTS disabled |
| Hardware | Dispositivo real, hot-plug y roundtrip | Binding disabled |
| Pit LMU | Confirmación, resultado y readback seguros | Escritura real disabled |
| Strategy | Contrato versionado y estado final | Integración disabled |
| Privacidad | Consentimiento, memoria y export explícito | Captura/export disabled |
| Beta | LMU real, Windows, soak, packaging y pruebas acumulativas | No promoción |

Un gate puede terminar GO, NO-GO o INCONCLUSIVE. Nunca se rebaja el criterio ni
se presenta una simulación como evidencia real para cerrar calendario.

## Definition of Done de una fase

- El resultado observable existe dentro del alcance declarado.
- La validación manual está ejecutada y registrada.
- La prueba acumulativa puede ser ejecutada y evaluada por otra IA.
- El flujo completo alcanzado sigue pasando, no solo el último corte.
- Capabilities, límites y NO-GO están visibles y son honestos.
- No hay findings razonables abiertos de severidad bloqueante.
- Handoff, Linear y documentos vivos reflejan el mismo estado.
- Rama, SHA, PR, CI y nivel de promoción se reportan con precisión.
- La fase siguiente todavía no se microplanifica: solo se inicia su replanning
  cuando Isaac decida entrar en ella.

## Siguiente transición

Revisar y aceptar este roadmap general. Después, al autorizar el inicio de la
Fase 1, crear su microplan concreto desde la nightly remota vigente. Ese
microplan deberá definir conjuntamente Spotter, audio y superficies visuales,
además del primer incremento de la prueba acumulativa ejecutable por IA.
