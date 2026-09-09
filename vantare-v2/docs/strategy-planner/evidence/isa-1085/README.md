# ISA-1085 — cliente de selección exacta e invalidación

Base ae6eb45fb8baef3945e0d84c633de3e8d36effc4; rama
vantareapp/isa-1085-selection-revision-client, C:/tmp/vantare-isa1085.

Cuatro archivos modificados: frontend/src/strategy/strategy-application-client.ts
 y .test.ts; frontend/src/hub/strategy-orbit/strategy-session-selection.ts y
.test.ts. Contrato, handoffs y roadmap manual/generado actualizados.

Cliente valida referencia completa, cobertura de incluidas y coincidencia con
proyección. Referencia se conserva al cargar y guardar selección. Cambiarla
retira proyección del evento, mantiene overrides y solo invalida caché tras
confirmación de escritura. Misma selección conserva datos; fallo no muta vista.
No se escriben originales ni revisiones Analysis; planes aceptados intactos.

RED: siete casos de respuesta incoherente/caché vieja fallaron por aceptar
respuesta o conservar derivados. GREEN: 42 focales PASS y typecheck PASS.
Pruebas de selección idéntica, cambio de revisión/exclusión y escritura fallida.
Fixtures de contrato explícitas; no carrera real ni precisión física.
Suite frontend global PASS: 418 archivos / 3294 tests, 346,93 s, dos workers.
Log C:/tmp/isa1085-frontend-test.log; AbortError de teardown happy-dom con final
exit 0. Lint y diff check PASS. Revisión personal de diff y comportamiento realizada.

Go no cambiado; no se repite el global fallido de #1084 (assets ausentes y #708).
Sin builds ni app por instrucción de Isaac. No hay aceptación Wails/visual.
Verificación manual futura: cambiar revisión de sesión, guardar, comprobar que
no sigue apareciendo el cálculo anterior y que los ajustes se conservan. Falta
conectar productor autorizado y UI nueva; la recomputación fijada sigue rechazada
explícitamente. Sin push/PR/CI remota, merge, promoción ni release.
