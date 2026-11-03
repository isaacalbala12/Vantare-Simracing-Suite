# ISA-1840 · Paso 6, lanzador y sesión

Base medida: `71a12cc092c7aeee2b76ec357936471e6bee1043` de `nightly`.
Rama: `vantareapp/isa-1840-paso6-lanzador-sesion`. QA exclusivamente bajo
`D:/VantareServer/qa/isa-1840`, con HKCU y carpetas inyectadas. No se
ejecutó Setup, Uninstall, beta.ps1 ni candidate.ps1 en una instalación real.

## Producción

`python native/scripts/installer-lines.py --base 71a12cc092c7aeee2b76ec357936471e6bee1043 --projection`
da 11 756 líneas en su perímetro fijo. La producción Rust de los módulos
afectados fuera de ese perímetro suma 702; total 12 458. El exceso de 148
sobre 12 310 queda dentro del margen autorizado de 150. El tope compensado
del paso 7 es 10 082; objetivo final, 10 110.

## Tests y herramientas

El perímetro fijo reduce los tests Rust en 198 líneas y el tooling/tests
PowerShell en 1 521. Fuera del perímetro, los tests Rust suman 67 líneas
(incluye `interaction_tests.rs`) y los ejemplos/tests QA Rust restan 201.
Saldo: tests Rust −131 y tooling/tests QA −1 722. Los fixtures no cambian.

La matriz conserva Run, Check, Apply y Confirm, los mismos invariantes de
seguridad y 45 rechazos por motivo. Se quitaron las pruebas que solo
ejercitaban el PowerShell retirado. Los casos de renovación de `Vantare.exe`,
feed, descarga parcial, reinicio y rollback tienen tests Rust.

## Apertura del Hub

Hub release compilado con `compilar.ps1` en target propio y ejecutado con
fixtures en QA. Cinco aperturas desde inicio de proceso hasta ventana visible:
2 402,4 / 343,7 / 331,4 / 329,9 / 342,7 ms. Mediana 342,7 ms; se retiró el
indicador. Evidencia local:
`D:/VantareServer/qa/isa-1840/p6-logs/hub-open-80a11162af4e43c4823c0a28640fd5f3/results.json`.

## Verificación

- `check --all-targets` y Clippy `-D warnings` de Installer, Hub, Runtime,
  IPC y Services: PASS.
- Nextest CI de esos cinco crates: 1 668 tests; 1 665 PASS y tres que exigen
  `TEMP` bajo QA fallaron con el entorno incompleto. Sus tres ejecuciones
  individuales con `TEMP`/`TMP` inyectados pasaron. Otros cinco casos de
  fixtures antiguas o binario storage faltante pasaron tras ajustar la
  fixture y construir el binario storage oficial.
- Matriz completa con los binarios QA finales: **88 filas PASS**, incluidos
  los 45 rechazos por motivo; además, 9 checks de lanzador y 38 de límites
  de escritura PASS. Evidencia:
  `D:/VantareServer/qa/isa-1840/p6-matrix-final-20261103-04/results.json`.
  `boot-update` rechaza el arranque pendiente con código 1 en el motor Rust;
  el PowerShell anterior devolvía 0 sin actualizar. Los datos permanecen
  intactos y el baseline registra la diferencia explícita.

Gate de publicación: Isaac debe pasar el Setup distribuido sobre raíces reales
975 y 988 en VM o cuenta aislada antes de publicar motor 2 sin LegacyRunner.
