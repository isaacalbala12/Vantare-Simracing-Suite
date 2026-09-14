# ISA-1248 — cancelación distinta de timeout

## Resultado

`CalculateOrbit` publica `calculation_cancelled` cuando el contexto se cancela y
conserva `calculation_timeout` únicamente para un deadline agotado. Ambos errores
mantienen su causa mediante `errors.Is` y no publican un plan.

El bridge reconoce el código nuevo, emite un mensaje público saneado y conserva
`commandId` y `field`. El cliente TypeScript lo valida y lo entrega como
`StrategyApplicationError` de la petición correspondiente.

## Evidencia

- RED: un contexto cancelado devolvía `calculation_timeout`.
- GREEN focal: cancelación y deadline application, tabla del bridge y 61 pruebas
  del cliente pasan.
- Frontend completo: 448 archivos y 3821 pruebas; typecheck, lint, auditoría i18n
  y build pasan. El build conserva sólo el aviso heredado de chunks grandes.
- La primera suite Go completa, ejecutada a la vez que vet, hizo que Imola agotase
  sus 8 s. Imola aislado pasó en 5,13 s y `go test ./...` repetido sin competencia
  pasó completo. El vet focal de application/app también pasa.
- Los 21 tests del contrato de roadmap pasan; digest estable y diff-check limpio.
- La revisión de Astra recomendó reutilizar el catálogo y la correlación actuales,
  sin crear envelope, manager ni máquina de estados; la revisión final no
  encuentra P0-P2 ni una simplificación adicional.

## Límites

No cambia `client.cancel()`: sigue cancelando la espera local sin prometer que el
backend se detuvo. T03 aún debe cerrar readiness, obsolescencia y resultados
parciales. No se abrió app/Wails/LMU ni se tocaron DuckDB.
