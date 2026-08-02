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

La investigación y el corpus inicial ya existen. ISA-122/124 están `In Review`;
ISA-126 y su corte de packaging ISA-135 están activos; ISA-132 espera el
contrato de progreso/distancia. El productor histórico de Strategy es
ISA-159 / TA-05 y no puede sustituirse desde el propio Strategy Planner.

- Base de cadena: ramas apiladas TA-01..TA-04 según Linear.
- Promoción: ninguna.
- Dependencia Strategy: ISA-132 -> ISA-159 -> ISA-145.

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

## Issues

| Estado | Issue |
|---|---|
| En review | ISA-122 / TA-01 e ISA-124 / TA-02 |
| Activas | ISA-126 / TA-03 e ISA-135 / TA-03B |
| Siguiente | ISA-132 / TA-04, progreso/distancia/mapa |
| Productor Strategy | ISA-159 / TA-05, `StrategyInputProjection v1` |

## Siguiente acción exacta

Cerrar ISA-126/135, ejecutar ISA-132 y después ISA-159. TA-05 publica
capabilities/procedencia/unidades desde el modelo público de Analysis; nunca
expone DuckDB/storage al consumidor ni inventa Fuel/VE/tyres/weather ausentes.

## Última actualización

2026-08-01, ISA-134 / STR-00 fija ISA-159 como productor histórico Strategy.
