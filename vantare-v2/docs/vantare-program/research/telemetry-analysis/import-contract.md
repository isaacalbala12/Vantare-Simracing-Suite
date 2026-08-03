# TA-02 — contrato de discovery, estabilidad y manifest

Estado: implementado en rama aislada ISA-124; pendiente de review técnico. Este
documento describe un contrato de importación, no un parser DuckDB ni un índice.

## Frontera del paquete

`internal/telemetryanalysis` pertenece al producto post-sesión y no importa
`internal/telemetry`. El corte usa exclusivamente la biblioteca estándar.

Hay dos puertas deliberadamente separadas:

1. `Discover` recibe un `MetadataSource`, cuya interfaz solo permite listar y
   consultar existencia. No existe un método para abrir contenido.
2. `BuildManifest` puede abrir el original en modo lectura únicamente después
   de recibir autorización explícita y un candidato con gate interno emitido
   por `StabilityTracker.Assess`. TA-02 exige siempre `user_approved`.
   `vantare_owned` queda rechazado hasta que recording aporte una capability
   no falsificable; una etiqueta de procedencia no puede sustituir el permiso.

Una UI o un indexador futuro no debe convertir `StateReady` en una asignación
manual: el campo visible describe el estado, pero el gate interno solo se emite
después de dos observaciones compatibles separadas por la ventana inyectada.

## Estados

| Estado | Significado | ¿Puede leer contenido? |
|---|---|---:|
| `active` | LMU tiene el `.wal` hermano presente | no |
| `stabilizing` | no hay WAL, pero tamaño/mtime aún no cumplieron la ventana | no |
| `ready` | WAL ausente y tamaño/mtime estables durante la ventana | habilita el siguiente gate |
| `incompatible` | formato no permitido por la política | no |
| `moved` | el resolver conoce una relocalización | no |
| `missing` | el original ya no existe | no |
| `error` | observación inválida o fallo sanitizado | no |

La ventana es configuración inyectada y debe ser positiva. Los tests avanzan
relojes explícitos; no usan `time.Sleep`. Una variación de tamaño o `mtime`
reinicia la ventana. Cada tracker conserva también la identidad del locator:
una segunda sesión nunca hereda la estabilidad de la primera. La presencia de
WAL siempre revoca el gate. Su ausencia se comprueba de nuevo inmediatamente
antes de abrir y después de leer; no basta con confiar en el snapshot de
discovery. No se lee el WAL, no se solicita ni fuerza un checkpoint y no se
muta el original.

## Manifest v1

El manifest contiene:

- versión;
- SHA-256 del contenido calculado solo después del gate;
- clave de deduplicación reproducible `hash + tamaño`;
- tamaño;
- tipo de fuente, formato y locator redactado;
- política `reference` o `managed_copy`;
- parser previsto mediante ID/versión obligatorios, sin instanciarlo; cuando no
  existe parser se usa explícitamente `none@0`;
- procedencia estructurada mediante tipo e ID de evidencia.

No contiene ruta, nombre de archivo, nombre de piloto, texto libre, bytes raw ni
identificadores personales. El locator productivo es
`<source>://<16 hex>`. Los IDs, formatos y procedencia aceptan únicamente
tokens acotados. Los errores de filesystem se traducen a códigos sanitizados.
`ValidateManifest` aplica exactamente la misma política al resultado
productivo y al fixture versionado.

`managed_copy` expresa la decisión del usuario en el contrato; TA-02 no copia
archivos. La copia atómica y el índice pertenecen a TA-05. De igual modo,
`ParserRef` no implica que exista un parser productivo: TA-03 debe seleccionar
la tecnología y normalizar el formato después de auditar el corpus.

## Corpus sanitizado

`internal/telemetryanalysis/testdata/corpus/` contiene:

- `synthetic-lmu-session.duckdb`: texto sintético, no es una base DuckDB y no
  contiene bytes de LMU ni una sesión real;
- `manifest.json`: hash, tamaño, dedupe y procedencia reproducibles.

La extensión reproduce el patrón de discovery sin afirmar compatibilidad del
contenido. El test del corpus pasa primero el mismo validador productivo,
recalcula hash/dedupe y busca marcadores de rutas o identidad. No se accedió a
`UserData\\Telemetry` ni a archivos personales para crear este fixture.

## Presupuestos y cancelación

- `Discover` exige un máximo de candidatos y se cancela entre entradas.
- `BuildManifest` exige un máximo de bytes, comprueba cancelación antes de abrir
  y durante la lectura, rechaza symlinks y compara tamaño, `mtime`, tipo e
  identidad antes y después. También valida el handle ya abierto mediante
  `os.SameFile`; los seams de test usan un token equivalente. Un reemplazo de
  archivo con el mismo tamaño/`mtime` o un cambio regular→symlink revoca el
  resultado.
- El original se abre con `os.Open`; no hay escritura, borrado, movimiento ni
  creación de goroutines.
- Los tests temporales comparan contenido, tamaño, `mtime` y modo antes/después.

## Verificación

```text
go test ./internal/telemetryanalysis -count=1
go test -race ./internal/telemetryanalysis -count=10
go test ./... -count=1
git diff --check
```

El fuzz `FuzzRedactLocator` demuestra que nombres y rutas arbitrarios se reducen
a un ID acotado sin separadores. Este corte no requiere frontend, Playwright,
DuckDB, LMU abierto, SimHub ni acceso a datos personales.
