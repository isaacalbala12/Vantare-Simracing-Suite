# Evidencia reproducible ISA-694 / F0-1

`spike_f0_1.py` usa solo la biblioteca estándar de Python 3 y el runtime
DuckDB firmado que instala Vantare. No requiere ni instala `duckdb` para
Python.

El script:

1. descubre la ruta estándar de LMU;
2. excluye cualquier base con WAL o modificada en los últimos 30 minutos;
3. copia una sesión estable cada vez a `_runtime-work/session.duckdb`;
4. comprueba que origen, tamaño, fecha y ausencia de WAL no cambiaron;
5. consulta únicamente esa copia mediante `vantare-telemetry-reader.exe`;
6. elimina la copia temporal y persiste solo metadata permitida y agregados.

Ejecución completa desde `vantare-v2`:

```powershell
python docs/strategy-planner/evidence/isa-694-spike/spike_f0_1.py
```

Smoke acotado:

```powershell
python docs/strategy-planner/evidence/isa-694-spike/spike_f0_1.py `
  --max-sessions 2 --analysis-sessions 1
```

No ejecutar contra una ruta distinta sin revisar que sea una biblioteca LMU
propiedad del usuario. El helper nunca recibe la ruta original.
