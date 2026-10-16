> Roadmap #1535: las referencias a plan.md/generador en este documento son históricas.
> Plane es la única fuente del roadmap; ver [mantenimiento vigente](../../roadmap-maintenance.md).

# Handoff vivo — Telemetry Core

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/telemetry-core.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Adquisición neutral LMU/ACC, calidad/frescura, fusión y derivaciones, publicación de fotos y journal. El núcleo entrega hechos: no pinta UI ni recomienda estrategia.

## 2. Autoridad y lectura verificada

Leídos [#1562](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1562), [#1527](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1527), [#1474](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1474) y [#1498](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1498); GitHub/Project Vantare gobierna estado. Entradas: [contratos nativos](../../../native/README.md), [reglas](../../../native/AGENTS.md), [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md). Escritura de esta compactación verificada en #1561.

## 3. Estado real y canal

### #1638 / VANTA-33 — práctica de Imola offline (16-oct)

**Canal real:** Plane En curso, PR draft [#1664](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1664)
a nightly. Código nuevo `acf7d09dc`, base ya fusionada `nightly@28800654c`.
Sin nuevo merge, promoción, release ni cambios en la rama #1653/#1660.

Recibida `C:/VantareServer/evidence/grabacion-lmu-imola/sesion.lmu.gz`,
3.006.324.579 bytes, LMU 1.4.2.0, 77 min 18 s de práctica Imola. SHM cuenta
38 coches totales; Alpine #35 del jugador parado fuera del garaje y sin vueltas,
IA en movimiento. Datos crudos privados con nombres/paths: no versionar.
[Informe vivo por widget, fuentes y pendientes](../../telemetria/imola-practica-2026-10-16.md).

El arnés completo terminó con `--recording-scope practice-only` en
`C:/VantareServer/logs/1638-imola-final-01`: productor/consumidor exit 0,
**287.495 fotos por cada widget**, **0 rechazos**, **261.546 SHM estables**.
REST: 61 endpoints, 159.083 respuestas, 51 con 200. **48 fotos Live y
287.447 Stale (99,9833 %)**: no es cobertura continua. Una sola práctica id 1.
Movimiento fiable: 26 rivales, máximo 82,7065 m/s. Jugador: 53 fotos fiables
con ruido de velocidad <=1,81e-7 m/s, cero inputs y cero vueltas. Solo estructura.
Calma/seco: 45 fotos Reliable con cero; se preservan las calidades restantes.
RSS observado tras >=240k fotos: ~26,24 MiB total, sin descomprimir a disco.
Fastest-lap no emitió aviso nuevo; ingest=false no significa no recibir datos.
La clasificación legible se regenera desde los agregados sin cambiar números
ni repetir el replay; Python cubre el ruido numérico real y casos no estáticos.
Recorre Reader/Replay/Translator/Core,
DTO estricto y los 18 Widget::ingest, más los 7 campos de Avisos. Streaming,
hashes por cuerpo, footer/CRC; sin juego, HTTP, ventanas ni capturas de app.
Métricas nuevas separan velocidad/inputs/vueltas del jugador y movimiento fiable
IA. No contar Stale/Estimated como evidencia de movimiento. La preliminar se
canceló deliberadamente tras 41.555 fotos: no es resultado final.

La captura confirma ceros explícitos REST de viento en calma y pista seca:
se respaldan solo con respuesta vigente de esta misma sesión/circuito, sin
rejuvenecer SHM. Fixture saneada y tests de ausencia, identidad y TTL. Daños
por componente, geometría productiva de pista y estrategias por nombre no
se inventan con REST ambiguo; ver informe.

Gates del código nuevo: Clippy workspace/all-targets -D warnings **PASS**,
Nextest runtime/domain/ipc con workspace **646/646 PASS**, 5 skips (incluidos
los tests de proceso Services), telemetría **32/32 PASS**, 1 skip, regresión
UI de movimiento **1/1 PASS**, Python **7/7 PASS**. En serie por la cola,
MIN_GB=0. Logs `C:/VantareServer/logs/1638-imola-final-*`. Los fallos iniciales
y su justificación se conservan en el informe. UI completa y lifecycle no
repetidos por alcance/RAM; no se ha capturado Vantare (#1655).

Sigue pendiente conducción real del jugador, varias vueltas y servicio;
además inicio/fin de sesión, clasificación/carrera, formación/salida y agenda
fiable de próxima sesión. Una práctica parcial no cubre esas situaciones.
No relajar frescura ante pausas SHM observadas. El supervisor live 16280 fue
cancelado con STOP y terminó cancelled; **no abrir LMU en el servidor**.
[Kit y comando offline](../../telemetria/grabacion-completa-lmu.md), ZIP release
en `C:/VantareServer/share/kit-grabacion-lmu/`; procedimiento live histórico
queda sustituido por grabación desde el PC de juego.

### #1638 / VANTA-33 — revisión de gates del servidor (R2)

El orquestador probó `25885bf5b`; log original
`C:/VantareServer/logs/gates-1638.log`: 3 doc_markdown, un fallo real del test
de distancia y cuatro tests de Services sin binario al seleccionar con `-p`.
Diagnóstico de la captura outlap sin modificar: longitud @1720 **0 m**, distancia
de vuelta **159,606201171875 m**, in_pit **false**. El adapter debe conservar
la distancia a meta ausente; el test era incorrecto al exigirla sin longitud.
La regresión ahora fija longitud, pits y resultado esperados por cada fixture:
**3586,8802490234375 m** estimados en 1.3; ausencia en outlap sin geometría y en
las dos capturas 1.4 con jugador en boxes. No se reescribe ninguna captura.

Corrección de los 3 comentarios Rustdoc; `StartPhaseDto` pasa a Copy y se extrae
el saneado de SessionTiming para resolver los avisos nuevos que aparecieron al
avanzar Clippy (sin permitir lints ni cambiar el saneado). Autorización nueva:
gates Windows imprescindibles en serie, `VANTARE_CARGO_MIN_GB=0`, target propio,
cola y jobs de la máquina (2 en esta tanda). Código de corrección `aa14ffa89`.

Resultados finales del código corregido:

- Clippy `--workspace --all-targets -- -D warnings` **PASS**, exit 0, 51,36 s
  en la repetición tras reinicio. Defaults conservados excepto DuckDB bundled,
  con biblioteca oficial de desarrollo como en gates.ps1. Log
  `C:/VantareServer/logs/1638-r2-clippy-4.log`.
- Nextest **640/640 PASS**, 5 skips, ejecución 43,877 s (build 2 min 06 s),
  exit 0. `--workspace`, filtro `package(vantare-runtime) |
  package(vantare-domain) | package(vantare-ipc)`, manteniendo Services en la
  selección de compilación para su ejecutable y excluyendo de la compilación
  de tests los demás miembros. Log `C:/VantareServer/logs/1638-r2-nextest-2.log`.
- La regresión `real_frames_expose_only_demonstrable_session_timing` pasa, igual
  que los cuatro tests de proceso Services que fallaban con `-p`.
- Fmt y diff --check **PASS**. No se repite lifecycle, UI ni el perfil largo de
  telemetría: el encargo de revisión pide solo estos gates imprescindibles.
  Los opt-ins físicos siguen sin ejecutar.

Fallos previos conservados en `1638-r2-clippy.log` y `1638-r2-clippy-2.log`; clippy-3 quedó interrumpido por el
reinicio de T3 sin resultado final y se comprobó que no quedaba proceso suyo.
El primer setup Nextest con todos los miembros se canceló antes de tests para
limitar la compilación a los crates solicitados más el ejecutable Services;
no se cuenta como PASS. Todos los logs originales se conservan.
No quedan gates de esta tanda activos.
Fase B sigue pendiente de la instalación de LMU y de sesión cargada por Isaac.

### #1638 / VANTA-33 — continuación servidor, 15-oct-2026

Encargo vigente reemplaza las excepciones del relevo: Plane **En curso**,
PR draft a nightly autorizado, sin promoción ni optimización/A/B en esta fase.
Worktree `C:/VantareServer/wt/isa-1638`, target
`C:/VantareServer/targets/isa-1638`, buzón `C:/tmp/buzon/telemetria-1638.md`.
Partida `f192ce4ed`; merge local de `origin/nightly@28800654c` sin conflictos
(`320ea57c6`). La rama sigue siendo `vantareapp/isa-1638-telemetria-lanzamiento`.
Issue OPEN, `area:telemetria-core`, GitHub Project Vantare verificados; no hay
milestone de versión de lanzamiento asignado.

Contrato DTO **v11** de Avisos: `Session.timing` entrega instantes de inicio y
fin reales, fin programado, fase, distancia longitudinal a salida/meta y tipo/
inicio de próxima sesión, cada uno con calidad. Productores demostrables:
fin programado SHM válido y distancia estimada fuera de boxes. Inicio/fin real,
fase y próxima sesión quedan **Unavailable**: las capturas no prueban esas
señales. No se declara cerrada esa parte del objetivo. Guía para el dueño del
widget: [contrato](../../telemetria/session-alerts-contract.md); no se modifica
la rama #1653. DTO live rechaza v10; lectores guardados migran v7–v10 sin tocar
originales. Callers de fixtures UI pasan al lector explícito de datos guardados.

Además: identidad nueva entre dos sesiones del mismo tipo con número nativo
distinto aunque no retroceda el reloj; el REST anterior no cruza esa barrera.
Regresiones escritas sobre capturas reales y mutaciones controladas para
negativos antes de la línea, pits, geometría inválida, cambio entre prácticas,
transporte completo/selectivo, ausencia estricta, migración y obsolescencia.
Pendientes de ejecutar mientras falta RAM; no son evidencia PASS todavía.

Fmt **PASS** por la cola (mínimo 0,5 GB solo para el formateador, que no compila).
Integridad y anti-slop **456/456 PASS** en esta continuación. Los gates Rust
están bloqueados por la cola: ~1–2 GB libres, mínimo 5 GB. No se reduce el
umbral ni se cierran procesos ajenos. Los PASS del relevo no validan este diff.
No se inicia LMU ni se abre/captura Vantare (#1655). La QA física anterior
«LMU sin sesión usable» sigue pendiente. Comando preparado:
`python -I native/scripts/verify-lmu-widget-coverage.py --target-dir C:\VantareServer\targets\isa-1638`.
Primero práctica con jugador en boxes basta para transporte; luego conducir
formación/salida y las transiciones práctica→qualy→carrera para fuentes nuevas.
La prueba de proyecciones no graba ni certifica esas transiciones.

Código de esta continuación `9a0163e60` y `794dd0a03` (saneado exhaustivo).
[PR draft #1664](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1664)
a nightly, registrado en T3. Push y HEAD final documental se verifican en el
buzón. La CI de `9a0163e60` pasó formato, ratchet y ruta de promoción; Linux
seguía compilando al consultar. No se extrapola a los commits posteriores.
Se canceló únicamente la espera local de check sin arrancar compilador
(RAM llegó a <1 GB); no quedan gates locales activos. Fmt final PASS.
Plane conserva En curso con PR, comentario y resumen verificados.

Siguiente: liberar RAM y ejecutar check/Clippy/Nextest/lifecycle/telemetría;
comprobar la CI del HEAD final. La fase A sigue incompleta por esos gates. Después coordinar fase B
con Isaac. Daño estructural exacto, forecast 15 min, ABS/TC/FFB y sanciones
con tipo/plazo siguen sin fuente demostrada; presentación de #1629 está fuera
de esta rama. No se inventan señales para completar la tabla.

### Histórico del relevo #1638 / VANTA-33 — lanzamiento y optimización incorporada

14-oct-2026, worktree `C:/tmp/wt-1638`, rama
`vantareapp/isa-1638-telemetria-lanzamiento`, base `nightly@79a1ace6`.
Excepción expresa: seguimiento por orquestador/buzón, sin Plane/Notion ni
subagentes; push al finalizar, sin PR/merge. Auditoría `98482e92`; implementación
`7ae70eeb`; demanda/host QA `6dab6930`. [Tabla de cobertura y límites](../../telemetria/cobertura-lanzamiento.md).

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
PASS; 321 tests UI PASS tras la regresión de demanda. Cuatro tomas basales
invalidadas por compilaciones/QA ajenas y una por nuestro cargo fmt. El 15-oct
local, al quedar el PC libre, terminó la campaña: **6 válidas, 0 intentos de
optimización completos, 0 mejoras**. Mediana CPU 4,746961 % de un núcleo
(ruido 1,556382 puntos), residente 94,366391 MiB (ruido 0,334759), privada
89,129430 MiB (ruido 0,320356). Mismo control, seis tomas 60 s + 180 s,
PRACTICE1/37/fase SHM 5/reloj fijo. Diagnostic-03 validó lectura/pintores y árbol de cuatro procesos,
incluido conhost.exe de System32, cuyo coste se incluye; 10 s con profiling
no son baseline ni prueba de mejora. No se cerró ningún proceso ajeno.
Se liberaron todos los slots/locks/marcadores propios y no queda campaña activa.
Campaña basal completada; candidato REST sin commit pasó Nextest 631/631,
Clippy/fmt/Release y LMU (11 captura/oráculo + 10 conformidad) antes del apagado.
Los pares A/B, B/A, A/B se interrumpieron: a1 no contiene `result.json`, así que
siguen siendo 0 pares completos, 0 intentos evaluados y 0 mejoras. No contar
controles, preparación ni una toma cortada como intentos.
Baseline seis tomas; tres pares por candidato, ruido medido, diez sin mejora
consecutivos para terminar; cada mejora necesita su commit y antes/después.

DUDA ya comunicada: daños exactos/zonas/reparación, forecast actual 15 min,
ABS/TC/FFB y tipos/plazos DT/SG no tienen fuente/equivalencia acreditada. Dents
ordinales no son integridad porcentual; presets weather no son forecast live.
El orquestador asigna PenaltyKind a #1629; no existe en esta base. Conectar
su tipo cuando esté disponible y haya fuente real positiva, sin redefinirlo.
Entrega global **parcial** hasta resolverlos. Push remoto confirmado `13fea744`,
sin runs CI de la rama; sin PR, merge, promoción ni release. Siguiente: cerrar
gates del candidato REST y ejecutar `campaign_pair.py` con su build hasheada
cuando LMU ofrezca una sesión y el Hub/QA de #1634 deje el PC libre.
Scripts compilados con py_compile; reservas por la cola y pantalla
se liberan al salir. Nunca contar las tomas inválidas como diez sin mejora.
Después, profiling separado y tres pares por candidato. Scripts/CSV/JSON y
binarios de control hasheados: `C:/tmp/1638-perf`, control `baseline-6dab6930`.
Entrega parcial en la rama de issue; remoto/CI se verifican en
el buzón, sin PR/merge ni promoción. Mantener issue abierta hasta resolver
fuentes/decisiones y mediciones, con seguimiento del orquestador.

Continuación 15-oct tras reinicio: fuentes/binarios del candidato
`a49d9d9d8e92` verificados contra su manifiesto; es digest, no SHA de commit.
Código guardado en `9eff05cb`; candidato A/B, sin mejora medida todavía.
Nextest runtime/domain/ipc **631/631**, 5 skips, y fmt pasan de nuevo;
build y Clippy con todos los targets PASS en `C:/tmp/1638-resume-*.log`.
Disco agotado interrumpe compilación UI/lifecycle antes de ejecutar sus tests;
logs de fallo conservados. Se recupera espacio solo con `cargo clean` sobre
target-1638 (runtime/UI y Release), sin borrar evidencias. Repetición en
`C:/tmp/1638-recovered-*.log`: fmt PASS, UI **321/321** (5 skips), lifecycle
**13/13**; telemetría completa **30/30**, 1 skip físico opt-in, exit 0 en
1038,911 s; ACC completo **974,046 s**. No quedan gates locales en curso.
Anti-slop/retirement **456/456** PASS de nuevo. `tasklist` no encuentra LMU y
el sondeo de solo lectura no abre `LMU_Data`; además el Hub de #1634 vuelve a
estar abierto. Fases físicas 3/4 pendientes, sin cerrar apps ajenas ni adquirir
locks de medida. Recalibrar ruido después del reinicio en el mismo contexto LMU.
Prueba física por widget preparada: `native/scripts/verify-lmu-widget-coverage.py`
arranca solo Core QA con datos/pipe aislados y usa el test UI opt-in para comparar
las 18 proyecciones y cuatro configuraciones con su demanda por pipe. Rechaza
replay y acepta sesión pausada/parada/garaje; no abre ventanas ni guarda fotos.
No se afirma QA física hasta ejecutarla con LMU. Esenciales: **13 OK/condicionados,
4 parciales, 1 falta**, con fuentes/decisiones pendientes en la tabla de cobertura.
Guarda opt-in comprobada con Core replay aislado: rechaza `Replay != Live`,
exit 101 esperado. El script físico respeta el `pc-medicion.lock` heredado de
rest-discard-01-a1-01 y termina sin arrancar Core. Ese lock (PID 13928) y
pantalla-ocupada (PID 25728) siguen en disco; ambos PID ausentes. Comunicado al
orquestador sin modificarlos en ese momento. Después el orquestador autoriza
retirarlos por el buzón: comprobados ambos PID con tasklist y propietarios JSON,
se retiran únicamente esos archivos. No quedan reservas antiguas #1638.

Hitos nuevos: REST `9eff05cb`, QA/documentación `99b5963c`, más cierre documental
de gates. Binarios/fuentes de control y candidato A/B verificados otra vez tras
la limpieza: intactos. 0 pares completos, 0 intentos evaluados, 0 mejoras.
Issue #1638 OPEN verificada, updatedAt `2026-10-14T19:41:08Z`, sin labels,
milestone ni Project; seguimiento del orquestador sin escrituras al tracker.
Push y SHA remoto final se releen al terminar y se registran en el buzón.
Sin PR/merge/CI de aceptación/promoción/release; estado de lanzamiento parcial.
Último chequeo: LMU ahora abierto (PID 20388), pero SHM sin parrilla activa y
REST sin JSON de sesión admitible. Fases 3/4 esperan **sesión usable**, sin
exigir movimiento. El Hub de #1634 ya no aparece en ese chequeo. No se cuentan
intentos ni se mide sin fuente válida.
Opt-in físico completo tras liberar reservas: Core QA arranca y se cierra por
EOF; test exit 101 «LMU sin sesión usable en el pipe QA», log
`C:/tmp/1638-live-coverage-final.log`. No es PASS físico ni mejora. Gates
ordinarios verdes; QA física y A/B pendientes de cargar sesión.

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
