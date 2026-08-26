# TA-04F8 — protocolo preregistrado de corte visual descriptivo sanitizado

Estado: Gate 1, plan documental previo al runner hijo, a la extracción y a
cualquier nueva apertura de datos. Este commit **solo crea el plan**: no
implementa runner, no genera JSON ni SVG, no abre DuckDB y no toca frontend,
producto, handoff ni `docs/current-plan.md`.

TA-04F8 no reabre, reetiqueta ni relaja TA-04F7. Su única finalidad es producir
un **artefacto descriptivo técnico** de la forma local ya decidida `GO
local-only`, bajo custodia local. No es un mapa, no es una capability y no
autoriza producto.

## Autoridad, alcance y prohibiciones

- Rama: `work/ta04f-repetition-variance`.
- Base de Gate 1: `6ff702ea80e6498613ef52e08ba4a45054b10ab8`.
- **Autorización humana: concedida.** Isaac autorizó explícitamente este corte
  visual el 2026-08-14, cumpliendo el «STOP visual exacto» de
  `ta04f7-historical-recording-cluster-plan.md`. La autorización queda
  registrada aquí y **no se vuelve a solicitar** dentro de TA-04F8.
- Excepción de Isaac: sin Linear durante este corte; issues pendientes al final.
- Modelo autorizado para el corte: T3 / Claude Opus 5 con razonamiento low. Sin
  delegación anidada.
- Prohibido: mapa oficial, AIW, DDS, comparación visual con un circuito real,
  producto, UI productiva, `WidgetVisualHost`, Overlay Studio, cualquier archivo
  bajo `frontend/`, TA-04B, promoción de capability.
- Prohibido: dependencias nuevas, push, PR, CI remoto, merge, promoción, release.
- Prohibido en cualquier salida, log o commit: IDs, rutas, nombres de archivo,
  timestamps, coordenadas crudas, muestras, nombres de metadata, digests
  privados, claves y `p95`/`p99`.
- `Path Lateral` y `Track Edge` siguen fuera. Datum/CRS, bordes y anchura siguen
  bloqueados por TA-04C/TA-04D.

## Fuentes normativas congeladas

- protocolo, población, oracle, guards, malla, proyección, Kabsch, medianas,
  cross-fit, thresholds y matriz de decisión:
  `ta04f7-historical-recording-cluster-plan.md@7d239baae99cc0f51911bc2fae1b0a1dac1cc0b3`;
- resultado de referencia: `ta04f7-historical-cluster-freeze-v2.json`, producido
  por el runner `a536d41c04ba24bf99de07242349e9cdc7490d0a` y congelado en
  `3ca0e53a5d8275cfa0fbf6c0d275b98698be1d63`, SHA-256
  `041c41842fe1d822a6097f44076a8b0fbddc01dbf568c7760af72ee8fb841349`.

TA-04F8 **no modifica ninguna de esas reglas**. Una contradicción entre
implementación y estas fuentes termina antes de datos y exige un plan nuevo
versionado.

## Hallazgo que motiva el corte

El freeze-v2 no contiene geometría: la centerline es un intermedio en RAM y el
schema JSON está cerrado a conteos. Por tanto **no es posible dibujar nada con
los artefactos existentes** y hace falta una extracción sanitizada nueva.

## Cobertura autorizada

Entran exactamente los dos grupos con decisión
`technical_go_local_shape_local_only` en el freeze-v2:

| Panel | `group_ordinal` | recordings elegibles | slots | confianza |
|---|---:|---:|---|---|
| A | 1 | 1 | 5 evaluados / 4 pass | `none` |
| B | 37 | 1 | 2 evaluados / 2 pass | `none` |

**No entran, ni siquiera como panel vacío, marca, sombra o conteo dibujado:** el
grupo ordinal 36 (`technical_no_go_local_shape`) y los 45 grupos
`stop_insufficient`. Cualquier intento de incluirlos es STOP.

## Artefacto visual permitido (único)

Un **SVG estático local** con exactamente **dos paneles independientes**, sin
ejes compartidos, sin superposición y sin ningún tercer elemento gráfico.

- Panel A: polilínea cerrada de 1.000 puntos del recording contribuyente del
  grupo ordinal 1.
- Panel B: lo mismo para el grupo ordinal 37.

Traza monocroma de ancho fijo, sin relleno, sin cinta de anchura, sin bordes,
sin sectores, sin marcadores de curva, sin punto de salida, sin sentido de
marcha, sin gradiente por velocidad ni por residual.

Rótulo exacto por panel, sin otro texto:
`grupo ordinal N — technical_go_local_shape_local_only — 1 recording`.

## Extracción sanitizada

### Obtención con la pila productiva

Cualquier repetición de TA-04F7 exige nuevo commit de protocolo, nuevo runner
SHA y custodia explícita del output anterior. Se usa el patrón ya empleado en
sus dos errata: un **runner hijo en el mismo directorio**, no un tool duplicado.

1. Se añade el modo `existing-authorized-shape` a
   `tools/ta04f7-historical-cluster`. El commit de Gate 1 es el
   `protocol_sha` embebido en ese runner hijo.
2. **No se tocan** población, discovery, orden canónico, dedupe, oracle, guards,
   caps, budgets, malla, proyección, Kabsch, medianas, cross-fit, thresholds ni
   la matriz de decisión.
3. Se reejecuta el barrido completo existing-only con la pila productiva:
   autorización, staging privado, reader y parser productivos; un solo reader
   abierto; revalidación PRE/POST por artifact; inventario metadata-only PRE/POST
   con clave CSPRNG efímera; cleanup obligatorio.
4. La centerline permanece en RAM. Se sanitiza en memoria y **solo el resultado
   sanitizado llega a disco**. Las coordenadas crudas nunca se escriben.
5. El freeze-v2 y el runner `a536d41…` no se tocan, no se reusan y no se
   sobrescriben.

### Canonicalización obligatoria de `shape`

Para cada uno de los dos recordings contribuyentes, partiendo de su centerline
final de recording (1.000 puntos `x/y` en metros relativos al ancla del propio
recording), en este orden fijo:

1. **Centroide cero.** `x_i -= mean(x)`, `y_i -= mean(y)`, con sumas
   secuenciales `float64` en orden ascendente de bin. Esto elimina el ancla
   `lat0/lon0`, único portador de geolocalización.
2. **Rotación canónica determinista.** Sobre los puntos ya centrados:

   ```text
   Sxx = sum(x_i^2);  Syy = sum(y_i^2);  Sxy = sum(x_i*y_i)
   theta = 0.5 * atan2(2*Sxy, Sxx - Syy)
   ```

   Se rota por `-theta` (eje principal → eje X). El signo se fija después: si
   `x_0 < 0` se rota `pi` adicional; si `x_0 == 0` y `y_0 < 0` se rota `pi`
   adicional. Degenerado si `Sxx + Syy <= 1000 * epsilon_geom^2` o si
   `(2*Sxy)^2 + (Sxx - Syy)^2 <= (1000 * epsilon_geom^2)^2`; no hay fallback:
   es `pipeline_fault(shape_degenerate)`. Cualquier valor no finito falla.
3. **Redondeo.** Cada coordenada a `0,1 m` mediante
   `round(v*10)/10` con redondeo half-away-from-zero, produciendo exactamente un
   decimal. `-0` se normaliza a `0`.

Constantes heredadas: `N_GRID = 1000`, `epsilon_geom = 1e-6 m`, aritmética
`float64` finita.

La rotación canónica es **arbitraria por construcción** y su único propósito es
impedir que la rotación heredada de la plantilla de alineación se confunda con
una orientación real.

### Escala

Se conserva la **escala relativa derivada**: dentro de un panel, `x` e `y`
comparten factor, sin estiramiento anisótropo. Esa escala procede de una
proyección equirectangular con `R = 6.371.000 m` sobre un datum no demostrado
(TA-04C `NO-GO`), por lo que **no es geodésica** y no se publica barra de
escala, longitud total ni cifra alguna en metros sobre la figura. Entre paneles
las escalas son independientes y no comparables.

## Schema JSON ejecutable del shape export

Archivo `ta04f8-shape-export-v1.json`. Claves top-level, en este orden exacto:
`version`, `protocol_sha`, `runner_sha`, `mode`, `grid`, `units`,
`scale_is_geodetic`, `orientation_is_absolute`, `panels`, `local_shape`,
`product_map_authorization`.

- `version` = `"ta04f8/v1"`.
- `mode` = `"existing-authorized-shape"`.
- `grid` = `1000`.
- `units` = `"relative_metres"`.
- `scale_is_geodetic` = `false`.
- `orientation_is_absolute` = `false`.
- `local_shape` = `"unknown"`.
- `product_map_authorization` = `false`.

`panels` es un array de **exactamente 2** elementos, en orden ascendente de
`group_ordinal`. Cada elemento contiene exactamente, en este orden:
`group_ordinal`, `decision`, `cross_recording_confidence`, `shape`.

- `group_ordinal` ∈ `{1, 37}`, sin repetición.
- `decision` = `"technical_go_local_shape_local_only"`, literal del freeze-v2.
- `cross_recording_confidence` = `"none"`, literal del freeze-v2.
- `shape` = array de exactamente 1.000 arrays de 2 números, cada uno finito, con
  exactamente un decimal.

Serialización canónica: JSON con indentación de 2 espacios, claves en el orden
fijo anterior, un salto de línea final. Se rechazan claves extra, ausentes,
orden distinto, números no finitos, `panels` con cardinalidad distinta de 2,
`shape` con cardinalidad distinta de 1.000 y cualquier `group_ordinal` fuera del
conjunto autorizado. Toda ruptura es `pipeline_fault`.

Nunca aparecen: latitud, longitud, `lat0`, `lon0`, `TrackName`, `TrackLayout`,
`CarName`, `CarClass`, `session.ID`, `CandidateID`, rutas, tamaños,
`ModifiedAt`, timestamps, muestras crudas, `Lap Dist`, `Total Dist`, valores por
vuelta, `p95`, `p99`, digests ni la clave del inventario.

## Manifest de control y regla de igualdad

El modo emite además `ta04f8-historical-cluster-manifest-v3.json`, con el mismo
schema agregado de TA-04F7 más **una única excepción enumerada**: la clave
top-level `mode` con valor `"existing-authorized-shape"`, insertada
inmediatamente después de `runner_sha`. No hay ninguna otra diferencia de
schema.

Regla de igualdad, ejecutable: se toman ambos documentos, se **elide exactamente
el conjunto de claves top-level `{protocol_sha, runner_sha, mode}`**, se
reserializan con la misma serialización canónica (indentación de 2 espacios,
orden de claves preservado, un salto de línea final) y los resultados deben ser
**byte a byte idénticos**. Cualquier diferencia en `outcome`,
`inventory_stable`, `population`, `groups`, `cleanup`, `local_shape` o
`product_map_authorization` invalida el run como base del corte visual.

El runner **no lee** el freeze-v2 en tiempo de ejecución. La comparación es un
test dedicado y un check humano de Gate 4.

## Framing SVG canónico

Archivo `ta04f8-shape-figure.svg`, generado por
`tools/ta04f8-shape-figure` **exclusivamente desde el JSON ya sanitizado**. Ese
generador no abre DuckDB, no importa código de producto, frontend ni la pila de
lectura, y usa solo la stdlib de Go.

Por panel `p` con índice `0` (grupo 1) y `1` (grupo 37):

```text
E   = max_i( max(|x_i|, |y_i|) )          # metros, tras canonicalizar
k   = 380 / (2*E)                          # isotrópico; E <= 0 es pipeline_fault
ox  = 20 + p*420
X_i = ox + 200 + k*x_i
Y_i = 20 + 200 - k*y_i
```

`X_i` e `Y_i` se redondean a 2 decimales. La polilínea se emite como un único
`path` con `M` seguido de 999 `L` y cierre `Z`, en orden ascendente de bin,
`fill="none"`, `stroke-width="1.5"`, trazo monocromo. El `viewBox` raíz es
`0 0 860 500`; los rótulos de panel se sitúan en `y=450` y el pie en `y=470`.
La inversión de `y` es una convención de render declarada y **no afirma
quiralidad**.

No se emiten: ejes, rejilla, ticks, flecha norte, brújula, barra de escala,
leyenda de longitud, coordenadas, nombres, `<image>`, `<script>`, enlaces
externos ni fuentes externas.

## Pie obligatorio de la figura

La figura debe llevar, literalmente y de forma legible, estas seis negaciones:

1. **Orientación absoluta: no demostrada.** Sin datum/CRS (TA-04C `NO-GO`) y con
   rotación canónica arbitraria. No hay norte ni rumbo.
2. **Posición absoluta: `unknown`.** Sin coordenadas, circuito, ciudad o país.
3. **Escala: relativa, no geodésica.** Proyección equirectangular sobre datum no
   demostrado. Sin barra de escala.
4. **Quiralidad/espejo: no demostrada.** El signo latitud→`y` es un supuesto de
   proyección; no se afirma sentido de giro ni ausencia de reflexión.
5. **Anchura y bordes: `incompatible`.** Línea sin grosor semántico.
6. **Alcance:** 1 recording por panel, `cross_recording_confidence=none`,
   `inter_session_demonstrated=false`. Artefacto descriptivo técnico
   experimental; **no es un mapa**.

## Límites de recursos

- Sanitización: 2 recordings × 1.000 puntos × 2 × 8 bytes retenidos; el
  presupuesto `logical_live_bytes <= 512 MiB` de TA-04F7 se mantiene sin cambios
  y absorbe este añadido.
- `ta04f8-shape-export-v1.json` <= `64 KiB`; superarlo es
  `pipeline_fault(resource_cap)`.
- `ta04f8-shape-figure.svg` <= `128 KiB`; superarlo aborta la generación.
- Budgets de run heredados sin cambio: `min(512, ready_candidate_count)`
  candidatos, `32 GiB` staged acumulados, `120 min` de pared, ejecución
  secuencial.
- Caps por recording heredados sin cambio.

## Rutas, no-overwrite y lifecycle

Rutas finales nuevas, bajo
`docs/vantare-program/research/telemetry-analysis/`:

- `ta04f8-historical-cluster-manifest-v3.json`;
- `ta04f8-shape-export-v1.json`;
- `ta04f8-shape-figure.svg` (Gate 4, desde el JSON).

Temporal determinista por salida:
`<final>.ta04f8-<protocol_sha_12>-<runner_sha_12>.tmp`.

Preflight, antes de discovery y antes de cualquier dato: tras resolver parent y
comprobar cada ancestro con `Lstat` e identidad, el único estado permitido es la
**ausencia simultánea de los dos finales y los dos temporales**. Si existe
cualquiera, solo o acompañado, terminar `pipeline_fault(output_state_preexisting)`
sin abrir datos y sin cleanup de output. La invocación no valida, acepta,
elimina ni repara output previo.

Publicación, idéntica al contrato TA-04F7 y aplicada a cada salida por separado,
primero el manifest de control y después el shape export: crear temp con
`O_CREATE|O_EXCL`, escribir, `Sync`, comprobar `Close`, reabrir y verificar
bytes; publicar con `os.Link(temp, final)` —atómico en NTFS local y fallo si el
final existe, por lo que **nunca sobrescribe**—; reverificar bytes del final;
eliminar solo el temporal exacto y comprobar su ausencia. Repetir `Lstat` e
identidad de ancestros y parent inmediatamente antes de crear temp y antes y
después de cada `Link`. Link no soportado, target aparecido, mismatch o fallo de
cleanup es `pipeline_fault`. Nunca `rename`/`replace`.

Si el manifest de control se publica y el shape export falla, el outcome es
`pipeline_fault`: se conserva el manifest para diagnóstico, **no se afirma corte
visual válido** y no se genera SVG.

Todo crash deja estado terminal para ese par de SHA. Reintentar exige nuevo
commit de protocolo, nuevo runner SHA y un plan explícito de custodia del output
anterior; este runner no lo borra.

## Custodia y privacidad

- JSON y SVG son **evidencia local-only**, versionados en la rama de issue junto
  al freeze existente. Sin push, PR, CI, adjuntos en Linear, capturas en Discord
  ni copia fuera del worktree.
- Riesgo residual declarado y aceptado: **la forma es autoidentificable** para
  quien conozca el circuito. La mitigación es de custodia, no técnica; por eso el
  artefacto no sale de local y no se acompaña de ninguna etiqueta de circuito,
  coche, clase o layout.
- Cleanup obligatorio: `open_readers = 0`, `staging_entries = 0`,
  `staging_roots = 0` antes de escribir y temporales/procesos `0` al terminar.
- El runner suelta referencias y sobrescribe best-effort sus propios buffers; no
  afirma destruir memoria administrada por GC.

## Gates

### Gate 1 — plan

Versionar solo este protocolo en un commit documental dedicado. No implementar,
no abrir datos, no generar artefactos. El SHA de este commit se incrusta en el
runner hijo como `protocol_sha`.

### Gate 2 — runner hijo y generador, por TDD

Implementar el modo `existing-authorized-shape` y
`tools/ta04f8-shape-figure`. Empezar RED. Cobertura mínima:

1. canonicalizador: centroide exactamente cero, invariancia frente a rotación y
   traslación arbitrarias de la entrada, `theta` degenerado cerrado, desempate de
   signo por `x_0`/`y_0`, redondeo a un decimal y `-0` normalizado;
2. selección de cobertura: solo `technical_go_local_shape_local_only`; grupo 36 y
   los `stop_insufficient` producen **cero** entradas; `panels` con cardinalidad
   distinta de 2 es `pipeline_fault`;
3. schema JSON exacto: rechaza claves extra, ausentes, orden distinto, no
   finitos, `shape` con cardinalidad distinta de 1.000 y `group_ordinal` no
   autorizado;
4. igualdad de control: elidiendo `{protocol_sha, runner_sha, mode}` y
   reserializando canónicamente, el manifest nuevo es byte a byte idéntico al
   freeze-v2; mutar cualquier conteo de `population`, `groups` o `cleanup` debe
   romper el test;
5. privacidad: inspección de JSON, SVG, stdout y stderr; falla ante ID, clave,
   ruta, timestamp, latitud/longitud, nombre de metadata, `p95`, `p99`, digest o
   commitment;
6. output lifecycle: final, temp y ambos preexistentes son
   `output_state_preexisting` antes de datos; sync/close, hardlink no-overwrite,
   bytes finales, hardlink no soportado y fallo del segundo publish;
7. framing SVG: `viewBox`, `k` isotrópico, offsets, `path` de 1.000 vértices con
   `Z`, redondeo a 2 decimales, ausencia de ejes/rejilla/norte/barra de escala,
   ausencia de `<script>`, `<image>` y referencias externas, y presencia literal
   de las seis negaciones del pie;
8. aislamiento: el generador SVG no importa DuckDB, producto ni `frontend/`;
9. recursos: `64 KiB` y `128 KiB` fallan cerrado.

Checks previstos:

```powershell
gofmt -w tools/ta04f7-historical-cluster/*.go tools/ta04f8-shape-figure/*.go
go test ./tools/ta04f7-historical-cluster/... ./tools/ta04f8-shape-figure/...
go test -race ./tools/ta04f7-historical-cluster/... ./tools/ta04f8-shape-figure/...
go vet ./tools/ta04f7-historical-cluster/... ./tools/ta04f8-shape-figure/...
go run ./tools/ta04f7-historical-cluster -mode=synthetic
go test ./...
git diff --check
```

Commit dedicado, padre único Gate 1, scope limitado a los dos tools.

### Gate 3 — una ejecución existing-only

Con worktree limpio y `HEAD` igual al SHA revisado del runner hijo, ejecutar una
sola vez `existing-authorized-shape`. Redescubrir todo, deduplicar y evaluar
todos los grupos; no reutilizar cifras ni selección previas. Publicar manifest de
control y shape export. **No se genera SVG en este gate.**

### Gate 4 — verificación, figura y freeze

Una revisión externa/humana reabre las salidas, verifica schema, SHAs, bytes
canónicos, la regla de igualdad con su excepción enumerada, `temp = 0`,
privacidad, budgets y cleanup. Solo entonces se genera el SVG desde el JSON y se
versionan los tres artefactos en un commit dedicado. Gate 4 no abre datos y no
es otra invocación de Gate 3. TA-04F8 termina aquí.

## STOP exacto

Se detiene el flujo y **no se dibuja nada** si:

1. la reejecución no satisface la regla de igualdad con el freeze-v2 bajo la
   única excepción enumerada `{protocol_sha, runner_sha, mode}`;
2. el outcome global deja de ser `analysis_complete`, o los grupos 1 y 37 dejan
   de ser `technical_go_local_shape_local_only`;
3. aparece cualquier `pipeline_fault`, o `cleanup` distinto de `0/0/0`;
4. existe `final` o `temp` preexistente en cualquiera de las rutas nuevas;
5. falla un check de privacidad, o aparece un campo fuera del schema fijado;
6. la canonicalización resulta degenerada o no finita;
7. se pide incluir el grupo 36, un `stop_insufficient`, un segundo recording
   sintetizado, superposición de paneles, comparación con circuito, anchura,
   bordes, norte o barra de escala;
8. el trabajo necesita tocar `frontend/`, `WidgetVisualHost`, Overlay Studio,
   overlays, capability de producto, TA-04B o cualquier promoción;
9. se requiere una dependencia nueva, o una acción externa (push, PR, CI, merge,
   release).

En todos los casos se conserva la evidencia, se documenta y se para.

**`local_shape` permanece `unknown` y `product_map_authorization` permanece
`false` también después de producir la figura.** Este corte es descriptivo: no
promueve capability, no demuestra geolocalización, no demuestra anchura y no
desbloquea TA-04B.

## Erratum Gate 2 — endurecimiento previo a Gate 3

La primera implementación de Gate 2 quedó `REQUEST CHANGES` en review. Se
conserva por ref (`backup/ta04f8-gate2-afa6fb9`, tag
`ta04f8-gate2-rejected-afa6fb9`) como evidencia y **no se reusa**. Este erratum
sustituye las cláusulas enumeradas abajo; el resto del protocolo no cambia. No
altera población, discovery, oracle, guards, malla, Kabsch, cross-fit,
thresholds ni la matriz de decisión, y no autoriza abrir datos: el `protocol_sha`
del runner hijo pasa a ser el SHA de **este** commit.

### E1 — guard de degeneración adimensional (sustituye §Canonicalización, paso 2)

El guard absoluto anterior aceptaba formas casi isótropas cuyo eje principal es
numéricamente inestable. Se preregistra un **ratio adimensional**, evaluado
sobre los puntos ya centrados:

```text
trace     = Sxx + Syy
aniso     = hypot(2*Sxy, Sxx - Syy)
degenerado si  trace <= N*epsilon_geom^2
degenerado si  aniso / trace < 1e-6
```

`N=1000`, `epsilon_geom=1e-6 m`. Ambas comparaciones fallan cerrado con
`pipeline_fault(shape_degenerate)`; no hay fallback ni relajación. Un círculo
perfecto y cualquier forma casi isótropa quedan por tanto rechazados de forma
explícita, en vez de producir una rotación arbitraria e irreproducible.

### E2 — desempate de signo estable (sustituye §Canonicalización, paso 2)

El desempate ya no usa el bin 0, que puede estar arbitrariamente cerca del
origen. Tras rotar por `-theta`, con `epsilon_sign = 1e-6 m`:

1. sea `i` el **primer** índice ascendente con `|x_i| > epsilon_sign`; si
   `x_i < 0`, rotar `pi`;
2. si no existe tal `i`, sea `j` el primer índice con `|y_j| > epsilon_sign`; si
   `y_j < 0`, rotar `pi`;
3. si no existe ninguno de los dos, `pipeline_fault(shape_degenerate)`.

El redondeo a `0,1 m` se aplica después, sin cambios.

### E3 — `-gate3-authorized` (amplía §Gate 3)

El modo `existing-authorized-shape` exige, además de los cuatro identificadores
exactos (`-protocol-sha`, `-runner-sha` de 40 hex minúsculas, `-output`,
`-control-output`), el flag booleano explícito **`-gate3-authorized`**.
Semántica exacta: es una confirmación humana de invocación, no una autorización
de datos; su ausencia produce `data_invalid` con código 2 **antes** de construir
backend, de resolver rutas y de tocar disco. No tiene valor por defecto
verdadero, no se infiere de ninguna variable de entorno y no aparece en ningún
otro modo: pasarlo en `synthetic`, `synthetic-shape` o `existing-authorized` es
`data_invalid`.

### E4 — preflight de las cuatro rutas antes de backend y discovery

Las cuatro rutas de Gate 3 —los dos finales y sus dos temporales
`<final>.ta04f8-<protocol_sha_12>-<runner_sha_12>.tmp`— se comprueban ausentes,
con `Lstat` e identidad de cada ancestro, **antes** de construir el backend y
antes de cualquier discovery o apertura. La presencia de cualquiera de las
cuatro produce `pipeline_fault(output_state_preexisting)` sin instanciar
backend. Inmediatamente antes de publicar cada salida se revalidan **los dos
guards**, no solo el de la salida en curso; una divergencia en cualquiera de
ellos invalida el run.

### E5 — contrato del generador SVG (sustituye §Framing SVG canónico)

El generador es un consumidor estricto, sin modo permisivo:

- acepta **exclusivamente** un shape export canónico `ta04f8/v1` con
  `mode = existing-authorized-shape` y el `protocol_sha` vigente de este erratum;
- exige **exactamente 2 paneles**, con `group_ordinal` `[1, 37]` en ese orden;
- reserializa el documento con el encoder canónico y exige igualdad byte a byte:
  se rechazan JSON con trailing, orden de claves alternativo, espaciado
  alternativo, claves extra o ausentes, ordinal extra, 1 o 3 paneles y SHA ajeno;
- `viewBox` fijo `0 0 860 500`;
- el modo sintético **no** puede relajar el decoder: recorre exactamente el mismo
  camino de validación.

### E6 — límites de lectura del generador

Antes de reservar o leer el cuerpo: con `-input=<ruta>`, `Lstat` del archivo y
rechazo si no es regular o si su tamaño supera `64 KiB`; con `-input=-`, lectura
acotada a `64 KiB + 1` bytes y rechazo si se alcanza ese byte extra. En ambos
casos el rechazo es previo a cualquier `Unmarshal`.

### E7 — pie literal del SVG (sustituye §Pie obligatorio de la figura)

El pie contiene estas seis líneas, **literales, en UTF-8 y sin abreviar**:

```text
Orientación absoluta: no demostrada. Sin datum/CRS (TA-04C NO-GO) y con rotación canónica arbitraria. No hay norte ni rumbo.
Posición absoluta: unknown. Sin coordenadas, circuito, ciudad o país.
Escala: relativa, no geodésica. Proyección equirectangular sobre datum no demostrado. Sin barra de escala.
Quiralidad/espejo: no demostrada. El signo latitud→y es un supuesto de proyección; no se afirma sentido de giro ni ausencia de reflexión.
Anchura y bordes: incompatible. Línea sin grosor semántico.
Alcance: 1 recording por panel, cross_recording_confidence=none, inter_session_demonstrated=false. Artefacto descriptivo técnico experimental; no es un mapa.
```

Que el texto nombre «norte» o «barra de escala» para negarlos no autoriza
dibujarlos: la prohibición es de elementos gráficos (`<line>`, rejilla, ticks,
flecha, marcadores, `<script>`, `<image>`, referencias externas).

### E8 — fixture sintético con la topología real

El fixture sintético recorre la ruta completa y produce **exactamente los dos
paneles autorizados `[1, 37]`**; queda prohibida la desviación anterior de un
solo panel. Construye 37 grupos: los ordinales 1 y 37 aportan un recording
anisótropo de 2 vueltas cada uno, decidido
`technical_go_local_shape_local_only`, y los ordinales 2..36 aportan un
recording de 1 vuelta, `insufficient_laps`, decididos `stop_insufficient`. El
conjunto autorizado de ordinales es único y compartido por el modo real y el
sintético. El fixture debe seguir siendo determinista y rápido.

## Erratum Gate 3 — fallo de orquestación sin datos y forma de invocación

### G1 — registro del intento rechazado

La invocación única de Gate 3 bajo protocolo `5eb20564739c883cd067f3dff44f314616f75064`
y runner `9cb6961c286070d465c432a9726d33ab13a556e7` terminó en
`data_invalid` con **código de salida 2** en unos 3 segundos.

Naturaleza exacta del evento, verificada:

- terminó en la **validación de argumentos**, antes de construir backend,
  resolver rutas, hacer discovery o abrir DuckDB;
- **no** produjo final, temporal, staging, reader ni manifest;
- el worktree quedó limpio y ninguna capability cambió.

Por tanto **no es un run de datos, no es Gate 3 y no consume la autorización de
ejecución única**. Se clasifica como **error de orquestación**, del mismo tipo
que los dos intentos relativos de TA-04F6, y se registra en vez de ocultarse.

Causa raíz, demostrada de forma metadata-only sombreando el comando nativo: el
host PowerShell entregó los literales `-protocol-sha=$protocol`,
`-runner-sha=$runner`, `-output=$shape` y `-control-output=$control` porque los
tokens de la forma `-flag=$variable` no iban entrecomillados. El runner los
rechazó correctamente: el fail-closed funcionó.

El runner `9cb6961c…` queda conservado en
`backup/ta04f8-gate3-attempt1-9cb6961` y en el tag
`ta04f8-gate3-orchestration-fault-9cb6961`, y **no se reusa**.

### G2 — forma de invocación congelada

Toda invocación de Gate 3 se construye con **argumentos como strings separados y
entrecomillados**, nunca como una línea de comando interpolada. Forma exacta:

```powershell
$args = @(
  "-mode=existing-authorized-shape",
  "-gate3-authorized",
  "-protocol-sha=$newProtocol",
  "-runner-sha=$newRunner",
  "-output=$shape",
  "-control-output=$control"
)
go run ./tools/ta04f7-historical-cluster @args
```

Cada elemento del array es una string entrecomillada; la expansión ocurre dentro
de la string y no depende del parser de argumentos del host. Antes de invocar se
verifica que cada variable está definida y no vacía, y que
`$args` contiene exactamente seis elementos, ninguno de los cuales contiene el
carácter `$`. Un elemento que conserve un `$` literal aborta la orquestación
**antes** de invocar.

Queda prohibida la forma `-flag=$variable` sin comillas y cualquier
construcción por concatenación de una única cadena de comando.

### G3 — autorización de ejecución única

Sigue autorizada **exactamente una** ejecución real existing-only, y sólo bajo:

- `protocol_sha` = el SHA de **este** commit de erratum;
- `runner_sha` = un runner **nuevo**, hijo de este erratum.

El par `5eb20564…` / `9cb6961c…` no vuelve a ejecutarse. El resto del protocolo
—población, oracle, guards, malla, Kabsch, cross-fit, thresholds, decisiones,
privacidad, custodia y STOP— no cambia, y el erratum no autoriza abrir datos por
sí mismo.

### G4 — regresión de la costura CLI

Gate 2 incorpora dos regresiones metadata-only, sin discovery ni salida:

1. **positiva:** los argumentos exactos ya expandidos superan la validación y
   alcanzan el `Preflight` de un backend controlado que devuelve un centinela;
   se comprueba que `Discover` no se llama y que no aparece ningún final ni
   temporal;
2. **negativa:** la forma literal `-protocol-sha=$protocol` y sus hermanas se
   rechazan con `data_invalid` **antes** de construir el backend.

Ninguna de las dos abre datos ni instancia la pila productiva.

## Erratum Gate 3 — segundo intento, ancla de protocolo del preflight Git

### G5 — registro del intento rechazado

La invocación única bajo protocolo `9311eab261b717f5ba80cc9f3f808d7c65d82725` y
runner `f69b4e76677d37472b49d301150dcce265cbbc3a` usó la forma congelada en G2,
con `@args` correctamente entrecomillados, y terminó en `pipeline_fault` con
**código de salida 1** en unos 2 segundos.

Estado verificado tras el intento:

- shape export, manifest de control y ambos temporales: **ausentes**;
- procesos helper: `0`; raíz de staging: **ausente**;
- worktree limpio; ninguna capability cambió.

Terminó en el **preflight Git**, antes de resolver la instalación LMU, de crear
staging, de abrir reader y de hacer discovery. Por tanto **no es un run de
datos, no es Gate 3 y no consume la autorización de ejecución única**; se
clasifica como error del runner, no de orquestación.

Causa raíz, establecida de forma estática y metadata-only: el preflight Git
construía su vector esperado con la **constante heredada de TA-04F7**,

```text
want := [toplevel, rama, c.RunnerSHA, protocolSHA, ""]
```

donde `protocolSHA` es `7d239baae99cc0f51911bc2fae1b0a1dac1cc0b3`. En el modo
shape el padre de `HEAD` es, correctamente, el erratum de custodia, de modo que
la comparación de `HEAD^` no podía cumplirse nunca y el modo real era
inejecutable por construcción. La comparación debe hacerse contra
**`c.ProtocolSHA`**. TA-04F7 no cambia de comportamiento porque su
`cfg.ProtocolSHA` es exactamente esa misma constante.

El runner `f69b4e76…` queda conservado en
`backup/ta04f8-gate3-attempt2-f69b4e7` y en el tag
`ta04f8-gate3-pipeline-fault-f69b4e7`, y **no se reusa**.

### G6 — invariante del preflight y autorización

El preflight Git del modo shape queda anclado al protocolo en curso:

- `rev-parse HEAD` debe ser el `runner_sha` invocado;
- `rev-parse HEAD^` debe ser el `protocol_sha` invocado, es decir el commit de
  erratum vigente, no una constante heredada;
- rama, raíz y `status --porcelain` vacío no cambian.

Como el commit de runner es tools-only y el worktree está limpio, el plan en
disco coincide con su versión en `HEAD^`; no se añade una comprobación
adicional del plan TA-04F8. La verificación del plan **TA-04F7** contra su
propio SHA congelado permanece intacta.

Sigue autorizada **exactamente una** ejecución real existing-only, y sólo bajo
el `protocol_sha` de **este** commit de erratum y un `runner_sha` nuevo hijo
suyo. El par `9311eab2…` / `f69b4e76…` no vuelve a ejecutarse. Población,
oracle, guards, malla, Kabsch, cross-fit, thresholds, decisiones, privacidad,
custodia y STOP no cambian.

## Gate 4 — auditoría del run único y STOP

### Ejecución

La ejecución única existing-only bajo protocolo
`bc13c7015a44b108ed63e1c00d70e43811acb57e` y runner
`2a99445765b11c251fd20abb0445b535120c7ab5` terminó con **código de salida 0** en
**597 s** y outcome `analysis_complete`. Publicó las dos salidas. Estado externo
tras salir: temporales `0`, procesos `0`, raíz de staging ausente, worktree
limpio.

| Artefacto publicado | Bytes | SHA-256 |
|---|---:|---|
| shape export | 49 935 | `c7d01f5e453f56d64cdcde0e1acc5f70ada1ffa180ce5fa7bacec245e275aada` |
| manifest de control | 27 132 | `ea83ece23fcea021615c80819a3978231139f02fe409fa3a613aacdb6e7533be` |

### Auditoría read-only

Shape export, verificado sin leer coordenadas: cabecera exacta, `grid` 1000,
`units` `relative_metres`, `scale_is_geodetic` y `orientation_is_absolute`
`false`, **2 paneles** con ordinales **1** y **37**, ambos
`technical_go_local_shape_local_only` y confianza `none`, **2.000 líneas de
vértice** (1.000 por panel), cero vértices fuera del formato canónico de un
decimal, salto de línea final presente y **cero coincidencias** en un barrido de
dieciséis patrones de privacidad. Ocupa el 76 % del cap de 64 KiB.

Manifest de control: claves top-level en el orden congelado con `mode`
inmediatamente después de `runner_sha`; las cuatro ecuaciones globales y las
cuatro por grupo se cumplen en los 49 grupos, con cero violaciones; ordinales
contiguos `1..49`; decisiones `46 stop_insufficient / 2
technical_go_local_shape_local_only / 1 technical_no_go_local_shape`;
`inventory_stable` `true`; `cleanup` `0/0/0`.

### Drift agregado exacto frente al freeze-v2

| Campo de población | freeze-v2 | control | Δ |
|---|---:|---:|---:|
| `inventory_candidates` | 319 | 322 | +3 |
| `data_invalid` | 133 | 133 | 0 |
| `canonical_recordings` | 186 | 189 | +3 |
| `insufficient_laps_recordings` | 183 | 186 | +3 |
| `eligible_recordings` | 3 | 3 | 0 |

`duplicates`, `authorization_rejected`, `stability_rejected` y
`artifact_guard_rejected` permanecen en `0`.

Grupos `48 → 49`. Comparados ordinal a ordinal, **los 48 grupos previos son
idénticos campo a campo en sus catorce campos**, incluidos el 1, el 36 y el 37.
La única diferencia es un **grupo 49 nuevo**: `3` descubiertos, `3`
`insufficient_laps`, `0` elegibles, decisión `stop_insufficient`, confianza
`none`.

Lectura sanitizada: entre el freeze-v2 y este run aparecieron tres grabaciones
de una combinación de group key no vista antes, cada una con menos de dos
vueltas completas tras el oracle. Entraron al final del orden canónico, por lo
que reciben el ordinal 49 y **no reindexan** ningún grupo previo, y no alteran
ninguna vuelta, slot ni decisión. No es no determinismo del pipeline: es deriva
real de la población en disco.

### STOP

Se dispara **exactamente y sólo la condición 1** del STOP: la regla de igualdad
exige identidad byte a byte tras elidir `{protocol_sha, runner_sha, mode}`, y no
se cumple. Las condiciones 2 a 9 no se disparan.

El STOP se mantiene aunque la causa sea benigna: relajar un criterio
preregistrado después de ver el resultado es exactamente el post hoc que este
programa rechaza desde TA-04E.

En consecuencia, para este par de SHA: **no se genera SVG, no se produce figura
y no hay promoción**. `local_shape` permanece `unknown` y
`product_map_authorization` permanece `false`. TA-04B sigue bloqueada.

Queda además registrado, sin resolverse aquí, que la regla de igualdad asumió
una población congelada mientras el protocolo sólo garantiza estabilidad de
inventario **dentro** de un run; contra un directorio vivo es insatisfacible por
diseño. Cualquier rediseño de ese control exige un protocolo nuevo y explícito,
que este commit no propone ni autoriza.

### Custodia de las salidas

Ambas salidas se conservan **byte a byte**, con sus SHA-256 intactos, renombradas
a nombres de evidencia siguiendo el precedente de
`ta04f7-historical-cluster-rejected-a4c395e.json`:

- `ta04f8-shape-export-rejected-2a99445.json`;
- `ta04f8-historical-cluster-manifest-rejected-2a99445.json`.

No son freeze ni `analysis_complete` aceptado. El renombrado deja **ausentes** las
rutas finales canónicas, que de otro modo quedarían bloqueadas por el preflight
`output_state_preexisting`. El par
`bc13c7015a44b108ed63e1c00d70e43811acb57e` / `2a99445765b11c251fd20abb0445b535120c7ab5`
no vuelve a ejecutarse.

## Criterio de cierre y verificación manual

TA-04F8 queda cerrado cuando sus cuatro gates están separados por commits, el
run existing-only es único, la regla de igualdad pasa con su única excepción, el
JSON y el SVG están sanitizados, cleanup pasó y ninguna capability de producto
cambió.

Verificación manual: revisar historia lineal y scopes de commits; ejecutar
synthetic; comprobar los dos JSON contra sus schemas; recalcular a mano la
elisión de `{protocol_sha, runner_sha, mode}` y comparar con el freeze-v2; abrir
el SVG y confirmar dos paneles, ausencia de norte/barra de escala/ejes y
presencia literal de las seis negaciones; confirmar ausencia de archivos fuera de
los previstos.

## Issues pendientes (no crear ahora)

- Crear/recuperar TA-04C, TA-04D, TA-04E, TA-04F/TA-04F6 y TA-04F7 con sus
  dependencias y evidencia local.
- Issue separada para TA-04F8 Gate 2 (runner hijo, generador y reviews).
- Issue separada para TA-04F8 Gate 3/4 (ejecución, verificación y figura).
- TA-04D sigue pendiente para datum/CRS y semántica oficial de ambos bordes;
  TA-04F8 no lo resuelve.
- TA-04B permanece bloqueada; este corte no la abre.
