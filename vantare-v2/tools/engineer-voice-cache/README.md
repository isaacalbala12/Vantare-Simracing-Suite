# Pipeline de precacheo Kokoro — F2 (ISA-716)

Herramienta batch **reproducible** que deriva del catálogo cerrado `docs/engineer/catalog-v1.md` (70 intents × 4 locales) un caché de voz compatible con `internal/tts.Cache` y `internal/engineer/audio/router.go:ResolvePresentationCached`.

> **Política del repo: audio y modelos FUERA de Git.** Solo se commitea `tools/engineer-voice-cache/` (código + `catalog-voice.v1.json` + `voice-models.lock.json` + `voice-cache.lock.json`). El directorio de caché generado va a un directorio local ignorado (ej. `%APPDATA%\Vantare\Ingeniero\tts-cache` o el `--cache-root` que elijas).

## Qué genera

1. **Manifiesto machine-readable** `catalog-voice.v1.json` (intent → `VoiceText` por locale + lista de placeholders `{n}/{gap}/{pos}/{lap}`...). Parser markdown estricto: si una tabla no parsea, falla, no adivina. Incluye `sourceSha256`, `numberClips` y `concatenation`.
2. **Síntesis Kokoro LOCAL** (pesos Apache-2.0) de:
   - Textos de voz **sin placeholders** (184 clips estáticos: 46 intents × 4 locales).
   - **Clips numéricos por locale** estilo CrewChief para mensajes con placeholders: `0-99`, centenas `100-900`, y la palabra de la coma decimal (`es:coma`, `en:point`, `it:virgola`, `pt-BR:vírgula`) → ~111 tokens por locale × 4 = 444 clips numéricos + literales intermedios.
   - Total aprox **~480-500 clips** antes de deduplicación.
3. **Layout de caché** compatible con producción:
   - **Hash** `tts.Cache.Key(lang,voice,text)` → `%CACHE%/kokoro/<sha256>.mp3` (authoritative, usado por `ResolvePresentationCached`).
   - Spotter (P0) debe ser **WAV PCM** sin decode para <150ms; el resto puede ser mp3/wav según `player_windows.go` (MediaPlayer soporta ambos). **Estado actual:** todos los clips se escriben como `mp3` via `Cache.Put`; la variante WAV para spotter queda PENDIENTE hasta que el provider Kokoro soporte `response_format=wav` y se añada un segundo `Cache` con extensión `.wav` (ver § Pendientes).
4. **Lockfiles**:
   - `voice-models.lock.json` — modelo y voces pineados por locale con hashes (ver § Modelos).
   - `voice-cache.lock.json` — hashes de salida de cada clip (sha256 + bytes + key) para verificación reproducible.

## Uso

### 1. Generar / verificar manifiesto

```powershell
# generar
go run ./tools/engineer-voice-cache --catalog docs/engineer/catalog-v1.md --manifest tools/engineer-voice-cache/catalog-voice.v1.json

# verificar byte-a-byte (gate CI)
go run ./tools/engineer-voice-cache --check --catalog docs/engineer/catalog-v1.md --manifest tools/engineer-voice-cache/catalog-voice.v1.json
```

El parser es estricto en 9 columnas, intent entre backticks, voz tras `·`, placeholders iguales en los 4 locales y 70 intents exactos. Si falla, no genera nada.

### 2. Sintetizar caché

```powershell
# smoke test con TTS fake inyectable (sin Kokoro, sin red)
go run ./tools/engineer-voice-cache --synth --manifest tools/engineer-voice-cache/catalog-voice.v1.json --cache-root C:\tmp\vantare-tts-cache --provider mock
# genera voice-cache.lock.json con PendingReal=true

# síntesis real (requiere Kokoro instalado y voces descargadas)
# Opción A: Kokoro-FastAPI local en 8880
go run ./tools/engineer-voice-cache --synth --manifest tools/engineer-voice-cache/catalog-voice.v1.json --cache-root $env:APPDATA\Vantare\Ingeniero\tts-cache --provider kokoro --kokoro-url http://localhost:8880/v1/audio/speech

# verifica que Resolver encuentra los audios
go test ./tools/engineer-voice-cache -run TestSynth
go test ./internal/engineer/audio -run TestAudioRouterResolvePresentation
```

La caché usa `tts.NewCache(root, "kokoro")` y `cache.Key(lang,voice,text)`. `ResolvePresentationCached` la lee sin invocar al provider.

### 3. Preparar Kokoro real (una vez por máquina, fuera de Git)

Pesos Apache-2.0 de `hexgrad/Kokoro-82M` (ver `voice-models.lock.json`):

- `kokoro-v1.0.onnx` (~310 MB) y `voices-v1.0.bin` desde https://huggingface.co/hexgrad/Kokoro-82M
- Verificar `sha256` y `bytes` y pegarlos en `voice-models.lock.json` (reemplazar `PENDING_...`).
- Instalar runtime local SIN la cadena G2P GPL (ver `docs/engineer/tts-stt-selection-isa-180.md` § Kokoro y G2P): usar `kokoro_onnx` 0.4+ con `espeakng` reemplazado o vía `Kokoro-FastAPI` docker con G2P permisivo. La ruta Python `phonemizer-fork` es GPL y **no** puede ir al bundle propietario.
- Voces pineadas: `es→ef_dora`, `en→af_bella`, `it→if_sara`, `pt-BR→pf_dora` (ver `voice-models.lock.json`).

Hasta que ese gate se complete, la síntesis real queda **PENDIENTE** (ver `voice-cache.lock.json: pendingReal=true`) y el pipeline es válido con `provider=mock`.

## Esquema de concatenación (mensajes con placeholders)

Decisión documentada en `catalog-voice.v1.json: concatenation` y aquí:

- **Tokenización:** `VoiceText` se parte por `placeholderRe = \{[a-z_]+\}`. Los literales entre placeholders (ej. `"Combustible, "` y `" litros, "`) son clips independientes sintetizados tal cual (keys literales). Los placeholders se sustituyen en runtime por clips numéricos.
- **NumberClips:** por locale `0-99` (100), `100,200…900` (9), y `coma`/`point`/`virgola`/`vírgula` (1) → 110-111 por locale. Decimales tipo `{gap}=1.5` → `["1","coma","5"]` (dígitos individuales tras la coma). Enteros `100-999` → `centena + resto` (ej. `123` → `["100","23"]` o `["100","20","3"]` según granularidad; con `0-99` directos basta `["100","23"]`).
- **Playback:** el scheduler concatena los audios resultantes (literales + numbers) con gap ~40 ms, sin crossfade. Spotter nunca espera a concatenación: sus 7 intents son estáticos y están en WAV.
- **Unidades habladas:** ya están en los literales (`litros`, `segundos`...), no son tokens numéricos separados.

Ejemplo `fuel.status_on_demand` es:

```
"Combustible, {n} litros, {gap} vueltas estimadas"
→ ["Combustible,", number(n), "litros,", number(gap), "vueltas estimadas"]
gap=12.3 → ["12","coma","3"]
```

## Archivos en Git vs fuera

| En Git (commit) | Fuera de Git (ignorado) |
|---|---|
| `tools/engineer-voice-cache/*.go` | `kokoro-v1.0.onnx`, `voices-v1.0.bin` |
| `catalog-voice.v1.json` | `%APPDATA%\Vantare\Ingeniero\tts-cache/kokoro/*.mp3` |
| `voice-models.lock.json` | audios generados locales |
| `voice-cache.lock.json` | `C:\tmp\vantare-tts-cache` de pruebas |
| `README.md` |  |

`.gitignore` ya excluye cachés locales; no añadir `*.onnx`, `*.bin`, `*.mp3`, `*.wav` de tts-cache.

## Tests

```powershell
go test ./tools/engineer-voice-cache ./...
go build ./tools/engineer-voice-cache/...
git diff --check
```

Incluye: parser estricto (70 intents, placeholders iguales, falla si tabla rota), regeneración `--check` byte-a-byte, y smoke synth con `MockProvider` que inyecta el `tts.Engine` y verifica que `cache.Get(Key)` + `ResolvePresentationCached` encuentran los clips.

## Pendientes y gates

- **Síntesis real PENDIENTE:** Kokoro no está instalado en esta máquina / falta G2P permisivo. El gate humano A2 (escucha perceptual de Isaac, 4 idiomas con números correctos, `docs/engineer/rework-spec.md` § A2) queda para después. El pipeline + smoke con mock es el entregable de F2.
- **Spotter WAV PCM:** hoy mock/kokoro produce mp3; la variante wav para P0 requiere provider con `response_format=wav` (PCM 24kHz) y un segundo Put con extensión `.wav` o un `Cache` que soporte ambos. Documentado, no bloquea el resto.
- **Hashes reales:** `voice-models.lock.json` tiene `PENDING_...` hasta descarga y verificación local.
- **Gate humano:** no se afirma calidad perceptual sin escucha de Isaac.

## Verificación manual

1. `go run ./tools/engineer-voice-cache --check` debe decir `check ok`.
2. `go run ./tools/engineer-voice-cache --synth --provider mock --cache-root C:\tmp\vantare-tts-cache` debe crear `voice-cache.lock.json` con `totalClips` ~400-500 y `totalBytes` >0.
3. `ls C:\tmp\vantare-tts-cache/kokoro/*.mp3 | Measure-Object` coincide con `totalClips`.
4. `go test ./internal/engineer/audio -run TestAudioRouterResolvePresentationCached` pasa si apuntas `DefaultCacheRoot` al mismo `cache-root`.

## Referencias

- Catálogo: `docs/engineer/catalog-v1.md` (fuente única, 70×4)
- Infra Kokoro previa: `tools/engineer-voice-bench/` (reutilizada, no duplicada)
- Layout caché: `internal/tts/cache.go: Key()` y `DefaultCacheRoot()`, `internal/engineer/audio/router.go: ResolvePresentationCached`
- Selección TTS: `docs/engineer/tts-stt-selection-isa-180.md` (NO-GO dinámico hasta resolver G2P GPL)
- Player: `internal/engineer/audio/player_windows.go` (MediaPlayer, max 8s)
