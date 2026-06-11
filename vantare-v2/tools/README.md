# Tools

## Regenerar offsets LMU

Desde la raíz del repo (requiere `Vantare-Ingeniero/shared-telemetry` vía `ingeniero_path.py`):

```bash
python tools/generate-lmu-offsets.py
```

Genera:

- `packages/sim-core/src/lmu-offsets.ts` (v1)
- `vantare-v2/internal/telemetry/lmu/offsets.go` (v2)

Variables de entorno opcionales: `VANTARE_INGENIERO_PATH` apuntando a `shared-telemetry`.

## dump-lmu-memory.py

Captura fixtures binarios con LMU en pista:

```bash
python tools/dump-lmu-memory.py
```

Guardar salida en `vantare-v2/testdata/lmu-fixture.bin` para tests de integración.
