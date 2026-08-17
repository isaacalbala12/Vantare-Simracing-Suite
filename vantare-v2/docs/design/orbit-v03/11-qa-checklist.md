# 11 · QA checklist (por PR de UI del porte)

Marca cada punto en la descripción del PR. Referencia visual: `vantare-exploration-v03-orbit.html?view=<sección>`.

## Entorno
- [ ] Capturas Playwright a **1920×1080** y **1920×900** (y 1440×900 si toca el shell).
- [ ] Probado con escala de Windows 100 % y 125 %.
- [ ] Sin conexión de red (fuentes locales, sin CDN).
- [ ] `prefers-reduced-motion` activo y desactivado.

## Tokens y estilo
- [ ] Ningún color/tamaño hardcodeado que ya exista como token (`02`).
- [ ] Títulos de panel en caja normal; eyebrows solo donde `02 · 2.2` lo permite.
- [ ] Máximo dos superficies destacadas por pantalla; glow ≤ tokens.
- [ ] Botón primario blanco; ghost hairline; danger solo destructivo.

## Layout
- [ ] Sin scroll de página a 1080; scroll interno donde crece la lista (`03 · 3.6`).
- [ ] Sin scroll horizontal del documento; `min-width` 1180.
- [ ] Columna contextual: contenido correcto por sección, bloques `data-for` ocultos en su sección, todo oculto en Ajustes, plegado/desplegado desde rail y cabecera, pie visible.
- [ ] Rail: activo con barra, bloqueados con candado y tooltip con motivo, tooltip también con foco.

## Componentes y estados
- [ ] Estados hover/active/focus/disabled/aria-disabled visibles.
- [ ] Toggles `aria-pressed`, segmentados `.on`, chips de licencia con punto.
- [ ] Toasts: título + contexto, máximo 3, `aria-live`.
- [ ] Modo estrés (`?stress=1` o harness): elipsis/envoltura sin romper alturas.

## Datos y honestidad
- [ ] Datos de muestra/sintéticos etiquetados; estados vacíos con causa y acción.
- [ ] Un solo lugar por dato de estado (sim, overlay, plan, versión).
- [ ] Horas en zona local con zona visible; cuentas atrás vivas.

## Interacción
- [ ] Teclado completo: Tab por todo, Enter/Espacio en botones personalizados, Esc cierra paleta/menús, Ctrl K abre paleta.
- [ ] Sincronía lista↔lienzo/mapa/timeline.
- [ ] DnD con alternativa por clic y teclado; feedback al soltar.
- [ ] Deshacer/rehacer donde hay edición.

## Accesibilidad
- [ ] Contraste ≥ 4.5:1 en texto informativo (`08`).
- [ ] `aria-label` en botones solo-icono; landmarks por bloque; `aria-current`.
- [ ] Sin `title` nativo en el rail; sin `confirm()` nativo.

## Contenido
- [ ] Copy en español según `09` (sentence case, glosario, formatos numéricos).
- [ ] Todas las cadenas por i18n; sin concatenaciones de plurales.

## Motion
- [ ] Duraciones/easings de `07`; nada > 450 ms salvo pulsos; cascadas ≤ 4 pasos.

## Evidencia
- [ ] Capturas antes/después adjuntas en `docs/design/orbit-v03/evidence/<fase>/`.
- [ ] Decisiones nuevas registradas en `00-decisiones.md`.
