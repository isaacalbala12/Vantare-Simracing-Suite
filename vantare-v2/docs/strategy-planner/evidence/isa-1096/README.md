# ISA-1096 — edición escalar e historial del editor registrado

Base bd9ed2c2ffa148ce4398265e2f83af80303739af (#1095), rama
vantareapp/isa-1096-recorded-corrections, worktree C:/tmp/vantare-isa1096.
SDD T10; contrato de correcciones/ADR0010. Sin nuevos umbrales o arquitectura.

## T10a — operaciones de revisión exacta y snapshot

Dos paths de lógica/test. Carga revisión explícita verificando base/snapshot;
escalar desde muestra/canal originales con motivo y sin promoción de calidad.
Sustituir un objetivo preserva las otras correcciones. Comando clonado completo
para conservar payload/ID ante resultado incierto. Cabeza histórica distinta
rechaza escritura; restaurar usa snapshot anterior con cabeza explícita actual.
Proyección separada del guardado duradero y adopción explícita posterior.
Siete tests focales y tipos PASS. Lint detectó un import de tipo no utilizado,
retirado antes del gate final. Logs C:/tmp/isa1096-t10a-*.log.
No nueva UI montada aún. Sigue controlador y vistas Datos/Revisiones.

Gate heredado #1095 T08j: 438 archivos/3433 tests, lint/build PASS.
Avisos heredados happy-dom teardown y chunks Vite. Sin Wails, banco real nuevo,
review visual >9, push, PR, CI remota, promoción o release.
