# Runtime DuckDB de Telemetry Analysis

Este directorio construye el helper aislado de TA-03C como una unidad
versionada. No modifica el `go.mod` principal ni integra aún el runtime en el
instalador público.

## Construcción verificada

```powershell
./build/windows/telemetry-reader/build-runtime.ps1 `
  -OutputDirectory ./bin/runtime/telemetry/duckdb-v1
```

La primera vez que cambia deliberadamente el helper, un responsable debe
revisar el nuevo artefacto y ejecutar el mismo comando con
`-UpdateTrustSource`. El comando normal falla si el manifest no coincide con
el digest compilado en Vantare.

El pipeline:

- descarga o acepta el ZIP oficial DuckDB 1.5.5 y valida su SHA-256;
- valida por separado `duckdb.dll` y `duckdb.h`;
- compila dos veces el módulo Go aislado y exige binarios idénticos;
- comprueba el inventario exacto de módulos enlazados;
- genera un SBOM SPDX productivo desde el inventario aprobado de 37 paquetes;
- descarga y valida cada texto de licencia antes de generar notices;
- genera y verifica un manifest de la unidad completa.

Requiere Go, GCC UCRT64 de MSYS2 y Microsoft Visual C++ Redistributable. El
Job Object y los límites DuckDB son defensa de ciclo de vida y recursos; no son
un sandbox.

## Smoke del runtime empaquetado

Ejecutar el mismo artefacto en los hosts Windows 10 y Windows 11 x64 del gate de
release:

```powershell
./build/windows/telemetry-reader/smoke-runtime.ps1 `
  -RuntimeDirectory ./bin/runtime/telemetry/duckdb-v1
```

El smoke falla con un mensaje accionable si el host no es compatible, falta el
VC++ Redistributable, falta el helper o el handshake no coincide. La prueba de
un host no sustituye la matriz de ambos sistemas antes de publicar el
instalador.
