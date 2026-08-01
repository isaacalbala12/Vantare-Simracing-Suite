# ISA-135 / TA-03B — decisión y packaging del adapter DuckDB en Windows

- Fecha de decisión propuesta: 2026-08-01
- Estado: investigación y spike cerrados; decisión pendiente de aprobación
- Ámbito: Telemetry Analysis histórico, Windows 10/11 x64
- Fuera de ámbito: UI, Telemetry Core live, archivos reales de LMU y cambios
  en dependencias del producto

## Resumen ejecutivo

La opción recomendada es un **helper local, corto y propiedad de Vantare** que:

1. se ejecuta solo durante la importación histórica;
2. usa `duckdb-go/v2` como cliente oficial de alto nivel;
3. enlaza dinámicamente el `duckdb.dll` oficial y fijado;
4. vive fuera del proceso Wails y fuera del pipeline live;
5. recibe operaciones tipadas, nunca SQL arbitrario;
6. abre únicamente una copia estable y autorizada por TA-02;
7. aplica read-only, límites de CPU/memoria/tiempo y configuración segura;
8. termina al completar o cancelar la operación.

No es un microservicio, daemon ni segundo producto. Es un adaptador de proceso
local que conserva la aplicación principal en `CGO_ENABLED=0` y contiene el
riesgo nativo de DuckDB.

Se descartan:

- **DuckDB dentro de Wails:** amplía el dominio de crash/memoria, obliga a
  cambiar el build principal y mezcla análisis pesado con la app y LMU.
- **CLI oficial como sidecar:** DuckDB advierte expresamente que su CLI está
  diseñado para interacción y no recomienda incrustarlo; incluye comandos de
  shell y una superficie mayor de la necesaria.
- **bindings directos:** `duckdb-go-bindings` es una capa de bajo nivel en
  evolución. `duckdb-go/v2` ya es el cliente primario mantenido por DuckDB y
  ofrece `database/sql`, contextos y tipos.
- **helper con enlace estático precompilado:** el spike reprodujo una
  incompatibilidad real entre las librerías estáticas 1.5.5 y MSYS2 UCRT64 GCC
  16 tras el cambio de TLS nativo. Fijar una toolchain antigua ocultaría deuda
  y haría más frágil la release.

## Decisión humana requerida

TA-03C no debe comenzar hasta que Isaac apruebe explícitamente:

- añadir `github.com/duckdb/duckdb-go/v2@v2.10505.0` **solo al módulo del
  helper**, no al `go.mod` de la app principal;
- redistribuir `duckdb.dll` 1.5.5 y sus avisos MIT;
- añadir unos **44,18 MB sin comprimir** al paquete Windows actual
  (7.458.757 bytes de helper + 36.724.520 bytes de DLL en el spike);
- detectar/instalar Microsoft Visual C++ Redistributable como prerrequisito;
- versionar e instalar helper y DLL de forma atómica con Vantare.

La licencia no impide un producto comercial: DuckDB, `duckdb-go`, sus bindings
y `mapstructure` usan MIT; `google/uuid` usa BSD-3-Clause. `go list -deps` del
spike dinámico mostró únicamente esas cuatro familias externas enlazadas al
helper. La obligación operativa es conservar los avisos de copyright y licencia
en `THIRD_PARTY_NOTICES` y en el paquete distribuido. El grafo completo del
módulo es mayor que el binario realmente enlazado; TA-03C debe generar SBOM y
repetir un escaneo de licencias sobre el artefacto exacto, incluida cualquier
third-party notice que acompañe al `duckdb.dll`, antes de release.

## Restricciones comprobadas en Vantare

- La aplicación usa Wails v3 y el build Windows normal declara
  `CGO_ENABLED=0` por defecto.
- El release actual produce exactamente ejecutable, instalador, portable ZIP y
  checksums. No conoce helpers ni DLL adicionales.
- `LMUDuckDBReader` ya mantiene `database/sql`, CGO y DuckDB fuera del modelo
  histórico.
- `AuthorizedHistoricalArtifact` ya exige permiso, hash, tamaño, mtime,
  identidad y ausencia de WAL antes de que el parser lea.
- El parser limita una página a 16.384 filas y revalida evidencia antes y
  después de catálogo/página.
- Telemetry Core live no debe importar este adapter ni competir con él.

## Criterios de decisión

| Criterio | Peso | Motivo |
|---|---:|---|
| Integridad y privacidad | crítico | Un archivo activo, cambiado o no autorizado no puede leerse. |
| Aislamiento de fallos | crítico | Un fallo nativo no debe derribar Wails, overlays ni Engineer. |
| Build Windows reproducible | crítico | Debe funcionar en CI y en Windows 10/11 sin toolchain implícita. |
| Superficie de ataque | crítico | No se permite SQL, shell, extensión o red arbitrarios. |
| Cancelación y límites | alto | El análisis nunca debe degradar LMU ni quedar colgado. |
| Tipos y fidelidad | alto | NULL, cero, bool, enteros, tiempos y tipos desconocidos no se colapsan. |
| Packaging/rollback | alto | La app, el helper, la DLL y el protocolo deben permanecer compatibles. |
| Coste de distribución | medio | El tamaño importa, pero no vence a seguridad o reproducibilidad. |
| Simplicidad mantenible | alto | Evitar un daemon, RPC genérico o framework de plugins. |

## Matriz comparativa

Escala: 1 = inaceptable, 3 = viable con deuda, 5 = adecuado.

| Opción | Seguridad | Aislamiento | Build app | Reproducibilidad actual | Packaging | Mantenibilidad | Veredicto |
|---|---:|---:|---:|---:|---:|---:|---|
| `duckdb-go/v2` estático dentro de Wails | 2 | 1 | 1 | 1 | 4 | 3 | Rechazada |
| `duckdb-go/v2` + DLL dentro de Wails | 2 | 1 | 2 | 4 | 2 | 3 | Rechazada |
| CLI oficial gestionado como sidecar | 1 | 4 | 5 | 5 | 3 | 2 | Rechazada por guía oficial |
| Helper propio + enlace estático | 4 | 5 | 5 | 1 | 4 | 3 | No viable con GCC 16 actual |
| **Helper propio + `duckdb-go/v2` + DLL** | **5** | **5** | **5** | **5** | **3** | **5** | **Recomendada** |

## Análisis de las alternativas

### 1. Driver oficial dentro del proceso Wails

Ventajas:

- menos archivos y sin IPC;
- acceso directo al puerto `LMUDuckDBReader`;
- cancelación disponible mediante `database/sql`.

Problemas decisivos:

- fuerza CGO en el binario principal, hoy construido sin CGO;
- cualquier crash nativo, fuga o presión de memoria afecta a toda la suite;
- un análisis pesado compite en el mismo proceso con shell, overlays y runtime;
- el binario estático crece y queda ligado a una toolchain C++ concreta;
- actualizar DuckDB exige reemplazar toda la aplicación.

No compensa ahorrar un protocolo pequeño a cambio de ampliar el blast radius.

### 2. CLI oficial como sidecar

Ventajas:

- binario oficial y autónomo;
- `-readonly`, `-json` y `-safe` reducen parte del riesgo;
- no introduce CGO en Vantare.

Problemas decisivos:

- la documentación de seguridad de DuckDB desaconseja el CLI para embedding;
- incluye dot-commands y capacidad de shell que Vantare no necesita;
- aceptar SQL por argumentos o stdin hace más difícil probar una allowlist;
- el formato textual/JSON añade quoting, tamaño, streaming y tipos ambiguos;
- no implementa por sí mismo el contrato TA-02 ni un handshake propio.

Puede seguir usándose como herramienta manual de investigación, nunca como
adapter de producción.

### 3. Bindings directos

No ofrecen una ventaja demostrada frente a `duckdb-go/v2`. Incrementan el
código nativo que Vantare tendría que poseer, probar y mantener. El repositorio
de bindings declara todavía posibles wrappers ausentes y breaking changes. La
decisión correcta es depender del cliente primario y encapsularlo tras el
proceso helper.

### 4. Helper propio con enlace estático

Era la preferencia inicial por producir un solo archivo. El spike la descartó
en el entorno actual:

- `duckdb-go/v2@v2.10505.0` trae librerías estáticas precompiladas;
- MSYS2 UCRT64 GCC 16.1.0 no pudo enlazarlas;
- el error real fue ausencia de
  `__emutls_v._ZSt11__once_call` y
  `__emutls_v._ZSt15__once_callable`;
- MSYS2 documenta que GCC 16 cambió a TLS nativo y retiró esos símbolos, por lo
  que binarios externos antiguos deben recompilarse.

Fijar GCC 15 o construir DuckDB completo desde fuente sería posible, pero
introduce una cadena de suministro y tiempos de build propios sin beneficio de
producto. TA-03C no debe asumirla.

### 5. Helper propio con enlace dinámico oficial

El paquete oficial `libduckdb-windows-amd64` 1.5.5:

- está publicado por DuckDB con SHA-256 oficial;
- contiene `duckdb.dll`, headers y librería de importación;
- enlazó con el GCC 16.1.0 actual;
- produjo un helper reproducible con `-trimpath -buildid=`;
- mantiene el código nativo fuera de Wails;
- permite sustituir app/helper/DLL como una unidad versionada.

Es la opción con menor incertidumbre demostrada.

## Arquitectura propuesta

```text
AuthorizedHistoricalArtifact (TA-02)
              |
              v
staging privado desde handle autorizado
  - copia estable sin WAL
  - hash/size/identity antes y después
              |
              v
adapter Go sin CGO en la app
  - valida manifest del helper
  - inicia ruta absoluta conocida
  - aplica timeout/cancelación/Job Object
              |
       stdin/stdout tipado
              |
              v
vantare-telemetry-reader.exe (CGO)
  - duckdb-go/v2
  - duckdb.dll 1.5.5
  - read_only + hardening
  - consultas fijas y límites
              |
              v
LMUDuckDBCatalog / LMUDuckDBRow
```

El helper nunca conoce Telemetry Core, Wails, usuario, licencia, UI, overlays,
Strategy o Engineer.

## Protocolo mínimo

No se recomienda gRPC, HTTP local, sockets persistentes ni una dependencia de
serialización adicional. TA-03C debe usar mensajes JSON limitados y
versionados, uno por línea o con prefijo de longitud, por stdin/stdout:

### Handshake

- `protocol_version`;
- `helper_version`;
- `duckdb_version`;
- `schema_version`;
- operaciones soportadas.

### Operaciones permitidas

- `catalog`;
- `read_rows` con `source_table`, `start` y `limit`;
- `evidence` sobre la copia gestionada;
- `shutdown` solo si se elige proceso reutilizable dentro de una importación.

No existe operación `query`, `execute`, `attach`, `copy`, `install`, `load` ni
ningún campo SQL.

### Límites mínimos

- una importación activa por helper;
- máximo 16.384 filas por respuesta;
- `start >= 0` y suma comprobada contra overflow;
- frame de entrada máximo 64 KiB;
- frame de salida máximo 64 MiB, con fallo explícito;
- texto individual máximo 64 KiB;
- catálogo con presupuestos ya definidos por TA-03;
- timeout de arranque/handshake 5 s;
- catálogo 15 s y página 30 s como topes iniciales medibles;
- máximo dos threads DuckDB;
- `memory_limit` inicial 256 MiB;
- proceso dentro de un Job Object con kill-on-close y límite de memoria
  coherente con el límite DuckDB.

Los tiempos son límites de seguridad, no SLA. Los benchmarks de TA-03C podrán
reducirlos o justificadamente ampliarlos sin cambiar el contrato público.

## Integridad, WAL y TOCTOU

En Windows, `os/exec.ExtraFiles` no permite pasar de forma portable el handle
abierto al proceso hijo. Pasar solo la ruta original reabriría una ventana
TOCTOU. Por tanto:

1. TA-02 autoriza el artefacto original y abre el handle comprobado.
2. La app crea una copia privada mediante ese handle, nunca reabriendo por una
   ruta elegida por el helper.
3. Antes y después de copiar se validan identidad, tamaño, mtime, hash y
   ausencia de WAL del original.
4. La copia se guarda bajo un directorio temporal propio con ACL normal del
   usuario, nombre no controlado y sin WAL hermano.
5. El helper recibe únicamente la ruta absoluta de esa copia gestionada y la
   evidencia esperada.
6. El helper valida hash/tamaño antes de abrir, usa read-only y repite la
   evidencia al finalizar.
7. El adapter destruye la copia al cerrar la importación, salvo que el usuario
   haya solicitado explícitamente conservar una copia gestionada.

Si cualquier evidencia cambia, la operación termina como
`ErrHistoricalArtifactChanged`; nunca intenta checkpoint, recovery o apertura
del WAL.

## Seguridad de DuckDB

El helper aplicará antes de cualquier consulta:

- `access_mode=read_only` en DSN;
- `threads=2`;
- `memory_limit='256MB'`;
- `autoinstall_known_extensions=false`;
- `autoload_known_extensions=false`;
- `allow_community_extensions=false`;
- `enable_external_access=false`;
- `lock_configuration=true` al final.

Además:

- no se carga `.duckdbrc` ni configuración del usuario;
- no se instala ni carga ninguna extensión;
- no existe red ni URL en el protocolo;
- no se usa shell para iniciar el helper;
- el ejecutable se resuelve por ruta absoluta junto a la app;
- su hash y el de la DLL se comprueban contra el manifest instalado;
- stderr solo contiene códigos y mensajes sanitizados, nunca rutas o valores;
- el helper opera con los privilegios del usuario, sin elevación.

## SQL e identificadores

Los parámetros protegen valores, no identificadores. TA-03C debe:

- construir solo plantillas SQL fijas;
- aceptar `source_table` exclusivamente si apareció en el catálogo congelado;
- citar identificadores duplicando `"` y encerrándolos entre `"..."`;
- pasar `LIMIT` y `OFFSET` como parámetros comprobados;
- no interpolar expresiones, columnas o cláusulas del cliente;
- ordenar de manera determinista según el contrato de TA-03.

El spike verificó correctamente un nombre de tabla que contiene una comilla.

## Tipos y NULL

El IPC debe usar una unión escalar etiquetada y no un `map[string]any`:

- `null`;
- `boolean`;
- `integer`;
- `number`;
- `text`;
- `unknown` con tipo DuckDB original, sin valor inventado.

Los ceros y `false` permanecen presentes. `NULL` es distinto de cero y de
cadena vacía. Los tipos temporales deben conservar precisión/unidad explícita;
`DECIMAL`, JSON, BLOB, listas y estructuras quedan `unknown` hasta que un
golden demuestre su representación. El cliente oficial advierte cambios
específicos de scan para JSON, otra razón para no exponer `any` directamente.

## Cancelación y lifecycle

La app inicia el helper con `exec.CommandContext` y `WaitDelay` acotado. La
cancelación:

1. cancela la request activa;
2. el helper usa `QueryContext`/`ExecContext`;
3. cierra filas, conexión y connector;
4. si no termina, el padre mata el proceso;
5. cerrar el Job Object termina cualquier descendiente inesperado;
6. se drenan/cortan pipes sin goroutines huérfanas;
7. una respuesta tardía se descarta por request ID/generación.

Un helper completado o fallido no se reutiliza entre usuarios ni sesiones.
Puede reutilizarse durante páginas de una misma importación para evitar el coste
de arranque, siempre bajo una única generación y catálogo congelado.

## Packaging, actualización y rollback

El release debe tratar estos archivos como una unidad:

```text
vantare.exe
runtime/telemetry/v1/vantare-telemetry-reader.exe
runtime/telemetry/v1/duckdb.dll
runtime/telemetry/v1/manifest.json
THIRD_PARTY_NOTICES.md
```

`manifest.json` contiene como mínimo:

- versión del protocolo;
- versión del helper;
- versión DuckDB;
- arquitectura y SO;
- tamaño y SHA-256 de helper/DLL;
- compatibilidad mínima/máxima con la app;
- licencia/notice esperados.

Reglas:

- build de helper separado, con Go/toolchain/versiones fijados;
- SBOM y allowlist de licencias del grafo realmente enlazado;
- descarga de `libduckdb` solo en CI, desde URL oficial y con SHA publicado;
- ninguna descarga en runtime;
- installer y portable ZIP incluyen exactamente el mismo runtime;
- verificación de checksums antes de publicar y al arrancar el helper;
- instalación atómica en directorio versionado;
- rollback de la app selecciona su runtime compatible anterior;
- nunca mezclar helper nuevo con DLL anterior;
- conservar como máximo la versión activa y la anterior para rollback;
- si falta/está alterado el runtime, Telemetría queda no disponible con error
  accionable; el resto de Vantare sigue funcionando.

El pipeline de release actual necesita otro microcorte: su allowlist solo acepta
los seis artefactos históricos y no inspecciona contenidos del ZIP/installer.
TA-03C debe demostrar build del runtime; la integración completa en instalador,
portable, updater y rollback debe cerrarse antes de cualquier release, sin
convertirla en dependencia de TA-04 para desarrollar el parser.

## Compatibilidad Windows y Wails

- Objetivo: Windows 10 y 11 x64.
- El helper no se carga dentro del WebView ni del proceso Wails.
- La app principal conserva `CGO_ENABLED=0`.
- El helper requiere CGO únicamente en build.
- El runtime dinámico requiere Microsoft Visual C++ Redistributable; el
  instalador debe detectarlo o instalarlo mediante el canal oficial.
- El `duckdb.dll` descargado para el spike tenía firma Authenticode válida de
  `Stichting DuckDB Foundation` y SHA-256
  `2b7468a4ad844429e6af2fde0b5f91893e8130a5686a88f11442ab547c7ede46`.
- La firma de terceros no sustituye los checksums ni la futura firma propia del
  helper Vantare.

## Spike reproducible

Ubicación:
[`spikes/ta03b`](spikes/ta03b/README.md).

El spike no toca el producto y genera solo en `%TEMP%`:

- DuckDB sintético de 720.000 filas;
- tabla continua, catálogo, eventos y metadata sintéticos;
- tipos double/integer/bool/text/NULL;
- identificador con comillas;
- ejecutable y DLL desechables.

Entorno observado:

- Windows amd64;
- Go 1.26.4;
- MSYS2 UCRT64 GCC 16.1.0;
- `duckdb-go/v2` 2.10505.0;
- DuckDB/libduckdb 1.5.5.

Resultado reproducible en dos directorios limpios:

| Métrica | Resultado |
|---|---:|
| Build frío | 8.084–8.619 ms |
| Helper | 7.458.757 bytes |
| `duckdb.dll` | 36.724.520 bytes |
| Total sin comprimir | 44.183.277 bytes |
| SHA helper en dos rutas | idéntico (`bb70e10…efd2`) |
| Apertura read-only | 17–20 ms |
| Creación fixture 720k | 384–385 ms |
| Página 16.384 filas | 19,10–20,00 ms media en muestra corta |
| Muestra repetida 50 páginas | 20,72–23,84 ms/página |
| Hash DB antes/después | estable |
| Escritura en read-only | rechazada |
| Cancelación | observada |
| Tipos/NULL/cero | preservados |
| Identificador citado | aceptado |

El benchmark no demuestra rendimiento final de LMU: es una prueba sintética de
factibilidad y regresión. TA-03C debe repetirla en CI y, después, sobre el
artefacto LMU autorizado ya caracterizado sin versionarlo.

## Riesgos residuales

| Riesgo | Severidad | Mitigación/gate |
|---|---|---|
| Nueva dependencia nativa | P1 | Aprobación explícita, pin, notices, CVE/release watch. |
| Aviso transitive omitido | P1 | SBOM y escaneo de licencias del helper/DLL exactos. |
| Helper/DLL incompatibles | P1 | Manifest y handshake; instalación/rollback atómicos. |
| TOCTOU entre procesos | P1 | Copia desde handle autorizado; hashes antes/después. |
| DB maliciosa/agota recursos | P1 | Proceso separado, Job Object, límites DuckDB, timeout. |
| Build GCC cambia otra vez | P2 | Enlace dinámico oficial y job de CI reproducible. |
| VC++ Redistributable ausente | P2 | Detección/instalación y smoke en máquina limpia. |
| DLL/helper manipulados | P1 | Ruta absoluta, hashes de manifest, firma/checksum. |
| Tipo DuckDB no soportado | P2 | `unknown`, error por canal, nunca coerción inventada. |
| Incremento de tamaño | P3 | Aceptado conscientemente; medir ZIP/installer reales. |
| Actualización de DuckDB | P2 | Issue explícita con fixtures, compatibility y rollback. |

## Fuentes primarias

Consultadas el 2026-08-01:

- [Cliente Go oficial de DuckDB](https://github.com/duckdb/duckdb-go): versión,
  cliente primario, MIT, Windows/CGO, enlace estático/dinámico, DSN read-only,
  connector y tipos.
- [Bindings Go oficiales](https://github.com/duckdb/duckdb-go-bindings):
  librerías precompiladas, plataformas y estado de la capa de bajo nivel.
- [Instalación oficial DuckDB](https://duckdb.org/install/): artefactos 1.5.5,
  SHA-256 de `libduckdb-windows-amd64` y requisito VC++.
- [Release DuckDB 1.5.5](https://github.com/duckdb/duckdb/releases/tag/v1.5.5):
  versión actual y correcciones publicadas.
- [Licencia de DuckDB](https://github.com/duckdb/duckdb/blob/main/LICENSE),
  [licencia duckdb-go](https://github.com/duckdb/duckdb-go/blob/main/LICENSE) y
  [licencia bindings](https://github.com/duckdb/duckdb-go-bindings/blob/main/LICENSE):
  términos MIT.
- [CLI de DuckDB](https://duckdb.org/docs/stable/clients/cli/overview):
  opciones y comportamiento del ejecutable interactivo.
- [Guía oficial para embedding seguro](https://duckdb.org/docs/current/operations_manual/securing_duckdb/embedding_duckdb):
  rechazo del CLI como componente embebido y reducción de capacidades.
- [Seguridad DuckDB](https://duckdb.org/docs/current/operations_manual/securing_duckdb/overview),
  [extensiones](https://duckdb.org/docs/current/operations_manual/securing_duckdb/securing_extensions),
  [configuración](https://duckdb.org/docs/stable/configuration/overview) y
  [concurrencia](https://duckdb.org/docs/current/connect/concurrency):
  restricciones, read-only y límites.
- [Build de DuckDB en Windows](https://duckdb.org/docs/current/dev/building/windows):
  soporte y alternativa de enlace del cliente Go.
- [Cambio TLS de MSYS2/GCC 16](https://www.msys2.org/news/#2026-05-11-native-thread-local-storage-tls-with-gcc-16):
  retirada de símbolos `emutls` y necesidad de reconstruir binarios externos.
- [`os/exec.CommandContext`](https://pkg.go.dev/os/exec#CommandContext) y
  [`database/sql.DB.QueryContext`](https://pkg.go.dev/database/sql#DB.QueryContext):
  cancelación del proceso y de consultas.
- [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects):
  límites y terminación conjunta del proceso aislado.

## Veredicto

**GO condicionado para TA-03C** con helper dinámico aislado. No hay GO para
añadir DuckDB al proceso principal ni para usar el CLI como runtime. El único
bloqueo humano es aceptar dependencia, tamaño, redistribución y packaging.
