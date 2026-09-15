# Evidencia local — T17a / #1275

## Alcance entregado

- Cada variante puede fijar por parada Fuel y VE añadidos, además de cambio de
  neumáticos y compuesto cuando existe inventario físico.
- El modo paralelo o secuencial sigue siendo autoridad del evento. La decisión
  editada pasa por el replay existente; no existe una segunda fórmula de pit.
- El contrato rechaza índices, cantidades, VE, neumáticos y dobles autoridades
  incompatibles antes de presentar resultado.
- El helper TypeScript conserva la base exacta, fija todos los límites visibles
  y crea una variante comparable con los servicios completos.
- La carga VE visible de cada stint ahora se publica después de resolverla, en
  lugar de copiar el cero inicial.

## Regresiones

Go cubre cero/false por JSON, Fuel/VE exactos, capacidad, reserva, neumáticos
conservados/cambiados, compuesto físico, coste paralelo/secuencial y tránsito
contado una vez. TypeScript cubre clonación, límites y entradas inválidas.

## Verificación

- Frontend focal: 2 archivos y 14 pruebas, PASS.
- Frontend completo: 456 archivos y 3.914 pruebas, PASS.
- Typecheck, lint, auditoría i18n y build: PASS.
- Aplicación Strategy focal y Go global tras el build: PASS.
- 259 checks documentales y roadmap: PASS.

## Límites

T17b conecta la edición productiva y su coste. T18/T22 mantienen los gates
visual y nativo. No se abrió la app ni se ejecutaron Wails, LMU o DuckDB. No
hubo push, PR, CI remota, integración ni release.
