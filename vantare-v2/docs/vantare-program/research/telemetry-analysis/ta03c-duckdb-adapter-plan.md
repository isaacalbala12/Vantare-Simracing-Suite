# TA-03C — microplan del adapter DuckDB fuera de proceso

- Estado: ejecutado y aprobado técnicamente en ISA-168; entrega en review
- Base requerida: ISA-135 / TA-03B corregida y TA-03 / ISA-126
- Método: TDD, microcortes acumulativos y review independiente

## Objetivo

Implementar `LMUDuckDBReader` mediante un helper local read-only fuera de proceso y
empaquetable, sin añadir CGO/DuckDB al proceso principal, sin tocar Telemetry
Core y aceptando en v1 únicamente archivos locales LMU descubiertos e indexados
por Vantare. El helper, sus límites y el Job Object son defensa en profundidad,
no un sandbox.

## Decisiones previas obligatorias

- [x] ISA-135 supera una nueva review independiente sin P0/P1/P2 ni P3
  razonables pendientes.
- [x] Isaac acepta
  `docs/adr/0005-duckdb-helper-for-historical-telemetry.md` después de esa
  review.
- [x] Se autoriza `duckdb-go/v2@v2.10505.0` en un módulo Go separado.
- [x] Se autoriza redistribuir `duckdb.dll` 1.5.5 y los notices exactos del
  inventario/SBOM de 37 componentes.
- [x] Se acepta el coste aproximado de 44,32 MB sin comprimir observado en el
  helper de investigación.
- [x] Se acepta VC++ Redistributable como prerrequisito del runtime.

## Alcance

### Incluye

- helper Windows amd64 separado;
- protocolo versionado mínimo;
- staging privado desde artefacto autorizado;
- allowlist de procedencia limitada a archivos locales LMU descubiertos e
  indexados por Vantare;
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
- selector arbitrario, archivos recibidos, paquetes compartidos, descargas,
  referencias públicas o imports comunitarios;
- afirmar que Job Object, límites de proceso o settings DuckDB son un sandbox;
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
- SBOM SPDX reproducible regenerado desde artefactos y licencias fijados;
- lista exacta de extensiones estáticas igual a la aprobada;
- generación de notices falla ante cambios de hash, componente o licencia;
- root `go.mod`/`go.sum` sin cambios.

### C2 — Manifest de runtime y launcher seguro

Tests primero:

- ruta absoluta esperada;
- helper/DLL alterados o ausentes se rechazan;
- cada miembro reutilizado de la extracción oficial se revalida por SHA-256;
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

- origen que no sea un archivo local LMU descubierto/indexado se rechaza antes
  del staging;
- rutas arbitrarias, imports comunitarios y paquetes compartidos se rechazan;
- copia desde handle autorizado;
- cambio de identidad, mtime, tamaño o hash antes/después aborta;
- WAL antes/durante/después aborta;
- symlink/reparse/archivo no regular aborta;
- destino privado no colisiona y se limpia al cancelar;
- el directorio privado reduce ACL al usuario actual;
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
- extension/temp directories son privados y el temporal no puede superar
  64 MiB;
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
- la documentación y los errores describen Job Object como lifecycle/cuotas,
  nunca como sandbox o frontera de privilegios.

### C7 — Build, compatibilidad y evidencia

Automatizar:

- descarga oficial 1.5.5 con SHA
  `8375eb1fcf2212e8a0817950354815d4dde9dd383c2d9fa7b8975b71e278c1bd`;
- build con toolchain fijada;
- helper + DLL + manifest + notices;
- SBOM SPDX determinista y notices derivados del inventario exacto;
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
- Linear/handoff/ADR actualizados según su propiedad;
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

- [x] Unitarias del protocolo, quoting, tipos, manifest y evidencia.
- [x] Integración con DuckDB sintético real.
- [x] Fuzz de frames, límites, identificadores y valores.
- [x] Race del cliente/lifecycle donde CGO lo permita.
- [x] Benchmark reproducible 720k y páginas de 16.384.
- [ ] Smoke Windows 10 y 11 x64: Windows 11 PASS; Windows 10 queda como gate
  físico obligatorio del instalador/release.
- [x] Teardown/proceso/handles sin leaks.
- [x] Hash del original y copia antes/después.
- [x] Suite Go global: PASS. Un flake intermedio de `internal/app`, reproducido
  también sobre ISA-135, quedó verde en la repetición global final.
- [x] Root dependencies unchanged.

## Condición de cierre

TA-03C solo queda lista para review si el parser TA-03 consume un DuckDB
sintético real de extremo a extremo, el proceso es cancelable y acotado,
read-only y TOCTOU están demostrados, la procedencia local LMU se aplica por
allowlist y el build principal no ha ganado CGO ni DuckDB. La integración final
en installer/updater puede ser un corte release posterior, pero debe estar
bloqueada para cualquier build de usuario hasta completarse.

TA-03C no habilita archivos externos o comunitarios. Ese alcance pertenece a
ISA-164 / TA-03D y exige una frontera real —token restringido, AppContainer o
equivalente—, staging con ACL para la identidad aislada, red bloqueada y límites
externos de CPU, memoria, handles, procesos, tiempo y disco.
