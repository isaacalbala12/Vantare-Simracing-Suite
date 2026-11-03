# Handoff vivo — Telemetry Core

Última actualización: 2026-11-03 · VANTA-129 / [#1868](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1868).
Historial y evidencia completos de los cortes anteriores
[en nightly@71a12cc09](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/71a12cc092c7aeee2b76ec357936471e6bee1043/vantare-v2/docs/vantare-program/handoffs/telemetry-core.md).

## Estado vigente

VANTA-129 **Por revisar**: pasos **0–6 y 9 integrados**; paso 7 en el
[PR draft #1898](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1898)
contra nightly, validado localmente. Quedan 8 y 10. #1895 integrado por el orquestador en 71a12cc09, CI 5/5 SUCCESS
verificada y Sonnet MERGE comunicado. CI remota del paso 7 sin resultado final
verificado en este corte; la revisión externa corresponde al orquestador.
Plane es el tablero; GitHub/Project Vantare registra código y PRs.
Riesgos abiertos: #1471, #1474, #1478, #1527 y #1561.

| Corte | Integración en nightly por el orquestador | CI del PR verificada |
| --- | --- | --- |
| 0–1, #1873 | bc239c063 | 5/5 SUCCESS |
| 2 + P3, #1877 | da4c2af08 | 5/5 SUCCESS |
| REST #1881, #1885 | 56c6df494 | 5/5 SUCCESS |
| 3, #1882 | ec4ca056c70ebdc92bf21d0540c5a65794667f3f | 5/5 SUCCESS; DeepSeek MERGE comunicado |
| 5, #1886 | 9d4982e290c3538d8bd2980c3f23c2d8b76b4183 | 5/5 SUCCESS; DeepSeek MERGE comunicado |
| 9, #1889 | cc5af8de149b7f9156130417fe1dc3545ee4fec7 | 5/5 SUCCESS verificado; DeepSeek MERGE comunicado |
| 6, #1891 | 7e92e1a9e52d57db17263234ec62efc5774794cb | 5/5 SUCCESS verificado; DeepSeek MERGE comunicado |

| 4, #1895 | 71a12cc092c7aeee2b76ec357936471e6bee1043 | 5/5 SUCCESS verificado; Sonnet MERGE comunicado |

Rama `vantareapp/isa-1868-paso7-host`, worktree
`D:/VantareServer/worktrees/isa-1868-paso7`, base origin/nightly `71a12cc09`.
Caracterización previa en `37a92f016`: 1.106 unitarios PASS, 12 skips; telemetría
34 PASS, un skip. El cambio del host se aplica después de los unitarios; el
replay de telemetría ya compilado termina sin cambiar código runtime.

## Corte actual y verificación

Paso 7: campaña y layout comparten recepción, entidades y ventanas por monitor.
La campaña crea un Layout en memoria, conserva posiciones, tipos, preferencias,
opacidad y proyección de cada foto; solo el documento guardado instala recarga,
bandeja, calendario y uso local. LiveWidget retiene Instance completa para no
buscar filtros y geometría repetidamente. Render y uso comparten visibility().
Se retiran run_with_rights, pipe_feed, pipe_feed_requested y open_screens.
La demanda completa de Workshop al guardar conserva su saludo legado con None.
La cola flume sigue acotada a cuatro; no cambia la política de muestras.
La campaña hereda la retención de entidades por ID del layout incluso fuera
de un monitor; no se crean ventanas allí. Las cifras previas del host retirado
no son una medición de rendimiento del host nuevo.

P3 de #1895: los tests aíslan kind y session_number al confirmar pausa, y prueban
la salida observable Stale frente al control Paused. El migrador de fixtures
se conserva fuera del repo en la evidencia y deja de entrar en --all-targets.

P2 de #1895: repetido una vez el lote «antes» completo de 16 trabajos desde la
fuente anterior congelada 8ebe041a8. Las ocho delta-trace 017–020 coinciden byte
a byte con el «después» original y las otras ocho con ambos originales. La
variación de dos píxeles se reproduce en la base anterior: no demuestra un
cambio visual del paso 4. El binario original no estaba archivado; se ha
reconstruido su fuente exacta y registrado toolchain y hash del nuevo binario.
No se atribuye una causa interna al rasterizador. Originales preservados.

Verificación local del código b7b49f25946112ceb831d5080fad325f7b1a9201,
árbol nativo 521ffdf283345d1b884b487c1d6ac5f29833b8b9:
- Fmt, check y Clippy -D warnings PASS: domain/ipc/runtime/ui juntos por cola,
  --all-targets, target privado native/target/gates y jobs 2 del entorno.
- Nextest CI 1.303/1.303 PASS, 15 skips; incluye telemetría 34/34 (#1498),
  corpus LMU/ACC y replay hasta los widgets. ACC completo 196,955 s.
- Lifecycle 25/25 PASS con procesos reales y overlays normal/QA. Capturador QA
  compila; cola cedida antes del contraste adicional del renderer anterior.
- 208 capturas nuevas: 200 PNG byteidénticos a las referencias aceptadas del
  paso 4; ocho delta-trace con uno o tres píxeles distintos, x=76/y=51–53,
  máximo premultiplicado 1,20. Cero píxeles sobre el umbral canónico 8 / 4 %,
  sin cambiar tolerancias. Se conserva también el resultado estricto a cero.
  La compilación intermedia se conserva como diagnóstico. El ejecutable final
  produce 208/208 PNG byteidénticos a las referencias, sin usar tolerancias;
  el lote crítico 16/16 también coincide con el renderer previo al host
  reconstruido desde 37a92f016. No persisten diferencias en la entrega final.
- Recuento físico de producción +255/−236 (neto +19), tests +111/−2 y
  tooling −105, separado de docs. No logra la reducción estimada: conservar
  los servicios del documento solo en el modo guardado necesita configuración
  y condiciones explícitas, además de construir el layout de campaña.
Integridad y quality: 468/468 PASS. No se regeneran goldens ni corpus.
Evidencia actual: `D:/VantareServer/evidence/isa-1868-paso7`, incluidos
before-repeat.md, comparaciones PNG, logs previos y migrate-fixtures.rs archivado.
El comando final del script previo se llama before-capture-build por historia,
pero compila el host nuevo: no se presenta como binario previo al rework.
No se han usado subagentes: OpenCode sin saldo y DeepSeek expresamente excluido.

## Contratos y límites que se conservan

- [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md) y [mapa nativo](../../../native/README.md):
  runtime posee adapters/adquisición/supervisión; domain es puro; IPC posee wire.
  Domain/UI no dependen de runtime, tampoco transitivamente.
- Adapter::poll recibe reloj y no bloquea. Origin conserva origen/recepción;
  calidad y capacidades explícitas no autorizan ceros o referencias inventados.
- Live negocia DTO **v11**; los lectores guardados v7–v10 se mantienen. Latest-wins
  de fotos no sustituye journal/cursor/ACK; época nueva invalida estado previo.
- Boundary de productor y suscriptor coincide, incluida situación de conducción.
  Core conserva la última foto viva en pausa; silencio 500 ms y situación 250 ms
  usan domain::freshness. El consumidor conserva su plazo Lost de cinco segundos.
- ACC sigue experimental con su golden. Sin conexión de ACC al producto, DTO v12,
  capacidades calculadas en núcleo ni cambio del formato delta por Look.
- Corpus, fixtures y lifecycle no prueban juego físico, OBS, DPI, audio o latencia.
  Las mediciones orientativas no certifican fluidez de producto.

## Coordinación y siguiente acción

VANTA-130 paso 8A reserva ui/layout (lector, normalización, persistencia y
default_path), hub/document, ipc/session_alerts y lectura opcional de
reducedMotion en el host. Se mantienen las reservas de raíz de datos,
workshop/state, carga/avisos/diagnóstico de hub/shell, files::future_version y
texto CAS de ipc/files. No se modifican esos archivos o líneas, ni installer,
packaging o hub/installation. La llamada MotionPolicy::apply_layout permanece
idéntica en el host compartido.

Revisar #1898 y su CI, e integrar mediante el orquestador; después 8 y 10,
cada uno desde origin/nightly actualizado y worktree propio. La integración,
las promociones y releases corresponden al orquestador.
