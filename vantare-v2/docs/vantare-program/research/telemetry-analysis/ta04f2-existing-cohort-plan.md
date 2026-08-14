# TA-04F2 — caracterización histórica con cohorte bloqueada existente

Estado: suplemento documental local para un **nuevo corte histórico** de TA-04F.
Este documento **solo** supersede, para este corte, la exigencia de holdout
virgen post-freeze de
`c8e064d1c9add0cc8c807f415531bae225f9924d` y preserva intacto el cierre
canónico de TA-04F en **`STOP insuficiente`** como evidencia del intento de
holdout genuino. No reabre TA-04E, no convierte este corte en validación
independiente y no autoriza mapa, UI o trabajo visual.

## Naturaleza de este corte

TA-04F2 es **caracterización histórica**, no confirmación independiente. La
cohorte queda bloqueada sobre recordings ya existentes y autorizados; por
diseño, no es un holdout virgen. Por tanto:

- los outcomes se interpretan como `historical_characterization`, nunca como
  `GO` confirmatorio;
- `local_shape` permanece `unknown` en todos los resultados;
- TA-04B continúa en **STOP visual**;
- se conserva la pila productiva aprobada, con PRE/POST, lectura read-only,
  `Close -> Cleanup` y prohibición de exponer rutas, IDs, timestamps crudos,
  coordenadas, muestras o metadata sensible, salvo los commitments pseudónimos
  limitados y versionados que este plan autoriza solo para este corte local.

## Herencia obligatoria desde TA-04F

Salvo por las diferencias explícitas de este documento, TA-04F2 hereda **sin
cambios** de `ta04f-repetition-variance-plan.md` en `c8e064d`:

- matemática, malla, proyección local y alineación rígida;
- controles sintéticos, reread determinista y guards de custodia;
- definiciones de residuales, proxies y bootstrap;
- separación entre medida y trayectoria;
- prohibición de derivar datum, geolocalización absoluta, anchura o fórmula
  confirmatoria desde `Path Lateral`/`Track Edge`;
- redacción de outputs y cleanup final.

Este archivo documenta solo el delta de cohorte, selección ciega y reporting.

## Universo permitido y exclusiones

Fuente permitida: únicamente los DuckDB ya existentes y explícitamente
autorizados para este corte. Este plan no abre ninguno ahora.

Exclusiones obligatorias de cohorte:

1. Reconstruir y excluir, cuando sea demostrable con reglas deterministas y
   metadata permitida, el **primer grupo compatible de TA-04E**.
2. Reconstruir y excluir, cuando sea demostrable con reglas deterministas y
   metadata permitida, el **recording usado en TA-04G**.
3. Si no puede demostrarse la exclusión exacta de alguno de esos artifacts, no
   se fingirá certeza retroactiva. En ese caso, la cohorte final debe elegirse
   con un `group key` públicamente distinto del identificado en TA-04G como
   **Algarve International Circuit / Portimão**, y la evidencia final deberá
   declarar posible contaminación residual por un subconjunto desconocido de
   recordings exploratorios previos.

## Selección ciega a outcomes

La selección de cohorte es **ciega** a shape, jitter, residuales, p95/p99,
correlaciones y outcomes finales.

Antes del freeze de selección solo se permite `Open/Inspect` secuencial para:

- elegibilidad de artifact;
- metadata pública allowlisted para derivar `group key`;
- cobertura de los 5 canales requeridos;
- conteo de vueltas completas;
- detección de duplicados.

Antes del freeze de selección está prohibido:

- calcular shape local;
- calcular cualquier residual tangencial, lateral o de magnitud;
- calcular `pace_jitter`, `speed_jitter` o `gps_high_freq_residual`;
- comparar grupos por desempeño;
- repriorizar grupos por resultados observados.

La deduplicación se hace **solo en memoria** por `session.ID`.

## `Group key` exacto y normalización

El `group key` post-`Inspect` se define **exactamente** como la concatenación
ordenada de estos cuatro campos públicos:

- `TrackName`
- `TrackLayout`
- `CarName`
- `CarClass`

`SessionType` queda explícitamente fuera porque podría separar recordings
materialmente compatibles. `WeatherConditions` y `Version` también quedan fuera.

Los cuatro campos son obligatorios. Si cualquiera falta, no es público, no está
`Present=true` o no es `valid`, el candidato queda invalidado para TA-04F2.

Cada componente se normaliza así, en este orden:

1. `strings.TrimSpace`;
2. `strings.Fields` y unión con un único espacio ASCII;
3. `strings.ToLower`.

El `group key` final es la unión de esos cuatro componentes normalizados en el
orden exacto anterior. No se permiten heurísticas adicionales ni accent
folding.

## Exclusión Algarve / Portimão

Después de la normalización anterior, un candidato queda excluido si
`TrackName` o `TrackLayout` contiene cualquiera de estas phrases exactas:

- `algarve international circuit`
- `autodromo internacional do algarve`
- `autódromo internacional do algarve`
- `portimao`
- `portimão`

Si hay coincidencia, el grupo completo queda excluido de la cohorte final de
TA-04F2.

## Algoritmo congelado de discovery y selección

TA-04F2 reutiliza el orden canónico de discovery de TA-04F y lo aplica a la
cohorte histórica:

1. Ejecutar `Discover` por la API autorizada y reordenar explícitamente todos
   los candidatos por `ModifiedAt` ascendente, `Size` ascendente y
   `CandidateID` ascendente. Nunca se confía en el orden devuelto por el
   servicio.
2. Recorrer secuencialmente ese orden post-sort.
3. Abrir e inspeccionar secuencialmente cada candidato solo con los fines
   permitidos arriba.
4. Antes del freeze, el helper puede `ReadPage` solo de los 5 canales
   requeridos para validar cobertura de samples, validar `>= 10` vueltas
   completas y construir los límites espaciales necesarios para ese conteo. Aun
   así, antes del freeze sigue prohibido calcular shape, jitter, residuales o
   proxies. Cada `Open` implica una copia read-only del DuckDB a staging
   privado.
5. Derivar `group key` solo desde `TrackName + TrackLayout + CarName +
   CarClass` ya normalizados; si cualquiera de los cuatro componentes falla la
   validación pública requerida, el candidato queda invalidado.
6. Excluir candidatos que puedan demostrarse pertenecientes al primer grupo
   compatible TA-04E o al recording TA-04G.
7. Dedupe post-open únicamente por `session.ID`, en memoria.
8. Considerar elegible un recording solo si:
   - no duplica por `session.ID`;
   - tiene `>= 10` vueltas completas;
   - tiene cobertura exacta de `GPS Latitude`, `GPS Longitude`, `GPS Time`,
     `Lap Dist` y `Total Dist`;
   - pasa los guards productivos heredados.
9. Ejecutar toda la selección con una sola sesión abierta a la vez y
   `CloseSession` obligatorio antes del siguiente candidato.
10. Aplicar estos budgets duros de selección ciega:
   - máximo `64` candidatos post-sort intentados;
   - máximo acumulado staged `32 GiB`, sumado con `Size` pre-open de cada
     candidato intentado;
   - máximo de tiempo de pared `120 min`;
   - ejecución secuencial de una sola sesión abierta.
11. Si cualquiera de esos budgets se agota antes de congelar una cohorte
   válida, el resultado es **`budget_exhausted`**. No existe fallback.
12. Agotar el recorrido restante dentro de budget sin calcular residuales ni
   proxies.
13. Elegir el primer `group key` por orden de primera aparición que:
   - no esté excluido por la regla Algarve / Portimão;
   - reúna `>= 3` recordings elegibles;
   - permita congelar exactamente sus **primeros 3** recordings elegibles.
14. Si ningún grupo cumple eso, el resultado es **STOP**. No existe fallback
   alternativo y no se fuerza una cohorte de menor calidad.

Recomendación operativa congelada: usar exactamente el **primer `group key` por
orden de aparición** que no quede excluido por la regla Algarve/Portimão y
reúna `>= 3` recordings con `>= 10` vueltas y los 5 canales requeridos; la
cohorte final son exactamente los **primeros 3** de ese grupo.

El grupo elegido no se nombra públicamente durante la selección ni en este
plan. Solo podrá aparecer en la evidencia final si es realmente necesario.

## Freeze exacto de cohorte por coordinador externo y manifest agregado

El freeze de selección de TA-04F2 exige un **selection manifest** agregado
versionado por commit **antes** de cualquier cálculo de residual o proxy. Ese
commit corresponde al orquestador; este plan lo define, pero este worker no lo
ejecuta.

El freeze exacto lo controla un **outer coordinator helper**, no el telemetry
reader. Ese coordinador solo puede retener en RAM los `CandidateID` y
`session.ID` ya seleccionados, junto con sus commitments opacos.

### Artefacto temporal de freeze

Tras terminar la selección ciega y antes de análisis:

1. El outer coordinator debe ejecutar obligatoriamente:
   - `CloseSession` de cualquier sesión abierta;
   - `ServiceShutdown`;
   - verificación `staging = 0`;
   - verificación `readers = 0`.
2. Si cualquiera de esas verificaciones falla, el run termina en
   `pipeline_fault`.
3. El outer coordinator queda **pausado** esperando un sentinel explícito de
   continuación por `stdin`, reteniendo en RAM solo la cohorte opaca
   seleccionada.
4. El outer coordinator escribe un ledger temporal canónico de selección con:
   - `protocol = TA-04F2`;
   - referencia exacta al protocolo base
     `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f-repetition-variance-plan.md@c8e064d1c9add0cc8c807f415531bae225f9924d`;
   - `phase = selection_frozen`;
   - versión del algoritmo de selección;
   - conteos agregados ordenados de discovery, inspeccionados, excluidos TA-04E,
     excluidos TA-04G, excluidos Algarve/Portimão, dedupes, inválidos por
     metadata pública, elegibles y congelados;
   - tamaño final de cohorte (`3` o `0` si STOP);
   - `slot_1`, `slot_2`, `slot_3` solo como ordinales de aceptación;
   - digest SHA-256 con domain separation del `group key` público normalizado
     seleccionado;
   - tres commitments opacos
     `HMAC-SHA256(commit_key, domain || session.ID)`;
   - conteo de recordings seleccionados, vueltas por recording y cobertura de
     canales requeridos por recording;
   - SHA-256 del ledger canónico completo, excluyendo cualquier identidad de
     recording.
5. `commit_key` es una clave aleatoria pública de 32 bytes versionada en el
   manifest para hacer recomputables los commitments de esta corrida. Esto
   introduce una identidad pseudónima limitada: cualquiera que ya posea un
   `session.ID` podría correlacionarlo localmente. Esa limitación se acepta
   solo para este corte local y no autoriza publicar IDs crudos, hashes crudos
   ni rutas.
6. El orquestador crea un commit de freeze que versiona **solo** un selection
   manifest agregado derivado de ese ledger, sin rutas, IDs ni valores por
   muestra.
7. Solo después de ese commit el outer coordinator recibe el sentinel de
   continuación por `stdin`. Como el freeze ya ejecutó `ServiceShutdown`, el
   coordinator **no reutiliza** la instancia anterior.
8. Tras el sentinel, el outer coordinator crea una **nueva** instancia de
   `TelemetryAnalysisService` con la misma configuración y el mismo
   `ProductionTrust` del freeze. La nueva instancia debe quedar `ready` bajo
   sus guards normales antes de continuar.
9. Con esa nueva instancia, el coordinator ejecuta `Discover` de nuevo,
   reaplica el mismo sort determinista y reconstruye secuencialmente los
   commitments al hacer `Open/Inspect` sobre candidatos.
10. La reconstrucción acepta recordings solo cuando el commitment recalculado
    coincide exactamente con `slot_1`, `slot_2` o `slot_3` del manifest
    congelado. Los no-matches se cierran y limpian inmediatamente.
11. Si un candidato esperado falta, cambió, no puede reabrirse o produce un
    commitment distinto, el run es inválido y termina en
    **`selection_changed`**.
12. Solo después de reconstruir exactamente `slot_1..3` desde la nueva
    instancia se calculan residuales, proxies y outcomes.
13. Si el outer coordinator aborta o cae antes de completar el análisis, ese
    run es inválido. El reinicio debe partir del manifest congelado y repetir
    esta reconstrucción exacta sobre una nueva instancia.
14. En cualquier abort, se ejecuta cleanup completo.

El manifest versionable registra **solo**:

- referencia exacta a TA-04F `c8e064d`;
- versión del algoritmo de selección;
- conteos agregados;
- digest SHA-256 con domain separation del `group key` público normalizado
  seleccionado;
- `commit_key` pública de 32 bytes para recomputar commitments de esta corrida;
- los tres commitments pseudónimos por slot;
- número de recordings seleccionados;
- vueltas por recording seleccionado;
- cobertura de canales requeridos por recording;
- SHA-256 del ledger canónico sin identidades.

No se versionan `session.ID`, `CandidateID`, rutas, timestamps, coordenadas ni
hashes crudos u otros identificadores directos de recording.

### Prueba revisable de ceguera

La prueba de freeze es **tamper-evident dentro de una sola corrida**, no
reproducible por reejecución posterior. La auditoría depende del orden entre el
commit de freeze, la pausa del helper y su reanudación posterior.

Un reviewer debe poder demostrar que no se calcularon residuales antes del
freeze verificando estos invariantes fail-closed:

1. El helper de análisis no puede reanudarse sin un ledger previo con
   `phase = selection_frozen`.
2. En el momento del freeze debe verificarse `CloseSession`, `ServiceShutdown`,
   `staging = 0` y `readers = 0`.
3. El commit de freeze debe preceder al primer evento de `unpause` o log de
   análisis residual.
4. El `unpause` solo puede ocurrir por sentinel explícito en `stdin`.
5. El primer reopen posterior al freeze debe reconstruir exactamente los tres
   commitments versionados.
6. El primer reopen posterior al freeze debe ocurrir sobre una nueva instancia
   `ready` de `TelemetryAnalysisService`, no sobre la instancia apagada en el
   freeze.
7. Si falta un candidato esperado, cambió o no coincide su commitment exacto,
   el run termina en `selection_changed`.
8. El primer registro del análisis debe referenciar el SHA-256 exacto del
   ledger canónico sin identidades.
9. Cualquier salida de residual/proxy anterior a ese evento de `unpause` es
   inválida.
10. El ledger de selección no contiene campos de residual, jitter,
    correlación,
   p95/p99 ni outcome.
11. El digest del ledger de selección debe aparecer en la evidencia antes que
   cualquier digest de resultados analíticos.

Si cualquiera de esos invariantes falla, el outcome es `pipeline_fault`.

## Outcomes permitidos en este corte

TA-04F2 conserva la lógica causal base de TA-04F, pero reetiqueta el cierre
como caracterización histórica:

- `pipeline_fault`
- `historical_characterization_measurement_compatible`
- `historical_characterization_trajectory_compatible`
- `historical_characterization_mixed_or_indeterminate`
- `budget_exhausted`
- `selection_changed`
- `stop_insufficient` si ningún grupo no-Algarve/Portimão alcanza la cohorte
  congelada requerida

Interpretación obligatoria:

- ningún outcome valida `local_shape`;
- ningún outcome produce geolocalización absoluta;
- ningún outcome vuelve compatible la anchura física;
- ningún outcome desbloquea TA-04B.

## Reporting y privacidad

La evidencia final de TA-04F2 debe incluir:

- referencia a TA-04F `c8e064d` como protocolo matemático/control heredado;
- referencia exacta al path del plan base heredado;
- confirmación de que este corte reemplazó solo la exigencia de holdout
  post-freeze por una cohorte histórica bloqueada;
- conteos agregados de discovery, exclusión, elegibilidad y freeze;
- digest del ledger de selección y digest de resultados;
- commitments pseudónimos versionados solo para este corte local;
- outcome final en vocabulario `historical_characterization`;
- declaración explícita de posible contaminación residual si no pudo
  demostrarse la exclusión exacta de TA-04E/TA-04G, procedente de un subconjunto
  desconocido de recordings exploratorios previos.

La evidencia final no debe publicar rutas, IDs, timestamps crudos, coordenadas,
valores por muestra ni el nombre público del grupo elegido salvo necesidad
documental real.

Privacidad y publicación:

- los commitments son identificadores pseudónimos limitados, no anónimos;
- solo se autorizan en documentación de esta rama local;
- no se usan en salidas de producto ni de telemetría;
- no se hace push, PR ni publicación de este material sin revisión explícita de
  Isaac;
- tras cerrar este corte o el proyecto, el material local con commitments debe
  eliminarse según el procedimiento que autorice Isaac.

## Estado operacional de TA-04G

TA-04G no existe en este repo como evidencia versionada. La referencia
operacional disponible es el thread T3 `32f74a8c...`, tratado aquí como
evidencia no versionada y no canónica.

Por tanto:

- TA-04G no actúa como autoridad documental canónica;
- la exclusión primaria usa el `group key` público recuperado durante la
  selección, no una autoridad externa TA-04G;
- si esa recuperación no permite demostrar exclusión exacta, la evidencia final
  debe declararlo explícitamente.

## Checks documentales de este plan

Antes de ejecutar TA-04F2 debe comprobarse:

1. que TA-04F `STOP insuficiente` de `c8e064d` se conserva como evidencia y no
   se reinterpreta como fracaso del nuevo corte histórico;
2. que este plan solo cambia cohorte/selección/reporting y hereda la matemática
   y controles de `ta04f-repetition-variance-plan.md@c8e064d1c9add0cc8c807f415531bae225f9924d`;
3. que la selección permanece ciega a residuales y outcomes hasta el ledger
   `selection_frozen`;
4. que la exclusión TA-04E/TA-04G es determinista cuando se pueda demostrar y
   explícitamente incierta cuando no;
5. que el `group key` usa exactamente `TrackName + TrackLayout + CarName +
   CarClass` normalizados, con los cuatro campos públicos y válidos;
6. que la regla Algarve/Portimão excluye cualquier grupo cuyo `TrackName` o
   `TrackLayout` normalizado contenga alguno de los aliases congelados;
7. que `Discover` se reordena explícitamente por `ModifiedAt`, `Size` y
   `CandidateID`, sin confiar en el orden del servicio;
8. que antes del freeze solo se permiten `ReadPage` de los canales requeridos
   para cobertura y conteo de vueltas, nunca shape/jitter/residual/proxies;
9. que los budgets duros son `64` candidatos, `32 GiB` acumulados y `120 min`,
   con una sola sesión abierta y `CloseSession` antes del siguiente candidato;
10. que el freeze exige `CloseSession`, `ServiceShutdown`, `staging = 0` y
    `readers = 0` antes del commit;
11. que tras el freeze no se reutiliza la instancia apagada: el reopen crea una
    nueva `TelemetryAnalysisService`, vuelve a `Discover` y solo acepta matches
    exactos de `slot_1..3`;
12. que cualquier candidato esperado ausente/cambiado o commitment distinto
    termina en `selection_changed`;
13. que los commitments versionados son pseudónimos limitados y no pueden
    empujarse ni publicarse sin revisión explícita de Isaac;
14. que no existe fallback por debajo de 3 recordings;
15. que `local_shape` sigue `unknown` en todos los outcomes;
16. que TA-04B permanece en STOP visual.

## Registro de ejecución local posterior al freeze del plan base

Suplemento documental no normativo. Este apéndice **no altera** el cuerpo
congelado anterior; solo registra el cierre local observado bajo el plan base
versionado en `fe5faed2d5748736606f52165aa913849e4bd531`.

Fecha: 2026-08-12.

- discovery total: `347`;
- `ready=318`, confirmado tras trackers independientes y `2` observaciones;
- candidatos intentados en orden canónico: `64`;
- candidatos inspeccionados: `62`;
- bytes acumulados contra budget de staging: `1_169_408_000`;
- tiempo de pared observado: `51 s`;
- recordings elegibles congelables: `0`;
- fallos pre-inspect: `2`;
- errores espaciales en inspect: `62`, desglosados en
  `TimeNotAligned=42`, `InvalidInput=15`, `TimeCoverage=3`,
  `InvalidValue=1`, `ProgressOrder=1`;
- nota de guard registrada en el run: `events=resets+1 only12, less50`;
- calidad de samples usada por los guards observados: todos `valid` y finitos;
- no apareció bug de igualdad de `rowcount`;
- outcome aceptado del corte: `budget_exhausted`;
- no hubo cálculo residual ni outcome causal final;
- cleanup final: `0` residuos (`readers=0`, `staging=0`).

Consecuencia canónica de este cierre local:

- TA-04F2 no produjo cohorte congelada ni selection manifest;
- `local_shape` permanece `unknown`;
- no cambia datum, geolocalización absoluta ni anchura física;
- TA-04B sigue en STOP visual.

La evidencia sanitaria detallada de este cierre vive en
`ta04f2-existing-cohort-evidence.md`.
