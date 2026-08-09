# Dirección visual insignia de Vantare — borrador de manifiesto

- Estado: borrador Fase 0, pendiente de elección de identidad (prototipos A/B)
- Decisiones ya tomadas por Isaac (2026-08-06): sistema de diseño **nuevo** (4º,
  Receta 4), separado de `vantare-endurance`; identidad a elegir entre dos
  prototipos; ejecución empezando por manifiesto + prototipo estático.

## Tesis

Los overlays del mercado (DOX, Racelabs, WEC broadcast, LMU) son tablas
estáticas con buen gusto variable. Ninguno usa el **movimiento como
información**. La dirección insignia de Vantare se define por tres principios:

1. **El movimiento es semántico.** Nada se anima por decorar. Cada animación
   comunica un evento de carrera: adelantamiento, batalla, vuelta rápida,
   entrada a boxes. Sobrio en reposo, espectacular en el evento.
2. **Gamificado, no infantil.** Referencia de tono: F1 25 / Gran Turismo 7.
   Medallas, rachas y celebraciones con acabado AAA, nunca ruido de juego móvil.
3. **Presupuesto de movimiento.** Un solo protagonista a la vez. Sin bucles
   infinitos parpadeando. Todo `transform`/`opacity` (compositor, 60 fps en OBS).

## Lenguaje de eventos (motor de movimiento, Fase 1)

Derivados del diff entre el ViewModel anterior y el actual — estado efímero de
presentación dentro del renderer, sin tocar telemetría ni persistencia:

| Evento | Detección | Respuesta visual |
|---|---|---|
| Adelantamiento | cambio de `position` | FLIP: las filas se deslizan intercambiándose; flash direccional (verde gana / rojo pierde); badge "+1" flotante |
| Batalla | gap < ~0.7 s sostenido | par de filas en modo duelo: pulso sincronizado + indicador BATTLE |
| Vuelta rápida | nuevo session/personal best | onda de luz violeta recorriendo la fila |
| Pit | `pitText` aparece/desaparece | la fila se pliega a modo pit y regresa |
| Presión | gap decreciente sostenido | barra de carga estilo DRS en el borde de la fila |

## Prototipos de identidad (A/B)

- **A — Neo-cinético**: la materialidad del Neo (un material, doble sombra,
  pozos inset) como escenario en calma; los eventos irrumpen con color-luz.
- **B — Arcade premium**: HUD de videojuego de lujo; gradientes vivos, chips
  rotundos, medallas y speed-lines; la energía es constante, no solo eventual.

Los prototipos son HTML de referencia (no código productivo). La verdad
ejecutable será el renderer del sistema nuevo una vez elegida la identidad.

## Espec visual cerrada (2026-08-06, aprobada por Isaac)

Iterada en prototipos HTML de referencia (bucle de capturas). Referencia final:
`proto-slots4.png` en el scratchpad de la sesión de autoría.

- **Geometría**: V1 "Soft Card" — bloque radio 12px, filas radio 7px, padding 8px.
- **Luz de carcasa**: L1 "Graphite" — gradiente cenital `#17171a → #0f0f10 → #0d0d0e`,
  canto superior iluminado (`border-top` más claro), sombra exterior suave.
- **Filas**: estilo L2 — posiciones en carmín `#E63946`, nombres `#E8E8E8`,
  alternancia sutil `rgba(232,232,232,.035)`.
- **Sin marca**: no aparece "VANTARE". La zona superior del bloque lleva
  **slots de información** como texto puro: etiqueta microcaps (primaria en
  carmín, resto gris `#7A7A7A`) + dato blanco tabular. Slots configurables
  (RACE·tiempo, LAP, SOF…) — primitiva generalizable a todos los widgets.
- **Chip de clase**: contorneado `1.5px #E63946`, con contador a la derecha.
- **Líder de clase**: fila invertida `#E8E8E8` con texto oscuro, posición carmín.
- **Jugador**: ambient — núcleo de luz carmín que respira desde el centro de
  la fila (`radial-gradient(70% 300% at 50% 50%, rgba(193,18,31,.4) →
  transparent 90%)`), sin barras ni bordes encendidos. Mismo tratamiento (en
  verde/rojo) para los flashes de adelantamiento. Decisión G6, 2026-08-06.
- **Presión (P1)**: la celda del gap se llena de carmín (`#C1121F → #ff4d5c`)
  conforme el gap baja; a 0.0s llena y con halo.
- **Batalla (B1+B2)**: caja que captura a los dos coches (fondo `#221114→#170c0e`,
  borde `rgba(230,57,70,.5)`, halo) con **costura de luz** en la frontera y
  pastilla del intervalo centrada sobre ella. Ciclo: costura sola → cristaliza
  la caja → late el intervalo → se disuelve (y encadena FLIP si hay adelantamiento).
- **Gamificación adulta**: chips de delta contorneados (`+31` verde / `-1` rojo),
  sin medallas ni ornamentos.
- **Semántica de color**: carmín = jugador/eventos/primario; verde/rojo = ganancia/
  pérdida; morado `#b18cff` = fastest lap; blanco invertido = líder. Nada más.

Paleta base del repo: `--v-red-500 #C1121F`, acento `#E63946`, negros neutros
`#0f0f10/#141415/#161617`, texto `#E8E8E8`, gris `#7A7A7A`.

## Decisión de encaje (2026-08-06)

Esta dirección ES el overlay de `vantare-endurance`: la familia de templates
`redline` pasa a ser la titular y por defecto del sistema. Los templates
anteriores (tower, strip, f1, wec, lmu, racelabs, apex, neo) fueron pruebas de
exploración y se purgarán en un commit de limpieza cuando redline cubra los
4 widgets y con aprobación explícita de Isaac.

## Backlog de animaciones aprobado (2026-08-06)

Aprobadas por Isaac (todas derivables del diff de ViewModels):
1. Vuelta rápida: glifo SVG morado a la derecha de la fila, pop al arrebatarla,
   onda violeta al cambiar de dueño.
2. Cambio de neumático: disco girando junto al dorsal al salir de pit con la
   letra del compuesto (S rojo / M amarillo / H blanco); se pliega a discreto.
3. Traspaso de corona: la inversión blanca del líder se desliza de la fila
   vieja a la nueva (favorita de Isaac).
4. Chip de delta vivo: cuenta +1 → +2 con tick por posición. ⚠ Cuidado con
   ráfagas: agrupar por lote, escalonado ~40ms, tope de animaciones simultáneas
   (el resto entra sin animar).
5. Entrada de coche nuevo (relative): la fila se despliega desde altura 0.
6. Últimos minutos: el slot de sesión pasa a carmín y respira con <5 min.
7. Foto-finish: barrido de bandera sobre el líder de cada clase al acabar.

Más: adelantamiento FLIP + flash direccional; batalla costura→caja; presión
gap cargada; PIT dorado; retirada = desaturar y plegar.

## Sistema de slots — encaje arquitectónico (aprobado)

- Datos: solo campos del ViewModel. Extensiones aditivas al tipo funcional
  (patrón classScope). Catálogo v1 real: sesión+tiempo (ya existe), vuelta X/Y
  (campo aditivo lapText), nº coches de clase, temperaturas (exponer del snapshot).
  SoF no disponible en telemetría actual.
- Configuración: lista de slots en settings visuales, validada con lista blanca
  + fallback observable (patrón templateId); toggles en el inspector.
- Componente: `VenSlots` compartido dentro de la carpeta del sistema; el host
  no se entera. Primitiva generalizable a todos los widgets del sistema.

## Fases siguientes

1. Elección A/B → cerrar manifiesto (nombre del sistema incluido).
2. Motor de movimiento en standings (FLIP + eventos + variant `replay`
   determinista para previsualizar animaciones en el Workshop).
3. Gamificación (rachas, medallas, presión).
4. Extensión a relative, delta y pedals + validación de rendimiento en OBS.

Nombres candidatos para el sistema: `vantare-pulse`, `vantare-ignition`,
`vantare-prime`.
