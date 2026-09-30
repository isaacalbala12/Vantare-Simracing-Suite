# ISA-1066 — base y corrección escalar C1a

Base `b486050c`; rama `vantareapp/isa-1066-sample-corrections`. Isaac aceptó #1063 como dirección visual inicial y mantiene autorización para continuar sin subagentes.

## Resultado

`SourceAnalysisRef` identifica sesión, hash/tamaño de contenido, parser, schema, versión de análisis y digest de segmentación. Su hash tiene dominio `analysis.correction-base.v1`, JSON compacto con orden fijo de campos del struct Go y SHA-256 hexadecimal minúsculo. Ningún campo es ruta ni permiso. El productor deberá obtener los campos de la base real; no se sintetizan versiones desde frontend.

`PrepareSampleCorrection` valida una corrección contra una muestra y canal de esa base. Rechaza base cambiada, selector ambiguo/inexistente, original distinto, muestra ausente, unidad no conocida/distinta, tipo incompatible, NaN/Inf, campos inactivos del escalar y motivo inválido. Devuelve original y vista corregida por valor, sin mutar la muestra y sin elevar la calidad original. Cero, false y texto vacío siguen siendo valores presentes.

Es una función pura de preparación. No concede autorización, no persiste revisión, no lee DuckDB, no cambia clasificación, no crea muestras ni resuelve relojes. El futuro consumidor debe obtener base/canal/muestra de una única lectura autorizada y revalidar bajo lease al guardar.

## Límites de contrato C1a

Identificadores <=256 bytes UTF-8, motivo no vacío <=1024 bytes, texto escalar <=4096 bytes. Hash de contenido y segmentación: 64 hex minúsculos. Son límites de representación, no umbrales físicos. La revisión persistida, control de solapes entre correcciones, familia, clasificación y límites de stint quedan para cortes siguientes.

El hash de corrección incluye motivo, objetivo, base, unidad, original y sustitución con dominio `analysis.sample-correction.v1`. No es todavía `revisionId`: una revisión contendrá el snapshot completo. El wire para enteros de 64 bits tendrá que preservar exactitud cuando se conecte a JavaScript; este corte no añade un endpoint JSON.

## Pruebas y revisión

- RED: los tests no compilaban antes de existir tipos/funciones.
- Suite de Analysis PASS; seis tests nuevos con subcasos de rechazo, fuente/interpretación y original intacto.
- Vector independiente Python/hashlib: `5bcef455fc1420402790237a9bc535f488d186650fb96a97834dbcb1a1e80c3a` para la base declarada en test.
- gofmt aplicado. Build frontend PASS (aviso existente de chunks grandes); assets requeridos por Go embebido. Dependencias instaladas offline/frozen-lockfile, sin cambios de lockfile ni paquetes añadidos.
- `go test ./...`: PASS, exit 0. Log privado `C:/tmp/isa1066-go-full.log`.
- Revisión personal: sin I/O ni rutas, scalars existentes reutilizados, copia por valor sin alias mutable, integridad separada de calidad. Sin dependencias ni nuevas capas de persistencia.
- No suite frontend/lint porque no se modificó TypeScript/CSS; el build sí recorre tipos.

## Siguiente corte

C1b: producir base desde el modelo autorizado y preparar snapshots con selección por familia/solapes. C2: custodia, deshacer e idempotencia bajo lease. Después conexión a la pantalla de Strategy aprobada como inicio. No introducir atajos de almacenamiento local en React.

Archivos Go creados: corrections.go y corrections_test.go. Documentación de evidencia/contrato/maestro/handoffs/roadmap actualizada; digest generado. Sin interfaz nueva, persistencia, integración, release o cambios en originales. Tests contractuales no acreditan precisión empírica ni aceptación Wails.
