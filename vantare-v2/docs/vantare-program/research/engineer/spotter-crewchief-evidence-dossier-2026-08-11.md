---
topic: "CrewChief Spotter"
type: "technical-product"
goals: "Explicar funcionamiento, capacidades, límites y señales relevantes para una réplica funcional clean-room en Vantare"
date: "2026-08-11"
methodology: "Investigación paralela DeepSeek, revisión primaria de upstream oficial, trackers como escenarios secundarios y síntesis separada del plan de implementación."
---

# CrewChief Spotter — dossier de evidencia

> **Supuestos:** foco LMU/rFactor2, Spotter de seguridad y tráfico, upstream más
> reciente verificable a 2026-08-11. No se busca una copia exacta.
>
> **Frontera:** este dossier puede enlazar evidencia del competidor, pero no es
> una especificación de implementación. El microplan de Vantare no trasladará
> código, algoritmos, constantes, frases, audios, assets, UI ni nombres internos.

## Preguntas de investigación

1. ¿Cómo obtiene y transforma los datos el Spotter?
2. ¿Qué estados, transiciones, escenarios y controles ofrece?
3. ¿Cómo trata prioridad, audio, lifecycle, multiclase y fallos?
4. ¿Qué límites y defectos recientes son relevantes?
5. ¿Qué comportamiento merece replicarse, adaptarse, diferirse o rechazarse?

## Metodología y versión analizada

La investigación se ejecutó en varias tandas independientes: arquitectura y
máquina de estados; configuración, audio y casos límite; escenarios históricos
de regresión; y una pasada posterior dedicada únicamente a buscar omisiones.
Las conclusiones importantes se contrastaron además directamente contra el
upstream. Esta es una auditoría estática: no se ejecutaron CrewChief ni LMU y
no se evaluó ningún sound pack.

La rama pública vigente queda fijada en `main` HEAD
`3e0afdc6088187f9c92073f80abd7a25753b5a3c`, commit de 2026-08-07. La
última versión etiquetada es `V4.19.4.0`, creada el 2026-06-28 y resuelta a
`f0eab0a3041d43dd2cd3389d7b564ad16d3746f0`. El núcleo Spotter y audio
revisado no muestra cambios materiales entre ambos puntos; se usa el tag para
la descripción distribuida y `main` para comprobar actualidad.
[API de la rama `main`](https://gitlab.com/api/v4/projects/mr_belowski%2FCrewChiefV4/repository/branches/main),
[tags oficiales](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags),
[tag `V4.19.4.0`](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.4.0)
(acceso 2026-08-11; fuentes **Primarias**; confianza **Alta**).

Cada afirmación externa declara fuente y confianza. El changelog se usa como
catálogo de escenarios que alguna vez fallaron, nunca como prueba de que un
defecto siga presente o sea frecuente. Las ausencias se consideran de
confianza baja o media salvo que el contrato público permita demostrarlas.

## Arquitectura y flujo observable

CrewChief no tiene un único Spotter monolítico. En LMU reutiliza la familia
rFactor2: un reader obtiene scoring y telemetría desde shared memory, el
adaptador localiza al jugador y reúne rivales plausibles, y un motor geométrico
común transforma posiciones al marco del coche. Otra capa decide transiciones
y mensajes; el reproductor gestiona cola, prioridad, interrupción y canal de
audio. Multiclase, banderas, coches lentos/detenidos y pits son monitores
separados que complementan al Spotter lateral.
[reader LMU](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/LMU/LMUSharedMemoryReader.cs),
[adaptador rFactor2/LMU](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/RF2/RF2Spotter.cs),
[motor geométrico](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/NoisyCartesianCoordinateSpotter.cs),
[audio](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/Audio/AudioPlayer.cs)
(acceso 2026-08-11; fuentes **Primarias**; confianza **Alta**).

El adaptador LMU/rFactor2 usa telemetría de mayor fidelidad cuando existe y
recurre a scoring como fallback. Descarta jugador, rivales en pits y filas con
distancia de vuelta inválida. El motor común usa orientación del jugador,
posición actual, movimiento del jugador y posiciones de rivales; cuando no
recibe velocidades rivales directas estima movimiento a partir de muestras
anteriores. La plausibilidad de velocidad solo condiciona la entrada de un
solape nuevo, mientras una ocupación ya activa usa una zona de salida más
permisiva. El principio observable es histéresis más rechazo de saltos; los
detalles no son una especificación para Vantare.
[adaptador](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/RF2/RF2Spotter.cs),
[geometría](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/NoisyCartesianCoordinateSpotter.cs)
(acceso 2026-08-11; fuentes **Primarias**; hechos con confianza **Alta**;
interpretación clean-room con confianza **Media**).

El ciclo de decisión es corto y separado del loop general. Antes de
encolar/solicitar reproducción se vuelve a comprobar que la situación requerida
siga presente; no equivale a una revalidación justo antes de sonar en el
dispositivo. Al cambiar el estado se retiran avisos inmediatos incompatibles.
Los avisos de seguridad
caducan, los recordatorios tienen frecuencia propia y los clears usan un
margen y una espera. Sin embargo, los clears **no son delivery-aware**: el
detector puede marcar el antecedente como comunicado al enviarlo a cola aunque
el duplicado sea rechazado, expire, se purgue, falle el dispositivo o esté
silenciado. Vantare debe vincular el clear a una entrega válida de la misma
generación sin confundir transporte iniciado con audibilidad física.
[motor Spotter](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/NoisyCartesianCoordinateSpotter.cs),
[audio](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/Audio/AudioPlayer.cs)
(acceso 2026-08-11; fuentes **Primarias**; confianza **Alta**).

La prioridad Spotter es distinta de la conversación Engineer: obtiene el
siguiente turno, pero solo un backend concreto puede cortar el audio
informativo ya iniciado. No interrumpe un beep ni otro Spotter en reproducción.
La gestión del canal contempla continuidad, beeps opcionales, voz Spotter
seleccionable y ganancia relativa propia sobre el canal compartido. Son
capacidades de experiencia, no contenido reutilizable.
[audio](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/Audio/AudioPlayer.cs),
[moderación](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/Audio/PlaybackModerator.cs),
[configuración](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/Properties/Settings.settings)
(acceso 2026-08-11; fuentes **Primarias**; confianza **Alta**).

## Capacidades y escenarios

### Seguridad lateral

La máquina observable distingue: libre, rival a izquierda, rival a derecha,
rivales a ambos lados, ocupación sostenida, liberación de un lado y liberación
total. También distingue dos rivales físicamente paralelos en el mismo lado y
puede indicar en qué extremo del grupo se encuentra el jugador. Si dos rivales
del mismo lado están en fila, los colapsa y no los presenta como tres en
paralelo. No existe un mensaje diferenciado de “cuatro coches en paralelo”:
los conteos adicionales se reducen a las categorías disponibles.
[máquina y geometría](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/NoisyCartesianCoordinateSpotter.cs)
(acceso 2026-08-11; fuente **Primaria**; confianza **Alta**).

Las transiciones cubren entrada directa por cada lado, paso de un lado a ambos,
reducción desde ambos a un lado, rebote alrededor del umbral y ocupación
prolongada. Un clear puede quedar pendiente, cancelarse si reaparece el rival o
ser sustituido por un estado más actual. No existe una transición específica
izquierda->derecha en un solo tick sin muestra libre: el efecto perceptual
exacto requiere runtime, pero estáticamente puede heredar antecedentes del lado
anterior. El sistema conserva contexto para no repetir sin límite el aviso
inicial.
[máquina Spotter](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/NoisyCartesianCoordinateSpotter.cs)
(acceso 2026-08-11; fuente **Primaria**; confianza **Alta**).

### Gates de sesión y ciclo de vida

En LMU/rFactor2 el Spotter lateral se inhibe durante formación, dentro de pits,
al comienzo inestable de carrera, sin tiempo real válido, sin rivales y en
clasificación privada. El control global puede activarlo o desactivarlo durante
la sesión. FCY se gobierna fuera del detector: según configuración puede
pausarse de inmediato o esperar a nueva vuelta, timeout o baja velocidad sin
solape; al terminar la caution vuelve a habilitarse inmediatamente. Ni esta
pausa ni los retornos tempranos de pits/formación limpian de forma contractual
geometría, mensajes pendientes o antecedentes comunicados. No quedó demostrado
un protocolo explícito de rearme seguro para pit exit, teleport o rejoin.
[adaptador rFactor2/LMU](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/RF2/RF2Spotter.cs),
[orquestación](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/CrewChief.cs),
[Spotter base](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/Events/Spotter.cs)
(acceso 2026-08-11; fuentes **Primarias**; gates con confianza **Alta**;
rearme ausente con confianza **Media**).

### Tráfico anticipado y multiclase

La proximidad lateral no depende de la clase. Los avisos de tráfico son otra
familia: diferencian clases más rápidas y más lentas, coche o grupo, líder y
coches en lucha; necesitan clase válida, grid suficiente, madurez temporal y
datos de ritmo/distancia. Se silencian cuando la evidencia no basta y aplican
deduplicación y cooldown. Esto permite que la alerta de seguridad permanezca
inmediata mientras la narración multiclase puede ser más conservadora.
[multiclase](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/Events/MulticlassWarnings.cs)
(acceso 2026-08-11; fuente **Primaria**; confianza **Alta**).

### Banderas, doblados e incidentes

Blue flags y relaciones de doblaje tienen memoria y límites de repetición; los
mensajes demorados se revalidan. Banderas locales, coche lento/detenido e
incidentes pertenecen a monitores distintos, con deduplicación por situación.
La revisión de código demuestra la superficie, no que la atribución de un
incidente sea precisa en LMU actual. Rejoin seguro del jugador no aparece como
una capacidad dedicada equivalente.
[flags](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/Events/FlagsMonitor.cs),
[oponentes](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/Events/Opponents.cs)
(acceso 2026-08-11; fuentes **Primarias**; superficie con confianza **Alta**;
precisión LMU y ausencia de rejoin con confianza **Baja**).

### Matriz de alcance observable

| Capacidad | CrewChief público | Consecuencia clean-room para Vantare |
|---|---|---|
| Left/right y ocupación sostenida | Demostrada estáticamente | **KEEP**, pero validar con replay LMU propio. |
| Rival a cada lado | Demostrada | **KEEP** como estado autocontenido. |
| Dos rivales paralelos en el mismo lado | Demostrada y direccional | **BUILD**; hoy Vantare pierde esta semántica. |
| Clear parcial/total | Demostrado | **KEEP/ENDURECER** con antecedente iniciado y generación fresca. |
| Rebote/histéresis | Demostrado | **ADAPT** con valores derivados en Vantare. |
| Entrada absurda/teleport | Hay plausibilidad de movimiento | **BUILD** como policy explícita y observable. |
| Pits/formación/inicio/FCY | Gates demostrados | **BUILD** solo tras proyectar señales LMU fiables. |
| Ghost/disconnect/reorden de filas | Tratamiento parcial; estabilidad no demostrada | **BUILD** fail-closed y regresiones propias. |
| Tráfico rápido/lento multiclase | Familia separada demostrada | **BUILD** después del núcleo lateral. |
| Blue flag/doblaje | Monitores separados demostrados | **BUILD** solo con relación canónica demostrable. |
| Local yellow/slow/stopped/accident | Superficie existente | **DEFER** atribución; admitir solo hechos fiables. |
| Rejoin seguro | No demostrado como función dedicada | **BUILD** propio condicionado a señales. |
| Oval inside/outside | Existe para otros usos | **REJECT** para Beta LMU. |
| Frases, audios, voces y comandos | Assets upstream | **REJECT** reutilización. |

## Configuración y experiencia

CrewChief expone una superficie extensa: encendido, voz Spotter, volumen,
dimensiones, margen de clear, sensibilidad geométrica indirecta, cadencias,
demoras, supresión por tipo de sesión, lógica oval y opciones de canal. La
configuración pública permite adaptar muchos simuladores, pero también traslada
al usuario decisiones que Vantare puede resolver con presets seguros y
diagnóstico. La réplica funcional no requiere reproducir ese panel.
[settings oficiales](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/Properties/Settings.settings),
[Spotter](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/NoisyCartesianCoordinateSpotter.cs)
(acceso 2026-08-11; fuentes **Primarias**; existencia con confianza **Alta**;
decisión UX con confianza **Media**).

Para Vantare la superficie pública aconsejable queda limitada a encendido,
salida/dispositivo, volumen, nivel de frecuencia y sensibilidad en presets. Los
umbrales finos, rechazos y capabilities deben ser visibles en diagnóstico y en
la aceptación, no presentarse como valores que el piloto deba calibrar.

## Fiabilidad, limitaciones y vacíos

El historial LMU/rFactor2 contiene arreglos por colisiones de versiones del
plugin, restauraciones urgentes de operación, fallos del juego que afectaban al
Spotter, avisos repetidos o incorrectos de rivales y cambios de APIs LMU. Son
señales para construir regresiones de desconexión, filas inestables y lifecycle;
no prueban prevalencia en la versión actual.
[tags actuales](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags),
[historial de tags](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags?page=2)
(acceso 2026-08-11; fuentes **Primarias**; historial con confianza **Alta**;
prevalencia actual **Baja**).

Riesgos que el upstream hace visibles o no cierra de forma demostrable:

- falsa alerta por ghost, fila reordenada, ID reutilizado, teleport, reset o
  pit lane paralela;
- false clear por desaparición momentánea, cambio de generación o antecedente
  que nunca llegó a comunicarse;
- mensaje stale después de source loss, pit exit o rejoin;
- spam por rebote geométrico o persistencia de blue flag/incidente;
- colisión entre aviso lateral, tráfico multiclase y otros mensajes urgentes;
- identidad de rival basada en el orden de la colección en partes del detector;
- ausencia de evidencia runtime pública para latencia, falsos positivos y
  precisión LMU real.

La segunda lectura del núcleo añade límites específicos. Un cambio directo de
izquierda a derecha sin frame libre no posee una transición dedicada clara; el
reset no limpia de forma obviamente completa todo el historial espacial;
pausar/desactivar no demuestra cancelación contractual del audio ya aceptado;
y parte de la caché de velocidad rival se asocia a la posición en la lista, no
a una identidad estable. Además, la geometría es plana, aproxima rectángulos
alineados con el jugador y usa dimensiones del coche del jugador para el
conjunto. Cruces de pista, banking, trompos, clases con tamaños muy distintos y
reorden de la lista requieren pruebas propias.
[núcleo](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/NoisyCartesianCoordinateSpotter.cs),
[adaptador](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/RF2/RF2Spotter.cs),
[audio](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/AudioPlayer.cs)
(acceso 2026-08-11; fuentes **Primarias**; estructura con confianza **Alta**;
efecto runtime con confianza **Media**).

CrewChief también representa ausencia mediante posiciones especiales y puede
silenciar una coordenada cero legítima. Los buffers de scoring y telemetría se
leen de manera coordinada pragmática, pero no forman un snapshot atómico. Son
debilidades que Vantare no debe replicar porque ya posee presencia/freshness y
snapshot canónicos.
[núcleo](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/NoisyCartesianCoordinateSpotter.cs),
[reader](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/RF2/RF2SharedMemoryReader.cs)
(acceso 2026-08-11; fuentes **Primarias**; confianza **Alta**).

No se encontró una suite activa completa de geometría/transiciones en el
upstream; el helper localizado cubre una parte de la retirada de mensajes, no
la matriz espacial y de lifecycle. Por ello “está en CrewChief” no equivale a
“está verificado”.
[árbol oficial de tests](https://gitlab.com/api/v4/projects/9438945/repository/tree?ref=3e0afdc6088187f9c92073f80abd7a25753b5a3c&path=UnitTest&recursive=true&per_page=100),
[helper localizado](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/UnitTest/Refactoring/RefactorNoisyCartesianCoordinateSpotter.cs)
(acceso 2026-08-11; fuentes **Primarias**; confianza **Alta**).

El worker Spotter usa polling configurable, pero el reader rFactor2/LMU no
aporta un gate observable de payload nuevo ni una generación Spotter. Una
pérdida de muestra puede reducir el conteo e iniciar un clear sin distinguir
separación física de dato ausente; una excepción del worker termina ese loop y
no quedó demostrado el reconnect completo de esa ruta. Esto refuerza que
Vantare debe rechazar duplicados/regresiones y cancelar por epoch en sus propias
fronteras.
[reader](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/RF2/RF2SharedMemoryReader.cs),
[worker](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/CrewChief.cs)
(acceso 2026-08-11; estructura con confianza **Alta**; recuperación runtime
con confianza **Baja**).

Los subtítulos sí conservan el rol Spotter, pero se publican antes del mute y
de la reproducción física. “Visual mostrado”, “audio intentado” y “audio
iniciado” son estados distintos. La revisión estática también demuestra
selección/fallback de dispositivo, pero no valida hardware real, hot-plug
durante un clip, audibilidad ni sincronía visual. Esos requisitos deben probarse
sobre Vantare y no inferirse del competidor.
[subtítulos](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/Audio/SubtitleManager.cs),
[audio](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/V4.19.4.0/CrewChiefV4/Audio/AudioPlayer.cs)
(acceso 2026-08-11; superficie estática con confianza **Alta**; experiencia
física **No demostrada**).

## Síntesis clean-room

Lo valioso para replicar es el contrato observable: detector lateral separado,
estado finito, histéresis, mensajes breves caducables, revalidación, prioridad,
silencio por falta de evidencia y separación entre seguridad inmediata y
tráfico informativo. Vantare debe conservar sus ventajas actuales: IDs
canónicos, capabilities/freshness tipadas, ACK de inicio, misma presentación
para audio/visual y cancelación por generación.

No se trasladarán algoritmos, constantes, nombres internos, estructura de
clases, textos, comandos, voces, audios, assets ni UI. Los parámetros se
derivarán de capturas y replays LMU propios. En particular, los comentarios del
código Vantare que atribuyen valores concretos a CrewChief no constituyen
evidencia de que esos valores sean correctos para Vantare y deben revisarse en
la fase de implementación.

### Inventario final

- **KEEP:** proyección canónica, fail-closed, state/policy separadas, clears
  contextuales, prioridad Spotter, lifecycle, radio/subtítulos compartidos.
- **FIX FIRST:** autoridad de sensibilidad, enable/disable aislado, reset de
  estado, defaults de locale/audio y observabilidad de entrega real.
- **BUILD:** same-side three-wide direccional, plausibilidad de movimiento,
  ghost/active state, game phase y rearme seguro, replay LMU extremo a extremo.
- **BUILD AFTER CORE:** tráfico multiclase, blue flag/doblaje, pit exit y
  rejoin cuando sus señales estén demostradas.
- **DEFER:** atribución de accidente, narración avanzada y heurísticas sin
  fuente LMU firme.
- **REJECT:** oval para Beta LMU, copia exacta, parámetros públicos de bajo
  nivel y cualquier asset o corpus de CrewChief.

Quedan deliberadamente como **no demostrados**: tasas reales de falsos
positivos/negativos, latencia audible, comportamiento ante todos los teleports,
reordenaciones o reconnects breves, precisión de incidentes, y paridad runtime
de la versión distribuida con cada rama estática examinada.
