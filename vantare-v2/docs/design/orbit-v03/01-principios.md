# 01 · Principios de diseño — Command Orbit

Estos principios justifican cada regla del paquete. Cuando algo no esté cubierto, decide con ellos.

## 1. Centro de mando, no panel de control
El hub es el sitio desde el que **se lanza, se sigue y se decide**: qué carrera viene, qué overlay está en pista, qué plan hay. Cada pantalla abre con lo accionable (una superficie destacada), no con configuración. Los ajustes son secundarios y viven en Ajustes.

## 2. Una sola fuente de verdad por dato
Cada dato importante se muestra **una vez** en su sitio y el resto son ecos por color o forma. Ej.: el estado de LMU es un pill en el pie de la columna; en el hero es un punto verde. Nada de repetir "conectado" tres veces.

## 3. Honestidad de datos
Lo que no viene de una fuente real se etiqueta: "horario de muestra", "datos sintéticos", "próximamente". Los estados vacíos dicen qué falta y cómo se resuelve. Nunca se pintan gráficos con datos inventados sin decirlo.

## 4. Grafito, cristal y carmín — en ese orden
- **Grafito** (`--canvas` `#08090b`, superficies `rgba(16,17,20,.79)` con blur) es el 90 % de la pantalla.
- **Cristal**: superficies translúcidas, hairlines de 1px, sombras profundas y suaves.
- **Carmín→coral** es el acento único: estado activo, selección, bordes degradados de lo destacado. Se usa poco y con intención. El glow es sutil (≤ 0.09 de alfa en superficies; el fuerte se reserva a puntos y barras activas).
- **Primario blanco**: el botón principal es blanco sobre grafito. Es la firma Orbit y no compite con el acento.
- Verde = OK/ganancia, ámbar = atención/próximamente, rojo = error/pérdida. Siempre reforzados con texto o forma.

## 5. Tipografía que respira
Inter con `tabular-nums`; monoespaciada solo para números vivos (tiempos, deltas, horas, ids). Base 16px, títulos ajustados (-.03/-.045em). **Caja normal** en títulos de panel; mayúsculas con tracking solo en eyebrows de sección y en tarjetas destacadas. Un eyebrow por bloque, no uno por fila.

## 6. Todo cabe: sin scroll de página
Una vista = una pantalla a 1920×1080. Lo que crece se desplaza dentro de su panel. Por debajo de ~940px se compacta el hero; nunca se corta contenido.

## 7. Contexto a la izquierda, trabajo en el centro, detalle a la derecha
Rail (destinos) → columna (contexto de la sección + datos vivos) → workspace → columna derecha opcional (inspector, detalle de serie, pilotos/neumáticos). Las columnas laterales se pliegan; el centro nunca desaparece.

## 8. Directo al grano
Se entra en el estado útil (última estrategia, perfil activo, próximas salidas). No hay portadas ni asistentes de pasos para tareas frecuentes; los pasos solo existen para primeras veces (estado vacío).

## 9. Manipulación directa cuando el dato lo permite
Cambiar el piloto de un stint recalcula todo; arrastrar un neumático lo monta; tocar una curva del mapa mueve el scrubber. Siempre con alternativa por clic y teclado.

## 10. Movimiento que informa
El motion explica cambios (entrada de contenido, recolocación de bloques, pulso al soltar) y nunca decora. 130–350 ms, un easing, cascadas cortas, y respeto de `prefers-reduced-motion`.

## 11. Español primero, i18n listo
Copy en español natural, sentence case, sin anglicismos innecesarios (stint, boxes, delta y overlay se quedan porque son del dominio). Todas las cadenas pasan por i18n (es/en/pt/it ya existen en el frontend).

## Anti-patrones (no hacer)
- Duplicar navegación o estado. · Uppercase con tracking en todo. · Glow carmín en cada superficie. · Portadas/menús previos. · Scroll de página. · Placeholders grises genéricos donde puede haber una miniatura real. · Tooltips nativos en el rail. · Fuentes por CDN. · Confirmaciones nativas del navegador.
