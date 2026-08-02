# STR-02 — Contrato unificado, unidades y estados

Fecha: 2026-08-01
Issue: ISA-137
Versión inicial: `strategy.v1`

## Resultado

Strategy Planner dispone de un contrato de dominio pequeño y versionado para
separar edición, revisión aceptable, plan activo, observación live y propuesta
de cambio. Este corte no persiste documentos, no calcula estrategias y no se
conecta a Telemetry Core, LMU, DuckDB, Wails ni la interfaz.

Autoridad Go:

- `internal/strategy/contract`

Espejo de lectura del frontend:

- `frontend/src/strategy/strategy-contract-v1.ts`

Contrato comprobable entre ambos:

- `internal/strategy/contract/testdata/contract_manifest_v1.json`
- `internal/strategy/contract/testdata/plan_revision_v1.golden.json`
- `internal/strategy/contract/testdata/canonicalization_v1.json`
- `internal/strategy/contract/testdata/validation_v1.json`
- `internal/strategy/contract/testdata/execution_state_v1.json`

## Ciclo de vida

```text
PlanDraft mutable
    │ captura explícita
    ▼
PlanRevision inmutable + hash SHA-256
    │ activación explícita
    ▼
ActivePlan ──► StrategyExecutionState efímero y secuenciado
    │
    └─ cambio detectado ─► ReplanProposal
                              │ aceptación explícita
                              ▼
                         nuevo ActivePlan
```

### `PlanDraft`

- Es el único documento mutable.
- Identifica plan, variante y borrador.
- Puede referenciar la revisión de la que parte.
- Declara modo, capabilities, procedencia, confianza y momento de edición.
- Nunca puede gobernar directamente un overlay o una ejecución.

### `PlanRevision`

- Se crea capturando el borrador en JSON independiente; no conserva aliases a
  mapas, slices ni timestamps mutables del draft.
- Su identidad completa es plan + variante + revisión + hash.
- El hash `sha256:strategy-c14n-v1` cubre metadatos y payload, pero no el
  propio hash.
- Una revisión alterada se rechaza al decodificar.
- La entrada JSON se valida antes de convertirla: claves duplicadas, campos
  desconocidos, enteros no seguros, números no finitos, timestamps no
  canónicos y hashes no minúsculos se rechazan.
- Go crea revisiones. TypeScript las valida y comprueba; no mantiene un segundo
  algoritmo de creación.

### `ActivePlan`

- Apunta a una revisión exacta y verificable.
- Conserva la revisión anterior cuando se aplica un replan.
- Un `PlanDraft` o una propuesta pendiente no pueden convertirse en plan
  activo.
- Reaplicar la misma propuesta aceptada sobre su candidata ya activa es
  idempotente: devuelve una copia del snapshot existente. Solo se reconoce la
  repetición cuando candidata, base, plan, variante y revisión anterior
  coinciden; cualquier historial distinto es un conflicto de revisión.

### `StrategyExecutionState`

- Es estado live efímero; no sustituye al documento del plan.
- Lleva `epoch` y `sequence` monotónicos.
- `epoch` y `sequence` usan el dominio entero compartido `1..2^53-1`; el valor
  máximo se acepta y el siguiente se rechaza en Go y TypeScript.
- Una secuencia vieja se rechaza.
- `completed` y `stopped` son estados terminales.
- Expone capabilities, procedencia, confianza y revisión activa.
- Constructor y transiciones conservan snapshots profundos; una mutación del
  input o del estado siguiente no altera snapshots anteriores.
- Go y TypeScript disponen de decoders estrictos equivalentes. Rechazan campos
  desconocidos o duplicados en cualquier nivel, trailing data, timestamps no
  canónicos, capabilities inválidas y documentos anidados incompletos.

### `ReplanProposal`

- Referencia una revisión base y una candidata del mismo plan y variante.
- Explica el motivo mediante un código estable.
- Puede tener caducidad.
- Solo una propuesta aceptada explícitamente puede producir un nuevo
  `ActivePlan`.
- Si el plan activo cambió desde que se creó la propuesta, la activación falla
  como conflicto de revisión.

## Unidades

No existe un número genérico de recursos. Los contratos definen tipos distintos
para:

- litros de combustible;
- porcentaje de Virtual Energy;
- segundos;
- vueltas;
- metros;
- porcentaje restante de neumático.

Fuel y Virtual Energy tienen constructores, validadores y operaciones separados.
No pueden sumarse entre sí en Go ni TypeScript. Los porcentajes permanecen en
`0..100`; el resto de cantidades no admite negativos, infinitos ni `NaN`.

Este corte no fija todavía consumo por vuelta, modelo de stint o formato del
inventario: corresponden a STR-05 y STR-06. Sí impide que esos cortes vuelvan a
mezclar Fuel y Virtual Energy.

## Procedencia y confianza

Procedencias válidas:

- `unknown`
- `observed`
- `corrected`
- `manual`
- `derived`
- `estimated`
- `range`

Una procedencia conocida exige `sourceId`. `unknown` no puede fingir una fuente.
La confianza es `unknown`, `low`, `medium` o `high`; cualquier nivel conocido
exige una explicación en `basis`. No se inventan porcentajes de confianza.

## Capabilities

La versión inicial declara únicamente capacidades necesarias para enrutar y
degradar el producto sin adivinar soporte:

- inputs manuales;
- importación de telemetría;
- actualizaciones live;
- inventario de neumáticos;
- estrategia de combustible;
- estrategia de Virtual Energy;
- comparación de planes;
- replan.

Las listas se normalizan como conjuntos ordenados y sin duplicados antes de
entrar en una revisión o estado de ejecución.

## Versiones y migraciones

`strategy.v1` es la primera versión persistible. El punto de entrada de
migración acepta esta versión como no-op y rechaza versiones desconocidas. No
se inventa una migración desde Product A: aquel paquete continúa como oráculo
histórico, no como documento productivo.

Una versión futura deberá añadir una migración explícita, fixture antes/después
y actualización del manifiesto compartido. Nunca se interpreta silenciosamente
un documento futuro como v1.

## Errores

Los errores tienen código estable y campo, por lo que UI, persistencia y tests
no comparan textos humanos. Entre ellos están versión incompatible, unidad
inválida, hash alterado, conflicto de revisión, propuesta no aceptada o caducada
y secuencia no monotónica.

## Cómo se evita la duplicación Go/TypeScript

1. Go es la autoridad de creación. Ambos runtimes implementan el mismo encoder
   binario versionado porque ambos deben poder verificar exactamente el hash.
2. El manifiesto JSON enumera versión, estados, unidades, errors, capabilities
   y campos obligatorios de los cinco documentos.
3. El test Go compara sus símbolos exportados con ese manifiesto.
4. El test TypeScript compara su espejo con el mismo manifiesto.
5. El corpus adversarial fija bytes y hash esperados para `&<>`, separadores
   Unicode, claves astrales, orden de claves UTF-8, `-0` y límites numéricos;
   también exige rechazar duplicados, trailing data, `NaN`/infinito, enteros
   inseguros y Unicode ambiguo.
6. Go genera la revisión golden; ambos lados verifican el mismo documento y
   hash. Un corpus adicional fija hashes SHA-256 minúsculos y timestamps UTC
   RFC3339 canónicos con precisión máxima de milisegundos.
7. El corpus de execution state exige el mismo resultado accept/reject y la
   misma pareja exacta `errorCode` + `errorField` en ambos runtimes, incluidos
   límites `2^53-1`, shape anidado, timestamps y capabilities. Sus 25 casos,
   nombres y orden forman un inventario fijo; regresiones adicionales cubren
   tipos escalares y paths completos de revision, provenance y confidence.

### Canonicalización `strategy-c14n-v1`

No se firma el texto JSON ni se depende de `JSON.stringify`. El encoder usa
tags binarios para null, booleanos, float64, strings, arrays y objetos; escribe
longitudes y conteos `uint32` big-endian, normaliza `-0` a `+0` y ordena claves
por bytes UTF-8. Los límites son 4 MiB de JSON, 16 MiB de salida, profundidad
64 y 1.048.576 elementos por contenedor. Los enteros fuera de ±(2^53−1), los
números no finitos y valores Unicode ambiguos se rechazan para que Go y
TypeScript nunca firmen valores distintos.

Estos límites se publican en el manifiesto compartido. El límite de elementos
solo se aplica a arrays y objetos; los bytes de un string quedan gobernados por
los límites globales de entrada/salida y por la longitud binaria `uint32` en
ambos runtimes.

`LapCount`, `epoch` y `sequence` aplican además ese máximo en sus constructores
y validadores de dominio, no solo durante la canonicalización JSON.

El encoder TypeScript vuelve a aplicar los límites de salida, elementos y
profundidad cuando recibe un valor ya construido para verificar un hash; no
depende de que el input haya atravesado primero el parser JSON. Si un documento
declara explícitamente una versión desconocida, ambos runtimes devuelven
`unsupported_contract_version` antes de interpretar la shape v1. Un documento
sin `contractVersion` conserva el error de campo obligatorio.

Cambiar un enum o una forma en un solo lenguaje rompe el build en lugar de
crear drift silencioso.

## Fuera de alcance

- persistencia, recovery, concurrencia y borrado: STR-03;
- fachada de comandos, dirty y undo/redo: STR-04;
- modelo manual de carrera: STR-05;
- inventario de neumáticos: STR-06;
- cálculo, optimización, UI y live;
- Shared Memory, LMU REST, archivos históricos, DuckDB, Wails y SSE.

## Evidencia

- TDD rojo: el paquete Go y el espejo TypeScript no existían.
- Tests Go: invariantes del ciclo de vida, round-trip, manipulación, hash,
  inmutabilidad, migración inicial, errores tipados y property tests de unidades.
- Tests TypeScript: manifiesto común, tipos incompatibles, validación de unidades
  y revisión golden/hash cruzados.
- Ninguna dependencia nueva.
