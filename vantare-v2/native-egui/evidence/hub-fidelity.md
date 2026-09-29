# Fidelidad de Inicio / Orbit · primera comparación

Referencia productiva congelada: [`hub-reference/inicio-1920x1080.png`](hub-reference/inicio-1920x1080.png), `origin/nightly@c4c7a5ceb60995db191078aca03085a1e56a063e`, harness controlado. Candidato Rust: [`hub-native-client.png`](hub-native-client.png), cliente de 1920 × 1080 capturado físicamente mediante `PrintWindow`. Ambos muestran el estado de prueba «test»; no se compara una sesión real de usuario. La referencia adicional de 1920 × 900 permite probar después el ajuste vertical.

## Resultado de esta pasada

**No alcanza la paridad visual.** La geometría general ya contiene rail, columna contextual, cabecera, búsqueda, próxima serie, perfil activo y tarjetas inferiores, pero hay diferencias visibles que impiden aceptarla:

- Faltan los iconos reales del rail, de acciones y de Launcher; varios símbolos provisionales aparecen como cuadrados.
- La tarjeta del perfil muestra un mini-lienzo casi vacío, mientras la referencia incluye tres widgets con sus posiciones y la rejilla.
- Faltan los dos botones dentro de la tarjeta del perfil, etiquetas y detalles de las listas, marcadores de estado, atajos de teclado, badges de categoría y botones laterales.
- El texto tiene peso y jerarquía distintos. La fuente es Inter, pero la representación de títulos, labels, cifras y monoespaciado aún no coincide.
- La tarjeta de próxima serie y la búsqueda carecen del gradiente, brillo, sombras y pequeñas decoraciones que se ven en la referencia.
- El Hub nativo usa datos de prueba y una paleta de comandos mínima; no tiene todavía navegación, estados ni integración de producto equivalentes.

Antes de aceptar Inicio se deben cerrar estas diferencias contra las capturas a 1920 × 1080 y 1920 × 900, comprobar los estados interactivos y volver a tomar una referencia física de Wails si el producto actual ha cambiado. No se infiere equivalencia a partir de que la estructura general se parezca.
