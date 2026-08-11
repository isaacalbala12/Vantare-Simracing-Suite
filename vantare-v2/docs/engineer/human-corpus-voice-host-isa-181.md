# ISA-181 / ENG-10 — corpus humano y selección condicionada de voice-host

> **SNAPSHOT / ISSUE EVIDENCE.** Conserva la evidencia humana y tooling del
> corte ISA-181; no describe por sí solo el estado actual. Consulta el
> [router Engineer](README.md) y el [handoff vivo](../vantare-program/handoffs/engineer-spotter.md).

Fecha de corte: 2026-08-02. Ámbito: investigación y tooling test-only para
Windows 10/11, totalmente offline. No hay cableado productivo, dependencia
nueva, acceso silencioso al micrófono ni promoción de rama.

## Resultado ejecutivo

ENG-10 aporta evidencia humana genérica en `en_us`, `es_419`, `it_it` y
`pt_br`, pero **no aporta un corpus humano de comandos**. Esta separación es el
resultado principal:

1. **Validez lingüística humana genérica:** medida con 20 grabaciones de
   FLEURS original y otras 20 variantes de ruido sintético determinista. El
   modelo Whisper `base` obtiene menos WER/CER que `tiny` en casi todos los
   grupos y queda como candidato de precisión para el siguiente gate.
2. **Readiness de comandos, FAR/FRR y wake word:** **NO-GO**. Las frases de
   FLEURS no son órdenes de Vantare y no permiten medir intención, falso
   positivo ni falso rechazo. Elegir un modelo de release con esta evidencia
   sería complaciente.

`base` no queda aprobado para producto. Es una **selección condicionada** para
el siguiente corpus humano consentido de comandos. `tiny` conserva valor como
candidato de recursos reducidos, pero tampoco queda autorizado. TTS dinámico
sigue **NO-GO**: ENG-10 no encontró ni validó una ruta nueva que cierre la
licencia G2P, la latencia y la escucha humana pendientes de ENG-09. La salida
visual, subtítulos y radio de ENG-08 siguen siendo el fallback completo.

## Corpus elegido y licencia

Se utiliza FLEURS original de Google, fijado a la revisión
`70bb2e84b976b7e960aa89f1c648e09c59f894dd`. Su catálogo oficial declara
CC BY 4.0 y el paper describe un corpus de voz humana leída en 102 idiomas.

- [Google FLEURS en Hugging Face](https://huggingface.co/datasets/google/fleurs)
  (consultado 2026-08-02, confianza alta para licencia y artefactos).
- [Paper FLEURS](https://arxiv.org/abs/2205.12446) (consultado 2026-08-02,
  confianza alta para propósito y composición).
- [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)
  (consultado 2026-08-02, autoridad de licencia).

La licencia permite uso comercial con atribución. Un futuro paquete o informe
que redistribuya audio deberá conservar autoría, fuente, licencia y cambios.
Vantare no redistribuye el audio en este corte.

### Alternativas descartadas

| Candidato | Motivo |
|---|---|
| FLEURS-R | Audio humano procesado por restauración neuronal; no es la señal original adecuada para este baseline. |
| Common Voice | Licencia permisiva, pero la descarga actual requiere flujo de aceptación externo y no se cerró un snapshot pequeño, ungated y reproducible. |
| Multilingual LibriSpeech | Archivos mucho mayores y la variante `pt` no demuestra portugués brasileño. |
| Audio sintético de ENG-09 | No es voz humana; no puede validar idioma ni comandos. |

No se incorpora Vosk como control. Sin corpus humano de comandos, un tercer
runtime no resolvería el gate ausente y ampliaría descarga, licencia y matriz
sin cambiar la decisión. Puede reconsiderarse cuando el mismo corpus positivo
y negativo permita comparar modelos de forma justa.

## Selección reproducible y límites

El primer criterio propuesto —primera grabación de las primeras cinco frases
distintas de `dev.tsv`— necesitó recorrer más de 64 MiB de un archivo. El
harness falló cerrado y **no amplió silenciosamente el límite**.

El criterio final es: primeras cinco entradas WAV seguras en el orden físico
del `dev.tar.gz` fijado que tengan metadata coincidente en `dev.tsv`. Se aplica
por locale y produce siempre el mismo conjunto mientras la revisión y los
hashes permanezcan fijos.

| Límite | Valor |
|---|---:|
| Muestras por locale | 5 |
| Transferencia máxima por archive | 64 MiB |
| WAV individual | 5 MiB |
| Total extraído | 80 MiB |
| Resultado real con manifest y ruido | 21,3 MB |

El extractor solo acepta miembros regulares WAV, bloquea traversal y symlinks,
valida el contenedor y elimina el locale incompleto si no encuentra las
muestras dentro del límite. El manifest registra SHA-256 de cada WAV de forma
local. Git conserva únicamente hashes LFS de los archives y agregados.

FLEURS original `dev.tsv` publica ID de grabación y categoría de género, pero
no un speaker ID estable. Por ello las cinco grabaciones únicas por idioma no
se presentan como cinco locutores. `en_us`, `es_419` e `it_it` incluyen las
categorías `FEMALE` y `MALE`; esta muestra `pt_br` contiene solo `MALE`. No se
generaliza a diversidad de voces, acentos o micrófonos.

La fuente exacta, tamaños, hashes de archive y límites están en
[`corpus-source.json`](../evidence/isa-181/corpus-source.json). El manifest
sanitizado por muestra conserva ordinal, hash del recording ID, SHA-256 WAV,
tamaño, formato, sample rate, frames y género, sin texto ni path, en
[`sample-manifest.json`](../evidence/isa-181/sample-manifest.json).

## Condiciones medidas

Cada grabación se mide en dos condiciones:

- `clean`: WAV humano original de FLEURS;
- `noise-10db`: ruido blanco determinista a 10 dB SNR, semilla derivada de
  locale y posición.

El ruido permite una regresión estable. No representa motor, viento, radio,
Discord, ventiladores ni micrófonos reales de LMU. No se etiqueta como ruido de
cockpit. El corpus consentido posterior debe incorporar esas condiciones de
forma legítima y local.

## Runtime y artefactos

Se midió `whisper.cpp v1.9.1` Win x64 con ocho threads, prioridad
`BelowNormal`, servidor residente y decoding `no-timestamps`, `no-fallback`,
`best-of=1`, `beam-size=1`.

| Artefacto | Bytes | SHA-256 |
|---|---:|---|
| Release Win x64 | 7.982.101 | `7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539` |
| Whisper tiny multilingüe | 77.691.713 | `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21` |
| Whisper base multilingüe | 147.951.465 | `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe` |

El runtime, modelos, corpus, manifest local y transcripciones raw vivieron
fuera del worktree. Los procesos se unieron y los puertos quedaron libres.

## Resultados lingüísticos

WER y CER publicados son micro-ratios estándar: ediciones totales divididas
por tokens o caracteres de referencia totales. El JSON conserva también la
media macro por utterance con nombres explícitos para auditar diferencias de
longitud. P95 es tiempo de pared. El CPU es tiempo total de proceso y puede
superar el tiempo de pared al sumar varios cores. La RAM es working set
muestreado, no pico RSS.

| Modelo | Locale | WER clean | WER ruido | CER clean | CER ruido | P95 clean | P95 ruido |
|---|---|---:|---:|---:|---:|---:|---:|
| base | en_us | 0,1954 | 0,3563 | 0,0640 | 0,1589 | 1.864 ms | 1.479 ms |
| base | es_419 | 0,0833 | 0,1667 | 0,0284 | 0,0648 | 1.898 ms | 2.003 ms |
| base | it_it | 0,1400 | 0,1900 | 0,0365 | 0,0500 | 3.234 ms | 2.350 ms |
| base | pt_br | 0,2170 | 0,2736 | 0,1044 | 0,1423 | 2.407 ms | 3.243 ms |
| tiny | en_us | 0,2414 | 0,4138 | 0,0927 | 0,1987 | 1.011 ms | 1.148 ms |
| tiny | es_419 | 0,0833 | 0,3409 | 0,0316 | 0,1359 | 944 ms | 1.167 ms |
| tiny | it_it | 0,2800 | 0,4700 | 0,0769 | 0,1481 | 977 ms | 1.003 ms |
| tiny | pt_br | 0,2925 | 0,3774 | 0,1309 | 0,1935 | 985 ms | 1.155 ms |

`base` iguala `tiny` en WER español clean y mejora los demás WER. La mejora
es especialmente clara con ruido en español e italiano. El coste aproximado
es duplicar el tiempo medio y añadir unos 95 MB de working set observado.

| Modelo | Carga | Primera petición | Media | Máximo | CPU media | CPU máximo | RAM máx. |
|---|---:|---:|---:|---:|---:|---:|---:|
| tiny | 2.036 ms | 641 ms | 828 ms | 1.212 ms | 5.516 ms | 8.531 ms | 179.318.784 B |
| base | 968 ms | 1.268 ms | 1.835 ms | 3.437 ms | 10.752 ms | 15.516 ms | 273.588.224 B |

La cancelación forzada del proceso aislado tardó 11,480 ms para `tiny` y
18,187 ms para `base`; el heartbeat de 10 ms no perdió su intervalo objetivo.
Esto demuestra aislamiento del proceso, no cancelación cooperativa ni wiring.

Los agregados completos están en
[`benchmark-summary.json`](../evidence/isa-181/benchmark-summary.json).

## Lo que no se ha medido

- Intent accuracy: `null`.
- False accept rate: `null`.
- False reject rate: `null`.
- Wake word `Engineer/Ingeniero/Ingegnere/Engenheiro`: NO-GO.
- Catálogo PTT real multilingüe: NO-GO.
- Diversidad demostrable de locutor: no disponible.
- Ruido LMU, micrófonos, volante, Discord y cockpit: no medidos.
- Calidad perceptual TTS: no medida.

No se interpreta una transcripción genérica correcta como un comando. El
catálogo Go actual contiene frases inglesas parciales y tampoco sustituye la
matriz multilingüe aprobada. Crear traducciones o audios sintéticos para hacer
pasar este gate sería evidencia falsa.

## Captura/import consentido

`consented_corpus.py` prepara el corpus positivo/negativo siguiente sin entrar
en producto:

- requiere literalmente `--consent "I CONSENT"`;
- exige declarar `--pseudonym-confirmation "NON-IDENTIFYING"`; esta declaración
  advierte al operador, pero el software no puede demostrar que un alias no sea
  un nombre real y nunca lo presenta como garantía automática de ausencia PII;
- importa solo WAV mono 16 kHz PCM16 o captura mediante un `ffmpeg` externo
  indicado por el operador;
- limita la captura a 1–30 segundos;
- usa un alias sanitizado y no guarda nombre de dispositivo ni ruta original;
- permite `preview`, `delete` y `cleanup`;
- expira cada muestra a las 24 horas salvo `--keep` explícito;
- no sube, comparte ni commitea audio;
- no se ejecuta en background ni desde el producto.

Debe utilizarse con personas que entiendan el propósito, retención y derecho a
eliminación. Para commands/FAR/FRR se necesitan positivos del catálogo real y
negativos semánticamente cercanos, varias voces/micrófonos y ruido legítimo.

## Reproducción

Todo destino mostrado es externo al repositorio:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
python tools/engineer-voice-bench/fleurs_corpus.py `
  --output C:\tmp\isa181-corpus --samples-per-locale 5 `
  --transfer-limit-mib 64 --file-limit-mib 5 --total-limit-mib 80

python tools/engineer-voice-bench/augment_noise.py `
  --manifest C:\tmp\isa181-corpus\manifest.json `
  --root C:\tmp\isa181-corpus `
  --output C:\tmp\isa181-corpus\benchmark-manifest.json --snr-db 10

tools/engineer-voice-bench/whisper_corpus_probe.ps1 `
  -Server <external-whisper-server.exe> -Model <external-model.bin> `
  -ModelLabel tiny -CorpusRoot C:\tmp\isa181-corpus `
  -Manifest C:\tmp\isa181-corpus\benchmark-manifest.json `
  -Result C:\tmp\isa181-bench\tiny-results.json -Port 18181 -Threads 8

python tools/engineer-voice-bench/evaluate_corpus.py `
  --input <combined-external-results.json> `
  --output <external-summary.json>
```

## Decisión y siguiente gate

**Selección condicionada:** `whisper.cpp` + Whisper `base` multilingüe para el
próximo benchmark consentido. `tiny` permanece como comparación de bajo coste.
No se crea package manager, voice-host productivo, PTT, wake word ni wiring.

ENG-11 solo puede iniciarse cuando la orquestación lo autorice y deberá seguir
siendo test-only mientras command readiness sea NO-GO. Antes de cualquier GO
de voz, un nuevo corte debe:

1. cerrar el catálogo real por idioma;
2. capturar voces humanas consentidas y negativos;
3. medir intent accuracy y FAR/FRR por locale/condición;
4. fijar umbrales antes de mirar el resultado;
5. probar micrófonos y ruido LMU legítimo;
6. mantener visual-only en todo idioma que no supere el gate;
7. resolver TTS por separado sin componentes redistribuibles incompatibles.

## Checks

- 17 tests Python: selección/extracción segura, cleanup fail-closed completo,
  manifest sanitizado, consentimiento/pseudónimo, import, preview, cleanup,
  ruido determinista y micro/macro WER/CER.
- `py_compile` del tooling.
- guard de puerto libre y ownership del proceso; timeouts HTTP acotados y
  harness con timeout/respuesta inválida que demuestra cleanup de proceso/puerto.
- 80 inferencias humanas: 40 `tiny`, 40 `base`.
- cancelación aislada de ambos modelos.
- cero `whisper-server` huérfano y cero puerto de benchmark ocupado.
- audio/modelos/raw fuera de Git; evidencia versionada solo agregada.
