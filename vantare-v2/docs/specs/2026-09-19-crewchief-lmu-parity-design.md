# Diseño — Paridad observable CrewChief para Engineer LMU

- Fecha: 2026-09-19
- Estado: aprobado por Isaac para planificación y primeras pruebas; no implementado
- Base Vantare: `origin/nightly@8a0620e8abe75914efed41de4117490f3e47a3b4`
- Oráculo inicial CrewChief: `mr_belowski/CrewChiefV4@4c3865e09a347d4c806c0bc0cd66aae335fbc610`
- Revisión contractual: 2026-09-20; correcciones de revisión adversarial,
  aprobadas para planificación/pruebas sin declarar implementación o gates superados.
- Decisión de arquitectura: [ADR 0010](../adr/0010-engineer-cloud-dialogue-and-offline-parity.md).
- Persona y estilo: [diseño nativo versionado](2026-09-20-engineer-persona-native-style-design.md).

## 0. Autoridad y lectura

Las decisiones base acordadas son: LMU-only, paridad observable CrewChief sin
copiar implementación ni defectos, defaults primero con todas las opciones
inventariadas, cortes verticales, Timings primero y replay más LMU; LLM cloud
para lenguaje libre y redacción generativa, sin acceso directo a telemetría;
hechos y acciones deterministas, carril crítico local, ausencia de LLM local,
fallback precacheado funcional y presupuestos de §6.6. Voz y LLM comparten un
camino ampliable de herramientas y entrega.

Isaac aprobó el 2026-09-20 la precisión contractual para planificación y
primeras pruebas, incluido el riesgo residual del discurso generativo. La
aceptación exige reducirlo mediante hechos protegidos, StyleGate fail-closed,
corpus por locale y fallback canónico; no lo declara eliminado ni permite al
LLM controlar hechos o acciones. `DEC-FEEDBACK-P0-001` y `DEV-NAME-001` también
quedaron resueltos expresamente. “Debe” y “PASS” siguen siendo requisitos de
diseño: no prueban implementación, paridad, gate humano ni publicación.

Esta spec gobierna el diseño del nuevo programa de paridad LMU para su
planificación y primeras pruebas. La precedencia del objetivo de paridad y de
la frontera cloud procede de las decisiones aprobadas. Sustituye en ese perímetro de
[rework-spec.md](../engineer/rework-spec.md) el objetivo de base simple sin
paridad y la exclusión absoluta de TTS dinámico. Sustituye además la
tolerancia de menor cobertura como criterio de cierre, la regla de un archivo
por familia y la exclusión de nombres hablados del corte anterior. No reinicia
ni declara inexistente el trabajo ya integrado.

El ADR 0010 propone concretar la interpretación mediante LLM cloud, pero
conserva de [ENG-15](../engineer/dialogue-router-isa-186.md) el catálogo tipado,
precondiciones, lifecycle, confirmaciones, idempotencia y verificación de
acciones. La prohibición histórica de LLM para elegir intents se sustituye
únicamente por una propuesta de herramienta validada por código; no otorga
autoridad al proveedor sobre hechos, confirmaciones o efectos.

Permanecen vigentes Telemetry Core como fuente única, sus contratos de
proyección/capabilities, el bus compartido, la preempción del Spotter, las
garantías de privacidad y los gates humanos de STT, wake word y percepción
audible aún no superados. Aprobar este diseño no convierte esos gates en GO,
no aprueba un proveedor/modelo concreto ni autoriza publicación o promoción.
El roadmap ENG histórico conserva evidencia; no decide la secuencia nueva.

## 1. Objetivo

Construir en Vantare la misma conducta observable que CrewChief ofrece al
piloto durante una sesión de Le Mans Ultimate. La equivalencia se evalúa por
lo que el sistema observa, decide, calla, prioriza, comunica y permite
consultar; no por semejanza de código, nombres internos o textos.

La primera sección que se cerrará de extremo a extremo es Timings. Después se
aplicará el mismo método al resto del Engineer.

## 2. Perímetro

Incluye:

- experiencia de radio durante práctica, clasificación y carrera cuando el
  comportamiento equivalente de CrewChief sea aplicable a LMU;
- timings, spotter, banderas, vueltas, sectores, posición, rivales,
  multiclass, combustible, energía virtual, boxes, estrategia,
  penalizaciones, neumáticos, frenos, estado del coche, condiciones, sesión,
  interacción por voz y coaching;
- configuración predeterminada de CrewChief como primera referencia;
- inventario desde el inicio de todas las opciones que alteren la conducta;
- salida online generativa y fallback offline funcional.

Quedan fuera:

- compatibilidad con otros simuladores;
- UI propia de CrewChief, overlays VR, MQTT y plugins externos;
- código, audios, frases, assets o gramáticas copiados de CrewChief;
- funciones exclusivamente dependientes de servicios de iRacing u otro sim;
- reproducción deliberada de un defecto conocido sin una decisión explícita.

## 3. Definición de paridad

La referencia es el comportamiento observable de CrewChief con sus valores
predeterminados. Para un escenario equivalente, Vantare debe:

1. hablar o callar bajo las mismas condiciones;
2. comunicar el mismo contenido semántico obligatorio;
3. distinguir la misma relación de carrera;
4. mantener prioridad, interrupción, caducidad y revalidación equivalentes;
5. responder a las mismas consultas aplicables;
6. conservar la conducta con fallback offline, aunque pierda variedad verbal;
7. demostrarlo en replay determinista y en LMU real.

Un test de una constante, un intent registrado o una frase existente no prueba
paridad. Tampoco se usarán porcentajes basados en líneas, carpetas de audio o
cantidad de eventos.

Cuando no exista fuente observada, derivación demostrada o catálogo propio
fiable para un dato imprescindible (§9), el caso se marca `bloqueado por señal`;
no se sustituye por una heurística silenciosa. Cualquier desviación
requiere aprobación explícita de producto y queda registrada.

## 4. Estrategia de entrega

Se usarán cortes verticales por feature. Cada corte lleva su recorrido completo:

```text
Telemetry Core
  -> proyección Engineer
  -> modelo/estado de la feature
  -> decisión semántica
  -> radio y arbitraje
  -> presentación online u offline
  -> audio/widget
  -> replay
  -> gate LMU
```

No se construirá primero una plataforma completa sin conducta entregable. La
infraestructura compartida nace en la primera feature que la necesita y luego
se reutiliza mediante contratos pequeños y versionados.

## 5. Mapa funcional

| Orden | Sección | Conducta incluida |
|---:|---|---|
| 0 | Oráculo de paridad | Casos, defaults, opciones, entradas, silencios, salidas y ledger PASS/FAIL. |
| 1 | Timings y relaciones | Delante, detrás, líder, coche en pista, tendencias, presión, retención, doblajes, cadencia y consultas. |
| 2 | Spotter | Izquierda/derecha, solape, clear, three-wide, persistencia, supersession y P0. |
| 3 | Banderas y neutralizaciones | Amarillas, azul, FCY, safety car, formación, reinicios, frozen order y silencios derivados. |
| 4 | Vueltas, sectores, posición y ritmo | Vueltas válidas, PB/SB, sectores, posiciones, ritmo relativo y push. |
| 5 | Rivales y multiclass | Identidad, clase, pitting, retirada, adelantamientos, coches rápidos/lentos, observados y cambios de piloto. |
| 6 | Combustible y energía virtual | Consumo, autonomía, umbrales, combustible crítico, batería/energía y consultas. |
| 7 | Boxes y estrategia | Entrada/salida, ventana, parada, tráfico, stint, pit request, estrategia y ayudas de adelantamiento aplicables. |
| 8 | Penalizaciones y reglas | Nueva sanción, tipo, plazo, vueltas para cumplir, cumplimiento y consultas. |
| 9 | Neumáticos y frenos | Temperatura, desgaste, presión, bloqueo, spinning, flat spots, suciedad y compuesto. |
| 10 | Estado del coche | Motor, temperaturas, presiones, batería y daños aero/motor/suspensión. |
| 11 | Condiciones y sesión | Lluvia, pista, temperaturas, tiempo/vueltas restantes, inicio, últimas vueltas y final. |
| 12 | Interacción por voz | Infraestructura transversal iniciada con Timings; consultas y acciones de todas las secciones. |
| 13 | Coaching secundario | Motivación, pace notes propios y consejo adicional no cubierto por Timings; no pospone ataque/defensa por landmarks de T5/T6. |

El número indica orden de cierre, no aislamiento técnico. La interacción por
voz empieza en Timings y crece con cada nueva sección.

El mapa se completa con esta asignación transversal. T0 identifica cada
comando observable y lo asigna a una fila; una agrupación no permite omitirlo.

| Conducta transversal | Propietario y cierre |
|---|---|
| Radio check, repetir, silencio/informado, volumen y silencio en curvas | Interacción por voz/radio. Los controles que alteran Timings se inventarían en T0 y sus efectos se prueban en T4/T7. Repetir revalida el contexto; no repite una cifra caducada como actual. |
| STATUS/SESSION_STATUS y respuestas compuestas | Interacción coordina; cada familia aporta hechos. El componente Timings se cierra en T6, sin esperar otras familias. |
| Leer curvas durante una vuelta, gaps por vuelta, formación manual | Timings T4–T7 con sus controles; la formación compartida alimenta los silencios aunque los avisos de frozen order se cierren después. |
| Reloj y alarma de hora local | Condiciones/sesión e interacción, incluidos durante LMU; reloj separado del de telemetría, ajuste/cancelación confirmables, sin calendario ni servicios remotos. No forman parte de T8. |
| Pace notes y motivación | Coaching secundario; contenido propio/consentido y gates de grabación independientes. |
| Controles UI/VR, MQTT, chat de otros sims y reputación específica iRacing/R3E | Excluidos por §2. No se trasladan a un genérico “otras consultas”. |

Los nombres CommonActions y AlarmClock identifican fuentes del inventario,
no módulos que deban copiarse. Audio/dispositivos, hot-plug, ducking,
configuración y recuperación son dependencias transversales de la salida de
radio, no una UI CrewChief nueva.

## 6. Arquitectura de interacción por voz

### 6.1 Autoridades

- El código determinista decide hechos, relaciones, cifras, freshness,
  prioridad, momento de hablar, silencios y acciones disponibles.
- El LLM comprende lenguaje libre, selecciona herramientas autorizadas y
  redacta respuestas naturales.
- El LLM no lee Telemetry Core, bases de datos ni stores internos directamente.
- Ningún proveedor puede omitir confirmaciones, revalidaciones o límites del
  dominio.
- Spotter, banderas y alarmas críticas nunca esperan al LLM.

### 6.2 Camino online

```text
PTT/wake -> STT -> Conversation Orchestrator -> LLM cloud
  -> EngineerToolRegistry -> hechos tipados
  -> respuesta estructurada -> validador -> TTS dinámico
  -> radio/audio/widget
```

El LLM comprende lenguaje libre y propone herramientas de una allowlist
cerrada por turno. El dispatcher valida intent, slots, rangos, precondiciones,
capability, permisos y lifecycle antes de resolverlas. No hay herramientas de
SQL, archivos, navegación, HTTP arbitrario ni acceso a stores. Una selección
ambigua o incompatible con la solicitud pide aclaración; no ejecuta una acción.

La respuesta separa cláusulas factuales canónicas y texto discursivo generado
libremente según §6.2.1. No se reduce a elegir cien variantes ni a combinar una
gramática finita. Tampoco basta un JSON válido o citar hechos junto a texto
arbitrario: toda salida atraviesa el ensamblador y sus gates antes de TTS/widget.

Los mensajes automáticos no críticos pueden usar el mismo camino. Su trigger,
semántica, prioridad y caducidad llegan cerrados desde el motor de la feature;
el LLM sólo redacta.

#### 6.2.1 Contrato semántico y validador

Cada resultado de herramienta incluye versión, ID de hecho, tipo de consulta,
sujeto y rival opacos, relación (clase/carrera/pista), dirección, magnitud,
unidad, diferencia de vueltas, tendencia, calidad, procedencia, snapshot,
observedAt, freshUntil y lifecycle. Los tipos de respuesta distinguen dato,
leading, last, sin rival, no disponible y aclaración; cero no es ausencia.
Cada tipo declara qué campos son obligatorios, opcionales o prohibidos.

El ensamblador determinista crea un `FactBundle` cerrado: proposiciones,
texto canónico por locale, slots de audio local, IDs y hash de revisión.
Incluye todo el contenido obligatorio y sólo opcionales elegidos por el motor.
Cada átomo es una cláusula factual completa con sujeto, relación y unidades,
no un número suelto que el modelo pueda vincular a cualquier verbo. El dominio
fija agrupaciones indivisibles y restricciones de orden: condición/calidad con
su dato, relación antes de cifra dependiente y orden cerrado para acciones.
El modelo no puede añadir, omitir, parafrasear ni negar esas cláusulas.
Una diferencia de sujeto, dirección, unidad, tendencia, certeza, causalidad o
acción exige otro hecho del dominio, no una redacción del LLM.

El LLM devuelve exclusivamente `UtterancePlan {schemaVersion, jobID, revision,
locale, factBundleHash, segments}`. Un segmento es `factRef` o `discourseText`.
Puede ordenar los bloques independientes dentro del orden parcial autorizado;
el dominio decide qué hechos aparecen, no el modelo. `discourseText` es texto
natural nuevo de vocabulario abierto, no un ID de variante ni texto
reconstruido desde una gramática. Redacta introducción, transiciones y
contextualización de la petición para organizar la respuesta útil; no se
limita a saludos o despedidas. Puede presentar los bloques como respuesta
breve, comparación solicitada o resumen, sólo si ese acto discursivo está
autorizado por el tipo de consulta. No añade datos de carrera, identidades,
cifras, comparaciones factuales, predicciones, causalidad, negaciones de los
hechos ni recomendaciones/órdenes. No aparece en alarmas críticas, lectura de
curvas con TTL corto, readback, confirmación, ejecución o resultado de acciones.

El código verifica todos los factRef, exactamente una vez y con el orden
permitido, e inserta sus cláusulas inmutables; un plan inválido se reemplaza
por el orden canónico completo. El discurso sólo ocupa fronteras entre bloques
o la introducción/cierre, con separación audible. Nunca divide una cláusula,
se usa como negación/modificador suyo ni completa una frase factual truncada.
No hay límite editorial de tokens, palabras, caracteres, frases o segmentos:
la brevedad se obtiene por PersonaProfile, StyleCapsule y normas de StyleGate,
no truncando la salida. Siguen prohibidos SSML, URLs, controles, slots o
delimitadores. La forma y el estilo se validan en cada locale. El resultado
audible/widget contiene sólo cláusulas canónicas vigentes más el discurso
admitido; sin discurso conserva una respuesta útil y completa. Los fragmentos
de nombre de §6.3 se intercalan localmente; no se envían al TTS cloud. Ningún segmento
discursivo llega al dispatcher ni altera estado, prioridad, TTL o acciones.

Rige el [contrato de persona y estilo nativo](2026-09-20-engineer-persona-native-style-design.md):
modelo con ventana mínima 8K, entrada habitual inferior a 2.000 tokens, máximo
de entrada 3.000 y PersonaProfile más StyleCapsule hasta 350. Vantare no usa un
máximo de tokens de salida como control de estilo. Deadline, TTL y límites
inevitables del proveedor permanecen; una salida incompleta se descarta entera
y usa fallback, nunca se trunca para TTS/widget.

Ejemplo de forma, no catálogo de variantes: ante una consulta compuesta el
modelo puede introducir «Empiezo por la diferencia que me has preguntado:»,
referenciar una cláusula canónica delante y redactar «Completo el resumen con
el otro lado:» antes de la cláusula detrás, si ambas están autorizadas. Otra
salida puede empezar por el resumen o invertir bloques independientes. El
modelo redacta esa organización; no redacta los hechos. Un «vas mejor»,
«no te preocupa» o «puedes atacar» es contenido prohibido aunque no tenga cifra.

Hay dos gates distintos, sin confundir sus garantías:

1. Validación determinista del esquema, tipos, límites, vínculo job/revisión/
   hash, referencias/orden, ausencia de claves extra y composición íntegra
   del FactBundle. Esto sí demuestra que la vía generativa no modifica hechos
   tipados ni efectos.
2. Admisión del discurso: filtros estructurales y léxicos más un clasificador
   de contenido versionado por locale que sólo devuelve admitido/rechazado/
   incierto. Evalúa si los segmentos y su composición con los hechos cumplen
   la función discursiva autorizada, sin modificar su sentido ni añadir
   afirmaciones. No es autoridad de hechos ni un verificador de verdad.
   Su estrategia concreta y umbral se fijan y evalúan antes de habilitar un
   proveedor. Si emplea un servicio cloud, está sujeto a §6.7–§6.8, incluido el
   presupuesto total de llamadas y tiempo; no añade rondas fuera del límite.
   No introduce un LLM local. Rechazo, incertidumbre, idioma incorrecto,
   indisponibilidad o timeout descartan todo el discurso y su orden propuesto;
   sale sólo el FactBundle en orden canónico, con PhrasePack si TTS falla.

No existe aquí una prueba determinista de equivalencia semántica de lenguaje
natural arbitrario. El segundo gate es falible: un falso negativo podría
admitir una implicatura o afirmación impropia, aunque no altere los datos ni
ejecute acciones. Isaac aceptó este riesgo residual para las primeras pruebas
el 2026-09-20, condicionado a mitigarlo y medirlo conforme al diseño de estilo;
no se declara eliminado por otro LLM. Eliminar
por construcción el riesgo añadido por texto libre requiere una salida sólo
canónica, que no satisface por sí sola el objetivo de variación abierta. No se puede
presentar ese modo como online generativo PASS ni relajar hechos/acciones para
obtenerlo. Nombres, transcripciones y tool results siguen siendo datos no
confiables, nunca instrucciones.

El gate negativo debe rechazar: inversión de sujeto/dirección; cifra o unidad
distinta; negación; omisión de vuelta/contexto obligatorio; causalidad o consejo
añadidos; herramienta equivocada; solicitud con dos interpretaciones; replay
de tool result de otro turno; snapshot o rival caducado; claves extra;
overflow/NaN; inyección en nombre, transcripción o resultado; SSML externo;
intentos de confirmar/aplicar mediante tool call. El corpus por locale incluye
paráfrasis positivas y near-miss negativos etiquetados independientemente.
Incluye además discurso con cifras escritas, comparaciones sin números,
sarcasmo, implicaturas, contradicción indirecta, instrucciones camufladas y
cambio de idioma. Se distingue rechazo estructural de rechazo de contenido.
El PASS exige cero afirmaciones factuales o efectos no autorizados en ese
corpus y revisión audible independiente; no prueba todo lenguaje arbitrario.
El informe online declara versiones, falsos positivos/negativos observados y
tasa de fallback. Debe demostrar nuevas formulaciones aceptadas que no existan
en PhrasePack ni en una lista/gramática de variantes y que organicen de forma
perceptible la respuesta útil en consultas/automáticos no críticos. Añadir
sólo una coletilla social no satisface este gate. Se cubren respuestas simples
y compuestas, orden permitido/prohibido y discurso que altera el sentido por
su posición. Fallback en todos los casos no obtiene PASS generativo.
Cambiar modelo, prompt, clasificador o umbral invalida este gate. El corpus
sintético puede guardar el discurso; sesiones
reales conservan sólo métricas sin contenido según §6.8.

### 6.3 Fallback offline

No se incluye un LLM local.

```text
PTT/wake -> STT -> router determinista -> EngineerToolRegistry
  -> compositor -> PhrasePack precacheado -> radio/audio/widget
```

El fallback:

- responde las consultas soportadas;
- mantiene todos los mensajes automáticos obligatorios;
- compone cifras con fragmentos de audio;
- conserva propuestas, readback y confirmaciones;
- pierde variedad lingüística, no funcionalidad.

La equivalencia es de capacidades semánticas: cada consulta/acción soportada
online tiene formas canónicas propias en es, en, it y pt-BR, documentadas en la
ayuda y accesibles por PTT. El router offline no promete reconocer toda
paráfrasis online. Ante unknown/ambigüedad ofrece la forma canónica y conserva
el fallback PTT/UI de ENG-15; no adivina slots ni afirma haber respondido.

STT es local en ambos caminos y no es un LLM local de conversación. El pack de
STT, su modelo fijado, permisos y captura real son dependencias del PASS de
voz; un harness textual o un host que declare unavailable no lo satisface.
PTT es suficiente para probar las consultas; wake sólo se activa tras su gate
FAR/FRR independiente. Los cuatro locales son obligatorios para el cierre.

El PhrasePack tiene manifest/version/hash y contiene confirmaciones, readback,
indisponibilidad, relaciones, tendencias, posiciones, vueltas, signos,
decimales y unidades. El compositor declara rangos y precisión por tipo;
compone todos los valores válidos de ese tipo y rechaza los demás. T0 fija la
precisión audible con el oráculo. No convierte un número en otro para caber en
el pack. Se prueban bordes, cero presente, singular/plural y cambio de locale.

La identidad audible distingue `nombre literal` de `identificación funcional`
(posición/relación o dorsal/clase demostrados). El ID del vehículo es la
autoridad para ambos, pero no son salidas equivalentes automáticamente.
CrewChief activa enable_driver_names por defecto (Settings.settings:302);
Timings.cs:795,884 usa MkOpponentShort, que habla un nombre si canReadName lo
permite (Opponents.cs:1081–1120), con alternativas según contexto y assets.
T0 fija la elección observable y disponibilidad del pack de referencia por
caso: no exige pronunciar todos los nombres imaginables ni asume que ninguno
sea pronunciable.

Online y offline usan el mismo catálogo propio/licenciado de fragmentos de
nombre precacheados y su mapping local revisado; no se descargan ni generan
nombres durante la sesión. Se compone localmente el nombre con las demás
cláusulas, sin enviarlo a proveedores. El gate acústico verifica nombre literal,
pronunciación identificable, rival correcto, cambio de piloto, homónimos y
continuidad del audio en cada locale. Mostrar el nombre en widget no sustituye
oírlo. Un nombre desconocido conserva identificación funcional si es inequívoca;
una petición de nombre literal responde canónicamente que no puede pronunciarlo
y puede añadir la identidad funcional, sin afirmar que contestó el nombre.

Registro `DEV-NAME-001` — resuelto por Isaac el 2026-09-20: si CrewChief habla
el nombre literal en el caso del oráculo, Vantare debe pronunciar ese mismo
nombre mediante un fragmento local propio/licenciado. Posición, dorsal, clase o
texto visual no son sustitutos de paridad para ese caso. Si falta el fragmento,
el producto puede degradar de forma segura a identificación funcional, pero el
caso permanece FAIL y bloquea T8 hasta completar la cobertura; no existe una
excepción de producto preaprobada. Si CrewChief tampoco puede pronunciarlo,
Vantare reproduce el fallback observable registrado por T0 y no inventa una
exigencia literal superior al oráculo.

La resolución no expande consentimiento cloud: mapping, selección, composición
y audio del nombre permanecen locales. T0 debe inventariar la cobertura que
CrewChief puede leer antes de planificar assets, con licencia/procedencia, locale, alias,
pronunciación y hash del fragmento. El PASS offline exige la misma capacidad
desde cold start que online; prohibido ocultar una capacidad al desconectar.
Lo mismo se aplica a landmarks con nombre/identificador propio.

Una instalación preparada para voz incluye todos los packs comprometidos y
puede arrancar en frío sin red ni caché generativa. Un pack ausente/corrupto o
un STT sin modelo deja una degradación explícita y no obtiene offline PASS.
La salida visual de §10 es recuperación operativa, no paridad audible.

Se activa directamente sin red o con circuito de proveedor abierto. También
se activa si el LLM supera el timeout, produce una respuesta inválida o falla
el TTS dinámico. El fallo generativo no consume el hecho ni altera el estado de
la feature.

### 6.4 Contratos extensibles

- `LanguageModelPort`: conversación y tool calling.
- `SpeechToTextPort`: audio a texto.
- `DynamicSpeechPort`: texto arbitrario a audio reproducible o streaming.
- `DeterministicDialoguePort`: interpretación offline acotada.
- `PhrasePackPort`: frases y fragmentos precacheados.
- `EngineerToolRegistry`: herramientas tipadas compartidas por ambos caminos.

Las implementaciones concretas de proveedor no forman parte de los dominios
Engineer ni Telemetry.

“Texto arbitrario” describe la capacidad técnica del adaptador de síntesis;
su único llamador productivo entrega las cláusulas canónicas y los segmentos
discursivos abiertos admitidos por §6.2.1, sanitizados por §6.8. No recibe el
envelope bruto ni texto que haya evitado esos gates.

### 6.5 Conversación y acciones

La memoria es efímera, de hasta seis turnos o cinco minutos de inactividad
(lo que venza primero), ligada a evento, sesión, vehículo, equipo, piloto,
fuente, epoch y locale. No reutiliza hechos de turnos anteriores como datos
actuales. Cambiar cualquiera, resetear el reloj o perder contexto invalida
conversación, trabajos y propuestas. No se persisten audio ni transcripciones
por defecto; la política detallada de salida de datos está en §6.8.

Las acciones siguen obligatoriamente:

```text
propuesta -> readback -> confirmación -> ejecución idempotente -> verificación
```

El LLM puede ayudar a formular la propuesta, pero el estado y las transiciones
pertenecen al router determinista. Una acción nunca se deriva del texto
generado. Proponer no ejecuta ni reserva un efecto irreversible.

La propuesta conserva ProposalID, revisión, intent/slots exactos,
precondiciones, evidencia, lifecycle, locale y deadline. El readback de sus
parámetros es canónico y está ligado a esa revisión. La propuesta sólo se hace
confirmable al recibir evidencia de que todos los parámetros obligatorios se
entregaron audiblemente; queued/started o publicar el widget no equivalen a
readback completado. Si se usa UI accesible, exige un gesto explícito de
revisión y confirmación sobre esos mismos parámetros, registrado como canal UI.

La confirmación sólo puede proceder de entrada nueva del piloto reconocida
por el protocolo determinista de ENG-15 en el mismo locale. Ni una herramienta
ni una respuesta del LLM pueden confirmarse a sí mismas. Un readback cortado,
fallido o sustituido no habilita confirmación. Una nueva propuesta invalida la
anterior y exige otro readback. Cancelar, dos turnos no comprendidos, pérdida
de contexto/freshness o deadline mantienen los rechazos de ENG-15.

El router consume una propuesta una sola vez; el puerto de aplicación
revalida justo antes del efecto y usa ProposalID como clave idempotente. Si se
pierde una respuesta después del commit, devuelve/consulta el resultado de ese
mismo ID; no repite el efecto con otro ID ni presenta cancelado como no aplicado.
Un resultado indeterminado queda pendiente de reconciliación, bloquea una
repetición conflictiva y se comunica como tal. Verificación de estado final
demostrable es requisito para anunciar éxito, también offline. Las acciones
sin puerto real seguro permanecen disabled. T8 no exige implementar Pit o
Strategy, pero sí demostrar que ninguna herramienta Timings los ejecuta.

### 6.6 Presupuestos iniciales

- feedback audible de recepción: máximo 150 ms;
- inicio de respuesta interactiva: objetivo 1,5 s desde fin de habla;
- timeout generativo interactivo: 2,5 s, seguido de fallback;
- timeout generativo automático no crítico: 750 ms;
- carril crítico local: independiente de todos los anteriores.

Los 150 ms se miden desde cierre de captura PTT/VAD hasta el primer sonido
local de recepción cuando el carril de radio está disponible. Si P0 ya ocupa
la radio, rige `DEC-FEEDBACK-P0-001`: confirmación visual local dentro de esos
150 ms y ACK audible inmediatamente después de P0, si el turno sigue vigente.
Los 1,5 s se miden desde fin de habla hasta primera muestra audible de respuesta
útil, excluyendo ese feedback. El deadline interactivo de
2,5 s arranca al cerrar captura; STT consume ese mismo presupuesto antes de
admitir trabajo generativo. El automático arranca en el trigger. Ambos incluyen
herramientas, LLM, validación y obtención de audio dinámico reproducible; no se
reinician por herramienta,
retry, chunk o proveedor. Nunca supera el deadline del hecho. Una interacción
que agote 2,5 s pierde el objetivo de 1,5 s y queda contabilizada como fallback,
no como éxito del objetivo. STT puede tener un timeout menor según perfil de
dispositivo, nunca superar el deadline compartido. Si no consigue texto válido
antes de vencer, se pide repetir localmente; no se envía audio a un STT cloud
ni se inventa una consulta. El fallo se registra, no obtiene PASS interactivo.

La medición usa el binario Windows real, tiempos monotónicos y comienzo real
de reproducción, no el ACK lógico started. El informe incluye p50/p95/máximo,
muestras, hardware, locale, STT, proveedor/red, carga de LMU, tasas de fallback,
cancelación y falta de audio. Se informa por separado caliente/frío,
online/offline y con P0 concurrente; el PASS de objetivos se evalúa en p95. El
máximo audible de 150 ms se comprueba en el corpus sin P0 ocupando la radio. La
cohorte concurrente se informa aparte y exige ACK visual <=150 ms; su demora
audible se etiqueta `blocked_by_p0`, no como incumplimiento ordinario del SLO.

`DEC-FEEDBACK-P0-001` — resuelta por Isaac el 2026-09-20: P0 no se interrumpe,
atenúa ni mezcla con el feedback de recepción. Mientras P0 ocupa el único slot,
la UI confirma localmente dentro de 150 ms y encola un único ACK audible para
el primer instante posterior a P0. Antes de reproducirlo revalida TurnID,
cancelación y vigencia; si ya comenzó una respuesta útil o el turno dejó de ser
vigente, lo descarta para evitar un ACK tardío o duplicado. Esta excepción de
modalidad sólo cubre el feedback de recepción: no pausa deadlines de STT,
herramientas, LLM, facts ni fallback, no concede mezcla y no rebaja P0.

Las latencias de respuesta útil bloqueadas por P0 se publican en la cohorte
`blocked_by_p0`, separadas del SLO interactivo sin contención. Al liberar el
carril se revalida cada bloque según §6.7: sólo se reproduce contenido todavía
vigente; si caducó, se cancela o recompone sin renovar su deadline. El gate
comprueba ausencia de solapamiento, un único ACK, confirmación visual <=150 ms,
primera oportunidad audible tras P0 y que ningún resultado obsoleto llegue a
radio o widget.

### 6.7 Lifecycle, presión y entrega

Cada trabajo conserva JobID, TurnID o FactID, revisión del productor,
lifecycle completo, locale, observedAt, freshUntil, deadline absoluto y token
de cancelación. Datos de snapshots distintos no se mezclan sin una derivación
declarada. Cambiar rival/contexto invalida el trabajo aunque su TTL no venza.

Límites iniciales por instancia: un turno interactivo activo y un trabajo
automático generativo activo, con un candidato automático pendiente latest-wins
por relación y un máximo total de tres candidatos pendientes. Un turno nuevo
sustituye/cancela el interactivo anterior; la propuesta mutable pendiente
sigue las reglas de §6.5.
Máximo cuatro invocaciones de herramientas por turno, dos rondas de LLM, 16 KiB
de entrada serializada y 4 KiB de salida; excederlos usa fallback. Los límites
de tokens se configuran además por proveedor sin ampliar esos límites de bytes
ni los deadlines. Audio dinámico se limita a 30 s y 8 MiB decodificados por
job; excederlos cancela antes de reproducir. Las respuestas superiores se
dividen por proposiciones antes de generarse, nunca se truncan a mitad de un
hecho. El plan de cada tipo fija su longitud máxima por debajo de ese techo.

El trabajo cloud se prepara fuera del lock de ingesta/diálogo y sin ocupar el
turno de reproducción. No se crea una solicitud por frame. Cola llena,
sustitución, circuito abierto o deadline provocan una decisión local explícita
(fallback si aún es relevante; descarte si ya no lo es). Telemetry Core,
familias y el carril crítico no esperan ningún proveedor.

Online y fallback compiten por un único ganador de presentación por JobID y
revisión vigente; el coordinador conserva una única entrega lógica y un único
terminal por JobID, también cuando cambie su revisión. La revisión no crea
otro permiso de reproducción. Timeout/cancelación invalida el token del proveedor: callbacks y
chunks tardíos no publican, no consumen cooldown ni cambian la feature. Sólo
hay un terminal de entrega. Antes de cualquier audio dinámico se valida el
FactBundle completo y se admite o descarta el discurso; streaming no permite
hablar prefijos aún no validados. Un fallo
de audio tras empezar sólo permite continuar con cláusulas canónicas aún no
entregadas, identificadas por ID; si no se sabe dónde se cortó, se cancela y se
espera al siguiente ciclo revalidado. No se repite automáticamente un hecho
que el piloto ya pudo oír. La introducción discursiva no cuenta como respuesta
útil para medir §6.6: se mide la primera muestra de una cláusula canónica que
responde a la consulta/hecho, no relleno que anteceda esa información.

En started se comprueban de nuevo rival, relación, fase, banderas, pits,
capabilities, lifecycle, freshness y valor audible frente al snapshot actual.
Se mantiene la clasificación de tendencia de las muestras admitidas por T3;
la cifra se obtiene del contexto vigente. Si cambia fuera de la precisión
audible autorizada, se recompone localmente o se cancela, sin ampliar TTL ni
reiniciar generación. Un cambio semántico del hecho invalida toda su salida.
El estado de emisión/cadencia sólo avanza al compromiso de entrega definido
por la fila del oráculo, nunca por invocar LLM/TTS ni por perder esa carrera.

Recomponer no muta el FactBundle que ya validó el modelo: el coordinador crea
una revisión de presentación monotónica bajo el mismo JobID, con nuevo hash,
conservando FactID, entrega acumulada y deadlines originales. Invalida de forma
atómica el plan, discurso, audio TTS y callbacks de la revisión anterior; no
rebindea sus factRef a valores nuevos. La nueva revisión sólo compone audio
canónico local pendiente, sin relanzar cloud. La autoridad de la feature decide
si el hecho sigue siendo el mismo; un cambio semántico cancela, no se encubre
como revisión. El ACK de una revisión retirada nunca avanza cadencia ni readback.

Started del job o de una introducción no autoriza todos los bloques futuros.
Antes de cada bloque factual indivisible —y al continuar tras fallo— se repite
la revalidación sobre el contexto actual, incluyendo TTL/freshUntil y los
valores que se van a oír. No se inicia otro bloque caducado porque el primero
empezara a tiempo. Lo ya empezado conserva la regla de finalización/P0 de este
apartado. Un cambio que invalide la composición retira todo discurso restante.
Cada bloque registra no iniciado/iniciado/entregado/interrumpido-incierto;
sólo se continúa con bloques no iniciados, nunca con uno que pudo oírse a
medias. Si no hay evidencia suficiente del punto de corte, se cancela según la
regla anterior. Una entrega parcial no se registra como respuesta completa ni
habilita la confirmación de un readback incompleto. Dividir una respuesta larga
no crea nuevos jobs con TTL renovado ni reproduce hechos ya entregados.

P0 preempta también audio ya empezado. La regla de terminar con seguridad
después de started sólo permite completar una cláusula no crítica ante un
cambio ordinario de valor; no anula P0, Stop, desactivación, pérdida de fuente
o cambio de sesión/identidad/rival, que cancelan. Todo proceso, stream y goroutine
tiene owner y cierre acotado; se prueba cero trabajos residuales tras Stop.

El circuito es independiente por LLM/TTS: fallo explícito de conectividad
abre inmediatamente; tres timeouts/errores consecutivos también lo abren.
Tras 30 s se permite una única sonda half-open en un trabajo relevante;
éxito lo cierra, fallo duplica la espera hasta cinco minutos. No se reintenta
un job agotado. Cancelación por usuario/P0 no cuenta como fallo del proveedor.
La revocación del modo cloud cancela pendientes y prohíbe sondas/reintentos.

### 6.8 Privacidad y observabilidad

Rige el [contrato de producto](../vantare-program/product-contract.md).
Cloud se activa mediante una acción explícita para la sesión que muestra
proveedores y datos enviados; no se deduce consentimiento de PTT, una licencia
o la aceptación de esta spec. Sin esa activación se usa offline. No se habilita
subida automática de paquetes ni se modifica el consentimiento de ADR 0009.

| Frontera | Datos permitidos y retención |
|---|---|
| Micrófono → STT local | PCM acotado a la ventana de captura; memoria efímera, sin archivos/logs. Cerrar PTT/VAD deja terminar STT dentro del deadline; el owner elimina PCM al terminar/cancelar STT o vencer el job, no antes de consumirlo. |
| Router → LLM cloud | Texto necesario sanitizado y contexto mínimo del turno. Se sustituyen nombres/identificadores personales por referencias opacas locales y se excluyen voz, rutas, telemetría cruda, credenciales y perfiles. Si no se puede sanitizar, offline. |
| Herramientas → LLM | Sólo la allowlist del tipo semántico: relaciones, cifras/unidades, calidad y referencias opacas del turno. Nunca parrilla completa ni historial crudo. |
| Realizador → TTS dinámico | Sólo cláusulas canónicas y discurso admitido; sin nombres personales, rutas, IDs internos o transcripción original. Nombres literales se insertan con fragmentos locales. Si el oráculo pronuncia el nombre, sustituirlo por posición/clase es FAIL según DEV-NAME-001. |
| Memoria y caché | Conversación bajo §6.5; audio dinámico efímero ligado al job. PhrasePack estático propio puede persistir; no se llena con audio/texto de sesión. |
| Diagnóstico/replay | Sólo IDs de caso/job opacos, enums, métricas agregadas y fixtures sintéticas o capturas consentidas sanitizadas. No prompts, respuestas libres, audio, transcripciones ni nombres de sesiones reales. La excepción de corpus sintético de §6.2.1 permite sus textos inventados versionados, nunca trasladar contenido de sesión bajo esa etiqueta. |

Cada adaptador documenta proveedor, modelo/versiones, región, política de
retención y tratamiento de cancelación antes de su gate. La configuración
admitida exige no entrenamiento y cero retención remota del contenido fuera
del procesamiento efímero de la solicitud; no basta desactivar logs locales.
Un proveedor que no garantice esas condiciones no se habilita. Cancelar impide
nuevos envíos y descarta resultados locales; no afirma recuperar bytes ya
aceptados remotamente. No hay tracing automático de SDK con contenido.

La traza local acotada conserva motivo de emisión/silencio, rechazo de
validación, estado del circuito, edad de evidencia, coalescing, fallback y
terminal, y tiempos STT/herramientas/LLM/TTS/cola/reproducción. Se limita a
2.048 eventos en memoria sin PII; exportar requiere el flujo consentido de
diagnóstico. El gate verifica allowlists con canarios sintéticos de PII,
ausencia de contenido en logs y cero envíos sin activación o tras revocación.

## 7. Oráculo y ledger

Cada conducta se registra con un identificador estable y contiene:

- commit CrewChief de referencia;
- configuración y opciones relevantes;
- precondiciones y secuencia temporal de entrada;
- decisión de hablar o callar;
- contenido semántico obligatorio;
- relación temporal admitida;
- prioridad, interrupción, TTL y revalidación;
- resultado online generativo;
- resultado offline precacheado;
- nombre literal o fallback funcional esperado según la salida del oráculo;
- replay y evidencia LMU.

El esperado se obtiene de CrewChief, nunca del resultado de Vantare: cada
fila cita archivo/línea del commit fijado y, para inferencias o anomalías,
traza observada o harness independiente. Guarda hash de fixture, configuración
completa (incluidas opciones globales), pista/catálogo, locale, variante de
identidad audible y versión del entorno/audio de referencia. No se copian
assets ni gramáticas: se registra su efecto observable.

El replay usa reloj monotónico virtual y PRNG inyectable con semilla y secuencia
de elecciones registradas, separada de variación textual. Se comparan hechos,
silencios, orden y ventanas temporales, no textos idénticos. Cada fila declara
precisión/unidad, instante de muestreo, contador inicial, ventana admisible
desde trigger hasta started y condición de consumo de cadencia. Los límites
son parte del esperado; no se amplían para hacer pasar una implementación.
La aleatorización se prueba por bordes y elecciones controladas, además de
distribución; no se exige que dos PRNG no sincronizados hablen en el mismo tick.

La ruta online se prueba con respuestas/tool calls capturados sintéticos y
proveedores falsos deterministas; el gate de voz real prueba además el
proveedor efectivo. El LLM live no define un golden. El gate acústico verifica
las proposiciones realmente oídas y unidades, no sólo el texto anterior al TTS.

Ejemplo conceptual:

```text
TIM-AUTO-017
Contexto: carrera, P4 de clase, mismo rival delante; muestras admitidas
          2,4 -> 2,1 -> 1,8 s; contador delante ya habilitado (>=4),
          gap detrás 4 s con historial válido; sin candidato de doblaje,
          banderas, boxes ni condición de final. El rival no cambia en cola.
Esperado: anuncia que el piloto recorta al rival, comunica el gap actual,
          no anuncia simultáneamente detrás; prioridad CC 5, TTL 5 s.
```

Estados permitidos:

1. `inventariado`
2. `bloqueado por señal`
3. `implementado`
4. `replay PASS`
5. `online voice PASS`
6. `offline fallback PASS`
7. `LMU PASS`
8. `paridad cerrada`

Una sección sólo se cierra cuando todos sus casos obligatorios alcanzan
`paridad cerrada` o tienen una desviación aprobada por producto.

Los estados son acumulación de evidencias independientes, no una promoción
automática por orden. Una fila conserva resultado PASS/FAIL/INCONCLUSIVE por
gate, SHA Vantare, fixture, contrato, config, locale, packs/modelos y proveedor.
Cambiar cualquiera que afecte la conducta invalida sus PASS dependientes; no
se hereda el audio de una revisión ni el LMU PASS de otra sin comprobar impacto.
Un gate ausente o una señal bloqueada nunca equivale a PASS.

T0 mantiene además un registro de anomalías del oráculo: comportamiento
confirmado, defecto candidato, defecto demostrado o desviación aprobada. Cada
entrada contiene reproducción, impacto y decisión; los defectos no se copian
silenciosamente ni se corrigen en el esperado sin aprobación. Deben
caracterizarse especialmente el cálculo de estado detrás antes de insertar la
muestra (Timings.cs:613), la comprobación repetida de gaps[0] en isSameCar
(:1068), el filtro de posición que puede impedir el desdoblaje (:653–659) y
la repetición de aviso por rival después de cinco minutos (:716–720). Hasta
resolver la clasificación, los casos afectados no pasan a implementación de
paridad ni a PASS; el resto del inventario sí puede avanzar. Una rama presente
en código no prueba que sea observable durante LMU.

## 8. Primer corte: Timings

### T0 — Oráculo

Inventariar `Events/Timings.cs`, sus dependencias observables, defaults,
comandos, silencios, revalidaciones y casos límite. Toda opción se documenta
aunque inicialmente sólo se implemente el default.

Salida exigida: matriz normativa de §7 y §8.1 completa para la configuración
default, inventario de todas las opciones aplicables, tabla de datos de §9 y
registro de anomalías. Fuentes mínimas al SHA fijado: Timings.cs,
AbstractEvent.cs, GameStateMapper.cs, GameStateData.cs (DeltaTime y relaciones),
RF2GameStateMapper.cs (ruta LMU), TrackData.cs, Opponents.cs, CommonActions.cs,
QueuedMessage.cs, AudioPlayer.cs, GlobalBehaviourSettings.cs,
NumberProcessing (TimeSpanWrapper y lectores por locale) y Settings.settings.
Se demuestra que la
opción revert_to_legacy_version_of_refactored_code está false; el monitor
legacy de ninguno de los productos puede convertirse en oráculo por accidente.
No empieza T1 implementable sin esas salidas revisadas; T0 no acredita paridad.

### T1 — Relaciones de carrera

Producir relaciones estables y tipadas para:

- líder de clase;
- rival de clase inmediatamente delante;
- rival de clase inmediatamente detrás;
- coche inmediatamente delante en pista;
- coche inmediatamente detrás en pista;
- candidato automático detrás en pista de la misma clase, distinto del rival
  inmediatamente detrás en carrera (no confundirlo con la consulta sin filtro);
- diferencia temporal y de vueltas.

Cada relación incluye ID del vehículo, nombre/clase cuando sean utilizables,
calidad, freshness, sesión y epoch. No se infiere identidad mediante el valor
del gap.

Posición de clase, orden en pista y orden general son campos separados. Se
declaran filtro de actividad, velocidad y entrada en boxes, wrap de meta,
signos de tiempo/vueltas y dato unknown. Sólo una derivación demostrada puede
convertir posiciones/gaps generales en relaciones de clase. T1 verifica esos
contratos con los casos de §9 antes de habilitar el muestreo de T2.

### T2 — Muestreo

Mantener historial separado por relación e ID de rival. Muestrear en cambio de
sector o gap point equivalente. Cambiar rival, sesión o epoch reinicia su
historia y evita atribuir una tendencia al coche incorrecto.

Se eligen gap points cuando la definición de pista los contiene; en otro caso
se usan cambios de sector. No se muestrea dos veces por ambos caminos ni se
fabrica una muestra por frame. Cruce hacia delante, meta, retroceso, salto de
snapshots, valores duplicados y primera muestra están en el oráculo. Si no se
puede demostrar qué intervalo se cruzó, se reinicia la ventana afectada. La
política de duplicados y la asimetría de inserción delante/detrás se
caracterizan en T0 antes de decidir una desviación.

### T3 — Clasificación

Reproducir los estados observables de CrewChief:

- `CLOSE`;
- `INCREASING`;
- `DECREASING`;
- estable/sin tendencia;
- no fiable/silencio.

El oráculo fijará redondeo, cantidad de muestras, umbrales de cercanía,
saltos máximos y límite de gap. Las condiciones se expresan como escenarios,
no sólo como constantes unitarias.

### T4 — Cadencia, selección y silencios

Implementar:

- frecuencias independientes delante, detrás y coche detrás en pista;
- aleatorización equivalente;
- preferencia por mensajes a mitad de vuelta;
- selección de una sola relación en modo normal, con las excepciones de §8.1;
- preferencia del candidato detrás en pista que cumple el filtro del oráculo;
  doblaje/desdoblaje se distinguen sólo cuando la relación está demostrada;
- supresión durante formación, neutralización, bandera relevante, pit lane,
  vuelta de entrada, reanudación tras verde y final según §8.1;
- revalidación justo antes de empezar el audio.

### T5 — Mensajes automáticos

Emitir hechos semánticos para:

- gap actual delante y detrás;
- rival acercándose o alejándose;
- piloto recortando;
- presión sostenida;
- retención sostenida;
- doblaje/desdoblaje;
- consejo de ataque/defensa por landmark incorporado a los mensajes anteriores;
- lectura de curvas durante la vuelta solicitada, independiente de gap messages.

El online genera redacción natural. El offline compone una frase canónica. En
ambos casos se conservan dirección, valor, rival/contexto y tendencia
obligatorios para cada tipo (un CLOSE puede no incluir cifra). Se elimina como
salida final cualquier aviso equivalente a
“Diferencias actualizadas” sin datos.

### T6 — Consultas

Herramientas y fallback cubrirán:

- gap delante en carrera;
- gap detrás en carrera;
- coche delante en pista;
- coche detrás en pista;
- gap al líder;
- vuelta del líder;
- punto donde se gana o pierde tiempo cuando exista evidencia de landmarks;
- componente Timings de STATUS y SESSION_STATUS;
- controles de resumen por vuelta, lectura de curvas y silencio que afectan
  Timings, mediante el protocolo de acción apropiado.

Leading, last, sin rival, diferencia de vueltas, dato missing y dato stale
tienen respuestas explícitas y no reutilizan un cero ambiguo.

Se distingue disponibilidad por consulta y sesión: gaps de carrera y vuelta
del líder son consultas de carrera; consultas en pista y al líder conservan
la semántica aplicable de práctica/clasificación del oráculo. “Gap al líder”
no se transforma silenciosamente en diferencia de mejor vuelta: T0 verifica
qué relación devuelve la ruta LMU en cada sesión. WHERE_AM_I_FASTER compara con
el rival de clase delante y WHERE_AM_I_SLOWER con el de detrás; consumen el
mismo cooldown de consejo que el automático. Una consulta de gap actualiza el
último gap reportado sólo donde lo hace el oráculo, sin reiniciar por defecto
todos los contadores. STATUS no inventa un “sin datos” extra cuando su
contribución Timings debe callar.

### T7 — Ajustes

Defaults iniciales del oráculo CrewChief:

- gap messages: activos;
- frecuencia delante: `7`;
- frecuencia detrás: `4`;
- frecuencia coche detrás en pista: `5`;
- aleatorización: `5`;
- resumen de gaps en cada vuelta: desactivado.

Después del PASS de defaults se exponen los mismos grados configurables y se
añaden escenarios de sus extremos, incluido frecuencia cero.

El inventario inicial también incluye opciones globales que alteran Timings:
just_the_facts=false, enable_driver_names=true,
enable_delayed_messages_on_hardparts=false,
allow_important_messages_even_when_silenced=false,
always_report_time_in_hundredths=false, quiet/informed, preferencia de
identidad audible, lectura de curvas y activación del modo de gaps por vuelta.
Incluye dependencias de clase, locales/number reader, disponibilidad de nombres
y audio, update interval y la opción de implementación legacy. Por opción se
registra fuente/default/dominio válido, qué conducta cambia, si se expone en
Vantare, extremo negativo/cero y gate. Las opciones exclusivas de otros sims
se excluyen con evidencia. La opción legacy se documenta como referencia de
selección de oráculo, no exige exponer dos implementaciones Vantare.

Los valores anteriores no constituyen por sí solos el
inventario. La paridad default se etiqueta como tal; opciones aún no
implementadas no se publicitan como soportadas. Para cerrar la sección completa
se prueban también todas las opciones incluidas o se registra su desviación
aprobada según §7; “defaults PASS” no cierra silenciosamente ese remanente.

### T8 — Cierre

Timings exige:

- todos los escenarios default en replay;
- respuesta generativa validada;
- variación discursiva abierta y evaluación de riesgo residual de §6.2.1;
- el mismo escenario resuelto offline;
- sesión LMU con cambio de rival, presión, adelantamiento, boxes, amarilla y
  final de carrera;
- evidencia de latencia y ausencia de mensajes obsoletos;
- documentación actualizada del ledger.

También exige casos de práctica/clasificación, multiclass, líder/último,
cruce de meta, gaps de vueltas, frecuencia cero, resumen por vuelta,
desactivación/quiet, datos congelados/ausentes, nuevos epochs y cambio de
locale. Cada caso tiene salida audible/semántica y silencio esperado por
locale. Se añade cold start sin red y sin caché generativa, packs completos y
corruptos, nombre desconocido, pérdida de red/STT/TTS, fallo durante streaming,
timeout y callback tardío, tormenta de triggers, cola llena y P0 en cada fase.
Se fuerza cambio de cifra después de generar audio y antes de started, hash
viejo tras recomposición, ACK de revisión sustituida, expiración entre bloques,
fallo después de una introducción y corte a mitad de cláusula. Se exige un solo
terminal por JobID, cero rebinding de hechos a texto aprobado y ningún bloque
posterior iniciado con datos obsoletos o repetido tras entrega parcial.
Se comprueban cancelación/Stop sin residuos, ausencia de doble salida,
invariantes de §6.2.1, privacidad de §6.8 y readback interrumpido de §6.5.
DEV-NAME-001 exige evidencia literal cuando el oráculo pronuncia el nombre;
identificar funcionalmente no permite marcar como idéntico ese caso. Un online
que siempre usa compositor o variantes enumeradas
no supera el gate de variación aunque sus hechos sean correctos.
La evidencia humana de voz/LMU es distinta del replay sintético; un escenario
sin landmarks disponibles no demuestra el PASS de consejo por curvas.

### 8.1 Reglas mínimas del oráculo Timings

Esta tabla es vinculante para T0; su matriz extiende los casos de borde y
resuelve anomalías, no puede borrar filas. Referencias: CrewChiefV4 al SHA del
encabezado; los números identifican líneas iniciales para comprobar la fuente.

| ID | Conducta y esperado mínimo | Fuente |
|---|---|---|
| TIM-REL | Delante/detrás de clase en carrera; consultas en pista sin filtro de clase. El candidato automático detrás en pista es de la misma clase y excluye al rival inmediatamente detrás en carrera. En pista se excluyen coches con velocidad <=0,5 m/s o entrando a pits; wrap y dirección se verifican antes de hablar. | Timings.cs:297,340,1268; GameStateData.cs:4759,4805 |
| TIM-SAMPLE | Gap point sustituye al sector cuando existe; cruce positivo desde debajo del punto, no en vuelta atrás. Longitud >3.300 m usa puntos inicialmente separados 780 m y último a 50 m de meta; pistas de dos sectores tienen regla propia. Ajustes por hard parts forman parte del perfil de pista. | Timings.cs:1424; TrackData.cs:875,1351,1384 |
| TIM-STATE | NONE con <3 muestras, valores <=0, gap más reciente >20 s, salto entre dos recientes >5 s o identidad no fiable. CLOSE: dos recientes <0,5 s, o tres <0,7 s, o cuatro <0,8 s, sujeto al mínimo de tres. Creciente/decreciente exige monotonía a una decimal y comparación con último reportado redondeado a entero, salvo valor inicial -1; midpoint al par de Math.Round. OTHER exige diferencias con las otras dos <1 s; en otro caso NONE. La comparación distinta del último reportado se caracteriza, no se normaliza silenciosamente. | Timings.cs:1017 |
| TIM-PRECISION | AUTO_GAPS: segundos si gap >10 s; por debajo, centésimas sólo si useHundredths y gap <0,5 s en LMU; décimas en los otros casos. useHundredths depende de clase y always_report_time_in_hundredths. T0 verifica redondeo/realización de cada locale; 0,5 y 10 s son bordes distintos de los umbrales de clasificación. | NumberProcessing/TimeSpanWrapper.cs:37; GlobalBehaviourSettings.cs:108 |
| TIM-CADENCE | Frecuencia cero desactiva esa relación. Para frecuencia positiva f, espera mínima 11-clamp(f,1,10), máxima exclusiva mínima+clamp(randomness,1,10); espera inicial mínima. Tras entrega/resolución admitida, nuevo sorteo. Sin gap points, preferencia mitad de vuelta añade 0/1/2 sólo al caer en fin de vuelta. En modo normal los tres contadores avanzan por cada punto/sector admitido por el trigger, aunque se descarte una muestra duplicada; conservan resets y esperas independientes. El modo por vuelta actualiza gaps pero no incrementa esos contadores. Cambio de rival detrás en pista prepara su contador para próxima oportunidad. | Timings.cs:173,199,244,256,469,624,646 |
| TIM-SELECT | Normal: candidato detrás en pista “cercano” si <=5 s, CLOSE/DECREASING, por delante en clasificación general y habilitado; CLOSE se excluye con just_the_facts. Si además vence su cadencia, tiene preferencia. Delante/detrás de carrera requieren frecuencia>0, estado distinto de NONE y lapDelta=0; CLOSE/just_the_facts suprime esas salidas. Delante se inhibe con cualquier behindOnTrack CLOSE; detrás con candidato “cercano”, aunque no haya vencido su cadencia. closerInFront sólo es true si ambos historiales existen y gap delante < gap detrás. Delante requiere closerInFront o frecuencia detrás<=0; detrás requiere lo contrario o frecuencia delante<=0, siempre con su cadencia vencida. Igualdad favorece detrás; no se inventa un fallback al otro lado si no cumple. Se prueban historial ausente, líder/último y frecuencia cero. El modo por vuelta usa otra regla. Posibles ramas inalcanzables siguen §7. | Timings.cs:650 |
| TIM-SILENCE | Gap automático sólo en Race y fase admitida por AbstractEvent (Green/Countdown), fuera de formación manual. Calla con currentLapIsFCY, amarilla local, azul, pit lane o intención de parar esta vuelta. Calla mientras completedLaps del snapshot previo <= lapCountWhenLastWentGreen. Opciones gap disabled/quiet y hard parts conservan sus excepciones de cola. | Timings.cs:428,453,364; AbstractEvent.cs:168; AudioPlayer.cs:948,1352 |
| TIM-END | Carrera cronometrada: silencio con tiempo restante >-1 y <120 s. Por vueltas: cuando vueltas restantes=0, circuito normal calla; LONG (>10 km hasta 20 km) calla en sectores 2/3; VERY_LONG (>20 km) en sector 3. No se convierte falta de Remaining en carrera terminada. | Timings.cs:267; TrackData.cs:880 |
| TIM-AUTO | INCREASING/DECREASING/OTHER comunican gap actual y relación; umbral numérico normal >0,05 s. CLOSE delante comunica retención sólo tras >60 s desde holdingUsUp de ese rival; la fuente reinicia por cambio de rival, no por cada salida temporal de CLOSE. Detrás CLOSE comunica presión. Ataque si retención CLOSE con gap <6 s o DECREASING <6 s; defensa en CLOSE o DECREASING. Consejos distinguen entrada/recorrido de curva, con evidencia de landmarks y cooldown independiente ataque/defensa de tres minutos por rival. | Timings.cs:439,599,767,857,938,974 |
| TIM-QUEUE | Normal: prioridad CC 5 y TTL 5 s; cifra/identidad/supresiones se resuelven justo antes de reproducir. En Vantare prioridad de rutina P3; consulta P2; carril P0 conserva precedencia. T0 prueba orden relativo al resto de radio, no equivalencia numérica entre escalas. Cancelación anterior a salida no consume el hecho. Los efectos de callbacks sin contenido se caracterizan como anomalía antes de fijar cadencia. | Timings.cs:674; QueuedMessage.cs:251,353 |
| TIM-LAPPING | Revalidar mismo candidato y no-racing; no reportar gap <0,05 s. CLOSE avisa contexto de doblaje; intervalo por rival de cinco minutos según fuente, sujeto a anomalías. Fuera de CLOSE puede incluir posición y diferencia de vueltas. No denominar “desdoblaje” a un rival sin relación demostrada. | Timings.cs:691 |
| TIM-LAPMODE | En nueva vuelta combina delante si no líder, detrás si no último y candidato de la misma clase detrás en pista filtrado por ClassPosition <= la del piloto y excluyendo al rival detrás en carrera. El filtro llamado onlyIncludeCarsLappingThePlayer no exige lapDelta distinto de cero: no sustituirlo por “sólo si ya dobla”. Gaps >0,05 s. Mensaje breve sin nombres, detrás en pista sin lap diff ni afirmación añadida de doblaje; prioridad CC 10, TTL 5 s, playEvenWhenSilenced=true. En Vantare P2; no evita P0 ni filtros de carrera/pits/banderas. | Timings.cs:476,504; GameStateData.cs:4805 |
| TIM-QUERY | Delante/detrás de carrera y vuelta del líder: Race. leading/last explícitos; tiempo cero sin dato no se convierte en gap válido. “Último” en consulta detrás usa isLastInStandings (cantidad inicial de coches), distinto de isLast (cantidad actual) usado por automático/STATUS; T0 cubre retiradas y no normaliza ambos predicados. Consultas en pista validan signo y comunican vueltas; gap al líder usa relación relativa con dirección explícita, incluida clasificación; líder es de clase. Vuelta del líder incluye diferencia de vueltas cuando existe. | Timings.cs:1210,1241,1268,1315,1349; GameStateData.cs:4635,4648 |
| TIM-STATUS | STATUS/SESSION_STATUS: si líder, gap detrás >2 s; si no líder y no último, gap delante >2 s; en otros casos contribución silenciosa, sin “no data” añadido. Se integra con otras familias sin duplicar. | Timings.cs:1152 |
| TIM-CORNERS | Lectura pedida para la vuelta actual en midpoint de landmark; sucede antes del filtro gap messages/formación, conservando fase aplicable. TTL 2 s, prioridad CC 10 (Vantare P2), sin esperar LLM. Consultas faster/slower y consejos automáticos comparten historial/cooldowns y catálogo propio de landmarks. | Timings.cs:421,1178; RF2GameStateMapper.cs:782,833 |

Fuera del carril crítico, prioridad P2/P3 no autoriza nuevas proposiciones ni
elimina expiración. La excepción de resumen por vuelta a quiet es explícita;
ninguna salida evade desactivación total de audio por el usuario. Toda
diferencia respecto al oráculo por seguridad o control de usuario se anota en
el ledger; no se disfraza de equivalencia literal de prioridad.

## 9. Datos y extensiones de telemetría

La proyección Engineer actual ya contiene parrilla completa, IDs, nombres,
clases, posición, vueltas, sector, distancia, gaps y posición espacial. Esto es
suficiente para iniciar la caracterización de T1, no para declarar equivalentes
todos sus gaps ni para habilitar automáticamente T2–T5. La vista de producto
actual se llama ObservationV1: “Telemetry V2” no cambia ese versionado.

Todo dato se clasifica antes de depender de él:

| Clase | Contrato y uso |
|---|---|
| Observado | Señal LMU mapeada por Telemetry Core con fuente, unidad, calidad, freshness y evidencia del mapping en sesión activa. Un campo presente no basta. |
| Derivado | Regla determinista identificada/versionada sobre observados o catálogo demostrado; conserva procedencia e incertidumbre. La derivación no oculta un dato missing. |
| Catálogo | Datos propios/licenciados de pista, landmark o voz con versión, identidad de pista/layout, coordenadas/unidades y cobertura. Nunca se copian assets CrewChief. |
| Ausente o candidato | Missing/unsupported o mapping pendiente de demostrar. No equivale a false/green/zero. Sólo bloquea las conductas que necesitan ese conocimiento, identificadas en el ledger. |

Amarilla global existe en Core como mapping candidato del REST, pendiente de
verificación activa (schema/session/types.go:27). Debe exponerse con esa
calidad, nunca como fuente certificada por el mero cambio de proyección.
Timings requiere además fase, estado de vuelta FCY y última vuelta al volver
a verde, amarilla local, azul, pits/intención de parada, tipo/duración de
carrera y longitud/clase de longitud de pista. T0 identifica fuente observada
o derivación demostrable de cada una. Intención de parada/manual formation
pueden provenir del estado determinista confirmado del Engineer, con origen
explícito; no se inventan desde texto cloud.

Gap points no son una señal que LMU deba proporcionar: CrewChief los calcula
con longitud/sectores y los ajusta con hard parts. Se derivan en Engineer a
partir de datos canónicos y definición propia de pista; los criterios de
muestreo son conducta de producto, no umbrales nuevos en Telemetry Core.
Landmarks combinan catálogo propio y tiempos de paso derivados. La ausencia
de nombres de curva en LMU no demuestra imposibilidad: se inventaría catálogo
y evidencia de timing disponibles, con bloqueo explícito si no los hay.

Antes de T2, T1 debe demostrar el significado de posición/clase, gap de
carrera, gap relativo en pista y diferencia de vueltas. Incluye líder/último,
mono/multiclass, coches a distinta vuelta, ritmos diferentes, detenido/pits,
envoltura de meta y campos ausentes. El gap relativo actual, derivado de
LapProgressTime con EstimatedLapTime, no es equivalente por nombre al delta de
pasos de CrewChief. Se compara con entradas y esperados independientes; si no
cumple, se extiende la derivación/proyección con una semántica demostrada antes
de usarlo, sin segundo lector. Posición de clase derivada lleva su calidad.

Se puede avanzar con relaciones y replay sintético sin haber demostrado todas
las banderas. Para hablar automáticamente en LMU deben ser conocidas y
vigentes todas las precondiciones de silencio de esa regla; señal de bandera
missing no significa ausencia de bandera. Una consulta numérica que no depende
de esa señal puede seguir disponible con sus propias precondiciones. Así se
delimita el bloqueo sin habilitar avisos de carrera en contexto desconocido.

No se reintroducirá `telemetry.Frame` legacy ni un segundo lector LMU.

## 10. Fallos y degradación

- Dato missing/stale: silencio o respuesta explícita de indisponibilidad.
- Cambio de rival/contexto antes de `started`: cancelar el mensaje.
- Cambio después de `started`: aplicar §6.7; sólo un cambio ordinario de valor
  permite terminar la cláusula. P0, Stop o cambio de lifecycle cancelan.
- LLM/TTS inválido o lento: fallback offline sin consumir el hecho.
- STT ambiguo: pedir aclaración; nunca elegir una acción por proximidad textual.
- Pérdida de red: abrir circuito, evitar reintentos por cada frame y mantener
  funcionalidad offline.
- Falta de phrase pack: salida visual y diagnóstico; no sintetizar un hecho.
- Señal LMU no demostrable: caso bloqueado, sin proxy oculto.

La falta de pack nunca marca PASS audible. Error de TTS antes de empezar puede
usar compositor local; después de empezar se aplica la política por cláusula,
sin doble presentación del mismo job. “Sin consumir el hecho” no renueva su
caducidad ni autoriza reintentos ilimitados.

## 11. Criterio de transición entre secciones

No se empieza el cierre de la siguiente sección mientras Timings no haya
alcanzado `paridad cerrada`, incluido `LMU PASS`. El gate LMU puede descubrir
correcciones y obliga a resolverlas antes de ampliar superficie.

El orden T0–T8 es de aceptación, con estas dependencias explícitas:

1. T0 cierra contrato/oráculo, inventario de opciones y taxonomía de datos.
2. T1 caracteriza/provee las relaciones y la semántica de gaps; longitud y
   puntos de pista están listos antes de T2.
3. Las señales y el estado compartido de silencios, radio/ACK, lifecycle,
   validador y cancelación de §6 preceden a la primera salida de T4/T5.
   Esto no obliga a cerrar antes la familia audible de banderas.
4. T5/T6 incluyen los consejos y controles de Timings, con catálogo/landmarks
   propios cuando corresponda. No se trasladan al futuro coaching para cerrar.
5. STT local real, QueryPort canónico, compositor y packs instalables preceden
   a los PASS de voz de T6/T8; fakes sólo permiten avanzar replays de contratos.

La infraestructura se entrega con esas conductas concretas. Una dependencia
sin señal/asset fiable bloquea sus casos; no exige construir de antemano todos
los dominios. PLAN.md debe reflejar estos gates y sus entregables, no una
promesa genérica de “conectar voz al final”.

Tras Timings, el orden es Spotter, banderas/neutralizaciones, vueltas/ritmo,
rivales/multiclass y el resto del mapa de la sección 5. Cada sección reutiliza
el registro de herramientas, el ledger y ambos caminos de voz.

## 12. Resultado esperado

El proyecto deja de medir paridad por presencia de código. Cada capacidad pasa
a tener una referencia observable, una implementación activa, voz generativa
segura, fallback offline y dos gates de evidencia. Timings será la primera
prueba de que la arquitectura sirve al piloto y no sólo al transporte interno.
