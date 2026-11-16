# Delta — Vantare en Rune (#2375)

Porte del pintor Vantare de `native/ui/src/delta/` sobre la proyección común
`domain::delta`. Esta parte cubre geometría, tipografía y estados; los avisos y
el movimiento van en el PR 2.

## Qué pinta

- **Píldora** (`pill`, 150 × 36): «DELTA» y el número en una sola fila, como
  GPUI, con panel ajustado al texto (o sin panel en modo transparente).
- **Barra** (380) y **ampliado** (768): panel Vantare, aviso de boxes/FCY,
  cabecera con marca y selector de referencia (ampliado) o referencia mono
  (barra), número grande con predicha y vuelta, barra con degradado, extremos
  redondeados, marca central, escalas −X/+X y sectores con su barra y valores.
- **Transparente**: sin panel, textos con sombra y carril de la barra con borde.
- **Estados**: espera, sin referencia, espectador, vuelta invalidada (tachado),
  pausa (boxes, vuelta de salida, FCY) y sin datos.

La escena es pura (`scene.rs`) y el controlador repinta comparando la escena
visible; `sequence` no participa. Sin reloj ni animación en esta parte.

## Pendiente (PR 2)

Flash de récord personal, pulso de la barra y transición suavizada con
`crate::motion::Tween`, caducidad de avisos y paridad con `delta/motion.rs`.
Movimiento reducido seguirá sin reloj.

VANTA-144 / #2333. Rama `vantareapp/isa-2333-delta-rune`.
