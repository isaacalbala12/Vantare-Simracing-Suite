# TA-04F9 — protocolo preregistrado de control de inventario vivo para el corte visual descriptivo

Estado: Gate 1, plan documental. Este commit **sólo crea el plan**: no implementa
runner, no genera JSON ni SVG, no abre DuckDB, no ejecuta modo real y no toca
`frontend/`, producto, handoff, `historical-model.md`, `plan-microcuts.md` ni
`docs/current-plan.md`.

TA-04F9 **no reabre, no reetiqueta y no relaja** TA-04F7 ni TA-04F8. No convierte
el rechazo de TA-04F8 en un `PASS`. Su única finalidad es sustituir **una** regla
de control que era insatisfacible por construcción contra un directorio vivo, y
dejarla congelada **antes** de cualquier nueva ejecución.

## 0. Decisión resuelta en este Gate 1

Pregunta planteada: ¿puede un protocolo nuevo consumir byte a byte los dos
artefactos rechazados de TA-04F8 y producir sólo una figura descriptiva
sanitizada, sin reabrir DuckDB?

**Respuesta: no. La custodia científica obliga a otra ejecución.** Cero lectura
nueva no es justificable para la figura. Razones, en orden de peso:

1. **El preregistro sería imposible.** Cualquier criterio que admita exactamente
   esos bytes se escribiría después de haber visto el drift. Desde TA-04E el
   programa rechaza escribir el criterio después de ver el resultado que juzga.
   Que el drift resulte benigno no cambia el orden temporal, y el orden temporal
   es todo el contenido de la garantía.
2. **TA-04F8 congeló la consecuencia para ese par de SHA.** Su Gate 4 dice
   literalmente que, para
   `bc13c7015a44b108ed63e1c00d70e43811acb57e` /
   `2a99445765b11c251fd20abb0445b535120c7ab5`, **no se genera SVG, no se produce
   figura y no hay promoción**. Emitir esa figura bajo otro nombre de protocolo
   sería derrotar la cláusula renombrando el expediente.
3. **Precedente de artefacto rechazado.** `ta04f7-historical-cluster-rejected-a4c395e.json`
   fijó que un output rechazado es evidencia bajo custodia, nunca input. Reusar
   uno como entrada crearía el precedente contrario y debilitaría toda rechazo
   futuro.
4. **La regla incumplida es exactamente la que sostiene la figura.** La igualdad
   de control no era decorativa: invalidaba el run **como base del corte visual**,
   que es precisamente el uso pretendido.

Lo que **sí** es legítimo, y es todo lo que este plan hace: corregir
prospectivamente un control que el propio TA-04F8 documentó como insatisfacible
por diseño («la regla de igualdad asumió una población congelada mientras el
protocolo sólo garantiza estabilidad de inventario **dentro** de un run»), y
congelar el control corregido antes de que exista el resultado que juzgará. Es
la misma clase de corrección que los errata G1/G2 y G5/G6 de TA-04F8, que
también arreglaron reglas que hacían el modo inejecutable por construcción.

Diferencia que se declara explícitamente y no se disimula: G1/G2 y G5/G6 fallaron
**antes de datos**, y por eso no consumieron autorización. La condición 1 de
TA-04F8 se disparó **después** de ver resultados. Por tanto la corrección **no
puede aplicarse a aquel run** y sólo puede aplicarse hacia adelante. Los dos
artefactos rechazados siguen siendo custodia, no entrada.

Alternativa descartada por sobre-restrictiva, registrada para trazabilidad:
cerrar la línea visual sin figura. Se descarta porque los DuckDB históricos ya
existentes permiten una ejecución legítima sin grabar nada nuevo; cerrar sería
estrechar el alcance por cuenta propia. Si Isaac no concede el Gate 0, ésa es la
salida por defecto y TA-04F9 termina sin Gate 2.

## Autoridad, alcance y prohibiciones

- Rama: `work/ta04f-repetition-variance`.
- Base de Gate 1: `d522225304b56be3ff9e3a8874f94e1795cb04c8`.
- **No se graban datos nuevos.** Toda la población procede de telemetrías
  finalizadas ya existentes y previamente autorizadas, igual que TA-04F7/F8.
- Excepción de Isaac: sin Linear durante este corte; issues pendientes al final.
- Modelo autorizado para el corte: Claude Opus 5, sin delegación anidada.
- Prohibido: mapa oficial, AIW, DDS, comparación visual con un circuito real,
  producto, UI productiva, `WidgetVisualHost`, Overlay Studio, cualquier archivo
  bajo `frontend/`, TA-04B, promoción de capability.
- Prohibido: dependencias nuevas, push, PR, CI remoto, merge, promoción, release.
- Prohibido en cualquier salida, log o commit de resultado: IDs, rutas, nombres
  de archivo, timestamps, coordenadas crudas, muestras, nombres de metadata,
  digests privados, claves y valores observados de `p95`/`p99` por recording.
  Los nombres de las métricas y sus thresholds preregistrados sí forman parte
  del contrato documental y de los tests.
- `Path Lateral` y `Track Edge` siguen fuera. Datum/CRS, bordes y anchura siguen
  bloqueados por TA-04C/TA-04D.
- La figura **nunca** es mapa, capability ni producto. `local_shape` permanece
  `unknown` y `product_map_authorization` permanece `false` también después de
  producirla. TA-04B sigue bloqueada.

## Fuentes normativas congeladas y hashes exactos de inputs

La matemática y el pipeline de datos se heredan **sin cambios**. TA-04F9 sólo
añade la sección «Regla de control» de este documento y, para mantener custodia
inequívoca, usa modo, versiones y rutas nuevas enumeradas más abajo.

| Rol | Artefacto | Ancla exacta |
|---|---|---|
| Protocolo base | `ta04f7-historical-recording-cluster-plan.md` | commit `7d239baae99cc0f51911bc2fae1b0a1dac1cc0b3`; blob `513cac02b0a74bc3b07ef2af65fd442535fb8243`; SHA-256 `29138de7171827943f48b8710fd8acc09a1a4170060e1b511d18d45ccad2d031`; 33 651 bytes |
| Protocolo del corte visual + errata E1–E8, G1–G6 y Gate 4 | `ta04f8-shape-export-plan.md` | estado en `d522225304b56be3ff9e3a8874f94e1795cb04c8`; blob `027fff12a3e11e09da4ae68a9dd27502bb761514`; SHA-256 `690c318979650ee805fe75089c308ee12b6fd647eda28d0de2142db28157d1cd`; 37 311 bytes |
| **Única baseline de comparación** | `ta04f7-historical-cluster-freeze-v2.json` | blob `17f020c73caf38a4e9fe10e9d344d3e3e58f574d`; SHA-256 `041c41842fe1d822a6097f44076a8b0fbddc01dbf568c7760af72ee8fb841349`; 26 555 bytes |

Artefactos **bajo custodia, explícitamente NO input, NO baseline y NO reusables**:

| Artefacto | SHA-256 | Bytes |
|---|---|---:|
| `ta04f8-shape-export-rejected-2a99445.json` | `c7d01f5e453f56d64cdcde0e1acc5f70ada1ffa180ce5fa7bacec245e275aada` | 49 935 |
| `ta04f8-historical-cluster-manifest-rejected-2a99445.json` | `ea83ece23fcea021615c80819a3978231139f02fe409fa3a613aacdb6e7533be` | 27 132 |
| `ta04f7-historical-cluster-rejected-a4c395e.json` | `b9c17f8b79c39a7f140477d7974d06276787726146e045504c1c8e2144236c65` | 684 |

Ningún runner, test o generador de TA-04F9 los abre, los lee ni los cita como
evidencia de resultado. Se conservan byte a byte y no se renombran otra vez.

Los pares de SHA `bc13c701…`/`2a994457…`, `9311eab2…`/`f69b4e76…`,
`5eb20564…`/`9cb6961c…` y `7d239baa…`/`a4c395e0…` no se reejecutan.

Una contradicción entre implementación y estas fuentes termina antes de datos y
exige un plan nuevo versionado.

## Hallazgo que motiva el corte

La igualdad byte a byte del manifest de control contra el freeze-v2 exigía una
población congelada en disco. El protocolo sólo garantiza estabilidad de
inventario **dentro** de un run: entre runs, el directorio es vivo. Contra un
directorio vivo la regla es insatisfacible por construcción, y por tanto el
modo real quedaba condenado a fallar por una causa ajena al análisis, igual que
el ancla de protocolo del preflight Git que corrigió G6.

Lo que la regla debía proteger sigue siendo válido y no se toca: que el run del
modo shape reproduzca exactamente el análisis congelado en todo lo que sostiene
la figura. Lo que se corrige es sólo su forma, que confundía «el análisis no
cambió» con «el directorio no cambió».

## Regla de control C1–C5 (única sustitución respecto a TA-04F8)

Se elimina la regla de igualdad byte a byte y se sustituye por las cinco
condiciones siguientes, **conjuntas y todas obligatorias**. Se evalúan sobre el
manifest de control nuevo frente a la baseline `041c4184…`. El runner **no lee**
la baseline en tiempo de ejecución: C1–C5 son un test dedicado de Gate 2 y un
check humano de Gate 4, exactamente como en TA-04F8.

Sea `F` el freeze-v2 y `M` el manifest nuevo.

**C1 — invariancia del prefijo congelado.** Para cada ordinal `1..48`, los
**quince** campos del grupo en `M` son iguales campo a campo a los de `F`.
Cualquier diferencia, en cualquier campo de cualquiera de los 48 grupos, es STOP.

**C2 — aditividad estricta de los grupos nuevos.** `len(M.groups) >= 48`. Todo
grupo de ordinal `>= 49` cumple exactamente:
`eligible_recordings = 0`, `contributing_recordings = 0`, `passing_recordings = 0`,
`failing_recordings = 0`, `crossfit_insufficient_recordings = 0`,
`evaluated_slots = passed_slots = failed_threshold_slots =
failed_eval_geometry_slots = failed_training_fold_slots = 0`,
`decision = "stop_insufficient"`, `cross_recording_confidence = "none"`,
`discovered_recordings = insufficient_laps_recordings >= 1`.
Un solo grupo nuevo con `eligible_recordings >= 1` es STOP.

**C3 — conservación de población, monótona y no destructiva.** Con
`Δcand = M.inventory_candidates − 319`, `Δcanon = M.canonical_recordings − 186`,
`Δinsuf = M.insufficient_laps_recordings − 183` y
`Δinvalid = M.data_invalid − 133`:

```text
Δcand >= 0  and  Δcanon >= 0  and  Δinsuf >= 0  and  Δinvalid >= 0
M.duplicates = M.authorization_rejected = M.stability_rejected
             = M.artifact_guard_rejected = 0
M.eligible_recordings = 3
Δcand   = Δcanon + Δinvalid
Δcanon  = Δinsuf
Δcanon  = sum( M.groups[ordinal >= 49].discovered_recordings )
```

Además siguen vigentes, sin cambio, **todas** las ecuaciones de conservación
globales, por grupo y de slots de TA-04F7. Cualquier delta negativo —es decir,
cualquier desaparición— es STOP: la regla tolera crecimiento aditivo, nunca
pérdida.

**C4 — invariancia de las decisiones que sostienen la figura.** Los grupos
ordinales `1` y `37` son `technical_go_local_shape_local_only` con
`cross_recording_confidence = "none"`; el ordinal `36` es
`technical_no_go_local_shape`. Formalmente está implicado por C1; se enumera
aparte porque es la condición cuya violación invalidaría directamente los dos
paneles, y debe poder verificarse a mano sin recorrer los 48 grupos.

**C5 — estado global.** `M.outcome = "analysis_complete"`,
`M.inventory_stable = true`, `M.cleanup = 0/0/0`, `M.local_shape = "unknown"`,
`M.product_map_authorization = false`.

### Por qué C1–C5 no es una relajación disfrazada

- **Puede fallar, y fallará ante cualquier cosa que importe.** El orden canónico
  es `ModifiedAt` UTC ascendente, `Size` ascendente y `CandidateID` bytes
  ascendente, y los ordinales de grupo se asignan por primera aparición. Una
  grabación nueva con `ModifiedAt` **anterior** a alguna existente se inserta
  antes en el orden canónico y **reindexa** grupos: C1 falla y el corte se
  detiene. Un artifact que desaparezca, se reemplace o cambie de bytes rompe
  C1 o C3. Una grabación nueva elegible rompe C2. La regla no es un sello: es
  una condición que el mundo puede incumplir.
- **Conserva la misma fuerza sobre el prefijo compartido.** C1 exige identidad
  campo a campo de los 48 grupos previos, que es la parte de la igualdad antigua
  que sostiene la figura; C4 hace explícitos los tres grupos de decisión. C2
  añade una forma cerrada para el sufijo nuevo, caso que la igualdad antigua no
  podía aceptar ni describir.
- **Sólo se relaja en el eje que era insatisfacible por construcción**: la
  cardinalidad del directorio entre runs.
- **No se aplica retroactivamente.** C1–C5 no se evalúa contra el manifest
  rechazado de TA-04F8 en ningún gate, test ni check. Ese documento no vuelve a
  compararse con nada.

### Terminal duro

Si la ejecución única de Gate 3 incumple cualquiera de C1–C5, **la línea de la
figura descriptiva se cierra**. No hay TA-04F10, no hay tercera regla de control
y no se vuelve a ablandar el criterio. Las salidas se custodian como rechazadas
y el corte termina en STOP definitivo. Reabrir exigiría una decisión humana de
naturaleza distinta, no otra iteración de esta misma regla.

## Herencia sin cambios

Se heredan literalmente de `ta04f8-shape-export-plan.md` y sus errata, y **no se
modifican**:

- población, discovery exhaustivo, orden canónico, dedupe por `session.ID`,
  oracle de vuelta y guards F6;
- inventario metadata-only PRE/POST con clave CSPRNG efímera, y revalidación
  PRE/POST por artifact;
- malla de 1.000 bins, proyección equirectangular, interpolación cíclica,
  Kabsch rígido 2D, medianas, centerline de dos pasadas, cross-fit par/impar sin
  leakage, thresholds p95 `<= 5 m` / p99 `<= 10 m` / `>= 80 %` y la matriz de
  decisión completa;
- cobertura autorizada: exactamente los grupos ordinales `1` y `37`; el `36` y
  todos los `stop_insufficient` quedan fuera incluso como panel vacío, marca,
  sombra o conteo dibujado;
- canonicalización de `shape` con centroide cero, rotación canónica arbitraria,
  guard de degeneración adimensional **E1**, desempate de signo estable **E2** y
  redondeo a `0,1 m` con `-0` normalizado;
- escala relativa derivada, no geodésica, sin barra de escala ni cifra en metros;
- schema del shape export y del manifest de control, serialización canónica,
  vocabularios cerrados y rechazo de claves extra/ausentes/desordenadas;
- flag obligatorio `-gate3-authorized` **E3**;
- preflight de las cuatro rutas antes de backend y discovery **E4**, con
  revalidación de ambos guards antes de cada publicación;
- contrato estricto del generador SVG **E5**, límites de lectura **E6**, pie
  literal de seis negaciones **E7** y fixture sintético de topología real **E8**;
- forma de invocación congelada con `@args` entrecomillados **G2** y regresiones
  de la costura CLI **G4**;
- ancla del preflight Git a `c.ProtocolSHA` **G6**;
- límites de recursos, budgets, caps por recording y
  `logical_live_bytes <= 512 MiB`;
- lifecycle de output atómico: temp `O_CREATE|O_EXCL`, escribir, `Sync`, `Close`
  comprobado, reabrir y verificar bytes, publicar con `os.Link` —que nunca
  sobrescribe—, reverificar el final, borrar sólo el temporal exacto y comprobar
  su ausencia; `Lstat` e identidad de ancestros antes de crear temp y antes y
  después de cada `Link`; nunca `rename`/`replace`;
- privacidad, custodia local-only, riesgo residual declarado de forma
  autoidentificable, y cleanup obligatorio `0/0/0`.

## Modo, versiones y rutas nuevas

Modo nuevo del runner hijo: **`existing-live-inventory-shape`**. No se reutiliza
`existing-authorized-shape`, para que la semántica congelada de aquel modo siga
intacta y testable, y para que ningún artefacto de TA-04F8 pueda confundirse con
uno de TA-04F9.

- Shape export: `version = "ta04f9/v1"`, `mode = "existing-live-inventory-shape"`.
  El resto del schema es idéntico a `ta04f8/v1`, clave por clave y en el mismo
  orden.
- Manifest de control: `version` sigue siendo `"ta04f7/v1"` —el schema agregado
  no cambia— con la misma excepción enumerada de una sola clave top-level `mode`
  inmediatamente después de `runner_sha`, ahora con valor
  `"existing-live-inventory-shape"`.

Rutas finales nuevas, bajo `docs/vantare-program/research/telemetry-analysis/`:

- `ta04f9-historical-cluster-manifest-v1.json`;
- `ta04f9-shape-export-v1.json`;
- `ta04f9-shape-figure.svg` (Gate 4, desde el JSON).

Temporal determinista por salida:
`<final>.ta04f9-<protocol_sha_12>-<runner_sha_12>.tmp`.

Las rutas canónicas de TA-04F8 no se reutilizan, no se recrean y no se tocan.

Caps de tamaño heredados: shape export `<= 64 KiB`, SVG `<= 128 KiB`; superarlos
es `pipeline_fault(resource_cap)` y aborta la generación respectivamente.

## Gates

### Gate 0 — decisión humana, bloqueante, en commit propio

Gate 1 **no concede** ninguna autorización. Antes de Gate 2, Isaac debe registrar
en un archivo nuevo y dedicado
`ta04f9-gate0-authorization.md`, en un commit separado y posterior, dos cosas
explícitas:

1. que acepta que el inventario en disco es **vivo y aditivo** en vez de
   congelado, en los términos exactos de C1–C5 tal como quedan fijados por Gate 1;
2. que **vuelve a conceder** la autorización visual que TA-04F8 consumió, para
   **exactamente una** ejecución bajo este protocolo.

El archivo de autorización debe citar el SHA exacto del commit de Gate 1 y no
puede modificar este plan ni ningún criterio C1–C5. Sin ambas autorizaciones,
TA-04F9 termina aquí sin figura y sin Gate 2.

Nota de orden, declarada y no disimulada: las fuentes vivas piden «primero una
decisión humana separada y después un protocolo nuevo explícito», y este Gate 1
escribe el protocolo antes de la decisión. Se hace así a propósito y es más
estricto, no menos: obliga a que el criterio esté congelado y sea inspeccionable
**antes** de decidir, en vez de aprobar en abstracto y redactar el criterio
después. La decisión sustantiva sigue precediendo a toda ejecución, que es lo
que la regla protege.

### Gate 1 — plan

Versionar sólo este protocolo en un commit documental dedicado, padre único
`d522225304b56be3ff9e3a8874f94e1795cb04c8`. No implementar, no abrir datos, no
generar artefactos. El SHA de este commit es el `protocol_sha` que se incrusta en
el runner hijo.

### Gate 2 — runner hijo y generador, por TDD

Sólo tras Gate 0. El runner embebe por separado el `protocol_sha` de Gate 1 y el
SHA del commit de autorización de Gate 0; el preflight exige ambos ancestros y
los blobs exactos antes de cualquier backend o discovery. Implementar el modo
`existing-live-inventory-shape` en
`tools/ta04f7-historical-cluster` y la aceptación de `ta04f9/v1` en
`tools/ta04f8-shape-figure`. Empezar RED. Sólo standard library de Go; sin
dependencias nuevas. Cobertura mínima **añadida** respecto a la de TA-04F8, que
se conserva íntegra:

1. **C1**: mutar cualquiera de los quince campos de cualquiera de los 48 grupos
   previos produce STOP; tabla que cubre al menos un campo de conteo, uno de
   slots, `decision` y `cross_recording_confidence`.
2. **C2**: grupo nuevo con `eligible_recordings >= 1` es STOP; grupo nuevo con
   cualquier slot distinto de `0` es STOP; grupo nuevo con
   `decision != "stop_insufficient"` es STOP; grupo nuevo con
   `discovered_recordings != insufficient_laps_recordings` es STOP;
   `discovered_recordings = 0` es STOP.
3. **C3**: cada delta negativo por separado es STOP; `eligible_recordings != 3`
   es STOP; cualquiera de los cuatro campos de rechazo distinto de `0` es STOP;
   romper `Δcand = Δcanon + Δinvalid`, `Δcanon = Δinsuf` o la suma sobre grupos
   nuevos es STOP, cada una probada de forma independiente.
4. **C4**: cambiar la decisión o la confianza del grupo 1, del 37 o del 36 es
   STOP.
5. **C5**: `outcome`, `inventory_stable`, `cleanup`, `local_shape` y
   `product_map_authorization` fuera de sus valores exigidos son STOP, cada uno
   por separado.
6. **Caso positivo, y sólo uno**: el vector `48 grupos idénticos + un grupo 49
   aditivo` construido **en el test, a mano y desde la baseline**, pasa C1–C5.
   Ese fixture no se deriva de ningún artefacto rechazado y el test no los abre.
7. **Aislamiento de custodia**: un test comprueba que ni el runner ni el
   generador ni la suite abren, leen o referencian los tres artefactos
   rechazados.
8. **Generador**: acepta `ta04f9/v1` con `mode = existing-live-inventory-shape` y
   el `protocol_sha` vigente; rechaza `ta04f8/v1`, modo ajeno, SHA ajeno, 1 o 3
   paneles y ordinales fuera de `[1, 37]`; `viewBox` fijo `0 0 860 500`; pie
   literal E7 presente; sin ejes, rejilla, ticks, flecha, barra de escala,
   `<script>`, `<image>` ni referencias externas.
9. **Regresiones heredadas** de TA-04F8 vigentes sin cambio: E1–E8, G2, G4, G6,
   privacidad sobre JSON/SVG/stdout/stderr, output lifecycle y recursos.

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

Commit dedicado, padre único Gate 0, scope limitado a los dos tools.

### Gate 3 — una ejecución existing-only

Con worktree limpio y `HEAD` igual al SHA revisado del runner hijo, ejecutar
**exactamente una vez** `existing-live-inventory-shape`, con la forma de
invocación congelada G2 y el flag `-gate3-authorized`. Redescubrir todo,
deduplicar y evaluar todos los grupos; no reutilizar cifras ni selección previas.
Publicar manifest de control y shape export. **No se genera SVG en este gate.**

Cualquier repetición exige nuevo commit de protocolo, nuevo runner SHA y plan
explícito de custodia del output anterior, y queda además sujeta al terminal duro
de C1–C5.

### Gate 4 — verificación, figura y freeze

Una revisión externa/humana reabre las salidas y verifica schema, SHAs, bytes
canónicos, `temp = 0`, privacidad, budgets, cleanup y **C1–C5 contra la baseline
`041c4184…`**. Sólo si las cinco condiciones pasan se genera el SVG desde el JSON
y se versionan los tres artefactos en un commit dedicado. Gate 4 no abre datos y
no es otra invocación de Gate 3. TA-04F9 termina aquí.

## STOP exacto

Se detiene el flujo y **no se dibuja nada** si:

1. falla cualquiera de C1, C2, C3, C4 o C5;
2. el outcome global deja de ser `analysis_complete`, o los grupos 1 y 37 dejan
   de ser `technical_go_local_shape_local_only`;
3. aparece cualquier `pipeline_fault`, o `cleanup` distinto de `0/0/0`;
4. existe `final` o `temp` preexistente en cualquiera de las rutas nuevas;
5. falla un check de privacidad, o aparece un campo fuera del schema fijado;
6. la canonicalización resulta degenerada o no finita;
7. se pide incluir el grupo 36, un `stop_insufficient`, un grupo de ordinal
   `>= 49`, un segundo recording sintetizado, superposición de paneles,
   comparación con circuito, anchura, bordes, norte o barra de escala;
8. se pide leer, reusar o comparar cualquiera de los tres artefactos rechazados;
9. falta el Gate 0 completo, o se pretende una segunda ejecución;
10. el trabajo necesita tocar `frontend/`, `WidgetVisualHost`, Overlay Studio,
    overlays, capability de producto, TA-04B o cualquier promoción;
11. se requiere una dependencia nueva, o una acción externa (push, PR, CI, merge,
    release).

En todos los casos se conserva la evidencia, se documenta y se para.

**`local_shape` permanece `unknown` y `product_map_authorization` permanece
`false` también después de producir la figura.** Este corte es descriptivo: no
promueve capability, no demuestra geolocalización, no demuestra anchura y no
desbloquea TA-04B.

## Criterio de cierre y verificación manual

TA-04F9 queda cerrado cuando sus gates están separados por commits, Gate 0 consta
por escrito, el run existing-only es único, C1–C5 pasan contra la baseline, el
JSON y el SVG están sanitizados, cleanup pasó y ninguna capability de producto
cambió.

Verificación manual: revisar historia lineal y scopes de commits; ejecutar
synthetic; comprobar los dos JSON contra sus schemas; evaluar C1–C5 a mano contra
`041c4184…`; abrir el SVG y confirmar dos paneles, ausencia de
norte/barra de escala/ejes y presencia literal de las seis negaciones; confirmar
que los tres artefactos rechazados conservan sus SHA-256 y no fueron abiertos;
confirmar ausencia de archivos fuera de los previstos.

## Issues pendientes (no crear ahora)

- Crear/recuperar TA-04C, TA-04D, TA-04E, TA-04F/TA-04F6, TA-04F7 y TA-04F8 con
  sus dependencias y evidencia local.
- Issue separada para TA-04F9 Gate 0 (decisión humana).
- Issue separada para TA-04F9 Gate 2 (runner hijo, generador y reviews).
- Issue separada para TA-04F9 Gate 3/4 (ejecución, verificación y figura).
- TA-04D sigue pendiente para datum/CRS y semántica oficial de ambos bordes;
  TA-04F9 no lo resuelve.
- TA-04B permanece bloqueada; este corte no la abre.
