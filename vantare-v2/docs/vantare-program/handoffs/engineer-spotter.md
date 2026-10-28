> Roadmap #1535: las referencias a plan.md/generador en este documento son históricas.
> ClickUp es la única fuente; ver [mantenimiento vigente](../../roadmap-maintenance.md).

# Handoff vivo — Engineer/Spotter

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/engineer-spotter.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Consumidor neutral de fotos y eventos para radio localizada, Spotter y clips bajo demanda. No abre memoria del juego ni UI/red/TTS; ausencia de clips o datos no se presenta como voz o peligro demostrados.

## 2. Autoridad y lectura verificada

Leídos [#1485](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1485) (reintento REST boxes), [#1477](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1477) (seguridad) y [#1491](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1491) (lifecycle). [Engineer/README](../../../native/engineer/README.md), [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md) y contrato de producto son entradas; GitHub/Project Vantare decide alcance. Escritura/relectura de esta compactación en #1561.

## 3. Estado real y canal

VANTA-124 / [#1786](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1786),
2026-10-28: motor provisional ROCm Windows, RX 6600 XT gfx1032, sin cambio
de driver. Host llama.cpp `19cce69` local y backend AMD/Lemonade b1355 con
puente C experimental; hashes y riesgos en la evidencia. Spark Q4_K_M dio
115,3 t/s; LFM3 QAD-Q4_0, 131,7 t/s y 123,2 a profundidad 8k (cinco pasadas).
WSL dedicada en D: funcionó con ROCm emparejado, pero fue más lenta; queda
documentada y terminada. Ventana liberada a las 00:18 UTC: ningún motor cargado.

Arnés inicial [#1787](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1787)
integrado en `3afe1aa30`. Campaña abstracta completa: 930 peticiones por
candidato seleccionado, solo referencia; no decide el modelo del producto.
El evaluador v2 separado [#1789](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1789)
está integrado en `nightly@d218e53d2`; conserva crudos y v1, añade proyección
semántica offline etiquetada. No simula prompts nuevos ni acredita formato nativo.

[Campaña decisiva LMU compacta](../../../../tools/engineer-bench/sessions/README.md),
PR [#1790](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1790),
integrada por el orquestador en `nightly@c27d8dc5f`, CI verde verificado.
Origen SnapshotDto v11 real: 18 sesiones sintéticas, 1494 fotos; entrada al
LLM = estado actual y tendencias/eventos calculados por código sobre 5/20/60
fotos, 891–1488 tokens antes de plantilla. Control separado: un DTO crudo.
900 casos ES/EN; cinco pasadas = 4500 peticiones/modelo. N4, 8k/slot, KV f16,
máximo tres largas y una plaza reservada a radio. JSON schema donde aplica,
thinking OFF; Intent/cifras/prioridad/estrategia/acciones siguen en código.
No se cambia producto, ADR ni contrato público; la proyección es una propuesta.
58 tests Python combinados PASS; 1530 roundtrips nativos PASS; versión 10
rechazada; probe aislado con IPC existente, fmt y 466 huellas de calidad PASS.

Pendiente: ejecutar ambos modelos en la siguiente ventana autorizada y revisar
idioma/semántica humana. Estimación, no medición: Spark 45–75 min, LFM3 QAD
60–100 min; con preparación/cierre, reservar 3 h 30 min. Reestimar tras la
primera pasada. Corte <512 MiB, sin compiladores y un solo motor. Worker en
espera sin GPU; no elegir modelo con el score de referencia ni el mock.
Evidencia: `C:/VantareServer/evidence/vanta124/inferencia/informe-final.md`
y `../benchmark/`; comandos listos en
`D:/VantareServer/inferencia/campaign-next-window.ps1` y README de sesiones.
Sin promoción a testers/master, release ni servicios permanentes; Plane lo
gestiona el orquestador. Integraciones de ambos PRs verificadas remotamente.

Pulido posterior de VANTA-33 / #1638, rama `vantareapp/isa-1638-pulido`, base
`nightly@bcaa0e3f2` (#1664 integrada). Lifecycle confundía `clear:true` de fuente
stale con ingest autorizado mientras derechos seguían pendientes. La nueva
fixture fuerza esa intercalación, confirma PID del pipe, cursor0, liberación
de derechos y base autorizada antes de publicar la vuelta. Conserva aviso antes
del cursor1, checkpoint, cierre, concurrencia y límites originales. Mutación
reproduce el mismo `assertion failed: lap`; cinco tandas completas 25/25 PASS.
El `os error 2` compartido de CI no identifica al hijo; existe además un test
con Core ausente. Host ya creaba el primer pipe antes de devolver. Sin cambios
de producto, permisos o TTL. [Evidencia y límites](../../telemetria/pulido-1638-2026-10-16.md).
Código publicado `8d53d2cf1`, PR draft #1679 a nightly: CI run38904835599
verde, Windows Nextest 1870/1870 y Engineer lifecycle 5/5 (2,17 s). El cierre
de M-6 añade documentación, no cambia Engineer; verificar el SHA final en el PR.

Encargo posterior del orquestador en VANTA-33 / #1638, PR draft #1664:
el run38847620638 de `08f52be56` pierde autoridad después de HELLO en dos
tests recovery. No usa el adaptador LMU; aislados pasan46/46 antes del cambio.
Se reserva toda la concurrencia Nextest para el banco recovery y prioridad100,
como otros tests con plazos duros; no se modifica Engineer/Host/Feed, TTL2s,
permisos, deadlines, aserciones ni retries. Contención compatible con caducidad;
la edad de la política no está en el log antiguo. Evidencia, validación final
y estado de CI en [informe](../../telemetria/ci-y-jugador-2026-10-16.md),
#1638 y #1664. Base merge `nightly@8166277cb`; no promoción ni release.
Gates locales posteriores: Clippy/fmt PASS; Nextest CI workspace
Engineer/runtime/domain/ipc/services+telemetría **915/915 PASS**, 9 skips.
Los seis recovery corren primero, también denegación y pérdida de autoridad.

#1595 en `vantareapp/isa-1595-engineer-recovery-flaky`, base actual nightly
`a0f8569b` tras rebase sin conflictos; validación iniciada en `38b59434` y
código Engineer idéntico al validado:
el run 38421121953 demuestra denegación antes de HELLO, no timeout de 2 s.
La fixture abre Host antes del ACK durable Install; el Read del hijo puede
observar la política denegada intermedia. Se bloquean los Read hasta instalar
y la prueba sustituye sleep(2 s) por petición pendiente/liberación explícita.
Sin cambios funcionales de producto, permisos ni deadlines. La espera inicial
se extrae para probar con reloj virtual respuesta a 2 s (regresión del antiguo
1 s), timeout sin decisión de licencia y denegación definitiva: 3/3 PASS.
Sobre código `fc9667b8`: suite recovery **200 vueltas completas PASS** en
cuatro bloques de 50 (**1200/1200 tests**); tanda focal adicional bajo gates
**200/200 PASS**. Reloj virtual: 200 vueltas de tres tests (**600/600 PASS**);
mutación a 1 s provoca los dos fallos esperados y se revierte.
Los runs fallidos se conservan y no se cuentan como verdes: disco 112 y
BrokenPipe/TimedOut en otros tests de recovery/status_process (#1596).
Target propio y temporales restaurados a C:; sin junction, sin modificar
permisos/plazos/aserciones/retries. Evidencia: `C:/tmp/1595-evidence/`.
Gates finales PASS: fmt/check/Clippy `-D warnings`, Nextest **1642/1642**
(7 skips heredados) y lifecycle **18/18**. Integridad: 456 huellas PASS.
Telemetría no aplica: no cambia runtime/domain/IPC/testdata. Push publicado;
PR [#1597](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1597)
a nightly, enlazado en T3. Auto-merge expresamente autorizado por Isaac;
CI, SHA remoto y estado de integración se verifican en #1595. Sin release
ni promoción a testers/master.

Base de código contrastada: `origin/nightly@ca17545f607b85f5d47dc9d060721b69e6a6a158`. Esta compactación vive en `vantareapp/isa-1561-docs`; no cambia producto ni acredita integración de las ramas de ola 2. SHA final y push en [#1561](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1561) y `C:/tmp/buzon/1561-docs.md`. PR [#1570](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1570) contra nightly, con auto-merge autorizado por el orquestador. Nightly `0cf38ed2` incorporada mediante merge `dbee0c18`; sin promoción ni release. El binario nativo y supervisor están presentes; antiguos wiring Wails/voice-host test-only y sus estados no son el runtime actual. #1485/#1477/#1491 permanecen abiertas.

## 4. Decisiones cerradas

- Engineer nace solo bajo demanda; fotos DTO v9 y journal independiente, con cursor persistido antes de ACK.
- No garantizar exactamente una vez para audio externo entre checkpoint y reproducción.
- Spotter exige evidencia espacial/calidad utilizable; fuente no Live/TTL/época/sujeto invalidan mensajes. Clear retira presentación, no anuncia «pista despejada».
- Código fija intención/dato/prioridad/acción; LLM no decide camino crítico ni calcula estrategia.
- Micrófono/transcripción memoria-only por defecto y cero recording. PTT/wake/TTS/modelos necesitan corpus/licencia/escucha propios; decisiones históricas no autorizan wiring ni release.
- Pit Manager requiere confirmar/verificar; Strategy cambia solo tras aceptación.

## 5. Arquitectura y ownership

[Engineer](../../../native/engineer/src/lib.rs) posee checkpoint/radio/política y usa los flujos neutrales de runtime; no llama adapters privados. El supervisor `vantare` gobierna hijos y cierre. [Control Engineer](../../../native/ipc/src/engineer_control.rs) posee ajustes/protocolo. Datos y calidad proceden del núcleo; no duplicar clocks/journal ni leer LMU desde el consumidor.

## 6. Evidencia y límites

Evidencia registrada en la base: integración #1531, fmt/check/Clippy `-D warnings`, Nextest 1574/1574 (7 skips heredados), lifecycle 18/18 y telemetría 25/25. La revisión de PR #1570 ejecuta fmt/check/Clippy, Nextest 1574/1574 (7 skips) y telemetría 25/25, y reproduce lifecycle dos veces por la cola nativa: 5/5 Engineer y 13/13 supervisor PASS, con concurrencia y límites originales. El run 38068714205 falló al esperar el ACK firmado durable (`Kind(TimedOut)`, derechos `BrokenPipe`); no se ha confirmado la causa del timeout ni relajado sus límites. No convierte fixtures/replays en prueba física LMU/ACC, OBS, DPI, audio ni latencia de entrada. README conserva límites de vectores ACC estimados, caducidad 500 ms, clips y paridad de radio. #1491 documenta terminación 0xc0000409 intermitente sin causa confirmada; una repetición PASS no la resuelve. Corpus lingüístico/voz humano y soak físicos no están acreditados por esta compactación.

## 7. Riesgos y deuda

- P1: hallazgos de voz/radio/caché y derechos de #1477: cotejar arreglos presentes antes de atribuir cierre de todos los hallazgos.
- P2: REST boxes #1485: HTTP 500 histórico no demuestra imposibilidad; no emitir acciones sin readback confirmado.
- P2: lifecycle #1491 y comportamiento físico bajo carga siguen pendientes de reproducción.
- Licencias de código/modelos/voces/sound packs son independientes. G2P GPL/Kokoro y Whisper histórico condicionado no autorizan distribución.

## 8. Issues terminadas, activas y pendientes

#1536 y sus arreglos dependientes cerrados en base; #1477, #1485, #1491 y fase nativa #1428 abiertas. ENG-01..29/ISA antiguos conservan estado, gates e IDs en el histórico; no extrapolar aceptación acústica/hardware desde `ACCEPT` de una spec o un harness.

## 9. Siguiente acción exacta

VANTA-124: esperar nueva ventana del orquestador sin usar GPU. Entonces ejecutar
los comandos de sesiones para Spark Q4_K_M y LFM3 QAD-Q4_0 en serie; confirmar
PID/configuración/guard y preflight de plantilla antes de medir. Revisar respuestas
y elegir modelo con esta campaña, manteniendo el carril crítico en código.

#1485: en sesión LMU autorizada, reintentar la API REST de menú de boxes, documentar endpoint/respuesta sanitizada, precondiciones, confirmación/readback y fail-closed; no inferir disponibilidad del ensayo antiguo. Si se cambia código, regresión observable y gates nativos; telemetría para runtime/domain/IPC/testdata. #1477/#1491 necesitan trabajos propios con reproducciones y límites, sin relajación de tests ni efecto de voz real desde docs.

## 10. Última actualización

2026-10-28 · VANTA-124 / #1786 · Codex. #1789 `d218e53d2` y #1790
`c27d8dc5f` integrados por el orquestador, CI verde y SHAs verificados.
Campaña compacta preparada; ejecución pendiente de nueva ventana. Sin GPU.

2026-10-27 · VANTA-124 / GitHub #1786 · Codex. Integración del arnés #1787
en nightly `3afe1aa30` y CI verde verificados; entrega cerrada por el
orquestador. Las mediciones reales quedan a su cargo, fuera de esta entrega.

2026-10-13 · GitHub #1595 · Codex. Causa, código, prueba y gates contrastados;
200 vueltas de recovery y tanda focal bajo carga verificadas. Runs fallidos
conservados en #1596; push/PR/canal se actualizan en #1595. El diario por ronda
vive en la issue; aquí se conserva el estado técnico y los límites.
