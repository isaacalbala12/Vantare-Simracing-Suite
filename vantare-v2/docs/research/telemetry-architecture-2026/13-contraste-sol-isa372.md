# 13 — Contraste con la especificación SDD de Sol (ISA-372)

Fecha: 2026-08-19. Autor: orquestador (Fable). Insumo: "ISA-372 — Especificación inicial SDD: Telemetría Go-first en paralelo" (GPT 5.6 Sol Pro, mismo prompt), estado SPECIFY pendiente de aprobación. Base de Sol: `origin/nightly@7a92241d`; base nuestra: HEAD `08e316c1` + diff local.

## 1. Veredicto del contraste

Dos investigaciones independientes, con modelos distintos y el mismo prompt, convergen en la **misma decisión**: arquitectura **híbrida Go-first** que conserva el Core semántico (schema.Field, reducer, derive, facts) y reemplaza la frontera operativa (commit único, productos fuera del commit, OverlayFrame compacto latest-wins, facts ordenados aparte, Engineer/Recording asíncronos y acotados, store único, widgets sin dominio, SI en el Core, sin RFC7396, sin SHA por frame, Analysis separado, Strategy solo con consumidor real, StreamEpoch/SessionID/VehicleID/StintID separados, nunca `map[string]any`, retirada del legacy solo tras paridad). La convergencia independiente es la mejor evidencia de que la dirección es correcta.

La diferencia no está en el "qué", sino en el **método y la evidencia**:

| | Sol (ISA-372) | Esta investigación (00–12) |
|---|---|---|
| Naturaleza | SPECIFY prescriptivo (principios, contratos, gates, límites) | Evidencia medida + matriz de decisión + plan de 14 fases |
| Evidencia | Cualitativa ("el payload de 44 ya tiene coste material") | Medida: 269 KB @104 coches, rechazo desde **103** (Overlay) y **85** (Engineer) por el límite de 256 KiB, `failStop` terminal; compacto 35 KB (−86,9 %); parse 1,84 → 0,21 ms; RFC7396 −0,55 % |
| Defectos concretos | Genéricos ("un fallo de producto puede detener el Core") | 20 defectos con archivo:línea (D-01 cinco cursores, D-03 slot gap → VehicleID nueva, D-06 freshness congelada, D-07 statusRevision, Engineer síncrono bajo mutex, 16 claves fantasma en `scoring`, manifiesto Engineer hardcodeado, `DriverManager[lmu.Observation]`) |
| Mecanismo de paridad | Shadow **en Go** sobre la misma `lmu.Observation` (engine nuevo junto al actual + comparador semántico + clasificación de divergencias + auto-disable) | Tests que deben fallar primero (F0), paridad de replay por digest (ya existe), shadow **por widget** en frontend con el comparador existente (F6/F8) |
| Codegen TS | Posponer | F5: generar tipos wire Go→TS con gate CI (evidencia: 28 campos espejo manual, 5 nombres para una señal, 16 claves fantasma) |
| Código muerto | No lo trata (excluye "eliminar runtime actual") | F4: borrar Fanout/RFC7396/seal/Analysis live + guard "símbolo exportado solo en tests" |
| Capabilities | Bools + `Availability` por capability (Quality) | `Supported/Available/Modes` (`spatial.mode`, `delta.availableReferences`, spatial longitudinal vs lateral) |
| Operación | Gate de estabilidad: 2 nightlies + 3 sesiones reales + reconnect + ventana tardía | Criterios por fase; no teníamos gate operativo explícito |

## 2. Lo que Sol aporta y conviene adoptar

1. **Shadow puro en Go** para la transacción del engine (F3): alimentar el engine nuevo con la misma `lmu.Observation` ya adquirida (una sola lectura), comparador semántico con tolerancias y clasificación de divergencias (bug nuevo / bug actual demostrado / contrato intencional / reloj / no comparable). Adoptar **muestreado y con auto-disable**, como complemento — no sustituto — de la paridad de replay por digest offline, que es determinista y gratis.
2. **Gate de estabilidad operativo** (dos Nightly internas, Practice/Qualy/Race reales, un reconnect, una ventana a mitad de sesión, revisión humana de métricas) antes de F9.
3. **`OverlayUpdate` = status + frame en el mismo sobre** (nosotros lo decíamos como "status dentro del full"; el nombre y la forma de Sol son más claros).
4. **Fixture de 44 coches** (grid real LMU) además de 1/20/104 en benchmarks y gates.
5. **Gate SDD** (SPECIFY → PLAN → TASKS → IMPLEMENT con aprobación humana) y sucesión explícita de ADR 0004 antes de implementar.
6. Lista Always/Ask/Never para agentes — útil para el AGENTS.md del proyecto de migración.

## 3. Lo que la evidencia de esta investigación corrige o completa en ISA-372

1. **Presupuestos**: Sol propone Overlay V2 ≤96 KiB objetivo / 128 KiB hard gate y p95 ≤8 ms. Medido: compacto **35 KB @104**, proyección+marshal 0,31 ms media / 0,44 ms p99. Proponer objetivo ≤48 KiB, hard gate ≤64 KiB, p95 ≤2 ms / p99 ≤4 ms para Core+derive+builders (a validar en WebView2/OBS).
2. **"Payload excesivo → sin fail-stop global"** no es un escenario hipotético: hoy ocurre desde 103 coches. Debe ser la **primera** corrección (nuestra F1), antes del shadow.
3. **D-01** (reducer commitea antes que el mapper; cursores divergen → `ErrStaleBatch` en bucle → terminal) no aparece en ISA-372 y es el motivo técnico del "commit atómico" que Sol exige. Añadir test de fault-injection post-reducer a su Nivel 3.
4. **D-03 / D-04**: la ventana de gracia de slot y la evicción del tope de 104 identidades deben entrar en "identity/lifecycle" del engine; Sol solo dice "slot desaparece un frame → no destruir identidad".
5. **D-06 / D-07**: watchdog de edad y retirada de `statusRevision` contiguo faltan en el transporte de Sol (su `DeliveryRevision` debe ser "acepta cualquiera mayor").
6. **Engineer síncrono bajo mutex compartido con la UI** (`runtime:673`): Sol lo cubre con "cola acotada", pero falta timeout + `recover()` + métrica de latencia; no hay ningún `recover()` hoy.
7. **Strategy**: Sol dice "el flujo productivo ya publica Overlay y Strategy". Publica, sí, pero **a nadie**: `NewStrategyLiveRuntime` no se construye y no hay suscriptor. Su "compatibilidad con el producto real" debe leerse como "conservar contrato, retirar transporte público hasta que exista consumidor".
8. **Contaminación LMU del frontend** (`place`, `inPits`, `HYPERCAR/LMP2/GT3` cableados, design system `standings-endurance-lmu`, `readNormalizedInput` adivinando unidades): "no ramas por simulador" no basta; hace falta que la taxonomía de clases llegue como dato del frame y que el diseño se indexe por id de clase.
9. **Capabilities**: bools + Quality no expresan "relative por lap-distance en vez de XYZ" ni "delta personal-best → session-best resuelto". Añadir `Modes` y referencias disponibles; el fallback de Spotter requiere `spatial.longitudinal` vs `lateral`.
10. **`DeltaView.Available bool`** aplana missing/stale/invalid; conservar Quality en las vistas. **`GapText string` en Go** contradice el principio "el widget formatea": Go entrega `GapSeconds`/`GapLaps`/kind, el frontend formatea e internacionaliza.
11. **Codegen**: Sol lo pospone "hasta que la duplicación Go/TS demuestre el beneficio"; la duplicación ya está demostrada (28 campos espejo, 5 nombres, 16 claves fantasma). Mantener F5 acotado a tipos wire con gate de CI, o como mínimo un test de contrato Go↔TS que falle ante deriva.
12. **Código desconectado**: ISA-372 no borra Fanout/RFC7396/seal/Analysis live. Sin el guard de wiring, los agentes seguirán extendiendo caminos muertos. Nuestra F4 es compatible con su regla "nunca borrar antes de cero consumidores" porque ya hay cero.
13. **Prerrequisito P0**: el diff local del native delta toca `derive/delta.go`, `projection/overlay/v1.go`, `delta-view-model.ts` y tres goldens que son la línea base de paridad; debe promocionarse o archivarse antes de empezar.

## 4. Propuesta de fusión

- Usar **ISA-372 como SPECIFY** (estructura, principios, contratos, gates, Always/Ask/Never) y esta carpeta (00–12) como **evidencia y PLAN de referencia**: 10 (matriz), 11 (veredicto y contratos), 12 (fases P0, F0–F13).
- Incorporar a ISA-372 los puntos §3.1–3.13 antes de aprobar SPECIFY; incorporar a 12 los puntos §2.1–2.6 (shadow Go muestreado en F3/F6, gate de estabilidad antes de F9, fixture 44).
- Orden de arranque común: **P0 (diff local) → F0 (tests que fallan) → F1 (fallo no terminal) → F3 (commit único, con shadow Go muestreado + paridad replay) → F4 → F5 → F6 (vertical slice medido en WebView2/OBS)**.
- Decisiones que necesitan a Isaac antes de PLAN: codegen sí/no (evidencia a favor, riesgo de agentes editando generado); presupuestos numéricos (proponemos los de §3.1); duración del shadow/gate de estabilidad; sucesión de ADR 0004 (ADR 0008).
