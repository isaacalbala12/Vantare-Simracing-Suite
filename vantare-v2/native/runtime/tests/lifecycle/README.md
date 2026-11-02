# Caracterización de arranque y cierre — #1860 / VANTA-128

Base caracterizada: `668d99c32`. El [paso 0, PR #1863](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1863)
fijó el kill de overlays a 3 s con exit 0 y añadió la entrada QA que no se compila
en producto. El paso 1 actualiza sólo el cierre: EOF, gancho GPUI, exit 0 sin kill;
un cierre forzado pasa a ser fallo. El paso 2 comparte una máquina pura y un
único plazo para hijos y workers.
Los demás casos se conservan.
Una salida no cero tras pedir cierre se registra y no falla la sesión. La
revocación de Engineer tampoco termina la sesión, incluso si hay que matarlo;
el fallo sólo se propaga en el cierre final. Windows y Unix comparten esta
política y conservan el motivo original de supervisión antes del error de cierre.
`build-overlays.ps1` prepara el binario normal y una variante `parity-capture`
en `target/debug/lifecycle/{normal,qa}`, conservando sus SHA-256. Se llama desde
el gate lifecycle, dentro del turno de `compilar.ps1`.

`characterization.rs` usa el binario normal en layout vacío guardado y
`--start-hidden` para arranque, cierre, caída y Job. La variante QA se usa solo
para invocar directamente los manejadores de Abrir Hub/Salir de `tray.rs` por
un mensaje dirigido al HWND del hijo propio. Usa el mismo GPUI y el canal de
acciones real, sin abrir menús ni inyectar teclado/ratón. Otra fila prueba que
el binario normal ignora esa entrada. No hay dependencia nueva ni stdin falso.

La aserción de `on_app_quit` depende del diagnóstico a **stderr**
`vantare-overlays: on_app_quit completado`, emitido después de `usage.finish()`.
No acredita la persistencia ni la entrega remota de analítica. Se conserva ese
diagnóstico porque el envío depende del consentimiento y del canal de derechos;
exigirlo aquí ampliaría la prueba de cierre a servicios ajenos al escenario.

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
| Stop del supervisor: sólo EOF a overlays, gancho una vez y exit 0 sin kill, tres ciclos con layout guardado | `real_overlays_stop_exits_cleanly_on_eof_before_deadline` | Pasos 1 y 2 implementados; presupuesto único de toda la sesión |
| X Hub beta en Waiting/Paused/Stale/Lost escribe idle y para overlays limpiamente | `real_overlays_hub_idle_live_and_paused_characterization` ejecuta `Run-BetaHub`; los tests de `hub::lifecycle` fijan también Paused | Paso 1 retira kill; paso 4 conservará sesión durante pausa |
| Primera foto Live no cierra; flanco no-Live→Live cierra Hub; marcador live conserva overlays | Tests de `hub::lifecycle` en su crate y matriz de procesos con Hub falso | Paso 4: decide sesión con política del núcleo |
| X Hub de bandeja no para overlays; restart-request queda sin consumidor | `real_overlays_tray_hub_is_unowned_and_restart_is_unconsumed`; manejador Abrir Hub y X del Hub falso en `real_overlays_tray_open_and_quit_leave_the_hub_alive` | Paso 4: un dueño para ambos caminos |
| El siguiente arranque beta borra restart-request antiguo | Matriz Hub, antes de cerrar cada caso | Paso 4 retira ese canal |
| Reiniciar el Hub beta con marcador live consume restart-request, abre otro Hub y llama Apply sin parar overlays | `beta_restart_live_reopens_hub_without_stopping_real_overlays`, bucle original; Apply es inerte | Paso 4: cierre y Apply con dueño único |
| Caer el Hub beta antes de escribir hub-exit conserva overlays y el bucle beta sale con 0 | `crashed_beta_hub_without_marker_leaves_real_overlays_running` | Paso 4: política explícita de fallo del Hub |
| Cerrar ventana de bandeja retira icono sin `cx.quit()`; EOF posterior sale limpiamente aun sin ese HWND | `real_overlays_tray_close_does_not_quit_gpui` | Pasos 1 y 2 implementados; sin WM_CLOSE a ningún hijo |
| Abrir Hub del menú crea Hub fuera del Job; abrir otra vez lo enfoca sin duplicarlo | `real_overlays_tray_open_and_quit_leave_the_hub_alive` | Paso 4: Hub hijo de sesión |
| Manejador «Salir» real sale con 0, cierra núcleo y deja el Hub vivo | Misma prueba, invocación QA al mismo manejador que usa el menú | Paso 4: se recoge también Hub |
| Binario normal ignora las entradas QA de Abrir/Salir | `normal_overlays_ignore_the_qa_handler_entry` | Se conserva |
| Clic físico de Abrir Hub/Salir | Manual `manual-tray`, pendiente de Isaac; no cubierto por el gate automático | Se verifica aparte |
| Caída overlays: reinicios separados de 250/500 ms; núcleo no reinicia | `real_overlays_restart_backoff_and_single_instance` | Se conserva |
| Matar supervisor recoge también el overlays real por su Job | `real_overlays_die_with_the_supervisor_job` | Se conserva |
| Segundo supervisor con/sin Hub no arranca hijos; segundo beta falla por lock, no enfoca Hub | Reinicio/instancia real y matriz Hub con lock original | Paso 4: enfocar/abrir a través de sesión |
| Caída núcleo cambia época; presupuesto agotado; colgado; Job; solicitudes Engineer→overlays→diagnóstico; todos los consumidores terminan antes que el núcleo en cierre normal. Un colgado muerto por plazo deja exit 1 y diagnóstico, y se recogen los demás hijos | Escenarios anteriores de `lifecycle.rs` (hijos sintéticos explícitos) | Paso 2: presupuesto único y reserva min(1 s, P/2) para el núcleo |
| Heartbeat avanza sin fotos; kill no publica estado de cierre y caduca en frontera exacta | `engineer/tests/status_process.rs`: kill+wait, dos lecturas posteriores | #1852: no exigir igualdad a una lectura anterior al kill |
| Revocar Engineer que sale con 7 o requiere kill conserva núcleo y overlays publicando; el Stop posterior sale con 0 | `engineer_revocation_failure_preserves_the_running_session` | Corrección de revisión del paso 1 |
| Engineer sale con 7 tras el Stop: diagnóstico, sin fallo del supervisor | `requested_shutdown_accepts_a_nonzero_child_exit` | Sólo el kill forzado es fallo |

Esta tabla protege la máquina pura `session::Session::paso`. Conforme al §1
del diseño y a la decisión del orquestador, se sustituye sólo la aserción de
orden de terminación entre consumidores por «todos antes del núcleo»; el orden
de solicitud EOF sigue Engineer→overlays→diagnóstico. Las pruebas no acreditan guardar documentos en el Hub
real, física del simulador ni una instalación/actualización real. Los eventos
Live/Paused son datos sintéticos. Las esperas observan PID+fecha de creación,
ventanas, pipes, marcadores y salida; los plazos solo acotan fallos. Las cotas
inferiores 250/500 ms verifican el backoff real, sin imponer presupuesto de CPU.

Los riesgos de diseño ajenos a estos pasos siguen pendientes: acuse de arranque
10/45 s; casilla de
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

El paso 2 añade pruebas con reloj inyectado de plazo único, reserva del núcleo,
revocación, presupuesto de reinicios y conservación del motivo original.
`background::tests::forced_worker_exit_releases_locks_and_keeps_documents`
ejecuta dos variantes con un worker bloqueado durante una escritura: tres hijos
que ignoran EOF, y tres hijos que atienden EOF. La segunda demuestra que el
worker por sí solo hace fallar el cierre, aunque todos los hijos salgan limpios.
verifica fallo dentro de P más margen del arnés, recogida explícita de los hijos,
documento anterior completo, recuperación del almacenamiento real y locks
liberados al salir. Los archivos ancla de lock no se borran: se prueba que
pueden adquirirse otra vez. Resident y Host tienen además pruebas de cierre
normal completo; Resident prueba cierre de apps propias con su worker parado.
La prueba de interrupción usa un temporal parcial del protocolo de Resident y
pausa la serialización real de Store; no simula un fallo de disco dentro de
cada syscall. El código de escritura atómica de ambos se conserva.
En Unix el conductor recoge los hijos explícitamente sin Job; las pruebas
portables quedan disponibles, pero no se ejecutan desde este servidor Windows.
