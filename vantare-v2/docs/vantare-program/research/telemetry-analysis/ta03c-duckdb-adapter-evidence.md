# ISA-168 / TA-03C — evidencia del adapter DuckDB productivo

- Fecha: 2026-08-02
- Rama: `vantareapp/isa-168-ta-03c-adaptador-duckdb-productivo-y-packaging-windows`
- Base exacta ISA-135: `8ddae9d9d6e33d42956c269c2fc51e6a6e4386e3`
- Estado técnico histórico: cierre aprobado por review independiente en
  ISA-168; la entrega quedó entonces en review
- Integración verificada el 2026-08-10: ISA-204 / TA-N01 fue integrada en
  `nightly` por PR #94, squash
  `4e549bb59fd0b76398985cd28e5aa30aaaa85c32`; el contenido está presente en el
  snapshot de `origin/nightly`
  `08fcfc15dceb88b6a6b5c679d581d9de7b8ab698` y los tres checks del PR terminaron
  `SUCCESS`
- Pendiente: validación Nightly/Pro Plus y smoke físico Windows 10; no existe
  integración demostrada en `testers` ni `master`

## Resultado

Telemetry Analysis ya puede consumir un DuckDB sintético real mediante un
helper Windows x64 fuera del proceso Wails. El helper vive en un módulo Go
separado, enlaza dinámicamente la DLL oficial DuckDB 1.5.5 y solo acepta
operaciones tipadas. No acepta SQL, rutas arbitrarias ni contenido externo.

El flujo productivo es:

1. discovery y autorización TA-02;
2. staging en directorio privado con DACL reducida;
3. verificación de evidencia, WAL y hash;
4. verificación del bundle por manifest cuyo hash está compilado en Vantare;
5. apertura read-only en un helper acotado por Job Object;
6. catálogo/páginas tipadas por IPC stdin/stdout;
7. cancelación o cierre que termina exactamente el proceso propiedad del
   reader.

El Job Object y los límites son defensa de lifecycle y recursos; no se
describen como sandbox. Los archivos externos/comunitarios continúan bloqueados
por TA-03D / ISA-164.

## Integridad y frontera

- `go.mod` principal SHA-256 antes/después:
  `13b11e62138e0df2231b495b6bf1dd865587a49026e4dee98d7258e2ba7de9f2`.
- `go.sum` principal SHA-256 antes/después:
  `76642c2f41e29a48a5d5e13ee81aa395ba750c0854890b58a8216bc52ced661d`.
- El grafo de `cmd/vantare` con `CGO_ENABLED=0` contiene cero dependencias de
  DuckDB o del helper.
- El helper mantiene bloqueados manifest, binarios, notices, SBOM y copia
  staged durante su vida. La sustitución coordinada del bundle se rechaza.
- El proceso recibe exclusivamente `session.duckdb` staged, nunca la ruta
  original del usuario.
- DDL/DML, external access, autoload, autoinstall y extensiones comunitarias
  quedan desactivados; configuración DuckDB bloqueada.
- Límites: 2 threads, 256 MiB DuckDB, 64 MiB temporal, 384 MiB de proceso,
  16.384 filas/página y 64 MiB por frame.

## Runtime reproducible

El build productivo compila dos veces y exige SHA idéntico. Resultado final:

| Artefacto | Bytes | SHA-256 |
|---|---:|---|
| `vantare-telemetry-reader.exe` | 3.746.304 | `065b6a9a2ef2030ee9b3d384b8219b18f7fd3b912a5fd408962ffdd81ade6ac9` |
| `duckdb.dll` | 36.724.520 | `2b7468a4ad844429e6af2fde0b5f91893e8130a5686a88f11442ab547c7ede46` |
| `THIRD_PARTY_NOTICES.md` | 123.584 | `c1a33fa24c1cc87b893b78c21c1070db179e7232174804d81678bb663acee575` |
| `sbom.spdx.json` productivo | 31.794 | `780d3c8748f93d1221f98c3b7c554400de59ddcf6fdf20a780c5e922843c7b2b` |
| `manifest.json` | 613 | `132fd8b6ace1cf33680011275b821fe20b210111bcb8d57dabd3d1136ebe79c7` |

El SBOM conserva los 37 componentes aprobados. El SBOM de investigación es la
autoridad de licencias; el productivo cambia únicamente identidad, fecha,
versión y hash del helper entregado.

El gate de integración TA-N01 detectó que el hash confiado de la rama TA-03C no
correspondía al árbol final entregado. El fallo fue cerrado: no se cargó el
runtime ni se aceptó automáticamente. Se reconstruyó el árbol final dos veces
con Go 1.26.4 y GCC UCRT64 16.1.0, ambos binarios coincidieron, el inventario de
37 módulos/licencias permaneció exacto y se actualizó la confianza mediante el
flujo explícito `-UpdateTrustSource`. Una construcción limpia posterior sin ese
flag reprodujo los hashes de la tabla y el smoke Windows x64 terminó `PASS`.

`LoadRuntimeWithFallback` solo permite volver a otro bundle versionado cuyo
manifest tenga un hash confiado independiente. Nunca busca en `PATH` ni adopta
un directorio anterior no verificado.

## Rendimiento

Fixture sintética: 720.000 filas. La primera ejecución verde en un host con
menos contención leyó 50 páginas de 16.384 filas en 498,98 ms, 9,98
ms/página. Para no confundir regresión con la carga posterior de LMU, FL_2026
y otros gates, el cierre intercaló tres muestras de TA-03B y TA-03C bajo la
misma carga real del host (CPU observada entre 93 % y 100 %):

| Pareja | TA-03B ms/página | TA-03C ms/página |
|---:|---:|---:|
| 1 | 45,290 | 28,333 |
| 2 | 44,829 | 26,078 |
| 3 | 57,704 | 27,154 |

- mediana TA-03B: 45,290 ms/página;
- mediana TA-03C: 27,154 ms/página;
- ratio candidato/baseline: 0,5995×;
- gate comparativo: como máximo 2× el baseline equivalente, PASS;
- gate absoluto existente: menos de 47,68 ms/página, 3/3 PASS;
- sin creación de proceso por página: una sesión acotada y explícitamente
  cerrable reutiliza el mismo helper.

La paginación continua usa un rango `rowid` fijo. Evita volver a ordenar y
recorrer todo el prefijo para cada `OFFSET`. El IPC usa columnas tipadas
compactas; cero, `false`, texto vacío, NULL y tipos desconocidos siguen siendo
distintos.

## Lifecycle y degradación

- Cancelar una consulta coordinada termina el PID exacto del helper antes de
  devolver y un retry crea una sesión nueva funcional.
- `Reader.Close` termina el PID propio y libera handles.
- IDs de request antiguos y campos desconocidos se rechazan.
- El runtime ausente o alterado degrada Telemetry Analysis con
  `ErrRuntimeUnavailable`; no afecta a Telemetry Core live ni Wails.
- El VC++ Redistributable ausente produce `ErrVCRuntimeMissing` y el smoke
  ofrece un mensaje de instalación accionable.

## Checks

Resultados de cierre:

- build reproducible y manifest productivo: PASS;
- smoke real Windows x64 build `10.0.26200.0`: PASS;
- parser end-to-end, cancel/retry/close y benchmark: PASS;
- tests `internal/telemetryanalysis/...` x20: PASS;
- tests helper con `duckdb_use_lib` x20: PASS;
- race del proceso principal y del helper: PASS;
- fuzz decoder batch: 263.544 ejecuciones, PASS;
- fuzz decoder request: 126.769 ejecuciones, PASS;
- vet del proceso principal y del helper: PASS;
- frontend build y build Wails `CGO_ENABLED=0`: PASS;
- grafo y `go.mod`/`go.sum` principales sin DuckDB ni cambios: PASS;
- suite Go global final: PASS. Una repetición intermedia dejó un único fallo
  en `internal/app/TestConcurrentSavesDontCorruptFile`; el mismo flake se
  reprodujo en la base exacta ISA-135 (1/5) bajo la carga del host. No se tocó
  Ajustes desde este corte y la repetición global posterior cerró verde;
- el primer CI de TA-N01 reveló una aserción textual no portable en la prueba
  DACL: el runner canonizó el SID well-known del usuario como `LA`. La
  regresión enumera ahora las ACE y compara el SID binario con `SID.Equals`,
  sin relajar la DACL protegida ni permitir `Everyone`, `Users` o
  `Authenticated Users`; focal x20 local PASS;
- `git diff --check`: PASS;
- review independiente de staging/TOCTOU, DACL, manifest, locks, Job Object,
  lifecycle, protocolo, SQL allowlisted, tipos y packaging: `APPROVE`, cero
  P0/P1/P2/P3 razonables;
- verificación física Windows 10: no ejecutada en este host; el mismo smoke
  queda obligatorio en la matriz del instalador/release antes de publicar.
