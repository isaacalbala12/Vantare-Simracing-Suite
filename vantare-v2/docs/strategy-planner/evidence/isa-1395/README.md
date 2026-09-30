# ISA-1395 · indisponibilidad temporal exacta de pilotos

## Contrato local

`DriverLimit.unavailableTime` contiene intervalos semiabiertos
`[fromSeconds,toSeconds)` de segundos desde el inicio de carrera. El reloj
incluye formación, vueltas, clima, peso de combustible, ahorro y paradas. Un
stint se rechaza si su intervalo de conducción se solapa con la ventana; la
parada en sí puede ocuparla. El modelo por vueltas permanece intacto.

La disponibilidad legacy en minutos del día no se interpreta como tiempo
relativo, ni se convierte mediante ritmo medio. Su origen, zona horaria y fecha
de salida necesitan un contrato aparte antes de conectarla al cálculo. La mesa
recorded todavía no edita `unavailableTime`: el soporte actual es del solver.

## Reproducción y checks

- RED inicial: el test no compilaba porque faltaban el campo y tipo temporal.
- GREEN: dos pilotos con ritmos de 60 y 120 s/vuelta y ventana del rápido
  `[60,200)` producen tres stints rápido-lento-rápido, 260 s con dos paradas.
- La frontera exacta a 200 s es válida; replay coincide con solve. Un stint
  solapado da `driver_unavailable_time` y no se presenta como factible.
- Formación de 5 s y carrera temporal de 250 s dan 3 vueltas y 265 s;
  ventana `[65,205)` y parada se evalúan con el mismo reloj.
- Se rechazan límites negativos, vacíos, invertidos, NaN e infinitos.
- `go test ./internal/strategy/solver -count=1` y `go test ./...` PASS.
- `pnpm --dir frontend build` PASS para proporcionar el `frontend/dist`
  embebido por Go; no se cambió TypeScript/React.
- 44 tests del roadmap PASS; digest regenerado desde `origin/nightly`.
- `git diff --check` PASS.

## Pendiente

Transporte/edición visual, horario legacy con referencia temporal definida,
Wails E01–E08, aceptación humana y calibración empírica T19–T21. No hay prueba
física LMU asociada a este cambio de solver.
