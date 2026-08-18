# 04 · Catálogo de componentes

Para cada componente: anatomía · variantes · estados · medidas y tokens · accesibilidad · dónde se usa. Las clases citadas son las del prototipo; en el porte serán componentes React equivalentes (ver `10`).

## Acciones

### Botón (`.btn`)
- Anatomía: alto 39px, padding 0 16px, radio 12, 13px/750, gap 9px, icono 17px opcional.
- Variantes: **primario** (`#f3eeee` sobre `#1c1719`, 850, sombra primaria; hover `#fff` + `translateY(-1px)`), **ghost** (hairline `.07`, fondo `.025`, tinta `#8e898e`; hover tinta clara + borde carmín `.17` + fondo `.055`), **danger** (texto `--red`, hover fondo `.08`), **sm** (34px, 0 12px, 12px).
- Estados: `[disabled]/[aria-disabled]` opacidad .5; `:active` escala .985; foco `outline 2px --coral offset 2px`.
- Especiales: **btn-run** (`data-s=running`: fondo verde `.08`, borde `.28`, punto verde pulsante); **btn-save** (`data-s=dirty`: punto rojo; `saved`: check verde, deshabilitado).

### Icon button (`.icon-btn`)
28×28 → 39×39 en Orbit (radio 8/10), tinta `#77737a`, hover fondo `.05`; `.on` fondo carmín `.14` + anillo `.22`; `.danger:hover` rojo.

### Quick chip (`.quick-chip`)
36px, radio 12, hairline `.06`, 12px; hover borde carmín `.17`. Bloqueado: tinta `#57545a` + candado.

### Segmentado (`.seg`)
Contenedor padding 4px radio 12 hairline `.06`; botones 29px radio 8, 12px/650; `.on` fondo carmín `.16` + anillo `.22`; deshabilitado opacidad .45. Variante `seg-wide` (botones flex 1). Usos: fondo del lienzo, Mock/Live, vistas de calendario, A/B/Comparar, Pilotos/Neumáticos, salidas A+V/V/A/Off.

### Toggle (`.toggle`)
44×25, radio 999, knob 17px; on: degradado carmín, borde `.4`, glow `.15`, knob blanco `translateX(20px)` con easing spring 220 ms. `aria-pressed`. Deshabilitado opacidad .4.

## Entrada

### Input / Select / Textarea (`.input`, `.control-select`)
Alto 39px, padding 0 13px, radio 12, hairline `.07`, fondo `.028`, 14px, tinta `--ink-2`; hover borde `--line-strong`; select con chevrón SVG a la derecha (padding-right 34px). Textarea min 83px. Numéricos (`.num`) alineados a la derecha en mono.
Campo (`.field`): label 11px/800 tracking .1em uppercase `#7c777d`; `.field-row` para pares etiqueta–control (min 39px, hint 11px debajo).

### Búsqueda de la paleta
Input sin borde 17px dentro de `.palette-search` 75px con icono lupa 20px y `Esc` en kbd.

## Estado y metadatos

### Pill (`.pill`)
30px, padding 0 13px, radio 12, hairline `.06`, 11.5px, punto 8px con estados (`ok` verde con glow, `gold` ámbar, `ring` contorno). `data-s` connected/searching (pulso 1.4s)/disconnected. `pill.update[data-s=ready]` ámbar. `plan-pill` clicable.

### Chip (`.chip`)
26px, padding 0 9px, radio 8, 10px/700 tracking .06em uppercase, fondo `.035`. Variantes de licencia con punto: `bronze` `#d29a6c`, `silver` `#c9c9cf`, `gold` `--ember`. En Estrategia (`.ev-chips`, `.stint-card .setup`) caja normal 11px con icono. `capability` idéntico (etiquetas de funciones).

### State chip (`.state-chip`)
29px pill verde `.08` + punto, 10px/800 uppercase ("Activo", "Al día"); ámbar (`dot gold`) para "Borrador".

### Subtle status (`.subtle-status`)
29px pill hairline, 10px/750 uppercase; `.attn` ámbar, `.ok` verde. Cabeceras de módulo.

### Punto (`.dot`) · Tier dot (`.tier-dot`) · Chip de neumático (`.tyre-chip`)
6–8px; tier 7px con color de licencia; tyre-chip 18px pill 9.5px mono con punto de compuesto (soft/medium/hard).

### Keycap (`kbd`, `.kbd`, `.hk-keys kbd`)
Inline: 27×26, radio 6.5, hairline `.13` con borde inferior `.22`, 12px mono `#918d92`. **Físico** (Atajos): 30×28, radio 7, borde inferior 2.5px, degradado `#26262b→#1a1a1f`, sombra `0 2px 0 rgba(0,0,0,.4)`, 12px/700; vacío: punteado y texto "sin asignar"; conflicto: borde ámbar.

### Stat tile (`.stat`)
Panel translúcido, padding 14/18; `stat-k` 11px/700 uppercase, `stat-v` 22px mono/700 con `small` 12px sans, `stat-s` 11.5px elipsis. `.hot` coral, `.ok` verde. Filas de 4 (`.stat-row`, gap `--space`). En Estrategia versión compacta (19px).

### Nota de fixture (`.fixture-note`, `.note`)
Borde ámbar `.13`, degradado ámbar→carmín muy suave, 12px, `b` `#c8b3a2`. Para honestidad de datos.

## Contenedores

### Panel / Surface (`.panel`, `.surface`)
Hairline `--line`, radio `--radius`, fondo `rgba(16,17,20,.79)` + blur 16, `overflow:hidden`. Cabecera (`.surface-head` / `header`) min 60px, padding 13/20, h3 15px/700 caja normal, meta `mono-value` 12px `#8a858b`, acciones a la derecha (`panel-link` 12px, botones sm, seg).

### Superficie destacada (`.command-surface`, `.focal`)
Borde degradado carmín (border-box) sobre relleno grafito, radio 25, sombra featured; hover `translateY(-1px)` + sombra hover. Solo dos por pantalla como máximo (Inicio: comando + focal).

### Fila de lista (`.ctx-row`, `.race-row`, `.next-row`, `.witem`, `.profile-row`, `.launcher-app`, `.rf`)
Min 46–60px, radio 11–12, hover fondo `.024–.03`; **seleccionada**: degradado carmín de selección + barra 3px `--red` con glow a la izquierda (fuera del padding). Estructura: icono/monograma opcional · copy (b 13–14px/650 + span 11–12px `--ink-3`, elipsis) · valor a la derecha (mono) · acción (▶ 26px, ojo, chip).

### Monograma (`.app-monogram`, `.ctx-ico`, `.lp-ico`, `.ev-mark`)
Losa con degradado por app (`--g1/--g2` del contrato del launcher), inset highlight, 8–12px/800 blanco. Tamaños 26 (sm) · 32 · 39 · 46 · 52 · 60.

### Tarjeta de perfil de lanzamiento (`.launch-profile`)
Panel con acento lateral 3px degradado; icono 46, eyebrow + h4 18px + p; acciones (editar, **▶ Lanzar**); cadena de pasos (`.chain-step` grid 26px + copy, conectados por línea y puntos); políticas como `capability`. `.featured` = borde carmín `.18` y acento con glow. `.add` punteada.

### Menú desplegable (`.menu`)
300px, radio 14, `#1a1a1f`, sombra menú, ítems con título 13px/700 + descripción 11.5px; hover fondo carmín `.12`; cierra con clic fuera; `role=menu`, `aria-expanded` en el disparador.

### Acordeón del inspector (`.ins-sec`)
`<details>` con `summary` (46px, título 13.5px/700, **resumen mono 11.5px a la derecha**, chevrón que rota 180°); cuerpo con gap 14. Abierto: resumen al 55 %.

### Pestañas subrayadas (`.ev-tabs`)
38px, 13.5px/650, activa blanca con subrayado 2px `--red` con glow. Panel entra con `tab-in`.

### Tooltip del rail
Ver `03 · 3.2`.

### Toast (`.toast`)
Región fija abajo-centro; 49px min, radio 14, `#242429`, sombra toast, título 12.5px/750 con punto verde + mensaje 12px `#8e898e`; entra/sale 200 ms; máx 3 visibles; auto-cierra 2.6 s. `role=status aria-live=polite`.

### Paleta de comando (`.palette`)
Backdrop `rgba(3,3,5,.61)` blur 8; caja `min(832px,70vw)`, radio 23, `#18181c`; búsqueda 75px; grupos con rótulo 8px→10.5px; ítems 52px radio 13 con icono 36px carmín `.09`, label 14px, meta 10.5px; seleccionado degradado carmín; pie con ↑↓ ↵. Filtra en vivo y oculta rótulos de grupo vacíos; ítems bloqueados muestran "Requiere <plan>".

## Datos y visualización

### Mini-lienzo (`.mini-stage`)
`aspect-ratio 16/9; container-type: inline-size`, rejilla 6.25cqw, radio 14; hijos `.cw.glass` reales con `pointer-events:none`.

### Dial de cuenta atrás (`.dial`)
SVG 320 viewBox → 236px (200 compacto), rotado -90°; track `.07` 2px, ticks `rgba(240,71,85,.22)` 6px dasharray `1 21.4`, arco `url(#dialGrad)` 3px round con `pathLength=100` (dashoffset = 100 − fracción·100), punto coral 5px con glow que rota. Tarjeta `.next-race` 196px dentro (fondo vino): antetítulo con punto, nombre · circuito, reloj mono 20px con prefijo («en 06:36»), línea `Cada N min · Tier` y botón circular › que abre la serie en Carreras.

### Timeline horizontal (Carreras `.tl-*`, Estrategia `.race-tl`)
Rejilla `210px|1fr` (Carreras) o `150px|1fr` (Estrategia); eje con ticks mono 11px; filas 48/34px con líneas verticales por hora; bloques `position:absolute` (radio 6–7, color por tier/piloto, inset highlight, hover eleva) y línea "ahora"/marcas PIT. Scroll horizontal interno en Carreras (`min-width 1400px`).

### Donut (`.donut`)
SVG 200, `r=80`, stroke 26, un `circle` por serie con `stroke-dasharray` (len−3, resto) y `dashoffset` acumulado, rotado -90°; centro con etiqueta/valor; leyenda debajo. Transición 450 ms.

### Trazas (`.trace-svg`)
`viewBox 1000×h`, `preserveAspectRatio: none`, alturas 150/100/80/110; bandas de curva `.035`, rejilla `.05`, líneas `vector-effect: non-scaling-stroke` (mía coral 2px, referencia cian 1.5px, throttle verde, freno rojo, delta blanco con áreas rojo/verde `.25`); cursor vertical blanco `.55`.

### Mapa de circuito (`.tel-map`)
Polígono base `.08` 15px round; tramos por curva `polyline` 9px (hover/on 13px) coloreados por delta; etiquetas T1…; línea de meta; punto de coche coral con glow.

### Editor de stint (`.stint-edit`) y esquinas (`.corner-slot`)
Editor bajo la tarjeta, sangrado 80px, borde carmín `.2` sin borde superior, degradado suave, entra con `se-in`. Campos Vueltas/Combustible/Ritmo + "Volver a automático". Esquema del coche: rejilla `56px|1fr|1fr` (delante/detrás), slots 64px punteados; `.filled` sólido con chip de compuesto + id mono + condición verde + ×; `.over`/`:focus-visible` borde coral + halo; `.pulse` al soltar (halo verde 500 ms).

### Inventario de neumáticos (`.tyre-item`)
Fila arrastrable (`draggable`), grid chip|copy|condición; `.used` acento carmín izquierdo; `.picked` borde coral + halo; `.dragging` .5; condición ámbar si > 2 usos.

### Barras de disponibilidad (`.avail-*`)
Carriles 22px radio 6 con segmentos `ok/maybe/no`; eje 13:00→18:30; formulario en rejilla `1.4fr 1fr 1fr 1fr auto`.

### Feed de radio (`.rf`)
Grid `66px 30px 1fr auto`: hora mono, icono S/I (coral/cian; ámbar aviso), título + detalle, salida `A·V`.

### Fader (`.fader`)
150×6 pista `.08` con relleno degradado carmín→coral y knob 16px blanco con halo — decorativo en el prototipo.
