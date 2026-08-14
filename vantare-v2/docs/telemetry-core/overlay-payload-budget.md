# Presupuesto de carga de Overlay v1

Medición ISA-353 / TM-03. Reproducible con:

```
go test ./internal/telemetry/projection/overlay -run "Payload|Spatial" -v
```

La barrera vive en `payload_budget_test.go`, no en este documento: si la carga
crece más de la cuenta, falla el test, no se queda en una nota que nadie relee.

## Condiciones medidas

- Parrilla completa de 44 vehículos, la que trae la fixture real.
- Tipos reales del contrato `projection/overlay`, con todos los campos poblados.
- Reader a 60 Hz (`drivers/lmu/driver.go`).
- Publicación siempre en full, nunca delta (`app/telemetry_core_runtime.go`).
- Tope del transporte 256 KiB (`app/telemetrytransport`).

## Resultado

| Codificación | bytes/frame | bytes/vehículo | % del tope | a 60 Hz |
|---|---|---|---|---|
| Actual | 110.574 | 2.513 | 42,2 % | 6,63 MB/s |
| + posición y matriz | 126.195 | 2.868 | 48,1 % | 7,57 MB/s |
| + `x/z` cuantizado | 113.743 | 2.585 | 43,4 % | 6,82 MB/s |

La pose cuantizada cuesta **72 bytes por vehículo**; la matriz cruda, **355**.
Casi cinco veces más para publicar una orientación que el mapa no dibuja.

## Recomendación: viable con condiciones

Publicar `x/z` cuantizados es asumible: sube el uso del tope del 42,2 % al
43,4 %, poco más de un punto. Con eso, los coches sobre el mapa dejan de ser una
cuestión de presupuesto.

La matriz cruda también entra hoy, pero gasta cinco veces más para transportar
una orientación que ningún consumidor actual necesita. Si algún día hace falta
rumbo, sale más barato derivar el ángulo en Go y publicarlo cuantizado.

## Lo que esta medición deja al descubierto

El problema no es la pose. **Es que una parrilla llena ya consume 42 % del tope
y 6,6 MB/s antes de añadir nada**, porque cada frame viaja completo a 60 Hz
aunque el protocolo admita deltas y aunque los widgets rendericen a 30 Hz o
menos.

Ahí está el margen de verdad, y es independiente del mapa: habilitar deltas, o
bajar la frecuencia de publicación al ritmo que los consumidores usan, libera
mucho más que cualquier ahorro de campos. Merece issue propia.

## Umbral

La barrera está en el 50 % del tope. La mitad restante cubre lo que un frame
todavía puede crecer: señales por vehículo que siguen ausentes del contrato,
históricos más largos y las poses que esta medición valora. Cruzarla no es una
caída; es el punto en el que la siguiente función tiene que justificar sus bytes
en vez de darlos por supuestos.
