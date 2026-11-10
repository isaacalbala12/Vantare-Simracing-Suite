# Paridad de fuentes e iconos (00 §0)

El Hub carga las mismas siete caras Inter estáticas que registra `native/ui/src/efficiency/text.rs`, con reglas CSS por peso 400/500/600/650/700/750/800. Sus tablas internas dicen peso 400 porque GPUI usa familias independientes Inter Wxxx; los contornos ya contienen cada peso y no se regeneran. Se copian los bytes nativos y se conserva OFL-Inter.txt.

Rajdhani.ttf declara OS/2 usWeightClass=600: se asigna ese peso real en @font-face y títulos. SpaceMono.ttf declara peso 400. La preferencia histórica Cascadia usa Space Mono en el Hub GPUI (`orbit.rs:528-541`): se conserva el rótulo y se corrige la familia efectiva. Consolas y Courier mantienen su selección. El marco activa cifras tabulares y kerning.

Los SVG v-* de pit ya estaban generados desde los activos nativos; se seleccionan ahora los mismos para Inicio, Launcher, Studio, Roadmap, Testing, Calendario, Strategy, Engineer y Ajustes. Tamaños, estados y colocación van en los PR siguientes de marco.

Comprobación del tema claro: `Skin::map` transforma los colores y `light` conserva explícitamente negro y blanco (`skin.rs:504-507`). Por eso los bordes blancos translúcidos de Vantare claro coinciden con el GPUI; no se oscurecen manualmente. Solo se cambia en tokens.json la fuente mono; se regenera el CSS desde su JSON.

Los tests comparan los bytes de las nueve fuentes con los activos nativos y el generador conserva esas copias. La herramienta visual adjunta font-sources.json y fonts.json para revisar también la carga efectiva, sin considerar una familia CSS como prueba suficiente. El rasterizado en gris de GPUI frente a ClearType puede dejar diferencias residuales de antialias, aceptadas por 00 §0.1. No se declara aquí terminada la paridad global del marco ni de Ajustes.
