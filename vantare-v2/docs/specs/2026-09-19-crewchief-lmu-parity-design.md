# Diseño — Paridad observable CrewChief para Engineer LMU

- Fecha: 2026-09-19
- Estado: aprobado por Isaac durante la revisión de paridad
- Base Vantare: `origin/nightly@8a0620e8abe75914efed41de4117490f3e47a3b4`
- Oráculo inicial CrewChief: `mr_belowski/CrewChiefV4@4c3865e09a347d4c806c0bc0cd66aae335fbc610`

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

Cuando LMU no exponga una señal imprescindible, el caso se marca `bloqueado
por señal`; no se sustituye por una heurística silenciosa. Cualquier desviación
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
| 13 | Coaching secundario | Ataque/defensa por curva, motivación y mensajes no críticos. |

El número indica orden de cierre, no aislamiento técnico. La interacción por
voz empieza en Timings y crece con cada nueva sección.

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

El LLM puede producir variaciones ilimitadas, pero cada respuesta declara los
hechos usados. El validador rechaza números, nombres, posiciones, relaciones o
acciones que no estén autorizados por los resultados de herramientas vigentes.

Los mensajes automáticos no críticos pueden usar el mismo camino. Su trigger,
semántica, prioridad y caducidad llegan cerrados desde el motor de la feature;
el LLM sólo redacta.

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

### 6.5 Conversación y acciones

La memoria es corta, efímera y está ligada a sesión, piloto, fuente y epoch.
Cambiar cualquiera invalida la conversación y las propuestas pendientes. No
se persisten audio ni transcripciones por defecto.

Las acciones siguen obligatoriamente:

```text
propuesta -> readback -> confirmación -> ejecución idempotente -> verificación
```

El LLM puede formular cada turno, pero el estado y las transiciones pertenecen
al router determinista. Una acción nunca se deriva del texto generado.

### 6.6 Presupuestos iniciales

- feedback audible de recepción: máximo 150 ms;
- inicio de respuesta interactiva: objetivo 1,5 s desde fin de habla;
- timeout generativo interactivo: 2,5 s, seguido de fallback;
- timeout generativo automático no crítico: 750 ms;
- carril crítico local: independiente de todos los anteriores.

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
- replay y evidencia LMU.

Ejemplo conceptual:

```text
TIM-AUTO-017
Contexto: carrera, P4, mismo rival delante durante tres sectores,
          gaps 2,4 -> 2,1 -> 1,8 s, sin banderas ni boxes.
Esperado: anuncia que el piloto recorta al rival, comunica el gap actual,
          no anuncia simultáneamente detrás y usa prioridad normal.
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

## 8. Primer corte: Timings

### T0 — Oráculo

Inventariar `Events/Timings.cs`, sus dependencias observables, defaults,
comandos, silencios, revalidaciones y casos límite. Toda opción se documenta
aunque inicialmente sólo se implemente el default.

### T1 — Relaciones de carrera

Producir relaciones estables y tipadas para:

- líder de clase;
- rival de clase inmediatamente delante;
- rival de clase inmediatamente detrás;
- coche inmediatamente delante en pista;
- coche inmediatamente detrás en pista;
- diferencia temporal y de vueltas.

Cada relación incluye ID del vehículo, nombre/clase cuando sean utilizables,
calidad, freshness, sesión y epoch. No se infiere identidad mediante el valor
del gap.

### T2 — Muestreo

Mantener historial separado por relación e ID de rival. Muestrear en cambio de
sector o gap point equivalente. Cambiar rival, sesión o epoch reinicia su
historia y evita atribuir una tendencia al coche incorrecto.

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
- selección de una sola relación, favoreciendo el gap menor;
- prioridad de un coche que dobla o se desdobla;
- supresión durante formación, neutralización, bandera relevante, pit lane,
  vuelta de entrada y final inmediato de carrera;
- revalidación justo antes de empezar el audio.

### T5 — Mensajes automáticos

Emitir hechos semánticos para:

- gap actual delante y detrás;
- rival acercándose o alejándose;
- piloto recortando;
- presión sostenida;
- retención sostenida;
- doblaje/desdoblaje.

El online genera redacción natural. El offline compone una frase canónica. En
ambos casos se conservan dirección, valor, rival/contexto y tendencia
obligatorios. Se elimina como salida final cualquier aviso equivalente a
“Diferencias actualizadas” sin datos.

### T6 — Consultas

Herramientas y fallback cubrirán:

- gap delante en carrera;
- gap detrás en carrera;
- coche delante en pista;
- coche detrás en pista;
- gap al líder;
- vuelta del líder;
- punto donde se gana o pierde tiempo cuando exista evidencia de landmarks.

Leading, last, sin rival, diferencia de vueltas, dato missing y dato stale
tienen respuestas explícitas y no reutilizan un cero ambiguo.

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

### T8 — Cierre

Timings exige:

- todos los escenarios default en replay;
- respuesta generativa validada;
- el mismo escenario resuelto offline;
- sesión LMU con cambio de rival, presión, adelantamiento, boxes, amarilla y
  final de carrera;
- evidencia de latencia y ausencia de mensajes obsoletos;
- documentación actualizada del ledger.

## 9. Datos y extensiones de telemetría

La proyección Engineer actual ya contiene parrilla completa, IDs, nombres,
clases, posición, vueltas, sector, distancia, gaps y posición espacial. Esto es
suficiente para iniciar T1-T3.

Telemetry Core contiene amarilla global, pero la proyección Engineer debe
exponerla con calidad y freshness. Fase de carrera, amarilla local, azul, gap
points y landmarks requieren inventario y, donde LMU los exponga de forma
fiable, una extensión canónica. La falta de estas señales no bloquea la
relación básica ni los mensajes numéricos; bloquea únicamente los escenarios
que las necesitan.

No se reintroducirá `telemetry.Frame` legacy ni un segundo lector LMU.

## 10. Fallos y degradación

- Dato missing/stale: silencio o respuesta explícita de indisponibilidad.
- Cambio de rival/contexto antes de `started`: cancelar el mensaje.
- Cambio después de `started`: terminar de forma segura; el siguiente ciclo
  usa el nuevo contexto.
- LLM/TTS inválido o lento: fallback offline sin consumir el hecho.
- STT ambiguo: pedir aclaración; nunca elegir una acción por proximidad textual.
- Pérdida de red: abrir circuito, evitar reintentos por cada frame y mantener
  funcionalidad offline.
- Falta de phrase pack: salida visual y diagnóstico; no sintetizar un hecho.
- Señal LMU no demostrable: caso bloqueado, sin proxy oculto.

## 11. Criterio de transición entre secciones

No se empieza el cierre de la siguiente sección mientras Timings no haya
alcanzado `paridad cerrada`, incluido `LMU PASS`. El gate LMU puede descubrir
correcciones y obliga a resolverlas antes de ampliar superficie.

Tras Timings, el orden es Spotter, banderas/neutralizaciones, vueltas/ritmo,
rivales/multiclass y el resto del mapa de la sección 5. Cada sección reutiliza
el registro de herramientas, el ledger y ambos caminos de voz.

## 12. Resultado esperado

El proyecto deja de medir paridad por presencia de código. Cada capacidad pasa
a tener una referencia observable, una implementación activa, voz generativa
segura, fallback offline y dos gates de evidencia. Timings será la primera
prueba de que la arquitectura sirve al piloto y no sólo al transporte interno.
