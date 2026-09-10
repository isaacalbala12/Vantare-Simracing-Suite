# ISA-1120 — Direcciones v2 de Eficiencia en el Workshop

Base `origin/vantareapp/isa-1083-functional-standings`. Rama
`vantareapp/isa-1120-efficiency-v2`. Iteración visual sobre el renderer
productivo (`WidgetVisualHost` → `StandingsFunctional`); las pieles viven solo
en el Workshop (`data-study-style` + `overlay-workshop.css`), sin diseños
oficiales, persistencia ni cambios en `tokens.css`.

## Cómo comparar

Servidor dev con `VITE_RUNTIME_MOCK=mock`, abrir:

`/workshop?widget=standings&system=vantare-functional&variant=standings-functional-study&design=standings-functional-compact&session=race&state=ready&surface=obs&background=context`

En el panel «Dirección v2»: **V1** (sin piel), **Torre**, **Podio**, **Foco**.
Cada dirección enlazable con `study=v2-tower|v2-podium|v2-focus`. Los módulos,
sesión, fondo y estado de datos siguen activos para juzgar cada variante.

## Direcciones

### Torre (`v2-tower`, estructura Signature)

Torre de tiempos compacta: filas 30→26 px, cabecera 49→38 px, etiquetas sin
subrayado a 7 px, numeral de posición con peso y tinte de fondo, top 3 con
borde rojo de 2 px en la celda de posición, sin diagonal de cabecera. Más
filas por píxel y lectura de arriba abajo.

### Podio (`v2-podium`, estructura Broadcast)

Jerarquía de carrera: cabecera de banda más marcada, fila de etiquetas más
oscura, top 3 elevados con superficie propia, numeral de posición 14→15 px y
separador reforzado bajo la tercera fila. Cápsulas de vuelta conservadas; la
selección del jugador gana densidad sin marcas rojas junto a pilotos.

### Foco (`v2-focus`, estructura Signature)

Mínimo ornamento: sin diagonal ni separadores verticales, etiquetas atenuadas,
chip de clase al contorno en vez de relleno rojo, marca en gris y sombra más
suave. El único acento rojo es el tick de la fila del jugador.

### Papel (`v2-paper`, estructura Signature)

Giro de atmósfera en CSS: hoja de tiempos impresa en marfil, tinta oscura,
reglas finas y chip de clase rojo conservado.

### Muro (`v2-pitwall`, renderer de estudio)

Monitor de muro tipo control de carrera: chip de posición con el color de
equipo, nombre compacto, diferencia grande y vueltas en cluster. El color de
equipo es de demostración — `teamBrandColor` es un declared gap de la
telemetría V2, así que el estudio asigna una paleta por posición.

### Escalera (`v2-ladder`, renderer de estudio)

Visualización de la diferencia: cada fila dibuja una barra proporcional al
gap con el líder; el pelotón deja de ser una tabla. El líder lleva una marca
roja fija y la fila del jugador dibuja su barra en rojo.

## Decisión (2026-09-11)

Isaac eligió **V1 (Signature/Broadcast vigente) y Foco** como las dos
direcciones a seguir. Torre, Podio, Papel, Muro y Escalera quedan descartadas;
siguen conmutables en el Workshop como referencia, sin más iteración.

## Capturas

`efficiency-v1-signature.png`, `efficiency-v1-broadcast.png`,
`efficiency-v2-tower.png`, `efficiency-v2-podium.png`, `efficiency-v2-focus.png`,
`efficiency-v2-paper.png`, `efficiency-v2-pitwall.png`, `efficiency-v2-ladder.png`
(mismo fixture de estudio: 10 filas, Carrera, fondo Mixto, Recibiendo).

## Checks

- `pnpm --dir frontend typecheck` → PASS
- `pnpm --dir frontend test -- overlay-workshop-query OverlayWorkshopDevRoute` → 19/19 PASS
- `eslint` sobre los archivos tocados → PASS
- `git diff --check` → PASS

## Pendiente

- Traducir Foco a diseño oficial es otra entrega (esta rama no toca el
  catálogo ni `tokens.css`).
- Las pieles conviven con cualquier estructura base vía Estilo; las
  combinaciones no canónicas (p. ej. Foco sobre Broadcast) quedan para juicio,
  no como producto.
