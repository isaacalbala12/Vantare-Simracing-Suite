# 07 · Motion

Principio: el movimiento **explica** (aparece, se recoloca, confirma) y nunca decora. Un easing, pocas duraciones, cascadas cortas.

## Tokens
| Nombre | Valor | Uso |
|---|---|---|
| `--ease` | `cubic-bezier(.2,.8,.2,1)` | Todo salvo el knob del toggle |
| spring | `cubic-bezier(.34,1.4,.64,1)` | Knob del toggle (220 ms) |
| `--fast` | 130 ms | hover/color/fondo/borde, icon-btn, filas |
| `--med` | 200 ms | toggle, chevrón de acordeón, plegado de docks (grid-template-columns 200–220 ms) |
| enter | 260–340 ms | entrada de vistas, pestañas, tarjetas |
| move | 350 ms | recolocación de bloques del timeline (`left`/`width`), donut 450 ms |
| tick | 1 s lineal | dial y cuenta atrás |

## Catálogo de animaciones
| Keyframe | Qué hace | Dónde |
|---|---|---|
| `rise` | opacidad 0→1, `translateY(8px)`→0, 340 ms | bloques de vista al cambiar de sección (`.inicio-wrap > *`, `.module-wrap > *`, `.inicio-grid > *`) con delays 40/80/120 ms |
| `tab-in` | 0→1, `translateY(6px)`→0, 260–300 ms | paneles de pestañas (Estrategia, Ajustes, Carreras), tarjetas en cascada (stints 30 ms, pilotos/neumáticos/estrategias/módulos/canales/radio 40 ms) |
| `se-in` | 0→1, `translateY(-6px)`→0, 280 ms | editor de stint al desplegarse |
| `slot-pulse` | halo verde 0→12px que se desvanece, 500 ms | esquina al recibir un neumático |
| `pill-pulse` | opacidad 1→.35→1, 1.4 s (2.2 s en botón overlay activo) | pill "buscando"/"descargando", punto verde de overlay en directo |
| `fade` | opacidad 0→1, 140 ms | backdrop de la paleta |
| `toast-in/out` | 200 ms con `translateY(10px)` | toasts |
| dial | `stroke-dashoffset` y `rotate` con transición 1 s lineal | cuenta atrás del hero |

## Micro-interacciones
- Hover en superficies destacadas y tarjetas de perfil/estrategia: `translateY(-1px)` + sombra hover.
- `:active` en primario, quick chips y filas: `scale(.985)`.
- Tooltip del rail: opacidad + `translateX(-6px→0)` 130 ms.
- Chevrón de acordeón rota 180° en 200 ms.
- Bloques del timeline y arcos del donut se recolocan animados cuando cambia el plan (no saltan).
- Barra activa del rail/nav aparece sin animación (instantánea): la navegación debe sentirse inmediata.

## Reglas
1. Nada dura más de 450 ms salvo pulsos de estado (1.4–2.2 s) y el dial.
2. Cascadas máximas de 4 pasos (≤ 120 ms de retraso acumulado).
3. No animar `height/width` de layout salvo el plegado de columnas (grid) y el knob; usar opacidad+transform.
4. `@media (prefers-reduced-motion: reduce)` → todas las duraciones a 0 s (transiciones y animaciones), manteniendo estados finales visibles.
5. Las animaciones de entrada se disparan al montar (display none→block); en React usar montado condicional o `key` para reiniciarlas.
