# TA-03B — spike reproducible de DuckDB en Windows

Este módulo Go está aislado del producto. Su única finalidad es comprobar el coste y los contratos mínimos de `duckdb-go/v2` sobre una base DuckDB sintética. No contiene telemetría personal, no modifica los `go.mod`/`go.sum` de Vantare y no se empaqueta en ninguna build.

## Requisitos

- Windows 10/11 x64.
- La versión de Go declarada en `go.mod`.
- MSYS2 UCRT64 GCC en `C:\msys64\ucrt64\bin`.
- Acceso de red para descargar una vez el paquete oficial `libduckdb-windows-amd64` 1.5.5.

## Ejecución

```powershell
./run.ps1
```

El script descarga el paquete oficial fijado, comprueba su SHA-256 publicado por DuckDB, compila dinámicamente un ejecutable desechable en `%TEMP%`, copia `duckdb.dll`, crea una base sintética de 720.000 filas y verifica:

- apertura `read_only` y rechazo de escrituras;
- hash del archivo estable antes/después de la lectura;
- tipos escalares, `NULL` y ceros legítimos;
- identificadores SQL con comillas;
- cancelación mediante `context.Context`;
- lectura repetida de páginas de 16.384 filas;
- tiempo de build, tamaño y SHA-256 del binario.

Se usa enlace dinámico de forma deliberada. El enlace estático oficial `duckdb-go/v2` 2.10505.0 no es reproducible con el MSYS2 UCRT64 GCC 16 actual: las librerías precompiladas todavía referencian símbolos `emutls` retirados por el cambio de TLS nativo de GCC 16. El paquete oficial `libduckdb` 1.5.5 sí enlaza y ejecuta correctamente. Este hallazgo forma parte de la decisión de packaging, no es un workaround oculto.

El resultado JSON puede guardarse como evidencia, pero ni el ejecutable ni la base generada deben versionarse.

## Límites

- No prueba todavía el protocolo del helper propuesto ni Job Objects de Windows.
- No abre archivos reales de LMU.
- No representa un benchmark completo del producto; solo reduce incertidumbre antes de TA-03C.
