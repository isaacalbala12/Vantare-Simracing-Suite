# TA-03E / TA-03F — activación backend y distribución del reader histórico

- Estado: TA-03E revisada localmente; TA-03F implementada y verificada localmente; identificadores Linear pendientes
- Fecha de autorización excepcional: 2026-08-11
- Base inicial: `origin/nightly@b1db9f87b66f76df12d856484049616ea011e69f`
- Rama temporal local: `work/ta03e-backend-reader-wiring`
- Rama TA-03F: `work/ta03f-windows-runtime-packaging`
- Base apilada TA-03F: `559c3753a82071398ef1af3fbcc2d30c4dd3fe52`

## Excepción de trazabilidad

Linear rechaza nuevas issues por el límite del plan gratuito. Isaac autorizó
explícitamente ejecutar estos dos cortes sin issue previa y crearlas al final.
Hasta entonces no se hará push, PR, merge ni promoción. Al recuperar capacidad,
se crearán TA-03E y TA-03F, se renombrarán o reconstruirán sus ramas según el
identificador asignado y se copiará esta evidencia a Linear.

## TA-03E — cableado backend productivo

### Objetivo

Exponer el reader DuckDB de TA-03C mediante una frontera backend no visual que
conserve discovery metadata-only, autorización explícita, staging privado,
límites de lectura y teardown determinista.

### Alcance cerrado

- Servicio de aplicación propio de Telemetry Analysis.
- Runtime resuelto únicamente desde la instalación mediante
  `duckdbadapter.ProductionTrust`; nunca desde `PATH`, el directorio actual o
  una ruta aportada por el consumidor.
- Discovery limitado a raíces LMU que posea el backend. La frontera pública
  solo devuelve identificadores opacos y datos sanitizados.
- Apertura únicamente de candidatos emitidos por ese discovery, tras gate de
  estabilidad, ausencia de WAL y aprobación explícita.
- Reutilización directa de los contratos TA-02/TA-03 y el reader TA-03C; sin
  reader, parser o formato alternativo.
- Estado y errores sanitizados para falta de runtime, VC++ ausente, falta de
  permiso, archivo activo/cambiado e incompatibilidad.
- Cierre de parser, reader, staging y procesos en éxito, error, cancelación y
  shutdown.
- Registro en el composition root nativo, sin UI ni cambios frontend.

### Política de acceso

La política es específica de Telemetry Analysis y no reutiliza la autorización
del canal de actualización:

- la licencia debe estar `active` o `grace`;
- `CapabilityPro` o `CapabilityLaunchV1` conceden acceso comercial;
- los roles operativos `tester`, `nightly_tester` y `owner` conceden acceso
  interno revocable para pruebas;
- un rol operativo nunca se presenta ni se persiste como evidencia de compra;
- cualquier otro estado, capability o rol falla cerrado.

### Criterios de aceptación

- El backend inspecciona y pagina una base sintética real sin exponer la ruta
  original.
- No existe API pública que acepte una ruta arbitraria para abrirla.
- El runtime ausente o alterado degrada solo Telemetry Analysis.
- La matriz de licencia/roles queda cubierta por tests de tabla.
- El proceso principal conserva `CGO_ENABLED=0` y su grafo raíz sin DuckDB.
- Cancelación y shutdown no dejan helper, handles, staging ni goroutines
  propias.
- `gofmt`, tests focales, `go vet`, `go test ./...` y build principal pasan o
  documentan con evidencia una deuda heredada.

### Archivos esperados

- `internal/app/telemetry_analysis_service.go`
- `internal/app/telemetry_analysis_service_test.go`
- `internal/license/` para una consulta de autorización dedicada y testeada
- `cmd/vantare/main.go` y tests focales de composición
- este plan, handoff y `docs/current-plan.md`

### Evidencia local de cierre técnico

- Commits: `1d8c107`, `e90d7c8`, `76a1212` y `d0de350`.
- Tests focales repetidos, `go vet`, build frontend requerido por el embed,
  suite `CGO_ENABLED=0 go test ./...`, grafo raíz sin DuckDB/CGO y diff-check:
  PASS.
- Review de especificación: `APPROVE`, cero P0/P1/P2/P3.
- Review de calidad: `APPROVE`, cero P0/P1/P2/P3.
- Race focal TA-03E x5: PASS usando MSYS2 UCRT64. El race del paquete completo
  `cmd/vantare` detecta una carrera heredada en `spyMainEmitter` durante
  `TestHandleProfileRetryFailed`; queda fuera de TA-03E y pendiente de issue.
- Sin Linear, push, PR, CI remoto, merge, promoción, packaging o release.

## TA-03F — empaquetado Windows del runtime DuckDB

### Dependencia

TA-03F comienza después de cerrar la frontera y la ruta productiva de TA-03E.

### Alcance cerrado

- Incluir como unidad atómica helper, DLL, manifest, SBOM y notices en los
  artefactos Windows aplicables: installer, portable y updater.
- Mantener la ruta versionada esperada por `ProductionTrust`.
- Actualización y rollback atómicos sin mezclar bundles ni confiar en restos de
  instalaciones anteriores.
- Repetir build reproducible, verificación de hashes y smoke Windows x64.
- No incluye interfaz, gráficos, mapa, coaching, imports externos ni release.

### Gate manual

TA-03F requerirá smoke manual sobre el artefacto empaquetado en Windows 11 x64
y, si sigue disponible como requisito de soporte, Windows 10 x64. Esa prueba es
funcional y de packaging, no visual.

### Evidencia local TA-03F

- La unidad exacta `manifest.json`, `duckdb.dll`,
  `vantare-telemetry-reader.exe`, `sbom.spdx.json` y
  `THIRD_PARTY_NOTICES.md` se verifica antes de crear installer/portable y se
  instala en `runtime/telemetry/duckdb-v1`, la misma ruta de
  `duckdbadapter.ProductionTrust`.
- El build reproducible requiere PowerShell 7 por la serializacion estable del
  SBOM/manifest confiado. Acepta `DUCKDB_ARCHIVE_PATH` o
  `-DuckDBArchivePath`; si se aporta, no descarga de nuevo el ZIP DuckDB.
- Runtime reconstruido dos veces con Go 1.26.4 y GCC UCRT64 16.1.0: helper
  `065b6a9a...`, DLL `2b7468a4...`, manifest `132fd8b6...`, 37 paquetes,
  verificacion y handshake smoke PASS en el host Windows x64 actual.
- Harness PowerShell cubre path/inventario portable, runtime ausente,
  manipulado o con extra, ZIP ya creado manipulado, parametros reproducibles,
  scopes NSIS, rollback/uninstall y un modelo conductual con estados previos
  ambos/solo exe/solo runtime/ninguno, interrupciones antes/despues del commit,
  fallos de cleanup y reentrada. NSIS 3.x real compila los scopes `user` y
  `machine` con los cinco `File` exactos.
- Upgrade persiste `pending` con el inventario anterior antes de mutar y
  `committed` tras verificar el par nuevo. Antes del commit restaura exactamente
  presencia/ausencia anterior; despues del commit conserva el par nuevo y una
  reentrada solo reintenta limpieza. Los fallos de Rename/Delete/RMDir conservan
  estado recuperable. No existe mezcla de miembros entre versiones.
- El exe productivo permanece ausente durante extracción/verificación del
  runtime y durante la extracción de `wails.files` a
  `.vantare-install-stage`; sólo se publica con rename atómico inmediatamente
  antes de `committed`. Rollback elimina primero producto/staging nuevos,
  completa runtime y restaura el exe viejo al final mediante el mismo patrón
  staging+rename. El harness corta después de cada operación y exige par viejo,
  par nuevo o exe ausente; toda reentrada converge.
- Todas las rutas que eliminan `.vantare-install-stage` establecen antes un
  `OutDir` seguro en `$INSTDIR`; una regresión enumera las cinco eliminaciones y
  falla si el último `SetOutPath` todavía apunta al staging.
- Los flags `CGO_CFLAGS`, `CGO_CXXFLAGS` y `CGO_LDFLAGS` citan el argumento
  completo para el parser de Go/GCC. Una regresion compila C/C++ real y el build
  reproducible completo pasa con directorios temporales que contienen espacios.
- El updater no cambia: descarga y ejecuta este mismo installer. Checksums
  oficiales siguen cubriendo installer, ZIP y exe; el manifest cubre la unidad
  interna.
- Pendiente antes de publicar: instalar/actualizar/desinstalar de verdad y
  forzar rollback en Windows 11 x64; repetir smoke en Windows 10 x64 si sigue
  en soporte. Esta rama no instala ni publica artefactos.

## Límite visual

Estos dos cortes son exclusivamente backend/build. El trabajo se detendrá antes
de cualquier UI, captura de paridad o decisión visual. Ese corte se entregará a
un agente Claude Opus 5 con razonamiento `low` mediante el MCP de T3 Code, según
la instrucción de Isaac.
