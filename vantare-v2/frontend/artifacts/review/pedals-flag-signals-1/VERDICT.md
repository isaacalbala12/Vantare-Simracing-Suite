# Veredicto: señal de bandera en Pedals

## Resultado

Pedals ahora consume `SessionV2.flag` y `SessionV2.phase` desde el view-model V2. La bandera solo controla la línea de estado ya existente en la parte superior del widget; los carriles siguen siendo exclusivamente `throttle`, `brake` y `clutch`. Una bandera ausente, stale o no reconocida queda como `unknown` y no se convierte en verde.

La evidencia del contrato actual indica que la fuente Go de LMU solo puede producir hoy la candidata amarilla (`yellow`) para esta señal; no se infiere `green` por ausencia. La sonda verde del Workshop es explícita y sintética, y sirve para demostrar la transición visual del contrato completo.

## Capturas verificadas

| Caso | Evidencia observada |
| --- | --- |
| Sin bandera | `data-flag="unknown"`; línea superior neutra; throttle 75%; tamaño 280×96. [PNG](./01-pedals-sin-bandera.png) |
| Bandera amarilla | `data-flag="yellow"`; línea superior amarilla; mismos valores y tamaño. [PNG](./02-pedals-yellow-flag.png) |
| Sonda verde explícita | `data-flag="green"`; línea superior verde; mismos valores y tamaño. [PNG](./03-pedals-green-probe.png) |

## Verificación

- 55 pruebas focalizadas de Pedals, query del Workshop y paridad: pasan.
- `pnpm typecheck`: pasa.
- `pnpm lint`: pasa.
- `pnpm build`: pasa.
- `pnpm test` global: 422 archivos pasan, 33 fallan por `localStorage` no disponible en el entorno de ejecución; los fallos son de suites Hub/Studio no relacionadas con esta integración.

No se modificaron tamaño, fondo ni estructura visual del widget.
