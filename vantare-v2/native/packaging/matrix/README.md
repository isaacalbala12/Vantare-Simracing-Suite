# Matriz de instalación · VANTA-127 / #1840

La matriz vigente compara **invariantes** del motor Rust. No exige los mismos bytes JSON que los scripts PowerShell retirados. Conserva las ocho raíces históricas (`clean`, `nsis975`, `nsis975-incomplete974`, `rc-options`, `pending`, `boot`, `retained`, `retained-no-marker`) y las once operaciones (`Probe`, `Install`, `Update`, `Repair`, `Check`, `Apply`, `Confirm`, `Timeout`, `Rollback`, `Uninstall`, `Cleanup`): 88 filas. `probe-invariants.ps1` mantiene los 45 rechazos por motivo. Los snapshots y el baseline histórico sirven para diagnosticar resultados, no para ejecutar motor 1.

`installation-matrix-tests.ps1` exige raíz QA fresca, ZIP 0.0.975 fijado por hash, verificador TEST, probe de lectura, motor de escritura, fixture Hub, Hub real y lanzador raíz. `guard-tests.ps1` comprueba primero que una raíz ausente, externa, con `..` o con reparse se rechaza antes de escribir. Cada fila recibe TEMP, TMP, LOCALAPPDATA, HKCU y carpetas propias bajo la raíz guardada. La matriz verifica conservación de `data/`, resultado de la operación, enlace SHA del manifiesto activo, no cambio de estado en Apply sin pendiente y retirada de estado al desinstalar.

`launcher-tests.ps1` usa el `vantare.exe --session` real compilado con la feature `installer-qa`. Arranca el Hub QA desde el `bin/` de la generación activa mediante el supervisor Rust, comprueba Run, confirmación y Register/SetStartup, y fuerza un token Hub distinto para demostrar que no confirma y hace rollback. La sincronización se basa en archivos de barrera explícitos, sin ventana de 200 ms. Rust rechaza Rollback sin `boot-pending`; la matriz exige ese rechazo y que `state.json` permanezca igual en `rc-options` y `pending`, donde el script retirado devolvía éxito sin operar.

`signed-feed-tests.ps1` (#2771, P5 PR C) recorre la actualización del Hub **por el feed firmado**, sin atajos. Usa el `vantare.exe` QA (`hub-update-qa`) como raíz y como sesión. La sesión QA llama a `stage()` real contra `services/examples/qa-feed-server.rs`, que solo escucha en `127.0.0.1` con un puerto efímero y solo sirve la lista de releases y `download/<etiqueta>/<archivo>` de una carpeta QA guardada. Al salir, la sesión aplica el pendiente y devuelve 10, como `main.rs`; la raíz arranca la generación nueva y el Hub de pega confirma o publica otro token. La oferta se firma con la semilla TEST pública de la matriz (`matrix-verifier --matrix-sign`).

Casos, cada uno con raíz y HKCU inyectado propios:

1. Oferta válida: se confirma 0.0.990.
2. Token ajeno: vuelve 0.0.989 con `rejectedVersion` y la oferta no se vuelve a pedir.
3. Firma alterada: nunca se pide el ZIP.
4. Solo versiones iguales o menores: solo se pide la lista.
5. Sin `qa-feed-port`: la sesión sigue.

El servidor se para con su archivo de parada o por su propio proceso, nunca por nombre. `VANTARE_QA_WRONG_BOOT_TOKEN` solo actúa con `boot-pending.json`, porque la raíz hereda el entorno a todas sus sesiones. La clave TEST es pública: el riesgo y su contención están en `../README.md`. De momento el paso no bloquea el job de CI: un fallo deja un aviso.

El workflow `branch-channel-gates.yml` construye los cinco fixtures con `native/scripts/compilar.ps1`, descarga el ZIP histórico, ejecuta el guard y después la matriz. Una ejecución local usa las mismas rutas de binarios y una raíz nueva bajo `D:/VantareServer/qa`; no debe usar la instalación ni el registro reales.

La evidencia anterior se conserva en `evidence-1840-p3.md`, `evidence-1840-p4.md`, `evidence-1840-p5.md` y `evidence-1840-p5b.md`. Los arneses que solo ejercitaban el PowerShell instalado se retiraron en el paso 7.
