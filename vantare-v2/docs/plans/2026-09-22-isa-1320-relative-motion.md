# ISA-1320 · Relative Eficiencia: movimiento discreto

Isaac eligió «movimiento suave y una señal de color muy tenue». Esta entrega se limita al renderer productivo Relative Eficiencia; no cambia telemetría, selección de filas ni Standings. Las escenas Workshop y el roadmap se integran en el mismo PR desde los trabajos paralelos del orquestador.

## Contrato de presentación

- El jugador permanece en un índice visual fijo cuando está visible: se reservan huecos vacíos delante hasta `rangeAhead`, limitados por las filas que caben en la geometría. Si se oculta al jugador, no hay ancla ni huecos. No se altera el conjunto de filas de datos.
- Solo cambia la posición visual de rivales cuyo ID sigue visible. El deslizamiento dura 220–300 ms, curva monótona sin rebote. Cifras y etiquetas actualizadas no reinician la animación.
- Una incorporación se funde en 120 ms. Una baja puede mostrar un único fantasma inerte y acotado durante 120 ms; no modifica el alto de la tabla. Los cruces reales delante↔detrás muestran una sola señal verde/roja de hasta 4 % de opacidad y luego desaparecen. Una alta, baja o cambio de orden en el mismo lado no emite color.
- `minimal`, cambio de fuente/sesión (`presentationKey`), cambio de geometría y desmontaje cancelan animaciones/fantasmas y reinician la base de medición. `reduced` conserva solo el deslizamiento.

## Mecanismo y prueba

El hook de motion recibe una inicialización de baseline del primer frame. Relative compara una firma de IDs/lados visibles, ancla, geometría y `presentationKey` antes de cualquier medición, timer o animación. En un cambio estructural mide una vez por ID y reorienta desde el desplazamiento visual vigente; al cambiar continuidad o geometría cancela y vuelve a medir sin animar. El núcleo común solo suma extensiones optativas compatibles con Standings (`initialize`, `onAnimation`, `preserveAnimation`).

Las pruebas cubren ancla con diferentes ventanas/recortes, inversión y reentrada, cruces frente a cambios de membresía, limpieza en `minimal`/unmount/continuidad/geometría, y 100 frames de solo cifras sin nuevas mediciones, timers ni animaciones. Se ejecutan pruebas frontend, typecheck/build, lint y ratchet sin alterar reglas.
