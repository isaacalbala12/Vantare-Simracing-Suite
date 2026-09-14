# ISA-1259 — descubrimiento de revisiones históricas

## Problema reproducido

Después de guardar A y B, `list` informaba dos revisiones pero sólo publicaba la
referencia de B. A seguía persistida y podía abrirse por referencia exacta, pero
el cliente no tenía forma de descubrirla.

## Solución mínima

El resumen existente añade `revisionRefs`: referencias completas sin payloads,
rellenadas en el mismo recorrido que ya cuenta las revisiones. Conserva
`latestRevision` y todos los campos anteriores. El cliente trata la lista como
opcional para aceptar respuestas legacy y valida cada referencia presente con
el parser existente.

La prueba Go guarda A y B, descubre ambas y abre A usando sólo la referencia
listada. También comprueba que dos variantes no mezclan su historial. El cliente
transporta las referencias, rechaza una incompleta y acepta un resumen anterior.

## Límite

Este corte publica referencias, no contenido histórico ni UI. T14 continúa con
el visor mínimo que enumera y abre una revisión explícita; después queda la
recuperación duradera de comandos. No cierra A15/A16.

## Verificación local

- Application focal y `go test ./...`: correctos.
- Cliente focal: 72/72; suite frontend: 448 archivos y 3833 pruebas.
- Typecheck, ESLint, auditoría i18n y build: correctos.
- Suite documental: 137 pruebas; roadmap regenerado y estable.
- Revisión Astra read-only: 9,5/10 de sencillez, sin P0–P2.

El build conserva el aviso previo de chunks mayores de 500 kB. No se abrió la
app ni se ejecutaron Wails, LMU o DuckDB.
