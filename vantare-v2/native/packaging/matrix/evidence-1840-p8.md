# VANTA-127 · paso 8, cierre de límites y corte

Base nightly `8ca3e63be6ab90f149834039aeb60c7d7bb3a59f`, con #1929
integrado y CI 5/5 verde. QA exclusivamente bajo `D:/VantareServer/qa/isa-1840`.

Tras review, `Test-BuildPackage` llama al ejemplo `verify-package`, que usa
`engine::package::expand` y `Manifest::installed`, las mismas funciones que
Setup. PowerShell calcula el SHA externo y mantiene las aserciones de inventario
público; ya no reimplementa la extracción. `New-BuildZip` omite directorios;
el portable incluye un archivo vacío en `data/` para conservar esa carpeta.
Los tests de extremo a extremo en PS 5.1 con cp 65001 y PS 7 aceptan un ZIP
válido y rechazan doce variantes: compresión, directorio, NUL.exe, `..`, ruta
absoluta, `.env`, `data`, duplicado por mayúsculas, reparse 0x400, manifiesto
mayor de 64 KiB, tamaño declarado menor y campos obligatorios ausentes.
La re-review exige un fragmento de causa concreto por variante. El método 12
se inspecciona con `by_index_raw`, antes de que `zip` intente abrir un decoder,
y llega al rechazo `Compresión ZIP no compatible` de `package.rs`.

El test `abrupt_process_exit_at_staged_and_commit_never_leaves_torn_state`
ahora también mata el proceso hijo en `staged`, después de mover la generación
y copiar los datos pero antes de comprometer `state.json`. Verifica que el
estado activo y los datos siguen intactos; conserva los cortes reales previos
justo antes y después del commit. Tras liberar espacio en D:, la repetición
local pasó **1/1** en 5,03 s con `compilar.ps1`, target
`C:/VantareServer/targets/isa-1840-p8` y raíces QA inyectadas. El intento
anterior, detenido antes del primer checkpoint por `StorageFull`, queda como
antecedente. La CI del PR repetirá el caso en `RUNNER_TEMP` aislado.
La review reprodujo un segundo defecto en ese mismo corte: `boot-pending`
refería 1.0.1 sin commit mientras `state.json` conservaba 1.0.0, y el arranque
no lo descartaba. El test ampliado falló en esa condición antes del arreglo.
Ahora el marker atómico liga ID y SHA del manifiesto de la generación staged;
el arranque comprueba que no hubo commit, elimina el marker y la generación
autenticada, y el segundo update a 1.0.1 pasa. Los 31 tests activos de
`installation_write` pasan tras el cambio.
La repetición también cubre `before-commit`: con un miembro huérfano bloqueado,
el borrado se registra como aviso, se quita el marker y el siguiente update
funciona. `after-commit` conserva su confirmación/rollback normal.

K3 se evaluó y no se incluyó: el estado no conserva el SHA de una generación
huérfana, así que un manifiesto autoconsistente no prueba propiedad para
borrar `bin/`. La implementación conservadora probada sumó 49 líneas de
producción frente a un margen final de 24, y además podía bloquear el plazo de
confirmación si se ejecutaba allí. Los binarios huérfanos siguen conservados
con diagnóstico; todas las `data/` permanecen intactas. Requiere un diseño
aprobado que establezca una vinculación fiable antes de purgarlos.
La proyección actual del paso 8 es 10.296 líneas de producción en el perímetro
más 963 fuera, **11.259/11.320** tras la re-review. La cifra de 10.238 Rust
de la primera review omitía las 53 líneas de Cleanup: 10.238 + 53 + 963 =
11.254 antes de estos ajustes. El aumento autorizado cubre la recuperación
del corte y el modo CLI; tests y tooling se contabilizan aparte.
