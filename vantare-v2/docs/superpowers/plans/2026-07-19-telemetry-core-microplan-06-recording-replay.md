# TC-06 — Grabación, replay e histórico

**Objetivo:** convertir Telemetry Core en una base reutilizable para Strategy y análisis futuro sin acoplar el directo a DuckDB.

## ISA-101 / TC-06A — Decisión de almacenamiento y esquema histórico

- Auditar DuckDB en Windows/Wails: licencia, packaging, CGO/native DLL, upgrades, locks, corrupción y tamaño.
- Comparar al menos DuckDB, SQLite existente/posible y formato append-only propio/MCAP-like como frontera, sin incorporar dependencias.
- Prototipo descartable o benchmark aislado de escritura por lotes con frecuencia y parrilla realistas.
- Diseñar manifest, chunks, índices y separación entre observed, derived, facts y metadata.
- Definir versionado/migración, RPO local y recuperación tras crash.

**Resultado:** ADR de almacenamiento `GO/NO-GO`; no implementar backend definitivo si no existe evidencia suficiente.

## ISA-102 / TC-06B — RecordingSink, sesiones y recuperación

- Implementar puerto y coordinator independiente del reducer.
- Grabación solo tras acción/configuración explícita; status visible.
- Cola limitada, batches, checkpoints y cierre transaccional.
- Si disco/cola falla: detener, marcar incompleta y avisar; no bloquear ni perder silenciosamente.
- Manifest con versión, simulador/build, session identity, tiempos y algoritmos derivados.
- Reinicio detecta sesiones incompletas y permite conservar/eliminar de forma segura.

**Tests:** full disk simulado, writer lento, crash fixture, cancelación, doble start/stop y recovery.

## ISA-103 / TC-06C — Replay en tres niveles y migraciones

- Raw replay para drivers/parsers.
- Canonical observation/fact replay para core, derivaciones y productos.
- Historical query replay para backend y migraciones.
- Replay usa clock determinista, velocidad configurable y step mode en harness; nunca actúa como live productivo.
- Versionar fixtures con simulador/build/schema; migraciones unidireccionales y golden.

## ISA-104 / TC-06D — Inspector, privacidad y export diagnóstico

- Inspector local de sesiones/manifest/campos/calidad sin mezclar UI de Strategy.
- Tabla avanzada por vuelta/muestra como consumidor futuro, no parte del core.
- Raw capture diagnóstica opt-in, limitada por tiempo/tamaño y con advertencia.
- Política de redacción para nombres, IDs, rutas y logs.
- Export sanitizado explícito; nada se sube a red automáticamente.

## Gate TC-06

- backend reemplazable y sin tipos de DB en schema/core;
- grabación no degrada el directo más allá del presupuesto acordado;
- sesiones incompletas son visibles y recuperables;
- replay reproduce resultados deterministas;
- Isaac aprueba backend, privacidad e inspector antes de integrar.

## Stop conditions

- añadir DuckDB u otra dependencia sin ADR/benchmark/licencia;
- bloquear reducer para garantizar persistencia;
- descartar muestras sin marcar la grabación;
- almacenar datos personales/raw sin política;
- usar replay como fallback live.
