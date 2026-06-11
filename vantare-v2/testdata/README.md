# LMU test fixtures

Capturas reales de shared memory `LMU_Data` para tests sin simulador.

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `lmu-fixture.bin` | Snapshot raw (324 820 bytes = `ObjectOutSize`) |
| `lmu-fixture.json` | Sidecar con valores esperados (Python ctypes) |

## Regenerar (LMU en pista)

Desde la raíz del repo:

```bash
python tools/dump-lmu-memory.py --output-dir vantare-v2/testdata
```

Requisitos: Windows, LMU corriendo, `Vantare-Ingeniero/shared-telemetry` disponible.

## Tests Go

```bash
cd vantare-v2
go test ./internal/telemetry/lmu/ -run Fixture
go test ./internal/telemetry/lmu/ -bench ParseFixture
```

Si falta `lmu-fixture.bin`, los tests de integración hacen `Skip` (synthetic tests siguen pasando).

## Commit del `.bin`

El binario pesa ~317 KB. Está permitido en git (`!/testdata/lmu-fixture.bin`) para CI sin LMU. Regenerar tras cambios de versión del juego u offsets.
