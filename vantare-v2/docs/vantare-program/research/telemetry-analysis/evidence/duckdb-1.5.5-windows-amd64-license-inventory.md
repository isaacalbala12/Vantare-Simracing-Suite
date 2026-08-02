# DuckDB 1.5.5 Windows amd64 — inventario de componentes y licencias

- Fecha de verificación: 2026-08-01
- Tag/commit DuckDB: `v1.5.5` / `d8cdaa33fda8df955cc76ef58a280f68f4cd43fa`
- ZIP binario oficial SHA-256:
  `8375eb1fcf2212e8a0817950354815d4dde9dd383c2d9fa7b8975b71e278c1bd`
- `duckdb.dll` SHA-256:
  `2b7468a4ad844429e6af2fde0b5f91893e8130a5686a88f11442ab547c7ede46`
- ZIP fuente oficial SHA-256:
  `102813201cf8072b8a56b6013978963f3c89202a148fd152d06909477e36fbf8`
- SBOM SPDX 2.3:
  [`duckdb-1.5.5-windows-amd64.spdx.json`](duckdb-1.5.5-windows-amd64.spdx.json)

## Conclusión comercial

**Compatible con la distribución comercial de Vantare**, condicionada a
distribuir los textos completos de licencia y atribución correspondientes.
No se encontró una dependencia copyleft obligatoria en el artefacto elegido:

- Mbed TLS se toma bajo su opción `Apache-2.0`, no GPL.
- Zstandard se toma bajo su opción `BSD-3-Clause`, no GPLv2.
- El resto utiliza MIT, BSD, Apache-2.0, Boost, zlib o ICU.
- Las cuatro dependencias Go realmente enlazadas son MIT o BSD-3-Clause.

Esta conclusión describe el artefacto técnico exacto auditado; no sustituye
asesoramiento jurídico. Cualquier cambio de versión, extensión estática,
toolchain o grafo Go invalida el inventario y obliga a regenerar el SBOM.

## Cómo se obtuvo el inventario exacto

1. La release oficial confirmó los digests de ambos ZIP y el commit del tag.
2. El script construyó el helper y leyó su `go version -m`; solo cuatro módulos
   externos quedaron enlazados.
3. El propio `duckdb.dll` informó mediante `duckdb_extensions()` las cinco
   extensiones `STATICALLY_LINKED`.
4. El `duckdb.cpp` del ZIP fuente contiene 20 bloques de licencia vendorizados.
5. Los `CMakeLists.txt` del mismo commit muestran las dependencias adicionales
   de ICU, JSON y Parquet.
6. Cada licencia se descargó desde el commit fijado y se validó por SHA-256.
7. El SBOM corregido se generó dos veces en directorios limpios y produjo el
   mismo SHA:
   `0eb21309fc8ea57e33ea2bce7a437ddcd5ee16185f419f4cfb4d9ff8a35d1427`.

El `duckdb.dll` depende dinámicamente solo de componentes del sistema Windows:
`KERNEL32.dll`, `WS2_32.dll` y `RstrtMgr.DLL`. No se redistribuyen con Vantare.

## Artefactos Go enlazados

| Componente | Versión | Licencia | SHA-256 del texto |
|---|---|---|---|
| `duckdb-go/v2` | `v2.10505.0` | MIT | `1c80811f…ffaae` |
| `duckdb-go-bindings` | `v0.10505.0` | MIT | `075c3340…f14e3` |
| `mapstructure/v2` | `v2.5.0` | MIT | `22adc4ab…7f26` |
| `google/uuid` | `v1.6.0` | BSD-3-Clause | `0a8d61ed…4b2d` |

Los otros módulos presentes en `go.mod` pertenecen al grafo de resolución,
pero no aparecen en el build info del helper dinámico y no quedaron enlazados
en este ejecutable.

## Extensiones estáticas del DLL

| Extensión | Licencia propia | Dependencias vendorizadas relevantes |
|---|---|---|
| `autocomplete` | MIT (DuckDB) | ninguna adicional |
| `core_functions` | MIT (DuckDB) | dependencias core inventariadas abajo |
| `icu` | MIT (DuckDB) | ICU |
| `json` | MIT (DuckDB) | yyjson |
| `parquet` | MIT (DuckDB) | parquet-format, Thrift, Snappy, LZ4, Brotli, Zstandard y Mbed TLS |

El runtime productivo mantiene desactivadas instalación, carga automática y
extensiones comunitarias. Esta tabla describe código ya embebido en el DLL; no
autoriza descargar extensiones durante ejecución.

## Componentes vendorizados en DuckDB

La identidad exacta de cada fila es el commit DuckDB indicado, la ruta de
licencia y el hash completo registrado en `sbom-components.json` y el SBOM.

| Componente | Uso | Licencia declarada | Opción usada por Vantare |
|---|---|---|---|
| fmt | core | MIT | MIT |
| yyjson | core/JSON | MIT | MIT |
| utf8proc | core | MIT AND Unicode-3.0 | igual |
| Mbed TLS | core/Parquet | Apache-2.0 OR GPL-2.0-or-later | Apache-2.0 |
| FSST | core | MIT | MIT |
| miniz | core | MIT | MIT |
| fast_float | core | MIT | MIT |
| PCG | core | MIT | MIT |
| RE2 | core | BSD-3-Clause | BSD-3-Clause |
| vergesort | core | MIT | MIT |
| ska_sort | core | BSL-1.0 | BSL-1.0 |
| pdqsort | core | Zlib | Zlib |
| jaro_winkler | core | MIT | MIT |
| HyperLogLog | core | MIT | MIT |
| cpp-httplib | core | MIT | MIT |
| concurrentqueue + lightweight semaphore | core | (BSD-2-Clause OR BSL-1.0) AND Zlib | BSD-2-Clause AND Zlib |
| libpg_query | core | BSD-3-Clause | BSD-3-Clause |
| FastPFor | core | Apache-2.0 | Apache-2.0 |
| Zstandard | core/Parquet | BSD-3-Clause OR GPL-2.0-only | BSD-3-Clause |
| skiplist | core | MIT | MIT |
| Brotli | Parquet | MIT | MIT |
| LZ4 | Parquet | BSD-2-Clause | BSD-2-Clause |
| parquet-format | Parquet | Apache-2.0 | Apache-2.0 |
| Snappy | Parquet | BSD-3-Clause | BSD-3-Clause |
| Apache Thrift | Parquet | Apache-2.0 | Apache-2.0 |
| ICU | ICU | ICU | ICU |

No se incluyeron componentes presentes en el repositorio fuente que no están
en el core amalgamado ni en las cinco extensiones estáticas del DLL auditado.
Por ejemplo, su mera existencia bajo `third_party/` no prueba inclusión.

## Obligaciones de distribución

TA-03C debe producir `THIRD_PARTY_NOTICES.md` desde este inventario y contener,
como mínimo:

- licencia MIT completa de DuckDB y de cada componente MIT aplicable;
- avisos BSD, Boost, zlib, ICU y Unicode;
- Apache License 2.0 y atribuciones aplicables;
- elecciones explícitas Apache-2.0 para Mbed TLS y BSD-3-Clause para Zstd;
- licencias de las cuatro dependencias Go enlazadas;
- versión, procedencia y hashes del runtime.

El ZIP binario oficial no incorpora todos esos textos. Por tanto, no basta con
redistribuir el ZIP o citar la licencia principal de DuckDB. Installer y
portable deben contener exactamente el mismo notice generado y el pipeline
debe fallar si cambia el SBOM o aparece una licencia fuera de la allowlist.

## Reproducción

Desde `spikes/ta03b`:

```powershell
./generate-sbom.ps1
```

El comando:

- descarga y verifica los dos assets oficiales;
- valida todos los miembros utilizados del ZIP binario;
- construye el helper de manera reproducible;
- consulta la versión y extensiones del DLL;
- valida las licencias contra el commit del tag;
- comprueba el grafo realmente enlazado mediante build info;
- escribe el SPDX determinista.

Si cualquier hash, extensión, módulo o licencia cambia, el comando falla antes
de generar un SBOM nuevo.
