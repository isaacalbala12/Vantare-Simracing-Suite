# T0a — Oráculo documental de Timings

[VAN-743](https://app.notion.com/p/3e3e51695c6581f791a5ff927568f965) ·
[GitHub #1312](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1312) ·
[PLAN Engineer](../../../engineer/PLAN.md) ·
[Contrato §7–9](../../../specs/2026-09-19-crewchief-lmu-parity-design.md).

**Candidato para revisión humana.** Inventario de quince reglas, 36 ajustes
predeterminados y nueve anomalías candidatas. Se han contrastado las cuatro
anomalías exigidas por el plan y se registran otras cinco encontradas al
seguir sus dependencias. No se aprueba ninguna desviación en esta entrega.

La reparación anterior está integrada en nightly mediante
[PR #1311](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1311),
squash e41f703c3a015321024766cc5da55d9a6def1bcb. El árbol coincide con el
candidato revisado 95a4b701; los
[gates posteriores de Windows](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35762895108)
y el [digest](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35762895165)
pasan. Esta es la base de T0a, no evidencia de paridad completa.

## Referencia y límites

- CrewChief: [commit fijo 4c3865e09a347d4c806c0bc0cd66aae335fbc610](https://gitlab.com/mr_belowski/CrewChiefV4/-/tree/4c3865e09a347d4c806c0bc0cd66aae335fbc610).
  Defaults confirmados por Isaac. La opción de volver a legacy es False y
  CrewChief.cs:342–352 selecciona Events/Timings.cs.
- [ledger.json](ledger.json) conserva los datos revisables: fuente y blob Git,
  SHA-256 del archivo y del rango de líneas, ajustes y consumidores, reglas,
  secuencias para reproducir y propuestas de decisión.
- Las lecturas salen de objetos Git, no del checkout. No se importan código,
  voces, frases, gramáticas ni catálogos CrewChief. Las descripciones son propias.
- Un rango verificado acredita procedencia, no la corrección de una interpretación.
  Las secuencias de anomalías son **recorridos estáticos por confirmar**:
  no se ha ejecutado CrewChief ni reproducido estos casos en LMU.
- No hay fixtures T0b, proveedor cloud, cambios de Go/TypeScript ni nuevas
  dependencias. Replay, voz online, fallback acústico y LMU permanecen NOT_RUN.

El ciclo del plan se aplica así: contraste previo de fuentes y defaults →
construcción del expediente y validador → segundo contraste contra los mismos
objetos y revisión independiente. Aquí el desarrollo es documental. El
validador no implementa los algoritmos Timings ni puede dar PASS al producto.

## Qué se ha fijado

Las esperas predeterminadas son **4 / 7 / 6 oportunidades** para delante,
detrás y detrás en pista, respectivamente. Tras resolver un callback, los
sorteos son [4,9), [7,12) y [6,11), antes del ajuste de mitad de vuelta.
Una oportunidad es un sector o un punto de pista admitido, no un segundo ni
cada frame. Los tres contadores avanzan incluso si se descarta una muestra
duplicada; el modo por vuelta sigue otra ruta.

La cola normal tiene prioridad CrewChief 5 y TTL de 5 segundos. La caducidad
usa una comparación estricta: igualdad con el instante límite no basta para
caducar. Las consultas usan prioridad predeterminada 5 en la cola inmediata,
tipo VOICE_COMMAND_RESPONSE y TTL0, que en esta fuente significa sin expiración.
El resumen por vuelta usa prioridad10/TTL5s y la lectura de curvas10/TTL2s.

Estas cifras no se trasladan como números de prioridad a Vantare: el contrato
aprobado exige P3 para rutina, P2 para consulta/resumen y precedencia de P0.
La revisión A5 es esencial: CrewChief resuelve una sola vez y puede consumir
cadencia aunque el mensaje se descarte. La vigencia al started y el consumo
solo al iniciar son requisitos de Vantare, no hechos confirmados del oráculo.

## Cobertura por regla

Los estados son del inventario T0a. «Inventariado» no significa implementado,
verificado en LMU ni libre de dependencias de datos. «Bloqueado por señal»
identifica conductas que requieren evidencia de contexto/catálogo; T0b hará
la clasificación completa observada/derivada/catálogo/ausente.

| ID | Conducta | Estado | Anomalías |
|---|---|---|---|
| TIM-REL | Relaciones de carrera y de pista | inventariado | — |
| TIM-SAMPLE | Puntos de muestreo | inventariado | — |
| TIM-STATE | Clasificación de historial | pendiente de decisión | A1, A2 |
| TIM-PRECISION | Precisión y realización por locale | pendiente de decisión | A6 |
| TIM-CADENCE | Contadores y sorteo | pendiente de decisión | A5 |
| TIM-SELECT | Arbitraje entre relaciones | pendiente de decisión | A1, A2, A3 |
| TIM-SILENCE | Contexto y controles de silencio | bloqueado por señal | A5 |
| TIM-END | Silencio cerca del final | pendiente de decisión | A5 |
| TIM-AUTO | Contenido automático y consejos | pendiente de decisión | A1, A2, A5, A7 |
| TIM-QUEUE | Cola, expiración y revalidación | pendiente de decisión | A5 |
| TIM-LAPPING | Aviso del candidato detrás en pista | pendiente de decisión | A3, A4, A5, A8 |
| TIM-LAPMODE | Resumen pedido por vuelta | pendiente de decisión | A5, A8 |
| TIM-QUERY | Consultas directas | inventariado | — |
| TIM-STATUS | Contribución a estado global | inventariado | — |
| TIM-CORNERS | Curvas y consultas de ventaja | bloqueado por señal | A7, A9 |

Cada fila JSON incluye condiciones, comportamiento, límites, secuencia
temporal, entradas semánticas, ajustes, cola y anomalías relacionadas.
Todas heredan los gates NOT_RUN y la política de no convertir missing en
false, green o cero. No se compara contra resultados de Vantare para producir
los esperados.

## Decisiones que debe revisar Isaac

Recomiendo preservar las reglas útiles del oráculo y corregir expresamente
los defectos de identidad, cancelación y consumo. Las recomendaciones
siguientes **siguen pendientes**; ninguna queda convertida en expected
implementable por aparecer en este documento.

| ID | Hallazgo y decisión propuesta |
|---|---|
| A1 | **Estado detrás anterior a la muestra actual**. Recomiendo definir estado con la muestra admitida actual en Vantare; hasta aprobación conservar ambos resultados documentados, sin implementar ni marcar paridad. |
| A2 | **Comprobación repetida de la primera identidad**. Recomiendo exigir todas las muestras del mismo rival y probar los resets reales; aprobar desviación únicamente con caso independiente que delimite cuándo afecta. |
| A3 | **Filtro de posición frente a rama de desdoblaje**. Recomiendo modelar doblaje/desdoblaje desde relación temporal demostrada; no añadir el aviso ni dar PASS hasta clasificar con fixture independiente. |
| A4 | **Repetición después de cinco minutos con clave existente**. Recomiendo actualizar timestamp existente y conservar intervalo estricto>5min. No copiar excepción; aprobar la diferencia antes de esperado implementable. |
| A5 | **Resolución única y consumo antes de sonido**. Recomiendo mantener el contrato aprobado de Vantare: revalidar al started y consumir solo al iniciar. Registrar la divergencia deliberada frente a fuente; la aceptación del diseño no sustituye clasificación de estos casos. |
| A6 | **Precisión seleccionada distinta de realización por locale**. Recomiendo definir realización numérica coherente por locale de Vantare y conservar estos casos como desviación explícita pendiente; primero confirmar con harness y pack propios. |
| A7 | **Consejo con landmark sin audio**. Recomiendo consejo solo con realización funcional disponible y consumo al started; dejar pendiente hasta disponer de catálogo/fixtures. |
| A8 | **Candidato ausente en callback o resumen por vuelta**. Recomiendo cancelación sin consumo cuando no existe candidato; clasificar con caso independiente antes de implementación. |
| A9 | **Midpoint retenido con telemetría congelada**. Recomiendo identificar cada cruce y consumirlo una vez con señales vigentes, además de limpiar el estado transitorio. Confirmar por harness antes de aprobar la desviación. |

Las cuatro primeras son las exigidas por §7. A5 desarrolla la anomalía de
callbacks vacíos ya exigida en TIM-QUEUE y añade el orden de descarte y la
resolución única. A6–A9 se incorporan por evidencia al seguir la fuente.
Los recorridos completos y controles negativos están descritos en el JSON;
su ejecución independiente pertenece al siguiente corte, después de esta
revisión. Si un caso no puede observarse desde LMU, se conservará esa
distinción frente al helper aislado.

No se decide copiar todas las peculiaridades del código ni corregirlas todas
por defecto. La decisión debe quedar por anomalía, con alcance y evidencia.
La aceptación previa del diseño y la integración de las reparaciones
conservan su validez; esta revisión se refiere a hallazgos concretos nuevos.

## Configuración y opciones

La tabla guarda los valores literales de Settings.settings del commit fijado.
Cada opción incluye en JSON su tipo, efecto, rango con hash y líneas de los
consumidores. Además, el validador extrae las lecturas directas de Timings.cs
para evitar omitir alguna. El inventario se limita a la conducta Timings y
sus dependencias de mapping, identidad, cola y realización; no cataloga los
ajustes de otras familias de la aplicación.

| Ajuste | Default | Efecto |
|---|---|---|
| revert_to_legacy_version_of_refactored_code | False | false elige Timings actual; true selecciona legacy y exige otro ledger. |
| frequency_of_gap_ahead_reports | 7 | 0 deshabilita delante; positivo usa 11-clamp(f,1,10). Default 7: espera inicial 4 y sorteos [4,9). |
| frequency_of_gap_behind_reports | 4 | 0 deshabilita detrás; default 4: inicial 7 y sorteos [7,12). |
| frequency_of_gap_behind_on_track_reports | 5 | 0 deshabilita candidato detrás en pista; default 5: inicial 6 y sorteos [6,11). |
| enable_gap_messages | True | false corta gaps automáticos y modo por vuelta; no corta lectura de curvas previa ni consultas. |
| gap_message_randomness | 5 | Se limita a 1..10; suma al mínimo para un máximo exclusivo. Default 5, no segundos. |
| just_the_facts | False | true suprime candidatos CLOSE de carrera y CLOSE del candidato cercano en pista; DECREASING conserva su elegibilidad. |
| always_report_time_in_hundredths | False | OR con timesInHundredths de la clase; no fuerza centésimas en gaps >=0,5 s no ovales. |
| realistic_mode | False | Puede importar enabledMessageTypes de la clase; NONE impide la cola regular. No condiciona el OR useHundredths en el código actual. |
| speak_only_when_spoken_to | False | Admisión limitada a VOICE_COMMAND_RESPONSE y SPOTTER; playEvenWhenSilenced no evita este filtro. |
| force_single_class | False | Cambia el agrupamiento y qué gaps de clase/cantidad de coches se usan. |
| enable_driver_names | True | Desactivado hace que MkOpponentShort recurra a número y luego posición para estas llamadas. |
| tts_setting_listprop | NEVER | NEVER por defecto; ANY_TIME y ONLY_WHEN_NECESSARY requieren voz apta. Cambia si el nombre es pronunciable. |
| opponents_number_after_name | True | No añade número a la variante Timings que pasa requestNumber=false; inventariada como opción compartida condicional. |
| enable_delayed_messages_on_hardparts | False | false por defecto. true retrasa despertar regular si velocidad>5, Green/Checkered, fuera de formación manual y en hard part. |
| allow_important_messages_even_when_silenced | False | false deja excepciones SPOTTER/VOICE_COMMAND_RESPONSE; true permite inmediatos. Ambos respetan playEvenWhenSilenced. |
| pause_between_messages | 0 | Segundos entre mensajes regulares después del primero; default 0. Afecta ventana, no contador por sector. |
| update_interval | 100 | Tick configurado 100 ms. QueuedMessage dueTime=0 con secondsDelay=0; el comentario de espera de un tick no corresponde al constructor actual. |
| priortise_messages_depending_on_situation | False | Ortografía exacta de la clave. true actualiza verbosidad por tráfico/final: mínimos FULL0/MED5/LOW10/SILENT20; prioridad5 no supera LOW. |
| reject_message_when_talking | False | Bloquea sonidos durante reconocimiento/hold según modo de voz; puede ocurrir después de resolver el mensaje. |
| sre_respond_while_channel_still_open | False | Modifica la excepción al bloqueo por voz; fijar estado listening/hold en el futuro replay. |
| pace_notes_mute_all_messages | True | Cuando hay pacenotes en reproducción/grabación, impide encolar otros mensajes regulares. |
| interrupt_setting_listprop | SPOTTER_MESSAGES | NEVER, SPOTTER_MESSAGES, CRITICAL_MESSAGES o IMPORTANT_MESSAGES; umbral SoundType, distinto de prioridad numérica. |
| insert_beep_out_between_spotter_and_chief | False | Inserción de beep entre voces distintas; duración depende del pack, no medida aquí. |
| insert_beep_in_between_spotter_and_chief | True | Inserción de beep al alternar voces; requiere registrar pack y voces para acústica. |
| enable_radio_beeps | True | Afecta apertura/cierre audible, no se fija latencia física desde este valor. |
| use_alternate_beeps | True | Variante de beep del Spotter y del Engineer según pack. |
| use_naudio | True | Backend NAudio por defecto; variar exige volver a comprobar interrupción y latencia. |
| naudio_output_interface_listprop | WAVEOUT | WAVEOUT por defecto. Inventario de transporte, sin medida de audio real. |
| chief_name | Jim (default) | Identidad del pack de Engineer; la versión instalada se desconoce en este inventario de fuente. |
| spotter_name | Jim (default) | Identidad de Spotter influye en beeps y alternancia de voz. |
| cache_sounds | True | Cache del pack; no permite deducir tiempo al primer sonido. |
| enable_breath_in | True | Inserción condicionada a asset disponible; registrar en futura sesión acústica. |
| enable_lmu_pit_lane_approach_heuristics | False | Candidato de mapping de aproximación a pits; no sustituye InLap del rival ni intención confirmada del piloto. |
| enable_lmu_pit_state_during_fcy | False | Selecciona detalle de fases de pits en FCY; no equivale a banderas Vantare verificadas. |
| auto_is_oval | False | Heurística de definición de pista; el perfil LMU debe fijar isOval en su catálogo, sin confiar en un comentario. |

Controles dinámicos: el modo por vuelta, quiet y mute comienzan desactivados;
la preferencia interna por mitad de vuelta comienza activada. Comandos
TELL_ME_THE_GAPS, DONT_TELL_ME_THE_GAPS, PLAY_CORNER_NAMES, KEEP_QUIET y
formación manual cambian estado. KEEP_ME_INFORMED recupera la conversación;
DONT_TALK_IN_THE_CORNERS y TALK_TO_ME_ANYWHERE también cambian los puntos de
muestreo si ya hay hard parts mapeados: aplican los ajustados o restauran los
iniciales, respectivamente. Las consultas directas, STATUS y
SESSION_STATUS tienen sus propios caminos. Los dos comandos de reputación
NOTE_BAD_DRIVER_* se inventarían como no aplicables a LMU por su guard
Game.IRACING; no se importan sus frases.

Faltan parámetros de una sesión concreta y no se inventan: clase y
timesInHundredths, catálogo de pista y hard parts, snapshot e historial de
señales, locale/versión del pack instalado, disponibilidad de nombre/curva,
estado de reconocimiento de voz y hardware de audio efectivo. Los defaults
de aplicación por sí solos no fijan esos valores. T0b fijará perfiles
sintéticos completos y la taxonomía de cada entrada; la prueba acústica
posterior fijará pack/voz/backend reales.

## Precisión por locale

AUTO_GAPS selecciona segundos si gap>10; en no oval selecciona centésimas
solo con useHundredths y gap<0,5; en los demás casos selecciona décimas.
La asignación de clase es un OR con always_report_time_in_hundredths,
independiente de realistic_mode en el código actual.

La realización no es universal: EN con pack>106 dispone de una ruta compacta;
IT usa It/It2 según pack150 y PT-BR su lector propio. Para AUTO_GAPS, estas
rutas largas de IT/PT-BR usan décimas aunque el selector pida centésimas o
segundos. ES cae en el lector En en esta factory. El ledger registra
0,46s y 10,6s como casos para demostrar A6, sin afirmar haber escuchado el
resultado. Redondeo de fracciones, acarreo >949ms y versión del pack se
comprobarán por separado; no basta validar el enum Precision.

## Reproducción de la comprobación documental

Se necesita Python3 estándar y un repositorio Git con los objetos del commit
de referencia. El validador no descarga ni modifica archivos de CrewChief
ni requiere un checkout. En clones parciales, Git puede obtener blobs
faltantes desde su remoto al leerlos.

Desde la raíz del repositorio Vantare:

~~~sh
python3 vantare-v2/docs/analysis/engineer/timings/validate.py \
  --crewchief-repo /ruta/al/repositorio/CrewChiefV4 --self-test
~~~

El resultado esperado de este candidato es:

~~~text
PASS documental: 15 reglas, 23 fuentes, 36 opciones, 9 anomalías; 11 controles negativos.
Paridad/replay/voz/LMU: NOT_RUN.
~~~

Comprueba commit, rutas y blobs de las 23 fuentes, hashes de rangos,
quince IDs obligatorios, opciones/defaults/consumidores, comandos Timings,
enlaces de anomalías, estados documentales y ausencia de PASS no ejecutados.
Rechaza once alteraciones: regla ausente o duplicada, fuente ausente, blob
falso, rango desplazado, default falso, opción ausente, anomalía autoaprobada,
LMU PASS sin evidencia, comando ausente y control común ausente.

No demuestra la veracidad semántica de toda la prosa, un catálogo instalado,
disponibilidad de señales Vantare, latencia acústica ni el comportamiento
dinámico del binario CrewChief. Esa separación evita confundir integridad
documental con paridad.

## Fuentes

| Fuente | Blob Git |
|---|---|
| [CrewChiefV4/Events/Timings.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/Events/Timings.cs) | caf01d9ad60e967ff514dee717a3a118bcf5df44 |
| [CrewChiefV4/Events/AbstractEvent.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/Events/AbstractEvent.cs) | fbee13e34af107bc1570cd162cfafe4dbb96dc0b |
| [CrewChiefV4/GameState/GameStateMapper.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/GameState/GameStateMapper.cs) | b06b77d086b35081dab6c9cd0140389202f69e87 |
| [CrewChiefV4/GameState/GameStateData.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/GameState/GameStateData.cs) | 92ba977a10f045e2e2f34e04fd070ce87d04f7f4 |
| [CrewChiefV4/RF2/RF2GameStateMapper.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/RF2/RF2GameStateMapper.cs) | c0acc5c9878b52ea202e95361a64faae2658eeda |
| [CrewChiefV4/TrackData/TrackData.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/TrackData/TrackData.cs) | ff67335461c176bd32d059354a74df4f39ce9661 |
| [CrewChiefV4/Events/Opponents.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/Events/Opponents.cs) | 53483d43fb73276848b830cc061068f5b622d016 |
| [CrewChiefV4/Events/OpponentMessages.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/Events/OpponentMessages.cs) | fb48a3c9fb18683afcba8d110becac8b171880db |
| [CrewChiefV4/Events/CommonActions.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/Events/CommonActions.cs) | 5bb90a0236f34d38bafae729b2bb04b34b8fdb1b |
| [CrewChiefV4/QueuedMessage.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/QueuedMessage.cs) | f282bd915d8fd66478e12fc6a386dc6088bf469e |
| [CrewChiefV4/Audio/AudioPlayer.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/Audio/AudioPlayer.cs) | e109dbd71e953417dcb77ae4bc62d82f73751ff1 |
| [CrewChiefV4/Audio/PlaybackModerator.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/Audio/PlaybackModerator.cs) | c6f1c9ef2487a0138cee37d0ae40391b2fa4eb56 |
| [CrewChiefV4/Audio/SoundMetadata.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/Audio/SoundMetadata.cs) | f6f6fdca65d9d7a1cba4f7e0bd52fd07a94f5563 |
| [CrewChiefV4/GameState/GlobalBehaviourSettings.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/GameState/GlobalBehaviourSettings.cs) | a3b15a8cc8d081e7d3259b18754d59ea72133c8a |
| [CrewChiefV4/NumberProcessing/TimeSpanWrapper.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/NumberProcessing/TimeSpanWrapper.cs) | 9d027f82ebc837373e8141a66c28834b1446bfef |
| [CrewChiefV4/NumberProcessing/NumberReader.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/NumberProcessing/NumberReader.cs) | cef98e5b85141a0c214e3c23210b654f88b16b9f |
| [CrewChiefV4/NumberProcessing/NumberReaderFactory.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/NumberProcessing/NumberReaderFactory.cs) | c467d1c9951bd2346e9cd7436fa4c7c754171bba |
| [CrewChiefV4/NumberReaderEn.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/NumberReaderEn.cs) | 501205668a08db1ab4583fb749fc14ae845a2e03 |
| [CrewChiefV4/NumberReaderIt.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/NumberReaderIt.cs) | f9b4c2a75b98a012d8de36dc28e74a52ef99e705 |
| [CrewChiefV4/NumberReaderIt2.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/NumberReaderIt2.cs) | 59df94b4ebd16f881b4c6e082e303780e73048a3 |
| [CrewChiefV4/NumberReaderPtBr.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/NumberReaderPtBr.cs) | 7fb2a8ed913b45eab22401cb57ebe6c03328a041 |
| [CrewChiefV4/Properties/Settings.settings](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/Properties/Settings.settings) | 13b19f78217111a8d2bbf4d7bbfbd340b68dc530 |
| [CrewChiefV4/CrewChief.cs](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/4c3865e09a347d4c806c0bc0cd66aae335fbc610/CrewChiefV4/CrewChief.cs) | 29e5ae8d4761add73c6315918bf428bf3dd15c85 |

En ledger.json, cada ancla contiene source/start/end/sha256 y cada archivo
path/blob/sha256/lines. Los rangos son inclusivos y el hash usa los bytes
originales con sus terminadores de línea. El validador siempre lee el SHA
fijado; cambios locales de audio o de código en otro checkout no alteran la
evidencia.

## Siguiente puerta

Revisión independiente del 22 de septiembre: PASS acotado del expediente y
validador, sin P1/P2 pendientes tras corregir los controles comunes, el alcance
de A7/A8 y el midpoint A9. SHA-256 del ledger revisado:
e0758d2aaa9b753ba5de1d80d31e1bf4e3e93aa5fe312af5a56bf8308e097f79.
La revisión no ejecutó CrewChief ni aprobó desviaciones.

Según [PLAN T0a](../../../engineer/PLAN.md), Isaac revisa el ledger y la
clasificación de anomalías antes de T0b. Después se crean fixtures
independientes con reloj virtual y elecciones PRNG registradas, y se demuestra
la taxonomía de señales. Hasta entonces, T0b y T1 permanecen sin iniciar.
