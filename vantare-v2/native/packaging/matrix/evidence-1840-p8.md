# VANTA-127 · paso 8, cierre de límites y corte

Base nightly `8ca3e63be6ab90f149834039aeb60c7d7bb3a59f`, con #1929
integrado y CI 5/5 verde. QA exclusivamente bajo `D:/VantareServer/qa/isa-1840`.

El tooling de release valida antes de publicar los mismos límites numéricos
del lector Rust: ZIP comprimido 128 MiB, miembro 256 MiB, suma 512 MiB y
manifiesto 64 KiB. Comprueba los nombres exactos sin duplicados por mayúsculas,
las rutas cerradas, los bits de enlace/reparse y los hashes, leyendo como máximo
el tamaño declarado más un byte por miembro. Los tests PS 5.1 con cp 65001 y
PS 7 pasan: paquete aceptado, enlace, tamaño declarado y límites rechazados.
El ZIP release real de 0.0.989 pasó en ambos shells, sin escribir instalación.

El test `abrupt_process_exit_at_staged_and_commit_never_leaves_torn_state`
ahora también mata el proceso hijo en `staged`, después de mover la generación
y copiar los datos pero antes de comprometer `state.json`. Verifica que el
estado activo y los datos siguen intactos; conserva los cortes reales previos
justo antes y después del commit. Tras liberar espacio en D:, la repetición
local pasó **1/1** en 5,03 s con `compilar.ps1`, target
`C:/VantareServer/targets/isa-1840-p8` y raíces QA inyectadas. El intento
anterior, detenido antes del primer checkpoint por `StorageFull`, queda como
antecedente. La CI del PR repetirá el caso en `RUNNER_TEMP` aislado.

K3 se evaluó y no se incluyó: el estado no conserva el SHA de una generación
huérfana, así que un manifiesto autoconsistente no prueba propiedad para
borrar `bin/`. La implementación conservadora probada sumó 49 líneas de
producción frente a un margen final de 24, y además podía bloquear el plazo de
confirmación si se ejecutaba allí. Los binarios huérfanos siguen conservados
con diagnóstico; todas las `data/` permanecen intactas. Requiere un diseño
aprobado que establezca una vinculación fiable antes de purgarlos.
