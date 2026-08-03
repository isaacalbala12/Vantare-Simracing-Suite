# ENG-14 — PTT por teclado, gamepad y volante/button box

## Estado y límite

- Issue: ISA-185 / ENG-14.
- Contrato: `engineer.ptt.v1`.
- Base exacta: `ba04846f8ac38fc4fa0110a51dd1bffd63ca8943`
  (ISA-183 / ENG-12 aceptada).
- Rama: `vantareapp/isa-185-eng-14-ptt-teclado-volante-gamepad-y-hid`.
- Este corte implementa adquisición del botón PTT, estado, cancelación y el
  puerto hacia un futuro host de voz.
- No abre micrófono, no ejecuta STT, no guarda audio o transcripciones, no
  habilita wake word y no ejecuta acciones del Engineer.
- La UI, persistencia de Ajustes y wiring productivo pertenecen a ENG-24. El
  voice-host productivo permanece bloqueado por ENG-13/20.

## Contrato

Un `Binding` identifica un control físico mediante:

- `device_kind`: `keyboard`, `gamepad` o `hid`.
- `device_id`: identificador opaco, normalizado y acotado.
- `control`: nombre canónico del botón o tecla.
- `scope`: `global` o `local`.

Los IDs no admiten rutas, separadores, espacios, caracteres de control ni
tokens de más de 64 bytes. Los conflictos se calculan por control físico; dos
funciones no pueden apropiarse del mismo botón aunque una sea local y otra
global. La configuración y el editor de conflictos usarán este contrato, no
una segunda representación.

## Adaptadores Windows reales

| Categoría | Ruta | Identificadores | Estado ENG-14 |
|---|---|---|---|
| Teclado | Win32 `GetAsyncKeyState` | `keyboard-0` | Disponible; observa down/up sin registrar el teclado completo |
| Gamepad | XInput | `xinput-0` a `xinput-3` | Disponible; botones, hombros, d-pad y triggers |
| Volante/button box/HID compatible | WinMM `joyGetPosEx` | `joy-0` a `joy-15`, `button-1` a `button-32` | Disponible con limitación explícita a dispositivos joystick-compatible |
| Raw HID genérico | Ninguna | cualquier ID fuera de `joy-N` | No soportado; capability `unsupported`, nunca se simula |

No se añadió ninguna dependencia. Las tres rutas utilizan APIs incluidas en
Windows. El scope local compara la ventana activa con el HWND entregado por el
composition root; si no existe HWND, falla cerrado y no inicia captura.

## Estados observables

`disabled -> listening -> capturing -> processing -> listening`

También son observables `cancelled` y `error`, con razones tipadas:

- permiso denegado o función desactivada;
- dispositivo ausente o retirado;
- pérdida de foco local;
- cancelación del usuario o cambio de configuración;
- error del puerto, reader o input;
- shutdown.

Solo un capture ID puede poseer el puerto. Press duplicado, release duplicado,
eventos concurrentes y eventos de otro binding no crean un segundo owner. La
retirada, pérdida de foco, revocación y shutdown cancelan inmediatamente. La
reconexión devuelve el estado a `listening` sin iniciar una captura fantasma.
La cancelación también alcanza el estado `processing` posterior al release. Si
el puerto no confirma la cancelación, el controller conserva el capture ID,
muestra `port_error` y permite reintentar el shutdown; nunca finge que liberó
un recurso que puede seguir activo.

`CapturePort` es deliberadamente pequeño: `Begin`, `Finish` y `Cancel`. La
implementación futura debe mantener esas operaciones acotadas y no reentrantes;
ningún trabajo de inferencia puede ejecutarse dentro del lock del controlador.

## Polling y lifecycle

- Intervalo predeterminado: 8 ms.
- `Poller.Run(ctx)` no esconde goroutines: el dueño decide dónde arrancarlo y
  su cancelación termina el loop, libera el ticker y envía `InputCancel` con un
  contexto separado limitado a un segundo.
- El poller es responsable de solicitar esa liberación al terminar. El
  controller es responsable del ownership del `CapturePort`; si la liberación
  falla, conserva el capture ID y `Run` devuelve el error. El composition root
  debe entonces llamar `Controller.Shutdown` y reportar el fallo, no abandonar
  el puerto ni fingir un cierre limpio.
- Solo se permite un `Run` simultáneo.
- Las transiciones se deduplican; no se emite un stream de `pressed` repetidos.
- Una muestra solo se confirma después de aplicar todas sus transiciones. Si el
  handler falla, `release`, pérdida de foco, desconexión y error de dispositivo
  se reintentan con la siguiente lectura equivalente; no pueden perderse por
  avanzar el estado del poller antes de tiempo.
- Desconexión, error y reconexión son distintos y observables.
- Cancelar el contexto no se convierte en un falso error de dispositivo.
- Spotter, ingesta, scheduler y salida visual no dependen de este loop.

## Validación reproducible

Prueba focal:

```powershell
go test -count=20 ./internal/engineer/ptt
go test -run '^$' -bench BenchmarkControllerCaptureCycle -benchmem ./internal/engineer/ptt
```

La suite focal ejecuta 10.000 ciclos de captura por test, 1.000 arranques y
paradas unidos del poller, carreras de eventos duplicados y regresiones de
cancelación antes y después del release. También inyecta un fallo único del
handler y demuestra retry de release, disconnect y device-error hasta liberar
el ownership. También prueba cancelación de `Run` durante capturing y processing,
incluido fallo visible y retry externo. `go test -count=20` y `go vet` pasan.
La suite global alcanza y valida el paquete PTT, pero no termina limpia en este
entorno por tests ajenos al corte: discovery real de Launcher excede 30 s y un
budget temporal de Telemetry Core falla bajo carga. Ninguna ruta implicada fue
modificada por ENG-14.

Probe sin micrófono ni STT:

```powershell
go run ./tools/ptt-input-probe -kind keyboard -device keyboard-0 -control f24 -duration 2s
go run ./tools/ptt-input-probe -kind gamepad -device xinput-0 -control a -duration 2s
go run ./tools/ptt-input-probe -kind hid -device joy-0 -control button-1 -duration 2s
```

Para validar un botón real, se ejecuta el probe correspondiente y se mantiene
el botón: debe existir exactamente una transición a `pressed=true` y otra a
`pressed=false`. Desconectar el dispositivo debe producir `connected=false`.
El resultado de este worktree queda registrado en
`docs/evidence/isa-185/windows-input-probe.json`.

La evidencia automática no contiene una pulsación física. Solo demuestra que
Win32 y WinMM responden en este equipo, que XInput/joy ausentes se declaran como
ausentes y que no se inventa conectividad. La pulsación y desconexión de
hardware representativo forman parte del gate posterior ENG-29.

## Trabajo posterior

1. ENG-20 conecta `CapturePort` al host STT únicamente después del gate humano.
2. ENG-24 representa estado, permisos, conflictos y selección de dispositivo.
3. ENG-29 valida hardware representativo, cuatro idiomas y packaging.
4. Raw HID genérico necesita una decisión separada solo si existe hardware real
   que no aparezca mediante XInput o WinMM. ENG-14 no añade esa complejidad sin
   evidencia.
