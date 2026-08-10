# STR-15B — Catálogo oficial firmado de Strategy

## Resultado

ISA-162 añade una segunda biblioteca, `Planes de Vantare`, separada de
`Mis planes`. La aplicación solo muestra bundles que Go haya verificado con
una raíz pública de confianza: firma Ed25519, bytes exactos de manifest y
payload, checksum, longitud, secuencia, ventana de clave, compatibilidad y
paquetes Strategy completos. Un catálogo ausente o inválido nunca se convierte
en una lista vacía exitosa ni en planes de ejemplo.

No se publica todavía ningún plan oficial real. Este corte entrega el contrato,
verificador, caché, generador, pipeline y UI; el contenido y las claves de
producción requieren aprobación y configuración posteriores.

## Formato y firma

El envelope `strategy.official-catalog.bundle.v1` contiene `manifest`,
`payload` y `signature`. Manifest y payload viajan como bytes JSON exactos. La
firma usa Ed25519 sobre:

```text
vantare.strategy.official-catalog.v1
+ uint64 big-endian con la longitud del manifest
+ bytes exactos del manifest
+ bytes exactos del payload
```

El manifest fija secuencia positiva, fecha UTC canónica, `keyId`,
`minimumTrustVersion`, SHA-256 y longitud del payload. El payload ordena las
entradas por ID. Cada entrada declara simulador, circuito, coche y evento, y
contiene exactamente un paquete `strategy.package.v1` sin draft, con al menos
una revisión y procedencia `vantare`.

Los parsers rechazan campos desconocidos, claves JSON duplicadas, trailing
data, profundidad/tamaño excesivos, base64 no canónico, checksum o firma
incorrectos, claves fuera de ventana, paquetes incompletos y secuencias en
retroceso o conflictivas.

## Claves y rotación

El keyset público `strategy.official-catalog.trust.v1` tiene una versión
positiva y ventanas de secuencia por clave. En builds empaquetadas, endpoint y
keyset embebidos son una unidad indivisible y no pueden sustituirse desde el
entorno. Solo una build de desarrollo sin configuración embebida permite el
opt-in por variables públicas.

Rotación segura:

1. generar una build con keyset de versión superior que incluya la clave nueva
   y conserve temporalmente la anterior;
2. desplegar esa build antes de exigir la nueva versión;
3. publicar bundles con `minimumTrustVersion` igual a la versión ya desplegada
   y con la nueva clave dentro de su ventana;
4. cerrar la ventana de la clave anterior únicamente en una build posterior.

Una build con keyset anterior rechaza un manifest que exija una versión
superior. La clave privada nunca entra en la aplicación, el generador de
configuración ni el repositorio.

## Caché, offline y rollback

La caché vive en `<strategy-root>/official-catalog` y conserva `current` y
`previous`. Un candidato se verifica por completo antes de escribir. El
reemplazo es atómico también en Windows y un error comunicado después del
replace se reconcilia leyendo y verificando el fichero realmente persistido.

Si `current` falta o está corrupto, solo un `previous` verificable puede
recuperarse. Sin last-known-good verificable, load/refresh devuelven
indisponibilidad; nunca éxito vacío. Un fallo de red conserva el LKG como
`offline`; un candidato rechazado conserva el LKG como `stale`.

Para revertir contenido publicado no se reutiliza un bundle de secuencia
menor. Se genera un bundle nuevo, con secuencia superior, que contiene el
contenido aprobado al que se desea volver. La UI identifica `recovered`,
`stale` y `offline` como último catálogo verificado.

## Generación reproducible

El CLI recibe únicamente:

```text
strategy-catalog -manifest <path> -output <path> \
  -trusted-keys <path> \
  -private-key-env VANTARE_STRATEGY_CATALOG_SIGNING_KEY
```

El manifest fuente, el keyset público usado para autoverificar y todos los
paquetes deben permanecer bajo el directorio real del manifest; paths
absolutos, escapes `..` y symlinks de salida se rechazan. Entradas idénticas
producen bytes idénticos. La privada se lee como seed/key Ed25519 base64url
desde la variable nombrada, no se acepta por argumento, no se imprime y no se
persiste.

`.github/workflows/strategy-catalog.yml` solo admite `workflow_dispatch`.
Valida que el manifest permanezca dentro de `vantare-v2/strategy-catalog` y
que el keyset resuelto permanezca dentro del directorio real de ese manifest,
ejecuta los tests, firma dos veces en directorios temporales, compara bytes y
SHA-256 y sube únicamente `strategy-catalog.json` y su `.sha256`. No crea
release, tag, commit ni push. El job solo puede ejecutarse desde `master` y usa
el environment protegido `strategy-catalog-signing`; antes de usarlo hay que
configurar en GitHub un revisor obligatorio, limitar sus deployment branches a
`master` y guardar la privada exclusivamente como secret de ese environment.

## Configuración

| Nombre | Clasificación | Consumidor |
| --- | --- | --- |
| `VANTARE_STRATEGY_CATALOG_URL` | pública | generador de build; entorno solo en desarrollo sin valor embebido |
| `VANTARE_STRATEGY_CATALOG_TRUSTED_KEYS` | pública | generador de build; entorno solo en desarrollo sin valor embebido |
| `VANTARE_STRATEGY_CATALOG_SIGNING_KEY` | secreta | únicamente el step de firma del workflow manual |

El workflow de release transporta las dos variables públicas al generador
`tools/generate_supabase_config.ps1` cuando estén configuradas. Una build
empaquetada se marca siempre como tal: si ambas faltan o son inválidas, el
bridge falla cerrado y no consulta el entorno del proceso para crear otra raíz
de confianza. La pestaña no afirma que exista contenido oficial.

## Runtime y UI

- Entrada Wails: `strategy:catalog:command` con `load` o `refresh`.
- Salidas: `strategy:catalog:result` y `strategy:catalog:error`.
- Cliente HTTPS con timeout de 15 segundos y redirects rechazados.
- Bridge y cliente TS preservan `requestId`, ignoran eventos sin correlación
  exacta, cancelan listeners por timeout o dispose y exponen solo errores
  públicos estables. El cliente espera 20 segundos, por encima del timeout de
  red de 15 segundos del backend.
- El cliente limita cada paquete a 4 MiB y el agregado decodificado del
  catálogo a 16 MiB antes de retenerlo en memoria.
- `Planes de Vantare` y `Mis planes` son tabpanels distintos; nunca se
  concatenan las listas.
- La UI muestra firma verificada, key ID, secuencia, trust version y fecha, sin
  inventar un digest que el read model no contiene.
- `Guardar en Mis planes` ejecuta preview dry-run y solo escribe tras una
  confirmación contra la versión observada del repositorio. No abre workspace
  ni activa el plan.

## Verificación manual

1. En una build de desarrollo, configurar URL HTTPS y keyset públicos válidos.
2. Abrir Strategy Planner: `Mis planes` debe conservar su lista privada.
3. Cambiar a `Planes de Vantare`: comprobar estado, evidencia y compatibilidad.
4. Desconectar la red y actualizar: el LKG debe seguir visible como offline.
5. Servir un bundle alterado y actualizar: las cards verificadas deben
   permanecer, marcadas stale, sin adoptar el candidato.
6. Elegir `Guardar en Mis planes`: comprobar preview, confirmar y verificar que
   aparece tras recargar `Mis planes`, sin abrirse ni activarse.

## Evidencia y límites

- Tests focales Go/TS, repetición 20x de catálogo/CLI/Wails, vet, gofmt, Go
  global, variante `production`, typecheck real, ESLint focal, suite frontend
  completa (358 archivos / 2493 tests) y build: PASS tras rebasear sobre
  `origin/nightly@ff286f4`. El
  lint global se ejecutó y conserva 39 errores y 2 warnings preexistentes fuera
  de los archivos de esta issue; no se declara verde.
- El workflow real no se ejecutó: no existen manifest oficial aprobado ni
  secret de producción configurado, y el environment protegido descrito arriba
  sigue siendo un prerrequisito operativo externo.
- Los eventos nuevos no se probaron todavía contra una aplicación Wails viva.
- `go test -race` no está disponible en este entorno con `CGO_ENABLED=0`.
- No se añadieron dependencias, telemetría, Shared Memory, REST de simulador,
  DuckDB, storage de Telemetry Analysis, catálogo community ni fallback
  sintético.
