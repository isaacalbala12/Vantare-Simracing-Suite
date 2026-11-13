# Studio A · estados · comprobación en curso

VANTA-138 / #1995 / #2244. La evidencia todavía se está cerrando; este archivo
es un punto de recuperación, no una declaración de revisión terminada.

- Están capturados los trece estados de la maqueta a 1440×900 y 1280×720,
  en claro/oscuro y con barra plegada/abierta.
- A 125 % faltan las últimas escenas. Se trata de emulación visual de QA,
  preparada después de operar los controles; no cambia el techo del producto.
- La revisión de Guardando detectó que el botón Mostrar en pista recibía un
  aria-busy ajeno y perdía su texto. Se ha quitado ese atributo, conservando
  aria-disabled, el bloqueo de envíos y los indicadores de tira/pasos.
  Se repetirán las doce combinaciones de Guardando tras reconstruir el candidato.
- Las capturas no afectadas conservarán su ASAR identificado. No se presentará
  toda la serie como procedente de un único binario si hay dos versiones.
- Los casos ilegible, cargando y ausente se capturarán sin métricas de paridad:
  no tienen un equivalente en la maqueta.

El índice externo está en el directorio de evidencia del servidor
`hub-web/isa-1995-studio-a-6-estados/EVIDENCIA-FINAL.md`, con
`COMPARACIONES.md`, `metricas.json`, fuentes/motor y recibos de cierre.
Los PNG y los perfiles de QA no se versionan.

Apariencia procede del squash 812c78064. La pila usa el corte 3417276b2 de
catálogo/Más #2243. En pista #2250 es de C y no se acepta mediante este informe.
No se han cambiado contrato, núcleo, CAS ni valores por defecto del producto.
