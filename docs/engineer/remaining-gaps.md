# Post-Implementation Analysis — What Remains for 100% CC Parity

## Audio Variants (SÍ se pueden crear)

Kokoro soporta variación de audio mediante:
- `speed`: 0.7 (urgente/lento) a 1.5 (rápido/entusiasta)
- Voice mixing: `"ef_dora+em_alex"` mezcla tonos
- Diferentes voces por contexto

**Plan:** Generar 3 variantes por frase (urgente, normal, calmado).

```python
# Ejemplo de generación de variantes
variants = [
    ("normal", 1.0, "af_bella"),
    ("urgent", 0.8, "am_echo"),    # voz más grave + más lento = urgente
    ("calm", 1.2, "af_bella"),     # más rápido = casual
]
for name, speed, voice in variants:
    body = {"model":"kokoro","input":"Car left","voice":voice,"speed":speed,"response_format":"mp3"}
```

Esto multiplicaría los 2.300 archivos × 3 = ~6.900 MP3 (~170 MB). No urgente — las variantes se pueden generar bajo demanda.

## Per-Corner Locking/Spinning (NO VERIFICADO)

No puedo afirmar que LMU no tenga estos datos. El struct rF2Wheel contiene:
- `mRotation` (double, rad/s) — velocidad de rotación de la rueda
- `mLateralPatchVel` (double) — velocidad lateral del parche de contacto
- `mLongitudinalPatchVel` (double) — velocidad longitudinal del parche

**Indicio de bloqueo:** `mRotation ≈ 0` mientras `speed > 5 m/s` = rueda bloqueada.
**Indicio de spinning:** `mRotation >> expected` con `speed < 1 m/s`.

**Requiere:** Script de barrido específico con LMU abierto, frenando fuerte hasta bloquear ruedas, y analizar `mRotation` en el wheel struct.

```powershell
# Captura para detectar bloqueo
python scripts/lmu-capture/capture.py --out docs/lmu-capture/lock-test --record 10 --hz 20
# Durante la captura: acelerar → frenar a fondo hasta ABS → soltar
# Luego analizar mRotation (offset 40 dentro de cada wheel struct)
```

## Driver Names ✅ Script creado

`scripts/generate_driver_audio.py` — script CLI que:
1. Lee nombre del piloto desde LMU REST API (`/rest/watch/standings`)
2. Genera audio Kokoro y lo cachea como `data/tts-cache/{lang}/{voice}/driver_{name}.mp3`
3. Soporta `--all-voices` para generar en las 23 voces

Pendiente: integrar llamada automática al inicio de sesión en el service loop de Vantare (cuando detecte un nuevo nombre de piloto en standings).

## Car Class Audio ✅ CABLEADO

- ✅ Archivos MP3 existentes como `car_class.hypercar.mp3` en todas las voces
- ✅ Text keys añadidos a runtime.go (`car_class.hypercar`, `car_class.lmp1`, etc.)
- ✅ Multiclass monitor ahora incluye `class` en el Payload de todos los eventos (session-first, single, multiple)
- ✅ Runtime.go encola mensaje `car_class.{class}` automáticamente cuando el Payload contiene `"class": "HYPERCAR"`
- ✅ 32/32 tests OK, build OK

El audio de clase se reproduce inmediatamente después del evento multiclass correspondiente. Ej: "Coche más rápido detrás" → "Hypercar" (secuencial).

## Resumen de acción

| Tarea | Dependencia | Tiempo |
|---|---|---|
| Car class audio en runtime | ✅ Cableado — clase incluida en payload multiclass | Completado |
| Driver names | ✅ Script creado (`generate_driver_audio.py`) | Pendiente: integrar en service loop |
| Audio variants (urgente/normal/calm) | Kokoro-FastAPI | ~4h generación |
| Per-corner locking/spinning | LMU abierto + captura | ~2h |

## Estado final

- Total CC events aplicables a LMU: **~512**
- Vantare implementados: **148 (29%)**
- Con audio: **96 text keys × 23 voces = 2,208 MP3**
- Car class audio: **4 clases × 23 voces = 92 MP3** (cableado pendiente fino)
