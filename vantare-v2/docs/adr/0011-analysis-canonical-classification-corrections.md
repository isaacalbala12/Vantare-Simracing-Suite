# ADR 0011 — referencias canónicas en correcciones de identidad

Estado: decisión del orquestador dentro del SDD autorizado y de ISA-1104;
implementación en curso. Decisión: 2026-09-10. Actualización: 2026-09-11.
J1 (preparación pura) y J2 (snapshot/decoder v4) revisados con global/vet;
custodia, resolución de catálogo y montaje nativo/UI siguen pendientes.
Complementa [ADR 0010](0010-analysis-observation-corrections.md) y
[T12 §5](../strategy-planner/sdd/classification-corrections-t12.md).

## Contexto

Corregir coche, categoría o circuito cambia la combinación usada por una
estrategia. El hash de texto libre no demuestra que una combinación exista
en Vantare. Tampoco es correcto completar metadatos ausentes desde otra
sesión o reinterpretar un plan anterior al cambiar el catálogo.

Analysis ya tiene SessionCatalog sobre modelos autorizados y una custodia
versionada de tres grupos con Save/Resolve, lease y revisiones exactas.
Conservamos ambos owners, el parser y el motor; no creamos otro catálogo.

## Decisión

Una corrección de identidad referencia una combinación existente. El servidor
resuelve el ID mediante el SessionCatalog compartido por Analysis y Strategy;
el cliente no aporta otro tuple ni hashea nombres. Las peticiones del conjunto
usan un mismo ID y la misma base; cada original se valida byte a byte.
Los metadatos utilizables no modificados deben concordar con el destino.
Los ausentes o no verificables permanecen intactos y no se rellenan.

La resolución para una escritura nueva ocurre dentro del lease, después
de comprobar replay, cabeza y cuota. Se inyecta un callback nativo acotado
en el input existente; la custodia no se convierte en dueña del catálogo.
Replay, Resolve e historial usan la decisión guardada y conservan identidad
si el catálogo cambia. Cada operación sigue requiriendo autorización de
la fuente actual; una referencia o revisión no concede acceso por sí sola.

Un snapshot v4 conserva la CombinationIdentity resuelta junto a los tres
grupos. Su digest y el comando ligan la decisión al destino. Sin identidad
activa no cambian bytes ni digests v1/v2/v3. La lectura valida consistencia
completa; no afirma autenticación contra falsificaciones locales coherentes.

UI prepara un conjunto coherente y conserva original/guardado/propuesta.
Cambiar la combinación efectiva no adopta cabeza ni recalcula el plan.
Se requiere elegir explícitamente la nueva combinación y esa revisión.

## Alternativas descartadas

- Texto libre más hash: confunde formato consistente con entrada autorizada.
- Sustituir el tuple completo: inventaría valores ausentes y modificaría
  campos que el usuario no corrigió.
- Consultar catálogo en cada replay/historial: rompería una decisión durable
  cuando desapareciese una entrada.
- Catálogo/reader separado para Strategy: duplica la fuente de verdad.

## Consecuencias y verificación

El composition root comparte una sola instancia del catálogo existente.
No cambia la derivación física ni los criterios de incidentes. Los nombres
registrados pueden representar equipos/liveries; resolver un ID no establece
equivalencia entre coches físicos. El detalle de puertas y microcortes está
en T12 §5/§8, incluidos tests de catálogo desconocido, parcialidad, consistencia
del conjunto, replay tras retirada del destino, compatibilidad y no adopción.

Los binarios anteriores a v4 no deben abrir esa custodia; un rollback conserva
los archivos y usa CorrectionRoot aislado, igual que la precaución existente
para v3. La paridad visual, Wails y la precisión empírica se verifican aparte.
