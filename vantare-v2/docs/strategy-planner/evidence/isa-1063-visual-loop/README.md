# Evidencia del bucle visual de ISA-1063

Base local: `42c9dec8`. Rama: `vantareapp/isa-1063-orbit-prototype`.
Worktree: `C:/tmp/vantare-isa1063-orbit`. Referencias originales, sin cambios de
objetivo entre pasadas: conceptos de parada y stint A4 a **1672 × 941**.

| Pasada | Parada | Stint | Menor nota | Resultado |
| --- | ---: | ---: | ---: | --- |
| 1 | 8,0 | 8,4 | 8,0 | Corregir |
| 2 | 8,7 | 8,9 | 8,7 | Corregir |
| 3 | 9,1 | 9,2 | 9,1 | Revisión humana |

Los informes `review-01.md`, `review-02.md` y `review-03.md` recogen las
observaciones del mismo subagente, autorizado por Isaac solo para revisión
visual. El agente inspeccionó los originales y los candidatos de cada pasada;
no modificó código ni usó el navegador. El gate usa la menor nota, >9 estricto.

Las PNG `pass-*.png` son capturas del HTML real en Chrome, sin retoques de imagen.
La fotografía de fondo es un asset generado; tablas, texto, controles, iconos y
diagramas son HTML/CSS/SVG. No son resultados calculados ni evidencia Wails.

Referencias locales originales:
- Parada: `C:/Users/isaac/.codex/generated_images/01a07e43-6608-7220-8b7c-205f522fcd67/exec-97b6665d-c99c-4ff8-9446-402e9791e3c7.png`.
- Stint: `C:/Users/isaac/.codex/generated_images/01a07e43-6608-7220-8b7c-205f522fcd67/exec-0f4f46de-0a6d-48ae-b22b-ab35cd6e9222.png`.

## Comprobaciones propias complementarias

- Sintaxis `node --check` en ambos JS, `git diff --check` y roadmap digest check.
- Navegación por enlaces #pit/#stint; pestañas de curvas con aviso sin valores.
- Botón de cálculo deshabilitado; consola sin errores observados.
- Main a 320 px: 252/252 px en parada y stint, tras apilar el footer solo a <=600.
- Viewport restaurado. El gate del revisor solo cubre los PNG 1672 × 941.
- No build React/Go: no cambia código productivo. Sin solver, I/O, persistencia
  ni modificación de DuckDB/LMU. Aceptación humana pendiente.

## Imágenes decorativas

Generadas con la herramienta integrada ChatGPT Images; no se usó CLI/API propia.
Destinos: `../../prototypes/recorded-editor/garage-detail-v2.png` y
`../../prototypes/recorded-editor/garage-detail-v3.png`.

Prompt inicial: extraer/recrear solo la fotografía del header de la referencia,
sin UI; coche blanco/carmín en tres cuartos frontal, garaje oscuro, lámparas
neutras y reflejos rojos moderados, espacio para texto y cámara equivalente.

Prompt de la imagen final: editar ese fondo conservando coche y cámara, desplazar
coche a la izquierda y arriba, extender el taller hasta el borde derecho e incluir
el muro con «DRIVEN / BY A CLEARER / TOMORROW», reducir el vacío izquierdo y
preservar detalle fotográfico, sin UI, azul ni rojo neón. El resultado se encuadra
con CSS; no se extraen componentes de UI de la imagen.
