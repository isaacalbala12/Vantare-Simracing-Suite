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
- **P2 privacidad, reducido por TA-02:** ya existe contrato metadata-first,
  locator/error sanitizados y corpus sintético. Aún falta auditar un corpus
  histórico real legal antes del parser productivo.
- **P1 integridad, reducido por TA-02:** WAL presente bloquea la apertura y se
  revalida antes/después de leer. El gate exige ausencia + ventana estable y la
  lectura verifica que path y handle siguen siendo el mismo archivo regular,
  incluso si un reemplazo conserva tamaño/mtime. Aún falta caracterizar el
  formato real mediante una copia autorizada y read-only en TA-03.
- **P2 confianza:** AI/marketing de referencias no es autoridad. Las tarjetas
  iniciales han de ser reglas deterministas versionadas con evidencia visible.

## Issues

| Estado | Issue |
|---|---|
| Cerrada técnicamente | TA-01 / ISA-122, investigación competitiva, LMU/repo, contrato y HTML; review independiente `ACCEPT` |
| Cerrada técnicamente | TA-02 / ISA-124, corpus sintético y contrato de importación; review independiente `ACCEPT` |
| Siguiente corte | TA-03, modelo histórico canónico |
| Implementación posterior | TA-04+ según `research/telemetry-analysis/plan-microcuts.md` |

## Siguiente acción exacta

Entregar commit/push/PR/Linear de TA-02 y abrir TA-03 apilada. No implementar
UI, reader LMU live, comparación espacial ni
recomendaciones. Isaac decide la promoción posterior a `nightly`, no el inicio
autónomo del siguiente corte.

## Última actualización

2026-07-28, ISA-124 / TA-02 cerrada tras review: permiso exclusivo
`user_approved`, revalidación WAL, identidad path/handle, manifest/corpus bajo
una política común, parser explícito y deduplicación semántica única. Batería
final completa en verde; review independiente `ACCEPT` sin P0/P1/P2/P3.
