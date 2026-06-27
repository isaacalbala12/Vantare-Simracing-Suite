# TTS Architecture — Vantare Ingeniero Go

> **Estado del documento:** **HISTÓRICO / ASPIRACIONAL** desde
> 2026-06-27. Los paquetes `internal/tts/*` que se describen aquí
> **no existen** en el worktree actual. Este doc se conserva como
> spec de diseño; cuando se cree `internal/tts/`, este doc pasa a
> ser la guía de implementación.
>
> **Auditoría 2026-06-27:** `internal/tts/` no aparece en
> `vantare-v2/internal/`. Antes de aprobar cualquier miniplan que
> toque este doc, abrir mini-auditoría específica para confirmar que
> el paquete ya existe o que el miniplan lo crea como pre-requisito.
>
> **Adaptado de:** Vantare Ingeniero Go original
> (`docs/architecture/tts.md`).
> **Contrato normativo (cuando se implemente):**
> [`voice-contract.md`](../voice-contract.md).

## Context

El spotter MVP y la suite del ingeniero requieren TTS en tiempo real con
latencia mínima. Como la baja latencia y el funcionamiento offline son
críticos, necesitamos una estrategia robusta de generación de voz con
fallback en cadena.

## Arquitectura y Flujo de Datos

### 1. Hot Path Cache Check

Para minimizar latencia durante el procesamiento de telemetría y la
emisión de mensajes del spotter, el engine TTS consulta primero el
cache local:

- Cache key generada deterministamente a partir de
  `(language, voice, text)`.
- Si el archivo `.mp3` existe en el cache, se devuelve inmediatamente
  sin llamar al provider de síntesis.

```go
// internal/tts/cache.go
func (c *Cache) Key(language, voice, text string) string {
    h := sha256.Sum256([]byte(language + "\x00" + voice + "\x00" + text))
    return hex.EncodeToString(h[:])
}

func (c *Cache) Path(key string) string {
    return filepath.Join(c.root, key+".mp3")
}
```

### 2. Kokoro Local Process Provider (stub en prealpha)

Proveedor TTS **local** Kokoro:

- Corre como proceso o ejecutable separado.
- Recibe comandos de síntesis y parámetros del modelo.
- Guarda el audio generado en el directorio de salida.
- Calidad alta offline con voces preentrenadas.

Estado en prealpha: **stub configurado, no instalado**. Cuando se
empaquete Kokoro como proceso local, el adapter ya está listo.

```go
// internal/tts/kokoro/provider.go
type Config struct {
    Executable string
    ModelPath  string
    OutputDir  string
}
```

### 3. Edge TTS (provider activo en prealpha)

TTS cloud de Microsoft vía CLI `edge-tts`. Devuelve `.mp3` directo.
Latencia moderada, requiere internet.

Estado: **implementado y activo por defecto** en prealpha.

```go
// internal/tts/edge/provider.go
type Provider struct {
    cfg Config // Executable path + Voice default
}
```

### 4. Gemini TTS (beta+)

Voz cloud premium de Google. Mejor calidad y voces más naturales.
Coste por uso → exclusiva de beta y 1.0.

Estado: **planeado para beta**.

### 5. Voice Clone (1.0+)

Sample de audio del usuario con consentimiento. Provider TBD (ADR-006
en Python). Fallback a Gemini → Edge si falla.

Estado: **planeado para 1.0**.

### 6. Edge Fallback

Si el provider activo falla o no está disponible, el sistema cae al
siguiente en la cadena:

```
voice_clone → gemini → edge
```

En prealpha solo `edge` está activo.

### 7. Critical Phrase Pre-caching

Al arrancar el sistema:

- Identifica y pre-cachea las frases críticas de alta frecuencia del
  spotter (car_left, car_right, still_there, clear_left, clear_right,
  all_clear, three_wide).
- Garantiza ejecución con cero latencia de los cues más críticos durante
  una sesión de carrera.

```go
// internal/tts/engine.go - PrecacheSynth
func (e *Engine) PrecacheSynth(ctx context.Context, language, voice, text string) (string, error) {
    return e.SynthOrCache(ctx, language, voice, text)
}
```

`CriticalKeys()` retorna las 7 frases obligatorias:

```go
func CriticalKeys() []string {
    return []string{
        "spotter.car_left",
        "spotter.car_right",
        "spotter.still_there",
        "spotter.clear_left",
        "spotter.clear_right",
        "spotter.all_clear",
        "spotter.three_wide",
    }
}
```

## Cache contract

```go
type Cache struct {
    provider string
    root     string // %APPDATA%/Vantare/Ingeniero/tts-cache/<provider>/
}

type Request struct {
    Text     string
    Voice    string
    Language string
}

type Result struct {
    Format string // "mp3"
    Path   string
}

type Provider interface {
    Name() string
    Synthesize(ctx context.Context, req Request) (Result, error)
    Health(ctx context.Context) error
}
```

`Engine.SynthOrCache`:

1. Calcular `cachedPath = cache.Has(language, voice, text)`.
2. Si existe, devolver `cachedPath` sin llamar al provider.
3. Si no, llamar al provider.
4. Copiar resultado a cache atómicamente (`tmpfile + rename`).
5. Limpiar temp del provider.
6. Devolver `cachePath`.

Mutex serializa escrituras para evitar race entre pre-cache y queue.

## Voice routing

El rol (`engineer` o `spotter`) selecciona el provider:

```go
func providerForRole(routing TtsRouting, role string) string {
    if role == "spotter" {
        return routing.ProviderSpotter
    }
    return routing.ProviderEngineer
}
```

`TtsRouting` se actualiza vía WebSocket `config_ack` cuando el usuario
cambia `ttsProviderEngineer` o `ttsProviderSpotter` desde Hub.

## Latencia objetivo

| Path | Latencia esperada |
|------|-------------------|
| Cache hit | <5 ms |
| Edge TTS primera vez | 500-1500 ms |
| Edge TTS cache miss + write | 500-1500 ms |
| Gemini TTS primera vez | 800-2000 ms |
| Voice clone primera vez | 1500-3000 ms |

Mensajes spotter `car_left/car_right` deben servirse en <200 ms
garantizado. Por eso las 7 frases críticas se pre-cachean en arranque.

## Provider status

| Provider | Estado Go prealpha |
|---|---|
| Edge TTS | ✅ activo, default |
| Kokoro | ⚠️ stub configurado, no instalado |
| Gemini | ❌ beta |
| Voice clone | ❌ 1.0 |

## Pruebas mínimas

- `Engine_SynthOrCache_Hit` — cache hit no llama al provider.
- `Engine_SynthOrCache_Miss` — provider llamado y archivo copiado a
  cache.
- `Engine_SynthOrCache_NoProvider` — error claro si provider nil y
  cache miss.
- `Provider_Synthesize_ValidMP3` — output es MP3 válido (ID3 o frame
  sync).
- `Provider_Unconfigured` — error tipado `ErrProviderNotConfigured`.

## Decisiones diferidas

- **Kokoro packaging:** cómo se distribuye el binario. ADR pendiente.
- **Voice clone provider:** ElevenLabs IVC vs OpenAI vs local XTTS.
  ADR-006 pendiente en Python v0.7; en Go se reabre al llegar a 1.0.
- **Cache LRU:** actualmente todo el cache persiste; sin eviction.
  Aceptable mientras el número de frases sea finito.
