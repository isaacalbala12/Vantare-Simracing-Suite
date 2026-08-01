# Handoff vivo — Telemetry Analysis

## Resultado

Herramienta post-sesión que responde «¿cómo puedo ser más rápido?» con
comparaciones sincronizadas, métricas y recomendaciones explicables. El nombre
visible es `Telemetría`.

## Autoridad y lectura

- `docs/vantare-program/README.md`, `product-contract.md` y
  `research-policy.md`.
- Este handoff y el proyecto Linear del módulo.
- ADR 0004 y el handoff de Telemetry Core para contratos/recording.
- La futura investigación, spec, HTML y plan aprobados reemplazarán el resumen
  de experiencia cuando aporten más detalle.

## Estado

TA-01 / ISA-122 completó la investigación documental, competitiva y de código.
TA-02 / ISA-124 está técnicamente cerrada en rama aislada tras review
independiente `ACCEPT` sin P0/P1/P2/P3. Entrega el primer contrato compilable
del producto: discovery metadata-only, estabilidad LMU, manifest sanitizado,
corpus sintético y presupuestos. La aprobación inicial de Isaac se reserva para
promover el conjunto aceptado a `nightly`.
TA-03 / ISA-126 permanece abierta sobre TA-02. Caracteriza un DuckDB LMU
completado mediante copia temporal read-only y añade el modelo/parser histórico
v1, pero el review adversarial del 2026-08-01 demostró que faltaba ligar el
reader al artefacto autorizado y que no existe aún el adapter DuckDB productivo
ni su integración reproducible. El contrato ya corrige los P2/P3 y la frontera
arquitectónica del P1 sin añadir dependencias; el P1 operativo solo se cierra
con un corte explícito de decisión/adapter.

- Rama/base/SHA: `vantareapp/isa-122-ta-01-investigacion-competitiva-fuentes-lmu-y-producto` sobre GOV-01 `67e263392b2192ee11f2ef4ccb161331dda3c735`.
- Promoción: ninguna.
- Evidencia: fuentes primarias enlazadas con fecha 2026-07-27, auditoría de
  catálogo/fixtures/driver LMU, matriz, contrato propuesto, arquitectura, HTML
  propio y plan TDD. No hubo hands-on autenticado, compra, captura LMU nueva ni
  acceso a archivos personales.
- Rama TA-02/base: `vantareapp/isa-124-ta-02-corpus-sanitizado-y-contrato-de-importacion`
  sobre TA-01 `0d7686b168f60ae9c21d55ffd995ce7837caff40`.
- Contrato TA-02:
  `research/telemetry-analysis/import-contract.md`.
- Evidencia TA-02: corpus puramente sintético validado con la misma política de
  manifest productiva; tests de WAL/ventana/identidad del handle/original
  intacto/dedupe/redacción/cancelación/límites. El acceso exige
  `user_approved`; no existe bypass `vantare_owned`. Parser ID/versión son
  obligatorios (`none@0` cuando no hay parser). No se accedió a
  `UserData\\Telemetry`, LMU, SimHub ni archivos personales.
  Focal x20, vet, race x10, fuzz 10 s (2.186.642 ejecuciones), suite Go global
  y `git diff --check` PASS.
- Rama TA-03/base:
  `vantareapp/isa-126-ta-03-caracterizacion-duckdb-lmu-y-modelo-historico-canonico`
  sobre TA-02 `f59fd3d2e1971944ee6cf2979f5535c7ac8d2a29`.
- Contratos TA-03:
  `research/telemetry-analysis/lmu-duckdb-characterization.md`,
  `research/telemetry-analysis/historical-model.md` y schema sanitizado
  `internal/telemetryanalysis/testdata/lmu-duckdb-schema-v1.json`.
- Evidencia TA-03: 12 claves de metadata, 56 canales continuos, 42 eventos y
  101 tablas. Original/copia con hash coincidente y metadata original intacta;
  la copia se abrió read-only. No se versionó DB, muestra, ruta, valor de
  metadata, nombre o identificador.
- Corrección de review TA-03: parser exige una capability emitida por TA-02 y
  revalida hash/tamaño/mtime/identidad antes y después; catálogo canónico
  determinista y resolución interna por `channelID`; máximo duro y predecesora
  acotada; metadata sensible redacted sin invalidar la sesión; `Lap` no genera
  límites sin evidencia; `DECIMAL` desconocido y duplicados case-insensitive.
- Checks TA-03 previos: focal x20, vet, race x10, fuzz y suite Go global serial
  PASS. Los checks frescos del endurecimiento se registrarán en el cierre del
  commit. La copia temporal read-only se eliminó al finalizar la
  caracterización; no se abrió de nuevo durante la corrección.

## Experiencia cerrada

- Galería de archivos LMU, recordings de otros simuladores e importaciones.
- Indexar por defecto; copiar a biblioteca opcionalmente.
- Resumen, mejor vuelta, consistencia y tres pérdidas principales.
- Workspace avanzado único con presentación progresiva.
- Dos vueltas principales, hasta cuatro trazas y estadísticas para más.
- Alineación por distancia; cursor, zoom, tabla y mapa sincronizados.
- Todos los canales con buscador, categorías, favoritos, presets y workspaces.
- Canales derivados oficiales; fórmulas personalizadas fuera del primer corte.
- Curvas/zonas detectadas, nombres verificados y corrección no destructiva.
- Tarjetas con delta, frenada, trail, velocidades, pedales, dirección, marcha,
  referencia, confianza y acción concreta.
- Vuelta teórica etiquetada; notas, correcciones, CSV y paquete Vantare.
- Motor determinista como autoridad; modelo futuro solo amplía explicación.
- Feedback local y comprobación de mejora en la siguiente tanda.
- Demo sanitizada gratuita; archivos propios requieren Pro.

## Fronteras

No habla durante la conducción, no modifica Strategy, no abre readers live y no
borra originales. Setup se compara sin afirmar causalidad.

## Primera entrega

Investigación de Coach Dave Delta, Garage61, Track Titan, trophi.ai, MoTeC i2,
Z1, SRT y alternativas; auditoría del repo; HTML interactivo Vantare;
arquitectura y plan. Después: discovery/import, galería, parser/modelo, dos
vueltas, gráficos/canales/mapa/delta/tabla, tres tarjetas deterministas,
notas/correcciones, CSV/paquete/demo, tests/benchmarks/capturas.

## Riesgos

- **P1:** consejos sin referencia comparable.
- **P1:** copiar código/UX propietaria o infringir licencias.
- **P2:** mezclar formato histórico con pipeline live.
- **P2:** competir con LMU por CPU.
- **P2:** abstraer antes de inventariar canales.
- **P1 técnico:** el catálogo actual no demuestra progreso/longitud de vuelta,
  distancia o geometría suficientes para implementar comparación espacial LMU;
  delta/mapa deben degradar honestamente hasta TA-04 con evidencia real.
- **P2 privacidad, reducido por TA-02/03:** ya existe contrato metadata-first,
  locator/error sanitizados, valores sensibles redacted y un schema real
  sanitizado sin valores. El reader productivo aún debe demostrar que nunca
  expone rutas o metadatos sensibles.
- **P1 integridad, reducido por TA-02/03:** WAL presente bloquea la apertura y se
  revalida antes/después de leer. El gate exige ausencia + ventana estable y la
  lectura verifica que path y handle siguen siendo el mismo archivo regular,
  incluso si un reemplazo conserva tamaño/mtime. La caracterización usó una
  copia autorizada read-only y verificó hash/metadata original antes/después;
  el reader productivo y su empaquetado siguen pendientes.
- **P2 dependencia, explicitado por TA-03:** el cliente Go oficial DuckDB es
  MIT, pero introduce CGO/GCC, binarios y empaquetado Windows. TA-03 conserva
  un puerto neutral y no añade la dependencia; un reader productivo necesita
  decisión/corte propio.
- **P1 temporal, explicitado por TA-03:** el catálogo continuo no declara el
  origen que lo alinea con `ts`. `Lap Dist`, `Total Dist` y GPS aparecen en el
  schema, pero TA-04 debe demostrar su comportamiento antes de mapa/delta.
- **P2 confianza:** AI/marketing de referencias no es autoridad. Las tarjetas
  iniciales han de ser reglas deterministas versionadas con evidencia visible.

## Issues

| Estado | Issue |
|---|---|
| Cerrada técnicamente | TA-01 / ISA-122, investigación competitiva, LMU/repo, contrato y HTML; review independiente `ACCEPT` |
| Cerrada técnicamente | TA-02 / ISA-124, corpus sintético y contrato de importación; review independiente `ACCEPT` |
| Abierta / corregida parcialmente | TA-03 / ISA-126, modelo y capability endurecidos; falta decisión/adapter DuckDB e integración reproducible |
| Bloqueada por adapter | TA-04, progreso/distancia y mapa con evidencia |
| Implementación posterior | TA-05+ según `research/telemetry-analysis/plan-microcuts.md` |

## Siguiente acción exacta

Cerrar el endurecimiento actual con commit/push en la PR draft existente, sin
cambiar Linear. Después, el orquestador debe abrir y aprobar un corte pequeño
para seleccionar/empaquetar el driver DuckDB e implementar un adapter read-only
ligado a `AuthorizedHistoricalArtifact`, con DuckDB sintético real, mismatch y
TOCTOU. Solo entonces TA-03 puede volver a review de cierre y desbloquear
TA-04. No hay promoción a `nightly`.

## Última actualización

2026-08-01, ISA-126 / TA-03 reabierta tras review adversarial `REQUEST
CHANGES`. Corregidos sin dependencia nueva: capability TA-02 no intercambiable,
revalidación antes/después, orden canónico, redacción de metadata, límite duro
y retirada de límites de vuelta especulativos. Sigue pendiente el adapter
DuckDB productivo y su integración reproducible; sin cambio de Linear,
integración ni promoción.

Evidencia fresca del endurecimiento: focal x20, vet, race x10 con GCC UCRT64,
dos fuzz de 10 s, benchmark de dos horas a 100 Hz y suite Go global PASS. El
benchmark quedó en 58,04–75,16 ms/op, 103.686.400–103.696.592 B/op acumulados
y 355–368 allocs/op. No hay cambios frontend; sus checks no aplican a este
delta.
