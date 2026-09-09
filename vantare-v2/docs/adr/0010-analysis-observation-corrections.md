# ADR 0010 — Correcciones reversibles de observaciones registradas

> **Estado y secuencia actuales (ISA-1091):** consultar el [SDD integral](../strategy-planner/sdd/README.md).
> La mecánica escalar y la conexión de revisiones ya tienen implementación local;
> las marcas originales de propuesta y siguientes pasos se conservan como historia.
> El SDD distingue las operaciones pendientes y evita reabrir aprobaciones satisfechas.


**Estado:** Propuesto para revisión; no implementado.
**Fecha:** 2026-09-08.
**Autoridad:** #1033, diseño #1028 aprobado; base `8a2d8ff4`.
**Alcance:** decidir contrato y custodia; no cambiar umbrales, lectores o solver.

## Contexto

Los originales deben conservarse intactos. El modelo histórico ya identifica
contenido, parser, schema, canales y calidad; `LapFamilyUse` separa usos por
familia. Existe procedencia `corrected`, pero no una revisión persistida de
correcciones de observaciones. Los overrides del plan pertenecen a otra capa.

El catálogo autorizado tiene recuperación propia. Guardar correcciones como
mutaciones de ese catálogo perdería la observación original y haría ambiguas las
revisiones. Introducir SQL editable o una segunda adquisición duplicaría autoridad.

## Decisión propuesta

1. **Analysis posee la corrección.** Valida fuente, objetivo, valor original,
   motivo y revisión; produce una vista efectiva y derivados con procedencia.
   Strategy presenta el editor y conserva qué revisión usa cada plan. React
   nunca escribe el DuckDB ni recalcula estrategia o calidad por su cuenta.
2. **Identidad de contenido y de interpretación.** Una base combina hash/tamaño
   del manifest autorizado, parser ID/versión, fingerprint de schema y versión
   del análisis/segmentación. La ruta o el número visible de vuelta no bastan.
3. **Revisiones inmutables pequeñas.** Cada revisión contiene un snapshot de las
   correcciones activas y su padre; no copia telemetría. Deshacer crea otra revisión
   con el conjunto anterior, manteniendo el historial. No es un motor genérico
   de eventos, fórmulas o transformaciones de señales.
4. **Custodia local separada.** Un JSON versionado por base de análisis bajo una
   carpeta privada de Analysis; nombre derivado de digest generado en Go. Contiene
   historial y cabeza vigente en un único documento, escrito atómicamente con
   backup validado y cuarentena. Se reutilizan los patrones de persistencia y
   lease ya existentes; sin base de datos, servicio o dependencia nueva.
5. **Un escritor y concurrencia explícita.** Lease exclusivo entre procesos
   durante lectura-comprobación-escritura y comparación de `expectedRevision`.
   Usar el mecanismo nativo existente (`repository/lease_windows.go` y
   `lease_other.go`) dentro de la frontera Analysis, sin importar negocio Strategy.
   Dos comandos incompatibles no se resuelven mediante “última escritura gana”.
6. **No hay transacción entre fuente y corrección.** La fuente es inmutable y la
   revisión la referencia por contenido. Tras cualquier recuperación se valida
   esa unión. Una revisión que falta queda indisponible; no se sustituye por otra
   más antigua o por datos sin corregir para recalcular un plan aceptado.
7. **Reglas de integridad separadas de decisiones de calidad.** Incluir una vuelta
   puede modificar una exclusión revisable, pero no inventa cobertura, unidades,
   reloj o una señal ausente. Un valor corregido sigue identificado como corregido.
   Los criterios físicos y umbrales siguen dependiendo de #1030.

Contrato operativo y ejemplos: [corrections-contract-v1.md](../strategy-planner/corrections-contract-v1.md).
Implementación posterior: [microplan](../superpowers/plans/2026-09-08-analysis-corrections-contract-implementation.md).

## Alternativas descartadas

- Editar DuckDB: rompe custodia y no admite formatos futuros con la misma semántica.
- Guardar todo como override de Strategy: confunde observación y regla del plan;
  otras vistas de Analysis dejarían de representar la misma sesión.
- Reescribir los derivados del catálogo: borra qué se observó y dificulta deshacer.
- Event sourcing, DSL o SQLite nuevo: no necesarios para snapshots pequeños de
  cambios manuales; medir tamaño/latencia antes de cambiar de almacenamiento.

## Consecuencias y límites

La app podrá mostrar original, corrección y causa, y reproducir revisiones cuando
conserve las fuentes y versiones necesarias. Un archivo cambiado o una revisión
perdida no se repara inventando datos. El coste crece con el historial; el store
exigirá límites de bytes/revisiones y devolverá error sin truncar historial.

El análisis completo de un original ausente requiere una copia verificada; un
plan ya guardado sigue consultable con aviso de reproducibilidad. Guardar primero
una corrección y fallar después al guardar un plan deja una revisión válida sin
referencias, no un plan vinculado a una revisión inexistente.

Este ADR propone custodia dentro de las responsabilidades vigentes de ADR 0006.
No autoriza código de F2, migración, publicación, cambios de originales ni nuevos
umbrales. #1033 termina con contrato y microplan revisables.
