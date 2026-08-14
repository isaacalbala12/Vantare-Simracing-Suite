# TA-04F — protocolo pre-registrado de variación local y holdout virgen

Estado: protocolo documental congelado en
`c8e064d1c9add0cc8c807f415531bae225f9924d`
(`2026-08-12T19:48:35Z`) y cierre documental local del 2026-08-12 en
**`STOP insuficiente`**. El discovery productivo metadata-only recorrió 347
artifacts visibles (`active=29`, `stabilizing=318`), todos pre-freeze; el
conteo post-freeze estricto fue `0`, por lo que no hubo holdout, `Open/Inspect`
ni lectura de contenido. Este corte no cambia código, no toca UI, no
reetiqueta TA-04E y mantiene TA-04B bloqueada.

El **freeze marker** de TA-04F es el primer commit que versiona este archivo
junto con su timestamp UTC. Todo artifact visible en discovery antes de ese
commit queda automáticamente clasificado como `training/exploratory` y no puede
entrar al holdout. El holdout genuino exige recordings nuevos creados después
del freeze marker y confirmación manual de que son capturas nuevas y no copias.

## Objetivo

Caracterizar si el fallo del umbral rígido observado en TA-04E es compatible
con:

1. un fallo de pipeline;
2. limitación de medida;
3. limitación de trayectoria entre recordings; o
4. un resultado mixto o indeterminado.

TA-04F **no** valida `local_shape`, **no** declara un mapa local `GO` y **no**
elige un threshold nuevo para “hacer pasar” 5 m. `local_shape` permanece
`unknown` en todos los outcomes de TA-04F. Cualquier validación futura exige un
protocolo separado con umbral oficial o independiente.

## Terminología y fuentes externas congeladas

- NIST TN 1297:
  repeatability = acuerdo entre mediciones sucesivas del mismo mensurando bajo
  las mismas condiciones; reproducibility = acuerdo bajo condiciones cambiadas.
  TA-04F adopta ese vocabulario:
  https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-appendix-d1-terminology
- NIST Handbook:
  short-term variability y long-term variability se tratan como fuentes
  distintas; TA-04F usa esa separación para distinguir dentro de recording y
  entre recordings:
  https://itl.nist.gov/div898/handbook/mpc/section1/mpc114.htm
- GPS.gov:
  el ejemplo de 4,9 m bajo cielo abierto describe smartphones de consumo y no
  caracteriza el receptor real de LMU, no demuestra datum y no autoriza
  transferir 4,9 m a estos canales:
  https://www.gps.gov/index.php/gps-accuracy-0

## Exclusiones duras antes del holdout

- TA-04E completo queda `training/exploratory` para siempre.
- Todo artifact visible en discovery antes del freeze marker queda
  `training/exploratory` y nunca holdout, aunque no se haya abierto.
- TA-04F no reetiqueta, no reabre ni recicla TA-04E como holdout.
- La virginidad se invalida por cualquier apertura o inspección humana, ad hoc
  o fuera del helper protocolizado TA-04F en cualquier momento desde la
  aparición del recording nuevo hasta que el helper TA-04F lo acepte o descarte
  y se congele el holdout final.
- El `Open/Inspect` secuencial ejecutado por el helper TA-04F no invalida por
  sí solo la virginidad de un candidato.
- El holdout solo puede usar recordings con `ModifiedAt` estrictamente posterior
  al freeze marker y con confirmación manual de que son capturas nuevas y no
  copias, renombres o duplicados de artifacts previos.

## Unidad de análisis

- La unidad física de entrada es el **recording**.
- TA-04F no llama “sesión” a un recording salvo prueba futura independiente.
- La unidad inferencial primaria es el recording.
- Las vueltas son replicados anidados dentro del recording.
- Los bins de progreso y las muestras no son observaciones independientes para
  decidir outcomes finales.

## Mínimo muestral y STOP

El holdout solo puede empezar si existe al final del recorrido un grupo con:

- al menos 3 recordings nuevos y compatibles;
- al menos 10 vueltas completas por recording;
- cobertura exacta de `GPS Latitude`, `GPS Longitude`, `GPS Time`, `Lap Dist` y
  `Total Dist`;
- guards productivos TA-02/TA-03E/TA-03F en `PASS`.

`Speed` es opcional y no bloquea elegibilidad porque esta auditoría documental
no confirmó su presencia sin abrir contenido.

Si ningún grupo alcanza esos mínimos al agotarse el recorrido completo, el
resultado es **STOP insuficiente** y la siguiente acción es pedir nuevas
grabaciones y una prueba manual de novedad.

## Señales permitidas y señales solo exploratorias

Señales requeridas para el protocolo confirmatorio:

- `GPS Latitude`
- `GPS Longitude`
- `GPS Time`
- `Lap Dist`
- `Total Dist`

Señales opcionales confirmatorias:

- `Speed`

Señales exploratorias no confirmatorias:

- `Path Lateral`
- `Track Edge`

`Path Lateral` y `Track Edge` pueden describirse solo como covariables
exploratorias laterales. TA-04F no usa ninguna fórmula de borde, anchura o
equivalencia física basada en ellas.

## Custodia, privacidad y pila obligatoria

TA-04F usa exclusivamente la pila productiva ya aprobada para discovery,
autorización, staging privado, runtime confiado, reader read-only y cleanup.

Reglas obligatorias:

- PRE y POST del original deben coincidir.
- No se abre WAL ni se fuerza checkpoint.
- Todo staging temporal termina en `Close -> Cleanup -> verificación de borrado`.
- No se persisten rutas, IDs, timestamps, coordenadas, valores por muestra,
  nombres ni metadata sensible.
- Los identificadores opacos de discovery y `session.ID` solo existen en memoria
  durante la ejecución.
- Para TA-04F, `session.ID` es la única clave de dedupe en memoria y se trata
  como equivalente operativa del `DedupeKey` canónico ya derivado por el
  pipeline.
- La salida versionable de TA-04F contiene solo agregados, conteos y resultados
  de control de custodia.

## Selección holdout determinista

### Orden canónico de discovery pre-open

Antes de abrir contenido, el discovery confirmado después del freeze marker se
ordena solo por campos reales públicos disponibles sin `Open/Inspect`:

1. `ModifiedAt` ascendente;
2. `Size` ascendente;
3. `CandidateID` opaco ascendente, usado solo en memoria para desempatar.

No se usan nombres inferidos de pista, layout o coche antes de `Open/Inspect`.

### Regla de novedad

Un candidato pre-open es elegible solo si:

- `ModifiedAt` es estrictamente posterior al freeze marker;
- pasa los gates de discovery autorizados;
- existe confirmación manual de que es una captura nueva y no una copia.

Si falta esa confirmación manual, el candidato se trata como training y no
holdout.

### Compatibilidad y selección secuencial

La compatibilidad pista/layout/coche se determina únicamente después de
`Open/Inspect`, usando solo metadata pública allowlisted ya autorizada por el
expediente.

Algoritmo congelado:

1. Recorrer secuencialmente todo el orden pre-open.
2. Abrir e inspeccionar un candidato solo si supera la regla de novedad.
3. Tras `Inspect`, derivar su `group key` únicamente con metadata pública
   allowlisted de pista, layout y vehículo.
4. Mantener en memoria un acumulador por `group key` y registrar el orden de
   primera aparición de cada grupo.
5. Dedupe post-open entre aceptados usando solo `session.ID`, solo en memoria.
6. Aceptar un recording en un grupo solo si:
   - no fue abierto o inspeccionado por una vía humana, ad hoc o fuera del
     helper desde su aparición como recording nuevo hasta su aceptación o
     descarte dentro del protocolo;
   - no duplica por `session.ID` a uno ya aceptado;
   - tiene al menos 10 vueltas completas;
   - tiene cobertura exacta de las 5 señales requeridas;
   - pasa los guards productivos.
7. Agotar todo el recorrido sin calcular residuales ni proxies.
8. Al terminar el recorrido completo, elegir el **primer** `group key` por
   orden de primera aparición que haya acumulado `>= 3` recordings aceptados.
9. Congelar exactamente los primeros 3 aceptados de ese grupo, preservando el
   orden de aceptación, como holdout final.
10. Si ningún `group key` alcanza 3 aceptados al final del recorrido, resultado
    = `STOP insuficiente`.
11. Recién después de congelar esos 3 aceptados se autorizan los cálculos de
    residuales y proxies.

No se calcula ningún residual, proxy o métrica comparativa antes de congelar
los 3 aceptados. No se reemplaza un recording por un resultado más favorable y
no se reprioriza un grupo por resultados observados.

## Definiciones matemáticas congeladas

### Constantes

- `R = 6_371_000 m`
- `N_GRID = 1000`
- `epsilon_geom = 1e-6 m`
- `epsilon_const = 1e-12`
- `bootstrap_resamples = 10_000`
- `bootstrap_seed = 20260812_04_01`

### Normalización base

- Progreso normalizado:
  `u = LapDist / lap_length`, con `u` en `[0,1)`.
- Malla fija de progreso:
  `1000` bins uniformes en `[0,1)`, con centros
  `u_i = (i + 0.5) / 1000`, `i = 0..999`.
- Interpolación:
  lineal por canal sobre `u`, con continuidad cíclica entre final e inicio de
  vuelta.

### Proyección local

Para cada comparación se fija una única ancla derivada **solo** de la plantilla
de referencia:

- comparación intra-recording:
  ancla de la plantilla leave-one-lap-out (LOLO);
- comparación inter-recording:
  ancla de la plantilla leave-one-recording-out (LORO).

En ambos casos:

- `lat0 = mean(latitude_reference_template)`
- `lon0 = mean(longitude_reference_template)`

La proyección equirectangular diferencial usa:

- `x = R * cos(lat0) * (lon - lon0)`
- `y = R * (lat - lat0)`

con `lat` y `lon` en radianes.

La plantilla de referencia y el target se proyectan siempre con ese mismo frame
antes de aplicar Kabsch. Esta proyección es solo un marco local diferencial
para medir offsets pequeños. No afirma datum, CRS físico ni geolocalización
absoluta.

### Template y alineación rígida

- Template por recording:
  mediana coordenada a coordenada (`x`, `y`) sobre las vueltas del recording en
  cada uno de los 1000 bins.
- Template leave-one-recording-out (LORO):
  mediana coordenada a coordenada de los templates de los otros recordings
  aceptados.
- Alineación rígida 2D:
  Kabsch/Procrustes con solo rotación + traslación, sin escala y sin
  reflexión.

### Tangente y componentes

- Tangente unitaria del template en el bin `i`:
  diferencia central cíclica
  `t_i = normalize(p_{i+1} - p_{i-1})`.
- Normal lateral unitaria:
  `n_i = (-t_{i,y}, t_{i,x})`.
- Offset alineado:
  `d_i = q_i - p_i`.
- Componente tangencial:
  `tau_i = dot(d_i, t_i)`.
- Componente lateral:
  `nu_i = dot(d_i, n_i)`.
- Magnitud residual por muestra de malla:
  `r_i = sqrt(tau_i^2 + nu_i^2)`.

### Suavizadores, derivadas y proxies

- Derivada temporal escalar:
  diferencia finita central en muestras internas y diferencia hacia delante o
  atrás en extremos.
- Suavizador de trayectoria para residual de alta frecuencia:
  media móvil centrada de 5 bins sobre `x(u)` e `y(u)` ya interpolados en la
  malla de 1000 bins.
- Proxy `pace_jitter` por vuelta:
  MAD de `d(LapDist) / d(GPSTime)` en la vuelta, expresada en m/s.
- Proxy `speed_jitter` por vuelta:
  si `Speed` está presente, MAD de
  `Speed - d(TotalDist) / d(GPSTime)`; si `Speed` falta, el proxy no existe
  para esa vuelta ni ese recording.
- Proxy `gps_high_freq_residual` por vuelta:
  RMS del residuo 2D entre la trayectoria alineada en la malla fija y su
  versión suavizada con ventana de 5 bins.

## Descomposición confirmatoria congelada

TA-04F separa cuatro capas.

### 1. Repeatability dentro de recording

Definición TA-04F:

- mismo recording;
- mismas señales requeridas;
- misma malla fija;
- misma plantilla leave-one-lap-out del propio recording;
- misma alineación rígida 2D;
- mismas proyecciones tangencial y lateral.

Para cada vuelta se calculan:

- `RMS_tangential_lap = sqrt(mean(tau_i^2))`
- `RMS_lateral_lap = sqrt(mean(nu_i^2))`
- `RMS_magnitude_lap = sqrt(mean(r_i^2))`
- `p95_abs_tangential_lap = p95(|tau_i|)`
- `p95_abs_lateral_lap = p95(|nu_i|)`

Resumen dentro de recording:

- `W_tangential` = mediana de `RMS_tangential_lap` sobre vueltas completas.
- `W_lateral` = mediana de `RMS_lateral_lap` sobre vueltas completas.
- `W_magnitude` = mediana de `RMS_magnitude_lap` sobre vueltas completas.
- benchmark descriptivo heredado de TA-04E:
  proporción de vueltas con p95 `<= 5 m` y p99 `<= 10 m`.

La tasa `5/10 m` se reporta solo como benchmark heredado. No es gate de `GO`.

### 2. Reproducibility entre recordings

Definición TA-04F:

- recording completo comparado con un template LORO construido sin ese
  recording;
- condiciones cambiadas = recording distinto, vueltas distintas y posible
  variación de conducción o medida dentro del mismo grupo compatible.

Resumen entre recordings:

- `B_tangential` = RMS tangencial del template del recording frente al template
  LORO.
- `B_lateral` = RMS lateral del template del recording frente al template LORO.
- contraste escalar por recording:
  `D_tangential = B_tangential - W_tangential`
  `D_lateral = B_lateral - W_lateral`

### 3. Trayectoria

La trayectoria se evalúa solo en el marco local del template LORO usando la
proyección equirectangular diferencial, la malla fija, la alineación rígida 2D
y las proyecciones tangencial/lateral definidas arriba.

### 4. Medida / GPS

TA-04F no afirma qué receptor físico generó la señal ni qué datum usa. Solo
caracteriza firmas compatibles con limitación de medida usando:

- `pace_jitter`
- `speed_jitter` cuando `Speed` exista
- `gps_high_freq_residual`

## Controles obligatorios antes del holdout

### Controles sintéticos exactos dentro de tolerancia

Se ejecutan antes de abrir el primer recording candidato del holdout.

Controles:

- control negativo:
  3 recordings sintéticos idénticos y sin ruido deben producir componentes
  tangencial y lateral con magnitud absoluta `<= epsilon_geom` en toda la malla
  y resúmenes `W` y `B` `<= epsilon_geom`;
- control positivo tangencial:
  offset tangencial conocido, lateral nulo, recuperado con error absoluto
  `<= epsilon_geom` y sin inversión de signo;
- control positivo lateral:
  offset lateral conocido, tangencial nulo, recuperado con error absoluto
  `<= epsilon_geom` y sin inversión de signo;
- control positivo de jitter:
  ruido de alta frecuencia y jitter conocidos sin cambio de trayectoria media,
  de modo que aumenten los proxies de medida sin crear un desplazamiento medio
  estable de template por encima de `epsilon_geom`.

Si falla cualquier control, outcome = `pipeline_fault`.

### Validez de muestras requeridas

Para cada una de las 5 señales requeridas, todo sample usado por TA-04F debe
cumplir simultáneamente:

- `Present = true`
- `Quality = valid`
- valor `float64` finito

Cualquier sample `missing`, `stale`, `invalid`, `unknown`, no finito o no
presente en cualquiera de las señales requeridas invalida ese recording para
TA-04F.

`Speed` es opcional. Si `Speed` no cumple esas mismas reglas de validez, el
recording sigue siendo elegible y simplemente se omite por completo el proxy
`speed_jitter`.

### Relectura determinista antes de cálculos

La igualdad exacta se exige solo sobre entradas normalizadas y serializadas
canónicamente antes de cualquier cálculo de residual o bootstrap.

Serialización canónica:

- canales en este orden fijo:
  `GPS Latitude`, `GPS Longitude`, `GPS Time`, `Lap Dist`, `Total Dist`,
  `Speed` si existe;
- páginas en orden ascendente de `start`;
- muestras en orden ascendente de índice;
- mapping exacto de `Quality`:
  `valid=1`, `stale=2`, `missing=3`, `invalid=4`, `unknown=5`;
- cada canal requerido debe tener exactamente una columna numérica;
- cada muestra serializada como:
  `channel name ASCII`, `sample index uint32 little-endian`, `quality byte`,
  `Samples[].Values[0]` normalizado a `float64 IEEE754 little-endian` tras
  validar `quality`, `Present` y finitud.

La serialización canónica no usa sentinels para estados inválidos porque esos
casos se rechazan antes de entrar al conjunto usado por TA-04F.

Controles:

- lectura A y lectura B del mismo staging deben producir bytes idénticos de esa
  serialización canónica;
- cerrar y reabrir el mismo artifact sin cambios debe producir la misma
  serialización canónica;
- el helper de selección debe reproducir exactamente el mismo conteo de
  candidatos nuevos, inspeccionados y aceptados.

No se exige igualdad bit a bit de bootstrap ni de artefactos derivados
aleatorios.

## Estadísticos congelados

Por cada recording aceptado se calculan, siempre separados por componente
tangencial y lateral:

- `W_tangential`, `W_lateral`
- `W_magnitude`
- `B_tangential`, `B_lateral`
- `D_tangential`, `D_lateral`
- mediana, p95 y p99 por vuelta de `|tau_i|` y `|nu_i|`
- asociación entre magnitud residual y proxies de medida disponibles

Asociación por proxy:

- resumen por vuelta:
  `RMS_magnitude_lap`;
- estadístico:
  Spearman `rho` entre `RMS_magnitude_lap` y el proxy de vuelta;
- requisito mínimo:
  `>= 10` pares finitos por recording para ese proxy;
- ambos vectores deben ser no constantes, definido como
  `max(vector) - min(vector) > epsilon_const`;
- si no se cumple, la asociación para ese proxy es `undefined/no evidence`.

Bootstrap:

- `10_000` resamples;
- seed constante y versionada:
  `20260812_04_01`;
- intervalo percentile 95 %, no BCa;
- unidad de remuestreo:
  vueltas completas dentro de cada recording;
- para asociaciones, cada resample reusa la pareja
  `(métrica de vuelta, proxy de vuelta)` como unidad.

Para cada recording:

- se remuestran vueltas con reemplazo;
- se reconstruye el template del recording;
- se recalculan `W`, `B` y `D`;
- se construyen IC percentile 95 % para `D_tangential` y `D_lateral`;
- para cada proxy disponible, se recalcula Spearman `rho` y su IC percentile
  95 %.

## Anti-pseudorreplicación

- La inferencia confirmatoria final usa mayoría de recordings, no mayoría de
  vueltas ni de bins.
- Los bins de progreso sirven para construir resúmenes por vuelta o recording,
  nunca para votar outcomes.
- La lógica primaria usa signos y coberturas de los intervalos percentile 95 %
  por recording, no un conteo bruto de tests por bin.

## Lógica de decisión congelada

### 1. `pipeline_fault`

Outcome `pipeline_fault` si ocurre cualquiera de estos casos:

- falla cualquier control sintético dentro de su tolerancia;
- falla cualquier reread determinista de la serialización canónica;
- el helper no reproduce la misma selección secuencial;
- PRE/POST o cleanup fallan.

Si `pipeline_fault` ocurre, el protocolo termina y no se interpretan causas de
medida o trayectoria.

### 2. Etiqueta por recording

Cada recording congelado recibe exactamente una etiqueta:

- `measurement` si ambos contrastes cumplen
  `upper(IC95(D_tangential)) <= 0` y `upper(IC95(D_lateral)) <= 0`; y además
  al menos un proxy disponible cumple `lower(IC95(rho_proxy)) > 0`.
- `trajectory` si cualquier contraste cumple
  `lower(IC95(D_tangential)) > 0` o `lower(IC95(D_lateral)) > 0`; y ningún
  proxy disponible cumple `lower(IC95(rho_proxy)) > 0`.
- `mixed` si coexisten evidencia de medida y de trayectoria en el mismo
  recording.
- `indeterminate` en cualquier otro caso, incluido ausencia de proxies
  disponibles o asociaciones `undefined/no evidence`.

La falta de `Speed` no penaliza la elegibilidad ni la etiqueta; solo reduce el
número de proxies disponibles.

### 3. `measurement_limited`

Outcome final `measurement_limited` si, con pipeline en `PASS`:

- al menos 2 de 3 recordings quedan etiquetados `measurement`; y
- ninguno de los recordings restantes tiene evidencia opuesta, definida como
  etiqueta `trajectory`.

Interpretación permitida:
el patrón es compatible con limitación de medida. No prueba el receptor físico
ni autoriza validar `local_shape`.

### 4. `trajectory_limited`

Outcome final `trajectory_limited` si, con pipeline en `PASS`:

- al menos 2 de 3 recordings quedan etiquetados `trajectory`; y
- ninguno de los recordings restantes tiene evidencia opuesta, definida como
  etiqueta `measurement`.

Interpretación permitida:
el patrón es compatible con cambio estable de trayectoria entre recordings. No
equivale a un `GO` de forma local.

### 5. `mixed/indeterminate`

Outcome `mixed/indeterminate` en cualquier otro caso, incluido:

- cualquier recording etiquetado `mixed`;
- mezcla de etiquetas `measurement` y `trajectory` entre recordings;
- grabaciones `indeterminate` suficientes para impedir mayoría conservadora;
- intervalos demasiado anchos;
- proxies ausentes o `undefined/no evidence`.

## Qué se reporta y qué no

Se reporta:

- freeze marker usado;
- conteo de artifacts visibles antes del freeze marker y su clasificación como
  training;
- conteo discovery post-freeze, inspeccionados y aceptados;
- confirmación de que el holdout usa solo recordings nuevos posteriores al
  freeze marker;
- número de vueltas completas por recording aceptado;
- métricas por recording y outcome final;
- benchmark descriptivo heredado p95/p99 frente a `5/10 m`;
- PASS/FAIL de controles, rereads y cleanup.

No se reporta:

- rutas;
- identificadores;
- timestamps crudos;
- coordenadas;
- valores por muestra;
- `session.ID` o `CandidateID`;
- nombres de pista/vehículo fuera de la metadata pública allowlisted ya
  permitida por el expediente.

## Consecuencia canónica congelada

Sea cual sea el outcome entre:

- `pipeline_fault`
- `measurement_limited`
- `trajectory_limited`
- `mixed/indeterminate`

las conclusiones canónicas quedan así:

- `local_shape` sigue `unknown`;
- geolocalización absoluta sigue `unknown`;
- anchura física sigue `incompatible`;
- `Path Lateral` y `Track Edge` siguen sin fórmula confirmatoria;
- TA-04B sigue bloqueada;
- ningún resultado de TA-04F autoriza UI, mapa, captura ni Claude.

## Verificación documental de este corte

Antes de considerar cerrado este protocolo, comprobar:

1. que todo artifact visible antes del freeze marker queda
   `training/exploratory` y nunca holdout;
2. que el holdout exige `ModifiedAt` estrictamente posterior al freeze marker y
   confirmación manual de captura nueva;
3. que la virginidad solo la invalidan aperturas humanas, ad hoc o fuera del
   helper TA-04F en cualquier momento antes de la aceptación o descarte del
   recording y la congelación del holdout;
4. que el mínimo es `>= 3` recordings nuevos y `>= 10` vueltas completas por
   recording;
5. que las señales requeridas son exactamente
   `GPS Latitude`, `GPS Longitude`, `GPS Time`, `Lap Dist` y `Total Dist`;
6. que `Speed` es opcional y `Path Lateral`/`Track Edge` quedan solo
   exploratorios;
7. que la selección agota todo el orden y elige el primer `group key` por orden
   de aparición que termina con `>= 3` aceptados, congelando exactamente sus
   3 primeros aceptados;
8. que la selección no calcula residuales antes de congelar los 3 aceptados;
9. que la matemática fija `R`, malla, interpolación, template, alineación,
   ancla de referencia, tangentes, proxies, bootstrap y tolerancias;
10. que la serialización fija mapping de `Quality`, una sola columna numérica
    por canal requerido y `Samples[].Values[0]` como payload, y que cualquier
    sample no `Present=true`, no `valid` o no finito invalida el recording
    requerido;
11. que `Speed` es opcional y, si falla esa validez, solo elimina el proxy de
    velocidad;
12. que la lógica final no produce `GO` para `local_shape`;
13. que TA-04B continúa en STOP visual;
14. que la salida prevista contiene solo agregados y control de custodia.

## Registro de ejecución posterior al freeze

Fecha: 2026-08-12.

- Freeze marker confirmado:
  `c8e064d1c9add0cc8c807f415531bae225f9924d`
  (`2026-08-12T19:48:35Z`).
- Discovery productivo metadata-only: 347 artifacts visibles en total,
  `active=29`, `stabilizing=318`.
- Clasificación por freeze:
  `pre-freeze=347`, `post-freeze estricto=0`.
- No hubo `Open/Inspect`, copia temporal, hash de contenido ni lectura de
  samples; el helper cerró con `readers=0`, `staging=0` y sin dejar estado
  persistente durante el gate metadata-only; después se añadieron 4 cambios
  documentales locales sin commit.
- Resultado canónico del recorrido completo:
  **`STOP insuficiente`** por mínimo muestral incumplido (`0 < 3`).
- Consecuencia: TA-04E conserva su `NO-GO`, `local_shape` sigue `unknown`,
  geolocalización absoluta sigue `unknown`, anchura física sigue
  `incompatible`, y TA-04B continúa en STOP visual.
- Recordatorio semántico: un recording no equivale a una sesión demostrada; en
  este corte no se abrió contenido alguno.
- Próximo paso manual exacto:
  grabar 3 recordings nuevos del mismo track/layout/car, cada uno con
  `>= 10` vueltas completas; deben crearse después del freeze; no se pueden
  copiar, renombrar ni abrir con herramientas humanas o ad hoc; hay que cerrar
  LMU/grabación normalmente, dejar estabilizar y avisar al orquestador sin
  adjuntar archivos, rutas ni coordenadas.
