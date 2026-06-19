# Checklist de review Go

Usar para revisiones adversariales de codigo Go.

## Correctness

- Maneja inputs invalidos.
- Maneja `nil` si aplica.
- Devuelve errores utiles.
- No cambia comportamiento fuera del alcance.
- Tiene tests para happy path y edge cases.

## Simplicidad

- La abstraccion resuelve un problema real actual.
- No hay interfaces prematuras.
- No hay paquetes `utils` genericos.
- Nombres claros.
- Una funcion simple no fue convertida en arquitectura innecesaria.

## Error handling

- No ignora errores.
- No compara strings de error si hay alternativa.
- Usa `%w` al envolver errores.
- No usa `panic` salvo justificacion.
- No usa `log.Fatal` fuera de `main`.

## Concurrencia

- No hay goroutines sin cancelacion.
- No hay channels innecesarios.
- No hay riesgo obvio de leak.
- `context.Context` se usa en I/O, red o procesos largos.
- Tests no dependen de sleeps fragiles.

## Tests

- Tests table-driven cuando hay logica con casos.
- Hay caso de error si el error importa.
- Fixtures en `testdata/` si hay archivos externos.
- Tests deterministas.
- No se debilitaron tests existentes.

## Dependencias

- No hay dependencia nueva sin aprobacion.
- Si hay dependencia, esta justificada.
- Standard library preferida cuando basta.

## Integracion con el repo

- Paquete correcto.
- No se movio logica core a UI.
- No se cambiaron contratos JSON/config sin documentar.
- `go test ./...` ejecutado o fallo explicado.
