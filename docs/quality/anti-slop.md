# Vantare anti-slop: criterios de diseño

Este documento define la política de calidad "anti-slop" de Vantare como
**criterios de diseño**, no como prohibiciones sintácticas. El objetivo no es
reducir líneas de código ni silenciar avisos: es impedir que la complejidad
accidental y las regresiones se acumulen sin que nadie las autorice.

## Principio rector

Un gate de calidad existe para que un cambio que empeora el código no pueda
mezclarse con uno que lo mejora y quedar oculto. Compara **identidades** de
hallazgos, jamás recuentos: eliminar un hallazgo viejo A e introducir uno
nuevo B con identidad distinta SIGUE FALLANDO aunque el total de avisos no
suba.

## Reglas deterministas (bloqueantes) vs. reglas con juicio

### Deterministas y bloqueantes

Estas reglas se verifican sin interpretación humana y bloquean el PR si hay
un hallazgo NUEVO (no en baseline, no exceptuado):

- **staticcheck**: hallazgos nuevos por código de regla + path + mensaje.
- **go vet**: hallazgos nuevos por path + mensaje.
- **knip**: exports/tipos/archivos/dependencias no usados, nuevos por regla +
  path + símbolo. knip no distingue entradas de producción de dev/test de forma
  fiable; esa distinción es documentación, no un control ejecutable.
- **dependency-cruiser**: fronteras verificables (ciclos; renderizadores y
  canvas no acceden a @wailsio/@supabase). Bloquea por ESTADO (no por ratchet):
  usa `--ignore-known` con su baseline nativo de known-violations, y cualquier
  violación nueva (exit 1) es bloqueante. Excluye bindings y generado del
  grafo, no solo de los hallazgos.
- **go mod tidy -diff**: control objetivo sin baseline. Cualquier diff no
  exceptuado es bloqueante. No modifica manifiestos.
- **jscpd**: duplicación nueva por identidad (content_hash del fragmento), un
  hallazgo por emplazamiento. Semántica de multiconjunto: un TERCER
  emplazamiento de un clon conocido es NUEVO, no absorbido por el par antiguo,
  y una segunda aparición de la misma identidad en el mismo archivo también
  es NUEVO.

### Reagrupaciones de jscpd con evidencia de fuente

El detector puede cambiar fragmentos y repetir un mismo sitio en varios pares
al eliminar otro archivo. `check` conserva el ratchet por identidad y registra
como `REGROUPED` únicamente identidades nuevas en paths ya conocidos por el
baseline, cuando la fuente completa es idéntica en **procedencia del baseline,
base real del PR y disco**. No se aplica a excedentes de identidades ya conocidas
ni a MOVED. Una copia física añadida en el mismo archivo cambia sus bytes;
una copia en otro path no tiene esa evidencia. Ambas siguen bloqueando.

El baseline debe ser idéntico al leído de la base real del PR. Solo se aceptan
fuentes regulares Git y rutas canónicas sin symlinks. Si falta el commit histórico
tras un squash o un checkout superficial, se intenta recuperar ese SHA exacto
desde `origin` con un límite de 60 segundos, sin cambiar HEAD ni ramas. Si no se
puede comprobar, el gate falla cerrado. No se acepta ni reescribe el baseline.
El informe enumera cada registro reagrupado, path real, blob y SHA de procedencia.
Los cambios de política siguen exigiendo revisión y devolviendo exit distinto de cero.

### Informativas (no bloqueantes)

- **deadcode**: código inalcanzable. Informativo porque en Go el análisis
  multiplataforma tiene ruido (métodos accedidos vía reflexión/Wails). Se
  ejecuta por configuración (darwin-dev + windows-amd64) y queda en el
  informe, pero no bloquea.

### Requieren juicio humano (REVIEW_REQUIRED)

- **MOVED**: un hallazgo que desaparece de un path y aparece con la misma
  regla+mensaje en otro. No se castiga como defecto nuevo, pero BLOQUEA
  llevando el agregado a `REVIEW_REQUIRED` (exit ≠ 0): un traslado legítimo
  no pasa solo, exige revisión explícita.
- Cualquier cambio que toque `tools/quality/**`, los baselines, la
  configuración de analizadores, los ignores o `.github/workflows/quality.yml`
  marca `policy_changed: true`, fuerza análisis de grafo completo y el
  agregado pasa a `REVIEW_REQUIRED` (exit ≠ 0). Un PR no puede blanquear una
  regresión editando a la vez el producto y sus jueces.

## PROTECCIÓN EXPLICITA (esto NO es slop)

Nada de lo que construya el sistema de calidad puede sugerir eliminar:

- **Validación de datos externos**: los datos que cruzan un límite de
  confianza (red, disco, IPC, parseo) deben validarse. La redundancia
  defensiva no es slop.
- **IPC y red**: el código que habla con el sistema operativo, el frontend o
  servicios remotos no es redundante por tener capas.
- **Disco y persistencia**: la serialización, el manejo de errores de E/S y
  la integridad de datos no se retiran.
- **Autenticación, licencias y autorización**: nunca se eliminan por
  "parecer duplicadas". Su ausencia es una vulnerabilidad, no una
  simplificación.
- **Concurrencia**: mutexes, canales, sincronización y ordenamiento de
  operaciones no son slop. Su corrección es sutil y no se demuestra con tipos.
- **Timeouts, cancelación y limpieza de recursos**: un timeout no es
  complejidad accidental; es la diferencia entre un sistema que se recupera y
  uno que cuelga. No se retiran sin demostrar que sobran.
- **Manejo de errores**: el manejo explícito de errores NO es slop. Los tipos
  estáticos NO demuestran validez en runtime. Un `if err != nil` o un
  `try/catch` que protege un camino de fallo no se elimina por estética.

**Los tipos estáticos no demuestran validez en runtime.** Un contrato de
tipos no garantiza que los datos sean correctos, que los límites se
respeten o que los errores se manejen. La validación en fronteras y el
manejo de errores son controles de runtime que los tipos no reemplazan.

## Ratchet: la integridad del baseline

- Los baselines se aceptan solo con `baseline --confirm` (nunca en CI). `audit`
  analiza pero NO escribe baselines.
- Los baselines son portables: las configs semánticas (`host-go` para Go del
  host, `windows-amd64` para cruce Windows, `frontend` para npm) separan la
  procedencia del host de la cobertura semántica. Darwin y Linux producen
  el mismo conjunto de configs, así el baseline es comparable entre plataformas.
- `check` da ERROR si el `scope_hash` o las versiones de las herramientas
  difieren de la configuración actual: obliga recalibración explícita.
- `check` da FAIL si un analizador con baseline no produjo resultado (NOT_RUN):
  un analizador no puede desaparecer en silencio.
- La cabecera del baseline guarda `base_sha` como **procedencia** (de qué
  SHA se generó), NO como oráculo de manipulación. El diff de política se
  calcula contra la base real del PR (`--base <sha>` en CI, o
  `merge-base origin/nightly HEAD` en local) y considera también los archivos
  sin commit (`git status --porcelain`).
- Si la base no se puede determinar, el estado es `BLOCKED` (exit ≠ 0), nunca
  PASS.

## Estados del agregado

| Estado | Significado | exit |
|---|---|---|
| PASS | Ejecutado y cumple (sin NEW bloqueante, sin ERROR, sin policy_changed) | 0 |
| FAIL | Hay NEW bloqueante, ERROR, o problema de integridad | 1 |
| ERROR | Un analizador cascó, escaneó 0 archivos, o la versión no coincide | 1 |
| BLOCKED | No se pudo determinar la base del diff; no se puede garantizar integridad | 1 |
| REVIEW_REQUIRED | El cambio toca la política; exige revisión externa | 1 |
| NOT_RUN | El analizador no se ejecutó (debe distinguirse de PASS) | 1 |
| NOT_APPLICABLE | El analizador no aplica a esta unidad (ej. knip en Go) | 0 |

`REVIEW_REQUIRED` sale con exit ≠ 0: un PR que toca la política no puede
dejar CI en verde sin revisión.

## Excepciones

Las excepciones se documentan en `tools/quality/exceptions.json` con regla,
hallazgo, razón, alcance, evidencia y condición de reevaluación. `check` las
lista en cada ejecución como excepción activa para que no se conviertan en
deuda invisible. Una excepción no es un silencio: es un hallazgo visible que
se acepta temporalmente con una razón explícita.
