# 08 · Accesibilidad

Objetivo: WCAG 2.2 AA en el hub de escritorio (Windows, ratón + teclado). Sin lectores de pantalla como caso principal, pero con semántica correcta para no cerrarles la puerta.

## Contraste (sobre `#0d0e11` / paneles `rgba(16,17,20,.79)`)
| Uso | Color | Ratio | Estado |
|---|---|---|---|
| Texto principal | `#f5f3f2` | 17.9:1 | AAA |
| Cuerpo | `#b7b2b2` | 9.4:1 | AAA |
| Secundario ≥ 11.5px | `#8a858b` | 5.3:1 | AA |
| Etiquetas 10.5–11px peso ≥ 700 | `#7c777d` | 4.6:1 | AA (texto pequeño en negrita) |
| Primario | `#1c1719` sobre `#f3eeee` | 15.4:1 | AAA |
| Acento sobre grafito | `#ff6a5f` | 6.9:1 · `#f04755` 5.1:1 | AA |
| OK / atención | `#78d68b` 11.3:1 · `#ff9b57` 9.2:1 | AAA |
| Decorativo (`#57545a`, `#45424a`) | — | no se usa para texto informativo |
Regla: ningún texto informativo por debajo de 4.5:1; los grises `#5f5b61/#57545a` solo para separadores, grips y elementos bloqueados (que además llevan candado + tooltip).
Color nunca solo: verde/rojo van con signo (±), palabra ("ganas/pierdes", "Disponible/No disponible") o icono (✓, !, ×).

## Foco y teclado
- `:focus-visible { outline: 2px solid --coral; outline-offset: 2px }` global. Ítems personalizados (esquinas, neumáticos, filas) son `button` o `tabindex=0` con `role`.
- Rail: tooltip también con foco. Paleta: Ctrl K abre/cierra, ↑↓ navega, ↵ ejecuta, Esc cierra, foco al input.
- Pestañas de Ajustes: ↑↓ entre pestañas (`role=tab`, `aria-selected`, `tabindex` roving). Pestañas de Estrategia y calendario: `role=tab` + `aria-selected`.
- Studio: widgets del lienzo `role=button tabindex=0`, Enter/Espacio selecciona; lista `role=listbox/option`.
- Estrategia: Ctrl Z/Y deshacer/rehacer; esquinas aceptan Enter/Espacio con neumático elegido; × accesible.
- Menú ⚙: `aria-haspopup=menu`, `aria-expanded`, cierra con clic fuera (añadir Esc en el porte).
- Toggles: `button[aria-pressed]` con `aria-label`. Acordeones: `<details>/<summary>` nativos.

## Objetivos táctiles/puntero
Mín. 26×26 en acciones secundarias (ojo, ×, ▶), 34–39px en controles principales, 52px en el rail. Filas completas clicables.

## Semántica y nombres
- Landmarks: `aside[aria-label]` (rail, columna, inspector), `header`, `section[aria-label]` por bloque, `nav`.
- Estados: `aria-current=page` en el destino activo; `aria-disabled` + motivo en bloqueados; `aria-live=polite` en toasts y en la superficie de Ajustes; `role=status`.
- Iconos decorativos `aria-hidden`; botones solo-icono con `aria-label`. Imágenes de logo con `alt` ("Vantare" / vacío en avatar).
- Formularios: `label for` o `aria-label` en todos los controles; unidades visibles junto a los campos.

## Movimiento y tiempo
- `prefers-reduced-motion` respetado (todo a 0 s). Cuentas atrás y pulsos no bloquean nada. Toasts 2.6 s, máximo 3.

## Texto y escala
- Base 16px; nada informativo bajo 10.5px. Densidad Compacta reduce espaciado, **no** tipografía. La UI debe soportar 125 % de escala de Windows sin cortar (revisar en QA).

## Deuda conocida
- Drag & drop nativo no es accesible por sí mismo → siempre con las alternativas de 5.6.
- Tooltips por `::after` no se anuncian → el `aria-label` del botón lleva el mismo texto.
- Menú ⚙ sin gestión de foco/Esc en el prototipo → obligatorio en el porte.
