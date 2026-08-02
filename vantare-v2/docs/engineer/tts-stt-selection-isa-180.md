# ISA-180 / ENG-09 — gate TTS/STT offline

Fecha de corte: 2026-08-02. Tipo: investigación técnica y de licencias.
Ámbito: Windows 10/11, ejecución completamente offline, español internacional,
inglés internacional, italiano y portugués brasileño. Esta es una decisión de
ingeniería, no asesoramiento jurídico.

## Resultado ejecutivo

ENG-09 no autoriza todavía un motor TTS productivo. El modelo Kokoro y sus
voces tienen una licencia permisiva, pero la ruta Python/ONNX probada incorpora
una cadena G2P GPL y necesita entre 4,0 y 5,3 segundos para producir mensajes
de aproximadamente dos segundos en el equipo de referencia. DirectML falló
tanto con el modelo int8 como con fp16 en la Radeon RX 7800 XT. Esta combinación
es **NO-GO** para distribución propietaria y para voz dinámica en carrera. Los
subtítulos y el widget de radio de ENG-08 siguen siendo el fallback completo.

`whisper.cpp` más el modelo Whisper multilingüe es la única ruta que supera el
gate de licencia y rendimiento preliminar. El servidor residente respondió en
0,58–0,75 s para las muestras cortas, con unos 173–176 MB observados. Sin
embargo, solo inglés produjo una transcripción literal limpia. Español,
italiano y portugués conservaron el sentido, pero el corpus sintético de una
frase por idioma no permite afirmar calidad. Por ello el STT queda
**GO técnico condicionado**, no GO de release.

La conclusión no debilita la beta. Mientras TTS o STT no estén aprobados, el
producto mantiene presentación visual, subtítulos, radio y controles UI. No
se inventa disponibilidad de voz y el Spotter nunca espera a una inferencia.

## Estado heredado de Vantare

`internal/tts/kokoro.go` describe por defecto un servicio REST local en el
puerto 8880 y una alternativa Python. Ninguna forma es un paquete offline
autocontenido de Vantare. Además, su selección de idioma solo trata inglés y
español. `internal/tts/engine.go` serializa toda síntesis bajo un único mutex,
por lo que conectarlo al camino productivo convertiría una llamada lenta en un
cuello de botella global. Estos archivos no tienen consumidor productivo; el
router de ENG-06 sigue siendo cache-only. El corte no los reescribe porque su
retirada o reemplazo pertenece al siguiente microcorte con test de consumidores.

## Evidencia primaria

### Kokoro y G2P

El repositorio oficial de `kokoro-onnx` declara MIT para el wrapper y
Apache-2.0 para el modelo, y documenta el modelo cuantizado como una alternativa
de unos 80 MB. [kokoro-onnx / GitHub](https://github.com/thewh1teagle/kokoro-onnx)
(accessed 2026-08-02, confidence: Medium). El modelo oficial Kokoro-82M también
declara Apache-2.0 y su catálogo contiene voces españolas, italianas, inglesas
y portuguesas; el propio catálogo advierte que el soporte no inglés y las
frases muy cortas pueden ser débiles.
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
(accessed 2026-08-02, confidence: Medium) y
[VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)
(accessed 2026-08-02, confidence: Medium).

La distribución probada de `kokoro-onnx==0.5.0` instala
`phonemizer-fork==3.3.2` y `espeakng-loader==0.2.4`. El primero instala una
licencia GPL-3.0 y el segundo carga eSpeak NG; eSpeak NG declara GPL-3.0-or-later.
[phonemizer license](https://github.com/bootphon/phonemizer/blob/master/LICENSE)
(accessed 2026-08-02, confidence: Medium) y
[eSpeak NG](https://github.com/espeak-ng/espeak-ng)
(accessed 2026-08-02, confidence: Medium). El README de Misaki deja explícito
que su fallback para palabras no conocidas usa eSpeak/phonemizer, aunque
Misaki sea Apache-2.0.
[Misaki](https://github.com/hexgrad/misaki)
(accessed 2026-08-02, confidence: Medium).

Esto no significa que Kokoro sea incompatible por naturaleza. Significa que
**la pila exacta medida no puede incluirse en el bundle propietario de
Vantare** sin resolver antes la capa G2P y someter el paquete final a revisión
legal. Una futura ruta permisiva podría usar un G2P propio o una cadena con
licencias verificadas, pero no se presupone que exista.

### Whisper

OpenAI publica tanto el código como los pesos de Whisper bajo MIT.
[OpenAI Whisper LICENSE](https://github.com/openai/whisper/blob/main/LICENSE)
(accessed 2026-08-02, confidence: Medium). `whisper.cpp` también es MIT, funciona
en Windows y CPU, soporta cuantización y documenta 75 MiB en disco y unos
273 MB de memoria para `tiny`; los modelos sin sufijo `.en` son multilingües.
[whisper.cpp](https://github.com/ggml-org/whisper.cpp)
(accessed 2026-08-02, confidence: Medium) y
[model inventory](https://github.com/ggml-org/whisper.cpp/tree/master/models)
(accessed 2026-08-02, confidence: Medium). El corte probó la release publicada
v1.9.1 y calculó SHA-256 propios para binario y modelo.

### Vosk y sherpa-onnx

Vosk es Apache-2.0 y ofrece modelos pequeños offline para los cuatro idiomas.
Su tabla oficial publica modelos de 31–48 MB para inglés, español, italiano y
portugués. El modelo portugués pequeño muestra una tasa de error oficial mucho
peor que las otras rutas y no se acepta sin corpus propio.
[Vosk API](https://github.com/alphacep/vosk-api)
(accessed 2026-08-02, confidence: Medium) y
[Vosk models](https://alphacephei.com/vosk/models)
(accessed 2026-08-02, confidence: Medium).

`sherpa-onnx` es Apache-2.0, soporta ejecución offline y Windows, pero su paquete
Kokoro documentado cubre actualmente inglés y chino, no el conjunto obligatorio
de Vantare. Cada modelo y tokenizer debe auditarse aparte del runtime.
[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)
(accessed 2026-08-02, confidence: Medium) y
[Kokoro packages](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html)
(accessed 2026-08-02, confidence: Medium).

### Piper y voces del sistema

La implementación actual mantenida de Piper está publicada como GPL-3.0 y las
voces deben auditarse individualmente. No se acepta como dependencia de un
bundle propietario.
[OHF Piper](https://github.com/OHF-Voice/piper1-gpl)
(accessed 2026-08-02, confidence: Medium). Las voces SAPI instaladas en el
equipo de prueba cubrían inglés y español, pero no italiano ni portugués. SAPI
puede ser un fallback opcional del sistema, no la base de cuatro idiomas.

## Matriz de decisión

| Candidato | Licencia de la ruta completa | Cuatro idiomas | Medición local | Veredicto |
|---|---|---:|---|---|
| Kokoro ONNX Python CPU | Wrapper/modelo permisivos; G2P GPL | Sí, técnicamente | 4,0–5,3 s por frase; ~284–335 MB | **NO-GO dinámico y NO-GO de bundle** |
| Kokoro ONNX DirectML | Misma cadena GPL | Sí, en catálogo | Error `ConvTranspose` en int8 y fp16 | **NO-GO** |
| Kokoro con futura ruta G2P permisiva | Pendiente inventario completo | Potencial | No medido | **CONDICIONAL, no implementable aún** |
| Windows SAPI | Componente del sistema; no se redistribuye voz | No garantizado | Solo en/es instalados | **Fallback opcional** |
| whisper.cpp + Whisper tiny multilingual | MIT + MIT | Sí | ~0,60 s; ~173–176 MB | **GO técnico condicionado** |
| Vosk + modelos pequeños | Apache-2.0; modelo por modelo | Sí | No medido en este corte | **Candidato secundario** |
| sherpa-onnx | Runtime Apache-2.0; modelos separados | STT sí; TTS Kokoro no | No medido | **Candidato de integración, no selección** |
| Piper | GPL-3.0 y voces variables | Sí | No medido | **NO-GO de bundle** |

La matriz completa por capa está en
[`license-inventory.json`](../evidence/isa-180/license-inventory.json). Ningún
`PASS_LAYER_ONLY` autoriza por sí solo el producto completo.

## GO/NO-GO por idioma

| Idioma | TTS dinámico | STT Whisper tiny | Fallback aprobado |
|---|---|---|---|
| Inglés internacional | NO-GO hasta resolver G2P, latencia y escucha | GO técnico condicionado; 0 WER sintético | Texto, subtítulos, radio y UI |
| Español internacional | NO-GO hasta resolver G2P, latencia y escucha | NO-GO release; 0,4286 WER sintético | Texto, subtítulos, radio y UI |
| Italiano | NO-GO hasta resolver G2P, latencia y escucha | NO-GO release; 0,5 WER sintético | Texto, subtítulos, radio y UI |
| Portugués brasileño | NO-GO hasta resolver G2P, latencia y escucha | NO-GO release; 0,3333 WER sintético | Texto, subtítulos, radio y UI |

Los WER altos no demuestran que Whisper sea incapaz: solo prueban que una
frase sintética no basta para autorizar comandos. El siguiente gate debe usar
voces humanas, ruido de motor, micrófonos distintos y el catálogo real de
intenciones. No se seleccionará un modelo mayor por intuición; se comparará
`tiny`, `base` y, si hace falta, un modelo de comandos permisivo con la misma
matriz.

## Arquitectura mínima aprobada

La arquitectura no crea una jerarquía genérica de proveedores. Define dos
procesos opcionales, verificables y sustituibles:

1. El proceso principal conserva Telemetry Core, policy, scheduler, Spotter,
   presentación visual y audio precacheado. Nunca llama a inferencia.
2. Un `voice-host` local de prioridad reducida posee el modelo STT/TTS aprobado.
   Se comunica mediante un protocolo local versionado y acotado. No expone
   puerto de red público.
3. Spotter usa únicamente assets precacheados y puede interrumpir cualquier
   trabajo del host. Un miss de audio conserva la salida visual; nunca espera.
4. Engineer puede solicitar síntesis no crítica con deadline y TTL. Una
   respuesta tardía se descarta. La cola es acotada y latest-wins por mensaje.
5. STT recibe frames PCM en memoria solo después de PTT o wake word autorizado.
   No escribe WAV, audio ni transcripción por defecto.
6. El proceso principal puede matar y reiniciar el host. El benchmark demostró
   cancelación forzada de Kokoro en 2,232 ms y de Whisper en 41,065 ms, sin
   perder un heartbeat Go de 10 ms (máximo 10 y 20 ms respectivamente).
7. Si el host falla, la sesión sigue con radio/subtítulos y controles UI.

Separar el host no convierte Vantare en microservicios. Es un único helper
local, hijo del proceso principal, con lifecycle unido. La razón demostrada es
que las APIs de inferencia no garantizan cancelación cooperativa y pueden
consumir varios cores durante cientos o miles de milisegundos.

## Paquetes, integridad y almacenamiento

Cada paquete descargable tendrá un manifest firmado por Vantare con:

- `engine`, `runtimeVersion`, `modelId`, `modelVersion` y `locale`;
- licencia y URL de procedencia para runtime, modelo, voz, tokenizer y assets;
- tamaño, SHA-256 y archivos esperados;
- requisitos CPU/GPU y compatibilidad de Windows;
- capacidades declaradas: TTS, STT, streaming, cancellation y locales;
- estado `installed`, `verified`, `quarantined` o `failed`.

Los paquetes viven bajo datos gestionados de Vantare, nunca dentro de Git. La
descarga escribe a un temporal, verifica tamaño y hash, mueve de forma atómica
y conserva el manifest. Un mismatch entra en cuarentena. Desinstalar una voz
no borra historial ni configuración; solo deja su selección no disponible.
No existe descarga silenciosa durante una carrera.

## Threat model y privacidad

| Riesgo | Control obligatorio |
|---|---|
| Modelo o voz manipulados | Manifest firmado, SHA-256, descarga HTTPS y cuarentena |
| Path traversal en paquete | Lista cerrada de archivos y extracción en directorio temporal aislado |
| Host comprometido o colgado | Proceso hijo sin secretos, timeout, kill, restart y límites de recursos |
| Puerto local accesible | Named pipe o loopback con token efímero y binding exclusivo |
| Audio de micrófono persistido | Ring buffer en memoria; cero archivos y cero logs de audio |
| Transcripciones sensibles | No persistir por defecto; diagnóstico solo con consentimiento y vista previa |
| Voz equivocada/idioma cruzado | Locale tipado de ENG-07 y manifest de voz por locale exacto |
| Mensaje caducado | TTL revalidado antes de reproducir; respuesta tardía descartada |
| Saturación de CPU | Proceso de prioridad reducida; preservar Spotter y suspender trabajo informativo |

## Decisión de implementación

No se cablea ningún motor en ENG-09. El siguiente microcorte exacto debe ser
**ENG-10 — corpus humano y selección final de voice-host**:

1. Grabar localmente, con consentimiento y sin commitear, el catálogo PTT de
   cuatro idiomas con varias voces, micrófonos y ruido LMU reproducible.
2. Comparar Whisper `tiny` y `base` residentes con intent accuracy, false
   accept/reject, p50/p95, CPU/RAM y cancelación; medir Vosk solo como control.
3. Auditar una ruta Kokoro sin componentes GPL o declarar TTS dinámico aplazado.
4. Ejecutar escucha ciega de las cuatro voces TTS; no convertir la opinión en
   una métrica automatizada falsa.
5. Entregar una única selección por idioma o mantener visual-only.

Solo después puede abrirse **ENG-11 — package manager y voice-host test-only**,
seguido de wiring STT/PTT y, cuando exista TTS GO, síntesis no crítica. El orden
evita construir un instalador para artefactos que todavía no pueden distribuirse.

## Riesgos y huecos

- No existe corpus humano Vantare de comandos ni ruido LMU.
- No se ha validado calidad perceptual de Kokoro en ningún idioma.
- El stack Kokoro probado no tiene una ruta comercial cerrada por la cadena G2P.
- DirectML falló en este modelo/equipo; no se extrapola a CUDA ni a otros modelos.
- Una sola frase sintética no permite comparar modelos STT.
- No se ha realizado revisión legal externa; el gate es conservador.

## Fuentes y trazabilidad

Los comandos, hardware, hashes, tiempos, memoria, WER y limitaciones están en
[`benchmark-results.json`](../evidence/isa-180/benchmark-results.json). El
protocolo reproducible está en
[`tts-stt-benchmark-isa-180.md`](tts-stt-benchmark-isa-180.md). Los scripts no
acceden al micrófono y permanecen fuera del build productivo.
