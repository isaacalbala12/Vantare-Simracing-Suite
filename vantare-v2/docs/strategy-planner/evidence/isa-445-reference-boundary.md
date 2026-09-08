# ISA-445 — referencias fuera de la ruta TEST

Base `b1211c99`, rama `vantareapp/isa-445-reference-boundary`. Ejecución personal.

## Hallazgos corregidos

Composición productiva ya no aporta FixtureSignedV1 ni FixtureTrustedKeys. Un
catálogo ausente devuelve vacío; una caché TEST no puede recuperar confianza.
Se preserva el archivo de caché. No se configura una clave nueva ni se publica.
El build normal mantiene URL vacía; configurar una URL no concede confianza.

La aplicación de perfiles exige coincidencia exacta de la combinación canónica
seleccionada en el evento. Aplicar una variante exige además que su digest esté
dentro de esa combinación. El panel filtra por la misma identidad; no compara
etiquetas de circuito/coche ni muestra referencias de otras combinaciones.

## Evidencia de reproducción

- RED: arranque aceptaba fixture TEST; tras quitar solo el candidato, caché TEST
  aún devolvía SourceCache. Fecha fija dentro de validez evita confundir rechazo
  por firma/confianza con caducidad. Ambos pasan ahora esperando vacío.
- RED: perfil sin combinación o con otra enviaba comando de guardado. GREEN:
  rechaza antes de ejecutar; variante desconocida también rechazada.
- Tests de panel: carga del catálogo resuelta antes de afirmar vacío; solo
  combinación exacta ofrece aplicar. Fixtures limitados a tests explícitos.

## Revisión personal y límites

Revisión de correctitud, sencillez, arquitectura, seguridad y rendimiento:
se reutiliza Consumer y su verificación de caché; no se crea otra autoridad,
almacenamiento, dependency o modo demo. Guard compartido antes de guardar.
Búsqueda lineal sobre el catálogo existente; sin nuevas lecturas del simulador.

Esto no publica el catálogo oficial ni acredita compatibilidad de duración,
reglas, clima o neumáticos que el payload no representa. Los planes de referencia
siguen siendo puntos de partida y deben recalcularse; no son prueba de óptimo.
El catálogo productivo permanece vacío hasta confianza/publicación aprobadas.

## Checks

Go focal (cmd/vantare y catalog) PASS. Frontend focal 2 archivos / 9 tests PASS.
Build/typecheck/lint/Go completo: PASS. Frontend completo: 416 archivos /
3251 tests PASS (388.77 s, exit 0). Ruido AbortError de Happy DOM al desmontar;
ningún test fallido. Digest/diff check PASS. Logs locales
`C:/tmp/vantare-isa445-*-final.log` y logs de build/typecheck/lint.
Prueba Wails física no ejecutada. Para verificar, abrir referencias en Strategy:
con la composición actual debe aparecer el estado vacío, nunca las cifras TEST.
Las regresiones de cliente prueban guardar solo con identidad compatible.

Sin tocar originales DuckDB, LMU, claves/secretos; sin push, PR, CI remota,
merge, promoción o release.
