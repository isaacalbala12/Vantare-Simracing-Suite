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
