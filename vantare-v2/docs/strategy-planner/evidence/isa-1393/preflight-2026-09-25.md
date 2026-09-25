# T22 / ISA-1393 — preflight sin ventana nativa

Base de trabajo: `vantareapp/isa-1393-strategy-native-validation`, creada desde
`45ab9a71` (#1375). Este documento no es evidencia E2E: no se lanzó Wails, no
se abrió LMU ni se leyó un DuckDB. El uso vigente del PC reserva la GUI para
Isaac; las comprobaciones siguientes fueron de sólo lectura.

## Estado verificable

- La CLI `wails3 version` informa `v3.0.0-alpha.98`.
- Hay procesos `msedgewebview2.exe` de runtime
  `C:/Program Files (x86)/Microsoft/EdgeWebView/Application/153.0.4234.48`.
  No se cerraron ni se atribuyeron a Strategy.
- La última build local comprobada de #1375, anterior al aviso de espera de
  `45ab9a71`, está en `C:/tmp/vantare-isa1375/vantare-v2/bin/vantare.exe`:
  43.971.072 bytes, SHA-256
  `406ef6ff1de3480d3b50dcc67627d60111a92c2e1c97ffb3d260b2d3d47fdc3f`,
  sin firma Authenticode. Que exista y compile no prueba su arranque.
- La rama #1393 se compiló después con `pnpm install --frozen-lockfile`,
  `pnpm --dir frontend build` y `CGO_ENABLED=0 wails3 build DEV=true`, todos
  PASS. El nuevo `bin/vantare.exe` mide 43.972.608 bytes y tiene SHA-256
  `9faef4111ee4b3f9e971bcba3598ef55bf92bdd9adc57cc0c96f479c1b46bf6f`.
  El build invocó `-X main.buildChannel=master` por el valor por defecto del
  Taskfile; este binario local no acredita el canal ni la licencia de
  distribución. No se ejecutó. `go mod tidy` reordenó una dependencia en
  `go.mod`; se retiró sólo ese cambio generado, dejando el worktree limpio.
- El antecedente T11i reprodujo `CreateCoreWebView2Controller` / `8007139F
  ERROR_INVALID_STATE` tres veces en otro worktree. Posteriormente #1314 y
  #1322 sí abrieron ventanas nativas con otras builds. Por ello la causa del
  error histórico sigue indeterminada y **no** se extrapola al binario actual.

## Matriz pendiente

| Escenario | Prueba nativa requerida | Estado |
| --- | --- | --- |
| E01 Manual | Calcular, aceptar y reabrir con procedencia manual | Pendiente |
| E02 Telemetría | Sesión LMU real, evento, reglas, pilotos, stint y parada | Pendiente; resistencia larga depende de #1375 |
| E03 Revisiones | Fijar A, editar B, reabrir A sin rebasing silencioso | Pendiente |
| E04 Fuente | Copia verificada, original ausente, WAL, permisos y corrupción | Pendiente; depende de #1373 |
| E05 Interrupción | Cancelar cada operación, cerrar/reiniciar y resolver guardado incierto | Pendiente |
| E06 Datos imperfectos | Casos anotados con evidencia independiente y desconocidos visibles | Pendiente; no sustituir T19–T21 |
| E07 Recursos | Vueltas/tiempo, Fuel/VE, neumáticos, ventanas y servicios | Pendiente |
| E08 Volumen | Biblioteca real, cuatro sesiones, quinta rechazada, coste/memoria | Pendiente |

La primera ejecución nativa de esta rama debe registrar este binario/SHA,
configuración saneada, runtime, PID propio, log y resultado de apertura antes
de recorrer E01–E08. Si reaparece `8007139F`, comparar con una build que sí
abre sin cerrar procesos ajenos; no cambiar varios factores a la vez ni
atribuir el fallo a WebView2 o Strategy por intuición. Mantener hashes de
originales antes/después, y separar cada FAIL de un escenario todavía no
ejecutado. Las medidas de tiempo/memoria comparativas exigen tres ejecuciones.
