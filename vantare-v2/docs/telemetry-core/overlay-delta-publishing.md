# Publicar deltas de Overlay: por qué hoy no ahorra nada

Medición ISA-354. Reproducible con:

```
go test ./internal/app/telemetrytransport -run MergePatch -v
```

## Lo que ya existía

El transporte soporta deltas de principio a fin, y con más cuidado del esperado:

- `PublishSnapshot(full, delta)` acepta un parche RFC 7396.
- Antes de retenerlo, lo **aplica sobre el frame anterior y compara** el resultado
  con el full. Un parche que no reconstruya el estado se descarta en vez de
  entregarse (`ErrDeltaMismatch`).
- Solo se sirve a un suscriptor cuyo cursor coincide con la base del parche; en
  cualquier otro caso recibe un full.
- El frontend ya distingue `"full"` de `"delta"`.

Lo único que faltaba era construir el parche. El productor llama
`PublishSnapshot(overlayFrame, nil)`.

## Lo que faltaba y ahora existe

`BuildMergePatch`, el inverso de `ApplyMergePatch`, con tests de ida y vuelta.

Trae documentada una limitación del formato: **RFC 7396 gasta `null` en "borra
esta clave"**, así que un parche no puede pedir que una clave valga `null`. El
contrato Overlay no emite ninguna —la ausencia viaja como `present:false` con
valor cero, y los arrays siempre se asignan— pero la limitación está fijada en
un test para que nadie la descubra tarde.

## La medición

Payload con la forma real: 44 vehículos, cada uno con sus campos envueltos en
calidad. Se mueve **un solo coche**.

| Forma de `vehicles` | Full | Parche | Ahorro |
|---|---|---|---|
| Array, como hoy | 21.883 B | 21.862 B | **0,1 %** |
| Objeto por identidad | 22.269 B | 77 B | **99,7 %** |

## Por qué

RFC 7396 **reemplaza los arrays enteros**: no tiene forma de decir "el elemento
3 cambió". Como el 95 % de la carga vive en `vehicles`, y en carrera siempre hay
al menos un coche que se ha movido, el parche acaba llevando la lista completa.

Cambiar el runtime a publicar deltas hoy no ahorraría nada medible.

## Recomendación

**Publicar deltas exige antes cambiar la forma del payload**, no el productor.
Con `vehicles` como objeto indexado por identidad de vehículo, el mismo cambio
que hoy cuesta 21.862 bytes costaría 77.

Eso es un cambio de contrato, con su versión, su migración de consumidores y su
decisión. Queda fuera del alcance que esta issue se fijó, y por eso este corte
entrega la herramienta y la evidencia, no el cambio de comportamiento.

La otra vía —publicar al ritmo que los consumidores usan en lugar de a 60 Hz—
sigue disponible y no toca el contrato, pero cambia el comportamiento del
runtime para todos los consumidores a la vez. También es una decisión, no una
optimización que se pueda colar.
