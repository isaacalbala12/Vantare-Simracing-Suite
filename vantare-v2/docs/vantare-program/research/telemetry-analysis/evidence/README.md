# Evidencia visual TA-01

Capturas reproducibles del HTML de referencia. Son datos ilustrativos y no
prueban telemetría real ni comportamiento del producto.

- `ta01-gallery-wide.png`: galería a 1440 × 900.
- `ta01-workspace-wide.png`: workspace tras navegación por tabs y selección de
  canal.
- `ta01-states-mobile.png`: degradación honesta a 390 × 844.

El smoke automatizado comprueba navegación por ratón y teclado, estado
`aria-selected`, selección `aria-pressed` de canales, ausencia de overflow
horizontal y cero errores de consola/página. La prueba usa el Chrome local y
Playwright del runtime de Codex; no abre archivos de telemetría ni realiza red.
