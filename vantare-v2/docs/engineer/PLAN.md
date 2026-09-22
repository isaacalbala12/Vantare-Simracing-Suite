# PLAN — VAN-732 · Paridad CrewChief Timings y voz LLM nativa

## Control

- Tarea principal: [VAN-732](https://app.notion.com/p/3e1e51695c6581daa4cce76fca3a54bc)
- Proyecto: [Engineer / Spotter](https://app.notion.com/p/3dae51695c65811a8485ca41bc5c9a8e)
- Puente técnico de este plan: [GitHub #1294](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1294)
- Rama documental: `vantareapp/isa-1294-crewchief-parity-plan`
- Base verificada: `origin/nightly@8a0620e8abe75914efed41de4117490f3e47a3b4`
- Oráculo CrewChief: `mr_belowski/CrewChiefV4@4c3865e09a347d4c806c0bc0cd66aae335fbc610`
- Contrato: [diseño de paridad](../specs/2026-09-19-crewchief-lmu-parity-design.md)
- Voz y estilo: [persona y estilo nativo](../specs/2026-09-20-engineer-persona-native-style-design.md)
- Decisión arquitectónica: [ADR 0010](../adr/0010-engineer-cloud-dialogue-and-offline-parity.md)
- Estado: diseño documental aceptado por Isaac; T0–T8 no iniciados. La reparación
  del runtime actual continúa por separado en VAN-736 / GitHub #1299.

Este fichero no sustituye el `PLAN.md` de la raíz de `vantare-v2`, que pertenece
a VAN-727. Tampoco convierte #1294 en una issue de implementación: su diff debe
seguir siendo documental.

## Resultado que se persigue

Cerrar primero Timings con la misma conducta observable que CrewChief en LMU:
cuándo habla, cuándo calla, qué relación usa, qué hecho comunica, con qué
precisión, prioridad, cadencia, revalidación y degradación. No se copiarán su
código, audios, gramáticas ni defectos.

La voz forma parte del camino desde el primer corte audible:

```text
LMU -> Telemetry Core -> relaciones/hechos Timings -> decisión determinista
                                                |-> compositor offline local
                                                \-> LLM cloud -> UtterancePlan
                                                      -> validador + StyleGate
decisión vigente + salida admitida -> radio/TTS/widget -> ACK de started
```

El LLM puede interpretar lenguaje libre y crear discurso abierto. No decide
hechos, cifras, prioridad, acciones ni si una salida sigue vigente. No existe
LLM local: sin red, timeout, rechazo o generación incompleta se usa una frase
local precacheada. La salida no se recorta por tokens; la brevedad procede de
la política y una respuesta incompleta se descarta entera.

## Diagnóstico de partida

La ausencia de paridad no tiene una causa única:

1. La ruta productiva por defecto genera Timings en
   `internal/families/timings.go` y lo entrega desde `internal/engineer/service`
   mediante `internal/radio`. El monitor mínimo de alpha
   `internal/engineer/timings/monitor.go` pertenece al rollback legacy. Cambiar
   sólo ese monitor no corrige el producto. Ninguno modela aún todo el estado,
   selección, silencios, revalidación y consultas de CrewChief.
2. Los tests existentes caracterizan esas implementaciones simplificadas. No comparan contra un
   esperado independiente de CrewChief, por lo que pueden estar verdes y seguir
   demostrando el comportamiento equivocado.
3. La interpretación anterior redujo Timings a «gap periódico + tendencia».
   CrewChief toma decisiones sobre relaciones distintas, historial por rival,
   puntos de muestreo, contadores independientes y contexto de sesión.
4. Telemetry V2 aporta buena parte de la parrilla y gaps, pero aún hay semántica
   por demostrar y señales de silencio ausentes o candidatas. Eso bloquea casos
   concretos; no explica por sí solo toda la brecha ni justifica otro lector LMU.
5. La ruta actual de presentación resuelve plantillas cerradas. Todavía no
   existen `FactBundle`, `UtterancePlan`, proveedor cloud, StyleGate ni el
   fallback de voz exigido por el diseño nuevo.

Por tanto, no se ampliará el monitor alpha constante a constante. El esperado
se fijará primero y cada pieza se reemplazará sólo cuando su corte tenga replay
independiente y una ruta de rollback clara.

## Forma de ejecución

Cada corte, incluidas las reparaciones del runtime actual, repite este ciclo:

1. **Plan y comprobación previa de paridad con CrewChief.** Fijar el SHA de
   referencia, los ajustes predeterminados confirmados por Isaac, las reglas
   aplicables y los casos de emisión, silencio y cancelación. Escribir el
   esperado desde esa fuente y demostrar la diferencia antes de desarrollar.
2. **Desarrollo.** Implementar el cambio mínimo en la ruta activa, con
   regresiones inicialmente rojas, controles positivos y rollback. Conservar
   los datos ausentes como ausentes y no ampliar el alcance para hacer pasar
   los casos.
3. **Confirmación posterior de paridad con CrewChief.** Volver a la misma
   fuente y configuración, comparar cada resultado observable y registrar
   las diferencias restantes. Tests de código, replay, voz acústica y LMU
   real son evidencias distintas; ningún PASS sustituye a otro gate.

El ciclo no sustituye las puertas T0a/T0b ni autoriza promociones. La reparación
inicial está trazada en [VAN-736](https://app.notion.com/p/3e3e51695c6581ed8370e2a4b5302ae6)
y GitHub #1299; esta PR conserva alcance exclusivamente documental.

- Un corte vertical equivale a una tarea hija en Notion, una referencia GitHub,
  una rama desde el `origin/nightly` vigente y una PR revisable.
- T0 se divide en dos entregas pequeñas. T1 no empieza hasta que ambas estén
  revisadas; ningún corte posterior usa como oráculo el resultado de Vantare.
- Cada caso conserva un ID `TIM-*`, esperado CrewChief, configuración, fuente,
  fixture/hash, señal requerida y resultado por gate.
- Toda conducta termina en una salida observable o en un silencio observable.
  «Hay código» y «el test unitario pasa» no son estados de paridad.
- Los paquetes compartidos se extienden sólo con una necesidad demostrada por
  Timings. No se construye un framework genérico para futuras familias.
- No se habilita por defecto ninguna ruta nueva. Feature flags, rollback y
  compatibilidad se deciden en la tarea concreta que toque runtime.
- Un bloqueo de señal afecta sólo a los casos que dependen de ella. No convierte
  `missing` en `false`, `green`, `0` ni «sin bandera».

## Cortes

### P0 — Plan y contrato público (este cambio)

**Objetivo.** Versionar este plan, enlazarlo con VAN-732/#1294, actualizar el
handoff y publicar un hito de tipo `plan` sin afirmar funcionalidad entregada.

**Rutas.** `docs/engineer/PLAN.md`, las dos specs enlazadas, el handoff vivo,
`docs/roadmap/plan.md` y su `roadmap.json` generado.

**Aceptación.** Enlaces locales válidos, roadmap generado desde
`origin/nightly`, diff exclusivamente documental y seguimiento Notion releído.

**No hace.** No modifica Go/TypeScript, no crea proveedor, no ejecuta LMU y no
marca ningún `TIM-*` como implementado o PASS.

### T0a — Extracción reproducible del oráculo

**Objetivo.** Inventariar en el SHA fijado las quince reglas de §8.1, todos los
defaults/opciones aplicables, comandos, silencios, prioridades, TTL,
revalidaciones y anomalías. La extracción usa objetos Git del commit fijado,
no el contenido mutable de un checkout local.

**Rutas previstas.** Un expediente bajo
`docs/analysis/engineer/timings/`, con índice de fuentes, blob hashes, líneas,
configuración y registro de anomalías. No se copian assets ni frases.

**Prueba.** Un validador documental comprueba que existen las quince filas,
fuentes mínimas, defaults, opciones, decisiones de anomalía y hashes. El
checkout GitLab local contiene cambios de audios ajenos; no se tocan ni se usan
como evidencia. El commit se lee con `git show <sha>:<ruta>`.

**Salida.** Cada fila queda `inventariado`, `bloqueado por señal` o pendiente
de decisión explícita. No puede quedar implícita.

**Gate.** Review humana del ledger y de las cuatro anomalías señaladas en la
spec. Sin ella no comienza T0b.

### T0b — Matriz ejecutable y taxonomía de datos

**Objetivo.** Traducir el ledger revisado a fixtures sintéticos independientes
con reloj virtual y PRNG inyectable. Clasificar cada entrada como observada,
derivada, catálogo o ausente/candidata en LMU.

**Rutas previstas.** `internal/engineer/replayoracle/testdata/timings/`, tests
de formato/completitud del oráculo y una matriz de datos bajo
`docs/analysis/engineer/timings/`. El esperado se escribe desde CrewChief; no
se genera ejecutando `timings.Monitor`.

**Prueba.** Bordes de umbral, aleatoriedad controlada, cambio de rival, epoch,
multiclass, líder/último, wrap de meta, flags/pits/final y campos missing. Los
fixtures siguen verdes por autoconsistencia aunque el runtime aún no los pase.

**Salida.** Lista exacta de señales suficientes para T1 y lista acotada de
casos bloqueados. Se decide si ObservationV1 basta o necesita una extensión
aditiva; nunca se introduce otro lector LMU ni `telemetry.Frame` nuevo.

**Gate.** T0a y T0b revisados, cero esperado derivado de Vantare y una tarea
Notion propia para T1.

### T1 — Relaciones de carrera demostrables

**Objetivo.** Producir líder de clase, delante/detrás de clase, delante/detrás
en pista, candidato automático detrás en pista y diferencias temporal/de
vueltas, con identidad, calidad, freshness, sesión y epoch.

**Rutas previstas.** Lógica acotada en `internal/engineer/timings/` y sus tests;
`internal/telemetry/projection/engineer/` sólo si T0b prueba que falta una señal
observada compartida. `projectioninput` puede adaptar contratos, no inventarlos.

**RED.** Fixtures de retiradas, multiclass, detenido, pit entry, dirección,
wrap, cambio de ID y gap igual con rival distinto fallan contra el monitor alpha.

**Aceptación.** Todos los `TIM-REL` default pasan en replay. Un gap sin identidad
o calidad suficiente produce unknown/silencio, no una relación aproximada.

**Rollback/stop.** Ruta nueva detrás de flag; parar si sólo puede resolverse
con heurística sin procedencia o un segundo reader.

### T2 — Muestreo por pista y rival

**Objetivo.** Historial independiente por relación e ID, muestreado una vez por
gap point o sector y reiniciado en rival/sesión/epoch ambiguos.

**Rutas previstas.** `internal/engineer/timings/` para sampler y perfil de
pista; catálogo propio/versionado sólo cuando sea necesario. Tests y fixtures
`TIM-SAMPLE` permanecen junto al oráculo.

**RED.** Cruce hacia delante, meta, vuelta atrás, salto de snapshots, duplicado,
primera muestra, cambio de rival y pistas de dos sectores/longitud distinta.

**Aceptación.** Mismo número y momento de muestras que el oráculo dentro de la
ventana declarada; ningún frame extra cuenta como muestra.

**Rollback/stop.** El sampler nuevo no alimenta salida audible hasta T4. Parar
si la identidad de pista/layout o las unidades no son demostrables.

### T3 — Clasificación y precisión

**Objetivo.** Clasificar `CLOSE`, `INCREASING`, `DECREASING`, estable/OTHER y
no fiable/NONE con los redondeos, ventanas y saltos observados; realizar cifras
con la precisión aplicable.

**Rutas previstas.** Clasificador puro y realizador factual Timings dentro de
`internal/engineer/timings/`; tests table-driven para `TIM-STATE` y
`TIM-PRECISION` en los cuatro locales.

**RED.** Menos de tres muestras, 0,5/0,7/0,8/10/20 s, salto >5 s, monotonía a
una decimal, midpoint par y último gap reportado.

**Aceptación.** Estado y cifra coinciden con el esperado independiente. El
texto puede variar; signo, unidad, dirección, identidad y precisión no.

**Rollback/stop.** No sustituir diferencias ambiguas por «estable». Un locale
sin number reader demostrado queda bloqueado, no traducido desde inglés.

### T4 — Cadencia, selección, silencios y radio

**Objetivo.** Elegir como máximo la relación que CrewChief elegiría, respetar
contadores/aleatoriedad/silencios/final y revalidar justo antes de `started`.

**Rutas previstas.** Policy Timings en `internal/engineer/timings/`, integración
mínima con `messagepolicy`, `radio` y `service`, más replay de lifecycle. No se
duplican scheduler, bus ni prioridad P0.

**RED.** Frecuencia cero, empate, historial ausente, candidato detrás cercano,
just-the-facts, formación, FCY/local yellow/blue, pits, vuelta de entrada,
reinicio tras verde, final y cambio de hecho mientras está en cola.

**Aceptación.** `TIM-CADENCE`, `TIM-SELECT`, `TIM-SILENCE`, `TIM-END` y
`TIM-QUEUE` pasan; cancelación antes de `started` no consume la cadencia. P0 no
se mezcla ni se interrumpe, y la demora de ACK se observa como `blocked_by_p0`.

**Rollback/stop.** El flag devuelve al camino actual. Una señal de silencio
missing bloquea el automático dependiente; no se relaja para obtener audio.

### T5 — Automáticos, FactBundle y fallback offline

**Objetivo.** Emitir gaps/tendencias, presión, retención, lapping y consejos por
landmark como hechos canónicos. Introducir el contrato mínimo `FactBundle` ->
`UtterancePlan` sin proveedor real todavía y una composición española local.

**Rutas previstas.** Timings para hechos/decisiones; un paquete compartido
pequeño para contratos generativos sólo cuando el primer uso lo exija;
presentación/audio para PhrasePack precacheado. Sin nuevas dependencias.

**RED.** `TIM-AUTO`, `TIM-LAPPING`, `TIM-LAPMODE`, `TIM-CORNERS`, cambio de
rival/cifra, asset ausente/corrupto y nombre pronunciable/no pronunciable.

**Aceptación.** El compositor offline produce todas las cláusulas obligatorias
en español y jamás una frase vacía tipo «diferencias actualizadas». Nombre
literal local cuando el oráculo lo pronuncia; posición/dorsal es degradación
segura pero FAIL de paridad.

**Rollback/stop.** Sin PhrasePack válido queda salida visual + diagnóstico, no
hecho sintetizado. No se extrae un framework hasta que otro dominio lo necesite.

### T6 — Consultas, LLM cloud y estilo nativo

**Objetivo.** Resolver las consultas Timings y probar lenguaje libre online sin
ceder autoridad. La primera cohorte usa `calm_race_engineer@1` y StylePack
español nativo; los otros locales se habilitan sólo con pack y revisión propios.

**Rutas previstas.** Extensión acotada de `commands`/QueryPort, builder de
prompt, adaptador cloud detrás de interfaz/flag, validador de
`UtterancePlan`, `StyleGate` local y corpus de evaluación. El proveedor concreto
se decide en la tarea hija; no se añade SDK sin aprobación.

**RED.** `TIM-QUERY`/`TIM-STATUS`, leading/last/missing/stale, retiro de coches,
inyección, factRefs inválidos, negación de cláusula, calco, meme, respuesta
incompleta, timeout, finish por longitud y confirmación interrumpida.

**Aceptación.** Entrada habitual <2.000 tokens, hard max 3.000 y persona/estilo
<=350; ventana mínima 8K. No hay límite editorial de salida. Esquema, facts,
acciones, privacidad, lifecycle y StyleGate pasan; cualquier rechazo usa la
misma respuesta canónica offline sin doble emisión.

**Rollback/stop.** Circuit breaker y flag eliminan la llamada cloud. Nunca se
reproduce JSON/texto/audio parcial ni se usa un LLM local como fallback o juez.

### T7 — Configuración, locales y assets

**Objetivo.** Exponer los grados configurables inventariados después del PASS
default y completar `es`, `en`, `it`, `pt-BR`, incluidos number readers,
PhrasePacks y nombres locales con procedencia/licencia.

**Rutas previstas.** Configuración Engineer, catálogos de presentación/audio,
StylePacks y UI sólo donde el contrato de producto lo exija. Cada locale tiene
fixtures y revisión nativa, no traducción de un master inglés.

**RED.** Extremos 0/1/10, quiet/informed, just-the-facts, hundredths, resumen
por vuelta, cambio de locale en job, pack incompleto y nombre desconocido.

**Aceptación.** `TIM-LAPMODE` y todos los defaults/opciones incluidos pasan o
tienen desviación aprobada. Packs se verifican por hash/version y un cambio
invalida sus gates dependientes.

**Rollback/stop.** Una opción no soportada no aparece habilitada. Un locale sin
evidencia vuelve al compositor canónico de ese mismo locale o permanece bloqueado.

### T8 — Cierre de Timings

**Objetivo.** Demostrar la cadena completa sin heredar PASS de otro SHA,
configuración, modelo, pack, locale o proveedor.

**Rutas previstas.** Ledger final, goldens, informes de replay/voz/LMU y
runbook manual. Sólo correcciones descubiertas por los gates; ninguna feature
nueva entra en este corte.

**Gates obligatorios.** Replay default/opciones; online generativo; fallback
offline; voz acústica humana; sesión LMU con presión/cambio de rival/pase/pits/
amarilla/final; cuatro locales; pérdida de red/STT/TTS; cold start; cola llena;
P0 en cada fase; cancelación/Stop; cifra obsoleta; callbacks tardíos; ausencia
de doble salida y un único terminal por JobID.

**Aceptación.** Cada caso obligatorio está `paridad cerrada` o posee desviación
explícita aprobada por producto. Un gate ausente, inconclusive o bloqueado nunca
equivale a PASS. Sólo entonces Timings permite iniciar el cierre de Spotter.

**Rollback/stop.** El rollout se revierte al último camino estable mediante el
flag definido en T4/T6. Cualquier hecho audible incorrecto, acción no autorizada,
P0 degradado o mensaje obsoleto detiene la promoción.

## Matriz de dependencias

| Corte | Depende de | Desbloquea |
|---|---|---|
| P0 | Diseño y decisiones aprobadas | Puente documental revisable |
| T0a | P0 integrado | Inventario normativo |
| T0b | Review T0a | Entrada y expected ejecutables |
| T1 | T0b | Relaciones fiables |
| T2 | T1 + pista/layout | Historial correcto |
| T3 | T2 | Estado y cifras canónicas |
| T4 | T3 + señales de silencio | Primer shadow de decisiones |
| T5 | T4 + landmarks/assets aplicables | Automáticos + offline ES |
| T6 | T5 + STT/QueryPort/TTS reales para gates | Consultas y cloud ES |
| T7 | PASS default T5/T6 | Opciones y cuatro locales |
| T8 | T1–T7 | Cierre Timings |

## Evidencia mínima por PR

Cada tarea hija debe registrar en Notion y en el handoff:

- base/HEAD, diff y archivos realmente tocados;
- IDs `TIM-*` incluidos y excluidos;
- fixture/hash/configuración/locale/modelo/packs relevantes;
- comando y resultado de tests, replay y checks de calidad;
- gate manual no ejecutado y motivo, sin convertirlo en PASS;
- riesgos, rollback y siguiente corte todavía bloqueado;
- PR/CI/canal reales, sin inferir integración ni publicación.

Los cambios Go ejecutan como mínimo `gofmt`, tests dirigidos y `go test ./...`.
Los cambios frontend ejecutan test, typecheck y build según `AGENTS.md`. Los
documentales ejecutan enlaces, formato, roadmap digest y anti-slop aplicable.

## Riesgos que permanecen abiertos

- La equivalencia de gaps/posiciones de LMU debe probarse; compartir nombre de
  campo no prueba semántica.
- Variación generativa libre mantiene riesgo residual de tono. Se reduce con
  cláusulas protegidas, corpus nativo, StyleGate, revisión humana y fallback;
  no se elimina fingiendo un catálogo de cien frases.
- Nombres y landmarks requieren activos propios/licenciados y cobertura medida.
- Latencia cloud/TTS puede vencer TTL. El fallback no renueva el hecho ni crea
  reintentos ilimitados.
- P0 tiene precedencia absoluta. La interacción de voz debe aceptar demora o
  descarte, nunca mezclar seguridad con ACK/Engineer.
- El monitor alpha seguirá existiendo hasta que un corte con rollback pueda
  sustituirlo; su presencia no se contará como progreso de paridad.

## Próxima acción autorizada

Completar la comprobación técnica e integración de P0, cuyo diseño Isaac ya
aceptó. Después, crear la tarea hija y el puente
técnico de **T0a — extracción reproducible del oráculo** desde el `nightly`
vigente. No empezar T1 ni implementar el proveedor LLM en la rama #1294.
