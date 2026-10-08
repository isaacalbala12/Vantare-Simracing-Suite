# ISA-1264 · T15a1 criterio de orden recorded

## Resultado local

El borrador `strategy.recorded.draft.v1` admite de forma aditiva un criterio
de pilotos con modo `fixed|free` y una lista exacta de IDs. Si el campo no
existe, se conserva la semántica anterior: rotación fija en el orden de los
pilotos guardados. La pantalla Pilotos permite elegir el criterio y mover una
rotación fijada sin crear otro modelo de estrategia.

Un mapper puro produce `driverOrderMode` y `order` para el contrato
`CalculateOrbit` ya existente. El modo de ritmo es un argumento obligatorio:
este corte no elige seco, lluvia o ahorro de forma implícita. Se rechazan listas
vacías, duplicadas, incompletas o con pilotos ajenos. El modo libre actual sólo
se ofrece para carreras por vueltas; una carrera por tiempo muestra la causa y
no puede enviarlo todavía.

## Límites

- No se proyecta ni combina telemetría.
- No se ejecuta ni cancela el cálculo.
- No se define todavía el resultado parcial ni la optimalidad final.
- No se abrió la app ni se ejecutaron Wails, LMU o DuckDB.

## Verificación

Los tests focales cubren compatibilidad de borradores anteriores, roundtrip del
campo, reordenación y cambio de modo, reconciliación del roster y
mapeo/rechazo del contrato: 5 archivos y 94 tests pasan. También pasan frontend
completo (449 archivos, 3.862 tests), typecheck, lint, auditoría i18n, build,
Go global y 259 checks documentales. El build conserva el aviso heredado de
chunks superiores a 500 kB.
