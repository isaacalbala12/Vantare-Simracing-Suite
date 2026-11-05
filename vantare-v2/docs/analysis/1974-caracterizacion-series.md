# Series — caracterización previa (#1974 / VANTA-133, paso 0)

Base: `origin/nightly@40e125341faa33341a0f71667f9536689a2c8bdd`.
Solo tests; no se corrige el comportamiento de producción.

- WAL pendiente tras matar al escritor: el test de proceso abre read-only,
  comprueba el prefijo confirmado y compara los bytes de DB y WAL.
- DB del motor sin esquema de series: una fixture crea y confirma ese estado;
  después se mata la fixture, no `Store::open`. La reapertura se rechaza y
  conserva el original. Read-only da `incompatible` de forma accidental,
  porque el clasificador reconoce `series_meta` en el texto del motor;
  RW no devuelve código. No prueba un corte durante la creación real de Store.
- Metadata real alterada: watermark inconsistente da `unreadable`; versión
  desconocida da `incompatible`. Se comparan códigos, no diagnósticos.
- Paridad runtime/Hub (hueco 4): por decisión de Isaac en la revisión de #1981,
  no se añade una dependencia de tests ni se cruzan fuentes entre crates.
  El paso 3 deja codec y análisis compartidos en `ipc::series`; la prueba de
  ambos lectores sobre la misma grabación se difiere al paso 6C, si se ejecuta.
- Drop tras cancelar una lectura: recoge el helper y libera el lock para un
  escritor posterior. Se despacha `summaries` antes, sin asegurar que SQL siga
  ejecutándose cuando se cancela. No mide cancelación durante una consulta larga.
- Comportamiento actual del catálogo: 256 archivos se admiten; 257 rechazan
  el catálogo entero, sin truncarlo ni borrar archivos.
- Comportamiento actual de `Core::new` sin suscriptor: cuatro muestras de la
  vuelta sellada y una activa permanecen retenidas. Es coste lógico, no RSS.

La fixture hija del estado sin esquema se ignora cuando se invoca sola: el
test padre la ejecuta con su ruta temporal y la mata tras la barrera.
La prueba con #[path] que rompía el guard se retiró; el guard no se modifica.
Gates, resultados, líneas y SHA finales quedan en el PR y en #1974.
