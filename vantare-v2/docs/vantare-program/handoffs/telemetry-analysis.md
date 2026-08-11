# Handoff vivo — Telemetry Analysis

Última revisión técnica: 2026-08-11.
Estado operativo: consultar Linear y Git; este documento no elige issue, rama
ni siguiente acción.

## Resultado y fronteras

Telemetry Analysis estudia sesiones terminadas: importa fuentes autorizadas,
compara vueltas y produce canales, mapas, deltas y consejos deterministas con
procedencia visible. No habla durante la conducción, no modifica Strategy, no
abre readers live y no borra originales.

## Autoridad técnica

- `docs/adr/0010-duckdb-helper-for-historical-telemetry.md`.
- `docs/vantare-program/research/telemetry-analysis/README.md`.
- `docs/vantare-program/research/telemetry-analysis/historical-model.md`.
- El plan exacto enlazado por Linear.

## Estado técnico actual

El importador acepta únicamente archivos LMU locales descubiertos y copiados
desde una capability autorizada. El helper DuckDB Windows x64 vive fuera del
proceso, usa protocolo tipado sin SQL, manifest/hash/tamaño fijados, staging
privado y Job Object. La app Wails conserva `CGO_ENABLED=0` y no incorpora
DuckDB en su módulo principal.

La caracterización demostró metadata, canales y tablas sin versionar datos
personales. WAL o identidad inestable bloquean la lectura. Progreso, distancia
y geometría aún requieren evidencia TA-04 antes de habilitar mapa o delta.
Imports externos/comunitarios permanecen bloqueados hasta un sandbox real.

## Decisiones cerradas

- El archivo LMU es fuente externa de solo lectura; Vantare trabaja sobre copia.
- La capability se revalida antes y después; path, handle, hash y límites
  forman parte del contrato.
- El helper no acepta SQL arbitrario y nunca se confunde con un sandbox.
- Canales derivados conservan procedencia y versión.
- El motor determinista es autoridad; IA futura solo amplía explicaciones.
- Missing o resolución desconocida se muestran; no se rellenan con cero.

## Riesgos y bloqueos

- **P1:** TOCTOU o archivo/WAL cambiante durante la importación.
- **P1:** tratar Job Object como aislamiento suficiente para contenido externo.
- **P1:** implementar comparación espacial antes de demostrar distancia.
- **P2:** drift del DLL, SBOM, notices o runtime VC++.
- **P2:** competir con LMU por CPU o revelar rutas/metadata sensibles.

## Recomendación técnica

Validar el artefacto exacto del helper en el canal autorizado y continuar con
la caracterización de progreso/distancia. No habilitar imports externos ni
comunitarios hasta que exista el sandbox de su issue específica.

## Evidencia

- `docs/vantare-program/research/telemetry-analysis/lmu-duckdb-characterization.md`.
- `docs/vantare-program/research/telemetry-analysis/duckdb-adapter-decision.md`.
- `docs/vantare-program/research/telemetry-analysis/ta03c-duckdb-adapter-evidence.md`.
- `internal/telemetryanalysis/testdata/lmu-duckdb-schema-v1.json`.

## Historial

- [Cronología completa hasta 2026-08-10](../../archive/2026-08/handoffs/telemetry-analysis-through-2026-08-10.md).
