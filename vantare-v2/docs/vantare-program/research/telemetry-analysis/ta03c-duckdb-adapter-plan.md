# TA-03C — microplan del adapter DuckDB aislado

- Estado: listo para ejecutar tras aceptar ADR 0005
- Base requerida: ISA-135 / TA-03B en review y TA-03 / ISA-126
- Método: TDD, microcortes acumulativos y review independiente

## Objetivo

Implementar `LMUDuckDBReader` mediante un helper local read-only, aislado y
empaquetable, sin añadir CGO/DuckDB al proceso principal, sin tocar Telemetry
Core y sin abrir aún datos personales.

## Decisiones previas obligatorias

- [ ] Isaac acepta ADR 0005.
- [ ] Se autoriza `duckdb-go/v2@v2.10505.0` en un módulo Go separado.
- [ ] Se autoriza redistribuir `duckdb.dll` 1.5.5 y notices MIT.
- [ ] Se acepta el coste aproximado de 44,18 MB sin comprimir.
- [ ] Se acepta VC++ Redistributable como prerrequisito del runtime.

## Alcance

### Incluye

- helper Windows amd64 separado;
- protocolo versionado mínimo;
- staging privado desde artefacto autorizado;
- adapter que implementa `LMUDuckDBReader`;
- catálogo y páginas contra DuckDB sintético real;
- read-only/hardening/límites;
- cancelación y teardown;
- manifest/checksums/notices de desarrollo;
- build reproducible y smoke Windows;
- documentación/handoff.

### No incluye

- UI, galería, gráficos, delta, mapa o coaching;
- Telemetry Core live, Engineer, Strategy u overlays;
- CLI DuckDB;
- daemon o servidor HTTP;
- ejecución de SQL elegido por el cliente;
- archivos personales o base LMU sin el gate ya aprobado;
- publicación del instalador final;
- promoción a `nightly`, `testers` o `master`.

## Microcortes

### C1 — Módulo helper y handshake

Tests primero:

- protocolo compatible responde versiones exactas;
- versión, arquitectura o DuckDB incompatibles fallan antes de abrir archivo;
- request desconocida y frame sobredimensionado se rechazan;
- stdout contiene solo frames; diagnósticos sanitizados van a stderr.

Implementación mínima:

- nuevo módulo aislado del `go.mod` principal;
- `duckdb-go/v2@v2.10505.0`;
- `duckdb.dll` 1.5.5 por enlace dinámico;
- operación handshake sin archivo.

Gate:

- build reproducible en dos rutas con SHA idéntico;
- `go list -m all` guardado;
- `go list -deps` y SBOM/licencias del grafo enlazado guardados;
- root `go.mod`/`go.sum` sin cambios.

### C2 — Manifest de runtime y launcher seguro

Tests primero:

- ruta absoluta esperada;
- helper/DLL alterados o ausentes se rechazan;
- manifest incompatible se rechaza;
- nunca busca en `PATH` ni current directory.

Implementación:

- manifest tipado con hashes/versiones;
- launcher con `exec.CommandContext` y `WaitDelay`;
- directorio versionado y notices.

Gate:

- smoke sin DuckDB disponible degrada solo Telemetry Analysis;
- ningún proceso queda vivo tras timeout.

### C3 — Staging privado y evidencia

Tests primero:

- copia desde handle autorizado;
- cambio de identidad, mtime, tamaño o hash antes/después aborta;
- WAL antes/durante/después aborta;
- symlink/reparse/archivo no regular aborta;
- destino privado no colisiona y se limpia al cancelar;
- el helper nunca recibe la ruta original.

Implementación:

- staging seam reutilizando `AuthorizedHistoricalArtifact`;
- evidencia esperada en request;
- rehash de copia antes/después en helper.

Gate:

- original intacto demostrado por test;
- cero reapertura por path original.

### C4 — Hardening y catálogo

Tests primero sobre DuckDB sintético:

- read-only rechaza DDL/DML;
- external access y autoload/autoinstall quedan desactivados;
- configuración queda locked;
- catálogo continuo/evento/metadata respeta orden y presupuestos;
- metadata no permitida nunca cruza el IPC;
- identificadores con comillas funcionan; payload de inyección no.

Implementación:

- connector inicializado antes de queries;
- plantillas SQL fijas;
- allowlist desde catálogo congelado.

Gate:

- adapter satisface `Catalog` y `ArtifactEvidence`.

### C5 — Filas, tipos y páginas

Tests primero:

- 0, `false`, vacío y NULL son distintos;
- integer/double/bool/text conservan tipo;
- tipos no soportados son `unknown`, no coercionados;
- límite 16.384 y predecessor-only de evento;
- offset/limit negativos, overflow y respuesta excesiva fallan;
- EOF determinista;
- no hay `map[string]any` en el modelo de producto.

Implementación:

- unión IPC etiquetada;
- `ReadRows` y mapping a `LMUDuckDBRow`.

Gate:

- parser TA-03 funciona end-to-end con DuckDB sintético real.

### C6 — Cancelación, Job Object y degradación

Tests coordinados, sin sleeps:

- cancelación antes de start, durante query y durante stream;
- timeout mata helper y pipes;
- cierre del padre termina helper;
- memoria/CPU saturadas devuelven error estable;
- respuesta tardía de generación anterior se ignora;
- retry posterior usa proceso/copia nuevos.

Implementación:

- Job Object kill-on-close;
- límite de memoria;
- request IDs y generación;
- cierre ordenado de rows/db/connector/process.

Gate:

- cero procesos, handles o goroutines propios tras cada escenario.

### C7 — Build, compatibilidad y evidencia

Automatizar:

- descarga oficial 1.5.5 con SHA
  `8375eb1fcf2212e8a0817950354815d4dde9dd383c2d9fa7b8975b71e278c1bd`;
- build con toolchain fijada;
- helper + DLL + manifest + notices;
- hash reproducible;
- smoke Windows 10 y 11 x64;
- instalación sin VC++ produce error accionable;
- rollback de runtime v1 a fixture anterior.

Gate:

- benchmark 720.000 filas sin regresión significativa frente a TA-03B;
- 50 páginas completas bajo límites;
- build principal Wails sigue CGO=0 y sin dependencia DuckDB.

### C8 — Review y cierre

- review independiente de seguridad, TOCTOU, lifecycle y packaging;
- resolver P0/P1/P2 y P3 razonables;
- focal x20, race donde aplique, fuzz de frames/identificadores/tipos;
- suite Go global y build frontend si el embed lo exige;
- `git diff --check`;
- handoff/current-plan/ADR actualizados;
- PR draft apilada, Linear `In Review`, sin promoción.

## Archivos/módulos previstos

Los nombres finales pueden ajustarse para respetar la estructura existente,
pero el ownership debe mantenerse:

- `internal/telemetryanalysis/duckdbadapter/` — cliente sin CGO;
- `internal/telemetryanalysis/staging/` — copia desde artefacto autorizado;
- `cmd/vantare-telemetry-reader/` o módulo hermano equivalente — helper CGO;
- `build/windows/telemetry-reader/` — build/manifest, sin alterar aún release
  público;
- `docs/third-party/` o `THIRD_PARTY_NOTICES.md` — avisos MIT;
- fixtures sintéticas en `testdata/`, nunca bases reales.

Si el módulo CGO no puede mantenerse totalmente fuera del grafo principal, el
corte se detiene: no se debe añadir la dependencia al root solo por comodidad.

## Pruebas requeridas

- [ ] Unitarias del protocolo, quoting, tipos, manifest y evidencia.
- [ ] Integración con DuckDB sintético real.
- [ ] Fuzz de frames, límites, identificadores y valores.
- [ ] Race del cliente/lifecycle donde CGO lo permita.
- [ ] Benchmark reproducible 720k y páginas de 16.384.
- [ ] Smoke Windows 10 y 11 x64.
- [ ] Teardown/proceso/handles sin leaks.
- [ ] Hash del original y copia antes/después.
- [ ] Suite Go global.
- [ ] Root dependencies unchanged.

## Condición de cierre

TA-03C solo queda lista para review si el parser TA-03 consume un DuckDB
sintético real de extremo a extremo, el proceso queda aislado/cancelable,
read-only y TOCTOU están demostrados, y el build principal no ha ganado CGO ni
DuckDB. La integración final en installer/updater puede ser un corte release
posterior, pero debe estar bloqueada para cualquier build de usuario hasta
completarse.
