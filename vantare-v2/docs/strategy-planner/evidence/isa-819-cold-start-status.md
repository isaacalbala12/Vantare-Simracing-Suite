# ISA-819 — Recuperación de importación y estado visible, corte 2

Base local `034cf537`, misma rama/worktree de #819. Isaac autorizó continuar.
El primer corte permanece separado en su commit y evidencia. No hay promoción.

## Alcance

- Cold-start guarda backup de su primera decisión y de la generación anterior
  en actualizaciones. Conserva el primary dañado antes de restaurar una copia
  validada; ambos ausentes representan estado nuevo, corrupción no.
- Un rechazo previo se recupera sin iniciar lectura/importación de DuckDB.
- El estado devuelve causa cerrada (`catalog_unavailable`, `state_unavailable`,
  `importer_unavailable`) y una indicación independiente de recuperación.
- La composición de arranque siempre entrega un servicio de estado, incluso si
  no puede abrir el catálogo; deja de omitir silenciosamente ese recorrido.
  Se extrajo a una función acotada para probarlo sin arrancar la aplicación.
- El cliente rechaza ausencia de status como fallo de consulta. El banner muestra
  causa y recuperación, no ofrece importar con fuentes indisponibles y permite
  consultar de nuevo un estado de importación reparado. Traducciones ES/EN/PT/IT.

El catálogo inaccesible y el lector no disponible requieren reiniciar tras
repararlos: sus dependencias se construyen en arranque. El estado cold-start se
lee de nuevo en cada consulta y su error no queda memorizado. El catálogo lógico
puede seguir vacío internamente si no se abrió, pero la interfaz recibe la causa.

## Evidencia de pruebas

- RED: archivo de estado truncado devolvía error genérico; primary ausente
  convertía un rechazo guardado en pendiente. Reproducción anterior al fix.
- Pruebas de recuperación preservan decisión y bytes dañados; corrupción sin
  copia impide mutación; reparar el estado permite consultar con la misma instancia.
- Pruebas del arranque comprueban catálogo corrupto, recuperación y lector
  ausente sin abrir LMU ni cargar runtime externo.
- Pruebas del banner cubren tres causas sin botón de importación y aviso de
  recuperación incluso después de rechazo, con cierre del aviso sin importar.
- `go test ./internal/strategy/coldstart ./cmd/vantare -count=1`: PASS.
- `go test ./...`: PASS, exit 0 (incluye resultados cacheados de paquetes ajenos).
- Frontend typecheck, lint y build: PASS. Build conserva advertencia de chunks
  mayores de 500 kB; no se cambian configuración ni límites.
- Primera suite frontend: 3237 PASS, tres timeouts de 20 s en dos tests de
  geometría Pedals/Standings. Reejecución aislada junto con banner/cliente:
  32/32 PASS sin cambios en límites. La primera ejecución no se declara verde.
- Reejecución completa `pnpm --dir frontend exec vitest run --maxWorkers=2`: 415
  archivos y 3240 tests PASS, exit 0, 356.31 s. Sin cambiar timeouts. Apareció
  un AbortError en teardown de Happy DOM; el resumen final y exit 0 confirman PASS.
- `gofmt`, revisión del diff y `git diff --check`: PASS.

## Archivos del corte

- Go: `internal/strategy/coldstart/service.go` y su test; `cmd/vantare/main.go`;
  nuevos `cmd/vantare/strategy_telemetry.go` y `strategy_telemetry_test.go`.
- Frontend: `StrategyColdStartBanner.tsx` y su test, `strategy-cold-start.ts`;
  `strategy-application-client.ts` y su test; cuatro locales `strategy-orbit`.
- Documentación: este informe, handoff único Strategy, `plan.md` y digest generado.

## Límites y siguiente verificación

Son pruebas de contrato/DOM y archivos temporales, no una prueba visual Wails ni
un corte físico de alimentación. No se modifica ningún catálogo real de Isaac.
No cambia el deadline de importación (#821), el solver ni la selección empírica.

Una recuperación puede retroceder una generación de cualquiera de los dos
archivos. Este corte informa de ello, pero no reconcilia automáticamente el
progreso de cold-start con las sesiones perdidas del catálogo: no inventa una
transacción entre ambos ni inicia reimportación sin decisión del usuario.
Esa reconciliación y la comprobación Wails quedan pendientes antes de cerrar #819.

Verificación segura: ejecutar los tests de `internal/strategy/coldstart`,
`cmd/vantare/strategy_telemetry_test.go` y `StrategyColdStartBanner.test.tsx`.
Para Wails usar un perfil de prueba separado con copias desechables, comprobar
los tres mensajes y la recuperación; nunca dañar el perfil real para probarlo.
