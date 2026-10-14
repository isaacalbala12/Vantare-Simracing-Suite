# Review #1602 r3 · F4 (P1) · #1594 / VANTA-38/49

La normalización de comillas escapadas confundía el delimitador JSON con una
comilla dentro del valor privado. Dejaba salir `OpaqueTailSecret`, `OtherPerson`
o `OpaqueTailToken` hacia modelo, T3 e Intake. Todas las fixtures son sintéticas.

Se elimina esa normalización en Python y Rust. El JSON completo se parsea con
`json`/`serde_json`, se recorre por clave/valor y se vuelve a serializar. Las
claves privadas se comparan sin distinción de mayúsculas, guiones o guiones
bajos; se sustituye su valor entero, incluidos objetos, arrays y números.
Las strings que contienen JSON vuelven al mismo recorrido. También se limpian
las claves y los valores públicos que contienen patrones privados conocidos.
Los números que coinciden con los filtros anteriores tampoco se exportan.

El recorrido tiene un presupuesto compartido de 32 niveles. JSON inválido o
demasiado profundo se omite. En texto mezclado con JSON se conserva el prefijo
de cada línea y se omite el fragmento ambiguo. Las regex/filtros de texto libre
se usan después de decidir esa frontera: valores etiquetados con comillas o
escapes se omiten hasta el final de línea. Los valores simples conservan su
delimitador por espacio. Esto puede quitar contexto público junto al privado;
es la decisión conservadora exigida por el encargo.

`redaction-cases.json` contiene **43 casos compartidos**, consumidos por las
dos suites: F4 exacto password/username/token, comillas internas, `\u0022`,
clave escapada Unicode, claves en distintas grafías, objetos/arrays anidados,
JSON dentro de string JSON (profundidades 0–3 y campo anidado Unicode),
fragmentos inválidos, exceso de profundidad, texto ambiguo, números privados y
JSON público preservado. Ambos comparan el resultado esperado y su idempotencia.

Python ejercita State SQLite real y los límites extracto/modelo, propuesta,
T3 y POST Intake mock: tres fixtures, cuatro profundidades y resumen limpio o
generado por el modelo (**24 recorridos**). También summary/fix/reasons, log y
resumen de errores. `socket.socket` está prohibido. Rust ejercita prepare y
preview RPC con título, cuerpo, adjunto y resumen de sesión consentido; usa
el mismo limpiador de estructura para hardware y resumen de sesión.

## Evidencia RED → GREEN

- RED Python: las nuevas regresiones fallan antes de corregir; **61 fallos,
  cero errores**. RED Rust: `{"<redactado>OpaqueTailSecret"}` en vez del campo
  entero redactado. Los logs originales se conservan.
- RED adicional de valores numéricos: dos casos demuestran que una estructura
  parseada debe aplicar también los filtros de valor, además de los de clave.
- Primer Nextest del workspace: fallo de paridad por orden de claves, con
  1274 PASS y 384 pruebas sin ejecutar por fail-fast. GPUI unifica
  `serde_json/preserve_order`; se ordenan explícitamente todos los objetos
  antes de serializar, sin cambiar las expectativas ni desactivar features.
  El log `test-first-parity-fail.log` se conserva y los gates se repiten.
- Gates finales y SHA: ver el handoff vivo y el cierre del PR.
- Evidencia local: `E:/tmp/isa1594-r3-evidence/`, comandos con timeout 600 s
  Python / 3600 s Rust, dos jobs y target exclusivo de este worktree.
  El wrapper de gates se compara con el versionado: solo cambia cwd/target.

Reproducción desde la raíz Git:

```powershell
python -B -m unittest discover -s tools/triage -p test_review_1602_r3.py
```

Rust desde `vantare-v2/`, con `CARGO_BUILD_JOBS=2` y target propio:

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo test --manifest-path native/Cargo.toml -p vantare-services --lib --locked --offline -j 2 review_r3_f4
```

Sin dependencias nuevas, tests debilitados, cambios SQL, proveedor, despliegue
o envíos reales. No se certifica anonimización universal de texto libre, QA
visual, hardware/juegos, CI remoto verde, merge, promoción o release.
