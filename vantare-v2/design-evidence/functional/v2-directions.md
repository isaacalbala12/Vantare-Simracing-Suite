# ISA-1120 — Direcciones v2 de Eficiencia en el Workshop

Base `origin/vantareapp/isa-1083-functional-standings`. Rama
`vantareapp/isa-1120-efficiency-v2`. Iteración visual sobre el renderer
productivo (`WidgetVisualHost` → `StandingsFunctional`); las pieles viven solo
en el Workshop (`data-study-style` + `overlay-workshop.css`), sin diseños
oficiales, persistencia ni cambios en `tokens.css`.

## Cómo comparar

Servidor dev con `VITE_RUNTIME_MOCK=mock`, abrir:

`/workshop?widget=standings&system=vantare-functional&variant=standings-functional-study&design=standings-functional-compact&session=race&state=ready&surface=obs&background=context`

En el panel «Dirección v2»: **V1** (sin piel) y **Foco** (`study=v2-focus`),
las dos direcciones vigentes. Los módulos, sesión, fondo y estado de datos
siguen activos para juzgar la variante.

## Direcciones

### Torre (`v2-tower`, estructura Signature) — descartada, retirada del harness

Torre de tiempos compacta: filas 30→26 px, cabecera 49→38 px, etiquetas sin
subrayado a 7 px, numeral de posición con peso y tinte de fondo, top 3 con
borde rojo de 2 px en la celda de posición, sin diagonal de cabecera. Más
filas por píxel y lectura de arriba abajo.

### Podio (`v2-podium`, estructura Broadcast) — descartada, retirada del harness

Jerarquía de carrera: cabecera de banda más marcada, fila de etiquetas más
oscura, top 3 elevados con superficie propia, numeral de posición 14→15 px y
separador reforzado bajo la tercera fila. Cápsulas de vuelta conservadas; la
selección del jugador gana densidad sin marcas rojas junto a pilotos.

### Foco (`v2-focus`, estructura Signature) — dirección elegida

Mínimo ornamento: sin diagonal ni separadores verticales, etiquetas atenuadas,
chip de clase al contorno en vez de relleno rojo, marca en gris y sombra más
suave. El único acento rojo es el tick de la fila del jugador.

### Papel (`v2-paper`, estructura Signature) — descartada, retirada del harness

Giro de atmósfera en CSS: hoja de tiempos impresa en marfil, tinta oscura,
reglas finas y chip de clase rojo conservado.

### Muro (`v2-pitwall`, renderer de estudio) — descartada, retirada del harness

Monitor de muro tipo control de carrera: chip de posición con el color de
equipo, nombre compacto, diferencia grande y vueltas en cluster. El color de
equipo es de demostración — `teamBrandColor` es un declared gap de la
telemetría V2, así que el estudio asigna una paleta por posición.

### Escalera (`v2-ladder`, renderer de estudio) — descartada, retirada del harness

Visualización de la diferencia: cada fila dibuja una barra proporcional al
gap con el líder; el pelotón deja de ser una tabla. El líder lleva una marca
roja fija y la fila del jugador dibuja su barra en rojo.

## Decisión (2026-09-11)

Isaac eligió **V1 (Signature/Broadcast vigente) y Foco** como las dos
direcciones a seguir. Torre, Podio, Papel, Muro y Escalera quedaron
descartadas y se retiraron del harness; las capturas quedan como evidencia
histórica de la exploración.

Ajustes aplicados tras la elección:

- **V1 (productivo)**: el jugador ya no lleva el tick rojo izquierdo ni el
  texto «TÚ» — se recalca solo con la banda neutra, algo más marcada
  (`--vf-player` 17 % → 23 %). Aplica a Signature y Broadcast.
- **Foco**: hereda el nuevo marcador de jugador y agranda las etiquetas de
  columna («AL LÍDER», «MEJOR V.») de 7 px a 10 px.

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
