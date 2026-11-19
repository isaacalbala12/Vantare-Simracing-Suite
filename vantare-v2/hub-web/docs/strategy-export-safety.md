# Estrategia: seguridad de los archivos que elige MAIN (abrir, guardar como, exportar)

Vale para `strategy.pickFile` (E4a: abrir otro archivo, guardar como) y para
`strategy.exportFile` (E5c: guardar el plan como hoja de cálculo).

## Reglas

- La ruta nace en MAIN (diálogo del sistema) y viaja solo de MAIN al host
  (`pickedStrategyFile`). El renderer pide el diálogo y recibe la vista, el
  texto o el NOMBRE del archivo, nunca una ruta. Ningún mensaje, error ni log
  lleva la ruta.
- El host solo escribe en una ruta que venga de un ticket de MAIN: un ticket por
  vez, de un solo uso, ligado a la revisión (y, al exportar, al plan: la
  propuesta que dice `computeId` o el plan aceptado con su fecha), con id
  interno (`>= 0x8000_0000`) y caducidad de 120 s. Perder el acceso o cambiar de
  cuenta lo anula.
- La ruta se valida con las mismas comprobaciones al abrir, guardar y exportar:
  absoluta, en disco local, sin `\\?\`, sin dispositivos (`CON`, `NUL`, `COM1`,
  `CONIN$`, `CONOUT$`…), sin `.env*`, sin `.invalid`, sin enlaces, uniones ni
  unidades `subst`, sin `..` ni nombres cortos 8.3 que apunten al documento.
- Exportar además: el nombre debe terminar en `.csv`; nunca sobre el documento
  abierto ni sobre `strategy-v2.json` (por ninguna grafía); sobrescribe un CSV
  que ya existe (el diálogo de Windows ya preguntó; es un archivo derivado, no el
  documento) con escritura atómica: temporal con nombre corto en la misma
  carpeta, `sync_all`, `rename`; el temporal se borra con un `Drop` pase lo que
  pase. Un archivo en uso por otro programa (Excel) es `strategyFileInUse`.
- El texto y el CSV no ejecutan nada al abrirlos en una hoja de cálculo: toda
  celda de texto que empiece (o siga a un separador) por `=`, `+`, `-`, `@`,
  tabulador o salto de línea lleva delante un apóstrofo; las celdas con `;`, `,`,
  tabulador, comillas o saltos van entre comillas; los caracteres bidireccionales
  y U+2028/U+2029 se convierten en espacios. Las celdas numéricas son números
  (coma decimal, sin apóstrofo).

## Riesgo aceptado: carrera entre comprobar y renombrar

Entre las comprobaciones de la ruta (que la carpeta y el destino son directos) y
el `rename` hay una ventana corta (el host vuelve a mirar justo antes del
`rename` para estrecharla). Quien sustituyera ahí la carpeta o el archivo por una
unión o un enlace haría que el CSV acabara en otro sitio. Exige un atacante local
con el mismo usuario y los mismos permisos de escritura que la propia persona; el
renderer no puede provocarlo (no ve ni elige rutas) y el contenido escrito es el
CSV del plan, nunca datos del atacante. Se acepta. (Un `rename` sobre un destino
que ya es un enlace sustituye el enlace, no escribe a través de él.)

## Pendiente

- Rechazar bidi y U+2028/U+2029 ya al guardar (`valid_text`): issue #2711, por
  compatibilidad con documentos ya guardados.
