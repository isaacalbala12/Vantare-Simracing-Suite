# Fuentes y licencias

Esta investigación usa fuentes primarias y separa hechos, afirmaciones del
proveedor e inferencias de diseño. Fecha de corte: 2026-07-27.

## CrewChief

### Fuente y licencia

- Repositorio oficial actual:
  [CrewChiefV4 en GitLab](https://gitlab.com/mr_belowski/CrewChiefV4).
- Revisión observada:
  `main@150c8107ad03af621afec83712e96109cf2a3a93`, fechada 2026-07-26.
- El archivo
  [LICENSE](https://gitlab.com/mr_belowski/CrewChiefV4/-/blob/main/LICENSE)
  actual declara MIT para el código. El repositorio antiguo de GitHub avisa que
  el proyecto
  [se trasladó a GitLab](https://github.com/mrbelowski/CrewChiefV4).
- La licencia del código no debe extrapolarse a voces, sound packs, modelos,
  traducciones o dependencias. Esta auditoría no copia ninguno de esos activos.

### Evidencia funcional

La documentación oficial cubre
[instalación y uso](https://mr_belowski.gitlab.io/CrewChiefV4/index.html),
[reconocimiento de voz](https://mr_belowski.gitlab.io/CrewChiefV4/VoiceRecognition_InstallationTraining.html),
[integración específica de rFactor 2/LMU](https://mr_belowski.gitlab.io/CrewChiefV4/GettingStarted_GameSpecific_rFactor2.html),
[overlays](https://mr_belowski.gitlab.io/CrewChiefV4/Overlays_InGame.html) y
[cambios por versión](https://mr_belowski.gitlab.io/CrewChiefV4/About_ChangeLog.html).
La inspección del código fuente oficial encontró 44 familias de eventos,
incluyendo spotter, banderas, penalizaciones, combustible, neumáticos, daños,
condiciones, rivales, paradas, estrategia y sesiones.

Hechos especialmente relevantes:

- El playback oficial distingue prioridad, caducidad, cola inmediata y
  moderación/interrupción. El changelog documenta correcciones para interrumpir
  mensajes normales con Spotter/críticos y evitar mensajes obsoletos.
- Las notas de LMU muestran una integración cambiante: uso de memoria
  compartida para Virtual Energy, cambios y reintentos en REST, y correcciones
  de pit, presión, combustible y cambio de piloto.
- El filtrado por «partes difíciles» retrasa mensajes normales, pero no Spotter
  o alta prioridad; sus propias notas describen límites en vueltas inválidas,
  óvalos y pistas cortas.

Conclusión de ingeniería: CrewChief es una fuente de conceptos y casos de
regresión, no una especificación de LMU ni una dependencia para copiar. Sus
correcciones históricas justifican gates explícitos de datos obsoletos,
interrupción, cambio de coche/piloto y degradación de REST.

## Digital Race Engineer

Fuentes del proveedor:

- [Producto](https://www.thedigitalraceengineer.com/)
- [Funciones](https://www.thedigitalraceengineer.com/features/)
- [Comandos](https://www.thedigitalraceengineer.com/commands/)
- [Intents](https://www.thedigitalraceengineer.com/intents/)
- [Speech recognition](https://www.thedigitalraceengineer.com/speech-recognition/)
- [FAQ](https://www.thedigitalraceengineer.com/faq/)
- [Changelog](https://www.thedigitalraceengineer.com/changelog/)

El proveedor declara soporte de LMU, iRacing, ACC y AC, más de 150 funciones,
más de 800 comandos, ocho idiomas y opciones locales y cloud para STT/TTS.
También presenta spotting, rejoin/pit exit, tráfico rápido, combustible,
neumáticos, clima, banderas, pit, rivales y una cola sensible a momentos
ocupados. Estas son **afirmaciones del proveedor**, no resultados reproducidos
por esta auditoría.

Conceptos útiles sin copiar:

- descubrir capacidades mediante una matriz y búsqueda de comandos;
- separar «preguntar», «ordenar» y «respuesta»;
- adaptar la verbosidad al contexto de conducción;
- exponer registros y diagnóstico al usuario;
- aceptar combinaciones de botones/controladores.

Vantare mantiene un contrato más estricto: offline, sin grabación de micrófono,
sin LLM en la ruta crítica y con prioridad absoluta de Spotter. No se adopta la
política de datos ni el diseño visual de DRE.

## Voz offline

La licencia debe comprobarse en tres capas independientes: código del motor,
modelo/pesos y voz/dataset. Que un runtime sea open source no autoriza
automáticamente todos sus modelos.

| Componente | Evidencia primaria | Licencia observada | Cobertura útil | Decisión de investigación |
|---|---|---|---|---|
| Kokoro-82M | [modelo](https://huggingface.co/hexgrad/Kokoro-82M), [voces](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) | Apache-2.0 en la ficha del modelo | Voces verificadas para inglés, español e italiano; no se verificó PT-BR | Candidato TTS parcial; no puede ser el único motor de cuatro idiomas |
| Piper | [repositorio archivado](https://github.com/rhasspy/piper), [voces](https://github.com/rhasspy/piper/blob/master/VOICES.md) | Runtime y cada voz requieren revisión separada | La lista incluye variantes EN, ES, IT y PT-BR | Candidato si cada `MODEL_CARD` permite el uso y el fork mantenido supera el gate Windows |
| whisper.cpp | [repositorio](https://github.com/ggml-org/whisper.cpp) | MIT para el código; modelos por separado | STT local, CPU, cuantización y VAD | Candidato general; necesita benchmark y verificación de cada modelo |
| Vosk | [repositorio](https://github.com/alphacep/vosk-api) | Apache-2.0 para el código; modelos por separado | Streaming y modelos para EN/ES/IT/PT | Candidato preferente para gramática cerrada PTT; medir exactitud y latencia |
| openWakeWord | [repositorio](https://github.com/dscripka/openWakeWord) | Código Apache-2.0; modelos incluidos CC BY-NC-SA 4.0 | Modelos incluidos en inglés | No usar modelos incluidos en producto comercial; entrenamiento y licencia propios serían obligatorios |
| Porcupine | [repositorio](https://github.com/Picovoice/porcupine), [idiomas](https://picovoice.ai/docs/quick-start/porcupine/) | SDK/servicio comercial sujeto a términos y AccessKey | Documenta EN, ES, IT y PT y wake words personalizadas | Fallback sujeto a aprobación legal/producto; no asumir independencia offline |
| Mycroft Precise | [repositorio](https://github.com/MycroftAI/mycroft-precise) | Apache-2.0 | Entrenamiento propio; orientación histórica Linux | Rechazar como opción beta por mantenimiento y encaje Windows insuficientes |
| sherpa-onnx KWS | [documentación](https://k2-fsa.github.io/sherpa/onnx/kws/index.html) | Runtime/modelos deben verificarse por artefacto | Keyword spotting offline abierto | Línea de investigación, no selección aprobada |

### Recomendación condicionada

- Audio P0: banco de frases críticas pre-renderizadas, propiedad de Vantare,
  generado y validado por idioma. Nunca sintetizar Spotter crítico en carrera.
- PTT: empezar con gramática/intents cerrados, preferiblemente comparando Vosk
  y whisper.cpp en el hardware objetivo.
- TTS dinámico: comparar Piper en los cuatro idiomas frente a Kokoro para
  EN/ES/IT más una voz PT-BR independiente. La coherencia entre voces y sus
  licencias pesa más que una demo aislada.
- Wake word: KWS local seguido de VAD + confirmación STT exacta de
  Ingeniero/Engineer/Ingegnere/Engenheiro. Mantener PTT como recuperación.

No se fijan MB, RTF, FAR/FRR ni latencias: las fuentes no prueban esos valores en
el equipo objetivo de Vantare.

## Fuente oficial de spotter humano

La ayuda oficial de iRacing describe su
[flujo de spotting](https://support.iracing.com/support/solutions/articles/31000162971-spotting).
Sirve como referencia de la diferencia entre un spotter humano conectado a una
sesión y automatización local; no define los contratos de LMU.

## Restricciones clean-room

- No copiar frases, gramáticas, UI, iconos, sonidos, modelos ni datasets.
- No traducir archivos de recursos ajenos como atajo.
- Diseñar desde contratos de Vantare y validar con replays propios.
- Mantener un inventario por artefacto con URL, versión/hash, licencia, uso,
  redistribución y atribución antes de empaquetar cualquier binario o modelo.
