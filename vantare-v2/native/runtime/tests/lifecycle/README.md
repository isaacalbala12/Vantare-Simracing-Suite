# Caracterización de arranque y cierre — #1860 / VANTA-128

Base: `668d99c32`. Paso 0: pruebas y entrada QA que no se compila en producto.
`build-overlays.ps1` prepara el binario normal y una variante `parity-capture`
en `target/debug/lifecycle/{normal,qa}`, conservando sus SHA-256. Se llama desde
el gate lifecycle, dentro del turno de `compilar.ps1`.

`characterization.rs` usa el binario normal en layout vacío guardado y
`--start-hidden` para arranque, cierre, caída y Job. La variante QA se usa solo
para invocar directamente los manejadores de Abrir Hub/Salir de `tray.rs` por
un mensaje dirigido al HWND del hijo propio. Usa el mismo GPUI y el canal de
acciones real, sin abrir menús ni inyectar teclado/ratón. Otra fila prueba que
el binario normal ignora esa entrada. No hay dependencia nueva ni stdin falso.

Decisión del orquestador: los efectos de los manejadores son automáticos;
el clic físico queda **manual y pendiente de Isaac**. Los intentos por teclado
posteado no fueron fiables y se conservan en los logs de evidencia, no en el
gate. Se necesita escritorio Windows con Explorer y ningún Hub ajeno abierto:
el manejador de producto busca el título global y puede restaurar su ventana.

El núcleo sintético existente publica fotos/derechos por pipes reales y se
copia como imagen hermana para conservar la comprobación de identidad de UI.
El Hub falso simula los códigos/marcadores actuales; no guarda cuenta ni lanza
Register. `beta-session.ps1` ejecuta el cuerpo **original** de `Run-BetaHub`,
extraído por AST, sustituyendo únicamente arranque/confirmación y operaciones
de instalación, registro o red. Stop llega al supervisor real por su evento.
No se reproduce la condición que decide parar en un segundo decisor de test.

| Fila actual | Evidencia de test | Cambio previsto |
| --- | --- | --- |
| Stop del supervisor: EOF + WM_CLOSE no terminan overlays; kill a 3 s y exit 0 | `real_overlays_stop_records_the_current_three_second_kill` | Paso 1: EOF, gancho de salida, exit 0 sin kill; kill es fallo |
| X Hub beta en Waiting/Paused/Stale/Lost escribe idle y para overlays con kill | `real_overlays_hub_idle_live_and_paused_characterization` ejecuta `Run-BetaHub`; los tests de `hub::lifecycle` fijan también Paused | Paso 1 solo retira kill; paso 4 conserva sesión durante pausa |
| Primera foto Live no cierra; flanco no-Live→Live cierra Hub; marcador live conserva overlays | Tests de `hub::lifecycle` en su crate y matriz de procesos con Hub falso | Paso 4: decide sesión con política del núcleo |
| X Hub de bandeja no para overlays; restart-request queda sin consumidor | `real_overlays_tray_hub_is_unowned_and_restart_is_unconsumed`; manejador Abrir Hub y X del Hub falso en `real_overlays_tray_open_and_quit_leave_the_hub_alive` | Paso 4: un dueño para ambos caminos |
| El siguiente arranque beta borra restart-request antiguo | Matriz Hub, antes de cerrar cada caso | Paso 4 retira ese canal |
| Cerrar ventana de bandeja retira icono sin `cx.quit()` | `real_overlays_tray_close_does_not_quit_gpui` | Paso 1 atiende EOF; retirada de WM_CLOSE masivo en paso 2 |
| Abrir Hub del menú crea Hub fuera del Job; abrir otra vez lo enfoca sin duplicarlo | `real_overlays_tray_open_and_quit_leave_the_hub_alive` | Paso 4: Hub hijo de sesión |
| Manejador «Salir» real sale con 0, cierra núcleo y deja el Hub vivo | Misma prueba, invocación QA al mismo manejador que usa el menú | Paso 4: se recoge también Hub |
| Binario normal ignora las entradas QA de Abrir/Salir | `normal_overlays_ignore_the_qa_handler_entry` | Se conserva |
| Clic físico de Abrir Hub/Salir | Manual `manual-tray`, pendiente de Isaac; no cubierto por el gate automático | Se verifica aparte |
| Caída overlays: reinicios separados de 250/500 ms; núcleo no reinicia | `real_overlays_restart_backoff_and_single_instance` | Se conserva |
| Matar supervisor recoge también el overlays real por su Job | `real_overlays_die_with_the_supervisor_job` | Se conserva |
| Segundo supervisor con/sin Hub no arranca hijos; segundo beta falla por lock, no enfoca Hub | Reinicio/instancia real y matriz Hub con lock original | Paso 4: enfocar/abrir a través de sesión |
| Caída núcleo cambia época; presupuesto agotado; colgado; Job; orden Engineer→overlays→núcleo | Escenarios anteriores de `lifecycle.rs` (hijos sintéticos explícitos) | Paso 1 cambia exit de cierre forzado; paso 2 reúne presupuesto |
| Heartbeat avanza sin fotos; kill no publica estado de cierre y caduca en frontera exacta | `engineer/tests/status_process.rs`: kill+wait, dos lecturas posteriores | #1852: no exigir igualdad a una lectura anterior al kill |

Esta tabla es la fixture previa a `session::paso()`: todavía no existe esa
máquina de estados. Las pruebas no acreditan guardar documentos en el Hub
real, física del simulador ni una instalación/actualización real. Los eventos
Live/Paused son datos sintéticos. Las esperas observan PID+fecha de creación,
ventanas, pipes, marcadores y salida; los plazos solo acotan fallos. Las cotas
inferiores 250/500 ms verifican el backoff real, sin imponer presupuesto de CPU.

Los riesgos de diseño ajenos a estos pasos siguen pendientes: acuse de arranque
10/45 s y diagnóstico/residente fuera del futuro presupuesto único; casilla de
inicio por perfil inactiva en beta; guarda de Apply que incluye la propia
imagen. No se presentan como escenarios de instalación ejecutados aquí.

Para la prueba manual, desde `vantare-v2/` y con la instalación real cerrada:

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File native/runtime/tests/lifecycle/build-overlays.ps1 -TargetDirectory D:/VantareServer/targets/isa-1860
git rev-parse HEAD
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo test --manifest-path native/Cargo.toml --target-dir D:/VantareServer/targets/isa-1860 --offline --locked -j 2 -p vantare-runtime --test lifecycle -- manual-tray
```

1. Conservar el HEAD y `debug/lifecycle/artifacts.json` junto al log de consola.
2. La consola identifica los PID y la raíz temporal del ensayo. En su icono,
   hacer clic físico en Abrir Hub y pulsar Intro en la consola. El Hub es falso:
   su ventana nace oculta y sin contenido; el arnés confirma su PID.
3. En el mismo icono, hacer clic físico en Salir y pulsar Intro. El arnés verifica
   salida 0 del supervisor y overlays, Hub falso vivo (comportamiento actual),
   recoge ese Hub propio y emite `MANUAL PASS` solo si todo coincide.
4. Para cancelar en la consola, EOF (Ctrl+Z y Intro): devuelve fallo y recoge
   los procesos propios. No reabrir la instalación real desde este ensayo.

Estado inicial de evidencia: **pendiente de ejecución manual**, sin captura
ni afirmación de clic físico realizado. No ejecutar `manual-tray` en CI.
