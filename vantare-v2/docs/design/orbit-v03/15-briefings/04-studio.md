# Briefing 04 · Overlays Studio (`?view=studio`)

## Objetivo
Aplicar la disposición Orbit a `hub/overlay-studio` sin tocar su lógica (V3, persistencia, permisos): lista de widgets en la columna contextual, toolbar/stage/statusbar Orbit e inspector por acordeones.

## Estructura
- **Columna contextual**: cabecera "Overlays Studio", eyebrow "Widgets" + contador; búsqueda (28px); lista `ListRow` (grip visible en hover/selección, nombre + "activo · sistema", ojo para ocultar con tachado); pie "Añadir widget". Selección sincronizada con el lienzo.
- **Toolbar** (60px): `Seg` fondo Rejilla/Degradado/Negro · `Seg` Mock/Live (Live deshabilitado si el sim no está conectado, con `title`) · `IconButton` Área segura (`aria-pressed`) · botón Browser View (rótulo oculto ≤ 1500px) · espaciador · plegar inspector · zoom − Ajustar +.
- **Stage**: 16:9 con `container-type: inline-size`, rejilla 1.25/6.25 cqw, etiqueta "1920 × 1080", área segura 4.5 % con rótulo; widgets `.cw` con selección (borde carmín, marco punteado −6px, 8 tiradores 9px, etiqueta "nombre · w × h" encima).
- **Statusbar** (39px): `X · Y`, `Lienzo · 1920×1080`, `n widgets · x seleccionado`.
- **Inspector** (395px, plegable): cabecera (kind "widget", nombre 17px, meta "diseño · w × h", acciones ojo/duplicar/eliminar); `Accordion` **Diseño** (Sistema, Diseño, Aplicar a todos, Guardar como diseño; resumen "Crystal · Crystal Bar"), **Comportamiento** (Frecuencia, Visible en boxes, `Seg` Carrera/Práctica/Clasificación, `Note` LMU; resumen "15 fps · siempre · 2 sesiones"), **Layout** (X/Y/W/H numéricos, bloquear proporción, Frente/Fondo/Centrar/Restablecer; resumen "820, 96 · 280 × 96"). Mapear las secciones reales de `inspector-sections.ts` (Design+Appearance → Diseño; Behavior+Content → Comportamiento; Layout+Actions → Layout) o mantener seis acordeones si producto lo prefiere (anotar decisión).
- **Topbar**: selector de perfil, Guardar (dirty/saved), Abrir/Detener overlay.

## Criterios de aceptación
- [ ] Seleccionar en la columna resalta el widget en el lienzo y viceversa; el inspector actualiza cabecera, campos y resúmenes.
- [ ] Cambiar FPS/pit/sesiones actualiza el resumen del acordeón en vivo; plegar un acordeón mantiene su resumen legible.
- [ ] Ojo en la lista oculta el widget en el lienzo (opacidad .12) y tacha el nombre.
- [ ] Zoom 100/125/150 con scroll del `stage-wrap`; área segura conmutable.
- [ ] `?rightDock=closed` (o preferencia) pliega el inspector y el lienzo ocupa el espacio.
- [ ] Modo estrés (20 widgets, nombres largos): la lista trunca con elipsis y el inspector no rompe.
- [ ] `visual:overlay-studio` actualizado; e2e existentes verdes. Captura ≈ `evidence/studio.png`.

## Referencias
`06 § Overlays Studio`, `04` (Accordion, Seg, ListRow), `13.2`, `14 studio.*`, `frontend/src/hub/overlay-studio/inspector/*`.
