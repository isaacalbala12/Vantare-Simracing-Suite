# T22 / ISA-1393 — preflight sin ventana nativa

> Este preflight precede a la integración local descrita al final. Su primer
> binario quedó sustituido; ninguna de las dos builds se ejecutó en una ventana.

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

La primera ejecución nativa de esta rama debe registrar el binario integrado
indicado al final y su SHA,
configuración saneada, runtime, PID propio, log y resultado de apertura antes
de recorrer E01–E08. Si reaparece `8007139F`, comparar con una build que sí
abre sin cerrar procesos ajenos; no cambiar varios factores a la vez ni
atribuir el fallo a WebView2 o Strategy por intuición. Mantener hashes de
originales antes/después, y separar cada FAIL de un escenario todavía no
ejecutado. Las medidas de tiempo/memoria comparativas exigen tres ejecuciones.

## Integración local posterior, aún sin ventana (2026-09-25)

En la rama aislada #1393 se integraron localmente #1331 (flujo visual), #1367
(cota certificada Hypercar), #1373 (copia verificada y recuperación) y #1375
(proyección paginada y espera visible). HEAD de código: `0786b3f4`. Es una
composición para T22: no equivale a integrar esas ramas en `nightly`.

- `go test ./...`: PASS. Frontend: 493 archivos, 4.317 tests PASS y 2 omitidos;
  typecheck, lint, auditoría i18n y build PASS.
- Contrato del roadmap: 23 tests de digest y 21 de validación PASS; el JSON
  derivado se regeneró desde el plan fusionado.
- Banco LMU Algarve → Monza: PASS en 205,08 s. Ritmo 95,190 s (58 vueltas),
  combustible 2,135 L/vuelta (58 vueltas), VE no aplicable a LMP2; cálculo de
  referencia de 38 vueltas, 0 paradas y optimalidad probada **para el evento
  supuesto del test**. Resumen/validez/derivación paginados coinciden con la
  ruta materializada, y revisión, restauración y reapertura pasan. SHA-256
  originales intactos: `6b912640e5b68da087fbe86ce70401101edbdc89cb89cb93df30c9ef396d9362`
  y `08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538`.
- Banco LMU Monza S026 → Imola: PASS en 186,05 s. Ritmo 97,559 s, combustible
  2,876 L y VE 3,328 puntos por vuelta (53 vueltas); referencia de 37 vueltas,
  1 parada y optimalidad probada **para el evento supuesto del test**. Pasan
  paridad paginada, revisiones, clasificación, identidad, familias, restauración
  y reapertura. SHA-256 originales intactos:
  `08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538`
  y `35438326ecddd6ab660ed3aad70b076a73e3290236c0292f30657594c38c1eb0`.
- Banco de copia verificada COTA: PASS en 4,65 s. Copia temporal, desaparición
  del original temporal, recuperación y proyección de una revisión guardada
  tras reiniciar el servicio; original real intacto, SHA-256
  `7da31387f851721bf9d32e92849c7dc22c93da43668044ecac57138f0ec2024e`.
- Build Wails DEV integrada PASS sin ejecutar la app: `bin/vantare.exe`,
  44.075.520 bytes, SHA-256
  `47db264ec9f6109edb8a977b05f0f2216c3863874f2a825b6ca8f179c7d6536b`.
  La tarea usó el canal compilado por defecto `master`, que no acredita una
  licencia ni distribución. `go mod tidy` sólo reordenó `go.mod`; se retiró
  ese cambio generado. El hash anterior de este documento está superado.

E01–E08 siguen **pendientes de recorrido Wails real**. Los bancos de Go no
demuestran interacción, diseño, licencia ni recuperación en WebView2. Sigue
faltando una grabación larga independiente con muchas vueltas para la cuota de
#1375, y un holdout de carreras anotadas para la calibración empírica #1030.
Los 367 archivos del corpus #1030 están asignados al split existente; no se
deben reutilizar como evaluación independiente. No se abrió LMU, no se alteraron
originales y no hubo push, PR, CI, promoción ni release.

## Recorrido separado en navegador simulado

La primera carga del harness visual falló antes de pintar Strategy: el módulo
simulado de Wails no exportaba `Dialogs`, que ahora importa la selección nativa
de archivos. Se añadió al **mock** una respuesta de cancelación sin ruta; no
se modificó el diálogo productivo. Tras el arreglo, el navegador mostró la
[entrada de tres columnas](browser-entry-mock.png) y permitió: abrir un borrador,
buscar y abrir una sesión simulada, aplicarla, calcular un plan simulado y abrir
la edición de paradas. Los 17 tests focales, typecheck, lint y build frontend
pasaron. La build Wails DEV actualizada pasó sin abrir ventana: 44.075.520
bytes, SHA-256
`433108f4731837374f802a218d9da75f83e61fcea3c7269eada039b45d59984e`.
El hash anterior quedó sustituido por este cambio de frontend.

La repetición de la suite frontend completa tras este arreglo terminó con
4.314 PASS, 2 omitidos y 3 timeouts de 20 s en pruebas de geometría de
Overlays ajenas a Strategy. Esas tres pruebas, repetidas juntas y aisladas de
la suite completa, dieron 10/10 PASS en 5,88 s. La corrida completa **no** se
marca verde; el resultado apunta a contención durante esa ejecución, sin
demostrar una causa definitiva ni modificar tiempos límite de los tests.

El script heredado `recorded-strategy-visual.mjs` aún falla tras la primera
captura: busca `.strategy-recorded-frame__footer button`, que ya no existe en
la entrada v5. Su ejecución no se declara PASS; hay que adaptar el recorrido
automatizado a la navegación actual antes de usarlo como gate visual. En el
editor simulado de Imola GP aparece «Mapa no disponible para esta variante»;
queda por contrastar la geometría real y su identidad en E02. Ninguna captura
ni cálculo de este apartado procede de Wails o de un DuckDB real.

Contraste estático posterior: el harness nombra el trazado `Imola` / `GP`,
mientras que el catálogo geométrico sólo certifica
`Autodromo Enzo e Dino Ferrari` y el fixture saneado de la importación LMU
utiliza ese nombre completo en `trackName` y `trackLayout`. El selector exige
coincidencia exacta de ambas identidades; por eso oculta correctamente el
mapa del harness. La ausencia de mapa **no demuestra** que falte la geometría
para la sesión LMU real. Falta verificar en E02 la identidad que entregue la
sesión nativa y el contorno mostrado, sin añadir aliases por intuición.

## Regresión manual detectada en el navegador simulado

El recorrido manual completo descubrió un bloqueo al pulsar «Aceptar
propuesta»: `parsePlanDraftV1` rechazaba `capabilities` porque el borrador
manual enviaba `manual_inputs` antes de `fuel_strategy`. Se reprodujo primero
en el test de aceptación aplicando el parser del contrato al comando `create`:
falló con `invalid_document (capabilities): must be sorted and unique`. Se
ordenaron las tres capacidades, sin cambiar el contrato ni el backend, y el
test focal pasó (2/2).

Con el mismo harness, la secuencia manual LMU → Ford Mustang GT3 → Imola GP →
referencias manuales → carrera de 60 min → piloto → mesa → condición seca →
cálculo → aceptación mostró «Propuesta aceptada como revisión inmutable».
El plan de 69 vueltas y 2:02:38 procede del solver simulado del harness; **no**
valida la duración ni la optimalidad del motor real. El guardado nativo E01
sigue pendiente.

Los 58 archivos de tests de Strategy pasaron (667 tests); typecheck, lint,
build frontend y build Wails DEV pasaron. Dos intentos de suite frontend
global no terminaron de forma válida: el primero salió con error y el segundo
se interrumpió después de un `AbortError` de `happy-dom`, también con cuatro
workers; ninguno se declara verde. El binario integrado actualizado no se
ejecutó: 44.075.520 bytes, SHA-256
`f1cb254326b7f639db8ded90f6c3464b7f1025a215d19a19e24041982a2a7c9a`.
La build volvió a reordenar `go.mod`; sólo se retiró ese cambio generado.

Una última repetición de la suite frontend completa, en ejecución secuencial
(`vitest run --no-file-parallelism`), terminó con **493 archivos PASS, 4.317
tests PASS y 2 omitidos** en 541,60 s. Esto cierra el gate de frontend del HEAD
`b8d4e5d2` sin atribuir una causa definitiva a los timeouts de las corridas
paralelas. La ejecución usa mocks y no sustituye E01–E08 en Wails/LMU real.
