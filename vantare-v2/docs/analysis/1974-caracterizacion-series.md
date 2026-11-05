# Series — caracterización previa (#1974 / VANTA-133, paso 0)

Base: `origin/nightly@40e125341faa33341a0f71667f9536689a2c8bdd`.
Solo tests; no se corrige el comportamiento de producción.

- WAL pendiente tras matar al escritor: el test de proceso abre read-only,
  comprueba el prefijo confirmado y compara los bytes de DB y WAL.
- Creación cortada: una barrera confirma el archivo del motor antes de
  `series_meta`; se mata al proceso real. Comportamiento actual: apertura
  rechazada, original intacto; read-only da `incompatible`, RW no da código.
- Metadata real alterada: watermark inconsistente da `unreadable`; versión
  desconocida da `incompatible`. Se comparan códigos, no diagnósticos.
- Paridad runtime/Hub: el test dirigido pasó, pero el guard de arquitectura
  rechazó sus imports #[path] entre crates. Cruce retirado; pendiente aprobar
  una dependencia solo de tests para mover la prueba al Hub.
- Cancelación tras despachar `summaries`: se cancela la espera, se recoge el
  helper y se puede abrir otro escritor. Sin sleeps ni duración mínima de SQL.
- Comportamiento actual del catálogo: 256 archivos se admiten; 257 rechazan
  el catálogo entero, sin truncarlo ni borrar archivos.
- Comportamiento actual de `Core::new` sin suscriptor: cuatro muestras de la
  vuelta sellada y una activa permanecen retenidas. Es coste lógico, no RSS.

La fixture hija de creación se ignora cuando se invoca sola: el test padre
la ejecuta explícitamente con su ruta temporal y la mata tras la barrera.
La paridad no se declara entregada mientras esté pendiente esa autorización.
Gates, resultados, líneas y SHA finales quedan en el PR y en #1974.
