# ISA-180 — protocolo y resultados reproducibles TTS/STT

> **SNAPSHOT / ISSUE EVIDENCE.** Conserva el protocolo y resultados del corte
> ISA-180; no describe por sí solo el estado actual. Consulta el
> [router Engineer](README.md) y el [handoff vivo](../vantare-program/handoffs/engineer-spotter.md).

## Propósito

Este protocolo mide rendimiento técnico e inteligibilidad mínima. No mide
naturalidad, acento, emoción ni preferencia humana. No accede al micrófono y no
requiere LMU. Todos los modelos, ejecutables, WAV y entornos Python viven fuera
del worktree y se eliminan al terminar la auditoría.

## Equipo medido

- Windows 11 Pro 10.0.26200 x64.
- AMD Ryzen 7 3700X, 8 cores / 16 hilos.
- AMD Radeon RX 7800 XT.
- 31,9 GiB RAM.
- Python 3.12.10 y Go 1.26.4.

## Artefactos

| Artefacto | Bytes | SHA-256 |
|---|---:|---|
| Kokoro v1.0 int8 ONNX | 92.361.271 | `6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb` |
| Kokoro voices v1.0 | 28.214.398 | `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d` |
| whisper.cpp v1.9.1 Win x64 ZIP | 7.982.101 | `7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539` |
| Whisper ggml tiny multilingüe | 77.691.713 | `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21` |

Procedencia:

- `https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0`
- `https://github.com/ggml-org/whisper.cpp/releases/tag/v1.9.1`
- `https://huggingface.co/ggerganov/whisper.cpp/tree/main`

Los hashes fueron calculados después de descargar. Para producto, el manifest
debe fijarlos antes de descargar y verificar también firma/procedencia.

## Preparación TTS

El entorno aislado se creó fuera del repo:

```powershell
python -m venv C:\tmp\isa180-bench-20260802\venv
C:\tmp\isa180-bench-20260802\venv\Scripts\python.exe -m pip install `
  kokoro-onnx==0.5.0 soundfile==0.13.1
```

El entorno ocupó 185.953.886 bytes sin modelo ni voces. La instalación resolvió
`onnxruntime`, `phonemizer-fork` y `espeakng-loader`, hecho importante para el
inventario de licencia.

Ejecución:

```powershell
C:\tmp\isa180-bench-20260802\venv\Scripts\python.exe `
  tools/engineer-voice-bench/kokoro_probe.py `
  --model C:\tmp\isa180-bench-20260802\models\kokoro-v1.0.int8.onnx `
  --voices C:\tmp\isa180-bench-20260802\models\voices-v1.0.bin `
  --output-dir C:\tmp\isa180-bench-20260802\audio-final `
  --result C:\tmp\isa180-bench-20260802\kokoro-final-results.json `
  --warm-runs 1
```

## Resultados TTS CPU

La carga tardó 1.865,370 ms. El working set después de cargar fue 334.721.024
bytes. La inferencia media fue 4.590,002 ms en la primera llamada por idioma y
4.486,255 ms en la repetición. El working set observado quedó entre 283.803.648
y 334.712.832 bytes.

| Locale | Voz | Audio | Primera | Warm | RTF warm |
|---|---|---:|---:|---:|---:|
| en | `af_heart` | 1,920 s | 4.416,443 ms | 4.401,207 ms | 2,2923 |
| es | `ef_dora` | 2,069 s | 4.207,238 ms | 4.167,372 ms | 2,0139 |
| it | `if_sara` | 2,539 s | 5.200,635 ms | 5.345,980 ms | 2,1058 |
| pt-BR | `pf_dora` | 2,069 s | 4.535,691 ms | 4.030,460 ms | 1,9477 |

RTF superior a 1 significa que sintetizar tarda más que reproducir el audio.
No es aceptable para mensajes dinámicos de carrera.

## Intento TTS DirectML

Se sustituyó temporalmente ONNX Runtime CPU por
`onnxruntime-directml==1.23.0` y se fijó
`ONNX_PROVIDER=DmlExecutionProvider`. El modelo int8 y el fp16 alcanzaron la
sesión, pero fallaron en inferencia en un nodo `ConvTranspose` con
`0x80070057` («El parámetro no es correcto»). No se produjo WAV ni medida de
latencia. El fallo se conserva como evidencia NO-GO de la ruta AMD/DirectML
probada; no demuestra nada sobre CUDA.

## Preparación STT

La release Win x64 extraída ocupó 20.355.072 bytes. El servidor se ejecutó
residente con ocho threads y decoding limitado para comandos cortos:

```powershell
tools/engineer-voice-bench/whisper_probe.ps1 `
  -Server C:\tmp\isa180-bench-20260802\whisper\bin\Release\whisper-server.exe `
  -Model C:\tmp\isa180-bench-20260802\whisper\ggml-tiny.bin `
  -AudioDirectory C:\tmp\isa180-bench-20260802\audio `
  -Result C:\tmp\isa180-bench-20260802\whisper-tuned-results.json `
  -Threads 8 -WarmRuns 2
```

La configuración efectiva fue `no-timestamps`, `no-fallback`, `best-of=1` y
`beam-size=1`. Sin esos límites, la misma frase inglesa activó fallback y tardó
16–25 segundos. El gate exige conservar esta diferencia como regresión: la
configuración genérica de transcripción no sirve para comandos PTT cortos.

## Resultados STT

El servidor estuvo disponible en 866,124 ms. La primera inferencia media fue
601,958 ms y las repeticiones residentes 634,234 ms. El working set observado
quedó entre 172.875.776 y 176.025.600 bytes.

| Locale | Primera | Warm 1 | Warm 2 | WER | Transcripción |
|---|---:|---:|---:|---:|---|
| en | 597,176 ms | 696,145 ms | 610,512 ms | 0 | Car on the left, hold your line. |
| es | 627,826 ms | 579,245 ms | 583,815 ms | 0,4286 | coche a la izquierda mantentulinea. |
| it | 600,810 ms | 751,105 ms | 596,838 ms | 0,5 | auto-assinistra mantiene la traiettoria |
| pt-BR | 582,021 ms | 650,056 ms | 606,160 ms | 0,3333 | carro à esquerda mantém a sua linha. |

Las frases fueron generadas por Kokoro, no pronunciadas por humanos. WER es
una comparación transparente por palabras tras normalizar mayúsculas, acentos
y puntuación. El sentido fue reconocible en los cuatro casos, pero solo inglés
fue literal. No se infiere precisión real a partir de estas cuatro muestras.

## Cancelación y no bloqueo

El probe Go arrancó cada motor como proceso aislado, mantuvo un heartbeat de
10 ms y lo terminó mientras trabajaba:

```powershell
go run ./tools/engineer-voice-bench `
  -executable <engine> -output <result.json> `
  -cancel-after 500ms -heartbeat 10ms -- <engine arguments>
```

| Motor | Cancelación solicitada | Heartbeats | Gap máximo | Latencia kill |
|---|---:|---:|---:|---:|
| Kokoro | 2.000 ms | 200 | 10 ms | 2,232 ms |
| Whisper server | 500 ms | 48 | 20 ms | 41,065 ms |

La prueba demuestra aislamiento de proceso y cancelación forzada. No demuestra
cancelación cooperativa dentro de una API embebida ni sustituye el benchmark
productivo futuro. ENG-06 continúa demostrando por separado que la ruta actual
cache-only no sintetiza y que Spotter preempta el transporte.

## Checks del harness

```powershell
python -m unittest discover -s tools/engineer-voice-bench -p "test_*.py"
python -m py_compile `
  tools/engineer-voice-bench/kokoro_probe.py `
  tools/engineer-voice-bench/score_transcripts.py
go test ./tools/engineer-voice-bench
```

Los resultados canónicos sanitizados están en
`docs/evidence/isa-180/benchmark-results.json`. No se incluyen modelos, voces,
ejecutables, WAV, venv, rutas personales, audio de micrófono ni transcripciones
raw. El JSON conserva únicamente cuatro extractos sintéticos breves y
sanitizados para que el WER publicado sea auditable.
