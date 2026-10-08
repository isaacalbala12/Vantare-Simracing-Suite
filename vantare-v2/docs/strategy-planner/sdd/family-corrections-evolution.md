# T11 — evolución del snapshot de correcciones

ISA-1099, SDD R08/R09/A08/A09. Continúa ADR 0010; no crea otra custodia,
lector, formato de telemetría, motor ni dependencia. Este documento fija los
cortes de integración pendientes; T11a sólo implementa validación pura.

## Identidad y aplicación

La primera capacidad usa vuelta con número, inicio y fin originales y base
exacta. El número por sí solo no sirve. Familia y uso esperado proceden del
LapFamilyUse original. Motivo obligatorio. No anunciar Pit/ObservedStrategy
como editables mientras sus consumidores no respeten esta decisión por vuelta.
Las familias iniciales son Fuel, energía virtual, curva combinada de ritmo,
desgaste y coste de ahorro, con sus identificadores ya existentes.

Una inclusión no crea vueltas completas, continuidad, unidades ni señales.
La cobertura desconocida no se trata como válida por tener un peso estadístico
mayor que cero. Stale conserva su marca, sin promoción. Cada derivación mantiene
sus comprobaciones físicas. Tráfico/outlier son observaciones revisables; una
inclusión explícita debe llegar a los consumidores sin quedar anulada por una
segunda exclusión blanda privada. No cambiar los criterios empíricos de #1030.

Guardar un conjunto comprueba todas las correcciones contra la base original.
No encadenar precondiciones contra un escalar ya corregido. Aplicar primero los
escalares y reanalizar; después resolver el objetivo familiar original en esa
vista. Si una corrección escalar cambia sus límites, rechazar la combinación de
operaciones en lugar de trasladar la decisión a otra vuelta. La futura operación
de límites de T13 debe conservar esta misma política explícita.

## Compatibilidad de custodia

- Mantener un documento/lease/backup por base de Analysis.
- Mantener digests y revisiones escalares existentes exactamente; no reescribir
  historia para introducir la nueva operación.
- Snapshot escalar vacío o sólo escalar conserva analysis.sample-snapshot.v1.
- Con decisiones familiares, usar un snapshot mixto con versión explícita y
  digest que incluya todos los escalares y decisiones familiares ordenados.
- Un nuevo snapshot que retire todas las decisiones familiares puede volver a
  la representación escalar; la revisión padre sigue conservada.
- Lectura valida ambas representaciones y recalcula cada digest correspondiente.
- Límite conjunto 256 operaciones, 256 revisiones/8 MiB existentes; no aumentar
  presupuesto ni truncar el historial. Rechazar solapes de la misma familia.
- El comando completo distingue conjunto familiar explícitamente vacío de una
  petición legacy que lo omite. Bajo el mismo lease, un nuevo guardado legacy
  no puede eliminar decisiones familiares que desconoce.
- Un replay exacto ya persistido mantiene prioridad sobre ese guard y devuelve
  su revisión histórica junto a la cabeza actual. No duplica ni adopta cabeza.
- Save y Resolve comparten el mismo digest semántico. Las operaciones familiares
  no pueden desaparecer del payload usado para resolver un guardado incierto.

## Secuencia pequeña

T11a objetivo/preparación puros (dos paths).
T11b snapshot familiar validado/solapes/vista de usos (hasta cinco paths).
T11c evolución de representación y validación de documento (hasta cinco paths).
T11d guardar/resolver mixto y compatibilidad legacy (hasta cinco paths).
T11e derivación/proyección con puertas duras y familias independientes.
T11f API de inspección/guardado y contrato TS, separados si superan cinco paths.
T11g jerarquía/uso por familia en Datos, historial y snapshots completos en UI.

Cada corte define sus paths y evidencia antes de editar. No cerrar T11 por
preparación pura ni por fixtures: faltan montaje, persistencia, proyección y
recorrido real. Capturas finales/precision empírica siguen gates separados.
