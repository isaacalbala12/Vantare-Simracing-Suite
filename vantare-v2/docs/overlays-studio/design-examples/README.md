# Casos de diseño — aprobados y rechazados

Biblioteca de decisiones visuales de Isaac para los overlays de Vantare.
Antes de proponer o implementar un recurso visual, comprobar aquí. Cada caso
nuevo (aprobado o rechazado) se añade con su porqué. Autoridad complementaria:
`docs/overlays-studio/vantare-flagship-direction.md` (espec Redline).

## Rechazados

### R1 — Barras/líneas de acento en el borde izquierdo de una fila

**Qué es:** una línea vertical (2-4px, `border-left` o `box-shadow: inset Npx 0 0`)
pegada al canto izquierdo de una fila para señalar estado (jugador, evento,
clase). Detectado en los flashes de adelantamiento del motor Redline
(2026-08-06) y en varios prototipos anteriores.

**Por qué se rechaza:** es el recurso más manido del diseño generado con
IA ("Fable-ism") y delata falta de intención. Isaac lo vetó explícitamente:
"es una cosa muy típica de diseños con Fable y evitable".

**Qué usar en su lugar:** el núcleo de luz central (A2/G6). Ojo: el radial
anclado al borde (`at 0% 50%`) también queda rechazado — deja el canto
encendido y vuelve a leerse como línea.

### R2 — Gamificación literal (badges "OVERTAKE!", medallas, speed-lines)

Rechazada en los prototipos A/B de la dirección insignia (2026-08-06):
"te has tomado la gamificación de forma muy literal". El tono es F1 25 / GT7,
no juego móvil. Gamificar = tipografía, línea fina y color semántico.

### R3 — Marca "VANTARE" como cabecera del widget

El widget no lleva marca. La zona superior es información (slots).
Rechazado al cerrar la espec Redline.

### R4 — Fondos cápsula alrededor de los slots de información

Los slots son texto puro (etiqueta microcaps + dato tabular) sobre el panel,
sin píldoras ni contornos. Rechazado 2026-08-06.

### R5 — Barra de progreso bajo la fila (presión)

"La barra bajo la fila no me gusta." La presión vive en la celda del gap
(se llena de carmín). Rechazado 2026-08-06.

### R6 — Hilo/línea conectando dos filas (batalla)

"El hilo es una buena idea mal ejecutada... no me gusta que sea un hilo."
La batalla se expresa con la caja que captura a ambos + costura de luz con la
pastilla del intervalo (B1+B2). Rechazado 2026-08-06.

## Aprobados

### A1 — Fila invertida para el líder de clase

Fondo `#E8E8E8`, texto oscuro, posición carmín. Contraste por inversión,
no por ornamento. (Origen: referencia iRacing/GTP de Isaac.)

### A2 — Núcleo de luz central para la fila del jugador y los eventos (G6)

`radial-gradient(70% 300% at 50% 50%, rgba(193,18,31,.4) 0%, rgba(193,18,31,.12) 60%, transparent 90%)`.
El halo emana del centro de la fila y respira hacia los bordes — ningún canto
queda encendido (los radiales anclados a un borde también leen como línea y
quedan rechazados junto a R1). Mismo tratamiento en verde/rojo para los
flashes de adelantamiento. Elegido entre 6 variantes (G6), 2026-08-06.

### A3 — Chips de delta contorneados (+2 / -1)

Borde fino del color semántico, sin relleno. Gamificación adulta
(inspiración: chips de iRating de la referencia iRacing).

### A4 — Slots de información como texto puro en la zona superior

Etiqueta microcaps (primaria carmín `#E63946`, resto gris `#7A7A7A`) + dato
blanco tabular. Dentro del bloque, en su zona superior.

### A5 — Caja de batalla con costura de luz (B1+B2)

La caja captura a los dos coches (fondo `#221114→#170c0e`, borde carmín,
halo) y la frontera lleva la costura con la pastilla del intervalo centrada.
Ciclo: costura → cristaliza → late → se disuelve.

### A6 — Celda de gap cargada como indicador de presión

El relleno carmín crece dentro de la propia celda conforme el gap baja.
Cero geometría añadida.

### A7 — Morado `#b18cff` reservado al fastest lap, con glifo de cronómetro

Único uso del morado en el sistema. El glifo es SVG inline autocontenido.

### A8 — Movimiento semántico con presupuesto

FLIP para adelantamientos, flashes con stagger de 40ms y tope de 4
simultáneos; un protagonista a la vez; todo `transform`/`opacity`.

## Proceso

- Réplicas de referencias: muestreo de píxeles del archivo (nunca a ojo) +
  diff numérico por zonas. Referencias en
  `C:\Users\isaac\Desktop\Vantare Graphics\Overlays\Referencias`.
- Diseño propio: prototipos HTML de referencia + capturas en **estado final**
  de la animación (nunca frames intermedios) + iteración con Isaac.
