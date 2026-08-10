# Fase 1 — microplan de Spotter observable

Estado: propuesta para revisión. No inicia implementación ni mueve ISA-187,
ISA-189 o sus dependencias. Base de planificación:
`origin/nightly@0fecff216e19ef0c9cccf68a4d04dda6a269f021`.

## Resultado de la fase

Vantare entrega en LMU un Spotter de seguridad y tráfico que usa la misma
decisión fresca para audio ES/EN y para radio, subtítulos, Desktop y OBS. El
sistema avisa de las situaciones demostrables, prioriza la seguridad y calla o
degrada de forma visible cuando faltan señal, audio o certeza.

No se busca una copia exacta de CrewChief. La fase replica valor observable con
contratos y evidencia propios de Vantare.

## Alcance de cierre

El núcleo no renunciable de la fase comprende S1-S5: autoridades e integración,
seguridad lateral completa, lifecycle, entrega audio/visual honesta, LMU real y
tráfico multiclase/doblados. No puede cerrarse marcando ese núcleo
`unavailable`. Los peligros de S6 se implementan cuando la señal es demostrable
o se declaran `unavailable` con evidencia de insuficiencia, owner y condición
concreta de reapertura. Con esa distinción, la fase cubre estos grupos:

- ocupación izquierda, derecha, ambos lados y dos rivales paralelos en un mismo
  lado;
- entrada, permanencia, cambio de lado, clear parcial, clear total y rebote;
- pits, formación, salida, FCY, baja velocidad, garage/ghost, teleport,
  disconnect, reconnect y cambio de epoch/identidad;
- plausibilidad de movimiento y closing speed sin ocultar tráfico multiclase;
- tráfico más rápido/lento, grupos, doblados y relaciones de clase;
- coche lento, detenido, accidente, bandera local y rejoin cuando la señal LMU
  permita afirmarlos con seguridad;
- prioridad, preempción, expiración, output modes, cache hit/miss, dispositivo,
  hot-plug y fallback visual;
- paridad de intención, idioma, TTL y lifecycle entre audio, radio, subtítulos,
  Desktop y OBS;
- latencia observable con objetivo Vantare inferior a 150 ms para el camino
  de alerta inmediata, medida de forma reproducible y separada en
  captura->decisión, decisión->visual, decisión->player y juicio humano de
  audibilidad. El objetivo no puede presentarse como audible mientras el
  endpoint correspondiente no esté instrumentado.

El cambio de piloto no se implementa como función. Un cambio de identidad sí
sigue siendo una frontera que cancela estado stale. Oval, acciones sobre LMU,
Pit Manager, conversación libre, wake word y assets de CrewChief están fuera.

## Dependencias y gates de entrada

1. ISA-313 debe cerrar la reconciliación de Nightly y este plan.
2. El runtime audible mínimo depende de la cadena de audio offline vigente
   —incluido el host/pack autorizado y el corte de dispositivos—; la síntesis
   Kokoro nunca entra en el camino crítico de una alerta. Kokoro es el objetivo
   TTS, pero su generación/host solo entra tras el GO independiente de licencia,
   G2P, rendimiento y escucha humana; Fase 1 integra primero reproducción
   cache-only de assets propios/licenciados. El gate `G-AUDIO-PACK-ESEN` será
   propiedad de la issue de Audio/Contenido creada al replanificar S4 y exige,
   como mínimo, origen, licencia comercial, cobertura de intents ES/EN, hashes
   y aceptación humana documentada. Si no pasa, S4 no empieza y Fase 1 queda
   bloqueada; no se maquilla como capability `unavailable` ni como Beta.
3. Cualquier nueva señal de Telemetry Core requiere evidencia LMU de
   provenance/freshness, contrato versionado y review de ADR 0005.
4. Textos y voces son propios, solo ES/EN para el cierre de esta fase.
5. Cada subfase se replantea de forma concreta al comenzar desde la Nightly
   remota vigente. Este documento no fija archivos, constantes ni algoritmos.
6. Una dependencia nueva, cambio de arquitectura o señal contradictoria activa
   stop condition y vuelve a revisión de Isaac.

## Regla de ejecución

Cada subfase es un corte vertical pequeño: entrada canónica, decisión, policy,
delivery y salida observable permanecen compilables. El mismo corpus de
aceptación se amplía en cada corte; no se crean harnesses paralelos por familia.
Los parámetros de geometría y tiempo se derivan de capturas/replays propios y
no de valores del competidor.

Cada subfase termina con dos evidencias inseparables: una validación manual
proporcional al comportamiento incorporado y una ampliación del test
acumulativo que una IA puede descubrir, ejecutar y evaluar. La validación
manual no se pospone toda a S7; S7 repite y consolida la matriz completa.

## Subfases probables

### S1. Autoridades y baseline confiable

**Resultado observable:** apagar Spotter no apaga Engineer; cambiar
sensibilidad produce una sola geometría; disable/re-enable empieza limpio; el
locale ES/EN gobierna presentación y audio de forma coherente.

**Trabajo probable:** aislar enable/reset, unificar autoridad de sensibilidad,
corregir defaults de locale/audio, filtrar cada fila rival por calidad y hacer
honesta la UI sobre persistencia y estado audible; rechazar secuencias
duplicadas/regresivas y hacer que `audio-only` falle visiblemente ante cache o
player ausente. La decisión del detector —preset y lados activos/histéresis— se
propaga como una sola decisión espacial versionada; `SemanticEvidence` deja de
reclasificar por su cuenta. S1 neutraliza los gates legacy muertos de
`GamePhase` para FCY y `GridSide`, e incluye `GridSide` en el inventario para
retirarlo o rederivarlo antes de que S2 modifique geometría. El estado canónico
nuevo queda para S3.

**Prueba que se añade:** regresiones productivas de Spotter off con otra familia
activa y con entrega/cola Fuel en vuelo, tres presets en un borde y cambio de
preset durante overlap —incluido el borde de histéresis—, re-enable sin clear
stale, filas parciales y
cache ES/EN hit/miss; replay `10->5->disconnect->6` y output audio-only sin
resolver/player. El smoke manual confirma controles, idioma y degradación en la
aplicación; el mismo corte queda incorporado al comando acumulativo.

**Salida:** ningún P1 conocido de integración permanece abierto. Si cambia la
frontera entre contrato canónico y frame legacy, se detiene para ADR/revisión.

### S2. Núcleo lateral completo

**Resultado observable:** el piloto recibe un estado correcto para un rival por
lado, uno a cada lado y dos rivales paralelos en el mismo lado; los rivales en
fila no producen un three-wide falso.

**Trabajo probable:** completar el modelo de ocupación sin reducir demasiado
pronto las zonas a booleanos, usar dimensiones demostrables o fail-closed,
incorporar plausibilidad de movimiento y conservar clears contextuales. Como
gate clean-room, inventariar y retirar nombres, comentarios, parámetros y tests
cuya única autoridad sea CrewChief; rederivarlos desde evidencia LMU/Vantare y
obtener review independiente. El gate incluye `core/runtime.go`, multiclass y
los tests, no solo el paquete de geometría.

**Prueba que se añade:** matriz de topología, entrada/salida, same-side,
four-wide degradado de forma segura, cambio de lado, flicker, pérdida de una
muestra, sustitución de identidad en el mismo lado, tamaños/clases, teleport y
saturación de cola; añade `StateBoth` sostenido y pit lane/tramo paralelo como
escenarios negativos. El smoke manual reproduce las topologías disponibles y
el test acumulativo fija eventos esperados y prohibidos.

**Salida:** toda transición lateral tiene evento esperado y eventos prohibidos;
no existe clear sin antecedente realmente iniciado en la misma generación.

### S3. Lifecycle e inhibición LMU

**Resultado observable:** Spotter se silencia y rearma correctamente en pits,
formación, salida, FCY, baja velocidad, garage/ghost, source loss, reconnect y
cambios de identidad.

**Trabajo probable:** proyectar únicamente game phase/control/active state que
LMU demuestre, definir estados explícitos de inhibición/rearme y exigir snapshot
nuevo tras cualquier frontera. Antes de editar debe existir una issue propietaria
del contrato Telemetry Core -> Engineer, con semántica
`supported/degraded/unavailable`, provenance/freshness y captura LMU. Si no hay
capacidad de crearla o la señal no está probada, S3 no empieza.
El gate legacy de `GamePhase` que hoy recibe siempre cero se retira o neutraliza
en S1; S3 introduce el estado canónico sin reactivarlo por herencia.

**Prueba que se añade:** pit entry/exit, formación->green, green->FCY->green,
reset a pits, fila ghost, rival que desaparece/reaparece, cursor duplicado o
regresivo, disconnect durante overlap/clear y reconnect.

El smoke manual recorre las fronteras que LMU permita provocar; el test
acumulativo cubre todas con trazas versionadas y exige un reason cuando una no
esté disponible.

**Salida:** cada silencio posee un reason acotado; ningún mensaje de una
generación anterior puede volver a aparecer.

### S4. Entrega audible y visual única

**Resultado observable:** una alerta válida se oye, se ve o degrada de manera
honesta desde una sola Presentation; Spotter preempta Engineer sin dejar audio o
visual tardío.

**Trabajo probable:** terminar el mínimo audio offline ES/EN como reproducción
cache-only de pack propio/licenciado, alinear locale/voz/dispositivo, distinguir
decisión, inicio de transporte, comienzo del player y resultado terminal, y
mantener `WidgetVisualHost` como único renderer. Kokoro prepara ese pack fuera
del camino crítico únicamente si su gate independiente está en GO. La
replanificación de S4 debe decidir con evidencia si sustituye el player actual
PowerShell/WPF por clip —que añade una espera inicial y carece de ACK audible—;
si no lo sustituye, el objetivo <150 ms no puede incluir comienzo audible.

**Prueba que se añade:** cache hit/miss/error/timeout, dispositivo ausente y
hot-plug, output audio/visual/both/disabled, Spotter sobre Engineer, Spotter
sobre Spotter, cancelación durante resolución/reproducción y paridad
Wails/SSE/Desktop/OBS; también provoca un gap de stream sin desconexión. El
smoke manual confirma audibilidad, selección/fallo de dispositivo y sincronía;
la ampliación acumulativa distingue `cache_hit`, `cache_miss`,
`locale_mismatch`, `transport_started`, `player_started` y `player_failed` sin
afirmar audibilidad física. Distinguir miss de mismatch exige sustituir el
resultado ambiguo de `ResolvePresentationCached` por un resultado tipado; se
trata como cambio de contrato y conserva fallo cerrado para versiones
desconocidas.

**Salida:** el producto no llama “audible” a un simple ACK; visual sigue siendo
completo ante miss y nunca se sintetiza dentro del deadline de la alerta.

### S5. Tráfico multiclase y doblados

**Resultado observable:** la seguridad lateral conserva prioridad mientras el
piloto recibe avisos no invasivos de tráfico rápido/lento, grupos y doblados.

**Trabajo probable:** separar la familia informativa de la ocupación lateral,
usar clase, grid, deltas y muestra mínima demostrables, y aplicar dedupe,
cooldown y revalidación por identidad.

**Prueba que se añade:** misma clase, clase rápida/lenta, coche/grupo, líder,
lucha por posición, datos inmaduros, cambio de orden/ID, pits y coexistencia con
un overlap lateral.

El smoke manual valora oportunidad y spam en tráfico real; el test acumulativo
verifica prioridad, dedupe, cooldown, identidad y silencios prohibidos.

**Salida:** sin clase o relación fiable hay silencio; un aviso informativo nunca
retrasa una alerta lateral.

### S6. Peligros y rejoin capability-gated

**Resultado observable:** se comunican coche lento/detenido, accidente,
bandera local y rejoin solo cuando Vantare puede demostrar el hecho y su zona;
si no, la capability permanece unavailable sin inferir causantes.

**Trabajo probable:** incorporar las señales canónicas mínimas, separar orden
oficial de inferencia, revalidar avisos demorados y deduplicar por incidente.

**Prueba que se añade:** peligro que aparece, persiste, cambia y desaparece;
misma incidencia en vueltas sucesivas; señal stale/missing; atribución
indeterminada; entrada/salida de pista con tráfico y sin señal suficiente.

El smoke manual solo ejecuta capabilities anunciadas por la build; el test
acumulativo demuestra tanto mensajes válidos como silencio fail-closed.

**Salida:** no se atribuye culpable ni se da instrucción de conducción; cada
mensaje posee evidencia fresca o se suprime con reason explícito.

### S7. Cierre LMU y aceptación acumulativa

**Resultado observable:** una persona puede reproducir la experiencia en LMU y
otra IA puede ejecutar/evaluar todo lo alcanzado con un único procedimiento.

**Trabajo probable:** captura real Windows/LMU, promoción de trazas sanitizadas
al corpus, soak/race/latencia, documentación y reconciliación final de Linear,
handoff y roadmap.

**Salida:** se cumplen conjuntamente la validación manual y la prueba
acumulativa siguientes; los elementos unavailable quedan visibles y no se
presentan como Beta terminada.

## Prueba de cierre de la fase

### A. Validación manual reproducible

El runbook final registra SHA de Vantare, versión LMU/plugin, circuito/coche,
sesión, idioma, dispositivo, output mode y hashes de evidencia. Una persona
ejecuta como mínimo:

1. izquierda, derecha, rival a cada lado y dos rivales en el mismo lado;
2. entrada breve, overlap sostenido, cambio de lado, rebote y clears;
3. pit entry/exit, formación, salida, FCY y baja velocidad;
4. tráfico multicategoría rápido/lento, grupo y doblado;
5. slow/stopped/accident/local flag/rejoin donde la build declare capability;
6. ghost/reset/teleport, source loss y reconnect durante alerta y clear;
7. audio ES y EN, cache hit/miss, dispositivo ausente/hot-plug y output modes;
8. preempción con Engineer hablando y dos avisos Spotter consecutivos;
9. Desktop y OBS simultáneos, con radio y subtítulos;
10. sesión prolongada para spam, falsos clears, drops y latencia.

Se conservan vídeo con audio, log sanitizado, health/métricas y checklist. La
persona juzga audibilidad, pronunciación, oportunidad y falsos positivos; la IA
no suplanta ese juicio.

### B. Prueba acumulativa ejecutable por IA

Un único comando documentado, cuyo nombre se decide en S1, debe:

- verificar prerequisitos y hashes del corpus;
- alimentar replays canónicos versionados por la composición productiva;
- recorrer proyección, Spotter, policy, delivery y Presentation;
- capturar outcomes, ACKs, cache/player, stream Wails y SSE y superficies
  automatizables;
- comparar un golden normalizado con eventos esperados y prohibidos, orden,
  generaciones, deadlines y métricas;
- cubrir todas las subfases ya aceptadas, nunca solo el último cambio;
- producir un informe JSON acotado con `pass/fail`, SHA, escenarios, motivos y
  enlaces a la evidencia manual requerida;
- fallar si falta la evidencia humana vigente para audibilidad/ergonomía;
- verificar mediante un gate automatizable que no quedan nombres, citas,
  comentarios o parámetros cuya única autoridad sea CrewChief en
  `internal/engineer/spotter/**`, `internal/engineer/core/runtime.go`, sus tests
  y `internal/engineer/multiclass/**`; el gate falla ante citas de ruta/línea
  upstream, identificadores internos ajenos o valores numéricos atribuidos al
  competidor, no solo ante su nombre, y también si una ruta declarada no
  resuelve ningún fichero. El review humano independiente sigue siendo
  obligatorio;
- poder ser descubierto y ejecutado por una IA sin leer implementación.

La matriz acumulativa incluye geometría, calidad por fila, lifecycle, pits,
ghost/teleport, reconnect, output modes, ES/EN, cache/dispositivo, preempción,
multiclase, peligros capability-gated, backpressure, soak y latencia.

Como oráculos negativos mínimos, falla si: Spotter apagado altera `connected`,
`lastError` o el procesamiento/entrega de Fuel; una
secuencia duplicada/regresiva cambia estado; una fila incompleta crea ocupación
o clear; source loss produce clear; aparece un clear sin antecedente `started`
de la misma generación; reaparece una generación antigua; `audio-only` sin
cache/player termina con éxito; multiclase retrasa una alerta lateral; o un gap
de stream no fuerza rehidratación ni error explícito.

Al concretar cada subfase se fijan antes de implementar su protocolo manual y
automatizado: duración/repeticiones/carga, percentiles y extremos de reloj,
tolerancias de falsos avisos, clears y drops, y manifiesto/hash de evidencia.
Este microplan general no congela ahora esos valores. El test técnico puede
verificar la existencia y vigencia del manifiesto, pero no depender de que un
vídeo local privado esté presente en cada checkout.

Las capturas LMU promovidas al corpus necesitan contrato de sanitización y
provenance: origen/versión, campos retirados o transformados, hashes, permiso de
uso y revisión que impida datos personales o secretos. El comando valida su
manifiesto antes de aceptar los replays.

## Criterios de cierre

- Cero findings P0/P1 abiertos; P2 aceptados solo con owner y razón explícita.
- El núcleo no renunciable S1-S5 está implementado; solo S6 puede quedar
  `unavailable`, con evidencia de insuficiencia, owner y condición de reapertura,
  nunca “pendiente” ambiguo.
- Prueba manual completa con evidencia revisada.
- Aceptación acumulativa pasa desde un checkout limpio y produce informe
  inequívoco.
- Suite Go/frontend, build Windows y checks focales aplicables pasan; cualquier
  excepción queda documentada sin ocultarse.
- Handoff, Linear, roadmap y estado Git/PR/CI coinciden.
- Isaac aprueba la entrega aislada antes de cualquier promoción a Nightly.

## Promoción y rollback

Cada subfase vive en issue/rama/worktree aislados y se revisa antes de entrar en
la siguiente. El flujo sigue `issue -> aprobación de Isaac -> nightly ->
testers -> master`; esta propuesta no autoriza ninguna promoción.

Cada corte debe poder revertirse sin borrar fixtures ni evidencia útil. Un
contrato nuevo conserva fallo cerrado para versiones desconocidas y no elimina
la ruta anterior hasta que la aceptación acumulativa pruebe el reemplazo.

Al cerrar esta fase no se concreta la Fase 2: se vuelve a planificar desde el
estado real alcanzado.
