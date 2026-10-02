# Segunda ronda de optimización dirigida por hechos

Fecha: 2026-09-15. Tarea: VAN-727.

## Referencias e interpretación

- `AUDIT_BASE`: `f617467427f8d78f7432b4445d52be0c4dfe616a`.
- `ROUND_BASE`: `ae11bef79471e04aaa8f11422e0c91d834b4277b`, que ya contiene E1 y E2.
- Rama local: `perf/facts-round2-20260915`.
- Entorno: Apple M5, macOS, Go 1.25.0, Node 22.23.2, pnpm 9.1.0 y Vitest 4.1.9.

Los resultados son microbenchmarks de Go/Node en macOS. No prueban FPS, CPU o latencia de LMU/Wails en Windows. Los porcentajes no se suman: cada tabla mide una operación distinta.

## Resultado comprensible

La ronda conserva cinco cambios pequeños:

1. Studio deja de clonar dos veces seguidas el documento al editar o copiar layouts.
2. La comparación `dirty` se comparte entre hooks, shim y recuperación mientras `present` y `saved` sean exactamente los mismos objetos; la caché de layouts se rechazó para no compartir un clon mutable.
3. Los overlays dejan de repetir parseo, migración y mezcla de configuración visual en cada frame de telemetría cuando el widget no cambió.
4. El coordinador deja de serializar source, failure y capabilities para compararlos; mantiene la distinción wire entre `null` y campo omitido.
5. El historial de controles lleno construye la siguiente ventana con una sola asignación propia. La vía parcial conserva el camino anterior porque una primera versión medía peor.

Además se corrigió un defecto: un cambio fresco de `CarNumber` ya invalida standings. No se aceptó una reescritura del dirty detection ni el uso prestado global de `Snapshot.Peek`, porque no hubo ganancia segura demostrada.

## Estado F01–F08

| ID | Hecho y consumidor confirmados | Experimento | Resultado | Decisión y commit |
|---|---|---|---|---|
| F01 | `commitStudioCommand` recorría clones consecutivos en edición y `session/copy`; lo consumen las acciones reales de Studio. | Retirar solo los clones externos y contar clones/medir commits reales. | Con 25/50/100 widgets: `0,4204→0,2114`, `0,6073→0,4030`, `1,3098→0,7856` ms/op. Copy de sesión: `2,2960→1,1228`. | **IMPLEMENTADO_Y_MEDIDO**, `1f8999cf`. |
| F02 | Dirty se recalculaba en varios consumidores y SWR serializaba seeds; selección/saved notifican sin cambiar siempre el documento. | Caché de una entrada por identidades `present+saved`; reutilizar igualdad profunda E2 en SWR. | Dos consumidores dirty: `0,0443→0,0237` ms con 50 widgets. SWR: `0,0325→0,0283`. La caché de active layout se retiró por aliasing. | **IMPLEMENTADO_Y_MEDIDO**, `1f8999cf`; recovery `a6594338`; arnés `1e40f6a4`. |
| F03 | `RuntimeWidgetFrame` vuelve a renderizar por telemetría y `WidgetVisualHost` preparaba contenido/visual cada vez. | `useMemo` por referencia inmutable del widget, con invalidación completa y recuperación de errores. | Repaint 1/5/20 widgets: `0,0657→0,0594`, `0,2742→0,2499`, `1,0489→0,9796` ms/op. | **IMPLEMENTADO_Y_MEDIDO**, `e3d075f7`. |
| F04 | El coordinador ya cacheaba firmas, pero todavía serializaba source/failure/capabilities en publicaciones reales. | Comparadores de campos/arrays/records, sin tocar cadencia ni scheduler. | Publicar y leer contexto estable: `243.326→6.759.108` ops/s (`27,8×`) en el microarnés. | **IMPLEMENTADO_Y_MEDIDO**, `e3d075f7`; equivalencia `null/undefined` reforzada en `06f86d38`. |
| F05 | Dirty detection rehace selección/sorts/mapas antes del plan y el builder los repite al reconstruir. `CarNumber` faltaba en el hash. | Matriz externa 1/44/104, estática/dinámica, con/sin jugador; se rechazaron contadores dentro de producción. | El trabajo duplicado sigue existiendo: standings asigna 3/8/8 veces y relative 8/23/23 con jugador; no apareció una compartición segura acotada. El defecto de `CarNumber` sí quedó probado/corregido. | **SIMPLIFICADO_SIN_GANANCIA_RUNTIME_DEMOSTRADA**, corrección `02ade525`, arnés `eb7f8093`. |
| F06 | `CachedProjector.Project` usa `Snapshot.Value`, que protege colecciones mediante copia; builders y salidas inyectables forman parte del contrato. | Auditoría de ownership y prueba de modificación de resultados/snapshots. | Cambiar globalmente a `Peek` expondría aliasing; una copia estrecha alternativa no mostró ganancia demostrable sin ampliar el diseño. | **DESCARTADO_CON_EVIDENCIA**, pruebas en `02ade525`/`eb7f8093`; sin cambio de API. |
| F07 | `Prepare` clonaba historial y el overflow volvía a copiar el tail. | Una asignación final al llenarse; benchmark del `Pipeline.Prepare` completo, confirmado con 10 pares base/candidato intercalados y benchstat. | Historia llena fresh: mediana `5.530→3.184 ns/op`, `33.344→16.960 B/op`, `5→4 allocs/op`. Parcial y vacía sin cambio significativo. | **IMPLEMENTADO_Y_MEDIDO**, `02ade525`, ajuste medido `bf7216a9`, arnés `eb7f8093`. |
| F08 | La contabilidad usa stringify+UTF-8 para conservar el límite reconstruido de 72 KiB. | Contar llamadas en bootstrap grande, delta pequeño y bootstrap sin secciones. | 55.970 bytes: 40 stringify/41 encode; delta: 3/4; ruta sin secciones: 0. El ahorro posible no justifica sustituir el control de seguridad. | **DESCARTADO_CON_EVIDENCIA**, arnés `e3d075f7`. |

## Métricas completas ROUND_BASE → final

Vitest informa media, RME y todas sus muestras; no se eligió el mejor ensayo. Sus validaciones DEV/test están incluidas, por lo que no son tiempo exacto de la UI distribuida.

### F01 — commits Studio (mean ms/op)

| Escenario | ROUND_BASE | Final | Cambio |
|---|---:|---:|---:|
| Posición, 1 widget | 0,0239 | 0,0253 | ruido; RME final 10,27 % |
| Posición, 25 widgets | 0,4204 | 0,2114 | -49,7 % |
| Posición, 50 widgets | 0,6073 | 0,4030 | -33,6 % |
| Posición, 100 widgets | 1,3098 | 0,7856 | -40,0 % |
| Contenido, 50 × 2 layouts | 1,2250 | 0,7959 | -35,0 % |
| Visual, 50 × 2 layouts | 1,2166 | 0,8013 | -34,1 % |
| Orden, 50 × 2 layouts | 1,6188 | 0,8128 | -49,8 % |
| Copia race→qualifying | 2,2960 | 1,1228 | -51,1 % |
| Materializar endurance | 2,2966 | 1,1214 | -51,2 % |

El contador fija los clones del candidato: layout existente 2 (documento + snapshot de historial), contenido/visual 3 incluyendo payload, y copy de sesión 3. También comprueba que entrada, sesión origen y payloads quedan independientes.

### F02 — comparaciones Studio

| Escenario | Base | Candidato | Cambio |
|---|---:|---:|---:|
| SWR 10 widgets | 0,0069 | 0,0063 ms | -8,7 % |
| SWR 50 widgets | 0,0325 | 0,0283 ms | -12,9 % |
| SWR 100 widgets | 0,0653 | 0,0565 ms | -13,5 % |
| Dirty ×2, 10 widgets | 0,0093 | 0,0047 ms | -49,5 % |
| Dirty ×2, 50 widgets | 0,0443 | 0,0237 ms | -46,5 % |
| Dirty ×2, 100 widgets | 0,0885 | 0,0440 ms | -50,3 % |

### F03/F04 — overlay frontend

| Escenario | ROUND_BASE | Final | Cambio |
|---|---:|---:|---:|
| Repaint 1 widget | 0,0657 | 0,0594 ms | -9,6 % |
| Repaint 5 widgets | 0,2742 | 0,2499 ms | -8,9 % |
| Repaint 20 widgets | 1,0489 | 0,9796 ms | -6,6 % |
| Coordinador, contexto estable | 243.326 | 6.759.108 ops/s | 27,8× throughput |

### F07 — `Pipeline.Prepare`, cinco repeticiones

| Régimen | ROUND_BASE ns/op | Final ns/op | Bytes/op | Allocs/op |
|---|---|---|---|---|
| Vacía fresh | 974,1 / 974,5 / 951,5 / 948,6 / 948,2 | 953,8 / 948,8 / 956,4 / 955,1 / 949,6 | 704→704 | 4→4 |
| Parcial fresh | 2.249 / 2.226 / 2.203 / 2.235 / 2.224 | 2.122 / 2.064 / 2.089 / 2.078 / 2.041 | 8.768→8.768 | 4→4 |
| Llena fresh | 5.130 / 5.136 / 5.335 / 5.796 / 5.684 | 2.859 / 2.904 / 3.029 / 2.940 / 2.894 | 33.344→16.960 | 5→4 |
| Llena stale | 3.177 / 3.072 / 3.176 / 3.531 / 3.255 | 3.050 / 3.080 / 3.145 / 2.891 / 2.904 | 16.960→16.960 | 4→4 |
| Llena missing | 3.404 / 3.015 / 2.945 / 3.052 / 2.971 | 2.887 / 2.832 / 2.862 / 2.853 / 2.822 | 16.960→16.960 | 4→4 |

Una primera implementación parcial se descartó al medir una regresión aproximada del 15 %. La versión final conserva `slices.Clone+append` antes de saturación y usa la copia final única solo con el buffer lleno.

Confirmación final: 10 pares base/candidato ejecutados de forma intercalada, 200 ms por caso y análisis con benchstat. El pase agrupado inicial mostró fuerte sesgo térmico/orden y se descartó. En el pase intercalado, empty (`934,9→930,1 ns`, p=0,912), partial (`2.219→2.239 ns`, p=0,436), stale y missing no cambian significativamente. Full fresh mejora `5.530→3.184 ns` (-42,43 %, p=0,000), `32,56→16,56 KiB/op` (-49,14 %) y `5→4 allocs/op` (-20 %).

## Acumulado desde AUDIT_BASE, atribuido

| Entrega | Autoría de campaña | Métrica propia |
|---|---|---|
| E1 `c0f47c6a` | Ronda anterior, no redescubierta | BatchMapper: 27.418→19.417 ns/op; 99→65 allocs/op. |
| E2 `a5de341e` | Ronda anterior, no redescubierta | Dirty 50 widgets: 0,4312→0,1699 ms; no-op: 0,7722→0,3848 ms. |
| F01/F02 | Esta ronda | Tablas Studio anteriores, comparadas contra ROUND_BASE que ya contiene E2. |
| F03/F04 | Esta ronda | Tabla overlay anterior. |
| F07 | Esta ronda | Tabla Go anterior. |

No existe una cifra global acumulada válida: son rutas, unidades y cargas diferentes.

## Corrección, propiedad y seguridad

- La entrada de Studio no se muta; copy/materialización conservan independencia entre layouts. La caché de active layout se eliminó precisamente por no poder garantizar independencia de objetos mutables entre consumidores.
- La caché dirty tiene una sola entrada y depende de ambas identidades, `present` y `saved`; no retiene historiales ilimitados ni crea una bandera paralela.
- F03 invalida ante cambios de type/content/system/version/config/base/overrides/layout y prueba dos widgets, diagnóstico inválido→recuperación y telemetría cambiante. Reduced motion conserva el orden de hooks.
- F04 conserva source age-only, error/recuperación, epoch/session, policy, dirty ceiling y stop/dispose; `null` y `undefined` permanecen distintos.
- F07 siempre devuelve una ventana propia. Se probaron límite reducido, stale/missing, reset, cancelación y `Prepare` sin `Commit`; `go test -race` pasa en los dos paquetes modificados.
- F08 conserva límites de bytes, UTF-8, ACK/base/session y rollback existentes; no se cambió el decoder.

Pendiente real: replay de Wails/LMU en Windows, medición de CPU/FPS de la app distribuida y validación visual/effects bajo hardware objetivo. No se infieren desde macOS.

## Validación final

| Check | Estado |
|---|---|
| Frontend focal, 9 archivos | **PASS**, 94/94 tests. |
| Studio state unitario inicial | **PASS**, 15/15 tests focales. |
| Go derive + overlayv2 con race | **PASS**. |
| `go vet` derive + overlayv2 | **PASS**. |
| TypeScript `tsc -b --noEmit` | **PASS**. |
| ESLint completo | **PASS**. |
| Build frontend producción | **PASS**. |
| Suite frontend completa | **BLOQUEADA/PREEXISTENTE**: 419 archivos pasan, 32 fallan (355 tests) porque Node 22.23 no expone `localStorage` en esos workers. ROUND_BASE reproduce 24/24 fallos en `studio-store.test.tsx` por la misma causa. |
| `go test ./...` | **BLOQUEADA/PREEXISTENTE**: `cmd/vantare` referencia símbolos launcher de Windows ausentes en macOS; además hay fallos de almacenamiento en `internal/app`. Se interrumpió tras más de dos minutos una vez obtenida la causa; los paquetes modificados pasan completos y con race. |
| Windows/Wails/LMU real | **NO_EJECUTADO**. |
| Astra High | **NO_EJECUTADO**; material preparado aparte. |

Un revisor Luna independiente leyó el diff integrado y dio **PASS condicional sin bugs P0/P1**. Detectó que el recovery provider aún llamaba directamente a `isStudioHistoryDirty`; el wiring se corrigió antes del cierre para que también use el selector cacheado. No sustituyó la revisión Astra High pendiente.

## Saldo Git antes de documentación final

- Producto: 11 archivos, `+201/-46`.
- Tests y benchmarks: 15 archivos, `+1103/-2`.
- Diseño/plan: 2 archivos, `+195/-0`.
- Dependencias runtime, CI, reglas globales y worktree anti-slop: 0 cambios.
- Merge, push, PR, deploy y release: no ejecutados.

Los commits son locales y pequeños por familia; cada uno puede revertirse de forma independiente. El saldo final de documentación añade este informe, el ledger y el handoff de revisión.

## Continuación adversarial y cierre reproducido — 2026-09-15

Esta sección **sustituye el estado de validación final anterior**, que mezclaba un Node no reproducible con fallos de `localStorage`. Con el runtime fijado por el proyecto (Node 22.23.0, pnpm 9.1.0), las suites frontend completas de `ROUND_BASE`, candidato original y candidato corregido terminan en verde. No hubo corrección de producto en esta continuación: el commit `43f86f0f` solo endurece tests y arneses tras la primera revisión Astra High.

### Comparación de suites

| Superficie | ROUND_BASE `ae11bef7` | Candidato `b6462c4b` | Corregido `43f86f0f` | Veredicto |
|---|---:|---:|---:|---|
| Frontend completa, archivos | 448/448 PASS | 451/451 PASS | 451/451 PASS | Sin regresión |
| Frontend completa, tests | 3.573 PASS, 2 omitidos | 3.592 PASS, 2 omitidos | 3.593 PASS, 2 omitidos | Sin fallo candidato |
| Go comparable macOS, paquetes | 119 PASS, 2 FAIL, 16 sin tests aplicables | 119 PASS, 2 FAIL, 16 sin tests aplicables | 119 PASS, 2 FAIL, 16 sin tests aplicables | Misma firma base/candidato |
| Go comparable macOS, tests/subtests | 6.134 PASS, 6 eventos FAIL, 6 omitidos | 6.151 PASS, 6 eventos FAIL, 6 omitidos | 6.153 PASS, 6 eventos FAIL, 6 omitidos | Sin fallo candidato |
| TypeScript / ESLint / build producción | — | PASS | PASS | Cerrado |
| Race + vet, derive y overlayv2 | — | PASS | PASS | Cerrado |

El conjunto Go comparable contiene 137 paquetes y excluye únicamente `cmd/vantare` e `internal/app/launcher`: el primero no compila en macOS por símbolos Win32 y el segundo reproduce en base y candidato el timeout de `TestRunChainCancellable`. Con `TMPDIR` canónico bajo `/private/tmp`, modo 0700 y `umask 077`, los dos fallos de paquete restantes son idénticos: semántica de path absoluto Windows en `internal/server` y recuperación crash/lease Windows en `internal/telemetry/recording/sqlite`. Una ejecución previa sin exportar `TMPDIR` se descartó explícitamente.

### Cierre F01–F08

| ID | Evidencia repetida | Estado final |
|---|---|---|
| F01 | Tres pares alternados. Medianas 25/50/100 widgets: `0,2805→0,2032`, `0,5533→0,3945`, `1,0880→0,7764` ms/op; copy `1,5380→1,0649`. | **IMPLEMENTADO_Y_MEDIDO** |
| F02 | Tres repeticiones del arnés de dos consumidores. Dirty 50 widgets `0,0586→0,0291` ms; SWR 50 `0,0557→0,0288` ms. | **IMPLEMENTADO_Y_MEDIDO** |
| F03 | Tres pares alternados. Repaint 1/5/20 widgets: `0,0630→0,0537`, `0,2563→0,2351`, `1,0090→0,9299` ms/op. | **IMPLEMENTADO_Y_MEDIDO** |
| F04 | Tres pares alternados. Referencias compartidas `250.515→6.715.557` ops/s (~26,8×); objetos equivalentes decodificados por separado y sin reencuentro con la referencia retenida `204.493→604.027` ops/s (~2,95×). Test explícito `null→omitido` y `omitido→null`. | **IMPLEMENTADO_Y_MEDIDO** |
| F05 | Matriz combinada 12/12 PASS. La base no reconstruye standings ante `CarNumber`; el candidato reconstruye exactamente las seis variantes dinámicas y conserva los skips estáticos. | **CORRECCIÓN_DE_CORRECCIÓN_DEMOSTRADA** |
| F06 | Test con builder inyectado hostil demuestra que su mutación ocurre sobre una copia y no alcanza el snapshot de entrada. Se conserva `Snapshot.Value`. | **DESCARTADO_CON_EVIDENCIA** |
| F07 | Diez pares intercalados: full/fresh `5,014→2,897 µs/op` (-42,23%, p=0,000), `32,56→16,56 KiB/op` (-49,14%), `5→4` allocs. Empty, partial, stale y missing sin cambio significativo. Test directo demuestra que `Prepare` no publica y que `Commit` no muta snapshots retenidos. | **IMPLEMENTADO_Y_MEDIDO** |
| F08 | Se revalidaron límites/ACK/base/session/rollback en la suite completa; no apareció evidencia que justifique sustituir la contabilidad conservadora. | **DESCARTADO_CON_EVIDENCIA** |

### Límites y decisión

El escenario combinado es un arnés determinista de proyección con datos cambiantes, no una medición end-to-end de Wails/LMU. Windows, FPS, CPU/GPU de la aplicación distribuida y validación visual siguen **NO_EJECUTADOS** y no se infieren desde macOS.

Veredicto técnico de esta continuación: **APTO PARA REVISIÓN DE INTEGRACIÓN, sin regresiones candidatas demostradas en el entorno disponible**. La ronda no está integrada: no se ejecutaron merge, push, PR, deploy ni release.

La revisión Astra High final sobre `be070261` cerró **APPROVE, sin P0–P3 pendientes**. Antes del veredicto detectó y reprodujo el sesgo del primer arnés F04 (49/100 reencuentros de identidad); el arnés definitivo lo reduce a 0/100 y es el único origen de la cifra ~2,95× documentada.
