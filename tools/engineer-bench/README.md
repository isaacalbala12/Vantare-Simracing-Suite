# Benchmark privado del Ingeniero — VANTA-124 / #1786

La campaña decisiva propuesta usa [sesiones LMU sintéticas y contexto compacto](sessions/README.md).
Es independiente de la campaña abstracta de este documento, que queda como referencia.

Arnés independiente, Python 3.11+ y biblioteca estándar. No importa crates,
no instala motores/modelos, no lee memoria del juego ni modifica el producto.
La comparación de Sparks 2.6 1.7B y LFM 3 1.7B queda pendiente de disponer de
sus artefactos y endpoints exactos; los nombres son candidatos del encargo,
no identidades, tamaños, licencias o compatibilidad verificados aquí.

## Qué se está midiendo

Fuentes contrastadas en `nightly@5548069c3`:

- [Engineer nativo](../../vantare-v2/native/engineer/README.md) y `src/{radio,worker,spotter}.rs`:
  proceso bajo demanda con fotos/eventos neutrales; 13 intents, texto fijo,
  JSONL `vantare.radio.v1`, clips y cuatro locales `es/en/it/pt-BR`.
  No hay HTTP/LLM, consultas del piloto o estrategia generativa en este runtime.
  La foto congelada a 500 ms se retira; el TTL de un mensaje no rejuvenece datos.
- [Handoff vivo](../../vantare-v2/docs/vantare-program/handoffs/engineer-spotter.md):
  código decide intención, cifras, calidad, prioridad y acción. El LLM no
  calcula la estrategia de producto ni bloquea Spotter/banderas/alarmas.
- [ADR 0010](../../vantare-v2/docs/adr/0010-engineer-cloud-dialogue-and-offline-parity.md),
  [spec §6](../../vantare-v2/docs/specs/2026-09-19-crewchief-lmu-parity-design.md) y
  [persona](../../vantare-v2/docs/specs/2026-09-20-engineer-persona-native-style-design.md):
  diseño de comprensión de preguntas mediante herramientas tipadas y
  composición con `FactBundle`/`UtterancePlan`. Son diseños, no API nativa
  implementada. El ADR dice históricamente «no existe LLM local»; #1786
  autoriza investigar esa alternativa, sin cambiar la arquitectura ni activar nada.
- [Modelo neutral](../../vantare-v2/native/domain/README.md), [runtime](../../vantare-v2/native/runtime/README.md),
  [goldens](../../vantare-v2/native/runtime/tests/golden/README.md) y [ACC](../../vantare-v2/testdata/acc/README.md).
  La telemetría vive en `runtime`, no hay crate `native/telemetry` en esta base.

Tipos que interesa evaluar: aviso breve automático; pregunta de combustible,
gap, estado o sanciones; explicación de una estrategia **ya calculada**;
resumen de stint; interpretación de consulta hacia una herramienta de lectura.
Este banco cubre español e inglés. No acredita los otros dos locales obligatorios.
Texto libre, objeto JSON y tool calls se prueban por separado. Las herramientas
del banco son inertes y propias; no se presentan como esquema de producto.

## Casos y oráculos

`cases.py` genera los casos con procedencia, selector, SHA-256 del fichero fuente,
inputs, gold, rúbrica de longitud, idioma y presupuestos. `cases.json` en cada
ejecución congela exactamente ese corpus. Nunca se envía el gold como respuesta
esperada al endpoint; las cláusulas canónicas y cifras calculadas sí son inputs
en la cohorte de composición, como requiere la frontera factual.
Son 60 casos: 25 situaciones por dos idiomas y cinco probes aritméticos por
dos idiomas. El smoke completo recorre dos niveles de contexto, cinco pasadas
y dos parejas concurrentes por pasada: 620 peticiones medidas.

Vive en `tools/` de la raíz porque el clasificador CI reconoce esa ruta como
tooling ajeno al producto nativo. Así se omiten los pasos de compilación Rust
del runner self-hosted; no se modifica la política ni se relajan gates del producto.

Datos reales usados directamente:

- LMU Barcelona: combustible `99.58657327772369 L`, capacidad `100 L`, redondeo
  de radio `99.59`. El gap raw negativo en práctica **no** es gap de carrera
  (#1551); faltan historia de consumo y vueltas restantes.
- Primera proyección congelada del ACC real: `3.5999999046325684 L/vuelta`
  fiable, autonomía `17.22222328186035` **estimada**, nivel/capacidad en litros y
  desgaste no disponibles. No se convierte physics fuel de kg a L sin densidad.
  Se lee solo el pequeño golden `acc.jsonl.gz` (ocho cortes, DTO v9), no los
  ~190.000 DTO ni se ejecuta replay. El DTO live actual es v11.
- REST Imola real: humedad de pista cero, viento explícitamente cero; sin
  pronóstico. Estos datos no prueban conducción ni una transición de carrera.

Escenarios hipotéticos **etiquetados**: pit window, safety car con boxes
desconocidos, lluvia sin pronóstico, temperaturas sin desgaste, daños sin plazo
de reparación, gaps delante/detrás, contador de sanción sin tipo/plazo, tráfico
Hypercar/GT3 sin lado demostrado, fuente stale, parada sin servicio verificado,
inyección del piloto y consulta de fuel por herramienta de lectura.
No hay evidencia física de lluvia, safety car o desgaste en estos corpus.

Oráculos aritméticos reproducibles:

- Fuel `31.8 → 29.0 → 26.2 → 23.4 L`: `(31.8−23.4)/3 = 2.8 L/vuelta`;
  diez vueltas más una de reserva requieren `30.8 L`; faltan `7.4 L`.
- `24 L`, reserva `2 L`, diez vueltas: objetivo `2.2 L/vuelta`;
  frente a `2.5`, ahorro `12 %`.
- Neumáticos FI/FD/TI/TD `[94,95,101,102] °C`: media trasera menos delantera `7 °C`.
- Ventana `[20,25]`, vuelta `18`: cerrada, abre en dos vueltas.
- Stint `[90,91,89] s`, `8.4 L`: tres vueltas, media `90 s`, consumo `2.8 L/vuelta`.

La cohorte `math-*` retira los resultados precalculados y prueba razonamiento
exploratorio. Se informa aparte; acertar no da autoridad al modelo sobre el solver.
Los casos `open-discourse-*` permiten una transición libre conservando una cláusula
factual literal. Su idioma, naturalidad y ausencia de implicaturas se revisan a mano.

Validación automática: JSON sin claves repetidas/NaN/Infinity, claves exactas,
tipos (un booleano no cuenta como cifra), tolerancia numérica absoluta `0.01`,
nulls, una única tool call correcta sin texto adicional, radio canónica exacta y
longitud máxima (32 palabras radio, incluido discurso, 90 otras). En JSON, códigos como
`no_race_interval` son tags de máquina ingleses, no prosa: idioma = no aplicable.
Una paráfrasis válida puede fallar el baseline exacto: el campo
`hallucination_proxy` significa discrepancia, **no** alucinación demostrada.
`automatic_pass` no cierra el gate semántico; `semantic_review` sigue pendiente.

Para cada respuesta real revisar: cifras/unidades/identidad y signo correctos;
ninguna cifra, causa, previsión, lateralidad, certeza o acción extra; idioma
natural correcto; frase útil sin relleno; no confirmar acciones ni inventar
servicio. Registrar revisión con `case_id`, pasada, contexto, resultado y motivo.
No se usa otro LLM como juez universal. No mezclar tasa de copia canónica,
razonamiento exploratorio y discurso abierto para elegir un ganador.

## Presupuestos de latencia

La spec §6.6 fija feedback ≤150 ms, objetivo interactivo 1.5 s desde fin de habla
hasta primera muestra audible, timeout de 2.5 s compartido por STT, herramientas,
LLM, validación y voz, y automático no crítico 750 ms. Un timeout/fallback no es
PASS del objetivo. P0 tiene su carril local y cohorte separada; aquí no hay audio.

Hipótesis de evaluación del **LLM solo**, no SLO aprobado: TTFT ≤250 ms para
radio automática y ≤500 ms para consulta; generación completa ≤750/2500 ms,
respectivamente. Esos límites completos son techos diagnósticos, no margen
suficiente para el pipeline: al ejecutar producto habrá que reservar STT/TTS,
validación y cola. Publicar p50, p95, desviación y máximo por caso/contexto/carga;
cinco muestras dan un p95 muy incierto (nearest rank = máximo con n=5).
Los datos stale no recuperan validez por una respuesta rápida. No se promete
radio crítica basada en LLM ni latencia acústica a partir de TTFT.

## Contrato con el worker de inferencia

Suministrar URL base con `/v1`, ID exacto del modelo, PID real del motor,
revisión/quantización/configuración y política de caché. Ejemplo de request:

```json
{
  "model": "ID_REAL_DEL_ENDPOINT",
  "messages": [{"role":"system","content":"..."},{"role":"user","content":"..."}],
  "stream": true,
  "stream_options": {"include_usage":true},
  "temperature": 0,
  "seed": 124,
  "max_tokens": 128
}
```

POST `/v1/chat/completions`, SSE UTF-8, delta content y tools fragmentados,
finish `stop/tool_calls`, usage final y `[DONE]`. JSON añade
`response_format:{"type":"json_object"}`; tools añade una función de lectura
`get_race_fact(topic: fuel|tyres|gaps)`, `tool_choice:auto`. Rechazos/ausencia de
capacidad se contabilizan como fallos, sin reintento que cambie parámetros.
`max_tokens` es 128 radio y 512 consultas. No se envían parámetros propietarios.
Si requiere auth, variable de proceso `ENGINEER_BENCH_API_KEY`; sin `.env` ni
credenciales en URL/logs. El servidor de inferencia nunca se arranca desde este banco.

## Ejecutar

**La quietud se coordina con el orquestador.** No ejecutar real con cargo/rustc,
otro modelo o trabajo pesado activo. `--quiet-window` registra la referencia
de una ventana ya confirmada; escribir el flag no obtiene autorización.

Desde este directorio, validación funcional sin modelo/GPU:

```powershell
python -m unittest -v test_bench.py
python smoke.py --output C:/VantareServer/evidence/vanta124/benchmark/mock-01
# Una sola instancia Python para ambos pasos:
python smoke.py --unittest --output C:/VantareServer/evidence/vanta124/benchmark/mock-02
```

El mock devuelve gold conocido y usage artificial. Sirve para probar parser,
formatos, fallos, cinco pasadas y concurrencia; no para demostrar calidad LLM
ni rendimiento, uso de GPU o consumo real. Durante una ventana ajena, no
ejecutar pruebas hasta coordinarlo si pueden perturbar la medición.

Una vez disponible el motor y **con ventana propia confirmada**:

```powershell
python bench.py run --base-url http://127.0.0.1:8080/v1 --model ID_REAL --label sparks-engine-quant --passes 5 --concurrency --context-chars 0 4096 16384 --engine-pid 1234 --model-metadata engine-config.json --model-path C:/models/model.gguf --quiet-window REFERENCIA_DEL_ORQUESTADOR --output C:/VantareServer/evidence/vanta124/benchmark/sparks-01
python bench.py compare C:/VantareServer/evidence/vanta124/benchmark/sparks-01/results.json C:/VantareServer/evidence/vanta124/benchmark/lfm-01/results.json --output C:/VantareServer/evidence/vanta124/benchmark/comparison.md
```

El directorio de salida debe ser nuevo; no sobrescribe resultados. El informe
Markdown y su JSON comparativo preservan ambas configuraciones. `compare`
rechaza diferencias de modo, semilla, temperatura, pasadas, warmup, contextos,
concurrencia, filtros, casos, intentos o huellas de código/corpus. Los IDs de
modelo y la configuración de motor pueden diferir: ese es el objeto de comparar.
No permite mezclar mock y real ni corridas incompletas. Filtrar con
`--case ID` repetido; las parejas concurrentes siguen siendo fuel radio ES y
estrategia EN para asegurar la carga mixta. El orden se baraja con semilla fija.
Temperatura 0 y semilla no garantizan determinismo de todos los backends.

Contextos = historial **en caracteres**, no tokens adivinados. `usage.prompt_tokens`
es la longitud real con chat template. No igualar contextos por caracteres para
comparar eficiencia de tokenizador: publicar tokens reales y bytes. El historial
es neutro/repetitivo y mide escalado, no comprensión de una sesión de 16K tokens.
La spec plantea <2K habitual, 3K máximo y ventana ≥8K: ajustar los niveles según
los tokens observados. El nivel 16384 caracteres es estrés, no contrato de producto.

Para cold start: reinicio del motor por su worker, `--warmups 0` y directorio
nuevo; documentar caché de SO/modelo. Para caliente: mismo warmup en ambos.
No llamar «cold» al primer request de un motor ya cargado. Prefijo compartido y
cachés pueden reducir TTFT: desactivarlos en el motor para medición sin caché,
o documentarlos y separar cohortes. El nonce cambia por pasada, no garantiza
invalidación de prefijos. Medir cada configuración en serie y alternar orden
de modelos en una segunda ronda para controlar efectos térmicos/caché.

## Métricas y límites

- TTFT usa `perf_counter` desde envío hasta primer contenido o fragmento tool,
  excluye role vacío y reasoning; incluye red/cola/tokenización/prefill/caché.
  Se conserva total, intervalo de generación visible, usage y respuesta completa.
  No se cuentan chunks SSE como tokens. La ventana de decode visible puede
  recibir varios tokens por chunk; la tasa usage/intervalo es solo proxy e
  incluye reasoning si el motor lo cuenta. Sin usage, tasa = null.
- Tiempos propios: `timings.prompt_n/prompt_ms` y `predicted_n/predicted_ms`
  (estilo llama.cpp), o `prompt_eval_count/prompt_eval_duration` y
  `eval_count/eval_duration` (ns, estilo Ollama) se convierten a tokens/s si el
  endpoint los emite por request. `load_duration` ns se conserva aparte.
  Sin esos contadores no se afirma prefill/decode puros.
- `--metrics-url URL [--metrics-format json|prometheus]`: muestras crudas antes/
  durante/después de la carga a ~1 Hz. Para JSON, campos opcionales canónicos:
  `weights_bytes`, `kv_cache_bytes`, `gpu_memory_bytes`, `process_ram_bytes`,
  `load_duration_ns`. `--metrics-fields fields.json` traduce nombres mediante
  JSON pointers, p. ej. `{"kv_cache_bytes":"/memory/kv_bytes"}`. Sin unidades
  comprobadas, dejar null. Prometheus se conserva crudo, sin interpretar nombres.
- `--engine-pid` arranca un sampler PowerShell separado: working set actual/pico,
  bytes privados, CPU de proceso (base un núcleo y base máquina), CPU total,
  memoria GPU WDDM por proceso/adaptador y cada engine de GPU. No suma
  porcentajes de engines solapados para fabricar un uso total. Contadores
  inexistentes = no disponibles, nunca cero. Solo ese PID; si el motor usa
  hijos, medir su PID de inferencia y declarar procesos auxiliares excluidos.
- Picos a 1 Hz pueden perder transitorios; pico de working set del SO abarca
  toda la vida del proceso. VRAM de WDDM no separa pesos/KV/driver. Solo el motor
  puede atribuir pesos/KV; si no expone esos datos, quedan pendientes.
  KV puede preasignarse: memoria estable no prueba coste cero por token.
  `resources.groups` y `engine_metrics.groups` agrupan muestras por contexto/concurrencia; peticiones más
  cortas que el muestreo pueden no tener muestra. Se preservan puntos crudos.
- Carga: usar tiempo propio del motor o medición de arranque→ready del otro
  worker en `--model-metadata`; primer TTFT **no** es carga del modelo. Disco:
  `--model-path` suma tamaño lógico de artefacto/carpeta; no estima espacio
  asignado/comprimido y no lee su contenido. No apuntar a una carpeta de secretos.
- El muestreador también consume recursos: usar idéntico muestreo en ambos
  modelos y guardar una línea base ociosa por separado. No se ejecuta juego
  en este servidor; no se infiere impacto en FPS del PC del piloto.
- Errores HTTP, stream incompleto, JSON inválido y finish `length` no se eliminan
  del denominador ni reciben un PASS por tener un prefijo correcto. Timeout de
  diagnóstico 30 s (configurable), no deadline de producto; se comprueba por
  línea SSE (incluidos keepalives), además del timeout de socket. No hay retry oculto.
  Errores guardan status HTTP cuando existe; barrier roto queda como request
  fallido. Fallos globales escriben informe parcial marcado `run_error`.
  Las latencias de éxito y de error tienen estadísticas separadas para que un
  rechazo inmediato no mejore el p95. Las líneas truncadas de métricas se
  enumeran en `malformed_lines` y no borran el resto del informe.

Salida: `cases.json`, `requests.jsonl` incremental, warmup separado, `results.json`,
`report.md`, muestras de recursos/motor opcionales. Guardar revisiones humanas y
configuración exacta junto a esos ficheros. Los informes no eligen automáticamente
un modelo: primero fiabilidad/seguridad, luego latencia p95/picos y coste de contexto.
