# Encargo para portar un widget a Rune

VANTA-144, #2333, ADR 0110. Un widget por PR, desde nightly actualizado y después
de integrar y validar Relative Vantare y Eficiencia. El orquestador asigna widget,
Look, rama y alcance. Este documento no lanza ni asigna workers.

Conservar la proyección existente de domain, ajustes, demanda y bytes guardados.
Separar datos y movimiento de la pintura: una escena concreta del widget, con
funciones puras, sin colores ni valores Live. Ambos Looks consumen esa escena.
Para Relative, reutilizar `relative::scene` sin modificarla para cada Look.
`VisualRow.slot` es una coordenada interpolada del layout canónico, no un índice;
el layout entrega los objetivos a Motion::update. Pulso (`traffic_opacity`) y
destello (`alert`) mantienen intensidades separadas y se pintan superpuestos.
Implementar el contrato existente `crate::widget::Widget` dentro de la carpeta
del widget; no crear otro trait ni un framework. Añadir una sola entrada al
match `renderer::constructor` con `<MiWidget as Widget>::new` y la guarda de Look
que corresponda. Soporte y creación usan ese mismo registro; `new` solo se llama
al necesitar una instancia, no al consultar soporte. `Update` distingue
reconstrucción (`build`) de cambio de píxeles (`pixels`).

Implementar `attach_assets` solo si el widget pinta imágenes o SVG: guardar el
`Arc<ImageCache>` recibido del host. No crear una caché propia ni un OnceLock global.

Copiar: `Painters`, `Meter`, test `rendered_frame`, primitivas `vantare::paint`,
`Tween` finito y política de movimiento reducido.

Todo texto Display suma `display_baseline`; el helper `label()` no lo hace solo.
Conservar la cara que usa GPUI: Body y Mono no reciben ese desplazamiento.

No copiar: struct monolítico, `build` calculado a mano ni reloj permanente.
Comparar la estructura anterior y la nueva en un único sitio; mantener los
valores de tamaño fijo en Live. Un pulso de tráfico es una animación explícita,
con reloj a la cadencia del widget y apagado con movimiento reducido.

Verificar sin ventana: escena, fin de transiciones, reposo sin reloj, pulso
con reloj y sin él al desaparecer el tráfico o reducir movimiento, revocación,
cadencia y contadores por causa. Contar cambios reales del flujo CPU como hace
`rendered_frame`; `Runtime::frame` devuelve animación, no presentación.
Formato, Clippy, tests y enlace por la cola; ninguna ejecución gráfica en el
servidor. Paridad visual y consumo solo en la tanda del PC de juego acordada por
el orquestador. Sin dependencias nuevas ni cambios de Hub, Admin o releases.

Toda capa superpuesta (canvas, punto, insignia, barra) lleva `.pin(...)` explícito: sin pin entra en el flujo en fila y solo se ve la primera.
