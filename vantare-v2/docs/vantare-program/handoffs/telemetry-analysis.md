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
corpus sintético y presupuestos. La aprobación e integración posterior del
conjunto aceptado en `nightly` se materializaron mediante ISA-204 / TA-N01.
TA-03 / ISA-126 caracterizó DuckDB LMU mediante copia temporal read-only y
añadió el modelo/parser histórico v1. TA-03C cierra su antiguo hueco operativo
con un reader ligado al artefacto autorizado y un adaptador reproducible.
TA-03B / ISA-135 cerró el corte de decisión tras un primer review
`REQUEST CHANGES`: recomienda un helper local fuera de proceso con
`duckdb-go/v2` y `duckdb.dll` dinámico, descarta el CLI y el CGO dentro de Wails,
documenta seguridad/packaging/rollback y entrega un spike sintético y un SBOM
reproducibles. TA-03C / ISA-168 implementa el adapter productivo fuera de
proceso, staging privado, manifest confiado, Job Object, IPC tipado, rollback y
packaging reproducible. La v1 queda limitada a archivos locales LMU
descubiertos/indexados. No se llama sandbox al proceso/Job Object y los imports
externos o comunitarios quedan bloqueados por ISA-164 / TA-03D.

- Rama/base/SHA: `vantareapp/isa-122-ta-01-investigacion-competitiva-fuentes-lmu-y-producto` sobre GOV-01 `67e263392b2192ee11f2ef4ccb161331dda3c735`.
- Promoción: TA-01…TA-03C integradas para validación Nightly/Pro Plus mediante
  ISA-204 / TA-N01, PR #94, squash
  `4e549bb59fd0b76398985cd28e5aa30aaaa85c32`. El contenido está verificado en
  el snapshot de `origin/nightly`
  `08fcfc15dceb88b6a6b5c679d581d9de7b8ab698`; los tres checks del PR terminaron
  `SUCCESS`. La validación Nightly/Pro Plus sigue pendiente y no existe
  integración demostrada en `testers` ni `master`.
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
- Rama TA-03B/base:
  `vantareapp/isa-135-ta-03b-decision-y-packaging-del-adaptador-duckdb-en-windows`
  sobre TA-03 `dc215665a0060147e1e8f36d23b128339beab241`.
- Contratos TA-03B:
  `research/telemetry-analysis/duckdb-adapter-decision.md`, ADR 0005 propuesta,
  `research/telemetry-analysis/ta03c-duckdb-adapter-plan.md` y
  `research/telemetry-analysis/spikes/ta03b/`.
- Evidencia TA-03B corregida: helper + DLL 44.317.091 bytes; build reproducible
  en dos rutas; apertura read-only, rechazo de escrituras, hash estable,
  cancelación coordinada con `context.Canceled`, tipos/NULL/cero e identificador
  citado PASS sobre 720.000 filas sintéticas. Un SBOM SPDX de 37 componentes se
  regeneró dos veces con SHA
  `959ab3ae08e2a6ff36c28c0773552a81048700c123dc899d2af89d48f1d4bfa5`.
  El enlace estático falló de forma reproducible con GCC 16 por símbolos
  `emutls`; el dinámico oficial 1.5.5 funcionó. No se abrió LMU, base personal o
  Telemetry Core y los módulos/dependencias de producto permanecen intactos.

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
- **P2 privacidad, reducido por TA-02/03C:** el contrato metadata-first,
  locator/error sanitizados y schema sin valores se mantienen. TA-03C demostró
  staging desde el handle autorizado, copia privada y ausencia de la ruta
  original en el helper. Queda pendiente validar el flujo local con el grupo
  Nightly/Pro Plus.
- **P1 integridad, reducido por TA-02/03C:** WAL, identidad, tamaño, mtime y hash
  se revalidan antes/después; sustituciones coordinadas y bundles alterados
  fallan cerrados. El reader y su bundle reproducible están cerrados
  técnicamente, pero no hay evidencia de distribución en instalador o release.
- **P2 dependencia/licencia, cerrado técnicamente en TA-03C:** el artefacto
  exacto conserva el inventario/SBOM reproducible de 37 componentes, notices y
  rollback confiado. Wails y el `go.mod` principal permanecen sin DuckDB/CGO.
  La validación física Windows 10 y cualquier integración de distribución
  siguen pendientes.
- **P1 toolchain, reducido por TA-03C:** el enlace estático oficial 1.5.5 sigue
  descartado por el fallo reproducido con GCC 16. La ruta dinámica fijada se
  reconstruyó reproduciblemente y superó los gates de PR #94; queda pendiente
  el smoke físico Windows 10.
- **P1 aislamiento/TOCTOU, acotado por TA-03C:** la v1 acepta solo LMU local
  descubierto/indexado y el helper recibe una copia privada producida desde el
  handle autorizado. Job Object, hashes, protocolo sin SQL y límites son
  defensa en profundidad, no un sandbox. Imports externos y comunitarios
  permanecen deshabilitados hasta ISA-164 / TA-03D.
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
| Cerrada técnicamente | TA-03 / ISA-126, modelo y capability endurecidos |
| Cerrada técnicamente | TA-03B / ISA-135, decisión, límite LMU local y SBOM reproducible |
| Integrada en `nightly`; validación pendiente | TA-03C / ISA-168, helper/adaptador fuera de proceso; cierre técnico `APPROVE`, promoción ISA-204 / PR #94 |
| Backlog obligatorio antes de imports externos | TA-03D / ISA-164, sandbox real para contenido externo/comunitario |
| Siguiente | TA-04, progreso/distancia y mapa con evidencia |
| Implementación posterior | TA-05+ según `research/telemetry-analysis/plan-microcuts.md` |

## Siguiente acción exacta

Validar TA-03C en Nightly/Pro Plus y continuar TA-04 para caracterizar
progreso/distancia y mapa con evidencia real. ISA-164 / TA-03D no bloquea la
lectura LMU local, pero sí cualquier import externo o comunitario. TA-05 publica
la proyección histórica para Strategy sin exponer DuckDB o el almacenamiento.

## Última actualización

2026-08-10, ISA-204 / TA-N01 verificada: PR #94 fue integrada en `nightly`
mediante squash `4e549bb59fd0b76398985cd28e5aa30aaaa85c32`, ancestro del snapshot
de `origin/nightly` `08fcfc15dceb88b6a6b5c679d581d9de7b8ab698`; sus tres checks
terminaron `SUCCESS`. Esto demuestra integración en Nightly, no validación
Nightly/Pro Plus ni distribución. El smoke físico Windows 10 sigue pendiente y
TA-03C no está en `testers` ni `master`.

Histórico previo a TA-N01 — 2026-08-02, ISA-168 / TA-03C cerrada técnicamente
sobre ISA-135. Helper Windows x64 fuera de proceso, módulo DuckDB separado,
staging DACL privado, manifest
confiado, Job Object, protocolo tipado sin SQL y bundle reproducible. Parser
end-to-end real, cancel/retry/close por PID y benchmark de 50 páginas PASS
(mediana 27,154 ms/página bajo CPU 93–100 %, 0,5995× frente a TA-03B). Root
Wails conserva `CGO_ENABLED=0` y cero dependencia DuckDB. Review independiente
`APPROVE`, cero P0/P1/P2/P3 razonables. Evidencia completa:
`research/telemetry-analysis/ta03c-duckdb-adapter-evidence.md`. En ese momento,
la entrega estaba en review y sin promoción. Historial TA-03B:

2026-08-01, ISA-135 / TA-03B corregida tras `REQUEST CHANGES`. Recomendación:
helper local corto fuera de proceso, `duckdb-go/v2` + DLL oficial dinámica, app
principal sin CGO, staging desde capability TA-02 y protocolo sin SQL. El spike
ahora prueba cancelación coordinada y revalida cada binario extraído; el SBOM
SPDX exacto cierra la compatibilidad comercial de 37 componentes. Job Object no
es sandbox: la v1 solo acepta LMU local y ISA-164 bloquea contenido externo.
Evidencia fresca: spike de 50 páginas PASS; test y vet focales con enlace
dinámico PASS; cancelación repetida 5/5; extracción manipulada rechazada por
hash; dos SBOM limpios idénticos; suite Go global PASS en 231,4 s;
`git diff --check` PASS. La primera ejecución global agotó el límite externo de
cuatro minutos sin emitir fallo y no se contó; la repetición acotada terminó
correctamente.
La re-review focal posterior dejó un único P2: la allowlist Go solo comprobaba
presencia. La corrección compara ahora bidireccionalmente el conjunto exacto
`módulo@versión` de `go version -m`, rechaza replacements y tiene regresiones
fail-closed para módulo adicional, esperado ausente y versión distinta. El
generador real volvió a producir dos SBOM idénticos con el mismo SHA; spike de
50 páginas, test/vet focales y tamper de extracción siguen PASS. Pendiente una
última re-review focal de esta corrección. Esa revisión detectó además un P3:
PowerShell aceptaba diferencias solo de mayúsculas. La corrección ordinal usa
comparación case-sensitive para ruta y versión, y añade dos regresiones
fail-closed (`github.com/Google/uuid` y `V1.6.0`). Las cinco regresiones pasan
en PowerShell 7 y Windows PowerShell 5.1; el SBOM real conserva 37 componentes y
el SHA aprobado. Pendiente review independiente de este último delta; ISA-135
no se considera aprobada.
Sin dependencias o código de producto, LMU, datos personales, integración ni
promoción. Pendiente re-review; el gate humano de ADR 0005 viene después.
