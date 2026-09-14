# Evidencia ISA-1224 — T02d2a capacidad y reservas Fuel/VE

## Alcance

- Reserva Fuel explícita en litros.
- VE `applicable` con capacidad y reserva obligatorias.
- VE `not_applicable` excluida del cálculo.
- Compatibilidad exacta cuando los campos nuevos están ausentes.
- Transporte TypeScript sin conversión ni estado adicional.

Quedan fuera cargas iniciales, inventario, servicios/formación, conexión del
asistente, validación Wails/LMU y precisión física.

## Contrato comprobado

- Las reservas explícitas usan cantidades, no porcentajes del consumo total.
- Cero conserva presencia para Fuel y VE.
- Una reserva VE no puede superar su capacidad.
- `not_applicable` no se convierte en capacidad o consumo cero acreditados: la
  familia deja de participar como recurso limitante.
- La proyección original permanece intacta y sus escenarios meteorológicos se
  conservan.

## Pruebas

El test empezó RED por ausencia de los tipos nuevos. Resultado local de cierre:

- aplicación Strategy: PASS;
- cliente focal: 49/49 PASS;
- frontend completo: 447 archivos y 3763 tests PASS;
- typecheck, lint y build: PASS;
- `go test ./... -count=1`: PASS;
- vet focal de application/manual/solver: PASS;
- roadmap: 23 + 21 tests PASS y artefacto regenerado.

La primera ejecución global frontend tuvo un único timeout en el test Playwright
heredado `PedalsRedline.layout`; su repetición focal pasó 5/5 y la segunda suite
global pasó completa. No se modificó ese componente.

Astra high revisó el diff final como consejero de simplicidad: no encontró
P0/P1/P2 ni una capa que justificase otro refactor. Se añadieron sus dos
refuerzos opcionales a la regresión meteorológica.

## Límites

No se abrió la app de escritorio ni LMU y no se leyó ningún DuckDB. Este corte
prueba semántica y transporte local; no acredita exactitud física ni aceptación
nativa o visual.
