# R4 F5 · exportación por lista blanca · #1594 / VANTA-38/49

Encargo explícito de Isaac, 14/10/2026. Base de reanudación 5d62f624; commits
r1–r3 conservados, sin cambios heredados sin commit. PR #1602 draft a nightly.

F5 era reproducible: JSON después de `ERROR`, clave y `:` en líneas distintas,
Authorization/valor en líneas distintas y JSON truncado perdían la asociación
privada. La solución cambia el contrato de exportación:

- Ningún texto de log crudo sale a modelo, propuesta T3 o Intake. Los adjuntos
  privados del owner conservan su almacenamiento/retención; no hay migración.
- Solo JSON completo, sin claves duplicadas, objeto/lista de hasta 300 registros
  proyectados. Campos: level cerrado; error_code/error_type/module/version con
  ASCII `[A-Za-z0-9_.:-]{1,64}`; count/relative_ms enteros 0..1.000.000.000 sin
  bool. Un valor inválido se descarta; texto libre/prefijos/JSON inválido no se
  analizan. No hay fallback a líneas, mensajes, payload o claves arbitrarias.
- El resumen de sesión exportado omite message/first_line/nombres libres y
  fechas absolutas. type/fingerprint de errores son escalares acotados. Rust
  valida metadata observada; Python vuelve a proyectar los campos. La forma
  privada SQL conserva type/message/fingerprint y name/at: message es un código
  fijo y eventos owner-only no se exportan. Tests nativos comprueban esa forma
  para evitar un cambio incompatible con el validador SQL existente.
- Título/cuerpo: máximo 120/1000 y una sola línea. La inspección ocurre antes
  de truncar/normalizar; cualquier cambio o marcador de la redacción actual
  retira el campo completo con `[contenido retirado por privacidad]`. Igual
  para duplicados, resumen/solución/razones del modelo y spools anteriores.
  Replay no reanaliza, no copia claves de logs y conserva ACK independientes.

## Regresiones

`export-cases.json`: 40 casos compartidos Python/Rust (39 F5 + etiqueta privada
vacía): JSON prefijado/completo/truncado/anidado, Authorization y asignación
multilínea, username/accountId y LF/CRLF/CR. `redaction-cases.json`: los 43
casos previos mantienen sus expectativas e idempotencia. `log-field-cases.json`:
cuatro proyecciones escalares (permitidos, texto libre rechazado, inválidos y
límites). Python comprueba además rechazo de claves duplicadas al parsear.
Rust produce registros directamente, sin parser de logs crudos en producción.

`test_review_1602_r4.py` recorre los 83 casos de texto con resumen limpio y
generado: 166 recorridos, cada uno con captura de entrada al modelo, propuesta
T3 y POST Intake mock. Propiedad: ningún secreto declarado por esas fixtures
aparece en ninguna de las tres salidas. También cubre mensajes/eventos
descartados, JSON de log válido con datos privados, límites y replay antiguo
sin reanálisis. Es una propiedad sobre la batería sintética, no una afirmación
de anonimización de cualquier texto sin etiquetas.

Las pruebas previas siguen activas. Se actualiza la fixture común de log a
registros estructurados para conservar las comprobaciones de referencias,
reintentos y ACK; las pruebas adversariales de texto crudo usan referencias de
error permitidas y exigen retirada completa del campo. La prueba HTML conserva
el caso limpio escapado y exige retirada completa ante datos privados. No se
suprime ningún test, filtro, lint ni gate.

## Reproducción offline

Desde la raíz Git:

```powershell
python -B -m unittest discover -s tools/triage -p 'test_*.py'
```

La ejecución final usa además un parche global de `socket.socket` que prohíbe
red después de importar la suite, incluyendo ssl/asyncio. State usa SQLite y
directorios temporales; analyze/send/Plane son capturas o mocks. No invoca
OpenCode/proveedor, T3, Supabase ni Plane reales.

Native: gates check/Clippy/Nextest/lifecycle por `native/scripts/compilar.ps1`,
jobs=2, timeout 3600 s, target exclusivo E:/tmp/isa1594-native-gates. Wrapper
verificado contra `native/gates.ps1`, solo cwd/target distintos; sin alterar
features/defaults. La suite focal inicial de services pasó 17/17; la ejecución
final del workspace y sus cifras se registran en el cierre del handoff vivo.

RED Python anterior al arreglo en
E:/tmp/isa1594-r4-evidence/python-red.log; GREEN completo con sockets prohibidos
47/47 en python-final.log. Fallo inicial de invocación fmt sin manifest-path y
fallos de fixtures antiguas que exigían texto de log conservados en evidencia;
corregidos por contrato explícito, sin cambiar las expectativas de privacidad.
Clippy inicial exigió backticks en un comentario; corregido sin allow y repetido
GREEN. fmt/check/Clippy y quality PASS; Nextest/lifecycle en curso.
No hay RED Rust ejecutado sobre la versión anterior: la fuga nativa de la
review r4 era una predicción por lectura; sí se ejecutan las regresiones nuevas.

Sin SQL/pgTAP ni telemetría nuevos (no se toca SQL/runtime/domain/ipc/testdata).
Sin QA visual/física, despliegue, proveedor, envío real, token/LOGIN/password,
cron, merge, promoción o release. La omisión de logs antiguos y campos enteros
puede reducir contexto del análisis; falta evidencia implica rebaja a dudoso.
