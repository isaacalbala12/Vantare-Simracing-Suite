---
topic: "CrewChief — dossier documental y estático para análisis clean-room"
type: "product-technical"
goals: "Inventariar evidencia pública vigente y alimentar, mediante una frontera clean-room separada, decisiones Vantare para ISA-187..200."
date: "2026-08-10"
methodology: "Investigación web y repositorio público en ejes independientes; síntesis y revisión adversarial final. Citaciones inline con fecha, tipo de fuente y confianza."
---

# CrewChief — dossier de evidencia documental y estática

> **Tipo:** evidencia de producto/técnica, sin validación runtime | **Fecha de corte:** 2026-08-10
>
> **Acceso:** artefacto de análisis. No es una especificación de implementación.
> Los implementadores deben usar exclusivamente el brief clean-room hermano,
> los contratos Vantare y evidencia LMU propia.
>
> **Supuestos:** se estudia el upstream público más reciente verificable de
> CrewChief para orientar Vantare en LMU, Windows y uso offline. La prioridad
> es paridad funcional relevante, no equivalencia exacta. Español e inglés
> forman la primera etapa de Vantare; italiano y portugués brasileño permanecen
> en el gate final.
>
> **Límite clean-room:** este informe puede describir comportamiento observable,
> documentación pública, releases, issues y arquitectura a nivel de concepto.
> No autoriza copiar o traducir código, frases, gramáticas, nombres internos,
> audios, assets, UI ni estructuras protegidas.
>
> **Aviso jurídico:** esta sección resume fuentes públicas y política interna;
> no constituye opinión legal. Toda reutilización requiere clearance por
> artefacto y procedencia verificable.

## Preguntas de investigación

1. ¿Qué versión y commit públicos representan el estado más reciente de
   CrewChief y qué cambió recientemente?
2. ¿Qué comportamientos de Spotter, monitores, audio, voz/comandos, Pit Manager,
   endurance y multiclase son relevantes para Vantare?
3. ¿Qué mecanismos de prioridad, caducidad, lifecycle y fallback explican la
   experiencia observable sin convertirse en un diseño para copiar?
4. ¿Qué permite o restringe la licencia por capa —código, frases, sound packs,
   modelos y documentación— y qué debe permanecer fuera de Vantare?
5. Frente a `origin/nightly@7e39104a7e876b4c396a41403023ba6030b88a08`,
   ¿qué debe conservarse, adaptarse, construirse, diferirse o rechazarse?

## Metodología y trazabilidad

La investigación se divide en ejes independientes. Cada hallazgo debe enlazar
la URL exacta, indicar acceso `2026-08-10`, clasificar la fuente como
**Primaria**, **Establecida** o **Baja**, y declarar confianza **Alta**,
**Media** o **Baja**. Las fuentes oficiales sostienen hechos sobre CrewChief;
foros y opiniones solo aportan señales y nunca elevan por sí solos una decisión
crítica. Las contradicciones y ausencias se conservan explícitamente.

El upstream queda fijado en el repositorio público
[`mr_belowski/CrewChiefV4`](https://gitlab.com/mr_belowski/CrewChiefV4), rama
`main`, HEAD `3e0afdc6088187f9c92073f80abd7a25753b5a3c` de 2026-08-07. La
última versión etiquetada es `V4.19.4.0`, creada el 2026-06-28 y resuelta al
commit `f0eab0a3041d43dd2cd3389d7b564ad16d3746f0`. La API oficial, el
permalink y `git ls-remote` coinciden. [API de `main`](https://gitlab.com/api/v4/projects/mr_belowski%2FCrewChiefV4/repository/branches/main),
[commit inmutable](https://gitlab.com/mr_belowski/CrewChiefV4/-/commit/3e0afdc6088187f9c92073f80abd7a25753b5a3c),
[API del tag](https://gitlab.com/api/v4/projects/mr_belowski%2FCrewChiefV4/repository/tags/V4.19.4.0)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

## Hallazgos por dominio

### Upstream, releases y distribución

El repositorio antiguo de GitHub declara que el proyecto se trasladó a GitLab;
GitLab identifica `main` como rama predeterminada, mientras `master` permanece
como referencia histórica. Por eso este informe no mezcla contenido de ambas
ramas. [repositorio legado de GitHub](https://github.com/mrbelowski/CrewChiefV4),
[API del proyecto](https://gitlab.com/api/v4/projects/mr_belowski%2FCrewChiefV4),
[wiki de la rama `main`](https://gitlab.com/mr_belowski/CrewChiefV4/-/wikis/New-%22Main%22-branch)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

CrewChief no publica objetos formales de GitLab Release: la distribución real
combina tags, instalador MSI y actualizador propio. Aplicación, sound packs,
personalizaciones y nombres se descargan y versionan como familias separadas.
[API de releases](https://gitlab.com/api/v4/projects/mr_belowski%2FCrewChiefV4/releases?per_page=20),
[actualización oficial](https://mr_belowski.gitlab.io/CrewChiefV4/About_Updating.html),
[instaladores](https://gitlab.com/mr_belowski/CrewChiefV4/-/tree/main/CrewChiefV4_installer/Installs),
[sound packs](https://gitlab.com/mr_belowski/CrewChiefV4/-/tree/main/CrewChiefV4_installer/Soundpacks)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

El HEAD contiene commits posteriores a `V4.19.4.0`; por tanto, “último código”
y “última versión distribuida” son estados distintos. La actividad reciente
combina pequeñas versiones, hotfixes y cambios por simulador, un patrón que
sugiere mantenimiento activo frente a contratos externos inestables y aconseja
extraer invariantes, no constantes ni soluciones internas.
[commits posteriores al tag](https://gitlab.com/api/v4/projects/mr_belowski%2FCrewChiefV4/repository/commits?ref_name=main&since=2026-06-28T00%3A00%3A00Z&per_page=100),
[tags oficiales](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags),
[changelog](https://mr_belowski.gitlab.io/CrewChiefV4/About_ChangeLog.html)
(acceso 2026-08-10; fuentes **Primarias**; hecho con confianza **Alta** e
inferencia con confianza **Media**).

En LMU, el historial reciente registra cambios reiterados de plugins, REST y
shared memory, incluido el traslado de Virtual Energy a memoria compartida,
correcciones de comandos de pit y defensas para que un fallo del juego no derribe
el Spotter. Esto confirma que Vantare debe capability-gatear cada señal y tratar
la fuente como recuperable, no fijar el comportamiento a una API concreta.
[tag `V4.19.4.0`](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.4.0),
[changelog oficial](https://mr_belowski.gitlab.io/CrewChiefV4/About_ChangeLog.html)
(acceso 2026-08-10; fuente **Primaria**; hechos con confianza **Alta**;
conclusión Vantare, inferencia **Media**).

### Licencias y frontera clean-room

El archivo legal efectivo en el HEAD fijado es MIT, copyright 2019–2024
Britton IT Ltd. Una vista indexada de GitLab llegó a rotularlo BSD-3-Clause,
pero el raw inmutable y la página oficial de licencias coinciden en MIT; el
rótulo se trata como metadato erróneo.
[LICENSE raw inmutable](https://gitlab.com/mr_belowski/CrewChiefV4/-/raw/3e0afdc6088187f9c92073f80abd7a25753b5a3c/LICENSE),
[licencias oficiales](https://mr_belowski.gitlab.io/CrewChiefV4/About_Licenses.html),
[vista indexada](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/main/LICENSE)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

La licencia raíz no demuestra una licencia reutilizable independiente para
grabaciones, voces, sound packs, imágenes, logos o assets aportados por terceros.
Tampoco se encontró una autorización expresa para reutilizar el corpus creativo
de frases en otro producto, ni procedencia/licencia del modelo o dataset usado
para nombres de pilotos generados por IA. La política Vantare es no aprobar
ninguno de esos activos hasta completar inventario, procedencia y permiso por
artefacto; la ausencia de una licencia separada no es por sí sola una
conclusión jurídica sobre titularidad o alcance de MIT.
[actualizaciones](https://mr_belowski.gitlab.io/CrewChiefV4/About_Updating.html),
[créditos](https://mr_belowski.gitlab.io/CrewChiefV4/About_Credits.html),
[personalización de voces](https://mr_belowski.gitlab.io/CrewChiefV4/About_Customising_VoicePacks.html),
[tag con nombres generados](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.3.2)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Media** sobre la ausencia
de licencia separada, **Baja** sobre cualquier procedencia no documentada).

La página oficial enumera licencias de varias dependencias, pero el proyecto
fijado usa otras librerías que no aparecen allí y no se encontró un SBOM legal
sincronizado con HEAD. Vantare no debe heredar dependencias de CrewChief por
analogía; cada artefacto propio conserva su gate separado.
[proyecto C# fijado](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/CrewChiefV4.csproj),
[licencias oficiales](https://mr_belowski.gitlab.io/CrewChiefV4/About_Licenses.html)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

### Arquitectura observable

CrewChief es una aplicación Windows principalmente C# sobre .NET Framework
4.7.2. Su documentación muestra conceptualmente adaptadores por simulador,
datos recibidos por plugins/shared memory, UDP, APIs locales o archivos, una
representación mapeada común y consumidores de audio, voz, overlays,
diagnóstico y telemetría opcional. Este patrón conceptual respalda las fronteras
ya elegidas por Vantare, pero no autoriza copiar estructura, umbrales o nombres.
[proyecto C#](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/CrewChiefV4.csproj),
[datos raw/mapped](https://mr_belowski.gitlab.io/CrewChiefV4/Overlays_InGame.html),
[integración rFactor2/LMU](https://mr_belowski.gitlab.io/CrewChiefV4/GettingStarted_GameSpecific_rFactor2.html),
[telemetría](https://mr_belowski.gitlab.io/CrewChiefV4/About_Telemetry.html)
(acceso 2026-08-10; fuentes **Primarias**; hechos con confianza **Alta** e
inferencia clean-room con confianza **Media**).

### Spotter, tráfico y seguridad inmediata

El Spotter mantiene estados laterales distintos para izquierda, derecha,
ocupación en ambos lados, three-wide, permanencia y liberación parcial o
completa. La geometría se evalúa en el marco del coche y combina dimensiones,
posición y velocidad; una envolvente de salida más amplia que la de entrada
aporta histéresis. Además, dos rivales al mismo lado solo cuentan como
three-wide si su separación lateral demuestra carriles distintos, evitando
confundir una fila de coches con tres en paralelo.
[spotter fijado al HEAD](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/NoisyCartesianCoordinateSpotter.cs#L438-1073),
[changelog](https://mr_belowski.gitlab.io/CrewChiefV4/About_ChangeLog.html)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta** en la existencia
y **Media** en la interpretación geométrica clean-room).

Los avisos laterales se revalidan antes de encolar y reproducir, caducan en
ventanas muy cortas y los estados nuevos purgan mensajes incompatibles. La
configuración distribuida usa ventanas diferentes para permanencia, solape y
liberación. El principio transferible es revalidación + caducidad + sustitución;
Vantare debe derivar sus valores de replays LMU propios.
[spotter](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/NoisyCartesianCoordinateSpotter.cs#L33-71),
[reproductor](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/AudioPlayer.cs#L1330-1437),
[configuración](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Properties/Settings.settings)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

Un solape nuevo se descarta si la velocidad relativa supera un límite
configurado. Es una defensa plausible contra
saltos o datos incompatibles, pero copiarla puede ocultar la primera alerta de
un Hypercar que alcanza a un GT3. No existe una validación pública LMU que
cuantifique ese compromiso: Vantare debe conservar el guardarraíl conceptual y
derivar sus valores de fixtures y replays propios.
[configuración](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Properties/Settings.settings),
[implementación fijada](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/NoisyCartesianCoordinateSpotter.cs#L320-382)
(acceso 2026-08-10; fuentes **Primarias**; hecho con confianza **Alta**;
inferencia LMU con confianza **Baja**).

La anticipación multiclase complementa el solape lateral: distingue clases más
rápidas o lentas, coche único, grupo, líder y grupo en lucha. Necesita acumular
ritmo, confirmar la situación durante varios segundos y aplica cooldowns; se
silencia sin clase o distancia válida, en pits, formación, monoclase y a baja
velocidad. Por ello el silencio inicial o ante telemetría incompleta es una
decisión fail-closed, no un defecto a rellenar con estimaciones inventadas.
[advertencias multiclase](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/MulticlassWarnings.cs#L201-931),
[configuración](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Properties/Settings.settings)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

El canal Spotter tiene prioridad inmediata y puede interrumpir al Engineer
cuando el backend de audio lo permite; no encadena interrupciones entre dos
mensajes Spotter. Un mensaje de seguridad pendiente amplía brevemente su
caducidad cuando está bloqueando audio regular. Los modos conversacionales de
menor verbosidad conservan Spotter y respuestas a comandos; repetir el último
mensaje excluye Spotter para no resucitar una situación espacial obsoleta.
[audio](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/AudioPlayer.cs#L1654-1661),
[preempción](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/AudioPlayer.cs#L2132-2168),
[moderación](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/PlaybackModerator.cs#L282-417)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

Las banderas sectoriales y locales se demoran y revalidan antes de sonar; si
cambian durante la espera, se descartan. La lógica puede intentar identificar
un vehículo implicado o un incidente múltiple, pero no hay replay o test
público que demuestre esa precisión en LMU actual. La Beta de Vantare debe
comunicar bandera/sector demostrables y diferir la atribución del causante.
[monitor de banderas](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/FlagsMonitor.cs#L220-1170),
[mapper RF2/LMU](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/RF2/RF2GameStateMapper.cs)
(acceso 2026-08-10; fuentes **Primarias**; existencia con confianza **Alta**;
paridad perceptual LMU **Baja**).

No se encontró una advertencia dedicada a reincorporar el coche del jugador
desde fuera de pista. Sí existe predicción de tráfico al salir de boxes, que es
una función estratégica distinta. Por tanto, rejoin seguro debe ser una
capacidad propia de Vantare condicionada a señales canónicas, no una paridad
atribuida a CrewChief.
[ayuda oficial](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/help.txt),
[predicción de pit exit](https://mr_belowski.gitlab.io/CrewChiefV4/Speech_PitExitPositionPrediction.html)
(acceso 2026-08-10; fuentes **Primarias**; tráfico de pit con confianza
**Alta**, ausencia de rejoin con confianza **Baja**).

El modo oval aporta dentro/fuera y reglas específicas, pero LMU está marcado
como simulador sin competición oval en el mapper vigente. Se rechaza para la
Beta LMU y solo se reconsidera en una expansión multisimulador.
[spotter oval](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/NoisyCartesianCoordinateSpotter.cs#L808-1065),
[mapper RF2/LMU](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/RF2/RF2GameStateMapper.cs)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Media**).

### Monitores Engineer y endurance

CrewChief presenta un conjunto de monitores event-driven, no una única
inteligencia monolítica. Cada familia depende de capacidades distintas del
simulador y degrada o calla si faltan datos. En LMU reutiliza el reader/mapper
de rFactor 2 con estructuras específicas y suma REST local para el menú de
boxes. El código demuestra superficies y dependencias, pero no su precisión
actual en una carrera LMU real.
[eventos oficiales](https://gitlab.com/mr_belowski/CrewChiefV4/-/tree/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events),
[reader LMU](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/LMU/LMUSharedMemoryReader.cs),
[mapper RF2/LMU](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/RF2/RF2GameStateMapper.cs)
(acceso 2026-08-10; fuentes **Primarias**; arquitectura con confianza **Alta**,
runtime real con confianza **Media**).

| Familia observable | Soporte/gap LMU encontrado | Relevancia frente al baseline Vantare |
|---|---|---|
| Sesión, parrilla, formación, salida y final | El mapper contiene rutas para fase, grid, posición/clase y vueltas; órdenes avanzadas dependen de datos extendidos. No se validó runtime. | **BUILD/ADAPT Beta:** variante factual; instrucciones de formación solo con capability demostrada. |
| Banderas y race control | El mapper contiene flags globales/sectoriales; atribuir causante es derivado. | **BUILD Beta:** separar orden oficial de inferencia; diferir causante. |
| Posición, clase, gaps y lapping | Requiere grid completo, IDs/clases estables y deltas válidos. | **BUILD Beta:** hechos; **DEFER** consejo attack/defend por curva. |
| Fuel | El mapper y monitor contienen rutas para nivel, consumo y autonomía. | **ADAPT Beta:** reserva y thresholds propios, captura real. |
| Virtual Energy | El snapshot contiene el campo y el Pit Manager incluye una ruta para fijarlo; no se encontró monitor audible propio, y `Fuel.cs` lo usa para diagnóstico. | **BUILD Beta:** monitor LMU propio. **REJECT** afirmar paridad audible existente. |
| Vueltas, sectores, deltas y ritmo | Las rutas estáticas son amplias; valoración exige vueltas válidas y muestra mínima. | **KEEP/ADAPT Beta:** separar tiempo factual de evaluación. |
| Neumáticos, presiones y frenos | LMU expone compuesto, wear, presión, rueda/flat y temperaturas. | **BUILD/ADAPT Beta:** thresholds propios por coche/compuesto; sin threshold, mostrar valor sin diagnóstico. |
| Daño | El mapper contiene aero, suspensión, impacto y ruedas; no motor, transmisión o freno detallados. | **BUILD gated:** capability explícita; resto `unsupported`. |
| Penalizaciones | El contador es directo; tipo, causa y plazo dependen de mensajes extendidos/DMA y pueden depender de texto/idioma. | **ADAPT Beta:** contador. **DEFER:** detalle hasta evidencia estable. |
| Pits observables | Entrada/salida, limitador, velocidad, box y ventanas dependen de señales concretas. | **ADAPT/BUILD Beta:** lectura. Escritura queda transaccional y fail-closed. |
| Pit-exit y estrategia inmediata | Predice tráfico/posición tras medir pérdidas, pero el pit state remoto puede ser impreciso. | **DEFER post-Beta:** modelo de incertidumbre y validación multiclase propia. |
| Clima | El snapshot LMU contiene lluvia y temperaturas actuales; no se demostró forecast ni comportamiento runtime. | **BUILD Beta:** estado/tendencia. **DEFER:** forecast. |
| Multiclase y rivales observados | El mapper contiene grid, clase, posición, laps y deltas que alimentan rutas de alertas/seguimiento; no se midió precisión runtime. | **BUILD Beta P0/P1:** seguridad, lapping y seguimiento; cancelar al cambiar identidad. |
| Stint y cambio de piloto | Existe lógica consumidora de tiempo de stint, pero no se localizaron productores actuales de sus dos campos. | **BUILD Beta:** monitor de stint propio sobre señales LMU demostradas. **REJECT:** cambio de piloto, único monitor excluido por alcance. |
| Motivación/personalidad | Es policy de tono sobre hechos, no capability LMU. | **BUILD:** profesional y escasa. **REJECT:** copiar frases, insultos o aleatoriedad. |
| Overtaking aids/ovales | Game-dependent; oval no aplica a LMU. | **DEFER** ayudas si un coche real las exige; **REJECT Beta LMU** oval. |

Fuentes primarias de esta matriz: [sesión](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/LapCounter.cs),
[posición](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/Position.cs),
[timings](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/Timings.cs),
[fuel](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/Fuel.cs),
[batería](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/Battery.cs),
[neumáticos](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/TyreMonitor.cs),
[daño](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/DamageReporting.cs),
[penalizaciones](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/Penalties.cs),
[pits](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/PitStops.cs),
[clima](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/ConditionsMonitor.cs),
[rivales observados](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/WatchedOpponents.cs) y
[stints](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/DriverSwaps.cs)
(acceso 2026-08-10; fuentes **Primarias**; superficie estática con confianza
**Alta** o **Media**; decisiones Vantare son inferencias con confianza **Media**).

Hay cuatro límites especialmente relevantes. Primero, el estado de pits de
rivales remotos no siempre es preciso, afectando watched opponents y pit-exit.
Segundo, detalle de penalización puede depender de parsing y DMA. Tercero, la
taxonomía genérica de daño es más rica que los productores LMU demostrados.
Cuarto, código presente no equivale a comportamiento validado en Hypercar,
LMGT3, lluvia, FCY, reconnect o sesiones largas.
[datos LMU](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/LMU/LMUData.cs),
[penalizaciones](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Events/Penalties.cs),
[mapper](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/RF2/RF2GameStateMapper.cs)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta** en los límites
estáticos y **Baja/Media** sobre su frecuencia real).

### Señales recientes de fiabilidad y comunidad

El tracker oficial solo devuelve 22 issues creadas durante los últimos 18
meses. Es una muestra demasiado pequeña y seleccionada para estimar tasas de
fallo. Una issue demuestra un reporte, no su prevalencia ni su causa; una issue
cerrada tampoco demuestra corrección sin commit o release enlazado.
[consulta oficial](https://gitlab.com/api/v4/projects/mr_belowski%2FCrewChiefV4/issues?scope=all&created_after=2025-02-10T00%3A00%3A00Z&per_page=100)
(acceso 2026-08-10; fuente **Primaria**; confianza **Alta** en el recuento y
**Baja** para inferir incidencia).

La integración LMU ha sido una superficie móvil. Releases de 2025 y 2026
registran cambios repetidos de REST, backoff por lag, desactivación temporal de
REST por defecto, migración de Virtual Energy a shared memory, recuperación de
rF2/LMU, inicialización y renombrado de plugins. Esto no demuestra que LMU sea
inservible; sí invalida interpretar la etiqueta oficial “Full” como garantía
por familia o versión. Vantare necesita handshake de versión/capabilities,
freshness y estados `connected/degraded/stale` por fuente/campo.
[V4.19.1.8](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.1.8),
[V4.19.1.12](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.1.12),
[V4.19.1.16](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.1.16),
[V4.19.1.40](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.1.40),
[V4.19.1.46](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.1.46),
[V4.19.2.48](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.2.48),
[V4.19.4.0](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.4.0)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta** en los cambios;
consecuencia Vantare, inferencia **Alta**).

Pit Manager pasó por beta/experimental, quedó activado por defecto y recibió
varias correcciones. Un reporte oficial confundió llegada al box con servicio
completado y un caso comunitario describió confirmación verbal sin cambio en el
MFD. Ningún caso aislado establece frecuencia, pero ambos revelan el mismo
invariante de seguridad: reconocer o enviar una orden no equivale a aplicarla.
Vantare debe modelar `solicitado → enviado → leído de vuelta → aplicado o
rechazado`, descubrir opciones por coche/sesión y nunca conservar índices de
menú entre vehículos.
[V4.19.0.7](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.0.7),
[V4.19.1.0](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.1.0),
[issue 542](https://gitlab.com/mr_belowski/CrewChiefV4/-/work_items/542),
[issue 557](https://gitlab.com/mr_belowski/CrewChiefV4/-/work_items/557),
[caso LMU](https://www.reddit.com/r/LeMansUltimateWEC/comments/1qqqgkq/crew_chief_pit_manager/)
(acceso 2026-08-10; releases/issues **Primarias**, Reddit **Baja**; confianza
**Alta** en churn, **Baja** en prevalencia comunitaria).

Los casos recientes de coche compartido documentan avisos falsos de fuel y
descalificación después de reiniciar CrewChief mientras conducía otro piloto.
Son dos reportes del mismo usuario y simulador, no dos poblaciones; aun así,
exponen el coste de no separar identidad de coche, piloto activo, observador y
epoch de conexión. El alcance Beta mantiene cambio de piloto fuera, pero el
modelo y la cancelación deben ser compatibles desde el inicio.
[issue 580](https://gitlab.com/mr_belowski/CrewChiefV4/-/work_items/580),
[issue 581](https://gitlab.com/mr_belowski/CrewChiefV4/-/work_items/581)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta** en los reportes,
**Media-Baja** en su causa).

La continuidad también requiere pruebas explícitas: hay un reporte ACC de
Spotter detenido tras una carrera, una defensa LMU después de que un crash del
juego tumbara Spotter, una excepción al desconectar volante y casos aislados de
audio en dispositivos Windows distintos. Vantare necesita segunda sesión,
reconnect, crash/restart, hot-unplug y test de salida; perder PTT o un dispositivo
no puede tumbar telemetría ni monitores.
[issue 526](https://gitlab.com/mr_belowski/CrewChiefV4/-/work_items/526),
[V4.19.1.4](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.1.4),
[issue 604](https://gitlab.com/mr_belowski/CrewChiefV4/-/work_items/604),
[issue 535](https://gitlab.com/mr_belowski/CrewChiefV4/-/work_items/535)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Media** en el riesgo,
sin estimación de prevalencia).

Las correcciones de “una vuelta más” en carreras LMU cronometradas, temperatura
superficial frente a interna, clasificación errónea de circuito oval y una
consulta de voz que confundía posición en carrera con coche físicamente delante
refuerzan el mismo diseño: conceptos tipados, provenance, reglas por simulador y
revalidación justo antes de hablar. No deben existir heurísticas universales
para fin, temperatura, layout o relación con rivales.
[V4.19.3.2](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.3.2),
[V4.19.3.4](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.3.4),
[issue 598](https://gitlab.com/mr_belowski/CrewChiefV4/-/work_items/598)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

La fatiga de audio es un problema recurrente observable en releases: se han
reducido mensajes endurance, repeticiones de coches detenidos y avisos de
bandera. Por eso los monitores de Vantare no deben usar timers independientes
sin memoria compartida; necesitan deduplicación semántica, budgets por ventana,
severidad, caducidad y controles de frecuencia.
[V4.19.0.0](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.0.0),
[V4.19.1.24](https://gitlab.com/mr_belowski/CrewChiefV4/-/tags/V4.19.1.24),
[issue 544](https://gitlab.com/mr_belowski/CrewChiefV4/-/work_items/544)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta** en recurrencia de
la clase de problema, sin métrica de molestia).

No apareció evidencia pública cuantitativa suficiente sobre precisión de gaps
multiclase, latencia Spotter, falsos positivos de voz, recuperación REST, matriz
de coches/compuestos, cambio de piloto LMU o éxito de acciones de pit. Los foros
oficiales enlazados devolvieron 403 y Reddit ofrece testimonios favorables y
negativos a la vez. Esos datos sirven para diseñar escenarios de prueba, no para
declarar superioridad o una tasa de fiabilidad.

### Audio, dispositivos y fallback

El núcleo de audio observado es idéntico entre `V4.19.4.0` y el HEAD fijado,
aunque el resto del repositorio no lo sea. Separa cola urgente y normal,
prioriza dentro de cada una, deduplica identificadores y permite deadlines,
triggers y validación contra el estado. Los mensajes normales se revalidan al
seleccionarse y justo antes de sonar; un ciclo de telemetría mínimo evita hablar
sobre un bloque parcialmente actualizado.
[comparación oficial](https://gitlab.com/api/v4/projects/mr_belowski%2FCrewChiefV4/repository/compare?from=f0eab0a3&to=3e0afdc6088187f9c92073f80abd7a25753b5a3c),
[reproductor](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/AudioPlayer.cs),
[mensaje encolado](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/QueuedMessage.cs)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

Hay comportamientos que Vantare no debe heredar. Un mensaje normal futuro de
mayor prioridad puede eliminar inferiores ya listos; un fallo no controlado al
procesar una cola puede vaciarla completa. La preempción también está ligada a
fragmentos y backend. Vantare debe conservar dos niveles de servicio,
deduplicación y revalidación, pero modelar prioridad/aging sin starvation,
aislar el elemento fallido y preemptar locuciones completas en puntos seguros.
[reproductor](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/AudioPlayer.cs),
[moderación](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/PlaybackModerator.cs)
(acceso 2026-08-10; fuentes **Primarias**; hecho con confianza **Alta**;
recomendación con confianza **Alta**).

CrewChief ofrece salida Windows clásica y backend moderno WaveOut/WASAPI,
permite separar voz y ambiente, persiste el endpoint estable y reacciona a
hotplug con fallback y restauración. La identidad estable, el test de salida y
la recuperación explícita son transferibles. Vantare no necesita replicar ambos
backends: necesita un contrato propio con estados terminales verificables y
pruebas de device lost/reconnect.
[salida moderna](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/NAudioOut.cs),
[reproductor](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/AudioPlayer.cs),
[guía nAudio](https://mr_belowski.gitlab.io/CrewChiefV4/GettingStarted_nAudio.html)
(acceso 2026-08-10; fuentes oficiales **Primarias**; confianza **Alta**).

El ducking modifica sesiones de audio Windows por proceso. Se aplica alrededor
de fragmentos y la restauración global puede fijar el volumen al 100 % en vez
del valor capturado. Vantare debe rechazar ese modelo: la concesión será por
locución, con contador de referencias, rampas, captura exacta y restauración
única en éxito, cancelación, error y shutdown.
[control de volumen](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/ControlVolumeOfProcess.cs),
[ciclo de vida](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/CrewChief.cs)
(acceso 2026-08-10; fuentes **Primarias**; hecho y riesgo con confianza **Alta**).

Aplicación, voces, nombres y personalizaciones se actualizan por separado, pero
no se encontró firma, manifiesto con hashes, activación atómica ni rollback de
packs. Vantare puede separar runtime/modelos/contenido, pero debe distribuir
artefactos propios con manifest firmado, staging, hash, compatibilidad y
rollback, además de importación local para modo offline.
[actualizador](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/SoundPackVersionsHelper.cs),
[actualizaciones](https://mr_belowski.gitlab.io/CrewChiefV4/About_Updating.html)
(acceso 2026-08-10; fuentes oficiales **Primarias**; distribución con
confianza **Alta**; ausencia de garantías con confianza **Media**).

CrewChief usa TTS de Windows como fallback opcional, desactivado por defecto;
no ofrece evidencia sobre Kokoro, calidad ES/EN o budgets de CPU/RAM. Vantare
debe implementar Kokoro detrás de contrato cancelable, fuera del hilo de
telemetría, con caché determinista por texto normalizado, locale, voz, modelo y
parámetros. Las frases previsibles se precalientan; si una llamada crítica no
está lista antes del deadline, se conserva la salida visual y se omite o usa
una alerta mínima original, nunca red ni bloqueo de telemetría.
[TTS oficial](https://mr_belowski.gitlab.io/CrewChiefV4/Speech_TextToSpeech.html),
[sonidos](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/Sounds.cs)
(acceso 2026-08-10; fuentes oficiales **Primarias**; CrewChief con confianza
**Alta**; diseño Kokoro es recomendación Vantare, confianza **Alta**).

### Voz, diálogo y Pit Manager

CrewChief usa dos reconocedores locales de Windows con gramáticas cerradas, no
un STT generativo. La voz viene desactivada y ofrece mantener pulsado, toggle,
escucha continua, wake word y botón invertido. La evidencia apoya PTT como
default seguro de Vantare y un catálogo determinista ES/EN. Wake word forma
parte de la Beta, pero queda bloqueado por el gate humano de ENG-13/ISA-192;
always-on se difiere hasta después de Beta.
[modos](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/UserInterface/MainWindow.cs#L1592-1629),
[motores](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/SRE/SREWrapperFactory.cs#L12-98),
[instalación](https://mr_belowski.gitlab.io/CrewChiefV4/VoiceRecognition_InstallationTraining.html)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**; operación offline
es inferencia **Media** porque la documentación no la promete expresamente).

Las gramáticas se organizan por familias, con números y unidades en comandos
complejos. No hay desambiguación general: Pit Manager usa el primer manejador
coincidente y la ruta general puede invocar varios. Además, existen rutas
especiales para aceptar repeticiones tras un rechazo por baja confianza. En
Vantare, repetición nunca equivale a confirmación; varios
candidatos deben pedir elección y ningún LLM participa en acciones críticas.
[gramáticas](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/SpeechRecogniser.cs#L909-1572),
[confianza/repetición](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/SpeechRecogniser.cs#L3534-3720),
[resolución](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/PitManager/PitManager.cs#L299-314)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

Repetir el último mensaje no reejecuta una acción, una separación que se
conserva. Sin embargo, CrewChief elimina la caducidad y validación del mensaje
repetido, por lo que puede reproducir información obsoleta. Vantare debe generar
un nuevo read model factual o etiquetar el replay como histórico, nunca quitar
los guardarraíles originales.
[repeat](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Audio/AudioPlayer.cs#L1646-1661),
[preparación](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/QueuedMessage.cs#L322-337)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

En LMU, el catálogo y los handlers inspeccionados contienen rutas para
combustible, Virtual Energy, neumáticos, compuestos, presiones, reparaciones,
servicio de penalización y limpieza del menú. No se encontraron en ese catálogo
rutas para solicitud de parada, navegación manual completa, lectura íntegra del
plan ni cambio de piloto. No se validó su funcionamiento runtime. El catálogo es una referencia de familias,
no una autorización para copiar frases o gramáticas.
[tabla LMU](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/PitManager/PitManagerEventHandlersTable_LMU.cs#L16-73),
[documentación](https://mr_belowski.gitlab.io/CrewChiefV4/VoiceRecognition_VoiceCommandsPitstopManagement.html)
(acceso 2026-08-10; fuentes **Primarias**; confianza **Alta**).

El riesgo decisivo es transaccional. CrewChief ejecuta y después responde, sin
confirmación previa de dos pasos. Varias operaciones hacen escrituras sucesivas
sin rollback, y un POST correcto normalmente no se compara con el estado final.
La inspección estática identifica además un riesgo condicional de acuse sin
escritura si la ruta se invoca con REST desactivado; no se verificó su
alcanzabilidad ni frecuencia en runtime LMU.
Vantare debe usar `propuesta → readback de intención → confirmar/cancelar →
escribir idempotentemente → leer estado → comparar → aplicado/rechazado`, con
TTL y cancelación ante cambio de sesión, coche o capability.
[flujo actual](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/PitManager/PitManager.cs#L247-296),
[defaults](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Properties/Settings.settings#L881-886),
[REST desactivado](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/Properties/Settings.settings#L1612-1615),
[envío](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/LMU/LMU_REST_API.cs#L148-176),
[operaciones múltiples](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/3e0afdc6088187f9c92073f80abd7a25753b5a3c/CrewChiefV4/PitManager/PitManagerEventHandlers_LMU.cs#L360-412)
(acceso 2026-08-10; fuentes **Primarias**; hechos con confianza **Alta** y riesgo
condicional de runtime con confianza **Media**).

La primera Beta puede exponer consulta/preview, combustible, VE, neumáticos y
presiones si hay readback real; reparaciones y servicio de penalización por voz
quedan post-Beta. Cambio de piloto permanece excluido. Dictado libre, macros
arbitrarias y acuses basados solo en envío se rechazan.

## Matriz analítica de relevancia funcional

Esta matriz pertenece al dossier y no declara estado productivo ni fase de
entrega Vantare. `KEEP/ADAPT/BUILD/DEFER/REJECT` expresa relevancia analítica
preliminar; el ledger canónico para implementar es el brief clean-room, bajo la
autoridad de Linear, contratos, roadmap y handoff.

### Baseline Vantare contrastada

Nightly ya posee la arquitectura conceptual correcta: una entrada canónica
proyectada, policy/scheduler compartidos, cancelación por lifecycle, entrega
preemptiva y presentación visual común. La entrada productiva, sin embargo,
solo habilita seis familias: Spotter, fuel, penalización genérica, vueltas,
timings y pitstops. Los demás monitores presentes en el runtime son código
legacy o caracterizado, no cobertura productiva.
[entrada y allowlist](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/7e39104a7e876b4c396a41403023ba6030b88a08/vantare-v2/internal/engineer/service/engineer_service.go#L602-L735),
[runtime de monitores](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/7e39104a7e876b4c396a41403023ba6030b88a08/vantare-v2/internal/engineer/core/runtime.go)
(baseline Vantare 2026-08-10; fuente **Primaria**; confianza **Alta**).

La producción resuelve únicamente audio ya cacheado; un miss conserva la
notificación visual y nunca sintetiza, descarga ni inicia proceso externo en el
camino crítico. Es un fallback seguro, pero aún no es “audio offline completo”
ni Kokoro productivo. Además, los defaults asignan Spotter inglés y Engineer
español, mientras el contrato de presentación exige locale coherente por
entrega. ENG-16 resuelve coherencia locale/canal/cache; ISA-193/194 decide e
integra TTS/packs; ISA-195 es la única propietaria de persistencia.
[router cache-only](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/7e39104a7e876b4c396a41403023ba6030b88a08/vantare-v2/internal/engineer/audio/router.go#L55-L191),
[defaults de audio](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/7e39104a7e876b4c396a41403023ba6030b88a08/vantare-v2/internal/engineer/audio/config.go#L29-L113)
(baseline Vantare 2026-08-10; fuente **Primaria**; confianza **Alta**).

Desktop ya muestra mensajes y puede configurar salida audio/visual; el mismo
contrato alimenta subtítulos y `engineer-radio`. Eso debe preservarse como
fallback incluso si TTS o dispositivo fallan. La pantalla todavía afirma
“guardado automático” aunque el estado es en memoria; ISA-314 corrige la copy y
ISA-195 implementa el roundtrip real.
[EngineerPage](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/7e39104a7e876b4c396a41403023ba6030b88a08/vantare-v2/frontend/src/hub/pages/EngineerPage.tsx#L228-L318),
[host visual compartido](https://github.com/isaacalbala12/Vantare-Simracing-Suite/tree/7e39104a7e876b4c396a41403023ba6030b88a08/vantare-v2/frontend/src/overlay/widget-types/engineer-radio)
(baseline Vantare 2026-08-10; fuente **Primaria**; confianza **Alta**).

El catálogo ES/EN y el router confirmable existen como contratos deterministas,
pero el harness declara que no realiza STT, PTT, audio ni acciones de juego.
Por tanto, voz y Pit Manager siguen disabled hasta wiring, corpus humano y
puerto transaccional reales; su mera presencia en tests no es una feature.
[catálogo](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/7e39104a7e876b4c396a41403023ba6030b88a08/vantare-v2/internal/engineer/commands/catalog.go),
[límite del harness](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/7e39104a7e876b4c396a41403023ba6030b88a08/vantare-v2/internal/engineer/commands/harness.go#L40-L42)
(baseline Vantare 2026-08-10; fuente **Primaria**; confianza **Alta**).

### Decisiones por capacidad

| Capacidad | Decisión | Issue/corte | Resultado exigido |
|---|---|---|---|
| Entrada canónica, provenance, freshness y cancelación de lifecycle | **KEEP** | Base Nightly | Una sola fuente por producto; unknown/stale nunca se convierte en cero o hecho. |
| Policy compartida, dedupe, cooldown, aging y preempción | **KEEP** | ISA-187/189 | Spotter P0 cancela Engineer no crítico; sin starvation ni cola completa perdida por un fallo. |
| Salida visual común Desktop/subtítulos/OBS | **KEEP** | ISA-187/189 + ENG-08 | El mismo evento y presentation ID aparecen en audio y visual; visual sobrevive a todo fallo de audio. |
| Estado lateral, three-wide, permanencia y clear | **ADAPT** | ISA-189 | Máquina propia, histéresis y revalidación; valores tunados con replay LMU, no copiados. |
| Closing speed Hypercar–LMGT3 | **BUILD** | ISA-189 | Métrica/guardarraíl propio con corpus de alcances extremos y falsos positivos/negativos. |
| Rejoin del jugador | **BUILD/DEFER condicionado** | ISA-189/199 | Solo si posición/trayectoria/visibilidad son fiables; fail-silent si no. No se atribuye a CrewChief. |
| Multiclase, lapping y tráfico rápido/lento | **BUILD Beta P0/P1** | ISA-189/190 | Clase, lap relation, distancia y tendencia separadas; sin órdenes de ceder sin certeza. |
| Oval/stock-car | **REJECT Beta LMU** | Fuera de ENG-18 | Reconsiderar únicamente al añadir simulador con ovales. |
| Banderas y race control | **ADAPT Beta** | ISA-190 | Flag/sector oficial separado de probable incidente; atribución de causante post-Beta. |
| Sesión, grid, start/finish, laps y timings | **KEEP/ADAPT Beta** | ISA-190 | Reglas LMU por sesión, revalidación antes de hablar y final provisional explícito. |
| Fuel | **KEEP/ADAPT Beta** | ISA-190 | Consumo/autonomía propios, muestra mínima, unidad explícita y reserva original. |
| Virtual Energy audible | **BUILD Beta** | ISA-190 | Familia LMU propia; no reutilizar monitor genérico de batería ni afirmar cobertura CrewChief. |
| Neumáticos, presiones y frenos | **BUILD Beta por capability** | ISA-190 | Valor físico + source + evaluación separados; thresholds versionados por coche/compuesto. |
| Daño | **BUILD gated** | ISA-190 | Aero/suspensión/ruedas si están demostrados; motor/transmisión/freno `unsupported` hasta evidencia. |
| Penalizaciones | **KEEP genérico / DEFER detalle** | ISA-190 | Contador/estado oficial en Beta; tipo, causa y plazo solo con fuente estable, sin parsing optimista. |
| Clima | **BUILD actual / DEFER forecast** | ISA-190/197 | Lluvia/temperaturas y tendencia; no forecast LMU inventado. |
| Rivales observados y compañero | **ADAPT Beta** | ISA-190 | Identidad estable, rebind/cancelación por epoch; sin cambio de piloto. |
| Stint | **BUILD Beta** | ISA-190 | Tiempo/avisos de stint propios sobre productores LMU demostrados; no se hereda el consumidor sin fuente. |
| Cambio de piloto | **REJECT alcance Beta** | Fuera de ISA-190 | Única familia de monitor expresamente excluida; no acción ni rebinding automático. |
| Personalidades y frecuencia | **BUILD** | ISA-188 | Tono profesional, declarativo, escaso y explicable; corpus original, sin insultos ni frases copiadas. |
| Audio offline, endpoint y hotplug | **BUILD** | ISA-187 | Endpoint estable, test de salida, fallback explícito, device lost/reconnect y estados terminales. |
| Ducking | **BUILD limpio** | ISA-187 | Concesión ref-counted por locución, rampas y restauración exacta; nunca forzar volumen 100 %. |
| Kokoro ES/EN | **BUILD condicionado** | ISA-193/194 | G2P/licencias permisivos, benchmarks, packaging, warm cache y escucha humana; visual sigue disponible si NO-GO. |
| Packs/modelos | **ADAPT limpio** | ISA-194 | Assets propios, manifest firmado, hashes, staging, activación atómica, rollback e importación offline. |
| PTT | **KEEP controller / BUILD wiring** | ISA-185/191/195 | Conservar readers; conectar STT y añadir UI/bindings/persistencia. Raw HID genérico queda gated. |
| STT y catálogo ES/EN | **ADAPT condicionado** | ISA-191 | Offline, intents/slots tipados, corpus humano y métricas; sin dictado/LLM para acciones críticas. |
| Wake word | **BUILD Beta condicionado** | ISA-192 | Solo tras FAR/FRR humano por idioma, ruido y hardware; privacidad visible. |
| Always-on | **DEFER post-Beta** | Fuera de ISA-192 | No es necesario para el recorrido PTT/wake y amplía riesgo de privacidad/falsas activaciones. |
| Repetir último mensaje | **ADAPT** | ISA-186/191 | Nunca reejecuta acción; reconsulta hechos o marca explícitamente que es histórico. |
| Pit: request/abort, fuel y neumáticos | **BUILD transaccional** | ISA-196 | Propuesta, readback de intención, confirmación/cancelación, escritura idempotente, lectura y diff final. |
| Pit: VE/presiones | **BUILD UI gated / DEFER voz** | ISA-196 / issue futuro | No ampliar el catálogo de voz sin corpus e issue explícitos. |
| Pit: reparación/penalización | **DEFER post-Beta** | Tras ISA-196 | Solo con estado final verificable y rollback/reconciliación. |
| Pit: cambio de piloto, macros y dictado libre | **REJECT** | Fuera de alcance | Ningún camino alternativo puede saltar catálogo, confirmación o capability. |
| Configuración y permisos | **BUILD** | ISA-195 + ISA-314 | Persistencia tipada/migrable, presets simples, recovery y copy honesta; no nombres técnicos. |
| Strategy/Overlays predictivos | **BUILD Beta tardía** | ISA-197 | Después de audio, Spotter, monitores, control y Pit; incertidumbre y provenance visibles. |
| Diagnóstico y soporte | **BUILD** | ISA-198 | Eventos sanitizados por pipeline, no payload/PII; causa accionable para stale, device y TTS/Pit. |
| Soak, packaging y Beta | **BUILD gate** | ISA-199/200 | LMU Hypercar+LMGT3, lluvia, FCY, pit, VE, segunda sesión, reconnect, crash, hotplug y larga duración. |
| Código, frases, gramáticas, audios, voces, nombres, assets y UI de CrewChief | **REJECT reutilización** | Todos | Solo comportamientos observables y principios; implementación y contenido Vantare originales. |

### Protocolo de búsquedas negativas

Las afirmaciones “no se encontró” describen esta revisión, no una ausencia
jurídica o funcional universal. Se inspeccionaron el repositorio GitLab fijado
al HEAD, tags/releases, API de issues, LICENSE raíz, proyecto C#, documentación
oficial de licencias, créditos, actualización, voz, packs y Pit Manager. Se
buscaron avisos por artefacto, `license/licence/copyright`, manifiestos, hashes,
firmas, rollback, SBOM, Virtual Energy, rejoin, driver/stint y readback.

Resultados negativos relevantes: licencia separada de grabaciones/packs/assets,
SBOM sincronizado con HEAD, firma/rollback de packs, SLO públicos de Spotter o
audio, monitor audible LMU específico de Virtual Energy, prueba runtime de
rejoin, productores LMU demostrados para cambio de piloto y verificación
transaccional final del Pit Manager. Las páginas mutables o inaccesibles, foros
con 403, contenido privado y runtime no ejecutado limitan el alcance.

Este protocolo debe repetirse antes de ISA-200 si cambia materialmente el
upstream o LMU. La revisión legal definitiva requiere inventario y clearance
por artefacto.

## Hallazgos clave

1. El upstream relevante es GitLab `main@3e0afdc…`; `V4.19.4.0` es la última
   versión distribuida, no el último código. El núcleo de audio/voz estudiado no
   cambió entre ambos cortes, pero LMU sí acumula churn de plugins y fuentes.
2. CrewChief aporta principios útiles —estado explícito, monitor por capability,
   caducidad, revalidación, prioridad y degradación—, no valores para copiar.
   No existen SLO públicos suficientes de latencia, precisión o recuperación.
3. Vantare ya tiene la arquitectura base adecuada y supera conceptualmente
   varios riesgos observados: fuente canónica, lifecycle/epoch, scheduler común,
   preempción y espejo visual. Todavía solo seis familias están cableadas en
   producción; el resto del código no debe contarse como cobertura.
4. La primera vertical correcta sigue siendo ISA-187 + ISA-189 + ENG-08: un
   evento Spotter demostrado en audio y visual, con fallback visual, deadline,
   hotplug y preempción. La investigación no justifica cambiar ese orden.
5. Multiclase es parte del núcleo LMU, no un extra. Closing speed, clase, lap
   relation y proximidad deben ser conceptos independientes, validados con
   Hypercar alcanzando LMGT3.
6. Virtual Energy requiere un monitor Vantare propio. CrewChief demuestra dato
   y control de pit, pero no una familia audible equivalente a Fuel.
7. “Full support” es una etiqueta de producto, no una capability runtime. Daño,
   penalizaciones, pits remotos, forecast, driver swap e incident attribution
   tienen cobertura parcial o no demostrada en LMU.
8. Pit Manager de Vantare no debe imitar el flujo ejecutar→acuse. La inspección
   estática identifica operaciones no atómicas, falta de readback y un riesgo
   condicional de éxito aparente sin POST cuando REST está desactivado. ISA-196 debe ser una
   transacción verificable y fallar cerrado.
9. PTT + intents cerrados ES/EN es el camino seguro. STT y wake word Beta
   permanecen condicionados a corpus humano y FAR/FRR; always-on es post-Beta.
   Repetición no confirma y nunca reejecuta acciones.
10. Kokoro sigue siendo dirección elegida, no GO técnico. La Beta puede ofrecer
    valor con cache/pre-generado y visual; ENG-22/23 deben resolver G2P,
    licencias, rendimiento, packaging y escucha antes de síntesis dinámica.
11. El repositorio declara MIT para el software y documentación asociada, pero
    no se encontró licencia/procedencia separada segura para grabaciones, voces,
    packs, corpus creativo, logos o nombres generados.
    La sustitución de CrewChief debe seguir estrictamente clean-room.

## Recomendaciones estratégicas

1. Mantener el DAG vigente y reforzar criterios, sin reescribir arquitectura:
   ISA-314; después ISA-187+189; ISA-190; ISA-195/196; ISA-197/198; ISA-199/200.
2. En ISA-187, definir un contrato de audio por locución con deadline,
   cancelación, dispositivo, prioridad, terminal state y fallback visual. Añadir
   hotplug, fallback al default, test de salida y ducking con restauración exacta.
3. En ISA-189, crear corpus LMU propio para overlap/three-wide/clear, Hypercar
   contra LMGT3, pit lane, formación, segunda sesión y reconnect. No fijar los
   timers/umbrales de CrewChief como aceptación.
4. En ISA-190, convertir cada familia en capability explícita. Priorizar sesión,
   flags, clase/gaps, fuel+VE, vueltas/ritmo, neumáticos/frenos, daño parcial,
   penalización genérica, pits observables, clima actual y rivales observados.
5. Ejecutar ISA-193 en paralelo como gate Kokoro. Si sigue NO-GO, ISA-194 puede
   terminar con cache original firmado y fallback visual, sin disfrazar la
   ausencia de voz dinámica.
6. Mantener ENG-13 como gate humano. ISA-191 usa PTT y catálogo determinista;
   ISA-192 no se habilita hasta medir wake word en ES/EN con ruido real.
7. Hacer ISA-195 la única fuente persistente de permisos, locale, voz,
   frecuencias, dispositivo y modos de salida; ISA-314 solo corrige honestidad.
8. Limitar ISA-196 inicialmente a capacidades con lectura final fiable. Ninguna
   respuesta “hecho” puede basarse solo en reconocimiento o HTTP success.
9. Hacer que ISA-198 exponga diagnóstico local sanitizado de cada frontera:
   source/freshness, policy, audio, dispositivo, TTS/STT y Pit, sin PII ni raw.
10. Reservar ISA-199/200 para evidencia end-to-end real: no diferir ahí los
    tests focales, pero sí exigir carrera larga, segunda sesión, reconnect,
    crash/hotplug, lluvia, FCY, pit, VE y multiclase.

## Riesgos, conflictos y vacíos

- La mayor parte de la evidencia funcional es análisis estático y documental.
  Ruta de código no equivale a SLO o paridad perceptual en LMU actual.
- CrewChief puede cambiar después del corte; cada nueva implementación Vantare
  debe registrar versión de LMU, build, schema/capabilities y fixture usado.
- No hay permiso demostrado para reutilizar activos creativos. Incluso cuando
  un texto técnico pueda estar bajo MIT, copiar un corpus expresivo crea riesgo
  evitable; Vantare debe escribir y grabar/sintetizar material propio.
- Umbrales publicados se documentan para comprender comportamiento, no como
  defaults recomendados. Hypercar–LMGT3, pista, layout y clase requieren tuning.
- REST/plugin LMU han cambiado repetidamente. Una acción crítica no puede
  depender de disponibilidad estática ni de setup manual no diagnosticado.
- Audio Windows introduce device IDs, reordenamiento, hotplug, callbacks y
  mezclador; sin estados terminales, un evento en log puede confundirse con una
  locución realmente oída.
- Kokoro carece todavía de GO comercial/técnico en Vantare; latencia, G2P,
  modelos, voces y licencias deben cerrarse antes de distribución.
- Español e inglés necesitan corpus, pronunciación y unidades first-party. La
  existencia de una traducción comunitaria en CrewChief no prueba cobertura.
- La percepción comunitaria utilizada es deliberadamente anecdótica. Diseña
  tests, pero no permite comparar tasas de calidad entre productos.
- Quedan sin evidencia pública cuantitativa: Spotter p95, falsos positivos,
  precisión multiclase, recuperación REST, matrices coche/compuesto, éxito de
  Pit Manager y cambio de piloto LMU.

## Próximos pasos

1. Revisar y aceptar este informe como anexo de ISA-313; no promueve código ni
   declara lista la Beta.
2. Resolver ISA-314 como bug separado de copy/persistencia.
3. Arrancar ISA-187 y coordinar criterios end-to-end con ISA-189 y ENG-08 desde
   la Nightly remota más reciente, no desde este worktree documental.
4. Añadir a ISA-190 la matriz de capabilities y los escenarios LMU de esta
   auditoría, incluyendo monitor propio de Virtual Energy y cobertura parcial.
5. Mantener ISA-193 como investigación Kokoro paralela y los gates humanos de
   voz sin bypass.
6. Exigir en ISA-196 una demostración autorizada de readback real antes de
   habilitar cualquier escritura de pit.
7. Repetir la auditoría upstream antes del gate ISA-200 si CrewChief o LMU han
   publicado una versión materialmente nueva.
