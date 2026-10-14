> Roadmap #1535: las referencias a plan.md/generador en este documento son históricas.
> ClickUp es la única fuente; ver [mantenimiento vigente](../../roadmap-maintenance.md).

# Handoff vivo — Telemetry Core

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/telemetry-core.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Adquisición neutral LMU/ACC, calidad/frescura, fusión y derivaciones, publicación de fotos y journal. El núcleo entrega hechos: no pinta UI ni recomienda estrategia.

## 2. Autoridad y lectura verificada

Leídos [#1562](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1562), [#1527](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1527), [#1474](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1474) y [#1498](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1498); GitHub/Project Vantare gobierna estado. Entradas: [contratos nativos](../../../native/README.md), [reglas](../../../native/AGENTS.md), [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md). Escritura de esta compactación verificada en #1561.

## 3. Estado real y canal

### #1638 / VANTA-33 — lanzamiento y optimización incorporada

14-oct-2026, worktree `C:/tmp/wt-1638`, rama
`vantareapp/isa-1638-telemetria-lanzamiento`, base `nightly@79a1ace6`.
Excepción expresa: seguimiento por orquestador/buzón, sin Plane/Notion ni
subagentes; push al finalizar, sin PR/merge. Auditoría `98482e92`; implementación
`7ae70eeb`. [Tabla de cobertura y límites](../../telemetria/cobertura-lanzamiento.md).

REST LMU añade flags locales/personales y paradas, SHM entrega el modelo que
antes se omitía; energía virtual Hypercar y media estimada por vueltas limpias.
Identidad slot+etiqueta, TTL, barrera de sesión y calidad conservados. Sin nueva
dependencia/campo DTO/version. Regresión RED→GREEN sobre captura sanitizada de
37 coches y fuentes existentes; 3839 fotos LMU47 verifican modelos/paradas.
Oráculos congelados íntegros; vista de comparación histórica solo retira esos
dos campos recién entregados, con verificación separada contra originales.

Gates locales: build/fmt/Clippy PASS; Nextest runtime/domain/ipc **630/630**, 5
skips; lifecycle runtime **13/13**; telemetría **30/30**, 1 skip físico opt-in,
ACC completo 999,416 s. Integridad/anti-slop **456/456**. Logs `C:/tmp/1638-*.log`.
Target exclusivo `C:/tmp/target-1638`, cola y jobs=2. No build/QA Hub/storage.
Smoke físico productivo: **Paused, 37 coches, jugador, 0 avances**. La primera
prueba de conducción falló; el orquestador corrigió a «sesión válida basta sin
IA/movimiento», y ese smoke pasa. No acredita conducción/18 diseños/ACC físico.

En seguimiento: el pipe selectivo de un layout con solo Banderas omitía el
jugador; nueva regresión real de pipe reproduce «—» frente a «DESCALIFICADO».
Se añade Penalties a la demanda de ese widget para obtener identidad y contador,
sin alterar contrato IPC ni pedir pedales. GREEN por pipe real; gates UI finales
**321/321**, 4 skips, Clippy/fmt y Release PASS.

El buzón incorpora fase 4 de #1630/VANTA-20. Arnés QA copiado a esta rama;
scripts/resultados `C:/tmp/1638-perf`, worktree #1630 intacto. Release y Clippy UI
PASS; 321 tests UI PASS tras la regresión de demanda. No medidas/lock aún:
hay otros workers/Hub usando el PC. Se espera exclusividad sin cerrarlos.
Baseline seis tomas; tres pares por candidato, ruido medido, diez sin mejora
consecutivos para terminar; cada mejora necesita su commit y antes/después.

DUDA ya comunicada: daños exactos/zonas/reparación, forecast actual 15 min,
ABS/TC/FFB y tipos/plazos DT/SG no tienen fuente/equivalencia acreditada. Dents
ordinales no son integridad porcentual; presets weather no son forecast live.
Entrega global **parcial** hasta resolverlos. Sin push, CI remota, merge,
promoción ni release en este hito. Siguiente: cerrar demanda de flags, medir
con el arnés aislado y mantener este estado y el buzón con resultados reales.

### Evidencia anterior de #1606 conservada

#1606 / VANTA-46 Por revisar verificado, ronda 2 por Codex CLI sin subagentes.
Rama `vantareapp/isa-1606-review-pipeline-telemetria`, base original
`nightly@69fa2d65`; fetch observa `0807fbd0`, sin incorporar otra entrega.
Los ocho P2 originales y sus commits se conservan; review Sol completa de
`cdf2e631` confirma siete suficientes y F5 parcial en la proyección de huecos.
N1 `bb377104` recupera series tras retroceso de distancia con reloj creciente;
el contador retrasado sigue protegido. N2 `93230224` descarta candidata delta
al retroceder y conserva referencia previa válida. N3 `5a399f4b` aísla los
puntos fiables de chunks con gap; v1 no localiza el corte. RED exactos en Rust
y DuckDB→plot-page→Reader→gráficos, GREEN 43/43 focales. Once P2 en ambas rondas,
sin P1 confirmado. Informe vivo: [revisión](../../analysis/review-pipeline-telemetria-2026-10.md).

Código local probado `5a399f4b`, árbol native
`567bbc347c7308a2c5892cdeac5dc0dae6791dfb`: fmt/check/Clippy PASS,
Nextest 1660/1660 PASS (7 skips heredados), lifecycle 18/18 PASS;
telemetría 25/25 PASS, 0 skips (ACC completo 901,336 s). Integridad/retirement 456/456 PASS.
Logs `C:/tmp/1606-evidence/r2-*`, por cola, jobs=2 y target propio.
[PR draft #1616](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1616)
a nightly actualizado y push de los tres fixes releído. Project Vantare In Review.
HEAD final/CI tras el hito documental se verifican en #1606 y el buzón;
CI remota completa y QA física pendientes.
Sin mediciones, datos reales, merge, promoción ni release.

Base incorporada: `origin/nightly@acff350d740d33ae8901291b63d69da004912fbc`, con #1562/PR #1576 integrada. Resolución de merge de #1564/PR #1577 en `vantareapp/isa-1564-widgets-por-sesion-impl`, validación local completada: fmt/Clippy, Nextest 1613/1613 (7 skips), lifecycle 18/18 y telemetría 25/25 PASS. #1562 introduce situación neutral y DTO live v10; #1573 conserva admisión de acceso frente al cierre por juego. Sin promoción ni release. Evidencia anterior #1562: Nextest 1590/1590, lifecycle 18/18 y telemetría 25/25; el resultado post-merge se acredita con logs merge-*.log en C:/tmp/ola2/evidence-1564, separado del resultado anterior.

## 4. Decisiones cerradas

- `Adapter::poll` no bloquea y recibe reloj; Origin conserva tiempo de origen/recepción. Capacidades y calidad explícitas, sin fallbacks sintéticos.
- Live negocia solo DTO v10 en esta base; versiones guardadas anteriores pasan por lectores explícitos, nunca por el lector live.
- Fotos latest-wins no sustituyen journal/cursor/ACK de eventos. Época nueva invalida estado previo.
- Demand no autoriza inventar datos ni poner reglas del simulador en widgets; adapters privados y ViewModels puros.
- Catálogo de señales único descartado en #1561: no habría ahorrado ficheros en los cambios observados. Reconsiderar ante un adapter/señal nuevos con coste medido.

## 5. Arquitectura y ownership

[Adapter](../../../native/domain/src/adapter.rs), [merge](../../../native/runtime/src/core/merge.rs), [DTO](../../../native/ipc/src/dto.rs) y [codec](../../../native/ipc/src/codec.rs). Runtime posee adquisición/adapters y supervisión; domain es puro; IPC posee wire. No hay dependencia transitiva domain/UI→runtime ni lectores del juego en Engineer/widgets.

## 6. Evidencia y límites

Evidencia registrada en la base, no reejecutada por esta entrega documental: integración #1531, fmt/check/Clippy `-D warnings`, Nextest 1574/1574 (7 skips heredados), lifecycle 18/18 y telemetría 25/25. No convierte fixtures/replays en prueba física LMU/ACC, OBS, DPI, audio ni latencia de entrada. #1474 conserva informe `C:/tmp/fase2/informe-1473-integracion.md` y goldens ACC/LMU; su issue sigue abierta pendiente aceptación. Huellas de retirada y fixtures conservan procedencia; no alterar oráculos para pasar gates. #1562 reporta retirement 456/456 e inversión exacta de pins; la validación del merge #1564 queda separada: Nextest 1613/1613, lifecycle 18/18, telemetría 25/25 y retirement 456/456 PASS, sin QA física nueva.

## 7. Riesgos y deuda

- P1: #1562/#1527 comparten contrato neutral; decidir VERSION sobre la base integrada y mantener compatibilidad de archivos.
- P2: señales ausentes/replay LMU no verificados no autorizan ocultación ni referencias Delta inventadas.
- Pendientes físicos/plataforma: LMU/ACC live, macOS y otros simuladores; tests de corpus no equivalen a esos gates.
- Mantener fallos de golden/plataforma y tests de concurrencia registrados (#1471/#1478), sin relajar aserciones.

## 8. Issues terminadas, activas y pendientes

Cerradas en la base: #1530 (DTO), #1532 (contratos de catálogo/disk), #1534 (crates), #1536 y arreglos dependientes. Abiertas: #1474/#1498; activas de feature #1562 y #1527. Los IDs TC/ISA históricos se conservan en el archivo por SHA; el maestro V2 antiguo es contexto y no otra cola de ejecución.

## 9. Siguiente acción exacta

El orquestador revisa los tres nuevos commits y el diff completo del PR
draft #1616 antes de cualquier integración autorizada. VANTA-46 está Por revisar,
con gates locales completos y push de ronda 2 verificados.
QA física LMU/ACC pendiente.
El seguimiento previo #1564/#1527 se consulta en sus issues: esta revisión no
autoriza ejecutar esas features ni sustituye señales independientes para
última vuelta/sesión. Conservar DTO live v10 y compatibilidad de archivos.

## 10. Última actualización

2026-10-14 · GitHub #1606 / Plane VANTA-46 · Codex CLI. Ronda 2: N1/N2/N3 con RED→GREEN y commits propios; todos los gates locales verdes, push/PR draft y trackers de revisión verificados. QA física y CI remota completa pendientes. HEAD/CI finales se releen en la issue y el buzón. El estado anterior #1564 se conserva en sus párrafos; no ejecutar otras issues desde este handoff.
