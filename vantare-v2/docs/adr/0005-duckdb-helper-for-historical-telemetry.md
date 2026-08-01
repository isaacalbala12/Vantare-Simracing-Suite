# ADR 0005: helper DuckDB aislado para telemetría histórica

## Estado

Propuesto. Requiere aprobación explícita de Isaac antes de TA-03C.

## Fecha

2026-08-01

## Contexto

Telemetry Analysis necesita leer archivos DuckDB históricos autorizados por
TA-02. La aplicación principal Vantare es Wails/Go, se construye en Windows con
`CGO_ENABLED=0` y comparte proceso con experiencias sensibles a latencia. El
cliente oficial `duckdb-go/v2` requiere CGO y enlaza código nativo. DuckDB
también publica un CLI, pero su propia guía de seguridad no recomienda
incrustarlo.

TA-03 ya definió un puerto neutral `LMUDuckDBReader`; no existe aún un adapter
productivo. El spike TA-03B demostró que el enlace estático precompilado 1.5.5
no enlaza con el MSYS2 GCC 16 actual por el cambio de TLS, mientras que el
enlace dinámico contra el `duckdb.dll` oficial 1.5.5 sí es reproducible.

## Decisión propuesta

Crear un helper local de corta vida, propiedad de Vantare, para implementar el
reader histórico:

- módulo Go separado con `duckdb-go/v2` fijado;
- enlace dinámico a `duckdb.dll` oficial y fijado;
- app principal sin CGO;
- IPC local mínimo por stdin/stdout, versionado y sin SQL arbitrario;
- solo copia privada emitida desde un handle autorizado por TA-02;
- read-only, extensiones/red desactivadas, límites de memoria/threads/tiempo;
- proceso contenido por Windows Job Object;
- helper/DLL/manifest/notices instalados y revertidos como unidad;
- ninguna dependencia desde Telemetry Core live.

## Consecuencias positivas

- Un crash nativo o exceso de memoria no derriba Wails ni los consumidores
  live.
- La toolchain CGO queda confinada a un artefacto.
- El contrato histórico permanece independiente de DuckDB.
- El runtime puede verificarse por hash, versionarse y reemplazarse de forma
  atómica.
- El proceso se puede cancelar y limitar con primitives estándar de Windows.

## Costes

- Aproximadamente 44,18 MB sin comprimir en el spike.
- Nuevo pipeline de build, notices, hashes, smoke y rollback.
- Requisito de Microsoft Visual C++ Redistributable.
- Protocolo IPC y staging privado que deben probarse contra TOCTOU.
- Seguimiento de releases y vulnerabilidades DuckDB.

## Alternativas descartadas

- DuckDB dentro del proceso Wails: blast radius y cambio de build principal.
- CLI oficial: no recomendado para embedding y superficie innecesaria.
- bindings directos: nivel demasiado bajo y menos mantenible.
- enlace estático actual: incompatibilidad reproducida con GCC 16.
- servicio persistente: complejidad y estado sin beneficio demostrado.

## Condiciones de aceptación

Esta ADR pasa a `Aceptado` únicamente si Isaac aprueba dependencia,
redistribución, tamaño y packaging. TA-03C debe demostrar el contrato mediante
DuckDB sintético, mismatch de versiones, TOCTOU, read-only, tipos/NULL,
identificadores, límites, cancelación y shutdown sin procesos huérfanos.

## Referencia

El análisis completo y la evidencia están en
[`duckdb-adapter-decision.md`](../vantare-program/research/telemetry-analysis/duckdb-adapter-decision.md).
