# Diseño — Persona y estilo nativo del Engineer

- Fecha: 2026-09-20
- Estado: diseño y redacción aprobados para primeras pruebas; no implementado
- Alcance: redacción online no factual, estilo por locale y fallback canónico
- Depende de: [paridad observable CrewChief LMU](2026-09-19-crewchief-lmu-parity-design.md)
- Ejecución: [VAN-732 · plan Timings y voz LLM](../engineer/PLAN.md)

## 1. Decisión

El Engineer empieza con la persona `calm_race_engineer`: breve, calmada,
precisa y operacional. Peter “Bono” Bonnington sirve como referencia abstracta
de serenidad y autoridad técnica, no como identidad, voz o repertorio que deba
imitarse.

La personalidad no se implementa como un system prompt monolítico. Se separa
en cinco piezas versionadas:

1. `CorePolicy`: autoridad, seguridad y esquema comunes a todas las personas.
2. `PersonaProfile`: carácter, densidad y actos discursivos permitidos.
3. `LocaleStylePack`: uso nativo del idioma, escrito en ese idioma.
4. `StyleCapsule`: compilación pequeña de persona más locale para el prompt.
5. `StyleGate`: admisión local, no generativa y fail-closed antes de TTS/widget.

Los hechos continúan en cláusulas inmutables de `FactBundle`. Persona y estilo
sólo gobiernan introducción, transición, contextualización y orden permitido
de bloques independientes mediante `UtterancePlan`.

```text
Telemetry Core -> FactBundle -> realizador factual nativo
                              -> cláusulas protegidas

PersonaProfile + LocaleStylePack -> StyleCapsule
consulta + cápsula + factRefs     -> LLM -> UtterancePlan
UtterancePlan + cláusulas         -> StyleGate -> TTS/widget
                                          \-> fallback canónico
```

## 2. Contrato de contexto

Las primeras pruebas usan un modelo cloud con ventana mínima de 8K. Esa
capacidad es margen, no autorización para inflar cada petición.

| Componente | Presupuesto inicial de entrada |
|---|---:|
| `CorePolicy` | 300–450 tokens |
| herramientas y esquema activos | 400–700 tokens |
| `PersonaProfile` + `StyleCapsule` | máximo 350 tokens |
| consulta y hechos del turno | 150–350 tokens |
| memoria estructurada opcional | máximo 200 tokens |
| total habitual | objetivo inferior a 2.000 tokens |
| total de entrada | máximo 3.000 tokens |

El máximo de 3.000 incluye mensajes de sistema/aplicación, herramientas
expuestas, esquema, estilo, consulta, hechos y memoria que controla Vantare.
Se registra el conteo real por bloque. Overhead opaco del proveedor se informa
aparte cuando sea observable.

Si la entrada excede el presupuesto se eliminan, por este orden, memoria
opcional, ejemplos opcionales y herramientas ajenas al turno. Nunca se recortan
CorePolicy, hechos obligatorios, esquema o StyleCapsule a mitad. Si aun así no
cabe, no se llama al LLM y sale la composición canónica.

El corpus de estilo, listas extensas, documentación y conversación bruta nunca
se copian al prompt. La sesión conserva sólo memoria tipada acotada; no añade el
historial completo. Sólo se exponen las herramientas necesarias para el turno.
El prefijo estable puede usar prompt caching para coste/latencia, pero el caché
no cambia estos límites ni las obligaciones de privacidad.

## 3. Salida sin límite estilístico de tokens

Vantare no fija un máximo de tokens, palabras, caracteres, frases o segmentos
para conseguir brevedad. No se usa `max_output_tokens` como control editorial.
La brevedad se obtiene mediante CorePolicy, PersonaProfile, StyleCapsule,
ejemplos de evaluación y las normas de StyleGate. El sistema no trunca texto ni
audio para hacerlo parecer breve.

Esto no significa salida físicamente infinita. Siguen existiendo la ventana y
los límites inevitables del proveedor, el deadline absoluto del job, TTL,
cancelación y P0. No se amplían para dejar terminar una respuesta larga. Si el
modelo no entrega un `UtterancePlan` completo y válido dentro del deadline, o
el proveedor termina por longitud, el resultado entero se descarta y se usa el
fallback canónico. Nunca se reproduce JSON, frase o audio truncado.

Las pruebas registran tokens de salida p50/p95/máximo, duración audible,
finish reason y tasa de fallback como observaciones. No convierten un número de
tokens en el mecanismo de estilo ni en una cuota silenciosa de producto.

## 4. Persona inicial

`calm_race_engineer@1` declara:

- calma bajo presión y autoridad sin dramatismo;
- dato primero y contexto sólo cuando ayuda a actuar o comprender;
- frases directas, vocabulario de competición y ritmo de radio;
- corrección firme sin agresividad, paternalismo ni burla;
- celebración reservada para eventos realmente excepcionales;
- cero memes, sarcasmo, épica, coaching vacío o entusiasmo automático;
- cero imitación de voces, muletillas o frases reconocibles de personas reales.

“Breve” es una regla editorial, no una cifra de tokens. El modelo debe evitar
repetición, prólogos, recapitulaciones y cierres sociales innecesarios. Una
consulta compleja puede necesitar una respuesta más larga que una alarma; no
se mutila para cumplir una cuota uniforme.

## 5. StylePack nativo por locale

Cada uno de `es`, `en`, `it` y `pt-BR` se escribe y revisa originalmente en su
idioma. No existe un texto maestro inglés que se traduzca en runtime o durante
la autoría. Se comparte semántica, no sintaxis.

Cada `LocaleStylePack` contiene:

- terminología de automovilismo y simracing admitida;
- orden natural para gaps, vueltas, posiciones, tendencias y disponibilidad;
- registro, tratamiento, elipsis y abreviaciones normales en radio;
- anglicismos realmente usados y calcos impropios que deben rechazarse;
- actos discursivos permitidos por tipo de consulta;
- ejemplos positivos y negativos escritos por nativos;
- patrones memeables, grandilocuentes, artificiales o demasiado literales;
- realizaciones canónicas usadas también por el fallback offline.

El compilador produce una `StyleCapsule` pequeña y con hash. El corpus completo
permanece en evaluación, no en producción. Cambiar persona, pack, compilador,
cápsula, prompt o modelo invalida el gate de estilo de esa combinación.

## 6. StyleGate inicial

La primera versión es local y no generativa. No usa otro LLM como juez. Opera
después de validar esquema/factRefs y antes de TTS/widget.

Comprueba como mínimo:

- locale y escritura esperados;
- ausencia de SSML, controles, URLs, emojis y delimitadores externos;
- que discurso y cláusulas protegidas no formen negaciones o modificadores;
- terminología prohibida, calcos conocidos y cambio de idioma;
- bromas, sarcasmo, épica, felicitación rutinaria y coaching vacío;
- prólogos, repetición, recapitulación y cierres sin función;
- actos discursivos incompatibles con la consulta o la prioridad;
- inyección procedente de consulta, nombre o tool result.

Devuelve `accepted`, `rejected` o `uncertain`. Los dos últimos eliminan el
discurso y el orden propuesto; sale el FactBundle canónico. StyleGate no edita,
resume ni trunca el texto del modelo. Si las reglas deterministas no alcanzan
el objetivo, una segunda prueba puede añadir un clasificador local pequeño y
no generativo, versionado detrás del mismo contrato. No se presupone necesario
ni se incorpora un LLM local.

## 7. Personalidades futuras

Una personalidad nueva es otro `PersonaProfile`, no un prompt libre pegado por
encima. Debe declarar su relación con cada LocaleStylePack, superar el mismo
contrato factual y tener corpus/evidencia propios. La voz TTS se selecciona en
otra capa: personalidad textual, voz e identidad real no son equivalentes.

Una persona no puede relajar privacidad, hechos, acciones, confirmaciones,
prioridad, deadlines o fallback. Si un locale no tiene adaptación nativa para
esa persona, se usa `calm_race_engineer` o el compositor canónico; nunca se
traduce automáticamente el pack de otro idioma.

## 8. Gate de las primeras pruebas

El corpus cruza consultas simples/compuestas, mensajes automáticos no críticos
y los cuatro locales. Incluye traducciones literales deliberadamente malas,
anglicismos, tono memeable, exceso de entusiasmo, condescendencia, reiteración,
sarcasmo, instrucciones camufladas y respuestas largas pero justificadas.

La evidencia combina:

- invariantes estructurales y factualidad del diseño principal;
- revisión ciega por hablantes nativos con vocabulario de competición;
- naturalidad, claridad, calma, utilidad y adecuación a radio;
- detección separada de “correcto pero parece traducido” y “memeable”;
- tokens reales de entrada por bloque y distribución observada de salida;
- latencia, duración audible, rechazos, incertidumbre y fallback;
- comparación con el compositor canónico, sin usarlo como juez automático.

No hay PASS porque una media sea aceptable si aparece una frase factual
alterada, una acción sugerida, una salida truncada o un caso claramente
memeable. Los umbrales numéricos del panel se fijan con el primer corpus
calibrado; hasta entonces los resultados son experimentales y no habilitan
producción.

## 9. Secuencia de implementación posterior a revisión

1. Contratos y compilador de `PersonaProfile`/`LocaleStylePack`.
2. `calm_race_engineer@1` y cápsula `es` nativa.
3. Prompt builder con desglose y límite de entrada.
4. StyleGate determinista y fallback fail-closed.
5. Harness/corpus de estilo español y revisión humana.
6. Repetición independiente para `en`, `it` y `pt-BR`.
7. Sólo con evidencia, experimento opcional del clasificador no generativo.

Esta secuencia no es aún un PLAN.md ejecutable. Primero debe revisarse esta
spec escrita; después se divide en cortes verticales pequeños dentro de Timings.
