# Evidencia ISA-1226 — T02d2c cargas en CalculateOrbit

## Alcance

- Carga Fuel opcional en el evento Go.
- Carga VE opcional cuando la familia es aplicable.
- Validación contra capacidad efectiva.
- Transporte al solver y conservación en la evaluación final.

TypeScript y UI quedan para T02d2d.

## Decisión mínima

El adaptador reutiliza `orbitExplicitScalar`; no añade un modelo ni un estado.
La evaluación sustituye sólo la carga del primer stint. Después propaga el
remanente real de Fuel y VE y calcula cada servicio como cantidad añadida.

## Contrato comprobado

- Una carga superior a la mínima permanece visible en el plan final.
- Cero explícito no se rellena para salvar la carrera.
- Fuel y VE se validan por separado y conservan campo de error.
- Una carga VE abundante atraviesa una parada forzada por Fuel sin servicio VE
  negativo.
- Dos autoridades Fuel distintas en el primer stint se rechazan.
- Ausencia mantiene el cálculo anterior.

## Pruebas

- RED inicial: CalculateOrbit no compilaba con las cargas nuevas.
- application completo: PASS.
- `go test ./... -count=1`: PASS.
- vet focal application/solver: PASS.
- build frontend web: PASS para generar el embed requerido por Go.
- roadmap: 23 + 21 tests PASS y artefacto regenerado.
- Astra high: sin P0/P1/P2; la tolerancia redundante del conflicto Fuel se
  retiró y el carry VE quedó cubierto.

## Límites

No hay transporte TypeScript, interacción visual ni prueba Wails/LMU. El corte
acredita el adaptador Go y su evaluación local, no precisión física.
