# ADR 0010: helper DuckDB fuera de proceso para telemetría histórica

## Estado

Aceptado. Telemetry Analysis usa un helper DuckDB fuera de proceso para fuentes
históricas autorizadas; el estado de implementación y promoción pertenece a
Linear, Git/GitHub y el handoff vivo.

## Fecha

2026-08-02

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

## Decisión

Crear un helper local de corta vida, propiedad de Vantare, para implementar el
reader histórico:

- módulo Go separado con `duckdb-go/v2` fijado;
- enlace dinámico a `duckdb.dll` oficial y fijado;
- app principal sin CGO;
- IPC local mínimo por stdin/stdout, versionado y sin SQL arbitrario;
- en v1, solo archivos locales LMU descubiertos e indexados por Vantare;
- solo copia privada emitida desde un handle autorizado por TA-02;
- read-only, extensiones/red desactivadas, límites de memoria/threads/tiempo;
- directorios privados de extensiones y temporales, con cuota temporal;
- proceso limitado y terminado en conjunto mediante Windows Job Object;
- helper/DLL/manifest/notices instalados y revertidos como unidad;
- ninguna dependencia desde Telemetry Core live.

Esta decisión **no llama sandbox** al proceso separado, al Job Object ni a los
settings DuckDB. El helper continúa ejecutándose con la identidad del usuario;
una vulnerabilidad nativa podría acceder a otros recursos del usuario. Por
ello, la v1 bloquea selectores arbitrarios, paquetes compartidos, descargas y
archivos comunitarios. ISA-164 / TA-03D debe demostrar token restringido,
AppContainer o aislamiento equivalente, ACL mínima, ausencia de red y límites
externos antes de habilitar cualquier procedencia no confiable.

## Consecuencias positivas

- Un crash nativo o exceso de memoria no derriba Wails ni los consumidores
  live.
- La toolchain CGO queda confinada a un artefacto.
- El contrato histórico permanece independiente de DuckDB.
- El runtime puede verificarse por hash, versionarse y reemplazarse de forma
  atómica.
- El proceso se puede cancelar y acotar con primitivas estándar de Windows,
  como defensa en profundidad y no como frontera de seguridad.

## Costes

- Aproximadamente 44,32 MB sin comprimir en el spike corregido.
- Nuevo pipeline de build, notices, hashes, smoke y rollback.
- Notices de 37 paquetes/componentes inventariados en el SBOM exacto.
- Requisito de Microsoft Visual C++ Redistributable.
- Protocolo IPC y staging privado que deben probarse contra TOCTOU.
- Importaciones externas/comunitarias aplazadas hasta ISA-164.
- Seguimiento de releases y vulnerabilidades DuckDB.

## Alternativas descartadas

- DuckDB dentro del proceso Wails: blast radius y cambio de build principal.
- CLI oficial: no recomendado para embedding y superficie innecesaria.
- bindings directos: nivel demasiado bajo y menos mantenible.
- enlace estático actual: incompatibilidad reproducida con GCC 16.
- servicio persistente: complejidad y estado sin beneficio demostrado.

## Evidencia de aceptación

Isaac aprobó dependencia, redistribución, tamaño, VC++ runtime y packaging tras
la review limpia de ISA-135. TA-03C demuestra el contrato mediante DuckDB
sintético, mismatch de versiones, TOCTOU, allowlist de procedencia LMU local,
read-only, tipos/NULL, identificadores, límites, cancelación y shutdown sin
procesos huérfanos. El resultado reproducible está en
[`ta03c-duckdb-adapter-evidence.md`](../vantare-program/research/telemetry-analysis/ta03c-duckdb-adapter-evidence.md).
TA-03C no habilita archivos externos ni afirma que Job Object sea un sandbox.

## Referencia

El análisis completo y la evidencia están en
[`duckdb-adapter-decision.md`](../vantare-program/research/telemetry-analysis/duckdb-adapter-decision.md).
