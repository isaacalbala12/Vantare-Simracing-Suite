# Paso 1b · evidencia y perímetro QA (1-nov-2026)

VANTA-127 / #1840. Paso 0 integrado en nightly 216f9bda7; el orquestador
confirmó su caracterización Windows en CI. Esta entrega no publica instaladores.

## Incidente de verificación descartado

A las 14:44 locales, el ejecutor llamó `build-inventory-tests.ps1` como prueba
de inventario sin revisar su llamada final a `historical-inventory-tests.ps1`.
Creó `C:/tmp/ola2/1591-qa/history-5df84651a30e4e10bcc32713d01dece3`, fuera
de la raíz autorizada D:/VantareServer/qa. El proceso se detuvo; sus resultados
no cuentan como gate. Había alcanzado las fixtures sintéticas previous-active974
y previous-974, lectura, Probe y Update; no llegó a la secuencia posterior de
desinstalación. No ejecutó Setup ni Hub reales. TEMP/TMP y LOCALAPPDATA estaban
en D:/QA, pero HKCU no estaba remapeado: no se afirma aislamiento de registro
en esa ejecución. La revisión del código alcanzado no sustituye una auditoría.

El orquestador comprobó la instalación real del servidor y comunicó: registro
VantareNativeBeta en 0.0.988 y misma InstallLocation; sin entradas Vantare en Run;
state.json, generations y staging sin cambios desde 31-oct; update-status.json
de las 08:56 del 1-nov, anterior al incidente. Sin daño observable en esas
comprobaciones. Estos datos proceden de su verificación, no de otro gate local.

Autorizó borrar exclusivamente aquella fixture tras verificarla. La herramienta
rechazó la operación con «blocked by policy» antes de ejecutarla; sigue conservada.
No se intentó otro método de borrado. El ejecutor asume el error de perímetro.

Por decisión expresa, 1b amplía su alcance: ambos puntos de entrada exigen Root,
RegistryRoot y ShellRoot explícitos antes de cargar producto o escribir. Root,
shell y entornos de temporales deben pasar el guard QA; HKCU se remapea solo a
una clave de pruebas existente e identificada. El histórico copia el driver e
inyecta esas mismas fronteras en su proceso. El workflow usa el arnés que copia
producto/tests/fixtures a TEMP de CI y pasa todo el contexto; ya no invoca el
histórico con valores implícitos. La semántica de producto no se sustituye.

## Verificación válida

- `matrix-1b-01`: 88/88 filas contra baseline; 22 comprobaciones de carga y 22
  de contexto del driver. Datos existentes intactos; único delta esperado de
  instantáneas: hash de beta.ps1 raíz en 52 filas.
- `history-1b-guarded-02`: 14 comprobaciones de inventario de build y 164 del
  histórico, incluido ZIP975 real con digest fijado, PASS. Arnés copiado a D:/QA,
  HKCU único y carpetas de shell inyectadas; producto copiado sin alterar bytes.
- `history-safety-1b-01`: 14 rechazos de los dos puntos de entrada, sin crear
  archivos ni cambiar el sentinel, PASS. Incluye falta de raíz/registro/shell,
  HKCU real y rutas fuera del perímetro.
- Contrato Rust del instalador público y TEST: 8/8 cada uno, Nextest. Clippy
  del instalador, todos los targets, -D warnings; check y fmt PASS. Se usó la
  cola, target D:/VantareServer/targets/isa-1840, jobs 2. La primera invocación
  Nextest sin manifest-path falló antes de compilar; se corrigió y repitió.
- `matrix-1b-hook-02`: 22+22+14 comprobaciones y clean-Probe PASS, con los hooks
  finales integrados. Los tres scripts de producto mantienen los bytes de la
  matriz completa; no se repiten 88 filas por un cambio exclusivo del arnés.

La primera copia QA para verificar el hook nuevo omitía los dos scripts del
histórico: falló por archivo ausente, sin ejecutar esas pruebas. Se repite con
la copia completa. Calidad detectó la modificación mecánica de dos referencias
retiradas; se restauraron sus bytes fijados. No se cambió el manifest de huellas.
Las referencias históricas siguen siendo inertes, no herramientas ejecutables
compatibles con el contrato nuevo de biblioteca.

Evidencia local bajo D:/VantareServer/qa/isa-1840. No acredita ventanas físicas,
una cuenta/VM independiente ni instalación de bytes publicados. Los gates
generales de CI y su seguimiento corresponden al orquestador.
