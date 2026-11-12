# Dibujos de Studio Foco

Las 19 ilustraciones y las 15 piezas de elección proceden de la maqueta A
elegida por Isaac el 12-11-2026 (`studio-rediseno/ilustraciones/`, ESPEC-A §4).
Estos SVG son dibujos orientativos, no capturas de los overlays.

Desde `hub-web`, `bun run illustrations` convierte estas fuentes a componentes
en `ui/widgets/illustrations/` y les aplica el formato del proyecto. Solo usa
Python estándar y las herramientas ya instaladas. Los tipos/opciones esperados
se leen del contrato generado; los tamaños se extraen de cada `viewBox`.

La conversión conserva las figuras, sustituye los colores de reserva por sus
tokens registrados y deja la accesibilidad al consumidor. Los componentes son
decorativos por defecto; un dibujo con nombre debe recibir `aria-hidden={false}`,
`role="img"` y una etiqueta traducida. Los tests comparan todas las figuras y
estilos con estas fuentes y comprueban sus hashes.

Los PNG reales siguen teniendo prioridad. Los iconos monocromos `w-*.svg`
permanecen intactos. `car-damage-numbers` conserva su dibujo para layouts antiguos;
su nombre nativo es «Daños detallados» (`native/ui/src/registry.rs`), y no se añade
al catálogo de altas, donde GPUI también lo excluye.
